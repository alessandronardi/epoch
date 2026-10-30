import type { ReactElement } from 'react';
import { useGameStore } from '../../state/game-store.js';

export function BoardPreferences(): ReactElement {
  const enabled = useGameStore((state) => state.confirmPassEnabled);
  const setEnabled = useGameStore((state) => state.setConfirmPassEnabled);
  return (
    <label className="board-pass-preference">
      <input
        type="checkbox"
        data-testid="confirm-pass-toggle"
        checked={enabled}
        onChange={(event) => setEnabled(event.target.checked)}
      />
      Chiedi conferma prima di passare
    </label>
  );
}
