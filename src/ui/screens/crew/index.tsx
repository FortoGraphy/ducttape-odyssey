// Crew tab ("LIDI"): the people aboard, the boost cards, the station in this system and the factions.
// Deep links through the UI store: "crew" | "cards" | "station" | "station.<service>" | "factions".
import { useCallback, useState } from "react";
import { View } from "react-native";

import { useT } from "@/i18n";
import { useUi } from "@/store/ui";
import { Segmented } from "@/ui/kit";
import { space } from "@/ui/theme";

import CardsSection from "./CardsSection";
import CrewSection from "./CrewSection";
import FactionsSection from "./FactionsSection";
import StationSection, { STATION_SUBS, type StationSub } from "./StationSection";

const SECTIONS = ["crew", "cards", "station", "factions"] as const;
type Section = (typeof SECTIONS)[number];

function parse(link: string | null): { section: Section | null; sub: StationSub | undefined } {
  if (!link) return { section: null, sub: undefined };
  const [head, tail] = link.split(".");
  return {
    section: (SECTIONS as readonly string[]).includes(head) ? (head as Section) : null,
    sub: (STATION_SUBS as readonly string[]).includes(tail ?? "") ? (tail as StationSub) : undefined,
  };
}

export default function CrewScreen() {
  const t = useT("crew");
  const link = useUi((s) => (s.tab === "crew" ? s.section : null));
  const nonce = useUi((s) => s.nonce);
  const [section, setSection] = useState<Section>(() => parse(link).section ?? "crew");
  const [sub, setSub] = useState<StationSub | undefined>(() => parse(link).sub);

  // A new deep link (or the same one requested again) moves the screen; plain re-renders do not.
  const request = `${link ?? ""}|${nonce}`;
  const [seen, setSeen] = useState(request);
  if (request !== seen) {
    setSeen(request);
    const next = parse(link);
    if (next.section) {
      setSection(next.section);
      setSub(next.sub);
    }
  }

  const toStation = useCallback(() => setSection("station"), []);

  return (
    <View style={{ flex: 1, paddingHorizontal: space.md, paddingTop: space.sm, gap: space.sm }}>
      <Segmented<Section>
        value={section}
        onChange={setSection}
        options={[
          { value: "crew", label: t("tab.crew") },
          { value: "cards", label: t("tab.cards") },
          { value: "station", label: t("tab.station") },
          { value: "factions", label: t("tab.factions") },
        ]}
      />
      <View style={{ flex: 1 }}>
        {section === "crew" ? <CrewSection onFindStation={toStation} /> : null}
        {section === "cards" ? <CardsSection /> : null}
        {section === "station" ? <StationSection key={sub ?? "default"} initialSub={sub} /> : null}
        {section === "factions" ? <FactionsSection /> : null}
      </View>
    </View>
  );
}
