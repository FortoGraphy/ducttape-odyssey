// Settings tab ("VOLBY"): groups switched by a chip strip, each group scrolls inside the Control
// Deck area. The debug panel is a sheet that exists only after the seven-tap unlock.
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

import { useT } from "@/i18n";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";
import { Chip, ScrollWell, useTheme } from "@/ui/kit";
import { space } from "@/ui/theme";

import { AboutGroup } from "./About";
import { DebugSheet } from "./Debug";
import { startEconomySampler } from "./economy";
import { AudioGroup, GeneralGroup } from "./General";
import { NotificationsGroup } from "./Notifications";
import { SafeModeGroup } from "./SafeMode";
import { SaveGroup } from "./Save";

export const SETTINGS_GROUPS = ["general", "audio", "notify", "save", "safe", "about"] as const;
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];
const ICONS: Record<SettingsGroup, string> = { general: "gear", audio: "sound", notify: "bell", save: "save", safe: "warning", about: "info" };

const isGroup = (v: string | null | undefined): v is SettingsGroup => (SETTINGS_GROUPS as readonly string[]).includes(v ?? "");

export default function SettingsScreen({ initialGroup, initialDebug = false }: { initialGroup?: string; initialDebug?: boolean }) {
  const t = useT("settings");
  const theme = useTheme();
  const debug = useSettings((s) => s.debug);
  const section = useUi((s) => s.section);
  const nonce = useUi((s) => s.nonce);
  const [group, setGroup] = useState<SettingsGroup>(isGroup(initialGroup) ? initialGroup : isGroup(section) ? section : "general");
  const [debugOpen, setDebugOpen] = useState(initialDebug);
  // A deep link (goTo("settings", "save")) arrives as a new nonce: adjust during render, no effect.
  const [seenNonce, setSeenNonce] = useState(nonce);
  if (seenNonce !== nonce) {
    setSeenNonce(nonce);
    if (isGroup(section)) setGroup(section);
    else if (section === "debug" && debug) setDebugOpen(true);
  }

  useEffect(() => {
    if (debug) startEconomySampler();
  }, [debug]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.body }}>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.sm }}>
          {SETTINGS_GROUPS.map((id) => (
            <Chip key={id} icon={ICONS[id]} label={t(`groups.${id}`)} selected={group === id} onPress={() => setGroup(id)} accessibilityLabel={t(`groups.${id}`)} />
          ))}
          {debug ? <Chip icon="bug" label={t("groups.debug")} dot="yellow" onPress={() => setDebugOpen(true)} accessibilityLabel={t("groups.debug")} /> : null}
        </ScrollView>
      </View>
      <ScrollWell key={group} padding={space.md} radius={0} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: space.xl }}>
        {group === "general" ? <GeneralGroup /> : null}
        {group === "audio" ? <AudioGroup /> : null}
        {group === "notify" ? <NotificationsGroup /> : null}
        {group === "save" ? <SaveGroup /> : null}
        {group === "safe" ? <SafeModeGroup /> : null}
        {group === "about" ? <AboutGroup onOpenDebug={() => setDebugOpen(true)} /> : null}
      </ScrollWell>
      {debug ? <DebugSheet visible={debugOpen} onClose={() => setDebugOpen(false)} /> : null}
    </View>
  );
}
