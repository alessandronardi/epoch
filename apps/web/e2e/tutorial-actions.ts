import { openHand, closeHand } from './board-actions.js';
import { expect, type Page, type Locator } from '@playwright/test';
import type { TutorialCue } from '../src/tutorial/tutorial-scenario.js';

export async function performCue(page: Page, cue: TutorialCue): Promise<void> {
  const action = cue.action;
  const activateCard = (card: Locator): Promise<void> =>
    (page.viewportSize()?.width ?? 1280) < 1100 ? card.tap() : card.click();
  const handCard = (id: string) =>
    page.locator(`.player-hand__slot[data-hand-card-id="${id}"]`).first().getByTestId(`card-${id}`);
  if (
    ['deselect', 'unplayable', 'play', 'conversion', 'cancel-conversion'].includes(action.kind) &&
    (await page.getByTestId('player-hand').getAttribute('data-expanded')) !== 'true'
  )
    await openHand(page);
  switch (action.kind) {
    case 'inspect':
      await page.getByTestId('mulligan-modal').getByTestId(`card-${action.cardId}`).press('i');
      await expect(page.getByTestId('card-inspect-modal')).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(
        page.getByTestId('mulligan-modal').getByTestId(`card-${action.cardId}`),
      ).toBeFocused();
      break;
    case 'mulligan': {
      const slot = page
        .getByTestId('mulligan-modal')
        .locator('[data-testid^="mulligan-card-slot-"]')
        .filter({ has: page.getByTestId(`card-${action.cardId}`) });
      await slot.locator('button').click();
      await page.getByTestId('mulligan-submit-btn').click();
      break;
    }
    case 'keep':
      await page.getByTestId('mulligan-submit-btn').click();
      break;
    case 'deselect':
      await activateCard(handCard(action.cardId));
      await handCard(action.cardId).press('Escape');
      break;
    case 'unplayable':
      await activateCard(handCard(action.cardId));
      break;
    case 'play':
    case 'conversion':
    case 'cancel-conversion':
      await activateCard(handCard(action.cardId));
      await page.getByTestId('hand-preview-play-btn').click();
      if (action.kind === 'cancel-conversion') {
        await expect(
          page.getByTestId('conversion-modal').getByTestId('tutorial-modal-guidance'),
        ).toBeVisible();
        await page.getByTestId('cancel-conversion-btn').click();
      }
      if (action.kind === 'conversion') {
        const slot = page
          .getByTestId('conversion-modal')
          .locator('[data-testid^="conversion-building-slot-"]')
          .filter({ has: page.getByTestId(`card-${action.sacrificeId}`) });
        await slot.locator('button').click();
        await page.getByTestId('confirm-conversion-btn').click();
      }
      break;
    case 'cancel-pass':
    case 'pass':
      await closeHand(page);
      await page
        .getByTestId('pass-turn-btn')
        .evaluate((button) => button.scrollIntoView({ block: 'center' }));
      await page.getByTestId('pass-turn-btn').click();
      await page
        .getByTestId(action.kind === 'pass' ? 'confirm-pass-btn' : 'cancel-pass-btn')
        .click();
      break;
    case 'instants':
      for (const id of action.cardIds) {
        const slot = page
          .locator('[data-testid^="prebattle-instant-slot-"]')
          .filter({ has: page.getByTestId(`card-${id}`) });
        await slot.locator('button').click();
      }
      await page.getByTestId('lock-instants-btn').click();
      if (cue.era === 1 && action.cardIds.length > 0) {
        await page.getByTestId('mobile-drawer-toggle').click();
        if (
          (await page.getByTestId('battle-playback-bar').getAttribute('data-is-paused')) === 'true'
        )
          await page.getByTestId('playback-pause-btn').click();
        await page.getByTestId('playback-pause-btn').click();
        await expect(page.getByTestId('battle-playback-bar')).toHaveAttribute(
          'data-is-paused',
          'true',
        );
        await expect(page.getByTestId('tutorial-title')).toHaveText(cue.title);
        await page.getByTestId('playback-speed-2x').click();
        await expect(page.getByTestId('battle-playback-bar')).toHaveAttribute('data-speed', '2');
        await page.getByTestId('playback-pause-btn').click();
        await page.getByTestId('mobile-drawer-close').click();
      }
      break;
    case 'log':
      await page.getByTestId('mobile-drawer-toggle').click();
      await expect(page.getByTestId('battle-log-region')).toBeVisible();
      await page.getByTestId('mobile-drawer-close').click();
      break;
    case 'discard':
      await expect(page.getByTestId('hand-limit-submit-btn')).toBeDisabled();
      await page.getByTestId('hand-limit-suggest-fifo-btn').click();
      await expect(page.getByTestId('hand-limit-submit-btn')).toBeEnabled();
      await page.getByTestId('hand-limit-submit-btn').click();
      break;
    case 'concede':
      await page.getByTestId('mobile-drawer-toggle').click();
      await page.getByTestId('match-concede-btn').click();
      break;
    case 'handover':
      await expect(page.getByTestId('player-hand')).toHaveCount(0);
      await page.getByTestId('hotseat-reveal-hand-btn').click();
      break;
    case 'timeout':
      await expect(page.getByTestId('tutorial-title')).not.toHaveText(cue.title);
      break;
    case 'instant-budget': {
      const slots = page
        .locator('[data-testid^="prebattle-instant-slot-"]')
        .filter({ has: page.getByTestId('card-i1_wall') });
      await slots.nth(0).locator('button').click();
      await slots.nth(1).locator('button').click();
      await expect(slots.nth(2).locator('button')).toBeDisabled();
      await page.getByTestId('prebattle-clear-instants-btn').click();
      break;
    }
    case 'read':
      await page.getByTestId('tutorial-next').click();
      break;
  }
  const skip = page.getByTestId('tutorial-skip-playback');
  if (await skip.isVisible()) {
    try {
      await skip.click({ timeout: 1_000 });
    } catch {
      // Una coda breve può terminare fra il controllo e il clic.
      await expect(page.getByTestId('tutorial-title')).not.toHaveText(cue.title);
    }
  }
}
