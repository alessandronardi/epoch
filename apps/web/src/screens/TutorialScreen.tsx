import { ConcedeButton } from '../components/board/ConcedeButton.js';
import { calculatePrebattleInstantsPreview } from '../components/board/PrebattleInstantsBar.js';
import {
  createExerciseController,
  MATCH_EXERCISE_CUES,
  TUTORIAL_MODULES,
  type MatchExerciseId,
  type TutorialModuleId,
} from '../tutorial/tutorial-exercises.js';
import { TutorialHub } from './TutorialHub.js';
import { TutorialToolsTour } from './TutorialToolsTour.js';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { AudioControls } from '../audio/AudioControls.js';
import { BattlePlaybackAndLog } from '../components/board/BattlePlaybackAndLog.js';
import { MatchTable } from '../components/board/MatchTable.js';
import { MatchGuidanceContext } from '../components/modals/MatchGuidance.js';
import type { GameController } from '../controllers/types.js';
import { useGameStore } from '../state/game-store.js';
import { createTutorialAdapter } from '../tutorial/tutorial-controller.js';
import { type TutorialTarget } from '../tutorial/tutorial-scenario.js';
import { TutorialOverlay } from './TutorialOverlay.js';
import '../tutorial/tutorial.css';

const TARGET_TEST_IDS: Record<TutorialTarget, string> = {
  hand: 'board-hand-dock',
  resources: 'self-resources',
  city: 'self-city-zone',
  slots: 'self-slots',
  battle: 'opponent-city-and-lines',
  walls: 'opponent-walls',
};

function GuidedTutorialMatch({
  moduleId,
  onSelectModule,
  onExercises,
  onComplete,
  onBackHome,
  onStartFreeMatch,
}: {
  readonly moduleId: MatchExerciseId;
  readonly onSelectModule: (id: TutorialModuleId) => void;
  readonly onExercises: () => void;
  readonly onComplete: (id: TutorialModuleId) => void;
  readonly onBackHome: () => void;
  readonly onStartFreeMatch?: (() => void) | undefined;
}): ReactElement {
  const [cueIndex, setCueIndex] = useState(0);
  const exercise = moduleId !== 'main';
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const playbackProgressRef = useRef(0);
  const [session, setSession] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [adapter, setAdapter] = useState<GameController | null>(null);
  const controller = useRef<GameController | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const highlighted = useRef<HTMLElement | null>(null);
  const pending = useRef<{ index: number; version: number } | null>(null);
  const indexRef = useRef(0);
  const cues = MATCH_EXERCISE_CUES[moduleId];
  const cuesRef = useRef(cues);
  cuesRef.current = cues;
  const view = useGameStore((state) => state.view);
  const busy = useGameStore((state) => state.isPlaying);
  const cue = cues[cueIndex]!;
  const completed = cueIndex === cues.length - 1;

  const nextCue = (): void => {
    pending.current = null;
    indexRef.current = Math.min(indexRef.current + 1, cuesRef.current.length - 1);
    setCueIndex(indexRef.current);
    setError(null);
  };

  useEffect(() => {
    useGameStore.getState().resetStore();
    const next = createExerciseController(moduleId, useGameStore);
    controller.current = next;
    const gateway = createTutorialAdapter({
      controller: next,
      store: useGameStore,
      getCue: () => cuesRef.current[indexRef.current]!,
      isPending: () => pending.current !== null,
      onError: setError,
      onHandover: nextCue,
      onAccepted: (target) => {
        pending.current = { index: indexRef.current, version: target.stateVersion };
        useGameStore.getState().setSelectedHandUid(null);
        setError(null);
        if (
          moduleId === 'playback' &&
          cuesRef.current[indexRef.current]?.action.kind === 'instants'
        ) {
          useGameStore.getState().pausePlayback();
        }
      },
    });
    setAdapter(gateway);
    next.startMatch();
    useGameStore.getState().skipToEnd();
    return () => {
      if (controller.current !== null) {
        controller.current.dispose();
        controller.current = null;
        useGameStore.getState().resetStore();
      }
    };
  }, [session]);

  // Si prosegue solo quando la proiezione accettata è stata interamente mostrata.
  useEffect(() => {
    const accepted = pending.current;
    if (
      accepted !== null &&
      !busy &&
      view?.stateVersion === accepted.version &&
      accepted.index === indexRef.current &&
      !(moduleId === 'playback' && cue.action.kind === 'instants' && playbackProgress < 4)
    ) {
      nextCue();
    }
  }, [busy, view, playbackProgress]);

  useEffect(() => {
    if (completed && !busy) onComplete(moduleId);
  }, [completed, busy, moduleId]);

  useEffect(() => {
    if (cue.action.kind !== 'timeout' || busy) return;
    const timer = setTimeout(() => {
      if (controller.current === null || useGameStore.getState().isPlaying) return;
      const result = controller.current.dispatch({ type: 'ApplyTimeout' });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      pending.current = { index: indexRef.current, version: result.value.stateVersion };
    }, 1500);
    return () => clearTimeout(timer);
  }, [cue, busy, session]);

  useEffect(() => {
    if (
      moduleId === 'playback' &&
      pending.current !== null &&
      cue.action.kind === 'instants' &&
      !busy &&
      playbackProgress < 4
    ) {
      setError(
        'La riproduzione è terminata prima delle quattro azioni. Premi Ricomincia per riprovare: la battaglia inizierà in pausa.',
      );
    }
  }, [busy, playbackProgress, moduleId, cue]);

  useEffect(() => {
    let seen = false;
    const action = cue.action;
    if (action.kind === 'log' && useGameStore.getState().mobileDrawerOpen) nextCue();
    return useGameStore.subscribe((state, previous) => {
      if (pending.current !== null || state.isPlaying || indexRef.current !== cueIndex) return;
      const isCard = (uid: string | null): boolean =>
        uid !== null &&
        state.view?.self.hand.some(
          (card) => card.uid === uid && 'cardId' in action && card.cardId === action.cardId,
        ) === true;
      switch (action.kind) {
        case 'inspect':
          if (state.inspectedCardId === action.cardId) seen = true;
          if (seen && previous.inspectedCardId === action.cardId && state.inspectedCardId === null)
            nextCue();
          break;
        case 'deselect':
          if (isCard(state.selectedHandUid)) seen = true;
          if (seen && isCard(previous.selectedHandUid) && state.selectedHandUid === null) nextCue();
          break;
        case 'instant-budget':
          if (
            state.selectedInstantUids.length === 2 &&
            calculatePrebattleInstantsPreview(state.view!, state.selectedInstantUids).aggregateCost
              .wood === 4
          )
            seen = true;
          if (
            seen &&
            previous.selectedInstantUids.length > 0 &&
            state.selectedInstantUids.length === 0
          )
            nextCue();
          break;
        case 'unplayable':
          if (state.unplayableBanner?.cardId === action.cardId) nextCue();
          break;
        case 'log':
          if (state.mobileDrawerOpen) nextCue();
          break;
      }
    });
  }, [cue, cueIndex, session]);

  useEffect(() => {
    const modal = root.current?.querySelector<HTMLElement>(
      '[role="dialog"]:not(.epochs-inspect-modal)',
    );
    const target =
      modal ??
      root.current?.querySelector<HTMLElement>(`[data-testid="${TARGET_TEST_IDS[cue.target]}"]`);
    if (!target) return;
    highlighted.current = target;
    target.setAttribute('data-tutorial-focus', 'true');
    const old = target.getAttribute('aria-describedby');
    if (!modal) target.setAttribute('aria-describedby', 'tutorial-explanation');
    return () => {
      target.removeAttribute('data-tutorial-focus');
      if (old === null) target.removeAttribute('aria-describedby');
      else target.setAttribute('aria-describedby', old);
      highlighted.current = null;
    };
  }, [cue, view?.phase, busy, session]);

  const restart = (): void => {
    playbackProgressRef.current = 0;
    setPlaybackProgress(0);
    pending.current = null;
    indexRef.current = 0;
    setCueIndex(0);
    setError(null);
    setSession((value) => value + 1);
  };
  const exit = (callback = onBackHome): void => {
    controller.current?.dispose();
    controller.current = null;
    pending.current = null;
    useGameStore.getState().resetStore();
    callback();
  };
  const advance = (): void => {
    if (
      useGameStore.getState().isPlaying ||
      pending.current !== null ||
      cuesRef.current[indexRef.current]?.action.kind !== 'read'
    )
      return;
    if (completed) exit();
    else nextCue();
  };
  const action = cue.action;
  const suggestedCardIds =
    'cardId' in action ? [action.cardId] : action.kind === 'instants' ? action.cardIds : [];

  const recordPlayback = (progress: number): void => {
    playbackProgressRef.current = progress;
    setPlaybackProgress(progress);
  };
  const skipPlayback = (): void => {
    if (
      moduleId === 'playback' &&
      cue.action.kind === 'instants' &&
      pending.current !== null &&
      playbackProgressRef.current < 4
    ) {
      setError('Completa prima Riprendi, Pausa, 2× e Riprendi dal Registro.');
      return;
    }
    setError(null);
    useGameStore.getState().skipToEnd();
  };
  return (
    <div
      ref={root}
      className="tutorial-screen"
      data-testid="screen-tutorial"
      data-exercise={moduleId}
    >
      <TutorialOverlay
        cue={cue}
        cueIndex={cueIndex}
        busy={busy}
        completed={completed && !busy}
        error={error}
        onAdvance={advance}
        onRestart={() => restart()}
        onExit={() => exit()}
        exercise={exercise}
        moduleTitle={TUTORIAL_MODULES.find((module) => module.id === moduleId)!.title}
        onExercises={onExercises}
        playbackStatus={
          moduleId === 'playback' && cue.action.kind === 'instants' && busy
            ? `Controlli esercitati: ${playbackProgress}/4. Riprendi → Pausa → 2× → Riprendi.`
            : undefined
        }
        onDiscardExercise={() => onSelectModule('discard')}
        onStartFreeMatch={onStartFreeMatch ? () => exit(onStartFreeMatch) : undefined}
        onSkipPlayback={skipPlayback}
        onShowTarget={() =>
          highlighted.current?.scrollIntoView({
            block: 'center',
            inline: 'nearest',
            behavior: 'instant',
          })
        }
      />
      <MatchGuidanceContext
        value={{
          title: cue.title,
          text: cue.text,
          error,
          onRestart: () => restart(),
          onExit: () => exit(),
          onExercises,
        }}
      >
        <MatchTable
          key={session}
          view={view}
          controller={adapter}
          suggestedCardIds={suggestedCardIds}
          onCancelPass={() => {
            if (cuesRef.current[indexRef.current]?.action.kind === 'cancel-pass') nextCue();
          }}
          onCancelConversion={(cardId) => {
            const action = cuesRef.current[indexRef.current]?.action;
            if (action?.kind === 'cancel-conversion' && action.cardId === cardId) nextCue();
          }}
          onRematch={onStartFreeMatch ? () => exit(onStartFreeMatch) : () => restart()}
          onReturnHome={() => exit()}
          sidebar={
            <>
              {cue.action.kind === 'concede' && <ConcedeButton controller={adapter} />}
              <BattlePlaybackAndLog
                view={view}
                onLogConsulted={() => {
                  if (cuesRef.current[indexRef.current]?.action.kind === 'log') nextCue();
                }}
                playbackControls={
                  moduleId === 'playback'
                    ? {
                        onSkipToEnd: skipPlayback,
                        onSetSpeed: (speed) => {
                          useGameStore.getState().setPlaybackSpeed(speed);
                          if (
                            pending.current !== null &&
                            cue.action.kind === 'instants' &&
                            speed === 2 &&
                            playbackProgressRef.current === 2
                          )
                            recordPlayback(3);
                        },
                        onTogglePause: () => {
                          const state = useGameStore.getState();
                          const wasPaused = state.isPaused;
                          if (
                            pending.current !== null &&
                            cue.action.kind === 'instants' &&
                            wasPaused &&
                            playbackProgressRef.current === 3
                          )
                            recordPlayback(4);
                          state.togglePausePlayback();
                          if (pending.current === null || cue.action.kind !== 'instants') return;
                          if (wasPaused && playbackProgressRef.current === 0) recordPlayback(1);
                          else if (!wasPaused && playbackProgressRef.current === 1)
                            recordPlayback(2);
                        },
                      }
                    : undefined
                }
              />
              <details><summary>Impostazioni audio</summary><AudioControls /></details>
            </>
          }
        />
      </MatchGuidanceContext>
    </div>
  );
}

const PROGRESS_KEY = 'epochs_tutorial_modules_v1';
function readProgress(): Set<string> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '[]');
    return new Set(
      Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [],
    );
  } catch {
    return new Set();
  }
}
export function TutorialScreen({
  onBackHome,
  onStartFreeMatch,
}: {
  readonly onBackHome: () => void;
  readonly onStartFreeMatch?: (() => void) | undefined;
}): ReactElement {
  const [moduleId, setModuleId] = useState<TutorialModuleId | null>('main');
  const [completed, setCompleted] = useState(readProgress);
  const complete = (id: TutorialModuleId): void => {
    setCompleted((previous) => {
      if (previous.has(id)) return previous;
      const next = new Set(previous).add(id);
      try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify([...next]));
      } catch {
        /* Stato disponibile nella sessione. */
      }
      return next;
    });
  };
  if (moduleId === null)
    return <TutorialHub completed={completed} onSelect={setModuleId} onBackHome={onBackHome} />;
  if (moduleId === 'archive' || moduleId === 'deck-builder' || moduleId === 'online-replay') {
    return (
      <TutorialToolsTour
        key={moduleId}
        moduleId={moduleId}
        onBack={() => setModuleId(null)}
        onBackHome={onBackHome}
        onComplete={() => complete(moduleId)}
      />
    );
  }
  return (
    <GuidedTutorialMatch
      key={moduleId}
      moduleId={moduleId}
      onSelectModule={setModuleId}
      onExercises={() => setModuleId(null)}
      onComplete={complete}
      onBackHome={onBackHome}
      onStartFreeMatch={onStartFreeMatch}
    />
  );
}
