// Local notification plan for the platform layer. Pure: reads the game, schedules nothing itself.
// The shell calls this when the app goes to the background and hands the result to the OS.
import * as B from "../big";
import { hashSeed } from "../prng";
import type { Game, ItemId, L10n } from "../types";
import { bal, lookup } from "./util";

export interface PlannedNotification {
  id: string;
  inSeconds: number;
  title: L10n;
  body: L10n;
}

export const NOTIFY_MAX = 4;
export const NOTIFY_MIN_LEAD = 5 * 60;
export const NOTIFY_MIN_GAP = 10 * 60;
const HORIZON = 36 * 3600;

type Kind = "attention" | "failure" | "tow" | "wait" | "cargo" | "expedition" | "repair" | "quests";
type Text = { title: L10n; body: L10n };

// Two takes per kind so a daily player does not read the same sentence every evening.
const TEXT: Record<Kind, [Text, Text]> = {
  attention: [
    {
      title: { cs: "Loď potřebuje péči", en: "The ship needs attention" },
      body: {
        cs: "Trup drží pohromadě páska a optimismus. Optimismus nám dochází.",
        en: "The hull is held together by tape and optimism. We are running low on optimism.",
      },
    },
    {
      title: { cs: "Trup pod třiceti procenty", en: "Hull below thirty percent" },
      body: {
        cs: "Nechci nikoho plašit, ale okno na můstku si začalo pískat. Stav se, až budeš mít chvilku.",
        en: "Not to alarm anyone, but the bridge window has started whistling. Drop by when you have a minute.",
      },
    },
  ],
  failure: [
    {
      title: { cs: "Něco je špatně", en: "Something is wrong" },
      body: {
        cs: "Naši situaci bych popsal jako „stabilní“. Asi jako talíř, který už dopadl. Vrať se, prosím.",
        en: "I would call our situation stable, in the way a dropped plate is stable. Please come back.",
      },
    },
    {
      title: { cs: "Porucha pořád trvá", en: "Still broken" },
      body: {
        cs: "Zkoušel jsem to vypnout a zapnout. Teď je to vypnuté. Potřebuju někoho s rukama.",
        en: "I tried turning it off and on again. It is now off. I need someone with hands.",
      },
    },
  ],
  tow: [
    {
      title: { cs: "Odtah dorazil", en: "The tow has arrived" },
      body: {
        cs: "Záchrana je tady. Řidič se ptal, co se stalo. Řekl jsem „plán údržby“ a oba jsme se zasmáli.",
        en: "Rescue is here. The driver asked what happened. I said: maintenance schedule. We both laughed.",
      },
    },
    {
      title: { cs: "Zase se hýbeme", en: "We are moving again" },
      body: {
        cs: "Loď byla odtažena někam do bezpečí. Důstojnost v ceně služby nebyla.",
        en: "The ship has been dragged somewhere safer. Dignity was not included in the service.",
      },
    },
  ],
  wait: [
    {
      title: { cs: "Vyřešilo se to samo", en: "It sorted itself out" },
      body: {
        cs: "Přečkal jsem to, přesně podle plánu. Loď zase funguje. Zásluhy si klidně připiš.",
        en: "I waited it out, exactly as planned. The ship works again. Feel free to take the credit.",
      },
    },
    {
      title: { cs: "Krize zažehnána", en: "Crisis over" },
      body: {
        cs: "Trpělivost zvítězila. Tedy moje trpělivost. Tvoje u toho nebyla.",
        en: "Patience won. My patience, to be precise. Yours was not here.",
      },
    },
  ],
  cargo: [
    {
      title: { cs: "Nákladový prostor je plný", en: "The cargo hold is full" },
      body: {
        cs: "Výtah stojí. Sklad je plný, násypka je plná a já mám plné zuby čekání. Přijď něco prodat.",
        en: "The lift has stopped. The hold is full, the hopper is full, and I am full of opinions. Come sell something.",
      },
    },
    {
      title: { cs: "Už se sem nic nevejde", en: "Nothing fits anymore" },
      body: {
        cs: "Zkoušel jsem bedny skládat na strop. Gravitace byla proti. Sklad tě potřebuje.",
        en: "I tried stacking crates on the ceiling. Gravity disagreed. The hold needs you.",
      },
    },
  ],
  expedition: [
    {
      title: { cs: "Výprava je zpátky", en: "The expedition is back" },
      body: {
        cs: "Posádka se vrátila se suvenýry a nejmíň se stejným počtem končetin, s jakým odešla. Přijď se podívat.",
        en: "The crew returned with souvenirs and at least as many limbs as they left with. Come take a look.",
      },
    },
    {
      title: { cs: "Něco našli", en: "They found something" },
      body: {
        cs: "Výsadek stojí u přechodové komory s bednou a tváří se spokojeně. Radši jsem se neptal.",
        en: "The away team is at the airlock holding a crate and looking pleased. I did not ask.",
      },
    },
  ],
  repair: [
    {
      title: { cs: "Opravy dokončeny", en: "Repairs finished" },
      body: {
        cs: "Boti mají hotovo. Nic nehoří, což se u nás počítá jako státní svátek.",
        en: "The bots are done. Nothing is on fire, which around here counts as a public holiday.",
      },
    },
    {
      title: { cs: "Zase jako staré", en: "Good as old" },
      body: {
        cs: "Všechno je zalátané zpátky do obvyklého pochybného stavu. Záruka pořád propadlá.",
        en: "Everything is patched back to its usual questionable state. The warranty is still expired.",
      },
    },
  ],
  quests: [
    {
      title: { cs: "Nové pracovní příkazy", en: "New work orders" },
      body: {
        cs: "Přes noc dorazily tři čerstvé úkoly. Nikdo je nepodepsal. Jako obvykle.",
        en: "Three fresh tasks arrived overnight. Nobody signed them. Nobody ever does.",
      },
    },
    {
      title: { cs: "Dnešní seznam úkolů", en: "Today's to-do list" },
      body: {
        cs: "Připravil jsem ti tři zakázky. Malé. Nejsem zrůda, jsem počítač přes potrubí.",
        en: "I prepared three jobs for you. Small ones. I am not a monster, I am a plumbing computer.",
      },
    },
  ],
};

const ID: Record<Kind, string> = {
  attention: "attention",
  failure: "attention",
  tow: "rescue",
  wait: "rescue",
  cargo: "cargo",
  expedition: "expedition",
  repair: "repair",
  quests: "quests",
};

function defaultKeep(g: Game, item: ItemId): number {
  const cat = lookup(g.content.items, item)?.category;
  return cat === "raw" ? bal(g, "keepRaw", 0.05) : cat === "refined" ? bal(g, "keepRefined", 0.1) : cat === "component" ? bal(g, "keepComponent", 0.2) : 1;
}

/**
 * Seconds until mining fills the hold, or -1 when it will not. Mined goods above the keep reserve
 * are sold on arrival, so the hold only fills if the reserves still have that much room.
 */
export function cargoFullEta(g: Game): number {
  const r = g.rates;
  if (!(r.cargoCap.m > 0)) return -1;
  const used = B.ratio(r.cargoUsed, r.cargoCap, 1);
  if (used >= 0.999) return 0;
  const inflow = B.cmp(r.mine, r.lift) <= 0 ? r.mine : r.lift;
  if (!(inflow.m > 0) || r.mix.length === 0) return -1;
  const free = 1 - used;
  let room = 0;
  for (const part of r.mix) {
    const keep = lookup(g.state.keep, part.item) ?? defaultKeep(g, part.item);
    const held = lookup(g.state.inv, part.item);
    const mass = lookup(g.content.items, part.item)?.mass ?? 1;
    room += Math.max(0, keep - (held ? B.ratio(B.mulN(held, mass), r.cargoCap, 1) : 0));
  }
  if (room < free * 0.98) return -1;
  const secs = free * B.toNumber(B.div(r.cargoCap, inflow));
  return Number.isFinite(secs) ? secs : -1;
}

/** Seconds until the repair bots clear their queue, or -1 without bots or jobs. */
export function repairEta(g: Game): number {
  const s = g.state;
  const rep = s.repair;
  if (!rep || !(rep.botLevel > 0) || rep.jobs.length === 0) return -1;
  const perSec = (bal(g, "botRepairPerMin", 1.5) / 60) * rep.botLevel * Math.max(0, g.mods.repairSpeed);
  if (!(perSec > 0)) return -1;
  let missing = 0;
  for (const job of rep.jobs) {
    if (job.target === 0) missing += Math.max(0, 100 - s.hull.hp);
    else for (const m of s.modules) if (m.uid === job.target) missing += Math.max(0, 100 - m.hp);
  }
  return missing > 0 ? missing / perSec : -1;
}

/**
 * What to tell the player while they are away: at most four notifications, none sooner than five
 * minutes, at least ten minutes apart. Most urgent kinds win when there are too many.
 */
export function planNotifications(g: Game): PlannedNotification[] {
  const s = g.state;
  const out: PlannedNotification[] = [];
  const day = Math.floor((Number.isFinite(s.wall) ? s.wall : 0) / 86_400_000);
  const lead = Math.max(NOTIFY_MIN_LEAD, bal(g, "notifyMinLead", NOTIFY_MIN_LEAD));
  const gap = Math.max(NOTIFY_MIN_GAP, bal(g, "notifyMinGap", NOTIFY_MIN_GAP));

  const add = (kind: Kind, inSeconds: number): void => {
    if (out.length >= NOTIFY_MAX || !Number.isFinite(inSeconds) || inSeconds < 0) return;
    let at = Math.max(lead, Math.ceil(inSeconds));
    for (let pass = 0; pass < NOTIFY_MAX + 1; pass++) {
      let clash = false;
      for (const o of out) {
        if (Math.abs(o.inSeconds - at) < gap) {
          at = o.inSeconds + gap;
          clash = true;
        }
      }
      if (!clash) break;
    }
    if (at > HORIZON) return;
    const text = TEXT[kind][hashSeed(s.seed, day, kind.length, out.length) & 1];
    out.push({ id: ID[kind], inSeconds: at, title: text.title, body: text.body });
  };

  // priority order: whatever is added first keeps its time, later ones move out of the way
  const failure = s.failure;
  const rescue = failure ? (failure.tow ? failure.tow.eta - s.t : failure.waitUntil > s.t ? failure.waitUntil - s.t : -1) : -1;
  if (failure && rescue < 0) add("failure", bal(g, "notifyAttentionSecs", 1800));
  else if (!failure && s.hull.hp < 30) add("attention", bal(g, "notifyAttentionSecs", 1800));
  if (failure && rescue >= 0) add(failure.tow ? "tow" : "wait", rescue);

  const cargo = cargoFullEta(g);
  // already full when the player left: they saw it, so remind them later rather than at once
  if (cargo >= 0) add("cargo", cargo === 0 ? bal(g, "notifyAttentionSecs", 1800) : cargo);

  let expedition = Infinity;
  for (const e of s.expeditions) if (!e.done && e.end > s.t && e.end < expedition) expedition = e.end;
  if (expedition !== Infinity) add("expedition", expedition - s.t);

  add("repair", repairEta(g));

  if (s.features.quests === 1) add("quests", ((day + 1) * 86_400_000 - s.wall) / 1000);

  out.sort((a, b) => a.inSeconds - b.inSeconds);
  return out;
}
