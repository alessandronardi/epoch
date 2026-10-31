import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { CARDS_RULES } from '@epochs/content';
import { createGame, type DeckPayload } from '@epochs/engine';
import { expect, test } from '@playwright/test';
import balancedDeck from '../../../data/decks/balanced-tactical.json' with { type: 'json' };

test('permette di scorrere verso il catalogo con rotella o trackpad', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-deck-builder-btn').click();
  const builder = page.getByTestId('screen-deck-builder');
  await builder.hover({ position: { x: 20, y: 200 } });
  await page.mouse.wheel(0, 600);
  // I click di Playwright scorrono anche contenitori con overflow:hidden:
  // la rotella verifica che il catalogo sia raggiungibile anche dall'utente.
  await expect.poll(() => builder.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test('crea un mazzo 3×20, blocca bozze incomplete, salva e usa il mazzo personale in partita', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByTestId('nav-deck-builder-btn').click();
  await expect(page.getByTestId('screen-deck-builder')).toBeVisible();
  await expect(page.getByTestId('deck-save-btn')).toBeDisabled();
  await expect(page.getByTestId('deck-export-btn')).toBeDisabled();
  await page.getByTestId('deck-name-input').fill('Guardia delle Tre Ere');

  // Composizione personale dal catalogo: due Miniere al posto delle Fattorie del preset.
  const expectedDeck: DeckPayload = structuredClone(balancedDeck);
  expectedDeck.name = 'Guardia delle Tre Ere';
  delete expectedDeck.id;
  delete expectedDeck.description;
  expectedDeck.subdecks['1'] = expectedDeck.subdecks['1'].map((id) =>
    id === 'e1_farm' ? 'e1_mine' : id,
  );
  await page.getByTestId('deck-add-e1_mine').click({ clickCount: 1 });
  await page.getByTestId('deck-add-e1_mine').click();
  await page.getByTestId('deck-add-e1_mine').click();
  await expect(page.getByTestId('deck-add-e1_mine')).toBeDisabled();
  await page.getByTestId('deck-remove-e1_mine').click();

  for (const era of ['1', '2', '3'] as const) {
    await page.getByTestId(`deck-era-${era}`).click();
    const cards = expectedDeck.subdecks[era];
    const cardsToAdd = era === '1' ? cards.slice(2) : era === '3' ? cards.slice(0, -1) : cards;
    for (const cardId of cardsToAdd) await page.getByTestId(`deck-add-${cardId}`).click();
  }
  await expect(page.getByTestId('deck-era-1')).toContainText('Era I: 20/20');
  await expect(page.getByTestId('deck-era-2')).toContainText('Era II: 20/20');
  await expect(page.getByTestId('deck-era-3')).toContainText('Era III: 19/20');
  await expect(page.getByTestId('deck-save-btn')).toBeDisabled();

  // La bozza non compare tra i mazzi giocabili e sopravvive alla navigazione.
  await page.getByTestId('back-to-home-btn').click();
  await page.getByTestId('open-bot-setup-btn').click();
  await expect(page.getByTestId('bot-player-deck-select').locator('option')).toHaveCount(3);
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  await page.getByTestId('nav-deck-builder-btn').click();
  await expect(page.getByTestId('deck-name-input')).toHaveValue(expectedDeck.name);
  await page.getByTestId('deck-era-3').click();
  await page.getByTestId(`deck-add-${expectedDeck.subdecks['3'].at(-1)!}`).click();
  await expect(page.getByTestId('deck-validation')).toContainText('Mazzo valido');
  for (const resource of ['Cibo', 'Legno', 'Metallo']) {
    await expect(page.getByRole('list', { name: `Curva dei costi ${resource}` })).toBeAttached();
  }

  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  const undersized = await page
    .getByTestId('screen-deck-builder')
    .locator('button, input, select, textarea')
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const { width, height } = element.getBoundingClientRect();
          return width > 0 && height > 0 && (width < 44 || height < 44);
        })
        .map((element) => element.outerHTML),
    );
  expect(undersized).toEqual([]);
  expect(
    await page
      .getByTestId('screen-deck-builder')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);

  await page.getByTestId('deck-save-btn').click();
  await expect(page.getByTestId('deck-notice')).toContainText('Mazzo salvato');
  await page.getByTestId('deck-era-1').click();
  await page.getByTestId('screen-deck-builder').evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: testInfo.outputPath('deck-builder.png') });

  const downloadEvent = page.waitForEvent('download');
  await page.getByTestId('deck-export-btn').click();
  const download = await downloadEvent;
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8')) as DeckPayload;
  expect(exported).toEqual({ ...expectedDeck, id: expect.any(String) });
  expect(exported.id).not.toBe(balancedDeck.id);

  // Reload prova la persistenza reale, senza inserire dati nello storage dal test.
  await page.reload();
  await page.getByTestId('open-bot-setup-btn').click();
  await page.getByTestId('bot-player-deck-select').selectOption(`custom:${exported.id}`);
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  await page.getByTestId('open-hotseat-setup-btn').click();
  await expect(
    page.getByTestId('hotseat-p1-deck-select').locator(`option[value="custom:${exported.id}"]`),
  ).toContainText(expectedDeck.name);
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  await page.getByTestId('nav-online-lobby-btn').click();
  await page.getByTestId('online-deck-select').selectOption(`custom:${exported.id}`);
  await expect(page.getByTestId('online-deck-select')).toHaveValue(`custom:${exported.id}`);
  await page.getByTestId('back-to-home-btn').click();
  await page.getByTestId('open-bot-setup-btn').click();
  await page.getByTestId('bot-player-deck-select').selectOption(`custom:${exported.id}`);
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  await page.getByTestId('open-match-settings-btn').click();
  const seed = 'e2e-m6-custom-deck';
  await page.getByTestId('home-seed-input').fill(seed);
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  await page.getByTestId('open-bot-setup-btn').click();
  await page.getByTestId('bot-opponent-deck-select').selectOption(`custom:${exported.id}`);
  await page.getByTestId('start-bot-match-btn').click();
  const modal = page.getByTestId('mulligan-modal');
  await expect(modal).toBeVisible();
  const expectedHand = createGame({
    seed,
    catalog: CARDS_RULES,
    decks: { P1: exported, P2: exported },
  }).state.players.P1.hand.map((card) => card.cardId);
  expect(
    await modal
      .locator('[data-card-id]')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-card-id'))),
  ).toEqual(expectedHand);
  await page.getByTestId('mulligan-submit-btn').click();
  await expect(page.getByTestId('battlefield-board')).toHaveAttribute('data-phase', 'development');
});

test('importa JSON da testo e file, rifiuta dati invalidi e aggiorna un mazzo salvato', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('nav-deck-builder-btn').click();
  await page.getByRole('button', { name: 'Importa JSON', exact: true }).click();
  await page.getByLabel('Contenuto JSON').fill('{');
  await page.getByRole('button', { name: 'Importa contenuto JSON' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('deck-save-btn')).toBeDisabled();
  const deck = { ...balancedDeck, id: 'e2e-imported', name: 'Mazzo importato' };
  await page.getByLabel('Contenuto JSON').fill(JSON.stringify(deck));
  await page.getByRole('button', { name: 'Importa contenuto JSON' }).click();
  await expect(page.getByTestId('deck-name-input')).toHaveValue(deck.name);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByTestId('deck-save-btn').click();
  await page.getByTestId('deck-remove-e1_farm').click();
  await expect(page.getByTestId('deck-save-btn')).toBeDisabled();
  // Un file incompleto non sovrascrive la bozza corrente.
  const invalid = structuredClone(deck);
  invalid.subdecks['2'].pop();
  await page.getByLabel('File JSON').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('deck-era-1')).toContainText('19/20');
  await page.getByLabel('File JSON').setInputFiles({
    name: 'deck.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...deck, name: 'Mazzo aggiornato' })),
  });
  await expect(page.getByTestId('deck-name-input')).toHaveValue('Mazzo aggiornato');
  await page.getByTestId('deck-save-btn').click();
  await expect(page.getByTestId('deck-saved-select').locator('option')).toHaveCount(2);
  await page.getByRole('button', { name: 'Nuovo mazzo', exact: true }).click();
  await expect(page.getByTestId('deck-save-btn')).toBeDisabled();
  await page.getByTestId('deck-saved-select').selectOption(deck.id);
  await expect(page.getByTestId('deck-name-input')).toHaveValue('Mazzo aggiornato');
  await page.getByTestId('deck-preset-select').selectOption('balanced-tactical-v2');
  await page.getByTestId('deck-save-btn').click();
  await expect(page.getByTestId('deck-saved-select').locator('option')).toHaveCount(3);
});
