// Runtime owner of the Game object: boot (load, validate, offline catch-up), the fixed-step loop,
// the 10 Hz UI pulse, autosave and engine-event fan-out. UI reads state through useGame(selector).
import { useEffect, useRef, useState } from "react";

import { content } from "@/content";
import { newGame, resumeGame, type EngineEvent, type Game, type OfflineReport } from "@/engine";
import { deserialize, serialize } from "@/engine/core";
import { clampAway, createStepper, OFFLINE_THRESHOLD, applyOffline, step, type Stepper } from "@/engine/kernel";
import { readCandidates, writeWithBackups } from "@/platform/storage";

const SAVE_FILE = "save.json";
const PULSE_MS = 100;
const AUTOSAVE_MS = 10_000;

export interface BootResult {
  /** A new game was started because no save existed. */
  fresh: boolean;
  /** The main save was unreadable and a backup (index >= 1) was used. */
  recoveredFromBackup: boolean;
  /** Saves existed but none could be read: a new game was started and the files were left untouched. */
  saveUnreadable: boolean;
  offline: OfflineReport | null;
}

type PulseListener = () => void;
type EventListener = (ev: EngineEvent, g: Game) => void;

let game: Game | null = null;
let stepper: Stepper | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let lastSave = 0;
let pulseCount = 0;
let saveBlocked = false;
const pulseListeners = new Set<PulseListener>();
const eventListeners = new Set<EventListener>();
const offlineListeners = new Set<(r: OfflineReport) => void>();
/** Per-pulse timing for the perf HUD (ms spent in the engine during the last pulse). */
export const perf = { tickMs: 0, pulseMs: 0, ticksPerPulse: 0 };

function randomSeed(): number {
  return (Math.floor(Math.random() * 0x7fffffff) ^ Date.now()) | 0;
}

/** Loads the newest readable save (main, then backups) or starts a new game. Never throws. */
export function bootGame(nowMs: number = Date.now()): BootResult {
  const result: BootResult = { fresh: false, recoveredFromBackup: false, saveUnreadable: false, offline: null };
  let loaded: Game | null = null;
  let candidates: string[] = [];
  try {
    candidates = readCandidates(SAVE_FILE);
    for (let i = 0; i < candidates.length && !loaded; i++) {
      try {
        const parsed = deserialize(candidates[i]);
        if (parsed.ok && parsed.state) {
          loaded = resumeGame(content, parsed.state);
          result.recoveredFromBackup = i > 0;
        }
      } catch (e) {
        console.warn("save candidate rejected", i, e);
      }
    }
  } catch (e) {
    console.warn("save load", e);
  }

  if (!loaded) {
    loaded = newGame(content, randomSeed(), nowMs);
    result.fresh = candidates.length === 0;
    result.saveUnreadable = candidates.length > 0;
    // Do not overwrite unreadable saves right away: the player may want to export or retry them.
    saveBlocked = result.saveUnreadable;
  } else {
    const away = clampAway((nowMs - loaded.state.wall) / 1000);
    if (away >= OFFLINE_THRESHOLD) {
      try {
        result.offline = applyOffline(loaded, away);
      } catch (e) {
        console.warn("offline catch-up failed", e);
      }
    }
    loaded.state.wall = nowMs;
  }

  game = loaded;
  stepper = createStepper(nowMs);
  lastSave = nowMs;
  return result;
}

/**
 * Development boot for preview routes and screenshots: a deterministic new game that never touches
 * the real save file. `setup` can shape the state (see src/store/presets.ts).
 */
export function bootDev(seed = 12345, setup?: (g: Game) => void, nowMs: number = Date.now()): Game {
  const g = newGame(content, seed, nowMs);
  saveBlocked = true;
  game = g;
  stepper = createStepper(nowMs);
  lastSave = nowMs;
  setup?.(g);
  return g;
}

export function getGame(): Game {
  if (!game) throw new Error("game not booted");
  return game;
}

export function hasGame(): boolean {
  return game !== null;
}

/** After the player confirms starting over on top of unreadable saves. */
export function allowSaving(): void {
  saveBlocked = false;
}

export function saveNow(nowMs: number = Date.now()): boolean {
  if (!game || saveBlocked) return false;
  try {
    game.state.wall = nowMs;
    lastSave = nowMs;
    return writeWithBackups(SAVE_FILE, serialize(game.state), nowMs);
  } catch (e) {
    console.warn("save failed", e);
    return false;
  }
}

/** Replaces the running game (import, hard reset). */
export function replaceGame(next: Game, nowMs: number = Date.now()): void {
  game = next;
  stepper = createStepper(nowMs);
  saveBlocked = false;
  saveNow(nowMs);
  firePulse();
}

export function resetGame(nowMs: number = Date.now()): void {
  replaceGame(newGame(content, randomSeed(), nowMs), nowMs);
}

function firePulse(): void {
  pulseCount++;
  pulseListeners.forEach((l) => l());
}

function pulse(): void {
  const g = game;
  const st = stepper;
  if (!g || !st) return;
  const t0 = Date.now();
  let report: OfflineReport | null = null;
  const before = g.state.t;
  try {
    report = step(g, st, t0);
  } catch (e) {
    // A bug in one tick must not freeze the loop forever; skip ahead and keep the app usable.
    console.warn("engine step failed", e);
    st.acc = 0;
  }
  const t1 = Date.now();
  perf.tickMs = t1 - t0;
  perf.ticksPerPulse = Math.round((g.state.t - before) * 10);

  if (g.outbox.length) {
    const events = g.outbox.splice(0, g.outbox.length);
    for (let i = 0; i < events.length; i++) {
      eventListeners.forEach((l) => {
        try {
          l(events[i], g);
        } catch (e) {
          console.warn("event listener", e);
        }
      });
    }
  }
  if (report) offlineListeners.forEach((l) => l(report));
  firePulse();
  if (t1 - lastSave >= AUTOSAVE_MS) saveNow(t1);
  perf.pulseMs = Date.now() - t0;
}

export function startLoop(): void {
  if (timer || !game) return;
  if (stepper) stepper.lastMs = Date.now();
  timer = setInterval(pulse, PULSE_MS);
}

/** Stops ticking (app backgrounded). The next startLoop catches up through the offline path. */
export function stopLoop(save = true): void {
  if (timer) clearInterval(timer);
  timer = null;
  if (save) saveNow();
}

export function isRunning(): boolean {
  return timer !== null;
}

/** Call when returning to the foreground: long absences produce an offline report. */
export function resumeLoop(nowMs: number = Date.now()): OfflineReport | null {
  if (!game || !stepper) return null;
  let report: OfflineReport | null = null;
  const away = clampAway((nowMs - game.state.wall) / 1000);
  if (away >= OFFLINE_THRESHOLD) {
    try {
      report = applyOffline(game, away);
    } catch (e) {
      console.warn("offline catch-up failed", e);
    }
  }
  game.state.wall = nowMs;
  stepper.lastMs = nowMs;
  stepper.acc = 0;
  startLoop();
  if (report) {
    const r = report;
    offlineListeners.forEach((l) => l(r));
  }
  firePulse();
  return report;
}

export function onEngineEvent(listener: EventListener): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

export function onOfflineReport(listener: (r: OfflineReport) => void): () => void {
  offlineListeners.add(listener);
  return () => offlineListeners.delete(listener);
}

export function onPulse(listener: PulseListener): () => void {
  pulseListeners.add(listener);
  return () => pulseListeners.delete(listener);
}

export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

/**
 * Reads from the mutable game on every pulse and re-renders only when the selected value changed.
 * Select primitives or small flat objects/arrays (compared shallowly by default). Never return the
 * state object itself: it is mutated in place and would never look "changed".
 * `every` re-evaluates only on every Nth pulse (2 = 5 Hz) for expensive or slow-moving selections.
 */
export function useGame<T>(selector: (g: Game) => T, isEqual: (a: T, b: T) => boolean = shallowEqual, every = 1): T {
  const sel = useRef(selector);
  sel.current = selector;
  const eq = useRef(isEqual);
  eq.current = isEqual;
  const [value, setValue] = useState<T>(() => selector(getGame()));
  const last = useRef(value);

  useEffect(() => {
    const check = () => {
      if (every > 1 && pulseCount % every !== 0) return;
      const g = game;
      if (!g) return;
      const next = sel.current(g);
      if (!eq.current(last.current, next)) {
        last.current = next;
        setValue(next);
      }
    };
    check();
    return onPulse(check);
  }, [every]);

  return value;
}

/** Runs a player action against the game and wakes subscribers immediately (no 100 ms wait). */
export function act<R>(fn: (g: Game) => R): R {
  const result = fn(getGame());
  firePulse();
  return result;
}
