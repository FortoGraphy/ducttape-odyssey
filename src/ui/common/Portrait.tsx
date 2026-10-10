// Crew portrait composited from seeded pixel-art layers (assets/portraits, generated manifest).
// Parts are 32x32 grids exported at 96 px, so 32 pt is pixel-perfect on a @3x screen; other sizes
// are scaled by the system. Shared by ship, crew, nav and story screens. Owned by the orchestrator.
import { memo, useMemo } from "react";
import { Image, Platform, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";

import { portraitLayers, portraitParts, portraits } from "@/ui/portraits.generated";
import { palette } from "@/ui/theme";

const pixelated = (Platform.OS === "web" ? { imageRendering: "pixelated" } : null) as ImageStyle | null;
const layers = portraits.layers as unknown as Record<string, readonly number[]>;

export const Portrait = memo(function Portrait({ seed, size = 32, style }: { seed: number; size?: number; style?: StyleProp<ViewStyle> }) {
  const parts = useMemo(() => portraitParts(seed), [seed]);
  return (
    <View style={[{ width: size, height: size, borderRadius: Math.max(3, Math.round(size / 8)), overflow: "hidden", backgroundColor: palette.void3 }, style]}>
      {portraitLayers.map((layer, i) => {
        const source = layers[layer]?.[parts[i]];
        return source ? <Image key={layer} source={source} fadeDuration={0} style={[{ position: "absolute", left: 0, top: 0, width: size, height: size }, pixelated]} /> : null;
      })}
    </View>
  );
});
