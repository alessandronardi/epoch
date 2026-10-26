// TECH-SPEC §10.1 Livello B, Appendice A (TV-01 – TV-25)
// Suite normativa completa dei 25+ Vettori di Test Nominali verificati end-to-end tramite l'API pubblica di @epochs/engine.

import { describe, expect, it } from 'vitest';
import {
  apply,
  autoDiscard,
  calculateCityHp,
  calculateRaidTransfer,
  calculateSiege,
  calculateWallCarryover,
  createGame,
  legalCommands,
  playerView,
  projectEvent,
  type CardInstance,
  type CardRules,
  type EraNo,
  type GameEvent,
  type GameState,
  type PlayerId,
} from '../src/index.js';
import cardsRulesJson from '../../../data/cards.rules.json' with { type: 'json' };

const catalog = cardsRulesJson as unknown as Record<string, CardRules>;

function makeSubdeck(cardIds: readonly string[], fillCardId: string): string[] {
  const result = [...cardIds];
  while (result.length < 20) {
    result.push(fillCardId);
  }
  return result.slice(0, 20);
}

function buildStandardFixedDecks(
  overrides?: Partial<Record<PlayerId, Partial<Record<EraNo, string[]>>>>,
): Record<PlayerId, Record<EraNo, string[]>> {
  const defaultEra1 = makeSubdeck(
    [
      'e1_farm',
      'e1_lumb',
      'e1_mine',
      'u1_inf_l',
      'u1_inf_h',
      'u1_spr_l',
      'u1_spr_h',
      'u1_arc_l',
      'u1_arc_h',
      'u1_cav_l',
      'u1_cav_h',
      'u1_sig_l',
      'u1_sig_h',
      'i1_arr',
      'i1_wall',
    ],
    'u1_inf_l',
  );
  const defaultEra2 = makeSubdeck(
    [
      'e2_mill',
      'e2_saw',
      'e2_fnd',
      'u2_inf_l',
      'u2_inf_h',
      'u2_spr_l',
      'u2_spr_h',
      'u2_arc_l',
      'u2_arc_h',
      'u2_cav_l',
      'u2_cav_h',
      'u2_sig_l',
      'u2_sig_h',
      'i2_sab',
      'i2_mor',
    ],
    'u2_inf_l',
  );
  const defaultEra3 = makeSubdeck(
    [
      'e3_gld',
      'e3_frn',
      'u3_inf_l',
      'u3_inf_h',
      'u3_spr_l',
      'u3_spr_h',
      'u3_arc_l',
      'u3_arc_h',
      'u3_cav_l',
      'u3_cav_h',
      'u3_sig_l',
      'u3_sig_m',
      'u3_sig_h',
      'i3_fir',
      'i3_ral',
    ],
    'u3_inf_l',
  );

  return {
    P1: {
      1: overrides?.P1?.[1] ?? [...defaultEra1],
      2: overrides?.P1?.[2] ?? [...defaultEra2],
      3: overrides?.P1?.[3] ?? [...defaultEra3],
    },
    P2: {
      1: overrides?.P2?.[1] ?? [...defaultEra1],
      2: overrides?.P2?.[2] ?? [...defaultEra2],
      3: overrides?.P2?.[3] ?? [...defaultEra3],
    },
  };
}

function unwrapApply(
  state: GameState,
  cmd: Parameters<typeof apply>[1],
): { state: GameState; events: GameEvent[] } {
  const res = apply(state, cmd);
  if (!res.ok) {
    throw new Error(
      `Expected command ${cmd.type} (${cmd.player}) to succeed, but failed with ${res.error.code}: ${res.error.message}`,
    );
  }
  return res.value;
}

function createDevelopmentGame(
  overrides?: Partial<Record<PlayerId, Partial<Record<EraNo, string[]>>>>,
  customCatalog: Record<string, CardRules> = catalog,
): GameState {
  const { state: s0 } = createGame({
    seed: 'tv-nominal-seed',
    catalog: structuredClone(customCatalog),
    fixedDecks: buildStandardFixedDecks(overrides),
    fixedInitiative: 'P1',
  });
  const { state: s1 } = unwrapApply(s0, {
    type: 'SubmitMulligan',
    player: 'P1',
    cardUids: [],
  });
  const { state: s2 } = unwrapApply(s1, {
    type: 'SubmitMulligan',
    player: 'P2',
    cardUids: [],
  });
  return structuredClone(s2);
}

describe('Appendice A — Suite completa dei 25 Vettori di Test Nominali (TV-01 – TV-25)', () => {
  it('TV-01: Risorse a inizio partita (2/2/0); poi raccolto d’apertura Era I (4/4/0) all’apertura del Ciclo 1', () => {
    const { state: initialState, events: initEvents } = createGame({
      seed: 'tv-01',
      catalog,
      fixedDecks: buildStandardFixedDecks(),
      fixedInitiative: 'P1',
    });

    expect(initialState.phase).toBe('mulligan');
    expect(initialState.players.P1.resources).toEqual({
      food: 2,
      wood: 2,
      metal: 0,
    });
    expect(initialState.players.P2.resources).toEqual({
      food: 2,
      wood: 2,
      metal: 0,
    });
    expect(
      initEvents.filter(
        (e) => e.type === 'ResourcesChanged' && e.reason === 'initial',
      ),
    ).toHaveLength(2);

    const { state: afterP1 } = unwrapApply(initialState, {
      type: 'SubmitMulligan',
      player: 'P1',
      cardUids: [],
    });
    const { state: afterBoth, events: mulliganEvents } = unwrapApply(afterP1, {
      type: 'SubmitMulligan',
      player: 'P2',
      cardUids: [],
    });

    expect(afterBoth.phase).toBe('development');
    expect(afterBoth.era).toBe(1);
    expect(afterBoth.cycle).toBe(1);
    expect(afterBoth.players.P1.resources).toEqual({
      food: 4,
      wood: 4,
      metal: 0,
    });
    expect(afterBoth.players.P2.resources).toEqual({
      food: 4,
      wood: 4,
      metal: 0,
    });
    expect(
      mulliganEvents.some(
        (e) =>
          e.type === 'ResourcesChanged' &&
          e.player === 'P1' &&
          e.reason === 'harvest' &&
          e.resources.food === 4 &&
          e.resources.wood === 4 &&
          e.resources.metal === 0,
      ),
    ).toBe(true);
  });

  it('TV-02: Era II con Fattoria (1,0,0) e Fonderia (0,0,2) attive; raccolto (4,2,5) e rendite Ciclo 2 e 3 (2,1,2)', () => {
    const state = createDevelopmentGame();
    // Prepara fine Era I con Fattoria e Fonderia già attive per P1 e saldo azzerato per verificare gli accrediti puri
    state.players.P1.buildings = [
      { uid: 'b_farm', cardId: 'e1_farm', owner: 'P1', drawnOrder: 1 },
      { uid: 'b_fnd', cardId: 'e2_fnd', owner: 'P1', drawnOrder: 2 },
    ];
    state.players.P1.resources = { food: 0, wood: 0, metal: 0 };
    state.players.P2.resources = { food: 0, wood: 0, metal: 0 };
    state.players.P1.hand = [];
    state.players.P2.hand = [];

    // Entrambi passano in Era I e bloccano 0 istantanee -> transizione in Era II
    const { state: sPass1 } = unwrapApply(state, {
      type: 'Pass',
      player: 'P1',
    });
    const { state: sPrebattle } = unwrapApply(sPass1, {
      type: 'Pass',
      player: 'P2',
    });
    const { state: sLock1 } = unwrapApply(sPrebattle, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    });
    const { state: era2Cycle1, events: era2StartEvents } = unwrapApply(sLock1, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });

    expect(era2Cycle1.era).toBe(2);
    expect(era2Cycle1.phase).toBe('development');
    expect(era2Cycle1.cycle).toBe(1);
    expect(era2Cycle1.toAct).toBe('P2');

    // Raccolto d'apertura Era II: (2,2,1) + 2*(1,0,2) = (4,2,5)
    expect(era2Cycle1.players.P1.resources).toEqual({
      food: 4,
      wood: 2,
      metal: 5,
    });
    const p1HarvestEvent = era2StartEvents.find(
      (e) =>
        e.type === 'ResourcesChanged' &&
        e.player === 'P1' &&
        e.reason === 'harvest',
    );
    expect(p1HarvestEvent).toBeDefined();
    if (p1HarvestEvent?.type === 'ResourcesChanged') {
      expect(p1HarvestEvent.delta).toEqual({ food: 4, wood: 2, metal: 5 });
    }

    // In Ciclo 1 di Era II (iniziativa P2): P2 gioca al Ciclo 1 e P1 passa -> si apre Ciclo 2
    const era2State = structuredClone(era2Cycle1);
    era2State.players.P2.resources = { food: 10, wood: 10, metal: 10 };
    era2State.players.P2.hand = [
      { uid: 'p2_u1', cardId: 'u1_inf_l', owner: 'P2', drawnOrder: 50 },
      { uid: 'p2_u2', cardId: 'u1_inf_l', owner: 'P2', drawnOrder: 51 },
    ];

    // Ciclo 1: P2 (primo di iniziativa in Era II) gioca p2_u1, poi P1 passa -> si apre Ciclo 2
    const { state: afterP2C1 } = unwrapApply(era2State, {
      type: 'PlayCard',
      player: 'P2',
      cardUid: 'p2_u1',
    });
    const { state: era2Cycle2, events: c2Events } = unwrapApply(afterP2C1, {
      type: 'Pass',
      player: 'P1',
    });

    expect(era2Cycle2.cycle).toBe(2);
    // Rendita Ciclo 2 per P1: (1,1,0) + (1,0,2) = (2,1,2) -> (4+2, 2+1, 5+2) = (6,3,7)
    expect(era2Cycle2.players.P1.resources).toEqual({
      food: 6,
      wood: 3,
      metal: 7,
    });
    const p1RentC2 = c2Events.find(
      (e) =>
        e.type === 'ResourcesChanged' &&
        e.player === 'P1' &&
        e.reason === 'rent',
    );
    expect(p1RentC2).toBeDefined();
    if (p1RentC2?.type === 'ResourcesChanged') {
      expect(p1RentC2.delta).toEqual({ food: 2, wood: 1, metal: 2 });
    }

    // Ciclo 2: P2 gioca p2_u2 (P1 ha già passato) -> si apre Ciclo 3
    const { state: era2Cycle3, events: c3Events } = unwrapApply(era2Cycle2, {
      type: 'PlayCard',
      player: 'P2',
      cardUid: 'p2_u2',
    });

    expect(era2Cycle3.cycle).toBe(3);
    // Rendita Ciclo 3 per P1: +(2,1,2) -> (8,4,9)
    expect(era2Cycle3.players.P1.resources).toEqual({
      food: 8,
      wood: 4,
      metal: 9,
    });
    const p1RentC3 = c3Events.find(
      (e) =>
        e.type === 'ResourcesChanged' &&
        e.player === 'P1' &&
        e.reason === 'rent',
    );
    expect(p1RentC3).toBeDefined();
    if (p1RentC3?.type === 'ResourcesChanged') {
      expect(p1RentC3.delta).toEqual({ food: 2, wood: 1, metal: 2 });
    }
  });

  it('TV-03: Era I, risorse (6,6,0), accredito +2 food -> Cibo troncato a 7 (cap Era I), ResourcesOverflowed con overflow 1', () => {
    const state = createDevelopmentGame();
    // P1 ha 1 Fattoria attiva (+1 food), così la rendita del Ciclo 2 accredita (+2 food, +1 wood)
    state.players.P1.buildings = [
      { uid: 'b_farm', cardId: 'e1_farm', owner: 'P1', drawnOrder: 1 },
    ];
    state.players.P1.resources = { food: 6, wood: 6, metal: 0 };
    state.players.P2.hand = [
      { uid: 'p2_u1', cardId: 'u1_inf_l', owner: 'P2', drawnOrder: 20 },
    ];

    const { state: s1 } = unwrapApply(state, { type: 'Pass', player: 'P1' });
    const { state: s2, events } = unwrapApply(s1, {
      type: 'PlayCard',
      player: 'P2',
      cardUid: 'p2_u1',
    });

    expect(s2.cycle).toBe(2);
    expect(s2.players.P1.resources.food).toBe(7);
    const overflowEv = events.find(
      (e) => e.type === 'ResourcesOverflowed' && e.player === 'P1',
    );
    expect(overflowEv).toBeDefined();
    if (overflowEv?.type === 'ResourcesOverflowed') {
      expect(overflowEv.overflow.food).toBe(1);
    }
  });

  it('TV-04: Riporto Mura residue [0, 1, 2, 3, 4, 5, 6, 9] passando all’Era II (base 8) -> [8, 8, 9, 9, 10, 10, 11, 12]', () => {
    const residuals = [0, 1, 2, 3, 4, 5, 6, 9];
    const expected = [8, 8, 9, 9, 10, 10, 11, 12];

    expect(residuals.map((w) => calculateWallCarryover(2, w))).toEqual(
      expected,
    );

    for (let i = 0; i < residuals.length; i++) {
      const state = createDevelopmentGame();
      state.players.P1.walls = residuals[i]!;
      const { state: s1 } = unwrapApply(state, { type: 'Pass', player: 'P1' });
      const { state: s2 } = unwrapApply(s1, { type: 'Pass', player: 'P2' });
      const { state: s3 } = unwrapApply(s2, {
        type: 'LockInstants',
        player: 'P1',
        cardUids: [],
      });
      const { state: s4 } = unwrapApply(s3, {
        type: 'LockInstants',
        player: 'P2',
        cardUids: [],
      });

      expect(s4.era).toBe(2);
      expect(s4.players.P1.walls).toBe(expected[i]);
    }
  });

  it('TV-04b: Riporto Mura passando all’Era III (base 10): residue [8, 11, 15] -> [14, 15, 17]', () => {
    const residuals = [8, 11, 15];
    const expected = [14, 15, 17];

    expect(residuals.map((w) => calculateWallCarryover(3, w))).toEqual(
      expected,
    );

    for (let i = 0; i < residuals.length; i++) {
      const state = createDevelopmentGame();
      state.era = 2;
      state.initiative = 'P2';
      state.toAct = 'P2';
      state.players.P1.walls = residuals[i]!;

      const { state: s1 } = unwrapApply(state, { type: 'Pass', player: 'P2' });
      const { state: s2 } = unwrapApply(s1, { type: 'Pass', player: 'P1' });
      const { state: s3 } = unwrapApply(s2, {
        type: 'LockInstants',
        player: 'P1',
        cardUids: [],
      });
      const { state: s4 } = unwrapApply(s3, {
        type: 'LockInstants',
        player: 'P2',
        cardUids: [],
      });

      expect(s4.era).toBe(3);
      expect(s4.players.P1.walls).toBe(expected[i]);
    }
  });

  it('TV-05: Centro Città con danno diretto accumulato cityDamage = 3 -> Era I: 7/10; Era II: 13/16; Era III: 19/22', () => {
    expect(calculateCityHp(1, 3)).toEqual({ cityHp: 7, cityMax: 10 });
    expect(calculateCityHp(2, 3)).toEqual({ cityHp: 13, cityMax: 16 });
    expect(calculateCityHp(3, 3)).toEqual({ cityHp: 19, cityMax: 22 });

    const state = createDevelopmentGame();
    state.players.P1.cityDamage = 3;
    expect(playerView(state, 'P1').self.cityHp).toBe(7);
    expect(playerView(state, 'P1').self.cityMax).toBe(10);

    // Passiamo in Era II
    const { state: s1 } = unwrapApply(state, { type: 'Pass', player: 'P1' });
    const { state: s2 } = unwrapApply(s1, { type: 'Pass', player: 'P2' });
    const { state: s3 } = unwrapApply(s2, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    });
    const { state: era2 } = unwrapApply(s3, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });
    expect(playerView(era2, 'P1').self.cityHp).toBe(13);
    expect(playerView(era2, 'P1').self.cityMax).toBe(16);

    // Passiamo in Era III (gestendo eventuale hand_limit)
    let curr = era2;
    if (curr.phase === 'hand_limit') {
      for (const p of ['P1', 'P2'] as const) {
        if (curr.players[p].hand.length > 10) {
          curr = unwrapApply(curr, {
            type: 'ApplyTimeout',
            player: p,
          }).state;
        }
      }
    }
    const { state: s5 } = unwrapApply(curr, { type: 'Pass', player: 'P2' });
    const { state: s6 } = unwrapApply(s5, { type: 'Pass', player: 'P1' });
    const { state: s7 } = unwrapApply(s6, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    });
    const { state: era3 } = unwrapApply(s7, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });
    expect(playerView(era3, 'P1').self.cityHp).toBe(19);
    expect(playerView(era3, 'P1').self.cityMax).toBe(22);
  });

  it('TV-06: Fase 4 con coppie (D, W) = (0,0), (5,8), (10,11), (11,11), (12,11), (13,8), (1,0)', () => {
    const cases: Array<{
      D: number;
      W: number;
      expected: [boolean, number, number];
    }> = [
      { D: 0, W: 0, expected: [false, 0, 0] },
      { D: 5, W: 8, expected: [false, 3, 0] },
      { D: 10, W: 11, expected: [false, 1, 0] },
      { D: 11, W: 11, expected: [true, 0, 0] },
      { D: 12, W: 11, expected: [true, 0, 1] },
      { D: 13, W: 8, expected: [true, 0, 5] },
      { D: 1, W: 0, expected: [true, 0, 1] },
    ];

    for (const { D, W, expected } of cases) {
      const calc = calculateSiege(D, W);
      expect([calc.breach, calc.wallsAfter, calc.directDamage]).toEqual(
        expected,
      );

      // Verifica end-to-end via apply(LockInstants)
      const state = createDevelopmentGame();
      state.players.P2.walls = W;
      // P1 ha un combattente con DEM 0 (u1_spr_l) e demBonus = D così la DEM totale è esattamente D
      state.players.P1.units = [
        {
          uid: 'u_atk',
          cardId: 'u1_spr_l',
          owner: 'P1',
          drawnOrder: 1,
          seq: 1,
          hp: 3,
          line: 'front',
          atkMod: 0,
          revealed: false,
        },
      ];
      state.players.P1.demBonus = D;

      const { state: s1 } = unwrapApply(state, { type: 'Pass', player: 'P1' });
      const { state: s2 } = unwrapApply(s1, { type: 'Pass', player: 'P2' });
      const { state: s3 } = unwrapApply(s2, {
        type: 'LockInstants',
        player: 'P1',
        cardUids: [],
      });
      const { events } = unwrapApply(s3, {
        type: 'LockInstants',
        player: 'P2',
        cardUids: [],
      });

      const siegeEv = events.find((e) => e.type === 'SiegeResolved');
      expect(siegeEv).toBeDefined();
      if (siegeEv?.type === 'SiegeResolved') {
        expect([
          siegeEv.breach,
          siegeEv.wallsAfter,
          siegeEv.directDamage,
        ]).toEqual(expected);
      }
    }
  });

  it('TV-07: Razzia in Era I: attaccante Cibo 7 Legno 5, difensore Cibo 3 Legno 0 -> (0, 0) trasferiti', () => {
    expect(
      calculateRaidTransfer(
        { food: 7, wood: 5, metal: 0 },
        { food: 3, wood: 0, metal: 0 },
        1,
      ),
    ).toEqual({ foodTransferred: 0, woodTransferred: 0 });

    const state = createDevelopmentGame();
    state.players.P1.resources = { food: 7, wood: 5, metal: 0 };
    state.players.P2.resources = { food: 3, wood: 0, metal: 0 };
    state.players.P2.walls = 1;
    state.players.P1.units = [
      {
        uid: 'u1',
        cardId: 'u1_inf_l', // DEM 1 -> breach (D=1 >= W=1)
        owner: 'P1',
        drawnOrder: 1,
        seq: 1,
        hp: 3,
        line: 'front',
        atkMod: 0,
        revealed: false,
      },
    ];

    const { state: s1 } = unwrapApply(state, { type: 'Pass', player: 'P1' });
    const { state: s2 } = unwrapApply(s1, { type: 'Pass', player: 'P2' });
    const { state: s3 } = unwrapApply(s2, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    });
    const { events } = unwrapApply(s3, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });

    const raidEv = events.find((e) => e.type === 'RaidResolved');
    expect(raidEv).toBeDefined();
    if (raidEv?.type === 'RaidResolved') {
      expect(raidEv.foodTransferred).toBe(0);
      expect(raidEv.woodTransferred).toBe(0);
    }
  });

  it('TV-07b: Razzia in Era I: attaccante (6,5,0), difensore (3,2,4) -> +1 Cibo/+1 Legno attaccante (7,6,0), difensore (2,1,4), Metallo mai razziato', () => {
    const state = createDevelopmentGame();
    state.players.P1.resources = { food: 6, wood: 5, metal: 0 };
    state.players.P2.resources = { food: 3, wood: 2, metal: 4 };
    state.players.P2.walls = 1;
    state.players.P1.units = [
      {
        uid: 'u1',
        cardId: 'u1_inf_l', // DEM 1 -> breach (D=1 >= W=1)
        owner: 'P1',
        drawnOrder: 1,
        seq: 1,
        hp: 3,
        line: 'front',
        atkMod: 0,
        revealed: false,
      },
    ];

    const { state: s1 } = unwrapApply(state, { type: 'Pass', player: 'P1' });
    const { state: s2 } = unwrapApply(s1, { type: 'Pass', player: 'P2' });
    const { state: s3 } = unwrapApply(s2, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    });
    const { events } = unwrapApply(s3, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });

    const raidEv = events.find((e) => e.type === 'RaidResolved');
    expect(raidEv).toBeDefined();
    if (raidEv?.type === 'RaidResolved') {
      expect(raidEv.foodTransferred).toBe(1);
      expect(raidEv.woodTransferred).toBe(1);
    }

    const raidResourceEvents = events.filter(
      (e) => e.type === 'ResourcesChanged' && e.reason === 'raid',
    );
    expect(raidResourceEvents).toHaveLength(2);
    const defEv = raidResourceEvents.find(
      (e) => e.type === 'ResourcesChanged' && e.player === 'P2',
    );
    const atkEv = raidResourceEvents.find(
      (e) => e.type === 'ResourcesChanged' && e.player === 'P1',
    );
    if (defEv?.type === 'ResourcesChanged') {
      expect(defEv.resources).toEqual({ food: 2, wood: 1, metal: 4 });
    }
    if (atkEv?.type === 'ResourcesChanged') {
      expect(atkEv.resources).toEqual({ food: 7, wood: 6, metal: 0 });
    }
  });

  it('TV-07c: Fase 4 che porta il Centro Città del difensore a <= 0 HP con breach = true -> vittoria immediata annihilation, nessuna razzia', () => {
    const state = createDevelopmentGame();
    state.players.P1.resources = { food: 4, wood: 4, metal: 0 };
    state.players.P2.resources = { food: 5, wood: 5, metal: 2 };
    state.players.P2.walls = 1;
    state.players.P2.cityDamage = 9; // 1 HP rimanente in Era I (10 - 9 = 1)
    state.players.P1.units = [
      {
        uid: 'u1',
        cardId: 'u1_inf_l', // DEM 1
        owner: 'P1',
        drawnOrder: 1,
        seq: 1,
        hp: 3,
        line: 'front',
        atkMod: 0,
        revealed: false,
      },
      {
        uid: 'u2',
        cardId: 'u1_sig_l', // DEM 2 -> D = 3, W = 1 -> directDamage = 2 -> cityHp = -1 <= 0
        owner: 'P1',
        drawnOrder: 2,
        seq: 2,
        hp: 2,
        line: 'rear',
        atkMod: 0,
        revealed: false,
      },
    ];

    const { state: s1 } = unwrapApply(state, { type: 'Pass', player: 'P1' });
    const { state: s2 } = unwrapApply(s1, { type: 'Pass', player: 'P2' });
    const { state: s3 } = unwrapApply(s2, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    });
    const { state: sFinal, events } = unwrapApply(s3, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });

    expect(sFinal.phase).toBe('finished');
    expect(sFinal.result).toEqual({ kind: 'annihilation', winner: 'P1' });
    expect(events.some((e) => e.type === 'RaidResolved')).toBe(false);
    expect(sFinal.players.P2.resources).toEqual({
      food: 5,
      wood: 5,
      metal: 2,
    });
  });

  it('TV-08: Mulligan Era I: sotto-mazzo [c1..c20], mano c1..c8, cambia {c2, c5} -> mano {c1,c3,c4,c6,c7,c8,c9,c10}, sotto-mazzo [c11..c20, c2, c5]', () => {
    const { state: s0 } = createGame({
      seed: 'tv-08',
      catalog,
      fixedDecks: buildStandardFixedDecks(),
      fixedInitiative: 'P1',
    });

    const initialAllUids = [
      ...s0.players.P1.hand.map((c) => c.uid),
      ...s0.players.P1.subdecks[1].map((c) => c.uid),
    ];
    expect(initialAllUids).toHaveLength(20);

    const c = (idx1Based: number): string => initialAllUids[idx1Based - 1]!;

    // Il giocatore P1 cambia {c2, c5} (anche passati in ordine inverso per verificare ordinamento drawnOrder R6)
    const { state: s1 } = unwrapApply(s0, {
      type: 'SubmitMulligan',
      player: 'P1',
      cardUids: [c(5), c(2)],
    });
    const { state: s2 } = unwrapApply(s1, {
      type: 'SubmitMulligan',
      player: 'P2',
      cardUids: [],
    });

    expect(s2.players.P1.hand.map((card) => card.uid)).toEqual([
      c(1),
      c(3),
      c(4),
      c(6),
      c(7),
      c(8),
      c(9),
      c(10),
    ]);
    expect(s2.players.P1.subdecks[1].map((card) => card.uid)).toEqual([
      c(11),
      c(12),
      c(13),
      c(14),
      c(15),
      c(16),
      c(17),
      c(18),
      c(19),
      c(20),
      c(2),
      c(5),
    ]);
  });

  it('TV-09: Mano di 12 carte a inizio Era II, autoDiscard di 2 carte: priorità Era inferiore, poi costo totale inferiore, poi drawnOrder 3 prima di 5 (FIFO)', () => {
    // 1. Verifica con una sola carta di Era I (costo alto 4) + 11 carte di Era II (tra cui costo 3 con drawnOrder 5 e drawnOrder 3):
    // scarta prima la carta di Era I (anche se costa 4 > 3), e come seconda la carta di Era II a costo minimo con drawnOrder 3 prima di 5
    const handEraThenFifo: CardInstance[] = [
      { uid: 'e2_cost3_do5', cardId: 'i2_sab', owner: 'P1', drawnOrder: 5 }, // Era 2, costo 3 (1+0+2), drawnOrder 5
      { uid: 'e2_cost3_do3', cardId: 'i2_mor', owner: 'P1', drawnOrder: 3 }, // Era 2, costo 3 (2+0+1), drawnOrder 3
      { uid: 'e1_cost4_do9', cardId: 'e1_mine', owner: 'P1', drawnOrder: 9 }, // Era 1, costo 4 (2+2+0)
      ...Array.from({ length: 9 }, (_, idx) => ({
        uid: `e2_heavy_${idx}`,
        cardId: 'u2_sig_h', // Era 2, costo 6 (0+4+2)
        owner: 'P1' as const,
        drawnOrder: 10 + idx,
      })),
    ];

    expect(autoDiscard(handEraThenFifo, catalog, 2)).toEqual([
      'e1_cost4_do9',
      'e2_cost3_do3',
    ]);

    // 2. Verifica end-to-end via ApplyTimeout in fase hand_limit a inizio Era II con 12 carte in mano (parità Era I e costo 2, drawnOrder 3 vs 5)
    const state = createDevelopmentGame();
    state.era = 2;
    state.phase = 'hand_limit';
    state.toAct = null;
    state.players.P1.hand = [
      { uid: 'c_e1_cost2_do5', cardId: 'e1_lumb', owner: 'P1', drawnOrder: 5 }, // Era 1, costo 2, drawnOrder 5
      { uid: 'c_e1_cost2_do3', cardId: 'e1_farm', owner: 'P1', drawnOrder: 3 }, // Era 1, costo 2, drawnOrder 3
      { uid: 'c_e1_cost3_do1', cardId: 'u1_inf_h', owner: 'P1', drawnOrder: 1 }, // Era 1, costo 3, drawnOrder 1
      ...Array.from({ length: 9 }, (_, idx) => ({
        uid: `c_e2_${idx}`,
        cardId: 'e2_mill', // Era 2, costo 5
        owner: 'P1' as const,
        drawnOrder: 10 + idx,
      })),
    ];

    const { state: afterTimeout } = unwrapApply(state, {
      type: 'ApplyTimeout',
      player: 'P1',
    });

    expect(afterTimeout.phase).toBe('development');
    expect(afterTimeout.players.P1.hand).toHaveLength(10);
    expect(afterTimeout.players.P1.discard.map((c) => c.uid)).toEqual([
      'c_e1_cost2_do3',
      'c_e1_cost2_do5',
    ]);
  });

  it('TV-10: Assegnazione danno 5 contro bersagli in Fronte [Milizia Cittadina hp 3 seq 1, Fante con Scudo hp 5 seq 2] -> Milizia muore, Fante resta a hp 3', () => {
    const state = createDevelopmentGame();
    // P1 schiera Balestriere Pesante (ATK 5, Tiro in Fase 1 = 5 danni)
    state.players.P1.units = [
      {
        uid: 'p1_arc',
        cardId: 'u2_arc_h',
        owner: 'P1',
        drawnOrder: 1,
        seq: 1,
        hp: 3,
        line: 'rear',
        atkMod: 0,
        revealed: false,
      },
    ];
    // P2 schiera Milizia Cittadina (hp 3, seq 1) e Fante con Scudo (hp 5, seq 2)
    state.players.P2.units = [
      {
        uid: 'p2_milizia',
        cardId: 'u1_inf_l',
        owner: 'P2',
        drawnOrder: 2,
        seq: 1,
        hp: 3,
        line: 'front',
        atkMod: 0,
        revealed: false,
      },
      {
        uid: 'p2_fante',
        cardId: 'u1_inf_h',
        owner: 'P2',
        drawnOrder: 3,
        seq: 2,
        hp: 5,
        line: 'front',
        atkMod: 0,
        revealed: false,
      },
    ];

    const { state: s1 } = unwrapApply(state, { type: 'Pass', player: 'P1' });
    const { state: s2 } = unwrapApply(s1, { type: 'Pass', player: 'P2' });
    const { state: s3 } = unwrapApply(s2, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    });
    const { events } = unwrapApply(s3, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });

    const phase1 = events.find(
      (e) => e.type === 'BattlePhaseResolved' && e.phase === 'phase1_volley',
    );
    expect(phase1).toBeDefined();
    if (phase1?.type === 'BattlePhaseResolved') {
      expect(phase1.damageDealt.P1).toBe(5);
      expect(phase1.assignments.P1).toEqual([
        { uid: 'p2_milizia', damage: 3 },
        { uid: 'p2_fante', damage: 2 },
      ]);
      expect(phase1.casualties.P2).toEqual(['p2_milizia']);
    }
  });

  it('TV-11: Era I, zero Istantanee: P1 Milizia Cittadina (2/1/3) vs P2 Fante con Scudo (2/1/5); Mura P1 = 6 -> vince P2 al Ciclo 2 di Fase 3, Mura P1 = 5, breach=false', () => {
    const state = createDevelopmentGame();
    state.players.P1.hand = [
      { uid: 'p1_mil', cardId: 'u1_inf_l', owner: 'P1', drawnOrder: 1 },
    ];
    state.players.P2.hand = [
      { uid: 'p2_fan', cardId: 'u1_inf_h', owner: 'P2', drawnOrder: 2 },
    ];

    const { state: s1 } = unwrapApply(state, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: 'p1_mil',
    });
    const { state: s2 } = unwrapApply(s1, {
      type: 'PlayCard',
      player: 'P2',
      cardUid: 'p2_fan',
    });
    const { state: s3 } = unwrapApply(s2, { type: 'Pass', player: 'P1' });
    const { state: s4 } = unwrapApply(s3, { type: 'Pass', player: 'P2' });
    const { state: s5 } = unwrapApply(s4, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    });
    const { events } = unwrapApply(s5, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });

    const meleeEvents = events.filter(
      (e) => e.type === 'BattlePhaseResolved' && e.phase === 'phase3_melee',
    );
    expect(meleeEvents).toHaveLength(2);

    const cycle1 = meleeEvents[0]!;
    if (cycle1.type === 'BattlePhaseResolved') {
      expect(cycle1.meleeCycle).toBe(1);
      expect(cycle1.assignments.P1).toEqual([{ uid: 'p2_fan', damage: 2 }]);
      expect(cycle1.assignments.P2).toEqual([{ uid: 'p1_mil', damage: 2 }]);
      expect(cycle1.casualties).toEqual({ P1: [], P2: [] });
    }

    const cycle2 = meleeEvents[1]!;
    if (cycle2.type === 'BattlePhaseResolved') {
      expect(cycle2.meleeCycle).toBe(2);
      expect(cycle2.assignments.P1).toEqual([{ uid: 'p2_fan', damage: 2 }]);
      expect(cycle2.assignments.P2).toEqual([{ uid: 'p1_mil', damage: 1 }]);
      expect(cycle2.casualties).toEqual({ P1: ['p1_mil'], P2: [] });
    }

    const outcome = events.find((e) => e.type === 'BattleOutcome');
    expect(outcome).toMatchObject({
      type: 'BattleOutcome',
      kind: 'winner',
      winner: 'P2',
    });

    const siege = events.find((e) => e.type === 'SiegeResolved');
    expect(siege).toMatchObject({
      type: 'SiegeResolved',
      attacker: 'P2',
      defender: 'P1',
      D: 1,
      W: 6,
      breach: false,
      wallsAfter: 5,
      directDamage: 0,
    });
  });

  it('TV-12: Era I: P1 Lanciere Pesante (2/1/4, Impalamento 3), P2 Cavaliere Feudale (4/1/3) -> Fase 2A uccide Cavaliere, Guardia pre-2B assegna vittoria a P1, Mura P2 = 5', () => {
    const state = createDevelopmentGame();
    state.players.P1.hand = [
      { uid: 'p1_spr', cardId: 'u1_spr_h', owner: 'P1', drawnOrder: 1 },
    ];
    state.players.P2.hand = [
      { uid: 'p2_cav', cardId: 'u1_cav_h', owner: 'P2', drawnOrder: 2 },
    ];
    state.players.P2.resources = { food: 4, wood: 4, metal: 2 };

    const { state: s1 } = unwrapApply(state, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: 'p1_spr',
    });
    const { state: s2 } = unwrapApply(s1, {
      type: 'PlayCard',
      player: 'P2',
      cardUid: 'p2_cav',
    });
    const { state: s3 } = unwrapApply(s2, { type: 'Pass', player: 'P1' });
    const { state: s4 } = unwrapApply(s3, { type: 'Pass', player: 'P2' });
    const { state: s5 } = unwrapApply(s4, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    });
    const { events } = unwrapApply(s5, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });

    const phase2a = events.find(
      (e) => e.type === 'BattlePhaseResolved' && e.phase === 'phase2a_impale',
    );
    expect(phase2a).toBeDefined();
    if (phase2a?.type === 'BattlePhaseResolved') {
      expect(phase2a.damageDealt.P1).toBe(3);
      expect(phase2a.casualties.P2).toEqual(['p2_cav']);
    }

    // Guardia pre-2B interrompe la battaglia prima di 2B e Fase 3
    expect(
      events.some(
        (e) => e.type === 'BattlePhaseResolved' && e.phase === 'phase2b_impact',
      ),
    ).toBe(false);
    expect(
      events.some(
        (e) => e.type === 'BattlePhaseResolved' && e.phase === 'phase3_melee',
      ),
    ).toBe(false);

    const outcome = events.find((e) => e.type === 'BattleOutcome');
    expect(outcome).toMatchObject({
      type: 'BattleOutcome',
      kind: 'winner',
      winner: 'P1',
    });

    const siege = events.find((e) => e.type === 'SiegeResolved');
    expect(siege).toMatchObject({
      type: 'SiegeResolved',
      attacker: 'P1',
      defender: 'P2',
      D: 1,
      W: 6,
      breach: false,
      wallsAfter: 5,
    });
  });

  it('TV-13: Era II: P1 Cavaliere Corazzato (6/2/6, Accerchiamento +2); P2 Arciere Composto (4/0/2) + Uomo d’Arme (4/2/8), zero Lancieri -> Annientamento Reciproco al Ciclo 1 di Fase 3', () => {
    const state = createDevelopmentGame();
    state.era = 2;
    state.initiative = 'P2';
    state.toAct = 'P2';
    state.players.P1.walls = 8;
    state.players.P2.walls = 8;
    state.players.P1.resources = { food: 10, wood: 10, metal: 10 };
    state.players.P2.resources = { food: 10, wood: 10, metal: 10 };
    state.players.P1.hand = [
      { uid: 'p1_cav', cardId: 'u2_cav_h', owner: 'P1', drawnOrder: 1 },
    ];
    state.players.P2.hand = [
      { uid: 'p2_arc', cardId: 'u2_arc_l', owner: 'P2', drawnOrder: 2 },
      { uid: 'p2_inf', cardId: 'u2_inf_h', owner: 'P2', drawnOrder: 3 },
    ];

    const { state: s1 } = unwrapApply(state, {
      type: 'PlayCard',
      player: 'P2',
      cardUid: 'p2_arc',
    });
    const { state: s2 } = unwrapApply(s1, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: 'p1_cav',
    });
    const { state: s3 } = unwrapApply(s2, {
      type: 'PlayCard',
      player: 'P2',
      cardUid: 'p2_inf',
    });
    const { state: s4 } = unwrapApply(s3, { type: 'Pass', player: 'P1' });
    const { state: s5 } = unwrapApply(s4, { type: 'Pass', player: 'P2' });
    const { state: s6 } = unwrapApply(s5, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    });
    const { events } = unwrapApply(s6, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });

    // Fase 1: Arciere infligge 4 -> Cavaliere a hp 2
    const phase1 = events.find(
      (e) => e.type === 'BattlePhaseResolved' && e.phase === 'phase1_volley',
    );
    if (phase1?.type === 'BattlePhaseResolved') {
      expect(phase1.damageDealt.P2).toBe(4);
      expect(phase1.assignments.P2).toEqual([{ uid: 'p1_cav', damage: 4 }]);
    }

    // Fase 2B: Accerchiamento 6+2=8, priorità rear->front->center: Arciere muore (2), eccesso 6 a Uomo d'Arme (hp 8->2)
    const phase2b = events.find(
      (e) => e.type === 'BattlePhaseResolved' && e.phase === 'phase2b_impact',
    );
    if (phase2b?.type === 'BattlePhaseResolved') {
      expect(phase2b.damageDealt.P1).toBe(8);
      expect(phase2b.assignments.P1).toEqual([
        { uid: 'p2_arc', damage: 2 },
        { uid: 'p2_inf', damage: 6 },
      ]);
      expect(phase2b.casualties.P2).toEqual(['p2_arc']);
    }

    // Fase 3 Ciclo 1: Cavaliere (6) e Uomo d'Arme (4) si eliminano a vicenda
    const phase3 = events.find(
      (e) => e.type === 'BattlePhaseResolved' && e.phase === 'phase3_melee',
    );
    if (phase3?.type === 'BattlePhaseResolved') {
      expect(phase3.meleeCycle).toBe(1);
      expect(phase3.casualties.P1).toEqual(['p1_cav']);
      expect(phase3.casualties.P2).toEqual(['p2_inf']);
    }

    // Annientamento Reciproco, Fase 4 saltata
    const outcome = events.find((e) => e.type === 'BattleOutcome');
    expect(outcome).toMatchObject({
      type: 'BattleOutcome',
      kind: 'mutual_annihilation',
    });
    expect(events.some((e) => e.type === 'SiegeResolved')).toBe(false);
  });

  it('TV-14: Pre-Battaglia: Mura P1 = 4; P2 gioca Fuoco Greco (-6), P1 gioca Palizzata Extra (+3) -> max(0, 4+3-6) = 1 HP; con solo Fuoco Greco -> 0 HP', () => {
    // Caso 1: Palizzata Extra (+3) + Fuoco Greco (-6) -> 1 HP
    const state1 = createDevelopmentGame();
    state1.players.P1.walls = 4;
    state1.players.P1.resources = { food: 4, wood: 4, metal: 4 };
    state1.players.P2.resources = { food: 4, wood: 4, metal: 4 };
    state1.players.P1.hand = [
      { uid: 'i_wall', cardId: 'i1_wall', owner: 'P1', drawnOrder: 1 },
    ];
    state1.players.P2.hand = [
      { uid: 'i_fir', cardId: 'i3_fir', owner: 'P2', drawnOrder: 2 },
    ];

    const { state: s1a } = unwrapApply(state1, { type: 'Pass', player: 'P1' });
    const { state: s1b } = unwrapApply(s1a, { type: 'Pass', player: 'P2' });
    const { state: s1c } = unwrapApply(s1b, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: ['i_wall'],
    });
    const { events: ev1 } = unwrapApply(s1c, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: ['i_fir'],
    });

    const wallsMod1 = ev1.find((e) => e.type === 'WallsModified');
    expect(wallsMod1).toBeDefined();
    if (wallsMod1?.type === 'WallsModified') {
      expect(wallsMod1.wallsBefore.P1).toBe(4);
      expect(wallsMod1.deltaOwn.P1).toBe(3);
      expect(wallsMod1.deltaEnemy.P1).toBe(-6);
      expect(wallsMod1.wallsAfter.P1).toBe(1);
    }

    // Caso 2: Solo Fuoco Greco (-6) -> max(0, 4 - 6) = 0 HP
    const state2 = createDevelopmentGame();
    state2.players.P1.walls = 4;
    state2.players.P2.resources = { food: 4, wood: 4, metal: 4 };
    state2.players.P2.hand = [
      { uid: 'i_fir', cardId: 'i3_fir', owner: 'P2', drawnOrder: 2 },
    ];

    const { state: s2a } = unwrapApply(state2, { type: 'Pass', player: 'P1' });
    const { state: s2b } = unwrapApply(s2a, { type: 'Pass', player: 'P2' });
    const { state: s2c } = unwrapApply(s2b, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    });
    const { events: ev2 } = unwrapApply(s2c, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: ['i_fir'],
    });

    const wallsMod2 = ev2.find((e) => e.type === 'WallsModified');
    expect(wallsMod2).toBeDefined();
    if (wallsMod2?.type === 'WallsModified') {
      expect(wallsMod2.wallsAfter.P1).toBe(0);
    }
  });

  it('TV-15: Era III, P1 ha 3 edifici attivi e risorse (2,2,2), gioca Gilda dei Mercanti (0/1/0) -> saldo finale (5,4,5), 2 edifici restano, slotsUsed invariato', () => {
    const state = createDevelopmentGame();
    state.era = 3;
    state.initiative = 'P1';
    state.toAct = 'P1';
    state.players.P1.resources = { food: 2, wood: 2, metal: 2 };
    state.players.P1.slotsUsed = 2;
    state.players.P1.buildings = [
      { uid: 'b1', cardId: 'e1_farm', owner: 'P1', drawnOrder: 1 },
      { uid: 'b2', cardId: 'e1_lumb', owner: 'P1', drawnOrder: 2 },
      { uid: 'b3', cardId: 'e2_mill', owner: 'P1', drawnOrder: 3 },
    ];
    state.players.P1.hand = [
      { uid: 'c_gld', cardId: 'e3_gld', owner: 'P1', drawnOrder: 4 },
    ];

    const { state: nextState } = unwrapApply(state, {
      type: 'PlayConversion',
      player: 'P1',
      cardUid: 'c_gld',
      sacrificeUid: 'b2',
    });

    expect(nextState.players.P1.resources).toEqual({
      food: 5,
      wood: 4,
      metal: 5,
    });
    expect(nextState.players.P1.buildings).toHaveLength(2);
    expect(nextState.players.P1.slotsUsed).toBe(2);
  });

  it('TV-16: Era III: P1 gioca due volte Altoforno Reale; ha Campione Imperiale (DEM 3) schierato prima e Bombarda di Bronzo (DEM 18) schierata dopo -> D = 25', () => {
    const state = createDevelopmentGame();
    state.era = 3;
    state.initiative = 'P1';
    state.toAct = 'P1';
    state.players.P1.resources = { food: 16, wood: 16, metal: 16 };
    state.players.P2.resources = { food: 16, wood: 16, metal: 16 };
    state.players.P1.buildings = [
      { uid: 'b1', cardId: 'e1_farm', owner: 'P1', drawnOrder: 1 },
      { uid: 'b2', cardId: 'e1_lumb', owner: 'P1', drawnOrder: 2 },
    ];
    state.players.P1.hand = [
      { uid: 'u_camp', cardId: 'u3_inf_h', owner: 'P1', drawnOrder: 3 },
      { uid: 'c_frn1', cardId: 'e3_frn', owner: 'P1', drawnOrder: 4 },
      { uid: 'c_frn2', cardId: 'e3_frn', owner: 'P1', drawnOrder: 5 },
      { uid: 'u_bomb', cardId: 'u3_sig_h', owner: 'P1', drawnOrder: 6 },
    ];

    // P2 passa subito dopo la prima mossa di P1 così P1 agisce nei cicli successivi
    const { state: s1 } = unwrapApply(state, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: 'u_camp',
    });
    const { state: s2 } = unwrapApply(s1, { type: 'Pass', player: 'P2' });
    const { state: s3 } = unwrapApply(s2, {
      type: 'PlayConversion',
      player: 'P1',
      cardUid: 'c_frn1',
      sacrificeUid: 'b1',
    });
    const { state: s4 } = unwrapApply(s3, {
      type: 'PlayConversion',
      player: 'P1',
      cardUid: 'c_frn2',
      sacrificeUid: 'b2',
    });
    const { state: s5 } = unwrapApply(s4, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: 'u_bomb',
    });
    const { state: s6 } = unwrapApply(s5, { type: 'Pass', player: 'P1' });

    expect(s6.players.P1.demBonus).toBe(2);

    const { state: s7 } = unwrapApply(s6, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    });
    const { events } = unwrapApply(s7, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });

    const siege = events.find((e) => e.type === 'SiegeResolved');
    expect(siege).toBeDefined();
    if (siege?.type === 'SiegeResolved') {
      expect(siege.D).toBe(25);
    }
  });

  it('TV-17: Esclusività opportunità d’azione: in Era III P1 gioca PlayConversion e tenta subito PlayCard nella stessa opportunità -> rifiutato', () => {
    const state = createDevelopmentGame();
    state.era = 3;
    state.initiative = 'P1';
    state.toAct = 'P1';
    state.players.P1.resources = { food: 10, wood: 10, metal: 10 };
    state.players.P1.buildings = [
      { uid: 'b1', cardId: 'e1_farm', owner: 'P1', drawnOrder: 1 },
    ];
    state.players.P1.hand = [
      { uid: 'c_gld', cardId: 'e3_gld', owner: 'P1', drawnOrder: 2 },
      { uid: 'u_inf', cardId: 'u3_inf_l', owner: 'P1', drawnOrder: 3 },
    ];

    const { state: afterConv } = unwrapApply(state, {
      type: 'PlayConversion',
      player: 'P1',
      cardUid: 'c_gld',
      sacrificeUid: 'b1',
    });

    expect(afterConv.toAct).toBe('P2');

    const secondAttempt = apply(afterConv, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: 'u_inf',
    });
    expect(secondAttempt.ok).toBe(false);
    if (!secondAttempt.ok) {
      expect(secondAttempt.error.code).toBe('NOT_YOUR_TURN');
    }
  });

  it('TV-18: Cap Logistico Era I = 4: P1 gioca 4 carte da campo e tenta la 5ª -> rifiutata con no_slot; in Pre-Battaglia può giocare Istantanee (0 slot)', () => {
    const state = createDevelopmentGame();
    state.players.P1.resources = { food: 7, wood: 7, metal: 7 };
    state.players.P1.hand = [
      { uid: 'c1', cardId: 'u1_spr_l', owner: 'P1', drawnOrder: 1 },
      { uid: 'c2', cardId: 'u1_spr_l', owner: 'P1', drawnOrder: 2 },
      { uid: 'c3', cardId: 'u1_spr_l', owner: 'P1', drawnOrder: 3 },
      { uid: 'c4', cardId: 'u1_arc_l', owner: 'P1', drawnOrder: 4 },
      { uid: 'c5', cardId: 'u1_arc_l', owner: 'P1', drawnOrder: 5 },
      { uid: 'i1', cardId: 'i1_wall', owner: 'P1', drawnOrder: 6 },
    ];

    const { state: s1 } = unwrapApply(state, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: 'c1',
    });
    const { state: s2 } = unwrapApply(s1, { type: 'Pass', player: 'P2' });
    const { state: s3 } = unwrapApply(s2, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: 'c2',
    });
    const { state: s4 } = unwrapApply(s3, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: 'c3',
    });
    // Ricarichiamo le risorse di P1 su un clone prima della 4ª carta per verificare il blocco da no_slot e non da risorse
    const s4Cloned = structuredClone(s4);
    s4Cloned.players.P1.resources = { food: 7, wood: 7, metal: 7 };
    const { state: s5 } = unwrapApply(s4Cloned, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: 'c4',
    });

    expect(s5.players.P1.slotsUsed).toBe(4);
    const legalDev = legalCommands(s5, 'P1');
    expect(legalDev.handPlayability['c5']).toEqual({
      playable: false,
      reason: 'no_slot',
    });

    const fifthRes = apply(s5, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: 'c5',
    });
    expect(fifthRes.ok).toBe(false);
    if (!fifthRes.ok) {
      expect(fifthRes.error.code).toBe('NO_LOGISTICS_SLOT');
    }

    // Passa in Pre-Battaglia e gioca Istantanea (0 slot)
    const { state: sPre } = unwrapApply(s5, { type: 'Pass', player: 'P1' });
    expect(sPre.phase).toBe('prebattle');
    expect(legalCommands(sPre, 'P1').playableInstantUids).toContain('i1');

    const { state: sLock1 } = unwrapApply(sPre, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: ['i1'],
    });
    const { events } = unwrapApply(sLock1, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });
    expect(
      events.some(
        (e) =>
          e.type === 'InstantsRevealed' &&
          e.played.P1.some((c) => c.uid === 'i1'),
      ),
    ).toBe(true);
  });

  it('TV-19: Rendite periodiche: P1 e P2 passano entrambi al Ciclo 1 -> Sviluppo termina subito, nessun Ciclo 2 né rendita accreditata', () => {
    const state = createDevelopmentGame();

    const { state: s1 } = unwrapApply(state, { type: 'Pass', player: 'P1' });
    const { state: s2, events } = unwrapApply(s1, {
      type: 'Pass',
      player: 'P2',
    });

    expect(s2.phase).toBe('prebattle');
    expect(s2.cycle).toBe(1);
    expect(events.some((e) => e.type === 'CycleStarted')).toBe(false);
    expect(
      events.some((e) => e.type === 'ResourcesChanged' && e.reason === 'rent'),
    ).toBe(false);
  });

  it('TV-19b: Rendite periodiche: P1 passa al Ciclo 1, P2 gioca una carta al Ciclo 1 -> Si apre Ciclo 2, entrambi ricevono rendita, poi agisce solo P2', () => {
    const state = createDevelopmentGame();
    state.players.P2.hand = [
      { uid: 'p2_u1', cardId: 'u1_inf_l', owner: 'P2', drawnOrder: 10 },
    ];

    const { state: s1 } = unwrapApply(state, { type: 'Pass', player: 'P1' });
    const { state: s2, events } = unwrapApply(s1, {
      type: 'PlayCard',
      player: 'P2',
      cardUid: 'p2_u1',
    });

    expect(s2.phase).toBe('development');
    expect(s2.cycle).toBe(2);
    expect(s2.toAct).toBe('P2');
    // P1 (che aveva passato a 4/4/0) riceve +1/+1/+0 -> 5/5/0
    expect(s2.players.P1.resources).toEqual({ food: 5, wood: 5, metal: 0 });
    // P2 (che aveva speso 2 food per Milizia Cittadina scendendo a 2/4/0) riceve +1/+1/+0 -> 3/5/0
    expect(s2.players.P2.resources).toEqual({ food: 3, wood: 5, metal: 0 });
    expect(
      events.filter(
        (e) => e.type === 'ResourcesChanged' && e.reason === 'rent',
      ),
    ).toHaveLength(2);
  });

  it('TV-20: Alternanza Iniziativa: P1 agisce per primo in Era I ed Era III; P2 agisce per primo in Era II', () => {
    let state = createDevelopmentGame();
    expect(state.era).toBe(1);
    expect(state.initiative).toBe('P1');
    expect(state.toAct).toBe('P1');

    // Transizione a Era II
    state = structuredClone(state);
    state.players.P1.hand = [];
    state.players.P2.hand = [];
    state = unwrapApply(state, { type: 'Pass', player: 'P1' }).state;
    state = unwrapApply(state, { type: 'Pass', player: 'P2' }).state;
    state = unwrapApply(state, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    }).state;
    state = unwrapApply(state, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    }).state;

    expect(state.era).toBe(2);
    expect(state.initiative).toBe('P2');
    expect(state.toAct).toBe('P2');

    // Transizione a Era III
    state = structuredClone(state);
    state.players.P1.hand = [];
    state.players.P2.hand = [];
    state = unwrapApply(state, { type: 'Pass', player: 'P2' }).state;
    state = unwrapApply(state, { type: 'Pass', player: 'P1' }).state;
    state = unwrapApply(state, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    }).state;
    state = unwrapApply(state, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    }).state;

    expect(state.era).toBe(3);
    expect(state.initiative).toBe('P1');
    expect(state.toAct).toBe('P1');
  });

  it('TV-21: Stallo al 6° ciclo (carte sintetiche): ciascun lato ha 1 unità ATK 1, HP 10 sul Fronte -> dopo 6 cicli entrambe a hp 4, esito stalemate, Fase 4 saltata, Mura invariate', () => {
    const syntheticCatalog: Record<string, CardRules> = {
      ...structuredClone(catalog),
      u1_syn_tank: {
        id: 'u1_syn_tank',
        era: 1,
        type: 'unit',
        category: 'infantry',
        line: 'front',
        cost: { food: 1, wood: 0, metal: 0 },
        atk: 1,
        dem: 3,
        hp: 10,
        isCombatant: true,
        abilities: [],
      },
    };

    const state = createDevelopmentGame(undefined, syntheticCatalog);
    state.players.P1.hand = [
      { uid: 'p1_tank', cardId: 'u1_syn_tank', owner: 'P1', drawnOrder: 1 },
    ];
    state.players.P2.hand = [
      { uid: 'p2_tank', cardId: 'u1_syn_tank', owner: 'P2', drawnOrder: 2 },
    ];

    const { state: s1 } = unwrapApply(state, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: 'p1_tank',
    });
    const { state: s2 } = unwrapApply(s1, {
      type: 'PlayCard',
      player: 'P2',
      cardUid: 'p2_tank',
    });
    const { state: s3 } = unwrapApply(s2, { type: 'Pass', player: 'P1' });
    const { state: s4 } = unwrapApply(s3, { type: 'Pass', player: 'P2' });
    const { state: s5 } = unwrapApply(s4, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    });
    const { state: s6, events } = unwrapApply(s5, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });

    const meleeEvents = events.filter(
      (e) => e.type === 'BattlePhaseResolved' && e.phase === 'phase3_melee',
    );
    expect(meleeEvents).toHaveLength(6);

    const outcome = events.find((e) => e.type === 'BattleOutcome');
    expect(outcome).toMatchObject({
      type: 'BattleOutcome',
      kind: 'stalemate',
    });
    expect(events.some((e) => e.type === 'SiegeResolved')).toBe(false);
    // Mura di Era I (6) portate in Era II senza danni: 8 + floor(6/2) = 11
    expect(s6.players.P1.walls).toBe(11);
    expect(s6.players.P2.walls).toBe(11);
  });

  it('TV-22: Unità d’Assedio senza combattenti: P1 schiera solo Ariete Batteria (isCombatant: false), P2 non schiera unità -> mutual_annihilation prima di Fase 1, Fase 4 saltata', () => {
    const state = createDevelopmentGame();
    state.players.P1.resources = { food: 4, wood: 4, metal: 4 };
    state.players.P1.hand = [
      { uid: 'p1_ram', cardId: 'u1_sig_h', owner: 'P1', drawnOrder: 1 },
    ];

    const { state: s1 } = unwrapApply(state, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: 'p1_ram',
    });
    const { state: s2 } = unwrapApply(s1, { type: 'Pass', player: 'P2' });
    const { state: s3 } = unwrapApply(s2, { type: 'Pass', player: 'P1' });
    const { state: s4 } = unwrapApply(s3, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    });
    const { events } = unwrapApply(s4, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });

    expect(events.some((e) => e.type === 'BattlePhaseResolved')).toBe(false);
    const outcome = events.find((e) => e.type === 'BattleOutcome');
    expect(outcome).toMatchObject({
      type: 'BattleOutcome',
      kind: 'mutual_annihilation',
    });
    expect(events.some((e) => e.type === 'SiegeResolved')).toBe(false);
  });

  it('TV-23: Fine Era III ai punti: Centro Città P1 = 12 HP, P2 = 9 HP -> vince P1 (points); se entrambi a 12 HP -> pareggio (draw, DRAW)', () => {
    // Caso 1: P1 = 12 HP (cityDamage 10 su cityMax 22), P2 = 9 HP (cityDamage 13 su cityMax 22)
    const state1 = createDevelopmentGame();
    state1.era = 3;
    state1.initiative = 'P1';
    state1.toAct = 'P1';
    state1.players.P1.cityMax = 22;
    state1.players.P1.cityDamage = 10; // 12 HP
    state1.players.P2.cityMax = 22;
    state1.players.P2.cityDamage = 13; // 9 HP

    const { state: s1a } = unwrapApply(state1, { type: 'Pass', player: 'P1' });
    const { state: s1b } = unwrapApply(s1a, { type: 'Pass', player: 'P2' });
    const { state: s1c } = unwrapApply(s1b, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    });
    const { state: s1Final } = unwrapApply(s1c, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });

    expect(s1Final.phase).toBe('finished');
    expect(s1Final.result).toEqual({ kind: 'points', winner: 'P1' });

    // Caso 2: Entrambi a 12 HP (cityDamage 10 su cityMax 22)
    const state2 = createDevelopmentGame();
    state2.era = 3;
    state2.initiative = 'P1';
    state2.toAct = 'P1';
    state2.players.P1.cityMax = 22;
    state2.players.P1.cityDamage = 10; // 12 HP
    state2.players.P2.cityMax = 22;
    state2.players.P2.cityDamage = 10; // 12 HP

    const { state: s2a } = unwrapApply(state2, { type: 'Pass', player: 'P1' });
    const { state: s2b } = unwrapApply(s2a, { type: 'Pass', player: 'P2' });
    const { state: s2c } = unwrapApply(s2b, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    });
    const { state: s2Final } = unwrapApply(s2c, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });

    expect(s2Final.phase).toBe('finished');
    expect(s2Final.result).toEqual({ kind: 'draw', winner: 'DRAW' });
  });

  it('TV-24: Decisione D1 + D4: in Era III, P1 schiera Cacciatore di Era I (ATK 2, HP 1, Tiro +1) e gioca Pioggia di Frecce (+2 ATK) vs Lanciere -> Fase 1 infligge 5 danni, Fase 3 infligge 2 danni', () => {
    const state = createDevelopmentGame();
    state.era = 3;
    state.initiative = 'P1';
    state.toAct = 'P1';
    state.players.P1.resources = { food: 10, wood: 10, metal: 10 };
    state.players.P2.resources = { food: 10, wood: 10, metal: 10 };
    state.players.P1.hand = [
      { uid: 'p1_cac', cardId: 'u1_arc_l', owner: 'P1', drawnOrder: 1 }, // Cacciatore Era I: ATK 2, HP 1, Tiro +1
      { uid: 'p1_arr', cardId: 'i1_arr', owner: 'P1', drawnOrder: 2 }, // Pioggia di Frecce: +2 ATK
    ];
    state.players.P2.hand = [
      { uid: 'p2_spr', cardId: 'u3_spr_h', owner: 'P2', drawnOrder: 3 }, // Falange Imperiale: Lanciere, HP 9, ATK 5
    ];

    const { state: s1 } = unwrapApply(state, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: 'p1_cac',
    });
    const { state: s2 } = unwrapApply(s1, {
      type: 'PlayCard',
      player: 'P2',
      cardUid: 'p2_spr',
    });
    const { state: s3 } = unwrapApply(s2, { type: 'Pass', player: 'P1' });
    const { state: s4 } = unwrapApply(s3, { type: 'Pass', player: 'P2' });
    const { state: s5 } = unwrapApply(s4, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: ['p1_arr'],
    });
    const { events } = unwrapApply(s5, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });

    // Fase 1 (Tiro): effAtk = 2 + 2 = 4; bonus Tiro stampato sulla carta = +1 (D1) -> 5 danni totali
    const phase1 = events.find(
      (e) => e.type === 'BattlePhaseResolved' && e.phase === 'phase1_volley',
    );
    expect(phase1).toBeDefined();
    if (phase1?.type === 'BattlePhaseResolved') {
      expect(phase1.damageDealt.P1).toBe(5);
      expect(phase1.assignments.P1).toEqual([{ uid: 'p2_spr', damage: 5 }]);
    }

    // Fase 3 Ciclo 1 (Mischia): max(1, floor(effAtk / 2)) = max(1, floor(4 / 2)) = 2 danni (D4)
    const phase3 = events.find(
      (e) => e.type === 'BattlePhaseResolved' && e.phase === 'phase3_melee',
    );
    expect(phase3).toBeDefined();
    if (phase3?.type === 'BattlePhaseResolved') {
      expect(phase3.damageDealt.P1).toBe(2);
      expect(phase3.assignments.P1).toEqual([{ uid: 'p2_spr', damage: 2 }]);
    }
  });

  it('TV-25: Sequenza Pre-Battaglia (§5.1) + Decisione D3: P1 sacrifica un edificio con Gilda dei Mercanti, poi entrambi passano -> sacrificeCardId nascosto per P2, UnitsRevealed e risorse visibili prima di LockInstants', () => {
    const state = createDevelopmentGame();
    state.era = 3;
    state.initiative = 'P1';
    state.toAct = 'P1';
    state.players.P1.resources = { food: 2, wood: 2, metal: 2 };
    state.players.P2.resources = { food: 6, wood: 4, metal: 1 };
    state.players.P1.buildings = [
      { uid: 'b_secret_farm', cardId: 'e1_farm', owner: 'P1', drawnOrder: 1 },
      { uid: 'b_secret_mill', cardId: 'e2_mill', owner: 'P1', drawnOrder: 2 },
    ];
    state.players.P1.units = [
      {
        uid: 'u_p1_hidden',
        cardId: 'u3_inf_h',
        owner: 'P1',
        drawnOrder: 3,
        seq: 1,
        hp: 12,
        line: 'front',
        atkMod: 0,
        revealed: false,
      },
    ];
    state.players.P1.hand = [
      { uid: 'c_gld', cardId: 'e3_gld', owner: 'P1', drawnOrder: 4 },
    ];

    // 1. P1 gioca Gilda dei Mercanti sacrificando b_secret_farm
    const { state: afterConv, events: convEvents } = unwrapApply(state, {
      type: 'PlayConversion',
      player: 'P1',
      cardUid: 'c_gld',
      sacrificeUid: 'b_secret_farm',
    });

    const convEv = convEvents.find((e) => e.type === 'ConversionActivated')!;
    const projectedForP2 = projectEvent(convEv, 'P2');
    expect(projectedForP2).toBeDefined();
    if (projectedForP2?.type === 'ConversionActivated') {
      expect(projectedForP2.cardId).toBe('e3_gld');
      expect(projectedForP2.sacrificeCardId).toBeUndefined();
      expect(projectedForP2.sacrificeUid).toBeUndefined();
    }

    const viewP2DuringDev = playerView(afterConv, 'P2');
    expect(viewP2DuringDev.opponent.publicDiscard).toEqual(['e3_gld']);
    expect(viewP2DuringDev.opponent.publicDiscard).not.toContain('e1_farm');
    expect(viewP2DuringDev.opponent.units).toBeNull();
    expect(viewP2DuringDev.opponent.resources).toBeNull();
    expect(viewP2DuringDev.opponent.coveredCount).toBe(2); // 1 unità + 1 edificio superstite

    // 2. P2 passa al Ciclo 1 -> si apre il Ciclo 2 (rendita periodica per P1 con e2_mill: +3 food, +1 wood -> 7/4/4), poi P1 passa -> ingresso in prebattle PRIMA di LockInstants
    const { state: afterP2Pass } = unwrapApply(afterConv, {
      type: 'Pass',
      player: 'P2',
    });
    const { state: inPrebattle, events: passEvents } = unwrapApply(
      afterP2Pass,
      {
        type: 'Pass',
        player: 'P1',
      },
    );

    expect(inPrebattle.phase).toBe('prebattle');
    expect(passEvents.map((e) => e.type)).toContain('DevelopmentEnded');
    expect(passEvents.map((e) => e.type)).toContain('UnitsRevealed');

    // Nella vista di P2 in prebattle (prima di LockInstants), sia opponent.units sia opponent.resources sono ora visibili,
    // mentre l'edificio superstite resta coperto (coveredCount === 1) e l'edificio sacrificato resta nascosto.
    const viewP2InPrebattle = playerView(inPrebattle, 'P2');
    expect(viewP2InPrebattle.opponent.resources).toEqual({
      food: 7,
      wood: 4,
      metal: 4,
    });
    expect(viewP2InPrebattle.opponent.units).toHaveLength(1);
    expect(viewP2InPrebattle.opponent.units?.[0]?.cardId).toBe('u3_inf_h');
    expect(viewP2InPrebattle.opponent.coveredCount).toBe(1);
    expect(viewP2InPrebattle.opponent.publicDiscard).toEqual(['e3_gld']);
  });
});
