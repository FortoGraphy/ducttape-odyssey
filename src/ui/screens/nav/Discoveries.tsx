// Discoveries made in the current system (with renaming), the galaxy's outposts and their
// yields, and the way into the full codex in the Log tab.
import { useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";

import { content } from "@/content";
import * as B from "@/engine/big";
import { CODEX_NAME_MAX, renameCodex } from "@/engine/meta";
import { currentSystem, faunaKey, floraKey, isScanned, speciesName } from "@/engine/world";
import { useT } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { act, getGame, useGame } from "@/store/game";
import { goTo } from "@/store/ui";
import { fmtRate, itemName } from "@/ui/format";
import { EmptyState, Icon, IconKey, Key, KeyRow, MicroLabel, Row, Rule, toast, Txt, useTheme } from "@/ui/kit";
import { radius, space, type } from "@/ui/theme";

import { PlanetDisc } from "./SystemView";
import { useNavUi } from "./state";

function Entry({ codexKey, fallback, kind, left }: { codexKey: string; fallback: string; kind: string; left: React.ReactNode }) {
  const t = useT("nav");
  const open = useNavUi((s) => s.open);
  const name = useGame((g) => g.state.codex[codexKey]?.name ?? "", Object.is, 3);
  return (
    <View style={styles.entry} testID={`codex-${codexKey}`}>
      {left}
      <View style={styles.fill}>
        <Txt variant="label" numberOfLines={1}>
          {name || fallback}
        </Txt>
        <MicroLabel numberOfLines={1}>{name ? `${kind} · ${fallback}` : kind}</MicroLabel>
      </View>
      <IconKey icon="rename" size="sm" accessibilityLabel={t("rename.title")} onPress={() => open({ kind: "rename", key: codexKey, fallback })} />
    </View>
  );
}

export function Discoveries() {
  const t = useT("nav");
  const sig = useGame(
    (g) => {
      const sys = currentSystem(g);
      let s = sys.id + "|" + g.state.outposts.length + "|" + (g.state.stats.renames ?? 0) + "|" + (g.state.features.codex ? 1 : 0) + "|" + g.rev;
      for (let i = 0; i < sys.planets.length; i++) s += isScanned(g, sys.planets[i].id) ? "1" : "0";
      return s;
    },
    Object.is,
    5,
  );
  void sig;
  const g = getGame();
  const sys = currentSystem(g);
  const scanned = sys.planets.filter((p) => isScanned(g, p.id));
  const outpostMax = (content.balance.outpostMax as number) ?? 12;

  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
      <Rule label={t("codex.here")} />
      {g.state.codex["system:" + sys.id] ? <Entry codexKey={"system:" + sys.id} fallback={sys.name} kind={t(`star.${sys.star}`)} left={<Icon name={`star_${sys.star}`} size={16} chip />} /> : null}
      {scanned.length === 0 ? <EmptyState compact icon="scan" title={t("codex.emptyTitle")} hint={t("codex.emptyHint")} /> : null}
      {scanned.map((p) => (
        <View key={p.id}>
          <Entry codexKey={"planet:" + p.id} fallback={p.name} kind={t("codex.planet")} left={<PlanetDisc planet={p} size={24} />} />
          {Array.from({ length: p.fauna }, (_, i) => (
            <Entry key={"a" + i} codexKey={faunaKey(p.id, i)} fallback={speciesName(content, p.seed, "fauna", i)} kind={t("planet.fauna")} left={<Icon name="ev_fauna" size={16} chip style={styles.indent} />} />
          ))}
          {Array.from({ length: p.flora }, (_, i) => (
            <Entry key={"o" + i} codexKey={floraKey(p.id, i)} fallback={speciesName(content, p.seed, "flora", i)} kind={t("planet.flora")} left={<Icon name="deck_greenhouse" size={16} chip style={styles.indent} />} />
          ))}
        </View>
      ))}

      <Rule label={t("codex.outposts", { n: g.state.outposts.length, max: outpostMax })} />
      {g.state.features.outposts !== 1 ? (
        <Txt variant="label" color="inkDim">
          {t("codex.outpostsLocked")}
        </Txt>
      ) : g.state.outposts.length === 0 ? (
        <Txt variant="label" color="inkDim">
          {t("codex.outpostsEmpty")}
        </Txt>
      ) : (
        g.state.outposts.map((o) => (
          <Row key={o.planet} align="center" style={styles.entry}>
            <Icon name={o.item} size={16} chip />
            <View style={styles.fill}>
              <Txt variant="label" numberOfLines={1}>
                {g.state.codex["planet:" + o.planet]?.name ?? o.name}
              </Txt>
              <MicroLabel>{itemName(o.item)}</MicroLabel>
            </View>
            <Txt variant="label" color="good">
              +{fmtRate(B.mulN(g.rates.mine, o.rate * g.mods.outpostYield))}
            </Txt>
          </Row>
        ))
      )}
      {g.state.features.codex === 1 ? <Key testID="codex-full" label={t("codex.full")} icon="book" tone="cobalt" size="sm" onPress={() => goTo("log", "codex")} /> : null}
    </ScrollView>
  );
}

// ---------- rename --------------------------------------------------------------------

export function RenameSheet({ codexKey, fallback }: { codexKey: string; fallback: string }) {
  const t = useT("nav");
  const theme = useTheme();
  const { sheets, back, close } = useNavUi();
  const [text, setText] = useState(() => getGame().state.codex[codexKey]?.name ?? fallback);
  const leave = (): void => (sheets.length > 1 ? back() : close());

  const save = (value: string): void => {
    const r = act((g) => renameCodex(g, codexKey, value));
    if (r.ok) {
      sfx("success");
      haptic("success");
      toast(value.trim() === "" ? t("rename.restored", { name: fallback }) : t("rename.saved", { name: getGame().state.codex[codexKey]?.name ?? value }), "good");
      leave();
    } else {
      sfx("deny");
      toast(t("rename.invalid"), "warn");
    }
  };

  return (
    <View style={styles.rename}>
      <Txt variant="label" color="inkDim">
        {t("rename.hint", { name: fallback })}
      </Txt>
      <View style={[styles.inputWrap, { backgroundColor: theme.lcdBg, borderColor: theme.bezel }]}>
        <TextInput
          testID="rename-input"
          value={text}
          onChangeText={setText}
          maxLength={CODEX_NAME_MAX}
          autoFocus
          autoCorrect={false}
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={() => save(text)}
          placeholder={fallback}
          placeholderTextColor={theme.lcdDim}
          accessibilityLabel={t("rename.title")}
          style={[type.bodyBold, styles.input, { color: theme.lcdOn }]}
        />
        <MicroLabel color="lcdOn">{`${Array.from(text).length}/${CODEX_NAME_MAX}`}</MicroLabel>
      </View>
      <KeyRow>
        <Key testID="rename-reset" label={t("rename.reset")} tone="black" onPress={() => save("")} sound={null} />
        <Key testID="rename-save" label={t("rename.save")} tone="orange" disabled={text.trim() === ""} onPress={() => save(text)} sound={null} />
      </KeyRow>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  list: { gap: space.xs, paddingBottom: space.sm },
  entry: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44 },
  indent: { marginLeft: space.md },
  rename: { gap: space.md },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.lcd, borderWidth: 2, paddingHorizontal: space.md, minHeight: 48 },
  input: { flex: 1, minWidth: 0, paddingVertical: space.sm },
});
