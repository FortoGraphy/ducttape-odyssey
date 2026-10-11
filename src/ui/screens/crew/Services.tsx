// Station services behind the market: contract board, upgrade shop, repair dock and hiring hall.
import { memo, useCallback, useEffect, useState, type ReactElement } from "react";
import { FlatList, ScrollView, View, type GestureResponderEvent } from "react-native";

import { content } from "@/content";
import * as B from "@/engine/big";
import type { FactionId, Game, ItemId, ShopItemDef, TraitId } from "@/engine/types";
import {
  abandonContract,
  acceptContract,
  buyShop,
  contractReady,
  crewCap,
  deliverContract,
  fuelCap,
  getRep,
  hireCrew,
  hireOffers,
  repairAtDock,
  repairCost,
  shopBlock,
  shopCost,
  shopLevel,
  shopOffers,
} from "@/engine/world";
import { useLang, useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { useGame } from "@/store/game";
import { Portrait } from "@/ui/common/Portrait";
import { fmt, fmtTime, itemName } from "@/ui/format";
import { Badge, Card, Col, CostTag, Dialog, Icon, IconKey, Key, LedRow, Meter, popNumberAt, ProgressBar, Row, toast, Txt, useTheme } from "@/ui/kit";
import { space } from "@/ui/theme";

import { doAct, effectLines, FACTION_IDS, fmtRep, Note, SectionLabel, TraitChip, useSnapshot, useTraitDialog, type TFn } from "./shared";

const listStyle = { paddingBottom: space.md };
/** The tech grid tops out at 6 x 6 (GDD 4). */
const GRID_CELLS_MAX = 36;

function timeLeft(secs: number, t: TFn): string {
  return secs >= 3600 ? t("hoursLeft", { count: Math.floor(secs / 3600) }) : t("timeLeft", { time: fmtTime(Math.max(0, secs)) });
}

// ---------- contracts -----------------------------------------------------------------

type ContractItem =
  | { kind: "label"; key: string; label: string; right?: string }
  | { kind: "note"; key: string; text: string }
  | {
      kind: "active" | "offer";
      key: string;
      uid: number;
      index: number;
      faction: FactionId;
      item: ItemId;
      need: string;
      have: string;
      frac: number;
      cargo: string;
      canGive: boolean;
      ready: boolean;
      reward: string;
      rep: number;
      left: number;
      full: boolean;
    };

/** Engine default for `balance.contractMax` (station.ts); see the report's request for an exported helper. */
function contractMax(): number {
  const v = content.balance.contractMax;
  return typeof v === "number" ? v : 5;
}

function contractSig(g: Game): string {
  const st = g.state.station;
  const t = g.state.t;
  let s = `${st.offersDay}`;
  for (const c of st.contracts) s += `;a${c.uid}:${fmt(c.have)}:${Math.floor((c.expires - t) / 60)}:${fmt(g.state.inv[c.item])}`;
  for (const c of st.offers) s += `;o${c.uid}:${Math.floor((c.expires - t) / 600)}`;
  return s;
}

function buildContracts(g: Game, t: TFn): ContractItem[] {
  const st = g.state.station;
  const now = g.state.t;
  const max = contractMax();
  const out: ContractItem[] = [{ kind: "label", key: "la", label: t("contract.active"), right: `${st.contracts.length} / ${max}` }];
  if (st.contracts.length === 0) out.push({ kind: "note", key: "na", text: t("contract.noneActive") });
  const row = (kind: "active" | "offer", c: (typeof st.contracts)[number], index: number): ContractItem => {
    const cargo = g.state.inv[c.item] ?? B.ZERO;
    return {
      kind,
      key: `${kind}${c.uid}`,
      uid: c.uid,
      index,
      faction: c.faction,
      item: c.item,
      need: fmt(c.need),
      have: fmt(c.have),
      frac: B.ratio(c.have, c.need, 1),
      cargo: fmt(B.floor(cargo)),
      canGive: cargo.m > 0,
      ready: contractReady(g, c),
      reward: fmt(c.reward),
      rep: c.rep,
      left: c.expires - now,
      full: st.contracts.length >= max,
    };
  };
  st.contracts.forEach((c, i) => out.push(row("active", c, i)));
  out.push({ kind: "label", key: "lo", label: t("contract.offers"), right: t("contractCount", { count: st.offers.length }) });
  if (st.offers.length === 0) out.push({ kind: "note", key: "no", text: t("contract.noneOffers") });
  st.offers.forEach((c, i) => out.push(row("offer", c, i)));
  return out;
}

interface DoneInfo {
  reward: string;
  rep: number;
  faction: FactionId;
}

const ContractCard = memo(function ContractCard({ c, onDone, onAbandon }: { c: Extract<ContractItem, { kind: "active" | "offer" }>; onDone: (d: DoneInfo) => void; onAbandon: (uid: number) => void }) {
  const t = useT("crew") as TFn;
  const tr = useTr();
  const active = c.kind === "active";
  const deliver = (ev: GestureResponderEvent) => {
    const res = doAct((g) => deliverContract(g, c.uid));
    if (!res.ok) {
      sfx("deny");
      toast(t(`fail.${res.reason}`), "bad");
      return;
    }
    if (c.ready) {
      popNumberAt(ev, `+${c.reward}`, "good");
      onDone({ reward: c.reward, rep: c.rep, faction: c.faction });
    } else {
      sfx("collect");
      toast(t("contract.partial", { n: c.cargo, item: itemName(c.item) }), "info");
    }
  };
  const accept = () => {
    const res = doAct((g) => acceptContract(g, c.index));
    if (res.ok) {
      sfx("choice");
      haptic("success");
      toast(t("contract.accepted", { item: itemName(c.item) }), { tone: "good", icon: "quest" });
    } else {
      sfx("deny");
      toast(t(res.reason === "max" ? "contract.full" : `fail.${res.reason}`), "bad");
    }
  };
  return (
    <Card padding={space.sm} gap={space.xs} style={{ marginBottom: space.sm }}>
      <View testID={`${c.kind}-${c.index}`} style={{ gap: space.xs }}>
        <Row gap="sm">
          <Icon name={c.item} size={24} chip />
          <Col gap={0} flex>
            <Txt variant="bodyBold" numberOfLines={1}>
              {`${c.need}× ${itemName(c.item)}`}
            </Txt>
            <Row gap="xs">
              <Icon name={`fac_${c.faction}`} size={16} chip />
              <Txt variant="label" color="inkDim" numberOfLines={1} style={{ flex: 1 }}>
                {tr(content.factions[c.faction].name)}
              </Txt>
            </Row>
          </Col>
          <Col gap={0} align="flex-end">
            <Row gap="xs">
              <Icon name="clock" size={16} chip />
              <Txt variant="label" color={c.left < 3600 ? "bad" : "ink"}>
                {timeLeft(c.left, t)}
              </Txt>
            </Row>
          </Col>
        </Row>
        {active ? (
          <Row gap="sm">
            <ProgressBar value={c.frac} tone={c.ready ? "good" : "cobalt"} height={6} style={{ flex: 1 }} />
            <Txt variant="label" tabular>{`${c.have} / ${c.need}`}</Txt>
          </Row>
        ) : null}
        <Row gap="sm">
          <CostTag icon="coin" amount={`+${c.reward}`} size="sm" boxed style={{ alignSelf: "center" }} />
          <Txt variant="label" color="good">
            {t("contract.rep", { n: fmtRep(c.rep) })}
          </Txt>
          <View style={{ flex: 1 }} />
          {active ? (
            <>
              <IconKey icon="close" size="sm" onPress={() => onAbandon(c.uid)} accessibilityLabel={t("contract.abandon")} testID={`abandon-${c.index}`} />
              <Key
                label={c.ready ? t("contract.finish") : t("contract.deliver")}
                sublabel={t("contract.cargo", { n: c.cargo })}
                tone={c.ready ? "orange" : "cobalt"}
                size="sm"
                disabled={!c.canGive}
                onPress={deliver}
                sound={null}
                testID={`deliver-${c.index}`}
              />
            </>
          ) : (
            <Key label={t("contract.accept")} sublabel={c.full ? t("contract.fullShort") : t("contract.cargo", { n: c.cargo })} tone="cobalt" size="sm" disabled={c.full} onPress={accept} sound={null} testID={`accept-${c.index}`} />
          )}
        </Row>
      </View>
    </Card>
  );
});

export function Contracts({ header }: { header: ReactElement }) {
  const t = useT("crew") as TFn;
  const tr = useTr();
  const lang = useLang();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt on language change
  const build = useCallback((g: Game) => buildContracts(g, t), [t, lang]);
  const items = useSnapshot(contractSig, build, 5, build);
  const [done, setDone] = useState<DoneInfo | null>(null);
  const [abandon, setAbandon] = useState<number | null>(null);
  const theme = useTheme();

  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => setDone(null), 5000);
    return () => clearTimeout(id);
  }, [done]);

  const onDone = useCallback(
    (d: DoneInfo) => {
      sfx("success");
      haptic("success");
      setDone(d);
      toast(t("contract.doneToast", { reward: d.reward }), { tone: "good", icon: "trophy" });
    },
    [t],
  );
  const renderItem = useCallback(
    ({ item }: { item: ContractItem }) =>
      item.kind === "label" ? (
        <View style={{ marginBottom: space.xs }}>
          <SectionLabel label={item.label} right={item.right} />
        </View>
      ) : item.kind === "note" ? (
        <View style={{ marginBottom: space.sm }}>
          <Note text={item.text} />
        </View>
      ) : (
        <ContractCard c={item} onDone={onDone} onAbandon={setAbandon} />
      ),
    [onDone],
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={listStyle}
        ListHeaderComponent={
          <View>
            {header}
            {done ? (
              <Card padding={space.sm} gap={space.xs} style={{ marginBottom: space.sm, borderLeftWidth: 4, borderLeftColor: theme.mint }}>
                <View testID="contract-done" style={{ gap: space.xs }}>
                  <LedRow steps={16} chase color="mint" />
                  <Row gap="sm">
                    <Icon name="trophy" size={24} chip />
                    <Col gap={0} flex>
                      <Txt variant="heading">{t("contract.doneTitle")}</Txt>
                      <Txt variant="label" color="good">
                        {t("contract.doneBody", { reward: done.reward, rep: fmtRep(done.rep), faction: tr(content.factions[done.faction].name) })}
                      </Txt>
                    </Col>
                  </Row>
                </View>
              </Card>
            ) : null}
          </View>
        }
        ListFooterComponent={<Note text={t("contract.note")} />}
      />
      <Dialog
        visible={abandon !== null}
        title={t("contract.abandonTitle")}
        body={t("contract.abandonBody")}
        tone="warn"
        onRequestClose={() => setAbandon(null)}
        choices={[
          {
            label: t("contract.abandon"),
            tone: "red",
            onPress: () => {
              if (abandon !== null) doAct((g) => abandonContract(g, abandon));
              setAbandon(null);
            },
          },
          { label: t("contract.keep"), tone: "black", onPress: () => setAbandon(null) },
        ]}
      />
    </View>
  );
}

// ---------- upgrade shop --------------------------------------------------------------

interface ShopRow {
  id: string;
  icon: string;
  name: string;
  desc: string;
  level: number;
  max: number;
  repeatable: boolean;
  cost: string;
  block: ReturnType<typeof shopBlock>;
  lines: string[];
  explain: string | null;
  exclusive: boolean;
  why: string | null;
}

function shopSig(g: Game): string {
  const offers = shopOffers(g);
  let s = `${g.state.grid.open}`;
  for (const def of offers) s += `;${def.id}:${shopLevel(g, def.id)}:${fmt(shopCost(g, def))}:${shopBlock(g, def) ?? ""}`;
  return s;
}

function shopRow(g: Game, def: ShopItemDef, faction: FactionId, t: TFn, tr: ReturnType<typeof useTr>, lang: "cs" | "en"): ShopRow {
  const block = shopBlock(g, def);
  const lines = effectLines(def.effects, t, tr, lang).map((l) => `${l.text} ${t("shop.perLevel")}`);
  let explain: string | null = null;
  if (def.gridSlots) {
    lines.push(t("shop.gridSlots", { count: def.gridSlots }));
    explain = t("shop.gridExplain", { open: g.state.grid.open, max: GRID_CELLS_MAX });
  } else if (def.id === "fuel_tank") {
    const per = Number(content.balance.fuelTankPerLevel ?? 10);
    lines.push(t("shop.tank", { n: per }));
    explain = t("shop.tankExplain", { cap: fuelCap(g), next: fuelCap(g) + per });
  } else if (def.item) {
    lines.push(t("shop.crate", { n: def.item.n, item: itemName(def.item.id) }));
    explain = t("shop.crateExplain", { have: fmt(g.state.inv[def.item.id]) });
  }
  let why: string | null = null;
  if (block === "requirement") why = t("shop.needRep", { n: def.repMin ?? 0, faction: tr(content.factions[def.faction ?? faction].name), have: fmtRep(getRep(g, def.faction ?? faction)) });
  else if (block === "max") why = def.gridSlots && g.state.grid.open >= GRID_CELLS_MAX ? t("shop.gridFull") : t("shop.maxed");
  else if (block === "credits") why = t("shop.noCredits");
  return {
    id: def.id,
    icon: def.icon,
    name: tr(def.name),
    desc: tr(def.desc),
    level: shopLevel(g, def.id),
    max: def.maxLevel,
    repeatable: def.item !== undefined,
    cost: fmt(shopCost(g, def)),
    block,
    lines,
    explain,
    exclusive: def.faction !== undefined,
    why,
  };
}

const ShopCard = memo(function ShopCard({ row }: { row: ShopRow }) {
  const t = useT("crew") as TFn;
  const buyIt = (ev: GestureResponderEvent) => {
    const res = doAct((g) => buyShop(g, row.id));
    if (res.ok) {
      sfx("buy");
      haptic("success");
      popNumberAt(ev, `−${row.cost}`, "warn");
      toast(t("shop.bought", { name: row.name }), { tone: "good", icon: row.icon });
    } else {
      sfx("deny");
      haptic("error");
      toast(row.why ?? t(`fail.${res.reason}`), "bad");
    }
  };
  const maxed = row.block === "max";
  return (
    <Card padding={space.sm} gap={space.xs} style={{ marginBottom: space.sm }}>
      <View testID={`shop-${row.id}`} style={{ gap: space.xs }}>
        <Row gap="sm" align="flex-start">
          <Icon name={row.block === "requirement" ? "lock" : row.icon} size={24} chip />
          <Col gap={1} flex>
            <Row gap="sm">
              <Txt variant="bodyBold" numberOfLines={1} style={{ flex: 1 }}>
                {row.name}
              </Txt>
              {row.exclusive ? <Badge label={t("shop.exclusive")} tone="cobalt" style={{ alignSelf: "center" }} /> : null}
              <Badge label={row.repeatable ? t("shop.times", { n: row.level }) : `${row.level} / ${row.max}`} tone={maxed ? "orange" : "neutral"} style={{ alignSelf: "center" }} />
            </Row>
            {row.lines.map((l) => (
              <Txt key={l} variant="label" color="good" style={{ lineHeight: 15 }}>
                {l}
              </Txt>
            ))}
            <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
              {row.explain ?? row.desc}
            </Txt>
          </Col>
        </Row>
        <Row gap="sm">
          {maxed ? null : <CostTag icon="coin" amount={row.cost} affordable={row.block !== "credits"} size="sm" boxed style={{ alignSelf: "center" }} />}
          <Txt variant="label" color={row.block === "max" ? "inkDim" : "bad"} numberOfLines={2} style={{ flex: 1, lineHeight: 14 }}>
            {row.why ?? ""}
          </Txt>
          <Key label={maxed ? t("shop.maxKey") : t("shop.buy")} icon={maxed ? "check" : "buy"} tone="orange" size="sm" disabled={row.block !== null} onPress={buyIt} sound={null} testID={`shop-buy-${row.id}`} />
        </Row>
      </View>
    </Card>
  );
});

export function Shop({ header, faction }: { header: ReactElement; faction: FactionId }) {
  const t = useT("crew") as TFn;
  const tr = useTr();
  const lang = useLang();
  const build = useCallback((g: Game) => shopOffers(g).map((def) => shopRow(g, def, faction, t, tr, lang)), [faction, t, tr, lang]);
  const rows = useSnapshot(shopSig, build, 5, build);
  const renderItem = useCallback(({ item }: { item: ShopRow }) => <ShopCard row={item} />, []);
  const others = FACTION_IDS.filter((f) => f !== faction)
    .map((f) => tr(content.factions[f].name))
    .join(", ");
  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.id}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={listStyle}
      initialNumToRender={5}
      ListHeaderComponent={
        <View>
          {header}
          <View style={{ marginBottom: space.sm }}>
            <Note text={t("shop.intro")} />
          </View>
        </View>
      }
      ListFooterComponent={<Note text={t("shop.others", { factions: others })} />}
    />
  );
}

// ---------- repair dock ---------------------------------------------------------------

export function RepairDock({ header }: { header: ReactElement }) {
  const t = useT("crew") as TFn;
  const d = useGame((g) => {
    const s = g.state;
    let damaged = 0;
    let worst = 100;
    for (let i = 0; i < s.modules.length; i++) {
      if (s.modules[i].hp < 100) {
        damaged++;
        worst = Math.min(worst, s.modules[i].hp);
      }
    }
    const cost = repairCost(g);
    return { hull: Math.floor(s.hull.hp), damaged, worst: Math.floor(worst), total: s.modules.length, cost: fmt(cost), free: !(cost.m > 0), afford: B.cmp(s.credits, cost) >= 0 };
  });
  const fix = (ev: GestureResponderEvent) => {
    const res = doAct((g) => repairAtDock(g));
    if (res.ok) {
      sfx("repairDone");
      haptic("success");
      popNumberAt(ev, `−${d.cost}`, "warn");
      toast(t("repair.done"), { tone: "good", icon: "repair" });
    } else {
      sfx("deny");
      haptic("error");
      toast(t(res.reason === "max" ? "repair.nothing" : `fail.${res.reason}`), "bad");
    }
  };
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={listStyle}>
      {header}
      <Card padding={space.md} gap={space.sm}>
        <View testID="repair-card" style={{ gap: space.sm }}>
          <Row gap="sm">
            <Icon name="repair" size={24} chip />
            <Txt variant="heading" style={{ flex: 1 }}>
              {t("repair.title")}
            </Txt>
          </Row>
          <Meter value={d.hull / 100} label={t("repair.hull")} valueText={d.hull >= 100 ? "100 %" : `${d.hull} % → 100 %`} tone={d.hull < 40 ? "red" : d.hull < 75 ? "yellow" : "mint"} ticks={5} />
          <Row gap="sm" align="flex-start">
            <Icon name="integrity" size={16} chip />
            <Txt variant="body" style={{ flex: 1 }}>
              {d.damaged === 0 ? t("repair.modulesFine", { total: d.total }) : t("repair.modules", { count: d.damaged, worst: d.worst })}
            </Txt>
          </Row>
          <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
            {d.free ? t("repair.nothingBody") : t("repair.body")}
          </Txt>
          <Row gap="sm">
            {d.free ? null : <CostTag icon="coin" amount={d.cost} affordable={d.afford} boxed style={{ alignSelf: "center" }} />}
            {!d.free && !d.afford ? (
              <Txt variant="label" color="bad" style={{ flex: 1 }}>
                {t("shop.noCredits")}
              </Txt>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <Key label={d.free ? t("repair.fine") : t("repair.key")} icon={d.free ? "check" : "repair"} tone="orange" disabled={d.free || !d.afford} onPress={fix} sound={null} testID="repair-all" />
          </Row>
        </View>
      </Card>
    </ScrollView>
  );
}

// ---------- hiring hall ---------------------------------------------------------------

interface HireRow {
  index: number;
  seed: number;
  name: string;
  traits: TraitId[];
  cost: string;
  afford: boolean;
  hired: boolean;
}

export function Hiring({ header }: { header: ReactElement }) {
  const t = useT("crew") as TFn;
  const [openTrait, traitDialog] = useTraitDialog();
  const bunks = useGame((g) => ({ n: g.state.crew.length, cap: crewCap(g) }));
  const rows = useSnapshot(
    (g) => {
      const offers = hireOffers(g);
      let s = `${g.state.crew.length}`;
      for (const o of offers) s += `;${o.seed}:${o.hired ? 1 : 0}:${fmt(o.cost)}:${B.cmp(g.state.credits, o.cost) >= 0 ? 1 : 0}`;
      return s;
    },
    (g): HireRow[] => hireOffers(g).map((o) => ({ index: o.index, seed: o.seed, name: o.person.name, traits: o.person.traits.slice(0, 2), cost: fmt(o.cost), afford: B.cmp(g.state.credits, o.cost) >= 0, hired: o.hired })),
    5,
  );
  const full = bunks.n >= bunks.cap;
  const hire = (row: HireRow, ev: GestureResponderEvent) => {
    const res = doAct((g) => hireCrew(g, row.index));
    if (res.ok) {
      sfx("levelUp");
      haptic("success");
      popNumberAt(ev, `−${row.cost}`, "warn");
      toast(t("hire.done", { name: row.name }), { tone: "good", icon: "crew" });
    } else {
      sfx("deny");
      haptic("error");
      toast(t(res.reason === "max" ? "hire.full" : `fail.${res.reason}`), "bad");
    }
  };
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={listStyle}>
      {header}
      <Row gap="sm" style={{ paddingHorizontal: space.xs, marginBottom: space.sm }} testID="bunk-check">
        <Icon name="deck_quarters" size={16} chip />
        <Txt variant="label" color={full ? "bad" : "ink"} style={{ flex: 1, lineHeight: 15 }}>
          {full ? t("hire.bunksFull", { n: bunks.n, cap: bunks.cap }) : t("hire.bunks", { n: bunks.n, cap: bunks.cap })}
        </Txt>
      </Row>
      {rows.map((row) => (
        <Card key={row.seed} padding={space.sm} gap={space.xs} style={{ marginBottom: space.sm, opacity: row.hired ? 0.6 : 1 }}>
          <Row gap="sm" align="flex-start" testID={`hire-${row.index}`}>
            <Portrait seed={row.seed} size={48} />
            <Col gap="xs" flex>
              <Txt variant="bodyBold" numberOfLines={1}>
                {row.name}
              </Txt>
              <Row gap="xs" wrap>
                {row.traits.map((id) => (
                  <TraitChip key={id} id={id} onOpen={openTrait} />
                ))}
              </Row>
            </Col>
          </Row>
          <Row gap="sm">
            <CostTag icon="coin" amount={row.cost} affordable={row.afford} size="sm" boxed style={{ alignSelf: "center" }} />
            <Txt variant="label" color="bad" numberOfLines={1} style={{ flex: 1 }}>
              {row.hired ? "" : full ? t("hire.noBunk") : !row.afford ? t("shop.noCredits") : ""}
            </Txt>
            {row.hired ? (
              <Badge label={t("hire.hired")} tone="good" style={{ alignSelf: "center" }} />
            ) : (
              <Key label={t("hire.key")} icon="hire" tone="orange" size="sm" disabled={full || !row.afford} onPress={(ev) => hire(row, ev)} sound={null} testID={`hire-key-${row.index}`} />
            )}
          </Row>
        </Card>
      ))}
      <Note text={t("hire.note")} />
      {traitDialog}
    </ScrollView>
  );
}
