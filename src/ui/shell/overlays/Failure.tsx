// Failure states: a persistent banner (what broke, what it blocks, the running timer) and the
// rescue sheet listing every way out. Banner tap, exit key: the escape is never more than two taps.
import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";

import * as B from "@/engine/big";
import type { FailureExit } from "@/engine/types";
import { attemptFailureExit, callTow, failureExitCost, towQuote } from "@/engine/world";
import { tr, useT } from "@/i18n";
import { content } from "@/content";
import { haptic, sfx } from "@/platform/feedback";
import { act, getGame, useGame } from "@/store/game";
import { fmt, fmtTime, itemName, useFmt } from "@/ui/format";
import { Icon, Key, Led, MicroLabel, Rule, Sheet, Txt, Well, toast } from "@/ui/kit";
import { palette, space } from "@/ui/theme";

import { useShell } from "../store";
import { minigameName } from "./Minigame";

type TFn = (key: string, vars?: Record<string, unknown>) => string;

/** Selected once per second: everything the banner and the sheet print. */
function useFailure() {
  return useGame(
    (g) => {
      const f = g.state.failure;
      if (!f) return null;
      const t = g.state.t;
      return {
        kind: f.kind,
        wait: f.waitUntil > t ? Math.ceil(f.waitUntil - t) : 0,
        tow: f.tow ? Math.max(0, Math.ceil(f.tow.eta - t)) : -1,
        busy: g.state.minigame !== null,
      };
    },
    undefined,
    2,
  );
}

export const FailureBanner = memo(function FailureBanner() {
  const t = useT("world") as TFn;
  const f = useFailure();
  const open = useShell((s) => s.setRescueOpen);
  if (!f) return null;
  const def = content.failures[f.kind];
  const blocked: string[] = [];
  if (def?.blocksJump) blocked.push(t("failure.blocksJump"));
  if (def && def.blocksDecks.length > 0) blocked.push(def.blocksDecks.map((d) => tr(content.decks[d]?.name)).join(", "));
  const timer = f.tow >= 0 ? t("failure.towIn", { time: fmtTime(f.tow) }) : f.wait > 0 ? t("failure.waitIn", { time: fmtTime(f.wait) }) : t("failure.needsYou");
  return (
    <Pressable
      testID="failure-banner"
      onPress={() => {
        haptic("tap");
        open(true);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${tr(def?.name)}. ${t("failure.open")}`}
      style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.red0, borderRadius: 7, borderWidth: 1, borderColor: palette.red1, paddingHorizontal: space.sm, paddingVertical: space.xs }}
    >
      <Icon name={`fail_${f.kind}`} size={24} chip />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="heading" color={palette.bone2} numberOfLines={1} style={{ fontSize: 14, lineHeight: 18 }}>
          {tr(def?.name)}
        </Txt>
        <Txt variant="micro" color={palette.bone0} upper numberOfLines={1}>
          <Txt variant="micro" color={palette.yellow} upper>
            {timer}
          </Txt>
          {` · ${blocked.length ? t("failure.blocked", { what: blocked.join(" · ") }) : t("failure.slowed")}`}
        </Txt>
      </View>
      <Led state="blink" color="red" size={6} />
      <View style={{ backgroundColor: palette.bone2, borderRadius: 5, paddingHorizontal: space.sm, paddingVertical: 6 }}>
        <Txt variant="key" color="#15171C" upper>
          {t("failure.rescue")}
        </Txt>
      </View>
    </Pressable>
  );
});

function ExitRow({ icon, title, sub, action, tone = "black", disabled, onPress, testID }: { icon: string; title: string; sub: string; action: string; tone?: "black" | "orange" | "cobalt"; disabled?: boolean; onPress?: () => void; testID?: string }) {
  return (
    <Well padding={space.sm} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <Icon name={icon} size={24} chip />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyBold" numberOfLines={1}>
          {title}
        </Txt>
        <Txt variant="label" color="inkDim" numberOfLines={2}>
          {sub}
        </Txt>
      </View>
      {onPress ? <Key label={action} tone={tone} size="sm" width={104} disabled={disabled} onPress={onPress} testID={testID} /> : <MicroLabel size="label">{action}</MicroLabel>}
    </Well>
  );
}

export const RescueSheet = memo(function RescueSheet({ visible }: { visible: boolean }) {
  const t = useT("world") as TFn;
  useFmt();
  const f = useFailure();
  const close = useShell((s) => s.setRescueOpen);
  // credits and cargo decide which exits are payable
  useGame((g) => `${fmt(g.state.credits)}|${g.rev}`, undefined, 5);
  const onClose = useCallback(() => close(false), [close]);

  const attempt = useCallback(
    (index: number) => {
      const r = act((g) => attemptFailureExit(g, index));
      if (!r.ok) {
        sfx("deny");
        toast(t(`failure.fail.${r.reason}`, { defaultValue: t("failure.fail.generic") }), "warn");
      } else {
        close(false);
      }
    },
    [close, t],
  );
  const tow = useCallback(() => {
    const r = act((g) => callTow(g));
    if (r.ok) {
      sfx("notify");
      haptic("success");
      toast(t("failure.towCalled"), "good");
    } else sfx("deny");
  }, [t]);

  if (!f) return <Sheet visible={false} onClose={onClose} />;
  const g = getGame();
  const def = content.failures[f.kind];
  const quote = f.tow < 0 ? towQuote(g) : null;

  const rows = (def?.exits ?? []).map((exit: FailureExit, i: number) => {
    switch (exit.kind) {
      case "minigame":
        return <ExitRow key={i} icon={`mg_${exit.game}`} title={t("failure.exit.minigame", { game: minigameName(exit.game) })} sub={t("failure.exit.minigameSub", { tier: exit.tier })} action={t("failure.exit.play")} tone="orange" disabled={f.busy} onPress={() => attempt(i)} testID={`rescue-exit-${i}`} />;
      case "wait":
        return <ExitRow key={i} icon="clock" title={t("failure.exit.wait")} sub={t("failure.exit.waitSub")} action={f.wait > 0 ? fmtTime(f.wait) : t("failure.exit.soon")} />;
      case "items": {
        let have = true;
        const parts: string[] = [];
        for (const id in exit.items) {
          const owned = g.state.inv[id] ?? B.ZERO;
          if (!B.gteN(owned, exit.items[id])) have = false;
          parts.push(`${itemName(id)} ${fmt(owned)}/${exit.items[id]}`);
        }
        return <ExitRow key={i} icon={Object.keys(exit.items)[0] ?? "wrench"} title={t("failure.exit.items")} sub={parts.join(" · ")} action={t("failure.exit.use")} tone="cobalt" disabled={!have} onPress={() => attempt(i)} testID={`rescue-exit-${i}`} />;
      }
      case "credits": {
        const cost = failureExitCost(g, i);
        return <ExitRow key={i} icon="coin" title={t("failure.exit.credits")} sub={t("failure.exit.creditsSub", { cost: fmt(cost) })} action={t("failure.exit.pay")} tone="cobalt" disabled={B.cmp(g.state.credits, cost) < 0} onPress={() => attempt(i)} testID={`rescue-exit-${i}`} />;
      }
      case "tow":
        return null;
    }
  });

  return (
    <Sheet visible={visible} onClose={onClose} title={tr(def?.name)} testID="rescue-sheet">
      <Txt variant="body">{tr(def?.desc)}</Txt>
      <Rule label={t("failure.exits")} />
      {rows}
      <Rule label={t("failure.towTitle")} />
      {f.tow >= 0 ? (
        <ExitRow icon="tow" title={t("failure.towComing")} sub={t("failure.towComingSub")} action={fmtTime(f.tow)} />
      ) : quote ? (
        <ExitRow
          icon="beacon"
          title={t("failure.towCall")}
          sub={`${t("failure.towEta", { time: fmtTime(quote.seconds) })} · ${quote.pay === "credits" ? t("failure.towCost", { cost: fmt(quote.cost) }) : quote.pay === "rep" ? t("failure.towRep", { faction: tr(content.factions[quote.faction ?? "lamplighters"]?.name) }) : t("failure.towFree")}${quote.beacon ? ` · ${t("failure.towBeacon")}` : ""}`}
          action={t("failure.towGo")}
          tone="orange"
          onPress={tow}
          testID="rescue-tow"
        />
      ) : null}
      <MicroLabel>{t("failure.promise")}</MicroLabel>
    </Sheet>
  );
});
