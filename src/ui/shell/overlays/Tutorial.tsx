// Coach tutorial: six short steps after the intro, one card at a time above the Control Deck with
// a highlight around the area it talks about. Each step completes when the player actually does
// the thing (read from game state, never from a timer). It never blocks play and can be skipped.
import { memo, useCallback, useEffect, useRef } from "react";
import { View } from "react-native";
import Animated, { Easing, ReduceMotion, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import * as B from "@/engine/big";
import { spawnSalvage, unlockCost } from "@/engine/core";
import type { Game } from "@/engine/types";
import { useT } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { act, getGame, hasGame, onPulse, useGame } from "@/store/game";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";
import { Icon, Key, KeyRow, Led, MicroLabel, toast, Txt, useReduceMotion, useTheme } from "@/ui/kit";
import { palette, radius, space } from "@/ui/theme";

import { TUTORIAL_STEPS, useShell } from "../store";

type TFn = (key: string, vars?: Record<string, unknown>) => string;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TutorialRects {
  viewport: Rect;
  goals: Rect;
  content: Rect;
  craftTab: Rect;
  /** The card sits above this line (the top of the viewport's control row). */
  cardBottom: number;
  /** Space to keep free on the right (the Control Deck in the side-by-side layout). */
  cardRight?: number;
}

interface Baseline {
  step: number;
  purchases: number;
  salvage: number;
  nonce: number;
}

const HOLD_HEAT = 12;
const EVENT_QUIET_S = 90;

function stepDone(step: number, g: Game, base: Baseline): boolean {
  const s = g.state;
  if (base.step !== step) return false;
  switch (step) {
    case 0:
      return (s.stats.purchases ?? 0) > base.purchases;
    case 1:
      return s.active.mining && s.active.heat >= HOLD_HEAT;
    case 2:
      return (s.stats.salvage ?? 0) > base.salvage;
    case 3:
      return useUi.getState().nonce !== base.nonce;
    case 4:
      return s.decks.refinery.level >= 1 && useUi.getState().tab === "craft";
    default:
      return false;
  }
}

/** Starts the tutorial for a new player; a save that is clearly past the basics is marked done. */
export function useTutorialStart(quiet: boolean): void {
  const done = useSettings((s) => s.tutorialDone);
  const step = useShell((s) => s.tutorial);
  useEffect(() => {
    if (done || step >= 0 || !quiet || !hasGame()) return;
    const s = getGame().state;
    // the sandbox has no tutorial and must not mark the story tutorial as done either
    if (s.flags.sandbox > 0) return;
    if ((s.stats.purchases ?? 0) > 25 || s.decks.refinery.level > 0) useSettings.getState().set("tutorialDone", true);
    else useShell.getState().setTutorial(0);
  }, [done, step, quiet]);
}

const Highlight = memo(function Highlight({ rect }: { rect: Rect }) {
  const reduce = useReduceMotion();
  const v = useSharedValue(0.6);
  useEffect(() => {
    if (!reduce) v.set(withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.Never }), -1, true));
    return () => cancelAnimation(v);
  }, [reduce, v]);
  const style = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * v.value }));
  return <Animated.View pointerEvents="none" style={[{ position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: radius.well + 2, borderWidth: 2, borderColor: palette.orange }, style]} />;
});

export const Tutorial = memo(function Tutorial({ rects, visible }: { rects: TutorialRects; visible: boolean }) {
  const t = useT("world") as TFn;
  const theme = useTheme();
  const step = useShell((s) => s.tutorial);
  const base = useRef<Baseline>({ step: -1, purchases: 0, salvage: 0, nonce: 0 });

  // baselines are taken when a step begins, so only what the player does from now on counts
  useEffect(() => {
    if (step < 0 || !hasGame()) return;
    const s = getGame().state;
    base.current = { step, purchases: s.stats.purchases ?? 0, salvage: s.stats.salvage ?? 0, nonce: useUi.getState().nonce };
  }, [step]);

  // Upkeep once a second: there is always a piece of salvage to tap on step 3 (placed clear of the
  // card), and no event interrupts the first three steps.
  useEffect(() => {
    if (step < 0 || step > 2) return;
    let n = 0;
    const tick = () => {
      if (n++ % 10 !== 0 || !hasGame()) return;
      const g = getGame();
      const s = g.state;
      if (s.events.nextAt < s.t + EVENT_QUIET_S / 2) s.events.nextAt = s.t + EVENT_QUIET_S;
      if (step === 2 && s.active.salvage.length === 0) {
        act((gg) => {
          const uid = spawnSalvage(gg);
          const blob = gg.state.active.salvage.find((b) => b.uid === uid);
          if (blob) {
            blob.x = 0.3 + blob.x * 0.4;
            blob.y = 0.14 + blob.y * 0.2;
          }
        });
      }
    };
    tick();
    return onPulse(tick);
  }, [step]);

  const done = useGame((g) => stepDone(step, g, base.current));
  const built = useGame((g) => g.state.decks.refinery.level >= 1, undefined, 5);
  const next = useCallback(() => {
    const cur = useShell.getState().tutorial;
    if (cur < 0) return;
    sfx("beepGood");
    haptic("success");
    if (cur >= TUTORIAL_STEPS - 1) {
      useSettings.getState().set("tutorialDone", true);
      useShell.getState().setTutorial(-1);
    } else {
      useShell.getState().setTutorial(cur + 1);
    }
  }, []);
  const skip = useCallback(() => {
    sfx("uiClose");
    useSettings.getState().set("tutorialDone", true);
    useShell.getState().setTutorial(-1);
  }, []);
  useEffect(() => {
    if (done) next();
  }, [done, next]);
  // The refinery step must be doable the moment it is shown: the deck costs more than a new player
  // has, so KIPP covers the difference once. Without this the build key could only refuse.
  useEffect(() => {
    if (step !== 4 || !hasGame()) return;
    const granted = act((g) => {
      if (g.state.decks.refinery.level > 0 || g.state.flags.tutorialLoan) return false;
      const cost = unlockCost(g, "refinery");
      if (B.gte(g.state.credits, cost)) return false;
      g.state.credits = B.mulN(cost, 1.05);
      g.state.flags.tutorialLoan = 1;
      return true;
    });
    if (granted) {
      sfx("coin");
      toast(t("tutorial.loan"), { tone: "good", icon: "coin" });
    }
  }, [step, t]);

  if (step < 0 || !visible) return null;

  const last = step >= TUTORIAL_STEPS - 1;
  const target: Rect | null = step === 0 ? rects.content : step === 1 || step === 2 ? rects.viewport : step === 3 ? rects.goals : step === 4 ? (built ? rects.craftTab : rects.content) : null;
  const up = step === 1 || step === 2;
  const text = step === 4 ? t(built ? "tutorial.step5b" : "tutorial.step5a") : t(`tutorial.step${step + 1}`);
  // the caret leans toward the craft tab key on the step that points at it
  const caretLeft = step === 4 && built ? rects.craftTab.x + rects.craftTab.w / 2 - space.md - 7 : 28;

  return (
    <>
      {target ? <Highlight rect={target} /> : null}
      <View pointerEvents="box-none" style={{ position: "absolute", left: space.md, right: space.md + (rects.cardRight ?? 0), top: 0, height: rects.cardBottom, justifyContent: "flex-end" }}>
        <View testID="tutorial-card" accessibilityRole="alert" style={{ backgroundColor: theme.body, borderRadius: radius.panel - 4, borderTopWidth: 1, borderTopColor: theme.bodyHi, borderBottomWidth: 2, borderBottomColor: theme.bodyLo, padding: space.sm, gap: space.xs, boxShadow: `0px 3px 4px ${theme.shadow}` }}>
          <View pointerEvents="none" style={{ position: "absolute", left: caretLeft, width: 14, height: 14, backgroundColor: theme.body, transform: [{ rotate: "45deg" }], ...(up ? { top: -6 } : { bottom: -6 }) }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Icon name="kipp" size={24} chip />
            <View style={{ flex: 1 }}>
              <Txt variant="heading" numberOfLines={1} style={{ fontSize: 14, lineHeight: 18 }}>
                {t(`tutorial.title${step + 1}`)}
              </Txt>
              <MicroLabel testID="tutorial-counter">{t("tutorial.counter", { n: step + 1, total: TUTORIAL_STEPS })}</MicroLabel>
            </View>
            <View style={{ flexDirection: "row", gap: 3 }}>
              {Array.from({ length: TUTORIAL_STEPS }, (_, i) => (
                <Led key={i} on={i <= step} color={i < step ? "mint" : "orange"} size={5} />
              ))}
            </View>
          </View>
          <Txt variant="body" style={{ fontSize: 12, lineHeight: 17 }}>
            {text}
          </Txt>
          <KeyRow>
            {last ? null : <Key label={t("tutorial.skip")} size="sm" onPress={skip} sound={null} testID="tutorial-skip" />}
            {step === 3 || last ? <Key label={t(last ? "tutorial.done" : "tutorial.ok")} tone="orange" size="sm" onPress={next} sound={null} testID="tutorial-ok" /> : null}
          </KeyRow>
        </View>
      </View>
    </>
  );
});
