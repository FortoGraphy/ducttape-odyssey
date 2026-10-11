// Settings group "about": the title plate (seven taps open the service hatch), version, credits
// and the engineer / ship name fields.
import Constants from "expo-constants";
import { useCallback, useRef, useState } from "react";
import { Pressable } from "react-native";

import { stat } from "@/engine/kernel";
import { sanitizeName } from "@/engine/meta";
import { useT } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { act, useGame } from "@/store/game";
import { useSettings } from "@/store/settings";
import { Col, Icon, Key, Lcd, MicroLabel, Row, Rule, toast, Txt } from "@/ui/kit";

import { Field, KeyValue } from "./parts";

const TAPS = 7;
const TAP_WINDOW_MS = 1500;

function NameField({ which }: { which: "name" | "ship" }) {
  const t = useT("settings");
  const current = useGame((g) => g.state.player[which]);
  const [draft, setDraft] = useState(current);
  const clean = sanitizeName(draft);
  const changed = clean !== current && clean.length > 0;
  const apply = useCallback(() => {
    if (!changed) return;
    act((g) => {
      g.state.player[which] = clean;
    });
    setDraft(clean);
    toast(t("about.renamed"), "good");
  }, [changed, clean, t, which]);

  return (
    <Col gap={2}>
      <MicroLabel size="label">{t(which === "name" ? "about.engineer" : "about.ship")}</MicroLabel>
      <Row gap="sm">
        <Field value={draft} onChangeText={setDraft} maxLength={24} onSubmit={apply} accessibilityLabel={t(which === "name" ? "about.engineer" : "about.ship")} testID={`rename-${which}`} style={{ flex: 1 }} />
        <Key size="sm" icon="rename" label={t("about.apply")} disabled={!changed} onPress={apply} testID={`rename-${which}-apply`} />
      </Row>
    </Col>
  );
}

export function AboutGroup({ onOpenDebug }: { onOpenDebug: () => void }) {
  const t = useT("settings");
  const debug = useSettings((s) => s.debug);
  const taps = useRef(0);
  const lastTap = useRef(0);
  const version = Constants.expoConfig?.version ?? "dev";

  const onLogo = useCallback(() => {
    const now = Date.now();
    taps.current = now - lastTap.current > TAP_WINDOW_MS ? 1 : taps.current + 1;
    lastTap.current = now;
    haptic("tap");
    if (useSettings.getState().debug) {
      if (taps.current >= TAPS) {
        taps.current = 0;
        onOpenDebug();
      }
      return;
    }
    const left = TAPS - taps.current;
    if (left <= 0) {
      taps.current = 0;
      useSettings.getState().set("debug", true);
      act((g) => {
        stat(g, "debugOpened");
        g.api.say("debug");
      });
      sfx("milestone");
      haptic("success");
      toast(t("about.debugUnlocked"), { tone: "warn", icon: "bug" });
      onOpenDebug();
    } else if (left === 2) {
      toast(t("about.debugTaps", { count: left }), "info");
    }
  }, [onOpenDebug, t]);

  return (
    <Col gap="xs">
      <Pressable onPress={onLogo} accessibilityRole="image" accessibilityLabel="Duct Tape Odyssey" testID="about-logo">
        <Lcd padding={12} gap={2}>
          <Row gap="sm">
            <Icon name="tape" size={32} />
            <Col gap={0} flex>
              <Txt variant="title" color="lcdOn">
                DUCT TAPE
              </Txt>
              <Txt variant="title" color="orange">
                ODYSSEY
              </Txt>
            </Col>
            <Col gap={0} align="flex-end">
              <MicroLabel color="lcdOn">{t("about.version")}</MicroLabel>
              <Txt variant="lcdM" testID="about-version">
                {version}
              </Txt>
            </Col>
          </Row>
          <MicroLabel color="lcdOn">{t("about.tagline")}</MicroLabel>
        </Lcd>
      </Pressable>
      {debug ? <Key size="sm" icon="bug" label={t("debug.open")} tone="yellow" onPress={onOpenDebug} testID="debug-open" /> : null}

      <Rule label={t("about.names")} />
      <NameField which="name" />
      <NameField which="ship" />

      <Rule label={t("about.credits")} />
      <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
        {t("about.madeBy")}
      </Txt>
      <KeyValue label="Doto" value="SIL OFL 1.1" />
      <KeyValue label="Pixelify Sans" value="SIL OFL 1.1" />
      <KeyValue label="IBM Plex Mono" value="SIL OFL 1.1" />
      <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
        {t("about.fonts")}
      </Txt>
      <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
        {t("about.original")}
      </Txt>
      <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
        {t("about.libs")}
      </Txt>
      <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
        {t("about.noMoney")}
      </Txt>
    </Col>
  );
}
