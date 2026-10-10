// Crash-loop guard. There is no Mac to read a launch crash log, so the app protects itself:
// a "launching" marker is written before the game mounts and cleared after HEALTHY_AFTER_MS of
// healthy running. Two unclean launches in a row boot Safe Mode (lite renderer, effects off) with a
// clear message; the player can try full mode again from the settings.
import { readText, writeText } from "./storage";

const FILE = "launch.json";
export const HEALTHY_AFTER_MS = 10_000;
const SAFE_AFTER_FAILS = 2;

interface LaunchRecord {
  /** Consecutive launches that never reached the healthy mark. */
  fails: number;
  /** A launch is in progress and has not been confirmed healthy. */
  pending: boolean;
  /** The player asked to stay in Safe Mode (or to leave it) explicitly. */
  forced: "safe" | "full" | null;
  lastError: string | null;
}

export interface LaunchStatus {
  safeMode: boolean;
  /** Safe Mode was entered automatically because of repeated unclean launches. */
  auto: boolean;
  fails: number;
  lastError: string | null;
}

let record: LaunchRecord = { fails: 0, pending: false, forced: null, lastError: null };
let status: LaunchStatus | null = null;
let healthyTimer: ReturnType<typeof setTimeout> | null = null;

function load(): LaunchRecord {
  try {
    const raw = readText(FILE);
    if (!raw) return { fails: 0, pending: false, forced: null, lastError: null };
    const r = JSON.parse(raw) as Partial<LaunchRecord>;
    return {
      fails: typeof r.fails === "number" && r.fails >= 0 ? Math.floor(r.fails) : 0,
      pending: r.pending === true,
      forced: r.forced === "safe" || r.forced === "full" ? r.forced : null,
      lastError: typeof r.lastError === "string" ? r.lastError.slice(0, 500) : null,
    };
  } catch {
    return { fails: 0, pending: false, forced: null, lastError: null };
  }
}

function save(): void {
  writeText(FILE, JSON.stringify(record));
}

/** Call once, as early as possible in the root layout, before anything risky renders. */
export function beginLaunch(): LaunchStatus {
  if (status) return status;
  record = load();
  // A marker still pending from the previous run means that run never became healthy.
  if (record.pending) record.fails += 1;
  else record.fails = 0;
  record.pending = true;
  save();

  const auto = record.forced !== "full" && record.fails >= SAFE_AFTER_FAILS;
  status = { safeMode: record.forced === "safe" || auto, auto, fails: record.fails, lastError: record.lastError };
  // "Try full mode again" is a one-shot: if that launch also fails, the guard takes over again.
  if (record.forced === "full") {
    record.forced = null;
    save();
  }
  healthyTimer = setTimeout(markHealthy, HEALTHY_AFTER_MS);
  return status;
}

export function markHealthy(): void {
  if (healthyTimer) clearTimeout(healthyTimer);
  healthyTimer = null;
  if (!record.pending && record.fails === 0) return;
  record.pending = false;
  record.fails = 0;
  save();
}

/** The app is going to the background before the healthy mark: that is not a crash. */
export function suspendLaunchCheck(): void {
  if (!record.pending) return;
  if (healthyTimer) clearTimeout(healthyTimer);
  healthyTimer = null;
  record.pending = false;
  save();
}

export function recordError(error: unknown): void {
  try {
    record.lastError = String((error as Error)?.stack ?? error).slice(0, 500);
    save();
  } catch {
    // nothing else to do
  }
}

/** Player's explicit choice from settings or the recovery screen. Takes effect on next launch. */
export function setSafeModePreference(mode: "safe" | "full" | null): void {
  record.forced = mode;
  if (mode === "full") record.fails = 0;
  save();
}

export function getLaunchStatus(): LaunchStatus {
  return status ?? { safeMode: false, auto: false, fails: 0, lastError: null };
}
