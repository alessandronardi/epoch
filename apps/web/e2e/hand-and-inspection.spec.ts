import { expect, test } from '@playwright/test';

test('solleva la mano, mostra gli effetti senza modale e gioca una carta', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  await page.getByTestId('open-bot-setup-btn').click();
  await page.getByTestId('start-bot-match-btn').click();
  await page.getByTestId('mulligan-submit-btn').click();
  await expect(page.getByTestId('battlefield-board')).toHaveAttribute('data-phase', 'development');
  await page.mouse.move(0, 0);
  const hand = page.getByTestId('player-hand');
  await expect(hand).toHaveAttribute('data-expanded', 'false');
  const reveal = page.getByTestId('hand-reveal-toggle');
  if (isMobile) await reveal.tap();
  else await reveal.hover();
  await expect(hand).toHaveAttribute('data-expanded', 'true');
  const slot = hand.locator('[data-hand-uid][data-playable="true"]').first();
  const card = slot.locator('article');
  const uid = await slot.getAttribute('data-hand-uid');
  if (isMobile) await card.press('i');
  else await card.hover();
  await expect(page.getByTestId('board-card-preview')).toBeVisible({ timeout: 2500 });
  await expect(page.getByTestId('card-inspect-modal')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('board-card-preview')).toHaveCount(0);
  if (isMobile) {
    await reveal.tap();
    await card.tap();
    await page.getByTestId('hand-preview-play-btn').tap();
  } else {
    await reveal.hover();
    await card.dblclick();
  }
  await expect(page.getByTestId(`hand-slot-${uid}`)).toHaveCount(0);
  await expect(hand).toHaveAttribute('data-expanded', 'false');
});
