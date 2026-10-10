// Screen scaffolding: flex helpers on the 4 pt grid, safe-area padding and themed scroll wells.
import { type ReactElement, type ReactNode } from "react";
import { FlatList, ScrollView, View, type FlatListProps, type ScrollViewProps, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radius, space } from "@/ui/theme";

import { useTheme } from "./theme-context";

type SpaceKey = keyof typeof space;
type Gap = SpaceKey | number;

function px(v: Gap | undefined): number | undefined {
  return v === undefined ? undefined : typeof v === "number" ? v : space[v];
}

export interface StackProps extends ViewProps {
  gap?: Gap;
  align?: ViewStyle["alignItems"];
  justify?: ViewStyle["justifyContent"];
  /** `true` is flex: 1. */
  flex?: boolean | number;
  wrap?: boolean;
  padding?: Gap;
  children?: ReactNode;
}

function stackStyle(direction: "row" | "column", { gap, align, justify, flex, wrap, padding }: StackProps): ViewStyle {
  return {
    flexDirection: direction,
    gap: px(gap),
    alignItems: align ?? (direction === "row" ? "center" : undefined),
    justifyContent: justify,
    flex: flex === true ? 1 : flex === false ? undefined : flex,
    flexWrap: wrap ? "wrap" : undefined,
    padding: px(padding),
    // Lets text children shrink and ellipsize instead of pushing siblings out of the panel.
    minWidth: flex ? 0 : undefined,
  };
}

/** Horizontal stack, children centered on the cross axis by default. */
export function Row({ gap = "sm", align, justify, flex, wrap, padding, style, children, ...rest }: StackProps) {
  return (
    <View {...rest} style={[stackStyle("row", { gap, align, justify, flex, wrap, padding }), style]}>
      {children}
    </View>
  );
}

/** Vertical stack. */
export function Col({ gap = "sm", align, justify, flex, wrap, padding, style, children, ...rest }: StackProps) {
  return (
    <View {...rest} style={[stackStyle("column", { gap, align, justify, flex, wrap, padding }), style]}>
      {children}
    </View>
  );
}

export interface SpacerProps {
  /** Fixed size on both axes; without it the spacer takes all free space. */
  size?: Gap;
}

export function Spacer({ size }: SpacerProps) {
  const s = px(size);
  return <View pointerEvents="none" style={s === undefined ? { flex: 1 } : { width: s, height: s }} />;
}

export interface SafeBottomProps extends ViewProps {
  /** Padding kept even on devices without a home indicator. */
  min?: number;
  /** Extra padding on top of the inset. */
  extra?: number;
  children?: ReactNode;
}

/** Bottom container that keeps its content clear of the home indicator. */
export function SafeBottom({ min = space.md, extra = 0, style, children, ...rest }: SafeBottomProps) {
  const insets = useSafeAreaInsets();
  return (
    <View {...rest} style={[{ paddingBottom: Math.max(min, insets.bottom) + extra }, style]}>
      {children}
    </View>
  );
}

export interface ScreenProps extends ViewProps {
  /** Which safe-area edges to pad. */
  edges?: readonly ("top" | "bottom")[];
  children?: ReactNode;
}

/** Full-screen dark backdrop with the standard 12 pt outer margin. */
export function Screen({ edges = ["top", "bottom"], style, children, ...rest }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      {...rest}
      style={[
        {
          flex: 1,
          backgroundColor: theme.backdrop,
          paddingHorizontal: space.md,
          paddingTop: edges.includes("top") ? insets.top : 0,
          paddingBottom: edges.includes("bottom") ? insets.bottom : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// ScrollWell

interface ScrollWellBase {
  /** Style of the recessed frame. */
  style?: StyleProp<ViewStyle>;
  /** Padding inside the scrolling content. */
  padding?: number;
  radius?: number;
}

export type ScrollWellProps<T> =
  | (ScrollWellBase & Omit<ScrollViewProps, "style"> & { data?: undefined; children?: ReactNode })
  | (ScrollWellBase & Omit<FlatListProps<T>, "style"> & { data: readonly T[] });

/**
 * Recessed, scrolling list area. Renders a FlatList when `data` is given (pass `renderItem`,
 * `keyExtractor`, ideally `getItemLayout`), otherwise a ScrollView. Scroll indicators follow the
 * panel theme and the content gets the keyboard and bounce settings the game uses everywhere.
 */
export function ScrollWell<T>(props: ScrollWellProps<T>): ReactElement {
  const theme = useTheme();
  const { style, padding = space.xs, radius: r = radius.well } = props;
  const frame: ViewStyle = {
    backgroundColor: theme.well,
    borderRadius: r,
    borderTopWidth: 1,
    borderTopColor: theme.rule,
    borderBottomWidth: 1,
    borderBottomColor: theme.bodyHi,
    overflow: "hidden",
    flexShrink: 1,
  };
  const indicatorStyle = theme.id === "day" ? "black" : "white";

  if (props.data !== undefined) {
    const { style: _s, padding: _p, radius: _r, contentContainerStyle, ...list } = props;
    return (
      <View style={[frame, style]}>
        <FlatList
          indicatorStyle={indicatorStyle}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          {...list}
          contentContainerStyle={[{ padding }, contentContainerStyle]}
        />
      </View>
    );
  }
  const { style: _s, padding: _p, radius: _r, data: _d, contentContainerStyle, children, ...scroll } = props;
  return (
    <View style={[frame, style]}>
      <ScrollView indicatorStyle={indicatorStyle} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator {...scroll} contentContainerStyle={[{ padding }, contentContainerStyle]}>
        {children}
      </ScrollView>
    </View>
  );
}
