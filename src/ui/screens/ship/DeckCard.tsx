// Deck stack rows: the built deck as a hardware module card, the full lock card for the deck to go
// for next, and the dim teaser for decks further away. Each row selects only its own primitives.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, type GestureResponderEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";

import { content } from "@/content";
import { buyDeck, canUnlockDeck, nextMilestone, unlockCost, unlockDeck } from "@/engine/core";
import type { DeckId } from "@/engine/types";
import { useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { act, getGame, useGame } from "@/store/game";
import { goTo } from "@/store/ui";
import { Portrait } from "@/ui/common/Portrait";
import { useFmt } from "@/ui/format";
import { Badge, CostTag, Icon, Key, Lcd, LcdNumber, LcdText, Led, LedRow, MicroLabel, popNumber, QUALITY_COLORS, toast, Txt, useTheme, type PopTone } from "@/ui/kit";
import { space } from "@/ui/theme";

import { bal, canPay, requirements, selectCard, type Requirement } from "./model";

export const CARD_H = 96;
export const TEASER_H = 44;
export const ROW_GAP = 6;
const KEY_W = 104;

export function popAt(e: GestureResponderEvent | undefined, text: string, tone: PopTone): void {
  const ne = e?.nativeEvent;
  if (ne && typeof ne.pageX === "number" && typeof ne.pageY === "number") popNumber(text, ne.pageX, ne.pageY - 22, tone);
}

let lastDeny = 0;
/** Deny feedback, rate-limited so a held key that ran out of credits does not buzz. */
export function deny(): void {
  const now = Date.now();
  if (now - lastDeny < 450) return;
  lastDeny = now;
  sfx("deny");
  haptic("warning");
}

// ---------- buy key ---------------------------------------------------------------------------

export interface BuyKeyProps {
  id: DeckId;
  /** Levels the key buys right now (0 = cannot afford any). */
  levels: number;
  width?: number;
  flex?: number;
  onBought?: (levels: number, milestone: boolean) => void;
  testID?: string;
}

export const BuyKey = memo(function BuyKey({ id, levels, width, flex, onBought, testID }: BuyKeyProps) {
  const theme = useTheme();
  const t = useT("ship");
  const afford = levels > 0;
  const press = useCallback(
    (e: GestureResponderEvent) => {
      const g = getGame();
      const before = g.state.decks[id].level;
      const ms = nextMilestone(g, id);
      const res = act((game) => buyDeck(game, id));
      if (!res.ok) return deny();
      const n = g.state.decks[id].level - before;
      const crossed = !!ms && before + n >= ms.level;
      popAt(e, crossed ? `+${n} ×2` : `+${n}`, crossed ? "warn" : "good");
      if (crossed) {
        sfx("milestone");
        haptic("success");
      } else sfx(n >= 10 ? "buyMax" : "buy", { volume: 0.7 });
      onBought?.(n, crossed);
    },
    [id, onBought],
  );
  const n = Math.max(1, levels);
  const ink = afford ? theme.onAccent : theme.keyText;
  return (
    <Key
      testID={testID}
      tone={afford ? "orange" : "black"}
      width={width}
      flex={flex}
      repeat
      onPress={press}
      sound={afford ? "keyDown" : null}
      style={afford ? undefined : styles.dim}
      accessibilityLabel={t("buy.a11y", { count: n })}
      accessibilityHint={afford ? undefined : t("buy.cannot")}
    >
      <View style={styles.keyBody}>
        <Icon name="up" size={16} color={ink} />
        <View>
          <Txt variant="key" color={ink} style={styles.keyNum}>{`+${n}`}</Txt>
          <Txt variant="micro" color={ink} upper style={styles.keySub}>
            {t("levelNoun", { count: n })}
          </Txt>
        </View>
      </View>
    </Key>
  );
});

// ---------- built deck ------------------------------------------------------------------------

export interface DeckRowProps {
  id: DeckId;
  /** Changes to a new non-zero number to make the card flash (shortcut from the flow strip). */
  ping: number;
  /** The deck was built a moment ago: play the build flourish. */
  fresh: boolean;
  onOpen: (id: DeckId) => void;
}

export const DeckCard = memo(function DeckCard({ id, ping, fresh, onOpen }: DeckRowProps) {
  const theme = useTheme();
  const t = useT("ship");
  const tr = useTr();
  const fmt = useFmt();
  const def = content.decks[id];
  const s = useGame((g) => selectCard(g, id, fmt));
  const flash = useSharedValue(0);
  const [party, setParty] = useState<0 | 1 | 2>(fresh ? 2 : 0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const celebrate = useCallback((kind: 1 | 2) => {
    setParty(kind);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setParty(0), kind === 2 ? 1800 : 1300);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (!ping && !fresh) return;
    flash.set(withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: fresh ? 1400 : 700 })));
    // a freshly built card mounts with the party already on: only its end needs scheduling
    if (fresh && !timer.current) timer.current = setTimeout(() => setParty(0), 1800);
  }, [ping, fresh, flash]);

  const onBought = useCallback(
    (_n: number, crossed: boolean) => {
      flash.set(withSequence(withTiming(1, { duration: 40 }), withTiming(0, { duration: crossed ? 900 : 320 })));
      if (crossed) {
        celebrate(1);
        toast(t("milestoneToast", { deck: tr(def.name) }), { tone: "good", icon: def.icon });
      }
    },
    [flash, celebrate, t, tr, def],
  );
  const open = useCallback(() => onOpen(id), [onOpen, id]);
  const toCrew = useCallback(() => {
    if (s.crewOn) goTo("crew");
    else {
      deny();
      toast(t("manager.locked"), "info");
    }
  }, [s.crewOn, t]);

  const glow = useAnimatedStyle(() => ({ opacity: flash.value }));
  const stalled = s.status !== "ok";
  const hint = useMemo(() => {
    if (s.msLevel > 0) return "";
    const g = getGame();
    if (id === "hangar") return t("perLevel.hangar", { n: (Math.floor(s.level / Math.max(1, bal(g, "hangarDronesEvery", 4))) + 1) * Math.max(1, bal(g, "hangarDronesEvery", 4)) });
    if (id === "quarters") return t("perLevel.quarters", { n: (Math.floor(s.level / Math.max(1, bal(g, "quartersCrewEvery", 5))) + 1) * Math.max(1, bal(g, "quartersCrewEvery", 5)) });
    if (id === "reactor") return t("perLevel.reactor", { n: def.base });
    if (id === "bridge") return t("perLevel.bridge", { n: Math.round(bal(g, "bridgeSellPerLevel", 0.02) * 100) });
    return t("perLevel.observatory");
  }, [s.msLevel, s.level, id, t, def]);
  const pips = s.cardsOn ? s.cards.split("|") : null;

  return (
    <Pressable
      testID={`deck-${id}`}
      onPress={open}
      accessible={false}
      style={[styles.card, { backgroundColor: theme.plate, borderTopColor: theme.id === "day" ? "#FFFFFF" : theme.bodyHi, borderBottomColor: theme.bodyLo }]}
    >
      <View style={styles.left}>
        <Icon name={def.icon} size={24} chip />
        <Pressable testID={`manager-${id}`} onPress={toCrew} hitSlop={6} accessibilityRole="button" accessibilityLabel={t("manager.a11y")} style={styles.manager}>
          {s.manager ? (
            <Portrait seed={s.manager} size={32} />
          ) : (
            <View style={[styles.managerEmpty, { borderColor: theme.inkDim }]}>
              <Icon name={s.crewOn ? "crew" : "lock"} size={16} color="inkDim" />
            </View>
          )}
        </Pressable>
      </View>

      <View style={styles.mid}>
        <View style={styles.nameRow}>
          <Led state={s.status === "blocked" ? "blink" : "on"} color={s.status === "blocked" ? "red" : stalled ? "orange" : "mint"} size={5} />
          <Txt variant="bodyBold" numberOfLines={1} style={styles.name}>
            {tr(def.name)}
          </Txt>
          <MicroLabel size="label" color="ink">
            {t("lv", { n: s.level })}
          </MicroLabel>
        </View>
        <Lcd padding={3}>
          <View style={styles.lcdRow}>
            <LcdNumber text={s.out} value={s.outN} size="m" align="left" tone={stalled ? "warn" : "normal"} ghost={false} />
            <View style={styles.unit}>
              <LcdText size="s" tone={stalled ? "warn" : "dim"} align="right" upper={stalled}>
                {stalled ? t(`status.${s.status}`) : tr(def.unit)}
              </LcdText>
            </View>
          </View>
        </Lcd>
        <View style={styles.msRow}>
          {s.msLevel > 0 ? (
            <>
              <LedRow steps={16} progress={s.msProg} chase={party > 0} color={party === 2 ? "mint" : party === 1 ? "yellow" : "orange"} size={5} style={styles.leds} />
              <MicroLabel color="ink">{t("ms", { n: s.msLevel })}</MicroLabel>
            </>
          ) : (
            <MicroLabel style={styles.leds}>{hint}</MicroLabel>
          )}
          {pips ? (
            <View style={styles.pips}>
              {[0, 1].map((i) => (
                <View key={i} style={[styles.pip, { backgroundColor: pips[i] ? QUALITY_COLORS[Math.min(4, Number(pips[i]) + 1)] : theme.ledOff, opacity: pips[i] ? 1 : 0.5 }]} />
              ))}
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.right}>
        <View style={styles.costRow}>
          <CostTag icon="coin" amount={s.costText} affordable={s.afford} size="sm" boxed />
          <Led level={flash} color={party === 1 ? "yellow" : "mint"} size={6} />
        </View>
        <BuyKey testID={`buy-${id}`} id={id} levels={s.levels} width={KEY_W} onBought={onBought} />
      </View>
      <Animated.View pointerEvents="none" style={[styles.glow, { borderColor: party === 1 ? theme.yellow : party === 2 ? theme.mint : theme.orange }, glow]} />
    </Pressable>
  );
});

// ---------- locked decks ----------------------------------------------------------------------

export const ReqChip = memo(function ReqChip({ r }: { r: Requirement }) {
  const t = useT("ship");
  const theme = useTheme();
  const icon = r.kind === "item" ? (r.item as string) : r.kind === "deck" ? `deck_${r.deck}` : "book";
  const text = r.kind === "item" ? `${r.have}/${r.need}` : r.kind === "deck" ? t("lvNeed", { have: r.have, need: r.need }) : t("chapterNeed", { n: r.need });
  return (
    <View style={styles.req}>
      <View style={[styles.reqIcon, { backgroundColor: theme.bezel }]}>
        <Icon name={icon} size={16} />
      </View>
      <Txt variant="label" color={r.ok ? "ink" : "bad"} numberOfLines={1} tabular>
        {text}
      </Txt>
    </View>
  );
});

export function useLockInfo(id: DeckId): { costText: string; pay: boolean; can: boolean; reqs: Requirement[] } {
  const fmt = useFmt();
  const s = useGame(
    (g) => {
      const reqs = requirements(g, id);
      let sig = "";
      for (const r of reqs) sig += `${r.have}:`;
      return { costText: fmt(unlockCost(g, id)), pay: canPay(g, id), can: canUnlockDeck(g, id).ok, sig };
    },
    undefined,
    2,
  );
  // the signature changes whenever a requirement's progress does
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reqs = useMemo(() => requirements(getGame(), id), [id, s.sig]);
  return { costText: s.costText, pay: s.pay, can: s.can, reqs };
}

export interface UnlockKeyProps {
  id: DeckId;
  can: boolean;
  width?: number;
  flex?: number;
  onBuilt: (id: DeckId) => void;
}

export const UnlockKey = memo(function UnlockKey({ id, can, width, flex, onBuilt }: UnlockKeyProps) {
  const t = useT("ship");
  const tr = useTr();
  const press = useCallback(
    (e: GestureResponderEvent) => {
      const res = act((g) => unlockDeck(g, id));
      if (!res.ok) {
        deny();
        toast(t(`lock.fail.${res.reason === "items" || res.reason === "requirement" ? res.reason : "credits"}`), "warn");
        return;
      }
      sfx("levelUp");
      haptic("success");
      popAt(e, t("lock.builtPop"), "good");
      toast(t("lock.built", { deck: tr(content.decks[id].name) }), { tone: "good", icon: content.decks[id].icon });
      onBuilt(id);
    },
    [id, onBuilt, t, tr],
  );
  return (
    <Key
      testID={`unlock-${id}`}
      label={t("lock.build")}
      icon={can ? "unlock" : "lock"}
      tone={can ? "orange" : "black"}
      width={width}
      flex={flex}
      onPress={press}
      sound={can ? "keyDown" : null}
      style={can ? undefined : styles.dim}
    />
  );
});

export const LockedCard = memo(function LockedCard({ id, onOpen, onBuilt }: { id: DeckId; onOpen: (id: DeckId) => void; onBuilt: (id: DeckId) => void }) {
  const theme = useTheme();
  const t = useT("ship");
  const tr = useTr();
  const def = content.decks[id];
  const info = useLockInfo(id);
  const open = useCallback(() => onOpen(id), [onOpen, id]);
  return (
    <Pressable
      testID={`locked-${id}`}
      onPress={open}
      accessible={false}
      style={[styles.card, styles.locked, { backgroundColor: theme.well, borderColor: info.can ? theme.orange : theme.rule }]}
    >
      <View style={styles.left}>
        <Icon name={def.icon} size={24} chip />
        <Icon name={info.can ? "unlock" : "lock"} size={16} color="inkDim" style={styles.lockIcon} />
      </View>
      <View style={styles.mid}>
        <View style={styles.nameRow}>
          <Txt variant="bodyBold" numberOfLines={1} style={styles.name}>
            {tr(def.name)}
          </Txt>
          <Badge label={info.can ? t("lock.ready") : t("lock.badge")} tone={info.can ? "orange" : "neutral"} style={styles.badge} />
        </View>
        <Txt variant="label" color="inkDim" numberOfLines={info.reqs.length > 2 ? 1 : info.reqs.length > 0 ? 2 : 3} style={styles.desc}>
          {tr(def.desc)}
        </Txt>
        {info.reqs.length > 0 ? (
          <View style={styles.reqRow}>
            {info.reqs.map((r, i) => (
              <ReqChip key={i} r={r} />
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.right}>
        <View style={styles.costRow}>
          <CostTag icon="coin" amount={info.costText} affordable={info.pay} size="sm" boxed />
        </View>
        <UnlockKey id={id} can={info.can} width={KEY_W} onBuilt={onBuilt} />
      </View>
    </Pressable>
  );
});

export const TeaserCard = memo(function TeaserCard({ id, onOpen }: { id: DeckId; onOpen: (id: DeckId) => void }) {
  const theme = useTheme();
  const tr = useTr();
  const fmt = useFmt();
  const def = content.decks[id];
  const cost = useGame((g) => fmt(unlockCost(g, id)), undefined, 10);
  const open = useCallback(() => onOpen(id), [onOpen, id]);
  return (
    <Pressable testID={`teaser-${id}`} onPress={open} accessibilityRole="button" accessibilityLabel={tr(def.name)} style={[styles.teaser, { borderColor: theme.rule }]}>
      <Icon name="lock" size={16} color="inkDim" />
      <Icon name={def.icon} size={16} chip />
      <MicroLabel size="label" style={styles.name}>
        {tr(def.name)}
      </MicroLabel>
      <CostTag icon="coin" amount={cost} size="sm" style={styles.teaserCost} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { height: CARD_H, borderRadius: 6, borderTopWidth: 1, borderBottomWidth: 1, padding: space.sm, flexDirection: "row", gap: space.sm },
  locked: { borderWidth: 1, borderStyle: "dashed" },
  left: { width: 36, alignItems: "center", gap: 6 },
  manager: { width: 36, height: 34, alignItems: "center", justifyContent: "center" },
  managerEmpty: { width: 32, height: 32, borderRadius: 4, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center", opacity: 0.7 },
  lockIcon: { marginTop: 6 },
  mid: { flex: 1, minWidth: 0, justifyContent: "space-between" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5, height: 19 },
  name: { flex: 1, minWidth: 0 },
  badge: { alignSelf: "center" },
  lcdRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  unit: { flex: 1, minWidth: 0, alignItems: "flex-end" },
  msRow: { flexDirection: "row", alignItems: "center", gap: 6, height: 14 },
  leds: { flex: 1, minWidth: 0 },
  pips: { flexDirection: "row", gap: 2 },
  pip: { width: 5, height: 9, borderRadius: 1 },
  right: { width: KEY_W, justifyContent: "space-between" },
  costRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 24 },
  keyBody: { flexDirection: "row", alignItems: "center", gap: 6 },
  keyNum: { fontSize: 15, lineHeight: 18 },
  keySub: { marginTop: -2, opacity: 0.8 },
  dim: { opacity: 0.5 },
  glow: { position: "absolute", left: 0, right: 0, top: -1, bottom: -1, borderRadius: 6, borderWidth: 2 },
  desc: { lineHeight: 13 },
  reqRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 2, overflow: "hidden" },
  req: { flexDirection: "row", alignItems: "center", gap: 3 },
  reqIcon: { width: 20, height: 20, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  teaserCost: { alignSelf: "center" },
  teaser: { height: TEASER_H, borderRadius: 6, borderWidth: 1, borderStyle: "dashed", paddingHorizontal: space.sm, flexDirection: "row", alignItems: "center", gap: space.sm, opacity: 0.6 },
});
