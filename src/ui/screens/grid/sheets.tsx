// Sheets of the grid tab: the install/remove preview (every changed stat before commitment), the
// module sheet (effects, wear, upgrade, scrap, repair) and the repair options for one target.
import { memo, useMemo, useState } from "react";
import { View, type GestureResponderEvent } from "react-native";

import * as B from "@/engine/big";
import { content } from "@/content";
import {
  adjacentSame,
  findModule,
  installModule,
  moduleBonus,
  previewInstall,
  removeModule,
  repairGame,
  repairWithItem,
  scrapModule,
  scrapValue,
  startManualRepair,
  upgradeCost,
  upgradeModule,
  wearPerSecond,
} from "@/engine/core";
import type { ItemId } from "@/engine/types";
import { useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { act, getGame, useGame } from "@/store/game";
import { fmt, fmtBonus, fmtPct, fmtTime, useFmt } from "@/ui/format";
import { Badge, Col, CostTag, Icon, Key, KeyRow, ListRow, Meter, QualityPips, Row, Rule, Sheet, StatDelta, Txt, Well, popNumberAt, toast, type BarZone } from "@/ui/kit";
import { space } from "@/ui/theme";

import { LOWER_BETTER, cellName } from "../craft/model";
import { EffectLine, Fact, SectionLabel } from "../craft/parts";
import { ModuleTile } from "./ModuleTile";
import { degradeAt, modState, repairItems } from "./model";

const HP_ZONES: readonly BarZone[] = [
  { from: 0, tone: "red" },
  { from: 0.2, tone: "yellow" },
  { from: 0.5, tone: "mint" },
];

const mult = (v: number): string => `×${fmt(v, 3)}`;
const signed = (v: number): string => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v), 3)}`;

// ---------- install / remove preview ----------------------------------------------------------

export interface PreviewTarget {
  uid: number;
  /** Grid cell, or -1 to take the module off the grid. */
  cell: number;
}

export function PreviewSheet({ target, onClose, onDone }: { target: PreviewTarget | null; onClose: () => void; onDone: (uid: number, cell: number) => void }) {
  const t = useT("grid");
  const tr = useTr();
  useFmt();
  const [shown, setShown] = useState<PreviewTarget | null>(null);
  if (target && target !== shown) setShown(target);
  const cur = target ?? shown;
  const data = useMemo(() => {
    if (!cur) return null;
    const g = getGame();
    const inst = findModule(g, cur.uid);
    return inst ? { preview: previewInstall(g, cur.uid, cur.cell), item: inst.item, q: inst.q, hp: inst.hp, from: inst.slot, w: g.state.grid.w } : null;
  }, [cur]);
  if (!cur || !data) return <Sheet visible={false} onClose={onClose} />;

  const g = getGame();
  const { preview } = data;
  const removing = cur.cell === -1;
  const name = tr(content.items[data.item]?.name);
  const displaced = preview.displaced ? findModule(g, preview.displaced) : undefined;
  const nothing = preview.stats.length === 0 && preview.decks.length === 0 && Math.abs(preview.power.to - preview.power.from) < 1e-9;
  const confirm = () => {
    const res = act((gg) => (removing ? removeModule(gg, cur.uid) : installModule(gg, cur.uid, cur.cell)));
    if (!res.ok) {
      sfx("deny");
      haptic("error");
      toast(t("place.failed"), "bad");
      return;
    }
    sfx("moduleInstall");
    haptic("impact");
    toast(removing ? t("place.removed", { name }) : t("place.installed", { name, cell: cellName(cur.cell, data.w) }), { tone: "good", icon: removing ? "remove" : "install" });
    onDone(cur.uid, cur.cell);
  };

  return (
    <Sheet
      visible={!!target}
      onClose={onClose}
      testID="preview-sheet"
      title={removing ? t("preview.removeTitle") : t("preview.installTitle", { cell: cellName(cur.cell, data.w) })}
      footer={
        <KeyRow>
          <Key label={t("preview.cancel")} onPress={onClose} />
          <Key testID="preview-confirm" label={removing ? t("preview.remove") : t("preview.install")} icon={removing ? "remove" : "install"} tone="orange" sound={null} disabled={!preview.ok} onPress={confirm} flex={2} />
        </KeyRow>
      }
    >
      <Row gap="md">
        <ModuleTile item={data.item} q={data.q} hp={data.hp} />
        <Col gap="xs" flex>
          <Txt variant="bodyBold" numberOfLines={1}>
            {name}
          </Txt>
          <Txt variant="label" color="inkDim">
            {removing
              ? t("preview.toStorage", { cell: cellName(data.from, data.w) })
              : data.from >= 0
                ? t("preview.move", { from: cellName(data.from, data.w), to: cellName(cur.cell, data.w) })
                : t("preview.fromStorage", { to: cellName(cur.cell, data.w) })}
          </Txt>
          {!removing ? (
            <Txt variant="label" color={preview.adjacent > 0 ? "good" : "inkDim"}>
              {preview.bonus <= 0 ? t("preview.offline") : preview.adjacent > 0 ? t("preview.factor", { factor: mult(preview.bonus), count: preview.adjacent }) : t("preview.factorAlone", { factor: mult(preview.bonus) })}
            </Txt>
          ) : null}
        </Col>
      </Row>
      {displaced ? (
        <Row gap="sm" align="flex-start">
          <Icon name="warning" size={16} chip />
          <Txt variant="body" color="warn" style={{ flex: 1 }}>
            {t(data.from >= 0 ? "preview.swap" : "preview.displace", { name: tr(content.items[displaced.item]?.name) })}
          </Txt>
        </Row>
      ) : null}

      <SectionLabel>{t("preview.changes")}</SectionLabel>
      <Well gap={2}>
        {preview.stats.map((s) => (
          <DeltaRow key={s.stat} label={t(`stat.${s.stat}`)} from={s.from} to={s.to} invert={LOWER_BETTER[s.stat] === true} />
        ))}
        {preview.decks.map((d) => (
          <DeltaRow key={d.deck} label={t("stat.deckOutput", { deck: tr(content.decks[d.deck].name) })} from={d.from} to={d.to} />
        ))}
        {Math.abs(preview.power.to - preview.power.from) >= 1e-9 ? (
          <Row gap="sm" justify="space-between" style={{ minHeight: 22 }}>
            <Txt variant="body" numberOfLines={1} style={{ flex: 1 }}>
              {t("preview.power")}
            </Txt>
            <Txt variant="label" color="inkDim" tabular>{`${signed(preview.power.from)} → ${signed(preview.power.to)}`}</Txt>
            <StatDelta value={preview.power.to - preview.power.from} text={`${signed(preview.power.to - preview.power.from)} MW`} />
          </Row>
        ) : null}
        {nothing ? (
          <Txt variant="body" color="inkDim">
            {t("preview.nothing")}
          </Txt>
        ) : null}
      </Well>
    </Sheet>
  );
}

function DeltaRow({ label, from, to, invert }: { label: string; from: number; to: number; invert?: boolean }) {
  return (
    <Row gap="sm" justify="space-between" style={{ minHeight: 22 }}>
      <Txt variant="body" numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </Txt>
      <Txt variant="label" color="inkDim" tabular>{`${mult(from)} → ${mult(to)}`}</Txt>
      <StatDelta value={from > 0 ? to / from - 1 : to - from} invert={invert} />
    </Row>
  );
}

// ---------- repair options --------------------------------------------------------------------

/** Manual mini-game and every repair consumable for one target (module uid, 0 = hull). */
export const RepairOptions = memo(function RepairOptions({ target, onStarted }: { target: number; onStarted?: () => void }) {
  const t = useT("grid");
  const tr = useTr();
  const items = useMemo(() => repairItems(), []);
  const sig = useGame(
    (g) => {
      const hp = target === 0 ? g.state.hull.hp : (findModule(g, target)?.hp ?? -1);
      let s = `${hp.toFixed(1)}|${g.state.minigame ? 1 : 0}`;
      for (const id of items) s += `|${fmt(g.state.inv[id] ?? 0)}`;
      return s;
    },
    Object.is,
    2,
  );
  const g = getGame();
  const hp = Number(sig.split("|")[0]);
  if (hp < 0) return null;
  const pick = repairGame(g, target);
  const full = hp >= 100;
  const use = (id: ItemId, event: GestureResponderEvent) => {
    const before = hp;
    const res = act((gg) => repairWithItem(gg, target, id));
    if (!res.ok) {
      sfx("deny");
      haptic("warning");
      toast(t(res.reason === "max" ? "repair.capped" : "repair.none"), "warn");
      return;
    }
    const after = target === 0 ? getGame().state.hull.hp : (findModule(getGame(), target)?.hp ?? before);
    sfx("repairTick");
    haptic("success");
    popNumberAt(event, `+${Math.round(after - before)} %`, "good");
  };
  return (
    <Col gap="sm">
      {pick ? (
        <Key
          testID="repair-manual"
          icon={`mg_${pick.game}`}
          tone="cobalt"
          size="lg"
          label={t("repair.manual")}
          sublabel={`${t(`game.${pick.game}`)} · ${t("repair.tier", { n: pick.tier })} · ${t("repair.manualGain")}`}
          disabled={full || !!g.state.minigame}
          onPress={() => {
            const res = act((gg) => startManualRepair(gg, target));
            if (res.ok) onStarted?.();
            else {
              sfx("deny");
              toast(t(res.reason === "busy" ? "repair.busy" : "repair.full"), "warn");
            }
          }}
        />
      ) : null}
      <View>
        {items.map((id) => {
          const def = content.items[id];
          const spec = def.consumable;
          const have = g.state.inv[id] ?? B.ZERO;
          const count = B.cmp(have, B.big(1 - 1e-9)) >= 0;
          const cap = spec?.repairCap ?? 100;
          const capped = hp >= cap;
          // show what the player has or could plausibly make; hide the rest of the catalogue
          if (!count && g.state.recipes[id] !== 1) return null;
          return (
            <ListRow
              key={id}
              icon={def.icon}
              title={`${tr(def.name)} ×${fmt(have)}`}
              subtitle={capped ? t("repair.overCap", { cap }) : !count ? t("repair.outOf") : t("repair.restores", { pct: spec?.repairPct ?? 0, cap })}
              right={<Key testID={`use-${id}`} size="sm" label={t("repair.use")} sound={null} disabled={!count || capped} onPress={(e) => use(id, e)} />}
            />
          );
        })}
      </View>
    </Col>
  );
});

export function RepairSheet({ target, onClose }: { target: number | null; onClose: () => void }) {
  const t = useT("grid");
  const tr = useTr();
  const [shown, setShown] = useState<number | null>(null);
  if (target !== null && target !== shown) setShown(target);
  const cur = target ?? shown;
  const hp = useGame((g) => (cur === null ? -1 : cur === 0 ? g.state.hull.hp : (findModule(g, cur)?.hp ?? -1)), Object.is, 2);
  if (cur === null || hp < 0) return <Sheet visible={false} onClose={onClose} />;
  const inst = cur === 0 ? undefined : findModule(getGame(), cur);
  const name = inst ? tr(content.items[inst.item]?.name) : t("hull.name");
  return (
    <Sheet visible={target !== null} onClose={onClose} title={t("repair.sheetTitle", { name })} testID="repair-sheet">
      <Meter value={hp / 100} label={t(inst ? "module.integrity" : "hull.integrity")} valueText={fmtPct(hp / 100)} zones={HP_ZONES} />
      {!inst ? (
        <Txt variant="label" color="inkDim">
          {t("hull.hint")}
        </Txt>
      ) : null}
      <RepairOptions target={cur} onStarted={onClose} />
    </Sheet>
  );
}

// ---------- module sheet ----------------------------------------------------------------------

export interface ModuleSheetProps {
  uid: number | null;
  onClose: () => void;
  /** Start placing this module (install from storage or move on the grid). */
  onPlace: (uid: number) => void;
  onRemove: (uid: number) => void;
}

export function ModuleSheet({ uid, onClose, onPlace, onRemove }: ModuleSheetProps) {
  const t = useT("grid");
  const tr = useTr();
  useFmt();
  const [shown, setShown] = useState<number | null>(null);
  const [armed, setArmed] = useState(false);
  if (uid !== null && uid !== shown) {
    setShown(uid);
    setArmed(false);
  }
  const cur = uid ?? shown;
  const sig = useGame(
    (g) => {
      const inst = cur === null ? undefined : findModule(g, cur);
      if (!inst) return "";
      return `${inst.hp.toFixed(1)}|${inst.lvl}|${inst.slot}|${B.cmp(g.state.credits, upgradeCost(g, inst)) >= 0 ? 1 : 0}|${moduleBonus(g, inst).toFixed(3)}|${g.mods.wearRate.toFixed(3)}`;
    },
    Object.is,
    3,
  );
  const g = getGame();
  const inst = cur === null ? undefined : findModule(g, cur);
  const spec = inst ? content.items[inst.item]?.module : undefined;
  if (!inst || !spec || !sig) return <Sheet visible={false} onClose={onClose} />;

  const def = content.items[inst.item];
  const installed = inst.slot >= 0;
  const state = modState(inst.hp);
  const factor = moduleBonus(g, inst);
  const adj = installed ? adjacentSame(g, inst) : 0;
  const wearHour = wearPerSecond(g, inst) * 3600;
  const hazard = Math.max(1, g.api.hazardFactor());
  const toDegrade = installed && inst.hp > degradeAt() && wearHour > 0 ? ((inst.hp - degradeAt()) / wearHour) * 3600 : -1;
  const cost = upgradeCost(g, inst);
  const canPay = B.cmp(g.state.credits, cost) >= 0;
  const perLevel = (content.balance.moduleLevelBonus as number | undefined) ?? 0.1;
  const upGain = (1 + perLevel * (inst.lvl + 1)) / (1 + perLevel * inst.lvl) - 1;
  const refund = scrapValue(g, inst);
  const name = tr(def.name);

  return (
    <Sheet
      visible={uid !== null}
      onClose={onClose}
      title={name}
      testID="module-sheet"
      maxHeight={0.9}
      footer={
        installed ? (
          <KeyRow>
            <Key testID="module-move" label={t("module.move")} icon="install" onPress={() => onPlace(inst.uid)} />
            <Key testID="module-remove" label={t("module.remove")} icon="remove" onPress={() => onRemove(inst.uid)} />
          </KeyRow>
        ) : (
          <Key testID="module-install" label={t("module.install")} icon="install" tone="orange" onPress={() => onPlace(inst.uid)} />
        )
      }
    >
      <Row gap="md" align="flex-start">
        <ModuleTile item={inst.item} q={inst.q} hp={inst.hp} size={60} adjBonus={adj * ((content.balance.adjacencyBonus as number) ?? 0.15)} />
        <Col gap="xs" flex>
          <Row gap="xs" wrap>
            <QualityPips quality={inst.q} />
            <Txt variant="bodyBold">{t(`quality.${inst.q}`)}</Txt>
            <Badge label={t("module.level", { n: inst.lvl })} />
            <Badge label={t(`state.${state}`)} tone={state === "ok" ? "good" : state === "degraded" ? "warn" : "bad"} />
          </Row>
          <Txt variant="label" color="inkDim">
            {installed ? t("module.inCell", { cell: cellName(inst.slot, g.state.grid.w) }) : t("module.inStorage")}
          </Txt>
          <Txt variant="label" color="inkDim" numberOfLines={3}>
            {tr(def.desc)}
          </Txt>
        </Col>
      </Row>
      <Meter value={inst.hp / 100} label={t("module.integrity")} valueText={fmtPct(inst.hp / 100, 1)} zones={HP_ZONES} />

      <SectionLabel right={<Txt variant="micro" color="inkDim">{t("module.factor", { factor: mult(factor) })}</Txt>}>{t("module.effects")}</SectionLabel>
      <View>
        {spec.effects.map((e, i) => (
          <EffectLine key={i} effect={e} factor={factor} dim={factor <= 0} />
        ))}
        {factor <= 0 ? (
          <Txt variant="label" color="bad">
            {t("module.offlineNote")}
          </Txt>
        ) : null}
        <Fact label={t(spec.power < 0 ? "module.supplies" : "module.draws")} value={`${fmt(spec.power < 0 ? -spec.power * factor : spec.power, 3)} MW`} />
        {installed ? <Fact label={t("module.adjacent")} value={adj > 0 ? t("module.adjacentValue", { count: adj, bonus: fmtBonus(1 + adj * ((content.balance.adjacencyBonus as number) ?? 0.15)) }) : t("module.adjacentNone")} /> : null}
        <Fact label={t("module.wearHere")} value={t("module.wearValue", { n: fmt(wearHour, 2) })} color={hazard > 1 ? "warn" : undefined} />
        {hazard > 1 ? <Fact label={t("module.hazard")} value={mult(hazard)} color="warn" /> : null}
        {toDegrade >= 0 ? <Fact label={t("module.toDegrade")} value={fmtTime(toDegrade)} /> : null}
      </View>

      <Rule />
      <Row gap="sm">
        <Col gap={2} flex>
          <Txt variant="bodyBold">{t("module.upgrade", { from: inst.lvl, to: inst.lvl + 1 })}</Txt>
          <Row gap="sm">
            <Txt variant="label" color="inkDim">
              {t("module.upgradeGain")}
            </Txt>
            <StatDelta value={upGain} size="sm" />
          </Row>
          <CostTag icon="coin" amount={fmt(cost)} affordable={canPay} size="sm" />
        </Col>
        <Key
          testID="module-upgrade"
          label={t("module.upgradeKey")}
          icon="upgrade"
          tone="yellow"
          width={132}
          disabled={!canPay}
          sound={null}
          onPress={(e) => {
            const res = act((gg) => upgradeModule(gg, inst.uid));
            if (res.ok) {
              sfx("levelUp");
              haptic("success");
              popNumberAt(e, fmtBonus(1 + upGain, 1), "good");
            } else {
              sfx("deny");
              toast(t(res.reason === "credits" ? "module.noCredits" : "module.maxLevel"), "warn");
            }
          }}
        />
      </Row>

      {inst.hp < 100 ? (
        <>
          <Rule label={t("repair.title")} />
          <RepairOptions target={inst.uid} onStarted={onClose} />
        </>
      ) : null}

      <Rule />
      {armed ? (
        <Col gap="sm">
          <Txt variant="body" color="bad">
            {t("module.scrapConfirm", { name, refund: fmt(refund) })}
          </Txt>
          <KeyRow>
            <Key label={t("module.scrapCancel")} size="sm" onPress={() => setArmed(false)} />
            <Key
              testID="module-scrap-confirm"
              label={t("module.scrapYes")}
              icon="recycle"
              tone="red"
              size="sm"
              sound={null}
              onPress={() => {
                const res = act((gg) => scrapModule(gg, inst.uid));
                if (res.ok) {
                  sfx("coin");
                  haptic("heavy");
                  toast(t("module.scrapped", { name, refund: fmt(refund) }), { tone: "info", icon: "recycle" });
                  onClose();
                }
              }}
            />
          </KeyRow>
        </Col>
      ) : (
        <Row gap="sm">
          <Col gap={2} flex>
            <Txt variant="bodyBold">{t("module.scrap")}</Txt>
            <Row gap="xs">
              <Txt variant="label" color="inkDim">
                {t("module.scrapRefund")}
              </Txt>
              <CostTag icon="coin" amount={fmt(refund)} size="sm" />
            </Row>
          </Col>
          <Key testID="module-scrap" label={t("module.scrapKey")} icon="recycle" size="sm" width={132} onPress={() => setArmed(true)} />
        </Row>
      )}
      <View style={{ height: space.xs }} />
    </Sheet>
  );
}
