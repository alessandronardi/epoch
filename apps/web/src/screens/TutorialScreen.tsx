import { getCard } from '@epochs/content';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { AudioControls } from '../audio/AudioControls.js';
import { BattlefieldBoard } from '../components/board/BattlefieldBoard.js';
import { BattlePlaybackAndLog } from '../components/board/BattlePlaybackAndLog.js';
import type { LocalGameController } from '../controllers/local-controller.js';
import { useGameStore } from '../state/game-store.js';
import {
  createTutorialController,
  resolveTutorialCommand,
  TUTORIAL_CUES,
  type TutorialTarget,
} from '../tutorial/tutorial-scenario.js';
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

export function TutorialScreen({ onBackHome }: { readonly onBackHome: () => void }): ReactElement {
  const [cueIndex, setCueIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<LocalGameController | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const highlighted = useRef<HTMLElement | null>(null);
  const view = useGameStore((state) => state.view);
  const busy = useGameStore((state) => state.isPlaying);
  const cue = TUTORIAL_CUES[cueIndex]!;
  const completed = cueIndex === TUTORIAL_CUES.length - 1;

  useEffect(() => {
    useGameStore.getState().resetStore();
    const next = createTutorialController(useGameStore);
    controller.current = next;
    next.startMatch();
    // L'introduzione non richiede di attendere gli eventi di inizializzazione.
    useGameStore.getState().skipToEnd();
    return () => {
      next.dispose();
      controller.current?.dispose();
      controller.current = null;
      useGameStore.getState().resetStore();
    };
  }, []);

  useEffect(() => {
    const target = root.current?.querySelector<HTMLElement>(
      `[data-testid="${TARGET_TEST_IDS[cue.target]}"]`,
    );
    if (!target) return;
    highlighted.current = target;
    const oldDescription = target.getAttribute('aria-describedby');
    target.setAttribute('data-tutorial-focus', 'true');
    target.setAttribute('aria-describedby', 'tutorial-explanation');
    return () => {
      target.removeAttribute('data-tutorial-focus');
      if (oldDescription === null) target.removeAttribute('aria-describedby');
      else target.setAttribute('aria-describedby', oldDescription);
      highlighted.current = null;
    };
  }, [cue.target, view === null]);

  const restart = (): void => {
    controller.current?.dispose();
    useGameStore.getState().resetStore();
    const next = createTutorialController(useGameStore);
    controller.current = next;
    next.startMatch();
    useGameStore.getState().skipToEnd();
    setCueIndex(0);
    setError(null);
  };

  const advance = (): void => {
    // Verifica sincrona anche per click rapidi prima del prossimo render React.
    if (useGameStore.getState().isPlaying || view === null || controller.current === null) return;
    if (completed) {
      onBackHome();
      return;
    }
    try {
      const command = resolveTutorialCommand(cue, view);
      if (command !== null) {
        const result = controller.current.dispatch(command);
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
      }
      setError(null);
      setCueIndex((index) => index + 1);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Impossibile avanzare. Riavvia il tutorial.',
      );
    }
  };

  const action = cue.action;
  const suggestedCardIds =
    'cardId' in action ? [action.cardId] : action.kind === 'instants' ? action.cardIds : [];

  return (
    <div ref={root} className="tutorial-screen" data-testid="screen-tutorial">
      <TutorialOverlay
        cue={cue}
        cueIndex={cueIndex}
        busy={busy}
        completed={completed && !busy}
        error={error}
        onAdvance={advance}
        onRestart={restart}
        onExit={onBackHome}
        onSkipPlayback={() => useGameStore.getState().skipToEnd()}
        onShowTarget={() =>
          highlighted.current?.scrollIntoView({
            block: 'center',
            inline: 'nearest',
            behavior: 'instant',
          })
        }
      />
      <BattlefieldBoard
        view={view}
        handSlot={
          <div className="tutorial-hand" aria-label="Carte nella tua mano">
            <strong>La tua mano · seleziona una carta per leggerla</strong>
            <div className="tutorial-hand__cards">
              {view?.self.hand.map((card) => (
                <button
                  type="button"
                  key={card.uid}
                  className={
                    suggestedCardIds.includes(card.cardId) ? 'tutorial-hand__suggested' : ''
                  }
                  onClick={() => useGameStore.getState().setInspectedCardId(card.cardId)}
                >
                  {getCard(card.cardId).text.name}
                </button>
              ))}
              {view?.self.hand.length === 0 && <span>Nessuna carta in mano.</span>}
            </div>
          </div>
        }
        sidebarSlot={
          <>
            <BattlePlaybackAndLog view={view} />
            <AudioControls />
          </>
        }
      />
    </div>
  );
}
