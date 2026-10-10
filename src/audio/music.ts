// Music: one looping scene at a time, each a base loop plus an intensity layer of identical
// length. Scene changes cross-fade; the layer is always playing (silent at intensity 0) so that
// fading it in never needs a seek.
//
// expo-audio has no way to start two players on the same audio clock, so base and layer are
// started back to back and then watched: if they are found apart, the layer is re-seated on the
// base (silently when it is not audible, otherwise only if the gap is large enough to hear).
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { AppState, Platform, type AppStateStatus, type NativeEventSubscription } from "react-native";

import { MUSIC_SCENES, type MusicSceneId } from "./manifest.generated";
import { audioWarn, isAudioLive, onAudioLive } from "./player";

export type { MusicSceneId } from "./manifest.generated";

export interface MusicFadeOptions {
  /** Cross-fade (setScene) or ramp (setIntensity) time in milliseconds. */
  fadeMs?: number;
}

export interface MusicClock {
  scene: MusicSceneId;
  bpm: number;
  /** Position inside the loop, seconds. The loop starts on the downbeat of bar 1. */
  positionSec: number;
  durationSec: number;
  /** Position in beats (quarter notes) since the loop start. */
  beat: number;
}

const IS_WEB = Platform.OS === "web";
const DEFAULT_VOLUME = 0.35;
const DEFAULT_SCENE_FADE_MS = 1600;
const DEFAULT_INTENSITY_FADE_MS = 1200;
const DISABLE_FADE_MS = 350;
const FAST_TICK_MS = 50; // while something is fading
const SLOW_TICK_MS = 1000; // watchdog only
const LOAD_TIMEOUT_MS = 2500;
const VOLUME_EPS = 0.004;
// Layer-vs-base offset that is left alone. HTML audio elements gap a little on every loop, so
// the web preview gets looser numbers.
const SYNC_OK_SEC = IS_WEB ? 0.06 : 0.025;
const SYNC_AUDIBLE_SEC = IS_WEB ? 0.15 : 0.07; // an audible layer is only re-seated beyond this
const SYNC_EDGE_SEC = 0.6; // no seeking this close to the loop point
const MAX_AUDIBLE_RESYNCS = 3;
// Right after a start or resume the scene is still fading in, which hides a seek: use that
// window to line the two players up, checking often and acting on the first reading.
const SETTLE_MS = 2500;
const SETTLE_CHECK_MS = 300;
const RESTART_MIN_MS = 1000;
const RESTART_MAX_MS = 8000;

interface Voice {
  id: MusicSceneId;
  base: AudioPlayer;
  layer: AudioPlayer | null;
  durationSec: number;
  gain: number; // 0..1 scene fade position
  target: number;
  fadeMs: number;
  started: boolean;
  createdAt: number;
  startedAt: number;
  baseVol: number;
  layerVol: number;
  strikes: number;
  audibleResyncs: number;
  seekLead: number; // learned compensation for how long a seek takes
  justSeeked: boolean;
  restartAt: number;
  restartDelayMs: number;
}

let enabled = true;
let volume = DEFAULT_VOLUME;
let wanted: MusicSceneId | null = null;
let sceneFadeMs = DEFAULT_SCENE_FADE_MS;
let intensity = 0;
let intensityTarget = 0;
let intensityFadeMs = DEFAULT_INTENSITY_FADE_MS;
let current: Voice | null = null;
const outgoing: Voice[] = [];
let appActive = true; // not in the background
let appFocused = true; // "active": not behind a system sheet, call screen or the app switcher
let initialised = false;
let timer: ReturnType<typeof setInterval> | null = null;
let timerMs = 0;
let lastTick = 0;
let lastWatch = 0;
let appSub: NativeEventSubscription | null = null;
let liveSub: (() => void) | null = null;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Equal-power fade curve, so a cross-fade does not dip in the middle. */
function curve(g: number): number {
  return Math.sin(g * Math.PI * 0.5);
}

function guard(where: string, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    audioWarn(`music ${where}`, e);
  }
}

function makePlayer(source: number): AudioPlayer {
  const p = createAudioPlayer(source, { keepAudioSessionActive: true, updateInterval: 60000 });
  p.loop = true;
  p.volume = 0;
  return p;
}

function createVoice(id: MusicSceneId): Voice | null {
  const def = MUSIC_SCENES[id];
  try {
    const base = makePlayer(def.base);
    let layer: AudioPlayer | null = null;
    try {
      layer = def.layer != null ? makePlayer(def.layer) : null;
    } catch (e) {
      audioWarn(`music layer ${id}`, e);
    }
    return {
      id,
      base,
      layer,
      durationSec: def.durationSec,
      gain: 0,
      target: 1,
      fadeMs: sceneFadeMs,
      started: false,
      createdAt: Date.now(),
      startedAt: 0,
      baseVol: 0,
      layerVol: 0,
      strikes: 0,
      audibleResyncs: 0,
      seekLead: 0,
      justSeeked: false,
      restartAt: 0,
      restartDelayMs: RESTART_MIN_MS,
    };
  } catch (e) {
    audioWarn(`music scene ${id}`, e);
    return null;
  }
}

function releaseVoice(v: Voice): void {
  for (const p of [v.base, v.layer]) {
    if (!p) continue;
    try {
      p.pause();
    } catch {
      // released already
    }
    try {
      p.remove();
    } catch {
      // released already
    }
  }
}

function startVoice(v: Voice): void {
  // Layer first: whatever the scheduling jitter is, the base (which carries the beat) is not late.
  guard("start", () => {
    v.layer?.play();
    v.base.play();
  });
  v.started = true;
  v.startedAt = Date.now();
}

function applyVolumes(v: Voice): void {
  const sceneGain = curve(v.gain) * volume;
  const layerGain = sceneGain * curve(intensity);
  if (Math.abs(sceneGain - v.baseVol) > VOLUME_EPS || (sceneGain === 0 && v.baseVol !== 0)) {
    v.base.volume = sceneGain;
    v.baseVol = sceneGain;
  }
  if (v.layer && (Math.abs(layerGain - v.layerVol) > VOLUME_EPS || (layerGain === 0 && v.layerVol !== 0))) {
    v.layer.volume = layerGain;
    v.layerVol = layerGain;
  }
}

function shouldPlay(): boolean {
  return enabled && appActive && wanted !== null && isAudioLive();
}

function retire(v: Voice, fadeMs: number): void {
  v.target = 0;
  v.fadeMs = fadeMs;
  if (!v.started || v.gain <= 0) releaseVoice(v);
  else outgoing.push(v);
}

/** Brings the players in line with the wanted state. Cheap to call after any change. */
function reconcile(): void {
  const play = shouldPlay();
  if (current && (!play || current.id !== wanted)) {
    retire(current, enabled && appActive ? sceneFadeMs : DISABLE_FADE_MS);
    current = null;
  }
  if (play && !current && wanted !== null) {
    current = createVoice(wanted);
    if (current) current.fadeMs = sceneFadeMs;
  }
  schedule();
}

function isSettled(): boolean {
  if (outgoing.length > 0) return false;
  if (!current) return true;
  if (!current.started || Date.now() - current.startedAt < SETTLE_MS) return false;
  return current.gain === current.target && intensity === intensityTarget;
}

function schedule(): void {
  const idle = !current && outgoing.length === 0;
  const want = idle ? 0 : isSettled() ? SLOW_TICK_MS : FAST_TICK_MS;
  if (want === timerMs) return;
  if (timer) clearInterval(timer);
  timer = null;
  timerMs = want;
  if (want > 0) {
    lastTick = Date.now();
    timer = setInterval(tick, want);
  }
}

function step(value: number, target: number, dtMs: number, fadeMs: number): number {
  if (value === target) return value;
  const d = fadeMs <= 0 ? 1 : dtMs / fadeMs;
  return value < target ? Math.min(target, value + d) : Math.max(target, value - d);
}

function checkSync(v: Voice, settling: boolean): void {
  const layer = v.layer;
  if (!layer || !v.started || !v.base.playing || !layer.playing) return;
  const dur = v.durationSec;
  const b = v.base.currentTime;
  const l = layer.currentTime;
  if (!(b >= 0) || !(l >= 0)) return;
  let d = l - b;
  if (d > dur / 2) d -= dur;
  else if (d < -dur / 2) d += dur;

  if (v.justSeeked) {
    // Whatever is left after a seek is how long the seek itself took: aim ahead by that next time.
    v.justSeeked = false;
    v.seekLead = Math.max(-0.3, Math.min(0.3, v.seekLead - d));
  }
  if (Math.abs(d) <= SYNC_OK_SEC) {
    v.strikes = 0;
    return;
  }
  if (b < SYNC_EDGE_SEC || b > dur - SYNC_EDGE_SEC) return;
  if (!settling) {
    // One odd reading can be the two players sitting on either side of the loop point.
    if (++v.strikes < 2) return;
    const audible = v.layerVol > 0.02;
    if (audible && (Math.abs(d) < SYNC_AUDIBLE_SEC || v.audibleResyncs >= MAX_AUDIBLE_RESYNCS)) return;
    if (audible) v.audibleResyncs++;
  }
  v.strikes = 0;
  v.justSeeked = true;
  layer.seekTo(Math.min(dur - 0.05, Math.max(0, b + v.seekLead)), 0, 0).catch(noop);
}

function watchdog(v: Voice, now: number): void {
  if (!v.started || now - v.startedAt < SETTLE_MS) return;
  // iOS pauses every player on a route change (headphones unplugged) or an interruption that
  // ends without "should resume". The scene is still wanted, so start it again, but back off:
  // during a phone call the session cannot be reactivated and hammering it helps nobody.
  const stalled = !v.base.playing || (v.layer !== null && !v.layer.playing);
  if (!stalled) {
    v.restartDelayMs = RESTART_MIN_MS;
    checkSync(v, false);
    return;
  }
  if (now < v.restartAt) return;
  v.restartAt = now + v.restartDelayMs;
  v.restartDelayMs = Math.min(RESTART_MAX_MS, v.restartDelayMs * 2);
  v.strikes = 0;
  if (v.layer && !v.layer.playing) v.layer.play();
  if (!v.base.playing) v.base.play();
}

function tick(): void {
  const now = Date.now();
  const dt = Math.min(250, now - lastTick);
  lastTick = now;
  guard("tick", () => {
    intensity = step(intensity, intensityTarget, dt, intensityFadeMs);

    const v = current;
    if (v) {
      if (!v.started) {
        const loaded = v.base.isLoaded && (!v.layer || v.layer.isLoaded);
        if (loaded || now - v.createdAt > LOAD_TIMEOUT_MS) startVoice(v);
      } else {
        v.gain = step(v.gain, v.target, dt, v.fadeMs);
      }
      applyVolumes(v);
    }
    for (let i = outgoing.length - 1; i >= 0; i--) {
      const o = outgoing[i];
      o.gain = step(o.gain, 0, dt, o.fadeMs);
      if (o.gain <= 0) {
        outgoing.splice(i, 1);
        releaseVoice(o);
      } else {
        applyVolumes(o);
      }
    }
    if (v && v.started && appFocused) {
      const sinceStart = now - v.startedAt;
      if (sinceStart < SETTLE_MS) {
        if (sinceStart >= SETTLE_CHECK_MS && now - lastWatch >= SETTLE_CHECK_MS) {
          lastWatch = now;
          checkSync(v, true);
        }
      } else if (now - lastWatch >= SLOW_TICK_MS - 100) {
        lastWatch = now;
        watchdog(v, now);
      }
    }
  });
  schedule();
}

function onAppState(state: AppStateStatus): void {
  guard("app state", () => {
    appFocused = state === "active";
    if (state === "background") {
      if (!appActive) return;
      appActive = false;
      // Timers stop in the background, so nothing can fade: stop the tails now, pause the scene.
      for (const o of outgoing.splice(0)) releaseVoice(o);
      if (timer) clearInterval(timer);
      timer = null;
      timerMs = 0;
      if (current?.started) {
        current.base.pause();
        current.layer?.pause();
      }
    } else if (state === "active") {
      if (appActive) return;
      appActive = true;
      const v = current;
      if (v && v.id === wanted && enabled && isAudioLive()) {
        if (v.started) {
          v.layer?.play();
          v.base.play();
          v.startedAt = Date.now();
          v.strikes = 0;
          v.audibleResyncs = 0;
        }
        schedule();
      } else {
        reconcile();
      }
    }
  });
}

// ----------------------------------------------------------------------------- public API

export function setMusicEnabled(on: boolean): void {
  guard("enable", () => {
    if (enabled === on) return;
    enabled = on;
    reconcile();
  });
}

/** 0..1, default 0.35. Applies immediately. */
export function setMusicVolume(v: number): void {
  guard("volume", () => {
    if (!Number.isFinite(v)) return;
    volume = clamp01(v);
    if (current) applyVolumes(current);
    for (const o of outgoing) applyVolumes(o);
  });
}

/** Cross-fades to a scene. `null` fades the music out. Calling it with the current scene is a no-op. */
export function setScene(id: MusicSceneId | null, opts?: MusicFadeOptions): void {
  guard("scene", () => {
    if (id !== null && !MUSIC_SCENES[id]) return;
    sceneFadeMs = Math.max(0, opts?.fadeMs ?? DEFAULT_SCENE_FADE_MS);
    if (id === wanted && (current !== null || !shouldPlay())) return;
    wanted = id;
    reconcile();
  });
}

/** 0 = base loop only, 1 = intensity layer fully in. */
export function setIntensity(x: number, opts?: MusicFadeOptions): void {
  guard("intensity", () => {
    if (!Number.isFinite(x)) return;
    intensityTarget = clamp01(x);
    intensityFadeMs = Math.max(0, opts?.fadeMs ?? DEFAULT_INTENSITY_FADE_MS);
    if (!current) intensity = intensityTarget; // nothing audible to ramp
    schedule();
  });
}

export function getScene(): MusicSceneId | null {
  return wanted;
}

export function getIntensity(): number {
  return intensityTarget;
}

export function getMusicVolume(): number {
  return volume;
}

export function isMusicEnabled(): boolean {
  return enabled;
}

/** Playback position of the running scene, for anything that wants to follow the beat. */
export function getMusicClock(): MusicClock | null {
  const v = current;
  if (!v || !v.started) return null;
  try {
    const def = MUSIC_SCENES[v.id];
    const positionSec = v.base.currentTime;
    if (!(positionSec >= 0)) return null;
    return { scene: v.id, bpm: def.bpm, positionSec, durationSec: def.durationSec, beat: (positionSec * def.bpm) / 60 };
  } catch {
    return null;
  }
}

export function initMusic(): void {
  if (initialised) return;
  initialised = true;
  guard("init", () => {
    appActive = AppState.currentState !== "background";
    appFocused = AppState.currentState === "active" || AppState.currentState == null;
    appSub = AppState.addEventListener("change", onAppState);
    // On web this fires on the first user gesture: the scene asked for at startup begins then.
    liveSub = onAudioLive(reconcile);
  });
}

export function shutdownMusic(): void {
  initialised = false;
  guard("shutdown", () => {
    appSub?.remove();
    appSub = null;
    liveSub?.();
    liveSub = null;
    if (timer) clearInterval(timer);
    timer = null;
    timerMs = 0;
    if (current) releaseVoice(current);
    current = null;
    for (const o of outgoing.splice(0)) releaseVoice(o);
  });
}

function noop(): void {}
