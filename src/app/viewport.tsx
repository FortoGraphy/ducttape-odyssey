// Visual QA route for the viewport renderer: scene presets, quality levels and burst triggers.
// Deep links for screenshots: /viewport?p=<preset>&q=<0|1|2>&rm=1&paused=1&star=<type>
// (on web, add &render=lite to skip CanvasKit and show the lite renderer).
import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { FailureKind, HazardKind, StarType } from "@/engine/types";
import { Viewport } from "@/render/Viewport";
import { EMPTY_SCENE } from "@/render/types";
import type { ViewportBurst, ViewportHandle, ViewportQuality, ViewportScene } from "@/render/types";
import { fonts } from "@/ui/fonts";
import { VIEWPORT_SHARE, palette } from "@/ui/theme";

const BIOMES = ["rock", "gas", "ice", "lava", "ocean", "desert", "toxic", "crystal"] as const;
const FAILURES: FailureKind[] = ["tumble", "breach", "blackout", "noFuel", "engine", "radiation", "boarding", "anomaly"];
const HAZARDS: HazardKind[] = ["heat", "cold", "radiation", "toxic", "debris", "storm"];
const STARS: StarType[] = ["yellow", "redDwarf", "blueGiant", "whiteDwarf", "neutron", "binary", "blackHole", "protostar"];
const BURSTS: ViewportBurst[] = ["collect", "impact", "jump", "spark", "levelUp", "explosion", "scan"];
const SALVAGE_KINDS = ["crate", "pod", "wreck", "crystal"] as const;

function ship(over: Partial<ViewportScene["ship"]> = {}): ViewportScene["ship"] {
  return { ...EMPTY_SCENE.ship, thrust: 0.55, ...over };
}

function planet(shader: (typeof BIOMES)[number], i: number): NonNullable<ViewportScene["planet"]> {
  // an empty palette makes the renderer use its per-biome default ramp
  return { seed: 101 + i * 37, biome: shader, size: 0.45 + ((i * 3) % 5) * 0.12, rings: shader === "gas" || shader === "ice", palette: [], shader };
}

function buildPresets(): Record<string, ViewportScene> {
  const base: ViewportScene = { ...EMPTY_SCENE, systemSeed: 7, ship: ship() };
  const out: Record<string, ViewportScene> = {
    cruise: { ...base, drones: 2, salvage: [{ uid: 1, kind: "crate", x: 0.78, y: 0.3 }, { uid: 2, kind: "crystal", x: 0.2, y: 0.82 }] },
    mine: { ...base, systemSeed: 11, ship: ship({ mining: true, thrust: 0.25 }), drones: 3 },
    overdrive: { ...base, systemSeed: 12, star: "blueGiant", ship: ship({ mining: true, overdrive: true, thrust: 1, trail: "cobalt" }), drones: 4 },
    warp: { ...base, mode: "warp", ship: ship({ thrust: 1 }), charge: 1 },
    charge: { ...base, systemSeed: 23, star: "whiteDwarf", ship: ship({ thrust: 0.2 }), charge: 0.85 },
    docked: { ...base, mode: "docked", systemSeed: 31, station: true, ship: ship({ thrust: 0 }), drones: 2 },
    station: { ...base, systemSeed: 44, star: "binary", station: true, tow: false, drones: 1 },
    damage: { ...base, systemSeed: 19, star: "redDwarf", ship: ship({ damage: 0.92, thrust: 0.4 }) },
    tow: { ...base, systemSeed: 52, failure: "noFuel", tow: true, ship: ship({ thrust: 0, damage: 0.3 }) },
    salvage: {
      ...base,
      systemSeed: 63,
      star: "neutron",
      ship: ship({ thrust: 0.15 }),
      salvage: Array.from({ length: 9 }, (_, i) => ({ uid: 100 + i, kind: SALVAGE_KINDS[i % 4], x: ((i * 37) % 100) / 100, y: ((i * 61 + 13) % 100) / 100 })),
    },
  };
  BIOMES.forEach((b, i) => {
    out[`orbit-${b}`] = { ...base, mode: "orbit", systemSeed: 70 + i * 5, star: STARS[i % STARS.length], planet: planet(b, i), ship: ship({ mining: i % 2 === 0, thrust: 0.2 }), drones: i % 3 };
  });
  FAILURES.forEach((f, i) => {
    out[`fail-${f}`] = {
      ...base,
      systemSeed: 200 + i * 9,
      failure: f,
      ship: ship({ tumble: f === "tumble", powerOut: f === "blackout", damage: f === "breach" || f === "engine" ? 0.6 : 0.2, thrust: f === "noFuel" ? 0 : 0.4 }),
    };
  });
  HAZARDS.forEach((h, i) => {
    out[`haz-${h}`] = { ...base, mode: i % 2 ? "orbit" : "cruise", systemSeed: 300 + i * 7, hazard: h, planet: i % 2 ? planet(BIOMES[(i + 2) % 8], i + 3) : null, ship: ship({ thrust: 0.4 }) };
  });
  return out;
}

function Key({ label, on, onPress }: { label: string; on?: boolean; onPress(): void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: on ? palette.orange : "#191B21", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 7, minWidth: 44, alignItems: "center" }}
    >
      <Text style={{ fontFamily: fonts.monoBold, fontSize: 10, color: on ? "#15171C" : palette.bone2 }}>{label}</Text>
    </Pressable>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1, color: "#5A5E69" }}>{title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>{children}</View>
    </View>
  );
}

export default function ViewportDemo() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ p?: string; q?: string; rm?: string; paused?: string; star?: string }>();
  const presets = useMemo(() => buildPresets(), []);
  const [preset, setPreset] = useState(params.p && presets[params.p] ? params.p : "cruise");
  const [level, setLevel] = useState<0 | 1 | 2>(params.q === "0" ? 0 : params.q === "1" ? 1 : 2);
  const [reduceMotion, setReduceMotion] = useState(params.rm === "1");
  const [paused, setPaused] = useState(params.paused === "1");
  const [star, setStar] = useState<StarType | null>(STARS.includes(params.star as StarType) ? (params.star as StarType) : null);
  const [taken, setTaken] = useState<number[]>([]);
  const [hold, setHold] = useState(false);
  const [perf, setPerf] = useState("");
  const [cpu, setCpu] = useState("");
  const [renderer, setRenderer] = useState("");
  const [lastTap, setLastTap] = useState("");
  const view = useRef<ViewportHandle>(null);

  const scene = useMemo<ViewportScene>(() => {
    const s = presets[preset];
    return {
      ...s,
      star: star ?? s.star,
      salvage: s.salvage.filter((b) => !taken.includes(b.uid)),
      ship: hold ? { ...s.ship, mining: true } : s.ship,
    };
  }, [presets, preset, star, taken, hold]);
  const quality = useMemo<ViewportQuality>(() => ({ level, fps: 60, reduceMotion, paused }), [level, reduceMotion, paused]);

  const onTap = useCallback((uid: number | null, x: number, y: number) => {
    setLastTap(uid === null ? `empty ${x.toFixed(2)},${y.toFixed(2)}` : `salvage #${uid}`);
    if (uid !== null) {
      view.current?.burst("collect", x, y);
      setTaken((t) => [...t, uid]);
    } else view.current?.burst("spark", x, y);
  }, []);
  const onPerf = useCallback((ms: number, calls: number) => setPerf(`${ms.toFixed(1)} ms/frame · ${calls} draws`), []);
  const onCpu = useCallback((draw: number, publish: number) => setCpu(`draw ${draw.toFixed(2)} + publish ${publish.toFixed(2)} ms`), []);

  const vh = Math.round(height * VIEWPORT_SHARE);
  const names = Object.keys(presets);
  const group = (prefix: string) => names.filter((n) => n.startsWith(prefix));
  const keys = (list: string[], strip = "") =>
    list.map((n) => (
      <Key
        key={n}
        label={n.slice(strip.length)}
        on={preset === n}
        onPress={() => {
          setPreset(n);
          setTaken([]);
        }}
      />
    ));

  return (
    <View style={{ flex: 1, backgroundColor: "#07090F" }}>
      <Viewport ref={view} width={width} height={vh} scene={scene} quality={quality} onTap={onTap} onHold={setHold} onPerf={onPerf} onCpu={onCpu} onRenderer={setRenderer} />
      <ScrollView style={{ flex: 1, backgroundColor: palette.bone1 }} contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 12, gap: 8 }}>
        <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: "#15171C" }}>
          {renderer} · {preset} · {perf} {cpu} {hold ? "· HOLD" : ""} {lastTap ? `· ${lastTap}` : ""}
        </Text>
        <Row title="SCENE">{keys(names.filter((n) => !n.includes("-")))}</Row>
        <Row title="ORBIT">{keys(group("orbit-"), "orbit-")}</Row>
        <Row title="FAILURE">{keys(group("fail-"), "fail-")}</Row>
        <Row title="HAZARD">{keys(group("haz-"), "haz-")}</Row>
        <Row title="STAR">
          <Key label="preset" on={star === null} onPress={() => setStar(null)} />
          {STARS.map((s) => (
            <Key key={s} label={s} on={star === s} onPress={() => setStar(s)} />
          ))}
        </Row>
        <Row title="QUALITY">
          {([0, 1, 2] as const).map((l) => (
            <Key key={l} label={`Q${l}`} on={level === l} onPress={() => setLevel(l)} />
          ))}
          <Key label="reduce motion" on={reduceMotion} onPress={() => setReduceMotion((v) => !v)} />
          <Key label="paused" on={paused} onPress={() => setPaused((v) => !v)} />
        </Row>
        <Row title="BURST">
          {BURSTS.map((b) => (
            <Key key={b} label={b} onPress={() => view.current?.burst(b)} />
          ))}
          <Key label="shake" onPress={() => view.current?.shake(1)} />
          <Key label="flash" onPress={() => view.current?.flash(palette.bone2, 200)} />
        </Row>
      </ScrollView>
    </View>
  );
}
