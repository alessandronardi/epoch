import { useDialogFocus } from './use-dialog-focus.js';
import { createContext, useContext, useRef, type ReactElement } from 'react';

export const MatchGuidanceContext = createContext<{
  readonly title: string;
  readonly text: string;
  readonly error: string | null;
  readonly onRestart: () => void;
  readonly onExit: () => void;
  readonly onExercises?: (() => void) | undefined;
} | null>(null);

/** Il consiglio vive nel dialogo attivo, senza introdurre un'altra modale. */
export function MatchGuidance(): ReactElement | null {
  const guidance = useContext(MatchGuidanceContext);
  const root = useRef<HTMLElement>(null);
  useDialogFocus(root, guidance !== null);
  if (guidance === null) return null;
  return (
    <aside
      ref={root}
      className="tutorial-modal-guidance"
      aria-label="Guida del tutorial"
      data-testid="tutorial-modal-guidance"
    >
      <strong>{guidance.title}</strong>
      <p>{guidance.text}</p>
      {guidance.error && <p role="alert">{guidance.error}</p>}
      <div className="tutorial-guide__navigation">
        <button type="button" onClick={guidance.onRestart}>
          Ricomincia
        </button>
        {guidance.onExercises && (
          <button type="button" onClick={guidance.onExercises}>
            Esercitazioni
          </button>
        )}
        <button type="button" onClick={guidance.onExit}>
          Esci dal tutorial
        </button>
      </div>
    </aside>
  );
}
