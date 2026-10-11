// Mounts the active tab's screen. Every screen is loaded with a guarded lazy require and rendered
// inside its own error boundary, so a missing or crashing tab shows a designed "module offline"
// plate while the rest of the game keeps running.
import { Component, memo, useState, type ComponentType, type ReactNode } from "react";
import { View } from "react-native";

import { useT } from "@/i18n";
import type { TabId } from "@/store/ui";
import { Icon, Key, Lcd, LcdText, Led, MicroLabel, Screw, Txt, Well } from "@/ui/kit";
import { space } from "@/ui/theme";

type Screen = ComponentType<object>;
type Loader = () => Screen | null;

const pick = (mod: unknown): Screen | null => {
  const c = (mod as { default?: unknown } | undefined)?.default;
  return typeof c === "function" || (typeof c === "object" && c !== null) ? (c as Screen) : null;
};

// Literal paths inside try/catch: Metro treats them as optional dependencies, so a tab that does
// not exist yet (or throws while its module evaluates) cannot break the bundle or the boot.
/* eslint-disable @typescript-eslint/no-require-imports */
const LOADERS: Record<TabId, Loader> = {
  ship: () => {
    try {
      return pick(require("../screens/ship"));
    } catch (e) {
      console.warn("tab ship failed to load", e);
      return null;
    }
  },
  craft: () => {
    try {
      return pick(require("../screens/craft"));
    } catch (e) {
      console.warn("tab craft failed to load", e);
      return null;
    }
  },
  grid: () => {
    try {
      return pick(require("../screens/grid"));
    } catch (e) {
      console.warn("tab grid failed to load", e);
      return null;
    }
  },
  nav: () => {
    try {
      return pick(require("../screens/nav"));
    } catch (e) {
      console.warn("tab nav failed to load", e);
      return null;
    }
  },
  crew: () => {
    try {
      return pick(require("../screens/crew"));
    } catch (e) {
      console.warn("tab crew failed to load", e);
      return null;
    }
  },
  meta: () => {
    try {
      return pick(require("../screens/meta"));
    } catch (e) {
      console.warn("tab meta failed to load", e);
      return null;
    }
  },
  log: () => {
    try {
      return pick(require("../screens/log"));
    } catch (e) {
      console.warn("tab log failed to load", e);
      return null;
    }
  },
  settings: () => {
    try {
      return pick(require("../screens/settings"));
    } catch (e) {
      console.warn("tab settings failed to load", e);
      return null;
    }
  },
};
/* eslint-enable @typescript-eslint/no-require-imports */

const cache: Partial<Record<TabId, Screen | null>> = {};
let forceOffline = false;

/** Debug: pretend every tab screen is missing (proves the shell stands on its own). */
export function setTabsOffline(off: boolean): void {
  forceOffline = off;
}

function resolve(tab: TabId): Screen | null {
  if (forceOffline) return null;
  if (!(tab in cache)) cache[tab] = LOADERS[tab]();
  return cache[tab] ?? null;
}

export const ModuleOffline = memo(function ModuleOffline({ tab, crashed, onRetry }: { tab: TabId; crashed: boolean; onRetry?: () => void }) {
  const t = useT("world");
  return (
    <View style={{ flex: 1, padding: space.sm }}>
      <Well padding={space.md} gap={space.sm} style={{ flex: 1, justifyContent: "center" }}>
        <Screw angle={24} style={{ position: "absolute", top: 6, left: 6 }} />
        <Screw angle={-51} style={{ position: "absolute", top: 6, right: 6 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Icon name={`tab_${tab}`} size={24} chip />
          <View style={{ flex: 1 }}>
            <MicroLabel>{t("offlineModule.kicker", { tab: t(`tabs.${tab}`) })}</MicroLabel>
            <Txt variant="heading" numberOfLines={1}>
              {t(crashed ? "offlineModule.crashed" : "offlineModule.title")}
            </Txt>
          </View>
          <Led state="blink" color={crashed ? "red" : "yellow"} size={8} />
        </View>
        <Lcd padding={6}>
          <LcdText size="s" tone="warn" marquee>
            {t(crashed ? "offlineModule.lcdCrashed" : "offlineModule.lcd")}
          </LcdText>
        </Lcd>
        <Txt variant="body" color="inkDim" numberOfLines={3}>
          {t(crashed ? "offlineModule.bodyCrashed" : "offlineModule.body")}
        </Txt>
        {onRetry ? <Key label={t("offlineModule.retry")} icon="repair" size="sm" onPress={onRetry} /> : null}
      </Well>
    </View>
  );
});

class TabBoundary extends Component<{ tab: TabId; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: unknown): void {
    console.warn(`tab ${this.props.tab} crashed`, error);
  }
  render(): ReactNode {
    if (this.state.failed) return <ModuleOffline tab={this.props.tab} crashed onRetry={() => this.setState({ failed: false })} />;
    return this.props.children;
  }
}

/** Only the active tab is mounted: hidden tabs would keep evaluating their 10 Hz selectors. */
export const TabHost = memo(function TabHost({ tab }: { tab: TabId }) {
  const [attempt, setAttempt] = useState(0);
  const Screen = resolve(tab);
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      {Screen ? (
        <TabBoundary key={`${tab}:${attempt}`} tab={tab}>
          <Screen />
        </TabBoundary>
      ) : (
        <ModuleOffline
          tab={tab}
          crashed={false}
          onRetry={() => {
            delete cache[tab];
            setAttempt((n) => n + 1);
          }}
        />
      )}
    </View>
  );
});
