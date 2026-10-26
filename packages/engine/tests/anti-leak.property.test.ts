// TECH-SPEC §5.5, §10.1 Livello E
// Property-based Leak Test (fast-check): verifica che playerView(state, viewer) e projectEvent(ev, viewer)
// serializzati in JSON non contengano mai alcun uid o cardId segreto dell'avversario.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  PLAYERS_ORDER,
  apply,
  autoDiscard,
  createGame,
  getOpponent,
  isPublicBattleStage,
  legalCommands,
  playerView,
  projectEvent,
  type CardRules,
  type Command,
  type DeckPayload,
  type EraNo,
  type GameEvent,
  type GameState,
  type PlayerId,
} from '../src/index.js';
import cardsRulesJson from '../../../data/cards.rules.json' with { type: 'json' };
import balancedTacticalJson from '../../../data/decks/balanced-tactical.json' with { type: 'json' };

const baseCatalog = cardsRulesJson as unknown as Record<string, CardRules>;
const baseBalancedDeck = balancedTacticalJson as unknown as DeckPayload;

function chooseLegalCommand(
  state: Readonly<GameState>,
  choiceSeed: number,
): Command {
  if (state.phase === 'mulligan') {
    const player: PlayerId = state.pending.P1 === undefined ? 'P1' : 'P2';
    const hand = state.players[player].hand;
    const countToMulligan = choiceSeed % 4;
    const cardUids = hand.slice(0, countToMulligan).map((c) => c.uid);
    return { type: 'SubmitMulligan', player, cardUids };
  }

  if (state.phase === 'hand_limit') {
    const player: PlayerId =
      state.players.P1.hand.length > 10 && state.pending.P1 === undefined
        ? 'P1'
        : 'P2';
    const excess = state.players[player].hand.length - 10;
    const cardUids = autoDiscard(
      state.players[player].hand,
      state.catalog,
      excess,
    );
    return { type: 'SubmitDiscard', player, cardUids };
  }

  if (state.phase === 'development') {
    const player = state.toAct!;
    const legal = legalCommands(state, player);

    if (
      legal.playableConversionUids.length > 0 &&
      legal.sacrificableBuildingUids.length > 0 &&
      choiceSeed % 3 === 0
    ) {
      const cardUid =
        legal.playableConversionUids[
          choiceSeed % legal.playableConversionUids.length
        ]!;
      const sacrificeUid =
        legal.sacrificableBuildingUids[
          choiceSeed % legal.sacrificableBuildingUids.length
        ]!;
      return {
        type: 'PlayConversion',
        player,
        cardUid,
        sacrificeUid,
      };
    }

    if (legal.playableFieldCardUids.length > 0 && choiceSeed % 4 !== 0) {
      const cardUid =
        legal.playableFieldCardUids[
          choiceSeed % legal.playableFieldCardUids.length
        ]!;
      return {
        type: 'PlayCard',
        player,
        cardUid,
      };
    }

    return { type: 'Pass', player };
  }

  const player: PlayerId = state.pending.P1 === undefined ? 'P1' : 'P2';
  const legal = legalCommands(state, player);
  if (legal.playableInstantUids.length > 0 && choiceSeed % 2 === 0) {
    const firstInstantUid =
      legal.playableInstantUids[choiceSeed % legal.playableInstantUids.length]!;
    return {
      type: 'LockInstants',
      player,
      cardUids: [firstInstantUid],
    };
  }
  return { type: 'LockInstants', player, cardUids: [] };
}

/**
 * Costruisce un catalogo e due mazzi con ID disgiunti per P1 (`p1__<id>`) e P2 (`p2__<id>`)
 * e carte distinte per ciascuna copia (60 cardId unici per P1 e 60 cardId unici per P2),
 * così che ogni singola carta di P1 e P2 abbia sia un `uid` unico sia un `cardId` unico.
 */
function buildDisjointUniqueCatalogAndDecks(): {
  catalog: Record<string, CardRules>;
  decks: Record<PlayerId, DeckPayload>;
} {
  const catalog: Record<string, CardRules> = {};
  const decks: Record<PlayerId, DeckPayload> = {
    P1: {
      name: 'P1 Disjoint Deck',
      subdecks: { '1': [], '2': [], '3': [] },
    },
    P2: {
      name: 'P2 Disjoint Deck',
      subdecks: { '1': [], '2': [], '3': [] },
    },
  };

  for (const player of PLAYERS_ORDER) {
    const prefix = player.toLowerCase();
    for (const eraKey of ['1', '2', '3'] as const) {
      const subdeckIds = baseBalancedDeck.subdecks[eraKey];
      subdeckIds.forEach((origCardId, idx) => {
        const origRules = baseCatalog[origCardId]!;
        const uniqueCardId = `${prefix}__e${eraKey}_${String(idx + 1).padStart(2, '0')}__${origCardId}`;
        catalog[uniqueCardId] = {
          ...structuredClone(origRules),
          id: uniqueCardId,
        };
        decks[player].subdecks[eraKey].push(uniqueCardId);
      });
    }
  }

  return { catalog, decks };
}

/**
 * Verifica l'assenza totale di leak (uid e cardId) nella vista e negli eventi proiettati per `viewer`
 * rispetto allo stato segreto di `opponent`.
 */
function assertNoSecretLeakForViewer(
  state: Readonly<GameState>,
  events: readonly GameEvent[],
  viewer: PlayerId,
  hasUniqueCardIdsPerInstance: boolean,
): void {
  const opponent = getOpponent(viewer);
  const oppState = state.players[opponent];

  const view = playerView(state, viewer);
  const viewJson = JSON.stringify(view);

  const projectedEvents = events
    .map((ev) => projectEvent(ev, viewer))
    .filter((ev): ev is GameEvent => ev !== null);
  const eventsJson = JSON.stringify(projectedEvents);

  const publicBattleStage = isPublicBattleStage(state);
  const publicDiscardCardIdSet = new Set(oppState.publicDiscard);

  const secretUids = new Set<string>();
  const secretCardIds = new Set<string>();

  // 1. Carte in mano a opponent (incluse eventuali Istantanee selezionate in pending ma non ancora rivelate)
  for (const c of oppState.hand) {
    secretUids.add(c.uid);
    secretCardIds.add(c.cardId);
  }

  // 2. Carte nei 3 sotto-mazzi di opponent
  for (const era of [1, 2, 3] as const satisfies readonly EraNo[]) {
    for (const c of oppState.subdecks[era]) {
      secretUids.add(c.uid);
      secretCardIds.add(c.cardId);
    }
  }

  // 3. Edifici Economici attivi in campo di opponent (SEMPRE segreti, anche in prebattle e a fine Era)
  for (const b of oppState.buildings) {
    secretUids.add(b.uid);
    secretCardIds.add(b.cardId);
  }

  // 4. Scarti coperti di opponent (scarti da hand_limit e edifici sacrificati da Riconversione per D3)
  for (const d of oppState.discard) {
    if (!publicDiscardCardIdSet.has(d.cardId)) {
      secretUids.add(d.uid);
      secretCardIds.add(d.cardId);
    }
  }

  // 5. Unità di opponent prima di UnitsRevealed
  if (!publicBattleStage) {
    for (const u of oppState.units) {
      secretUids.add(u.uid);
      secretCardIds.add(u.cardId);
    }
  }

  // 6. Scelte bloccate in pending da opponent (mulligan, hand_limit, o Istantanee in prebattle prima di InstantsRevealed)
  const oppPending = state.pending[opponent];
  if (oppPending !== undefined) {
    for (const uid of oppPending.cardUids) {
      secretUids.add(uid);
    }
  }

  for (const uid of secretUids) {
    expect(viewJson).not.toContain(`"${uid}"`);
  }

  if (hasUniqueCardIdsPerInstance) {
    for (const cardId of secretCardIds) {
      expect(viewJson).not.toContain(`"${cardId}"`);
    }
  }

  const revealedInEventsUids = new Set<string>();
  const revealedInEventsCardIds = new Set<string>();

  for (const ev of projectedEvents) {
    if (ev.type === 'UnitsRevealed') {
      for (const u of ev.units[opponent]) {
        revealedInEventsUids.add(u.uid);
        revealedInEventsCardIds.add(u.cardId);
      }
    } else if (ev.type === 'InstantsRevealed') {
      for (const c of ev.played[opponent]) {
        revealedInEventsUids.add(c.uid);
        revealedInEventsCardIds.add(c.cardId);
      }
    } else if (ev.type === 'ConversionActivated' && ev.player === opponent) {
      revealedInEventsUids.add(ev.uid);
      revealedInEventsCardIds.add(ev.cardId);
    }
  }

  for (const uid of secretUids) {
    if (!revealedInEventsUids.has(uid)) {
      expect(eventsJson).not.toContain(`"${uid}"`);
    }
  }

  if (hasUniqueCardIdsPerInstance) {
    for (const cardId of secretCardIds) {
      if (!revealedInEventsCardIds.has(cardId)) {
        expect(eventsJson).not.toContain(`"${cardId}"`);
      }
    }
  }
}

describe('Task M1-14: Property-based Anti-Leak & Privacy Test (§5.5, §10.1 Livello E)', () => {
  it(
    'garantisce zero leak di uid e cardId segreti su P1 e P2 lungo sequenze casuali fast-check con catalogo a ID disgiunti',
    () => {
      const { catalog: disjointCatalog, decks: disjointDecks } =
        buildDisjointUniqueCatalogAndDecks();

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 16 }),
          fc.array(fc.integer({ min: 0, max: 1000 }), {
            minLength: 35,
            maxLength: 65,
          }),
          (seed, choices) => {
            const { state: s0, events: initEvents } = createGame({
              seed,
              catalog: disjointCatalog,
              decks: disjointDecks,
            });

            assertNoSecretLeakForViewer(s0, initEvents, 'P1', true);
            assertNoSecretLeakForViewer(s0, initEvents, 'P2', true);

            let currentState = s0;

            for (const choice of choices) {
              if (currentState.phase === 'finished') {
                break;
              }

              const cmd = chooseLegalCommand(currentState, choice);
              const res = apply(currentState, cmd);
              expect(res.ok).toBe(true);
              if (!res.ok) {
                throw new Error(res.error.message);
              }

              currentState = res.value.state;
              const stepEvents = res.value.events;

              assertNoSecretLeakForViewer(currentState, stepEvents, 'P1', true);
              assertNoSecretLeakForViewer(currentState, stepEvents, 'P2', true);
            }
          },
        ),
        { numRuns: 25, seed: 20261020 },
      );
    },
    30000,
  );

  it(
    'garantisce zero leak di uid segreti anche sul catalogo standard con mazzo balanced-tactical.json',
    () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 16 }),
          fc.array(fc.integer({ min: 0, max: 1000 }), {
            minLength: 30,
            maxLength: 60,
          }),
          (seed, choices) => {
            const { state: s0, events: initEvents } = createGame({
              seed,
              catalog: baseCatalog,
              decks: { P1: baseBalancedDeck, P2: baseBalancedDeck },
            });

            assertNoSecretLeakForViewer(s0, initEvents, 'P1', false);
            assertNoSecretLeakForViewer(s0, initEvents, 'P2', false);

            let currentState = s0;
            for (const choice of choices) {
              if (currentState.phase === 'finished') {
                break;
              }
              const cmd = chooseLegalCommand(currentState, choice);
              const res = apply(currentState, cmd);
              expect(res.ok).toBe(true);
              if (!res.ok) {
                throw new Error(res.error.message);
              }
              currentState = res.value.state;
              assertNoSecretLeakForViewer(
                currentState,
                res.value.events,
                'P1',
                false,
              );
              assertNoSecretLeakForViewer(
                currentState,
                res.value.events,
                'P2',
                false,
              );
            }
          },
        ),
        { numRuns: 20, seed: 20261021 },
      );
    },
    30000,
  );
});
