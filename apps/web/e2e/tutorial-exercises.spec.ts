import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { MATCH_EXERCISE_CUES } from '../src/tutorial/tutorial-exercises.js';
import { performCue } from './tutorial-actions.js';

test.use({ actionTimeout: 15_000 });
async function openHub(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('nav-tutorial-btn').click();
  await page
    .getByTestId('mulligan-modal')
    .getByRole('button', { name: 'Esercitazioni', exact: true })
    .click();
  await expect(page.getByTestId('tutorial-hub')).toBeVisible();
}
async function backToHub(page: Page): Promise<void> {
  const modal = page.getByTestId('game-over-modal');
  if (await modal.isVisible())
    await modal.getByRole('button', { name: 'Esercitazioni', exact: true }).click();
  else await page.getByRole('button', { name: 'Esercitazioni', exact: true }).click();
  await expect(page.getByTestId('tutorial-hub')).toBeVisible();
}

test('limiti, costi, timeout, privacy hot-seat e riproduzione dal menu delle esercitazioni', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await openHub(page);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(
    axe.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('tutorial-exercises.png') });
  for (const id of ['economy', 'budget', 'concession', 'timeout', 'hotseat', 'playback'] as const) {
    await page.getByTestId(`tutorial-module-${id}`).click();
    for (const cue of MATCH_EXERCISE_CUES[id].slice(0, -1)) {
      await expect(page.getByTestId('tutorial-title')).toHaveText(cue.title);
      await performCue(page, cue);
    }
    await expect(page.getByTestId('tutorial-title')).toHaveText('Esercitazione completata');
    if (id === 'timeout')
      await expect(page.getByTestId('game-over-modal')).toHaveAttribute(
        'data-result-kind',
        'timeout',
      );
    if (id === 'concession')
      await expect(page.getByTestId('game-over-modal')).toHaveAttribute(
        'data-result-kind',
        'concession',
      );
    await backToHub(page);
    await expect(page.getByTestId(`tutorial-module-${id}`)).toContainText('Completata');
  }
  // La visita successiva mantiene i progressi, senza mantenere una partita attiva.
  await page.reload();
  await page.getByTestId('nav-tutorial-btn').click();
  await page
    .getByTestId('mulligan-modal')
    .getByRole('button', { name: 'Esercitazioni', exact: true })
    .click();
  await expect(page.getByTestId('tutorial-module-playback')).toContainText('Completata');
});

test('esiti alternativi: distruzione e pareggio attraverso i controlli reali', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Gli esiti del motore sono indipendenti dal viewport.',
  );
  test.setTimeout(180_000);
  await openHub(page);
  for (const id of ['annihilation', 'draw'] as const) {
    await page.getByTestId(`tutorial-module-${id}`).click();
    for (const cue of MATCH_EXERCISE_CUES[id].slice(0, -1)) {
      await expect(page.getByTestId('tutorial-title')).toHaveText(cue.title);
      await performCue(page, cue);
    }
    await expect(page.getByTestId('game-over-modal')).toHaveAttribute('data-result-kind', id);
    await backToHub(page);
  }
});

test('tour Archivio: ricerca, filtri, ispezione e ripristino', async ({ page }) => {
  await openHub(page);
  await page.getByTestId('tutorial-module-archive').click();
  await page.getByTestId('archive-search-input').fill('Cavaliere');
  await page.getByTestId('archive-filter-era-2').click();
  await page.getByTestId('archive-filter-type').selectOption('unit');
  await page.getByTestId('archive-card-cell-u2_cav_h').getByTestId('card-u2_cav_h').click();
  await expect(page.getByTestId('card-inspect-modal')).toBeVisible();
  await page.getByTestId('card-inspect-close').click();
  await page.getByTestId('archive-reset-filters-btn').click();
  await expect(page.getByTestId('tutorial-tour-completed')).toBeVisible();
});

test('tour Deck Builder: bozza isolata, validazione e import/export reali', async ({ page }) => {
  await openHub(page);
  const before = await page.evaluate(() => localStorage.getItem('epochs_deck_builder_v1'));
  await page.getByTestId('tutorial-module-deck-builder').click();
  await page.getByTestId('deck-preset-select').selectOption('aggro-breach-v2');
  const remove = page.locator('[data-testid^="deck-remove-"]').first();
  const id = (await remove.getAttribute('data-testid'))!.replace('deck-remove-', '');
  await remove.click();
  await expect(page.getByTestId('deck-validation')).not.toContainText('Mazzo valido');
  await page.getByTestId(`deck-add-${id}`).click();
  const download = page.waitForEvent('download');
  await page.getByTestId('deck-export-btn').click();
  const exported = await download;
  await page.getByRole('button', { name: 'Importa JSON', exact: true }).click();
  await page.getByLabel('File JSON', { exact: true }).setInputFiles((await exported.path())!);
  await expect(page.getByTestId('tutorial-tour-completed')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('epochs_deck_builder_v1'))).toBe(before);
});

test('tour online e replay locale senza richieste esterne o mani pubbliche', async ({ page }) => {
  const sockets: string[] = [];
  const apiRequests: string[] = [];
  page.on('websocket', (socket) => {
    if (!socket.url().includes('15173') && !socket.url().includes('5173'))
      sockets.push(socket.url());
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/')) apiRequests.push(request.url());
  });
  await openHub(page);
  await page.getByTestId('tutorial-module-online-replay').click();
  await expect(page.getByTestId('online-connection-status')).toContainText('Connesso');
  await page.getByTestId('online-quick-queue-btn').click();
  await expect(page.getByTestId('online-quick-searching-badge')).toBeVisible();
  await page.getByTestId('online-create-room-btn').click();
  await expect(page.getByTestId('online-created-room-code')).toHaveText('EPOCH');
  await page.getByTestId('online-join-room-code-input').fill('ERRATO');
  await page.getByTestId('online-join-room-btn').click();
  await expect(page.getByTestId('online-error-banner')).toContainText('stanza non trovata');
  await page.getByTestId('online-join-room-code-input').fill('EPOCH');
  await page.getByTestId('online-join-room-btn').click();
  await expect(page.getByTestId('online-error-banner')).toHaveCount(0);
  await page.getByTestId('tutorial-demo-disconnect').click();
  await expect(page.getByTestId('online-connection-status')).toContainText('Disconnesso');
  await page.getByTestId('online-connect-btn').click();
  await expect(page.getByTestId('online-connection-status')).toContainText('Connesso');
  await page.getByTestId('open-replay-viewer-btn').click();
  await expect(page.getByTestId('replay-controls-bar')).toBeVisible();
  await page.getByTestId('replay-step-forward-btn').click();
  await page.getByTestId('replay-prev-step-btn').click();
  await page.getByTestId('replay-play-pause-btn').click();
  await page.getByTestId('replay-play-pause-btn').click();
  await page.getByTestId('replay-jump-end-btn').click();
  await expect(page.getByTestId('replay-final-result-badge')).toContainText('concession');
  await page.getByTestId('replay-perspective-P2').click();
  await expect(page.getByTestId('replay-self-panel')).toContainText('P2');
  await page.getByTestId('replay-perspective-public').click();
  await expect(page.getByTestId('replay-self-panel')).toContainText('Mano visibile: 0');
  await expect(page.getByTestId('replay-self-hand-list')).toHaveCount(0);
  await page.getByTestId('replay-reset-btn').click();
  await expect(page.getByTestId('tutorial-tour-completed')).toBeVisible();
  expect(sockets).toEqual([]);
  expect(apiRequests).toEqual([]);
});
