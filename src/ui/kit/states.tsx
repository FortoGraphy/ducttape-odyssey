// Placeholder states every list and async surface needs: nothing here, working on it, it broke.
import { memo, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { useT } from "@/i18n";
import { space } from "@/ui/theme";

import { Icon } from "./Icon";
import { Key } from "./Key";
import { Led, LedRow } from "./Led";
import { MicroLabel, Txt } from "./Txt";
import { useTheme } from "./theme-context";

interface StateFrameProps {
  children: ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

function StateFrame({ children, compact, style }: StateFrameProps) {
  return <View style={[{ alignItems: "center", justifyContent: "center", gap: space.sm, paddingVertical: compact ? space.md : space.xl, paddingHorizontal: space.lg }, style]}>{children}</View>;
}

export interface EmptyStateProps {
  /** Defaults to the localized "nothing here" line. */
  title?: string;
  hint?: string;
  icon?: string;
  /** Optional way out ("Go scavenge"). */
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const EmptyState = memo(function EmptyState({ title, hint, icon = "missing", actionLabel, onAction, compact, style }: EmptyStateProps) {
  const t = useT("common");
  const theme = useTheme();
  return (
    <StateFrame compact={compact} style={style}>
      <View style={{ width: 48, height: 48, borderRadius: 6, borderWidth: 1, borderStyle: "dashed", borderColor: theme.inkDim, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={24} color="inkDim" />
      </View>
      <Txt variant="heading" align="center">
        {title ?? t("state.emptyTitle")}
      </Txt>
      <Txt variant="body" color="inkDim" align="center">
        {hint ?? t("state.emptyHint")}
      </Txt>
      {actionLabel && onAction ? <Key label={actionLabel} tone="cobalt" size="sm" onPress={onAction} style={{ marginTop: space.xs }} /> : null}
    </StateFrame>
  );
});

export interface LoadingStateProps {
  /** Defaults to the localized "loading" line. */
  label?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const LoadingState = memo(function LoadingState({ label, compact, style }: LoadingStateProps) {
  const t = useT("common");
  return (
    <StateFrame compact={compact} style={style}>
      <LedRow steps={8} chase color="orange" fill={false} gap={6} />
      <MicroLabel size="label" align="center" accessibilityLiveRegion="polite">
        {label ?? t("loading")}
      </MicroLabel>
    </StateFrame>
  );
});

export interface ErrorStateProps {
  title?: string;
  /** What went wrong, in words the player can act on. */
  message?: string;
  /** Technical detail (an error code), printed small. */
  detail?: string;
  retryLabel?: string;
  onRetry?: () => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const ErrorState = memo(function ErrorState({ title, message, detail, retryLabel, onRetry, compact, style }: ErrorStateProps) {
  const t = useT("common");
  return (
    <StateFrame compact={compact} style={style}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Led state="blink" color="red" size={8} />
        <Txt variant="heading" align="center" accessibilityRole="alert">
          {title ?? t("state.errorTitle")}
        </Txt>
      </View>
      <Txt variant="body" color="inkDim" align="center">
        {message ?? t("state.errorHint")}
      </Txt>
      {detail ? <MicroLabel align="center">{detail}</MicroLabel> : null}
      {onRetry ? <Key label={retryLabel ?? t("retry")} tone="orange" size="sm" onPress={onRetry} style={{ marginTop: space.xs }} /> : null}
    </StateFrame>
  );
});
