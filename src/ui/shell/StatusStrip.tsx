// The status LCD at the top of the Control Deck: credits, income, four compact meters and KIPP's
// ticker. Meters are driven by shared values at the engine pulse; only text re-renders React.
import { memo } from "react";
import { Pressable, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";

import * as B from "@/engine/big";
import { fuelCap } from "@/engine/world";
import { useT } from "@/i18n";
import { useGame } from "@/store/game";
import { fmt, fmtRate, useFmt } from "@/ui/format";
import { Icon, Lcd, LcdMeter, LcdNumber, LcdText, Led } from "@/ui/kit";
import { space } from "@/ui/theme";

import { usePulseValue } from "./hooks";
import { leds, useShell } from "./store";

const MiniMeter = memo(function MiniMeter({ icon, value, warn, label }: { icon: string; value: SharedValue<number>; warn: boolean; label: string }) {
  return (
    <View accessible accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
      <Icon name={icon} size={16} />
      <LcdMeter value={value} segments={5} height={8} tone={warn ? "warn" : "normal"} style={{ width: 24 }} />
    </View>
  );
});

export const StatusStrip = memo(function StatusStrip() {
  const t = useT("world");
  useFmt();
  const credits = useGame((g) => fmt(g.state.credits));
  const creditsLog = useGame((g) => Math.round(B.log10(g.state.credits) * 1000), undefined, 2);
  const income = useGame((g) => fmtRate(g.rates.income), undefined, 5);
  const warn = useGame(
    (g) => ({
      power: g.rates.power.eff < 0.995,
      cargo: B.ratio(g.rates.cargoUsed, g.rates.cargoCap) >= 0.97,
      hull: g.state.hull.hp < 35,
      fuel: g.state.features.nav === 1 && g.state.nav.fuel < (g.content.balance.fuelPerJump ?? 6) * g.mods.fuelUse,
      nav: g.state.features.nav === 1,
    }),
    undefined,
    5,
  );
  const power = usePulseValue((g) => g.rates.power.eff, 300);
  const cargo = usePulseValue((g) => B.ratio(g.rates.cargoUsed, g.rates.cargoCap), 300);
  const hull = usePulseValue((g) => g.state.hull.hp / 100, 300);
  const fuel = usePulseValue((g) => Math.min(1, g.state.nav.fuel / fuelCap(g)), 300);
  const line = useShell((s) => s.kipp[0]?.text);
  const openKipp = useShell((s) => s.setKippOpen);

  return (
    <Lcd padding={6} gap={2}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, height: 28 }}>
        <Icon name="coin" size={16} />
        <LcdNumber text={credits} value={creditsLog} size="l" align="left" minChars={5} accessibilityLabel={t("status.credits", { n: credits })} />
        <View style={{ flex: 1 }} />
        <LcdText size="s" tone={warn.cargo ? "warn" : "normal"} align="right">
          {warn.cargo ? t("status.cargoFull") : `+${income}`}
        </LcdText>
        <Led level={leds.sale} color="lcd" size={5} />
        <Led level={leds.alert} color="red" size={5} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, height: 16 }}>
        <MiniMeter icon="power" value={power} warn={warn.power} label={t("status.power")} />
        <MiniMeter icon="cargo" value={cargo} warn={warn.cargo} label={t("status.cargo")} />
        <MiniMeter icon="hull" value={hull} warn={warn.hull} label={t("status.hull")} />
        {warn.nav ? <MiniMeter icon="fuel" value={fuel} warn={warn.fuel} label={t("status.fuel")} /> : null}
        <Pressable
          onPress={() => openKipp(true)}
          hitSlop={{ top: 14, bottom: 14, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t("kipp.open")}
          style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space.xs }}
        >
          <Icon name="kipp" size={16} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <LcdText size="s" marquee speed={38}>
              {line ?? t("kipp.idle")}
            </LcdText>
          </View>
          <Led level={leds.kipp} color="orange" size={5} />
        </Pressable>
      </View>
    </Lcd>
  );
});
