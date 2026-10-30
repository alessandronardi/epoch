import { expect, test } from '@playwright/test';
import { playerView } from '@epochs/engine';
import { createBattleSequenceFixture } from '../tests/fixtures/battle-sequence.js';

test('keeps era, buffs, HP and log aligned through pause, impact and the next era', async ({
  page,
}, testInfo) => {
  const scenario = createBattleSequenceFixture();
  const volley = scenario.events.find((event) => event.type === 'BattlePhaseResolved')!;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByTestId('open-bot-setup-btn').click();
  await page.getByTestId('start-bot-match-btn').click();
  await expect(page.getByTestId('battlefield-board')).toBeVisible();

  // Drive the real store with an engine-produced public transition, pausing at a precise boundary.
  await page.evaluate(
    async (transition) => {
      const path = '/src/state/game-store.ts';
      const { useGameStore: store } = await import(path);
      store.getState().resetStore();
      store.getState().setPlayerView(transition.initial);
      const unsubscribe = store.subscribe(
        (state: {
          currentEvent: { type: string } | null;
          playbackMoment: string;
          isPaused: boolean;
          pausePlayback: () => void;
        }) => {
          if (
            state.currentEvent?.type === 'BattlePhaseResolved' &&
            state.playbackMoment === 'announce' &&
            !state.isPaused
          ) {
            unsubscribe();
            state.pausePlayback();
          }
        },
      );
      store.getState().receiveTransition(transition.final, transition.events);
    },
    {
      initial: playerView(scenario.initial, 'P1'),
      final: playerView(scenario.final, 'P1'),
      events: scenario.events,
    },
  );

  const pause = page.getByTestId('battle-field-pause');
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  const board = page.getByTestId('battlefield-board');
  await expect(board).toHaveAttribute('data-era', '1');
  await expect(page.getByTestId('board-phase-label')).toHaveText('Fase 1: Tiro');
  const defender = page.getByTestId('board-unit-P2-u1_inf_h');
  const hp = defender.locator('[data-stat="hp"]:visible, [data-token-stat="hp"]:visible');
  await expect(hp).toHaveText('5');
  await expect(page.getByTestId(`battle-log-entry-${volley.n}`)).toHaveCount(0);

  await page.evaluate(async () => {
    const path = '/src/state/game-store.ts';
    const { useGameStore: store } = await import(path);
    const unsubscribe = store.subscribe(
      (state: { playbackMoment: string; isPaused: boolean; pausePlayback: () => void }) => {
        if (state.playbackMoment === 'impact' && !state.isPaused) {
          unsubscribe();
          state.pausePlayback();
        }
      },
    );
  });
  await pause.click();
  await expect(hp).toHaveText(/^1(?:\/5)?$/);
  await testInfo.attach('hp-layout', {
    contentType: 'application/json',
    body: JSON.stringify(
      await hp.evaluate((element) => {
        const bounds = [];
        for (
          let node: Element | null = element;
          node && bounds.length < 6;
          node = node.parentElement
        ) {
          const rect = node.getBoundingClientRect();
          bounds.push({
            className: node.className,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            overflow: getComputedStyle(node).overflow,
          });
        }
        return bounds;
      }),
    ),
  });
  await expect(hp).toBeInViewport();
  await expect(page.getByTestId('prebattle-instants-bar')).toHaveCount(0);
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  await expect(board).toHaveAttribute('data-era', '1');
  await page.screenshot({ path: testInfo.outputPath('battle-impact.png') });

  if ((page.viewportSize()?.width ?? 1280) < 1100)
    await page.getByTestId('mobile-drawer-toggle').click();
  const entry = page.getByTestId(`battle-log-entry-${volley.n}`);
  await expect(entry).toBeVisible();
  await entry.getByText('Calcoli e bersagli').click();
  await expect(entry).toContainText('HP 5 → 1');
  await page.getByTestId('playback-skip-btn').click();
  await expect(board).toHaveAttribute('data-era', '2');
  await expect(board).toHaveAttribute('data-phase', 'development');
  if ((page.viewportSize()?.width ?? 1280) >= 1100)
    await page.getByTestId('mobile-drawer-toggle').click();
  await expect(page.getByTestId('battle-summary')).toBeVisible();
  await expect(page.getByTestId('battle-summary')).toContainText('vittoria campale di P1');
  await expect(page.getByLabel('Era del registro')).toHaveValue('1');
  await expect(page.getByTestId('battle-log-region')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('battle-summary.png') });
});
