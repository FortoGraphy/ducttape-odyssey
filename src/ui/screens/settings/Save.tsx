// Settings group "save": export (clipboard code / shared .txt), import (pasted text or a file) with
// validation and an explicit confirmation, the weekly backup reminder and the guarded hard reset.
// An import is parsed and resumed completely before the running game is touched.
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

import { content } from "@/content";
import { resumeGame, type GameState } from "@/engine";
import { deserialize, exportCode, importCode, serialize, type SaveError } from "@/engine/core";
import { useT } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { readText, writeShareFile, writeText } from "@/platform/storage";
import { act, getGame, replaceGame, resetGame, saveNow, useGame } from "@/store/game";
import { useSettings } from "@/store/settings";
import { fmt, fmtTime } from "@/ui/format";
import { Col, Dialog, Key, KeyRow, Row, Rule, toast, Toggle, Txt } from "@/ui/kit";

import { CodeBox, Field, HoldKey, KeyValue, SettingRow } from "./parts";

const MAX_IMPORT_CHARS = 6_000_000;
const SAFETY_FILE = "save.before-import.json";

interface Summary {
  played: string;
  depth: string;
  credits: string;
  warps: string;
  who: string;
  chapter: string;
}

function summarize(s: GameState): Summary {
  return {
    played: fmtTime(s.played),
    depth: `${s.nav.depth} (max ${s.nav.maxDepth})`,
    credits: fmt(s.credits),
    warps: String(s.prestige.warps),
    who: `${s.player.name} · ${s.player.ship}`,
    chapter: String(s.story.chapter),
  };
}

function clock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function lastSavedMs(): number {
  try {
    const raw = readText("save.json");
    if (!raw) return 0;
    const r = deserialize(raw);
    return r.ok ? r.state.wall : 0;
  } catch {
    return 0;
  }
}

function SummaryTable({ s, prefix }: { s: Summary; prefix: string }) {
  const t = useT("settings");
  return (
    <Col gap={2}>
      <KeyValue label={t("save.sumWho")} value={s.who} testID={`${prefix}-who`} />
      <KeyValue label={t("save.sumPlayed")} value={s.played} testID={`${prefix}-played`} />
      <KeyValue label={t("save.sumDepth")} value={s.depth} testID={`${prefix}-depth`} />
      <KeyValue label={t("save.sumCredits")} value={s.credits} testID={`${prefix}-credits`} />
      <KeyValue label={t("save.sumWarps")} value={s.warps} testID={`${prefix}-warps`} />
      <KeyValue label={t("save.sumChapter")} value={s.chapter} testID={`${prefix}-chapter`} />
    </Col>
  );
}

export function SaveGroup() {
  const t = useT("settings");
  const backupReminder = useSettings((s) => s.backupReminder);
  const lastExport = useGame((g) => g.state.backup.lastExport);
  const [savedAt, setSavedAt] = useState(lastSavedMs);
  const [exported, setExported] = useState<{ code: string; how: "clipboard" | "file" | "shown" } | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<SaveError | "read" | "resume" | null>(null);
  const [pending, setPending] = useState<{ state: GameState; summary: Summary } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetWord, setResetWord] = useState("");

  useEffect(() => {
    const id = setInterval(() => setSavedAt(lastSavedMs()), 10_000);
    return () => clearInterval(id);
  }, []);

  const makeCode = useCallback((): string => {
    const g = getGame();
    g.state.backup.lastExport = Date.now();
    return exportCode(g.state);
  }, []);

  const onCopy = useCallback(async () => {
    try {
      const code = act(() => makeCode());
      let copied = false;
      try {
        copied = await Clipboard.setStringAsync(code);
      } catch (e) {
        console.warn("clipboard", e);
      }
      setExported({ code, how: copied ? "clipboard" : "shown" });
      haptic("success");
      toast(copied ? t("save.copied") : t("save.copyFailed"), copied ? "good" : "warn");
    } catch (e) {
      console.warn("export", e);
      sfx("deny");
      toast(t("save.exportFailed"), "bad");
    }
  }, [makeCode, t]);

  const onShare = useCallback(async () => {
    try {
      const code = act(() => makeCode());
      const d = new Date();
      const name = `duct-tape-odyssey-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.txt`;
      const uri = writeShareFile(name, code);
      if (!uri || !(await Sharing.isAvailableAsync())) {
        setExported({ code, how: "shown" });
        toast(t("save.shareUnavailable"), "warn");
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: "text/plain", UTI: "public.plain-text", dialogTitle: t("save.shareTitle") });
      setExported({ code, how: "file" });
    } catch (e) {
      console.warn("share", e);
      sfx("deny");
      toast(t("save.exportFailed"), "bad");
    }
  }, [makeCode, t]);

  const check = useCallback((raw: string) => {
    setPending(null);
    if (raw.length > MAX_IMPORT_CHARS) {
      setError("size");
      sfx("deny");
      return;
    }
    const r = importCode(raw, content, Date.now());
    if (!r.ok) {
      setError(r.error);
      sfx("deny");
      haptic("error");
      return;
    }
    setError(null);
    setPending({ state: r.state, summary: summarize(r.state) });
  }, []);

  const onPaste = useCallback(async () => {
    try {
      const clip = await Clipboard.getStringAsync();
      if (clip) {
        setText(clip);
        check(clip);
      } else {
        setError("empty");
      }
    } catch (e) {
      console.warn("paste", e);
      setError("read");
    }
  }, [check]);

  const onPickFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["text/plain", "public.plain-text", "*/*"], copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets[0]) return;
      const asset = res.assets[0];
      if ((asset.size ?? 0) > MAX_IMPORT_CHARS) {
        setError("size");
        return;
      }
      const raw = Platform.OS === "web" ? await (asset.file ? asset.file.text() : Promise.resolve("")) : new File(asset.uri).textSync();
      setText(raw.length > 400 ? `${raw.slice(0, 400)}…` : raw);
      check(raw);
    } catch (e) {
      console.warn("import file", e);
      setError("read");
      sfx("deny");
    }
  }, [check]);

  const onReplace = useCallback(() => {
    if (!pending) return;
    try {
      // Build the whole game first: if anything throws, the running game was never touched.
      const next = resumeGame(content, pending.state);
      next.state.wall = Date.now();
      try {
        writeText(SAFETY_FILE, serialize(getGame().state));
      } catch (e) {
        console.warn("safety copy", e);
      }
      replaceGame(next);
      setPending(null);
      setText("");
      setExported(null);
      setSavedAt(lastSavedMs());
      haptic("success");
      toast(t("save.imported"), "good");
    } catch (e) {
      console.warn("import resume", e);
      setPending(null);
      setError("resume");
      sfx("deny");
    }
  }, [pending, t]);

  const word = t("save.resetWord");
  const onReset = useCallback(() => {
    try {
      writeText(SAFETY_FILE, serialize(getGame().state));
    } catch (e) {
      console.warn("safety copy", e);
    }
    resetGame();
    setResetOpen(false);
    setResetWord("");
    toast(t("save.resetDone"), "warn");
  }, [t]);

  const current = pending ? summarize(getGame().state) : null;

  return (
    <Col gap="xs">
      <KeyValue label={t("save.lastSaved")} value={savedAt > 0 ? clock(savedAt) : t("save.notYet")} testID="save-last" />
      <Row gap="sm">
        <Txt variant="label" color="inkDim" style={{ flex: 1, lineHeight: 15 }}>
          {t("save.autosave")}
        </Txt>
        <Key
          size="sm"
          icon="save"
          label={t("save.saveNow")}
          onPress={() => {
            const ok = saveNow();
            setSavedAt(lastSavedMs());
            toast(ok ? t("save.saved") : t("save.saveBlocked"), ok ? "good" : "warn");
          }}
          testID="save-now"
        />
      </Row>

      <Rule label={t("save.exportTitle")} />
      <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
        {t("save.exportHint")}
      </Txt>
      <KeyRow>
        <Key icon="export" label={t("save.copyCode")} tone="orange" onPress={onCopy} testID="export-copy" />
        <Key icon="export" label={t("save.shareFile")} onPress={onShare} testID="export-share" />
      </KeyRow>
      {exported ? (
        <Col gap="xs">
          <Txt variant="bodyBold" color="good" testID="export-result">
            {t(`save.exported_${exported.how}`, { n: exported.code.length })}
          </Txt>
          <CodeBox lines={3} testID="export-code">
            {exported.code}
          </CodeBox>
        </Col>
      ) : null}
      <KeyValue label={t("save.lastExport")} value={lastExport > 0 ? clock(lastExport) : t("save.never")} />

      <Rule label={t("save.importTitle")} />
      <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
        {t("save.importHint")}
      </Txt>
      <Field
        value={text}
        onChangeText={(v) => {
          setText(v);
          setError(null);
        }}
        placeholder="DTO1.…"
        multiline
        height={72}
        accessibilityLabel={t("save.importTitle")}
        testID="import-text"
      />
      <KeyRow>
        <Key size="sm" icon="import" label={t("save.paste")} onPress={onPaste} testID="import-paste" />
        <Key size="sm" icon="import" label={t("save.fromFile")} onPress={onPickFile} testID="import-file" />
        <Key size="sm" icon="check" label={t("save.check")} tone="cobalt" disabled={text.trim().length === 0} onPress={() => check(text)} testID="import-check" />
      </KeyRow>
      {error ? (
        <Col gap={2}>
          <Txt variant="bodyBold" color="bad" testID="import-error">
            {t(`save.err_${error}`)}
          </Txt>
          <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
            {t("save.errUntouched")}
          </Txt>
        </Col>
      ) : null}

      <Rule label={t("save.reminderTitle")} />
      <SettingRow
        icon="bell"
        title={t("save.reminder")}
        hint={t("save.reminderHint")}
        right={<Toggle value={backupReminder} onChange={(v) => useSettings.getState().set("backupReminder", v)} accessibilityLabel={t("save.reminder")} />}
      />

      <Rule label={t("save.resetTitle")} />
      <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
        {t("save.resetHint")}
      </Txt>
      <HoldKey label={t("save.resetHold")} sublabel={t("save.resetHoldSub")} onConfirm={() => setResetOpen(true)} testID="reset-hold" />

      <Dialog
        visible={pending !== null}
        title={t("save.confirmTitle")}
        icon="import"
        tone="warn"
        testID="import-confirm"
        onRequestClose={() => setPending(null)}
        choices={[
          { label: t("save.confirmReplace"), tone: "red", onPress: onReplace, testID: "import-replace" },
          { label: t("save.confirmKeep"), onPress: () => setPending(null), testID: "import-cancel" },
        ]}
      >
        {pending && current ? (
          <Col gap="sm">
            <Rule label={t("save.inCode")} />
            <SummaryTable s={pending.summary} prefix="imp" />
            <Rule label={t("save.inGame")} />
            <SummaryTable s={current} prefix="cur" />
            <Txt variant="bodyBold" color="bad">
              {t("save.confirmWarn")}
            </Txt>
          </Col>
        ) : null}
      </Dialog>

      <Dialog
        visible={resetOpen}
        title={t("save.resetConfirmTitle")}
        icon="skull"
        tone="bad"
        testID="reset-confirm"
        onRequestClose={() => {
          setResetOpen(false);
          setResetWord("");
        }}
        choices={[
          { label: t("save.resetDo"), tone: "red", disabled: resetWord.trim().toUpperCase() !== word, onPress: onReset, testID: "reset-do" },
          {
            label: t("save.resetCancel"),
            onPress: () => {
              setResetOpen(false);
              setResetWord("");
            },
            testID: "reset-cancel",
          },
        ]}
      >
        <Col gap="sm">
          <Txt>{t("save.resetConfirmBody", { word })}</Txt>
          <Field value={resetWord} onChangeText={setResetWord} placeholder={word} maxLength={12} accessibilityLabel={t("save.resetConfirmTitle")} testID="reset-word" />
        </Col>
      </Dialog>
    </Col>
  );
}
