// The game route: the main menu first, then the game. The root layout has already loaded the save
// played last; the guard below covers arriving here from a preview route.
import { useEffect } from "react";
import { BackHandler } from "react-native";

import { getLaunchStatus } from "@/platform/crashGuard";
import { GameScreen } from "@/ui/shell/GameScreen";
import { MainMenu } from "@/ui/shell/MainMenu";
import { ensureBooted } from "@/ui/shell/boot";
import { backToMenu } from "@/ui/shell/session";
import { useShell } from "@/ui/shell/store";

export default function Game() {
  ensureBooted();
  const menu = useShell((s) => s.menu);
  // Android back key: from the game it returns to the main menu (saving first); from the menu it
  // leaves the app as usual. Open sheets and dialogs handle back themselves before this is reached.
  useEffect(() => {
    if (menu) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      backToMenu();
      return true;
    });
    return () => sub.remove();
  }, [menu]);
  return menu ? <MainMenu /> : <GameScreen safeMode={getLaunchStatus().safeMode} />;
}
