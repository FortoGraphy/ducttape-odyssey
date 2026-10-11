// Deck detail sheet: what the deck does, its numbers and multipliers, card slots and the controls
// that belong to one deck (cargo reserves and selling, drone roles). One list drives the whole
// sheet so the cargo inventory stays virtualized.
import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, useWindowDimensions, View, type GestureResponderEvent, type ListRenderItemInfo } from "react-native";

import { content } from "@/content";
import * as B from "@/engine/big";
import {
  buyPreview,
  cargoFree,
  crewCapacity,
  deckCost,
  deckOutput,
  droneCapacity,
  keepOf,
  massOf,
  milestoneCount,
  sellItem,
  sellPrice,
  setDrones,
  setKeep,
  unlockCost,
  type DroneRole,
} from "@/engine/core";
import type { CardId, DeckId, Game, ItemId } from "@/engine/types";
import { cardSlots, equipCard, managerBonus } from "@/engine/world";
import { useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { act, getGame, useGame } from "@/store/game";
import { goTo, type TabId } from "@/store/ui";
import { fmtBonus, fmtPct, fmtRate, fmtTime, itemName, useFmt } from "@/ui/format";
import { CostTag, Icon, IconKey, Key, MicroLabel, QUALITY_COLORS, Rule, Sheet, toast, Txt, useTheme } from "@/ui/kit";
import { space } from "@/ui/theme";

import { BuyKey, deny, popAt, UnlockKey, useLockInfo } from "./DeckCard";
import { bal, cardBonus, cargoFill, DECK_STATS, DRONE_ROLES, hopperCap, hopperFill, isBlocked, KEEP_STEPS, liftLimits, nearestKeepStep, nextShownOutput, offlineCap, offlineEff, requirements, shownOutput } from "./model";

type T = (key: string, vars?: Record<string, unknown>) => string;
type Fmt = ReturnType<typeof useFmt>;

const GOTO: Partial<Record<DeckId, [TabId, string | null]>> = {
  lab: ["meta", "research"],
  greenhouse: ["crew", null],
  quarters: ["crew", null],
  observatory: ["nav", null],
  workshop: ["craft", "workshop"],
  refinery: ["craft", "refinery"],
  fabricator: ["craft", "fabricator"],
};

const POWERED: readonly DeckId[] = ["mining", "lift", "lab", "greenhouse", "refinery", "fabricator", "workshop"];

// ---------- facts -----------------------------------------------------------------------------
// Flat triples [label, value, tone]; a label of "#" starts a section named by the value.

function builtFacts(g: Game, id: DeckId, part: "top" | "mult", t: T, tr: ReturnType<typeof useTr>, fmt: Fmt): string[] {
  const out: string[] = [];
  const head = (title: string) => out.push("#", title, "");
  const push = (label: string, value: string, tone = "") => out.push(label, value, tone);
  const s = g.state;
  const r = g.rates;
  const m = g.mods;
  const def = g.content.decks[id];
  const d = s.decks[id];
  const L = d.level;
  const unit = tr(def.unit);
  const mw = (v: number) => `${fmt(v)} MW`;

  function multFacts(): void {
    head(t("sec.mult"));
    if (def.curve === "exp") push(t("fact.level"), t("fact.levelExp", { level: L, n: milestoneCount(L, g.content.balance.milestones) }));
    else push(t("fact.level"), t("lv", { n: L }));
    let manager = t("fact.nobody");
    if (d.manager) for (const c of s.crew) if (c.uid === d.manager) manager = `${c.name} ${fmtBonus(1 + managerBonus(g, c))}`;
    push(t("fact.manager"), manager);
    const cb = cardBonus(g, id);
    push(t("fact.cards"), cb > 0 ? fmtBonus(1 + cb) : d.cards.length > 0 ? t("fact.cardsGlobal") : t("fact.none"));
    push(t("fact.deckTotal"), `×${fmt(g.deckMult[id])}`);
    for (const k of DECK_STATS[id]) push(t(`stat.${k}`), `×${fmt(m[k])}`);
    if (id === "lift" && s.drones.hauler > 0) push(t("fact.haulers"), `${s.drones.hauler} · ${fmtBonus(1 + bal(g, "haulerLiftBonus", 0.1) * s.drones.hauler)}`);
    if (def.power > 0) push(t("fact.draw"), mw(L * def.power * m.powerUse));
    if (POWERED.indexOf(id) >= 0) push(t("fact.powerEff"), fmtPct(r.power.eff), r.power.eff < 0.995 ? "bad" : "");
  }

  if (part === "mult") {
    multFacts();
    return out;
  }

  head(t("sec.output"));
  push(t("fact.now"), `${fmt(shownOutput(g, id))} ${unit}`, isBlocked(g, id) ? "bad" : "");
  push(t("fact.next"), `${fmt(nextShownOutput(g, id))} ${unit}`, "good");
  if (def.curve === "exp") {
    const ms = g.content.balance.milestones;
    const next: number[] = [];
    for (let i = 0; i < ms.length && next.length < 3; i++) if (ms[i] > L) next.push(ms[i]);
    if (next.length) push(t("fact.milestones"), next.join(" · "));
  }
  if (id === "hangar") {
    const step = Math.max(1, bal(g, "hangarDronesEvery", 4));
    push(t("fact.nextDrone"), t("lv", { n: (Math.floor(L / step) + 1) * step }));
  }
  if (id === "quarters") {
    const step = Math.max(1, bal(g, "quartersCrewEvery", 5));
    push(t("fact.nextBunk"), t("lv", { n: (Math.floor(L / step) + 1) * step }));
  }
  if (id === "refinery" || id === "fabricator" || id === "workshop") {
    const slots = r.craftSlots[id];
    const step = Math.max(1, bal(g, "refinerySlotEvery", 25));
    push(t("fact.lines"), String(slots));
    if (slots < bal(g, "craftSlotsMax", 4)) push(t("fact.nextLine"), t("lv", { n: (Math.floor(L / step) + 1) * step }));
    push(t("fact.queue"), String(s.craft[id].queue.length));
  }

  if (id === "mining") {
    head(t("sec.system"));
    let name = "";
    try {
      name = g.api.currentSystem().name;
    } catch {
      name = "";
    }
    if (name) push(t("fact.systemName"), name);
    push(t("fact.richness"), `×${fmt(r.richness)}`);
    push(t("fact.hopper"), `${fmt(s.hopper)} / ${fmt(hopperCap(g))} (${fmtPct(hopperFill(g))})`, hopperFill(g) >= 0.98 ? "warn" : "");
    for (const mix of r.mix) push(itemName(mix.item), `${fmtPct(mix.share)} · ${fmtRate(B.mulN(r.mine, mix.share))}`);
  } else if (id === "lift") {
    head(t("sec.throughput"));
    push(t("fact.mineRate"), fmtRate(r.mine));
    push(t("fact.liftRate"), fmtRate(r.lift));
    const ratio = r.mine.m > 0 ? B.toNumber(B.div(r.lift, r.mine)) : 1;
    if (liftLimits(g)) push(t("fact.verdict"), t("fact.liftSlow", { pct: fmtPct(1 - ratio) }), "bad");
    else push(t("fact.verdict"), t("fact.liftOk", { pct: fmtPct(Math.min(9.99, ratio - 1)) }), "good");
    push(t("fact.hopper"), fmtPct(hopperFill(g)));
  } else if (id === "cargo") {
    head(t("sec.hold"));
    push(t("fact.used"), `${fmt(r.cargoUsed)} / ${fmt(r.cargoCap)} (${fmtPct(cargoFill(g))})`, cargoFill(g) >= 0.98 ? "warn" : "");
    push(t("fact.free"), fmt(cargoFree(g)));
  } else if (id === "reactor") {
    const p = r.power;
    head(t("sec.supply"));
    const cells = bal(g, "reactorBasePower", 30) * m.powerOut;
    const own = B.toNumber(deckOutput(g, "reactor")) * m.powerOut;
    push(t("fact.cells"), mw(cells));
    push(tr(def.name), mw(own));
    if (p.supply - cells - own > 0.05) push(t("fact.modules"), mw(p.supply - cells - own));
    else if (p.supply - cells - own < -0.05) push(t("fact.failureLoss"), mw(p.supply - cells - own), "bad");
    push(t("fact.total"), mw(p.supply), "good");
    head(t("sec.demand"));
    const rows: { id: DeckId; mw: number }[] = [];
    let sum = 0;
    for (const k in g.content.decks) {
      const dk = g.content.decks[k as DeckId];
      const v = s.decks[dk.id].level * dk.power * m.powerUse;
      if (v > 0) rows.push({ id: dk.id, mw: v });
      sum += v;
    }
    rows.sort((a, b) => b.mw - a.mw);
    for (const row of rows) push(tr(g.content.decks[row.id].name), `${mw(row.mw)} · ${fmtPct(p.demand > 0 ? row.mw / p.demand : 0)}`);
    if (p.demand - sum > 0.05) push(t("fact.modules"), `${mw(p.demand - sum)} · ${fmtPct((p.demand - sum) / p.demand)}`);
    push(t("fact.total"), mw(p.demand), p.eff < 0.995 ? "bad" : "");
    push(t("fact.powerEff"), fmtPct(p.eff), p.eff < 0.995 ? "bad" : "good");
  } else if (id === "bridge") {
    head(t("sec.bridge"));
    push(t("fact.broker"), fmtPct(bal(g, "brokerFee", 0.6) * m.sellValue * m.creditGain));
    push(t("fact.offEff"), fmtPct(offlineEff(g)));
    push(t("fact.offCap"), fmtTime(offlineCap(g)));
  } else if (id === "lab") {
    head(t("sec.use"));
    push(t("fact.rpNow"), fmt(s.rp));
  } else if (id === "greenhouse") {
    head(t("sec.use"));
    const grow = shownOutput(g, id);
    const share = Math.min(1, Math.max(0, bal(g, "greenhouseCoffeeShare", 0.5)));
    push(itemName("organics"), fmtRate(B.mulN(grow, 1 - share)));
    push(itemName("coffee"), fmtRate(B.mulN(grow, share)));
    push(t("fact.coffeeUse"), `${fmt(s.crew.length * bal(g, "coffeePerCrewMin", 1) * m.coffeeUse)}/min`);
  } else if (id === "quarters") {
    head(t("sec.use"));
    push(t("fact.crew"), `${s.crew.length}/${crewCapacity(g)}`);
    push(t("fact.morale"), fmtPct(s.morale / 100));
  } else if (id === "observatory") {
    head(t("sec.use"));
    push(t("fact.scanTime"), fmtTime(bal(g, "scanSecs", 60) / Math.max(0.01, m.scanSpeed)));
  }
  return out;
}

function lockedFacts(g: Game, id: DeckId, t: T, tr: ReturnType<typeof useTr>, fmt: Fmt): string[] {
  const out: string[] = ["#", t("sec.needs"), ""];
  const pay = B.cmp(g.state.credits, unlockCost(g, id)) >= 0;
  out.push(t("fact.credits"), `${fmt(g.state.credits)} / ${fmt(unlockCost(g, id))}`, pay ? "good" : "bad");
  for (const r of requirements(g, id)) {
    const tone = r.ok ? "good" : "bad";
    if (r.kind === "item") out.push(itemName(r.item as ItemId), `${fmt(r.have)} / ${fmt(r.need)}`, tone);
    else if (r.kind === "deck") out.push(tr(g.content.decks[r.deck as DeckId].name), t("lvNeed", { have: r.have, need: r.need }), tone);
    else out.push(t("fact.chapter"), `${r.have} / ${r.need}`, tone);
  }
  return out;
}

const Facts = memo(function Facts({ id, built, part = "top" }: { id: DeckId; built: boolean; part?: "top" | "mult" }) {
  const t = useT("ship") as unknown as T;
  const tr = useTr();
  const fmt = useFmt();
  const facts = useGame((g) => (built ? builtFacts(g, id, part, t, tr, fmt) : lockedFacts(g, id, t, tr, fmt)), undefined, 3);
  const rows = [];
  for (let i = 0; i < facts.length; i += 3) {
    if (facts[i] === "#") rows.push(<Rule key={i} label={facts[i + 1]} gap={2} />);
    else {
      rows.push(
        <View key={i} style={styles.fact}>
          <Txt variant="body" color="inkDim" numberOfLines={1} style={styles.factLabel}>
            {facts[i]}
          </Txt>
          <Txt variant="bodyBold" color={facts[i + 2] || "ink"} numberOfLines={1} tabular style={styles.factValue}>
            {facts[i + 1]}
          </Txt>
        </View>,
      );
    }
  }
  return <View>{rows}</View>;
});

// ---------- costs -----------------------------------------------------------------------------

const Costs = memo(function Costs({ id }: { id: DeckId }) {
  const t = useT("ship");
  const fmt = useFmt();
  const s = useGame(
    (g) => {
      const cr = g.state.credits;
      const c1 = deckCost(g, id, 1);
      const c10 = deckCost(g, id, 10);
      const c100 = deckCost(g, id, 100);
      return { c1: fmt(c1), c10: fmt(c10), c100: fmt(c100), a1: B.cmp(cr, c1) >= 0, a10: B.cmp(cr, c10) >= 0, a100: B.cmp(cr, c100) >= 0 };
    },
    undefined,
    2,
  );
  const cell = (n: number, amount: string, ok: boolean) => (
    <View style={styles.costCell}>
      <MicroLabel>{t("cost.levels", { count: n })}</MicroLabel>
      <CostTag icon="coin" amount={amount} affordable={ok} size="sm" boxed />
    </View>
  );
  return (
    <View>
      <Rule label={t("sec.cost")} gap={2} />
      <View style={styles.costRow}>
        {cell(1, s.c1, s.a1)}
        {cell(10, s.c10, s.a10)}
        {cell(100, s.c100, s.a100)}
      </View>
    </View>
  );
});

// ---------- card slots ------------------------------------------------------------------------

const CardRow = memo(function CardRow({ card, lvl, slot, deck, equipped }: { card: CardId; lvl: number; slot: number; deck: DeckId; equipped: boolean }) {
  const t = useT("ship");
  const tr = useTr();
  const theme = useTheme();
  const def = content.cards[card];
  const press = useCallback(() => {
    const res = act((g) => equipCard(g, deck, equipped ? null : card, slot));
    if (!res.ok) return deny();
    sfx("moduleInstall");
    haptic("impact");
    toast(t(equipped ? "cards.removed" : "cards.equipped", { card: tr(def.name) }), "good");
  }, [deck, card, slot, equipped, t, tr, def]);
  return (
    <View style={[styles.cardRow, { borderColor: equipped ? theme.orange : theme.rule }]}>
      <View style={[styles.rarity, { backgroundColor: QUALITY_COLORS[Math.min(4, def.rarity + 1)] }]} />
      <Icon name="card" size={24} chip />
      <View style={styles.cardText}>
        <Txt variant="bodyBold" numberOfLines={1}>
          {`${tr(def.name)} · ${t("lv", { n: lvl })}`}
        </Txt>
        <Txt variant="label" color="inkDim" numberOfLines={2} style={styles.small}>
          {tr(def.desc)}
        </Txt>
      </View>
      <Key testID={`${equipped ? "unequip" : "equip"}-${card}`} label={t(equipped ? "cards.remove" : "cards.equip")} size="sm" tone={equipped ? "black" : "cobalt"} width={84} onPress={press} />
    </View>
  );
});

const CardSlots = memo(function CardSlots({ id }: { id: DeckId }) {
  const t = useT("ship");
  const theme = useTheme();
  const s = useGame(
    (g) => {
      let owned = "";
      for (const cid in g.state.cards) if (g.content.cards[cid]?.deck === id && g.state.cards[cid].n >= 1) owned += `${owned ? "|" : ""}${cid}:${g.state.cards[cid].lvl}`;
      return { on: g.state.features.cards === 1, eq: g.state.decks[id].cards.join("|"), owned, slots: cardSlots(g) };
    },
    undefined,
    3,
  );
  const eq = s.eq ? s.eq.split("|") : [];
  const owned = s.owned ? s.owned.split("|").map((x) => x.split(":")) : [];
  const lvlOf = (cid: string): number => Number(owned.find((o) => o[0] === cid)?.[1] ?? 1);
  const spare = owned.filter((o) => eq.indexOf(o[0]) < 0);
  const slots = [];
  for (let i = 0; i < s.slots; i++) {
    slots.push(
      eq[i] && content.cards[eq[i]] ? (
        <CardRow key={eq[i]} card={eq[i]} lvl={lvlOf(eq[i])} slot={i} deck={id} equipped />
      ) : (
        <View key={`slot${i}`} style={[styles.emptySlot, { borderColor: theme.inkDim }]}>
          <Icon name={s.on ? "card" : "lock"} size={16} color="inkDim" />
          <MicroLabel size="label">{t("cards.empty", { n: i + 1 })}</MicroLabel>
        </View>
      ),
    );
  }
  return (
    <View style={styles.block}>
      <Rule label={t("sec.cards")} gap={2} />
      {slots}
      {!s.on ? (
        <Txt variant="label" color="inkDim">
          {t("cards.locked")}
        </Txt>
      ) : spare.length === 0 && eq.length < s.slots ? (
        <Txt variant="label" color="inkDim">
          {t("cards.none")}
        </Txt>
      ) : null}
      {spare.length > 0 ? <MicroLabel>{t("cards.owned")}</MicroLabel> : null}
      {spare.map((o) => (
        <CardRow key={o[0]} card={o[0]} lvl={Number(o[1])} slot={Math.min(eq.length, s.slots - 1)} deck={id} equipped={false} />
      ))}
    </View>
  );
});

// ---------- hangar ----------------------------------------------------------------------------

const DroneRoles = memo(function DroneRoles() {
  const t = useT("ship");
  const s = useGame((g) => ({ ...g.state.drones, cap: droneCapacity(g) }), undefined, 2);
  const used = s.hauler + s.probe + s.salvager + s.fixer;
  const change = useCallback((role: DroneRole, delta: number) => {
    const g = getGame();
    const res = act((game) => setDrones(game, role, g.state.drones[role] + delta));
    if (!res.ok) return deny();
    sfx("toggle");
    haptic("detent");
  }, []);
  const g = getGame();
  const vars: Record<DroneRole, Record<string, string | number>> = {
    hauler: { pct: Math.round(bal(g, "haulerLiftBonus", 0.1) * 100) },
    probe: { pct: Math.round(bal(g, "probeYield", 0.04) * 100) },
    salvager: { secs: bal(g, "droneSalvageEvery", 30) },
    fixer: { pct: Math.round(bal(g, "fixerBonus", 0.25) * 100) },
  };
  return (
    <View style={styles.block}>
      <Rule label={t("sec.drones")} gap={2} />
      <View style={styles.fact}>
        <Txt variant="body" color="inkDim" style={styles.factLabel}>
          {t("drones.assigned")}
        </Txt>
        <Txt variant="bodyBold" color={used >= s.cap ? "warn" : "ink"}>{`${used}/${t("drones.count", { count: s.cap })}`}</Txt>
      </View>
      {DRONE_ROLES.map((role) => (
        <View key={role} style={styles.droneRow}>
          <Icon name="drone" size={24} chip />
          <View style={styles.cardText}>
            <Txt variant="bodyBold" numberOfLines={1}>
              {t(`drones.${role}.name`)}
            </Txt>
            <Txt variant="label" color="inkDim" numberOfLines={3} style={styles.small}>
              {t(`drones.${role}.desc`, vars[role])}
            </Txt>
          </View>
          <IconKey testID={`drone-minus-${role}`} icon="minus" size="sm" width={44} disabled={s[role] <= 0} onPress={() => change(role, -1)} accessibilityLabel={t("drones.less", { role: t(`drones.${role}.name`) })} />
          <Txt variant="heading" align="center" style={styles.count} testID={`drone-count-${role}`}>
            {String(s[role])}
          </Txt>
          <IconKey testID={`drone-plus-${role}`} icon="plus" size="sm" width={44} tone={used < s.cap ? "orange" : "black"} onPress={() => change(role, 1)} accessibilityLabel={t("drones.more", { role: t(`drones.${role}.name`) })} />
        </View>
      ))}
    </View>
  );
});

// ---------- cargo -----------------------------------------------------------------------------

const CARGO_ROW_H = 60;

function cargoSig(g: Game): string {
  const ids: ItemId[] = [];
  const items = g.content.items;
  for (const id in g.state.inv) if (items[id] && massOf(items[id]) > 0 && g.state.inv[id].m > 0) ids.push(id);
  ids.sort((a, b) => items[a].tier - items[b].tier || items[b].value - items[a].value || (a < b ? -1 : 1));
  return ids.join("|");
}

const CargoRow = memo(function CargoRow({ item }: { item: ItemId }) {
  const t = useT("ship");
  const fmt = useFmt();
  const theme = useTheme();
  const s = useGame(
    (g) => {
      const have = g.state.inv[item] ?? B.ZERO;
      const price = sellPrice(g, item);
      return { have: fmt(have), price: fmt(price), total: fmt(B.mul(have, price)), step: nearestKeepStep(keepOf(g, item)) };
    },
    undefined,
    2,
  );
  const step = useCallback(
    (delta: number) => {
      const next = Math.min(KEEP_STEPS.length - 1, Math.max(0, s.step + delta));
      if (next === s.step) return deny();
      act((g) => setKeep(g, item, KEEP_STEPS[next]));
      sfx("knobTick");
      haptic("detent");
    },
    [item, s.step],
  );
  const sell = useCallback(
    (e: GestureResponderEvent) => {
      const g = getGame();
      const have = g.state.inv[item];
      const credits = have ? B.mul(have, sellPrice(g, item)) : B.ZERO;
      const res = act((game) => sellItem(game, item, "all"));
      if (!res.ok) return deny();
      sfx("coin");
      haptic("impact");
      popAt(e, `+${fmt(credits)}`, "warn");
    },
    [item, fmt],
  );
  return (
    <View testID={`cargo-${item}`} style={[styles.cargoRow, { borderBottomColor: theme.rule }]}>
      <Icon name={content.items[item].icon} size={24} chip />
      <View style={styles.cardText}>
        <Txt variant="bodyBold" numberOfLines={1}>
          {itemName(item)}
        </Txt>
        <Txt variant="label" color="inkDim" numberOfLines={1} tabular>
          {`${s.have} · ${s.price}/${t("cargo.each")}`}
        </Txt>
      </View>
      <IconKey testID={`keep-minus-${item}`} icon="minus" size="sm" width={36} onPress={() => step(-1)} accessibilityLabel={t("cargo.keepLess", { item: itemName(item) })} />
      <View style={styles.keep}>
        <MicroLabel align="center">{t("cargo.keep")}</MicroLabel>
        <Txt variant="bodyBold" align="center" tabular testID={`keep-${item}`}>
          {s.step === KEEP_STEPS.length - 1 ? t("cargo.keepAll") : fmtPct(KEEP_STEPS[s.step])}
        </Txt>
      </View>
      <IconKey testID={`keep-plus-${item}`} icon="plus" size="sm" width={36} onPress={() => step(1)} accessibilityLabel={t("cargo.keepMore", { item: itemName(item) })} />
      <Key testID={`sell-${item}`} icon="sell" size="sm" tone="yellow" width={44} onPress={sell} sound={null} accessibilityLabel={t("cargo.sell", { item: itemName(item), credits: s.total })} />
    </View>
  );
});

// ---------- sheet -----------------------------------------------------------------------------

const Header = memo(function Header({ id, built, onClose }: { id: DeckId; built: boolean; onClose: () => void }) {
  const t = useT("ship");
  const tr = useTr();
  const def = content.decks[id];
  const link = GOTO[id];
  const go = useCallback(() => {
    if (!link) return;
    onClose();
    goTo(link[0], link[1]);
  }, [link, onClose]);
  return (
    <View style={styles.header}>
      <View style={styles.descRow}>
        <Icon name={def.icon} size={32} chip />
        <Txt variant="body" style={styles.cardText}>
          {tr(def.desc)}
        </Txt>
      </View>
      <Facts id={id} built={built} />
      {built && link ? <Key testID="goto" label={t(`goto.${id}`)} icon="right" tone="cobalt" size="sm" onPress={go} /> : null}
      {built && id === "hangar" ? <DroneRoles /> : null}
      {built && id === "cargo" ? (
        <View>
          <Rule label={t("sec.cargo")} gap={2} />
          <Txt variant="label" color="inkDim">
            {t("cargo.help")}
          </Txt>
        </View>
      ) : null}
    </View>
  );
});

/** Below the deck's own controls: the generic numbers every deck has. */
const Tail = memo(function Tail({ id }: { id: DeckId }) {
  return (
    <View style={styles.tail}>
      <Costs id={id} />
      <Facts id={id} built part="mult" />
      <CardSlots id={id} />
    </View>
  );
});

const Footer = memo(function Footer({ id, built, onBuilt }: { id: DeckId; built: boolean; onBuilt: (id: DeckId) => void }) {
  return built ? <BuyFooter id={id} /> : <LockFooter id={id} onBuilt={onBuilt} />;
});

const BuyFooter = memo(function BuyFooter({ id }: { id: DeckId }) {
  const fmt = useFmt();
  const s = useGame((g) => {
    const p = buyPreview(g, id);
    return { levels: p.levels, cost: fmt(p.cost) };
  });
  return (
    <View style={styles.footer}>
      <CostTag icon="coin" amount={s.cost} affordable={s.levels > 0} boxed />
      <BuyKey testID="sheet-buy" id={id} levels={s.levels} flex={1} />
    </View>
  );
});

const LockFooter = memo(function LockFooter({ id, onBuilt }: { id: DeckId; onBuilt: (id: DeckId) => void }) {
  const info = useLockInfo(id);
  return (
    <View style={styles.footer}>
      <CostTag icon="coin" amount={info.costText} affordable={info.pay} boxed />
      <UnlockKey id={id} can={info.can} flex={1} onBuilt={onBuilt} />
    </View>
  );
});

const cargoKey = (item: ItemId): string => item;
const renderCargo = ({ item }: ListRenderItemInfo<ItemId>) => <CargoRow item={item} />;
const NO_ITEMS: ItemId[] = [];

const Body = memo(function Body({ id, built, onClose }: { id: DeckId; built: boolean; onClose: () => void }) {
  const win = useWindowDimensions();
  const isCargo = built && id === "cargo";
  const sig = useGame((g) => (isCargo ? cargoSig(g) : ""), undefined, 3);
  const data = useMemo(() => (sig ? sig.split("|") : NO_ITEMS), [sig]);
  const header = useMemo(() => <Header id={id} built={built} onClose={onClose} />, [id, built, onClose]);
  const tail = useMemo(() => (built ? <Tail id={id} /> : null), [id, built]);
  return (
    <FlatList
      testID="sheet-list"
      data={data}
      keyExtractor={cargoKey}
      renderItem={renderCargo}
      ListHeaderComponent={header}
      ListFooterComponent={tail}
      initialNumToRender={8}
      windowSize={5}
      bounces={false}
      style={{ maxHeight: Math.max(240, win.height * 0.86 - 210) }}
      contentContainerStyle={styles.listContent}
    />
  );
});

export interface DeckSheetProps {
  id: DeckId | null;
  onClose: () => void;
  onBuilt: (id: DeckId) => void;
}

export function DeckSheet({ id, onClose, onBuilt }: DeckSheetProps) {
  const tr = useTr();
  // the sheet keeps showing the last deck while it slides away
  const [shown, setShown] = useState<DeckId | null>(id);
  if (id && id !== shown) setShown(id);
  const deck = shown ?? "mining";
  const built = useGame((g) => g.state.decks[deck].level > 0);
  return (
    <Sheet testID="deck-sheet" visible={id !== null} onClose={onClose} title={shown ? tr(content.decks[shown].name) : ""} scroll={false} footer={shown ? <Footer id={shown} built={built} onBuilt={onBuilt} /> : null}>
      {shown ? <Body key={shown} id={shown} built={built} onClose={onClose} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm, paddingBottom: space.sm },
  tail: { gap: space.sm, paddingTop: space.sm },
  descRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  listContent: { paddingBottom: space.xs },
  fact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, minHeight: 24 },
  factLabel: { flexShrink: 1, minWidth: 0 },
  factValue: { flexShrink: 0, maxWidth: "68%" },
  block: { gap: 6 },
  costRow: { flexDirection: "row", gap: space.sm, paddingTop: 2 },
  costCell: { flex: 1, gap: 2 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 56, borderWidth: 1, borderRadius: 6, paddingVertical: 4, paddingRight: 6, paddingLeft: 10, overflow: "hidden" },
  rarity: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  cardText: { flex: 1, minWidth: 0 },
  small: { lineHeight: 13 },
  emptySlot: { height: 40, borderWidth: 1, borderStyle: "dashed", borderRadius: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, opacity: 0.7 },
  droneRow: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 52 },
  count: { width: 26 },
  cargoRow: { height: CARGO_ROW_H, flexDirection: "row", alignItems: "center", gap: 5, borderBottomWidth: StyleSheet.hairlineWidth },
  keep: { width: 46 },
  footer: { flexDirection: "row", alignItems: "center", gap: space.md },
});
