// Guarded door to src/audio: the audio module is loaded lazily and every call is wrapped, so a
// broken player, a missing asset or an unsupported platform can never stop the game from showing.
type AudioModule = typeof import("@/audio");

let mod: AudioModule | null | undefined;

function audio(): AudioModule | null {
  if (mod === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require("@/audio") as AudioModule;
    } catch (e) {
      console.warn("audio unavailable", e);
      mod = null;
    }
  }
  return mod;
}

function safe(fn: (a: AudioModule) => void): void {
  const a = audio();
  if (!a) return;
  try {
    fn(a);
  } catch (e) {
    console.warn("audio call failed", e);
  }
}

export type MusicScene = "drift" | "work" | "tension" | "wonder" | "station" | "minigame";

export const startAudio = (opts: { sfxVolume: number; musicVolume: number; musicEnabled: boolean }): void =>
  safe((a) => {
    a.initAudio({ ...opts, scene: "drift", intensity: 0.2 }).catch(() => {});
  });
export const stopAudio = (): void => safe((a) => a.shutdownAudio());
export const musicScene = (scene: MusicScene | null): void => safe((a) => a.setScene(scene));
export const musicIntensity = (x: number): void => safe((a) => a.setIntensity(x));
export const musicEnabled = (on: boolean): void => safe((a) => a.setMusicEnabled(on));
export const musicVolume = (v: number): void => safe((a) => a.setMusicVolume(v));
export const sfxVolume = (v: number): void => safe((a) => a.setSfxVolume(v));
