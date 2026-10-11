// Recipe sheet: everything about one recipe, the quantity control and the queue key in the thumb
// zone, and the recipe tree: tapping an input drills into how that input is made, down to the raw
// resources and whether the current system provides them. The breadcrumb walks back up.
import { memo, useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import * as B from "@/engine/big";
import { content } from "@/content";
import { craftSeconds, toggleAutoRecipe } from "@/engine/core";
import type { Game, ItemId, RecipeDef, RecipeId } from "@/engine/types";
import { useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { act, getGame, useGame } from "@/store/game";
import { goTo } from "@/store/ui";
import { fmt, fmtPct, fmtRate, fmtTime, useFmt } from "@/ui/format";
import { Badge, Chip, Col, Icon, Key, QUALITY_COLORS, Row, Rule, Segmented, Sheet, Toggle, Txt, Well, toast, useTheme } from "@/ui/kit";
import { space } from "@/ui/theme";

import { AgainStrip, enqueue } from "./again";
import {
  bestRecipeFor,
  haveOf,
  inputLevel,
  maxBatches,
  mixShare,
  perMinute,
  primaryOf,
  qualityOdds,
  recipesFor,
  researchForFeature,
  stationBatch,
  unlockHint,
  valueAdded,
} from "./model";
import { EffectLine, Fact, LockCard, SectionLabel, Silhouette } from "./parts";

type Qty = "1" | "5" | "25" | "max" | "inf";
interface Node {
  item: ItemId;
  recipe?: RecipeId;
}

type T = (key: string, vars?: Record<string, unknown>) => string;

export function secsText(secs: number): string {
  if (!Number.isFinite(secs)) return "--";
  return secs >= 60 ? fmtTime(secs) : `${fmt(secs, secs < 10 ? 2 : 3)} s`;
}

/** Where an unknown recipe comes from, in words. */
export function useUnlockText(): (def: RecipeDef) => string {
  const t = useT("craft");
  const tr = useTr();
  return useCallback(
    (def: RecipeDef) => {
      const h = unlockHint(def);
      switch (h.kind) {
        case "research":
          return t("unlock.research", { name: tr(h.name) });
        case "deck":
          return t("unlock.deck", { deck: tr(content.decks[h.deck]?.name), level: h.level });
        case "chapter":
          return t("unlock.chapter", { n: h.n });
        case "blueprint":
          return t("unlock.blueprint");
        default:
          return t("unlock.start");
      }
    },
    [t, tr],
  );
}

function batchesOf(g: Game, def: RecipeDef, qty: Qty): number {
  return qty === "inf" ? -1 : qty === "max" ? maxBatches(g, def) : Number(qty);
}

function sourceText(g: Game, item: ItemId, t: T, tr: ReturnType<typeof useTr>): { text: string; ok: boolean } {
  const def = content.items[item];
  const recipe = bestRecipeFor(g, item);
  if (recipe) {
    const r = content.recipes[recipe];
    if (g.state.recipes[recipe] === 1) return { text: t("src.station", { station: tr(content.decks[r.station].name) }), ok: g.state.decks[r.station].level > 0 };
    return { text: t("src.unknown"), ok: false };
  }
  const share = mixShare(g, item);
  if (share > 0) return { text: t("src.minedHere", { pct: fmtPct(share) }), ok: true };
  if ((item === "organics" || item === "coffee") && g.state.decks.greenhouse.level > 0) return { text: t("src.greenhouse"), ok: true };
  if (def?.category === "raw") return { text: t("src.notHere"), ok: false };
  return { text: t("src.found"), ok: false };
}

// ---------- body ------------------------------------------------------------------------------

interface BodyProps {
  node: Node;
  qty: Qty;
  root: boolean;
  onDrill: (item: ItemId) => void;
  onSwitch: (recipe: RecipeId) => void;
}

const NodeBody = memo(function NodeBody({ node, qty, root, onDrill, onSwitch }: BodyProps) {
  const t = useT("craft");
  const tg = useT("grid");
  const tr = useTr();
  const theme = useTheme();
  const unlockText = useUnlockText();
  useFmt();
  const def = node.recipe ? content.recipes[node.recipe] : undefined;
  const item = content.items[node.item];

  // everything the body prints that can change while the sheet is open
  useGame(
    (g) => {
      let s = `${fmt(haveOf(g, node.item))}|${g.state.features.autoQueue ?? 0}|${Math.round(g.mods.qualityLuck * 100)}|${g.rates.mix.length}`;
      if (def) {
        s += `|${g.state.recipes[def.id] ?? 0}|${g.state.autoRecipes.indexOf(def.id)}|${g.state.decks[def.station].level}|${fmt(stationBatch(g, def))}|${craftSeconds(g, def.id).toFixed(2)}`;
        for (const input in def.inputs) s += `|${fmt(haveOf(g, input))}`;
      }
      return s;
    },
    Object.is,
    3,
  );
  const g = getGame();

  const head = (
    <Row gap="md" align="flex-start">
      {def && g.state.recipes[def.id] !== 1 ? <Silhouette name={item.icon} size={32} /> : <Icon name={item.icon} size={32} chip />}
      <Col gap="xs" flex>
        <Row gap="xs" wrap>
          <Badge label={`T${item.tier}`} />
          <Badge label={t(`category.${item.category}`)} tone="cobalt" />
          <Txt variant="label" color="inkDim">
            {t("sheet.have", { n: fmt(haveOf(g, node.item)) })}
          </Txt>
        </Row>
        <Txt variant="body" color="inkDim">
          {tr(item.desc)}
        </Txt>
      </Col>
    </Row>
  );

  if (!def) {
    // a raw resource (or a find): the end of the tree
    const share = mixShare(g, node.item);
    const through = B.min(g.rates.mine, g.rates.lift);
    const greenhouse = (node.item === "organics" || node.item === "coffee") && g.state.decks.greenhouse.level > 0;
    return (
      <>
        {head}
        <SectionLabel>{t("raw.title")}</SectionLabel>
        <Well gap={space.xs}>
          {share > 0 ? (
            <>
              <Row gap="sm">
                <Icon name="deck_mining" size={16} chip />
                <Txt variant="bodyBold" color="good" style={{ flex: 1 }}>
                  {t("raw.here")}
                </Txt>
              </Row>
              <Fact label={t("raw.share")} value={fmtPct(share)} />
              <Fact label={t("raw.rate")} value={fmtRate(B.mulN(through, share))} />
            </>
          ) : item.category === "raw" ? (
            <Row gap="sm" align="flex-start">
              <Icon name="warning" size={16} chip />
              <Txt variant="body" color="warn" style={{ flex: 1 }}>
                {greenhouse ? t("raw.greenhouseOnly") : t("raw.notHere")}
              </Txt>
            </Row>
          ) : (
            <Txt variant="body" color="inkDim">
              {t("raw.found")}
            </Txt>
          )}
          {greenhouse && share > 0 ? <Txt variant="label" color="inkDim">{t("raw.greenhouseToo")}</Txt> : null}
        </Well>
        {share <= 0 && item.category === "raw" && g.state.features.nav ? <Key label={t("raw.toNav")} icon="jump" tone="cobalt" size="sm" onPress={() => goTo("nav")} /> : null}
      </>
    );
  }

  const known = g.state.recipes[def.id] === 1;
  const built = g.state.decks[def.station].level > 0;
  const batch = stationBatch(g, def);
  const secs = craftSeconds(g, def.id);
  const primary = primaryOf(def);
  const batches = batchesOf(g, def, qty);
  const times = batches === -1 ? 1 : batches;
  const alternates = recipesFor(node.item);
  const va = valueAdded(def);
  const autoFeature = g.state.features.autoQueue === 1;
  const autoOn = g.state.autoRecipes.indexOf(def.id) >= 0;
  const autoNode = researchForFeature("autoQueue");
  const megaFx = content.megaEffects[primary];
  const megaNote = item.category === "mega" ? (primary === "shipyard" ? "shipyard" : primary === "wormhole_gate" ? "gate" : item.tags?.includes("frame") ? "frame" : megaFx ? "passive" : null) : null;

  return (
    <>
      {head}
      {!known ? (
        <LockCard
          compact
          icon="book"
          title={t("sheet.unknownTitle")}
          hint={unlockText(def)}
          actionLabel={def.unlock.research ? t("unlock.toResearch") : def.unlock.deck ? t("unlock.toShip") : undefined}
          onAction={def.unlock.research ? () => goTo("meta", "research") : def.unlock.deck ? () => goTo("ship") : undefined}
        />
      ) : null}

      {alternates.length > 1 ? (
        <Row gap="xs" wrap>
          {alternates.map((id) => {
            const first = Object.keys(content.recipes[id].inputs)[0];
            return <Chip key={id} label={t("sheet.variant", { name: tr(content.items[first]?.name) })} icon={g.state.recipes[id] === 1 ? undefined : "lock"} selected={id === def.id} onPress={() => onSwitch(id)} />;
          })}
        </Row>
      ) : null}

      <Well padding={space.sm}>
        <Row gap="sm" justify="space-between">
          <StatCell label={t("sheet.output")} value={item.module ? t("sheet.oneModule") : `×${fmt(B.mulN(batch, def.outputs[primary] ?? 1))}`} />
          <StatCell label={t("sheet.time")} value={secsText(secs)} />
          <StatCell label={t("sheet.perMin")} value={fmt(perMinute(g, def))} />
          <StatCell label={t("sheet.value")} value={`${va >= 0 ? "+" : "−"}${fmtPct(Math.abs(va))}`} good={va > 0} />
        </Row>
      </Well>

      <SectionLabel right={<Txt variant="micro" color="inkDim">{t("sheet.inputsHint")}</Txt>}>{t("sheet.inputs")}</SectionLabel>
      <View>
        {Object.keys(def.inputs).map((input) => {
          const src = sourceText(g, input, t, tr);
          const level = inputLevel(g, def, input, times);
          const need = B.mulN(batch, def.inputs[input] * times);
          return (
            <Pressable
              key={input}
              testID={`input-${input}`}
              onPress={() => onDrill(input)}
              onPressIn={() => haptic("tap")}
              accessibilityRole="button"
              accessibilityLabel={t("sheet.drillA11y", { name: tr(content.items[input]?.name) })}
              style={({ pressed }) => ({ minHeight: 48, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.xs, borderRadius: 4, backgroundColor: pressed ? theme.platePressed : "transparent", borderBottomWidth: 1, borderBottomColor: theme.rule })}
            >
              <Icon name={content.items[input]?.icon ?? input} size={24} chip />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="bodyBold" numberOfLines={1}>
                  {tr(content.items[input]?.name)}
                </Txt>
                <Txt variant="label" color={src.ok ? "inkDim" : "warn"} numberOfLines={1}>
                  {src.text}
                </Txt>
              </View>
              <Txt variant="bodyBold" color={level === 2 ? "good" : level === 1 ? "warn" : "bad"} tabular numberOfLines={1}>
                {`${fmt(haveOf(g, input))} / ${fmt(need)}`}
              </Txt>
              <Icon name="right" size={16} color="inkDim" />
            </Pressable>
          );
        })}
      </View>

      {def.byproducts?.length ? (
        <>
          <SectionLabel>{t("sheet.byproducts")}</SectionLabel>
          <Row gap="xs" wrap>
            {def.byproducts.map((b) => (
              <Chip key={b.item} icon={content.items[b.item]?.icon} label={`${tr(content.items[b.item]?.name)} ×${fmt(b.amount)} · ${fmtPct(Math.min(1, b.chance))}`} />
            ))}
          </Row>
        </>
      ) : null}

      {item.module ? (
        <>
          <SectionLabel>{t("module.odds")}</SectionLabel>
          <QualityOdds odds={qualityOdds(g)} />
          <Txt variant="label" color="inkDim">
            {t("module.instance")}
          </Txt>
          <SectionLabel>{t("module.effects")}</SectionLabel>
          <View>
            {item.module.effects.map((e, i) => (
              <EffectLine key={i} effect={e} />
            ))}
            <Fact label={tg(item.module.power < 0 ? "module.supplies" : "module.draws")} value={`${fmt(Math.abs(item.module.power))} MW`} />
            <Fact label={tg("module.wearBase")} value={t("module.wearValue", { n: fmt(item.module.wear, 2) })} />
          </View>
        </>
      ) : null}

      {megaNote ? (
        <>
          <SectionLabel>{t("mega.title")}</SectionLabel>
          <View>
            {(megaFx ?? []).map((e, i) => (
              <EffectLine key={i} effect={e} />
            ))}
            <Txt variant="body" color="inkDim">
              {t(`mega.${megaNote}`)}
            </Txt>
          </View>
        </>
      ) : null}

      {root && known ? (
        <>
          <Rule />
          {autoFeature ? (
            <Row gap="sm">
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="bodyBold">{t("auto.title")}</Txt>
                <Txt variant="label" color="inkDim" numberOfLines={2}>
                  {t("auto.hint")}
                </Txt>
              </View>
              <Toggle
                value={autoOn}
                color="mint"
                accessibilityLabel={t("auto.title")}
                onChange={() => {
                  const res = act((gg) => toggleAutoRecipe(gg, def.id));
                  if (!res.ok) {
                    sfx("deny");
                    toast(t(res.reason === "max" ? "auto.full" : "fail.locked"), "warn");
                  }
                }}
              />
            </Row>
          ) : (
            <Row gap="sm" align="flex-start">
              <Icon name="lock" size={16} color="inkDim" />
              <Txt variant="label" color="inkDim" style={{ flex: 1 }}>
                {t("auto.locked", { name: tr(autoNode?.name) })}
              </Txt>
            </Row>
          )}
          {built ? <AgainStrip /> : null}
        </>
      ) : null}
    </>
  );
});

function StatCell({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
      <Txt variant="micro" color="inkDim" upper numberOfLines={1}>
        {label}
      </Txt>
      <Txt variant="bodyBold" color={good ? "good" : "ink"} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {value}
      </Txt>
    </View>
  );
}

export function QualityOdds({ odds }: { odds: number[] }) {
  const tg = useT("grid");
  return (
    <Col gap="xs">
      <View style={{ flexDirection: "row", height: 8, borderRadius: 2, overflow: "hidden", gap: 1 }}>
        {odds.map((p, q) => (
          <View key={q} style={{ flex: Math.max(0.004, p), backgroundColor: QUALITY_COLORS[q] }} />
        ))}
      </View>
      <Row gap="sm" wrap>
        {odds.map((p, q) => (
          <Row key={q} gap={4}>
            <View style={{ width: 6, height: 6, borderRadius: 1, backgroundColor: QUALITY_COLORS[q] }} />
            <Txt variant="label">{`${tg(`quality.${q}`)} ${fmtPct(p, p < 0.1 ? 1 : 0)}`}</Txt>
          </Row>
        ))}
      </Row>
    </Col>
  );
}

// ---------- sheet -----------------------------------------------------------------------------

export function RecipeSheet({ recipe, onClose }: { recipe: RecipeId | null; onClose: () => void }) {
  const t = useT("craft");
  const tr = useTr();
  const [shown, setShown] = useState<RecipeId | null>(null);
  const [path, setPath] = useState<Node[]>([]);
  const [qty, setQty] = useState<Qty>("1");

  // a newly opened recipe starts at the root of its own tree; the old one stays up while closing
  if (recipe && recipe !== shown) {
    setShown(recipe);
    setPath([{ item: primaryOf(content.recipes[recipe]), recipe }]);
    setQty("1");
  } else if (!recipe && shown) setShown(null);

  const node: Node | undefined = path[path.length - 1];
  const def = node?.recipe ? content.recipes[node.recipe] : undefined;
  const state = useGame(
    (g) => {
      if (!def) return "";
      const n = qty === "max" ? maxBatches(g, def) : 0;
      return `${g.state.recipes[def.id] ?? 0}|${g.state.decks[def.station].level > 0 ? 1 : 0}|${n}|${craftSeconds(g, def.id).toFixed(1)}`;
    },
    Object.is,
    3,
  );

  const drill = useCallback((item: ItemId) => {
    sfx("uiOpen", { volume: 0.5 });
    setPath((p) => [...p, { item, recipe: bestRecipeFor(getGame(), item) }]);
    setQty("1");
  }, []);
  const switchRecipe = useCallback((id: RecipeId) => setPath((p) => [...p.slice(0, -1), { item: p[p.length - 1].item, recipe: id }]), []);
  const back = useCallback(() => setPath((p) => (p.length > 1 ? p.slice(0, -1) : p)), []);

  if (!node) return <Sheet visible={false} onClose={onClose} />;

  const name = tr(content.items[node.item]?.name);
  let footer = path.length > 1 ? <Key label={t("sheet.back")} icon="back" onPress={back} /> : null;
  if (def) {
    const [known, built, max, secs] = state.split("|");
    const g = getGame();
    const batches = batchesOf(g, def, qty);
    const disabled = known !== "1" || built !== "1";
    const sub = disabled
      ? t(known !== "1" ? "sheet.unknown" : "sheet.noStation", { station: tr(content.decks[def.station].name) })
      : batches === -1
        ? t("sheet.repeatNote")
        : `${t("sheet.batches", { count: batches })} · ${secsText(Number(secs) * batches)}`;
    footer = (
      <Col gap="sm">
        <Segmented<Qty>
          value={qty}
          onChange={setQty}
          tone="cobalt"
          options={[
            { value: "1", label: "1" },
            { value: "5", label: "5" },
            { value: "25", label: "25" },
            { value: "max", label: qty === "max" ? `${t("qty.max")} ${max}` : t("qty.max") },
            { value: "inf", label: t("qty.repeat") },
          ]}
        />
        <Row gap="sm">
          {path.length > 1 ? <Key icon="back" width={52} size="lg" onPress={back} accessibilityLabel={t("sheet.back")} /> : null}
          <Key
            testID="queue-key"
            flex={1}
            size="lg"
            tone="orange"
            icon="queue"
            label={t("sheet.queue", { name })}
            sublabel={sub}
            disabled={disabled}
            sound={null}
            onPress={() => {
              if (enqueue(def.id, batches, t, name) && path.length === 1) onClose();
            }}
          />
        </Row>
      </Col>
    );
  }

  return (
    <Sheet visible={!!recipe} onClose={onClose} title={name} footer={footer} maxHeight={0.9} testID="recipe-sheet">
      {path.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, alignItems: "center" }}>
          {path.map((p, i) => (
            <Row key={i} gap="xs">
              {i > 0 ? <Icon name="right" size={16} color="inkDim" /> : null}
              <Chip label={tr(content.items[p.item]?.name)} icon={content.items[p.item]?.icon} selected={i === path.length - 1} onPress={() => setPath((old) => old.slice(0, i + 1))} />
            </Row>
          ))}
        </ScrollView>
      ) : null}
      <NodeBody key={`${node.item}:${node.recipe ?? ""}`} node={node} qty={qty} root={path.length === 1} onDrill={drill} onSwitch={switchRecipe} />
    </Sheet>
  );
}
