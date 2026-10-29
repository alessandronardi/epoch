import type { ReactElement } from 'react';
import type { GameController } from '../../controllers/types.js';

export function ConcedeButton({
  controller,
}: {
  readonly controller: GameController | null;
}): ReactElement {
  return (
    <button
      type="button"
      className="touch-target"
      data-testid="match-concede-btn"
      onClick={() => controller?.concede()}
      style={{
        padding: '6px 10px',
        borderRadius: '6px',
        border: '1px solid var(--crimson, #A8404D)',
        backgroundColor: 'rgba(168, 64, 77, 0.22)',
        color: 'var(--chalk, #E9E5D6)',
        cursor: 'pointer',
      }}
    >
      Resa
    </button>
  );
}
