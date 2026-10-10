// Phase 0 spike: Skia canvas + SkSL shader + Reanimated + bundled Czech-capable fonts + haptics.
// Replaced by the real game shell in Phase 2.
import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import LiteCanvas from "@/render/lite/SpikeCanvas";
import { loadSkiaModule } from "@/render/loadSkia";
import { getRenderMode } from "@/render/mode";
import { fonts } from "@/ui/fonts";

type CanvasProps = { width: number; height: number };
const mode = getRenderMode();
const SpikeCanvas: React.ComponentType<CanvasProps> = (mode === "skia" ? loadSkiaModule<CanvasProps>() : null) ?? LiteCanvas;

export default function Spike() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const viewportHeight = Math.round(height * 0.48);
  const led = useSharedValue(0.2);
  const press = useSharedValue(0);

  useEffect(() => {
    led.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [led]);

  const ledStyle = useAnimatedStyle(() => ({ opacity: led.value }));
  const keyStyle = useAnimatedStyle(() => ({ transform: [{ translateY: press.value * 4 }] }));

  return (
    <View style={{ flex: 1, backgroundColor: "#07090F" }}>
      <SpikeCanvas width={width} height={viewportHeight} />
      <View style={{ flex: 1, backgroundColor: "#E7E3D8", padding: 16, paddingBottom: insets.bottom + 16, gap: 14 }}>
        <View style={{ backgroundColor: "#10140F", borderRadius: 6, padding: 12 }}>
          <Text style={{ fontFamily: fonts.lcd, fontSize: 28, color: "#B7F5C0" }}>1 234 567 ČR</Text>
          <Text style={{ fontFamily: fonts.lcdDim, fontSize: 14, color: "#6FAE7A" }}>TRUP DRŽÍ: ZATÍM</Text>
        </View>
        <Text style={{ fontFamily: fonts.pixelBold, fontSize: 22, color: "#15171C" }}>Duct Tape Odyssey</Text>
        <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: "#3A3D45" }}>
          Příliš žluťoučký kůň úpěl ďábelské ódy. ěščřžýáíéúůďťňó · render: {mode}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Animated.View style={[{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#FF6A1A" }, ledStyle]} />
          <Pressable
            onPressIn={() => {
              press.value = withTiming(1, { duration: 40 });
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            }}
            onPressOut={() => {
              press.value = withSpring(0);
            }}
          >
            <Animated.View style={[{ backgroundColor: "#15171C", borderRadius: 8, paddingHorizontal: 22, paddingVertical: 16 }, keyStyle]}>
              <Text style={{ fontFamily: fonts.monoBold, fontSize: 13, color: "#F4F1E8" }}>KLEPNI · HAPTIKA</Text>
            </Animated.View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
