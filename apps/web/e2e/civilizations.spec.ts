import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import legacy from '../../../data/decks/balanced-tactical.json' with { type: 'json' };
import { MATCH_EXERCISE_CUES } from '../src/tutorial/tutorial-exercises.js';
import { performCue } from './tutorial-actions.js';

test('migra una copia senza sovrascrivere il mazzo v1 e distingue i cataloghi', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('nav-deck-builder-btn').click();
  await page.getByRole('button', { name: 'Importa JSON', exact: true }).click();
  await page.getByLabel('Contenuto JSON').fill(JSON.stringify(legacy));
  await page.getByRole('button', { name: 'Importa contenuto JSON' }).click();
  await page.getByTestId('deck-save-btn').click();
  await page.getByRole('button', { name: 'Crea copia v2' }).click();
  await expect(page.getByLabel('Civiltà', { exact: true })).toHaveValue('feudal');
  await expect(page.getByTestId('deck-notice')).toContainText('u3_cav_h');
  await expect(page.getByTestId('deck-validation')).toContainText('Mazzo valido');
  await page.getByTestId('deck-save-btn').click();
  await expect(page.getByTestId('deck-saved-select').locator('option')).toHaveCount(3);
  const migratedDownload = page.waitForEvent('download');
  await page.getByTestId('deck-export-btn').click();
  const migrated = JSON.parse(await readFile((await (await migratedDownload).path())!, 'utf8'));
  expect(migrated).toMatchObject({
    schemaVersion: 2,
    catalogVersion: '2.0',
    civilizationId: 'feudal',
  });
  expect(migrated.id).not.toBe(legacy.id);
  await page.getByTestId('deck-saved-select').selectOption(legacy.id);
  const originalDownload = page.waitForEvent('download');
  await page.getByTestId('deck-export-btn').click();
  expect(JSON.parse(await readFile((await (await originalDownload).path())!, 'utf8'))).toEqual(
    legacy,
  );
  await page.getByTestId('back-to-home-btn').click();
  await page.getByTestId('open-bot-setup-btn').click();
  await page.getByTestId('bot-player-deck-select').selectOption(`custom:${legacy.id}`);
  await expect(page.getByTestId('start-bot-match-btn')).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('stessa versione');
  await page.getByTestId('bot-opponent-deck-select').selectOption(`custom:${legacy.id}`);
  await expect(page.getByTestId('start-bot-match-btn')).toBeEnabled();
});

test('presenta i tre preset e introduce Organizzazione nel tutorial predefinito', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('open-bot-setup-btn').click();
  const selector = page.getByTestId('bot-player-deck-select');
  await expect(selector).toHaveValue('balanced-tactical-v2');
  for (const id of ['balanced-tactical-v2', 'aggro-breach-v2', 'boom-economy-v2']) {
    await selector.selectOption(id);
    await expect(page.getByTestId('start-bot-match-btn')).toBeEnabled();
  }
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  await page.getByTestId('nav-tutorial-btn').click();
  for (const cue of MATCH_EXERCISE_CUES.civilizations.slice(0, -1)) {
    await expect(page.getByTestId('tutorial-title')).toHaveText(cue.title);
    await performCue(page, cue);
  }
  await expect(page.getByTestId('tutorial-title')).toHaveText('Esercitazione completata');
});
