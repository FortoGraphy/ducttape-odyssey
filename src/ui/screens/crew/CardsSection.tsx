// Card collection: 39 boost cards as hardware cartridges, grouped by deck, with two slots per deck.
import { memo, useCallback, useState } from "react";
import { FlatList, Pressable, View } from "react-native";

import { content } from "@/content";
import { DECK_IDS, type CardId, type DeckId, type Game } from "@/engine/types";
import { cardNextAt, cardSlots, equipCard, scaleEffect, unequipCard } from "@/engine/world";
import { useLang, useT, useTr } from "@/i18n";
import { haptic, sfx } from "@/platform/feedback";
import { useGame } from "@/store/game";
import { Badge, Card, Col, Icon, Key, KeyRow, Led, MicroLabel, ProgressBar, Row, Rule, Sheet, toast, Txt, useTheme } from "@/ui/kit";
import { palette, space } from "@/ui/theme";

import { doAct, effectLines, EffectList, LockTeaser, Note, useSnapshot, type TFn } from "./shared";

/** Label colors by rarity 0..3 (palette only). */
const RARITY_COLOR = [palette.steel3, palette.green1, palette.cobalt2, palette.orange] as const;
const RARITY_TONE = ["neutral", "good", "cobalt", "orange"] as const;
const CART_HEIGHT = 132;

const CARDS_BY_DECK: Record<DeckId, CardId[]> = (() => {
  const out = {} as Record<DeckId, CardId[]>;
  for (const id of DECK_IDS) out[id] = [];
  for (const id of Object.keys(content.cards).sort((a, b) => content.cards[a].rarity - content.cards[b].rarity || (a < b ? -1 : 1))) out[content.cards[id].deck]?.push(id);
  return out;
})();
const TOTAL_CARDS = Object.keys(content.cards).length;

interface CardView {
  id: CardId;
  owned: boolean;
  lvl: number;
  n: number;
  next: number; // copies for the next level, 0 at the cap
  slot: number; // -1 = not equipped
}

interface DeckGroup {
  deck: DeckId;
  cards: CardView[];
  equipped: number;
  slots: number;
}

function cardsSig(g: Game): string {
  let s = "";
  for (const id in g.state.cards) s += `${id}:${g.state.cards[id].n};`;
  for (const d of DECK_IDS) s += `|${g.state.decks[d].cards.join(",")}`;
  return s;
}

function cardView(g: Game, id: CardId): CardView {
  const own = g.state.cards[id];
  const owned = own !== undefined && own.n >= 1;
  return { id, owned, lvl: owned ? own.lvl : 0, n: owned ? own.n : 0, next: owned ? cardNextAt(g, id) : 1, slot: g.state.decks[content.cards[id].deck].cards.indexOf(id) };
}

function buildGroups(g: Game): DeckGroup[] {
  const slots = cardSlots(g);
  const groups = DECK_IDS.map((deck) => ({ deck, slots, equipped: Math.min(slots, g.state.decks[deck].cards.length), cards: CARDS_BY_DECK[deck].map((id) => cardView(g, id)) }));
  // decks with something to plug in come first, so a young collection does not open on a wall of blanks
  const has = (x: DeckGroup): number => (x.cards.some((c) => c.owned) ? 0 : 1);
  return groups.sort((a, b) => has(a) - has(b));
}

// ---------- cartridge -----------------------------------------------------------------

const PIPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** A card drawn as a plug-in cartridge: grip ridges, a printed label with the deck's pictogram, level pips and contact pins. */
const Cartridge = memo(function Cartridge({ card, width, onPress }: { card: CardView; width?: number; onPress?: (id: CardId) => void }) {
  const theme = useTheme();
  const t = useT("crew") as TFn;
  const tr = useTr();
  const def = content.cards[card.id];
  const color = RARITY_COLOR[def.rarity];
  const press = useCallback(() => onPress?.(card.id), [onPress, card.id]);
  const shell = theme.id === "day" ? palette.steel0 : palette.void2;
  const label = card.owned ? palette.bone2 : palette.steel1;
  const ink = card.owned ? "#15171C" : palette.steel3;
  const body = (
    <View style={{ height: CART_HEIGHT, width, borderRadius: 6, backgroundColor: shell, borderTopWidth: 1, borderTopColor: palette.steel1, borderBottomWidth: 2, borderBottomColor: palette.void0, paddingHorizontal: 5, paddingTop: 4, opacity: card.owned ? 1 : 0.7 }}>
      <Row gap={3} justify="space-between" style={{ height: 8 }}>
        <Led on={card.slot >= 0} color="mint" size={5} />
        <Row gap={2}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ width: 8, height: 2, borderRadius: 1, backgroundColor: palette.steel1 }} />
          ))}
        </Row>
        <View style={{ width: 5 }} />
      </Row>
      <View style={{ flex: 1, marginTop: 3, borderRadius: 3, backgroundColor: label, overflow: "hidden" }}>
        <View style={{ height: 5, backgroundColor: card.owned ? color : palette.steel2 }} />
        <View style={{ alignItems: "center", paddingTop: 4, gap: 2, flex: 1 }}>
          <View style={{ width: 40, height: 40, borderRadius: 4, backgroundColor: palette.void2, borderWidth: 1, borderColor: card.owned ? color : palette.steel1, alignItems: "center", justifyContent: "center" }}>
            {card.owned ? <Icon name={content.decks[def.deck].icon} size={32} /> : <Icon name="question" size={24} color={palette.steel2} />}
          </View>
          <Txt variant="micro" color={ink} align="center" numberOfLines={2} style={{ paddingHorizontal: 3, lineHeight: 11, letterSpacing: 0.2, fontSize: 9 }}>
            {card.owned ? tr(def.name) : t("cards.unknown")}
          </Txt>
        </View>
        <View style={{ paddingHorizontal: 5, paddingBottom: 4, gap: 3 }}>
          <Row gap={2} justify="center">
            {PIPS.map((i) => (
              <View key={i} style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: i < card.lvl ? color : palette.steel3, opacity: i < card.lvl ? 1 : 0.35 }} />
            ))}
          </Row>
          <View style={{ height: 3, borderRadius: 1.5, backgroundColor: "rgba(21,23,28,0.18)", overflow: "hidden" }}>
            <View style={{ height: 3, width: `${card.owned ? (card.next > 0 ? Math.min(1, card.n / card.next) : 1) * 100 : 0}%`, backgroundColor: "#15171C" }} />
          </View>
        </View>
      </View>
      <Row gap={2} justify="center" style={{ height: 7, alignItems: "flex-end" }}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <View key={i} style={{ width: 5, height: 5, backgroundColor: card.owned ? palette.amber : palette.steel1 }} />
        ))}
      </Row>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      testID={`card-${card.id}`}
      onPress={press}
      onPressIn={() => haptic("tap")}
      accessibilityRole="button"
      accessibilityLabel={card.owned ? tr(def.name) : t("cards.unknown")}
      style={({ pressed }) => ({ flex: 1, transform: [{ translateY: pressed ? 2 : 0 }] })}
    >
      {body}
    </Pressable>
  );
});

const GroupRow = memo(function GroupRow({ group, onOpen }: { group: DeckGroup; onOpen: (id: CardId) => void }) {
  const t = useT("crew") as TFn;
  const tr = useTr();
  const def = content.decks[group.deck];
  return (
    <View style={{ marginBottom: space.md, gap: space.xs }}>
      <Row gap="sm" style={{ paddingHorizontal: space.xs }}>
        <Icon name={def.icon} size={16} chip />
        <MicroLabel size="label" color="ink" style={{ flex: 1 }}>
          {tr(def.name)}
        </MicroLabel>
        <MicroLabel size="label" color={group.equipped > 0 ? "good" : "inkDim"}>
          {t("cards.slots", { n: group.equipped, max: group.slots })}
        </MicroLabel>
      </Row>
      <Row gap="sm">
        {group.cards.map((c) => (
          <Cartridge key={c.id} card={c} onPress={onOpen} />
        ))}
      </Row>
    </View>
  );
});

// ---------- detail --------------------------------------------------------------------

function CardSheet({ id, onClose }: { id: CardId | null; onClose: () => void }) {
  const t = useT("crew") as TFn;
  const tr = useTr();
  const lang = useLang();
  const [shown, setShown] = useState<CardId | null>(id);
  if (id !== null && id !== shown) setShown(id);
  const view = useSnapshot(
    (g) => (shown ? `${shown}:${g.state.cards[shown]?.n ?? 0}:${g.state.decks[content.cards[shown].deck].cards.join(",")}` : ""),
    (g) => (shown ? { card: cardView(g, shown), slots: cardSlots(g), inDeck: g.state.decks[content.cards[shown].deck].cards.slice() } : null),
    2,
    shown,
  );
  if (!shown || !view) return <Sheet visible={false} onClose={onClose} />;
  const def = content.cards[shown];
  const { card } = view;
  const deckName = tr(content.decks[def.deck].name);

  const equip = (slot: number) => {
    const res = doAct((g) => equipCard(g, def.deck, shown, slot));
    if (res.ok) {
      sfx("moduleInstall");
      haptic("success");
      toast(t("cards.equipped", { name: tr(def.name), deck: deckName }), { tone: "good", icon: "card" });
    } else {
      sfx("deny");
      toast(t(`fail.${res.reason}`), "bad");
    }
  };
  const eject = () => {
    const res = doAct((g) => unequipCard(g, def.deck, card.slot));
    if (res.ok) {
      sfx("moduleInstall");
      toast(t("cards.ejected", { name: tr(def.name) }), "info");
    }
  };

  const slotKeys = [];
  for (let i = 0; i < view.slots; i++) {
    const occupant = view.inDeck[i];
    const mine = occupant === shown;
    slotKeys.push(
      <Key
        key={i}
        label={t("cards.slot", { n: i + 1 })}
        sublabel={mine ? t("cards.slotMine") : occupant ? tr(content.cards[occupant]?.name) : t("cards.slotFree")}
        tone={mine ? "mint" : "orange"}
        latched={mine}
        disabled={mine}
        onPress={() => equip(i)}
        sound={null}
        testID={`equip-slot-${i}`}
      />,
    );
  }

  return (
    <Sheet
      visible={id !== null}
      onClose={onClose}
      title={card.owned ? tr(def.name) : t("cards.unknownTitle")}
      testID="card-sheet"
      footer={
        card.owned ? (
          <Col gap="xs">
            <MicroLabel size="label">{t("cards.slotsOf", { deck: deckName })}</MicroLabel>
            <KeyRow>
              {slotKeys}
              {card.slot >= 0 ? <Key label={t("cards.eject")} icon="remove" onPress={eject} sound={null} testID="card-eject" /> : null}
            </KeyRow>
          </Col>
        ) : undefined
      }
    >
      <Row gap="md" align="flex-start">
        <Cartridge card={card} width={104} />
        <Col gap="xs" flex>
          <Row gap="xs" wrap>
            <Badge label={t(`rarity.${def.rarity}`)} tone={RARITY_TONE[def.rarity]} />
            {card.slot >= 0 ? <Badge label={t("cards.inSlot", { n: card.slot + 1 })} tone="mint" /> : null}
          </Row>
          <Row gap="xs">
            <Icon name={content.decks[def.deck].icon} size={16} chip />
            <Txt variant="label" color="inkDim" numberOfLines={1} style={{ flex: 1 }}>
              {deckName}
            </Txt>
          </Row>
          {card.owned ? (
            <>
              <Txt variant="bodyBold">{t("cards.level", { n: card.lvl })}</Txt>
              <ProgressBar value={card.next > 0 ? Math.min(1, card.n / card.next) : 1} tone="orange" height={6} />
              <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
                {card.next > 0 ? t("cards.copies", { n: card.n, next: card.next }) : t("cards.copiesMax", { n: card.n })}
              </Txt>
            </>
          ) : (
            <Txt variant="body" color="inkDim">
              {t("cards.notFound")}
            </Txt>
          )}
        </Col>
      </Row>
      {card.owned ? (
        <>
          <Txt variant="body">{tr(def.desc)}</Txt>
          <Rule label={t("cards.now", { n: card.lvl })} />
          <EffectList lines={effectLines(def.effects.map((e) => scaleEffect(e, card.lvl, def.deck)), t, tr, lang)} />
          {card.next > 0 ? (
            <>
              <Rule label={t("cards.nextLevel", { n: card.lvl + 1 })} />
              <EffectList lines={effectLines(def.effects.map((e) => scaleEffect(e, card.lvl + 1, def.deck)), t, tr, lang)} />
            </>
          ) : null}
        </>
      ) : null}
      <Note text={t("cards.sources")} />
    </Sheet>
  );
}

// ---------- section -------------------------------------------------------------------

export default function CardsSection() {
  const t = useT("crew") as TFn;
  const unlocked = useGame((g) => g.state.features.cards === 1);
  const groups = useSnapshot(cardsSig, buildGroups, 5);
  const [open, setOpen] = useState<CardId | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const renderItem = useCallback(({ item }: { item: DeckGroup }) => <GroupRow group={item} onOpen={setOpen} />, []);
  if (!unlocked) return <LockTeaser icon="card" title={t("locked.cardsTitle")} body={t("locked.cardsBody")} how={t("locked.cardsHow")} testID="cards-locked" />;
  const found = groups.reduce((n, g) => n + g.cards.filter((c) => c.owned).length, 0);
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.deck}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: space.md }}
        initialNumToRender={3}
        windowSize={5}
        ListHeaderComponent={
          <Card padding={space.sm} gap={space.xs} style={{ marginBottom: space.md }}>
            <Row gap="sm">
              <Icon name="card" size={24} chip />
              <Col gap={2} flex>
                <Row justify="space-between">
                  <Txt variant="bodyBold">{t("cardCount", { count: found })}</Txt>
                  <Txt variant="label" color="inkDim" tabular>{`${found} / ${TOTAL_CARDS}`}</Txt>
                </Row>
                <ProgressBar value={found / Math.max(1, TOTAL_CARDS)} tone="orange" height={4} />
              </Col>
            </Row>
            <Txt variant="label" color="inkDim" style={{ lineHeight: 15 }}>
              {t("cards.sources")}
            </Txt>
          </Card>
        }
      />
      <CardSheet id={open} onClose={close} />
    </View>
  );
}
