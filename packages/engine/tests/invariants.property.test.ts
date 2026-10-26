// TECH-SPEC §10.1 Livello C, §10.2 Invarianti 1–6
// Property-based testing (fast-check) degli invarianti formali del motore su sequenze casuali di comandi validi e invalidi.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  PLAYERS_ORDER,
  RESOURCE_KEYS,
  apply,
  autoDiscard,
  createGame,
  getLogisticsCap,
  getStorageCap,
  legalCommands,
  mutateApplyTimeout,
  mutateConcede,
  nextInt,
  seedToRngState,
  validateApplyTimeout,
  validateCommand,
  validateConcede,
  type CardRules,
  type Command,
  type DeckPayload,
  type GameEvent,
  type GameState,
  type PlayerId,
  type RngState,
} from '../src/index.js';
import cardsRulesJson from '../../../data/cards.rules.json' with { type: 'json' };
import balancedTacticalJson from '../../../data/decks/balanced-tactical.json' with { type: 'json' };

/**
 * Congela ricorsivamente un oggetto e tutte le sue proprietà annidate per verificare l'Invariante 5 (Immutabilità pura).
 */
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

const catalog = deepFreeze(
  structuredClone(cardsRulesJson as unknown as Record<string, CardRules>),
);
const balancedDeck = deepFreeze(
  structuredClone(balancedTacticalJson as unknown as DeckPayload),
);

/**
 * Raccoglie tutti gli UID appartenenti a `player` in tutte le zone dello stato.
 */
function collectAllPlayerUids(
  state: Readonly<GameState>,
  player: PlayerId,
): string[] {
  const p = state.players[player];
  return [
    ...p.subdecks[1].map((c) => c.uid),
    ...p.subdecks[2].map((c) => c.uid),
    ...p.subdecks[3].map((c) => c.uid),
    ...p.hand.map((c) => c.uid),
    ...p.discard.map((c) => c.uid),
    ...p.buildings.map((c) => c.uid),
    ...p.units.map((u) => u.uid),
  ];
}

/**
 * Verifica rigorosamente i 6 invarianti formali di TECH-SPEC §10.2 sullo stato corrente.
 */
function assertFormalInvariants(
  state: Readonly<GameState>,
  prevState: Readonly<GameState> | null,
  initialUidSets: Readonly<Record<PlayerId, ReadonlySet<string>>>,
): void {
  const storageCap = getStorageCap(state.era);
  const logisticsCap = getLogisticsCap(state.era);

  for (const player of PLAYERS_ORDER) {
    const p = state.players[player];

    // Invariante 1: Dominio risorse: 0 <= resources[r] <= cap(era), valore intero
    for (const r of RESOURCE_KEYS) {
      const val = p.resources[r];
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(storageCap);
    }

    // Invariante 2: Limiti di mano e logistica
    if (state.phase === 'development' || state.phase === 'prebattle') {
      expect(p.hand.length).toBeLessThanOrEqual(10);
    }
    expect(Number.isInteger(p.slotsUsed)).toBe(true);
    expect(p.slotsUsed).toBeGreaterThanOrEqual(0);
    expect(p.slotsUsed).toBeLessThanOrEqual(logisticsCap);

    // Invariante 3: Integrità strutturale
    expect(Number.isInteger(p.walls)).toBe(true);
    expect(p.walls).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(p.cityDamage)).toBe(true);
    expect(p.cityDamage).toBeGreaterThanOrEqual(0);
    if (prevState !== null) {
      expect(p.cityDamage).toBeGreaterThanOrEqual(
        prevState.players[player].cityDamage,
      );
    }

    for (const u of p.units) {
      const cardRules = state.catalog[u.cardId];
      expect(cardRules).toBeDefined();
      expect(cardRules?.type).toBe('unit');
      const maxHp = cardRules?.hp ?? 1;
      expect(Number.isInteger(u.hp)).toBe(true);
      expect(u.hp).toBeGreaterThanOrEqual(1);
      expect(u.hp).toBeLessThanOrEqual(maxHp);
    }

    // Invariante 4: Legge di conservazione delle 60 carte senza duplicati né perdite di uid
    const allUids = collectAllPlayerUids(state, player);
    expect(allUids).toHaveLength(60);
    const uniqueUids = new Set(allUids);
    expect(uniqueUids.size).toBe(60);
    for (const uid of uniqueUids) {
      expect(initialUidSets[player].has(uid)).toBe(true);
    }
  }
}

/**
 * Sceglie un comando legale deterministico basato su `choiceSeed` per far avanzare la partita.
 */
function chooseNextLegalCommand(
  state: Readonly<GameState>,
  choiceSeed: number,
): Command {
  if (state.phase === 'mulligan') {
    const player: PlayerId = state.pending.P1 === undefined ? 'P1' : 'P2';
    const hand = state.players[player].hand;
    if (choiceSeed % 5 === 0) {
      return { type: 'ApplyTimeout', player };
    }
    const countToMulligan = choiceSeed % 4;
    const cardUids = hand.slice(0, countToMulligan).map((c) => c.uid);
    return { type: 'SubmitMulligan', player, cardUids };
  }

  if (state.phase === 'hand_limit') {
    const player: PlayerId =
      state.players.P1.hand.length > 10 && state.pending.P1 === undefined
        ? 'P1'
        : 'P2';
    if (choiceSeed % 4 === 0) {
      return { type: 'ApplyTimeout', player };
    }
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

    if (choiceSeed % 11 === 0) {
      return { type: 'ApplyTimeout', player };
    }

    return { type: 'Pass', player };
  }

  // state.phase === 'prebattle'
  const player: PlayerId = state.pending.P1 === undefined ? 'P1' : 'P2';
  if (choiceSeed % 6 === 0) {
    return { type: 'ApplyTimeout', player };
  }
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
 * Genera un comando intenzionalmente invalido per verificare l'Invariante 5 su input rifiutati.
 */
function buildInvalidCommandForState(
  state: Readonly<GameState>,
  choiceSeed: number,
): Command {
  const player: PlayerId = choiceSeed % 2 === 0 ? 'P1' : 'P2';
  const variant = choiceSeed % 6;

  if (variant === 0) {
    return {
      type: 'PlayCard',
      player,
      cardUid: 'uid_non_existent_9999',
    };
  }
  if (variant === 1) {
    return {
      type: 'PlayConversion',
      player,
      cardUid: 'uid_non_existent_9999',
      sacrificeUid: 'uid_non_existent_b1',
    };
  }
  if (variant === 2) {
    return {
      type: 'SubmitDiscard',
      player,
      cardUids: ['uid_invalid_discard'],
    };
  }
  if (variant === 3 && state.phase !== 'mulligan') {
    return {
      type: 'SubmitMulligan',
      player,
      cardUids: [],
    };
  }
  if (variant === 4 && state.phase !== 'prebattle') {
    return {
      type: 'LockInstants',
      player,
      cardUids: [],
    };
  }
  if (state.phase === 'development') {
    const wrongPlayer: PlayerId = state.toAct === 'P1' ? 'P2' : 'P1';
    return { type: 'Pass', player: wrongPlayer };
  }
  return {
    type: 'Pass',
    player,
  };
}

describe('Task M1-14: Property-based testing (fast-check) e Invarianti formali §10.2', () => {
  it(
    'verifica i 6 invarianti formali (§10.2) e l’immutabilità con deepFreeze su 1000+ transizioni casuali generate da fast-check',
    () => {
      let totalTransitionsChecked = 0;

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 16 }),
          fc.array(fc.integer({ min: 0, max: 1000 }), {
            minLength: 40,
            maxLength: 75,
          }),
          (seed, choices) => {
            const { state: initialState } = createGame({
              seed,
              catalog,
              decks: { P1: balancedDeck, P2: balancedDeck },
            });

            const initialUidSets: Record<PlayerId, ReadonlySet<string>> = {
              P1: new Set(collectAllPlayerUids(initialState, 'P1')),
              P2: new Set(collectAllPlayerUids(initialState, 'P2')),
            };

            deepFreeze(initialState);
            assertFormalInvariants(initialState, null, initialUidSets);

            let currentState = initialState;
            let steps = 0;

            for (const choice of choices) {
              if (currentState.phase === 'finished') {
                break;
              }

              // 1. Testa un comando invalido su stato deep-frozen (Invariante 5: nessun errore di mutazione, stato invariato)
              const invalidCmd = buildInvalidCommandForState(
                currentState,
                choice,
              );
              const verBefore = currentState.stateVersion;
              const invalidRes = apply(currentState, invalidCmd);
              expect(invalidRes.ok).toBe(false);
              expect(currentState.stateVersion).toBe(verBefore);

              // 2. Testa un comando legale su stato deep-frozen
              const validCmd = chooseNextLegalCommand(currentState, choice);
              const prevState = currentState;
              const res = apply(prevState, validCmd);
              expect(res.ok).toBe(true);
              if (!res.ok) {
                throw new Error(res.error.message);
              }

              currentState = deepFreeze(res.value.state);
              expect(currentState.stateVersion).toBe(
                prevState.stateVersion + 1,
              );

              // Verifica i 6 invarianti formali e la monotonicità dell'indice eventi n
              assertFormalInvariants(currentState, prevState, initialUidSets);
              for (let i = 1; i < res.value.events.length; i++) {
                expect(res.value.events[i]!.n).toBe(
                  res.value.events[i - 1]!.n + 1,
                );
              }

              steps += 1;
              totalTransitionsChecked += 1;
            }

            // Invariante 6: Terminazione garantita entro un numero finito di mosse legali
            let safetyCounter = 0;
            while (currentState.phase !== 'finished') {
              safetyCounter += 1;
              expect(safetyCounter).toBeLessThan(300);
              const cmd = chooseNextLegalCommand(
                currentState,
                steps + safetyCounter,
              );
              const prevState = currentState;
              const res = apply(prevState, cmd);
              expect(res.ok).toBe(true);
              if (!res.ok) {
                throw new Error(res.error.message);
              }
              currentState = deepFreeze(res.value.state);
              assertFormalInvariants(currentState, prevState, initialUidSets);
              totalTransitionsChecked += 1;
            }

            expect(currentState.phase).toBe('finished');
            expect(currentState.result).not.toBeNull();
          },
        ),
        { numRuns: 50, seed: 20261019 },
      );

      expect(totalTransitionsChecked).toBeGreaterThanOrEqual(1000);
    },
    30000,
  );

  it('verifica ApplyTimeout (D2 + soglia 3 timeout consecutivi -> vittoria per abbandono), Concede e opzioni RulesConfig', () => {
    const { state: s0 } = createGame({
      seed: 'timeout-and-concede-seed',
      catalog,
      decks: { P1: balancedDeck, P2: balancedDeck },
      fixedInitiative: 'P1',
    });

    // Timeout 1 di P1 in mulligan -> mantiene la mano (0 carte cambiate), consecutiveTimeouts = 1
    const t1 = apply(s0, { type: 'ApplyTimeout', player: 'P1' });
    expect(t1.ok).toBe(true);
    if (!t1.ok) return;
    expect(t1.value.state.players.P1.consecutiveTimeouts).toBe(1);

    // Secondo ApplyTimeout di P1 nella stessa finestra mulligan -> rifiutato con DECISION_ALREADY_LOCKED
    const dupMulliganTimeout = apply(t1.value.state, {
      type: 'ApplyTimeout',
      player: 'P1',
    });
    expect(dupMulliganTimeout.ok).toBe(false);
    if (!dupMulliganTimeout.ok) {
      expect(dupMulliganTimeout.error.code).toBe('DECISION_ALREADY_LOCKED');
    }

    // P2 completa il mulligan -> si entra in development Ciclo 1 (toAct = P1)
    const m2 = apply(t1.value.state, {
      type: 'SubmitMulligan',
      player: 'P2',
      cardUids: [],
    });
    expect(m2.ok).toBe(true);
    if (!m2.ok) return;

    // ApplyTimeout di P2 quando tocca a P1 -> NOT_YOUR_TURN
    const wrongTurnTimeout = apply(m2.value.state, {
      type: 'ApplyTimeout',
      player: 'P2',
    });
    expect(wrongTurnTimeout.ok).toBe(false);
    if (!wrongTurnTimeout.ok) {
      expect(wrongTurnTimeout.error.code).toBe('NOT_YOUR_TURN');
    }

    // Timeout 2 di P1 in development -> Pass automatico con reason 'timeout', consecutiveTimeouts = 2
    const t2 = apply(m2.value.state, { type: 'ApplyTimeout', player: 'P1' });
    expect(t2.ok).toBe(true);
    if (!t2.ok) return;
    expect(t2.value.state.players.P1.consecutiveTimeouts).toBe(2);
    expect(t2.value.state.players.P1.passed).toBe(true);

    // ApplyTimeout di P1 quando ha già passato -> ALREADY_PASSED
    const alreadyPassedTimeout = apply(t2.value.state, {
      type: 'ApplyTimeout',
      player: 'P1',
    });
    expect(alreadyPassedTimeout.ok).toBe(false);
    if (!alreadyPassedTimeout.ok) {
      expect(alreadyPassedTimeout.error.code).toBe('ALREADY_PASSED');
    }

    // P2 passa -> si entra in prebattle
    const p2Pass = apply(t2.value.state, { type: 'Pass', player: 'P2' });
    expect(p2Pass.ok).toBe(true);
    if (!p2Pass.ok) return;
    expect(p2Pass.value.state.phase).toBe('prebattle');

    // Timeout 3 consecutivo di P1 in prebattle -> raggiunge soglia 3 -> partita terminata per timeout (vince P2)
    const t3 = apply(p2Pass.value.state, {
      type: 'ApplyTimeout',
      player: 'P1',
    });
    expect(t3.ok).toBe(true);
    if (!t3.ok) return;
    expect(t3.value.state.phase).toBe('finished');
    expect(t3.value.state.result).toEqual({
      kind: 'timeout',
      winner: 'P2',
    });

    // Qualsiasi comando su partita finished viene rifiutato con INVALID_PHASE
    expect(apply(t3.value.state, { type: 'Concede', player: 'P1' }).ok).toBe(
      false,
    );
    expect(
      apply(t3.value.state, { type: 'ApplyTimeout', player: 'P1' }).ok,
    ).toBe(false);
    expect(
      validateConcede(t3.value.state, { type: 'Concede', player: 'P1' })?.code,
    ).toBe('INVALID_PHASE');
    expect(
      validateApplyTimeout(t3.value.state, {
        type: 'ApplyTimeout',
        player: 'P1',
      })?.code,
    ).toBe('INVALID_PHASE');

    // Concede su partita attiva chiude con kind: 'concession'
    const concedeRes = apply(p2Pass.value.state, {
      type: 'Concede',
      player: 'P1',
    });
    expect(concedeRes.ok).toBe(true);
    if (concedeRes.ok) {
      expect(concedeRes.value.state.phase).toBe('finished');
      expect(concedeRes.value.state.result).toEqual({
        kind: 'concession',
        winner: 'P2',
      });
    }

    // Verifica ApplyTimeout in prebattle con consecutiveTimeouts < 3 e poi secondo ApplyTimeout rifiutato
    const prebattleFresh = structuredClone(p2Pass.value.state);
    prebattleFresh.players.P1.consecutiveTimeouts = 0;
    const pbTimeout1 = apply(prebattleFresh, {
      type: 'ApplyTimeout',
      player: 'P1',
    });
    expect(pbTimeout1.ok).toBe(true);
    if (pbTimeout1.ok) {
      expect(pbTimeout1.value.state.pending.P1).toEqual({
        window: 'prebattle',
        cardUids: [],
      });
      const pbTimeoutDup = apply(pbTimeout1.value.state, {
        type: 'ApplyTimeout',
        player: 'P1',
      });
      expect(pbTimeoutDup.ok).toBe(false);
      if (!pbTimeoutDup.ok) {
        expect(pbTimeoutDup.error.code).toBe('DECISION_ALREADY_LOCKED');
      }
    }

    // Verifica ApplyTimeout in hand_limit (giocatore con <= 10 carte o già committato)
    const hlState = structuredClone(s0);
    hlState.phase = 'hand_limit';
    hlState.players.P1.hand = hlState.players.P1.hand.slice(0, 8);
    expect(apply(hlState, { type: 'ApplyTimeout', player: 'P1' }).ok).toBe(
      false,
    );
    hlState.pending.P1 = { window: 'hand_limit', cardUids: [] };
    expect(apply(hlState, { type: 'ApplyTimeout', player: 'P1' }).ok).toBe(
      false,
    );

    // Verifica chiamate dirette mutateConcede e mutateApplyTimeout su stato non valido
    const dummyEvents: GameEvent[] = [];
    expect(
      mutateConcede(
        structuredClone(t3.value.state),
        { type: 'Concede', player: 'P1' },
        dummyEvents,
      ).ok,
    ).toBe(false);
    expect(
      mutateApplyTimeout(
        structuredClone(t3.value.state),
        { type: 'ApplyTimeout', player: 'P1' },
        dummyEvents,
      ).ok,
    ).toBe(false);

    // Verifica autoPassWhenNoLegalPlay: true all'uscita dal mulligan quando non ci sono mosse giocabili
    const { state: autoPassInit } = createGame({
      seed: 'auto-pass-mulligan',
      catalog,
      decks: { P1: balancedDeck, P2: balancedDeck },
      fixedInitiative: 'P1',
      rules: {
        autoPassWhenNoLegalPlay: true,
        timeoutPolicy: {
          development: 'pass',
          mulligan: 'keep',
          prebattle: 'none',
          handLimit: 'deterministic_policy',
          seconds: {
            mulligan: 30,
            handLimit: 30,
            development: 45,
            prebattle: 30,
          },
          concedeAfterConsecutiveTimeouts: 3,
        },
      },
    });
    const apCloned = structuredClone(autoPassInit);
    apCloned.players.P1.hand = [];
    apCloned.players.P2.hand = [];
    const ap1 = apply(apCloned, { type: 'ApplyTimeout', player: 'P1' });
    expect(ap1.ok).toBe(true);
    if (ap1.ok) {
      const ap2 = apply(ap1.value.state, {
        type: 'ApplyTimeout',
        player: 'P2',
      });
      expect(ap2.ok).toBe(true);
      if (ap2.ok) {
        expect(ap2.value.state.phase).toBe('prebattle');
      }
    }

    // Verifica validateCommand su tutti gli 8 tipi di comando
    expect(
      validateCommand(s0, {
        type: 'SubmitMulligan',
        player: 'P1',
        cardUids: [],
      }),
    ).toBeNull();
    expect(
      validateCommand(s0, {
        type: 'SubmitDiscard',
        player: 'P1',
        cardUids: [],
      })?.code,
    ).toBe('INVALID_PHASE');
    expect(
      validateCommand(s0, {
        type: 'PlayCard',
        player: 'P1',
        cardUid: 'x',
      })?.code,
    ).toBe('INVALID_PHASE');
    expect(
      validateCommand(s0, {
        type: 'PlayConversion',
        player: 'P1',
        cardUid: 'x',
        sacrificeUid: 'y',
      })?.code,
    ).toBe('INVALID_PHASE');
    expect(validateCommand(s0, { type: 'Pass', player: 'P1' })?.code).toBe(
      'INVALID_PHASE',
    );
    expect(
      validateCommand(s0, {
        type: 'LockInstants',
        player: 'P1',
        cardUids: [],
      })?.code,
    ).toBe('INVALID_PHASE');

    const rng0: RngState = seedToRngState('check');
    expect(nextInt(rng0, 10).value).toBeGreaterThanOrEqual(0);
  });
});
