import type { PlayerView } from '@epochs/engine';
import { useGameStore } from '../../state/game-store.js';

/** The engine may already have advanced while the queued battle is still on screen. */
export function useBattlePresentation(view: PlayerView | null): boolean {
  const queuedBattle = useGameStore(
    (s) =>
      s.isPlaying &&
      (s.activeBattleStage !== null ||
        s.isRevealingUnits ||
        s.currentEvent?.type === 'UnitsRevealed' ||
        s.currentEvent?.type === 'BattleStarted' ||
        s.queue.some((event) => event.type === 'UnitsRevealed' || event.type === 'BattleStarted')),
  );
  return view?.phase === 'prebattle' || view?.phase === 'finished' || queuedBattle;
}
