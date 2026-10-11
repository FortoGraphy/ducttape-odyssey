// Event dialog for state.events.active: illustration, text and choices with their cost, risk tint
// and requirement hints; after a choice the outcome text with a summary of what actually changed.
import { memo, useCallback, useRef } from "react";
import { Image, View, type ImageSourcePropType } from "react-native";

import * as B from "@/engine/big";
import type { Big, Condition, EventChoice, EventEffect, Game } from "@/engine/types";
import { chooseEvent, dismissEvent, eventChoiceBlock, eventChoiceCost } from "@/engine/world";
import { tr, useT } from "@/i18n";
import { content } from "@/content";
import { sfx } from "@/platform/feedback";
import { act, getGame, useGame } from "@/store/game";
import { fmt, itemName, useFmt } from "@/ui/format";
import { Badge, Dialog, MicroLabel, Txt, type BadgeTone, type DialogChoice, type KeyTone } from "@/ui/kit";
import { palette, radius, space } from "@/ui/theme";

type TFn = (key: string, vars?: Record<string, unknown>) => string;

function loadArt(): Record<string, ImageSourcePropType> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return ((require("../../icons.generated") as { eventArt?: Record<string, ImageSourcePropType> }).eventArt ?? {}) as Record<string, ImageSourcePropType>;
  } catch {
    return {};
  }
}
const ART = loadArt();

const RISK_TONE: KeyTone[] = ["mint", "yellow", "red"];

function requirement(c: Condition | undefined, t: TFn): string {
  if (!c) return t("event.reqGeneric");
  if (c.item) return t("event.reqItem", { n: c.item.n, item: itemName(c.item.id) });
  if (c.deck) return t("event.reqDeck", { deck: tr(content.decks[c.deck.id]?.name), level: c.deck.level });
  if (c.crewMin) return t("event.reqCrew", { count: c.crewMin });
  if (c.modulesMin) return t("event.reqModules", { count: c.modulesMin });
  if (c.rep && c.rep.min !== undefined) return t("event.reqRep", { faction: tr(content.factions[c.rep.faction]?.name), n: c.rep.min });
  if (c.feature) return t("event.reqFeature", { feature: t(`feature.${c.feature}`) });
  if (c.all && c.all.length > 0) return requirement(c.all[0], t);
  return t("event.reqGeneric");
}

function costLine(g: Game, choice: EventChoice, t: TFn): string | undefined {
  const parts: string[] = [];
  const credits = eventChoiceCost(g, choice);
  if (credits.m > 0) parts.push(t("event.costCredits", { n: fmt(credits) }));
  const items = choice.cost?.items;
  if (items) for (const id in items) parts.push(`${items[id]}× ${itemName(id)}`);
  return parts.length ? parts.join(" · ") : undefined;
}

interface Snapshot {
  seed: number;
  credits: Big;
  hull: number;
  fuel: number;
  morale: number;
  cargo: Big;
}

interface Change {
  key: string;
  text: string;
  tone: BadgeTone;
}

const snap = (g: Game, seed: number): Snapshot => ({ seed, credits: B.clone(g.state.credits), hull: g.state.hull.hp, fuel: g.state.nav.fuel, morale: g.state.morale, cargo: B.clone(g.rates.cargoUsed) });

function summarize(g: Game, before: Snapshot | null, effects: EventEffect[], t: TFn): Change[] {
  const out: Change[] = [];
  const s = g.state;
  if (before) {
    const up = B.cmp(s.credits, before.credits);
    if (up !== 0) out.push({ key: "cr", text: t(up > 0 ? "event.dCreditsUp" : "event.dCreditsDown", { n: fmt(up > 0 ? B.sub(s.credits, before.credits) : B.sub(before.credits, s.credits)) }), tone: up > 0 ? "good" : "bad" });
    const hull = Math.round(s.hull.hp - before.hull);
    if (hull !== 0) out.push({ key: "hull", text: t("event.dHull", { n: (hull > 0 ? "+" : "–") + Math.abs(hull) }), tone: hull > 0 ? "good" : "bad" });
    const fuel = Math.round(s.nav.fuel - before.fuel);
    if (fuel !== 0) out.push({ key: "fuel", text: t("event.dFuel", { n: (fuel > 0 ? "+" : "–") + Math.abs(fuel) }), tone: fuel > 0 ? "good" : "bad" });
    const morale = Math.round(s.morale - before.morale);
    if (morale !== 0) out.push({ key: "morale", text: t("event.dMorale", { n: (morale > 0 ? "+" : "–") + Math.abs(morale) }), tone: morale > 0 ? "good" : "bad" });
  }
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i];
    const key = `${e.t}${i}`;
    if (e.t === "item") out.push({ key, text: `${e.n >= 0 ? "+" : "–"}${e.scaled ? "" : Math.abs(e.n) + "× "}${itemName(e.item)}`, tone: e.n >= 0 ? "good" : "bad" });
    else if (e.t === "loseCargo") out.push({ key, text: t("event.dCargo", { n: Math.round(e.pct * 100) }), tone: "bad" });
    else if (e.t === "moduleDamage") out.push({ key, text: t("event.dModules"), tone: "bad" });
    else if (e.t === "rep") out.push({ key, text: t("event.dRep", { faction: tr(content.factions[e.faction]?.name), n: (e.n > 0 ? "+" : "–") + Math.abs(e.n) }), tone: e.n > 0 ? "good" : "bad" });
    else if (e.t === "failure") out.push({ key, text: tr(content.failures[e.kind]?.name), tone: "bad" });
    else if (e.t === "blueprint") out.push({ key, text: t("event.dBlueprint"), tone: "info" });
    else if (e.t === "crew") out.push({ key, text: t("event.dCrew"), tone: "good" });
    else if (e.t === "card") out.push({ key, text: t("event.dCard"), tone: "info" });
    else if (e.t === "log") out.push({ key, text: t("event.dLog"), tone: "info" });
    else if (e.t === "codex") out.push({ key, text: t("event.dCodex"), tone: "info" });
    else if (e.t === "rp") out.push({ key, text: t("event.dRp"), tone: e.secs >= 0 ? "good" : "bad" });
    else if (e.t === "buff") out.push({ key, text: t("event.dBuff", { n: Math.round(e.secs / 60) }), tone: "info" });
    else if (e.t === "minigame") out.push({ key, text: t("event.dMinigame"), tone: "warn" });
    else if (!before && e.t === "credits") out.push({ key, text: t(e.secs >= 0 ? "event.dCreditsUp" : "event.dCreditsDown", { n: "" }).trim(), tone: e.secs >= 0 ? "good" : "bad" });
    else if (!before && e.t === "hull") out.push({ key, text: t("event.dHull", { n: (e.pct > 0 ? "+" : "–") + Math.abs(e.pct) }), tone: e.pct > 0 ? "good" : "bad" });
  }
  return out.slice(0, 8);
}

export const EventDialog = memo(function EventDialog({ visible }: { visible: boolean }) {
  const t = useT("world") as TFn;
  useFmt();
  const before = useRef<Snapshot | null>(null);
  // Re-render on anything that changes what the dialog shows: the event, its result and which choices are payable.
  const sig = useGame(
    (g) => {
      const a = g.state.events.active;
      if (!a) return "";
      const def = g.content.events[a.id];
      let blocks = "";
      if (def && a.result === null) for (let i = 0; i < def.choices.length; i++) blocks += eventChoiceBlock(g, def.choices[i]) ?? "-";
      return `${a.id}|${a.seed}|${a.result ? `${a.result.choice}:${a.result.outcome}` : ""}|${blocks}`;
    },
    undefined,
    3,
  );

  const choose = useCallback((index: number) => {
    const g = getGame();
    const a = g.state.events.active;
    if (!a) return;
    before.current = snap(g, a.seed);
    const r = act((gg) => chooseEvent(gg, index));
    if (!r.ok) {
      before.current = null;
      sfx("deny");
    }
  }, []);
  const dismiss = useCallback(() => {
    before.current = null;
    act((g) => dismissEvent(g));
  }, []);

  const g = getGame();
  const a = sig ? g.state.events.active : null;
  const def = a ? g.content.events[a.id] : undefined;
  if (!a || !def) return <Dialog visible={false} title="" choices={[]} />;

  const art = ART[def.art ?? ""] ?? ART[def.type];
  let body = tr(def.text);
  let choices: DialogChoice[];
  let changes: Change[] = [];
  let picked = "";
  let tone: "info" | "good" | "warn" | "bad" = "warn";

  if (a.result) {
    const choice = def.choices[a.result.choice];
    const outcome = choice?.outcomes[a.result.outcome];
    picked = tr(choice?.label);
    body = tr(outcome?.text) || body;
    changes = summarize(g, before.current && before.current.seed === a.seed ? before.current : null, outcome?.effects ?? [], t);
    tone = outcome?.good ? "good" : changes.some((c) => c.tone === "bad") ? "bad" : "info";
    choices = [{ label: t("event.continue"), tone: "orange", onPress: dismiss, testID: "event-continue" }];
  } else {
    let anyOpen = false;
    choices = def.choices.slice(0, 4).map((choice, i) => {
      const block = eventChoiceBlock(g, choice);
      if (!block) anyOpen = true;
      const cost = costLine(g, choice, t);
      const sub = block === "requirement" ? requirement(choice.requires, t) : block === "credits" ? t("event.blockCredits", { cost: cost ?? "" }) : block === "items" ? t("event.blockItems", { cost: cost ?? "" }) : cost;
      return { label: tr(choice.label), sublabel: sub, tone: RISK_TONE[choice.risk] ?? "black", disabled: block !== null, onPress: () => choose(i), testID: `event-choice-${i}` };
    });
    // never a soft lock: when nothing can be taken the engine lets the event be walked away from
    if (!anyOpen) choices = [...choices.slice(0, 3), { label: t("event.walkAway"), tone: "black", onPress: dismiss, testID: "event-walk" }];
  }

  return (
    <Dialog visible={visible} title={tr(def.title)} icon={`ev_${def.type}`} tone={tone} choices={choices} testID="event-dialog">
      {art ? (
        <View style={{ borderRadius: radius.well, overflow: "hidden", backgroundColor: palette.void1, borderWidth: 1, borderColor: palette.void3 }}>
          <Image source={art} resizeMode="cover" style={{ width: "100%", height: 92 }} />
        </View>
      ) : null}
      {picked ? <MicroLabel size="label">{t("event.youChose", { choice: picked })}</MicroLabel> : null}
      <Txt variant="body">{body}</Txt>
      {changes.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {changes.map((c) => (
            <Badge key={c.key} label={c.text} tone={c.tone} />
          ))}
        </View>
      ) : a.result ? (
        <MicroLabel>{t("event.noChange")}</MicroLabel>
      ) : (
        <MicroLabel>{t("event.riskLegend")}</MicroLabel>
      )}
    </Dialog>
  );
});
