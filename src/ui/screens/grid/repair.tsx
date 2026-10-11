// Repair section (hull and every damaged module with its quickest fix) and the bots section
// (status, glitches, the maintenance priority list, autonomous maintenance).
import { memo, useMemo } from "react";
import { ScrollView, View, type GestureResponderEvent } from "react-native";

import { content } from "@/content";
import { bestRepairItem, botRate, botsBusyUntil, clearGlitch, findModule, repairWithItem, setAutoMaintenance, setRepairPriority } from "@/engine/core";
import type { Game } from "@/engine/types";
import { useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { act, getGame, useGame } from "@/store/game";
import { goTo } from "@/store/ui";
import { fmt, fmtPct, fmtTime, useFmt } from "@/ui/format";
import { Badge, Chip, EmptyState, Icon, IconKey, Key, Led, ProgressBar, Row, ScrollWell, Toggle, Txt, popNumberAt, toast, useTheme } from "@/ui/kit";
import { space } from "@/ui/theme";

import { cellName, researchForFeature } from "../craft/model";
import { LockCard, SectionLabel } from "../craft/parts";
import { ModuleTile } from "./ModuleTile";
import { modState } from "./model";

const ROW_H = 64;

function hpOf(g: Game, target: number): number {
  return target === 0 ? g.state.hull.hp : (findModule(g, target)?.hp ?? -1);
}

// ---------- damaged list ----------------------------------------------------------------------

interface DamageRow {
  target: number;
  hp: number;
  best: string | null;
}

function damageSig(g: Game): string {
  let s = `${Math.floor(g.state.hull.hp)}:${bestRepairItem(g, g.state.hull.hp) ?? ""}`;
  for (const m of g.state.modules) if (m.hp < 99.5) s += `|${m.uid}:${Math.floor(m.hp)}:${m.slot}:${bestRepairItem(g, m.hp) ?? ""}`;
  return s;
}

function buildDamage(g: Game): DamageRow[] {
  const rows: DamageRow[] = [];
  for (const m of g.state.modules) if (m.hp < 99.5) rows.push({ target: m.uid, hp: m.hp, best: bestRepairItem(g, m.hp) });
  // installed modules before spares, the worst first
  rows.sort((a, b) => {
    const ia = (findModule(g, a.target)?.slot ?? -1) >= 0 ? 0 : 1;
    const ib = (findModule(g, b.target)?.slot ?? -1) >= 0 ? 0 : 1;
    return ia - ib || a.hp - b.hp;
  });
  rows.unshift({ target: 0, hp: g.state.hull.hp, best: g.state.hull.hp < 100 ? bestRepairItem(g, g.state.hull.hp) : null });
  return rows;
}

const DamageRowView = memo(function DamageRowView({ row, onOpen }: { row: DamageRow; onOpen: (target: number) => void }) {
  const t = useT("grid");
  const tr = useTr();
  const theme = useTheme();
  const g = getGame();
  const inst = row.target === 0 ? undefined : findModule(g, row.target);
  const state = modState(row.hp);
  const hull = row.target === 0;
  const name = hull ? t("hull.name") : tr(content.items[inst?.item ?? ""]?.name);
  const where = hull ? t("hull.sub") : inst && inst.slot >= 0 ? cellName(inst.slot, g.state.grid.w) : t("module.inStorage");
  const use = (event: GestureResponderEvent) => {
    if (!row.best) return;
    const before = hpOf(getGame(), row.target);
    const res = act((gg) => repairWithItem(gg, row.target, row.best as string));
    if (res.ok) {
      sfx("repairTick");
      haptic("success");
      popNumberAt(event, `+${Math.round(hpOf(getGame(), row.target) - before)} %`, "good");
    } else {
      sfx("deny");
      toast(t("repair.none"), "warn");
    }
  };
  return (
    <View testID={`damage-${row.target}`} style={{ height: ROW_H, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.xs, borderBottomWidth: 1, borderBottomColor: theme.rule }}>
      {inst ? <ModuleTile item={inst.item} q={inst.q} hp={inst.hp} size={44} /> : <Icon name="hull" size={24} chip style={{ width: 44, height: 44 }} />}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Txt variant="bodyBold" numberOfLines={1}>
          {name}
        </Txt>
        <ProgressBar value={row.hp / 100} height={4} tone={state === "ok" ? "good" : state === "degraded" ? "yellow" : "red"} />
        <Txt variant="label" color={state === "ok" ? "inkDim" : state === "degraded" ? "warn" : "bad"} numberOfLines={1}>
          {`${fmtPct(row.hp / 100)} · ${hull ? where : `${t(`state.${state}`)} · ${where}`}`}
        </Txt>
      </View>
      {row.best ? (
        <IconKey testID={`quick-repair-${row.target}`} icon={content.items[row.best]?.icon ?? row.best} size="sm" width={44} sound={null} onPress={use} accessibilityLabel={t("repair.quickA11y", { item: tr(content.items[row.best]?.name), name })} />
      ) : null}
      <Key testID={`repair-open-${row.target}`} icon="repair" size="sm" width={44} tone={row.hp < 100 ? "cobalt" : "black"} disabled={row.hp >= 100} onPress={() => onOpen(row.target)} accessibilityLabel={t("repair.openA11y", { name })} />
    </View>
  );
});

export const RepairSection = memo(function RepairSection({ onOpen }: { onOpen: (target: number) => void }) {
  const t = useT("grid");
  useFmt();
  const sig = useGame(damageSig, Object.is, 3);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => buildDamage(getGame()), [sig]);
  return (
    <ScrollWell<DamageRow>
      style={{ flex: 1 }}
      data={rows}
      keyExtractor={(r) => String(r.target)}
      renderItem={({ item }) => <DamageRowView row={item} onOpen={onOpen} />}
      getItemLayout={(_, index) => ({ length: ROW_H, offset: ROW_H * index, index })}
      ListFooterComponent={rows.length === 1 ? <EmptyState compact icon="wrench" title={t("repair.allGoodTitle")} hint={t("repair.allGoodHint")} /> : null}
    />
  );
});

// ---------- bots ------------------------------------------------------------------------------

function botsSig(g: Game): string {
  const r = g.state.repair;
  const job = r.jobs[0];
  let s = `${g.state.features.repairBots ?? 0}|${g.state.features.autoMaintenance ?? 0}|${r.botLevel}|${botRate(g).toFixed(5)}|${r.auto ? 1 : 0}|${Math.max(0, Math.ceil(botsBusyUntil(g) - g.state.t))}`;
  s += `|${job ? `${job.target}:${job.glitchUntil > g.state.t ? 1 : 0}:${Math.floor(hpOf(g, job.target))}` : ""}|`;
  for (const p of r.priority) s += `${p}:${Math.floor(hpOf(g, p))},`;
  s += `|${g.state.modules.length}`;
  return s;
}

export const BotsSection = memo(function BotsSection() {
  const t = useT("grid");
  const tr = useTr();
  const theme = useTheme();
  useFmt();
  useGame(botsSig, Object.is, 3);
  const g = getGame();
  const rep = g.state.repair;
  const hasBots = g.state.features.repairBots === 1 && rep.botLevel > 0;
  const hasAuto = g.state.features.autoMaintenance === 1;
  const botsNode = researchForFeature("repairBots");
  const autoNode = researchForFeature("autoMaintenance");
  const name = (target: number): string => (target === 0 ? t("hull.name") : tr(content.items[findModule(g, target)?.item ?? ""]?.name) || "?");
  const setList = (list: number[]) => {
    act((gg) => setRepairPriority(gg, list));
  };

  if (!hasBots) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: space.sm }}>
        <LockCard icon="bot" title={tr(botsNode?.name) || t("bots.title")} hint={t("bots.locked", { name: tr(botsNode?.name) })} actionLabel={t("bots.toResearch")} onAction={() => goTo("meta", "research")} />
        <LockCard compact icon="kipp" title={tr(autoNode?.name) || t("auto.title")} hint={t("auto.locked", { name: tr(autoNode?.name) })} />
      </ScrollView>
    );
  }

  const job = rep.jobs[0];
  const glitched = !!job && job.glitchUntil > g.state.t;
  const busy = Math.max(0, botsBusyUntil(g) - g.state.t);
  const candidates = [0, ...g.state.modules.filter((m) => m.slot >= 0).map((m) => m.uid)].filter((id) => rep.priority.indexOf(id) < 0);

  return (
    <ScrollWell style={{ flex: 1 }} padding={space.sm} contentContainerStyle={{ gap: space.sm }}>
      <Row gap="sm" align="flex-start">
        <Icon name="bot" size={24} chip />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Row gap="xs" wrap>
            <Txt variant="bodyBold">{t("bots.title")}</Txt>
            <Badge label={t("bots.level", { n: rep.botLevel })} />
            <Badge label={t("bots.rate", { n: fmt(botRate(g) * 60, 3) })} tone="cobalt" />
          </Row>
          <Row gap="xs">
            <Led state={glitched ? "blink" : job || busy > 0 ? "on" : "off"} color={glitched ? "red" : busy > 0 ? "yellow" : "mint"} />
            <Txt variant="label" color={glitched ? "bad" : busy > 0 ? "warn" : "inkDim"} numberOfLines={2} style={{ flex: 1 }}>
              {busy > 0
                ? t("bots.away", { time: fmtTime(busy) })
                : glitched && job
                  ? t("bots.glitched", { name: name(job.target) })
                  : job
                    ? t("bots.working", { name: name(job.target), pct: fmtPct(Math.max(0, hpOf(g, job.target)) / 100) })
                    : t("bots.idle")}
            </Txt>
          </Row>
        </View>
        {glitched && job ? (
          <Key
            testID="glitch-fix"
            label={t("bots.fix")}
            icon="wrench"
            tone="orange"
            size="sm"
            sound={null}
            onPress={() => {
              if (act((gg) => clearGlitch(gg, job.target)).ok) {
                sfx("beepGood");
                haptic("success");
                toast(t("bots.fixed"), "good");
              }
            }}
          />
        ) : null}
      </Row>

      <SectionLabel right={<Txt variant="micro" color="inkDim">{t("priority.hint")}</Txt>}>{t("priority.title")}</SectionLabel>
      <View>
        {rep.priority.map((target, i) => {
          const hp = hpOf(g, target);
          const n = name(target);
          return (
            <View key={target} testID={`prio-${i}`} style={{ height: 48, flexDirection: "row", alignItems: "center", gap: space.sm, borderBottomWidth: 1, borderBottomColor: theme.rule }}>
              <Txt variant="bodyBold" color="inkDim" style={{ width: 18 }} align="center">
                {String(i + 1)}
              </Txt>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="bodyBold" numberOfLines={1}>
                  {n}
                </Txt>
                <Txt variant="label" color={hp < 50 ? "warn" : "inkDim"}>
                  {fmtPct(Math.max(0, hp) / 100)}
                </Txt>
              </View>
              <Row gap={4}>
                <IconKey icon="up" size="sm" width={38} disabled={i === 0} testID={`prio-up-${i}`} accessibilityLabel={t("priority.up", { name: n })} onPress={() => setList(swap(rep.priority, i, i - 1))} />
                <IconKey icon="down" size="sm" width={38} disabled={i === rep.priority.length - 1} testID={`prio-down-${i}`} accessibilityLabel={t("priority.down", { name: n })} onPress={() => setList(swap(rep.priority, i, i + 1))} />
                <IconKey icon="close" size="sm" width={38} accessibilityLabel={t("priority.remove", { name: n })} onPress={() => setList(rep.priority.filter((x) => x !== target))} />
              </Row>
            </View>
          );
        })}
        {rep.priority.length === 0 ? (
          <Txt variant="label" color="inkDim">
            {t("priority.empty")}
          </Txt>
        ) : null}
      </View>
      {candidates.length > 0 ? (
        <Row gap="xs" wrap>
          {candidates.map((id) => (
            <Chip key={id} icon="plus" label={name(id)} onPress={() => setList([...rep.priority, id])} accessibilityLabel={t("priority.add", { name: name(id) })} />
          ))}
        </Row>
      ) : null}

      <SectionLabel>{t("auto.title")}</SectionLabel>
      {hasAuto ? (
        <Row gap="sm" align="flex-start">
          <Icon name="kipp" size={24} chip />
          <Txt variant="label" color="inkDim" style={{ flex: 1 }}>
            {t("auto.what", { below: (content.balance.autoRepairBelow as number) ?? 50, stock: (content.balance.autoRepairStock as number) ?? 5 })}
          </Txt>
          <Toggle
            value={rep.auto}
            color="mint"
            accessibilityLabel={t("auto.title")}
            onChange={(next) => {
              if (!act((gg) => setAutoMaintenance(gg, next)).ok) sfx("deny");
            }}
          />
        </Row>
      ) : (
        <LockCard compact icon="kipp" title={tr(autoNode?.name) || t("auto.title")} hint={t("auto.locked", { name: tr(autoNode?.name) })} />
      )}
    </ScrollWell>
  );
});

function swap(list: number[], a: number, b: number): number[] {
  const out = list.slice();
  const tmp = out[a];
  out[a] = out[b];
  out[b] = tmp;
  return out;
}
