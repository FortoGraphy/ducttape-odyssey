// One module as a tile: family icon, mark pips, quality-colored frame, integrity bar and state LED.
// The same tile is used on the grid, in the tray and in the repair lists.
import { memo, useEffect } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";

import { content } from "@/content";
import type { ItemId } from "@/engine/types";
import { Icon, Led, QUALITY_COLORS, Txt, springTo, timingTo, useTheme } from "@/ui/kit";
import { palette } from "@/ui/theme";

import { modState } from "./model";

export interface ModuleTileProps {
  item: ItemId;
  q: number;
  hp: number;
  size?: number;
  /** Working same-family neighbours: prints the adjacency bonus. */
  adjBonus?: number;
  selected?: boolean;
  /** Change it to play the seating animation. */
  seat?: number;
  ghost?: boolean;
}

export const ModuleTile = memo(function ModuleTile({ item, q, hp, size = 52, adjBonus = 0, selected, seat = 0, ghost }: ModuleTileProps) {
  const theme = useTheme();
  const spec = content.items[item]?.module;
  const state = modState(hp);
  const scale = useSharedValue(1);
  const flash = useSharedValue(0);

  useEffect(() => {
    if (!seat) return;
    scale.set(1.2);
    scale.set(springTo(1, "key"));
    flash.set(0.9);
    flash.set(timingTo(0, "slow"));
  }, [seat, scale, flash]);

  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const icon = size >= 50 ? 24 : 16;
  const barColor = state === "ok" ? theme.mint : state === "degraded" ? theme.yellow : theme.red;
  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: selected ? theme.orange : QUALITY_COLORS[Math.max(0, Math.min(4, q))],
          backgroundColor: theme.key,
          padding: 2,
          justifyContent: "space-between",
          opacity: ghost ? 0.45 : 1,
        },
        bodyStyle,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 10 }}>
        <View style={{ flexDirection: "row", gap: 1 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <View key={n} style={{ width: 3, height: 5, borderRadius: 0.5, backgroundColor: spec && n <= spec.mk ? palette.bone1 : theme.keyHi }} />
          ))}
        </View>
        {state !== "ok" ? (
          <Led state={state === "offline" ? "blink" : "on"} color={state === "offline" ? "red" : "yellow"} size={5} />
        ) : adjBonus > 0 ? (
          <Txt variant="micro" color={palette.mint} style={{ fontSize: 7.5, lineHeight: 10, letterSpacing: 0 }}>
            {`+${Math.round(adjBonus * 100)}`}
          </Txt>
        ) : null}
      </View>
      <View style={{ alignItems: "center", opacity: state === "offline" ? 0.4 : 1 }}>
        <Icon name={spec ? `fam_${spec.family}` : "question"} size={icon} />
      </View>
      <View style={{ height: 4, borderRadius: 1, backgroundColor: theme.keyLo, overflow: "hidden" }}>
        <View style={{ width: `${Math.max(0, Math.min(100, hp))}%`, height: 4, backgroundColor: barColor }} />
      </View>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, borderRadius: 4, backgroundColor: palette.bone2 }, flashStyle]} />
    </Animated.View>
  );
});
