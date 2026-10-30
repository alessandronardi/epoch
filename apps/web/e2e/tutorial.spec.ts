import { openHand } from './board-actions.js';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { performCue } from './tutorial-actions.js';
import { TUTORIAL_CUES, DISCARD_TUTORIAL_CUES } from '../src/tutorial/tutorial-scenario.js';

test.use({ actionTimeout: 15_000 });

test('tutorial completo con controlli reali, riepilogo e scarto su desktop e mobile', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.getByTestId('nav-tutorial-btn').click();
  await expect(page.getByTestId('tutorial-title')).toHaveText('Ispeziona una carta');
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('tutorial-mulligan.png') });
  // Riavvio dalla finestra, senza uscire dall'esercitazione.
  await page
    .getByTestId('mulligan-modal')
    .getByRole('button', { name: 'Ricomincia', exact: true })
    .click();
  for (const cue of TUTORIAL_CUES.slice(0, -1)) {
    await expect(page.getByTestId('tutorial-title')).toHaveText(cue.title);
    await performCue(page, cue);
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  await expect(page.getByTestId('tutorial-title')).toHaveText('Tutorial completato');
  await expect(page.getByTestId('game-over-modal')).toHaveAttribute('data-result-kind', 'points');
  await expect(page.getByTestId('game-over-opponent-city-hp')).toContainText('14/22');
  await page.screenshot({ path: testInfo.outputPath('tutorial-completed.png') });
  await page.getByTestId('game-over-inspect-board-btn').click();
  await page.getByTestId('reopen-game-over-modal-btn').click();
  await page.getByTestId('game-over-inspect-board-btn').click();
  await page.getByTestId('tutorial-discard-exercise').click();
  for (const cue of DISCARD_TUTORIAL_CUES.slice(0, -1)) {
    await expect(page.getByTestId('tutorial-title')).toHaveText(cue.title);
    if (cue.action.kind === 'discard') {
      await page.screenshot({ path: testInfo.outputPath('tutorial-discard.png') });
      await expect(
        page.getByTestId('hand-limit-modal').getByTestId('tutorial-modal-guidance'),
      ).toBeVisible();
    }
    await performCue(page, cue);
  }
  await expect(page.getByTestId('player-hand')).toHaveAttribute('data-hand-count', '10');
  await page.getByTestId('tutorial-next').click();
  await expect(page.getByTestId('nav-tutorial-btn')).toBeVisible();
  await page.getByTestId('nav-tutorial-btn').click();
  await page
    .getByTestId('mulligan-modal')
    .getByRole('button', { name: 'Esci dal tutorial' })
    .click();
  await expect(page.getByTestId('screen-tutorial')).toHaveCount(0);
});

test('trascina carte realmente sulla Città, poi torna a una partita libera', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Il trascinamento pointer è verificato sul desktop; il percorso mobile usa tap.',
  );
  test.setTimeout(180_000);
  await page.goto('/');
  await page.getByTestId('nav-tutorial-btn').click();
  let drops = 0;
  for (const cue of TUTORIAL_CUES.slice(0, -1)) {
    await expect(page.getByTestId('tutorial-title')).toHaveText(cue.title);
    if (cue.action.kind === 'play' && drops < 2) {
      const slot = page.locator(`.player-hand__slot[data-hand-card-id="${cue.action.cardId}"]`);
      if ((await page.getByTestId('player-hand').getAttribute('data-expanded')) !== 'true')
        await openHand(page);
      const target = page.getByTestId('self-city-zone');
      await target.scrollIntoViewIfNeeded();
      await slot.scrollIntoViewIfNeeded();
      await expect(target).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`drag-${drops}.png`) });
      const start = await slot.boundingBox();
      const end = await target.boundingBox();
      if (!start || !end) throw new Error('Destinazione drag non visibile');
      await page.mouse.move(start.x + start.width / 2, start.y + 30);
      await page.mouse.down();
      await page.mouse.move(start.x + start.width / 2 + 10, start.y + 20, { steps: 4 });
      await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 20 });
      await page.mouse.up();
      const skip = page.getByTestId('tutorial-skip-playback');
      if (await skip.isVisible()) {
        try {
          await skip.click({ timeout: 1_000 });
        } catch {
          // Una coda breve può terminare fra il controllo e il clic.
          await expect(page.getByTestId('tutorial-title')).not.toHaveText(cue.title);
        }
      }
      await expect(page.getByTestId('tutorial-title')).not.toHaveText(cue.title);
      drops += 1;
    } else await performCue(page, cue);
  }
  expect(drops).toBe(2);
  await page.getByTestId('game-over-inspect-board-btn').click();
  await page.getByTestId('tutorial-free-match').click();
  await expect(page.getByTestId('screen-tutorial')).toHaveCount(0);
  await expect(page.getByTestId('mulligan-modal')).toBeVisible();
  await expect(page.getByTestId('tutorial-modal-guidance')).toHaveCount(0);
});
