// Ship's Log: the offline return report. What the ship earned and wore down while the engineer
// was away, what KIPP decided on their behalf, and honest reasons to stay for a minute.
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import * as B from "@/engine/big";
import type { OfflinePolicy, OfflineReport } from "@/engine/types";
import { tr, useT } from "@/i18n";
import { content } from "@/content";
import { act, getGame } from "@/store/game";
import { goTo, type TabId } from "@/store/ui";
import { fmt, fmtPct, fmtTime, itemName, useFmt } from "@/ui/format";
import { Icon, Key, Lcd, LcdText, ListRow, MicroLabel, Rule, Segmented, Sheet, Txt, Well } from "@/ui/kit";
import { space } from "@/ui/theme";

import { useShell } from "../store";

type TFn = (key: string, vars?: Record<string, unknown>) => string;
type Hook = OfflineReport["hooks"][number];

const HOOK_TARGET: Record<Hook["kind"], { tab: TabId; section: string | null; icon: string }> = {
  discovery: { tab: "nav", section: null, icon: "planet" },
  repair: { tab: "grid", section: "repair", icon: "repair" },
  trader: { tab: "nav", section: "station", icon: "station" },
  expedition: { tab: "nav", section: "expeditions", icon: "claim" },
  contract: { tab: "nav", section: "station", icon: "quest" },
  cargoFull: { tab: "ship", section: "cargo", icon: "cargo" },
};

const POLICIES: OfflinePolicy[] = ["cautious", "balanced", "risky"];

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <LcdText size="s" tone="dim" upper>
        {label}
      </LcdText>
      <LcdText size="m" tone={warn ? "warn" : "normal"}>
        {value}
      </LcdText>
    </View>
  );
}

export const ShipsLog = memo(function ShipsLog({ visible }: { visible: boolean }) {
  const t = useT("world") as TFn;
  useFmt();
  const report = useShell((s) => s.offline);
  const setOffline = useShell((s) => s.setOffline);
  const remark = useShell((s) => s.kipp[0]?.text);
  const [, bump] = useState(0);
  const policy = getGame().state.offline.policy;
  const close = useCallback(() => setOffline(null), [setOffline]);

  // KIPP greets the engineer once per report; the line arrives through the ticker like any other
  useEffect(() => {
    if (report) act((g) => g.api.say("offlineReturn"));
  }, [report]);

  const items = useMemo(() => {
    if (!report) return [];
    const rows = Object.keys(report.items)
      .filter((id) => report.items[id].m > 0)
      .map((id) => ({ id, amount: report.items[id], worth: B.mulN(report.items[id], content.items[id]?.value ?? 1) }));
    rows.sort((a, b) => B.cmp(b.worth, a.worth));
    return rows.slice(0, 4);
  }, [report]);

  if (!report) return <Sheet visible={false} onClose={close} />;

  const worst = report.wear.reduce<OfflineReport["wear"][number] | null>((w, x) => (!w || x.to < w.to ? x : w), null);
  const worstItem = worst ? getGame().state.modules.find((m) => m.uid === worst.uid)?.item : undefined;
  const hullLost = Math.round(report.hull.from - report.hull.to);
  const capped = report.credited < report.seconds - 1;

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={t("offline.title")}
      testID="ships-log"
      maxHeight={0.9}
      footer={<Key label={t("offline.close")} tone="orange" onPress={close} testID="ships-log-close" />}
    >
      <Lcd padding={8} gap={6}>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Stat label={t("offline.away")} value={fmtTime(report.seconds)} />
          <Stat label={t("offline.credited")} value={fmtTime(report.credited)} warn={capped} />
          <Stat label={t("offline.efficiency")} value={fmtPct(report.efficiency)} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <Icon name="coin" size={16} />
          <LcdText size="l">{`+${fmt(report.credits)}`}</LcdText>
          <View style={{ flex: 1 }} />
          {report.rp.m > 0 ? (
            <>
              <Icon name="rp" size={16} />
              <LcdText size="m">{`+${fmt(report.rp)}`}</LcdText>
            </>
          ) : null}
        </View>
      </Lcd>
      {capped ? <MicroLabel numberOfLines={2}>{t("offline.capped")}</MicroLabel> : null}
      {report.safeMode ? (
        <Well padding={space.sm} style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
          <Icon name="warning" size={16} chip />
          <Txt variant="label" color="warn" style={{ flex: 1 }}>
            {t("offline.parked")}
          </Txt>
        </Well>
      ) : null}

      {remark ? (
        <Well padding={space.sm} style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
          <Icon name="kipp" size={24} chip />
          <Txt variant="body" style={{ flex: 1 }}>
            {remark}
          </Txt>
        </Well>
      ) : null}

      {items.length > 0 ? (
        <>
          <Rule label={t("offline.gathered")} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            {items.map((row) => (
              <Well key={row.id} padding={space.xs} style={{ flexDirection: "row", alignItems: "center", gap: space.xs, width: "48.5%" }}>
                <Icon name={content.items[row.id]?.icon ?? row.id} size={16} chip />
                <Txt variant="label" numberOfLines={1} style={{ flex: 1 }}>
                  {itemName(row.id)}
                </Txt>
                <Txt variant="label" color="good">{`+${fmt(row.amount)}`}</Txt>
              </Well>
            ))}
          </View>
        </>
      ) : null}

      <Rule label={t("offline.condition")} />
      <Txt variant="label" color={worst && worst.to < 50 ? "warn" : "inkDim"}>
        {worst ? t("offline.wear", { count: report.wear.length, item: worstItem ? itemName(worstItem) : t("offline.module"), from: Math.round(worst.from), to: Math.round(worst.to) }) : t("offline.noWear")}
      </Txt>
      <Txt variant="label" color={hullLost > 0 ? "warn" : "inkDim"}>
        {hullLost > 0 ? t("offline.hull", { from: Math.round(report.hull.from), to: Math.round(report.hull.to) }) : t("offline.hullOk", { hp: Math.round(report.hull.to) })}
      </Txt>

      {report.events.length > 0 ? (
        <>
          <Rule label={t("offline.events")} />
          {report.events.map((e, i) => {
            const def = content.events[e.id];
            const choice = def?.choices[e.choice];
            return (
              <Well key={i} padding={space.sm} gap={space.xxs}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                  <Icon name={`ev_${def?.type ?? "story"}`} size={16} chip />
                  <Txt variant="bodyBold" numberOfLines={1} style={{ flex: 1 }}>
                    {tr(def?.title)}
                  </Txt>
                </View>
                <MicroLabel size="label" numberOfLines={2}>
                  {t("offline.kippChose", { choice: tr(choice?.label) })}
                </MicroLabel>
                <Txt variant="label" color="inkDim">
                  {tr(choice?.outcomes[e.outcome]?.text)}
                </Txt>
              </Well>
            );
          })}
        </>
      ) : null}

      {report.hooks.length > 0 ? (
        <>
          <Rule label={t("offline.hooks")} />
          {report.hooks.map((h, i) => {
            const target = HOOK_TARGET[h.kind] ?? HOOK_TARGET.discovery;
            return (
              <ListRow
                key={i}
                title={tr(h.text)}
                icon={target.icon}
                chevron
                onPress={() => {
                  close();
                  goTo(target.tab, target.section);
                }}
                testID={`ships-log-hook-${i}`}
              />
            );
          })}
        </>
      ) : null}

      <Rule label={t("offline.policy")} />
      <Segmented
        size="sm"
        value={policy}
        options={POLICIES.map((p) => ({ value: p, label: t(`offline.policies.${p}`) }))}
        onChange={(p) => {
          // no engine action exists for this setting; it is a plain preference in the save
          act((g) => {
            g.state.offline.policy = p;
          });
          bump((n) => n + 1);
        }}
      />
      <MicroLabel numberOfLines={2}>{t(`offline.policyHint.${policy}`)}</MicroLabel>
    </Sheet>
  );
});
