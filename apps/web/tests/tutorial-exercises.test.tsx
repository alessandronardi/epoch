// @vitest-environment jsdom
import { HotSeatHandoverModal } from '../src/components/modals/HotSeatAndGameOverModal.js';
import { CARDS_RULES } from '@epochs/content';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { validateDeck, type GameResultKind } from '@epochs/engine';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReplayPayloadSchema } from '../../../packages/protocol/src/index.js';
import { TutorialScreen } from '../src/screens/TutorialScreen.js';
import { createGameStore, useGameStore } from '../src/state/game-store.js';
import { deckBuilderStore } from '../src/state/deck-builder-store.js';
import { createOnlineTutorialDemo, createTutorialReplay } from '../src/tutorial/tutorial-demo.js';
import {
  createExerciseController,
  createExerciseDecks,
  MATCH_EXERCISE_CUES,
  type MatchExerciseId,
} from '../src/tutorial/tutorial-exercises.js';
import { resolveTutorialCommand } from './tutorial-driver.js';
import { performCue } from './tutorial-ui-driver.js';

afterEach(() => {
  cleanup();
  useGameStore.getState().resetStore();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function openExercise(id: string): void {
  render(
    <StrictMode>
      <TutorialScreen onBackHome={vi.fn()} />
    </StrictMode>,
  );
  fireEvent.click(
    within(screen.getByTestId('mulligan-modal')).getByRole('button', { name: 'Esercitazioni' }),
  );
  fireEvent.click(screen.getByTestId(`tutorial-module-${id}`));
}

describe('Esercitazioni D con transizioni del motore', () => {
  for (const id of [
    'economy',
    'budget',
    'annihilation',
    'draw',
    'concession',
    'timeout',
    'hotseat',
    'playback',
  ] as const) {
    it(`raggiunge legalmente gli obiettivi di ${id}`, () => {
      const store = createGameStore();
      const controller = createExerciseController(id, store);
      let view = controller.startMatch();
      const milestones = [];
      try {
        for (const cue of MATCH_EXERCISE_CUES[id]) {
          store.getState().skipToEnd();
          expect(view.era).toBe(cue.era);
          expect(view.phase).toBe(cue.phase);
          if (cue.viewer) expect(view.me).toBe(cue.viewer);
          milestones.push({ cue, view });
          if (cue.action.kind === 'handover') {
            expect(store.getState().awaitingHotSeatHandover).toBe(true);
            controller.acknowledgeHotSeatHandover();
            continue;
          }
          const command = resolveTutorialCommand(cue, view);
          if (command) {
            const result = controller.dispatch(command);
            if (!result.ok) throw new Error(`${cue.title}: ${result.error.message}`);
            view = result.value;
          }
        }
        const results: Partial<Record<MatchExerciseId, GameResultKind>> = {
          annihilation: 'annihilation',
          draw: 'draw',
          concession: 'concession',
          timeout: 'timeout',
        };
        if (results[id]) expect(view.result?.kind).toBe(results[id]);
        if (id === 'annihilation') {
          expect(view.opponent.cityHp).toBeLessThanOrEqual(0);
          expect(store.getState().playedEvents).not.toContainEqual(
            expect.objectContaining({ type: 'RaidResolved', era: 3 }),
          );
        }
        if (id === 'economy') {
          expect(
            milestones.find((item) => item.cue.title === 'Osserva il limite del magazzino')!.view
              .self.resources.food,
          ).toBe(7);
          expect(view.self.slotsUsed).toBe(4);
          const lumber = view.self.hand.find((card) => card.cardId === 'e1_lumb')!;
          expect(view.self.legal.handPlayability[lumber.uid]?.reason).toBe('no_slot');
        }
        if (id === 'draw') expect(view.result?.winner).toBe('DRAW');
        if (id === 'concession' || id === 'timeout') expect(view.result?.winner).toBe('P2');
      } finally {
        controller.dispose();
        store.getState().resetStore();
      }
    });
  }

  it('usa mazzi di venti carte legali anche nelle varianti', () => {
    for (const id of ['economy', 'budget', 'annihilation'] as const) {
      for (const subdecks of Object.values(createExerciseDecks(id))) {
        expect(validateDeck({ name: id, subdecks }, CARDS_RULES)).toEqual([]);
      }
    }
  });
});

describe('Esercitazioni D attraverso i controlli reali', () => {
  for (const id of ['economy', 'budget', 'concession', 'timeout', 'hotseat'] as const) {
    it(`completa ${id}, registra i progressi e permette di tornare al menu`, () => {
      vi.useFakeTimers();
      openExercise(id);
      for (const cue of MATCH_EXERCISE_CUES[id].slice(0, -1)) {
        expect(screen.getByTestId('tutorial-title').textContent).toBe(cue.title);
        if (cue.action.kind === 'handover') {
          expect(screen.queryByTestId('player-hand')).toBeNull();
          expect(screen.queryByTestId('battlefield-board')).toBeNull();
        }
        performCue(cue);
        if (useGameStore.getState().isPlaying) act(() => vi.runAllTimers());
      }
      expect(screen.getByTestId('tutorial-title').textContent).toBe('Esercitazione completata');
      const dialog = screen.queryByTestId('game-over-modal');
      const scope = dialog ? within(dialog) : screen;
      fireEvent.click(scope.getByRole('button', { name: 'Esercitazioni' }));
      expect(screen.getByTestId(`tutorial-module-${id}`).textContent).toContain('Completata');
      expect(useGameStore.getState().view).toBeNull();
    }, 60000);
  }

  it('richiede l’uso dei controlli di riproduzione e blocca il completamento anticipato', () => {
    vi.useFakeTimers();
    openExercise('playback');
    for (const cue of MATCH_EXERCISE_CUES.playback.slice(0, -1)) {
      performCue(cue);
      if (cue.action.kind !== 'instants') {
        if (useGameStore.getState().isPlaying) act(() => vi.runAllTimers());
        continue;
      }
      expect(useGameStore.getState().isPaused).toBe(true);
      fireEvent.click(screen.getByTestId('tutorial-skip-playback'));
      expect(screen.getByRole('alert').textContent).toContain('Completa prima');
      fireEvent.click(screen.getByTestId('mobile-drawer-toggle'));
      fireEvent.click(screen.getByTestId('playback-pause-btn'));
      fireEvent.click(screen.getByTestId('playback-pause-btn'));
      fireEvent.click(screen.getByTestId('playback-speed-2x'));
      fireEvent.click(screen.getByTestId('playback-pause-btn'));
      expect(screen.getByTestId('tutorial-playback-objective').textContent).toContain('4/4');
      fireEvent.click(screen.getByTestId('playback-skip-btn'));
    }
    expect(screen.getByTestId('tutorial-title').textContent).toBe('Esercitazione completata');
    expect(useGameStore.getState().view?.era).toBe(2);
  }, 60000);

  it('non svela la mano del turno precedente se la consegna viene premuta durante gli eventi', () => {
    vi.useFakeTimers();
    const controller = createExerciseController('hotseat', useGameStore);
    controller.startMatch();
    useGameStore.getState().skipToEnd();
    controller.dispatch({ type: 'SubmitMulligan', cardUids: [] });
    render(<HotSeatHandoverModal controller={controller} />);
    const reveal = screen.getByTestId('hotseat-reveal-hand-btn') as HTMLButtonElement;
    expect(reveal.disabled).toBe(true);
    fireEvent.click(reveal);
    expect(useGameStore.getState().awaitingHotSeatHandover).toBe(true);
    act(() => useGameStore.getState().skipToEnd());
    expect(reveal.disabled).toBe(false);
    expect(useGameStore.getState().view?.me).toBe('P2');
    fireEvent.click(reveal);
    expect(useGameStore.getState().awaitingHotSeatHandover).toBe(false);
    controller.dispose();
  });

  it('pulisce il timer della dimostrazione quando si esce', () => {
    vi.useFakeTimers();
    openExercise('timeout');
    fireEvent.click(
      within(screen.getByTestId('mulligan-modal')).getByRole('button', { name: 'Esercitazioni' }),
    );
    act(() => vi.runAllTimers());
    expect(useGameStore.getState().view).toBeNull();
    expect(useGameStore.getState().playedEvents).toEqual([]);
  });

  it('esercita l’Archivio con una sola ispezione e registra il ripristino dei filtri', () => {
    openExercise('archive');
    fireEvent.change(screen.getByTestId('archive-search-input'), {
      target: { value: 'Cavaliere' },
    });
    fireEvent.click(screen.getByTestId('archive-filter-era-2'));
    fireEvent.change(screen.getByTestId('archive-filter-type'), { target: { value: 'unit' } });
    fireEvent.click(
      within(screen.getByTestId('archive-card-cell-u2_cav_h')).getByTestId('card-u2_cav_h'),
    );
    expect(screen.getAllByTestId('card-inspect-modal')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('card-inspect-close'));
    fireEvent.click(screen.getByTestId('archive-reset-filters-btn'));
    expect(screen.getByTestId('tutorial-tour-completed')).toBeDefined();
  });

  it('completa il tour del Deck Builder anche importando il JSON incollato', () => {
    class DownloadURL extends URL {
      static override createObjectURL = vi.fn(() => 'blob:tutorial');
      static override revokeObjectURL = vi.fn();
    }
    vi.stubGlobal('URL', DownloadURL);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    openExercise('deck-builder');
    fireEvent.change(screen.getByTestId('deck-preset-select'), {
      target: { value: 'aggro-breach' },
    });
    const remove = screen.getAllByTestId(/^deck-remove-/)[0]!;
    const id = remove.getAttribute('data-testid')!.replace('deck-remove-', '');
    fireEvent.click(remove);
    fireEvent.click(screen.getByTestId(`deck-add-${id}`));
    fireEvent.click(screen.getByTestId('deck-export-btn'));
    const json = (screen.getByLabelText('JSON del mazzo di prova') as HTMLTextAreaElement).value;
    fireEvent.click(screen.getByRole('button', { name: 'Importa JSON' }));
    fireEvent.change(screen.getByLabelText('Contenuto JSON'), { target: { value: json } });
    fireEvent.click(screen.getByRole('button', { name: 'Importa contenuto JSON' }));
    expect(screen.getByTestId('tutorial-tour-completed')).toBeDefined();
  });

  it('non modifica la bozza personale entrando nel tour del Deck Builder', () => {
    const before = structuredClone(deckBuilderStore.getState().draft);
    openExercise('deck-builder');
    fireEvent.change(screen.getByTestId('deck-preset-select'), {
      target: { value: 'aggro-breach' },
    });
    expect(deckBuilderStore.getState().draft).toEqual(before);
  });
});

describe('Trasporto online dimostrativo', () => {
  it('connette, riconnette e pulisce i timer senza aprire WebSocket reali', async () => {
    vi.useFakeTimers();
    const nativeSocket = vi.fn(() => {
      throw new Error('Connessione esterna non prevista');
    });
    vi.stubGlobal('WebSocket', nativeSocket);
    const events: string[] = [];
    const demo = createOnlineTutorialDemo((event) => events.push(event));
    const controller = demo.createController();
    try {
      const connected = controller.connect();
      await vi.runAllTimersAsync();
      expect((await connected).connectionStatus).toBe('authenticated');
      demo.disconnect();
      expect(controller.getSnapshot().connectionStatus).toBe('disconnected');
      const reconnected = controller.connect();
      await vi.runAllTimersAsync();
      await reconnected;
      expect(events).toEqual(['connected', 'disconnected', 'reconnected']);
      const beforeDispose = [...events];
      demo.dispose();
      await vi.runAllTimersAsync();
      expect(events).toEqual(beforeDispose);
      expect(nativeSocket).not.toHaveBeenCalled();
    } finally {
      demo.dispose();
    }
  });
});

describe('Replay dimostrativo e visibilità', () => {
  it('produce replay validi e nasconde entrambe le mani nella prospettiva pubblica', () => {
    for (const perspective of ['P1', 'P2', 'public'] as const) {
      const replay = createTutorialReplay(perspective);
      expect(ReplayPayloadSchema.safeParse(replay).success).toBe(true);
      expect(replay.result).toEqual({ kind: 'concession', winner: 'P2' });
      if (perspective === 'public') {
        for (const event of [
          ...replay.initialEvents,
          ...replay.steps.flatMap((step) => step.events),
        ]) {
          if (event.type === 'CardsDrawn') expect(event.cards).toBeUndefined();
          if (event.type === 'MulliganResolved') expect(event.drawnCards).toBeUndefined();
        }
      }
      for (const view of [replay.initialView, ...replay.steps.map((step) => step.view)]) {
        if (perspective === 'public') {
          expect(view.self.hand).toEqual([]);
          expect(view.self.buildings).toEqual([]);
          expect(view.self.resources).toEqual({ food: 0, wood: 0, metal: 0 });
        } else expect(view.me).toBe(perspective);
        expect(view.opponent.resources).toBeNull();
      }
    }
  });
});
