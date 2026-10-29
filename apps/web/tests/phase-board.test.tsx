// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BattlefieldBoard } from '../src/components/board/BattlefieldBoard.js';
import { BattlePlaybackAndLog } from '../src/components/board/BattlePlaybackAndLog.js';
import { PlayerHand } from '../src/components/board/PlayerHand.js';
import { createGameStore, useGameStore } from '../src/state/game-store.js';
import { createTutorialController } from '../src/tutorial/tutorial-scenario.js';

afterEach(() => {
  cleanup();
  useGameStore.getState().resetStore();
});

function fixture() {
  const store = createGameStore();
  const controller = createTutorialController(store);
  const initial = controller.startMatch();
  controller.dispose();
  store.getState().resetStore();
  return { ...initial, phase: 'development' as const };
}

it('shows compact cities in economy, battle lines in prebattle, and no deck counters', () => {
  const view = fixture();
  const { rerender } = render(
    <BattlefieldBoard view={view} sidebarSlot={<BattlePlaybackAndLog view={view} />} />,
  );
  expect(screen.queryByTestId('self-line-front')).toBeNull();
  expect(screen.queryByTestId('battle-playback-bar')).toBeNull();
  expect(screen.getByTestId('self-counts').textContent).not.toMatch(/Mazzi|Scarti/);
  const battle = { ...view, phase: 'prebattle' as const };
  rerender(<BattlefieldBoard view={battle} sidebarSlot={<BattlePlaybackAndLog view={battle} />} />);
  expect(screen.getByTestId('self-line-front')).toBeDefined();
  expect(screen.getByTestId('battle-playback-bar')).toBeDefined();
  expect(screen.queryByTestId('subdecks-and-discards-panel')).toBeNull();
});

it('keeps battle controls available while paused before BattleStarted, then returns to economy', () => {
  const view = fixture();
  render(<BattlefieldBoard view={view} sidebarSlot={<BattlePlaybackAndLog view={view} />} />);
  act(() =>
    useGameStore.setState({
      isPlaying: true,
      isPaused: true,
      queue: [{ type: 'BattleStarted', era: 1, n: 1 }],
    }),
  );
  expect(screen.getByTestId('battlefield-board').getAttribute('data-scene')).toBe('battle');
  expect(screen.getByTestId('self-line-front')).toBeDefined();
  expect(screen.getByTestId('playback-pause-btn')).toBeDefined();
  act(() => useGameStore.setState({ isPlaying: false, queue: [] }));
  expect(screen.getByTestId('battlefield-board').getAttribute('data-scene')).toBe('economy');
  expect(screen.queryByTestId('battle-playback-bar')).toBeNull();
});

it('plays from the hand on double click and retains keyboard inspection and contextual play', () => {
  const view = fixture();
  const instance = view.self.hand[0]!;
  const legalView = {
    ...view,
    self: {
      ...view.self,
      legal: {
        ...view.self.legal,
        handPlayability: { ...view.self.legal.handPlayability, [instance.uid]: { playable: true } },
      },
    },
  };
  const play = vi.fn();
  const inspect = vi.fn();
  render(<PlayerHand view={legalView} onPlayCard={play} onInspectCard={inspect} />);
  const card = screen.getByTestId(`hand-slot-${instance.uid}`).querySelector('[tabindex="0"]')!;
  fireEvent.doubleClick(card);
  expect(play).toHaveBeenCalledWith(instance.uid);
  expect(inspect).not.toHaveBeenCalled();
  fireEvent.keyDown(card, { key: 'i' });
  expect(inspect).toHaveBeenCalledWith(instance.cardId);
  fireEvent.click(card);
  fireEvent.click(screen.getByTestId('hand-preview-play-btn'));
  expect(play).toHaveBeenCalledTimes(2);
});
