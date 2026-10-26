import { describe, expect, it } from 'vitest';
import {
  passTurn,
  playCard,
  playConversion,
  submitDiscard,
} from '../src/development.js';
import type { GameEvent } from '../src/events.js';
import {
  isPublicBattleStage,
  playerView,
  projectEvent,
} from '../src/projection.js';
import { createGame, submitMulligan } from '../src/setup.js';
import type { CardRules, EraNo, GameState, PlayerId } from '../src/types.js';
import cardsRulesJson from '../../../data/cards.rules.json' with { type: 'json' };

const catalog = cardsRulesJson as unknown as Record<string, CardRules>;

function buildFixedDecks(): Record<PlayerId, Record<EraNo, string[]>> {
  const era1 = [
    'e1_farm',
    'e1_lumb',
    'e1_mine',
    'u1_inf_l',
    'u1_inf_h',
    'u1_spr_l',
    'u1_arc_l',
    'i1_arr',
    'i1_wall',
    'u1_cav_l',
    'u1_cav_h',
    'u1_sig_l',
    'u1_sig_h',
    'u1_spr_h',
    'u1_arc_h',
    'e1_farm',
    'e1_lumb',
    'u1_inf_l',
    'i1_arr',
    'i1_wall',
  ];
  const era2 = Array.from({ length: 20 }, (_, i) =>
    i % 2 === 0 ? 'e2_mill' : 'u2_inf_l',
  );
  const era3 = Array.from({ length: 20 }, (_, i) =>
    i % 2 === 0 ? 'e3_gld' : 'u3_inf_l',
  );

  return {
    P1: { 1: [...era1], 2: [...era2], 3: [...era3] },
    P2: { 1: [...era1], 2: [...era2], 3: [...era3] },
  };
}

function createDevelopmentState(): GameState {
  const { state } = createGame({
    seed: 'projection-test-seed',
    catalog,
    fixedDecks: buildFixedDecks(),
    fixedInitiative: 'P1',
  });
  const r1 = submitMulligan(state, {
    type: 'SubmitMulligan',
    player: 'P1',
    cardUids: [],
  });
  if (!r1.ok) throw new Error(r1.error.message);
  const r2 = submitMulligan(r1.value.state, {
    type: 'SubmitMulligan',
    player: 'P2',
    cardUids: [],
  });
  if (!r2.ok) throw new Error(r2.error.message);
  return structuredClone(r2.value.state);
}

describe('Task M1-11: Visibility Projection playerView and Event Redaction projectEvent (§5.3–5.4, D3, TV-25)', () => {
  it('TV-25: Prebattle sequence (§5.1) + Decision D3: P1 sacrifices a building with Gilda dei Mercanti, then both pass -> sacrificeCardId hidden for P2 (D3); UnitsRevealed and opponent.resources visible in prebattle BEFORE LockInstants', () => {
    const state = createDevelopmentState();
    state.era = 3;
    state.initiative = 'P1';
    state.toAct = 'P1';
    state.players.P1.resources = { food: 3, wood: 3, metal: 3 };
    state.players.P2.resources = { food: 4, wood: 2, metal: 1 };
    state.players.P1.buildings = [
      { uid: 'b1_secret', cardId: 'e1_farm', owner: 'P1', drawnOrder: 1 },
      { uid: 'b2_secret', cardId: 'e2_fnd', owner: 'P1', drawnOrder: 2 },
    ];
    state.players.P1.units = [
      {
        uid: 'u1_secret',
        cardId: 'u3_inf_l',
        owner: 'P1',
        drawnOrder: 3,
        seq: 1,
        hp: 8,
        line: 'front',
        atkMod: 0,
        revealed: false,
      },
    ];
    state.players.P1.hand = [
      { uid: 'c_gld', cardId: 'e3_gld', owner: 'P1', drawnOrder: 10 },
    ];
    state.players.P2.hand = [];

    // Before conversion: in development, P2 sees coveredCount = 3 (1 unit + 2 buildings), units = null, resources = null
    const viewBefore = playerView(state, 'P2');
    expect(viewBefore.opponent.coveredCount).toBe(3);
    expect(viewBefore.opponent.units).toBeNull();
    expect(viewBefore.opponent.resources).toBeNull();

    // P1 plays Gilda dei Mercanti sacrificing b1_secret (e1_farm)
    const convRes = playConversion(state, {
      type: 'PlayConversion',
      player: 'P1',
      cardUid: 'c_gld',
      sacrificeUid: 'b1_secret',
    });
    expect(convRes.ok).toBe(true);
    if (!convRes.ok) return;

    const convEvent = convRes.value.events.find(
      (e) => e.type === 'ConversionActivated',
    )!;
    const convForP1 = projectEvent(convEvent, 'P1');
    const convForP2 = projectEvent(convEvent, 'P2');

    // P1 sees sacrificeUid and sacrificeCardId
    expect(convForP1).toEqual(
      expect.objectContaining({
        type: 'ConversionActivated',
        cardId: 'e3_gld',
        sacrificeUid: 'b1_secret',
        sacrificeCardId: 'e1_farm',
      }),
    );

    // P2 sees e3_gld and gain, but sacrificeUid and sacrificeCardId are hidden (D3)!
    expect(convForP2).toBeDefined();
    if (convForP2?.type === 'ConversionActivated') {
      expect(convForP2.cardId).toBe('e3_gld');
      expect(convForP2.gain).toEqual({ food: 2, wood: 2, metal: 2 });
      expect(convForP2.sacrificeUid).toBeUndefined();
      expect(convForP2.sacrificeCardId).toBeUndefined();
    }

    // In P2's playerView during development after conversion:
    // coveredCount decreased by 1 (now 1 unit + 1 building = 2), publicDiscard has only ['e3_gld']
    const viewMid = playerView(convRes.value.state, 'P2');
    expect(viewMid.opponent.coveredCount).toBe(2);
    expect(viewMid.opponent.discardCount).toBe(2);
    expect(viewMid.opponent.publicDiscard).toEqual(['e3_gld']);
    expect(JSON.stringify(viewMid)).not.toContain('b1_secret');
    expect(JSON.stringify(viewMid)).not.toContain('e1_farm');

    // Now P2 passes, then P1 passes -> enters prebattle
    const p2Pass = passTurn(convRes.value.state, {
      type: 'Pass',
      player: 'P2',
    });
    expect(p2Pass.ok).toBe(true);
    if (!p2Pass.ok) return;

    const p1Pass = passTurn(p2Pass.value.state, {
      type: 'Pass',
      player: 'P1',
    });
    expect(p1Pass.ok).toBe(true);
    if (!p1Pass.ok) return;

    const prebattleState = p1Pass.value.state;
    expect(prebattleState.phase).toBe('prebattle');
    expect(
      p1Pass.value.events.some((e) => e.type === 'UnitsRevealed'),
    ).toBe(true);

    // R1 & TV-25: In prebattle (BEFORE LockInstants), P2 sees opponent.units and opponent.resources,
    // while opponent.coveredCount is now 1 (the remaining secret building b2_secret)
    const viewPrebattleP2 = playerView(prebattleState, 'P2');
    expect(viewPrebattleP2.opponent.resources).toEqual({
      food: 6,
      wood: 5,
      metal: 7,
    });
    expect(viewPrebattleP2.opponent.units).toEqual([
      {
        uid: 'u1_secret',
        cardId: 'u3_inf_l',
        owner: 'P1',
        seq: 1,
        hp: 8,
        line: 'front',
        atkMod: 0,
        revealed: true,
      },
    ]);
    expect(viewPrebattleP2.opponent.coveredCount).toBe(1);
    expect(JSON.stringify(viewPrebattleP2)).not.toContain('b2_secret');
    expect(JSON.stringify(viewPrebattleP2)).not.toContain('e2_fnd');
  });

  it('hides opponent hand, buildings, unrevealed units, and hand_limit discards in playerView across phases', () => {
    const devState = createDevelopmentState();
    // P1 plays an economy building in development
    const firstCard = devState.players.P1.hand.find(
      (c) => catalog[c.cardId]?.type === 'economy',
    )!;
    const playRes = playCard(devState, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: firstCard.uid,
    });
    expect(playRes.ok).toBe(true);
    if (!playRes.ok) return;

    const p2View = playerView(playRes.value.state, 'P2');
    expect(p2View.me).toBe('P2');
    expect(p2View.opponent.handCount).toBe(7);
    expect(p2View.opponent.slotsUsed).toBe(1);
    expect(p2View.opponent.coveredCount).toBe(1);
    expect(p2View.opponent.resources).toBeNull();
    expect(p2View.opponent.units).toBeNull();

    // Test hand_limit discard visibility (D3)
    const hlState = createDevelopmentState();
    hlState.era = 2;
    hlState.phase = 'hand_limit';
    hlState.players.P1.hand = Array.from({ length: 11 }, (_, i) => ({
      uid: `hl_card_${i}`,
      cardId: 'e1_farm',
      owner: 'P1' as const,
      drawnOrder: i + 1,
    }));
    const discRes = submitDiscard(hlState, {
      type: 'SubmitDiscard',
      player: 'P1',
      cardUids: ['hl_card_0'],
    });
    expect(discRes.ok).toBe(true);
    if (!discRes.ok) return;

    const p2AfterDiscard = playerView(discRes.value.state, 'P2');
    expect(p2AfterDiscard.opponent.discardCount).toBe(1);
    expect(p2AfterDiscard.opponent.publicDiscard).toEqual([]);
    expect(JSON.stringify(p2AfterDiscard)).not.toContain('hl_card_0');

    // Check isPublicBattleStage for finished states (points vs early concession)
    const finishedPoints = structuredClone(devState);
    finishedPoints.phase = 'finished';
    finishedPoints.result = { kind: 'points', winner: 'P1' };
    expect(isPublicBattleStage(finishedPoints)).toBe(true);

    const finishedEarlyConcede = structuredClone(devState);
    finishedEarlyConcede.phase = 'finished';
    finishedEarlyConcede.result = { kind: 'concession', winner: 'P2' };
    expect(isPublicBattleStage(finishedEarlyConcede)).toBe(false);
    expect(playerView(finishedEarlyConcede, 'P2').result).toEqual({
      kind: 'concession',
      winner: 'P2',
    });
  });

  it('exhaustively tests projectEvent redaction for all 24 GameEvent types for both P1 and P2 (§5.4)', () => {
    const sampleCard = {
      uid: 'uid_P1_0001',
      cardId: 'e1_farm',
      owner: 'P1' as const,
      drawnOrder: 1,
    };
    const sampleUnit = {
      ...sampleCard,
      cardId: 'u1_inf_l',
      seq: 1,
      hp: 3,
      line: 'front' as const,
      atkMod: 0,
      revealed: true,
    };

    const allEvents: GameEvent[] = [
      {
        n: 1,
        type: 'GameStarted',
        era: 1,
        rulesetVersion: '1.0',
        catalogVersion: '1.0',
      },
      {
        n: 2,
        type: 'InitiativeAssigned',
        era: 1,
        initiative: 'P1',
      },
      {
        n: 3,
        type: 'CardsDrawn',
        player: 'P1',
        era: 1,
        count: 1,
        cards: [sampleCard],
      },
      {
        n: 4,
        type: 'PlayerCommitted',
        player: 'P1',
        window: 'mulligan',
      },
      {
        n: 5,
        type: 'MulliganResolved',
        player: 'P1',
        count: 1,
        returnedCardUids: ['uid_P1_0001'],
        drawnCards: [sampleCard],
      },
      {
        n: 6,
        type: 'EraStarted',
        era: 1,
        initiative: 'P1',
        walls: { P1: 6, P2: 6 },
        cityHp: { P1: 10, P2: 10 },
        cityMax: { P1: 10, P2: 10 },
      },
      {
        n: 7,
        type: 'HandLimitDiscarded',
        player: 'P1',
        count: 1,
        cardUids: ['uid_P1_0001'],
      },
      {
        n: 8,
        type: 'ResourcesChanged',
        player: 'P1',
        reason: 'harvest',
        delta: { food: 2, wood: 2, metal: 0 },
        resources: { food: 4, wood: 4, metal: 0 },
      },
      {
        n: 9,
        type: 'ResourcesChanged',
        player: 'P1',
        reason: 'conversion',
        delta: { food: 1, wood: 1, metal: 1 },
        resources: { food: 5, wood: 5, metal: 1 },
      },
      {
        n: 10,
        type: 'ResourcesOverflowed',
        player: 'P1',
        reason: 'harvest',
        overflow: { food: 1, wood: 0, metal: 0 },
        cap: 7,
      },
      {
        n: 11,
        type: 'ResourcesOverflowed',
        player: 'P1',
        reason: 'raid',
        overflow: { food: 1, wood: 0, metal: 0 },
        cap: 7,
      },
      {
        n: 12,
        type: 'CycleStarted',
        era: 1,
        cycle: 1,
        toAct: 'P1',
      },
      {
        n: 13,
        type: 'CardPlayed',
        player: 'P1',
        slotsUsed: 1,
        coveredCount: 1,
        uid: 'uid_P1_0001',
        cardId: 'e1_farm',
        cardType: 'economy',
      },
      {
        n: 14,
        type: 'ConversionActivated',
        player: 'P1',
        uid: 'uid_P1_0010',
        cardId: 'e3_gld',
        gain: { food: 1, wood: 1, metal: 1 },
        demBonusGained: 0,
        coveredCount: 0,
        sacrificeUid: 'uid_P1_0001',
        sacrificeCardId: 'e1_farm',
      },
      {
        n: 15,
        type: 'PlayerPassed',
        player: 'P1',
        era: 1,
        cycle: 1,
        reason: 'chosen',
      },
      {
        n: 16,
        type: 'DevelopmentEnded',
        era: 1,
      },
      {
        n: 17,
        type: 'UnitsRevealed',
        era: 1,
        units: { P1: [sampleUnit], P2: [{ ...sampleUnit, uid: 'uid_P2_0001', owner: 'P2' }] },
        resources: {
          P1: { food: 2, wood: 2, metal: 0 },
          P2: { food: 2, wood: 2, metal: 0 },
        },
      },
      {
        n: 18,
        type: 'InstantsRevealed',
        era: 1,
        played: {
          P1: [{ uid: 'uid_P1_0009', cardId: 'i1_arr' }],
          P2: [{ uid: 'uid_P2_0009', cardId: 'i1_wall' }],
        },
      },
      {
        n: 19,
        type: 'WallsModified',
        era: 1,
        wallsBefore: { P1: 6, P2: 6 },
        deltaOwn: { P1: 3, P2: 0 },
        deltaEnemy: { P1: 0, P2: 0 },
        wallsAfter: { P1: 9, P2: 6 },
      },
      {
        n: 20,
        type: 'BattleStarted',
        era: 1,
      },
      {
        n: 21,
        type: 'BattlePhaseResolved',
        era: 1,
        phase: 'phase3_melee',
        meleeCycle: 1,
        damageDealt: { P1: 2, P2: 2 },
        assignments: {
          P1: [{ uid: 'uid_P2_0001', damage: 2 }],
          P2: [{ uid: 'uid_P1_0001', damage: 2 }],
        },
        casualties: { P1: [], P2: ['uid_P2_0001'] },
      },
      {
        n: 22,
        type: 'BattleOutcome',
        era: 1,
        kind: 'winner',
        winner: 'P1',
      },
      {
        n: 23,
        type: 'SiegeResolved',
        era: 1,
        attacker: 'P1',
        defender: 'P2',
        D: 1,
        W: 6,
        breach: false,
        wallsAfter: 5,
        directDamage: 0,
        cityHpAfter: 10,
      },
      {
        n: 24,
        type: 'RaidResolved',
        era: 1,
        attacker: 'P1',
        defender: 'P2',
        foodTransferred: 1,
        woodTransferred: 0,
      },
      {
        n: 25,
        type: 'EraEnded',
        era: 1,
        discardedUnitUids: { P1: ['uid_P1_0002'], P2: [] },
      },
      {
        n: 26,
        type: 'GameEnded',
        kind: 'points',
        winner: 'P1',
      },
    ];

    // Owner (P1) receives full detail on every event
    for (const ev of allEvents) {
      expect(projectEvent(ev, 'P1')).toEqual(ev);
    }

    // Opponent (P2) receives redacted payloads on private events
    expect(projectEvent(allEvents[2]!, 'P2')).toEqual({
      n: 3,
      type: 'CardsDrawn',
      player: 'P1',
      era: 1,
      count: 1,
    });

    expect(projectEvent(allEvents[4]!, 'P2')).toEqual({
      n: 5,
      type: 'MulliganResolved',
      player: 'P1',
      count: 1,
    });

    expect(projectEvent(allEvents[6]!, 'P2')).toEqual({
      n: 7,
      type: 'HandLimitDiscarded',
      player: 'P1',
      count: 1,
    });

    // ResourcesChanged (harvest -> null for opponent; conversion -> visible)
    expect(projectEvent(allEvents[7]!, 'P2')).toBeNull();
    expect(projectEvent(allEvents[8]!, 'P2')).toEqual(allEvents[8]);

    // ResourcesOverflowed (harvest -> null for opponent; raid -> visible)
    expect(projectEvent(allEvents[9]!, 'P2')).toBeNull();
    expect(projectEvent(allEvents[10]!, 'P2')).toEqual(allEvents[10]);

    // CardPlayed -> no uid, no cardId, no cardType for P2
    expect(projectEvent(allEvents[12]!, 'P2')).toEqual({
      n: 13,
      type: 'CardPlayed',
      player: 'P1',
      slotsUsed: 1,
      coveredCount: 1,
    });

    // ConversionActivated -> no sacrificeUid, no sacrificeCardId for P2
    expect(projectEvent(allEvents[13]!, 'P2')).toEqual({
      n: 14,
      type: 'ConversionActivated',
      player: 'P1',
      uid: 'uid_P1_0010',
      cardId: 'e3_gld',
      gain: { food: 1, wood: 1, metal: 1 },
      demBonusGained: 0,
      coveredCount: 0,
    });

    // Public battle/era events are identical for P2
    for (const idx of [0, 1, 3, 5, 11, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]) {
      expect(projectEvent(allEvents[idx]!, 'P2')).toEqual(allEvents[idx]);
    }
  });

  it('Task M1-12: orchestrates all commands through apply(state, cmd), ApplyTimeout (D2), Concede, and exports the 8 public API functions', async () => {
    const engineIndex = await import('../src/index.js');
    expect(typeof engineIndex.createGame).toBe('function');
    expect(typeof engineIndex.validateDeck).toBe('function');
    expect(typeof engineIndex.apply).toBe('function');
    expect(typeof engineIndex.legalCommands).toBe('function');
    expect(typeof engineIndex.playerView).toBe('function');
    expect(typeof engineIndex.projectEvent).toBe('function');
    expect(typeof engineIndex.stateHash).toBe('function');
    expect(typeof engineIndex.autoDiscard).toBe('function');

    const { apply } = engineIndex;

    const { state: s0 } = createGame({
      seed: 'apply-orchestrator-seed',
      catalog,
      fixedDecks: buildFixedDecks(),
      fixedInitiative: 'P1',
    });

    // 1. ApplyTimeout in mulligan (D2: keep all cards, cardUids = [])
    const t1 = apply(s0, { type: 'ApplyTimeout', player: 'P1' });
    expect(t1.ok).toBe(true);
    if (!t1.ok) return;
    expect(t1.value.state.players.P1.consecutiveTimeouts).toBe(1);
    expect(t1.value.state.stateVersion).toBe(1);

    // Duplicate timeout in mulligan -> DECISION_ALREADY_LOCKED
    expect(
      apply(t1.value.state, { type: 'ApplyTimeout', player: 'P1' }).ok,
    ).toBe(false);

    // P2 submits mulligan explicitly -> transitions to development
    const m2 = apply(t1.value.state, {
      type: 'SubmitMulligan',
      player: 'P2',
      cardUids: [],
    });
    expect(m2.ok).toBe(true);
    if (!m2.ok) return;
    expect(m2.value.state.phase).toBe('development');

    // 2. PlayCard via apply (resets consecutiveTimeouts for P1)
    const p1Card = m2.value.state.players.P1.hand.find(
      (c) => catalog[c.cardId]?.type === 'economy',
    )!;
    const play1 = apply(m2.value.state, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: p1Card.uid,
    });
    expect(play1.ok).toBe(true);
    if (!play1.ok) return;
    expect(play1.value.state.players.P1.consecutiveTimeouts).toBe(0);

    // Verify self view for P1 has non-empty buildings, units, discard
    const p1SelfView = playerView(play1.value.state, 'P1');
    expect(p1SelfView.self.buildings).toHaveLength(1);

    // Not P1's turn for ApplyTimeout in development -> NOT_YOUR_TURN
    expect(
      apply(play1.value.state, { type: 'ApplyTimeout', player: 'P1' }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'NOT_YOUR_TURN' }),
    });

    // 3. ApplyTimeout in development for P2 -> automatic Pass with reason: 'timeout'
    const t2 = apply(play1.value.state, { type: 'ApplyTimeout', player: 'P2' });
    expect(t2.ok).toBe(true);
    if (!t2.ok) return;
    expect(t2.value.state.players.P2.passed).toBe(true);

    // ApplyTimeout for already passed P2 -> ALREADY_PASSED
    expect(
      apply(t2.value.state, { type: 'ApplyTimeout', player: 'P2' }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'ALREADY_PASSED' }),
    });

    // P1 passes explicitly -> enters prebattle
    const pass1 = apply(t2.value.state, { type: 'Pass', player: 'P1' });
    expect(pass1.ok).toBe(true);
    if (!pass1.ok) return;
    expect(pass1.value.state.phase).toBe('prebattle');

    // 4. ApplyTimeout in prebattle for P1 (D2: LockInstants []) and LockInstants for P2
    const preT1 = apply(pass1.value.state, {
      type: 'ApplyTimeout',
      player: 'P1',
    });
    expect(preT1.ok).toBe(true);
    if (!preT1.ok) return;

    // Duplicate timeout in prebattle -> DECISION_ALREADY_LOCKED
    expect(
      apply(preT1.value.state, { type: 'ApplyTimeout', player: 'P1' }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'DECISION_ALREADY_LOCKED' }),
    });

    const preL2 = apply(preT1.value.state, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });
    expect(preL2.ok).toBe(true);
    if (!preL2.ok) return;
    // Both had >10 cards at Era II start (P1 had 7+5=12, P2 had 8+5=13) -> enters hand_limit!
    expect(preL2.value.state.era).toBe(2);
    expect(preL2.value.state.phase).toBe('hand_limit');

    // 5. ApplyTimeout in hand_limit (D2: autoDiscard) and SubmitDiscard via apply
    const hlT1 = apply(preL2.value.state, {
      type: 'ApplyTimeout',
      player: 'P1',
    });
    expect(hlT1.ok).toBe(true);
    if (!hlT1.ok) return;
    expect(hlT1.value.state.players.P1.consecutiveTimeouts).toBe(2);

    // Duplicate timeout in hand_limit -> DECISION_ALREADY_LOCKED
    expect(
      apply(hlT1.value.state, { type: 'ApplyTimeout', player: 'P1' }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'DECISION_ALREADY_LOCKED' }),
    });

    const p2DiscardUids = engineIndex.autoDiscard(
      hlT1.value.state.players.P2.hand,
      catalog,
      3,
    );
    const hlD2 = apply(hlT1.value.state, {
      type: 'SubmitDiscard',
      player: 'P2',
      cardUids: p2DiscardUids,
    });
    expect(hlD2.ok).toBe(true);
    if (!hlD2.ok) return;
    expect(hlD2.value.state.phase).toBe('development');

    // Test hand_limit timeout when player has <= 10 cards -> NOT_YOUR_TURN
    const customHl = structuredClone(preL2.value.state);
    customHl.players.P1.hand = customHl.players.P1.hand.slice(0, 10);
    expect(apply(customHl, { type: 'ApplyTimeout', player: 'P1' })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'NOT_YOUR_TURN' }),
    });

    // Test PlayConversion via apply in Era III
    const era3State = structuredClone(hlD2.value.state);
    era3State.era = 3;
    era3State.toAct = 'P1';
    era3State.players.P1.hand.push({
      uid: 'conv_test',
      cardId: 'e3_frn',
      owner: 'P1',
      drawnOrder: 99,
    });
    era3State.players.P1.units.push({
      uid: 'u_self_test',
      cardId: 'u1_inf_l',
      owner: 'P1',
      drawnOrder: 98,
      seq: 1,
      hp: 3,
      line: 'front',
      atkMod: 0,
      revealed: false,
    });
    const convViaApply = apply(era3State, {
      type: 'PlayConversion',
      player: 'P1',
      cardUid: 'conv_test',
      sacrificeUid: era3State.players.P1.buildings[0]!.uid,
    });
    expect(convViaApply.ok).toBe(true);
    if (convViaApply.ok) {
      const vSelf = playerView(convViaApply.value.state, 'P1');
      expect(vSelf.self.units).toHaveLength(1);
      expect(vSelf.self.discard.length).toBeGreaterThan(0);
    }

    // 6. 3rd consecutive timeout for P1 -> game ends immediately with kind: 'timeout', winner: 'P2'
    // In hlD2.value.state, Era II initiative is P2; P2 passes so it is P1's turn
    const p2PassEra2 = apply(hlD2.value.state, { type: 'Pass', player: 'P2' });
    if (!p2PassEra2.ok) return;
    const timeout3 = apply(p2PassEra2.value.state, {
      type: 'ApplyTimeout',
      player: 'P1',
    });
    expect(timeout3.ok).toBe(true);
    if (!timeout3.ok) return;
    expect(timeout3.value.state.phase).toBe('finished');
    expect(timeout3.value.state.result).toEqual({
      kind: 'timeout',
      winner: 'P2',
    });

    // Cannot ApplyTimeout or Concede in 'finished' phase
    expect(
      apply(timeout3.value.state, { type: 'ApplyTimeout', player: 'P1' }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'INVALID_PHASE' }),
    });
    expect(
      apply(timeout3.value.state, { type: 'Concede', player: 'P1' }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'INVALID_PHASE' }),
    });

    // 7. Explicit Concede in active game -> kind: 'concession', winner: 'P1'
    const concedeRes = apply(p2PassEra2.value.state, {
      type: 'Concede',
      player: 'P2',
    });
    expect(concedeRes.ok).toBe(true);
    if (!concedeRes.ok) return;
    expect(concedeRes.value.state.phase).toBe('finished');
    expect(concedeRes.value.state.result).toEqual({
      kind: 'concession',
      winner: 'P1',
    });
  });
});
