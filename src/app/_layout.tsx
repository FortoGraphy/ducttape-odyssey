// Root layout: crash guard first, then fonts, settings-driven services, the guarded game boot and
// the providers every screen needs. Nothing in here may prevent the game from showing.
import { useFonts } from "expo-font";
import { SplashScreen, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import "@/i18n";
import { beginLaunch, type LaunchStatus } from "@/platform/crashGuard";
import { setRuntimeRenderOverride } from "@/render/mode";
import type { BootResult } from "@/store/game";
import { useSettings } from "@/store/settings";
import { fontAssets } from "@/ui/fonts";
import { NumberPopHost, ThemeProvider, ToastHost } from "@/ui/kit";
import { BootNotices, RootBoundary, ensureBooted, guard, useAppLifecycle, useServices } from "@/ui/shell/boot";
import { useShell } from "@/ui/shell/store";

const BACKDROP = "#07090F";
const FONT_WAIT_MS = 4000;

// Before anything risky is evaluated or mounted.
const launch: LaunchStatus = guard("crash guard", () => beginLaunch(), { safeMode: false, auto: false, fails: 0, lastError: null });
if (launch.safeMode) {
  guard("safe mode", () => setRuntimeRenderOverride("lite"), undefined);
  useShell.setState({ safeBanner: true });
}
guard("splash", () => {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}, undefined);

const isGameRoute = (path: string): boolean => path === "/" || path === "" || path === "/index";

export default function RootLayout() {
  const [loaded, error] = useFonts(fontAssets);
  const [waited, setWaited] = useState(false);
  const theme = useSettings((s) => s.theme);
  const pathname = usePathname();
  const game = isGameRoute(pathname);
  const ready = loaded || !!error || waited;

  useServices();
  useAppLifecycle();

  // a font that never resolves must not keep the splash screen up forever
  useEffect(() => {
    const id = setTimeout(() => setWaited(true), FONT_WAIT_MS);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // The real game boots only for the game route: preview routes bring their own preset game.
  const [boot, setBoot] = useState<BootResult | null>(null);
  if (ready && game && boot === null) setBoot(ensureBooted());

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: BACKDROP }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <ThemeProvider theme={theme}>
          <RootBoundary>
            <Stack screenOptions={{ headerShown: false, animation: "none", contentStyle: { backgroundColor: BACKDROP } }} />
            {game ? <BootNotices result={boot} /> : null}
            <ToastHost />
            <NumberPopHost />
          </RootBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
