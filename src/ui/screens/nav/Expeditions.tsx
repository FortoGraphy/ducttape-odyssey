// Expeditions: the list of away teams (running with countdowns, returned with a claim key),
// the planning sheet (length, crew, risk and expected finds) and the result card.
import { memo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { content } from "@/content";
import * as B from "@/engine/big";
import {
  claimExpedition,
  currentSystem,
  expeditionKind,
  expeditionOutcome,
  expeditionSeconds,
  findCrew,
  findPlanet,
  isInjured,
  isScanned,
  previewExpedition,
  startExpedition,
  type ExpeditionKind,
} from "@/engine/world";
import { useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { act, getGame, useGame } from "@/store/game";
import { Portrait } from "@/ui/common/Portrait";
import { fmt, fmtPct, fmtTime, itemName } from "@/ui/format";
import { Badge, Chip, CostTag, EmptyState, Icon, Key, KeyRow, Led, Meter, MicroLabel, Row, Rule, TimerBar, toast, Txt, useTheme, Well } from "@/ui/kit";
import { radius, space } from "@/ui/theme";

import { EXPEDITION_FINDS, planetName, useNavUi, useSmooth } from "./state";
import { LockCard } from "./SystemView";

const KINDS: ExpeditionKind[] = ["short", "medium", "long"];
const MAX_PARTY = 3;

// ---------- list ----------------------------------------------------------------------

const ExpeditionRow = memo(function ExpeditionRow({ uid }: { uid: number }) {
  const t = useT("nav");
  const theme = useTheme();
  const open = useNavUi((s) => s.open);
  const setResult = useNavUi((s) => s.setResult);
  const v = useGame(
    (g) => {
      const e = g.state.expeditions.find((x) => x.uid === uid);
      if (!e) return { ok: false, done: false, left: 0, frac: 0 };
      const total = Math.max(1, e.end - e.start);
      const left = Math.max(0, Math.ceil(e.end - g.state.t));
      return { ok: true, done: e.done, left, frac: Math.min(1, left / total) };
    },
    undefined,
    5,
  );
  const remaining = useSmooth(v.frac, 600);
  const g = getGame();
  const e = g.state.expeditions.find((x) => x.uid === uid);
  if (!e || !v.ok) return null;

  const onClaim = (): void => {
    const gm = getGame();
    const exp = gm.state.expeditions.find((x) => x.uid === uid);
    if (!exp) return;
    const outcome = expeditionOutcome(gm, exp);
    const before = outcome.items.map((it) => B.clone(gm.state.inv[it.item] ?? B.ZERO));
    const credits = B.clone(gm.state.credits);
    const hurt = outcome.injured ? findCrew(gm, outcome.injured) : null;
    const r = act((x) => claimExpedition(x, uid));
    if (!r.ok) {
      sfx("deny");
      return;
    }
    sfx(outcome.lost ? "fail" : "collect");
    haptic(outcome.lost ? "warning" : "success");
    setResult({
      outcome,
      planetName: exp.planetName,
      items: outcome.items.map((it, i) => ({ item: it.item, amount: B.subClamp(gm.state.inv[it.item] ?? B.ZERO, before[i]) })),
      credits: B.subClamp(gm.state.credits, credits),
      injuredName: hurt?.name ?? "",
      injuredSeed: hurt?.seed ?? 0,
    });
    open({ kind: "result" });
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.plate, borderColor: theme.rule }]}>
      <Row align="center">
        <Row gap="xs">
          {e.crew.map((c) => (
            <Portrait key={c} seed={findCrew(g, c)?.seed ?? c} size={32} />
          ))}
        </Row>
        <View style={styles.fill}>
          <Txt variant="bodyBold" numberOfLines={1}>
            {e.planetName}
          </Txt>
          <Txt variant="label" color="inkDim" numberOfLines={1}>
            {t(`exp.kind.${expeditionKind(e)}`)} · {t("exp.risk")} {fmtPct(e.risk)}
          </Txt>
        </View>
        {v.done ? (
          <Key testID={`exp-claim-${uid}`} label={t("exp.claim")} icon="claim" tone="orange" size="sm" onPress={onClaim} sound={null} />
        ) : (
          <Txt variant="bodyBold" tabular>
            {fmtTime(v.left)}
          </Txt>
        )}
      </Row>
      {v.done ? (
        <Row gap="xs" align="center">
          <Led color="mint" state="blink" size={6} />
          <MicroLabel color="good">{t("exp.back")}</MicroLabel>
        </Row>
      ) : (
        <TimerBar remaining={remaining} tone="cobalt" warnAt={0} height={5} />
      )}
    </View>
  );
});

export function Expeditions() {
  const t = useT("nav");
  const open = useNavUi((s) => s.open);
  const v = useGame(
    (g) => {
      const s = g.state;
      let scanned = 0;
      const planets = currentSystem(g).planets;
      for (let i = 0; i < planets.length; i++) if (isScanned(g, planets[i].id)) scanned++;
      let free = 0;
      for (let i = 0; i < s.crew.length; i++) if (!s.crew[i].away) free++;
      return {
        unlocked: s.features.expeditions === 1,
        ids: s.expeditions.map((e) => e.uid + (e.done ? "d" : "")).join(","),
        scanned,
        crew: s.crew.length,
        free,
        jumping: s.nav.jump !== null,
      };
    },
    undefined,
    3,
  );
  if (!v.unlocked) {
    return (
      <View style={styles.gap}>
        <LockCard feature="expeditions" title={t("exp.title")} />
        <Txt variant="label" color="inkDim">
          {t("exp.teaser")}
        </Txt>
      </View>
    );
  }
  const list = getGame().state.expeditions.slice().sort((a, b) => Number(b.done) - Number(a.done) || a.end - b.end);
  const reason = v.jumping ? t("exp.blockJump") : v.crew === 0 ? t("exp.blockNoCrew") : v.free === 0 ? t("exp.blockBusy") : v.scanned === 0 ? t("exp.blockNoScan") : "";
  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.gap} showsVerticalScrollIndicator={false}>
      <Key testID="exp-new" label={t("exp.new")} sublabel={reason || t("exp.newHint", { free: v.free, scanned: v.scanned })} icon="crew" tone="cobalt" disabled={reason !== ""} onPress={() => open({ kind: "expedition", planet: null })} />
      {list.length === 0 ? <EmptyState compact icon="crew" title={t("exp.emptyTitle")} hint={t("exp.emptyHint")} /> : list.map((e) => <ExpeditionRow key={e.uid} uid={e.uid} />)}
    </ScrollView>
  );
}

// ---------- planning sheet ------------------------------------------------------------

export function ExpeditionStart({ planet: initial }: { planet: string | null }) {
  const t = useT("nav");
  const tr = useTr();
  const theme = useTheme();
  const { sheets, back, close, setSection } = useNavUi();
  const g = getGame();
  const sys = currentSystem(g);
  const scanned = sys.planets.filter((p) => isScanned(g, p.id));
  const [planetId, setPlanetId] = useState(initial ?? scanned[0]?.id ?? "");
  const [kind, setKind] = useState<ExpeditionKind>("short");
  const [party, setParty] = useState<number[]>([]);
  const crewSig = useGame((gm) => gm.state.crew.map((c) => c.uid + ":" + c.level + ":" + (c.away ? 1 : 0) + ":" + (c.deck ?? "")).join("|"), Object.is, 5);
  void crewSig;
  const planet = findPlanet(g, planetId);
  const preview = planet && party.length > 0 ? previewExpedition(g, planetId, party, kind) : null;
  const finds = EXPEDITION_FINDS[kind];

  const toggle = (uid: number): void => {
    setParty((p) => (p.includes(uid) ? p.filter((x) => x !== uid) : p.length >= MAX_PARTY ? p : [...p, uid]));
    haptic("detent");
  };

  const onStart = (): void => {
    const r = act((gm) => startExpedition(gm, planetId, party, kind));
    if (r.ok) {
      sfx("success");
      haptic("success");
      toast(t("exp.started", { name: planet ? planetName(getGame(), planet) : "" }), "good");
      setSection("exp");
      if (sheets.length > 1) back();
      else close();
    } else {
      sfx("deny");
      toast(t(r.reason === "max" ? "exp.failMax" : r.reason === "busy" ? "exp.blockBusy" : "exp.failOther"), "warn");
    }
  };

  return (
    <View style={styles.gap}>
      <Row wrap>
        {scanned.map((p) => (
          <Chip key={p.id} label={planetName(g, p)} icon="planet" selected={p.id === planetId} onPress={() => setPlanetId(p.id)} />
        ))}
      </Row>
      <KeyRow>
        {KINDS.map((k) => (
          <Key key={k} testID={`exp-kind-${k}`} label={t(`exp.kind.${k}`)} sublabel={fmtTime(expeditionSeconds(g, k))} latched={k === kind} tone={k === kind ? "cobalt" : "black"} size="md" onPress={() => setKind(k)} />
        ))}
      </KeyRow>

      <Rule label={t("exp.crewTitle", { n: party.length, max: MAX_PARTY })} />
      {g.state.crew.length === 0 ? <Txt variant="label">{t("exp.blockNoCrew")}</Txt> : null}
      {g.state.crew.map((c) => {
        const on = party.includes(c.uid);
        const hurt = isInjured(g, c.uid);
        return (
          <Pressable
            key={c.uid}
            testID={`exp-crew-${c.uid}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled: c.away }}
            disabled={c.away}
            onPress={() => toggle(c.uid)}
            style={[styles.crew, { backgroundColor: on ? theme.plate : theme.well, borderColor: on ? theme.cobalt : theme.rule, opacity: c.away ? 0.5 : 1 }]}
          >
            <Portrait seed={c.seed} size={32} />
            <View style={styles.fill}>
              <Txt variant="bodyBold" numberOfLines={1}>
                {c.name}
              </Txt>
              <Txt variant="label" color={c.deck && !c.away ? "warn" : "inkDim"} numberOfLines={1}>
                {c.away ? t(hurt ? "exp.crewHurt" : "exp.crewAway") : c.deck ? t("exp.crewManages", { deck: tr(content.decks[c.deck]?.name) }) : t("exp.crewFree")}
              </Txt>
            </View>
            <Badge label={`${t("exp.level")} ${c.level}`} tone="neutral" style={styles.center} />
            <Led color="cobalt" on={on} size={8} />
          </Pressable>
        );
      })}

      <Rule label={t("exp.previewTitle")} />
      <Well gap={space.sm}>
        {preview ? (
          <Meter
            value={preview.risk}
            label={t("exp.riskLong")}
            valueText={`${fmtPct(preview.risk)} · ${fmtTime(preview.seconds)}`}
            zones={[
              { from: 0, tone: "mint" },
              { from: 0.2, tone: "yellow" },
              { from: 0.4, tone: "red" },
            ]}
            height={8}
          />
        ) : (
          <Txt variant="label" color="warn">
            {t("exp.pickCrew")}
          </Txt>
        )}
        {planet ? (
          <Row wrap align="center">
            {planet.resources.map((r) => (
              <Icon key={r} name={r} size={16} chip />
            ))}
            {planet.special ? <Icon name={planet.special} size={16} chip /> : null}
            <Icon name="coin" size={16} chip />
            <Txt variant="label" color="inkDim">
              {t("exp.lootSure")}
            </Txt>
          </Row>
        ) : null}
        <Row wrap>
          <CostTag icon="craft" amount={`${t("exp.find.blueprint")} ${fmtPct(finds.blueprint)}`} size="sm" boxed />
          <CostTag icon="card" amount={`${t("exp.find.card")} ${fmtPct(finds.card)}`} size="sm" boxed />
          <CostTag icon="book" amount={`${t("exp.find.log")} ${fmtPct(finds.log)}`} size="sm" boxed />
          <CostTag icon="star" amount={`${t("exp.find.artifact")} ${fmtPct(finds.artifact)}`} size="sm" boxed />
        </Row>
        <Txt variant="label" color="inkDim">
          {t("exp.riskNote")}
        </Txt>
      </Well>
      <Key testID="exp-start" label={t("exp.start")} sublabel={preview ? fmtTime(preview.seconds) : undefined} icon="play" tone="orange" disabled={!preview} onPress={onStart} sound={null} />
    </View>
  );
}

// ---------- result card ---------------------------------------------------------------

export function ExpeditionResultCard() {
  const t = useT("nav");
  const res = useNavUi((s) => s.result);
  const close = useNavUi((s) => s.close);
  if (!res) return null;
  const o = res.outcome;
  return (
    <View style={styles.gap}>
      <Row align="center">
        <Icon name={o.lost ? "warning" : "claim"} size={24} chip />
        <View style={styles.fill}>
          <Txt variant="bodyBold">{res.planetName}</Txt>
          <Txt variant="label" color="inkDim">
            {t(o.lost ? "result.lost" : "result.ok")}
          </Txt>
        </View>
      </Row>
      {!o.lost ? (
        <Well gap={space.sm}>
          <Row wrap>
            {res.items.map((it) => (
              <CostTag key={it.item} icon={it.item} amount={`+${fmt(it.amount)} ${itemName(it.item)}`} size="sm" boxed />
            ))}
            {res.credits.m > 0 ? <CostTag icon="coin" amount={`+${fmt(res.credits)}`} size="sm" boxed /> : null}
          </Row>
          {o.blueprint ? <Find icon="craft" text={t("result.blueprint")} /> : null}
          {o.card ? <Find icon="card" text={t("result.card")} /> : null}
          {o.log ? <Find icon="book" text={t("result.log")} /> : null}
          {o.artifact ? <Find icon={o.artifact} text={t("result.artifact", { name: itemName(o.artifact) })} /> : null}
        </Well>
      ) : null}
      {res.injuredName ? (
        <Row align="center">
          <Portrait seed={res.injuredSeed} size={32} />
          <Txt variant="label" color="warn" style={styles.fill}>
            {t("result.injured", { name: res.injuredName, time: t("count.minute", { count: Math.round(((content.balance.injurySecs as number) ?? 900) / 60) }) })}
          </Txt>
        </Row>
      ) : (
        <Txt variant="label" color="inkDim">
          {t("result.unhurt")}
        </Txt>
      )}
      <Row align="center" justify="space-between">
        <Row gap="xs" align="center">
          <Icon name="morale" size={16} />
          <Txt variant="label" color={o.morale < 0 ? "bad" : "good"}>
            {t("result.morale", { n: (o.morale > 0 ? "+" : "") + o.morale })}
          </Txt>
        </Row>
        <Txt variant="label">{t("result.xp", { n: fmt(Math.round(o.xp)) })}</Txt>
      </Row>
      <Key testID="result-ok" label={t("result.close")} tone="orange" onPress={close} />
    </View>
  );
}

function Find({ icon, text }: { icon: string; text: string }) {
  return (
    <Row align="center">
      <Icon name={icon} size={16} chip />
      <Txt variant="label" style={styles.fill}>
        {text}
      </Txt>
    </Row>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  gap: { gap: space.sm },
  center: { alignSelf: "center" },
  card: { borderRadius: radius.well, borderWidth: 1, padding: space.sm, gap: space.sm },
  crew: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48, borderRadius: radius.well, borderWidth: 1.5, paddingHorizontal: space.sm, paddingVertical: space.xs },
});
