import { expect, test } from '@playwright/test';
import { openHand } from './board-actions.js';

test('mano senza comandi: hover, touch, ispezione e giocata', async ({
  page,
  isMobile,
}, testInfo) => {
  await page.goto('/');
  await page.getByTestId('open-bot-setup-btn').click();
  await page.getByTestId('start-bot-match-btn').click();
  await page.getByTestId('mulligan-submit-btn').click();
  await expect(page.getByTestId('battlefield-board')).toHaveAttribute('data-phase', 'development');
  await expect(page.getByTestId('battlefield-board')).toHaveAttribute('data-is-playing', 'false');
  await page.mouse.move(0, 0);
  const hand = page.getByTestId('player-hand');
  await expect(hand).toHaveAttribute('data-expanded', 'false');
  await expect(page.getByTestId('hand-reveal-toggle')).toHaveCount(0);
  await expect(page.getByTestId('board-era-label')).toHaveText('Era I');
  await expect(page.getByTestId('self-resource-food')).toHaveAccessibleName(/Cibo:/);
  await expect(page.getByTestId('self-resource-food')).not.toContainText('Cibo');
  await expect(page.getByTestId('self-walls')).not.toContainText('Mura');
  await expect(page.getByTestId('opponent-counts')).toHaveCount(0);
  await expect(page.getByTestId('self-city-zone')).not.toContainText('Trascina');
  await page.screenshot({ path: testInfo.outputPath('redesign-collapsed.png') });
  // The visible strip of cards itself opens the hand on both input surfaces.
  const box = (await hand.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = Math.min(box.y + 55, page.viewportSize()!.height - 15);
  if (isMobile) await page.touchscreen.tap(x, y);
  else await page.mouse.move(x, y);
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
  await openHand(page);
  if (isMobile) {
    await card.tap();
    await page.getByTestId('hand-preview-play-btn').tap();
  } else {
    await card.dblclick();
  }
  await expect(page.getByTestId(`hand-slot-${uid}`)).toHaveCount(0);
  await expect(hand).toHaveAttribute('data-expanded', 'false');
  await page.screenshot({ path: testInfo.outputPath('redesign-played.png') });
});
