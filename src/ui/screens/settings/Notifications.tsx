// Settings group "notifications": the master switch asks iOS for permission the first time it is
// turned on; the per-kind switches only choose what the planner may schedule. Local only.
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

import { useT } from "@/i18n";
import { sfx } from "@/platform/feedback";
import { clearScheduled, notificationsAllowed, requestNotifications } from "@/platform/notifications";
import { useSettings, type Settings } from "@/store/settings";
import { Col, Rule, Sticker, toast, Toggle, Txt } from "@/ui/kit";

import { SettingRow } from "./parts";

type Kind = "notifyCargo" | "notifyRepair" | "notifyAttention" | "notifyDaily";
const KINDS: { key: Kind; icon: string }[] = [
  { key: "notifyCargo", icon: "cargo" },
  { key: "notifyRepair", icon: "repair" },
  { key: "notifyAttention", icon: "warning" },
  { key: "notifyDaily", icon: "calendar" },
];

const supported = Platform.OS === "ios" || Platform.OS === "android";

export function NotificationsGroup() {
  const t = useT("settings");
  const enabled = useSettings((s) => s.notifications);
  const kinds = useSettings((s) => `${+s.notifyCargo}${+s.notifyRepair}${+s.notifyAttention}${+s.notifyDaily}`);
  const [denied, setDenied] = useState(false);
  const [asking, setAsking] = useState(false);
  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => useSettings.getState().set(key, value), []);

  // The player may have revoked the permission in iOS Settings since the switch was turned on.
  useEffect(() => {
    let alive = true;
    if (enabled && supported) {
      notificationsAllowed().then((ok) => {
        if (alive) setDenied(!ok);
      });
    }
    return () => {
      alive = false;
    };
  }, [enabled]);

  const onMaster = useCallback(
    async (next: boolean) => {
      if (!next) {
        set("notifications", false);
        setDenied(false);
        clearScheduled();
        return;
      }
      setAsking(true);
      const ok = await requestNotifications();
      setAsking(false);
      if (ok) {
        set("notifications", true);
        setDenied(false);
        toast(t("notify.enabled"), "good");
      } else {
        set("notifications", false);
        setDenied(true);
        sfx("deny");
      }
    },
    [set, t],
  );

  return (
    <Col gap="xs">
      <SettingRow
        icon="bell"
        title={t("notify.master")}
        hint={t("notify.masterHint")}
        right={<Toggle value={enabled} onChange={onMaster} disabled={asking} color="mint" accessibilityLabel={t("notify.master")} />}
        testID="set-notify"
      />
      {denied ? (
        <Col gap="xs" style={{ paddingBottom: 4 }}>
          <Txt variant="bodyBold" color="bad" testID="notify-denied">
            {supported ? t("notify.deniedTitle") : t("notify.unsupportedTitle")}
          </Txt>
          <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
            {supported ? t("notify.deniedHow") : t("notify.unsupportedHow")}
          </Txt>
        </Col>
      ) : null}
      <Rule label={t("notify.kinds")} />
      {KINDS.map((k, i) => (
        <SettingRow
          key={k.key}
          icon={k.icon}
          title={t(`notify.${k.key}`)}
          hint={t(`notify.${k.key}Hint`)}
          right={<Toggle value={kinds[i] === "1"} onChange={(v) => set(k.key, v)} disabled={!enabled} accessibilityLabel={t(`notify.${k.key}`)} />}
        />
      ))}
      <Rule />
      <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
        {t("notify.localOnly")}
      </Txt>
      <Sticker variant="warranty" title={t("notify.stickerTitle")} subtitle={t("notify.stickerSub")} style={{ alignSelf: "flex-end", marginTop: 4 }} />
    </Col>
  );
}
