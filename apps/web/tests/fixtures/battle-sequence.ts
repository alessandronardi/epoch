import { CARDS_RULES } from '@epochs/content';
import { createGame, type GameEvent, type PlayerId, type UnitInstance } from '@epochs/engine';
import { mutateLockInstants } from '../../../../packages/engine/src/siege-and-era.js';
import { createTutorialDecks } from '../../src/tutorial/tutorial-scenario.js';

export function createBattleSequenceFixture(opponentWalls?: number) {
  const { state } = createGame({
    seed: 'battle-consistency',
    catalog: CARDS_RULES,
    fixedDecks: createTutorialDecks(),
  });
  state.phase = 'prebattle';
  state.pending = {};
  const unit = (owner: PlayerId, cardId: string, seq: number): UnitInstance => ({
    uid: `${owner}-${cardId}`,
    owner,
    cardId,
    seq,
    drawnOrder: seq,
    hp: CARDS_RULES[cardId]!.hp!,
    line: CARDS_RULES[cardId]!.line!,
    atkMod: 0,
    revealed: true,
  });
  state.players.P1.units = [unit('P1', 'u1_inf_h', 1), unit('P1', 'u1_arc_l', 2)];
  state.players.P2.units = [unit('P2', 'u1_inf_h', 3)];
  for (const id of ['P1', 'P2'] as const)
    state.players[id].resources = { food: 8, wood: 8, metal: 8 };
  state.players.P1.hand = [
    { uid: 'instant-atk', cardId: 'i1_arr', owner: 'P1', drawnOrder: 4 },
    { uid: 'instant-walls', cardId: 'i1_wall', owner: 'P1', drawnOrder: 5 },
  ];
  state.players.P2.hand = [];
  if (opponentWalls !== undefined) state.players.P2.walls = opponentWalls;
  const initial = structuredClone(state);
  const events: GameEvent[] = [
    {
      n: ++state.counters.event,
      type: 'UnitsRevealed',
      era: 1,
      units: {
        P1: structuredClone(state.players.P1.units),
        P2: structuredClone(state.players.P2.units),
      },
      resources: { P1: { ...state.players.P1.resources }, P2: { ...state.players.P2.resources } },
    },
  ];
  const first = mutateLockInstants(
    state,
    { type: 'LockInstants', player: 'P1', cardUids: ['instant-atk', 'instant-walls'] },
    events,
  );
  if (!first.ok) throw new Error(first.error.message);
  const second = mutateLockInstants(
    state,
    { type: 'LockInstants', player: 'P2', cardUids: [] },
    events,
  );
  if (!second.ok) throw new Error(second.error.message);
  return { initial, final: state, events };
}
