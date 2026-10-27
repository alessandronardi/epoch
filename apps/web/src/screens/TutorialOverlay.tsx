import { useEffect, useRef, type ReactElement } from 'react';
import { TUTORIAL_LESSONS, type TutorialCue } from '../tutorial/tutorial-scenario.js';

export interface TutorialOverlayProps {
  readonly cue: TutorialCue;
  readonly cueIndex: number;
  readonly busy: boolean;
  readonly completed: boolean;
  readonly error: string | null;
  readonly onAdvance: () => void;
  readonly onRestart: () => void;
  readonly onExit: () => void;
  readonly onShowTarget: () => void;
  readonly onSkipPlayback: () => void;
}

const TARGET_LABELS = {
  hand: 'La tua mano',
  resources: 'Il tuo magazzino',
  city: 'La tua città',
  slots: 'Il Cap Logistico',
  battle: 'Le linee di battaglia',
  walls: 'Le Mura avversarie',
};

/** Callout non modale: il tavolo e l'ispezione delle carte rimangono accessibili. */
export function TutorialOverlay({
  cue,
  cueIndex,
  busy,
  completed,
  error,
  onAdvance,
  onRestart,
  onExit,
  onShowTarget,
  onSkipPlayback,
}: TutorialOverlayProps): ReactElement {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [cueIndex]);

  return (
    <section
      className="tutorial-guide"
      aria-label="Tutorial guidato"
      data-testid="tutorial-guide"
      data-lesson={cue.lesson}
    >
      <div className="tutorial-guide__eyebrow">Impara a giocare · Passo {cue.lesson} di 6</div>
      <ol className="tutorial-progress" aria-label="I sei passi del tutorial">
        {TUTORIAL_LESSONS.map((lesson, index) => (
          <li
            key={lesson}
            aria-current={index + 1 === cue.lesson ? 'step' : undefined}
            className={index + 1 < cue.lesson || completed ? 'tutorial-progress__done' : ''}
            title={lesson}
          >
            <span aria-hidden="true">{index + 1}</span>
            <span className="sr-only">{lesson}</span>
          </li>
        ))}
      </ol>
      <p className="tutorial-guide__lesson">{TUTORIAL_LESSONS[cue.lesson - 1]}</p>
      <h1 ref={heading} tabIndex={-1} data-testid="tutorial-title">
        {cue.title}
      </h1>
      <p id="tutorial-explanation" data-testid="tutorial-explanation">
        {cue.text}
      </p>
      <button type="button" className="tutorial-target-link" onClick={onShowTarget}>
        Mostra sul tavolo: {TARGET_LABELS[cue.target]}
      </button>
      <p className="tutorial-guide__hint">
        Segui le azioni guidate. Puoi ispezionare le carte e consultare il registro in ogni momento.
      </p>
      {error !== null && <p role="alert">{error}</p>}
      <div className="tutorial-guide__actions">
        <button
          type="button"
          className="tutorial-primary"
          data-testid="tutorial-next"
          disabled={busy || error !== null}
          onClick={onAdvance}
        >
          {busy ? 'Osserva gli eventi sul tavolo…' : cue.label}
        </button>
        {busy && (
          <button type="button" data-testid="tutorial-skip-playback" onClick={onSkipPlayback}>
            Completa le animazioni
          </button>
        )}
      </div>
      <div className="tutorial-guide__navigation">
        <button type="button" onClick={onRestart}>
          Ricomincia
        </button>
        <button type="button" onClick={onExit}>
          Esci dal tutorial
        </button>
      </div>
    </section>
  );
}
