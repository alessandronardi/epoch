import { act, fireEvent, screen, within } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { useGameStore } from '../src/state/game-store.js';
import type { TutorialCue } from '../src/tutorial/tutorial-scenario.js';

export function performCue(cue: TutorialCue): void {
  const view = useGameStore.getState().view!;
  const uid = (id: string): string => view.self.hand.find((card) => card.cardId === id)!.uid;
  const handCard = (id: string) =>
    within(screen.getByTestId(`hand-slot-${uid(id)}`)).getByTestId(`card-${id}`);
  const action = cue.action;
  switch (action.kind) {
    case 'inspect':
      fireEvent.doubleClick(
        within(screen.getByTestId('mulligan-modal')).getByTestId(`card-${action.cardId}`),
      );
      expect(screen.getAllByRole('dialog')).toHaveLength(2); // Mulligan e una sola ispezione.
      fireEvent.keyDown(window, { key: 'Escape' });
      break;
    case 'mulligan':
      fireEvent.click(screen.getByTestId(`mulligan-toggle-btn-${uid(action.cardId)}`));
      fireEvent.click(screen.getByTestId('mulligan-submit-btn'));
      break;
    case 'keep':
      fireEvent.click(screen.getByTestId('mulligan-submit-btn'));
      break;
    case 'deselect':
      fireEvent.click(handCard(action.cardId));
      fireEvent.keyDown(handCard(action.cardId), { key: 'Escape' });
      break;
    case 'unplayable':
      fireEvent.click(handCard(action.cardId));
      break;
    case 'play':
    case 'conversion':
    case 'cancel-conversion':
      fireEvent.click(handCard(action.cardId));
      fireEvent.click(screen.getByTestId('hand-preview-play-btn'));
      if (action.kind === 'cancel-conversion')
        fireEvent.click(screen.getByTestId('cancel-conversion-btn'));
      if (action.kind === 'conversion') {
        const building = view.self.buildings.find((card) => card.cardId === action.sacrificeId)!;
        fireEvent.click(screen.getByTestId(`conversion-select-building-${building.uid}`));
        fireEvent.click(screen.getByTestId('confirm-conversion-btn'));
      }
      break;
    case 'cancel-pass':
    case 'pass':
      fireEvent.click(screen.getByTestId('pass-turn-btn'));
      fireEvent.click(
        screen.getByTestId(action.kind === 'pass' ? 'confirm-pass-btn' : 'cancel-pass-btn'),
      );
      break;
    case 'instants':
      for (const id of action.cardIds)
        fireEvent.click(screen.getByTestId(`prebattle-instant-toggle-${uid(id)}`));
      fireEvent.click(screen.getByTestId('lock-instants-btn'));
      break;
    case 'log':
      fireEvent.click(screen.getByTestId('mobile-drawer-toggle'));
      fireEvent.click(screen.getByTestId('mobile-drawer-close'));
      break;
    case 'discard': {
      expect(view.self.hand.length).toBeGreaterThan(10);
      expect(view.self.legal.mustDiscardCount).toBe(view.self.hand.length - 10);
      const button = screen.getByTestId('hand-limit-submit-btn') as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.click(screen.getByTestId('hand-limit-suggest-fifo-btn'));
      const selected = useGameStore.getState().selectedDiscardUids[0]!;
      fireEvent.click(screen.getByTestId(`hand-limit-toggle-btn-${selected}`));
      expect(button.disabled).toBe(true);
      fireEvent.click(screen.getByTestId(`hand-limit-toggle-btn-${selected}`));
      fireEvent.click(button);
      break;
    }
    case 'concede':
      fireEvent.click(screen.getByTestId('mobile-drawer-toggle'));
      fireEvent.click(screen.getByTestId('match-concede-btn'));
      break;
    case 'handover':
      fireEvent.click(screen.getByTestId('hotseat-reveal-hand-btn'));
      break;
    case 'timeout':
      act(() => vi.advanceTimersByTime(1500));
      break;
    case 'instant-budget': {
      const walls = view.self.hand.filter((card) => card.cardId === 'i1_wall');
      for (const card of walls.slice(0, 2))
        fireEvent.click(screen.getByTestId(`prebattle-instant-toggle-${card.uid}`));
      expect(
        (screen.getByTestId(`prebattle-instant-toggle-${walls[2]!.uid}`) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      fireEvent.click(screen.getByTestId('prebattle-clear-instants-btn'));
      break;
    }
    case 'read':
      fireEvent.click(screen.getByTestId('tutorial-next'));
      break;
  }
}
