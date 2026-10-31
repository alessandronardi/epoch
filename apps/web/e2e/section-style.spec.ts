import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('sezioni esterne: contrasto, navigazione e leggibilità su ogni formato', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const capture = async (name: string): Promise<void> => {
    await page.evaluate(() => document.fonts.ready);
    const result = await new AxeBuilder({ page }).analyze();
    expect(
      result.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
      name,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      name,
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  };
  await page.goto('/');
  await capture('home');
  await page.getByTestId('open-bot-setup-btn').click();
  await capture('setup');
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  for (const [button, screen, name] of [
    ['nav-card-archive-btn', 'screen-archive', 'archive'],
    ['nav-deck-builder-btn', 'screen-deck-builder', 'builder'],
    ['nav-full-rules-btn', 'screen-rules', 'rules'],
    ['nav-online-lobby-btn', 'online-lobby-screen', 'online'],
  ]) {
    await page.getByTestId(button!).click();
    await expect(page.getByTestId(screen!)).toBeVisible();
    await capture(name!);
    if (name === 'online') {
      await page.getByTestId('open-replay-viewer-btn').click();
      await expect(page.getByTestId('replay-viewer-screen')).toBeVisible();
      await capture('replay');
    }
    await page.goto('/');
  }
  await page.getByTestId('nav-tutorial-btn').click();
  await expect(page.getByTestId('mulligan-modal')).toBeVisible();
  await page
    .getByTestId('mulligan-modal')
    .getByRole('button', { name: 'Esercitazioni', exact: true })
    .click();
  await expect(page.getByTestId('tutorial-hub')).toBeVisible();
  await capture('tutorial');
});
