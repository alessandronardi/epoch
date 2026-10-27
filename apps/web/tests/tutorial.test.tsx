// @vitest-environment jsdom
import { CARDS_RULES } from '@epochs/content';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { validateDeck, type GameEvent, type PlayerView } from '@epochs/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TutorialScreen } from '../src/screens/TutorialScreen.js';
import { createGameStore, useGameStore } from '../src/state/game-store.js';
import {
  createTutorialController,
  createTutorialDecks,
  resolveTutorialCommand,
  TUTORIAL_CUES,
} from '../src/tutorial/tutorial-scenario.js';

const stores: ReturnType<typeof createGameStore>[] = [];
afterEach(() => {
  cleanup();
  useGameStore.getState().resetStore();
  vi.useRealTimers();
  for (const store of stores) store.getState().resetStore();
  stores.length = 0;
});

describe('Tutorial interattivo sul tavolo', () => {
  it('percorre i sei passi con i pulsanti reali, attende le animazioni e torna alla Home', () => {
    vi.useFakeTimers();
    const onBackHome = vi.fn();
    render(
      <StrictMode>
        <TutorialScreen onBackHome={onBackHome} />
      </StrictMode>,
    );
    for (const cue of TUTORIAL_CUES) {
      expect(screen.getByTestId('tutorial-title').textContent).toBe(cue.title);
      expect(screen.getByTestId('tutorial-guide').getAttribute('data-lesson')).toBe(
        String(cue.lesson),
      );
      expect(document.querySelector('[data-tutorial-focus="true"]')).not.toBeNull();
      expect(document.activeElement).toBe(screen.getByTestId('tutorial-title'));
      fireEvent.click(screen.getByTestId('tutorial-next'));
      if (useGameStore.getState().isPlaying) {
        expect((screen.getByTestId('tutorial-next') as HTMLButtonElement).disabled).toBe(true);
        const title = screen.getByTestId('tutorial-title').textContent;
        fireEvent.click(screen.getByTestId('tutorial-next'));
        expect(screen.getByTestId('tutorial-title').textContent).toBe(title);
        act(() => vi.runAllTimers());
      }
    }
    expect(useGameStore.getState().view?.result?.winner).toBe('P1');
    expect(onBackHome).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('salta solo le animazioni, riavvia da capo e pulisce lo stato alla chiusura', () => {
    vi.useFakeTimers();
    const onBackHome = vi.fn();
    const { unmount } = render(<TutorialScreen onBackHome={onBackHome} />);
    const original = useGameStore.getState().view;
    fireEvent.click(screen.getByTestId('tutorial-next'));
    fireEvent.click(screen.getByTestId('tutorial-skip-playback'));
    expect(screen.getByTestId('tutorial-title').textContent).toBe('Il tuo magazzino');
    expect(useGameStore.getState().view?.phase).toBe('development');
    fireEvent.click(screen.getByRole('button', { name: 'Ricomincia' }));
    expect(useGameStore.getState().view).toEqual(original);
    expect(screen.getByTestId('tutorial-title').textContent).toBe('Scegli la tua mano iniziale');
    fireEvent.click(screen.getByRole('button', { name: 'Esci dal tutorial' }));
    expect(onBackHome).toHaveBeenCalledTimes(1);
    unmount();
    expect(useGameStore.getState().view).toBeNull();
    act(() => vi.runAllTimers());
    expect(useGameStore.getState().view).toBeNull();
    expect(useGameStore.getState().playedEvents).toEqual([]);
    expect(useGameStore.getState().isPlaying).toBe(false);
  });
});

function runTutorial() {
  const store = createGameStore();
  stores.push(store);
  const events: GameEvent[] = [];
  const views: PlayerView[] = [];
  const controller = createTutorialController(store, (notification) => {
    events.push(...notification.events);
    views.push(notification.view);
  });
  let view = controller.startMatch();
  const snapshots = [];
  for (const cue of TUTORIAL_CUES) {
    store.getState().skipToEnd();
    snapshots.push({ title: cue.title, view });
    const command = resolveTutorialCommand(cue, view);
    if (command !== null) {
      const result = controller.dispatch(command);
      if (!result.ok) throw new Error(`${cue.title}: ${result.error.message}`);
      view = result.value;
    }
  }
  store.getState().skipToEnd();
  controller.dispose();
  return { view, events, views, snapshots };
}

describe('Tutorial M7-02: partita reale e deterministica', () => {
  it('usa mazzi completi legali e indipendenti per ogni riavvio', () => {
    const decks = createTutorialDecks();
    for (const subdecks of Object.values(decks)) {
      expect(validateDeck({ name: 'Tutorial', subdecks }, CARDS_RULES)).toEqual([]);
    }
    decks.P1[1].pop();
    expect(createTutorialDecks().P1[1]).toHaveLength(20);
  });

  it('raggiunge tutti i sei passi, con rendite, tattiche, riconversioni, Breccia e Razzia', () => {
    const run = runTutorial();
    expect(new Set(TUTORIAL_CUES.map((cue) => cue.lesson))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(run.view.phase).toBe('finished');
    expect(run.view.result).toEqual({ kind: 'points', winner: 'P1' });
    expect(run.events).toContainEqual(
      expect.objectContaining({ type: 'MulliganResolved', player: 'P1', count: 1 }),
    );
    expect(
      run.snapshots.find((entry) => entry.title === 'La prima rendita è arrivata')?.view.self
        .resources,
    ).toEqual({ food: 3, wood: 3, metal: 1 });
    expect(
      run.snapshots.find((entry) => entry.title === 'Prepara il Tiro')?.view.self.resources,
    ).toEqual({ food: 3, wood: 3, metal: 2 });
    expect(
      run.snapshots.find((entry) => entry.title === 'Passa e rivela gli eserciti')?.view.self
        .slotsUsed,
    ).toBe(4);
    const phases = run.events
      .filter((event) => event.type === 'BattlePhaseResolved')
      .filter((event) => event.era === 1);
    expect(phases.map((event) => event.phase)).toEqual([
      'phase1_volley',
      'phase2a_impale',
      'phase2b_impact',
      'phase3_melee',
    ]);
    expect(phases[1]?.damageDealt.P1).toBe(3);
    expect(run.events).toContainEqual(
      expect.objectContaining({
        type: 'BattlePhaseResolved',
        era: 2,
        phase: 'phase2b_impact',
        damageDealt: { P1: 8, P2: 0 },
      }),
    );
    const conversions = run.events
      .filter((event) => event.type === 'ConversionActivated')
      .filter((event) => event.player === 'P1');
    expect(conversions.map((event) => event.cardId)).toEqual(['e3_frn', 'e3_gld']);
    expect(conversions[0]?.demBonusGained).toBe(1);
    expect(conversions[1]?.gain).toEqual({ food: 2, wood: 2, metal: 2 });
    expect(run.events).toContainEqual(
      expect.objectContaining({
        type: 'SiegeResolved',
        era: 3,
        D: 16,
        breach: true,
        directDamage: 8,
      }),
    );
    expect(run.events).toContainEqual(
      expect.objectContaining({
        type: 'RaidResolved',
        era: 3,
        foodTransferred: 1,
        woodTransferred: 1,
      }),
    );
    expect(run.view.self.slotsUsed).toBe(2);
    expect(run.view.self.buildings.map((card) => card.cardId)).toEqual(['e1_lumb']);
    for (const view of run.views.filter((view) => view.phase === 'development')) {
      expect(view.opponent.units).toBeNull();
      expect(view.opponent.resources).toBeNull();
    }
  });

  it('ripete gli stessi stati ed eventi e rifiuta un passo fuori sequenza', () => {
    expect(runTutorial()).toEqual(runTutorial());
    const store = createGameStore();
    stores.push(store);
    const controller = createTutorialController(store);
    const view = controller.startMatch();
    expect(() => resolveTutorialCommand(TUTORIAL_CUES[2]!, view)).toThrow('fase prevista');
    controller.dispose();
  });
});
