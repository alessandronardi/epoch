import { openHand, closeHand, disablePassConfirmation } from './board-actions.js';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function assertNoCriticalOrSeriousA11yViolations(
  page: Page,
  contextLabel: string,
): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const blockingViolations = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );

  expect(
    blockingViolations,
    `Violazioni axe critical/serious in "${contextLabel}": ${JSON.stringify(
      blockingViolations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.map((n) => n.html),
      })),
      null,
      2,
    )}`,
  ).toEqual([]);
}

test.describe('The Epochs — Partita completa locale vs Bot e Accessibilità (M3-12)', () => {
  test('completa una partita intera da Home fino a finished (3 Ere) con 0 violazioni axe critical/serious', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/');

    const homeScreen = page.getByTestId('home-screen');
    await expect(homeScreen).toBeVisible();

    // 1. Audit accessibilità sulla schermata Home
    await assertNoCriticalOrSeriousA11yViolations(page, 'HomeScreen');

    // Imposta un seed deterministico e avvia la partita contro GreedyBot
    await page.getByTestId('open-match-settings-btn').click();
    const seedInput = page.getByTestId('home-seed-input');
    await seedInput.fill('e2e-m3-match-seed-42');
    await page.getByRole('button', { name: 'Chiudi finestra' }).click();
    await page.getByTestId('open-bot-setup-btn').click();
    await page.getByTestId('start-bot-match-btn').click();

    const board = page.getByTestId('battlefield-board');
    await expect(board).toBeVisible();

    // 2. Finestra di Mulligan Iniziale (Era I)
    const mulliganModal = page.getByTestId('mulligan-modal');
    await expect(mulliganModal).toBeVisible();
    await assertNoCriticalOrSeriousA11yViolations(page, 'MulliganModal');

    // Seleziona la prima carta per il mulligan e conferma
    const firstMulliganToggle = mulliganModal
      .locator('[data-testid^="mulligan-toggle-btn-"]')
      .first();
    await firstMulliganToggle.click();
    await expect(page.getByTestId('mulligan-submit-btn')).toContainText(
      'Conferma Mulligan (1 carte)',
    );
    await page.getByTestId('mulligan-submit-btn').click();
    await expect(mulliganModal).toBeHidden();

    // 3. Verifica ingresso in Development e audit accessibilità sul Tavolo di Partita
    await expect(board).toHaveAttribute('data-phase', 'development');
    await assertNoCriticalOrSeriousA11yViolations(page, 'BattlefieldBoard - Development');

    const viewportSize = page.viewportSize();
    const isMobileViewport = (viewportSize?.width ?? 1280) < 1100;

    await disablePassConfirmation(page);

    let auditedPrebattleA11y = false;
    let testedSkipPlayback = false;
    let playedAtLeastOneCard = false;

    // 4. Loop deterministico delle fasi attraverso tutte le Ere fino a 'finished'
    for (let step = 0; step < 60; step += 1) {
      await expect(board).toHaveAttribute('data-is-playing', 'false', { timeout: 30_000 });
      const currentPhase = await board.getAttribute('data-phase');

      if (currentPhase === 'finished') {
        break;
      }

      if (currentPhase === 'hand_limit') {
        const handLimitModal = page.getByTestId('hand-limit-modal');
        await expect(handLimitModal).toBeVisible();
        await page.getByTestId('hand-limit-suggest-fifo-btn').click();
        await page.getByTestId('hand-limit-submit-btn').click();
        await expect(handLimitModal).toBeHidden();
        continue;
      }

      if (currentPhase === 'development') {
        // Gioca almeno una carta giocabile con Tap-to-Play per verificare il flusso completo
        if (!playedAtLeastOneCard) {
          const playableSlot = page
            .locator('[data-testid^="hand-slot-"][data-playable="true"]')
            .first();
          if ((await playableSlot.count()) > 0) {
            if ((await page.getByTestId('player-hand').getAttribute('data-expanded')) !== 'true')
              await openHand(page);
            await playableSlot.click();
            const playBtn = page.getByTestId('hand-preview-play-btn');
            if (await playBtn.isEnabled()) {
              await playBtn.click();
              const conversionModal = page.getByTestId('conversion-modal');
              if (await conversionModal.isVisible()) {
                await page.getByTestId('confirm-conversion-btn').click();
              }
              playedAtLeastOneCard = true;
              continue;
            }
          }
        }

        await closeHand(page);
        await expect(page.getByTestId('player-hand')).toHaveAttribute('data-expanded', 'false');
        const passBtn = page.getByTestId('pass-turn-btn');
        if (await passBtn.isEnabled()) {
          await passBtn.click();
          const confirmPassDialog = page.getByTestId('pass-confirm-dialog');
          if (await confirmPassDialog.isVisible()) {
            await page.getByTestId('confirm-pass-btn').click();
          }
          continue;
        }
      }

      if (currentPhase === 'prebattle') {
        const prebattleBar = page.getByTestId('prebattle-instants-bar');
        await expect(prebattleBar).toBeVisible();

        if (!auditedPrebattleA11y) {
          await assertNoCriticalOrSeriousA11yViolations(
            page,
            'BattlefieldBoard - PrebattleInstantsBar',
          );
          auditedPrebattleA11y = true;
        }

        // Verifica la barra EventPlayer / Registro e il pulsante "Salta alla fine"
        // durante la riproduzione non bloccante (senza modali sovrapposte)
        if (!testedSkipPlayback) {
          if (isMobileViewport) {
            const drawerToggle = page.getByTestId('mobile-drawer-toggle');
            await expect(drawerToggle).toBeVisible();
            await drawerToggle.click();
            await page.getByTestId('playback-speed-2x').click();
            const skipBtn = page.getByTestId('playback-skip-btn');
            if (await skipBtn.isEnabled()) {
              await skipBtn.click({ timeout: 1000 }).catch(async (error: unknown) => {
                // Playback can finish between the enabled check and the click.
                if (await skipBtn.isEnabled()) throw error;
              });
            }
            const logRegion = page.getByTestId('battle-log-region');
            await logRegion.scrollIntoViewIfNeeded();
            await expect(logRegion).toBeVisible();
            await page.getByTestId('mobile-drawer-close').click();
          } else {
            await expect(page.getByTestId('battle-log-region')).toBeVisible();
            await page.getByTestId('playback-speed-2x').click();
            const skipBtn = page.getByTestId('playback-skip-btn');
            if (await skipBtn.isEnabled()) {
              await skipBtn.click({ timeout: 1000 }).catch(async (error: unknown) => {
                // Playback can finish between the enabled check and the click.
                if (await skipBtn.isEnabled()) throw error;
              });
            }
          }
          testedSkipPlayback = true;
        }

        await page.getByTestId('lock-instants-btn').click();
        continue;
      }

      await page.waitForTimeout(50);
    }

    // 5. Verifica raggiungimento stato 'finished' e modale di Fine Partita
    await expect(board).toHaveAttribute('data-phase', 'finished');
    expect(playedAtLeastOneCard).toBe(true);

    const gameOverModal = page.getByTestId('game-over-modal');
    await expect(gameOverModal).toBeVisible();
    await expect(page.getByTestId('game-over-result-badge')).toBeVisible();
    await expect(page.getByTestId('game-over-headline')).toBeVisible();

    // 6. Audit accessibilità finale sulla modale di Fine Partita
    await assertNoCriticalOrSeriousA11yViolations(page, 'GameOverModal');
  });
});
