// Persistence: checksummed save text, migrations, state repair, and the shareable export code.
// Nothing here throws on bad input: every entry point returns { ok: false, error } instead.
import * as B from "../big";
import { SCHEMA_VERSION, newState } from "../kernel";
import { DECK_IDS, type ContentDB, type GameState } from "../types";

export type SaveError = "empty" | "format" | "checksum" | "parse" | "structure" | "version" | "size";
export type LoadResult = { ok: true; state: GameState } | { ok: false; error: SaveError };

const SAVE_PREFIX = "DTOS1:";
export const EXPORT_PREFIX = "DTO1.";
const MAX_RAW_BYTES = 32 * 1024 * 1024;
const MAX_T = 1e11;

type Obj = Record<string, unknown>;

// ---------- checksum, text and base64url ----------------------------------------------------

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function utf8Encode(text: string): Uint8Array {
  let size = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) size += 1;
    else if (c < 0x800) size += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      size += 4;
      i++;
    } else size += 3;
  }
  const out = new Uint8Array(size);
  let p = 0;
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c < 0x80) out[p++] = c;
    else if (c < 0x800) {
      out[p++] = 0xc0 | (c >> 6);
      out[p++] = 0x80 | (c & 0x3f);
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      c = 0x10000 + ((c & 0x3ff) << 10) + (text.charCodeAt(++i) & 0x3ff);
      out[p++] = 0xf0 | (c >> 18);
      out[p++] = 0x80 | ((c >> 12) & 0x3f);
      out[p++] = 0x80 | ((c >> 6) & 0x3f);
      out[p++] = 0x80 | (c & 0x3f);
    } else {
      out[p++] = 0xe0 | (c >> 12);
      out[p++] = 0x80 | ((c >> 6) & 0x3f);
      out[p++] = 0x80 | (c & 0x3f);
    }
  }
  return out;
}

export function utf8Decode(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk: number[] = [];
  const n = bytes.length;
  for (let i = 0; i < n; ) {
    const b = bytes[i++];
    let cp: number;
    if (b < 0x80) cp = b;
    else if (b >= 0xc0 && b < 0xe0 && i < n) cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    else if (b >= 0xe0 && b < 0xf0 && i + 1 < n) {
      cp = ((b & 0x0f) << 12) | ((bytes[i] & 0x3f) << 6) | (bytes[i + 1] & 0x3f);
      i += 2;
    } else if (b >= 0xf0 && i + 2 < n) {
      cp = ((b & 0x07) << 18) | ((bytes[i] & 0x3f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      i += 3;
    } else cp = 0xfffd;
    if (cp > 0xffff) {
      cp -= 0x10000;
      chunk.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else chunk.push(cp);
    if (chunk.length >= 8192) {
      parts.push(String.fromCharCode.apply(null, chunk));
      chunk = [];
    }
  }
  if (chunk.length) parts.push(String.fromCharCode.apply(null, chunk));
  return parts.join("");
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64_REV = new Int16Array(128).fill(-1);
for (let i = 0; i < B64.length; i++) B64_REV[B64.charCodeAt(i)] = i;

export function base64urlEncode(bytes: Uint8Array): string {
  const parts: string[] = [];
  let s = "";
  const n = bytes.length;
  for (let i = 0; i < n; i += 3) {
    const a = bytes[i];
    const b = i + 1 < n ? bytes[i + 1] : 0;
    const c = i + 2 < n ? bytes[i + 2] : 0;
    s += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    if (i + 1 < n) s += B64[((b & 15) << 2) | (c >> 6)];
    if (i + 2 < n) s += B64[c & 63];
    if (s.length >= 8192) {
      parts.push(s);
      s = "";
    }
  }
  parts.push(s);
  return parts.join("");
}

/** Returns null on any character outside the alphabet or an impossible length. */
export function base64urlDecode(text: string): Uint8Array | null {
  const n = text.length;
  if (n % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((n * 3) / 4));
  let p = 0;
  for (let i = 0; i < n; i += 4) {
    const q = [0, 0, 0, 0];
    const count = Math.min(4, n - i);
    for (let k = 0; k < count; k++) {
      const code = text.charCodeAt(i + k);
      const v = code < 128 ? B64_REV[code] : -1;
      if (v < 0) return null;
      q[k] = v;
    }
    out[p++] = (q[0] << 2) | (q[1] >> 4);
    if (count > 2) out[p++] = ((q[1] & 15) << 4) | (q[2] >> 2);
    if (count > 3) out[p++] = ((q[2] & 3) << 6) | q[3];
  }
  return out;
}

// ---------- LZ block compressor -------------------------------------------------------------
// Byte-oriented LZ77 in the well-known token layout: [lit len | match len - 4] [extra lit len]
// literals [offset lo, hi] [extra match len]. The stream always ends with a literal-only sequence.

const MIN_MATCH = 4;
const HASH_BITS = 14;

function writeLen(out: Uint8Array, p: number, len: number): number {
  let left = len;
  while (left >= 255) {
    out[p++] = 255;
    left -= 255;
  }
  out[p++] = left;
  return p;
}

export function lzCompress(src: Uint8Array): Uint8Array {
  const n = src.length;
  const out = new Uint8Array(n + Math.ceil(n / 255) + 16);
  const table = new Int32Array(1 << HASH_BITS).fill(-1);
  let p = 0;
  let anchor = 0;
  let i = 0;
  const emit = (litEnd: number, offset: number, matchLen: number): void => {
    const lit = litEnd - anchor;
    const ml = matchLen > 0 ? matchLen - MIN_MATCH : 0;
    out[p++] = ((lit < 15 ? lit : 15) << 4) | (ml < 15 ? ml : 15);
    if (lit >= 15) p = writeLen(out, p, lit - 15);
    out.set(src.subarray(anchor, litEnd), p);
    p += lit;
    if (matchLen > 0) {
      out[p++] = offset & 0xff;
      out[p++] = offset >> 8;
      if (ml >= 15) p = writeLen(out, p, ml - 15);
    }
  };
  const limit = n - MIN_MATCH;
  while (i <= limit) {
    const seq = src[i] | (src[i + 1] << 8) | (src[i + 2] << 16) | (src[i + 3] << 24);
    const h = Math.imul(seq, -1640531535) >>> (32 - HASH_BITS);
    const ref = table[h];
    table[h] = i;
    if (ref >= 0 && i - ref <= 0xffff && src[ref] === src[i] && src[ref + 1] === src[i + 1] && src[ref + 2] === src[i + 2] && src[ref + 3] === src[i + 3]) {
      let len = MIN_MATCH;
      while (i + len < n && src[ref + len] === src[i + len]) len++;
      emit(i, i - ref, len);
      i += len;
      anchor = i;
    } else i++;
  }
  emit(n, 0, 0);
  return out.subarray(0, p);
}

/** Returns null when the stream is malformed or does not produce exactly `rawLen` bytes. */
export function lzDecompress(src: Uint8Array, rawLen: number): Uint8Array | null {
  if (!(rawLen >= 0) || rawLen > MAX_RAW_BYTES) return null;
  const out = new Uint8Array(rawLen);
  const n = src.length;
  let ip = 0;
  let op = 0;
  while (ip < n) {
    const token = src[ip++];
    let lit = token >> 4;
    if (lit === 15) {
      let b: number;
      do {
        if (ip >= n) return null;
        b = src[ip++];
        lit += b;
      } while (b === 255);
    }
    if (ip + lit > n || op + lit > rawLen) return null;
    out.set(src.subarray(ip, ip + lit), op);
    ip += lit;
    op += lit;
    if (ip >= n) break;
    if (ip + 2 > n) return null;
    const offset = src[ip] | (src[ip + 1] << 8);
    ip += 2;
    let len = (token & 15) + MIN_MATCH;
    if ((token & 15) === 15) {
      let b: number;
      do {
        if (ip >= n) return null;
        b = src[ip++];
        len += b;
      } while (b === 255);
    }
    if (offset === 0 || offset > op || op + len > rawLen) return null;
    for (let k = 0; k < len; k++, op++) out[op] = out[op - offset];
  }
  return op === rawLen ? out : null;
}

// ---------- migrations ----------------------------------------------------------------------

/**
 * `migrations[v]` upgrades a raw save from schema version v to v + 1. Add an entry whenever
 * SCHEMA_VERSION is bumped; missing fields with sensible defaults need no migration (sanitizeState
 * fills them from a fresh state).
 */
export const migrations: Record<number, (raw: Obj) => Obj> = {
  0: (raw) => ({ ...raw, v: 1 }),
};

export function migrate(raw: Obj): { ok: true; raw: Obj } | { ok: false; error: SaveError } {
  let cur = raw;
  let v = typeof cur.v === "number" && Number.isFinite(cur.v) ? Math.floor(cur.v) : -1;
  if (v < 0 || v > SCHEMA_VERSION) return { ok: false, error: "version" };
  while (v < SCHEMA_VERSION) {
    const step = migrations[v];
    if (!step) return { ok: false, error: "version" };
    try {
      cur = step(cur);
    } catch {
      return { ok: false, error: "structure" };
    }
    const next = cur && typeof cur.v === "number" ? Math.floor(cur.v) : -1;
    if (!(next > v)) return { ok: false, error: "version" };
    v = next;
  }
  return { ok: true, raw: cur };
}

// ---------- sanitize ------------------------------------------------------------------------

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const unsafeKey = (k: string): boolean => k === "__proto__" || k === "constructor" || k === "prototype";
const fin = (v: unknown, def: number): number => (typeof v === "number" && Number.isFinite(v) ? v : def);
const int = (v: unknown, def: number, lo: number, hi: number): number => {
  const n = Math.floor(fin(v, def));
  return n < lo ? lo : n > hi ? hi : n;
};

function looksBig(v: unknown): boolean {
  if (!isObj(v)) return false;
  const keys = Object.keys(v);
  return keys.length === 2 && "m" in v && "e" in v;
}

/** Copies loaded data, replacing NaN/Infinity with 0 and repairing anything shaped like a Big. */
function deepFix(v: unknown, depth = 0): unknown {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string" || typeof v === "boolean" || v === null) return v;
  if (typeof v !== "object" || depth > 24) return null;
  if (Array.isArray(v)) {
    const out: unknown[] = [];
    for (let i = 0; i < v.length; i++) out.push(deepFix(v[i], depth + 1));
    return out;
  }
  if (looksBig(v)) return B.sanitize(v);
  const out: Obj = {};
  for (const k of Object.keys(v as Obj)) {
    if (unsafeKey(k)) continue;
    const x = (v as Obj)[k];
    if (x !== undefined && typeof x !== "function") out[k] = deepFix(x, depth + 1);
  }
  return out;
}

/** Lays loaded data over a template: the template decides the type of every field it knows. */
function merge(tpl: unknown, val: unknown, depth = 0): unknown {
  if (looksBig(tpl)) return B.sanitize(val);
  if (tpl === null) return val === undefined ? null : deepFix(val, depth);
  if (typeof tpl === "number") return fin(val, tpl);
  if (typeof tpl === "string") return typeof val === "string" ? val : tpl;
  if (typeof tpl === "boolean") return typeof val === "boolean" ? val : tpl;
  if (Array.isArray(tpl)) return Array.isArray(val) ? deepFix(val, depth) : deepFix(tpl, depth);
  if (!isObj(tpl)) return deepFix(val, depth);
  if (!isObj(val)) return deepFix(tpl, depth);
  const out: Obj = {};
  for (const k of Object.keys(tpl)) out[k] = merge(tpl[k], val[k], depth + 1);
  for (const k of Object.keys(val)) {
    if (k in tpl || unsafeKey(k)) continue;
    const x = val[k];
    if (x !== undefined && typeof x !== "function") out[k] = deepFix(x, depth + 1);
  }
  return out;
}

const STUB_CONTENT = { decks: {}, balance: { startCredits: 0 } } as unknown as ContentDB;

function numberRecord(v: unknown, lo = -Infinity, hi = Infinity): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const k of Object.keys(v)) {
    const n = v[k];
    if (unsafeKey(k) || typeof n !== "number" || !Number.isFinite(n)) continue;
    out[k] = n < lo ? lo : n > hi ? hi : n;
  }
  return out;
}

/**
 * Turns anything that passed the structural check into a complete, safe GameState: missing slices
 * come from a fresh state, numbers are finite, Big values normalised, lists bounded, clocks clamped.
 * Pass `content` so start levels and start credits of missing fields match the real game.
 */
export function sanitizeState(raw: unknown, content?: ContentDB, nowMs?: number): GameState {
  const src: Obj = isObj(raw) ? raw : {};
  const seed = int(src.seed, 1, -0x80000000, 0x7fffffff);
  const now = typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : undefined;
  const tpl = newState(content ?? STUB_CONTENT, seed, fin(src.wall, now ?? 0));
  const s = merge(tpl, src) as GameState;

  s.v = SCHEMA_VERSION;
  s.seed = seed;
  s.rng = int(src.rng, tpl.rng, -0x80000000, 0x7fffffff);
  s.t = Math.min(MAX_T, Math.max(0, s.t));
  s.played = Math.min(MAX_T, Math.max(0, s.played));
  s.wall = Math.max(0, s.wall);
  // a save from the "future" (clock set back) must not block offline progress forever
  if (now !== undefined && s.wall > now) s.wall = now;
  s.created = Math.min(Math.max(0, s.created), s.wall);

  for (const id of Object.keys(s.inv)) {
    const v = B.sanitize(s.inv[id]);
    if (v.m > 0) s.inv[id] = v;
    else delete s.inv[id];
  }
  s.keep = numberRecord(s.keep, 0, 1);
  s.flags = numberRecord(s.flags);
  s.stats = numberRecord(s.stats);

  const decks = {} as GameState["decks"];
  for (const id of DECK_IDS) {
    const d: Obj = isObj(s.decks[id]) ? (s.decks[id] as unknown as Obj) : {};
    decks[id] = {
      level: int(d.level, tpl.decks[id].level, 0, 1e6),
      manager: int(d.manager, 0, 0, Number.MAX_SAFE_INTEGER),
      cards: Array.isArray(d.cards) ? d.cards.filter((c): c is string => typeof c === "string").slice(0, 2) : [],
    };
  }
  s.decks = decks;

  for (const st of ["refinery", "fabricator", "workshop"] as const) {
    const q: unknown = isObj(s.craft[st]) ? s.craft[st].queue : null;
    const queue: GameState["craft"]["refinery"]["queue"] = [];
    if (Array.isArray(q)) {
      for (const j of q) {
        if (!isObj(j) || typeof j.recipe !== "string" || queue.length >= 32) continue;
        const left = int(j.left, 1, -1, 1e9);
        if (left === 0) continue;
        const job: GameState["craft"]["refinery"]["queue"][number] = {
          uid: int(j.uid, 0, 0, Number.MAX_SAFE_INTEGER),
          recipe: j.recipe,
          left,
          progress: Math.max(0, fin(j.progress, 0)),
        };
        if (j.stalled === "inputs" || j.stalled === "cargo" || j.stalled === "power") job.stalled = j.stalled;
        queue.push(job);
      }
    }
    s.craft[st] = { queue };
  }
  s.autoRecipes = Array.from(new Set((s.autoRecipes as unknown[]).filter((r): r is string => typeof r === "string"))).slice(0, 64);
  const recipes: Record<string, 1> = {};
  if (isObj(s.recipes)) for (const k of Object.keys(s.recipes)) if (!unsafeKey(k) && s.recipes[k] === 1) recipes[k] = 1;
  s.recipes = recipes;
  const features: GameState["features"] = {};
  if (isObj(s.features)) for (const k of Object.keys(s.features)) if (!unsafeKey(k) && (s.features as Obj)[k] === 1) (features as Obj)[k] = 1;
  s.features = features;

  const seen = new Set<number>();
  const modules: GameState["modules"] = [];
  for (const m of s.modules as unknown[]) {
    if (!isObj(m) || typeof m.item !== "string" || modules.length >= 200) continue;
    const uid = int(m.uid, 0, 0, Number.MAX_SAFE_INTEGER);
    if (uid <= 0 || seen.has(uid)) continue;
    seen.add(uid);
    modules.push({
      uid,
      item: m.item,
      q: int(m.q, 1, 0, 4) as GameState["modules"][number]["q"],
      hp: Math.min(100, Math.max(0, fin(m.hp, 100))),
      lvl: int(m.lvl, 0, 0, 1e6),
      slot: int(m.slot, -1, -1, 35),
    });
  }
  s.modules = modules;
  const w = int(s.grid.w, 3, 1, 6);
  const h = int(s.grid.h, 3, 1, 6);
  const open = int(s.grid.open, 4, 0, w * h);
  const cells: number[] = new Array(w * h).fill(0);
  for (const m of modules) {
    if (m.slot >= 0 && m.slot < open && cells[m.slot] === 0) cells[m.slot] = m.uid;
    else m.slot = -1;
  }
  s.grid = { w, h, open, cells };

  s.hull.hp = Math.min(100, Math.max(0, s.hull.hp));
  s.repair.botLevel = Math.max(0, s.repair.botLevel);
  s.repair.priority = (s.repair.priority as unknown[]).filter((n): n is number => typeof n === "number" && Number.isFinite(n)).slice(0, 16);
  const jobs: GameState["repair"]["jobs"] = [];
  for (const j of s.repair.jobs as unknown[]) {
    if (isObj(j) && typeof j.target === "number" && Number.isFinite(j.target) && jobs.length < 8) jobs.push({ target: j.target, glitchUntil: fin(j.glitchUntil, 0) });
  }
  s.repair.jobs = jobs;

  const a = s.active;
  a.heat = Math.min(100, Math.max(0, a.heat));
  a.combo = Math.min(100, Math.max(0, a.combo));
  a.mining = false;
  const salvage: GameState["active"]["salvage"] = [];
  for (const b of a.salvage as unknown[]) {
    if (!isObj(b) || salvage.length >= 16) continue;
    const kind = b.kind === "pod" || b.kind === "wreck" || b.kind === "crystal" ? b.kind : "crate";
    salvage.push({ uid: int(b.uid, 0, 0, Number.MAX_SAFE_INTEGER), kind, x: fin(b.x, 0.5), y: fin(b.y, 0.5), born: fin(b.born, s.t), ttl: fin(b.ttl, 45), seed: int(b.seed, 1, -0x80000000, 0x7fffffff) });
  }
  a.salvage = salvage;

  const mg: unknown = s.minigame;
  s.minigame =
    isObj(mg) && typeof mg.game === "string" && typeof mg.purpose === "string" && typeof mg.token === "number"
      ? ({ token: int(mg.token, 0, 0, Number.MAX_SAFE_INTEGER), game: mg.game, tier: int(mg.tier, 1, 1, 3), purpose: mg.purpose, ref: fin(mg.ref, 0) } as GameState["minigame"])
      : null;

  // read from the raw input: a non-finite multiplier must be dropped, not turned into "times zero"
  const buffs: GameState["buffs"] = [];
  for (const b of Array.isArray(src.buffs) ? (src.buffs as unknown[]) : []) {
    if (!isObj(b) || !isObj(b.effect) || typeof b.src !== "string" || buffs.length >= 64) continue;
    const e = b.effect;
    const effect: GameState["buffs"][number]["effect"] = {};
    if (typeof e.stat === "string") effect.stat = e.stat as never;
    if (typeof e.deck === "string") effect.deck = e.deck as never;
    if (typeof e.add === "number" && Number.isFinite(e.add)) effect.add = e.add;
    if (typeof e.mul === "number" && Number.isFinite(e.mul)) effect.mul = e.mul;
    buffs.push({ effect, until: fin(b.until, 0), src: b.src });
  }
  s.buffs = buffs;

  const d = s.drones;
  s.drones = { hauler: int(d.hauler, 0, 0, 1e6), probe: int(d.probe, 0, 0, 1e6), salvager: int(d.salvager, 0, 0, 1e6), fixer: int(d.fixer, 0, 0, 1e6) };
  if (s.buyMode !== 1 && s.buyMode !== 10 && s.buyMode !== 100 && s.buyMode !== -1) s.buyMode = 1;

  // uid must stay ahead of everything that already carries one
  let uid = int(src.uid, 0, 0, Number.MAX_SAFE_INTEGER);
  for (const m of modules) uid = Math.max(uid, m.uid);
  for (const b of salvage) uid = Math.max(uid, b.uid);
  for (const st of ["refinery", "fabricator", "workshop"] as const) for (const j of s.craft[st].queue) uid = Math.max(uid, j.uid);
  if (Array.isArray(s.crew)) for (const cm of s.crew) if (isObj(cm)) uid = Math.max(uid, int((cm as Obj).uid, 0, 0, Number.MAX_SAFE_INTEGER));
  if (s.minigame) uid = Math.max(uid, s.minigame.token);
  s.uid = uid;
  return s;
}

// ---------- save text -----------------------------------------------------------------------

function hex8(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

/** Save file text: `DTOS1:<crc32 hex>:<json>`. */
export function serialize(state: GameState): string {
  const json = JSON.stringify(state);
  return `${SAVE_PREFIX}${hex8(crc32(utf8Encode(json)))}:${json}`;
}

function structureOk(raw: unknown): raw is Obj {
  if (!isObj(raw)) return false;
  if (typeof raw.v !== "number" || typeof raw.t !== "number") return false;
  if (!isObj(raw.decks) || !isObj(raw.inv)) return false;
  return isObj(raw.credits) || typeof raw.credits === "number";
}

function fromJson(json: string, content?: ContentDB, nowMs?: number): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "parse" };
  }
  if (!structureOk(raw)) return { ok: false, error: "structure" };
  const migrated = migrate(raw);
  if (!migrated.ok) return migrated;
  try {
    return { ok: true, state: sanitizeState(migrated.raw, content, nowMs) };
  } catch {
    return { ok: false, error: "structure" };
  }
}

/**
 * Parses save text written by `serialize`. Verifies the checksum, migrates old versions and repairs
 * the state. Plain JSON without the header is accepted too (debug tools). Never throws.
 */
export function deserialize(text: unknown, content?: ContentDB, nowMs?: number): LoadResult {
  if (typeof text !== "string") return { ok: false, error: "empty" };
  const body = text.trim();
  if (body.length === 0) return { ok: false, error: "empty" };
  if (body.startsWith(SAVE_PREFIX)) {
    const sep = SAVE_PREFIX.length + 8;
    const crc = body.slice(SAVE_PREFIX.length, sep);
    if (body.charAt(sep) !== ":" || !/^[0-9a-f]{8}$/.test(crc)) return { ok: false, error: "format" };
    const json = body.slice(sep + 1);
    if (hex8(crc32(utf8Encode(json))) !== crc) return { ok: false, error: "checksum" };
    return fromJson(json, content, nowMs);
  }
  if (body.charAt(0) !== "{") return { ok: false, error: "format" };
  return fromJson(body, content, nowMs);
}

// ---------- export code ---------------------------------------------------------------------

const EXPORT_HEADER = 9; // version byte, crc32, raw length

/** Shareable save: `DTO1.` + base64url(version, crc32, length, LZ-compressed JSON). */
export function exportCode(state: GameState): string {
  const raw = utf8Encode(JSON.stringify(state));
  const packed = lzCompress(raw);
  const crc = crc32(raw);
  const out = new Uint8Array(EXPORT_HEADER + packed.length);
  out[0] = 1;
  out[1] = crc >>> 24;
  out[2] = (crc >>> 16) & 0xff;
  out[3] = (crc >>> 8) & 0xff;
  out[4] = crc & 0xff;
  out[5] = raw.length >>> 24;
  out[6] = (raw.length >>> 16) & 0xff;
  out[7] = (raw.length >>> 8) & 0xff;
  out[8] = raw.length & 0xff;
  out.set(packed, EXPORT_HEADER);
  return EXPORT_PREFIX + base64urlEncode(out);
}

/** Reads an export code (whitespace from copy-paste is ignored). Never throws. */
export function importCode(code: unknown, content?: ContentDB, nowMs?: number): LoadResult {
  if (typeof code !== "string") return { ok: false, error: "empty" };
  const text = code.replace(/\s+/g, "");
  if (text.length === 0) return { ok: false, error: "empty" };
  if (!text.startsWith(EXPORT_PREFIX)) return { ok: false, error: "format" };
  const bytes = base64urlDecode(text.slice(EXPORT_PREFIX.length));
  if (!bytes || bytes.length < EXPORT_HEADER || bytes[0] !== 1) return { ok: false, error: "format" };
  const crc = ((bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4]) >>> 0;
  const rawLen = ((bytes[5] << 24) | (bytes[6] << 16) | (bytes[7] << 8) | bytes[8]) >>> 0;
  if (rawLen > MAX_RAW_BYTES) return { ok: false, error: "size" };
  const raw = lzDecompress(bytes.subarray(EXPORT_HEADER), rawLen);
  if (!raw) return { ok: false, error: "format" };
  if (crc32(raw) !== crc) return { ok: false, error: "checksum" };
  return fromJson(utf8Decode(raw), content, nowMs);
}
