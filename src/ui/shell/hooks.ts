import { useEffect, useRef } from "react";
import { Easing, ReduceMotion, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

import type { Game } from "@/engine/types";
import { getGame, hasGame, onPulse } from "@/store/game";

/**
 * A shared value that follows a number in the game at the engine pulse rate and glides between
 * samples on the UI thread. Nothing re-renders: this is how gauges and meters stay off React state.
 */
export function usePulseValue(select: (g: Game) => number, glideMs = 110): SharedValue<number> {
  const sel = useRef(select);
  sel.current = select;
  const value = useSharedValue(hasGame() ? select(getGame()) : 0);
  useEffect(() => {
    let prev = NaN;
    const sample = () => {
      if (!hasGame()) return;
      const next = sel.current(getGame());
      if (next === prev || !Number.isFinite(next)) return;
      prev = next;
      value.set(withTiming(next, { duration: glideMs, easing: Easing.linear, reduceMotion: ReduceMotion.Never }));
    };
    sample();
    return onPulse(sample);
  }, [glideMs, value]);
  return value;
}
