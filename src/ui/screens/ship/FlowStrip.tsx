// Flow strip (mining -> hopper -> lift -> cargo -> broker) and the control row under it (power
// meter, buy mode). Fill levels are shared values fed from the engine pulse, so the bars move
// without a React render.
import { memo, useCallback, useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Easing, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

import { content } from "@/content";
import { setBuyMode } from "@/engine/core";
import type { DeckId } from "@/engine/types";
import { useT, useTr } from "@/i18n";
import { act, getGame, onPulse, useGame } from "@/store/game";
import { fmtPct, useFmt } from "@/ui/format";
import { Icon, Lcd, LcdMeter, LcdNumber, LcdText, Led, Segmented, toast, Txt, useTheme } from "@/ui/kit";
import { space } from "@/ui/theme";

import { deny } from "./DeckCard";
import { cargoFill, flowIssue, hopperFill, type FlowIssue } from "./model";

const LINEAR = { duration: 110, easing: Easing.linear };

function follow(sv: SharedValue<number>, last: { v: number }, next: number): void {
  if (Math.abs(next - last.v) < 0.002) return;
  last.v = next;
  sv.set(withTiming(next, LINEAR));
}

/** Which stage of the strip an issue lights up. */
const HOT: Record<FlowIssue, number> = { blocked: -1, noPower: -1, lift: 2, cargoFull: 3, mining: 0 };

const Stage = memo(function Stage({ label, hot, children }: { label: string; hot: boolean; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.stage}>
      <Txt variant="micro" color={hot ? theme.lcdWarn : theme.lcdOn} upper numberOfLines={1} style={hot ? undefined : styles.dimLabel}>
        {label}
      </Txt>
      <View style={styles.stageValue}>{children}</View>
    </View>
  );
});

const Sep = memo(function Sep() {
  const theme = useTheme();
  return <Icon name="right" size={16} color={theme.lcdOn} style={styles.sep} />;
});

export const FlowStrip = memo(function FlowStrip({ onFix }: { onFix: (deck: DeckId) => void }) {
  const t = useT("ship");
  const tr = useTr();
  const fmt = useFmt();
  const s = useGame(
    (g) => {
      const r = g.rates;
      const f = flowIssue(g);
      return {
        mine: fmt(r.mine),
        lift: fmt(r.lift),
        income: fmt(r.income),
        incomeN: r.income.m > 0 ? r.income.e + r.income.m / 10 : 0,
        issue: f.issue,
        deck: f.deck,
        failure: g.state.failure ? g.state.failure.kind : "",
        eff: Math.round(r.power.eff * 100),
      };
    },
    undefined,
    2,
  );
  const hopper = useSharedValue(0);
  const cargo = useSharedValue(0);
  useEffect(() => {
    const lastH = { v: -1 };
    const lastC = { v: -1 };
    const read = () => {
      const g = getGame();
      follow(hopper, lastH, hopperFill(g));
      follow(cargo, lastC, cargoFill(g));
    };
    read();
    return onPulse(read);
  }, [hopper, cargo]);

  const hot = HOT[s.issue];
  const serious = s.issue !== "mining";
  const fix = useCallback(() => onFix(s.deck), [onFix, s.deck]);
  const deckName = tr(content.decks[s.deck].name);
  const text =
    s.issue === "blocked"
      ? t("flow.issue.blocked", { failure: tr(content.failures[s.failure as keyof typeof content.failures]?.name), deck: deckName })
      : s.issue === "noPower"
        ? t("flow.issue.noPower", { pct: s.eff })
        : t(`flow.issue.${s.issue}`);

  return (
    <Pressable testID="flow-strip" onPress={fix} accessibilityRole="button" accessibilityLabel={text} accessibilityHint={t("flow.hint", { deck: deckName })}>
      <Lcd padding={5} gap={3}>
        <View style={styles.stages}>
          <Stage label={t("flow.stage.mining")} hot={hot === 0 && serious}>
            <LcdNumber text={s.mine} value={0} size="s" align="left" ghost={false} tone={s.issue === "blocked" && s.deck === "mining" ? "warn" : "normal"} />
          </Stage>
          <Sep />
          <Stage label={t("flow.stage.hopper")} hot={s.issue === "lift"}>
            <LcdMeter value={hopper} segments={8} height={8} tone={s.issue === "lift" ? "warn" : "normal"} />
          </Stage>
          <Sep />
          <Stage label={t("flow.stage.lift")} hot={hot === 2}>
            <LcdNumber text={s.lift} value={0} size="s" align="left" ghost={false} tone={hot === 2 ? "warn" : "normal"} />
          </Stage>
          <Sep />
          <Stage label={t("flow.stage.cargo")} hot={hot === 3}>
            <LcdMeter value={cargo} segments={8} height={8} tone={hot === 3 ? "warn" : "normal"} />
          </Stage>
          <Sep />
          <Stage label={t("flow.stage.broker")} hot={false}>
            <LcdNumber text={s.income} value={s.incomeN} size="s" align="left" ghost={false} />
          </Stage>
        </View>
        <View style={styles.issue}>
          <Led state={serious ? "blink" : "on"} color={serious ? "orange" : "mint"} size={5} />
          <LcdText size="s" tone={serious ? "warn" : "normal"} marquee style={styles.issueText}>
            {text}
          </LcdText>
          <FixTag label={deckName} hot={serious} />
        </View>
      </Lcd>
    </Pressable>
  );
});

const FixTag = memo(function FixTag({ label, hot }: { label: string; hot: boolean }) {
  const theme = useTheme();
  const color = hot ? theme.lcdWarn : theme.lcdOn;
  return (
    <View style={[styles.fix, { borderColor: color }]}>
      <Txt variant="micro" color={color} upper numberOfLines={1}>
        {`→ ${label}`}
      </Txt>
    </View>
  );
});

// ---------- control row ---------------------------------------------------------------------

type Mode = "1" | "10" | "100" | "-1";

export const ControlRow = memo(function ControlRow({ onPower }: { onPower: () => void }) {
  const t = useT("ship");
  const fmt = useFmt();
  const s = useGame(
    (g) => {
      const p = g.rates.power;
      return { mode: String(g.state.buyMode) as Mode, max: g.state.features.buyMax === 1, power: `${fmt(p.supply, 2)}/${fmt(p.demand, 2)}`, eff: p.eff, purchases: g.state.stats.purchases ?? 0 };
    },
    undefined,
    2,
  );
  const onMode = useCallback(
    (v: Mode) => {
      if ((v === "100" || v === "-1") && getGame().state.features.buyMax !== 1) {
        deny();
        toast(t("mode.locked", { n: Math.max(1, 50 - (getGame().state.stats.purchases ?? 0)) }), { tone: "info", icon: "lock" });
        return;
      }
      act((g) => setBuyMode(g, Number(v) as 1 | 10 | 100 | -1));
    },
    [t],
  );
  const low = s.eff < 0.995;
  return (
    <View style={styles.control}>
      <Pressable testID="power-meter" onPress={onPower} accessibilityRole="button" accessibilityLabel={t("power.a11y", { power: s.power, pct: fmtPct(s.eff) })} style={styles.power}>
        <Lcd padding={3}>
          <View style={styles.powerRow}>
            <Icon name="power" size={16} />
            <View style={styles.powerCol}>
              <View style={styles.powerText}>
                <LcdText size="s" tone={low ? "warn" : "normal"}>
                  {s.power}
                </LcdText>
              </View>
              <LcdMeter value={s.eff} segments={10} height={4} tone={low ? "warn" : "normal"} />
            </View>
          </View>
        </Lcd>
      </Pressable>
      <View style={styles.modes}>
        <Segmented<Mode>
          options={[
            { value: "1", label: "×1" },
            { value: "10", label: "×10" },
            { value: "100", label: "×100" },
            { value: "-1", label: t("mode.max") },
          ]}
          value={s.mode}
          onChange={onMode}
        />
        {s.max ? null : (
          <View pointerEvents="none" style={styles.modeLocks}>
            <Icon name="lock" size={16} />
            <Icon name="lock" size={16} />
          </View>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  stages: { flexDirection: "row", alignItems: "flex-end" },
  stage: { flex: 1, minWidth: 0 },
  dimLabel: { opacity: 0.6 },
  stageValue: { height: 16, justifyContent: "center", overflow: "hidden" },
  sep: { marginHorizontal: 1, opacity: 0.45 },
  issue: { flexDirection: "row", alignItems: "center", gap: 6, height: 16 },
  issueText: { flex: 1 },
  fix: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 4, height: 14, justifyContent: "center", maxWidth: 110 },
  control: { flexDirection: "row", alignItems: "center", gap: space.sm, height: 40 },
  power: { flex: 1, minWidth: 0 },
  powerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  powerCol: { flex: 1, minWidth: 0, gap: 2 },
  powerText: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  modes: { width: 228 },
  modeLocks: { position: "absolute", right: 0, top: -5, width: 114, flexDirection: "row", justifyContent: "space-around", paddingLeft: 36 },
});
