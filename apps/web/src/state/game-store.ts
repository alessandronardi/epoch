import {
  LOGISTICS_CAP_BY_ERA,
  type BattlePhaseId,
  type EraNo,
  type GameEvent,
  type PlayerId,
  type PlayerView,
  type RuleError,
  type UnitInstance,
  type UnplayableReason,
} from '@epochs/engine';
import { create, createStore, type StateCreator, type StoreApi } from 'zustand';
import { describeEvent, getBattleStageLabel } from './event-describer.js';
import {
  applyPlaybackUnits,
  applyPlaybackView,
  describeBattleDetails,
  removePlaybackCasualties,
  withPlaybackUnits,
} from './playback-state.js';

export type PlaybackSpeed = 1 | 2;

export type BattleStageCode = '1' | '2A' | '2B' | '3' | '4';

export type ActiveGameMode = 'bot' | 'hotseat' | 'remote' | 'replay' | null;

/** Cadenza normativa di rivelazione a cascata per singola unità in UnitsRevealed (§9.1 riga 772). */
export const UNIT_REVEAL_CASCADE_MS = 120;

/** Durata base a 1x per un evento standard non di combattimento. */
export const DEFAULT_EVENT_STEP_MS = 240;

/** Durata base a 1x per un evento di risoluzione fase di battaglia/assedio. */
export const BATTLE_EVENT_STEP_MS = 480;
export const BATTLE_ANNOUNCE_MS = 650;
export const BATTLE_IMPACT_MS = 400;
export const BATTLE_RESULT_MS = 850;
export type PlaybackMoment = 'announce' | 'impact' | 'result' | null;
export const BATTLE_STAGE_CODES: readonly BattleStageCode[] = ['1', '2A', '2B', '3', '4'];

function hasBattleMoments(event: GameEvent): boolean {
  return (
    event.type === 'BattlePhaseResolved' ||
    event.type === 'SiegeResolved' ||
    event.type === 'RaidResolved'
  );
}

export interface BattleLogEntry {
  readonly id: string;
  readonly n: number;
  readonly era: EraNo;
  readonly type: GameEvent['type'];
  readonly text: string;
  readonly stageLabel: string | null;
  readonly event: GameEvent;
  readonly details?: readonly string[];
}

export interface UnplayableBannerState {
  readonly uid: string;
  readonly cardId: string;
  readonly reason: UnplayableReason;
  readonly message: string;
}

export interface EnqueueEventsOptions {
  /**
   * Se fornito, mantiene la `PlayerView` precedente durante la riproduzione della coda
   * e applica `targetView` automaticamente al termine della coda o su `"Salta alla fine"`.
   */
  readonly targetView?: PlayerView | undefined;
  /**
   * Se `true`, svuota la coda e il registro precedenti prima di accodare i nuovi eventi.
   */
  readonly resetLog?: boolean | undefined;
  readonly resync?: boolean | undefined;
}

export function getBattleStageCode(event: GameEvent): BattleStageCode | null {
  switch (event.type) {
    case 'BattlePhaseResolved':
      switch (event.phase) {
        case 'phase1_volley':
          return '1';
        case 'phase2a_impale':
          return '2A';
        case 'phase2b_impact':
          return '2B';
        case 'phase3_melee':
          return '3';
      }
      break;
    case 'SiegeResolved':
    case 'RaidResolved':
      return '4';
    default:
      return null;
  }
}

export function getEventBaseDurationMs(event: GameEvent): number {
  if (hasBattleMoments(event)) return BATTLE_ANNOUNCE_MS + BATTLE_IMPACT_MS + BATTLE_RESULT_MS;
  switch (event.type) {
    case 'UnitsRevealed': {
      const totalUnits = event.units.P1.length + event.units.P2.length;
      return Math.max(1, totalUnits) * UNIT_REVEAL_CASCADE_MS;
    }
    case 'InstantsRevealed':
    case 'WallsModified':
    case 'BattleStarted':
    case 'BattlePhaseResolved':
    case 'BattleOutcome':
    case 'SiegeResolved':
    case 'RaidResolved':
      return BATTLE_EVENT_STEP_MS;
    default:
      return DEFAULT_EVENT_STEP_MS;
  }
}

export function getEventStepDurationMs(event: GameEvent, speed: PlaybackSpeed): number {
  return Math.round(getEventBaseDurationMs(event) / speed);
}

export function formatUnplayableReasonIt(
  reason: UnplayableReason,
  view?: PlayerView | null,
): string {
  switch (reason) {
    case 'no_slot': {
      const era = view?.era ?? 1;
      const cap = LOGISTICS_CAP_BY_ERA[era];
      const used = view?.self.slotsUsed ?? cap;
      return `Cap Logistico raggiunto (${used}/${cap})`;
    }
    case 'insufficient_resources':
      return 'Risorse insufficienti per sostenere il costo della carta';
    case 'no_building_to_sacrifice':
      return 'Richiede almeno un Edificio Economico attivo da sacrificare';
    case 'wrong_phase':
      return 'Giocabile solo nella finestra di fase appropriata (Sviluppo Era III o Pre-Battaglia)';
    case 'already_passed':
      return "Hai già passato il turno per il resto dell'Era";
    case 'already_committed':
      return 'Hai già confermato le tue scelte per questa finestra simultanea';
  }
}

function resolveEventEra(event: GameEvent, fallbackEra: EraNo): EraNo {
  if ('era' in event && typeof event.era === 'number') {
    return event.era;
  }
  return fallbackEra;
}

export interface GameStoreState {
  // Vista autorevole proiettata per il giocatore attivo
  readonly view: PlayerView | null;
  /** Public presentation held while the authoritative view advances. */
  readonly presentationView: PlayerView | null;
  readonly presentationEventFloor: number;
  readonly playbackMoment: PlaybackMoment;
  readonly playbackNotice: string;
  readonly battleEra: EraNo | null;
  readonly battleId: number | null;
  readonly skippedBattleStages: Readonly<Partial<Record<BattleStageCode, string>>>;
  readonly pendingView: PlayerView | null;
  readonly mode: ActiveGameMode;

  // Stato coda e riproduzione EventPlayer (§9.5)
  readonly queue: readonly GameEvent[];
  readonly currentEvent: GameEvent | null;
  readonly playedEvents: readonly GameEvent[];
  readonly battleLog: readonly BattleLogEntry[];
  readonly latestAnnouncement: string;
  readonly activeBattleStage: string | null;
  readonly activeBattleStageCode: BattleStageCode | null;
  readonly activeBattlePhaseId: BattlePhaseId | 'phase4_siege' | null;
  readonly scannedBattleStages: readonly BattleStageCode[];
  readonly battleStageHistory: readonly string[];
  readonly revealedUnitUids: readonly string[];
  readonly pendingCascadeUnitUids: readonly string[];
  readonly isRevealingUnits: boolean;
  readonly playbackUnits: Readonly<Record<PlayerId, readonly UnitInstance[]>>;
  readonly hasPlaybackSnapshot: boolean;
  readonly speed: PlaybackSpeed;
  readonly isPaused: boolean;
  readonly isPlaying: boolean;

  // Stato Hot-Seat e notifiche errore (§9.8)
  readonly awaitingHotSeatHandover: boolean;
  readonly hotSeatNextPlayer: PlayerId | null;
  readonly lastError: RuleError | null;

  // Stato UI effimero del tavolo (§9.3–§9.6)
  readonly inspectedCardId: string | null;
  readonly selectedHandUid: string | null;
  readonly unplayableBanner: UnplayableBannerState | null;
  readonly selectedMulliganUids: readonly string[];
  readonly selectedDiscardUids: readonly string[];
  readonly activeConversionUid: string | null;
  readonly selectedInstantUids: readonly string[];
  readonly confirmPassEnabled: boolean;
  readonly mobileDrawerOpen: boolean;

  // Azioni principali sullo stato e su EventPlayer
  readonly setMode: (mode: ActiveGameMode) => void;
  readonly setPlayerView: (view: PlayerView | null) => void;
  readonly receiveTransition: (
    view: PlayerView,
    events: readonly (GameEvent | null)[],
    options?: EnqueueEventsOptions,
  ) => void;
  readonly enqueueEvents: (
    events: readonly (GameEvent | null)[],
    options?: EnqueueEventsOptions,
  ) => void;
  readonly setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  readonly pausePlayback: () => void;
  readonly resumePlayback: () => void;
  readonly togglePausePlayback: () => void;
  readonly skipToEnd: () => void;
  readonly clearPlayback: () => void;

  // Azioni Hot-Seat e UI effimera
  readonly setHotSeatHandover: (awaiting: boolean, nextPlayer: PlayerId | null) => void;
  readonly setLastError: (error: RuleError | null) => void;
  readonly setInspectedCardId: (cardId: string | null) => void;
  readonly setSelectedHandUid: (uid: string | null) => void;
  readonly setUnplayableBanner: (banner: UnplayableBannerState | null) => void;
  readonly toggleMulliganUid: (uid: string) => void;
  readonly setSelectedMulliganUids: (uids: readonly string[]) => void;
  readonly toggleDiscardUid: (uid: string) => void;
  readonly setSelectedDiscardUids: (uids: readonly string[]) => void;
  readonly setActiveConversionUid: (uid: string | null) => void;
  readonly toggleInstantUid: (uid: string) => void;
  readonly setSelectedInstantUids: (uids: readonly string[]) => void;
  readonly setConfirmPassEnabled: (enabled: boolean) => void;
  readonly setMobileDrawerOpen: (open: boolean) => void;
  readonly toggleMobileDrawer: () => void;
  readonly resetStore: () => void;
}

export type GameStoreApi = StoreApi<GameStoreState>;

function initialPlayback() {
  return {
    pendingView: null as PlayerView | null,
    presentationView: null as PlayerView | null,
    presentationEventFloor: 0,
    playbackMoment: null as PlaybackMoment,
    playbackNotice: '',
    battleEra: null as EraNo | null,
    battleId: null as number | null,
    skippedBattleStages: {} as Partial<Record<BattleStageCode, string>>,
    queue: [] as readonly GameEvent[],
    currentEvent: null as GameEvent | null,
    playedEvents: [] as readonly GameEvent[],
    battleLog: [] as readonly BattleLogEntry[],
    latestAnnouncement: '',
    activeBattleStage: null as string | null,
    activeBattleStageCode: null as BattleStageCode | null,
    activeBattlePhaseId: null as BattlePhaseId | 'phase4_siege' | null,
    scannedBattleStages: [] as readonly BattleStageCode[],
    battleStageHistory: [] as readonly string[],
    revealedUnitUids: [] as readonly string[],
    pendingCascadeUnitUids: [] as readonly string[],
    isRevealingUnits: false,
    playbackUnits: { P1: [], P2: [] } as Readonly<Record<PlayerId, readonly UnitInstance[]>>,
    hasPlaybackSnapshot: false,
    speed: 1 as PlaybackSpeed,
    isPaused: false,
    isPlaying: false,
  };
}

function createGameStoreInitializer(): StateCreator<GameStoreState> {
  let activeTimer: ReturnType<typeof setTimeout> | null = null;
  let timerStarted = 0;
  let timerSpeed: PlaybackSpeed = 1;
  let remainingBaseMs = 0;
  const stopTimer = (preserve = false): void => {
    if (activeTimer !== null) {
      if (preserve)
        remainingBaseMs = Math.max(0, remainingBaseMs - (Date.now() - timerStarted) * timerSpeed);
      clearTimeout(activeTimer);
      activeTimer = null;
    }
  };

  return (set, get) => {
    const finishPlayback = (): void => {
      stopTimer();
      const state = get();
      set({
        view: state.pendingView ?? state.view,
        pendingView: null,
        presentationView: null,
        presentationEventFloor: 0,
        currentEvent: null,
        playbackMoment: null,
        activeBattleStage: null,
        activeBattleStageCode: null,
        activeBattlePhaseId: null,
        isPlaying: false,
        isRevealingUnits: false,
        pendingCascadeUnitUids: [],
      });
    };

    const finalizeCasualties = (event: GameEvent): void => {
      if (event.type !== 'BattlePhaseResolved') return;
      const state = get();
      const units = removePlaybackCasualties(state.playbackUnits, event);
      set({
        playbackUnits: units,
        presentationView:
          state.presentationView && event.n >= state.presentationEventFloor
            ? withPlaybackUnits(state.presentationView, units)
            : state.presentationView,
      });
    };

    // Single application path for timed playback and skip. Logs are committed only here.
    const consumeEvent = (event: GameEvent): void => {
      const state = get();
      const stage = getBattleStageLabel(event);
      const code = getBattleStageCode(event);
      const newBattle = event.type === 'UnitsRevealed' || event.type === 'BattleStarted';
      const scanned = newBattle ? ([] as BattleStageCode[]) : [...state.scannedBattleStages];
      const history = newBattle ? ([] as string[]) : [...state.battleStageHistory];
      const skipped = newBattle ? {} : { ...state.skippedBattleStages };
      if (code && !scanned.includes(code)) scanned.push(code);
      if (stage && history.at(-1) !== stage) history.push(stage);
      if (event.type === 'BattleOutcome') {
        for (const pending of BATTLE_STAGE_CODES.filter(
          (value) => value !== '4' && !scanned.includes(value),
        )) {
          skipped[pending] = 'Battaglia già conclusa';
        }
        if (event.kind !== 'winner')
          skipped['4'] =
            event.kind === 'stalemate' ? 'Nessun vincitore: stallo' : 'Annientamento reciproco';
      }
      if (event.type === 'EraEnded' && !scanned.includes('4') && !skipped['4'])
        skipped['4'] = 'Nessun assedio eseguito';
      const units = applyPlaybackUnits(state.playbackUnits, event);
      const era = resolveEventEra(event, state.presentationView?.era ?? state.view?.era ?? 1);
      const text = describeEvent(event);
      const clearStage =
        event.type === 'EraEnded' ||
        event.type === 'EraStarted' ||
        event.type === 'BattleOutcome' ||
        newBattle;
      set({
        playedEvents: [...state.playedEvents, event],
        battleLog: [
          ...state.battleLog,
          {
            id: `ev-${event.n}-${event.type}`,
            n: event.n,
            era,
            type: event.type,
            text,
            stageLabel: stage,
            event,
            details: describeBattleDetails(event, state.playbackUnits),
          },
        ],
        latestAnnouncement: text,
        activeBattleStage:
          event.type === 'BattleStarted'
            ? 'Inizio battaglia'
            : event.type === 'BattleOutcome'
              ? 'Esito campale'
              : event.type === 'EraEnded'
                ? 'Fine battaglia'
                : (stage ?? (clearStage ? null : state.activeBattleStage)),
        activeBattleStageCode: code ?? (clearStage ? null : state.activeBattleStageCode),
        activeBattlePhaseId:
          event.type === 'BattlePhaseResolved'
            ? event.phase
            : code === '4'
              ? 'phase4_siege'
              : clearStage
                ? null
                : state.activeBattlePhaseId,
        scannedBattleStages: scanned,
        battleStageHistory: history,
        skippedBattleStages: skipped,
        battleEra: newBattle ? event.era : state.battleEra,
        battleId: newBattle ? event.n : state.battleId,
        playbackNotice: newBattle ? '' : state.playbackNotice,
        playbackUnits: units,
        hasPlaybackSnapshot:
          event.type === 'UnitsRevealed' ||
          (event.type === 'BattleStarted' && event.units !== undefined)
            ? true
            : event.type === 'EraEnded'
              ? false
              : state.hasPlaybackSnapshot,
        presentationView:
          state.presentationView && event.n >= state.presentationEventFloor
            ? applyPlaybackView(state.presentationView, event, units)
            : state.presentationView,
      });
    };

    const schedule = (baseMs?: number): void => {
      stopTimer();
      if (baseMs !== undefined) remainingBaseMs = baseMs;
      const state = get();
      if (state.isPaused || !state.currentEvent) return;
      timerStarted = Date.now();
      timerSpeed = state.speed;
      activeTimer = setTimeout(
        () => {
          activeTimer = null;
          tick();
        },
        Math.round(remainingBaseMs / state.speed),
      );
    };

    const startEventStep = (event: GameEvent, queue: readonly GameEvent[]): void => {
      set({
        currentEvent: event,
        queue,
        isPlaying: true,
        playbackMoment: hasBattleMoments(event) ? 'announce' : null,
        isRevealingUnits: false,
        pendingCascadeUnitUids: [],
      });
      if (hasBattleMoments(event)) {
        set({
          activeBattleStage: getBattleStageLabel(event),
          activeBattleStageCode: getBattleStageCode(event),
          activeBattlePhaseId: event.type === 'BattlePhaseResolved' ? event.phase : 'phase4_siege',
          latestAnnouncement: `${getBattleStageLabel(event)}: preparazione.`,
        });
        schedule(BATTLE_ANNOUNCE_MS);
        return;
      }
      consumeEvent(event);
      if (event.type === 'UnitsRevealed') {
        set({
          revealedUnitUids: [],
          pendingCascadeUnitUids: [...event.units.P1, ...event.units.P2].map((unit) => unit.uid),
          isRevealingUnits: true,
        });
        schedule(UNIT_REVEAL_CASCADE_MS);
      } else schedule(getEventBaseDurationMs(event));
    };

    const advance = (): void => {
      const [next, ...rest] = get().queue;
      if (next) startEventStep(next, rest);
      else finishPlayback();
    };

    const tick = (): void => {
      const state = get();
      const event = state.currentEvent;
      if (!event || state.isPaused) return;
      if (state.playbackMoment === 'announce') {
        consumeEvent(event);
        set({ playbackMoment: 'impact' });
        schedule(BATTLE_IMPACT_MS);
      } else if (state.playbackMoment === 'impact') {
        finalizeCasualties(event);
        set({ playbackMoment: 'result' });
        schedule(BATTLE_RESULT_MS);
      } else if (event.type === 'UnitsRevealed') {
        const [uid, ...remaining] = state.pendingCascadeUnitUids;
        set({
          revealedUnitUids: uid ? [...state.revealedUnitUids, uid] : state.revealedUnitUids,
          pendingCascadeUnitUids: remaining,
          isRevealingUnits: remaining.length > 0,
        });
        if (remaining.length > 0) schedule(UNIT_REVEAL_CASCADE_MS);
        else advance();
      } else advance();
    };

    return {
      ...initialPlayback(),
      view: null,
      mode: null,
      awaitingHotSeatHandover: false,
      hotSeatNextPlayer: null,
      lastError: null,
      inspectedCardId: null,
      selectedHandUid: null,
      unplayableBanner: null,
      selectedMulliganUids: [],
      selectedDiscardUids: [],
      activeConversionUid: null,
      selectedInstantUids: [],
      confirmPassEnabled: true,
      mobileDrawerOpen: false,
      setMode: (mode) => set({ mode }),
      setPlayerView: (view) => set({ view }),
      receiveTransition: (nextView, events, options) => {
        const valid = events.filter(
          (event): event is GameEvent => event !== null && event !== undefined,
        );
        const reset =
          options?.resetLog || valid.some((event) => event.type === 'GameStarted' && event.n === 1);
        const state = get();
        if (reset) {
          stopTimer();
          set({
            ...initialPlayback(),
            view: nextView,
            selectedHandUid: null,
            unplayableBanner: null,
            selectedMulliganUids: [],
            selectedDiscardUids: [],
            activeConversionUid: null,
            selectedInstantUids: [],
            lastError: null,
          });
        } else if (options?.resync && state.isPlaying) {
          stopTimer();
          set({
            view: nextView,
            presentationView: null,
            pendingView: null,
            queue: [],
            currentEvent: null,
            playbackMoment: null,
            isPlaying: false,
            isPaused: false,
            isRevealingUnits: false,
            pendingCascadeUnitUids: [],
            activeBattleStage: null,
            activeBattleStageCode: null,
            activeBattlePhaseId: null,
            playbackNotice: 'Riproduzione interrotta: partita riallineata allo stato aggiornato.',
            hasPlaybackSnapshot: false,
          });
        } else {
          const known = new Set(
            [
              ...state.playedEvents,
              ...state.queue,
              ...(state.currentEvent ? [state.currentEvent] : []),
            ].map((event) => event.n),
          );
          const fresh = valid.filter((event) => !known.has(event.n));
          const battle = fresh.some(
            (event) =>
              event.type === 'UnitsRevealed' ||
              event.type === 'BattleStarted' ||
              hasBattleMoments(event),
          );
          set({
            view: nextView,
            pendingView: null,
            presentationView:
              state.presentationView ?? (battle && state.view ? structuredClone(state.view) : null),
            presentationEventFloor: state.presentationView
              ? state.presentationEventFloor
              : battle
                ? Math.min(...fresh.map((event) => event.n))
                : 0,
            selectedHandUid: null,
            unplayableBanner: null,
            lastError: null,
          });
        }
        if (valid.length) get().enqueueEvents(valid);
      },
      enqueueEvents: (events, options) => {
        if (options?.resetLog) {
          stopTimer();
          set(initialPlayback());
        }
        const state = get();
        const existing = new Set(
          [
            ...state.playedEvents,
            ...state.queue,
            ...(state.currentEvent ? [state.currentEvent] : []),
          ].map((event) => event.n),
        );
        const fresh = events
          .filter((event): event is GameEvent => {
            if (!event || existing.has(event.n)) return false;
            existing.add(event.n);
            return true;
          })
          .sort((a, b) => a.n - b.n);
        if (options?.targetView) {
          if (!state.view || (!fresh.length && !state.currentEvent && !state.queue.length))
            set({ view: options.targetView, pendingView: null });
          else set({ pendingView: options.targetView });
        }
        if (!fresh.length) return;
        const queue = [...get().queue, ...fresh].sort((a, b) => a.n - b.n);
        if (!state.currentEvent && !state.isPaused) {
          const [first, ...rest] = queue;
          if (first) startEventStep(first, rest);
        } else set({ queue, isPlaying: true });
      },
      setPlaybackSpeed: (speed) => {
        stopTimer(true);
        set({ speed });
        schedule();
      },
      pausePlayback: () => {
        stopTimer(true);
        set({ isPaused: true });
      },
      resumePlayback: () => {
        if (!get().isPaused) return;
        set({ isPaused: false });
        if (get().currentEvent) schedule();
        else if (get().queue.length) advance();
      },
      togglePausePlayback: () => {
        if (get().isPaused) get().resumePlayback();
        else get().pausePlayback();
      },
      skipToEnd: () => {
        stopTimer();
        const state = get();
        // Null currentEvent prevents audio from firing while events are consumed synchronously.
        set({ currentEvent: null, playbackMoment: null });
        if (state.currentEvent) {
          if (state.playbackMoment === 'announce') consumeEvent(state.currentEvent);
          finalizeCasualties(state.currentEvent);
        }
        for (const event of state.queue) {
          consumeEvent(event);
          finalizeCasualties(event);
          if (event.type === 'UnitsRevealed')
            set({
              revealedUnitUids: [...event.units.P1, ...event.units.P2].map((unit) => unit.uid),
            });
        }
        set({
          queue: [],
          revealedUnitUids: [
            ...new Set([...get().revealedUnitUids, ...state.pendingCascadeUnitUids]),
          ],
          isPaused: false,
        });
        finishPlayback();
      },
      clearPlayback: () => {
        stopTimer();
        set({ ...initialPlayback(), view: get().pendingView ?? get().view });
      },
      setHotSeatHandover: (awaiting, nextPlayer) =>
        set({ awaitingHotSeatHandover: awaiting, hotSeatNextPlayer: nextPlayer }),
      setLastError: (error) => set({ lastError: error }),

      setInspectedCardId: (cardId) => set({ inspectedCardId: cardId }),

      setSelectedHandUid: (uid) => set({ selectedHandUid: uid }),

      setUnplayableBanner: (banner) => set({ unplayableBanner: banner }),

      toggleMulliganUid: (uid) =>
        set((state) => ({
          selectedMulliganUids: state.selectedMulliganUids.includes(uid)
            ? state.selectedMulliganUids.filter((item) => item !== uid)
            : [...state.selectedMulliganUids, uid],
        })),

      setSelectedMulliganUids: (uids) => set({ selectedMulliganUids: [...uids] }),

      toggleDiscardUid: (uid) =>
        set((state) => ({
          selectedDiscardUids: state.selectedDiscardUids.includes(uid)
            ? state.selectedDiscardUids.filter((item) => item !== uid)
            : [...state.selectedDiscardUids, uid],
        })),

      setSelectedDiscardUids: (uids) => set({ selectedDiscardUids: [...uids] }),

      setActiveConversionUid: (uid) => set({ activeConversionUid: uid }),

      toggleInstantUid: (uid) =>
        set((state) => ({
          selectedInstantUids: state.selectedInstantUids.includes(uid)
            ? state.selectedInstantUids.filter((item) => item !== uid)
            : [...state.selectedInstantUids, uid],
        })),

      setSelectedInstantUids: (uids) => set({ selectedInstantUids: [...uids] }),

      setConfirmPassEnabled: (enabled) => set({ confirmPassEnabled: enabled }),

      setMobileDrawerOpen: (open) => set({ mobileDrawerOpen: open }),

      toggleMobileDrawer: () => set((state) => ({ mobileDrawerOpen: !state.mobileDrawerOpen })),

      resetStore: () => {
        stopTimer();
        set({
          ...initialPlayback(),
          view: null,
          mode: null,
          awaitingHotSeatHandover: false,
          hotSeatNextPlayer: null,
          lastError: null,
          inspectedCardId: null,
          selectedHandUid: null,
          unplayableBanner: null,
          selectedMulliganUids: [],
          selectedDiscardUids: [],
          activeConversionUid: null,
          selectedInstantUids: [],
          confirmPassEnabled: true,
          mobileDrawerOpen: false,
        });
      },
    };
  };
}

export function createGameStore(): GameStoreApi {
  return createStore<GameStoreState>(createGameStoreInitializer());
}

export const useGameStore = create<GameStoreState>()(createGameStoreInitializer());
