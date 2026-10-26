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
import {
  create,
  createStore,
  type StateCreator,
  type StoreApi,
} from 'zustand';
import { describeEvent, getBattleStageLabel } from './event-describer.js';

export type PlaybackSpeed = 1 | 2;

export type BattleStageCode = '1' | '2A' | '2B' | '3' | '4';

export type ActiveGameMode = 'bot' | 'hotseat' | 'remote' | 'replay' | null;

/** Cadenza normativa di rivelazione a cascata per singola unità in UnitsRevealed (§9.1 riga 772). */
export const UNIT_REVEAL_CASCADE_MS = 120;

/** Durata base a 1x per un evento standard non di combattimento. */
export const DEFAULT_EVENT_STEP_MS = 240;

/** Durata base a 1x per un evento di risoluzione fase di battaglia/assedio. */
export const BATTLE_EVENT_STEP_MS = 480;

export interface BattleLogEntry {
  readonly id: string;
  readonly n: number;
  readonly era: EraNo;
  readonly type: GameEvent['type'];
  readonly text: string;
  readonly stageLabel: string | null;
  readonly event: GameEvent;
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

export function getEventStepDurationMs(
  event: GameEvent,
  speed: PlaybackSpeed,
): number {
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

function applyEventToPlaybackUnits(
  units: Record<PlayerId, UnitInstance[]>,
  event: GameEvent,
): Record<PlayerId, UnitInstance[]> {
  if (event.type === 'UnitsRevealed') {
    return {
      P1: event.units.P1.map((u) => ({ ...u })),
      P2: event.units.P2.map((u) => ({ ...u })),
    };
  }

  if (event.type === 'BattlePhaseResolved') {
    const updateSide = (side: PlayerId): UnitInstance[] => {
      const damageByUid = new Map<string, number>();
      for (const assignment of event.assignments[side]) {
        damageByUid.set(
          assignment.uid,
          (damageByUid.get(assignment.uid) ?? 0) + assignment.damage,
        );
      }
      const casualtiesSet = new Set(event.casualties[side]);
      return units[side]
        .map((unit) => {
          const dmg = damageByUid.get(unit.uid) ?? 0;
          return dmg > 0 ? { ...unit, hp: Math.max(0, unit.hp - dmg) } : unit;
        })
        .filter((unit) => !casualtiesSet.has(unit.uid) && unit.hp > 0);
    };

    return {
      P1: updateSide('P1'),
      P2: updateSide('P2'),
    };
  }

  if (event.type === 'EraEnded') {
    return { P1: [], P2: [] };
  }

  return units;
}

export interface GameStoreState {
  // Vista autorevole proiettata per il giocatore attivo
  readonly view: PlayerView | null;
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
  readonly setHotSeatHandover: (
    awaiting: boolean,
    nextPlayer: PlayerId | null,
  ) => void;
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

function createGameStoreInitializer(): StateCreator<GameStoreState> {
  let activeTimer: ReturnType<typeof setTimeout> | null = null;

  const clearActiveTimer = (): void => {
    if (activeTimer !== null) {
      clearTimeout(activeTimer);
      activeTimer = null;
    }
  };

  return (set, get) => {
    const scheduleCurrentEventTimer = (): void => {
      clearActiveTimer();
      const state = get();
      if (state.isPaused || state.currentEvent === null) {
        return;
      }

      const current = state.currentEvent;
      if (current.type === 'UnitsRevealed') {
        const cascadeDelay = Math.round(UNIT_REVEAL_CASCADE_MS / state.speed);
        activeTimer = setTimeout(() => {
          activeTimer = null;
          onCascadeTick();
        }, cascadeDelay);
        return;
      }

      const stepDelay = getEventStepDurationMs(current, state.speed);
      activeTimer = setTimeout(() => {
        activeTimer = null;
        advanceToNextEvent();
      }, stepDelay);
    };

    const onCascadeTick = (): void => {
      const state = get();
      if (state.isPaused || state.currentEvent?.type !== 'UnitsRevealed') {
        return;
      }

      if (state.pendingCascadeUnitUids.length > 0) {
        const [nextUid, ...remainingUids] = state.pendingCascadeUnitUids;
        const updatedRevealed =
          nextUid !== undefined && !state.revealedUnitUids.includes(nextUid)
            ? [...state.revealedUnitUids, nextUid]
            : state.revealedUnitUids;

        if (remainingUids.length > 0) {
          set({
            revealedUnitUids: updatedRevealed,
            pendingCascadeUnitUids: remainingUids,
            isRevealingUnits: true,
          });
          scheduleCurrentEventTimer();
          return;
        }

        // Ultima unità della cascata rivelata: chiudi la cascata e passa all'evento successivo
        set({
          revealedUnitUids: updatedRevealed,
          pendingCascadeUnitUids: [],
          isRevealingUnits: false,
        });
        advanceToNextEvent();
        return;
      }

      // Caso 0 unità schierate in UnitsRevealed
      set({
        isRevealingUnits: false,
        pendingCascadeUnitUids: [],
      });
      advanceToNextEvent();
    };

    const startEventStep = (
      event: GameEvent,
      remainingQueue: readonly GameEvent[],
    ): void => {
      const state = get();
      const fallbackEra: EraNo =
        state.view?.era ?? state.pendingView?.era ?? 1;
      const era = resolveEventEra(event, fallbackEra);
      const description = describeEvent(event, 'it');
      const stageLabel = getBattleStageLabel(event, 'it');
      const stageCode = getBattleStageCode(event);

      const entry: BattleLogEntry = {
        id: `ev-${event.n}-${event.type}`,
        n: event.n,
        era,
        type: event.type,
        text: description,
        stageLabel,
        event,
      };

      const nextStageHistory =
        stageLabel !== null &&
        state.battleStageHistory[state.battleStageHistory.length - 1] !==
          stageLabel
          ? [...state.battleStageHistory, stageLabel]
          : state.battleStageHistory;

      const nextScannedStages =
        stageCode !== null && !state.scannedBattleStages.includes(stageCode)
          ? [...state.scannedBattleStages, stageCode]
          : state.scannedBattleStages;

      const nextActivePhaseId: BattlePhaseId | 'phase4_siege' | null =
        event.type === 'BattlePhaseResolved'
          ? event.phase
          : event.type === 'SiegeResolved' || event.type === 'RaidResolved'
            ? 'phase4_siege'
            : event.type === 'EraEnded' || event.type === 'EraStarted'
              ? null
              : state.activeBattlePhaseId;

      const nextActiveStage =
        stageLabel !== null
          ? stageLabel
          : event.type === 'EraEnded' || event.type === 'EraStarted'
            ? null
            : state.activeBattleStage;

      const nextActiveStageCode =
        stageCode !== null
          ? stageCode
          : event.type === 'EraEnded' || event.type === 'EraStarted'
            ? null
            : state.activeBattleStageCode;

      const nextPlaybackUnits = applyEventToPlaybackUnits(
        {
          P1: [...state.playbackUnits.P1],
          P2: [...state.playbackUnits.P2],
        },
        event,
      );

      if (event.type === 'UnitsRevealed') {
        const cascadeUids = [
          ...event.units.P1.map((u) => u.uid),
          ...event.units.P2.map((u) => u.uid),
        ];
        set({
          currentEvent: event,
          queue: remainingQueue,
          playedEvents: [...state.playedEvents, event],
          battleLog: [...state.battleLog, entry],
          latestAnnouncement: description,
          activeBattleStage: nextActiveStage,
          activeBattleStageCode: nextActiveStageCode,
          activeBattlePhaseId: nextActivePhaseId,
          scannedBattleStages: nextScannedStages,
          battleStageHistory: nextStageHistory,
          playbackUnits: nextPlaybackUnits,
          revealedUnitUids: [],
          pendingCascadeUnitUids: cascadeUids,
          isRevealingUnits: true,
          isPlaying: true,
        });
      } else {
        set({
          currentEvent: event,
          queue: remainingQueue,
          playedEvents: [...state.playedEvents, event],
          battleLog: [...state.battleLog, entry],
          latestAnnouncement: description,
          activeBattleStage: nextActiveStage,
          activeBattleStageCode: nextActiveStageCode,
          activeBattlePhaseId: nextActivePhaseId,
          scannedBattleStages: nextScannedStages,
          battleStageHistory: nextStageHistory,
          playbackUnits: nextPlaybackUnits,
          isRevealingUnits: false,
          pendingCascadeUnitUids: [],
          isPlaying: true,
        });
      }

      scheduleCurrentEventTimer();
    };

    const advanceToNextEvent = (): void => {
      const state = get();
      if (state.queue.length === 0) {
        clearActiveTimer();
        set({
          currentEvent: null,
          isPlaying: false,
          isRevealingUnits: false,
          pendingCascadeUnitUids: [],
          view: state.pendingView ?? state.view,
          pendingView: null,
        });
        return;
      }

      const [nextEvent, ...restQueue] = state.queue;
      if (nextEvent === undefined) {
        return;
      }
      startEventStep(nextEvent, restQueue);
    };

    return {
      view: null,
      pendingView: null,
      mode: null,

      queue: [],
      currentEvent: null,
      playedEvents: [],
      battleLog: [],
      latestAnnouncement: '',
      activeBattleStage: null,
      activeBattleStageCode: null,
      activeBattlePhaseId: null,
      scannedBattleStages: [],
      battleStageHistory: [],
      revealedUnitUids: [],
      pendingCascadeUnitUids: [],
      isRevealingUnits: false,
      playbackUnits: { P1: [], P2: [] },
      speed: 1,
      isPaused: false,
      isPlaying: false,

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

      setPlayerView: (view) =>
        set({
          view,
          pendingView: null,
        }),

      receiveTransition: (nextView, events, options) => {
        const validEvents = events.filter(
          (ev): ev is GameEvent => ev !== null && ev !== undefined,
        );
        const shouldReset =
          options?.resetLog === true ||
          validEvents.some((ev) => ev.type === 'GameStarted' && ev.n === 1);

        if (shouldReset) {
          clearActiveTimer();
          set({
            view: nextView,
            pendingView: null,
            queue: [],
            currentEvent: null,
            playedEvents: [],
            battleLog: [],
            latestAnnouncement: '',
            activeBattleStage: null,
            activeBattleStageCode: null,
            activeBattlePhaseId: null,
            scannedBattleStages: [],
            battleStageHistory: [],
            revealedUnitUids: [],
            pendingCascadeUnitUids: [],
            isRevealingUnits: false,
            playbackUnits: { P1: [], P2: [] },
            isPlaying: false,
            isPaused: false,
            selectedHandUid: null,
            unplayableBanner: null,
            selectedMulliganUids: [],
            selectedDiscardUids: [],
            activeConversionUid: null,
            selectedInstantUids: [],
            lastError: null,
          });
        } else {
          set({
            view: nextView,
            pendingView: null,
            selectedHandUid: null,
            unplayableBanner: null,
            lastError: null,
          });
        }

        if (validEvents.length > 0) {
          get().enqueueEvents(validEvents);
        }
      },

      enqueueEvents: (events, options) => {
        if (options?.resetLog) {
          clearActiveTimer();
          set({
            queue: [],
            currentEvent: null,
            playedEvents: [],
            battleLog: [],
            latestAnnouncement: '',
            activeBattleStage: null,
            activeBattleStageCode: null,
            activeBattlePhaseId: null,
            scannedBattleStages: [],
            battleStageHistory: [],
            revealedUnitUids: [],
            pendingCascadeUnitUids: [],
            isRevealingUnits: false,
            playbackUnits: { P1: [], P2: [] },
            isPlaying: false,
          });
        }

        const state = get();
        const existingNumbers = new Set<number>();
        for (const ev of state.playedEvents) {
          existingNumbers.add(ev.n);
        }
        for (const ev of state.queue) {
          existingNumbers.add(ev.n);
        }
        if (state.currentEvent !== null) {
          existingNumbers.add(state.currentEvent.n);
        }

        const sortedNewEvents = events
          .filter(
            (ev): ev is GameEvent =>
              ev !== null && ev !== undefined && !existingNumbers.has(ev.n),
          )
          .sort((a, b) => a.n - b.n);

        if (options?.targetView !== undefined) {
          if (
            state.view === null ||
            (sortedNewEvents.length === 0 &&
              state.currentEvent === null &&
              state.queue.length === 0)
          ) {
            set({ view: options.targetView, pendingView: null });
          } else {
            set({ pendingView: options.targetView });
          }
        }

        if (sortedNewEvents.length === 0) {
          return;
        }

        const updatedState = get();
        const combinedQueue = [...updatedState.queue, ...sortedNewEvents].sort(
          (a, b) => a.n - b.n,
        );

        if (updatedState.currentEvent === null && !updatedState.isPaused) {
          const [first, ...rest] = combinedQueue;
          if (first !== undefined) {
            startEventStep(first, rest);
          }
        } else {
          set({
            queue: combinedQueue,
            isPlaying: true,
          });
        }
      },

      setPlaybackSpeed: (speed) => {
        set({ speed });
        const state = get();
        if (state.currentEvent !== null && !state.isPaused) {
          scheduleCurrentEventTimer();
        }
      },

      pausePlayback: () => {
        clearActiveTimer();
        set({ isPaused: true });
      },

      resumePlayback: () => {
        const state = get();
        if (!state.isPaused) {
          return;
        }
        set({ isPaused: false });
        const afterUnpause = get();
        if (afterUnpause.currentEvent !== null) {
          scheduleCurrentEventTimer();
        } else if (afterUnpause.queue.length > 0) {
          advanceToNextEvent();
        }
      },

      togglePausePlayback: () => {
        if (get().isPaused) {
          get().resumePlayback();
        } else {
          get().pausePlayback();
        }
      },

      skipToEnd: () => {
        clearActiveTimer();
        const state = get();
        const fallbackEra: EraNo =
          state.pendingView?.era ?? state.view?.era ?? 1;

        const revealedUids = [...state.revealedUnitUids];
        for (const uid of state.pendingCascadeUnitUids) {
          if (!revealedUids.includes(uid)) {
            revealedUids.push(uid);
          }
        }

        let playedEvents = [...state.playedEvents];
        let battleLog = [...state.battleLog];
        let latestAnnouncement = state.latestAnnouncement;
        let activeBattleStage = state.activeBattleStage;
        let activeBattleStageCode = state.activeBattleStageCode;
        let activeBattlePhaseId = state.activeBattlePhaseId;
        let scannedBattleStages = [...state.scannedBattleStages];
        let battleStageHistory = [...state.battleStageHistory];
        let playbackUnits: Record<PlayerId, UnitInstance[]> = {
          P1: [...state.playbackUnits.P1],
          P2: [...state.playbackUnits.P2],
        };

        for (const event of state.queue) {
          const era = resolveEventEra(event, fallbackEra);
          const description = describeEvent(event, 'it');
          const stageLabel = getBattleStageLabel(event, 'it');
          const stageCode = getBattleStageCode(event);

          playedEvents = [...playedEvents, event];
          battleLog = [
            ...battleLog,
            {
              id: `ev-${event.n}-${event.type}`,
              n: event.n,
              era,
              type: event.type,
              text: description,
              stageLabel,
              event,
            },
          ];
          latestAnnouncement = description;

          if (stageLabel !== null) {
            activeBattleStage = stageLabel;
            if (
              battleStageHistory[battleStageHistory.length - 1] !== stageLabel
            ) {
              battleStageHistory = [...battleStageHistory, stageLabel];
            }
          } else if (
            event.type === 'EraEnded' ||
            event.type === 'EraStarted'
          ) {
            activeBattleStage = null;
          }

          if (stageCode !== null) {
            activeBattleStageCode = stageCode;
            if (!scannedBattleStages.includes(stageCode)) {
              scannedBattleStages = [...scannedBattleStages, stageCode];
            }
          } else if (
            event.type === 'EraEnded' ||
            event.type === 'EraStarted'
          ) {
            activeBattleStageCode = null;
          }

          if (event.type === 'BattlePhaseResolved') {
            activeBattlePhaseId = event.phase;
          } else if (
            event.type === 'SiegeResolved' ||
            event.type === 'RaidResolved'
          ) {
            activeBattlePhaseId = 'phase4_siege';
          } else if (
            event.type === 'EraEnded' ||
            event.type === 'EraStarted'
          ) {
            activeBattlePhaseId = null;
          }

          playbackUnits = applyEventToPlaybackUnits(playbackUnits, event);

          if (event.type === 'UnitsRevealed') {
            const eventUnitUids = [
              ...event.units.P1.map((u) => u.uid),
              ...event.units.P2.map((u) => u.uid),
            ];
            for (const uid of eventUnitUids) {
              if (!revealedUids.includes(uid)) {
                revealedUids.push(uid);
              }
            }
          }
        }

        set({
          view: state.pendingView ?? state.view,
          pendingView: null,
          queue: [],
          currentEvent: null,
          playedEvents,
          battleLog,
          latestAnnouncement,
          activeBattleStage,
          activeBattleStageCode,
          activeBattlePhaseId,
          scannedBattleStages,
          battleStageHistory,
          revealedUnitUids: revealedUids,
          pendingCascadeUnitUids: [],
          isRevealingUnits: false,
          playbackUnits,
          isPlaying: false,
          isPaused: false,
        });
      },

      clearPlayback: () => {
        clearActiveTimer();
        set({
          queue: [],
          currentEvent: null,
          playedEvents: [],
          battleLog: [],
          latestAnnouncement: '',
          activeBattleStage: null,
          activeBattleStageCode: null,
          activeBattlePhaseId: null,
          scannedBattleStages: [],
          battleStageHistory: [],
          revealedUnitUids: [],
          pendingCascadeUnitUids: [],
          isRevealingUnits: false,
          playbackUnits: { P1: [], P2: [] },
          isPlaying: false,
          isPaused: false,
        });
      },

      setHotSeatHandover: (awaiting, nextPlayer) =>
        set({
          awaitingHotSeatHandover: awaiting,
          hotSeatNextPlayer: nextPlayer,
        }),

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

      toggleMobileDrawer: () =>
        set((state) => ({ mobileDrawerOpen: !state.mobileDrawerOpen })),

      resetStore: () => {
        clearActiveTimer();
        set({
          view: null,
          pendingView: null,
          mode: null,
          queue: [],
          currentEvent: null,
          playedEvents: [],
          battleLog: [],
          latestAnnouncement: '',
          activeBattleStage: null,
          activeBattleStageCode: null,
          activeBattlePhaseId: null,
          scannedBattleStages: [],
          battleStageHistory: [],
          revealedUnitUids: [],
          pendingCascadeUnitUids: [],
          isRevealingUnits: false,
          playbackUnits: { P1: [], P2: [] },
          speed: 1,
          isPaused: false,
          isPlaying: false,
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

export const useGameStore = create<GameStoreState>()(
  createGameStoreInitializer(),
);
