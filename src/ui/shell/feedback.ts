// Engine event fan-out: the one place that turns EngineEvents into sound, haptics, toasts, number
// pops, viewport effects, LED blinks and KIPP's ticker, plus the music director. Everything is
// rate-limited per kind so a burst of events (buy-max, a long catch-up) never becomes noise.
import { withSequence, withTiming } from "react-native-reanimated";

import type { EngineEvent, Game } from "@/engine/types";
import { t, tr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { onEngineEvent, onPulse, getGame, hasGame } from "@/store/game";
import { fmt, itemName } from "@/ui/format";
import { popNumber, toast } from "@/ui/kit";
import { palette } from "@/ui/theme";

import { musicIntensity, musicScene, type MusicScene } from "./audio";
import { fx, leds, useShell, viewportBox } from "./store";

const last: Record<string, number> = {};

/** True at most once per `ms` for a key. */
function gate(key: string, ms: number): boolean {
  const now = Date.now();
  if (now - (last[key] ?? 0) < ms) return false;
  last[key] = now;
  return true;
}

const w = (key: string, vars?: Record<string, unknown>): string => t(`world:${key}`, vars) as string;

function blink(led: (typeof leds)[keyof typeof leds], ms = 500): void {
  led.set(withSequence(withTiming(1, { duration: 40 }), withTiming(0, { duration: ms })));
}

let wonderUntil = 0;

function handle(ev: EngineEvent, g: Game): void {
  const c = g.content;
  switch (ev.t) {
    case "purchase":
      if (ev.milestone) {
        sfx("milestone");
        haptic("success");
        fx.burst("levelUp");
        toast(w("fx.milestone", { deck: tr(c.decks[ev.deck]?.name), level: g.state.decks[ev.deck].level }), { tone: "good", icon: c.decks[ev.deck]?.icon });
      } else if (gate("buy", 70)) {
        sfx(ev.levels > 1 ? "buyMax" : "buy", { volume: 0.7 });
      }
      break;
    case "deckBuilt":
      sfx("levelUp");
      haptic("success");
      fx.burst("levelUp");
      toast(w("fx.deckBuilt", { deck: tr(c.decks[ev.deck]?.name) }), { tone: "good", icon: c.decks[ev.deck]?.icon });
      break;
    case "sold":
      blink(leds.sale, 350);
      if (gate("coin", 8000)) sfx("coin", { volume: 0.25 });
      break;
    case "craftDone":
      if (gate("craft", 1500)) sfx("craftDone", { volume: 0.6 });
      if (ev.quality !== undefined && ev.quality >= 3) {
        haptic("success");
        toast(w("fx.craftFine", { item: itemName(Object.keys(c.recipes[ev.recipe]?.outputs ?? {})[0] ?? ""), q: w(`quality.${ev.quality}`) }), "good");
      }
      break;
    case "moduleBroken": {
      const inst = g.state.modules.find((m) => m.uid === ev.uid);
      if (gate("alarm", 2500)) sfx("moduleBreak");
      haptic("error");
      fx.shake(0.6);
      fx.burst("spark");
      blink(leds.alert, 1500);
      toast(w("fx.moduleBroken", { item: inst ? itemName(inst.item) : "" }), { tone: "bad", icon: "warning" });
      break;
    }
    case "moduleRepaired": {
      const inst = g.state.modules.find((m) => m.uid === ev.uid);
      if (gate("repaired", 800)) {
        sfx("repairDone");
        haptic("success");
        toast(w("fx.moduleRepaired", { item: inst ? itemName(inst.item) : w("fx.hull") }), "good");
      }
      break;
    }
    case "hullDamage":
      if (gate("impact", 300)) {
        sfx(ev.pct >= 15 ? "explosion" : "impact");
        haptic(ev.pct >= 15 ? "heavy" : "impact");
        fx.shake(Math.min(1, 0.3 + ev.pct / 30));
        fx.burst(ev.pct >= 15 ? "explosion" : "impact");
        fx.flash(palette.red1, 160);
        blink(leds.alert, 900);
      }
      break;
    case "salvageSpawn":
      if (gate("ping", 2500)) sfx("scanPing", { volume: 0.35 });
      break;
    case "salvageCollected": {
      const tapped = Date.now() - viewportBox.tapAt < 400;
      const x = tapped ? viewportBox.tapX : viewportBox.width * 0.5;
      const y = tapped ? viewportBox.tapY : viewportBox.height * 0.4;
      if (gate("collect", 60)) {
        sfx("collect");
        haptic("tap");
      }
      if (viewportBox.width > 0) {
        fx.burst("collect", x / viewportBox.width, y / Math.max(1, viewportBox.height));
        popNumber(ev.item ? `+${itemName(ev.item)}` : `+${fmt(ev.credits)}`, x, y - 14, ev.item ? "info" : "good");
      }
      break;
    }
    case "overheat":
      sfx("overheat");
      haptic("warning");
      fx.flash(palette.orange, 200);
      toast(w("fx.overheat"), { tone: "warn", icon: "heat" });
      break;
    case "overdrive":
      if (ev.on) {
        sfx("overdrive");
        haptic("heavy");
        fx.flash(palette.yellow, 220);
        fx.burst("levelUp");
      } else {
        sfx("uiClose", { volume: 0.6 });
      }
      break;
    case "eventStarted":
      sfx("eventOpen");
      haptic("warning");
      break;
    case "eventResolved":
      sfx(ev.good ? "success" : "fail");
      haptic(ev.good ? "success" : "error");
      if (!ev.good) fx.shake(0.3);
      break;
    case "failureStarted":
      sfx("alarm");
      haptic("error");
      fx.shake(1);
      fx.flash(palette.red1, 260);
      blink(leds.alert, 2500);
      toast(tr(c.failures[ev.kind]?.name), { tone: "bad", title: w("fx.failureTitle"), icon: `fail_${ev.kind}` });
      break;
    case "failureCleared":
      sfx(ev.by === "tow" ? "towArrive" : "success");
      haptic("success");
      toast(w(`fx.cleared.${ev.by}`), { tone: "good", title: tr(c.failures[ev.kind]?.name) });
      break;
    case "jumpStart":
      sfx("jumpGo");
      haptic("heavy");
      fx.burst("jump");
      break;
    case "jumpEnd": {
      sfx("arrive");
      haptic("success");
      fx.flash(palette.bone2, 180);
      const sys = g.api.currentSystem();
      wonderUntil = Date.now() + 25_000;
      toast(w("fx.arrived", { name: sys.name, depth: sys.depth }), { tone: "info", icon: `star_${sys.star}` });
      break;
    }
    case "discovery":
      wonderUntil = Date.now() + 20_000;
      if (gate("discovery", 1500)) {
        sfx("discovery");
        haptic("success");
        fx.burst("scan");
        toast(w("fx.discovery"), { tone: "info", icon: "book" });
      }
      break;
    case "expeditionDone":
      sfx("notify");
      haptic("success");
      toast(w("fx.expeditionDone"), { tone: "good", icon: "claim" });
      break;
    case "crewJoined": {
      const m = g.state.crew.find((x) => x.uid === ev.uid);
      sfx("levelUp");
      haptic("success");
      toast(w("fx.crewJoined", { name: m?.name ?? "" }), { tone: "good", icon: "crew" });
      break;
    }
    case "cardFound":
      sfx("collect");
      haptic("success");
      toast(w("fx.cardFound", { name: tr(c.cards[ev.card]?.name) }), { tone: "good", icon: "card" });
      break;
    case "blueprint":
      sfx("discovery");
      haptic("success");
      toast(w("fx.blueprint", { item: itemName(Object.keys(c.recipes[ev.recipe]?.outputs ?? {})[0] ?? "") }), { tone: "good", icon: "book" });
      break;
    case "researchDone":
      if (gate("research", 500)) {
        sfx("levelUp");
        haptic("success");
        toast(w("fx.researchDone", { name: tr(c.research[ev.id]?.name) }), { tone: "good", icon: "flask" });
      }
      break;
    case "chapter":
      sfx("chapter");
      haptic("success");
      fx.flash(palette.violet3, 300);
      wonderUntil = Date.now() + 15_000;
      break;
    case "log":
      sfx("notify");
      useShell.getState().setNewLog(true);
      toast(w("fx.log", { title: tr(c.logs.find((l) => l.id === ev.id)?.title) }), { tone: "info", icon: "book" });
      break;
    case "kipp": {
      const def = c.kipp.find((l) => l.id === ev.line);
      const text = tr(def?.text, ev.vars);
      if (text) {
        useShell.getState().pushKipp(text);
        blink(leds.kipp, 1200);
        if (gate("kipp", 1500)) sfx("kippBlip", { volume: 0.6 });
      }
      break;
    }
    case "achievement": {
      const def = c.achievements.find((a) => a.id === ev.id);
      sfx("achievement");
      haptic("success");
      toast(tr(def?.name), { tone: "good", title: w("fx.achievement"), icon: "trophy" });
      break;
    }
    case "questDone":
      sfx("success");
      haptic("success");
      if (!ev.id.startsWith("backlog:")) toast(w("fx.questDone"), { tone: "good", icon: "quest" });
      break;
    case "contractDone":
      sfx("coin");
      haptic("success");
      toast(w("fx.contractDone"), { tone: "good", icon: "coin" });
      break;
    case "prestige":
      sfx("prestige");
      haptic("heavy");
      fx.flash(palette.bone2, 400);
      fx.burst("jump");
      wonderUntil = Date.now() + 30_000;
      break;
    case "minigameRequest":
      haptic("tap");
      break;
    case "feature":
      sfx("levelUp");
      haptic("success");
      toast(w(`feature.${ev.id}`), { tone: "good", title: w("fx.featureTitle"), icon: "unlock" });
      break;
    case "cargoFull":
      blink(leds.alert, 1500);
      if (gate("cargoFull", 90_000)) {
        sfx("alert");
        haptic("warning");
        toast(w("fx.cargoFull"), { tone: "warn", icon: "cargo" });
      }
      break;
    case "toast":
      toast(tr(ev.text), ev.tone);
      break;
    default: {
      // a new EngineEvent variant must be given a voice here
      const unhandled: never = ev;
      void unhandled;
    }
  }
}

const TENSE_EVENTS: Record<string, true> = { meteor: true, pirates: true, flare: true, fault: true, anomaly: true, distress: true };
let lastScene: MusicScene | null = null;
let lastIntensity = -1;
let pulses = 0;

function directMusic(): void {
  if (++pulses % 10 !== 0 || !hasGame()) return;
  const g = getGame();
  const s = g.state;
  const a = s.active;
  const working = (a.mining && a.lockUntil <= s.t) || a.overdriveUntil > s.t;
  const ev = s.events.active;
  let scene: MusicScene = "drift";
  if (s.minigame) scene = "minigame";
  else if (s.failure || (ev && ev.result === null && TENSE_EVENTS[g.content.events[ev.id]?.type ?? ""])) scene = "tension";
  else if (Date.now() < wonderUntil) scene = "wonder";
  else if (s.station.docked) scene = "station";
  else if (working) scene = "work";
  if (scene !== lastScene) {
    lastScene = scene;
    musicScene(scene);
  }
  const intensity = Math.min(1, 0.2 + (working ? 0.3 : 0) + (a.overdriveUntil > s.t ? 0.3 : 0) + (a.combo / 100) * 0.2 + (s.nav.jump ? 0.3 : 0));
  const rounded = Math.round(intensity * 10) / 10;
  if (rounded !== lastIntensity) {
    lastIntensity = rounded;
    musicIntensity(rounded);
  }
}

let installed: (() => void) | null = null;

/** Idempotent. Returns the uninstaller. */
export function installFeedback(): () => void {
  if (installed) return installed;
  const offEvents = onEngineEvent(handle);
  const offPulse = onPulse(directMusic);
  installed = () => {
    offEvents();
    offPulse();
    installed = null;
    lastScene = null;
    lastIntensity = -1;
  };
  return installed;
}
