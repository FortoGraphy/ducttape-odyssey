// Logic test of src/audio against a fake expo-audio (pools, fades, cross-fade, sync, app state,
// failure isolation). Run: npx vitest run --config .scratch/audio/vitest.config.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Fake {
  source: number;
  options: Record<string, unknown>;
  volume: number;
  loop: boolean;
  shouldCorrectPitch: boolean;
  isLoaded: boolean;
  playing: boolean;
  removed: boolean;
  plays: number;
  pauses: number;
  seeks: number[][];
  rate: number;
  offset: number; // position when last started
  startedAt: number;
  duration: number;
  readonly currentTime: number;
  play(): void;
  pause(): void;
  seekTo(...a: number[]): Promise<void>;
  setPlaybackRate(r: number): void;
  remove(): void;
}

const h = vi.hoisted(() => ({
  players: [] as Fake[],
  failCreate: false,
  failPlay: false,
  appListeners: [] as ((s: string) => void)[],
  platform: "ios",
  mode: null as unknown,
}));

vi.mock("expo-audio", () => ({
  setAudioModeAsync: async (m: unknown) => {
    h.mode = m;
  },
  createAudioPlayer: (source: number, options: Record<string, unknown>) => {
    if (h.failCreate) throw new Error("no audio hardware");
    const created = Date.now();
    const p: Fake = {
      source,
      options,
      volume: 1,
      loop: false,
      shouldCorrectPitch: true,
      get isLoaded() {
        return Date.now() - created >= 30;
      },
      playing: false,
      removed: false,
      plays: 0,
      pauses: 0,
      seeks: [],
      rate: 1,
      offset: 0,
      startedAt: 0,
      duration: source >= 1000 ? 20 : 0.2,
      get currentTime() {
        const t = this.playing ? this.offset + (Date.now() - this.startedAt) / 1000 : this.offset;
        return this.loop ? t % this.duration : Math.min(t, this.duration);
      },
      play() {
        if (h.failPlay) throw new Error("session activation failed");
        if (!this.playing) this.startedAt = Date.now();
        this.playing = true;
        this.plays++;
      },
      pause() {
        this.offset = this.currentTime;
        this.playing = false;
        this.pauses++;
      },
      async seekTo(...a: number[]) {
        this.seeks.push(a);
        this.offset = a[0];
        this.startedAt = Date.now();
      },
      setPlaybackRate(r: number) {
        this.rate = r;
      },
      remove() {
        this.removed = true;
        this.playing = false;
      },
    } as Fake;
    h.players.push(p);
    return p;
  },
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return h.platform;
    },
  },
  AppState: {
    currentState: "active",
    addEventListener: (_: string, fn: (s: string) => void) => {
      h.appListeners.push(fn);
      return { remove: () => h.appListeners.splice(h.appListeners.indexOf(fn), 1) };
    },
  },
}));
vi.mock("expo-haptics", () => ({}));
vi.mock("@/audio/manifest.generated", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync("src/platform/feedback.ts", "utf8");
  const ids = [...src.match(/SFX_IDS\s*=\s*\[(.*?)\]/s)![1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
  const scenes = ["drift", "work", "tension", "wonder", "station", "minigame"];
  return {
    MINIGAME_BPM: 120,
    SFX_SOURCES: Object.fromEntries(ids.map((id, i) => [id, i + 1])),
    SFX_DURATION_MS: Object.fromEntries(ids.map((id) => [id, 200])),
    MUSIC_SCENE_IDS: scenes,
    MUSIC_SCENES: Object.fromEntries(
      scenes.map((id, i) => [id, { base: 1000 + i * 2, layer: 1001 + i * 2, bpm: 120, bars: 8, beatsPerBar: 4, loopSamples: 441000, durationSec: 20 }]),
    ),
  };
});

type AudioApi = typeof import("@/audio");
type FeedbackApi = typeof import("@/platform/feedback");
let audio: AudioApi;
let feedback: FeedbackApi;

const live = () => h.players.filter((p) => !p.removed);
const music = () => live().filter((p) => p.source >= 1000);
const byId = (id: string) => live().filter((p) => p.source === feedback.SFX_IDS.indexOf(id as never) + 1);

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  vi.resetModules();
  h.players.length = 0;
  h.appListeners.length = 0;
  h.failCreate = false;
  h.failPlay = false;
  h.platform = "ios";
  feedback = await import("@/platform/feedback");
  audio = await import("@/audio");
});
afterEach(() => {
  audio.shutdownAudio();
  vi.useRealTimers();
});

describe("sfx", () => {
  it("sets an ambient, mixing, foreground-only session", async () => {
    await audio.initAudio({ scene: null });
    expect(h.mode).toMatchObject({ playsInSilentMode: false, interruptionMode: "mixWithOthers", shouldPlayInBackground: false });
  });

  it("warms the UI pools in batches and round-robins voices", async () => {
    await audio.initAudio({ scene: null, sfxVolume: 0.8 });
    await vi.advanceTimersByTimeAsync(500);
    expect(byId("keyDown")).toHaveLength(4);
    expect(byId("explosion")).toHaveLength(0);
    for (let i = 0; i < 6; i++) {
      feedback.sfx("keyDown", { volume: 0.5, rate: 1.2 });
      await vi.advanceTimersByTimeAsync(30);
    }
    const voices = byId("keyDown");
    expect(voices.map((p) => p.plays)).toEqual([2, 2, 1, 1]);
    expect(voices[0].seeks[0]).toEqual([0, 0, 0]);
    expect(voices[0].volume).toBeCloseTo(0.4);
    expect(voices[0].rate).toBeCloseTo(1.2);
    expect(voices[0].shouldCorrectPitch).toBe(false);
    expect(voices[0].options.keepAudioSessionActive).toBe(true);
  });

  it("drops a retrigger inside the minimum gap and loads cold ids on demand", async () => {
    await audio.initAudio({ scene: null });
    feedback.sfx("explosion");
    feedback.sfx("explosion");
    expect(byId("explosion").reduce((n, p) => n + p.plays, 0)).toBe(1);
  });

  it("never holds more than the player cap", async () => {
    await audio.initAudio({ scene: null });
    await vi.advanceTimersByTimeAsync(500);
    for (const id of feedback.SFX_IDS) {
      feedback.sfx(id);
      await vi.advanceTimersByTimeAsync(40);
    }
    expect(live().length).toBeLessThanOrEqual(56);
    expect(byId("keyDown")).toHaveLength(4); // warm pools survive eviction
    feedback.sfx("keyUp");
    expect(byId("keyUp").some((p) => p.plays > 0)).toBe(true);
  });

  it("survives a dead audio stack", async () => {
    h.failCreate = true;
    await audio.initAudio({ scene: "drift" });
    await vi.advanceTimersByTimeAsync(3000);
    expect(() => feedback.sfx("buy")).not.toThrow();
    h.failCreate = false;
    h.failPlay = true;
    expect(() => feedback.sfx("buy")).not.toThrow();
    expect(() => audio.setScene("work")).not.toThrow();
    await vi.advanceTimersByTimeAsync(3000);
  });

  it("plays nothing on web before a gesture", async () => {
    h.platform = "web";
    const listeners: Record<string, () => void> = {};
    vi.stubGlobal("document", {
      addEventListener: (ev: string, fn: () => void) => (listeners[ev] = fn),
      removeEventListener: (ev: string) => delete listeners[ev],
    });
    vi.resetModules();
    feedback = await import("@/platform/feedback");
    audio = await import("@/audio");
    await audio.initAudio({ scene: "drift" });
    await vi.advanceTimersByTimeAsync(1000);
    feedback.sfx("keyDown");
    expect(h.players).toHaveLength(0);
    listeners.pointerdown();
    expect(Object.keys(listeners)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(music()).toHaveLength(2);
    expect(music().every((p) => p.playing)).toBe(true);
    feedback.sfx("keyDown");
    expect(byId("keyDown")[0].plays).toBe(1);
    vi.unstubAllGlobals();
  });
});

describe("music", () => {
  it("starts base and layer together, looped, and fades the base to the music volume", async () => {
    await audio.initAudio({ scene: "drift" });
    expect(music()).toHaveLength(2);
    const [base, layer] = music();
    expect(base.loop && layer.loop).toBe(true);
    expect(base.playing).toBe(false); // waits for both to load
    await vi.advanceTimersByTimeAsync(100);
    expect(base.playing && layer.playing).toBe(true);
    expect(Math.abs(base.startedAt - layer.startedAt)).toBe(0);
    await vi.advanceTimersByTimeAsync(2500);
    expect(base.volume).toBeCloseTo(0.35, 2);
    expect(layer.volume).toBe(0);
  });

  it("fades the layer with intensity and follows the volume setting", async () => {
    await audio.initAudio({ scene: "drift" });
    await vi.advanceTimersByTimeAsync(2500);
    const [base, layer] = music();
    audio.setIntensity(1);
    await vi.advanceTimersByTimeAsync(600);
    expect(layer.volume).toBeGreaterThan(0.1);
    expect(layer.volume).toBeLessThan(0.34);
    await vi.advanceTimersByTimeAsync(1000);
    expect(layer.volume).toBeCloseTo(0.35, 2);
    audio.setMusicVolume(0.6);
    expect(base.volume).toBeCloseTo(0.6, 2);
    expect(layer.volume).toBeCloseTo(0.6, 2);
    audio.setIntensity(0, { fadeMs: 200 });
    await vi.advanceTimersByTimeAsync(400);
    expect(layer.volume).toBe(0);
    expect(layer.playing).toBe(true); // stays in step, silently
  });

  it("cross-fades between scenes and releases the old one", async () => {
    await audio.initAudio({ scene: "drift" });
    await vi.advanceTimersByTimeAsync(2500);
    const old = music();
    audio.setScene("station");
    await vi.advanceTimersByTimeAsync(800);
    expect(music()).toHaveLength(4);
    const fresh = music().filter((p) => !old.includes(p));
    expect(old[0].volume).toBeGreaterThan(0);
    expect(old[0].volume).toBeLessThan(0.35);
    expect(fresh[0].volume).toBeGreaterThan(0);
    // equal power: the two squared gains add up to the full level mid-fade
    expect(old[0].volume ** 2 + fresh[0].volume ** 2).toBeGreaterThan(0.35 ** 2 * 0.8);
    await vi.advanceTimersByTimeAsync(1500);
    expect(old.every((p) => p.removed)).toBe(true);
    expect(fresh[0].volume).toBeCloseTo(0.35, 2);
    expect(audio.getScene()).toBe("station");
    expect(audio.getMusicClock()?.scene).toBe("station");
  });

  it("re-seats a drifting layer on the base, then leaves it alone", async () => {
    await audio.initAudio({ scene: "minigame" });
    await vi.advanceTimersByTimeAsync(4000);
    const [base, layer] = music();
    expect(layer.seeks).toHaveLength(0);
    layer.offset += 0.2; // 200 ms ahead
    await vi.advanceTimersByTimeAsync(4000);
    expect(layer.seeks.length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(layer.currentTime - base.currentTime)).toBeLessThan(0.03);
    const n = layer.seeks.length;
    await vi.advanceTimersByTimeAsync(6000);
    expect(layer.seeks).toHaveLength(n);
  });

  it("lines the layer up during the fade-in when the two players start apart", async () => {
    await audio.initAudio({ scene: "work" });
    await vi.advanceTimersByTimeAsync(100);
    const [base, layer] = music();
    expect(base.playing).toBe(true);
    layer.offset += 0.12; // started 120 ms early
    await vi.advanceTimersByTimeAsync(900);
    expect(layer.seeks.length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(layer.currentTime - base.currentTime)).toBeLessThan(0.025);
    expect(base.volume).toBeLessThan(0.35); // still fading in: the seek is masked
    const n = layer.seeks.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(layer.seeks).toHaveLength(n);
  });

  it("pauses in the background and resumes in the foreground", async () => {
    await audio.initAudio({ scene: "drift" });
    await vi.advanceTimersByTimeAsync(2500);
    const [base, layer] = music();
    h.appListeners.forEach((fn) => fn("inactive"));
    expect(base.playing).toBe(true);
    h.appListeners.forEach((fn) => fn("background"));
    expect(base.playing || layer.playing).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(base.playing).toBe(false); // the watchdog does not fight the background
    h.appListeners.forEach((fn) => fn("active"));
    expect(base.playing && layer.playing).toBe(true);
    expect(music()).toHaveLength(2);
  });

  it("restarts a scene that the system paused (route change)", async () => {
    await audio.initAudio({ scene: "drift" });
    await vi.advanceTimersByTimeAsync(4000);
    const [base, layer] = music();
    base.pause();
    layer.pause();
    await vi.advanceTimersByTimeAsync(2500);
    expect(base.playing && layer.playing).toBe(true);
  });

  it("stops and releases when disabled, restarts when enabled", async () => {
    await audio.initAudio({ scene: "wonder" });
    await vi.advanceTimersByTimeAsync(2500);
    audio.setMusicEnabled(false);
    await vi.advanceTimersByTimeAsync(600);
    expect(music()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0); // no timer left running while silent
    audio.setMusicEnabled(true);
    await vi.advanceTimersByTimeAsync(2500);
    expect(music()).toHaveLength(2);
    expect(music()[0].volume).toBeCloseTo(0.35, 2);
  });

  it("shutdown releases everything and unregisters the backend", async () => {
    await audio.initAudio({ scene: "drift" });
    await vi.advanceTimersByTimeAsync(2500);
    feedback.sfx("buy");
    audio.shutdownAudio();
    expect(live()).toHaveLength(0);
    const before = h.players.length;
    feedback.sfx("buy");
    expect(h.players).toHaveLength(before);
    expect(vi.getTimerCount()).toBe(0);
  });
});
