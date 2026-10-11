// Settings groups "general" (language, theme, numbers, motion, power, offline policy) and "audio".
import { useCallback } from "react";

import type { OfflinePolicy } from "@/engine/types";
import { applyLanguage, useT, type LangSetting } from "@/i18n";
import { configureFeedback } from "@/platform/feedback";
import { act, useGame } from "@/store/game";
import { useSettings, type NumberFormat, type PanelThemeId, type Settings } from "@/store/settings";
import { fmt } from "@/ui/format";
import { Col, Fader, Lcd, LcdText, MicroLabel, Row, Rule, Segmented, setReduceMotion, Toggle, Txt } from "@/ui/kit";

import { SettingRow } from "./parts";

function useSetting<K extends keyof Settings>(key: K): [Settings[K], (value: Settings[K]) => void] {
  const value = useSettings((s) => s[key]) as Settings[K];
  const set = useCallback((next: Settings[K]) => useSettings.getState().set(key, next), [key]);
  return [value, set];
}

export function GeneralGroup() {
  const t = useT("settings");
  const [language, setLanguage] = useSetting("language");
  const [theme, setTheme] = useSetting("theme");
  const [numberFormat, setNumberFormat] = useSetting("numberFormat");
  const [reduceMotion, setReduce] = useSetting("reduceMotion");
  const [batterySaver, setBattery] = useSetting("batterySaver");
  const [keepAwake, setAwake] = useSetting("keepAwake");
  const policy = useGame((g) => g.state.offline.policy);
  // The format is read inside fmt(), so the selection changes as soon as the setting does.
  const credits = useGame((g) => fmt(g.state.credits));
  const sample = `${fmt(1234567.89)} · ${fmt(9.87e15)}`;

  return (
    <Col gap="xs">
      <SettingRow icon="lang" title={t("language.title")} hint={t("language.hint")} testID="set-language">
        <Segmented<LangSetting>
          size="sm"
          options={[
            { value: "system", label: t("language.system") },
            { value: "cs", label: "Česky" },
            { value: "en", label: "English" },
          ]}
          value={language}
          onChange={(v) => {
            setLanguage(v);
            applyLanguage(v);
          }}
        />
      </SettingRow>
      <Rule />
      <SettingRow icon="theme" title={t("theme.title")} hint={t("theme.hint")}>
        <Segmented<PanelThemeId>
          size="sm"
          options={[
            { value: "day", label: t("theme.day") },
            { value: "night", label: t("theme.night") },
          ]}
          value={theme}
          onChange={setTheme}
        />
      </SettingRow>
      <Rule />
      <SettingRow icon="coin" title={t("numbers.title")} hint={t("numbers.hint")}>
        <Segmented<NumberFormat>
          size="sm"
          options={[
            { value: "suffix", label: t("numbers.suffix") },
            { value: "sci", label: t("numbers.sci") },
          ]}
          value={numberFormat}
          onChange={setNumberFormat}
        />
        <Lcd padding={8} gap={2}>
          <Row justify="space-between">
            <MicroLabel color="lcdOn">{t("numbers.sample")}</MicroLabel>
            <Txt variant="lcdS" testID="number-sample">
              {sample}
            </Txt>
          </Row>
          <Row justify="space-between">
            <MicroLabel color="lcdOn">{t("numbers.credits")}</MicroLabel>
            <Txt variant="lcdM" testID="number-credits">
              {credits}
            </Txt>
          </Row>
        </Lcd>
      </SettingRow>
      <Rule />
      <SettingRow
        icon="motion"
        title={t("motion.title")}
        hint={t("motion.hint")}
        right={
          <Toggle
            value={reduceMotion}
            onChange={(v) => {
              setReduce(v);
              setReduceMotion(v);
            }}
            accessibilityLabel={t("motion.title")}
          />
        }
      />
      <SettingRow icon="battery" title={t("battery.title")} hint={t("battery.hint")} right={<Toggle value={batterySaver} onChange={setBattery} color="mint" accessibilityLabel={t("battery.title")} />} />
      <SettingRow icon="clock" title={t("awake.title")} hint={t("awake.hint")} right={<Toggle value={keepAwake} onChange={setAwake} accessibilityLabel={t("awake.title")} />} />
      <Rule />
      <SettingRow icon="pause" title={t("offline.title")} hint={t("offline.hint")} testID="set-offline">
        <Segmented<OfflinePolicy>
          size="sm"
          options={[
            { value: "cautious", label: t("offline.cautious") },
            { value: "balanced", label: t("offline.balanced") },
            { value: "risky", label: t("offline.risky") },
          ]}
          value={policy}
          onChange={(v) =>
            act((g) => {
              g.state.offline.policy = v;
            })
          }
        />
        <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
          {t(`offline.${policy}Desc`)}
        </Txt>
      </SettingRow>
    </Col>
  );
}

export function AudioGroup() {
  const t = useT("settings");
  const [haptics, setHaptics] = useSetting("haptics");
  const [sfxOn, setSfx] = useSetting("sfx");
  const [music, setMusic] = useSetting("music");
  const [sfxVolume, setSfxVolume] = useSetting("sfxVolume");
  const [musicVolume, setMusicVolume] = useSetting("musicVolume");

  return (
    <Col gap="xs">
      <SettingRow
        icon="haptic"
        title={t("haptics.title")}
        hint={t("haptics.hint")}
        right={
          <Toggle
            value={haptics}
            onChange={(v) => {
              setHaptics(v);
              configureFeedback({ haptics: v });
            }}
            accessibilityLabel={t("haptics.title")}
          />
        }
      />
      <Rule />
      <SettingRow
        icon="sound"
        title={t("sfx.title")}
        hint={t("sfx.hint")}
        right={
          <Toggle
            value={sfxOn}
            onChange={(v) => {
              setSfx(v);
              configureFeedback({ sfx: v });
            }}
            accessibilityLabel={t("sfx.title")}
          />
        }
      >
        <Row gap="md">
          <MicroLabel style={{ width: 64 }}>{t("volume")}</MicroLabel>
          <Fader value={sfxVolume} onChangeEnd={setSfxVolume} disabled={!sfxOn} style={{ flex: 1 }} accessibilityLabel={t("sfx.title")} />
          <MicroLabel color="ink" style={{ width: 36 }} align="right">{`${Math.round(sfxVolume * 100)} %`}</MicroLabel>
        </Row>
      </SettingRow>
      <Rule />
      <SettingRow icon="music" title={t("music.title")} hint={t("music.hint")} right={<Toggle value={music} onChange={setMusic} color="cobalt" accessibilityLabel={t("music.title")} />}>
        <Row gap="md">
          <MicroLabel style={{ width: 64 }}>{t("volume")}</MicroLabel>
          <Fader value={musicVolume} onChangeEnd={setMusicVolume} tone="cobalt" disabled={!music} style={{ flex: 1 }} accessibilityLabel={t("music.title")} />
          <MicroLabel color="ink" style={{ width: 36 }} align="right">{`${Math.round(musicVolume * 100)} %`}</MicroLabel>
        </Row>
      </SettingRow>
      <Lcd padding={8}>
        <LcdText size="sm">{t("audio.silentNote")}</LcdText>
      </Lcd>
    </Col>
  );
}
