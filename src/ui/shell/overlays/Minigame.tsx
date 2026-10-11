// Mini-game overlay for state.minigame. The host and the registry are loaded through a guarded
// require and run inside an error boundary; whatever goes wrong, the auto-resolve key remains.
import { Component, memo, useCallback, type ComponentType, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { autoResolveCost, autoResolveMinigame, findModule, resolveMinigame } from "@/engine/core";
import type { MinigameId, MinigameResult, PendingMinigame } from "@/engine/types";
import { tr, useT } from "@/i18n";
import { content } from "@/content";
import type { MinigameHostProps } from "@/minigames/host/MinigameHost";
import type { MinigameRegistry } from "@/minigames/types";
import { act, getGame, useGame } from "@/store/game";
import { useSettings } from "@/store/settings";
import { fmtTime, itemName } from "@/ui/format";
import { Key, Panel, Txt, useTheme } from "@/ui/kit";
import { space } from "@/ui/theme";

type TFn = (key: string, vars?: Record<string, unknown>) => string;

let host: ComponentType<MinigameHostProps> | null | undefined;
let registry: MinigameRegistry | null | undefined;

function loadHost(): ComponentType<MinigameHostProps> | null {
  if (host === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      host = (require("../../../minigames/host/MinigameHost") as { MinigameHost: ComponentType<MinigameHostProps> }).MinigameHost ?? null;
    } catch (e) {
      console.warn("minigame host unavailable", e);
      host = null;
    }
  }
  return host;
}

export function minigameName(id: MinigameId | string): string {
  if (registry === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      registry = (require("../../../minigames") as { minigames: MinigameRegistry }).minigames ?? null;
    } catch {
      registry = null;
    }
  }
  return tr(registry?.[id as MinigameId]?.meta.name) || String(id);
}

class HostBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: unknown): void {
    console.warn("minigame host crashed", error);
  }
  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function purposeLabel(p: PendingMinigame, t: TFn): string {
  const g = getGame();
  if (p.purpose === "repair") {
    const inst = p.ref > 0 ? findModule(g, p.ref) : null;
    return t("minigame.repair", { what: inst ? itemName(inst.item) : t("goals.hull") });
  }
  if (p.purpose === "failure") return t("minigame.failure", { what: tr(content.failures[g.state.failure?.kind ?? "tumble"]?.name) });
  if (p.purpose === "event") return t("minigame.event", { what: tr(content.events[g.state.events.active?.id ?? ""]?.title) });
  return t(`minigame.${p.purpose}`, { defaultValue: t("minigame.practice") });
}

export const MinigameOverlay = memo(function MinigameOverlay() {
  const t = useT("world") as TFn;
  const theme = useTheme();
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const token = useGame((g) => g.state.minigame?.token ?? 0);

  const done = useCallback((result: MinigameResult) => {
    act((g) => resolveMinigame(g, result));
  }, []);
  const auto = useCallback(() => {
    act((g) => autoResolveMinigame(g));
  }, []);

  const g = getGame();
  const pending = token ? g.state.minigame : null;
  if (!pending) return null;

  const cost = autoResolveCost(g);
  const autoLabel =
    cost.kind === "bots" ? t("minigame.autoBots", { time: fmtTime(cost.seconds ?? 0) }) : cost.kind === "item" && cost.item ? t("minigame.autoItem", { item: itemName(cost.item) }) : t("minigame.autoFree");
  const label = purposeLabel(pending, t);

  const fallback = (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: "#07090F", alignItems: "center", justifyContent: "center", padding: space.lg }]} onStartShouldSetResponder={() => true}>
      <Panel title={label} screws gap={space.md} style={{ alignSelf: "stretch" }}>
        <Txt variant="heading">{t("minigame.brokenTitle")}</Txt>
        <Txt variant="body" color="inkDim">
          {t("minigame.brokenBody")}
        </Txt>
        <Key label={autoLabel} tone="orange" onPress={auto} testID="minigame-auto" />
      </Panel>
    </View>
  );

  const Host = loadHost();
  if (!Host) return fallback;
  return (
    <HostBoundary key={token} fallback={fallback}>
      <Host key={token} game={pending.game} tier={pending.tier} seed={pending.token * 7919 + pending.ref} purposeLabel={label} canAuto autoLabel={autoLabel} theme={theme} reduceMotion={reduceMotion} onDone={done} onAuto={auto} />
    </HostBoundary>
  );
});
