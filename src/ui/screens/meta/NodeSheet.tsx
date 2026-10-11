// Detail sheet shared by research nodes and prestige upgrades: what it does now and at the next
// level, what it costs, what it needs and what it unlocks, plus the buy key.
import { useCallback, useRef } from "react";
import { View, type GestureResponderEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";

import { content } from "@/content";
import * as B from "@/engine/big";
import { getItem } from "@/engine/kernel";
import { buyResearch, buyUpgrade, researchBlock, researchCost, researchLevel, upgradeBlock, upgradeCost, upgradeLevel } from "@/engine/meta";
import type { ActionResult, Effect, FailReason, FeatureId, Game, RecipeId } from "@/engine/types";
import { useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { act, getGame, useGame } from "@/store/game";
import { fmt, itemName, useFmt } from "@/ui/format";
import { Badge, CostTag, Icon, Key, MicroLabel, popNumberAt, Row, Rule, Sheet, toast, Txt, useTheme } from "@/ui/kit";

import { effectAt, effectLabel, fmtEffect } from "./effects";

export type NodeKind = "research" | "upgrade";
export const LAYER_ICON = { 1: "stamp", 2: "rivet", 3: "spark" } as const;

interface CostLine {
  icon: string;
  label: string;
  have: string;
  need: string;
  ok: boolean;
}

interface Model {
  name: string;
  desc: string;
  icon: string;
  level: number;
  maxLevel: number;
  effects: Effect[];
  requires: { name: string; ok: boolean }[];
  block: FailReason | null;
  costs: CostLine[];
  recipes: RecipeId[];
  feature: FeatureId | undefined;
  buy: (g: Game) => ActionResult;
}

function build(g: Game, kind: NodeKind, id: string, tr: ReturnType<typeof useTr>, rpLabel: string, walletLabel: string): Model | null {
  if (kind === "research") {
    const def = content.research[id];
    if (!def) return null;
    const cost = researchCost(g, id);
    const costs: CostLine[] = [{ icon: "rp", label: rpLabel, have: fmt(g.state.rp), need: fmt(cost.rp), ok: B.cmp(g.state.rp, cost.rp) >= 0 }];
    for (const item in cost.items ?? {}) {
      const need = cost.items?.[item] ?? 0;
      const have = getItem(g, item);
      costs.push({ icon: item, label: itemName(item), have: fmt(have), need: fmt(need), ok: B.cmp(have, B.big(need)) >= 0 });
    }
    return {
      name: tr(def.name),
      desc: tr(def.desc),
      icon: def.icon,
      level: researchLevel(g, id),
      maxLevel: def.maxLevel,
      effects: def.effects ?? [],
      requires: def.requires.map((r) => ({ name: tr(content.research[r]?.name) || r, ok: researchLevel(g, r) > 0 })),
      block: researchBlock(g, id),
      costs,
      recipes: def.recipes ?? [],
      feature: def.feature,
      buy: (game) => buyResearch(game, id),
    };
  }
  const def = content.upgrades[id];
  if (!def) return null;
  const p = g.state.prestige;
  const wallet = def.layer === 1 ? p.stamps : def.layer === 2 ? p.rivets : p.sparks;
  const cost = upgradeCost(g, id);
  return {
    name: tr(def.name),
    desc: tr(def.desc),
    icon: def.icon,
    level: upgradeLevel(g, id),
    maxLevel: def.maxLevel,
    effects: def.effects ?? [],
    requires: def.requires.map((r) => ({ name: tr(content.upgrades[r]?.name) || r, ok: upgradeLevel(g, r) > 0 })),
    block: upgradeBlock(g, id),
    costs: [{ icon: LAYER_ICON[def.layer], label: walletLabel, have: fmt(wallet), need: fmt(cost), ok: B.cmp(wallet, cost) >= 0 }],
    recipes: [],
    feature: def.feature,
    buy: (game) => buyUpgrade(game, id),
  };
}

export interface NodeSheetProps {
  kind: NodeKind;
  id: string | null;
  onClose: () => void;
}

export function NodeSheet({ kind, id: openId, onClose }: NodeSheetProps) {
  // The last node stays rendered while the sheet slides away.
  const last = useRef(openId);
  if (openId) last.current = openId;
  const id = openId ?? last.current;
  const t = useT("meta");
  const tr = useTr();
  const theme = useTheme();
  useFmt();
  const pulse = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  // Everything the sheet prints, folded into one string: the sheet re-renders when any of it moves.
  useGame((g) => {
    if (!openId) return "";
    const m = build(g, kind, id, tr, "", "");
    return m ? `${m.level}|${m.block}|${m.costs.map((c) => c.have + "/" + c.need).join(";")}` : "";
  }, undefined, 2);

  const layer = kind === "upgrade" && id ? content.upgrades[id]?.layer : undefined;
  const model = id ? build(getGame(), kind, id, tr, t("research.points"), layer ? t(`currency.${LAYER_ICON[layer]}`) : "") : null;

  const onBuy = useCallback(
    (e: GestureResponderEvent) => {
      if (!model) return;
      const res = act(model.buy);
      if (res.ok) {
        sfx("levelUp");
        haptic("success");
        pulse.set(withSequence(withTiming(1.3, { duration: 90 }), withTiming(1, { duration: 220 })));
        popNumberAt(e, t("node.levelPop"), "good");
      } else {
        sfx("deny");
        haptic("error");
        toast(t(`block.${res.reason}`), "bad");
      }
    },
    [model, pulse, t],
  );

  if (!model) return null;
  const maxed = model.level >= model.maxLevel;
  const mods = getGame().mods;
  const reason = model.block && model.block !== "max" ? t(`block.${model.block}`) : null;

  return (
    <Sheet
      visible={openId !== null}
      onClose={onClose}
      title={model.name}
      testID="node-sheet"
      footer={
        <View style={{ gap: 6 }}>
          {reason ? (
            <Row gap="xs">
              <Icon name={model.block === "requirement" ? "lock" : "warning"} size={16} color="bad" />
              <Txt variant="label" color="bad" style={{ flex: 1 }}>
                {reason}
              </Txt>
            </Row>
          ) : null}
          <Key
            testID="node-buy"
            label={maxed ? t("node.maxed") : kind === "research" ? t("node.research") : t("node.upgrade")}
            sublabel={maxed ? undefined : `${model.costs[0].need} ${model.costs[0].label}`}
            icon={maxed ? "check" : model.costs[0].icon}
            tone="orange"
            size="lg"
            disabled={model.block !== null}
            onPress={onBuy}
            sound={null}
            hapticKind={null}
          />
        </View>
      }
    >
      <Row gap="md" align="flex-start">
        <Animated.View style={[{ width: 56, height: 56, borderRadius: 28, backgroundColor: theme.key, borderWidth: 3, borderColor: maxed ? theme.mint : model.level > 0 ? theme.cobalt : theme.inkDim, alignItems: "center", justifyContent: "center" }, pulseStyle]}>
          <Icon name={model.icon} size={32} color="keyText" />
        </Animated.View>
        <View style={{ flex: 1, gap: 4 }}>
          <Row gap="sm">
            <Txt variant="bodyBold" testID="node-level">
              {t("node.level", { level: model.level, max: model.maxLevel })}
            </Txt>
            {maxed ? <Badge label={t("node.maxed")} tone="good" /> : null}
          </Row>
          <Txt variant="body" color="inkDim">
            {model.desc}
          </Txt>
        </View>
      </Row>

      {model.effects.length > 0 ? (
        <View style={{ gap: 6 }}>
          <MicroLabel size="label">{t("node.effect")}</MicroLabel>
          {model.effects.map((e, i) => (
            <View key={i} style={{ gap: 1 }}>
              <Row gap="sm" justify="space-between">
                <Txt variant="bodyBold" style={{ flex: 1 }} numberOfLines={1}>
                  {effectLabel(e, t)}
                </Txt>
                <Txt variant="bodyBold" color={maxed ? "good" : "ink"} tabular>
                  {maxed ? fmtEffect(effectAt(e, model.level)) : `${fmtEffect(effectAt(e, model.level))} → ${fmtEffect(effectAt(e, model.level + 1))}`}
                </Txt>
              </Row>
              <Txt variant="label" color="inkDim">
                {t("node.perLevel", { value: fmtEffect(effectAt(e, 1)) })}
                {e.stat && !e.deck ? ` · ${t("node.shipTotal", { value: `×${fmt(mods[e.stat])}` })}` : ""}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}

      {model.recipes.length > 0 || model.feature ? (
        <View style={{ gap: 6 }}>
          <MicroLabel size="label">{t("node.unlocks")}</MicroLabel>
          {model.feature ? (
            <Row gap="sm">
              <Icon name="unlock" size={16} chip />
              <Txt variant="body" style={{ flex: 1 }}>
                {t(`feature.${model.feature}`)}
              </Txt>
            </Row>
          ) : null}
          {model.recipes.length > 0 ? (
            <Row gap="sm" wrap>
              {model.recipes.map((r) => {
                const out = Object.keys(content.recipes[r]?.outputs ?? {})[0] ?? r;
                return (
                  <Row key={r} gap="xs">
                    <Icon name={out} size={24} chip />
                    <Txt variant="label">{itemName(out)}</Txt>
                  </Row>
                );
              })}
            </Row>
          ) : null}
        </View>
      ) : null}

      {model.requires.length > 0 ? (
        <View style={{ gap: 6 }}>
          <MicroLabel size="label">{t("node.requires")}</MicroLabel>
          {model.requires.map((r) => (
            <Row key={r.name} gap="sm">
              <Icon name={r.ok ? "check" : "lock"} size={16} color={r.ok ? "good" : "bad"} />
              <Txt variant="body" color={r.ok ? "ink" : "bad"} style={{ flex: 1 }}>
                {r.ok ? r.name : t("node.missingParent", { name: r.name })}
              </Txt>
            </Row>
          ))}
        </View>
      ) : null}

      {!maxed ? (
        <View style={{ gap: 6 }}>
          <Rule />
          <MicroLabel size="label">{t("node.cost")}</MicroLabel>
          {model.costs.map((c) => (
            <Row key={c.icon} gap="sm" justify="space-between">
              <CostTag icon={c.icon} amount={`${c.need} ${c.label}`} affordable={c.ok} />
              <Txt variant="label" color={c.ok ? "inkDim" : "bad"}>
                {t("node.have", { have: c.have })}
              </Txt>
            </Row>
          ))}
        </View>
      ) : null}
    </Sheet>
  );
}
