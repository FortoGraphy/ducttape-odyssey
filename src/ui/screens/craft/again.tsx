// "Make it again": the last three recipes that finished, one tap to queue each on repeat.
// The engine keeps no history, so the list is collected from craftDone events while the app runs
// and topped up from the per-recipe counters after a cold start.
import { memo, useSyncExternalStore } from "react";
import { View } from "react-native";

import { content } from "@/content";
import { queueCraft } from "@/engine/core";
import type { Game, RecipeId } from "@/engine/types";
import { useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { act, getGame, onEngineEvent, useGame } from "@/store/game";
import { Key, KeyRow, MicroLabel, toast } from "@/ui/kit";
import { space } from "@/ui/theme";

import { primaryOf } from "./model";

const MAX = 3;
let recent: readonly RecipeId[] = [];
const listeners = new Set<() => void>();

onEngineEvent((ev) => {
  if (ev.t !== "craftDone" || recent[0] === ev.recipe) return;
  recent = [ev.recipe, ...recent.filter((r) => r !== ev.recipe)].slice(0, MAX);
  listeners.forEach((l) => l());
});

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function withHistory(g: Game, live: readonly RecipeId[]): RecipeId[] {
  const out = live.filter((r) => g.state.recipes[r] === 1 && content.recipes[r]);
  if (out.length >= MAX) return out.slice(0, MAX);
  const made: [RecipeId, number][] = [];
  for (const id in g.state.recipes) {
    const n = g.state.stats[`made_${id}`] ?? 0;
    if (n > 0 && out.indexOf(id) < 0 && content.recipes[id]) made.push([id, n]);
  }
  made.sort((a, b) => b[1] - a[1]);
  for (const [id] of made) {
    if (out.length >= MAX) break;
    out.push(id);
  }
  return out;
}

/** Queues a recipe and gives the feedback every queue key shares. Returns true on success. */
export function enqueue(recipe: RecipeId, batches: number, t: (key: string, vars?: Record<string, unknown>) => string, name: string): boolean {
  const res = act((g) => queueCraft(g, recipe, batches));
  if (res.ok) {
    sfx("craftStart");
    haptic("success");
    toast(batches === -1 ? t("toast.queuedRepeat", { name }) : t("toast.queued", { name, count: batches }), { tone: "good", icon: "queue" });
    return true;
  }
  sfx("deny");
  haptic("warning");
  toast(t(res.reason === "max" ? "fail.max" : res.reason === "locked" ? "fail.locked" : "fail.invalid"), "warn");
  return false;
}

export const AgainStrip = memo(function AgainStrip() {
  const t = useT("craft");
  const tr = useTr();
  const live = useSyncExternalStore(subscribe, () => recent, () => recent);
  // re-render when something finished, so the counters can fill the list after a cold start
  useGame((g) => g.state.stats.crafts ?? 0, Object.is, 10);
  const list = withHistory(getGame(), live);
  if (list.length === 0) return null;
  return (
    <View style={{ gap: space.xs, paddingTop: space.sm }}>
      <MicroLabel size="label">{t("again.title")}</MicroLabel>
      <KeyRow gap={space.xs}>
        {list.map((id) => {
          const item = primaryOf(content.recipes[id]);
          const name = tr(content.items[item]?.name);
          return <Key key={id} testID={`again-${id}`} size="sm" icon={item} label={name} accessibilityLabel={t("again.a11y", { name })} sound={null} onPress={() => enqueue(id, -1, t, name)} />;
        })}
      </KeyRow>
    </View>
  );
});
