// Small shared pieces of the Meta tab: the hold-to-confirm key, the guarded confirm sheet, bullet
// lists, lock teasers and the embedded prestige tree.
import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { content } from "@/content";
import { upgradeBlock, upgradeLevel } from "@/engine/meta";
import type { Game, PrestigeUpgradeDef } from "@/engine/types";
import { useLang, useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { useGame } from "@/store/game";
import { Card, Icon, Key, MicroLabel, Row, Sheet, Txt, useTheme } from "@/ui/kit";

import { NodeSheet } from "./NodeSheet";
import { packViews, Tree, type NodeCode, type TreeNodeDef } from "./Tree";

// ---------------------------------------------------------------------------------------------

export interface HoldKeyProps {
  label: string;
  sublabel?: string;
  icon?: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** Hold time in ms. */
  ms?: number;
  testID?: string;
}

/** A key that only fires after being held down: the bar under the label fills while it is held. */
export function HoldKey({ label, sublabel, icon, onConfirm, disabled, ms = 1100, testID }: HoldKeyProps) {
  const theme = useTheme();
  const p = useSharedValue(0);
  const fill = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  const onIn = useCallback(() => {
    haptic("key");
    sfx("keyDown");
    p.set(
      withTiming(1, { duration: ms, easing: Easing.linear }, (finished) => {
        if (finished) scheduleOnRN(onConfirm);
      }),
    );
  }, [ms, onConfirm, p]);
  const onOut = useCallback(() => {
    if (p.get() < 1) p.set(withTiming(0, { duration: 160 }));
  }, [p]);
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPressIn={onIn}
      onPressOut={onOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={sublabel}
      style={{
        height: 60,
        borderRadius: 7,
        backgroundColor: theme.orange,
        borderBottomWidth: 3,
        borderBottomColor: theme.keyLo,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: theme.red }, fill]} />
      <Row gap="sm">
        {icon ? <Icon name={icon} size={24} chip /> : null}
        <View>
          <Txt variant="key" color="onAccent" upper>
            {label}
          </Txt>
          {sublabel ? (
            <Txt variant="micro" color="onAccent" upper>
              {sublabel}
            </Txt>
          ) : null}
        </View>
      </Row>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------

export interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  holdLabel: string;
  holdHint: string;
  icon: string;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
  testID?: string;
}

/** Second step of every prestige action: a summary and a hold-to-confirm key. */
export function ConfirmSheet({ visible, title, holdLabel, holdHint, icon, onConfirm, onClose, children, testID }: ConfirmSheetProps) {
  const t = useT("meta");
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      testID={testID}
      footer={
        <View style={{ gap: 8 }}>
          <HoldKey testID="hold-confirm" label={holdLabel} sublabel={holdHint} icon={icon} onConfirm={onConfirm} />
          <Key testID="hold-cancel" label={t("confirm.cancel")} size="sm" onPress={onClose} />
        </View>
      }
    >
      {children}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------

/** "a|b|c" from the locale file as a bulleted list. */
export const Bullets = memo(function Bullets({ title, items, icon, tone }: { title: string; items: string; icon: string; tone: "good" | "bad" | "info" }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
      <Row gap="xs">
        <Icon name={icon} size={16} color={tone} />
        <MicroLabel size="label" color={tone}>
          {title}
        </MicroLabel>
      </Row>
      {items.split("|").map((line) => (
        <Txt key={line} variant="label" color="ink" style={{ letterSpacing: 0.2 }}>
          {`· ${line}`}
        </Txt>
      ))}
    </View>
  );
});

/** Lock card for a mechanic that is not open yet: what it is and how to get there. */
export const Teaser = memo(function Teaser({ icon, title, text, how, children }: { icon: string; title: string; text: string; how: string; children?: ReactNode }) {
  const theme = useTheme();
  return (
    <Card>
      <Row gap="md" align="flex-start">
        <View style={{ width: 44, height: 44, borderRadius: 6, borderWidth: 1, borderStyle: "dashed", borderColor: theme.inkDim, alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={24} chip />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Row gap="xs">
            <Icon name="lock" size={16} color="inkDim" />
            <Txt variant="heading" style={{ flex: 1 }}>
              {title}
            </Txt>
          </Row>
          <Txt variant="body" color="inkDim">
            {text}
          </Txt>
        </View>
      </Row>
      <Row gap="xs" align="flex-start">
        <Icon name="info" size={16} color="info" />
        <Txt variant="label" color="info" style={{ flex: 1 }}>
          {how}
        </Txt>
      </Row>
      {children}
    </Card>
  );
});

// ---------------------------------------------------------------------------------------------

function codeOf(reason: ReturnType<typeof upgradeBlock>): NodeCode {
  return reason === null ? "o" : reason === "max" ? "m" : reason === "credits" ? "c" : "r";
}

const BY_LAYER: Record<1 | 2 | 3, PrestigeUpgradeDef[]> = { 1: [], 2: [], 3: [] };
for (const def of Object.values(content.upgrades)) BY_LAYER[def.layer]?.push(def);

/** One of the three prestige trees, laid out to fit the width (they are at most 6 columns wide). */
export function UpgradeTree({ layer }: { layer: 1 | 2 | 3 }) {
  const tr = useTr();
  const lang = useLang();
  const defs = BY_LAYER[layer];
  const [picked, setPicked] = useState<string | null>(null);
  const nodes: TreeNodeDef[] = useMemo(
    () => defs.map((d) => ({ id: d.id, icon: d.icon, name: tr(d.name), x: d.pos.x, y: d.pos.y, requires: d.requires, maxLevel: d.maxLevel })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defs, lang],
  );
  const sig = useGame((g: Game) => packViews(defs.map((d) => ({ level: upgradeLevel(g, d.id), code: codeOf(upgradeBlock(g, d.id)) }))), undefined, 3);
  const onClose = useCallback(() => setPicked(null), []);
  return (
    <>
      <Tree nodes={nodes} sig={sig} onPick={setPicked} cellH={84} />
      <NodeSheet kind="upgrade" id={picked} onClose={onClose} />
    </>
  );
}
