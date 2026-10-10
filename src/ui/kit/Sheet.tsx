// Modal surfaces: the bottom sheet (springs up, can be dragged down by its handle) and the
// dialog (title, body, up to four choice keys). Both host their own toast and number-pop layers,
// because a native modal sits above the ones mounted in the app shell.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { useT } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { radius, space } from "@/ui/theme";

import { Icon } from "./Icon";
import { IconKey, Key, type KeyTone } from "./Key";
import { Led } from "./Led";
import { getReduceMotion, springTo, timings } from "./motion";
import { NumberPopHost } from "./NumberPop";
import { Rule, Screw } from "./Panel";
import { MicroLabel, Txt } from "./Txt";
import { ToastHost } from "./Toast";
import { TONE_ACCENT, useTheme, type Tone } from "./theme-context";

/** Keeps the modal mounted until its exit animation has finished. `t` is 0 hidden, 1 shown. */
function useOverlay(visible: boolean, openSpring: "sheet" | "snappy"): { mounted: boolean; t: SharedValue<number> } {
  const [wasVisible, setWasVisible] = useState(visible);
  const [closing, setClosing] = useState(false);
  const t = useSharedValue(0);

  // Derived during render so the modal is still mounted on the very render that hides it.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    setClosing(!visible);
  }

  useEffect(() => {
    if (visible) {
      t.set(springTo(1, openSpring));
      sfx("uiOpen");
    }
  }, [visible, openSpring, t]);

  useEffect(() => {
    if (!closing) return;
    sfx("uiClose");
    t.set(
      withTiming(0, { ...timings.fast, duration: getReduceMotion() ? 0 : 160 }, (finished) => {
        if (finished) scheduleOnRN(setClosing, false);
      }),
    );
  }, [closing, t]);

  return { mounted: visible || closing, t };
}

// ---------------------------------------------------------------------------------------------
// Sheet

export interface SheetProps {
  visible: boolean;
  /** Called on scrim tap, drag-down, the close key and the system back action. */
  onClose: () => void;
  title?: string;
  /** Right end of the title strip (defaults to a close key when `dismissable`). */
  titleRight?: ReactNode;
  /** Pinned under the content: usually a KeyRow. */
  footer?: ReactNode;
  /** False for sheets that need an explicit answer. */
  dismissable?: boolean;
  /** Wrap the content in a ScrollView (off when the content brings its own list). */
  scroll?: boolean;
  /** Share of the window height the sheet may take. */
  maxHeight?: number;
  children?: ReactNode;
  testID?: string;
}

const BLEED = 48; // extends below the screen so the spring overshoot never shows a gap

export function Sheet({ visible, onClose, title, titleRight, footer, dismissable = true, scroll = true, maxHeight = 0.86, children, testID }: SheetProps) {
  const theme = useTheme();
  const t = useT("common");
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const { mounted, t: shown } = useOverlay(visible, "sheet");
  const drag = useSharedValue(0);
  const height = useSharedValue(0);

  useEffect(() => {
    if (visible) drag.set(0);
  }, [visible, drag]);

  const close = useCallback(() => {
    if (dismissable) onClose();
  }, [dismissable, onClose]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(dismissable)
        .activeOffsetY([-8, 8])
        .onUpdate((e) => {
          drag.set(e.translationY > 0 ? e.translationY : e.translationY * 0.12);
        })
        .onEnd((e) => {
          if (drag.value > Math.max(72, height.value * 0.28) || e.velocityY > 900) {
            scheduleOnRN(close);
          } else {
            drag.set(springTo(0, "snappy"));
          }
        }),
    [dismissable, drag, height, close],
  );

  const winH = win.height;
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - shown.value) * (height.value || winH) + drag.value }],
  }));
  const scrimStyle = useAnimatedStyle(() => {
    const h = height.value || winH;
    return { opacity: Math.max(0, Math.min(1, shown.value) * (1 - Math.max(0, drag.value) / h)) };
  });

  if (!mounted) return null;

  const body = scroll ? (
    <ScrollView
      style={styles.sheetScroll}
      contentContainerStyle={styles.sheetContent}
      keyboardShouldPersistTaps="handled"
      indicatorStyle={theme.id === "day" ? "black" : "white"}
      bounces={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.sheetScroll, styles.sheetContent]}>{children}</View>
  );

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={close} supportedOrientations={["portrait"]}>
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }, scrimStyle]}>
          <Pressable style={styles.fill} onPress={close} accessibilityRole="button" accessibilityLabel={t("close")} disabled={!dismissable} />
        </Animated.View>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetDock} pointerEvents="box-none">
          <Animated.View
            testID={testID}
            accessibilityViewIsModal
            onLayout={(e) => {
              height.set(e.nativeEvent.layout.height - BLEED);
            }}
            style={[
              styles.sheet,
              {
                maxHeight: win.height * maxHeight + BLEED,
                backgroundColor: theme.body,
                borderTopColor: theme.bodyHi,
                paddingBottom: Math.max(space.md, insets.bottom) + BLEED,
                marginBottom: -BLEED,
              },
              panelStyle,
            ]}
          >
            <GestureDetector gesture={gesture}>
              <View collapsable={false} style={styles.sheetHead}>
                <View style={[styles.grabber, { backgroundColor: theme.well, borderTopColor: theme.rule, borderBottomColor: theme.bodyHi }]} />
                <Screw angle={31} style={styles.screwL} />
                <Screw angle={-47} style={styles.screwR} />
                {title || titleRight || dismissable ? (
                  <View style={styles.sheetTitle}>
                    {title ? (
                      <Txt variant="heading" numberOfLines={1} style={styles.fillText}>
                        {title}
                      </Txt>
                    ) : (
                      <View style={styles.fill} />
                    )}
                    {titleRight ?? (dismissable ? <IconKey icon="close" size="sm" onPress={onClose} accessibilityLabel={t("close")} sound={null} /> : null)}
                  </View>
                ) : null}
                <Rule />
              </View>
            </GestureDetector>
            {body}
            {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
        <NumberPopHost pool={8} />
        <ToastHost />
      </GestureHandlerRootView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Dialog

export interface DialogChoice {
  label: string;
  /** Second line on the key: a cost, an outcome hint. */
  sublabel?: string;
  icon?: string;
  tone?: KeyTone;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}

export interface DialogProps {
  visible: boolean;
  title: string;
  /** Message text; use `children` for richer content. */
  body?: string;
  /** Icon shown on a dark chip next to the title. */
  icon?: string;
  /** Lights the title LED in that tone. */
  tone?: Tone;
  /** Up to four choices, the primary one first. */
  choices: readonly DialogChoice[];
  /** Scrim tap and system back. Leave undefined for decisions that must be made. */
  onRequestClose?: () => void;
  children?: ReactNode;
  testID?: string;
}

export function Dialog({ visible, title, body, icon, tone, choices, onRequestClose, children, testID }: DialogProps) {
  const theme = useTheme();
  const t = useT("common");
  const win = useWindowDimensions();
  const { mounted, t: shown } = useOverlay(visible, "snappy");

  useEffect(() => {
    if (visible) haptic(tone === "bad" ? "warning" : "tap");
  }, [visible, tone]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, shown.value) }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, shown.value * 1.5),
    transform: [{ translateY: (1 - shown.value) * 12 }, { scale: 0.96 + 0.04 * shown.value }],
  }));

  if (!mounted) return null;

  const shown4 = choices.slice(0, 4);
  // Two short answers sit side by side; anything longer stacks so Czech labels never truncate.
  const sideBySide = shown4.length === 2 && shown4.every((c) => c.label.length <= 9 && !c.sublabel);

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={onRequestClose} supportedOrientations={["portrait"]}>
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }, scrimStyle]}>
          <Pressable style={styles.fill} onPress={onRequestClose} disabled={!onRequestClose} accessibilityRole="button" accessibilityLabel={t("close")} />
        </Animated.View>
        <View style={styles.dialogDock} pointerEvents="box-none">
          <Animated.View
            testID={testID}
            accessibilityViewIsModal
            accessibilityRole="alert"
            style={[
              styles.dialog,
              { width: Math.min(win.width - space.xl * 2, 340), maxHeight: win.height * 0.8, backgroundColor: theme.body, borderTopColor: theme.bodyHi, borderBottomColor: theme.bodyLo },
              cardStyle,
            ]}
          >
            <Screw angle={18} style={styles.dScrewTL} />
            <Screw angle={-64} style={styles.dScrewTR} />
            <Screw angle={52} style={styles.dScrewBL} />
            <Screw angle={-8} style={styles.dScrewBR} />
            <View style={styles.dialogHead}>
              {icon ? <Icon name={icon} size={24} chip /> : <Led state={tone === "bad" ? "blink" : "on"} color={TONE_ACCENT[tone ?? "info"]} size={8} style={styles.dialogLed} />}
              <Txt variant="heading" numberOfLines={2} style={styles.fillText}>
                {title}
              </Txt>
            </View>
            <Rule />
            <ScrollView style={styles.dialogScroll} contentContainerStyle={styles.dialogBody} bounces={false} indicatorStyle={theme.id === "day" ? "black" : "white"}>
              {body ? <Txt variant="body">{body}</Txt> : null}
              {children}
            </ScrollView>
            <View style={sideBySide ? styles.choicesRow : styles.choicesCol}>
              {shown4.map((c, i) => (
                <Key
                  key={i}
                  testID={c.testID}
                  label={c.label}
                  sublabel={c.sublabel}
                  icon={c.icon}
                  tone={c.tone ?? (i === 0 ? "orange" : "black")}
                  disabled={c.disabled}
                  onPress={c.onPress}
                  sound="choice"
                  flex={sideBySide ? 1 : undefined}
                />
              ))}
            </View>
            {shown4.length === 0 ? <MicroLabel align="center">{t("loading")}</MicroLabel> : null}
          </Animated.View>
        </View>
        <NumberPopHost pool={6} />
        <ToastHost />
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fillText: { flex: 1, minWidth: 0 },
  sheetDock: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.panel, borderTopRightRadius: radius.panel, borderTopWidth: 1, paddingHorizontal: space.lg },
  sheetHead: { paddingTop: space.sm, gap: space.sm },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, borderTopWidth: 1, borderBottomWidth: 1 },
  screwL: { position: "absolute", top: 6, left: -10 },
  screwR: { position: "absolute", top: 6, right: -10 },
  sheetTitle: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 40 },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetContent: { paddingVertical: space.md, gap: space.md },
  sheetFooter: { paddingTop: space.sm },
  dialogDock: { flex: 1, alignItems: "center", justifyContent: "center" },
  dialog: { borderRadius: radius.panel, borderTopWidth: 1, borderBottomWidth: 2, padding: space.lg, paddingTop: space.lg + 2, gap: space.md },
  dialogHead: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 28, paddingHorizontal: space.xs },
  dialogLed: { marginHorizontal: 4 },
  dialogScroll: { flexGrow: 0, flexShrink: 1 },
  dialogBody: { gap: space.sm, paddingHorizontal: space.xs },
  choicesRow: { flexDirection: "row", gap: space.sm },
  choicesCol: { gap: space.sm },
  dScrewTL: { position: "absolute", top: 5, left: 5 },
  dScrewTR: { position: "absolute", top: 5, right: 5 },
  dScrewBL: { position: "absolute", bottom: 5, left: 5 },
  dScrewBR: { position: "absolute", bottom: 5, right: 5 },
});
