// Station market: what the station sells and what it pays for the hold, and the trade sheet that
// shows quantity, price impact, cargo room and reputation before anything is confirmed.
import { memo, useCallback, useMemo, useRef, useState, type ReactElement } from "react";
import { FlatList, View } from "react-native";

import { content } from "@/content";
import * as B from "@/engine/big";
import { cargoFree, massOf, sellPrice } from "@/engine/core";
import type { Big, FactionId, Game, ItemId } from "@/engine/types";
import {
  buy,
  gameHour,
  marketPeriod,
  marketRows,
  sellAt,
  stationBuyPrice,
  stationSellPrice,
  stationStock,
  currentSystem,
} from "@/engine/world";
import { useLang, useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { getGame, useGame } from "@/store/game";
import { fmt, fmtTime, itemName } from "@/ui/format";
import {
  Badge,
  Chip,
  Col,
  CostTag,
  EmptyState,
  Icon,
  Key,
  Lcd,
  LcdNumber,
  ListRow,
  MicroLabel,
  Row,
  Segmented,
  Sheet,
  StatDelta,
  toast,
  Txt,
  formatDelta,
} from "@/ui/kit";
import { space } from "@/ui/theme";

import { doAct, Note, useSnapshot, type TFn } from "./shared";

type Mode = "buy" | "sell";
type Preset = "1" | "10" | "25" | "max";

/** Market factor at or below which buying is a bargain, and at or above which selling is. */
const DEAL_BUY = 0.8;
const DEAL_SELL = 1.25;

interface MarketLine {
  item: ItemId;
  price: string;
  have: string;
  trend: number; // market factor relative to the norm: -0.2 = 20 % under
  deal: boolean;
}

function holds(g: Game, item: ItemId): boolean {
  const have = g.state.inv[item];
  return have !== undefined && B.gteN(have, 1);
}

function marketSig(g: Game, mode: Mode): string {
  const rows = marketRows(g);
  let s = `${mode}${gameHour(g)}`;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (mode === "buy" ? !r.stocked : !holds(g, r.item)) continue;
    s += `;${r.item}:${fmt(mode === "buy" ? r.buy : r.sell)}:${fmt(g.state.inv[r.item])}`;
  }
  return s;
}

function buildMarket(g: Game, mode: Mode): MarketLine[] {
  const rows = marketRows(g).filter((r) =>
    mode === "buy" ? r.stocked : holds(g, r.item),
  );
  rows.sort((a, b) =>
    mode === "buy" ? a.factor - b.factor : b.factor - a.factor,
  );
  return rows.map((r) => ({
    item: r.item,
    price: fmt(mode === "buy" ? r.buy : r.sell),
    have: fmt(g.state.inv[r.item]),
    trend: r.factor - 1,
    deal: mode === "buy" ? r.factor <= DEAL_BUY : r.factor >= DEAL_SELL,
  }));
}

/** Seconds until the market redraws its prices, found by asking the engine where the period ends. */
function useMarketTimer(): number {
  const nextAt = useRef(0);
  return useGame(
    (g) => {
      const t = g.state.t;
      if (t >= nextAt.current || nextAt.current - t > 7 * 86400) {
        const now = marketPeriod(g, t);
        let hi = 60;
        while (marketPeriod(g, t + hi) === now && hi < 7 * 86400) hi *= 2;
        let lo = 0;
        while (hi - lo > 1) {
          const mid = (lo + hi) / 2;
          if (marketPeriod(g, t + mid) === now) lo = mid;
          else hi = mid;
        }
        nextAt.current = t + hi;
      }
      return Math.max(0, Math.ceil(nextAt.current - t));
    },
    Object.is,
    5,
  );
}

const MarketRowView = memo(function MarketRowView({
  line,
  mode,
  onOpen,
}: {
  line: MarketLine;
  mode: Mode;
  onOpen: (item: ItemId) => void;
}) {
  const t = useT("crew") as TFn;
  const open = useCallback(() => onOpen(line.item), [onOpen, line.item]);
  return (
    <ListRow
      testID={`market-${line.item}`}
      title={itemName(line.item)}
      subtitle={t("market.inCargo", { n: line.have })}
      icon={line.item}
      onPress={open}
      right={
        <Row gap="sm">
          {line.deal ? (
            <Badge
              label={
                mode === "buy" ? t("market.dealBuy") : t("market.dealSell")
              }
              tone="good"
              style={{ alignSelf: "center" }}
            />
          ) : null}
          <Col gap={0} align="flex-end">
            <CostTag
              icon="coin"
              amount={line.price}
              size="sm"
              style={{ alignSelf: "flex-end" }}
            />
            <StatDelta
              value={line.trend}
              invert={mode === "buy"}
              size="sm"
              style={{ alignSelf: "flex-end" }}
            />
          </Col>
        </Row>
      }
    />
  );
});

// ---------- trade sheet ---------------------------------------------------------------

function maxBuy(g: Game, item: ItemId): Big {
  const unit = stationBuyPrice(g, item, 1);
  if (!(unit.m > 0)) return B.big(0);
  const credits = g.state.credits;
  // buying only pushes the price up, so the unit price bounds the affordable amount from above
  let limit = B.floor(B.div(credits, unit));
  const mass = massOf(content.items[item]);
  if (mass > 0) limit = B.min(limit, B.floor(B.divN(cargoFree(g), mass)));
  if (!B.gteN(limit, 1)) return B.big(0);
  const fits = (a: Big): boolean =>
    B.cmp(B.mul(stationBuyPrice(g, item, a), a), credits) <= 0;
  if (fits(limit)) return limit;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const a = B.floor(B.mulN(limit, mid));
    if (B.gteN(a, 1) && fits(a)) lo = mid;
    else hi = mid;
  }
  return B.floor(B.mulN(limit, lo));
}

interface Quote {
  m: number;
  e: number;
  amount: string;
  unit: string;
  avg: string;
  impact: number;
  total: string;
  totalLog: number;
  have: string;
  room: string;
  needRoom: string;
  credits: string;
  broker: string;
  stocked: boolean;
  block: "stock" | "cargo" | "credits" | "items" | null;
}

function quote(g: Game, item: ItemId, mode: Mode, preset: Preset): Quote {
  const def = content.items[item];
  const have = B.floor(g.state.inv[item] ?? B.ZERO);
  const stocked = stationStock(g, currentSystem(g)).includes(item);
  const max = mode === "buy" ? maxBuy(g, item) : have;
  let a =
    preset === "1"
      ? B.big(1)
      : preset === "10"
        ? B.big(10)
        : preset === "25"
          ? B.floor(B.mulN(max, 0.25))
          : max;
  if (!B.gteN(a, 1)) a = B.big(1);
  const price = mode === "buy" ? stationBuyPrice : stationSellPrice;
  const unit = price(g, item, 1);
  const avg = price(g, item, a);
  const total = B.mul(avg, a);
  const mass = massOf(def);
  const needRoom = B.mulN(a, mass);
  let block: Quote["block"] = null;
  if (mode === "buy") {
    if (!stocked) block = "stock";
    else if (mass > 0 && B.cmp(needRoom, cargoFree(g)) > 0) block = "cargo";
    else if (B.cmp(total, g.state.credits) > 0) block = "credits";
  } else if (B.cmp(have, a) < 0) {
    block = "items";
  }
  return {
    m: a.m,
    e: a.e,
    amount: fmt(a),
    unit: fmt(unit),
    avg: fmt(avg),
    impact:
      unit.m > 0 ? Math.round((B.ratio(avg, unit, 4) - 1) * 1000) / 1000 : 0,
    total: fmt(total),
    totalLog: total.m > 0 ? Math.round(B.log10(total) * 100) / 100 : 0,
    have: fmt(have),
    room: fmt(cargoFree(g)),
    needRoom: fmt(needRoom),
    credits: fmt(g.state.credits),
    broker: fmt(sellPrice(g, item)),
    stocked,
    block,
  };
}

function Line({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "warn" | "inkDim";
}) {
  return (
    <Row justify="space-between" gap="md">
      <Txt
        variant="body"
        color="inkDim"
        numberOfLines={1}
        style={{ flexShrink: 1 }}
      >
        {label}
      </Txt>
      <Txt variant="bodyBold" color={tone ?? "ink"} tabular numberOfLines={1}>
        {value}
      </Txt>
    </Row>
  );
}

function TradeSheet({
  item,
  startMode,
  faction,
  onClose,
}: {
  item: ItemId | null;
  startMode: Mode;
  faction: FactionId;
  onClose: () => void;
}) {
  const t = useT("crew") as TFn;
  const tr = useTr();
  const lang = useLang();
  const [mode, setMode] = useState<Mode>(startMode);
  const [preset, setPreset] = useState<Preset>("1");
  const [shown, setShown] = useState<ItemId | null>(item);
  const [prev, setPrev] = useState<ItemId | null>(item);
  if (item !== prev) {
    setPrev(item);
    if (item !== null) {
      setShown(item);
      setMode(startMode);
      setPreset("1");
    }
  }

  // What a quote depends on in the game; the quote itself is recomputed at once when the player changes mode or amount.
  const live = useGame(
    (g) => (shown ? `${fmt(g.state.credits)}|${fmt(g.state.inv[shown])}|${fmt(g.rates.cargoUsed)}|${gameHour(g)}|${(g.state.station.trades[shown] ?? 0).toFixed(3)}` : ""),
    Object.is,
  );
  const q = useMemo(
    () => (shown ? quote(getGame(), shown, mode, preset) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `live` stands in for the game state
    [shown, mode, preset, live],
  );
  if (!shown || !q) return <Sheet visible={false} onClose={onClose} />;

  const def = content.items[shown];
  const liked = content.factions[faction].likes.includes(def.category);
  const confirm = () => {
    const a = B.make(q.m, q.e);
    const res = doAct((g) =>
      mode === "buy" ? buy(g, shown, a) : sellAt(g, shown, a),
    );
    if (res.ok) {
      sfx(mode === "buy" ? "buy" : "coin");
      haptic("success");
      toast(
        t(mode === "buy" ? "market.bought" : "market.sold", {
          n: q.amount,
          item: itemName(shown),
          total: q.total,
        }),
        { tone: "good", icon: shown },
      );
    } else {
      sfx("deny");
      haptic("error");
      toast(t(`fail.${res.reason}`), "bad");
    }
  };
  const reason = q.block ? t(`market.block.${q.block}`) : null;

  return (
    <Sheet
      visible={item !== null}
      onClose={onClose}
      title={itemName(shown)}
      testID="trade-sheet"
      footer={
        <Col gap="xs">
          {reason ? <Note text={reason} icon="warning" tone="bad" /> : null}
          <Key
            label={t(
              mode === "buy" ? "market.confirmBuy" : "market.confirmSell",
              { n: q.amount },
            )}
            sublabel={t("market.forTotal", { total: q.total })}
            icon={mode === "buy" ? "buy" : "sell"}
            tone="orange"
            disabled={q.block !== null}
            onPress={confirm}
            sound={null}
            testID="trade-confirm"
          />
        </Col>
      }
    >
      <Segmented<Mode>
        value={mode}
        onChange={setMode}
        options={[
          {
            value: "buy",
            label: t("market.buy"),
            icon: "buy",
            disabled: !q.stocked,
          },
          { value: "sell", label: t("market.sell"), icon: "sell" },
        ]}
      />
      <Lcd>
        <Row justify="space-between" align="flex-end">
          <Col gap={2}>
            <Txt variant="lcdS" color="lcdOn">
              {t("market.amount")}
            </Txt>
            <LcdNumber
              text={q.amount}
              value={q.e + q.m / 10}
              size="l"
              align="left"
              minChars={6}
            />
          </Col>
          <Col gap={2} align="flex-end">
            <Txt variant="lcdS" color="lcdOn">
              {t(mode === "buy" ? "market.youPay" : "market.youGet")}
            </Txt>
            <LcdNumber
              text={q.total}
              value={q.totalLog}
              size="l"
              tone={q.block === "credits" ? "warn" : "normal"}
              minChars={6}
            />
          </Col>
        </Row>
      </Lcd>
      <Segmented<Preset>
        value={preset}
        onChange={setPreset}
        tone="cobalt"
        options={[
          { value: "1", label: "1" },
          { value: "10", label: "10" },
          { value: "25", label: "25 %" },
          { value: "max", label: t("market.max") },
        ]}
      />
      <Col gap="xs">
        <Line label={t("market.unitNow")} value={q.unit} />
        <Line
          label={t("market.unitAvg")}
          value={
            q.impact === 0 ? q.avg : `${q.avg} (${formatDelta(q.impact, lang)})`
          }
          tone={
            q.impact === 0
              ? undefined
              : (mode === "buy" ? q.impact > 0 : q.impact < 0)
                ? "warn"
                : "good"
          }
        />
        {mode === "buy" ? (
          <Line
            label={t("market.room")}
            value={t("market.roomValue", { need: q.needRoom, free: q.room })}
            tone={q.block === "cargo" ? "bad" : undefined}
          />
        ) : (
          <Line label={t("market.broker")} value={q.broker} tone="inkDim" />
        )}
        <Line label={t("market.haveNow")} value={q.have} />
        <Line
          label={t("market.credits")}
          value={q.credits}
          tone={q.block === "credits" ? "bad" : undefined}
        />
        <Row gap="sm" align="flex-start" testID="trade-rep">
          <Icon name={`fac_${faction}`} size={16} chip />
          <Txt
            variant="label"
            color={liked ? "good" : "inkDim"}
            style={{ flex: 1, lineHeight: 15 }}
          >
            {liked
              ? t("market.repUp", {
                  faction: tr(content.factions[faction].name),
                })
              : t("market.repNone", {
                  faction: tr(content.factions[faction].name),
                })}
          </Txt>
        </Row>
        <Note text={t("market.impactNote")} />
      </Col>
    </Sheet>
  );
}

// ---------- list ----------------------------------------------------------------------

export default function Market({
  header,
  faction,
}: {
  header: ReactElement;
  faction: FactionId;
}) {
  const t = useT("crew") as TFn;
  const [mode, setMode] = useState<Mode>("buy");
  const [open, setOpen] = useState<ItemId | null>(null);
  const lines = useSnapshot(
    (g) => marketSig(g, mode),
    (g) => buildMarket(g, mode),
    5,
    mode,
  );
  const left = useMarketTimer();
  const close = useCallback(() => setOpen(null), []);
  const renderItem = useCallback(
    ({ item }: { item: MarketLine }) => (
      <MarketRowView line={item} mode={mode} onOpen={setOpen} />
    ),
    [mode],
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={lines}
        extraData={mode}
        keyExtractor={(l) => l.item}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: space.md }}
        initialNumToRender={8}
        windowSize={7}
        ListHeaderComponent={
          <View>
            {header}
            <Row gap={6} style={{ paddingBottom: space.xs }}>
              <Chip
                label={t("market.buyList")}
                selected={mode === "buy"}
                onPress={() => setMode("buy")}
              />
              <Chip
                label={t("market.sellList")}
                selected={mode === "sell"}
                onPress={() => setMode("sell")}
              />
              <View style={{ flex: 1 }} />
              <Icon name="clock" size={16} chip />
              <Col gap={0}>
                <MicroLabel>{t("market.newPrices")}</MicroLabel>
                <Txt variant="label" tabular testID="prices-timer">
                  {fmtTime(left)}
                </Txt>
              </Col>
            </Row>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            compact
            icon="cargo"
            title={
              mode === "buy" ? t("market.emptyBuy") : t("market.emptySell")
            }
            hint={t("market.emptyHint")}
          />
        }
      />
      <TradeSheet
        item={open}
        startMode={mode}
        faction={faction}
        onClose={close}
      />
    </View>
  );
}
