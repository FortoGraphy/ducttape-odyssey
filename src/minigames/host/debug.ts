// Test hook for the gallery route (src/app/minigames.tsx). Off in the real game: a game publishes
// its layout here only while `on` is set, so automated tests can drive it with real pointer input.
export const mgDebug: { on: boolean; data: Record<string, unknown> } = { on: false, data: {} };

export function mgPublish(key: string, value: unknown): void {
  if (mgDebug.on) mgDebug.data[key] = value;
}
