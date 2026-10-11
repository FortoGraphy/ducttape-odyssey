// Small presentational pieces shared by the craft and grid screens.
import { memo, useEffect, type ReactNode } from "react";
import { Image, Platform, View, type ImageSourcePropType, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";
import { Easing, ReduceMotion, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

import { content } from "@/content";
import type { Effect, Game } from "@/engine/types";
import { useT, useTr } from "@/i18n";
import { onPulse, getGame } from "@/store/game";
import { icons } from "@/ui/icons.generated";
import { Icon, Key, MicroLabel, Row, StatDelta, Txt, useTheme } from "@/ui/kit";
import { space } from "@/ui/theme";

import { effectDelta, effectInvert } from "./model";

const PIXELATED = Platform.OS === "web" ? ({ imageRendering: "pixelated" } as unknown as ImageStyle) : null;

/** Item art as a flat silhouette on a dark chip: recipes the player has not learned yet. */
export const Silhouette = memo(function Silhouette({ name, size = 24 }: { name: string; size?: number }) {
  const theme = useTheme();
  const source = (icons as Record<string, ImageSourcePropType>)[name];
  const pad = size >= 24 ? 6 : 4;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ width: size + pad * 2, height: size + pad * 2, borderRadius: 5, backgroundColor: theme.bezel, borderTopWidth: 1, borderTopColor: theme.keyLo, borderBottomWidth: 1, borderBottomColor: theme.bodyHi, alignItems: "center", justifyContent: "center" }}
    >
      {source ? <Image source={source} tintColor={theme.keyHi} style={[{ width: size, height: size }, PIXELATED]} resizeMode="contain" fadeDuration={0} /> : <Icon name="question" size={size} />}
    </View>
  );
});

export function SectionLabel({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <Row justify="space-between" style={{ minHeight: 16 }}>
      <MicroLabel size="label">{children}</MicroLabel>
      {right}
    </Row>
  );
}

export interface LockCardProps {
  icon?: string;
  title: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Dashed plate for something the player cannot use yet: says what it is and what opens it. */
export function LockCard({ icon = "lock", title, hint, actionLabel, onAction, compact, style }: LockCardProps) {
  const theme = useTheme();
  return (
    <View style={[{ borderWidth: 1, borderStyle: "dashed", borderColor: theme.inkDim, borderRadius: 6, padding: compact ? space.sm : space.md, gap: space.sm }, style]}>
      <Row gap="sm" align="flex-start">
        <Icon name={icon} size={24} chip />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Row gap="xs">
            <Icon name="lock" size={16} color="inkDim" />
            <Txt variant="bodyBold" numberOfLines={1} style={{ flex: 1 }}>
              {title}
            </Txt>
          </Row>
          <Txt variant="body" color="inkDim">
            {hint}
          </Txt>
        </View>
      </Row>
      {actionLabel && onAction ? <Key label={actionLabel} tone="cobalt" size="sm" onPress={onAction} /> : null}
    </View>
  );
}

/** One effect as "Mining ........ +25 %", colored by whether the direction is good. */
export const EffectLine = memo(function EffectLine({ effect, factor = 1, dim }: { effect: Effect; factor?: number; dim?: boolean }) {
  const t = useT("grid");
  const tr = useTr();
  const label = effect.stat ? t(`stat.${effect.stat}`) : effect.deck ? t("stat.deckOutput", { deck: tr(content.decks[effect.deck]?.name) }) : "";
  return (
    <Row justify="space-between" gap="sm" style={{ minHeight: 20, opacity: dim ? 0.5 : 1 }}>
      <Txt variant="body" numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </Txt>
      <StatDelta value={effectDelta(effect, factor)} invert={effectInvert(effect)} />
    </Row>
  );
});

/** Label + value on one line, for the fact tables in sheets. */
export function Fact({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Row justify="space-between" gap="sm" style={{ minHeight: 20 }}>
      <Txt variant="body" color="inkDim" numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </Txt>
      <Txt variant="bodyBold" color={color} numberOfLines={1} tabular>
        {value}
      </Txt>
    </Row>
  );
}

/**
 * Shared value that follows a number read from the game on every pulse without re-rendering.
 * Forward steps glide over one pulse; a drop (a new batch starting) cuts back at once.
 */
export function usePulseValue(read: (g: Game) => number): SharedValue<number> {
  const v = useSharedValue(read(getGame()));
  useEffect(() => {
    let last = -1;
    const update = () => {
      const next = read(getGame());
      if (next === last) return;
      if (next < last) v.set(next);
      else v.set(withTiming(next, { duration: 110, easing: Easing.linear, reduceMotion: ReduceMotion.Never }));
      last = next;
    };
    update();
    return onPulse(update);
    // `read` is recreated every render on purpose; the subscription only needs the latest closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return v;
}
