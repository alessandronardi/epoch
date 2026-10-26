// TECH-SPEC §7.1, §10.3 — Test unitari e di integrazione per RandomBot, GreedyBot e RationalBot.

import { describe, expect, it } from 'vitest';
import {
  PLAYERS_ORDER,
  apply,
  createGame,
  nextRandom,
  playerView,
  seedToRngState,
  type CardInstance,
  type CardRules,
  type Command,
  type DeckPayload,
  type GameState,
  type Line,
  type PlayerId,
  type PlayerView,
  type UnitInstance,
} from '../../engine/src/index.js';
import {
  DEFAULT_BOT_CATALOG,
  DEFAULT_RANDOM_BOT_PASS_PROBABILITY,
  GreedyBot,
  RandomBot,
  RationalBot,
  calculateTotalDemForView,
  calculateUnitEfficiency,
  clampUnitRandom,
  createBot,
  enumeratePlayableInstantSubsets,
  pickRandomElement,
  pickRandomInt,
  predictsEnemyBreach,
  sampleDistinct,
} from '../src/index.js';
import aggroBreachJson from '../../../data/decks/aggro-breach.json' with { type: 'json' };
import balancedTacticalJson from '../../../data/decks/balanced-tactical.json' with { type: 'json' };
import boomEconomyJson from '../../../data/decks/boom-economy.json' with { type: 'json' };

const catalog = DEFAULT_BOT_CATALOG;
const aggroDeck = aggroBreachJson as unknown as DeckPayload;
const balancedDeck = balancedTacticalJson as unknown as DeckPayload;
const boomDeck = boomEconomyJson as unknown as DeckPayload;

function makeDeterministicRng(seed: string): () => number {
  let rngState = seedToRngState(seed);
  return () => {
    const step = nextRandom(rngState);
    rngState = step.nextState;
    return step.value;
  };
}

function mustApply(state: GameState, cmd: Command): GameState {
  const res = apply(state, cmd);
  if (!res.ok) {
    throw new Error(`Expected apply to succeed, got ${res.error.code}: ${res.error.message}`);
  }
  return res.value.state;
}

function makeCardInstance(
  uid: string,
  cardId: string,
  drawnOrder = 1,
  owner: PlayerId = 'P1',
): CardInstance {
  return {
    uid,
    cardId,
    owner,
    drawnOrder,
  };
}

function makeUnitInstance(
  uid: string,
  cardId: string,
  line: Line,
  hp: number,
  seq = 1,
  owner: PlayerId = 'P1',
  revealed = false,
): UnitInstance {
  return {
    uid,
    cardId,
    owner,
    drawnOrder: seq,
    seq,
    hp,
    line,
    atkMod: 0,
    revealed,
  };
}

function buildUniformSubdecks(
  era1CardIds: readonly string[],
  era2CardIds: readonly string[],
  era3CardIds: readonly string[],
): Record<1 | 2 | 3, string[]> {
  const fill20 = (ids: readonly string[], fallback: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i < 20; i++) {
      out.push(ids[i] ?? fallback);
    }
    return out;
  };
  return {
    1: fill20(era1CardIds, 'u1_inf_l'),
    2: fill20(era2CardIds, 'u2_inf_l'),
    3: fill20(era3CardIds, 'u3_inf_l'),
  };
}

function createCustomGameState(options?: {
  p1Era1?: readonly string[];
  p2Era1?: readonly string[];
  seed?: string;
}): GameState {
  const p1Subdecks = buildUniformSubdecks(
    options?.p1Era1 ?? [
      'e1_farm',
      'e1_lumb',
      'e1_mine',
      'u1_inf_l',
      'u1_spr_l',
      'u1_arc_l',
      'u1_cav_l',
      'i1_wall',
    ],
    ['e2_fnd', 'e2_mill', 'e2_saw', 'u2_inf_h', 'u2_cav_h', 'i2_mor', 'i2_sab'],
    ['e3_gld', 'e3_frn', 'u3_inf_h', 'u3_cav_h', 'u3_arc_h', 'i3_fir', 'i3_ral'],
  );
  const p2Subdecks = buildUniformSubdecks(
    options?.p2Era1 ?? [
      'e1_farm',
      'e1_lumb',
      'u1_inf_l',
      'u1_spr_l',
      'u1_arc_l',
      'u1_cav_l',
      'i1_arr',
      'i1_wall',
    ],
    ['e2_fnd', 'e2_mill', 'u2_inf_l', 'u2_cav_l', 'i2_mor', 'i2_sab'],
    ['e3_gld', 'e3_frn', 'u3_inf_l', 'u3_cav_l', 'i3_fir', 'i3_ral'],
  );

  return createGame({
    seed: options?.seed ?? 'bot-test-seed',
    catalog: catalog as Record<string, CardRules>,
    fixedInitiative: 'P1',
    fixedDecks: {
      P1: p1Subdecks,
      P2: p2Subdecks,
    },
  }).state;
}

describe('@epochs/bots — Utility functions & RandomBot', () => {
  it('validates clampUnitRandom, pickRandomInt, pickRandomElement, and sampleDistinct', () => {
    expect(clampUnitRandom(-0.5)).toBe(0);
    expect(clampUnitRandom(Number.NaN)).toBe(0);
    expect(clampUnitRandom(1.5)).toBeLessThan(1);
    expect(clampUnitRandom(0.42)).toBe(0.42);

    expect(pickRandomInt(() => 0.5, 5, 5)).toBe(5);
    expect(pickRandomInt(() => 0.5, 5, 3)).toBe(5);
    expect(pickRandomInt(() => 0, 1, 4)).toBe(1);
    expect(pickRandomInt(() => 0.9999, 1, 4)).toBe(4);

    expect(() => pickRandomElement([], () => 0.5)).toThrow(
      /Cannot pick a random element from an empty array/,
    );
    expect(pickRandomElement(['a', 'b', 'c'], () => 0)).toBe('a');

    expect(sampleDistinct(['x', 'y', 'z'], 0, () => 0.5)).toEqual([]);
    const sampled = sampleDistinct(['x', 'y', 'z'], 2, () => 0.3);
    expect(sampled).toHaveLength(2);
    expect(new Set(sampled).size).toBe(2);
  });

  it('validates RandomBot constructor options and createBot factory', () => {
    const defaultBot = new RandomBot();
    expect(defaultBot.name).toBe('RandomBot');
    expect(defaultBot.passProbability).toBe(
      DEFAULT_RANDOM_BOT_PASS_PROBABILITY,
    );

    expect(() => new RandomBot({ passProbability: -0.1 })).toThrow(RangeError);
    expect(() => new RandomBot({ passProbability: 1.1 })).toThrow(RangeError);
    expect(() => new RandomBot({ passProbability: Number.NaN })).toThrow(
      RangeError,
    );

    expect(createBot('random', { name: 'R1' }).name).toBe('R1');
    expect(createBot('greedy', { name: 'G1' }).name).toBe('G1');
    expect(createBot('rational', { name: 'Rat1' }).name).toBe('Rat1');
  });

  it('enumerates playable instant subsets both with and without a catalog', () => {
    let state = createCustomGameState();
    state = mustApply(state, {
      type: 'SubmitMulligan',
      player: 'P1',
      cardUids: [],
    });
    state = mustApply(state, {
      type: 'SubmitMulligan',
      player: 'P2',
      cardUids: [],
    });

    const baseView = playerView(state, 'P1');
    const prebattleView: PlayerView = {
      ...baseView,
      phase: 'prebattle',
      self: {
        ...baseView.self,
        resources: { food: 0, wood: 3, metal: 0 },
        hand: [
          makeCardInstance('inst-1', 'i1_arr', 1),
          makeCardInstance('inst-2', 'i1_wall', 2),
        ],
        legal: {
          ...baseView.self.legal,
          phase: 'prebattle',
          canAct: true,
          canLockInstants: true,
          playableInstantUids: ['inst-1', 'inst-2'],
        },
      },
    };

    const subsetsWithoutCatalog = enumeratePlayableInstantSubsets(prebattleView);
    expect(subsetsWithoutCatalog).toEqual([['inst-1'], ['inst-2']]);

    const subsetsWithCatalog = enumeratePlayableInstantSubsets(
      prebattleView,
      catalog,
    );
    expect(subsetsWithCatalog).toEqual([['inst-1'], ['inst-2']]);
  });

  it('handles RandomBot error guards and passProbability branches across all phases', () => {
    const state = createCustomGameState();
    const p1View = playerView(state, 'P1');
    const botNoPass = new RandomBot({ passProbability: 0, catalog });
    const botAlwaysPass = new RandomBot({ passProbability: 1, catalog });

    const inactiveView: PlayerView = {
      ...p1View,
      self: {
        ...p1View.self,
        legal: { ...p1View.self.legal, canAct: false },
      },
    };
    expect(() => botNoPass.choose(inactiveView, () => 0.5)).toThrow(
      /cannot choose a command/,
    );

    expect(() =>
      botNoPass.choose(
        {
          ...p1View,
          self: {
            ...p1View.self,
            legal: { ...p1View.self.legal, canSubmitMulligan: false },
          },
        },
        () => 0.5,
      ),
    ).toThrow(/cannot submit mulligan/);

    expect(() =>
      botNoPass.choose(
        {
          ...p1View,
          phase: 'hand_limit',
          self: {
            ...p1View.self,
            legal: {
              ...p1View.self.legal,
              phase: 'hand_limit',
              canSubmitDiscard: false,
            },
          },
        },
        () => 0.5,
      ),
    ).toThrow(/cannot submit discard/);

    expect(() =>
      botNoPass.choose(
        {
          ...p1View,
          phase: 'prebattle',
          self: {
            ...p1View.self,
            legal: {
              ...p1View.self.legal,
              phase: 'prebattle',
              canLockInstants: false,
            },
          },
        },
        () => 0.5,
      ),
    ).toThrow(/cannot lock instants/);

    let devState = mustApply(state, {
      type: 'SubmitMulligan',
      player: 'P1',
      cardUids: [],
    });
    devState = mustApply(devState, {
      type: 'SubmitMulligan',
      player: 'P2',
      cardUids: [],
    });

    const devView = playerView(devState, 'P1');
    expect(botAlwaysPass.choose(devView, () => 0.1)).toEqual({ type: 'Pass' });
    expect(botNoPass.choose(devView, () => 0.1).type).toBe('PlayCard');

    const prebattleView: PlayerView = {
      ...devView,
      phase: 'prebattle',
      self: {
        ...devView.self,
        legal: {
          ...devView.self.legal,
          phase: 'prebattle',
          canAct: true,
          canLockInstants: true,
          playableInstantUids: [
            devView.self.hand.find((c) => c.cardId === 'i1_wall')!.uid,
          ],
        },
      },
    };
    expect(botAlwaysPass.choose(prebattleView, () => 0.1)).toEqual({
      type: 'LockInstants',
      cardUids: [],
    });
  });
});

describe('@epochs/bots — GreedyBot heuristics (TECH-SPEC §7.1)', () => {
  it('computes unit efficiency (ATK + DEM + HP) / costoTotale accurately', () => {
    expect(calculateUnitEfficiency(catalog['e1_farm']!)).toBe(0);
    expect(calculateUnitEfficiency(catalog['u1_inf_l']!)).toBeCloseTo(3.0, 5);
    expect(calculateUnitEfficiency(catalog['u1_cav_h']!)).toBeCloseTo(8 / 3, 5);
    expect(calculateUnitEfficiency(catalog['u2_inf_h']!)).toBeCloseTo(2.8, 5);
  });

  it('mulligan: keeps Era I economy buildings and low-cost units; replaces redundant/expensive cards when no buildings are in hand', () => {
    const greedy = new GreedyBot(catalog);

    const stateWithEcon = createCustomGameState({
      p1Era1: [
        'e1_farm',
        'e1_lumb',
        'u1_inf_l',
        'u1_spr_l',
        'u1_cav_l',
        'u1_sig_h',
        'u1_cav_h',
        'i1_wall',
      ],
    });
    const viewA = playerView(stateWithEcon, 'P1');
    const cmdA = greedy.choose(viewA, () => 0.5);
    expect(cmdA.type).toBe('SubmitMulligan');
    if (cmdA.type === 'SubmitMulligan') {
      const mulliganedCardIds = cmdA.cardUids.map(
        (uid) => viewA.self.hand.find((c) => c.uid === uid)!.cardId,
      );
      expect(mulliganedCardIds).not.toContain('e1_farm');
      expect(mulliganedCardIds).not.toContain('e1_lumb');
      expect(mulliganedCardIds).not.toContain('u1_inf_l');
      expect(mulliganedCardIds).not.toContain('u1_spr_l');
      expect(mulliganedCardIds).toContain('u1_sig_h');
      expect(mulliganedCardIds).toContain('u1_cav_h');
      expect(mulliganedCardIds).toContain('i1_wall');
    }

    const stateNoEcon = createCustomGameState({
      p1Era1: [
        'u1_inf_l',
        'u1_inf_l',
        'u1_spr_l',
        'u1_arc_l',
        'u1_cav_l',
        'u1_inf_h',
        'i1_arr',
        'i1_wall',
      ],
    });
    const viewB = playerView(stateNoEcon, 'P1');
    const cmdB = greedy.choose(viewB, () => 0.5);
    expect(cmdB.type).toBe('SubmitMulligan');
    if (cmdB.type === 'SubmitMulligan') {
      expect(cmdB.cardUids).toHaveLength(6);
      const keptCardIds = viewB.self.hand
        .filter((c) => !cmdB.cardUids.includes(c.uid))
        .map((c) => c.cardId);
      expect(keptCardIds).toEqual(['u1_inf_l', 'u1_spr_l']);
    }
  });

  it('development: prioritizes Economy Buildings in Cycles 1 and 2, then deploys Units by efficiency and line balance', () => {
    const greedy = new GreedyBot();

    let state = createCustomGameState({
      p1Era1: [
        'e1_farm',
        'e1_lumb',
        'u1_inf_l',
        'u1_spr_l',
        'u1_cav_l',
        'u1_arc_h',
        'i1_arr',
        'i1_wall',
      ],
    });
    state = mustApply(state, {
      type: 'SubmitMulligan',
      player: 'P1',
      cardUids: [],
    });
    state = mustApply(state, {
      type: 'SubmitMulligan',
      player: 'P2',
      cardUids: [],
    });

    const viewCycle1 = playerView(state, 'P1');
    const move1 = greedy.choose(viewCycle1, () => 0.5);
    expect(move1.type).toBe('PlayCard');
    if (move1.type === 'PlayCard') {
      const playedCardId = viewCycle1.self.hand.find(
        (c) => c.uid === move1.cardUid,
      )!.cardId;
      expect(catalog[playedCardId]!.type).toBe('economy');
    }

    const viewCycle3NoEcon: PlayerView = {
      ...viewCycle1,
      cycle: 3,
      self: {
        ...viewCycle1.self,
        legal: {
          ...viewCycle1.self.legal,
          playableFieldCardUids: viewCycle1.self.hand
            .filter((c) => catalog[c.cardId]?.type === 'unit')
            .map((c) => c.uid),
        },
      },
    };
    const unitMove1 = greedy.choose(viewCycle3NoEcon, () => 0.5);
    expect(unitMove1.type).toBe('PlayCard');
    if (unitMove1.type === 'PlayCard') {
      const chosenCardId = viewCycle3NoEcon.self.hand.find(
        (c) => c.uid === unitMove1.cardUid,
      )!.cardId;
      expect(chosenCardId).toBe('u1_inf_l');
    }

    const viewWithStackedFront: PlayerView = {
      ...viewCycle3NoEcon,
      self: {
        ...viewCycle3NoEcon.self,
        units: [
          makeUnitInstance('u-front-1', 'u1_inf_l', 'front', 3, 1),
          makeUnitInstance('u-front-2', 'u1_spr_l', 'front', 3, 2),
        ],
      },
    };
    const balancedMove = greedy.choose(viewWithStackedFront, () => 0.5);
    expect(balancedMove.type).toBe('PlayCard');
    if (balancedMove.type === 'PlayCard') {
      const chosenCardId = viewWithStackedFront.self.hand.find(
        (c) => c.uid === balancedMove.cardUid,
      )!.cardId;
      expect(catalog[chosenCardId]!.line).not.toBe('front');
      expect(chosenCardId).toBe('u1_cav_l');
    }
  });

  it('development Era III: uses Gilda dei Mercanti (e3_gld) with >= 3 buildings and Altoforno Reale (e3_frn) with >= 2 units, sacrificing least productive building', () => {
    const greedy = new GreedyBot();
    const state = createCustomGameState();
    const baseView = playerView(state, 'P1');

    const era3GuildView: PlayerView = {
      ...baseView,
      era: 3,
      phase: 'development',
      cycle: 1,
      self: {
        ...baseView.self,
        resources: { food: 2, wood: 2, metal: 1 },
        buildings: [
          makeCardInstance('b-e2-fnd', 'e2_fnd', 1),
          makeCardInstance('b-e1-farm', 'e1_farm', 2),
          makeCardInstance('b-e1-lumb', 'e1_lumb', 3),
        ],
        units: [],
        hand: [
          makeCardInstance('c-guild', 'e3_gld', 10),
          makeCardInstance('c-furnace', 'e3_frn', 11),
          makeCardInstance('c-unit', 'u3_inf_l', 12),
        ],
        legal: {
          ...baseView.self.legal,
          phase: 'development',
          canAct: true,
          canPass: true,
          playableFieldCardUids: [],
          playableConversionUids: ['c-guild', 'c-furnace'],
          sacrificableBuildingUids: ['b-e2-fnd', 'b-e1-farm', 'b-e1-lumb'],
        },
      },
    };

    const guildCmd = greedy.choose(era3GuildView, () => 0.5);
    expect(guildCmd).toEqual({
      type: 'PlayConversion',
      cardUid: 'c-guild',
      sacrificeUid: 'b-e1-farm',
    });

    const era3FurnaceView: PlayerView = {
      ...era3GuildView,
      self: {
        ...era3GuildView.self,
        buildings: [makeCardInstance('b-e1-farm', 'e1_farm', 2)],
        units: [
          makeUnitInstance('u-1', 'u3_inf_l', 'front', 8, 1),
          makeUnitInstance('u-2', 'u3_cav_l', 'center', 6, 2),
        ],
        legal: {
          ...era3GuildView.self.legal,
          playableConversionUids: ['c-guild', 'c-furnace'],
          sacrificableBuildingUids: ['b-e1-farm'],
        },
      },
    };

    const furnaceCmd = greedy.choose(era3FurnaceView, () => 0.5);
    expect(furnaceCmd).toEqual({
      type: 'PlayConversion',
      cardUid: 'c-furnace',
      sacrificeUid: 'b-e1-farm',
    });
  });

  it('prebattle: selects Pioggia di Frecce, Grido di Guerra/Carica Eroica, Mina Sotterranea/Fuoco Greco, and Palizzata Extra according to §7.1', () => {
    const greedy = new GreedyBot();
    const state = createCustomGameState();
    const baseView = playerView(state, 'P1');

    const archersPrebattleView: PlayerView = {
      ...baseView,
      era: 2,
      phase: 'prebattle',
      self: {
        ...baseView.self,
        resources: { food: 4, wood: 4, metal: 4 },
        walls: 8,
        units: [
          makeUnitInstance('a1', 'u1_arc_l', 'rear', 1, 1, 'P1', true),
          makeUnitInstance('a2', 'u2_arc_l', 'rear', 2, 2, 'P1', true),
        ],
        hand: [makeCardInstance('inst-arr', 'i1_arr', 1)],
        legal: {
          ...baseView.self.legal,
          phase: 'prebattle',
          canAct: true,
          canLockInstants: true,
          playableInstantUids: ['inst-arr'],
        },
      },
      opponent: {
        ...baseView.opponent,
        walls: 8,
        units: [
          {
            uid: 'e1',
            cardId: 'u1_inf_l',
            owner: 'P2',
            seq: 3,
            hp: 3,
            line: 'front',
            atkMod: 0,
            revealed: true,
          },
        ],
      },
    };

    expect(greedy.choose(archersPrebattleView, () => 0.5)).toEqual({
      type: 'LockInstants',
      cardUids: ['inst-arr'],
    });

    const singleArcherView: PlayerView = {
      ...archersPrebattleView,
      self: {
        ...archersPrebattleView.self,
        units: [archersPrebattleView.self.units[0]!],
      },
    };
    expect(greedy.choose(singleArcherView, () => 0.5)).toEqual({
      type: 'LockInstants',
      cardUids: [],
    });

    const frontAndSabotageView: PlayerView = {
      ...archersPrebattleView,
      self: {
        ...archersPrebattleView.self,
        resources: { food: 5, wood: 5, metal: 5 },
        units: [
          makeUnitInstance('f1', 'u2_inf_l', 'front', 5, 1, 'P1', true),
          makeUnitInstance('f2', 'u2_inf_h', 'front', 8, 2, 'P1', true),
        ],
        hand: [
          makeCardInstance('inst-mor', 'i2_mor', 1),
          makeCardInstance('inst-sab', 'i2_sab', 2),
        ],
        legal: {
          ...archersPrebattleView.self.legal,
          playableInstantUids: ['inst-mor', 'inst-sab'],
        },
      },
      opponent: {
        ...archersPrebattleView.opponent,
        walls: 8,
      },
    };

    const frontSabCmd = greedy.choose(frontAndSabotageView, () => 0.5);
    expect(frontSabCmd.type).toBe('LockInstants');
    if (frontSabCmd.type === 'LockInstants') {
      expect(frontSabCmd.cardUids).toContain('inst-mor');
      expect(frontSabCmd.cardUids).toContain('inst-sab');
    }

    const palisadeFearView: PlayerView = {
      ...archersPrebattleView,
      self: {
        ...archersPrebattleView.self,
        walls: 2,
        units: [],
        hand: [makeCardInstance('inst-wall', 'i1_wall', 1)],
        legal: {
          ...archersPrebattleView.self.legal,
          playableInstantUids: ['inst-wall'],
        },
      },
      opponent: {
        ...archersPrebattleView.opponent,
        units: [
          {
            uid: 'e-cav',
            cardId: 'u2_cav_h',
            owner: 'P2',
            seq: 1,
            hp: 6,
            line: 'center',
            atkMod: 0,
            revealed: true,
          },
        ],
      },
    };
    expect(predictsEnemyBreach(palisadeFearView, catalog)).toBe(true);
    expect(greedy.choose(palisadeFearView, () => 0.5)).toEqual({
      type: 'LockInstants',
      cardUids: ['inst-wall'],
    });
  });
});

describe('@epochs/bots — RationalBot raid-denial heuristics (TECH-SPEC §7.1)', () => {
  it('extends GreedyBot and spends residual Food and Wood in prebattle when predicting an enemy breach', () => {
    const greedy = new GreedyBot();
    const rational = new RationalBot();
    expect(rational).toBeInstanceOf(GreedyBot);

    const state = createCustomGameState();
    const baseView = playerView(state, 'P1');

    const breachPrebattleView: PlayerView = {
      ...baseView,
      era: 2,
      phase: 'prebattle',
      self: {
        ...baseView.self,
        resources: { food: 2, wood: 2, metal: 1 },
        walls: 2,
        units: [],
        hand: [
          makeCardInstance('inst-arr', 'i1_arr', 1),
          makeCardInstance('inst-mor', 'i2_mor', 2),
        ],
        legal: {
          ...baseView.self.legal,
          phase: 'prebattle',
          canAct: true,
          canLockInstants: true,
          playableInstantUids: ['inst-arr', 'inst-mor'],
        },
      },
      opponent: {
        ...baseView.opponent,
        walls: 8,
        units: [
          {
            uid: 'e1',
            cardId: 'u2_cav_h',
            owner: 'P2',
            seq: 1,
            hp: 6,
            line: 'center',
            atkMod: 0,
            revealed: true,
          },
          {
            uid: 'e2',
            cardId: 'u2_inf_h',
            owner: 'P2',
            seq: 2,
            hp: 8,
            line: 'front',
            atkMod: 0,
            revealed: true,
          },
        ],
      },
    };

    expect(greedy.choose(breachPrebattleView, () => 0.5)).toEqual({
      type: 'LockInstants',
      cardUids: [],
    });

    const rationalCmd = rational.choose(breachPrebattleView, () => 0.5);
    expect(rationalCmd.type).toBe('LockInstants');
    if (rationalCmd.type === 'LockInstants') {
      expect(rationalCmd.cardUids).toContain('inst-arr');
      expect(rationalCmd.cardUids).toContain('inst-mor');
    }
  });

  it('spends residual Food and Wood in development when predicting a breach instead of passing with raidable stock', () => {
    const greedy = new GreedyBot();
    const rational = new RationalBot();

    const state = createCustomGameState();
    const baseView = playerView(state, 'P1');

    const devBreachView: PlayerView = {
      ...baseView,
      era: 3,
      phase: 'development',
      cycle: 3,
      self: {
        ...baseView.self,
        resources: { food: 0, wood: 2, metal: 0 },
        walls: 2,
        buildings: [],
        units: [],
        hand: [makeCardInstance('c-farm', 'e1_farm', 1)],
        legal: {
          ...baseView.self.legal,
          phase: 'development',
          canAct: true,
          canPass: true,
          playableFieldCardUids: ['c-farm'],
          playableConversionUids: [],
          sacrificableBuildingUids: [],
        },
      },
      opponent: {
        ...baseView.opponent,
        slotsUsed: 3,
        coveredCount: 3,
        demBonus: 1,
      },
    };

    expect(predictsEnemyBreach(devBreachView, catalog)).toBe(true);
    expect(greedy.choose(devBreachView, () => 0.5)).toEqual({ type: 'Pass' });
    expect(rational.choose(devBreachView, () => 0.5)).toEqual({
      type: 'PlayCard',
      cardUid: 'c-farm',
    });
  });

  it('supports hand_limit discard heuristic and error paths', () => {
    const greedy = new GreedyBot(catalog);
    const rational = new RationalBot(catalog);
    const state = createCustomGameState();
    const baseView = playerView(state, 'P1');

    const handLimitView: PlayerView = {
      ...baseView,
      era: 3,
      phase: 'hand_limit',
      self: {
        ...baseView.self,
        buildings: [makeCardInstance('b1', 'e1_farm', 1)],
        hand: [
          makeCardInstance('h1', 'e1_farm', 1),
          makeCardInstance('h2', 'e1_lumb', 2),
          makeCardInstance('h3', 'u3_inf_h', 3),
          makeCardInstance('h4', 'u3_cav_h', 4),
          makeCardInstance('h5', 'u3_arc_h', 5),
          makeCardInstance('h6', 'e3_gld', 6),
          makeCardInstance('h7', 'e3_frn', 7),
          makeCardInstance('h8', 'i3_fir', 8),
          makeCardInstance('h9', 'i3_ral', 9),
          makeCardInstance('h10', 'u2_inf_h', 10),
          makeCardInstance('h11', 'u2_cav_h', 11),
          makeCardInstance('h12', 'u2_cav_h', 12),
        ],
        legal: {
          ...baseView.self.legal,
          phase: 'hand_limit',
          canAct: true,
          canSubmitDiscard: true,
          mustDiscardCount: 2,
        },
      },
    };

    const discardCmd = greedy.choose(handLimitView, () => 0.5);
    expect(discardCmd).toEqual({
      type: 'SubmitDiscard',
      cardUids: ['h1', 'h2'],
    });

    expect(
      calculateTotalDemForView(['u1_inf_l', 'u3_sig_h'], 3, 1, catalog),
    ).toBe(1 + 1 + (18 + 1));

    expect(() =>
      rational.choose(
        {
          ...baseView,
          phase: 'prebattle',
          self: {
            ...baseView.self,
            legal: {
              ...baseView.self.legal,
              phase: 'prebattle',
              canAct: true,
              canLockInstants: false,
            },
          },
        },
        () => 0.5,
      ),
    ).toThrow(/cannot lock instants/);
  });
});

describe('@epochs/bots — Full match & multi-hundred state validation against apply()', () => {
  it('guarantees that every move chosen by RandomBot, GreedyBot, and RationalBot across hundreds of states is accepted by apply()', () => {
    const randomBot = new RandomBot({ catalog });
    const greedyBot = new GreedyBot({ catalog });
    const rationalBot = new RationalBot({ catalog });
    const allBots = [randomBot, greedyBot, rationalBot] as const;

    const decks = [aggroDeck, balancedDeck, boomDeck] as const;
    let totalStatesValidated = 0;
    let totalGamesCompleted = 0;

    for (let gameIdx = 0; gameIdx < 18; gameIdx++) {
      const deckP1 = decks[gameIdx % decks.length]!;
      const deckP2 = decks[(gameIdx + 1) % decks.length]!;
      const driverBotP1 = allBots[gameIdx % allBots.length]!;
      const driverBotP2 = allBots[(gameIdx + 2) % allBots.length]!;
      const rng = makeDeterministicRng(`bots-suite-seed-${gameIdx}`);

      let { state } = createGame({
        seed: `match-seed-${gameIdx}`,
        catalog: catalog as Record<string, CardRules>,
        decks: {
          P1: deckP1,
          P2: deckP2,
        },
      });

      let steps = 0;
      while (state.phase !== 'finished' && steps < 500) {
        steps += 1;

        const actingPlayers: PlayerId[] = [];
        for (const p of PLAYERS_ORDER) {
          const view = playerView(state, p);
          if (view.self.legal.canAct) {
            actingPlayers.push(p);
          }
        }

        expect(actingPlayers.length).toBeGreaterThan(0);
        const activePlayer = actingPlayers[0]!;
        const view = playerView(state, activePlayer);

        for (const candidateBot of allBots) {
          const clientCmd = candidateBot.choose(view, rng);
          const fullCmd: Command = {
            ...clientCmd,
            player: activePlayer,
          };
          const checkResult = apply(state, fullCmd);
          expect(checkResult.ok).toBe(true);
        }
        totalStatesValidated += 1;

        const driverBot = activePlayer === 'P1' ? driverBotP1 : driverBotP2;
        const chosenClientCmd = driverBot.choose(view, rng);
        const transition = apply(state, {
          ...chosenClientCmd,
          player: activePlayer,
        });
        expect(transition.ok).toBe(true);
        if (transition.ok) {
          state = transition.value.state;
        }
      }

      expect(state.phase).toBe('finished');
      expect(state.result).not.toBeNull();
      totalGamesCompleted += 1;
    }

    expect(totalGamesCompleted).toBe(18);
    expect(totalStatesValidated).toBeGreaterThan(400);
  });
});
