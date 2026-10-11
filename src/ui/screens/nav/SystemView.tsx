// Current system: a small orrery, the planets as cards, and the planet sheet (scan, probes,
// outpost, the way into an expedition).
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { Easing, FadeInDown, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, Ellipse, Line } from "react-native-svg";

import { content } from "@/content";
import * as B from "@/engine/big";
import type { FeatureId, PlanetInfo, StarType } from "@/engine/types";
import {
  buildOutpost,
  cancelScan,
  currentSystem,
  faunaKey,
  findPlanet,
  floraKey,
  outpostCost,
  planetDescription,
  planetYieldItem,
  probeRate,
  probesUsed,
  scanSeconds,
  scanTarget,
  setProbes,
  speciesName,
  startScan,
} from "@/engine/world";
import { useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { act, getGame, useGame } from "@/store/game";
import { fmt, fmtPct, fmtRate, fmtTime, itemName } from "@/ui/format";
import { Badge, Card, CostTag, Icon, IconKey, Key, LedRow, MicroLabel, ProgressBar, Row, Rule, toast, Txt, useReduceMotion, useTheme, Well } from "@/ui/kit";
import { palette, radius, space } from "@/ui/theme";

import { biomeColors, HAZARD_ICON, planetName, systemName, unlockHint, useNavUi, useSmooth } from "./state";

const SMALL = 32 / 3;

// ---------- planet disc ---------------------------------------------------------------

export const PlanetDisc = memo(function PlanetDisc({ planet, size }: { planet: PlanetInfo; size: number }) {
  const c = biomeColors(planet.biome);
  const r = size / 2;
  const body = r * (planet.rings ? 0.62 : 0.9);
  const gas = content.biomes[planet.biome]?.shader === "gas";
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {planet.rings ? <Ellipse cx={r} cy={r} rx={r * 0.98} ry={r * 0.3} stroke={c[3]} strokeWidth={Math.max(1, size / 18)} fill="none" opacity={0.8} /> : null}
      <Circle cx={r} cy={r} r={body} fill={c[1]} />
      <Circle cx={r - body * 0.12} cy={r - body * 0.12} r={body * 0.82} fill={c[2]} />
      <Circle cx={r - body * 0.3} cy={r - body * 0.32} r={body * 0.42} fill={c[3]} opacity={0.75} />
      {gas ? <Line x1={r - body * 0.8} y1={r + body * 0.2} x2={r + body * 0.75} y2={r + body * 0.2} stroke={c[4]} strokeWidth={Math.max(1, body * 0.16)} opacity={0.6} /> : <Circle cx={r + body * 0.3} cy={r + body * 0.25} r={body * 0.16} fill={c[4]} opacity={0.85} />}
    </Svg>
  );
});

// ---------- orrery --------------------------------------------------------------------

const STAR_COLOR: Record<StarType, string> = {
  redDwarf: palette.red1,
  yellow: palette.yellow,
  blueGiant: palette.cobalt2,
  whiteDwarf: palette.bone2,
  neutron: palette.mint,
  binary: palette.amber,
  blackHole: palette.void0,
  protostar: palette.orange,
};
const STAR_R: Record<StarType, number> = { redDwarf: 7, yellow: 9, blueGiant: 12, whiteDwarf: 5, neutron: 4, binary: 7, blackHole: 8, protostar: 10 };
const ORRERY_H = 132;
const TAU = Math.PI * 2;

const Orbiter = memo(function Orbiter({ clock, cx, cy, rx, ry, a0, turns, size, children }: { clock: SharedValue<number>; cx: number; cy: number; rx: number; ry: number; a0: number; turns: number; size: number; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => {
    const a = a0 + clock.value * TAU * turns;
    return { transform: [{ translateX: cx + Math.cos(a) * rx - size / 2 }, { translateY: cy + Math.sin(a) * ry - size / 2 }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.orbiter, style]}>
      {children}
    </Animated.View>
  );
});

const Orrery = memo(function Orrery({ sysId, width }: { sysId: string; width: number }) {
  const reduce = useReduceMotion();
  const clock = useSharedValue(0);
  useEffect(() => {
    clock.set(0);
    if (!reduce) clock.set(withRepeat(withTiming(1, { duration: 720_000, easing: Easing.linear, reduceMotion: ReduceMotion.Never }), -1, false));
  }, [reduce, clock, sysId]);

  const sys = currentSystem(getGame());
  const n = sys.planets.length;
  const cx = width / 2;
  const cy = ORRERY_H / 2;
  const first = STAR_R[sys.star] + 18;
  const last = width / 2 - 16;
  const step = n > 1 ? (last - first) / (n - 1) : 0;
  const squash = Math.min(0.4, (ORRERY_H / 2 - 8) / last);
  const color = STAR_COLOR[sys.star];
  const sr = STAR_R[sys.star];
  const belts = [];
  for (let b = 0; b < sys.belts; b++) {
    const at = Math.min(n - 1, Math.floor(((b + 1) * n) / (sys.belts + 1)));
    belts.push(first + (at - 0.5) * step);
  }

  return (
    <View style={[styles.orrery, { width, height: ORRERY_H }]}>
      <Svg width={width} height={ORRERY_H} style={StyleSheet.absoluteFill}>
        {sys.planets.map((p, i) => (
          <Ellipse key={p.id} cx={cx} cy={cy} rx={first + i * step} ry={(first + i * step) * squash} stroke={palette.void3} strokeWidth={1} fill="none" />
        ))}
        {belts.map((rx, i) => (
          <Ellipse key={i} cx={cx} cy={cy} rx={rx} ry={rx * squash} stroke={palette.steel1} strokeWidth={2} strokeDasharray="1 4" fill="none" />
        ))}
        <Circle cx={cx} cy={cy} r={sr + 10} fill={sys.star === "blackHole" ? palette.violet1 : color} opacity={0.12} />
        <Circle cx={cx} cy={cy} r={sr + 5} fill={sys.star === "blackHole" ? palette.orange : color} opacity={0.28} />
        {sys.star === "binary" ? (
          <>
            <Circle cx={cx - 5} cy={cy} r={sr} fill={palette.yellow} />
            <Circle cx={cx + 7} cy={cy + 2} r={sr * 0.6} fill={palette.orange} />
          </>
        ) : (
          <Circle cx={cx} cy={cy} r={sr} fill={color} stroke={sys.star === "blackHole" ? palette.amber : "none"} strokeWidth={1.5} />
        )}
        {sys.star === "neutron" ? <Line x1={cx - 22} y1={cy + 10} x2={cx + 22} y2={cy - 10} stroke={palette.mint} strokeWidth={1} opacity={0.7} /> : null}
      </Svg>
      {sys.planets.map((p, i) => {
        const size = Math.round((8 + p.size * 10) * (p.rings ? 1.5 : 1));
        return (
          <Orbiter key={p.id} clock={clock} cx={cx} cy={cy} rx={first + i * step} ry={(first + i * step) * squash} a0={((p.seed >>> 4) % 628) / 100} turns={Math.max(1, n + 2 - i)} size={size}>
            <PlanetDisc planet={p} size={size} />
          </Orbiter>
        );
      })}
      {sys.station ? (
        <Orbiter clock={clock} cx={cx} cy={cy} rx={first + 0.5 * step} ry={(first + 0.5 * step) * squash} a0={2.4} turns={n + 3} size={SMALL}>
          <Icon name="station" size={SMALL} />
        </Orbiter>
      ) : null}
    </View>
  );
});

// ---------- planet cards --------------------------------------------------------------

function discovered(planet: PlanetInfo): { fauna: number; flora: number } {
  const codex = getGame().state.codex;
  let fauna = 0;
  let flora = 0;
  for (let i = 0; i < planet.fauna; i++) if (codex[faunaKey(planet.id, i)]) fauna++;
  for (let i = 0; i < planet.flora; i++) if (codex[floraKey(planet.id, i)]) flora++;
  return { fauna, flora };
}

const PlanetCard = memo(function PlanetCard({ planet, name, scan, scanning, probes, outpost, fauna, flora }: { planet: PlanetInfo; name: string; scan: number; scanning: boolean; probes: number; outpost: boolean; fauna: number; flora: number }) {
  const t = useT("nav");
  const tr = useTr();
  const open = useNavUi((s) => s.open);
  const done = scan >= 100;
  return (
    <Card onPress={() => open({ kind: "planet", id: planet.id })} padding={space.sm} gap={space.xs} accessibilityLabel={name}>
      <Row align="center">
        <PlanetDisc planet={planet} size={36} />
        <View style={styles.fill}>
          <Row align="center" gap="xs">
            <Txt variant="bodyBold" numberOfLines={1} style={styles.fill}>
              {name}
            </Txt>
            {outpost ? <Badge label={t("planet.outpostBadge")} tone="mint" /> : null}
            {probes > 0 ? <Badge label={`${t("planet.probesBadge")} ${probes}`} tone="cobalt" /> : null}
            {done ? <Icon name="check" size={16} /> : <Badge label={scanning || scan > 0 ? `${t("planet.scan")} ${scan} %` : t("planet.unscanned")} tone={scanning ? "orange" : "neutral"} />}
          </Row>
          <Txt variant="label" color="inkDim" numberOfLines={1}>
            {tr(content.biomes[planet.biome]?.name)} · {t(`atmo.${planet.atmosphere}`)} · {t(`weather.${planet.weather}`)}
          </Txt>
        </View>
      </Row>
      <Row align="center" justify="space-between">
        <Row gap="xs" align="center">
          {planet.resources.map((r) => (
            <Icon key={r} name={r} size={16} chip />
          ))}
          {planet.special ? <Icon name={done ? planet.special : "question"} size={16} chip /> : null}
        </Row>
        <Row gap="xs" align="center">
          {planet.hazards.map((h) => (
            <Icon key={h} name={HAZARD_ICON[h]} size={16} />
          ))}
        </Row>
        <Txt variant="label" color="inkDim">
          {t("planet.life", { fauna: `${fauna}/${planet.fauna}`, flora: `${flora}/${planet.flora}` })}
        </Txt>
      </Row>
    </Card>
  );
});

export function SystemView({ width }: { width: number }) {
  const t = useT("nav");
  const sig = useGame(
    (g) => {
      const sys = currentSystem(g);
      const target = scanTarget(g);
      let s = sys.id + "|" + (target ? target.index : -1) + "|" + (g.state.codex["system:" + sys.id]?.name ?? "");
      for (let i = 0; i < sys.planets.length; i++) {
        const p = sys.planets[i];
        const st = g.state.planets[p.id];
        s += "|" + (st ? Math.floor(st.scan * 100) + "," + st.probes + "," + st.outpost : "0") + "," + (g.state.codex["planet:" + p.id]?.name ?? "");
      }
      return s;
    },
    Object.is,
    3,
  );
  const g = getGame();
  const sys = currentSystem(g);
  const target = scanTarget(g);
  void sig;

  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
      <Row align="center" justify="space-between">
        <Row align="center" gap="xs" style={styles.fill}>
          <Icon name={`star_${sys.star}`} size={16} chip />
          <Txt variant="heading" numberOfLines={1} style={styles.fill}>
            {systemName(g, sys)}
          </Txt>
        </Row>
        <MicroLabel size="label">
          {t(`star.${sys.star}`)} · {t("count.planet", { count: sys.planets.length })}
        </MicroLabel>
      </Row>
      <Orrery sysId={sys.id} width={width} />
      {sys.planets.map((p) => {
        const st = g.state.planets[p.id];
        const d = discovered(p);
        return (
          <View key={p.id} testID={`planet-${p.index}`}>
            <PlanetCard planet={p} name={planetName(g, p)} scan={st ? Math.floor(st.scan * 100) : 0} scanning={target?.id === p.id} probes={st?.probes ?? 0} outpost={st?.outpost === 1} fauna={d.fauna} flora={d.flora} />
          </View>
        );
      })}
    </ScrollView>
  );
}

// ---------- lock card -----------------------------------------------------------------

export function LockCard({ feature, title }: { feature: FeatureId; title: string }) {
  const t = useT("nav");
  const hint = unlockHint(feature);
  return (
    <Well>
      <Row align="center">
        <Icon name="lock" size={16} chip />
        <View style={styles.fill}>
          <Txt variant="bodyBold">{title}</Txt>
          <Txt variant="label" color="inkDim">
            {hint.kind === "research" ? t("lock.research", { name: hint.name }) : hint.kind === "chapter" ? t("lock.chapter", { n: hint.chapter, name: hint.name }) : t("lock.progress")}
          </Txt>
        </View>
      </Row>
    </Well>
  );
}

// ---------- planet sheet --------------------------------------------------------------

function Species({ planet, kind, index }: { planet: PlanetInfo; kind: "fauna" | "flora"; index: number }) {
  const t = useT("nav");
  const key = kind === "fauna" ? faunaKey(planet.id, index) : floraKey(planet.id, index);
  const fallback = speciesName(content, planet.seed, kind, index);
  const name = useGame((g) => g.state.codex[key]?.name ?? "", Object.is, 3);
  const push = useNavUi((s) => s.push);
  return (
    <Animated.View entering={FadeInDown.delay(index * 90 + (kind === "flora" ? 200 : 0)).duration(260)} style={styles.species}>
      <Icon name={kind === "fauna" ? "ev_fauna" : "deck_greenhouse"} size={16} chip />
      <View style={styles.fill}>
        <Txt variant="label" numberOfLines={1}>
          {name || fallback}
        </Txt>
        <MicroLabel>{t(`planet.${kind}`)}</MicroLabel>
      </View>
      <IconKey icon="rename" size="sm" accessibilityLabel={t("rename.title")} onPress={() => push({ kind: "rename", key, fallback })} />
    </Animated.View>
  );
}

export function PlanetSheet({ id }: { id: string }) {
  const t = useT("nav");
  const tr = useTr();
  const theme = useTheme();
  const push = useNavUi((s) => s.push);
  const v = useGame(
    (g) => {
      const st = g.state.planets[id];
      const s = g.state;
      return {
        scan: st ? Math.round(st.scan * 200) / 200 : 0,
        scanning: scanTarget(g)?.id === id,
        other: scanTarget(g) !== null && scanTarget(g)?.id !== id,
        probes: st?.probes ?? 0,
        used: probesUsed(g),
        drones: Math.floor(s.drones.probe),
        outpost: st?.outpost === 1,
        outposts: s.outposts.length,
        fScan: s.features.scan === 1,
        fProbes: s.features.probes === 1,
        fOutposts: s.features.outposts === 1,
        fExp: s.features.expeditions === 1,
        jumping: s.nav.jump !== null,
        costSig: Object.keys(outpostCost(g))
          .map((k) => k + (B.gteN(s.inv[k] ?? B.ZERO, outpostCost(g)[k]) ? "+" : "-"))
          .join(""),
      };
    },
    undefined,
    2,
  );
  const bar = useSmooth(v.scan, 300);
  const g = getGame();
  const planet = findPlanet(g, id);
  const done = v.scan >= 1;
  const wasDone = useRef(done);
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    if (done && !wasDone.current) {
      setFresh(true);
      sfx("discovery");
      haptic("success");
    }
    wasDone.current = done;
  }, [done]);

  const cost = useMemo(() => outpostCost(getGame()), [v.outposts]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!planet) return <Txt variant="label">{t("planet.gone")}</Txt>;
  const biome = content.biomes[planet.biome];
  const yieldItem = planetYieldItem(planet);
  const perProbe = B.mulN(g.rates.mine, probeRate(g));
  const outpostMax = (content.balance.outpostMax as number) ?? 12;
  const outpostRate = B.mulN(g.rates.mine, ((content.balance.outpostRate as number) ?? 0.02) * g.mods.outpostYield);
  const canAfford = !v.costSig.includes("-");

  const onScan = (): void => {
    const r = act((gm) => (v.scanning ? cancelScan(gm) : startScan(gm, id)));
    if (r.ok) sfx(v.scanning ? "uiClose" : "scanPing");
    else sfx("deny");
  };
  const onProbes = (n: number): void => {
    const r = act((gm) => setProbes(gm, id, n));
    if (r.ok) haptic("detent");
    else {
      sfx("deny");
      toast(t(r.reason === "max" ? "planet.probesMax" : "planet.needScan"), "warn");
    }
  };
  const onOutpost = (): void => {
    const r = act((gm) => buildOutpost(gm, id));
    if (r.ok) {
      sfx("success");
      haptic("success");
      toast(t("planet.outpostBuilt", { name: planetName(getGame(), planet) }), "good");
    } else {
      sfx("deny");
      toast(t(r.reason === "items" ? "planet.outpostNoItems" : "planet.outpostMax"), "warn");
    }
  };

  return (
    <View style={styles.sheet}>
      <Row align="center">
        <View style={[styles.portrait, { backgroundColor: palette.void1 }]}>
          <PlanetDisc planet={planet} size={56} />
        </View>
        <View style={styles.fill}>
          <Txt variant="bodyBold">{tr(biome?.name)}</Txt>
          <Txt variant="label" color="inkDim">
            {t(`atmo.${planet.atmosphere}`)} · {t(`weather.${planet.weather}`)}
            {planet.moons > 0 ? ` · ${t("count.moon", { count: planet.moons })}` : ""}
          </Txt>
          <Row gap="xs" align="center" wrap>
            {planet.hazards.length === 0 ? <MicroLabel>{t("planet.noHazards")}</MicroLabel> : null}
            {planet.hazards.map((h) => (
              <Row key={h} gap="xs" align="center">
                <Icon name={HAZARD_ICON[h]} size={16} />
                <MicroLabel>{t(`hazard.${h}.name`)}</MicroLabel>
              </Row>
            ))}
          </Row>
        </View>
      </Row>
      <Txt variant="body">{tr(biome?.desc[planetDescription(content, planet)])}</Txt>
      <Row wrap align="center">
        {planet.resources.map((r) => (
          <CostTag key={r} icon={r} amount={itemName(r)} size="sm" boxed />
        ))}
        {planet.special ? <CostTag icon={done ? planet.special : "question"} amount={done ? `${itemName(planet.special)} · ${t("planet.special")}` : t("planet.specialHidden")} size="sm" boxed /> : null}
      </Row>

      <Rule label={t("planet.scanTitle")} />
      {!v.fScan ? (
        <LockCard feature="scan" title={t("planet.scanTitle")} />
      ) : done ? (
        <View style={styles.gapXs}>
          <Row align="center">
            <Icon name="check" size={16} />
            <Txt variant="label" style={styles.fill}>
              {planet.fauna + planet.flora > 0 ? t("planet.scanDone", { species: t("count.species", { count: planet.fauna + planet.flora }) }) : t("planet.scanDoneEmpty")}
            </Txt>
          </Row>
          {fresh ? <LedRow steps={16} chase color="mint" size={5} fill /> : null}
          {Array.from({ length: planet.fauna }, (_, i) => (
            <Species key={"a" + i} planet={planet} kind="fauna" index={i} />
          ))}
          {Array.from({ length: planet.flora }, (_, i) => (
            <Species key={"o" + i} planet={planet} kind="flora" index={i} />
          ))}
        </View>
      ) : (
        <View style={styles.gapXs}>
          <Row align="center">
            <ProgressBar value={bar} tone="cobalt" height={10} segments={12} style={styles.fill} />
            <Txt variant="bodyBold" tabular>
              {fmtPct(v.scan)}
            </Txt>
          </Row>
          <Txt variant="label" color="inkDim">
            {v.scanning ? t("planet.scanEta", { time: fmtTime(Math.ceil((1 - v.scan) * scanSeconds(g))) }) : v.other ? t("planet.scanOther") : t("planet.scanHint", { time: fmtTime(scanSeconds(g)) })}
          </Txt>
          <Key testID="planet-scan" label={v.scanning ? t("planet.scanStop") : v.scan > 0 ? t("planet.scanResume") : t("planet.scanStart")} icon="scan" tone={v.scanning ? "black" : "cobalt"} disabled={v.jumping} onPress={onScan} sound={null} />
        </View>
      )}

      <Rule label={t("planet.probesTitle")} />
      {!v.fProbes ? (
        <LockCard feature="probes" title={t("planet.probesTitle")} />
      ) : (
        <Well gap={space.sm}>
          <Row align="center">
            <IconKey testID="probe-minus" icon="minus" size="sm" accessibilityLabel={t("planet.probeLess")} disabled={!done || v.probes <= 0} onPress={() => onProbes(v.probes - 1)} />
            <View style={[styles.stepper, { backgroundColor: theme.lcdBg }]}>
              <Txt variant="heading" color="lcdOn">{String(v.probes)}</Txt>
            </View>
            <IconKey testID="probe-plus" icon="plus" size="sm" accessibilityLabel={t("planet.probeMore")} disabled={!done || v.used >= v.drones} onPress={() => onProbes(v.probes + 1)} />
            <View style={styles.fill}>
              <Txt variant="label">{t("planet.probesFree", { free: Math.max(0, v.drones - v.used), total: v.drones })}</Txt>
              {yieldItem ? (
                <Row gap="xs" align="center">
                  <Icon name={done ? yieldItem : "question"} size={16} />
                  <Txt variant="label" color={v.probes > 0 ? "good" : "inkDim"}>
                    {v.probes > 0 ? `+${fmtRate(B.mulN(perProbe, v.probes))}` : t("planet.probeEach", { rate: fmtRate(perProbe) })}
                  </Txt>
                </Row>
              ) : null}
            </View>
          </Row>
          {!done ? <Txt variant="label" color="warn">{t("planet.needScan")}</Txt> : v.drones === 0 ? <Txt variant="label" color="warn">{t("planet.noDrones")}</Txt> : null}
        </Well>
      )}

      <Rule label={t("planet.outpostTitle")} />
      {!v.fOutposts ? (
        <LockCard feature="outposts" title={t("planet.outpostTitle")} />
      ) : v.outpost ? (
        <Row align="center">
          <Icon name="check" size={16} />
          <Txt variant="label" style={styles.fill}>
            {t("planet.outpostHere", { rate: fmtRate(outpostRate), item: yieldItem ? itemName(yieldItem) : "" })}
          </Txt>
        </Row>
      ) : (
        <Well gap={space.sm}>
          <Row wrap align="center">
            {Object.keys(cost).map((k) => (
              <CostTag key={k} icon={k} amount={`${fmt(cost[k])} ${itemName(k)}`} affordable={B.gteN(g.state.inv[k] ?? B.ZERO, cost[k])} size="sm" boxed />
            ))}
          </Row>
          <Txt variant="label" color="inkDim">
            {t("planet.outpostYield", { rate: fmtRate(outpostRate), item: yieldItem && done ? itemName(yieldItem) : t("planet.specialHidden") })} · {t("planet.outpostLimit", { n: v.outposts, max: outpostMax })}
          </Txt>
          <Key testID="planet-outpost" label={t("planet.outpostBuild")} icon="buy" tone="orange" size="sm" disabled={!done || !canAfford || v.outposts >= outpostMax} onPress={onOutpost} sound={null} />
          {!done ? <Txt variant="label" color="warn">{t("planet.needScan")}</Txt> : null}
        </Well>
      )}

      <Rule label={t("exp.title")} />
      {!v.fExp ? (
        <LockCard feature="expeditions" title={t("exp.title")} />
      ) : (
        <Key testID="planet-expedition" label={t("exp.send")} sublabel={done ? undefined : t("planet.needScan")} icon="crew" tone="cobalt" disabled={!done || v.jumping} onPress={() => push({ kind: "expedition", planet: id })} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  list: { gap: space.sm, paddingBottom: space.sm },
  orrery: { borderRadius: radius.lcd, backgroundColor: palette.void1, overflow: "hidden" },
  orbiter: { position: "absolute", left: 0, top: 0 },
  sheet: { gap: space.md },
  gapXs: { gap: space.xs },
  species: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44 },
  portrait: { width: 64, height: 64, borderRadius: radius.well, alignItems: "center", justifyContent: "center" },
  stepper: { minWidth: 44, height: 36, borderRadius: radius.lcd, alignItems: "center", justifyContent: "center" },
});
