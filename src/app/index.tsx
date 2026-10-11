// The game. The root layout has already booted it; the guard below covers arriving here from a
// preview route, where no real game exists yet.
import { getLaunchStatus } from "@/platform/crashGuard";
import { GameScreen } from "@/ui/shell/GameScreen";
import { ensureBooted } from "@/ui/shell/boot";

export default function Game() {
  ensureBooted();
  return <GameScreen safeMode={getLaunchStatus().safeMode} />;
}
