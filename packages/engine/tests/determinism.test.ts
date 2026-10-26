// TECH-SPEC §10.1 Livello D
// Determinismo e Replay: stesso seed + stessi comandi -> identico stateHash ed eventi bit per bit su 1000 partite complete.

import { describe, expect, it } from 'vitest';
import {
  apply,
  autoDiscard,
  createGame,
  legalCommands,
  nextInt,
  seedToRngState,
  stateHash,
  type CardRules,
  type Command,
  type DeckPayload,
  type GameEvent,
  type GameState,
  type PlayerId,
  type RngState,
} from '../src/index.js';
import cardsRulesJson from '../../../data/cards.rules.json' with { type: 'json' };
import aggroBreachJson from '../../../data/decks/aggro-breach.json' with { type: 'json' };
import balancedTacticalJson from '../../../data/decks/balanced-tactical.json' with { type: 'json' };
import boomEconomyJson from '../../../data/decks/boom-economy.json' with { type: 'json' };

const catalog = cardsRulesJson as unknown as Record<string, CardRules>;
const presetDecks: readonly DeckPayload[] = [
  balancedTacticalJson as unknown as DeckPayload,
  aggroBreachJson as unknown as DeckPayload,
  boomEconomyJson as unknown as DeckPayload,
];

function chooseFastDeterministicCommand(
  state: Readonly<GameState>,
  choiceSeed: number,
): Command {
  if (state.phase === 'mulligan') {
    const player: PlayerId = state.pending.P1 === undefined ? 'P1' : 'P2';
    const hand = state.players[player].hand;
    const countToMulligan = choiceSeed % 3;
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
      choiceSeed % 2 === 0
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

    if (legal.playableFieldCardUids.length > 0 && choiceSeed % 3 !== 0) {
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

interface CompletedGameRun {
  finalState: GameState;
  finalHash: string;
  commands: Command[];
  allEvents: GameEvent[];
}

function runDeterministicGame(
  seed: string,
  deckP1: DeckPayload,
  deckP2: DeckPayload,
): CompletedGameRun {
  const { state: initialState, events: initEvents } = createGame({
    seed,
    catalog,
    decks: { P1: deckP1, P2: deckP2 },
  });

  let state = initialState;
  let botRng: RngState = seedToRngState(`${seed}:bot-choices`);
  const commands: Command[] = [];
  const allEvents: GameEvent[] = [...initEvents];

  let stepCount = 0;
  while (state.phase !== 'finished') {
    stepCount += 1;
    if (stepCount > 300) {
      throw new Error(`Game ${seed} did not terminate within 300 steps.`);
    }

    const stepRng = nextInt(botRng, 1024);
    botRng = stepRng.nextState;

    const cmd = chooseFastDeterministicCommand(state, stepRng.value);
    commands.push(cmd);

    const res = apply(state, cmd);
    if (!res.ok) {
      throw new Error(
        `Unexpected illegal command in game ${seed} at step ${stepCount}: ${res.error.code} (${res.error.message})`,
      );
    }

    state = res.value.state;
    allEvents.push(...res.value.events);
  }

  return {
    finalState: state,
    finalHash: stateHash(state),
    commands,
    allEvents,
  };
}

function replayGameFromCommands(
  seed: string,
  deckP1: DeckPayload,
  deckP2: DeckPayload,
  commands: readonly Command[],
): CompletedGameRun {
  const { state: initialState, events: initEvents } = createGame({
    seed,
    catalog,
    decks: { P1: deckP1, P2: deckP2 },
  });

  let state = initialState;
  const allEvents: GameEvent[] = [...initEvents];

  for (const cmd of commands) {
    const res = apply(state, cmd);
    if (!res.ok) {
      throw new Error(
        `Replay failed on command ${cmd.type}: ${res.error.message}`,
      );
    }
    state = res.value.state;
    allEvents.push(...res.value.events);
  }

  return {
    finalState: state,
    finalHash: stateHash(state),
    commands: [...commands],
    allEvents,
  };
}

describe('Task M1-14: Determinismo e Replay su 1000 partite complete (§10.1 Livello D)', () => {
  it(
    'esegue 1000 partite complete e verifica che stesso seed + stessi comandi producano identico stateHash ed eventi bit per bit',
    () => {
      const TOTAL_GAMES = 1000;
      const outcomeCounts: Record<string, number> = {
        annihilation: 0,
        points: 0,
        draw: 0,
        timeout: 0,
        concession: 0,
      };

      for (let i = 0; i < TOTAL_GAMES; i++) {
        const seed = `epochs-m1-det-${i}`;
        const deckP1 = presetDecks[i % presetDecks.length]!;
        const deckP2 = presetDecks[(i + 1) % presetDecks.length]!;

        const run1 = runDeterministicGame(seed, deckP1, deckP2);
        expect(run1.finalState.phase).toBe('finished');
        expect(run1.finalState.result).not.toBeNull();
        outcomeCounts[run1.finalState.result!.kind] =
          (outcomeCounts[run1.finalState.result!.kind] ?? 0) + 1;

        // Replay esatto dai comandi registrati: verifica identità bit-per-bit di stateHash ed eventi
        const replay = replayGameFromCommands(
          seed,
          deckP1,
          deckP2,
          run1.commands,
        );

        expect(replay.finalHash).toBe(run1.finalHash);
        expect(replay.allEvents.length).toBe(run1.allEvents.length);
        expect(JSON.stringify(replay.allEvents)).toBe(
          JSON.stringify(run1.allEvents),
        );
      }

      const totalFinished = Object.values(outcomeCounts).reduce(
        (acc, v) => acc + v,
        0,
      );
      expect(totalFinished).toBe(TOTAL_GAMES);
    },
    60000,
  );
});
