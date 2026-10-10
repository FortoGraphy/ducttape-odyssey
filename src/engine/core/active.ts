// Active play (GDD 2.3): hold-to-mine with heat, scanner pulse, salvage blobs, combo and Overdrive.
import * as B from "../big";
import { OK, addBuff, addCredits, emit, fail, incomeSeconds, nextUid, roll, rollInt, rollRange, stat } from "../kernel";
import { Rng } from "../prng";
import type { ActionResult, Big, Game, ItemId, SalvageBlob } from "../types";
import { storeItem } from "./economy";
import { addCombo, bal, balArr, cc, type CoreCache } from "./shared";

const KINDS: readonly SalvageBlob["kind"][] = ["crate", "pod", "wreck", "crystal"];
const SALVAGE_EVERY: readonly number[] = [18, 40];
const WEAR_ACTIVITY: readonly number[] = [1, 1.5, 2];
const PULSE_REVEAL: readonly number[] = [1, 3];
const SALVAGE_SECS: readonly number[] = [15, 40];

/** Starts or stops hold-to-mine. Refused while the laser is locked after an overheat. */
export function setMining(g: Game, on: boolean): ActionResult {
  const a = g.state.active;
  if (!on) {
    a.mining = false;
    return OK;
  }
  if (a.lockUntil > g.state.t) return fail("cooldown");
  a.mining = true;
  return OK;
}

export function tickActive(g: Game, c: CoreCache, dt: number): void {
  const s = g.state;
  const a = s.active;
  const t = s.t;
  const locked = a.lockUntil > t;
  if (a.mining && !locked) {
    a.heat += bal(g, "heatPerSec", 22) * g.mods.heatRate * dt;
    if (a.heat >= 100) {
      a.heat = 100;
      a.mining = false;
      a.lockUntil = t + bal(g, "overheatLock", 5);
      stat(g, "overheats");
      emit(g, { t: "overheat" });
      g.api.say("overheat");
    }
  } else if (a.heat > 0) {
    a.heat -= bal(g, "coolPerSec", 14) * dt;
    if (a.heat < 0) a.heat = 0;
  }
  const holding = a.mining && a.lockUntil <= t;
  c.mineMult = holding ? Math.max(1, bal(g, "activeMult", 4) * g.mods.activeMult) : 1;

  const overdrive = a.overdriveUntil > t;
  if (c.overdriveOn && !overdrive) emit(g, { t: "overdrive", on: false });
  c.overdriveOn = overdrive;
  const act = balArr(g, "wearActivity", WEAR_ACTIVITY);
  c.activity = overdrive ? bal(g, "overdriveWear", act[2] ?? 2) : holding ? (act[1] ?? 1.5) : (act[0] ?? 1);

  if (t >= a.nextSalvageAt) {
    spawnSalvage(g);
    const range = balArr(g, "salvageEvery", SALVAGE_EVERY);
    a.nextSalvageAt = t + rollRange(g, range[0], range[1] ?? range[0]) / Math.max(0.1, g.mods.salvageRate);
  }

  const drones = s.drones.salvager;
  if (drones > 0 && a.salvage.length > 0) {
    c.salvagerAcc += dt * drones;
    if (c.salvagerAcc >= bal(g, "droneSalvageEvery", 30)) {
      c.salvagerAcc = 0;
      collect(g, c, a.salvage[0].uid, bal(g, "droneSalvageEff", 0.5));
    }
  }
}

/** Once per second: drop blobs that drifted away. */
export function activeSecond(g: Game): void {
  const s = g.state;
  const list = s.active.salvage;
  for (let i = list.length - 1; i >= 0; i--) if (s.t >= list[i].born + list[i].ttl) list.splice(i, 1);
}

/** Adds one salvage blob unless the screen is already full. Returns its uid or 0. */
export function spawnSalvage(g: Game): number {
  const s = g.state;
  const list = s.active.salvage;
  if (list.length >= bal(g, "salvageMax", 5)) return 0;
  const blob: SalvageBlob = {
    uid: nextUid(g),
    kind: KINDS[Math.floor(roll(g) * KINDS.length)],
    x: 0.08 + roll(g) * 0.84,
    y: 0.12 + roll(g) * 0.6,
    born: s.t,
    ttl: bal(g, "salvageTtl", 45),
    seed: Math.floor(roll(g) * 0x7fffffff),
  };
  list.push(blob);
  emit(g, { t: "salvageSpawn", uid: blob.uid });
  return blob.uid;
}

/** Scanner pulse: reveals 1-3 blobs at once. `stats.pulses` and `flags.pulseAt` let the scan in progress advance. */
export function pulseScan(g: Game): ActionResult {
  const s = g.state;
  const a = s.active;
  if (a.scanReadyAt > s.t) return fail("cooldown");
  a.scanReadyAt = s.t + bal(g, "pulseCooldown", 20);
  const reveal = balArr(g, "pulseReveal", PULSE_REVEAL);
  const n = rollInt(g, reveal[0], Math.max(reveal[0], reveal[1] ?? reveal[0]));
  for (let i = 0; i < n; i++) spawnSalvage(g);
  stat(g, "pulses");
  s.flags.pulseAt = s.t;
  addCombo(g, bal(g, "comboPulse", 8));
  return OK;
}

function collect(g: Game, c: CoreCache, uid: number, scale: number): ActionResult {
  const s = g.state;
  const list = s.active.salvage;
  let idx = -1;
  for (let i = 0; i < list.length; i++) if (list[i].uid === uid) idx = i;
  if (idx < 0) return fail("noTarget");
  const blob = list[idx];
  list.splice(idx, 1);

  const rng = new Rng(blob.seed);
  const value = scale * g.mods.salvageValue;
  const kindRoll = rng.next();
  let credits: Big = { m: 0, e: 0 };
  let item: ItemId | undefined;
  // wrecks are where the rare finds are; crystals and pods lean toward raw material
  const rare = blob.kind === "wreck" ? 0.16 : 0.05;
  const itemChance = blob.kind === "crystal" || blob.kind === "pod" ? 0.5 : 0.2;
  let rareHit = false;
  if (kindRoll < rare && scale >= 1) {
    if (rng.next() < 0.4) rareHit = g.api.grantBlueprint() !== null;
    if (!rareHit) rareHit = g.api.grantCard() !== null;
  }
  if (!rareHit && kindRoll < rare + itemChance && g.rates.mix.length > 0) {
    const mix = g.rates.mix;
    item = mix[Math.floor(rng.next() * mix.length) % mix.length].item;
    storeItem(g, c, item, B.mulN(g.api.miningScale(), rng.range(1, 3) * value), false);
  } else {
    const range = balArr(g, "salvageIncomeSecs", SALVAGE_SECS);
    const secs = rng.range(range[0], range[1] ?? range[0]);
    credits = B.mulN(incomeSeconds(g, secs), value * (rareHit ? 0.25 : 1));
    addCredits(g, credits);
  }
  stat(g, "salvage");
  addCombo(g, bal(g, "comboSalvage", 12));
  emit(g, item ? { t: "salvageCollected", uid, credits, item } : { t: "salvageCollected", uid, credits });
  return OK;
}

/** Player taps a blob: 15-40 s of income, or mined items, sometimes a card or a blueprint. */
export function collectSalvage(g: Game, uid: number): ActionResult {
  return collect(g, cc(g), uid, 1);
}

/** At full combo: all production x3 for 20 s, wear x2. */
export function triggerOverdrive(g: Game): ActionResult {
  const s = g.state;
  const a = s.active;
  if (a.overdriveUntil > s.t) return fail("busy");
  if (a.combo < bal(g, "comboMax", 100)) return fail("requirement");
  const secs = bal(g, "overdriveSecs", 20);
  a.combo = 0;
  a.overdriveUntil = s.t + secs;
  addBuff(g, { stat: "allProd", mul: bal(g, "overdriveMult", 3) }, secs, "overdrive");
  cc(g).overdriveOn = true;
  stat(g, "overdrives");
  emit(g, { t: "overdrive", on: true });
  g.api.say("overdrive");
  return OK;
}

/** Resets the transient parts of active play (offline return, prestige). */
export function resetActive(g: Game, full: boolean): void {
  const a = g.state.active;
  a.mining = false;
  a.heat = 0;
  a.lockUntil = 0;
  if (full) {
    a.combo = 0;
    a.overdriveUntil = 0;
    a.scanReadyAt = 0;
    a.salvage.length = 0;
    a.nextSalvageAt = g.state.t + 20;
  }
}
