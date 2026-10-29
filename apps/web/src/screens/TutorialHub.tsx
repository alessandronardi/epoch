import type { ReactElement } from 'react';
import { TUTORIAL_MODULES, type TutorialModuleId } from '../tutorial/tutorial-exercises.js';

export function TutorialHub({
  completed,
  onSelect,
  onBackHome,
}: {
  readonly completed: ReadonlySet<string>;
  readonly onSelect: (id: TutorialModuleId) => void;
  readonly onBackHome: () => void;
}): ReactElement {
  return (
    <main className="tutorial-hub" data-testid="tutorial-hub">
      <header>
        <p>Impara a giocare</p>
        <h1>Scegli un’esercitazione</h1>
        <p>Ogni percorso è indipendente. Puoi ripeterlo e tornare qui in qualsiasi momento.</p>
        <button type="button" onClick={onBackHome}>
          Torna alla Home
        </button>
      </header>
      <div className="tutorial-hub__modules">
        {TUTORIAL_MODULES.map((module) => (
          <button
            key={module.id}
            type="button"
            data-testid={`tutorial-module-${module.id}`}
            onClick={() => onSelect(module.id)}
          >
            <strong>{module.title}</strong>
            <span>{module.description}</span>
            {completed.has(module.id) && <small>Completata</small>}
          </button>
        ))}
      </div>
    </main>
  );
}
