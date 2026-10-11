// Hyperdrive controls: the compact bar pinned to the bottom of the Nav tab, the full jump
// controls used inside sheets, and the drive sheet (fuel, refuel, charge, suggested route).
import { memo, useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { content } from "@/content";
import { baseJumpCost, chargeJump, chargeSeconds, jumpTo, refuel, systemAt } from "@/engine/world";
import { useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { act, getGame, shallowEqual, useGame } from "@/store/game";
import { fmt, fmtPct, fmtTime, itemName } from "@/ui/format";
import { CostTag, Icon, Key, KeyRow, Led, LedRow, Meter, MicroLabel, ProgressBar, Row, Rule, toast, Txt, useTheme, Well } from "@/ui/kit";
import { radius, space } from "@/ui/theme";

import { driveStatus, effectiveTarget, HAZARD_ICON, refuelPlan, route, selectDrive, selectTarget, systemName, useNavUi, useSmooth, type DriveStatus, type DriveView, type TargetView } from "./state";

const num = (n: number): string => fmt(Math.round(n * 10) / 10);

function useStatusText(d: DriveView, tg: TargetView, status: DriveStatus, short = false): string {
  const t = useT("nav");
  const tr = useTr();
  if (short) return t(`drive.short.${status}`, { time: fmtTime(d.cooldown), pct: fmtPct(d.charge), need: num(tg.cost), have: num(d.fuel) });
  switch (status) {
    case "failure":
      return t("drive.status.failure", { name: tr(content.failures[d.failure as keyof typeof content.failures]?.name) });
    case "notLinked":
      return t("drive.status.notLinked", { name: tg.name });
    case "cooldown":
      return t("drive.status.cooldown", { time: fmtTime(d.cooldown) });
    case "charging":
      return t("drive.status.charging", { pct: fmtPct(d.charge) });
    case "noFuel":
      return t("drive.status.noFuel", { need: num(tg.cost), have: num(d.fuel) });
    default:
      return t(`drive.status.${status}`);
  }
}

function canCharge(d: DriveView): boolean {
  return !d.jumping && !d.failure && d.cooldown === 0 && !d.charging && d.charge < 1;
}

function startCharge(deny: string): void {
  const r = act((g) => chargeJump(g));
  if (r.ok) {
    sfx("jumpCharge");
    haptic("impact");
  } else {
    sfx("deny");
    toast(deny, "warn");
  }
}

function useDrive(target: { depth: number; lane: number } | null): { d: DriveView; tg: TargetView; status: DriveStatus } {
  const depth = target ? target.depth : -1;
  const lane = target ? target.lane : -1;
  const d = useGame(selectDrive, shallowEqual, 2);
  const tg = useGame((g) => selectTarget(g, depth >= 0 ? { depth, lane } : null), shallowEqual, 3);
  return { d, tg, status: driveStatus(d, tg) };
}

const LED: Record<DriveStatus, { color: "orange" | "mint" | "red" | "cobalt" | "yellow"; state: "on" | "off" | "blink" }> = {
  jumping: { color: "cobalt", state: "blink" },
  failure: { color: "red", state: "blink" },
  atCore: { color: "mint", state: "on" },
  notLinked: { color: "yellow", state: "on" },
  cooldown: { color: "cobalt", state: "on" },
  charging: { color: "orange", state: "blink" },
  discharged: { color: "orange", state: "off" },
  noFuel: { color: "red", state: "on" },
  ready: { color: "mint", state: "on" },
};

// ---------- full controls (sheets) ----------------------------------------------------

export const JumpControls = memo(function JumpControls({ depth, lane }: { depth: number; lane: number }) {
  const t = useT("nav");
  const theme = useTheme();
  const { d, tg, status } = useDrive(depth >= 0 ? { depth, lane } : null);
  const text = useStatusText(d, tg, status);
  const [armed, setArmed] = useState(false);
  const cooling = status === "cooldown" || (d.cooldown > 0 && !d.jumping);
  const bar = useSmooth(cooling ? d.cooldownFrac : d.charge, 400);
  const risky = tg.has && tg.hazards > 0 && (tg.riskHull || tg.riskShield);
  const close = useNavUi((s) => s.close);

  const onJump = useCallback(() => {
    if (risky && !armed) {
      setArmed(true);
      sfx("alert");
      haptic("warning");
      return;
    }
    const r = act((g) => jumpTo(g, depth, lane));
    if (r.ok) {
      haptic("heavy");
      close();
    } else {
      sfx("deny");
      toast(t(`drive.fail.${r.reason}`, { defaultValue: t("drive.fail.invalid") }), "warn");
    }
  }, [risky, armed, depth, lane, close, t]);

  const secsLeft = d.charging ? Math.ceil((1 - d.charge) * chargeSeconds(getGame())) : 0;
  const readout = cooling ? fmtTime(d.cooldown) : d.charging ? fmtTime(secsLeft) : fmtPct(d.charge);
  const led = LED[status];

  return (
    <View style={styles.gap}>
      <Well gap={space.sm}>
        <Row align="center">
          <Led color={led.color} state={led.state} size={8} />
          <Txt variant="bodyBold" numberOfLines={2} style={styles.fill} color={status === "failure" || status === "noFuel" ? "bad" : status === "notLinked" ? "warn" : "ink"}>
            {text}
          </Txt>
          <Txt variant="bodyBold" tabular>
            {readout}
          </Txt>
        </Row>
        <ProgressBar value={bar} tone={cooling ? "cobalt" : d.charge >= 1 ? "mint" : "orange"} height={10} segments={16} />
        {tg.has ? (
          <Row align="center" wrap>
            <MicroLabel size="label">{t("drive.cost")}</MicroLabel>
            <CostTag icon="fuel" amount={`${num(tg.cost)} / ${num(d.fuel)}`} affordable={tg.affordable} size="sm" boxed />
            {tg.visited ? <MicroLabel size="label">{t("drive.halfPrice")}</MicroLabel> : null}
          </Row>
        ) : null}
        {tg.has && tg.linked && !tg.affordable && status !== "noFuel" ? (
          <Txt variant="label" color="bad">
            {t("drive.status.noFuel", { need: num(tg.cost), have: num(d.fuel) })}
          </Txt>
        ) : null}
      </Well>
      {risky ? (
        <View style={[styles.warn, { borderColor: theme.red, backgroundColor: theme.well }]}>
          <Icon name="warning" size={24} chip />
          <View style={styles.fill}>
            <Txt variant="bodyBold" color="bad">
              {t("drive.riskTitle")}
            </Txt>
            <Txt variant="label">{t(tg.riskHull && tg.riskShield ? "drive.riskBoth" : tg.riskHull ? "drive.riskHull" : "drive.riskShield", { count: tg.hazards })}</Txt>
          </View>
        </View>
      ) : null}
      <KeyRow>
        <Key testID="nav-charge" label={d.charge >= 1 ? t("drive.charged") : d.charging ? t("drive.chargingKey") : t("drive.charge")} icon="power" tone="black" disabled={!canCharge(d)} onPress={() => startCharge(t("drive.fail.cooldown"))} sound={null} />
        <Key
          testID="nav-jump"
          label={armed ? t("drive.jumpAnyway") : t("drive.jump")}
          sublabel={tg.has ? tg.name : undefined}
          icon="jump"
          tone={armed ? "red" : "orange"}
          disabled={status !== "ready"}
          onPress={onJump}
          sound={risky && !armed ? null : "jumpGo"}
        />
      </KeyRow>
    </View>
  );
});

// ---------- drive sheet ---------------------------------------------------------------

export function DriveSheet() {
  const t = useT("nav");
  const picked = useNavUi((s) => s.picked);
  const pos = useGame((g) => g.state.nav.depth * 16 + g.state.nav.lane);
  const d = useGame(selectDrive, shallowEqual, 2);
  const fuelSig = useGame(
    (g) => {
      const p = refuelPlan(g);
      let sig = (p.full ? "F" : "") + (p.spill ? "S" : "") + Math.round(p.gain * 10);
      for (let i = 0; i < p.items.length; i++) sig += "|" + p.items[i].id + ":" + p.items[i].units;
      return sig;
    },
    Object.is,
    3,
  );
  const g = getGame();
  const plan = refuelPlan(g);
  const target = effectiveTarget(g, picked);
  const steps = route(g);
  const per = baseJumpCost(g);
  const range = per > 0 ? Math.floor(d.fuel / per + 1e-9) : 99;
  void pos;
  void fuelSig;

  const onRefuel = (): void => {
    const before = getGame().state.nav.fuel;
    const r = act((gm) => refuel(gm));
    if (r.ok) {
      sfx("collect");
      haptic("success");
      toast(t("fuel.done", { n: num(getGame().state.nav.fuel - before) }), "good");
    } else {
      sfx("deny");
      toast(t(r.reason === "max" ? "fuel.full" : "fuel.none"), "warn");
    }
  };

  return (
    <View style={styles.gap}>
      <Well gap={space.sm}>
        <Meter value={d.cap > 0 ? d.fuel / d.cap : 0} label={t("fuel.tank")} valueText={`${num(d.fuel)} / ${num(d.cap)}`} tone={d.fuel < per ? "red" : d.fuel < per * 2 ? "yellow" : "mint"} height={10} />
        <Txt variant="label" color="inkDim">
          {t("fuel.range", { count: range })} · {t("fuel.perJump", { n: num(per), half: num(per / 2) })}
        </Txt>
        <Rule />
        {plan.full ? (
          <Txt variant="label">{t("fuel.full")}</Txt>
        ) : plan.items.length === 0 ? (
          <Txt variant="label" color="warn">
            {t("fuel.none")}
          </Txt>
        ) : (
          <View style={styles.gapXs}>
            <MicroLabel size="label">{t("fuel.willUse")}</MicroLabel>
            <Row wrap align="center">
              {plan.items.map((it) => (
                <CostTag key={it.id} icon={it.id} amount={`${fmt(it.units)} × ${itemName(it.id)}`} size="sm" boxed />
              ))}
              <Txt variant="label" color="good">
                +{num(plan.gain)}
              </Txt>
            </Row>
            {plan.spill ? (
              <Txt variant="label" color="warn">
                {t("fuel.spill")}
              </Txt>
            ) : null}
          </View>
        )}
        <Key testID="nav-refuel" label={t("fuel.refuel")} icon="fuel" tone="yellow" size="sm" disabled={plan.full || plan.items.length === 0} onPress={onRefuel} sound={null} />
      </Well>

      <Rule label={t("drive.title")} />
      <JumpControls key={target ? target.depth * 16 + target.lane : -1} depth={target ? target.depth : -1} lane={target ? target.lane : -1} />

      {steps.length > 0 ? (
        <View style={styles.gapXs}>
          <Rule label={t("route.title")} />
          <Txt variant="label" color="inkDim">
            {t("route.toCore", { count: d.core - d.depth })}
          </Txt>
          <Row wrap>
            {steps.slice(0, 6).map((s) => {
              const sys = systemAt(g, s.depth, s.lane);
              return (
                <View key={s.depth} style={styles.step}>
                  <Icon name={`star_${sys.star}`} size={16} chip />
                  <View>
                    <Txt variant="label" numberOfLines={1}>
                      {systemName(g, sys)}
                    </Txt>
                    <Row gap="xs" align="center">
                      <MicroLabel>{t("map.depthShort", { n: s.depth })}</MicroLabel>
                      {s.station ? <Icon name="station" size={32 / 3} /> : null}
                      {sys.hazards.map((h) => (
                        <Icon key={h} name={HAZARD_ICON[h]} size={32 / 3} />
                      ))}
                    </Row>
                  </View>
                </View>
              );
            })}
          </Row>
        </View>
      ) : null}
    </View>
  );
}

// ---------- compact bar ---------------------------------------------------------------

export const JumpBar = memo(function JumpBar() {
  const t = useT("nav");
  const theme = useTheme();
  const picked = useNavUi((s) => s.picked);
  const open = useNavUi((s) => s.open);
  const setSection = useNavUi((s) => s.setSection);
  const target = useGame((g) => {
    const e = effectiveTarget(g, picked);
    return e ? e.depth * 16 + e.lane : -1;
  });
  const { d, tg, status } = useDrive(target >= 0 ? { depth: target >> 4, lane: target & 15 } : null);
  const text = useStatusText(d, tg, status, true);
  const cooling = status === "cooldown";
  const bar = useSmooth(status === "jumping" ? 0 : cooling ? d.cooldownFrac : d.charge, 400);
  const per = useGame((g) => baseJumpCost(g), Object.is, 10);
  const risky = tg.hazards > 0 && (tg.riskHull || tg.riskShield);

  let key: { label: string; tone: "orange" | "yellow" | "cobalt" | "black"; disabled: boolean; onPress?: () => void; sound?: "jumpGo" | null };
  if (status === "ready") {
    key = {
      label: t("drive.jump"),
      tone: "orange",
      disabled: false,
      sound: risky ? null : "jumpGo",
      onPress: () => {
        if (risky) {
          open({ kind: "system", depth: tg.depth, lane: tg.lane });
          return;
        }
        const r = act((g) => jumpTo(g, tg.depth, tg.lane));
        if (r.ok) haptic("heavy");
        else sfx("deny");
      },
    };
  } else if (canCharge(d)) {
    key = { label: t("drive.charge"), tone: "orange", disabled: false, sound: null, onPress: () => startCharge(t("drive.fail.cooldown")) };
  } else if (status === "noFuel") {
    key = { label: t("fuel.key"), tone: "yellow", disabled: false, onPress: () => open({ kind: "drive" }) };
  } else if (status === "notLinked") {
    key = { label: t("section.map"), tone: "cobalt", disabled: false, onPress: () => setSection("map") };
  } else {
    key = { label: t(`drive.key.${status}`), tone: "black", disabled: true };
  }
  const led = LED[status];

  return (
    <View style={[styles.bar, { backgroundColor: theme.well, borderColor: theme.rule }]}>
      <Pressable testID="nav-fuel" accessibilityRole="button" accessibilityLabel={t("fuel.tank")} onPress={() => open({ kind: "drive" })} style={styles.fuel}>
        <Row gap="xs" align="center">
          <Icon name="fuel" size={16} />
          <Txt variant="bodyBold" tabular color={d.fuel < per ? "bad" : "ink"}>
            {num(d.fuel)}/{num(d.cap)}
          </Txt>
        </Row>
        <ProgressBar value={d.cap > 0 ? d.fuel / d.cap : 0} tone={d.fuel < per ? "red" : d.fuel < per * 2 ? "yellow" : "mint"} height={4} />
      </Pressable>
      <Pressable testID="nav-drive" accessibilityRole="button" accessibilityLabel={t("drive.title")} onPress={() => open({ kind: "drive" })} style={styles.mid}>
        <Row gap="xs" align="center">
          <Led color={led.color} state={led.state} size={6} />
          <Txt variant="label" numberOfLines={1} style={styles.fill} color={status === "failure" || status === "noFuel" ? "bad" : "ink"}>
            {text}
          </Txt>
        </Row>
        <LedRow steps={16} progress={bar} chase={status === "jumping"} color={cooling ? "cobalt" : d.charge >= 1 ? "mint" : "orange"} size={5} fill />
        <MicroLabel numberOfLines={1}>{tg.has ? `→ ${tg.name} · ${t("map.depthShort", { n: tg.depth })} · ${num(tg.cost)}` : t("drive.noTarget")}</MicroLabel>
      </Pressable>
      <Key testID="nav-bar-key" label={key.label} tone={key.tone} disabled={key.disabled} onPress={key.onPress} sound={key.sound} width={88} size="md" />
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  gap: { gap: space.md },
  gapXs: { gap: space.xs },
  warn: { flexDirection: "row", alignItems: "center", gap: space.sm, borderWidth: 1.5, borderRadius: radius.well, padding: space.sm },
  step: { flexDirection: "row", alignItems: "center", gap: space.xs, minWidth: 104 },
  bar: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.well, borderWidth: 1, paddingHorizontal: space.sm, paddingVertical: space.xs, minHeight: 58 },
  fuel: { width: 74, minHeight: 48, justifyContent: "center", gap: space.xs },
  mid: { flex: 1, minWidth: 0, minHeight: 48, justifyContent: "center", gap: 5 },
});
