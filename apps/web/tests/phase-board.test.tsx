// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BattlefieldBoard } from '../src/components/board/BattlefieldBoard.js';
import { BattlePlaybackAndLog } from '../src/components/board/BattlePlaybackAndLog.js';
import { PlayerHand } from '../src/components/board/PlayerHand.js';
import { createGameStore, useGameStore } from '../src/state/game-store.js';
import { createTutorialController } from '../src/tutorial/tutorial-scenario.js';
import { MatchTable } from '../src/components/board/MatchTable.js';
import { playerView } from '@epochs/engine';
import { createBattleSequenceFixture } from './fixtures/battle-sequence.js';

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
  expect(screen.queryByTestId('self-counts')).toBeNull();
  expect(screen.queryByTestId('opponent-counts')).toBeNull();
  expect(screen.getByTestId('self-resource-food').getAttribute('aria-label')).toContain('Cibo:');
  expect(screen.getByTestId('self-resource-food').textContent).not.toContain('Cibo');
  expect(screen.getByTestId('self-walls').textContent).not.toContain('Mura');
  expect(screen.getByTestId('board-era-label').textContent).toBe('Era I');
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

it('shows the presentation era and retains the battle log and summary after returning to development', () => {
  const view = fixture();
  useGameStore.getState().setPlayerView(view);
  render(<BattlefieldBoard sidebarSlot={<BattlePlaybackAndLog />} />);
  act(() =>
    useGameStore.getState().receiveTransition({ ...view, era: 2 }, [
      { n: 100, type: 'BattleStarted', era: 1, units: { P1: [], P2: [] } },
      { n: 101, type: 'BattleOutcome', era: 1, kind: 'mutual_annihilation' },
      { n: 102, type: 'EraEnded', era: 1, discardedUnitUids: { P1: [], P2: [] } },
    ]),
  );
  expect(screen.getByTestId('battlefield-board').getAttribute('data-era')).toBe('1');
  expect(screen.getByTestId('board-phase-label').textContent).toBe('Inizio battaglia');
  expect(screen.getByTestId('battle-field-pause')).toBeDefined();
  act(() => useGameStore.getState().skipToEnd());
  expect(screen.getByTestId('battlefield-board').getAttribute('data-era')).toBe('2');
  expect(screen.getByTestId('battle-summary').textContent).toContain('annientamento reciproco');
  expect(screen.getByTestId('battle-log-entry-101')).toBeDefined();
  expect(screen.queryByTestId('battle-playback-bar')).toBeNull();
});

it('retains revealed units when joining from a prebattle snapshot before the battle snapshot arrives', () => {
  const scenario = createBattleSequenceFixture();
  useGameStore.getState().setPlayerView(playerView(scenario.initial, 'P1'));
  render(<BattlefieldBoard sidebarSlot={<BattlePlaybackAndLog />} />);
  act(() =>
    useGameStore.getState().receiveTransition(
      playerView(scenario.final, 'P1'),
      scenario.events.filter((event) => event.type !== 'UnitsRevealed'),
    ),
  );
  expect(useGameStore.getState().hasPlaybackSnapshot).toBe(false);
  expect(screen.getByTestId('board-unit-P2-u1_inf_h')).toBeDefined();
  expect(screen.getByTestId('board-unit-P1-u1_arc_l')).toBeDefined();
  act(() => useGameStore.getState().skipToEnd());
});

it('keeps the reading position when new log entries arrive and offers to follow them', () => {
  const view = { ...fixture(), phase: 'prebattle' as const };
  useGameStore.getState().setPlayerView(view);
  act(() => useGameStore.getState().enqueueEvents([{ n: 100, type: 'BattleStarted', era: 1 }]));
  render(<BattlePlaybackAndLog />);
  const region = screen.getByTestId('battle-log-region');
  Object.defineProperty(region, 'scrollHeight', { configurable: true, value: 800 });
  Object.defineProperty(region, 'clientHeight', { configurable: true, value: 100 });
  region.scrollTop = 50;
  fireEvent.scroll(region);
  act(() => {
    useGameStore
      .getState()
      .enqueueEvents([{ n: 101, type: 'BattleOutcome', era: 1, kind: 'stalemate' }]);
    useGameStore.getState().skipToEnd();
  });
  expect(region.scrollTop).toBe(50);
  fireEvent.click(screen.getByRole('button', { name: /nuovi eventi/ }));
  expect(region.scrollTop).toBe(800);
  expect(screen.getByTestId('battle-log-entry-101')).toBeDefined();
});

it('protects the next hot-seat hand and delays handover only during a public battle presentation', () => {
  const previous = fixture();
  const next = {
    ...previous,
    me: 'P2' as const,
    self: { ...previous.self, hand: [{ ...previous.self.hand[0]!, uid: 'next-player-secret' }] },
  };
  function Table() {
    const view = useGameStore((state) => state.presentationView ?? state.view);
    return (
      <MatchTable
        view={view}
        controller={null}
        sidebar={<BattlePlaybackAndLog />}
        onRematch={() => {}}
        onReturnHome={() => {}}
      />
    );
  }
  useGameStore.getState().setPlayerView(previous);
  act(() => {
    useGameStore.getState().receiveTransition(next, [{ n: 100, type: 'BattleStarted', era: 1 }]);
    useGameStore.getState().setHotSeatHandover(true, 'P2');
  });
  render(<Table />);
  expect(screen.getByTestId('battlefield-board')).toBeDefined();
  expect(screen.queryByTestId('hand-slot-next-player-secret')).toBeNull();
  act(() => useGameStore.getState().skipToEnd());
  expect(screen.getByTestId('hotseat-handover-modal')).toBeDefined();
  expect(screen.queryByTestId('hand-slot-next-player-secret')).toBeNull();
  act(() => {
    useGameStore.getState().resetStore();
    useGameStore.getState().setPlayerView(next);
    useGameStore
      .getState()
      .enqueueEvents([
        { n: 200, type: 'PlayerPassed', era: 1, player: 'P1', cycle: 1, reason: 'chosen' },
      ]);
    useGameStore.getState().setHotSeatHandover(true, 'P2');
  });
  expect(screen.getByTestId('hotseat-handover-modal')).toBeDefined();
  expect(screen.queryByTestId('battlefield-board')).toBeNull();
});
