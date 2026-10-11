// Prestige: Warp Jump (stamps, mutators), Rebuild the Ship (rivets, hull classes, inherited
// blueprints) and Reboot the Cosmos (sparks, constants). Every number comes from the engine.
import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { content } from "@/content";
import * as B from "@/engine/big";
import { getItem, hasFeature } from "@/engine/kernel";
import {
  canReboot,
  canRebuild,
  canWarp,
  hasShipyard,
  hullFrameItem,
  mutatorReward,
  reboot,
  rebuild,
  rebuildBlock,
  rivetsOnRebuild,
  sparksOnReboot,
  stampsOnWarp,
  validMutators,
  warp,
} from "@/engine/meta";
import type { Big, Game, HullClassDef, MutatorDef, RecipeId } from "@/engine/types";
import { coreDepth } from "@/engine/world";
import { useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { act, getGame, useGame } from "@/store/game";
import { fmt, itemName, useFmt } from "@/ui/format";
import { Badge, Card, CostTag, Icon, Key, KeyRow, Led, MicroLabel, ProgressBar, Row, Sheet, toast, Txt, useTheme } from "@/ui/kit";

import { effectIsGood, effectLine } from "./effects";
import { Bullets, ConfirmSheet, Teaser, UpgradeTree } from "./parts";

type Layer = 1 | 2 | 3;
const CURRENCY = { 1: "stamp", 2: "rivet", 3: "spark" } as const;
const MUTATORS: MutatorDef[] = Object.values(content.mutators);
const HULLS: HullClassDef[] = Object.values(content.hulls);
const count = (v: Big): number => Math.min(1e9, B.toNumber(v));

/** Asks the engine what a warp would pay at another lifetime total (no formula lives here). */
function stampsAt(g: Game, lifetime: Big): Big {
  return stampsOnWarp({ ...g, state: { ...g.state, lifetime } });
}

/** Lifetime credits at which the engine pays one more stamp than now, found by bisection. */
function nextStampAt(g: Game): Big | null {
  const now = stampsOnWarp(g);
  let lo = g.state.lifetime.m > 0 ? Math.max(0, B.log10(g.state.lifetime)) : 0;
  let hi = lo + 1;
  let tries = 0;
  while (B.cmp(stampsAt(g, B.fromLog10(hi)), now) <= 0) {
    if (++tries > 40) return null;
    lo = hi;
    hi += 1;
  }
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (B.cmp(stampsAt(g, B.fromLog10(mid)), now) > 0) hi = mid;
    else lo = mid;
  }
  return B.fromLog10(hi);
}

// ---------------------------------------------------------------------------------------------

const LayerChip = memo(function LayerChip({ layer, label, selected, locked, onPick }: { layer: Layer; label: string; selected: boolean; locked: boolean; onPick: (l: Layer) => void }) {
  const theme = useTheme();
  return (
    <Pressable
      testID={`layer-${layer}`}
      onPress={() => onPick(layer)}
      onPressIn={() => haptic("tap")}
      hitSlop={{ top: 7, bottom: 7 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={{
        flex: 1,
        height: 30,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: selected ? theme.orange : theme.rule,
        backgroundColor: selected ? theme.key : "transparent",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        paddingHorizontal: 2,
      }}
    >
      <Icon name={locked ? "lock" : CURRENCY[layer]} size={16} color={selected ? "keyText" : "inkDim"} chip={!locked && !selected && theme.id === "day"} />
      <MicroLabel color={selected ? "keyText" : "ink"} style={{ flexShrink: 1, letterSpacing: 0.3 }}>
        {label}
      </MicroLabel>
    </Pressable>
  );
});

function Wallet({ layer, amount, n, right }: { layer: Layer; amount: string; n: number; right: string }) {
  const t = useT("meta");
  return (
    <Row gap="sm" justify="space-between">
      <Row gap="xs">
        <Icon name={CURRENCY[layer]} size={24} chip />
        <Txt variant="heading" testID={`wallet-${layer}`}>
          {t(`count.${CURRENCY[layer]}`, { count: n, n: amount })}
        </Txt>
      </Row>
      <MicroLabel size="label">{right}</MicroLabel>
    </Row>
  );
}

function Gain({ layer, amount, n, label }: { layer: Layer; amount: string; n: number; label: string }) {
  const t = useT("meta");
  return (
    <Row gap="sm">
      <Icon name={CURRENCY[layer]} size={32} chip />
      <View style={{ flex: 1 }}>
        <MicroLabel size="label">{label}</MicroLabel>
        <Txt variant="title" color={n > 0 ? "ink" : "inkDim"} testID={`gain-${layer}`}>
          {`+${t(`count.${CURRENCY[layer]}`, { count: n, n: amount })}`}
        </Txt>
      </View>
    </Row>
  );
}

// ---------------------------------------------------------------------------------------------
// Layer 1

const MutatorRow = memo(function MutatorRow({ def, selected, onToggle }: { def: MutatorDef; selected: boolean; onToggle: (id: string) => void }) {
  const theme = useTheme();
  const t = useT("meta");
  const tr = useTr();
  return (
    <Pressable
      testID={`mutator-${def.id}`}
      onPress={() => onToggle(def.id)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={tr(def.name)}
      style={{
        backgroundColor: theme.plate,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: selected ? theme.orange : "transparent",
        padding: 10,
        gap: 4,
      }}
    >
      <Row gap="sm">
        <View style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: selected ? theme.orange : theme.well, borderWidth: 1, borderColor: theme.rule, alignItems: "center", justifyContent: "center" }}>
          {selected ? <Icon name="check" size={16} color="onAccent" /> : null}
        </View>
        <Txt variant="bodyBold" style={{ flex: 1 }} numberOfLines={1}>
          {tr(def.name)}
        </Txt>
        <CostTag icon="stamp" amount={`×${fmt(def.reward)}`} boxed />
      </Row>
      <Txt variant="label" color="inkDim" style={{ letterSpacing: 0.2 }}>
        {tr(def.desc)}
      </Txt>
      <Row gap="sm" wrap>
        {def.effects.map((e, i) => (
          <Txt key={i} variant="label" color={effectIsGood(e) ? "good" : "bad"}>
            {effectLine(e, t)}
          </Txt>
        ))}
      </Row>
    </Pressable>
  );
});

function WarpLayer({ tree }: { tree: boolean }) {
  const t = useT("meta");
  const tr = useTr();
  useFmt();
  const [picked, setPicked] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const s = useGame(
    (g) => {
      const p = g.state.prestige;
      const gain = stampsOnWarp(g);
      return {
        open: hasFeature(g, "warp"),
        can: canWarp(g),
        stamps: fmt(p.stamps),
        stampsN: count(p.stamps),
        warps: p.warps,
        gain: fmt(gain),
        gainN: count(gain),
        depth: g.state.nav.depth,
        core: coreDepth(g),
        active: p.mutators.join(","),
        activeReward: mutatorReward(g, p.mutators),
        lifetime: fmt(g.state.lifetime),
      };
    },
    undefined,
    3,
  );
  const curve = useGame(
    (g) => {
      const next = nextStampAt(g);
      const life = g.state.lifetime.m > 0 ? g.state.lifetime : B.ONE;
      return `${next ? fmt(next) : ""}|${fmt(stampsAt(g, B.mulN(life, 10)))}|${fmt(stampsAt(g, B.mulN(life, 1000)))}|${fmt(stampsAt(g, B.mul(life, B.make(1, 6))))}`;
    },
    undefined,
    10,
  ).split("|");

  const slots = Number(content.balance.mutatorSlots ?? 2);
  const reward = mutatorReward(getGame(), picked);
  const toggle = useCallback(
    (id: string) => {
      if (picked.includes(id)) {
        haptic("tap");
        setPicked(picked.filter((x) => x !== id));
        return;
      }
      const next = [...picked, id];
      if (!validMutators(getGame(), next)) {
        sfx("deny");
        haptic("error");
        toast(t("warp.mutatorFull"), "warn");
        return;
      }
      haptic("detent");
      sfx("toggle");
      setPicked(next);
    },
    [picked, t],
  );

  const doWarp = useCallback(() => {
    const before = stampsOnWarp(getGame());
    const res = act((g) => warp(g, picked));
    setConfirm(false);
    if (res.ok) {
      sfx("prestige");
      haptic("heavy");
      toast(t("warp.done", { stamps: t("count.stamp", { count: count(before), n: fmt(before) }) }), { tone: "good", icon: "stamp" });
      setPicked([]);
    } else {
      sfx("deny");
      toast(t(`block.${res.reason}`), "bad");
    }
  }, [picked, t]);

  if (tree) {
    return (
      <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
        <Wallet layer={1} amount={s.stamps} n={s.stampsN} right={t("tree.stampsHint")} />
        <UpgradeTree layer={1} />
      </ScrollView>
    );
  }

  const gateName = itemName("wormhole_gate");
  const pickedNames = picked.map((id) => tr(content.mutators[id]?.name)).join(" + ");
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
        {!s.open ? (
          <Teaser icon="stamp" title={t("warp.title")} text={t("warp.pitch")} how={t("warp.how", { gate: gateName })}>
            <ProgressBar value={s.core > 0 ? s.depth / s.core : 0} tone="cobalt" />
            <MicroLabel size="label">{t("warp.depth", { depth: s.depth, core: s.core })}</MicroLabel>
          </Teaser>
        ) : (
          <>
            <Wallet layer={1} amount={s.stamps} n={s.stampsN} right={t("warp.count", { count: s.warps })} />
            <Card padding={8}>
              <Row gap="sm">
                <Led on color={s.can ? "mint" : "yellow"} size={8} />
                <Txt variant="bodyBold" style={{ flex: 1 }} testID="warp-status">
                  {s.can ? t("warp.ready") : t("warp.notYet")}
                </Txt>
              </Row>
              {!s.can ? (
                <>
                  <ProgressBar value={s.core > 0 ? s.depth / s.core : 0} tone="cobalt" />
                  <Txt variant="label" color="inkDim">
                    {t("warp.depth", { depth: s.depth, core: s.core })} {t("warp.orGate", { gate: gateName })}
                  </Txt>
                </>
              ) : null}
            </Card>
            <Card>
              <Gain layer={1} amount={s.gain} n={s.gainN} label={t("warp.gainNow")} />
              {s.active ? (
                <Txt variant="label" color="good">
                  {t("warp.activeMutators", { names: s.active.split(",").map((id) => tr(content.mutators[id]?.name)).join(" + "), mult: `×${fmt(s.activeReward)}` })}
                </Txt>
              ) : null}
              <Txt variant="label" color="inkDim">
                {curve[0] ? t("warp.nextAt", { at: curve[0], have: s.lifetime }) : t("warp.lifetime", { have: s.lifetime })}
              </Txt>
              <Row gap="sm">
                {[
                  ["×10", curve[1]],
                  ["×1000", curve[2]],
                  ["×1M", curve[3]],
                ].map(([k, v]) => (
                  <View key={k} style={{ flex: 1 }}>
                    <MicroLabel>{t("warp.ifCredits", { k })}</MicroLabel>
                    <CostTag icon="stamp" amount={v} size="sm" />
                  </View>
                ))}
              </Row>
            </Card>
            <Card>
              <Row gap="md" align="flex-start">
                <Bullets title={t("keeps")} icon="check" tone="good" items={t("warp.keeps")} />
                <Bullets title={t("resets")} icon="recycle" tone="bad" items={t("warp.resets")} />
              </Row>
              <Txt variant="label" color="info">
                {t("warp.mechanic")}
              </Txt>
            </Card>
          </>
        )}
      </ScrollView>
      {s.open ? (
        <KeyRow>
          <Key testID="open-mutators" label={t("warp.mutators")} sublabel={`${picked.length}/${slots} · ×${fmt(reward)}`} icon="warning" flex={1} onPress={() => setPicker(true)} />
          <Key testID="open-warp" label={t("warp.go")} sublabel={s.can ? `+${s.gain}` : t("warp.goLocked")} icon="jump" tone="orange" flex={1} disabled={!s.can} onPress={() => setConfirm(true)} />
        </KeyRow>
      ) : null}

      <Sheet
        visible={picker}
        onClose={() => setPicker(false)}
        title={t("warp.pickTitle")}
        testID="mutator-sheet"
        footer={
          <Row gap="sm">
            <View style={{ flex: 1 }}>
              <MicroLabel size="label">{t("warp.pickCount", { n: picked.length, max: slots })}</MicroLabel>
              <Row gap="xs">
                <Icon name="stamp" size={16} chip />
                <Txt variant="heading" testID="mutator-total">{`×${fmt(reward)}`}</Txt>
              </Row>
            </View>
            <Key label={t("done")} tone="cobalt" width={120} onPress={() => setPicker(false)} testID="mutator-done" />
          </Row>
        }
      >
        <Txt variant="body" color="inkDim">
          {t("warp.pickHint")}
        </Txt>
        <View style={{ gap: 8 }}>
          {MUTATORS.map((m) => (
            <MutatorRow key={m.id} def={m} selected={picked.includes(m.id)} onToggle={toggle} />
          ))}
        </View>
      </Sheet>

      <ConfirmSheet visible={confirm} title={t("warp.confirmTitle")} holdLabel={t("warp.hold")} holdHint={t("confirm.holdHint")} icon="jump" onConfirm={doWarp} onClose={() => setConfirm(false)} testID="warp-confirm">
        <Gain layer={1} amount={s.gain} n={s.gainN} label={t("warp.gainNow")} />
        <Card>
          <MicroLabel size="label">{t("warp.nextGalaxy")}</MicroLabel>
          <Txt variant="bodyBold" testID="confirm-mutators">
            {picked.length ? pickedNames : t("warp.noMutators")}
          </Txt>
          <Txt variant="label" color={picked.length ? "warn" : "inkDim"}>
            {picked.length ? t("warp.nextReward", { mult: `×${fmt(reward)}` }) : t("warp.noMutatorsHint")}
          </Txt>
        </Card>
        <Row gap="md" align="flex-start">
          <Bullets title={t("keeps")} icon="check" tone="good" items={t("warp.keeps")} />
          <Bullets title={t("resets")} icon="recycle" tone="bad" items={t("warp.resets")} />
        </Row>
      </ConfirmSheet>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Layer 2

type HullState = "current" | "owned" | "ok" | "credits" | "items" | "blocked";

const HullCard = memo(function HullCard({ def, state, selected, budget, onPick }: { def: HullClassDef; state: HullState; selected: boolean; budget: string; onPick: (id: string) => void }) {
  const theme = useTheme();
  const t = useT("meta");
  const tr = useTr();
  const frame = hullFrameItem(getGame(), def.id);
  const cells = [];
  for (let i = 0; i < def.grid.w * def.grid.h; i++) cells.push(<View key={i} style={{ width: 5, height: 5, backgroundColor: theme.cobalt, borderRadius: 1 }} />);
  const tone = state === "current" ? "cobalt" : state === "owned" ? "good" : state === "ok" ? "orange" : "neutral";
  return (
    <Pressable
      testID={`hull-${def.id}`}
      onPress={() => onPick(def.id)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={tr(def.name)}
      style={{ backgroundColor: theme.plate, borderRadius: 6, borderWidth: 2, borderColor: selected ? theme.orange : "transparent", padding: 10, gap: 6, opacity: state === "blocked" || state === "credits" || state === "items" ? 0.8 : 1 }}
    >
      <Row gap="sm" align="flex-start">
        <Icon name={frame ?? "hull"} size={32} chip />
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap="sm">
            <Txt variant="heading" style={{ flexShrink: 1 }} numberOfLines={1}>
              {tr(def.name)}
            </Txt>
            <Badge label={t(`hull.state.${state}`)} tone={tone} style={{ alignSelf: "center" }} />
          </Row>
          <MicroLabel>{def.sprite}</MicroLabel>
        </View>
        <View style={{ alignItems: "center", gap: 3 }}>
          <View style={{ width: def.grid.w * 7 - 2, flexDirection: "row", flexWrap: "wrap", gap: 2 }}>{cells}</View>
          <MicroLabel>{t("hull.grid", { w: def.grid.w, h: def.grid.h })}</MicroLabel>
        </View>
      </Row>
      <Txt variant="label" color="inkDim" style={{ letterSpacing: 0.2 }}>
        {tr(def.desc)}
      </Txt>
      <Row gap="sm" wrap>
        {def.effects.length === 0 ? (
          <Txt variant="label" color="inkDim">
            {t("hull.noTraits")}
          </Txt>
        ) : (
          def.effects.map((e, i) => (
            <Txt key={i} variant="label" color={effectIsGood(e) ? "good" : "bad"}>
              {effectLine(e, t)}
            </Txt>
          ))
        )}
      </Row>
      <Row gap="sm" justify="space-between">
        <Row gap="xs">
          <Icon name="book" size={16} chip />
          <Txt variant="label">{t("hull.inherit", { count: def.inheritBlueprints })}</Txt>
        </Row>
        {state === "current" || state === "owned" ? (
          <Txt variant="label" color="good">
            {t("hull.paid")}
          </Txt>
        ) : (
          <Row gap="sm">
            {frame ? <CostTag icon={frame} amount={t("hull.frame")} affordable={state !== "items"} size="sm" /> : null}
            <CostTag icon="rivet" amount={`${fmt(def.cost)} / ${budget}`} affordable={state !== "credits"} size="sm" />
          </Row>
        )}
      </Row>
    </Pressable>
  );
});

function hullState(g: Game, id: string): HullState {
  if (g.state.hull.cls === id) return "current";
  if (g.state.prestige.hullsOwned.includes(id)) return "owned";
  // Asked without blueprints, so only the hull itself is judged. Without a shipyard every class is blocked.
  const reason = rebuildBlock(g, id, []);
  if (reason === null) return "ok";
  if (reason === "credits" || reason === "items") return reason;
  // No shipyard yet: still tell apart what the player could afford once it stands.
  const frame = hullFrameItem(g, id);
  if (frame && !(getItem(g, frame).m > 0)) return "items";
  return "blocked";
}

function RebuildLayer({ tree }: { tree: boolean }) {
  const t = useT("meta");
  const tr = useTr();
  useFmt();
  const [hull, setHull] = useState<string>(() => getGame().state.hull.cls);
  const [kept, setKept] = useState<RecipeId[]>([]);
  const [picker, setPicker] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const s = useGame(
    (g) => {
      const p = g.state.prestige;
      const gain = rivetsOnRebuild(g);
      return {
        open: hasFeature(g, "hull"),
        yard: hasShipyard(g),
        can: canRebuild(g),
        rivets: fmt(p.rivets),
        rivetsN: count(p.rivets),
        rebuilds: p.rebuilds,
        gain: fmt(gain),
        gainN: count(gain),
        budget: fmt(B.add(p.rivets, gain)),
        stampsTotal: fmt(p.stampsTotal),
        cls: g.state.hull.cls,
        hulls: HULLS.map((h) => hullState(g, h.id)).join(","),
        block: rebuildBlock(g, hull, kept) ?? "",
        known: Object.keys(g.state.recipes).length,
      };
    },
    undefined,
    3,
  );
  const hullStates = s.hulls.split(",") as HullState[];
  const def = content.hulls[hull] ?? HULLS[0];
  const limit = def.inheritBlueprints;
  const yardName = itemName("shipyard");

  const pickHull = useCallback((id: string) => {
    haptic("detent");
    setHull(id);
    setKept((cur) => cur.slice(0, content.hulls[id]?.inheritBlueprints ?? 0));
  }, []);

  // Recipes the ship knows now, the valuable ones first. Start recipes come back by themselves.
  const recipes = useMemo(() => {
    if (!picker) return [];
    const known = getGame().state.recipes;
    return Object.keys(known)
      .map((id) => content.recipes[id])
      .filter((r) => r && !r.unlock.start)
      .sort((a, b) => b.tier - a.tier || (a.id < b.id ? -1 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker, s.known]);

  const toggle = useCallback(
    (id: RecipeId) => {
      if (kept.includes(id)) {
        setKept(kept.filter((x) => x !== id));
        return;
      }
      if (kept.length >= limit) {
        sfx("deny");
        toast(t("rebuild.keptFull", { count: limit }), "warn");
        return;
      }
      sfx("toggle");
      setKept([...kept, id]);
    },
    [kept, limit, t],
  );

  const doRebuild = useCallback(() => {
    const gain = rivetsOnRebuild(getGame());
    const res = act((g) => rebuild(g, hull, kept));
    setConfirm(false);
    if (res.ok) {
      sfx("prestige");
      haptic("heavy");
      toast(t("rebuild.done", { hull: tr(content.hulls[hull]?.name), rivets: t("count.rivet", { count: count(gain), n: fmt(gain) }) }), { tone: "good", icon: "rivet" });
      setKept([]);
    } else {
      sfx("deny");
      toast(t(`rebuild.block.${res.reason}`), "bad");
    }
  }, [hull, kept, t, tr]);

  if (tree) {
    return (
      <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
        <Wallet layer={2} amount={s.rivets} n={s.rivetsN} right={t("tree.rivetsHint")} />
        <UpgradeTree layer={2} />
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, gap: 6 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
        {!s.open ? (
          <Teaser icon="rivet" title={t("rebuild.title")} text={t("rebuild.pitch")} how={t("rebuild.how", { yard: yardName })} />
        ) : (
          <>
            <Wallet layer={2} amount={s.rivets} n={s.rivetsN} right={t("rebuild.count", { count: s.rebuilds })} />
            <Card padding={8}>
              <Row gap="sm">
                <Led on color={s.can ? "mint" : "yellow"} size={8} />
                <Txt variant="bodyBold" style={{ flex: 1 }} testID="rebuild-status">
                  {s.can ? t("rebuild.ready") : !s.yard ? t("rebuild.needYard", { yard: yardName }) : t("rebuild.needStamps")}
                </Txt>
              </Row>
              <Gain layer={2} amount={s.gain} n={s.gainN} label={t("rebuild.gainNow")} />
              <Txt variant="label" color="inkDim">
                {t("rebuild.fromStamps", { stamps: s.stampsTotal })}
              </Txt>
            </Card>
            <Card>
              <Row gap="md" align="flex-start">
                <Bullets title={t("keeps")} icon="check" tone="good" items={t("rebuild.keeps")} />
                <Bullets title={t("resets")} icon="recycle" tone="bad" items={t("rebuild.resets")} />
              </Row>
              <Txt variant="label" color="info">
                {t("rebuild.mechanic")}
              </Txt>
            </Card>
            <MicroLabel size="label">{t("hull.title")}</MicroLabel>
            {HULLS.map((h, i) => (
              <HullCard key={h.id} def={h} state={hullStates[i] ?? "blocked"} selected={hull === h.id} budget={s.budget} onPick={pickHull} />
            ))}
          </>
        )}
      </ScrollView>
      {s.open ? (
        <KeyRow>
          <Key testID="open-blueprints" label={t("rebuild.blueprints")} sublabel={`${kept.length}/${limit}`} icon="book" flex={1} disabled={limit === 0} onPress={() => setPicker(true)} />
          <Key
            testID="open-rebuild"
            label={t("rebuild.go")}
            sublabel={s.block ? t(`rebuild.block.${s.block}`) : tr(def.name)}
            icon="wrench"
            tone="orange"
            flex={1}
            disabled={s.block !== ""}
            onPress={() => setConfirm(true)}
          />
        </KeyRow>
      ) : null}

      <Sheet
        visible={picker}
        onClose={() => setPicker(false)}
        title={t("rebuild.pickTitle")}
        testID="blueprint-sheet"
        footer={
          <Row gap="sm">
            <View style={{ flex: 1 }}>
              <MicroLabel size="label">{tr(def.name)}</MicroLabel>
              <Txt variant="heading" testID="kept-count">
                {t("rebuild.pickCount", { n: kept.length, max: limit })}
              </Txt>
            </View>
            <Key label={t("done")} tone="cobalt" width={120} onPress={() => setPicker(false)} testID="blueprint-done" />
          </Row>
        }
      >
        <Txt variant="body" color="inkDim">
          {t("rebuild.pickHint")}
        </Txt>
        <View style={{ gap: 4 }}>
          {recipes.map((r) => {
            const out = Object.keys(r.outputs)[0] ?? r.id;
            const on = kept.includes(r.id);
            return <BlueprintRow key={r.id} id={r.id} icon={out} name={itemName(out)} sub={t("rebuild.recipeTier", { tier: r.tier, station: tr(content.decks[r.station]?.name) })} selected={on} onToggle={toggle} />;
          })}
        </View>
      </Sheet>

      <ConfirmSheet visible={confirm} title={t("rebuild.confirmTitle")} holdLabel={t("rebuild.hold")} holdHint={t("confirm.holdHint")} icon="wrench" onConfirm={doRebuild} onClose={() => setConfirm(false)} testID="rebuild-confirm">
        <Gain layer={2} amount={s.gain} n={s.gainN} label={t("rebuild.gainNow")} />
        <Card>
          <MicroLabel size="label">{t("rebuild.newHull")}</MicroLabel>
          <Txt variant="bodyBold">{`${tr(def.name)} · ${t("hull.grid", { w: def.grid.w, h: def.grid.h })}`}</Txt>
          <Txt variant="label" color="inkDim">
            {t("rebuild.keeping", { count: kept.length })}
            {kept.length ? `: ${kept.map((id) => itemName(Object.keys(content.recipes[id]?.outputs ?? {})[0] ?? id)).join(", ")}` : ""}
          </Txt>
        </Card>
        <Row gap="md" align="flex-start">
          <Bullets title={t("keeps")} icon="check" tone="good" items={t("rebuild.keeps")} />
          <Bullets title={t("resets")} icon="recycle" tone="bad" items={t("rebuild.resets")} />
        </Row>
      </ConfirmSheet>
    </View>
  );
}

const BlueprintRow = memo(function BlueprintRow({ id, icon, name, sub, selected, onToggle }: { id: string; icon: string; name: string; sub: string; selected: boolean; onToggle: (id: string) => void }) {
  const theme = useTheme();
  return (
    <Pressable
      testID={`bp-${id}`}
      onPress={() => onToggle(id)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={name}
      style={{ height: 48, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, borderRadius: 6, backgroundColor: theme.plate, borderWidth: 2, borderColor: selected ? theme.orange : "transparent" }}
    >
      <Icon name={icon} size={24} chip />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyBold" numberOfLines={1}>
          {name}
        </Txt>
        <MicroLabel>{sub}</MicroLabel>
      </View>
      <View style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: selected ? theme.orange : theme.well, borderWidth: 1, borderColor: theme.rule, alignItems: "center", justifyContent: "center" }}>
        {selected ? <Icon name="check" size={16} color="onAccent" /> : null}
      </View>
    </Pressable>
  );
});

// ---------------------------------------------------------------------------------------------
// Layer 3

function RebootLayer({ tree }: { tree: boolean }) {
  const t = useT("meta");
  useFmt();
  const [confirm, setConfirm] = useState(false);
  const s = useGame(
    (g) => {
      const p = g.state.prestige;
      const gain = sparksOnReboot(g);
      return { open: hasFeature(g, "cosmos"), can: canReboot(g), sparks: fmt(p.sparks), sparksN: count(p.sparks), reboots: p.reboots, rebuilds: p.rebuilds, gain: fmt(gain), gainN: count(gain) };
    },
    undefined,
    3,
  );
  const need = Number(content.balance.rebootMinRebuilds ?? 2);

  const doReboot = useCallback(() => {
    const gain = sparksOnReboot(getGame());
    const res = act((g) => reboot(g));
    setConfirm(false);
    if (res.ok) {
      sfx("prestige");
      haptic("heavy");
      toast(t("reboot.done", { sparks: t("count.spark", { count: count(gain), n: fmt(gain) }) }), { tone: "good", icon: "spark" });
    } else {
      sfx("deny");
      toast(t("reboot.notYet"), "bad");
    }
  }, [t]);

  if (tree) {
    return (
      <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
        <Wallet layer={3} amount={s.sparks} n={s.sparksN} right={t("tree.sparksHint")} />
        <UpgradeTree layer={3} />
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, gap: 6 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
        {!s.open ? (
          <Teaser icon="spark" title={t("reboot.title")} text={t("reboot.pitch")} how={t("reboot.how", { count: need })}>
            <ProgressBar value={Math.min(1, s.rebuilds / need)} tone="cobalt" />
            <MicroLabel size="label">{t("reboot.rebuilds", { have: s.rebuilds, need })}</MicroLabel>
          </Teaser>
        ) : (
          <>
            <Wallet layer={3} amount={s.sparks} n={s.sparksN} right={t("reboot.count", { count: s.reboots })} />
            <Card padding={8}>
              <Row gap="sm">
                <Led on color={s.can ? "mint" : "yellow"} size={8} />
                <Txt variant="bodyBold" style={{ flex: 1 }} testID="reboot-status">
                  {s.can ? t("reboot.ready") : t("reboot.notYet")}
                </Txt>
              </Row>
              <Gain layer={3} amount={s.gain} n={s.gainN} label={t("reboot.gainNow")} />
              <Txt variant="label" color={s.rebuilds >= need ? "good" : "bad"}>
                {t("reboot.rebuilds", { have: s.rebuilds, need })}
              </Txt>
            </Card>
            <Card>
              <Row gap="md" align="flex-start">
                <Bullets title={t("keeps")} icon="check" tone="good" items={t("reboot.keeps")} />
                <Bullets title={t("resets")} icon="recycle" tone="bad" items={t("reboot.resets")} />
              </Row>
              <Txt variant="label" color="info">
                {t("reboot.mechanic")}
              </Txt>
            </Card>
          </>
        )}
      </ScrollView>
      {s.open ? <Key testID="open-reboot" label={t("reboot.go")} sublabel={s.can ? `+${s.gain}` : t("reboot.goLocked")} icon="spark" tone="orange" disabled={!s.can} onPress={() => setConfirm(true)} /> : null}
      <ConfirmSheet visible={confirm} title={t("reboot.confirmTitle")} holdLabel={t("reboot.hold")} holdHint={t("confirm.holdHint")} icon="spark" onConfirm={doReboot} onClose={() => setConfirm(false)} testID="reboot-confirm">
        <Gain layer={3} amount={s.gain} n={s.gainN} label={t("reboot.gainNow")} />
        <Row gap="md" align="flex-start">
          <Bullets title={t("keeps")} icon="check" tone="good" items={t("reboot.keeps")} />
          <Bullets title={t("resets")} icon="recycle" tone="bad" items={t("reboot.resets")} />
        </Row>
      </ConfirmSheet>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------

export interface PrestigeProps {
  initialLayer?: Layer;
  initialTree?: boolean;
}

export default function Prestige({ initialLayer = 1, initialTree = false }: PrestigeProps) {
  const t = useT("meta");
  const theme = useTheme();
  const [layer, setLayer] = useState<Layer>(initialLayer);
  const [tree, setTree] = useState(initialTree);
  const gate = useGame(
    (g) => {
      const p = g.state.prestige;
      return {
        l1: hasFeature(g, "warp"),
        l2: hasFeature(g, "hull"),
        l3: hasFeature(g, "cosmos"),
        // Achievements pay stamps before the first warp: the tree opens as soon as there is something to spend.
        t1: hasFeature(g, "warp") || p.stampsTotal.m > 0,
        t2: hasFeature(g, "hull") || p.rivets.m > 0,
        t3: hasFeature(g, "cosmos") || p.sparks.m > 0,
      };
    },
    undefined,
    5,
  );
  const treeOpen = layer === 1 ? gate.t1 : layer === 2 ? gate.t2 : gate.t3;
  const showTree = tree && treeOpen;
  const pick = useCallback((l: Layer) => setLayer(l), []);

  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Row gap="xs">
        <LayerChip layer={1} label={t("layer.warp")} selected={layer === 1} locked={!gate.l1} onPick={pick} />
        <LayerChip layer={2} label={t("layer.rebuild")} selected={layer === 2} locked={!gate.l2} onPick={pick} />
        <LayerChip layer={3} label={t("layer.reboot")} selected={layer === 3} locked={!gate.l3} onPick={pick} />
        <Pressable
          testID="toggle-tree"
          disabled={!treeOpen}
          onPress={() => {
            haptic("detent");
            sfx("toggle");
            setTree((v) => !v);
          }}
          hitSlop={{ top: 7, bottom: 7 }}
          accessibilityRole="button"
          accessibilityLabel={showTree ? t("layer.plan") : t("layer.tree")}
          style={{ width: 54, height: 30, borderRadius: 4, backgroundColor: theme.cobalt, opacity: treeOpen ? 1 : 0.35, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: theme.keyLo }}
        >
          <MicroLabel color="keyText">{showTree ? t("layer.plan") : t("layer.tree")}</MicroLabel>
        </Pressable>
      </Row>
      {layer === 1 ? <WarpLayer tree={showTree} /> : layer === 2 ? <RebuildLayer tree={showTree} /> : <RebootLayer tree={showTree} />}
    </View>
  );
}
