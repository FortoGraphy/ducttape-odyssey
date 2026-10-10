// Durable text storage in the app's document directory (survives app updates and re-signing as
// long as the bundle id stays the same). Writes are atomic (temp file, then move over the target) and
// the main save keeps three spaced backups, so a torn write or a bad save can never lose everything.
// Synchronous on purpose: saves are small and must complete when the app is being backgrounded.
// On web (preview only) it falls back to localStorage.
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

const DIR = "ducttape";
const BACKUPS = 3;
/** Backups are rotated at most this often, so they stay minutes apart instead of seconds. */
const ROTATE_EVERY_MS = 5 * 60 * 1000;

const isWeb = Platform.OS === "web";
const lastRotate: Record<string, number> = {};
let dirReady = false;

function dir(): Directory {
  const d = new Directory(Paths.document, DIR);
  if (!dirReady) {
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
    dirReady = true;
  }
  return d;
}

function file(name: string): File {
  return new File(dir(), name);
}

function webGet(name: string): string | null {
  try {
    return globalThis.localStorage?.getItem(`${DIR}/${name}`) ?? null;
  } catch {
    return null;
  }
}

function webSet(name: string, text: string | null): boolean {
  try {
    if (text === null) globalThis.localStorage?.removeItem(`${DIR}/${name}`);
    else globalThis.localStorage?.setItem(`${DIR}/${name}`, text);
    return true;
  } catch {
    return false;
  }
}

/** Reads a file, or null if it does not exist or cannot be read. Never throws. */
export function readText(name: string): string | null {
  if (isWeb) return webGet(name);
  try {
    const f = file(name);
    return f.exists ? f.textSync() : null;
  } catch (e) {
    console.warn("storage read", name, e);
    return null;
  }
}

/** Atomic write without backups (settings, small flags). Never throws. */
export function writeText(name: string, text: string): boolean {
  if (isWeb) return webSet(name, text);
  try {
    const tmp = file(`${name}.tmp`);
    if (tmp.exists) tmp.delete();
    tmp.create();
    tmp.write(text);
    tmp.moveSync(file(name), { overwrite: true });
    return true;
  } catch (e) {
    console.warn("storage write", name, e);
    return false;
  }
}

export function remove(name: string): void {
  if (isWeb) {
    webSet(name, null);
    return;
  }
  try {
    const f = file(name);
    if (f.exists) f.delete();
  } catch (e) {
    console.warn("storage remove", name, e);
  }
}

const backupName = (name: string, i: number) => `${name}.bak${i}`;

/**
 * Atomic write with rotating backups: every ROTATE_EVERY_MS the current file becomes .bak0
 * (.bak0 -> .bak1 -> .bak2). `nowMs` is injectable for tests.
 */
export function writeWithBackups(name: string, text: string, nowMs: number = Date.now()): boolean {
  if (isWeb) {
    if (nowMs - (lastRotate[name] ?? 0) >= ROTATE_EVERY_MS) {
      const cur = webGet(name);
      if (cur !== null) {
        for (let i = BACKUPS - 1; i > 0; i--) {
          const prev = webGet(backupName(name, i - 1));
          if (prev !== null) webSet(backupName(name, i), prev);
        }
        webSet(backupName(name, 0), cur);
      }
      lastRotate[name] = nowMs;
    }
    return webSet(name, text);
  }
  try {
    const tmp = file(`${name}.tmp`);
    if (tmp.exists) tmp.delete();
    tmp.create();
    tmp.write(text);
    // Only a completely written temp file may replace anything.
    if (nowMs - (lastRotate[name] ?? 0) >= ROTATE_EVERY_MS) {
      const main = file(name);
      if (main.exists) {
        for (let i = BACKUPS - 1; i > 0; i--) {
          const prev = file(backupName(name, i - 1));
          if (prev.exists) prev.moveSync(file(backupName(name, i)), { overwrite: true });
        }
        main.copySync(file(backupName(name, 0)), { overwrite: true });
      }
      lastRotate[name] = nowMs;
    }
    tmp.moveSync(file(name), { overwrite: true });
    return true;
  } catch (e) {
    console.warn("storage writeWithBackups", name, e);
    return false;
  }
}

/** The main file followed by its backups, newest first, skipping missing ones. */
export function readCandidates(name: string): string[] {
  const out: string[] = [];
  const main = readText(name);
  if (main !== null) out.push(main);
  for (let i = 0; i < BACKUPS; i++) {
    const b = readText(backupName(name, i));
    if (b !== null) out.push(b);
  }
  // A crash between "write temp" and "move" leaves a complete temp file: better than nothing.
  const tmp = readText(`${name}.tmp`);
  if (tmp !== null) out.push(tmp);
  return out;
}

/** Writes a file for sharing (export) into the cache directory and returns its uri, or null. */
export function writeShareFile(name: string, text: string): string | null {
  if (isWeb) return null;
  try {
    const f = new File(Paths.cache, name);
    if (f.exists) f.delete();
    f.create();
    f.write(text);
    return f.uri;
  } catch (e) {
    console.warn("storage share file", e);
    return null;
  }
}
