// Story overlay: chapter title cards, story beats with a typewriter reveal, and the ending choice
// of the final chapter followed by its epilogue.
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ackBeat, canChooseEnding, chapterDef, chooseEnding, currentBeat } from "@/engine/meta";
import type { StoryBeat } from "@/engine/types";
import { tr, useT } from "@/i18n";
import { content } from "@/content";
import { haptic, sfx } from "@/platform/feedback";
import { act, getGame, useGame } from "@/store/game";
import { useSettings } from "@/store/settings";
import { Icon, Key, Led, MicroLabel, Panel, Rule, Txt, Well } from "@/ui/kit";
import { fonts } from "@/ui/fonts";
import { palette, space } from "@/ui/theme";

import { useShell } from "../store";

type TFn = (key: string, vars?: Record<string, unknown>) => string;

const SPEAKER_ICON: Record<StoryBeat["speaker"], string> = { kipp: "kipp", signal: "signal", log: "book", narrator: "star", crew: "crew" };
const SCRIM = "rgba(5,6,10,0.84)";
const CHARS_PER_TICK = 2;
const TICK_MS = 34;

/**
 * Reveals `text` a few characters at a time. Returns the visible part and a way to finish at once.
 * The caller remounts (key) per text, so the counter always starts from zero.
 */
function useTypewriter(text: string, enabled: boolean): { shown: string; done: boolean; finish(): void } {
  const [n, setN] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let i = 0;
    timer.current = setInterval(() => {
      i += CHARS_PER_TICK;
      if (i % 6 === 0) sfx("kippBlip", { volume: 0.18, rate: 1.4 });
      setN(i);
      if (i >= text.length && timer.current) clearInterval(timer.current);
    }, TICK_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [text, enabled]);
  const finish = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    setN(text.length);
  }, [text]);
  const done = !enabled || n >= text.length;
  return { shown: done ? text : text.slice(0, n), done, finish };
}

function ChapterCard({ chapter, onContinue }: { chapter: number; onContinue(): void }) {
  const t = useT("story") as TFn;
  const def = chapterDef(getGame(), chapter);
  return (
    <Pressable testID="story-chapter" onPress={onContinue} style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(5,6,10,0.93)", alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md }]} accessibilityRole="button" accessibilityLabel={t("continue")}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={{ width: 28, height: 1, backgroundColor: palette.steel1 }} />
        <Txt variant="label" color={palette.orange} upper>
          {t("chapter", { n: chapter })}
        </Txt>
        <View style={{ width: 28, height: 1, backgroundColor: palette.steel1 }} />
      </View>
      <Txt align="center" style={{ fontFamily: fonts.pixelBold, fontSize: 30, lineHeight: 38, color: palette.bone2 }}>
        {tr(def?.title)}
      </Txt>
      <Txt variant="micro" color={palette.steel3} upper style={{ marginTop: space.xl }}>
        {t("tapToContinue")}
      </Txt>
    </Pressable>
  );
}

function BeatCard({ beat, chapter, index, total, onNext }: { beat: StoryBeat; chapter: number; index: number; total: number; onNext(): void }) {
  const t = useT("story") as TFn;
  const insets = useSafeAreaInsets();
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const text = tr(beat.text, { name: getGame().state.player.name, ship: getGame().state.player.ship, player: getGame().state.player.name });
  const tw = useTypewriter(text, !reduceMotion);
  const tap = useCallback(() => {
    if (!tw.done) {
      tw.finish();
      return;
    }
    haptic("tap");
    sfx("choice");
    onNext();
  }, [tw, onNext]);
  const narrator = beat.speaker === "narrator";
  return (
    <Pressable testID="story-beat" onPress={tap} style={[StyleSheet.absoluteFill, { backgroundColor: SCRIM, justifyContent: "flex-end", padding: space.md, paddingBottom: Math.max(space.md, insets.bottom) + space.sm }]} accessibilityLabel={text}>
      <Panel screws padding={space.md} gap={space.sm}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Icon name={SPEAKER_ICON[beat.speaker]} size={24} chip />
          <View style={{ flex: 1 }}>
            <Txt variant="heading" numberOfLines={1}>
              {t(`speaker.${beat.speaker}`)}
            </Txt>
            <MicroLabel>{t("chapterBeat", { chapter, n: index + 1, total })}</MicroLabel>
          </View>
          <Led state={tw.done ? "blink" : "on"} color={beat.speaker === "signal" ? "cobalt" : "orange"} size={7} />
        </View>
        <Rule />
        <View style={{ minHeight: 96 }}>
          {/* the full text reserves the final height so the card does not grow while typing */}
          <Txt variant="body" style={{ opacity: 0, fontStyle: narrator ? "italic" : "normal" }}>
            {text}
          </Txt>
          <Txt variant="body" style={[StyleSheet.absoluteFill, { fontStyle: narrator ? "italic" : "normal" }]}>
            {tw.shown}
          </Txt>
        </View>
        <Key label={tw.done ? t("continue") : t("skip")} tone={tw.done ? "orange" : "black"} size="sm" onPress={tap} sound={null} testID="story-next" />
      </Panel>
    </Pressable>
  );
}

function EndingChoice({ onLater }: { onLater(): void }) {
  const t = useT("story") as TFn;
  const insets = useSafeAreaInsets();
  const [armed, setArmed] = useState<string | null>(null);
  const [epilogue, setEpilogue] = useState<string | null>(null);
  const pick = (id: string) => {
    if (armed !== id) {
      setArmed(id);
      return;
    }
    // set first: once the ending is chosen the engine no longer asks for it, and the epilogue must stay up
    useShell.setState({ epilogue: true });
    const r = act((g) => chooseEnding(g, id));
    if (r.ok) {
      sfx("chapter");
      haptic("success");
      setEpilogue(id);
    } else {
      useShell.setState({ epilogue: false });
      sfx("deny");
    }
  };
  const chosen = epilogue ? content.endings.find((e) => e.id === epilogue) : undefined;
  return (
    <View testID="story-ending" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(5,6,10,0.93)", paddingTop: insets.top + space.md, paddingBottom: Math.max(space.md, insets.bottom), paddingHorizontal: space.md }]} onStartShouldSetResponder={() => true}>
      <Panel screws padding={space.md} gap={space.sm} style={{ flex: 1 }} title={t(chosen ? "ending.epilogue" : "ending.title")}>
        {chosen ? (
          <>
            <Txt variant="title">{tr(chosen.title)}</Txt>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: space.md }}>
              <Txt variant="body">{tr(chosen.epilogue)}</Txt>
            </ScrollView>
            <Key label={t("ending.backlog")} tone="orange" onPress={onLater} testID="ending-done" />
          </>
        ) : (
          <>
            <Txt variant="body" color="inkDim">
              {t("ending.intro")}
            </Txt>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: space.sm }}>
              {content.endings.map((e) => (
                <Well key={e.id} padding={space.sm} gap={space.xs}>
                  <Txt variant="heading">{tr(e.title)}</Txt>
                  <Txt variant="body">{tr(e.text)}</Txt>
                  <Key label={armed === e.id ? t("ending.confirm") : t("ending.choose")} tone={armed === e.id ? "orange" : "black"} size="sm" onPress={() => pick(e.id)} testID={`ending-${e.id}`} />
                </Well>
              ))}
            </ScrollView>
            <MicroLabel>{t("ending.final")}</MicroLabel>
            <Key label={t("ending.later")} size="sm" onPress={onLater} />
          </>
        )}
      </Panel>
    </View>
  );
}

/** What the story layer wants on screen right now. */
export function useStoryPending(): "beat" | "ending" | null {
  const later = useShell((s) => s.endingLater);
  const epilogue = useShell((s) => s.epilogue);
  const kind = useGame((g) => (g.state.story.pending.length > 0 ? 1 : canChooseEnding(g) ? 2 : 0), undefined, 5);
  return kind === 1 ? "beat" : (kind === 2 && !later) || epilogue ? "ending" : null;
}

export const StoryOverlay = memo(function StoryOverlay({ kind }: { kind: "beat" | "ending" }) {
  const code = useGame((g) => g.state.story.pending[0] ?? -1);
  const [titleSeen, setTitleSeen] = useState(-1);
  const next = useCallback(() => {
    act((g) => ackBeat(g));
  }, []);

  if (code >= 0) {
    const view = currentBeat(getGame());
    if (!view) return null;
    if (view.index === 0 && titleSeen !== view.chapter) {
      return (
        <ChapterCard
          chapter={view.chapter}
          onContinue={() => {
            sfx("choice");
            setTitleSeen(view.chapter);
          }}
        />
      );
    }
    const total = chapterDef(getGame(), view.chapter)?.intro.length ?? 1;
    return <BeatCard key={code} beat={view.beat} chapter={view.chapter} index={view.index} total={total} onNext={next} />;
  }
  if (kind === "ending") return <EndingChoice onLater={() => useShell.setState({ epilogue: false, endingLater: true })} />;
  return null;
});
