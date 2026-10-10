// Control Deck gallery: every kit component with live samples. Doubles as the visual test bed.
//   /kit                      everything, scrollable
//   /kit?theme=night          graphite theme
//   /kit?only=keys,controls   just those sections (ids are in SECTIONS below)
//   /kit?lang=en              English kit strings
//   /kit?open=sheet|dialog    start with an overlay open
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ScrollView, View, type GestureResponderEvent } from "react-native";
import { Easing, ReduceMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import i18n, { useT } from "@/i18n";
import {
  Badge,
  Card,
  Chip,
  Col,
  CostTag,
  Dialog,
  EmptyState,
  ErrorState,
  Fader,
  Gauge,
  HEAT_ZONES,
  Icon,
  IconKey,
  Key,
  KeyRow,
  Knob,
  Lcd,
  LcdMeter,
  LcdNumber,
  LcdText,
  Led,
  LedRow,
  LIST_ROW_HEIGHT,
  ListRow,
  LoadingState,
  Meter,
  MicroLabel,
  NumberPopHost,
  Panel,
  popNumberAt,
  ProgressBar,
  QualityPips,
  Row,
  Rule,
  Screen,
  Screw,
  ScrollWell,
  Segmented,
  setReduceMotion,
  Sheet,
  Spacer,
  StatDelta,
  Sticker,
  TabKeys,
  ThemeProvider,
  TimerBar,
  toast,
  ToastHost,
  Toggle,
  Txt,
  useTheme,
  Well,
  type LedStep,
  type TabKeyItem,
  type ThemeName,
} from "@/ui/kit";
import { space, type TypeKey } from "@/ui/theme";

const PANGRAM = "Příliš žluťoučký kůň úpěl ďábelské ódy";
const PANGRAM_UPPER = "PŘÍLIŠ ŽLUŤOUČKÝ KŮŇ ÚPĚL ĎÁBELSKÉ ÓDY";

function group(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// ---------------------------------------------------------------------------------------------
// Sections

function HeaderSection({ theme, onTheme, lang, onLang }: { theme: ThemeName; onTheme: (t: ThemeName) => void; lang: string; onLang: (l: string) => void }) {
  const [credits, setCredits] = useState(1234567);
  const [auto, setAuto] = useState(false);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setCredits((c) => c + 137 + Math.floor(Math.random() * 900)), 100);
    return () => clearInterval(id);
  }, [auto]);
  const add = useCallback((e: GestureResponderEvent) => {
    setCredits((c) => c + 4321);
    popNumberAt(e, "+4321", "good");
  }, []);
  const spend = useCallback((e: GestureResponderEvent) => {
    setCredits((c) => Math.max(0, c - 98765));
    popNumberAt(e, "−98765", "bad");
  }, []);
  return (
    <Panel screws title="Ovládací pult" titleRight={<MicroLabel>DTO-01 · MK II</MicroLabel>}>
      <Lcd gap={2}>
        <Row justify="space-between" align="flex-end">
          <LcdText size="s" tone="dim">
            KREDITY
          </LcdText>
          <LcdText size="s" tone={credits > 1300000 ? "warn" : "normal"}>
            {credits > 1300000 ? "SKLAD PŘETÉKÁ" : "TRUP DRŽÍ: ZATÍM"}
          </LcdText>
        </Row>
        <LcdNumber text={group(credits)} value={credits} size="xl" minChars={11} />
        <LcdMeter value={Math.min(1, credits / 1500000)} warnFrom={0.8} />
      </Lcd>
      <KeyRow>
        <Key label="Přidat" icon="plus" tone="orange" onPress={add} repeat sound="buy" />
        <Key label="Utratit" icon="minus" onPress={spend} />
        <Key label={auto ? "Stop" : "Auto"} tone={auto ? "yellow" : "cobalt"} latched={auto} onPress={() => setAuto((a) => !a)} />
      </KeyRow>
      <Rule />
      <Row justify="space-between">
        <Toggle value={theme === "night"} onChange={(v) => onTheme(v ? "night" : "day")} offLabel="Den" onLabel="Noc" color="cobalt" accessibilityLabel="Noční motiv" />
        <Segmented
          options={[
            { value: "cs", label: "CS" },
            { value: "en", label: "EN" },
          ]}
          value={lang}
          onChange={onLang}
          style={{ width: 112 }}
        />
      </Row>
    </Panel>
  );
}

const TYPE_ROWS: { variant: TypeKey; note: string; upper?: boolean }[] = [
  { variant: "title", note: "title · Pixelify Sans Bold 20" },
  { variant: "heading", note: "heading · Pixelify Sans Bold 16" },
  { variant: "pixel", note: "pixel · Pixelify Sans 14" },
  { variant: "body", note: "body · IBM Plex Mono 13" },
  { variant: "bodyBold", note: "bodyBold · IBM Plex Mono Bold 13" },
  { variant: "key", note: "key · IBM Plex Mono Bold 11", upper: true },
  { variant: "label", note: "label · IBM Plex Mono Medium 10", upper: true },
  { variant: "micro", note: "micro · IBM Plex Mono Medium 8.5", upper: true },
];

function TypeSection() {
  return (
    <Panel title="Písmo">
      {TYPE_ROWS.map((r) => (
        <Col key={r.variant} gap={0}>
          <MicroLabel>{r.note}</MicroLabel>
          <Txt variant={r.variant} upper={r.upper} numberOfLines={2}>
            {PANGRAM}
          </Txt>
        </Col>
      ))}
      <Lcd gap={2}>
        <LcdText size="xl">{"ŽLUŤOUČKÝ KŮŇ"}</LcdText>
        <LcdText size="l">{"PŘÍLIŠ ŽLUŤOUČKÝ KŮŇ"}</LcdText>
        <LcdText size="m">{"Příliš žluťoučký kůň úpěl"}</LcdText>
        <LcdText size="s">{PANGRAM_UPPER}</LcdText>
        <LcdText size="m" tone="warn" marquee>
          {"KIPP: Úniková přepážka č. 3 hlásí průvan. Doporučuji lepicí pásku. Hodně lepicí pásky. · " + PANGRAM}
        </LcdText>
      </Lcd>
    </Panel>
  );
}

function BodySection() {
  return (
    <Panel title="Tělo, prohlubně, štítky" screws>
      <Txt variant="body" color="inkDim">
        Panel má světlou horní hranu a tmavou spodní. Prohlubeň je obráceně.
      </Txt>
      <Well gap={space.sm}>
        <Row justify="space-between">
          <MicroLabel size="label" color="ink">
            Prohlubeň
          </MicroLabel>
          <Row gap="xs">
            <Screw angle={10} />
            <Screw angle={70} size={12} />
            <Screw angle={-40} size={8} />
          </Row>
        </Row>
        <Rule label="Výstup" />
        <Row style={{ height: 32 }} gap="md">
          <MicroLabel>L</MicroLabel>
          <Rule vertical />
          <MicroLabel>P</MicroLabel>
          <Rule vertical />
          <MicroLabel>Sluchátka</MicroLabel>
        </Row>
      </Well>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md, paddingVertical: space.sm, justifyContent: "center" }}>
        <Sticker variant="warranty" />
        <Sticker variant="inspected" />
        <Sticker variant="fragile" />
        <Sticker variant="property" />
      </View>
    </Panel>
  );
}

function KeysSection() {
  const [count, setCount] = useState(0);
  const [mode, setMode] = useState("x1");
  const buy = useCallback((e: GestureResponderEvent) => {
    setCount((c) => c + 1);
    popNumberAt(e, "+1", "good");
  }, []);
  return (
    <Panel title="Klávesy">
      <KeyRow>
        <Key label="Koupit" tone="orange" onPress={() => toast("Koupeno. Účtenku si nech.", "good")} />
        <Key label="Mapa" tone="cobalt" />
        <Key label="Pozor" tone="yellow" />
      </KeyRow>
      <KeyRow>
        <Key label="Hotovo" tone="mint" />
        <Key label="Zrušit" tone="red" />
        <Key label="Menu" />
      </KeyRow>
      <Rule label="Velikosti" />
      <KeyRow>
        <Key label="Malá" size="sm" />
        <Key label="Střední" size="md" />
        <Key label="Velká" size="lg" tone="orange" />
      </KeyRow>
      <KeyRow>
        <Key label="Vylepšit" sublabel="1,25 k kreditů" icon="up" tone="orange" />
        <Key label="Zamčeno" icon="lock" disabled />
      </KeyRow>
      <KeyRow>
        <Key label="Drží" latched tone="cobalt" />
        <Key label="Drží" latched />
        <Key label="Volná" />
      </KeyRow>
      <Rule label="Držením nakupuješ" />
      <Row gap="md">
        <Key label="Kup · drž" icon="plus" tone="orange" onPress={buy} repeat sound="buy" width={132} />
        <Lcd style={{ flex: 1 }} padding={4}>
          <LcdNumber text={String(count).padStart(4, "0")} value={count} size="l" />
        </Lcd>
      </Row>
      <Segmented
        options={[
          { value: "x1", label: "×1" },
          { value: "x10", label: "×10" },
          { value: "x100", label: "×100" },
          { value: "max", label: "Max" },
        ]}
        value={mode}
        onChange={setMode}
      />
      <Rule label="Ikonové klávesy" />
      <Row justify="space-between" align="flex-start">
        <IconKey icon="left" caption="Zpět" accessibilityLabel="Zpět" tone="cobalt" />
        <IconKey icon="plus" caption="Přidat" accessibilityLabel="Přidat" />
        <IconKey icon="check" caption="Ano" accessibilityLabel="Potvrdit" tone="mint" />
        <IconKey icon="warning" caption="Poplach" accessibilityLabel="Poplach" tone="yellow" />
        <IconKey icon="close" caption="Zavřít" accessibilityLabel="Zavřít" tone="red" />
        <IconKey icon="star" caption="Nejde" accessibilityLabel="Nedostupné" disabled />
      </Row>
    </Panel>
  );
}

const TABS: TabKeyItem[] = [
  { id: "ship", icon: "tab_ship", label: "Loď" },
  { id: "craft", icon: "tab_craft", label: "Dílna", badge: 3 },
  { id: "grid", icon: "tab_grid", label: "Síť" },
  { id: "nav", icon: "tab_nav", label: "Mapa" },
  { id: "crew", icon: "tab_crew", label: "Lidi", badge: true },
  { id: "meta", icon: "tab_meta", label: "Věda" },
  { id: "log", icon: "tab_log", label: "Deník", locked: true },
  { id: "settings", icon: "tab_settings", label: "Volby" },
];

function TabsSection() {
  const [tab, setTab] = useState("craft");
  const [tab5, setTab5] = useState("ship");
  return (
    <Panel title="Záložky">
      <TabKeys items={TABS} value={tab} onChange={setTab} />
      <Rule label="Pět záložek" />
      <TabKeys items={TABS.slice(0, 5)} value={tab5} onChange={setTab5} ledColor="mint" activeTone="orange" gap={space.sm} />
    </Panel>
  );
}

function ControlsSection() {
  const [gain, setGain] = useState(6);
  const [mix, setMix] = useState(0.35);
  const [turns, setTurns] = useState(0);
  const [fade, setFade] = useState(0.6);
  const [stepFade, setStepFade] = useState(3);
  const [power, setPower] = useState(true);
  const [safety, setSafety] = useState(false);
  return (
    <Panel title="Otočné a posuvné prvky">
      <Row justify="space-between" align="flex-start">
        <Col align="center" gap="xs">
          <Knob value={gain} min={0} max={10} step={1} onChange={setGain} label="Zesílení" />
          <Lcd padding={2}>
            <LcdNumber text={String(gain).padStart(2, "0")} value={gain} size="m" minChars={2} />
          </Lcd>
        </Col>
        <Col align="center" gap="xs">
          <Knob value={mix} onChange={setMix} label="Směs" indicator="bone" />
          <Lcd padding={2}>
            <LcdNumber text={`${Math.round(mix * 100)}`.padStart(3, " ")} value={mix} size="m" minChars={3} />
          </Lcd>
        </Col>
        <Col align="center" gap="xs">
          <Knob endless onTurn={(n) => setTurns((t) => t + n)} label="Ladění" indicator="cobalt" />
          <Lcd padding={2}>
            <LcdNumber text={`${turns < 0 ? "−" : "+"}${String(Math.abs(turns)).padStart(2, "0")}`} value={turns} size="m" minChars={3} />
          </Lcd>
        </Col>
        <Col align="center" gap="xs">
          <Knob value={0.5} label="Mimo" disabled size={44} />
        </Col>
      </Row>
      <Rule label="Táhla" />
      <Row gap="md">
        <MicroLabel style={{ width: 52 }}>Plynulé</MicroLabel>
        <Fader value={fade} onChange={setFade} style={{ flex: 1 }} accessibilityLabel="Plynulé táhlo" />
        <MicroLabel color="ink" style={{ width: 32 }} align="right">{`${Math.round(fade * 100)} %`}</MicroLabel>
      </Row>
      <Row gap="md">
        <MicroLabel style={{ width: 52 }}>Krokové</MicroLabel>
        <Fader value={stepFade} min={0} max={5} step={1} ticks={6} tone="cobalt" onChange={setStepFade} style={{ flex: 1 }} accessibilityLabel="Krokové táhlo" />
        <MicroLabel color="ink" style={{ width: 32 }} align="right">{`${stepFade}/5`}</MicroLabel>
      </Row>
      <Rule label="Přepínače" />
      <Row justify="space-between">
        <Toggle value={power} onChange={setPower} offLabel="Vyp" onLabel="Zap" color="mint" accessibilityLabel="Napájení" />
        <Toggle value={safety} onChange={setSafety} onLabel="Pojistka" color="red" accessibilityLabel="Pojistka" />
        <Toggle value={false} disabled accessibilityLabel="Nedostupné" />
      </Row>
    </Panel>
  );
}

const SEQ: LedStep[] = ["on", "off", "off", "dim", "on", "off", "cobalt", "off", "on", "off", "dim", "off", "on", "red", "off", "off"];

function LedSection() {
  const [progress, setProgress] = useState(0.4);
  const [cursor, setCursor] = useState(0);
  const loop = useSharedValue(0);
  useEffect(() => {
    loop.set(withRepeat(withTiming(1, { duration: 4000, easing: Easing.linear, reduceMotion: ReduceMotion.Never }), -1, false, undefined, ReduceMotion.Never));
  }, [loop]);
  useEffect(() => {
    const id = setInterval(() => setCursor((c) => (c + 1) % 16), 250);
    return () => clearInterval(id);
  }, []);
  return (
    <Panel title="LED a displeje">
      <Row justify="space-between">
        <Row gap="xs">
          <Led state="off" />
          <MicroLabel>Vyp</MicroLabel>
        </Row>
        <Row gap="xs">
          <Led on color="orange" />
          <MicroLabel>Zap</MicroLabel>
        </Row>
        <Row gap="xs">
          <Led state="blink" color="red" />
          <MicroLabel>Bliká</MicroLabel>
        </Row>
        <Led on color="cobalt" size={8} />
        <Led on color="yellow" size={8} />
        <Led on color="mint" size={8} />
        <Led on color="lcd" size={10} />
      </Row>
      <Rule label="16 kroků" />
      <MicroLabel>{`Průběh ${Math.round(progress * 100)} %`}</MicroLabel>
      <LedRow progress={progress} hotColor="red" />
      <Fader value={progress} onChange={setProgress} accessibilityLabel="Průběh" />
      <MicroLabel>Sdílená hodnota · bez renderu</MicroLabel>
      <LedRow progress={loop} color="mint" />
      <MicroLabel>Běžící světlo</MicroLabel>
      <LedRow chase color="cobalt" />
      <MicroLabel>Sekvencer</MicroLabel>
      <LedRow states={SEQ} cursor={cursor} />
      <Rule label="LCD" />
      <Lcd gap={4}>
        <Row justify="space-between">
          <LcdNumber text="00:42" value={42} size="l" align="left" />
          <LcdNumber text="12,5 M" value={12.5} size="l" tone="warn" />
        </Row>
        <Row justify="space-between">
          <LcdNumber text="98 %" value={98} size="m" tone="dim" align="left" />
          <LcdText size="m">REAKTOR OK</LcdText>
        </Row>
        <LcdMeter value={loop} segments={24} warnFrom={0.75} />
        <LcdMeter value={progress} segments={12} tone="dim" height={6} />
      </Lcd>
    </Panel>
  );
}

function MetersSection() {
  const [heat, setHeat] = useState(0.45);
  const [timerKey, setTimerKey] = useState(0);
  const [running, setRunning] = useState(true);
  const loop = useSharedValue(0);
  useEffect(() => {
    loop.set(withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.Never }), -1, true, undefined, ReduceMotion.Never));
  }, [loop]);
  return (
    <Panel title="Měřáky">
      <Row gap="md" align="center">
        <Gauge value={heat} label="Teplo" />
        <Gauge value={loop} label="Tlak" size={72} warnFrom={0.5} dangerFrom={0.8} />
        <Col flex gap="sm">
          <Meter value={heat} label="Teplo jádra" valueText={`${Math.round(heat * 100)} %`} zones={HEAT_ZONES} />
          <Meter value={0.82} label="Náklad" valueText="82 / 100" tone="cobalt" segments={10} />
        </Col>
      </Row>
      <Fader value={heat} onChange={setHeat} tone="red" accessibilityLabel="Teplo" />
      <Rule label="Průběh" />
      <ProgressBar value={loop} />
      <ProgressBar value={0.66} tone="cobalt" segments={12} height={8} />
      <ProgressBar value={0.25} tone="good" height={4} />
      <Rule label="Časovač" />
      <TimerBar duration={8000} running={running} resetKey={timerKey} onDone={() => toast("Čas vypršel. Svářečka chladne.", "warn")} />
      <KeyRow>
        <Key label={running ? "Pauza" : "Pokračovat"} size="sm" onPress={() => setRunning((r) => !r)} />
        <Key label="Znovu" size="sm" tone="cobalt" onPress={() => setTimerKey((k) => k + 1)} />
      </KeyRow>
    </Panel>
  );
}

const ICON_NAMES = ["coin", "plus", "minus", "check", "close", "lock", "warning", "info", "star", "left", "right", "up", "down", "scrap", "tab_ship", "kipp"];

function IconsSection() {
  return (
    <Panel title="Ikony">
      <Txt variant="body" color="inkDim">
        Dokud nedorazí vygenerované ikony, kreslí se náhradní znaky. Neznámé jméno dostane rámeček s otazníkem.
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {ICON_NAMES.map((n) => (
          <Icon key={n} name={n} size={24} chip />
        ))}
      </View>
      <Row gap="md">
        <Icon name="coin" size={16} />
        <Icon name="coin" size={24} />
        <Icon name="coin" size={32} />
        <Icon name="warning" size={32} color="warn" />
        <Icon name="check" size={32} color="good" />
        <Icon name="star" size={32} chip />
      </Row>
    </Panel>
  );
}

interface DeckRow {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  cost: string;
  affordable: boolean;
  quality: number;
}

const DECKS: DeckRow[] = [
  { id: "mining", title: "Těžební paluba", subtitle: "Úroveň 12 · 48,2 šrotu/s", icon: "deck_mining", cost: "1,25 k", affordable: true, quality: 1 },
  { id: "refinery", title: "Rafinerie", subtitle: "Úroveň 7 · čeká na led", icon: "deck_refinery", cost: "8,40 k", affordable: true, quality: 2 },
  { id: "reactor", title: "Reaktor", subtitle: "Úroveň 3 · drží na pásce", icon: "deck_reactor", cost: "152 k", affordable: false, quality: 3 },
  { id: "greenhouse", title: "Skleník s velmi dlouhým názvem, který se nevejde", subtitle: "Zamčeno · potřebuješ úroveň 20 a hodně trpělivosti", icon: "deck_greenhouse", cost: "2,10 M", affordable: false, quality: 4 },
  { id: "hangar", title: "Hangár", subtitle: "Úroveň 1 · dron spí", icon: "deck_hangar", cost: "960", affordable: true, quality: 0 },
];

function ListSection({ virtual }: { virtual: boolean }) {
  const [selected, setSelected] = useState("refinery");
  const renderRow = useCallback(
    (d: DeckRow, last: boolean) => (
      <ListRow
        key={d.id}
        title={d.title}
        subtitle={d.subtitle}
        icon={d.icon}
        selected={selected === d.id}
        locked={d.id === "greenhouse"}
        divider={!last}
        onPress={() => setSelected(d.id)}
        right={
          <Col gap={2} align="flex-end">
            <CostTag icon="coin" amount={d.cost} affordable={d.affordable} size="sm" />
            <QualityPips quality={d.quality} />
          </Col>
        }
      />
    ),
    [selected],
  );
  return (
    <Panel title="Seznamy">
      {virtual ? (
        <ScrollWell
          data={DECKS}
          keyExtractor={(d) => d.id}
          renderItem={({ item, index }) => renderRow(item, index === DECKS.length - 1)}
          getItemLayout={(_, index) => ({ length: LIST_ROW_HEIGHT, offset: LIST_ROW_HEIGHT * index, index })}
          extraData={selected}
          style={{ height: LIST_ROW_HEIGHT * 3.5 }}
        />
      ) : (
        <ScrollWell style={{ height: LIST_ROW_HEIGHT * 3.5 }} nestedScrollEnabled>
          {DECKS.map((d, i) => renderRow(d, i === DECKS.length - 1))}
        </ScrollWell>
      )}
      <ListRow title="Řádek bez prohlubně" subtitle="S šipkou a odznakem" icon="info" chevron right={<Badge label="Nové" tone="orange" />} onPress={() => toast("Ťuk.")} divider={false} />
    </Panel>
  );
}

function DataSection() {
  const [filter, setFilter] = useState("all");
  return (
    <Panel title="Karty, odznaky, ceny">
      <Row gap="sm" align="stretch">
        <Card title="Výnos" style={{ flex: 1 }}>
          <Txt variant="title">48,2 /s</Txt>
          <StatDelta value={0.12} />
        </Card>
        <Card title="Opotřebení" style={{ flex: 1 }} titleRight={<Led on color="red" />}>
          <Txt variant="title">73 %</Txt>
          <StatDelta value={0.054} invert />
        </Card>
      </Row>
      <Card title="Stisknutelná karta" onPress={() => toast("Karta stisknuta.")} titleRight={<Badge label={128} tone="info" />}>
        <Txt variant="body">Laser Mk II se rozbil přesně den po záruce. Náhoda? KIPP mlčí.</Txt>
        <Row justify="space-between">
          <QualityPips quality={3} />
          <CostTag icon="coin" amount="12 500" boxed />
        </Row>
      </Card>
      <Rule label="Odznaky" />
      <Row wrap gap="sm">
        <Badge label={3} tone="bad" />
        <Badge label={128} tone="info" />
        <Badge label="Nové" tone="orange" />
        <Badge label="OK" tone="good" />
        <Badge label="Pozor" tone="warn" />
        <Badge label="Úr. 12" />
        <Badge label={1200} tone="mint" />
      </Row>
      <Rule label="Filtry" />
      <Row wrap gap="sm">
        <Chip label="Vše" selected={filter === "all"} onPress={() => setFilter("all")} />
        <Chip label="Suroviny" dot="orange" selected={filter === "raw"} onPress={() => setFilter("raw")} />
        <Chip label="Součástky" dot="cobalt" selected={filter === "parts"} onPress={() => setFilter("parts")} />
        <Chip label="Zamčeno" icon="lock" disabled />
      </Row>
      <Rule label="Ceny a změny" />
      <Row wrap gap="md">
        <CostTag icon="coin" amount="1 250" />
        <CostTag icon="coin" amount="98,7 M" affordable={false} />
        <CostTag icon="scrap" amount="×40" boxed />
        <CostTag icon="coin" amount="12" size="sm" boxed affordable={false} />
      </Row>
      <Row wrap gap="md">
        <StatDelta value={0.12} />
        <StatDelta value={-0.05} />
        <StatDelta value={0} />
        <StatDelta value={-0.3} invert size="sm" />
        <StatDelta value={2.5} text="+2,5× rychlost" />
      </Row>
      <Row gap="md">
        {[0, 1, 2, 3, 4].map((q) => (
          <QualityPips key={q} quality={q} />
        ))}
      </Row>
    </Panel>
  );
}

function OverlaySection({ open }: { open?: string }) {
  const [sheet, setSheet] = useState(open === "sheet");
  const [dialog, setDialog] = useState(open === "dialog");
  const [event, setEvent] = useState(open === "event");
  const [volume, setVolume] = useState(0.7);
  const [haptics, setHaptics] = useState(true);
  const pop = useCallback((e: GestureResponderEvent) => popNumberAt(e, "+123", "good"), []);
  return (
    <Panel title="Vrstvy">
      <KeyRow>
        <Key label="Otevřít šuplík" tone="cobalt" onPress={() => setSheet(true)} testID="open-sheet" />
        <Key label="Otevřít dialog" tone="orange" onPress={() => setDialog(true)} testID="open-dialog" />
      </KeyRow>
      <KeyRow>
        <Key label="Událost" onPress={() => setEvent(true)} testID="open-event" />
        <Key label="+123" tone="mint" onPress={pop} repeat />
      </KeyRow>
      <Rule label="Hlášky" />
      <KeyRow>
        <Key label="Info" size="sm" onPress={() => toast("Dron č. 2 se vrátil. Tvrdí, že nic neviděl.")} />
        <Key label="Dobré" size="sm" onPress={() => toast("Paluba vylepšena na úroveň 13.", { tone: "good", title: "Těžba" })} />
        <Key label="Pozor" size="sm" onPress={() => toast("Sklad je skoro plný. Prodej něco, než to začne padat z regálů.", "warn")} />
        <Key label="Zle" size="sm" onPress={() => toast("Trhlina v trupu! Paluba 3 ztrácí tlak.", { tone: "bad", title: "Poplach" })} />
      </KeyRow>

      <Sheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Nastavení zvuku"
        footer={
          <KeyRow>
            <Key label="Zrušit" onPress={() => setSheet(false)} />
            <Key label="Uložit" tone="orange" onPress={() => { setSheet(false); toast("Uloženo.", "good"); }} />
          </KeyRow>
        }
      >
        <Txt variant="body" color="inkDim">
          Šuplík vyjede zespodu, dá se stáhnout za úchyt a nikdy nezaleze pod klávesnici.
        </Txt>
        <Row gap="md">
          <MicroLabel style={{ width: 64 }}>Hlasitost</MicroLabel>
          <Fader value={volume} onChange={setVolume} style={{ flex: 1 }} accessibilityLabel="Hlasitost" />
        </Row>
        <Row justify="space-between">
          <Txt variant="bodyBold">Vibrace</Txt>
          <Toggle value={haptics} onChange={setHaptics} offLabel="Vyp" onLabel="Zap" color="mint" accessibilityLabel="Vibrace" />
        </Row>
        <Well>
          <ListRow title="Hudba" subtitle="Noční směna · smyčka 3" icon="music" right={<Badge label="Hraje" tone="good" />} />
          <ListRow title="Zvuky KIPPa" subtitle="Pípání, vzdychání, ticho" icon="kipp" divider={false} right={<Key label="+1" size="sm" onPress={pop} />} />
        </Well>
      </Sheet>

      <Dialog
        visible={dialog}
        title="Vyhodit náklad?"
        body="Přijdeš o 40 kusů šrotu a jednu velmi zmatenou kočku. KIPP tvrdí, že kočka na seznamu nákladu není."
        tone="warn"
        onRequestClose={() => setDialog(false)}
        choices={[
          { label: "Vyhodit", tone: "red", onPress: () => setDialog(false) },
          { label: "Nechat", onPress: () => setDialog(false) },
        ]}
      />

      <Dialog
        visible={event}
        title="Opuštěný vrak na dohled"
        icon="ev_derelict"
        tone="info"
        choices={[
          { label: "Prohledat vrak", sublabel: "20 min · riziko úniku", tone: "orange", onPress: () => setEvent(false) },
          { label: "Poslat dron", sublabel: "−1 palivový článek", tone: "cobalt", onPress: () => setEvent(false) },
          { label: "Naskenovat a letět dál", onPress: () => setEvent(false) },
          { label: "Zeptat se KIPPa", sublabel: "nedoporučuje se", disabled: true, onPress: () => setEvent(false) },
        ]}
      >
        <Txt variant="body">Senzory hlásí vrak nákladní lodi. Světla ještě svítí, což je buď dobrá zpráva, nebo past.</Txt>
        <Row gap="sm">
          <CostTag icon="coin" amount="až 12 k" boxed />
          <StatDelta value={-0.15} text="−15 % trup" />
        </Row>
      </Dialog>
    </Panel>
  );
}

function StatesSection() {
  return (
    <Panel title="Stavy">
      <Well padding={0}>
        <EmptyState actionLabel="Vyrazit pro šrot" onAction={() => toast("Vyrážíme.")} compact />
      </Well>
      <Well padding={0}>
        <LoadingState compact />
      </Well>
      <Well padding={0}>
        <ErrorState detail="E-042 · save.rotate" onRetry={() => toast("Zkouším to znovu…")} compact />
      </Well>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------
// Route

function Backdrop({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <View style={{ flex: 1, backgroundColor: theme.backdrop }}>{children}</View>;
}

export default function KitGallery() {
  const params = useLocalSearchParams<{ theme?: string; only?: string; lang?: string; open?: string; motion?: string }>();
  const [theme, setTheme] = useState<ThemeName>(params.theme === "night" ? "night" : "day");
  const [lang, setLang] = useState(params.lang === "en" ? "en" : "cs");
  const t = useT("common");
  const initial = useRef(true);

  useEffect(() => {
    i18n.changeLanguage(lang);
  }, [lang]);
  useEffect(() => {
    if (!initial.current) return;
    initial.current = false;
    setReduceMotion(params.motion === "reduce");
  }, [params.motion]);

  const only = useMemo(() => (params.only ? params.only.split(",") : null), [params.only]);
  const paged = !!only;

  const sections: { id: string; node: ReactNode }[] = [
    { id: "header", node: <HeaderSection theme={theme} onTheme={setTheme} lang={lang} onLang={setLang} /> },
    { id: "keys", node: <KeysSection /> },
    { id: "tabs", node: <TabsSection /> },
    { id: "controls", node: <ControlsSection /> },
    { id: "leds", node: <LedSection /> },
    { id: "meters", node: <MetersSection /> },
    { id: "type", node: <TypeSection /> },
    { id: "body", node: <BodySection /> },
    { id: "icons", node: <IconsSection /> },
    { id: "list", node: <ListSection virtual={paged} /> },
    { id: "data", node: <DataSection /> },
    { id: "overlays", node: <OverlaySection open={params.open} /> },
    { id: "states", node: <StatesSection /> },
  ];
  const visible = only ? sections.filter((s) => only.includes(s.id)) : sections;

  const content = (
    <Col gap="md" style={{ paddingVertical: space.md }}>
      {visible.map((s) => (
        <View key={s.id}>{s.node}</View>
      ))}
      {!paged ? (
        <Row justify="center" gap="sm" style={{ paddingVertical: space.sm }}>
          <Led on color="mint" size={4} />
          <MicroLabel color="#6B7284">{`${t("done")} · Duct Tape Odyssey UI kit`}</MicroLabel>
        </Row>
      ) : null}
      <Spacer size="sm" />
    </Col>
  );

  return (
    <ThemeProvider theme={theme}>
      <Backdrop>
        <Screen>
          {paged ? (
            content
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {content}
            </ScrollView>
          )}
        </Screen>
        <NumberPopHost />
        <ToastHost />
      </Backdrop>
    </ThemeProvider>
  );
}
