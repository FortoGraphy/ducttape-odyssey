// Audio entry point. Call initAudio() once at startup (it never throws and never blocks the
// game on failure) and shutdownAudio() on teardown. UI code plays effects through
// platform/feedback's sfx(), not through this module.
import { initMusic, setIntensity, setMusicEnabled, setMusicVolume, setScene, shutdownMusic } from "./music";
import type { MusicSceneId } from "./manifest.generated";
import { audioWarn, initSfx, setSfxVolume, shutdownSfx } from "./player";

export { MINIGAME_BPM, MUSIC_SCENE_IDS, MUSIC_SCENES, SFX_DURATION_MS } from "./manifest.generated";
export type { MusicSceneDef, MusicSceneId } from "./manifest.generated";
export { getSfxVolume, isAudioLive, onAudioLive, playSfx, preloadSfx, setSfxVolume } from "./player";
export {
  getIntensity,
  getMusicClock,
  getMusicVolume,
  getScene,
  isMusicEnabled,
  setIntensity,
  setMusicEnabled,
  setMusicVolume,
  setScene,
} from "./music";
export type { MusicClock, MusicFadeOptions } from "./music";

export interface AudioInitOptions {
  sfxVolume?: number;
  musicVolume?: number;
  musicEnabled?: boolean;
  /** Scene to start with. Default "drift". Pass null to start silent. */
  scene?: MusicSceneId | null;
  intensity?: number;
}

let started: Promise<void> | null = null;

/** Sets up the audio session, the sfx backend and the music. Safe to call more than once. */
export function initAudio(opts: AudioInitOptions = {}): Promise<void> {
  if (started) return started;
  started = (async () => {
    try {
      if (opts.sfxVolume !== undefined) setSfxVolume(opts.sfxVolume);
      if (opts.musicVolume !== undefined) setMusicVolume(opts.musicVolume);
      if (opts.musicEnabled !== undefined) setMusicEnabled(opts.musicEnabled);
      if (opts.intensity !== undefined) setIntensity(opts.intensity, { fadeMs: 0 });
      setScene(opts.scene === undefined ? "drift" : opts.scene);
      await initSfx();
      initMusic();
    } catch (e) {
      audioWarn("init", e);
    }
  })();
  return started;
}

/** Stops everything and releases every native player. initAudio() may be called again afterwards. */
export function shutdownAudio(): void {
  try {
    shutdownMusic();
    shutdownSfx();
  } catch (e) {
    audioWarn("shutdown", e);
  }
  started = null;
}
