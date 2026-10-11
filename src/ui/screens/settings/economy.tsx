// Debug economy graph: income per second and credits sampled once per second into a ring buffer
// (five minutes), drawn on a log scale. The sampler costs two Math.log10 calls per second and only
// runs once the debug panel has been unlocked.
import { memo } from "react";
import { View } from "react-native";
import Svg, { Line, Polyline, Text as SvgText } from "react-native-svg";

import * as B from "@/engine/big";
import type { Big } from "@/engine/types";
import { useT } from "@/i18n";
import { getGame, hasGame, onPulse, useGame } from "@/store/game";
import { fonts } from "@/ui/fonts";
import { fmt } from "@/ui/format";
import { MicroLabel, Row, Txt, useTheme } from "@/ui/kit";

const CAP = 300;
const SAMPLE_MS = 1000;

const ring = { income: new Float64Array(CAP), credits: new Float64Array(CAP), head: 0, count: 0, total: 0 };
let stop: (() => void) | null = null;
let lastSample = 0;

const log10 = (b: Big): number => (b.m > 0 ? Math.max(0, Math.log10(b.m) + b.e) : 0);

function sample(): void {
  const now = Date.now();
  if (now - lastSample < SAMPLE_MS || !hasGame()) return;
  lastSample = now;
  const g = getGame();
  ring.income[ring.head] = log10(g.rates.income);
  ring.credits[ring.head] = log10(g.state.credits);
  ring.head = (ring.head + 1) % CAP;
  if (ring.count < CAP) ring.count++;
  ring.total++;
}

export function startEconomySampler(): void {
  if (stop) return;
  stop = onPulse(sample);
}

function points(series: Float64Array, w: number, h: number, lo: number, hi: number): string {
  const n = ring.count;
  if (n === 0) return "";
  const start = (ring.head - n + CAP) % CAP;
  const span = Math.max(1e-6, hi - lo);
  let out = "";
  for (let i = 0; i < n; i++) {
    const v = series[(start + i) % CAP];
    const x = n === 1 ? w : ((CAP - n + i) / (CAP - 1)) * w;
    const y = h - ((v - lo) / span) * h;
    out += `${x.toFixed(1)},${y.toFixed(1)} `;
  }
  return out;
}

export const EconomyGraph = memo(function EconomyGraph({ width, height = 132 }: { width: number; height?: number }) {
  const theme = useTheme();
  const t = useT("settings");
  // one render per new sample
  useGame(() => ring.total);
  const n = ring.count;
  const padL = 46;
  const padB = 14;
  const w = Math.max(40, width - padL - 4);
  const h = height - padB - 6;

  let lo = Infinity;
  let hi = -Infinity;
  const start = (ring.head - n + CAP) % CAP;
  for (let i = 0; i < n; i++) {
    const a = ring.income[(start + i) % CAP];
    const b = ring.credits[(start + i) % CAP];
    lo = Math.min(lo, a, b);
    hi = Math.max(hi, a, b);
  }
  if (n === 0) {
    lo = 0;
    hi = 3;
  }
  lo = Math.floor(lo);
  hi = Math.max(lo + 1, Math.ceil(hi + 0.05));
  const step = Math.max(1, Math.ceil((hi - lo) / 4));
  const grid: number[] = [];
  for (let e = lo; e <= hi; e += step) grid.push(e);
  const last = (s: Float64Array) => (n > 0 ? B.fromLog10(s[(ring.head - 1 + CAP) % CAP]) : B.big(0));

  return (
    <View testID="economy-graph">
      <Row gap="md" style={{ marginBottom: 4 }}>
        <Row gap="xs">
          <View style={{ width: 10, height: 3, backgroundColor: theme.orange }} />
          <MicroLabel color="ink">{t("debug.graphIncome")}</MicroLabel>
          <Txt variant="label">{`${fmt(last(ring.income))}/s`}</Txt>
        </Row>
        <Row gap="xs">
          <View style={{ width: 10, height: 3, backgroundColor: theme.cobalt }} />
          <MicroLabel color="ink">{t("debug.graphCredits")}</MicroLabel>
          <Txt variant="label">{fmt(last(ring.credits))}</Txt>
        </Row>
      </Row>
      <View style={{ backgroundColor: theme.lcdBg, borderRadius: 5 }}>
        <Svg width={width} height={height}>
          {grid.map((e) => {
            const y = 6 + h - ((e - lo) / (hi - lo)) * h;
            return (
              <Line key={`g${e}`} x1={padL} x2={padL + w} y1={y} y2={y} stroke={theme.lcdDim} strokeWidth={1} />
            );
          })}
          {grid.map((e) => {
            const y = 6 + h - ((e - lo) / (hi - lo)) * h;
            return (
              <SvgText key={`t${e}`} x={padL - 4} y={y + 3} fontSize={8.5} fontFamily={fonts.monoMedium} fill={theme.lcdOn} textAnchor="end">
                {fmt(B.make(1, e), 2)}
              </SvgText>
            );
          })}
          <SvgText x={padL} y={height - 3} fontSize={8.5} fontFamily={fonts.monoMedium} fill={theme.lcdOn}>
            {t("debug.graphFrom")}
          </SvgText>
          <SvgText x={padL + w} y={height - 3} fontSize={8.5} fontFamily={fonts.monoMedium} fill={theme.lcdOn} textAnchor="end">
            {t("debug.graphNow", { n })}
          </SvgText>
          <Polyline points={points(ring.credits, w, h, lo, hi)} fill="none" stroke={theme.cobalt} strokeWidth={1.5} transform={`translate(${padL},6)`} />
          <Polyline points={points(ring.income, w, h, lo, hi)} fill="none" stroke={theme.orange} strokeWidth={1.5} transform={`translate(${padL},6)`} />
        </Svg>
      </View>
    </View>
  );
});
