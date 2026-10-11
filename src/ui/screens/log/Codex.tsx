// Log tab, "codex": discoveries grouped by category, with set-reward progress and renaming.
// The list is built only when the codex counters change; names are resolved per visible row.
import { memo, useCallback, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";

import { content } from "@/content";
import type { EventEffect } from "@/engine/types";
import { CODEX_NAME_MAX, codexSummary, renameCodex, sanitizeName, type CodexCategory } from "@/engine/meta";
import { getSystem, planetById, speciesName } from "@/engine/world";
import { tr, useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { act, getGame, useGame } from "@/store/game";
import { fmtTime, itemName } from "@/ui/format";
import { Chip, Col, Dialog, EmptyState, Icon, LIST_ROW_HEIGHT, ListRow, MicroLabel, ProgressBar, Row, ScrollWell, toast, Txt } from "@/ui/kit";
import { space } from "@/ui/theme";

import { Field } from "../settings/parts";

export const CODEX_GROUPS = ["system", "planet", "fauna", "flora", "artifact", "phenomenon", "contact"] as const;
export type CodexGroup = (typeof CODEX_GROUPS)[number];
const GROUP_ICON: Record<CodexGroup, string> = { system: "star_yellow", planet: "planet", fauna: "ev_fauna", flora: "deck_greenhouse", artifact: "star", phenomenon: "anomaly", contact: "signal" };
/** The engine pays set rewards per its own categories; event discoveries all count as "other". */
const ENGINE_CATEGORY: Record<CodexGroup, CodexCategory> = { system: "system", planet: "planet", fauna: "fauna", flora: "flora", artifact: "artifact", phenomenon: "other", contact: "other" };

function head(key: string): string {
  const colon = key.indexOf(":");
  if (colon > 0) return key.slice(0, colon);
  const under = key.indexOf("_");
  return under > 0 ? key.slice(0, under) : "";
}

export function codexGroup(key: string): CodexGroup {
  const h = head(key);
  return (CODEX_GROUPS as readonly string[]).includes(h) ? (h as CodexGroup) : "phenomenon";
}

let eventNames: Record<string, { cs: string; en: string }> | null = null;

function collect(effects: EventEffect[], title: { cs: string; en: string }, out: Record<string, { cs: string; en: string }>): void {
  for (const e of effects) {
    if (e.t === "codex" && !out[e.key]) out[e.key] = title;
    else if (e.t === "minigame") {
      collect(e.win, title, out);
      collect(e.lose, title, out);
    }
  }
}

/** Event discoveries have no name of their own: they carry the title of the event that logged them. */
function eventName(key: string): string | null {
  if (!eventNames) {
    eventNames = {};
    for (const id in content.events) {
      const ev = content.events[id];
      for (const c of ev.choices) for (const o of c.outcomes) collect(o.effects, ev.title, eventNames);
    }
  }
  const direct = content.events[key]?.title ?? eventNames[key];
  return direct ? tr(direct) : null;
}

function generatedName(key: string): string {
  try {
    const seed = getGame().state.seed;
    const colon = key.indexOf(":");
    if (colon > 0) {
      const kind = key.slice(0, colon);
      const rest = key.slice(colon + 1);
      if (kind === "system") {
        const p = rest.split(":").map(Number);
        if (p.length === 3 && p.every((n) => Number.isInteger(n) && n >= 0)) return getSystem(content, seed, p[0], p[1], p[2]).name;
      } else if (kind === "planet") {
        const planet = planetById(content, seed, rest);
        if (planet) return planet.name;
      } else if (kind === "fauna" || kind === "flora") {
        const cut = rest.lastIndexOf(":");
        const planet = planetById(content, seed, rest.slice(0, cut));
        if (planet) return `${speciesName(content, planet.seed, kind, Number(rest.slice(cut + 1)))} · ${planet.name}`;
      } else if (kind === "artifact") {
        return itemName(rest);
      }
    }
    const named = eventName(key);
    if (named) return named;
  } catch (e) {
    console.warn("codex name", key, e);
  }
  const tail = key.slice(Math.max(key.indexOf(":"), key.indexOf("_")) + 1).replace(/[_:]/g, " ");
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}

interface Entry {
  key: string;
  t: number;
  name?: string;
}

const EntryRow = memo(function EntryRow({ entry, group, onRename }: { entry: Entry; group: CodexGroup; onRename: (e: Entry, generated: string) => void }) {
  const t = useT("log");
  const generated = useMemo(() => generatedName(entry.key), [entry.key]);
  const icon = group === "artifact" && entry.key.startsWith("artifact:") ? entry.key.slice(9) : GROUP_ICON[group];
  const when = t("codex.foundAt", { time: fmtTime(entry.t) });
  return (
    <ListRow
      title={entry.name ?? generated}
      subtitle={entry.name ? `${generated} · ${when}` : when}
      icon={icon}
      right={<Icon name="rename" size={16} />}
      onPress={() => onRename(entry, generated)}
      divider
      accessibilityHint={t("codex.rename")}
      testID={`codex-${entry.key}`}
    />
  );
});

export function CodexSection() {
  const t = useT("log");
  useTr();
  const [group, setGroup] = useState<CodexGroup>("system");
  const [editing, setEditing] = useState<{ entry: Entry; generated: string } | null>(null);
  const [draft, setDraft] = useState("");
  const sig = useGame((g) => `${g.state.stats.codex ?? 0}:${g.state.stats.renames ?? 0}`, undefined, 5);
  const [bump, setBump] = useState(0);

  const { byGroup, counts, total } = useMemo(() => {
    const codex = getGame().state.codex;
    const lists = {} as Record<CodexGroup, Entry[]>;
    for (const g of CODEX_GROUPS) lists[g] = [];
    let n = 0;
    for (const key in codex) {
      const e = codex[key];
      lists[codexGroup(key)].push({ key, t: e.t, name: e.name });
      n++;
    }
    const c = {} as Record<CodexGroup, number>;
    for (const g of CODEX_GROUPS) {
      lists[g].sort((a, b) => b.t - a.t || (a.key < b.key ? -1 : 1));
      c[g] = lists[g].length;
    }
    return { byGroup: lists, counts: c, total: n };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, bump]);

  const summary = useMemo(() => {
    const s = codexSummary(getGame()).categories.find((c) => c.category === ENGINE_CATEGORY[group]);
    return s ?? { category: ENGINE_CATEGORY[group], count: 0, sets: 0, toNext: 10 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, group]);

  const onRename = useCallback((entry: Entry, generated: string) => {
    setDraft(entry.name ?? "");
    setEditing({ entry, generated });
  }, []);

  const apply = useCallback(
    (name: string) => {
      if (!editing) return;
      const r = act((g) => renameCodex(g, editing.entry.key, name));
      if (r.ok) {
        haptic("success");
        toast(name ? t("codex.renamed") : t("codex.restored"), "good");
        setEditing(null);
        setBump((b) => b + 1);
      } else {
        sfx("deny");
        toast(t("codex.renameInvalid"), "bad");
      }
    },
    [editing, t],
  );

  const list = byGroup[group];
  const clean = sanitizeName(draft);

  return (
    <>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingHorizontal: space.md, paddingBottom: space.xs }}>
          {CODEX_GROUPS.map((g) => (
            <Chip key={g} icon={GROUP_ICON[g]} label={`${t(`codex.group.${g}`)} ${counts[g]}`} selected={group === g} onPress={() => setGroup(g)} accessibilityLabel={t(`codex.group.${g}`)} />
          ))}
        </ScrollView>
      </View>
      <Col gap={2} style={{ paddingHorizontal: space.md, paddingBottom: space.xs }}>
        <Row justify="space-between">
          <MicroLabel size="label" color="ink" testID="codex-total">
            {t("codex.total", { count: total })}
          </MicroLabel>
          <MicroLabel size="label">{t("codex.nextReward", { n: (summary.sets + 1) * 10, left: summary.toNext })}</MicroLabel>
        </Row>
        <ProgressBar value={(10 - summary.toNext) / 10} tone="good" segments={10} height={6} />
        <MicroLabel>{ENGINE_CATEGORY[group] === "other" ? t("codex.setsOther", { count: summary.sets }) : t("codex.sets", { count: summary.sets })}</MicroLabel>
      </Col>
      {list.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <EmptyState compact icon={GROUP_ICON[group]} title={t("codex.emptyTitle")} hint={t(`codex.how.${group}`)} />
        </View>
      ) : (
        <ScrollWell
          data={list}
          padding={0}
          radius={0}
          style={{ flex: 1 }}
          keyExtractor={(e) => e.key}
          renderItem={({ item }) => <EntryRow entry={item} group={group} onRename={onRename} />}
          getItemLayout={(_, index) => ({ length: LIST_ROW_HEIGHT, offset: LIST_ROW_HEIGHT * index, index })}
          initialNumToRender={8}
          windowSize={7}
        />
      )}
      <Dialog
        visible={editing !== null}
        title={t("codex.rename")}
        icon="rename"
        testID="codex-rename"
        onRequestClose={() => setEditing(null)}
        choices={[
          { label: t("codex.renameSave"), tone: "orange", disabled: clean.length === 0 || clean === editing?.entry.name, onPress: () => apply(clean), testID: "codex-rename-save" },
          ...(editing?.entry.name ? [{ label: t("codex.renameRestore"), onPress: () => apply(""), testID: "codex-rename-restore" }] : []),
          { label: t("codex.renameCancel"), onPress: () => setEditing(null), testID: "codex-rename-cancel" },
        ]}
      >
        {editing ? (
          <Col gap="sm">
            <Txt variant="label" color="inkDim">
              {t("codex.renameOriginal", { name: editing.generated })}
            </Txt>
            <Field value={draft} onChangeText={setDraft} maxLength={CODEX_NAME_MAX} placeholder={editing.generated} onSubmit={() => (clean ? apply(clean) : undefined)} accessibilityLabel={t("codex.rename")} testID="codex-rename-input" />
            <Row justify="space-between">
              <MicroLabel>{t("codex.renameHint")}</MicroLabel>
              <MicroLabel color="ink">{`${clean.length}/${CODEX_NAME_MAX}`}</MicroLabel>
            </Row>
          </Col>
        ) : null}
      </Dialog>
    </>
  );
}
