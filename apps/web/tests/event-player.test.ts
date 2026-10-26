import balancedTacticalDeckJson from '../../../data/decks/balanced-tactical.json' with { type: 'json' };
import { CARDS_RULES } from '@epochs/content';
import {
  apply,
  createGame,
  playerView,
  projectEvent,
  type DeckPayload,
  type GameEvent,
} from '@epochs/engine';

const SAMPLE_DECK = balancedTacticalDeckJson as DeckPayload;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  describeEvent,
  getBattleStageLabel,
} from '../src/state/event-describer.js';
import {
  BATTLE_EVENT_STEP_MS,
  createGameStore,
  DEFAULT_EVENT_STEP_MS,
  formatUnplayableReasonIt,
  UNIT_REVEAL_CASCADE_MS,
} from '../src/state/game-store.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function createSampleEvents(): GameEvent[] {
  return [
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
      count: 2,
      cards: [
        { uid: 'u-1', cardId: 'e1_farm', owner: 'P1', drawnOrder: 1 },
        { uid: 'u-2', cardId: 'u1_inf_l', owner: 'P1', drawnOrder: 2 },
      ],
    },
    {
      n: 4,
      type: 'CardsDrawn',
      player: 'P2',
      era: 1,
      count: 2,
    },
    {
      n: 5,
      type: 'PlayerCommitted',
      player: 'P1',
      window: 'mulligan',
    },
    {
      n: 6,
      type: 'MulliganResolved',
      player: 'P1',
      count: 0,
    },
    {
      n: 7,
      type: 'MulliganResolved',
      player: 'P2',
      count: 2,
    },
    {
      n: 8,
      type: 'EraStarted',
      era: 1,
      initiative: 'P1',
      walls: { P1: 6, P2: 6 },
      cityHp: { P1: 10, P2: 10 },
      cityMax: { P1: 10, P2: 10 },
    },
    {
      n: 9,
      type: 'HandLimitDiscarded',
      player: 'P1',
      count: 1,
      cardUids: ['u-1'],
    },
    {
      n: 10,
      type: 'ResourcesChanged',
      player: 'P1',
      reason: 'harvest',
      delta: { food: 2, wood: 2, metal: 0 },
      resources: { food: 4, wood: 4, metal: 0 },
    },
    {
      n: 11,
      type: 'ResourcesOverflowed',
      player: 'P1',
      reason: 'harvest',
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
      uid: 'u-1',
      cardId: 'e1_farm',
      cardType: 'economy',
    },
    {
      n: 14,
      type: 'CardPlayed',
      player: 'P2',
      slotsUsed: 1,
      coveredCount: 1,
    },
    {
      n: 15,
      type: 'ConversionActivated',
      player: 'P1',
      uid: 'c-1',
      cardId: 'e3_frn',
      gain: { food: 0, wood: 0, metal: 3 },
      demBonusGained: 1,
      coveredCount: 0,
      sacrificeUid: 'u-1',
      sacrificeCardId: 'e1_farm',
    },
    {
      n: 16,
      type: 'PlayerPassed',
      player: 'P1',
      era: 1,
      cycle: 1,
      reason: 'chosen',
    },
    {
      n: 17,
      type: 'DevelopmentEnded',
      era: 1,
    },
    {
      n: 18,
      type: 'UnitsRevealed',
      era: 1,
      units: {
        P1: [
          {
            uid: 'unit-p1-1',
            cardId: 'u1_arc_l',
            drawnOrder: 3,
            owner: 'P1',
            seq: 1,
            hp: 1,
            line: 'rear',
            atkMod: 0,
            revealed: true,
          },
          {
            uid: 'unit-p1-2',
            cardId: 'u1_spr_l',
            drawnOrder: 4,
            owner: 'P1',
            seq: 2,
            hp: 2,
            line: 'front',
            atkMod: 0,
            revealed: true,
          },
        ],
        P2: [
          {
            uid: 'unit-p2-1',
            cardId: 'u1_cav_l',
            drawnOrder: 5,
            owner: 'P2',
            seq: 1,
            hp: 2,
            line: 'center',
            atkMod: 0,
            revealed: true,
          },
        ],
      },
      resources: {
        P1: { food: 2, wood: 2, metal: 0 },
        P2: { food: 3, wood: 1, metal: 0 },
      },
    },
    {
      n: 19,
      type: 'InstantsRevealed',
      era: 1,
      played: {
        P1: [{ uid: 'inst-1', cardId: 'i1_arr' }],
        P2: [],
      },
    },
    {
      n: 20,
      type: 'WallsModified',
      era: 1,
      wallsBefore: { P1: 6, P2: 6 },
      deltaOwn: { P1: 2, P2: 0 },
      deltaEnemy: { P1: 0, P2: 0 },
      wallsAfter: { P1: 8, P2: 6 },
    },
    {
      n: 21,
      type: 'BattleStarted',
      era: 1,
    },
    {
      n: 22,
      type: 'BattlePhaseResolved',
      era: 1,
      phase: 'phase1_volley',
      damageDealt: { P1: 2, P2: 0 },
      assignments: { P1: [], P2: [{ uid: 'unit-p2-1', damage: 2 }] },
      casualties: { P1: [], P2: ['unit-p2-1'] },
    },
    {
      n: 23,
      type: 'BattlePhaseResolved',
      era: 1,
      phase: 'phase2a_impale',
      damageDealt: { P1: 2, P2: 0 },
      assignments: { P1: [], P2: [] },
      casualties: { P1: [], P2: [] },
    },
    {
      n: 24,
      type: 'BattlePhaseResolved',
      era: 1,
      phase: 'phase2b_impact',
      damageDealt: { P1: 0, P2: 2 },
      assignments: { P1: [{ uid: 'unit-p1-1', damage: 1 }], P2: [] },
      casualties: { P1: ['unit-p1-1'], P2: [] },
    },
    {
      n: 25,
      type: 'BattlePhaseResolved',
      era: 1,
      phase: 'phase3_melee',
      meleeCycle: 1,
      damageDealt: { P1: 1, P2: 0 },
      assignments: { P1: [], P2: [] },
      casualties: { P1: [], P2: [] },
    },
    {
      n: 26,
      type: 'BattleOutcome',
      era: 1,
      kind: 'winner',
      winner: 'P1',
    },
    {
      n: 27,
      type: 'SiegeResolved',
      era: 1,
      attacker: 'P1',
      defender: 'P2',
      D: 7,
      W: 6,
      breach: true,
      wallsAfter: 0,
      directDamage: 1,
      cityHpAfter: 9,
    },
    {
      n: 28,
      type: 'RaidResolved',
      era: 1,
      attacker: 'P1',
      defender: 'P2',
      foodTransferred: 1,
      woodTransferred: 1,
    },
    {
      n: 29,
      type: 'EraEnded',
      era: 1,
      discardedUnitUids: { P1: ['unit-p1-2'], P2: [] },
    },
    {
      n: 30,
      type: 'GameEnded',
      kind: 'points',
      winner: 'P1',
    },
  ];
}

describe('describeEvent and getBattleStageLabel (M3-05)', () => {
  it('generates non-empty Italian sentence-case descriptions for all 24 GameEvent types', () => {
    const events = createSampleEvents();
    const seenTypes = new Set<GameEvent['type']>();

    for (const event of events) {
      seenTypes.add(event.type);
      const description = describeEvent(event, 'it');
      expect(description.length).toBeGreaterThan(10);
      expect(description.endsWith('.')).toBe(true);
    }

    expect(seenTypes.size).toBe(24);

    // Verifica casi specifici di formattazione
    expect(describeEvent(events[0]!, 'it')).toContain('Partita avviata in Era I');
    expect(describeEvent(events[12]!, 'it')).toContain('Edificio Economico');
    expect(describeEvent(events[13]!, 'it')).toContain('carta coperta nella Città');
    expect(describeEvent(events[14]!, 'it')).toContain('Riconversione');
    expect(describeEvent(events[21]!, 'it')).toContain('Fase 1: Tiro');
    expect(describeEvent(events[22]!, 'it')).toContain('Fase 2A: Impalamento');
    expect(describeEvent(events[23]!, 'it')).toContain(
      'Fase 2B: Impatto/Accerchiamento',
    );
    expect(describeEvent(events[24]!, 'it')).toContain(
      'Fase 3: Mischia Ciclo 1/6',
    );
    expect(describeEvent(events[26]!, 'it')).toContain('Fase 4: Assedio e Razzia');
  });

  it('maps battle and siege events to their exact Italian stage labels', () => {
    const events = createSampleEvents();
    const byType = (type: GameEvent['type'], phase?: string): GameEvent =>
      events.find(
        (ev) =>
          ev.type === type &&
          (phase === undefined ||
            (ev.type === 'BattlePhaseResolved' && ev.phase === phase)),
      )!;

    expect(getBattleStageLabel(byType('BattlePhaseResolved', 'phase1_volley'))).toBe(
      'Fase 1: Tiro',
    );
    expect(getBattleStageLabel(byType('BattlePhaseResolved', 'phase2a_impale'))).toBe(
      'Fase 2A: Impalamento',
    );
    expect(getBattleStageLabel(byType('BattlePhaseResolved', 'phase2b_impact'))).toBe(
      'Fase 2B: Impatto/Accerchiamento',
    );
    expect(getBattleStageLabel(byType('BattlePhaseResolved', 'phase3_melee'))).toBe(
      'Fase 3: Mischia Ciclo 1/6',
    );
    expect(getBattleStageLabel(byType('SiegeResolved'))).toBe(
      'Fase 4: Assedio e Razzia',
    );
    expect(getBattleStageLabel(byType('RaidResolved'))).toBe(
      'Fase 4: Assedio e Razzia',
    );
    expect(getBattleStageLabel(byType('CycleStarted'))).toBeNull();
  });
});

describe('EventPlayer and GameStore (M3-05)', () => {
  it('reveals units in cascade every 120ms at 1x speed and 60ms at 2x speed during UnitsRevealed', () => {
    const store = createGameStore();
    const sampleEvents = createSampleEvents();
    const unitsRevealedEv = sampleEvents.find(
      (ev) => ev.type === 'UnitsRevealed',
    )!;
    const battleStartedEv = sampleEvents.find(
      (ev) => ev.type === 'BattleStarted',
    )!;

    store.getState().enqueueEvents([unitsRevealedEv, battleStartedEv]);

    // All'istante t=0 UnitsRevealed è in corso con 0 unità ancora girate
    expect(store.getState().currentEvent?.type).toBe('UnitsRevealed');
    expect(store.getState().isRevealingUnits).toBe(true);
    expect(store.getState().revealedUnitUids).toEqual([]);

    // 1° tick a 120ms (1x): prima unità rivelata
    vi.advanceTimersByTime(UNIT_REVEAL_CASCADE_MS);
    expect(store.getState().revealedUnitUids).toEqual(['unit-p1-1']);
    expect(store.getState().isRevealingUnits).toBe(true);

    // Passiamo a velocità 2x: i prossimi 2 tick richiedono 60ms ciascuno
    store.getState().setPlaybackSpeed(2);

    vi.advanceTimersByTime(UNIT_REVEAL_CASCADE_MS / 2);
    expect(store.getState().revealedUnitUids).toEqual([
      'unit-p1-1',
      'unit-p1-2',
    ]);
    expect(store.getState().isRevealingUnits).toBe(true);

    vi.advanceTimersByTime(UNIT_REVEAL_CASCADE_MS / 2);
    expect(store.getState().revealedUnitUids).toEqual([
      'unit-p1-1',
      'unit-p1-2',
      'unit-p2-1',
    ]);
    expect(store.getState().isRevealingUnits).toBe(false);
    // Avanza automaticamente a BattleStarted
    expect(store.getState().currentEvent?.type).toBe('BattleStarted');
  });

  it('scans battle phases 1, 2A, 2B, 3, 4 in order and supports Pause, Resume, 1x/2x and Skip to End', () => {
    const store = createGameStore();
    const sampleEvents = createSampleEvents();
    const battleSequence = sampleEvents.filter(
      (ev) => ev.n >= 21 && ev.n <= 29,
    );

    // Creiamo una PlayerView iniziale e una finale per verificare l'aggiornamento su Salta alla fine
    const { state: initialState } = createGame({
      seed: 'm3-05-test',
      catalog: CARDS_RULES,
      decks: { P1: SAMPLE_DECK, P2: SAMPLE_DECK },
      fixedInitiative: 'P1',
    });
    const initialView = playerView(initialState, 'P1');
    const applied = apply(initialState, {
      type: 'SubmitMulligan',
      player: 'P1',
      cardUids: [],
    });
    expect(applied.ok).toBe(true);
    const targetView = playerView(
      applied.ok ? applied.value.state : initialState,
      'P1',
    );

    store.getState().setPlayerView(initialView);

    // Inseriamo gli eventi in ordine mescolato per verificare il riordinamento per n
    const shuffled = [...battleSequence].reverse();
    store.getState().enqueueEvents(shuffled, { targetView });

    // t=0: primo evento (n=21 BattleStarted)
    expect(store.getState().currentEvent?.n).toBe(21);
    expect(store.getState().view?.stateVersion).toBe(initialView.stateVersion);

    // Avanza a n=22 (Fase 1: Tiro)
    vi.advanceTimersByTime(BATTLE_EVENT_STEP_MS);
    expect(store.getState().currentEvent?.n).toBe(22);
    expect(store.getState().activeBattleStage).toBe('Fase 1: Tiro');
    expect(store.getState().activeBattleStageCode).toBe('1');

    // Mettiamo in Pausa: avanzare il timer non deve far scorrere la coda
    store.getState().pausePlayback();
    expect(store.getState().isPaused).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(store.getState().currentEvent?.n).toBe(22);
    expect(store.getState().activeBattleStage).toBe('Fase 1: Tiro');

    // Riprendiamo a velocità 2x (240ms per passo invece di 480ms)
    store.getState().setPlaybackSpeed(2);
    store.getState().resumePlayback();
    expect(store.getState().isPaused).toBe(false);

    // Avanza a n=23 (Fase 2A: Impalamento)
    vi.advanceTimersByTime(BATTLE_EVENT_STEP_MS / 2);
    expect(store.getState().currentEvent?.n).toBe(23);
    expect(store.getState().activeBattleStage).toBe('Fase 2A: Impalamento');
    expect(store.getState().activeBattleStageCode).toBe('2A');

    // Avanza a n=24 (Fase 2B: Impatto/Accerchiamento)
    vi.advanceTimersByTime(BATTLE_EVENT_STEP_MS / 2);
    expect(store.getState().currentEvent?.n).toBe(24);
    expect(store.getState().activeBattleStage).toBe(
      'Fase 2B: Impatto/Accerchiamento',
    );
    expect(store.getState().activeBattleStageCode).toBe('2B');

    // Avanza a n=25 (Fase 3: Mischia Ciclo 1/6)
    vi.advanceTimersByTime(BATTLE_EVENT_STEP_MS / 2);
    expect(store.getState().currentEvent?.n).toBe(25);
    expect(store.getState().activeBattleStage).toBe(
      'Fase 3: Mischia Ciclo 1/6',
    );
    expect(store.getState().activeBattleStageCode).toBe('3');

    // Premiamo "Salta alla fine" (skipToEnd): deve consumare istantaneamente il resto (inclusa Fase 4)
    store.getState().skipToEnd();

    const finalState = store.getState();
    expect(finalState.isPlaying).toBe(false);
    expect(finalState.queue).toHaveLength(0);
    expect(finalState.currentEvent).toBeNull();
    expect(finalState.scannedBattleStages).toEqual(['1', '2A', '2B', '3', '4']);
    expect(finalState.battleStageHistory).toEqual([
      'Fase 1: Tiro',
      'Fase 2A: Impalamento',
      'Fase 2B: Impatto/Accerchiamento',
      'Fase 3: Mischia Ciclo 1/6',
      'Fase 4: Assedio e Razzia',
    ]);
    expect(finalState.battleLog).toHaveLength(battleSequence.length);
    expect(finalState.view?.stateVersion).toBe(targetView.stateVersion);
  });

  it('formats all UnplayableReason codes in clear Italian and works with projected engine events', () => {
    const { state, events } = createGame({
      seed: 'm3-05-engine',
      catalog: CARDS_RULES,
      decks: { P1: SAMPLE_DECK, P2: SAMPLE_DECK },
      fixedInitiative: 'P1',
    });
    const view = playerView(state, 'P1');
    const projected = events.map((ev) => projectEvent(ev, 'P1'));
    const nonNullProjected = projected.filter(
      (ev): ev is GameEvent => ev !== null,
    );

    const store = createGameStore();
    store.getState().receiveTransition(view, projected);

    vi.advanceTimersByTime(
      DEFAULT_EVENT_STEP_MS * nonNullProjected.length + 500,
    );
    expect(store.getState().battleLog.length).toBe(nonNullProjected.length);
    expect(store.getState().isPlaying).toBe(false);

    expect(formatUnplayableReasonIt('no_slot', view)).toContain(
      'Cap Logistico raggiunto (0/4)',
    );
    expect(formatUnplayableReasonIt('insufficient_resources', view)).toContain(
      'Risorse insufficienti',
    );
    expect(formatUnplayableReasonIt('no_building_to_sacrifice', view)).toContain(
      'Edificio Economico',
    );
  });
});
