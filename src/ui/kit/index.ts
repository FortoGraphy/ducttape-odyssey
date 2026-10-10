// Control Deck component library. Screens import everything from "@/ui/kit".
export { ThemeProvider, useTheme, kitThemes, resolveColor, TONE_ACCENT } from "./theme-context";
export type { ThemeName, KitTheme, ColorToken, Accent, Tone, ThemeProviderProps } from "./theme-context";

export { springs, timings, springTo, timingTo, usePressScale, useDriven, useReduceMotion, setReduceMotion, getReduceMotion, reduceMotionFlag, isShared } from "./motion";
export type { SpringName, TimingName, PressScale } from "./motion";

export { Txt, MicroLabel, LINE_HEIGHT } from "./Txt";
export type { TxtProps, MicroLabelProps } from "./Txt";

export { Panel, Well, Rule, Screw, Sticker } from "./Panel";
export type { PanelProps, WellProps, RuleProps, ScrewProps, StickerProps, StickerVariant } from "./Panel";

export { Key, KeyRow, IconKey, TabKeys, KEY_TRAVEL } from "./Key";
export type { KeyProps, KeyRowProps, IconKeyProps, TabKeysProps, TabKeyItem, KeyTone, KeySize } from "./Key";

export { Knob, Fader, Toggle, Segmented } from "./controls";
export type { KnobProps, FaderProps, ToggleProps, SegmentedProps, SegmentedOption } from "./controls";

export { Lcd, LcdNumber, LcdText, LcdMeter } from "./Lcd";
export type { LcdProps, LcdNumberProps, LcdTextProps, LcdMeterProps, LcdSize, LcdTone } from "./Lcd";

export { Led, LedRow } from "./Led";
export type { LedProps, LedRowProps, LedColor, LedState, LedStep } from "./Led";

export { Meter, Gauge, ProgressBar, TimerBar, HEAT_ZONES } from "./meters";
export type { MeterProps, GaugeProps, ProgressBarProps, TimerBarProps, BarTone, BarZone } from "./meters";

export { Icon, hasIcon } from "./Icon";
export type { IconProps } from "./Icon";

export { ListRow, Card, Badge, Chip, QualityPips, CostTag, StatDelta, formatDelta, LIST_ROW_HEIGHT, QUALITY_COLORS } from "./data";
export type { ListRowProps, CardProps, BadgeProps, BadgeTone, ChipProps, QualityPipsProps, CostTagProps, StatDeltaProps } from "./data";

export { Sheet, Dialog } from "./Sheet";
export type { SheetProps, DialogProps, DialogChoice } from "./Sheet";

export { ToastHost, toast, clearToasts } from "./Toast";
export type { ToastHostProps, ToastOptions } from "./Toast";

export { NumberPopHost, popNumber, popNumberAt } from "./NumberPop";
export type { NumberPopHostProps, PopTone } from "./NumberPop";

export { EmptyState, LoadingState, ErrorState } from "./states";
export type { EmptyStateProps, LoadingStateProps, ErrorStateProps } from "./states";

export { Screen, SafeBottom, Row, Col, Spacer, ScrollWell } from "./layout";
export type { ScreenProps, SafeBottomProps, StackProps, SpacerProps, ScrollWellProps } from "./layout";
