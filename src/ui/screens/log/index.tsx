// Log tab ("DENÍK"): story, crew logs, codex, KIPP archive and cosmetics.
import { useState } from "react";
import { View } from "react-native";

import { useT } from "@/i18n";
import { useGame } from "@/store/game";
import { useUi } from "@/store/ui";
import { EmptyState, Segmented, useTheme } from "@/ui/kit";
import { space } from "@/ui/theme";

import { CodexSection } from "./Codex";
import { CosmeticsSection } from "./Cosmetics";
import { KippSection } from "./Kipp";
import { LogsSection } from "./Logs";
import { StorySection } from "./Story";

export const LOG_SECTIONS = ["story", "logs", "codex", "kipp", "cosmetics"] as const;
export type LogSection = (typeof LOG_SECTIONS)[number];

const isSection = (v: string | null | undefined): v is LogSection => (LOG_SECTIONS as readonly string[]).includes(v ?? "");

export default function LogScreen({ initialSection }: { initialSection?: string }) {
  const t = useT("log");
  const theme = useTheme();
  const deep = useUi((s) => s.section);
  const nonce = useUi((s) => s.nonce);
  const [section, setSection] = useState<LogSection>(isSection(initialSection) ? initialSection : isSection(deep) ? deep : "story");
  // The codex opens with the first scan; entries found earlier (events) are still listed.
  const codexOpen = useGame((g) => g.state.features.codex === 1 || (g.state.stats.codex ?? 0) > 0, undefined, 5);

  // A deep link (goTo("log", "codex")) arrives as a new nonce: adjust during render, no effect.
  const [seenNonce, setSeenNonce] = useState(nonce);
  if (seenNonce !== nonce) {
    setSeenNonce(nonce);
    if (isSection(deep)) setSection(deep);
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.body }}>
      <View style={{ paddingHorizontal: space.sm, paddingVertical: space.sm }}>
        <Segmented<LogSection> size="sm" gap={3} options={LOG_SECTIONS.map((s) => ({ value: s, label: t(`tabs.${s}`) }))} value={section} onChange={setSection} />
      </View>
      {section === "story" ? <StorySection /> : null}
      {section === "logs" ? <LogsSection /> : null}
      {section === "codex" ? (
        codexOpen ? (
          <CodexSection />
        ) : (
          <View style={{ flex: 1, justifyContent: "center" }}>
            <EmptyState compact icon="lock" title={t("codex.lockedTitle")} hint={t("codex.lockedHint")} />
          </View>
        )
      ) : null}
      {section === "kipp" ? <KippSection /> : null}
      {section === "cosmetics" ? <CosmeticsSection /> : null}
    </View>
  );
}
