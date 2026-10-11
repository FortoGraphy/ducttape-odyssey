// Crew roster: morale and coffee, the people, and the assign / rename / dismiss flows.
import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, TextInput, View } from "react-native";

import { content } from "@/content";
import * as B from "@/engine/big";
import { rebuildMods } from "@/engine/kernel";
import { DECK_IDS, type CrewMember, type DeckId, type Game, type TraitId } from "@/engine/types";
import { assignCrew, coffeePerMinute, crewCap, crewMaxLevel, crewXpNeed, dismissCrew, findCrew, isInjured, managerBonus, moraleFactor, moralePerHour, renameCrew } from "@/engine/world";
import { useLang, useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { getGame, useGame } from "@/store/game";
import { Portrait } from "@/ui/common/Portrait";
import { fonts } from "@/ui/fonts";
import { fmt, fmtPct, fmtTime } from "@/ui/format";
import { Badge, Card, Col, Dialog, EmptyState, Icon, IconKey, Key, KeyRow, Meter, MicroLabel, ProgressBar, Row, Rule, Sheet, toast, Txt, useTheme, type BarZone } from "@/ui/kit";
import { space } from "@/ui/theme";

import { doAct, effectLines, EffectList, fmtDec, fmtMult, LockTeaser, Note, TraitChip, useSnapshot, useTraitDialog, type TFn } from "./shared";

const MORALE_ZONES: readonly BarZone[] = [
  { from: 0, tone: "red" },
  { from: 0.3, tone: "yellow" },
  { from: 0.6, tone: "mint" },
];
/** Coffee that lasts less than this is worth a warning. */
const LOW_COFFEE_SECS = 30 * 60;

// ---------- morale and coffee ---------------------------------------------------------

interface MoraleInfo {
  morale: number;
  perHour: number;
  factor: number;
  coffee: number;
  perMin: number;
  crew: number;
  cap: number;
}

function moraleInfo(g: Game): MoraleInfo {
  return {
    morale: Math.floor(g.state.morale),
    perHour: Math.round(moralePerHour(g) * 10) / 10,
    factor: Math.round(moraleFactor(g) * 100) / 100,
    coffee: Math.floor(Math.min(1e15, B.toNumber(g.state.inv.coffee ?? B.ZERO))),
    perMin: Math.round(coffeePerMinute(g) * 100) / 100,
    crew: g.state.crew.length,
    cap: crewCap(g),
  };
}

/** Seconds the stock lasts at the current consumption; Infinity when nobody drinks. */
function coffeeLasts(m: MoraleInfo): number {
  return m.perMin > 0 ? (m.coffee / m.perMin) * 60 : Infinity;
}

function signed(n: number, lang: "cs" | "en"): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtDec(Math.abs(n), lang)}`;
}

const MoraleCard = memo(function MoraleCard({ m, onPress }: { m: MoraleInfo; onPress: () => void }) {
  const t = useT("crew") as TFn;
  const lang = useLang();
  const theme = useTheme();
  const lasts = coffeeLasts(m);
  const out = m.crew > 0 && m.perHour < 0;
  const low = !out && m.crew > 0 && lasts < LOW_COFFEE_SECS;
  return (
    <Col gap="sm">
      {out || low ? (
        <Card padding={space.sm} gap={space.xs} style={{ borderLeftWidth: 4, borderLeftColor: out ? theme.red : theme.orange }}>
          <Row gap="sm" align="flex-start" testID="coffee-warning">
            <Icon name="warning" size={24} chip />
            <Col gap={2} flex>
              <Txt variant="bodyBold" color={out ? "bad" : "warn"}>
                {out ? t("coffee.outTitle") : t("coffee.lowTitle", { time: fmtTime(lasts) })}
              </Txt>
              <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
                {out ? t("coffee.outBody", { rate: fmtDec(Math.abs(m.perHour), lang) }) : t("coffee.lowBody")}
              </Txt>
            </Col>
          </Row>
        </Card>
      ) : null}
      <Card padding={space.sm} gap={space.xs} onPress={onPress} accessibilityLabel={t("morale.title")}>
        <View testID="morale-card" style={{ gap: space.xs }}>
          <Meter value={m.morale / 100} zones={MORALE_ZONES} label={t("morale.title")} valueText={`${m.morale} %  ${signed(m.perHour, lang)}${t("perHour")}`} ticks={5} />
          <Row justify="space-between">
            <Row gap="xs" flex>
              <Icon name="coffee" size={16} chip />
              <Txt variant="label" color={out ? "bad" : low ? "warn" : "ink"} numberOfLines={1} style={{ flex: 1 }}>
                {m.crew === 0 ? t("coffee.nobody", { stock: fmt(m.coffee) }) : t("coffee.line", { stock: fmt(m.coffee), use: fmt(m.perMin * 60), time: out ? "0m" : fmtTime(lasts) })}
              </Txt>
            </Row>
            <Row gap="xs">
              <Icon name="crew" size={16} chip />
              <Txt variant="label" color={m.crew >= m.cap ? "warn" : "ink"}>
                {t("bunks.short", { n: m.crew, cap: m.cap })}
              </Txt>
              <Icon name="right" size={16} color="inkDim" />
            </Row>
          </Row>
        </View>
      </Card>
    </Col>
  );
});

function MoraleSheet({ visible, onClose, m }: { visible: boolean; onClose: () => void; m: MoraleInfo }) {
  const t = useT("crew") as TFn;
  const lang = useLang();
  const lasts = coffeeLasts(m);
  const out = m.crew > 0 && m.perHour < 0;
  return (
    <Sheet visible={visible} onClose={onClose} title={t("morale.sheetTitle")} testID="morale-sheet">
      <Meter value={m.morale / 100} zones={MORALE_ZONES} label={t("morale.title")} valueText={`${m.morale} %`} ticks={11} height={10} />
      <Col gap="xs">
        <Fact label={t("morale.trend")} value={`${signed(m.perHour, lang)} ${t("morale.perHourLong")}`} tone={m.perHour < 0 ? "bad" : m.perHour > 0 ? "good" : undefined} />
        <Fact label={t("morale.managers")} value={fmtPct(m.factor)} tone={m.factor < 0.8 ? "warn" : "good"} />
        <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
          {t("morale.managersHint")}
        </Txt>
      </Col>
      <Rule label={t("coffee.title")} />
      <Col gap="xs">
        <Fact label={t("coffee.stock")} value={fmt(m.coffee)} tone={out ? "bad" : undefined} />
        <Fact label={t("coffee.use")} value={`${fmt(m.perMin * 60)} ${t("coffee.perHour")}`} />
        <Fact label={t("coffee.lasts")} value={m.crew === 0 ? t("coffee.forever") : out ? t("coffee.empty") : fmtTime(lasts)} tone={out || lasts < LOW_COFFEE_SECS ? "bad" : undefined} />
        <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
          {t("coffee.sources")}
        </Txt>
      </Col>
      <Rule label={t("bunks.title")} />
      <Col gap="xs">
        <Fact label={t("bunks.taken")} value={t("bunks.short", { n: m.crew, cap: m.cap })} tone={m.crew >= m.cap ? "warn" : undefined} />
        <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
          {t("bunks.how", { every: Number(content.balance.quartersCrewEvery ?? 5) })}
        </Txt>
      </Col>
      <Rule label={t("morale.driversTitle")} />
      <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
        {t("morale.drivers")}
      </Txt>
    </Sheet>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" }) {
  return (
    <Row justify="space-between" gap="md">
      <Txt variant="body" color="inkDim" numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </Txt>
      <Txt variant="bodyBold" color={tone ?? "ink"} tabular>
        {value}
      </Txt>
    </Row>
  );
}

// ---------- roster --------------------------------------------------------------------

interface CrewRow {
  uid: number;
  seed: number;
  name: string;
  level: number;
  maxed: boolean;
  xp: number; // 0..1 toward the next level
  traits: TraitId[];
  deck: DeckId | null;
  away: boolean;
  injured: boolean;
  bonus: number;
}

function rosterSig(g: Game): string {
  const crew = g.state.crew;
  let s = `${Math.floor(g.state.morale)}`;
  for (let i = 0; i < crew.length; i++) {
    const c = crew[i];
    s += `;${c.uid}|${c.name}|${c.level}|${Math.floor((c.xp / crewXpNeed(g, c.level)) * 24)}|${c.deck ?? ""}|${c.away ? 1 : 0}|${isInjured(g, c.uid) ? 1 : 0}`;
  }
  return s;
}

function buildRoster(g: Game): CrewRow[] {
  const max = crewMaxLevel(g);
  return g.state.crew.map((c) => ({
    uid: c.uid,
    seed: c.seed,
    name: c.name,
    level: c.level,
    maxed: c.level >= max,
    xp: c.level >= max ? 1 : Math.min(1, c.xp / crewXpNeed(g, c.level)),
    traits: c.traits.slice(0, 2),
    deck: c.deck,
    away: c.away,
    injured: isInjured(g, c.uid),
    bonus: managerBonus(g, c),
  }));
}

function statusOf(row: CrewRow, t: TFn, tr: ReturnType<typeof useTr>): { icon: string; text: string; tone: "ink" | "inkDim" | "warn" | "bad" } {
  if (row.away) return { icon: "planet", text: t("status.away"), tone: "warn" };
  if (row.injured) return { icon: "heart", text: t("status.sickbay"), tone: "bad" };
  if (row.deck) return { icon: content.decks[row.deck].icon, text: t("status.manages", { deck: tr(content.decks[row.deck].name), bonus: `+${Math.round(row.bonus * 100)} %` }), tone: "ink" };
  return { icon: "deck_quarters", text: t("status.idle"), tone: "inkDim" };
}

const CrewCard = memo(function CrewCard({ row, onOpen, onTrait }: { row: CrewRow; onOpen: (uid: number) => void; onTrait: (id: TraitId) => void }) {
  const t = useT("crew") as TFn;
  const tr = useTr();
  const open = useCallback(() => onOpen(row.uid), [onOpen, row.uid]);
  const st = statusOf(row, t, tr);
  return (
    <Card padding={space.sm} gap={space.xs} style={{ marginBottom: space.sm }}>
      {/* The trait chips are buttons of their own, so only the upper part opens the detail. */}
      <Pressable testID={`crew-${row.uid}`} onPress={open} onPressIn={() => haptic("tap")} accessibilityRole="button" accessibilityLabel={row.name} style={({ pressed }) => ({ flexDirection: "row", alignItems: "flex-start", gap: space.sm, opacity: pressed ? 0.7 : 1 })}>
        <Portrait seed={row.seed} size={48} />
        <Col gap={3} flex>
          <Row gap="sm">
            <Txt variant="bodyBold" numberOfLines={1} style={{ flex: 1 }}>
              {row.name}
            </Txt>
            <Badge label={`${t("lvl")} ${row.level}`} tone={row.maxed ? "orange" : "neutral"} style={{ alignSelf: "center" }} />
          </Row>
          <ProgressBar value={row.xp} tone={row.maxed ? "orange" : "cobalt"} height={4} accessibilityLabel={t("xp")} />
          <Row gap="xs">
            <Icon name={st.icon} size={16} chip />
            <Txt variant="label" color={st.tone} numberOfLines={1} style={{ flex: 1 }}>
              {st.text}
            </Txt>
          </Row>
        </Col>
      </Pressable>
      <Row gap="xs" wrap>
        {row.traits.map((id) => (
          <TraitChip key={id} id={id} onOpen={onTrait} />
        ))}
      </Row>
    </Card>
  );
});

// ---------- assign preview ------------------------------------------------------------

interface DeckOption {
  deck: DeckId;
  level: number;
  before: number;
  after: number;
  replaces: string | null;
  current: boolean;
}

/**
 * What each deck's output multiplier would be with this person in charge. The engine has no
 * preview helper, so the assignment is tried for real, the engine folds its own modifiers
 * (manager bonus, morale, traits), and the roster is put back, all inside one synchronous call
 * between ticks. The numbers therefore always match what assignCrew will do.
 */
function previewAssign(g: Game, uid: number): DeckOption[] {
  const s = g.state;
  const member = findCrew(g, uid);
  if (!member || member.away) return [];
  if (g.dirty) rebuildMods(g);
  const crewDecks = s.crew.map((c) => c.deck);
  const managers = DECK_IDS.map((id) => s.decks[id].manager);
  const restore = (): void => {
    s.crew.forEach((c, i) => (c.deck = crewDecks[i]));
    DECK_IDS.forEach((id, i) => (s.decks[id].manager = managers[i]));
  };
  const out: DeckOption[] = [];
  try {
    for (const deck of DECK_IDS) {
      const d = s.decks[deck];
      if (!(d.level > 0)) continue;
      const before = g.deckMult[deck];
      const prev = d.manager !== 0 && d.manager !== uid ? findCrew(g, d.manager) : null;
      const current = member.deck === deck;
      let after = before;
      if (!current && assignCrew(g, uid, deck).ok) {
        rebuildMods(g);
        after = g.deckMult[deck];
        restore();
        rebuildMods(g);
      }
      out.push({ deck, level: d.level, before, after, replaces: prev ? prev.name : null, current });
    }
  } finally {
    restore();
    rebuildMods(g);
  }
  return out;
}

const DeckPick = memo(function DeckPick({ opt, onPick }: { opt: DeckOption; onPick: (deck: DeckId) => void }) {
  const t = useT("crew") as TFn;
  const tr = useTr();
  const lang = useLang();
  const theme = useTheme();
  const def = content.decks[opt.deck];
  const pick = useCallback(() => onPick(opt.deck), [onPick, opt.deck]);
  const delta = opt.after - opt.before;
  return (
    <Pressable
      testID={`pick-${opt.deck}`}
      onPress={pick}
      disabled={opt.current}
      accessibilityRole="button"
      accessibilityLabel={tr(def.name)}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        minHeight: 52,
        paddingHorizontal: space.sm,
        paddingVertical: 6,
        borderRadius: 4,
        backgroundColor: pressed ? theme.platePressed : opt.current ? theme.well : "transparent",
        borderBottomWidth: 1,
        borderBottomColor: theme.rule,
      })}
    >
      <Icon name={def.icon} size={24} chip />
      <Col gap={1} flex>
        <Txt variant="bodyBold" numberOfLines={1}>
          {tr(def.name)}
        </Txt>
        <Txt variant="label" color={opt.replaces ? "warn" : "inkDim"} numberOfLines={1}>
          {opt.current ? t("assign.here") : opt.replaces ? t("assign.replaces", { name: opt.replaces }) : t("assign.free")}
        </Txt>
      </Col>
      <Col gap={1} align="flex-end">
        <Txt variant="bodyBold" tabular color={opt.current ? "inkDim" : delta > 0 ? "good" : delta < 0 ? "bad" : "ink"}>
          {opt.current ? fmtMult(opt.before, lang) : `${fmtMult(opt.before, lang)} → ${fmtMult(opt.after, lang)}`}
        </Txt>
        <MicroLabel>{t("assign.output")}</MicroLabel>
      </Col>
    </Pressable>
  );
});

// ---------- crew detail sheet ---------------------------------------------------------

function CrewSheet({ uid, onClose }: { uid: number | null; onClose: () => void }) {
  const t = useT("crew") as TFn;
  const tc = useT("common") as TFn;
  const tr = useTr();
  const lang = useLang();
  const theme = useTheme();
  const [mode, setMode] = useState<"info" | "assign" | "rename">("info");
  const [draft, setDraft] = useState("");
  const [confirm, setConfirm] = useState(false);
  // Keeps the last person on screen while the sheet slides away.
  const [shownUid, setShownUid] = useState<number | null>(uid);
  const [prevUid, setPrevUid] = useState<number | null>(uid);
  if (uid !== prevUid) {
    setPrevUid(uid);
    if (uid !== null) {
      setShownUid(uid);
      setMode("info");
    }
  }

  const sig = useGame((g) => {
    const c = shownUid === null ? null : findCrew(g, shownUid);
    return c ? `${c.name}|${c.level}|${Math.floor(c.xp)}|${c.deck ?? ""}|${c.away ? 1 : 0}|${isInjured(g, c.uid) ? 1 : 0}|${Math.floor(g.state.morale)}` : "";
  }, Object.is);
  const info = useMemo(() => {
    const g = getGame();
    const c: CrewMember | null = shownUid === null ? null : findCrew(g, shownUid);
    if (!c) return null;
    const max = crewMaxLevel(g);
    return { c: { ...c, traits: c.traits.slice() }, need: crewXpNeed(g, c.level), maxed: c.level >= max, max, bonus: managerBonus(g, c), factor: moraleFactor(g), injured: isInjured(g, c.uid) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sig stands in for the member's state
  }, [shownUid, sig]);
  const moraleStep = useGame((g) => Math.floor(g.state.morale), Object.is, 10);
  const postKey = info ? `${info.c.deck ?? ""}|${info.c.level}|${info.c.away ? 1 : 0}` : "";
  const options = useMemo(
    () => (mode === "assign" && shownUid !== null ? previewAssign(getGame(), shownUid) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-previewed only when the posting, level or morale step changes
    [mode, shownUid, postKey, moraleStep],
  );

  const pick = useCallback(
    (deck: DeckId) => {
      if (shownUid === null) return;
      const name = findCrew(getGame(), shownUid)?.name ?? "";
      const res = doAct((g) => assignCrew(g, shownUid, deck));
      if (res.ok) {
        sfx("moduleInstall");
        haptic("success");
        toast(t("assign.done", { name, deck: tr(content.decks[deck].name) }), { tone: "good", icon: content.decks[deck].icon });
        setMode("info");
      } else {
        sfx("deny");
        toast(t(`fail.${res.reason}`), "bad");
      }
    },
    [shownUid, t, tr],
  );

  if (!info) return <Sheet visible={false} onClose={onClose} />;
  const { c } = info;
  const busy = c.away;

  const unassign = () => {
    doAct((g) => assignCrew(g, c.uid, null));
    sfx("moduleInstall");
    toast(t("assign.unassigned", { name: c.name }), "info");
  };
  const saveName = () => {
    const res = doAct((g) => renameCrew(g, c.uid, draft));
    if (res.ok) {
      sfx("success");
      setMode("info");
    } else {
      sfx("deny");
      toast(t("rename.invalid"), "bad");
    }
  };
  const dismiss = () => {
    const res = doAct((g) => dismissCrew(g, c.uid));
    setConfirm(false);
    if (res.ok) {
      toast(t("dismiss.done", { name: c.name }), "info");
      onClose();
    } else {
      sfx("deny");
      toast(t(`fail.${res.reason}`), "bad");
    }
  };

  const footer =
    mode === "assign" ? (
      <KeyRow>
        <Key label={tc("back")} icon="back" onPress={() => setMode("info")} testID="assign-back" />
      </KeyRow>
    ) : mode === "rename" ? (
      <KeyRow>
        <Key label={tc("save")} icon="check" tone="orange" onPress={saveName} testID="rename-save" />
        <Key label={tc("cancel")} onPress={() => setMode("info")} />
      </KeyRow>
    ) : (
      <Col gap="xs">
        {busy ? <Note text={t("assign.busy")} icon="warning" tone="warn" /> : null}
        <KeyRow>
          <Key label={c.deck ? t("assign.move") : t("assign.assign")} icon="assign" tone="orange" disabled={busy} onPress={() => setMode("assign")} flex={2} testID="crew-assign" />
          <Key label={t("assign.unassign")} disabled={!c.deck} onPress={unassign} flex={2} testID="crew-unassign" />
          <IconKey icon="remove" tone="red" disabled={busy} onPress={() => setConfirm(true)} accessibilityLabel={t("dismiss.key")} testID="crew-dismiss" />
        </KeyRow>
      </Col>
    );

  return (
    <Sheet visible={uid !== null} onClose={onClose} title={mode === "assign" ? t("assign.title", { name: c.name }) : c.name} footer={footer} testID="crew-sheet">
      {mode === "assign" ? (
        <Col gap="sm">
          <Card padding={space.sm} gap={space.xs}>
            <Row gap="sm" align="flex-start">
              <Portrait seed={c.seed} size={40} />
              <Col gap={2} flex>
                <Txt variant="bodyBold" color="good">
                  {t("assign.bonus", { bonus: `+${Math.round(info.bonus * 100)} %` })}
                </Txt>
                <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
                  {t("assign.bonusWhy", { level: c.level, morale: fmtPct(info.factor) })}
                </Txt>
                <EffectList lines={c.traits.flatMap((id) => effectLines(content.traits[id]?.effects, t, tr, lang))} />
              </Col>
            </Row>
          </Card>
          <View>{options.length === 0 ? <Note text={t("assign.noDecks")} /> : options.map((o) => <DeckPick key={o.deck} opt={o} onPick={pick} />)}</View>
        </Col>
      ) : (
        <Col gap="md">
          <Row gap="md" align="flex-start">
            <Portrait seed={c.seed} size={64} />
            <Col gap="xs" flex>
              {mode === "rename" ? (
                <TextInput
                  testID="rename-input"
                  value={draft}
                  onChangeText={setDraft}
                  autoFocus
                  maxLength={24}
                  selectTextOnFocus
                  returnKeyType="done"
                  onSubmitEditing={saveName}
                  accessibilityLabel={t("rename.key")}
                  style={{ fontFamily: fonts.monoBold, fontSize: 15, color: theme.lcdOn, backgroundColor: theme.lcdBg, borderRadius: 5, paddingHorizontal: space.sm, height: 40 }}
                />
              ) : (
                <Row gap="sm">
                  <Txt variant="heading" numberOfLines={1} style={{ flex: 1 }}>
                    {c.name}
                  </Txt>
                  <IconKey
                    icon="rename"
                    size="sm"
                    onPress={() => {
                      setDraft(c.name);
                      setMode("rename");
                    }}
                    accessibilityLabel={t("rename.key")}
                    testID="crew-rename"
                  />
                </Row>
              )}
              <Row justify="space-between">
                <MicroLabel size="label">{`${tc("level")} ${c.level} / ${info.max}`}</MicroLabel>
                <MicroLabel size="label">{info.maxed ? t("xpMax") : `${fmt(Math.floor(c.xp))} / ${fmt(Math.ceil(info.need))} ${t("xp")}`}</MicroLabel>
              </Row>
              <ProgressBar value={info.maxed ? 1 : Math.min(1, c.xp / info.need)} tone={info.maxed ? "orange" : "cobalt"} height={6} />
              <Txt variant="label" color={c.away ? "warn" : info.injured ? "bad" : "inkDim"} style={{ lineHeight: 15 }}>
                {c.away
                  ? t("status.away")
                  : info.injured
                    ? t("status.sickbay")
                    : c.deck
                      ? t("status.manages", { deck: tr(content.decks[c.deck].name), bonus: `+${Math.round(info.bonus * 100)} %` })
                      : t("status.idleLong")}
              </Txt>
            </Col>
          </Row>
          <Rule label={t("trait.title")} />
          {c.traits.map((id) => {
            const def = content.traits[id];
            if (!def) return null;
            return (
              <Col key={id} gap={3}>
                <Row gap="sm">
                  <TraitChip id={id} />
                  <Badge label={def.good ? t("trait.good") : t("trait.bad")} tone={def.good ? "good" : "bad"} style={{ alignSelf: "center" }} />
                </Row>
                <Txt variant="body">{tr(def.desc)}</Txt>
                <EffectList lines={effectLines(def.effects, t, tr, lang)} />
              </Col>
            );
          })}
          <Note text={t("trait.note")} />
        </Col>
      )}
      <Dialog
        visible={confirm}
        title={t("dismiss.title", { name: c.name })}
        body={t("dismiss.body")}
        tone="bad"
        onRequestClose={() => setConfirm(false)}
        choices={[
          { label: t("dismiss.confirm"), tone: "red", onPress: dismiss, testID: "dismiss-confirm" },
          { label: tc("cancel"), tone: "black", onPress: () => setConfirm(false) },
        ]}
      />
    </Sheet>
  );
}

// ---------- section -------------------------------------------------------------------

export default function CrewSection({ onFindStation }: { onFindStation: () => void }) {
  const t = useT("crew") as TFn;
  const unlocked = useGame((g) => g.state.features.crew === 1 || g.state.crew.length > 0);
  const m = useGame(moraleInfo);
  const rows = useSnapshot(rosterSig, buildRoster, 3);
  const [selected, setSelected] = useState<number | null>(null);
  const [moraleOpen, setMoraleOpen] = useState(false);
  const [openTrait, traitDialog] = useTraitDialog();
  const closeSheet = useCallback(() => setSelected(null), []);
  const openMorale = useCallback(() => setMoraleOpen(true), []);
  const renderItem = useCallback(({ item }: { item: CrewRow }) => <CrewCard row={item} onOpen={setSelected} onTrait={openTrait} />, [openTrait]);

  if (!unlocked) return <LockTeaser icon="crew" title={t("locked.crewTitle")} body={t("locked.crewBody")} how={t("locked.how")} testID="crew-locked" />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.uid)}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: space.md }}
        ListHeaderComponent={
          <Col gap="sm" style={{ marginBottom: space.sm }}>
            <MoraleCard m={m} onPress={openMorale} />
            {rows.length > 0 ? (
              <Row justify="space-between" style={{ paddingHorizontal: space.xs }}>
                <MicroLabel size="label">{t("crewCount", { count: rows.length })}</MicroLabel>
                <MicroLabel size="label">{t("roster.hint")}</MicroLabel>
              </Row>
            ) : null}
          </Col>
        }
        ListEmptyComponent={<EmptyState compact icon="crew" title={t("empty.title")} hint={t("empty.hint")} actionLabel={t("empty.action")} onAction={onFindStation} />}
      />
      <CrewSheet uid={selected} onClose={closeSheet} />
      <MoraleSheet visible={moraleOpen} onClose={() => setMoraleOpen(false)} m={m} />
      {traitDialog}
    </View>
  );
}
