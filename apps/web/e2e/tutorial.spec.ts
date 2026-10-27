import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('tutorial completo dalla Home, accessibile su desktop e mobile, con riavvio e uscita', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByTestId('nav-tutorial-btn').click();
  const tutorial = page.getByTestId('screen-tutorial');
  await expect(tutorial).toBeVisible();
  await expect(page.getByTestId('tutorial-title')).toHaveText('Scegli la tua mano iniziale');
  await page.getByRole('button', { name: 'Cacciatore', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
  ).toEqual([]);
  expect(await tutorial.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  expect(
    await page
      .locator('.battlefield-board__main')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.getByRole('button', { name: 'Mostra sul tavolo: La tua mano' }).click();
  await expect(page.locator('[data-tutorial-focus="true"]')).toBeInViewport();
  await page.getByTestId('mobile-drawer-toggle').click();
  await expect(page.getByTestId('battle-log-region')).toBeVisible();
  await page.getByTestId('mobile-drawer-close').click();
  await tutorial.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: testInfo.outputPath('tutorial-intro.png') });

  // Cambio reale di stato, riavvio, poi percorso completo mediante l'interfaccia.
  await page.getByTestId('tutorial-next').click();
  await page.getByRole('button', { name: 'Ricomincia', exact: true }).click();
  await expect(page.getByTestId('battlefield-board')).toHaveAttribute('data-phase', 'mulligan');
  const lessons = new Set<string>();
  for (let action = 0; action < 35; action += 1) {
    lessons.add((await page.getByTestId('tutorial-guide').getAttribute('data-lesson'))!);
    const skip = page.getByTestId('tutorial-skip-playback');
    if (await skip.isVisible()) await skip.click();
    const next = page.getByTestId('tutorial-next');
    await expect(next).toBeEnabled();
    if ((await page.getByTestId('tutorial-title').textContent()) === 'Tutorial completato') break;
    await next.click();
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  expect([...lessons]).toEqual(['1', '2', '3', '4', '5', '6']);
  await expect(page.getByTestId('tutorial-title')).toHaveText('Tutorial completato');
  await expect(page.getByTestId('battlefield-board')).toHaveAttribute('data-phase', 'finished');
  await expect(page.getByTestId('opponent-city-hp')).toContainText('14/22');
  await tutorial.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: testInfo.outputPath('tutorial-completed.png') });
  await page.getByTestId('tutorial-next').click();
  await expect(page.getByTestId('nav-tutorial-btn')).toBeVisible();
  await page.getByTestId('nav-tutorial-btn').click();
  await expect(page.getByTestId('tutorial-title')).toHaveText('Scegli la tua mano iniziale');
  await page.getByRole('button', { name: 'Esci dal tutorial' }).click();
  await expect(tutorial).toHaveCount(0);
});
