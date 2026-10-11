// Research: the 7-branch tree as a pannable patch bay, the research point readout, a branch filter
// and the three cheapest nodes that can be researched next.
import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { content } from "@/content";
import * as B from "@/engine/big";
import { hasFeature } from "@/engine/kernel";
import { canResearch, researchBlock, researchCost, researchLevel } from "@/engine/meta";
import type { Big, Game, ResearchDef } from "@/engine/types";
import { useLang, useT, useTr } from "@/i18n";
import { haptic } from "@/platform/feedback";
import { useGame } from "@/store/game";
import { fmt, fmtRate, useFmt } from "@/ui/format";
import { EmptyState, Icon, Lcd, LcdNumber, MicroLabel, Row, Txt, useTheme } from "@/ui/kit";

import { NodeSheet } from "./NodeSheet";
import { packViews, Tree, type NodeCode, type TreeNodeDef } from "./Tree";

type Branch = ResearchDef["branch"];
const BRANCHES: Branch[] = ["extraction", "logistics", "fabrication", "maintenance", "navigation", "science", "crew"];
const ALL_DEFS: ResearchDef[] = Object.values(content.research);

function codeOf(reason: ReturnType<typeof researchBlock>): NodeCode {
  return reason === null ? "o" : reason === "max" ? "m" : reason === "credits" ? "c" : reason === "items" ? "i" : "r";
}

function treeSig(g: Game, defs: readonly ResearchDef[]): string {
  return packViews(defs.map((d) => ({ level: researchLevel(g, d.id), code: codeOf(researchBlock(g, d.id)) })));
}

/** The cheapest nodes whose parents are researched (affordable or not), as "id:cost:affordable" entries. */
function nextBest(g: Game): string {
  const open: { id: string; rp: Big; ok: boolean }[] = [];
  for (const d of ALL_DEFS) {
    if (!canResearch(g, d.id)) continue;
    open.push({ id: d.id, rp: researchCost(g, d.id).rp, ok: researchBlock(g, d.id) === null });
  }
  open.sort((a, b) => B.cmp(a.rp, b.rp));
  return open
    .slice(0, 3)
    .map((o) => `${o.id}:${fmt(o.rp)}:${o.ok ? 1 : 0}`)
    .join("|");
}

const BranchChip = memo(function BranchChip({ id, icon, label, selected, onPick }: { id: Branch | "all"; icon?: string; label: string; selected: boolean; onPick: (id: Branch | "all") => void }) {
  const theme = useTheme();
  return (
    <Pressable
      testID={`branch-${id}`}
      onPress={() => onPick(id)}
      onPressIn={() => haptic("tap")}
      hitSlop={{ top: 8, bottom: 8 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={{
        flex: 1,
        height: 28,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: selected ? theme.orange : theme.rule,
        backgroundColor: selected ? theme.key : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {icon ? <Icon name={icon} size={16} chip={!selected && theme.id === "day"} /> : <MicroLabel color={selected ? "keyText" : "ink"}>{label}</MicroLabel>}
    </Pressable>
  );
});

const Hint = memo(function Hint({ entry, onPick }: { entry: string; onPick: (id: string) => void }) {
  const theme = useTheme();
  const tr = useTr();
  const [id, cost, ok] = entry.split(":");
  const def = content.research[id];
  if (!def) return <View style={{ flex: 1 }} />;
  return (
    <Pressable
      testID={`hint-${id}`}
      onPress={() => onPick(id)}
      onPressIn={() => haptic("tap")}
      hitSlop={{ top: 6, bottom: 6 }}
      accessibilityRole="button"
      accessibilityLabel={tr(def.name)}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        height: 32,
        borderRadius: 4,
        paddingHorizontal: 4,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: pressed ? theme.platePressed : theme.plate,
        borderBottomWidth: 1,
        borderBottomColor: theme.bodyLo,
        borderLeftWidth: 3,
        borderLeftColor: ok === "1" ? theme.orange : theme.rule,
      })}
    >
      <Icon name={def.icon} size={16} chip />
      <View style={{ flex: 1, minWidth: 0 }}>
        <MicroLabel color="ink" style={{ letterSpacing: 0.2 }}>
          {tr(def.name)}
        </MicroLabel>
        <MicroLabel color={ok === "1" ? "good" : "bad"}>{cost}</MicroLabel>
      </View>
    </Pressable>
  );
});

export default function Research() {
  const t = useT("meta");
  const tr = useTr();
  const lang = useLang();
  useFmt();
  const [branch, setBranch] = useState<Branch | "all">("all");
  const [picked, setPicked] = useState<string | null>(null);

  const unlocked = useGame((g) => hasFeature(g, "research"));
  const defs = useMemo(() => (branch === "all" ? ALL_DEFS : ALL_DEFS.filter((d) => d.branch === branch)), [branch]);
  const nodes: TreeNodeDef[] = useMemo(
    () => defs.map((d) => ({ id: d.id, icon: d.icon, name: tr(d.name), x: d.pos.x, y: d.pos.y, requires: d.requires, maxLevel: d.maxLevel })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defs, lang],
  );
  const sig = useGame((g) => treeSig(g, defs), undefined, 3);
  const rp = useGame((g) => ({ text: fmt(g.state.rp), log: B.log10(g.state.rp), rate: fmtRate(g.rates.research) }), undefined, 2);
  const hints = useGame(nextBest, undefined, 5);
  const onClose = useCallback(() => setPicked(null), []);

  if (!unlocked) {
    return <EmptyState icon="lock" title={t("research.lockedTitle")} hint={t("research.lockedHint")} />;
  }

  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Row gap="sm">
        <Lcd padding={4} style={{ flex: 1 }}>
          <Row gap="sm">
            <Icon name="rp" size={16} />
            <LcdNumber text={rp.text} value={rp.log} size="m" align="left" style={{ flex: 1 }} accessibilityLabel={`${t("research.points")} ${rp.text}`} />
            <Txt variant="lcdS" color="lcdOn" testID="rp-rate">
              {`+${rp.rate}`}
            </Txt>
          </Row>
        </Lcd>
        <View style={{ width: 112 }}>
          <MicroLabel>{t("research.branch")}</MicroLabel>
          <Txt variant="label" numberOfLines={1} upper>
            {branch === "all" ? t("research.all") : t(`branch.${branch}`)}
          </Txt>
        </View>
      </Row>
      <Row gap="xs">
        <BranchChip id="all" label={t("research.allShort")} selected={branch === "all"} onPick={setBranch} />
        {BRANCHES.map((b) => (
          <BranchChip key={b} id={b} icon={`br_${b}`} label={t(`branch.${b}`)} selected={branch === b} onPick={setBranch} />
        ))}
      </Row>
      <Tree nodes={nodes} sig={sig} onPick={setPicked} scroll focusKey={branch} />
      <Row gap="xs">
        <MicroLabel style={{ width: 34 }}>{t("research.next")}</MicroLabel>
        {hints ? hints.split("|").map((h) => <Hint key={h} entry={h} onPick={setPicked} />) : <Txt variant="label" color="inkDim">{t("research.nothingOpen")}</Txt>}
      </Row>
      <NodeSheet kind="research" id={picked} onClose={onClose} />
    </View>
  );
}
