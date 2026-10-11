// Nav tab: galaxy map, the current system, expeditions and local discoveries, with the jump bar
// always in reach at the bottom. One sheet instance hosts every detail view of the tab.
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { findPlanet } from "@/engine/world";
import { useT } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { getGame, onEngineEvent, useGame } from "@/store/game";
import { useUi } from "@/store/ui";
import { Icon, IconKey, Row, Segmented, Sheet, Sticker, toast, Txt, Well } from "@/ui/kit";
import { space } from "@/ui/theme";

import { Discoveries, RenameSheet } from "./Discoveries";
import { ExpeditionResultCard, ExpeditionStart, Expeditions } from "./Expeditions";
import { GalaxyMap, SystemSheet, systemSheetTitle } from "./GalaxyMap";
import { DriveSheet, JumpBar } from "./JumpBar";
import { planetName, unlockHint, useNavUi, type NavSection, type SheetState } from "./state";
import { PlanetSheet, SystemView } from "./SystemView";

const SECTIONS: NavSection[] = ["map", "system", "exp", "codex"];

function NavSheet() {
  const t = useT("nav");
  const sheets = useNavUi((s) => s.sheets);
  const back = useNavUi((s) => s.back);
  const close = useNavUi((s) => s.close);
  const top: SheetState | undefined = sheets[sheets.length - 1];
  const last = useNavUi((s) => s.last);
  const shown = top ?? last;
  if (!shown) return null;

  let title = "";
  let body = null;
  switch (shown.kind) {
    case "drive":
      title = t("drive.sheet");
      body = <DriveSheet />;
      break;
    case "system":
      title = systemSheetTitle(shown.depth, shown.lane);
      body = <SystemSheet depth={shown.depth} lane={shown.lane} />;
      break;
    case "planet": {
      const g = getGame();
      const planet = findPlanet(g, shown.id);
      title = planet ? planetName(g, planet) : "";
      body = <PlanetSheet id={shown.id} />;
      break;
    }
    case "expedition":
      title = t("exp.plan");
      body = <ExpeditionStart key={shown.planet ?? "any"} planet={shown.planet} />;
      break;
    case "rename":
      title = t("rename.title");
      body = <RenameSheet key={shown.key} codexKey={shown.key} fallback={shown.fallback} />;
      break;
    case "result":
      title = t("result.title");
      body = <ExpeditionResultCard />;
      break;
  }
  return (
    <Sheet
      visible={top !== undefined}
      onClose={close}
      title={title}
      testID="nav-sheet"
      titleRight={
        <Row gap="xs">
          {sheets.length > 1 ? <IconKey icon="back" size="sm" onPress={back} accessibilityLabel={t("sheet.back")} /> : null}
          <IconKey testID="nav-sheet-close" icon="close" size="sm" onPress={close} accessibilityLabel={t("sheet.close")} sound={null} />
        </Row>
      }
    >
      {body}
    </Sheet>
  );
}

function Teaser() {
  const t = useT("nav");
  const hint = unlockHint("nav");
  return (
    <View style={styles.teaser}>
      <Well padding={space.md} gap={space.sm}>
        <Row align="center">
          <Icon name="lock" size={24} chip />
          <View style={styles.fill}>
            <Txt variant="heading">{t("teaser.title")}</Txt>
            <Txt variant="label" color="warn">
              {hint.kind === "chapter" ? t("lock.chapter", { n: hint.chapter, name: hint.name }) : hint.kind === "research" ? t("lock.research", { name: hint.name }) : t("lock.progress")}
            </Txt>
          </View>
        </Row>
        <Txt variant="body">{t("teaser.body")}</Txt>
        {(["jump", "planet", "crew"] as const).map((icon, i) => (
          <Row key={icon} align="center">
            <Icon name={icon} size={16} chip />
            <Txt variant="label" style={styles.fill}>
              {t(`teaser.point${i + 1}`)}
            </Txt>
          </Row>
        ))}
      </Well>
      <Sticker variant="inspected" style={styles.sticker} />
    </View>
  );
}

function NavTab() {
  const t = useT("nav");
  const section = useNavUi((s) => s.section);
  const setSection = useNavUi((s) => s.setSection);
  const link = useUi((s) => (s.tab === "nav" ? s.section : null));
  const nonce = useUi((s) => s.nonce);
  const back = useGame((g) => g.state.expeditions.reduce((n, e) => n + (e.done ? 1 : 0), 0), Object.is, 5);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (link && (SECTIONS as string[]).includes(link)) setSection(link as NavSection);
  }, [link, nonce, setSection]);

  useEffect(
    () =>
      onEngineEvent((ev, g) => {
        if (ev.t !== "discovery" || !ev.key.startsWith("planet:")) return;
        const planet = findPlanet(g, ev.key.slice(7));
        if (!planet) return;
        sfx("discovery");
        haptic("success");
        const species = planet.fauna + planet.flora;
        toast(species > 0 ? t("planet.scanToast", { name: planetName(g, planet), species: t("count.species", { count: species }) }) : t("planet.scanToastEmpty", { name: planetName(g, planet) }), { tone: "good", icon: "scan" });
      }),
    [t],
  );

  return (
    <View style={styles.root}>
      <Segmented
        options={SECTIONS.map((s) => ({ value: s, label: s === "exp" && back > 0 ? `${t("section.exp")} • ${back}` : t(`section.${s}`) }))}
        value={section}
        onChange={setSection}
        tone="cobalt"
      />
      <View style={styles.fill} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {section === "map" ? <GalaxyMap /> : section === "system" ? width > 0 ? <SystemView width={width} /> : null : section === "exp" ? <Expeditions /> : <Discoveries />}
      </View>
      <JumpBar />
      <NavSheet />
    </View>
  );
}

export default function NavScreen() {
  const unlocked = useGame((g) => g.state.features.nav === 1, Object.is, 5);
  return unlocked ? <NavTab /> : <Teaser />;
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.xs, gap: 6 },
  fill: { flex: 1, minWidth: 0, minHeight: 0 },
  teaser: { flex: 1, padding: space.md, justifyContent: "center" },
  sticker: { position: "absolute", right: space.lg, bottom: space.md },
});
