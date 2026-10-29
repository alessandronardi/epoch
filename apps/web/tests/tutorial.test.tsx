// @vitest-environment jsdom
import { CARDS_RULES } from '@epochs/content';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { validateDeck, type GameEvent, type PlayerView } from '@epochs/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTutorialAdapter } from '../src/tutorial/tutorial-controller.js';
import { TutorialScreen } from '../src/screens/TutorialScreen.js';
import { createGameStore, useGameStore } from '../src/state/game-store.js';
import {
  createTutorialController,
  createTutorialDecks,
  TUTORIAL_CUES,
  DISCARD_TUTORIAL_CUES,
} from '../src/tutorial/tutorial-scenario.js';

import { performCue } from './tutorial-ui-driver.js';
import { resolveTutorialCommand } from './tutorial-driver.js';

const stores: ReturnType<typeof createGameStore>[] = [];
afterEach(() => {
  cleanup();
  useGameStore.getState().resetStore();
  vi.useRealTimers();
  for (const store of stores) store.getState().resetStore();
  stores.length = 0;
});

function playMainTutorial(): void {
  for (const cue of TUTORIAL_CUES.slice(0, -1)) {
    expect(screen.getByTestId('tutorial-title').textContent).toBe(cue.title);
    expect(document.querySelector('[data-tutorial-focus="true"]')).not.toBeNull();
    if (cue.action.kind !== 'read') expect(screen.queryByTestId('tutorial-next')).toBeNull();
    performCue(cue);
    if (useGameStore.getState().isPlaying) {
      expect(screen.getByTestId('tutorial-title').textContent).toBe(cue.title);
      act(() => vi.runAllTimers());
    }
    expect(screen.queryByRole('alert')).toBeNull();
  }
}

describe('Tutorial interattivo sul tavolo', () => {
  it('usa i controlli reali per tutte le Ere e per lo scarto, avanzando dopo le animazioni', () => {
    vi.useFakeTimers();
    const onBackHome = vi.fn();
    render(
      <StrictMode>
        <TutorialScreen onBackHome={onBackHome} />
      </StrictMode>,
    );
    playMainTutorial();
    expect(useGameStore.getState().view?.result).toEqual({ kind: 'points', winner: 'P1' });
    expect(screen.getByTestId('game-over-modal').getAttribute('data-result-kind')).toBe('points');
    const events = useGameStore.getState().playedEvents;
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'SiegeResolved', D: 16, breach: true, directDamage: 8 }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'RaidResolved', foodTransferred: 1, woodTransferred: 1 }),
    );
    fireEvent.click(screen.getByTestId('game-over-inspect-board-btn'));
    fireEvent.click(screen.getByTestId('reopen-game-over-modal-btn'));
    expect(screen.getByTestId('game-over-modal')).toBeDefined();
    fireEvent.click(screen.getByTestId('game-over-inspect-board-btn'));
    fireEvent.click(screen.getByTestId('tutorial-discard-exercise'));
    for (const cue of DISCARD_TUTORIAL_CUES.slice(0, -1)) {
      expect(screen.getByTestId('tutorial-title').textContent).toBe(cue.title);
      performCue(cue);
      if (useGameStore.getState().isPlaying) act(() => vi.runAllTimers());
    }
    expect(useGameStore.getState().view?.self.hand).toHaveLength(10);
    expect(useGameStore.getState().view?.phase).toBe('development');
    expect(screen.getByTestId('tutorial-title').textContent).toBe(
      'Esercitazione scarto completata',
    );
    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(onBackHome).toHaveBeenCalledTimes(1);
    expect(useGameStore.getState().view).toBeNull();
  }, 60000);

  it('rifiuta scelte fuori obiettivo, permette di riprovare e pulisce finestre e code al riavvio e uscita', () => {
    vi.useFakeTimers();
    const onBackHome = vi.fn();
    const { unmount } = render(<TutorialScreen onBackHome={onBackHome} />);
    const original = useGameStore.getState().view;
    fireEvent.click(screen.getByTestId('mulligan-submit-btn'));
    expect(useGameStore.getState().view).toEqual(original);
    expect(screen.getByTestId('tutorial-modal-guidance').textContent).toContain(
      'Obiettivo attuale',
    );
    performCue(TUTORIAL_CUES[0]!);
    performCue(TUTORIAL_CUES[1]!);
    const duringPlayback = screen.getByTestId('tutorial-title').textContent;
    expect(duringPlayback).toBe('Scegli la tua mano iniziale');
    fireEvent.click(screen.getByTestId('tutorial-skip-playback'));
    expect(screen.getByTestId('tutorial-title').textContent).toBe('Il tuo magazzino');
    fireEvent.click(screen.getAllByRole('button', { name: 'Ricomincia' })[0]!);
    expect(useGameStore.getState().view).toEqual(original);
    expect(screen.getByTestId('tutorial-title').textContent).toBe('Ispeziona una carta');
    fireEvent.click(
      within(screen.getByTestId('mulligan-modal')).getByRole('button', {
        name: 'Esci dal tutorial',
      }),
    );
    expect(onBackHome).toHaveBeenCalledTimes(1);
    unmount();
    act(() => vi.runAllTimers());
    expect(useGameStore.getState().view).toBeNull();
    expect(useGameStore.getState().playedEvents).toEqual([]);
    expect(useGameStore.getState().isPlaying).toBe(false);
  });
});

function runTutorial(useAdapter = false) {
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
  let currentCue = TUTORIAL_CUES[0]!;
  const adapter = createTutorialAdapter({
    controller,
    store,
    getCue: () => currentCue,
    isPending: () => false,
    onAccepted: () => {},
    onError: (message) => {
      throw new Error(message);
    },
  });
  for (const cue of TUTORIAL_CUES) {
    currentCue = cue;
    store.getState().skipToEnd();
    snapshots.push({ title: cue.title, view });
    const command = resolveTutorialCommand(cue, view);
    if (command !== null) {
      const result = (useAdapter ? adapter : controller).dispatch(command);
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
    expect(() =>
      resolveTutorialCommand(
        TUTORIAL_CUES.find((cue) => cue.phase === 'development')!,
        view,
      ),
    ).toThrow('fase prevista');
    controller.dispose();
  });
});

describe('Gateway dei comandi del tutorial', () => {
  it('produce gli stessi stati e gli stessi eventi del controller normale', () => {
    expect(runTutorial(true)).toEqual(runTutorial());
  });

  it('rifiuta azioni fuori obiettivo e comandi duplicati anche durante la pausa', () => {
    const store = createGameStore();
    stores.push(store);
    const controller = createTutorialController(store);
    controller.startMatch();
    store.getState().skipToEnd();
    let pending = false;
    const onError = vi.fn();
    const gateway = createTutorialAdapter({
      controller,
      store,
      getCue: () => TUTORIAL_CUES[1]!,
      isPending: () => pending,
      onAccepted: () => {
        pending = true;
      },
      onError,
    });
    const before = store.getState().view;
    expect(gateway.dispatch({ type: 'SubmitMulligan', cardUids: [] }).ok).toBe(false);
    expect(gateway.concede().ok).toBe(false);
    expect(store.getState().view).toEqual(before);
    const uid = before!.self.hand.find((card) => card.cardId === 'u1_inf_l')!.uid;
    const command = { type: 'SubmitMulligan' as const, cardUids: [uid] };
    expect(gateway.dispatch(command).ok).toBe(true);
    const target = store.getState().pendingView;
    expect(gateway.dispatch(command).ok).toBe(false);
    store.getState().pausePlayback();
    expect(gateway.dispatch(command).ok).toBe(false);
    expect(store.getState().pendingView).toEqual(target);
    store.getState().skipToEnd();
    expect(gateway.dispatch(command).ok).toBe(false); // La transizione attende ancora il commento.
    expect(
      store
        .getState()
        .playedEvents.filter((event) => event.type === 'MulliganResolved' && event.player === 'P1'),
    ).toHaveLength(1);
    controller.dispose();
  });
});
