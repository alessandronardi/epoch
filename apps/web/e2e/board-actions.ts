import { expect, type Page } from '@playwright/test';

/** Open via the supported keyboard path, without a separate reveal control. */
export async function openHand(page: Page): Promise<void> {
  const hand = page.getByTestId('player-hand');
  if ((await hand.getAttribute('data-expanded')) === 'true') return;
  await hand.focus();
  await hand.locator('[data-hand-uid] article').first().focus();
  await expect(hand).toHaveAttribute('data-expanded', 'true');
}

export async function closeHand(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  const hand = page.getByTestId('player-hand');
  if (await hand.count()) {
    await hand.press('Escape');
    await expect(hand).toHaveAttribute('data-expanded', 'false');
  }
}

export async function disablePassConfirmation(page: Page): Promise<void> {
  await closeHand(page);
  await page.getByTestId('mobile-drawer-toggle').click();
  await page.getByTestId('confirm-pass-toggle').uncheck();
  await page.getByTestId('mobile-drawer-close').click();
}
