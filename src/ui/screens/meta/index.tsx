// Meta tab ("VĚDA"): research, prestige, achievements (with statistics) and quests.
import { useState } from "react";
import { View } from "react-native";

import { useT } from "@/i18n";
import { useUi } from "@/store/ui";
import { Segmented, type SegmentedOption } from "@/ui/kit";

import Achievements from "./Achievements";
import Prestige from "./Prestige";
import Quests from "./Quests";
import Research from "./Research";

export type MetaSection = "research" | "prestige" | "achievements" | "quests";
const SECTIONS: readonly MetaSection[] = ["research", "prestige", "achievements", "quests"];

export interface MetaScreenProps {
  /** Preview routes open a section directly; in the app the shell deep-links through the UI store. */
  initialSection?: MetaSection;
  initialLayer?: 1 | 2 | 3;
  initialTree?: boolean;
  initialStats?: boolean;
}

/** Deep links: "research", "prestige", "achievements", "quests", plus "warp"/"hull"/"cosmos" and "stats". */
function parse(section: string | null): { section: MetaSection; layer?: 1 | 2 | 3; stats?: boolean } | null {
  if (!section) return null;
  if ((SECTIONS as readonly string[]).includes(section)) return { section: section as MetaSection };
  if (section === "warp") return { section: "prestige", layer: 1 };
  if (section === "hull") return { section: "prestige", layer: 2 };
  if (section === "cosmos") return { section: "prestige", layer: 3 };
  if (section === "stats") return { section: "achievements", stats: true };
  return null;
}

export default function MetaScreen({ initialSection = "research", initialLayer, initialTree, initialStats }: MetaScreenProps) {
  const t = useT("meta");
  const link = useUi((s) => (s.tab === "meta" ? s.section : null));
  const nonce = useUi((s) => s.nonce);
  const [section, setSection] = useState<MetaSection>(() => parse(link)?.section ?? initialSection);
  const [layer, setLayer] = useState<1 | 2 | 3 | undefined>(() => parse(link)?.layer ?? initialLayer);
  const [stats, setStats] = useState(() => parse(link)?.stats ?? initialStats ?? false);
  // Bumped on every deep link so a section that is already open still jumps to the requested part.
  const [epoch, setEpoch] = useState(0);

  // A deep link that arrives while the tab is mounted is applied during render (no effect round trip).
  const [seen, setSeen] = useState(nonce);
  if (nonce !== seen) {
    setSeen(nonce);
    const target = parse(link);
    if (target) {
      setSection(target.section);
      setLayer(target.layer);
      setStats(target.stats ?? false);
      setEpoch(epoch + 1);
    }
  }

  const options: SegmentedOption<MetaSection>[] = [
    { value: "research", label: t("tab.research") },
    { value: "prestige", label: t("tab.prestige") },
    { value: "achievements", label: t("tab.achievements") },
    { value: "quests", label: t("tab.quests") },
  ];

  return (
    <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, gap: 6 }}>
      <Segmented options={options} value={section} onChange={setSection} size="sm" tone="cobalt" />
      <View style={{ flex: 1 }}>
        {section === "research" ? (
          <Research />
        ) : section === "prestige" ? (
          <Prestige key={`p${epoch}`} initialLayer={layer} initialTree={initialTree} />
        ) : section === "achievements" ? (
          <Achievements key={`a${epoch}`} initial={stats ? "stats" : "open"} />
        ) : (
          <Quests />
        )}
      </View>
    </View>
  );
}
