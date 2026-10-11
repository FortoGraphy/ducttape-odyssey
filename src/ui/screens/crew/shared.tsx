// Shared pieces of the Crew tab: effects in words, trait chips and their detail dialog, reputation
// bars and standings, lock teasers and the list-signature hook every section uses.
import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { content } from "@/content";
import type { DeckId, Effect, FactionId, Game, StatKey, TraitId } from "@/engine/types";
import { useLang, useT, useTr, type Lang } from "@/i18n";
import { getGame, useGame } from "@/store/game";
import { Badge, Card, Chip, Col, Dialog, formatDelta, Icon, MicroLabel, Row, Txt, useTheme } from "@/ui/kit";
import { palette, space, type PaletteKey } from "@/ui/theme";

export type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** Stats where a smaller number is the good direction. */
const LOWER_IS_BETTER: Partial<Record<StatKey, true>> = {
  powerUse: true,
  wearRate: true,
  shield: true,
  fuelUse: true,
  jumpCooldown: true,
  heatRate: true,
  coffeeUse: true,
  towSpeed: true,
  deckCost: true,
};

export interface EffectLine {
  text: string;
  good: boolean;
}

/** Turns engine effects into "Cargo capacity +15 %" lines. `deck` names the deck an unscoped effect lands on. */
export function effectLines(effects: readonly Effect[] | undefined, t: TFn, tr: ReturnType<typeof useTr>, lang: Lang, deck?: DeckId | null): EffectLine[] {
  const out: EffectLine[] = [];
  if (!effects) return out;
  for (const e of effects) {
    const target = e.deck ?? deck ?? null;
    const label = e.stat ? t(`stat.${e.stat}`) : target ? t("stat.deckOutput", { deck: tr(content.decks[target]?.name) }) : t("stat.managedDeck");
    const lower = e.stat ? LOWER_IS_BETTER[e.stat] === true : false;
    if (e.add !== undefined && e.add !== 0) out.push({ text: `${label} ${formatDelta(e.add, lang)}`, good: lower ? e.add < 0 : e.add > 0 });
    if (e.mul !== undefined && e.mul !== 1) out.push({ text: `${label} ${formatDelta(e.mul - 1, lang)}`, good: lower ? e.mul < 1 : e.mul > 1 });
  }
  return out;
}

export function EffectList({ lines, suffix }: { lines: readonly EffectLine[]; suffix?: string }) {
  return (
    <Col gap={2}>
      {lines.map((l, i) => (
        <Txt key={i} variant="bodyBold" color={l.good ? "good" : "bad"}>
          {suffix ? `${l.text} ${suffix}` : l.text}
        </Txt>
      ))}
    </Col>
  );
}

/** Multiplier with the decimal mark of the language: "×1,97". */
export function fmtMult(n: number, lang: Lang): string {
  const s = n.toFixed(2);
  return `×${lang === "cs" ? s.replace(".", ",") : s}`;
}

/** One decimal, localized, without a trailing zero. */
export function fmtDec(n: number, lang: Lang): string {
  const s = (Math.round(n * 10) / 10).toString();
  return lang === "cs" ? s.replace(".", ",") : s;
}

// ---------- list signatures -----------------------------------------------------------

/**
 * Lists are rebuilt from the game only when a cheap signature string changes. The signature is
 * evaluated every `every` pulses; the builder runs once per change.
 */
export function useSnapshot<T>(signature: (g: Game) => string, build: (g: Game) => T, every = 3): T {
  const sig = useGame(signature, Object.is, every);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the signature stands in for the game state
  return useMemo(() => build(getGame()), [sig]);
}

// ---------- traits --------------------------------------------------------------------

export const TraitChip = memo(function TraitChip({ id, onOpen }: { id: TraitId; onOpen?: (id: TraitId) => void }) {
  const tr = useTr();
  const def = content.traits[id];
  const press = useCallback(() => onOpen?.(id), [onOpen, id]);
  if (!def) return null;
  return <Chip label={tr(def.name)} dot={def.good ? "mint" : "red"} onPress={onOpen ? press : undefined} style={{ flexShrink: 1 }} />;
});

/** `const [openTrait, traitDialog] = useTraitDialog()`: render `traitDialog` once, call `openTrait(id)` from chips. */
export function useTraitDialog(): [(id: TraitId) => void, ReactNode] {
  const [id, setId] = useState<TraitId | null>(null);
  const [shown, setShown] = useState(false);
  const t = useT("crew") as TFn;
  const tc = useT("common") as TFn;
  const tr = useTr();
  const lang = useLang();
  const open = useCallback((next: TraitId) => {
    setId(next);
    setShown(true);
  }, []);
  const close = useCallback(() => setShown(false), []);
  const def = id ? content.traits[id] : undefined;
  const node = def ? (
    <Dialog
      visible={shown}
      title={tr(def.name)}
      icon="crew"
      tone={def.good ? "good" : "warn"}
      body={tr(def.desc)}
      onRequestClose={close}
      choices={[{ label: tc("ok"), tone: "black", onPress: close, testID: "trait-ok" }]}
      testID="trait-dialog"
    >
      <Row gap="sm">
        <Badge label={def.good ? t("trait.good") : t("trait.bad")} tone={def.good ? "good" : "bad"} />
        <MicroLabel size="label">{t("trait.whileManaging")}</MicroLabel>
      </Row>
      <EffectList lines={effectLines(def.effects, t, tr, lang)} />
    </Dialog>
  ) : null;
  return [open, node];
}

// ---------- factions ------------------------------------------------------------------

export const FACTION_IDS: readonly FactionId[] = ["lamplighters", "rustborn", "ledger"];

export type Standing = "hostile" | "wary" | "neutral" | "known" | "trusted" | "family";

export function standingOf(rep: number): Standing {
  if (rep < -50) return "hostile";
  if (rep < -10) return "wary";
  if (rep < 10) return "neutral";
  if (rep < 40) return "known";
  if (rep < 80) return "trusted";
  return "family";
}

export function standingTone(s: Standing): "bad" | "warn" | "neutral" | "info" | "good" {
  return s === "hostile" ? "bad" : s === "wary" ? "warn" : s === "neutral" ? "neutral" : s === "known" ? "info" : "good";
}

export function factionColor(id: FactionId): string {
  return palette[content.factions[id].color as PaletteKey] ?? palette.amber;
}

/** Reputation -100..100 on a track with the zero in the middle. */
export const RepBar = memo(function RepBar({ rep, faction, style }: { rep: number; faction: FactionId; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const half = Math.min(1, Math.abs(rep) / 100) * 50;
  return (
    <View style={[{ height: 8, borderRadius: 2, backgroundColor: theme.well, borderTopWidth: 1, borderTopColor: theme.rule, overflow: "hidden" }, style]}>
      <View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: rep >= 0 ? "50%" : `${50 - half}%`,
          width: `${half}%`,
          backgroundColor: rep >= 0 ? factionColor(faction) : theme.red,
        }}
      />
      <View style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, backgroundColor: theme.inkDim }} />
    </View>
  );
});

export function fmtRep(rep: number): string {
  const r = Math.round(rep);
  return r > 0 ? `+${r}` : r < 0 ? `−${-r}` : "0";
}

// ---------- small layout pieces -------------------------------------------------------

/** A feature that is not unlocked yet: says what it is and how to get it. */
export function LockTeaser({ icon, title, body, how, testID }: { icon: string; title: string; body: string; how: string; testID?: string }) {
  const theme = useTheme();
  return (
    <Card padding={space.lg} gap={space.sm} style={{ margin: space.xs }}>
      <View testID={testID} style={{ gap: space.sm }}>
        <Row gap="sm">
          <View style={{ width: 40, height: 40, borderRadius: 6, borderWidth: 1, borderStyle: "dashed", borderColor: theme.inkDim, alignItems: "center", justifyContent: "center" }}>
            <Icon name="lock" size={24} color="inkDim" />
          </View>
          <Col gap={2} flex>
            <MicroLabel size="label">{useT("common")("locked")}</MicroLabel>
            <Txt variant="heading">{title}</Txt>
          </Col>
          <Icon name={icon} size={24} chip />
        </Row>
        <Txt variant="body" color="inkDim">
          {body}
        </Txt>
        <Row gap="sm" align="flex-start">
          <Icon name="unlock" size={16} chip={theme.id === "day"} />
          <Txt variant="bodyBold" style={{ flex: 1 }}>
            {how}
          </Txt>
        </Row>
      </View>
    </Card>
  );
}

/** Printed note with an info icon. */
export function Note({ text, icon = "info", tone }: { text: string; icon?: string; tone?: "warn" | "bad" | "good" }) {
  const theme = useTheme();
  return (
    <Row gap="sm" align="flex-start" style={{ paddingHorizontal: space.xs }}>
      <Icon name={icon} size={16} chip={theme.id === "day"} />
      <Txt variant="label" color={tone ?? "inkDim"} style={{ flex: 1, lineHeight: 15 }}>
        {text}
      </Txt>
    </Row>
  );
}

export const SectionLabel = memo(function SectionLabel({ label, right }: { label: string; right?: string }) {
  return (
    <Row justify="space-between" style={{ paddingHorizontal: space.xs, paddingTop: space.xs }}>
      <MicroLabel size="label">{label}</MicroLabel>
      {right ? <MicroLabel size="label">{right}</MicroLabel> : null}
    </Row>
  );
});
