// Settings group "Safe Mode": what renders the viewport right now, what the crash guard saw at
// launch, and the player's explicit choice for the next launch.
import { useState } from "react";

import { useT } from "@/i18n";
import { getLaunchStatus, setSafeModePreference } from "@/platform/crashGuard";
import { getBuildRenderMode, getRenderMode } from "@/render/mode";
import { Col, Key, KeyRow, Led, Row, Rule, toast, Txt } from "@/ui/kit";

import { CodeBox, KeyValue } from "./parts";

export function SafeModeGroup() {
  const t = useT("settings");
  const [choice, setChoice] = useState<"safe" | "full" | null>(null);
  const status = getLaunchStatus();
  const mode = getRenderMode();
  const build = getBuildRenderMode();

  const launch = status.safeMode ? (status.auto ? t("safe.launchAuto", { count: status.fails }) : t("safe.launchForced")) : t("safe.launchClean");

  return (
    <Col gap="xs">
      <Row gap="sm">
        <Led color={status.safeMode ? "yellow" : "mint"} on />
        <Txt variant="heading" testID="safe-state">
          {status.safeMode ? t("safe.on") : t("safe.off")}
        </Txt>
      </Row>
      <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
        {t("safe.what")}
      </Txt>
      <Rule />
      <KeyValue label={t("safe.render")} value={t(`safe.mode_${mode}`)} testID="safe-render" />
      <KeyValue label={t("safe.build")} value={t(`safe.mode_${build}`)} />
      <KeyValue label={t("safe.launch")} value={launch} tone={status.safeMode ? "warn" : "good"} />
      {build === "lite" ? (
        <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
          {t("safe.liteBuild")}
        </Txt>
      ) : null}
      <Rule label={t("safe.next")} />
      <KeyRow>
        <Key
          icon="warning"
          label={t("safe.goSafe")}
          latched={choice === "safe"}
          onPress={() => {
            setSafeModePreference("safe");
            setChoice("safe");
            toast(t("safe.setSafe"), "info");
          }}
          testID="safe-go-safe"
        />
        <Key
          icon="play"
          label={t("safe.goFull")}
          tone="orange"
          latched={choice === "full"}
          disabled={build === "lite"}
          onPress={() => {
            setSafeModePreference("full");
            setChoice("full");
            toast(t("safe.setFull"), "info");
          }}
          testID="safe-go-full"
        />
      </KeyRow>
      <Txt variant="label" color={choice ? "ink" : "inkDim"} style={{ lineHeight: 15 }} testID="safe-choice">
        {choice === "safe" ? t("safe.setSafe") : choice === "full" ? t("safe.setFull") : t("safe.nextHint")}
      </Txt>
      <Rule label={t("safe.lastError")} />
      {status.lastError ? (
        <CodeBox lines={6}>{status.lastError}</CodeBox>
      ) : (
        <Txt variant="label" color="inkDim">
          {t("safe.noError")}
        </Txt>
      )}
    </Col>
  );
}
