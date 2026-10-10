// Minimal root layout for isolated preview roots (scripts/preview/isolated.mjs): fonts, gesture
// root and safe area, without the real game boot, crash guard or save handling.
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import "@/i18n";
import { fontAssets } from "@/ui/fonts";

export default function DevLayout() {
  const [loaded, error] = useFonts(fontAssets);
  if (!loaded && !error) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#05060A" }}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#05060A" } }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
