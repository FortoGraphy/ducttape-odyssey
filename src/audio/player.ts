// Sound effect playback on expo-audio. Registers itself as the sfx backend of platform/feedback.
//
// One-shots use small round-robin pools of players per id so a sound can overlap itself (key
// rolls, coin streams). Nothing in here may throw into the game: every native call is guarded,
// and a broken audio stack degrades to silence.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { Platform } from "react-native";

import { registerSfxBackend, type SfxId, type SfxOptions } from "@/platform/feedback";

import { SFX_SOURCES } from "./manifest.generated";

const IS_WEB = Platform.OS === "web";

/** Voices per id. Anything not listed gets one. */
const POOL_SIZE: Partial<Record<SfxId, number>> = {
  keyDown: 4,
  keyUp: 3,
  knobTick: 4,
  kippBlip: 4,
  repairTick: 3,
  coin: 3,
  collect: 3,
  stepHit: 3,
  laser: 3,
  buy: 3,
  tab: 2,
  toggle: 2,
  choice: 2,
  uiOpen: 2,
  uiClose: 2,
  beepGood: 2,
  beepBad: 2,
  stepMiss: 2,
  weld: 2,
  zap: 2,
  tape: 2,
  valve: 2,
  impact: 2,
  explosion: 2,
  thruster: 2,
  scanPing: 2,
  deny: 2,
};

/** Created at startup so the first press is instant. Everything else loads on first use (or via preloadSfx). */
const WARM_IDS: readonly SfxId[] = [
  "keyDown",
  "keyUp",
  "knobTick",
  "tab",
  "toggle",
  "choice",
  "uiOpen",
  "uiClose",
  "buy",
  "coin",
  "collect",
  "deny",
];

// AVPlayer instances are not free. Past this many, the least recently used cold pool is released.
const MAX_PLAYERS = 56;
// The same id cannot retrigger faster than this: two events in one frame would only phase.
const MIN_GAP_MS = 22;
const WARM_BATCH = 5;
const WARM_BATCH_DELAY_MS = 40;
// If players cannot be created at all, stop trying for a while instead of throwing on every tap.
const CREATE_FAILURES_TO_TRIP = 3;
const CREATE_RETRY_MS = 15000;

interface Pool {
  players: AudioPlayer[];
  volumes: number[];
  rates: number[];
  next: number;
  lastAt: number;
  warm: boolean;
}

const pools = new Map<SfxId, Pool>();
const unlockListeners = new Set<() => void>();
let playerCount = 0;
let createFailures = 0;
let createBlockedUntil = 0;
let sfxVolume = 0.8;
let ready = false;
let unlocked = !IS_WEB;
let warned = false;
let warmTimer: ReturnType<typeof setTimeout> | null = null;
let removeUnlockHandlers: (() => void) | null = null;

export function audioWarn(where: string, err: unknown): void {
  if (warned) return;
  warned = true; // once is enough: a broken audio stack would otherwise flood the log
  console.warn(`audio: ${where} failed`, err);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** True once the audio session is configured and (on web) the user has interacted with the page. */
export function isAudioLive(): boolean {
  return ready && unlocked;
}

/** Runs `fn` when audio becomes playable; immediately if it already is. Returns an unsubscribe. */
export function onAudioLive(fn: () => void): () => void {
  if (isAudioLive()) {
    fn();
    return () => {};
  }
  unlockListeners.add(fn);
  return () => {
    unlockListeners.delete(fn);
  };
}

function notifyLive(): void {
  if (!isAudioLive()) return;
  const fns = Array.from(unlockListeners);
  unlockListeners.clear();
  for (const fn of fns) {
    try {
      fn();
    } catch (e) {
      audioWarn("unlock listener", e);
    }
  }
}

function installWebUnlock(): void {
  if (!IS_WEB || unlocked || removeUnlockHandlers || typeof document === "undefined") return;
  // Browsers reject play() until the page has seen a gesture, and the rejection is an unhandled
  // promise inside expo-audio. So nothing is played (or even created) before the first one.
  const events = ["pointerdown", "touchstart", "keydown"] as const;
  const onGesture = (): void => {
    unlocked = true;
    removeUnlockHandlers?.();
    notifyLive();
  };
  for (const ev of events) document.addEventListener(ev, onGesture, { capture: true, passive: true });
  removeUnlockHandlers = () => {
    for (const ev of events) document.removeEventListener(ev, onGesture, { capture: true });
    removeUnlockHandlers = null;
  };
}

function releasePool(id: SfxId): void {
  const pool = pools.get(id);
  if (!pool) return;
  pools.delete(id);
  for (const p of pool.players) {
    try {
      p.remove();
    } catch {
      // already gone
    }
  }
  playerCount -= pool.players.length;
}

function evictFor(extra: number): void {
  while (playerCount + extra > MAX_PLAYERS) {
    let victim: SfxId | null = null;
    let oldest = Infinity;
    for (const [id, pool] of pools) {
      if (!pool.warm && pool.lastAt < oldest) {
        oldest = pool.lastAt;
        victim = id;
      }
    }
    if (victim === null) return;
    releasePool(victim);
  }
}

function ensurePool(id: SfxId, warm: boolean): Pool | null {
  const existing = pools.get(id);
  if (existing) {
    if (warm) existing.warm = true;
    return existing;
  }
  const source = SFX_SOURCES[id];
  if (source == null || Date.now() < createBlockedUntil) return null;
  const size = POOL_SIZE[id] ?? 1;
  evictFor(size);
  // lastAt doubles as the retrigger clock, so start it just outside the gap.
  const pool: Pool = { players: [], volumes: [], rates: [], next: 0, lastAt: Date.now() - MIN_GAP_MS - 1, warm };
  try {
    for (let i = 0; i < size; i++) {
      // keepAudioSessionActive: without it every finished one-shot deactivates the iOS session and
      // the next one pays to reactivate it. updateInterval: nobody listens to status events here.
      const p = createAudioPlayer(source, { keepAudioSessionActive: true, updateInterval: 60000 });
      // Rate changes should change pitch (cheap varispeed), which is the whole point of `rate`.
      p.shouldCorrectPitch = false;
      pool.players.push(p);
      pool.volumes.push(-1);
      pool.rates.push(1);
    }
    createFailures = 0;
  } catch (e) {
    audioWarn(`create ${id}`, e);
    if (++createFailures >= CREATE_FAILURES_TO_TRIP) {
      createFailures = 0;
      createBlockedUntil = Date.now() + CREATE_RETRY_MS;
    }
  }
  playerCount += pool.players.length;
  if (pool.players.length === 0) return null;
  pools.set(id, pool);
  return pool;
}

/** Plays one effect. Safe to call at any time, in any state. */
export function playSfx(id: SfxId, opts?: SfxOptions): void {
  if (!ready || !unlocked) return;
  try {
    const now = Date.now();
    const pool = ensurePool(id, false);
    if (!pool || now - pool.lastAt < MIN_GAP_MS) return;
    const i = pool.next;
    pool.next = (i + 1) % pool.players.length;
    pool.lastAt = now;
    const p = pool.players[i];

    const volume = clamp01(sfxVolume * (opts?.volume ?? 1));
    if (volume <= 0.001) return;
    if (pool.volumes[i] !== volume) {
      p.volume = volume;
      pool.volumes[i] = volume;
    }
    const rate = Math.min(2, Math.max(0.5, opts?.rate ?? 1));
    if (pool.rates[i] !== rate) {
      p.setPlaybackRate(rate);
      pool.rates[i] = rate;
    }
    // Players stay at the end after finishing, so rewind first. Zero tolerance: the default lets
    // AVPlayer land wherever is cheapest, which can clip the attack.
    p.seekTo(0, 0, 0).catch(noop);
    p.play();
  } catch (e) {
    audioWarn(`play ${id}`, e);
  }
}

/** Creates the pools for these ids ahead of time (a mini-game warming its own set on mount). */
export function preloadSfx(ids: readonly SfxId[], keep = false): void {
  if (!isAudioLive()) return;
  try {
    for (const id of ids) ensurePool(id, keep);
  } catch (e) {
    audioWarn("preload", e);
  }
}

export function setSfxVolume(v: number): void {
  sfxVolume = Number.isFinite(v) ? clamp01(v) : sfxVolume;
}

export function getSfxVolume(): number {
  return sfxVolume;
}

function warmUp(): void {
  // In small batches: creating a dozen players in one go would stall the first frames.
  let i = 0;
  const step = (): void => {
    warmTimer = null;
    if (!isAudioLive()) return;
    preloadSfx(WARM_IDS.slice(i, i + WARM_BATCH), true);
    i += WARM_BATCH;
    if (i < WARM_IDS.length) warmTimer = setTimeout(step, WARM_BATCH_DELAY_MS);
  };
  step();
}

/** Configures the audio session and registers the sfx backend. Idempotent, never throws. */
export async function initSfx(): Promise<void> {
  if (ready) return;
  try {
    // Ambient session: the ring/silent switch mutes the game, other apps' audio keeps playing,
    // and nothing continues in the background.
    await setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: false,
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    });
  } catch (e) {
    audioWarn("audio mode", e);
  }
  ready = true;
  registerSfxBackend(playSfx);
  installWebUnlock();
  // On web nothing is created before the first gesture: the pools then load on demand.
  if (!IS_WEB) warmUp();
  notifyLive();
}

/** Releases every player and unregisters the backend. */
export function shutdownSfx(): void {
  registerSfxBackend(null);
  ready = false;
  if (warmTimer) clearTimeout(warmTimer);
  warmTimer = null;
  removeUnlockHandlers?.();
  unlockListeners.clear();
  for (const id of Array.from(pools.keys())) releasePool(id);
  playerCount = 0;
  createFailures = 0;
  createBlockedUntil = 0;
}

function noop(): void {}
