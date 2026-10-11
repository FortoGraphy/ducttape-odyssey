// Small building blocks shared by the settings and log screens: a labelled setting row, a themed
// text field (the kit has no text input) and a hold-to-confirm key for destructive actions.
import { memo, useCallback, useEffect, useRef, type ReactNode } from "react";
import { Pressable, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { haptic, sfx } from "@/platform/feedback";
import { fonts } from "@/ui/fonts";
import { Col, Icon, MicroLabel, Row, Txt, useTheme } from "@/ui/kit";
import { HIT, radius, space } from "@/ui/theme";

export interface SettingRowProps {
  icon?: string;
  title: string;
  hint?: string;
  /** Control on the right end (a toggle, a small key). */
  right?: ReactNode;
  /** Wide control placed under the title (a segmented switch, a fader). */
  children?: ReactNode;
  tone?: "ink" | "bad" | "warn";
  testID?: string;
}

export const SettingRow = memo(function SettingRow({ icon, title, hint, right, children, tone = "ink", testID }: SettingRowProps) {
  return (
    <Col gap="xs" style={{ paddingVertical: space.xs }} testID={testID}>
      <Row gap="sm" style={{ minHeight: HIT }}>
        {icon ? <Icon name={icon} size={24} chip /> : null}
        <Col gap={0} flex>
          <Txt variant="bodyBold" color={tone} numberOfLines={2}>
            {title}
          </Txt>
          {hint ? (
            <Txt variant="label" color="inkDim" style={{ lineHeight: 14 }}>
              {hint}
            </Txt>
          ) : null}
        </Col>
        {right}
      </Row>
      {children}
    </Col>
  );
});

export interface FieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  /** Fixed height for multi-line fields. */
  height?: number;
  numeric?: boolean;
  autoFocus?: boolean;
  onSubmit?: () => void;
  accessibilityLabel: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function Field({ value, onChangeText, placeholder, maxLength, multiline, height, numeric, autoFocus, onSubmit, accessibilityLabel, testID, style }: FieldProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.well,
          borderRadius: radius.well,
          borderTopWidth: 1,
          borderTopColor: theme.rule,
          borderBottomWidth: 1,
          borderBottomColor: theme.bodyHi,
          minHeight: HIT,
          height: multiline ? (height ?? 88) : undefined,
          justifyContent: "center",
        },
        style,
      ]}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.inkDim}
        maxLength={maxLength}
        multiline={multiline}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        keyboardType={numeric ? "number-pad" : "default"}
        returnKeyType={multiline ? "default" : "done"}
        onSubmitEditing={onSubmit}
        maxFontSizeMultiplier={1.15}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        style={{
          flex: multiline ? 1 : undefined,
          fontFamily: fonts.mono,
          fontSize: 13,
          color: theme.ink,
          paddingHorizontal: space.sm,
          paddingVertical: space.sm,
          textAlignVertical: multiline ? "top" : "center",
          ...({ outlineStyle: "none" } as object),
        }}
      />
    </View>
  );
}

export interface HoldKeyProps {
  label: string;
  /** Printed under the label while idle ("hold for 2 s"). */
  sublabel?: string;
  holdMs?: number;
  onConfirm: () => void;
  disabled?: boolean;
  testID?: string;
}

/** Destructive key: nothing happens on a tap, the action fires only after a full hold. */
export function HoldKey({ label, sublabel, holdMs = 1500, onConfirm, disabled, testID }: HoldKeyProps) {
  const theme = useTheme();
  const fill = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    fill.set(withTiming(0, { duration: 160 }));
  }, [fill]);

  useEffect(() => cancel, [cancel]);

  const start = useCallback(() => {
    if (disabled) return;
    haptic("key");
    sfx("keyDown");
    fill.set(withTiming(1, { duration: holdMs, easing: Easing.linear }));
    timer.current = setTimeout(() => {
      timer.current = null;
      fill.set(0);
      haptic("heavy");
      onConfirm();
    }, holdMs);
  }, [disabled, fill, holdMs, onConfirm]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.get() * 100}%` }));

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={sublabel}
      testID={testID}
      style={{
        height: 52,
        borderRadius: radius.key,
        backgroundColor: theme.key,
        borderBottomWidth: 3,
        borderBottomColor: theme.keyLo,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Animated.View style={[{ position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: theme.red }, fillStyle]} />
      <Txt variant="key" color="keyText" upper>
        {label}
      </Txt>
      {sublabel ? <MicroLabel color="keyText">{sublabel}</MicroLabel> : null}
    </Pressable>
  );
}

/** Mono text in a recessed box: codes, error traces, technical values. */
export function CodeBox({ children, lines = 3, testID }: { children: string; lines?: number; testID?: string }) {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: theme.lcdBg, borderRadius: radius.lcd, padding: space.sm }}>
      <Txt variant="label" color="lcdOn" numberOfLines={lines} selectable testID={testID} style={{ lineHeight: 14 }}>
        {children}
      </Txt>
    </View>
  );
}

export function KeyValue({ label, value, tone, testID }: { label: string; value: string; tone?: "ink" | "good" | "bad" | "warn"; testID?: string }) {
  return (
    <Row justify="space-between" gap="md" style={{ minHeight: 22 }}>
      <MicroLabel size="label">{label}</MicroLabel>
      <Txt variant="bodyBold" color={tone ?? "ink"} numberOfLines={1} testID={testID} style={{ flexShrink: 1 }}>
        {value}
      </Txt>
    </Row>
  );
}
