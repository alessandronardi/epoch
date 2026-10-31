import { describe, expect, it } from 'vitest';
import { getCatalog } from '../../content/src/index.js';
import { CIVILIZATION_PRESETS, LEGACY_PRESETS } from '../../content/src/presets.js';
import { migrateLegacyDeck } from '../../content/src/migration.js';
import { DeckPayloadSchema, GameEventSchema, PlayerViewSchema } from '../../protocol/src/index.js';
import {
  createGame,
  apply,
  playerView,
  stateHash,
  effectiveCardCost,
  validateDeck,
  startNextEra,
  resolveFieldBattle,
  calculateRaidTransfer,
  projectEvent,
  legalCommands,
} from '../src/index.js';
import type { GameEvent, GameState, UnitInstance } from '../src/index.js';

function setup(a = 0, b = 2) {
  return createGame({
    seed: 'civilizations',
    fixedInitiative: 'P1',
    catalog: { ...getCatalog('2.0').rulesById },
    decks: {
      P1: structuredClone(CIVILIZATION_PRESETS[a]!),
      P2: structuredClone(CIVILIZATION_PRESETS[b]!),
    },
  });
}
function unit(
  state: GameState,
  cardId: string,
  seq: number,
  owner: 'P1' | 'P2',
  hp?: number,
): UnitInstance {
  const card = state.catalog[cardId]!;
  return {
    uid: `test-${seq}`,
    cardId,
    seq,
    owner,
    drawnOrder: seq,
    hp: hp ?? card.hp!,
    line: card.line!,
    atkMod: 0,
    revealed: true,
  };
}
describe('Versioned civilization contracts', () => {
  it('validates all 180 occurrences and preserves v1', () => {
    for (const deck of CIVILIZATION_PRESETS) {
      expect(DeckPayloadSchema.parse(deck)).toEqual(deck);
      expect(validateDeck(deck, { ...getCatalog('2.0').rulesById })).toEqual([]);
      expect(validateDeck(deck, { ...getCatalog('1.0').rulesById }).length).toBeGreaterThan(0);
    }
    for (const deck of LEGACY_PRESETS)
      expect(validateDeck(deck, { ...getCatalog('1.0').rulesById })).toEqual([]);
  });
  it('rejects incomplete version metadata, mixed versions and foreign cards', () => {
    const deck = structuredClone(CIVILIZATION_PRESETS[0]!);
    delete deck.civilizationId;
    expect(DeckPayloadSchema.safeParse(deck).success).toBe(false);
    deck.civilizationId = 'feudal';
    deck.subdecks['1'][0] = 'n1_raider';
    expect(
      validateDeck(deck, { ...getCatalog('2.0').rulesById }).some(
        (i) => i.code === 'WRONG_CIVILIZATION',
      ),
    ).toBe(true);
    expect(() =>
      createGame({
        seed: 'mixed',
        catalog: { ...getCatalog('2.0').rulesById },
        decks: { P1: deck, P2: LEGACY_PRESETS[0]! },
      }),
    ).toThrow(/same version/);
  });
  it('validates era from catalog even for arbitrary prefixes', () => {
    const deck = structuredClone(CIVILIZATION_PRESETS[1]!);
    deck.subdecks['1'][0] = 'n2_huscarl';
    expect(
      validateDeck(deck, { ...getCatalog('2.0').rulesById }).some(
        (i) => i.code === 'WRONG_CARD_ERA',
      ),
    ).toBe(true);
  });
  it('migrates in a new copy and reports copy collisions', () => {
    const original = structuredClone(LEGACY_PRESETS[0]!);
    const before = JSON.stringify(original);
    const result = migrateLegacyDeck(original, 'feudal');
    expect(JSON.stringify(original)).toBe(before);
    expect(result.deck.id).not.toBe(original.id);
    expect(result.changes.some((c) => c.from === 'u3_cav_h')).toBe(true);
    expect(result.issues.some((i) => i.code === 'MAX_COPIES_EXCEEDED')).toBe(false);
    const collisions = migrateLegacyDeck(LEGACY_PRESETS[1]!, 'feudal');
    expect(collisions.issues.some((i) => i.code === 'MAX_COPIES_EXCEEDED')).toBe(true);
  });
  it('round trips events and projections with public civilizations and private counters', () => {
    const { state, events } = setup();
    for (const event of events) expect(GameEventSchema.parse(event)).toEqual(event);
    const view = playerView(state, 'P1');
    expect(PlayerViewSchema.parse(view)).toEqual(view);
    expect(view.opponent.civilizationId).toBe('byzantine');
    expect(view.opponent).not.toHaveProperty('organizationUsed');
    const changed = structuredClone(state);
    changed.players.P1.organizationUsed = true;
    expect(stateHash(changed)).not.toBe(stateHash(state));
    expect(playerView(changed, 'P2')).toEqual(playerView(state, 'P2'));
  });
});
describe('Civilization effects', () => {
  it('builds public structures, excludes sacrifices, and caps Market activation per era', () => {
    const { state } = setup();
    state.era = 2;
    state.phase = 'development';
    state.toAct = 'P1';
    state.cycle = 4;
    state.players.P1.hand = [{ uid: 'market', cardId: 'f2_market', owner: 'P1', drawnOrder: 1 }];
    state.players.P1.resources = { food: 7, wood: 7, metal: 0 };
    const built = apply(state, { type: 'PlayCard', player: 'P1', cardUid: 'market' });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const next = structuredClone(built.value.state);
    next.toAct = 'P1';
    expect(next.players.P1.buildings).toHaveLength(0);
    expect(next.players.P1.structures).toHaveLength(1);
    expect(next.players.P1.slotsUsed).toBe(1);
    const buildEvent = built.value.events.find((e) => e.type === 'CardPlayed')!;
    expect(projectEvent(buildEvent, 'P2')).toEqual(buildEvent);
    expect(playerView(next, 'P2').opponent.structures?.[0]?.cardId).toBe('f2_market');
    expect(legalCommands(next, 'P1').sacrificableBuildingUids).toEqual([]);
    const cmd = {
      type: 'ActivateMarket' as const,
      player: 'P1' as const,
      structureUid: 'market',
      give: 'food' as const,
      receive: 'metal' as const,
    };
    const activated = apply(next, cmd);
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    expect(activated.value.state.players.P1.resources).toEqual({ food: 4, wood: 5, metal: 1 });
    const event = activated.value.events.find((e) => e.type === 'MarketActivated')!;
    expect(projectEvent(event, 'P2')).not.toHaveProperty('give');
    expect(projectEvent(event, 'P2')).not.toHaveProperty('receive');
    for (const e of activated.value.events.filter((e) => e.type === 'ResourcesChanged'))
      expect(projectEvent(e, 'P2')).toBeNull();
    expect(activated.value.state.toAct).toBe('P2');
    const repeat = structuredClone(activated.value.state);
    repeat.toAct = 'P1';
    repeat.players.P1.structures!.push({
      uid: 'market2',
      cardId: 'f2_market',
      owner: 'P1',
      drawnOrder: 2,
    });
    expect(apply(repeat, { ...cmd, structureUid: 'market2' }).ok).toBe(false);
    startNextEra(repeat, [], 3);
    repeat.phase = 'development';
    repeat.toAct = 'P1';
    expect(repeat.players.P1.marketUsed).toBe(false);
    repeat.players.P1.passed = true;
    expect(apply(repeat, cmd).ok).toBe(false);
  });
  it('rejects Market same-resource swaps, full target and insufficient payment', () => {
    const { state } = setup();
    state.phase = 'development';
    state.toAct = 'P1';
    state.players.P1.structures = [{ uid: 'm', cardId: 'f2_market', owner: 'P1', drawnOrder: 1 }];
    const cmd = {
      type: 'ActivateMarket' as const,
      player: 'P1' as const,
      structureUid: 'm',
      give: 'food' as const,
      receive: 'metal' as const,
    };
    state.players.P1.resources = { food: 1, wood: 0, metal: 0 };
    expect(apply(state, cmd).ok).toBe(false);
    state.players.P1.resources = { food: 7, wood: 0, metal: 7 };
    expect(apply(state, cmd).ok).toBe(false);
    expect(apply(state, { ...cmd, receive: 'food' }).ok).toBe(false);
  });
  it('applies duplicated Cistern once after civilization bonus without healing city', () => {
    const { state } = setup();
    state.players.P2.walls = 0;
    state.players.P2.cityDamage = 3;
    state.players.P2.structures = [1, 2].map((n) => ({
      uid: `cistern${n}`,
      cardId: 'b2_cistern',
      owner: 'P2',
      drawnOrder: n,
    }));
    startNextEra(state, [], 3);
    expect(state.players.P2.walls).toBe(14);
    expect(state.players.P2.cityDamage).toBe(3);
  });
  it.each(['u1_sig_h', 'u1_spr_l'])(
    'consumes Organization on successful zero/one food unit %s only',
    (cardId) => {
      const { state } = setup();
      state.phase = 'development';
      state.toAct = 'P1';
      state.cycle = 1;
      state.players.P1.hand = [{ uid: 'play', cardId, owner: 'P1', drawnOrder: 1 }];
      state.players.P1.resources = { food: 0, wood: 7, metal: 7 };
      const cost = effectiveCardCost(state.catalog[cardId]!, state.players.P1, '2.0');
      expect(cost.food).toBe(0);
      const illegal = apply(state, { type: 'PlayCard', player: 'P2', cardUid: 'play' });
      expect(illegal.ok).toBe(false);
      expect(state.players.P1.organizationUsed).toBe(false);
      const result = apply(state, { type: 'PlayCard', player: 'P1', cardUid: 'play' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.state.players.P1.organizationUsed).toBe(true);
      const next = structuredClone(result.value.state);
      startNextEra(next, [], 2);
      expect(next.players.P1.organizationUsed).toBe(false);
    },
  );
  it('adds walls after initialization and carryover without changing city damage', () => {
    const { state } = setup();
    expect(state.players.P2.walls).toBe(8);
    state.players.P2.walls = 3;
    state.players.P2.cityDamage = 4;
    startNextEra(state, [], 2);
    expect(state.players.P2.walls).toBe(11);
    expect(state.players.P2.cityDamage).toBe(4);
  });
  it('caps Norse loot by both storage and enemy availability', () => {
    expect(
      calculateRaidTransfer({ food: 6, wood: 0, metal: 0 }, { food: 5, wood: 1, metal: 7 }, 1, 2),
    ).toEqual({ foodTransferred: 1, woodTransferred: 1 });
    expect(
      calculateRaidTransfer({ food: 7, wood: 7, metal: 0 }, { food: 5, wood: 5, metal: 7 }, 1, 2),
    ).toEqual({ foodTransferred: 0, woodTransferred: 0 });
  });
  it('uses Fury in first melee only, with authoritative contributions', () => {
    const { state } = setup(1, 2);
    state.phase = 'prebattle';
    state.players.P1.units = [unit(state, 'n1_raider', 1, 'P1', 20)];
    state.players.P2.units = [unit(state, 'u1_inf_h', 2, 'P2', 20)];
    const events: GameEvent[] = [];
    resolveFieldBattle(state, events);
    const phases = events.filter((e) => e.type === 'BattlePhaseResolved');
    for (const phase of phases) expect(GameEventSchema.parse(phase)).toEqual(phase);
    expect(phases.find((e) => e.meleeCycle === 1)?.contributions?.P1[0]?.furyBonus).toBe(2);
    expect(phases.find((e) => e.meleeCycle === 2)?.contributions?.P1[0]?.furyBonus).toBe(0);
    expect(
      phases
        .filter((e) => e.phase !== 'phase3_melee')
        .flatMap((e) => e.contributions?.P1 ?? [])
        .some((c) => c.furyBonus),
    ).toBe(false);
  });
  it('keeps Discipline for simultaneous lancer death and removes it next cycle', () => {
    const { state } = setup(2, 1);
    state.phase = 'prebattle';
    state.players.P1.units = [
      unit(state, 'b1_spearman', 1, 'P1', 1),
      unit(state, 'b1_watch', 2, 'P1', 30),
    ];
    state.players.P2.units = [unit(state, 'u1_inf_h', 3, 'P2', 30)];
    const events: GameEvent[] = [];
    resolveFieldBattle(state, events);
    const melee = events
      .filter((e) => e.type === 'BattlePhaseResolved')
      .filter((e) => e.phase === 'phase3_melee');
    expect(melee[0]?.contributions?.P1.find((c) => c.cardId === 'b1_watch')?.disciplineBonus).toBe(
      1,
    );
    expect(melee[1]?.contributions?.P1.find((c) => c.cardId === 'b1_watch')?.disciplineBonus).toBe(
      0,
    );
  });
});
