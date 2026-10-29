import { expect, test, type Page } from '@playwright/test';

// Il service worker è generato soltanto dalla build di produzione.
test.use({ baseURL: 'http://127.0.0.1:4173', serviceWorkers: 'allow' });

async function completeOfflineMatch(page: Page, hotSeat: boolean): Promise<void> {
  const board = page.getByTestId('battlefield-board');
  const eras = new Set<string>();
  const played = new Set<string>();
  const handovers = new Set<string>();
  let viewer = 'P1';

  for (let action = 0; action < 120; action += 1) {
    const era = (await board.getAttribute('data-era'))!;
    const phase = await board.getAttribute('data-phase');
    eras.add(era);
    if (phase === 'finished') break;

    if (await page.getByTestId('hotseat-handover-modal').isVisible()) {
      viewer = (await page.getByTestId('hotseat-handover-modal').getAttribute('data-next-player'))!;
      handovers.add(viewer);
      await expect(page.getByTestId('mulligan-modal')).toHaveCount(0);
      await expect(page.getByTestId('hand-limit-modal')).toHaveCount(0);
      await page.getByTestId('hotseat-reveal-hand-btn').click();
      continue;
    }
    if (phase === 'mulligan') {
      await page.getByTestId('mulligan-submit-btn').click();
      continue;
    }
    if (phase === 'hand_limit') {
      await page.getByTestId('hand-limit-suggest-fifo-btn').click();
      await page.getByTestId('hand-limit-submit-btn').click();
      continue;
    }
    if (phase === 'development') {
      await page.getByTestId('confirm-pass-toggle').uncheck();
      const seatAndEra = `${viewer}:${era}`;
      const playable = page
        .locator(
          '[data-testid^="hand-slot-"][data-playable="true"]' +
            ':not([data-hand-card-id="e3_gld"]):not([data-hand-card-id="e3_frn"])',
        )
        .first();
      // Una giocata per giocatore ed Era, poi Passo: si attraversano tutte le tre Ere.
      if (!played.has(seatAndEra) && (await playable.count()) > 0) {
        if (await page.getByTestId('player-hand').getAttribute('data-expanded') !== 'true') await page.getByTestId('hand-reveal-toggle').click();
        const uid = (await playable.getAttribute('data-hand-uid'))!;
        await playable.click();
        await page.getByTestId('hand-preview-play-btn').click();
        await expect(page.getByTestId(`hand-slot-${uid}`)).toHaveCount(0);
        played.add(seatAndEra);
      } else {
        await page.getByTestId('pass-turn-btn').click();
      }
      continue;
    }
    expect(phase).toBe('prebattle');
    await page.getByTestId('lock-instants-btn').click();
  }

  await expect(board).toHaveAttribute('data-phase', 'finished');
  expect([...eras]).toEqual(['1', '2', '3']);
  expect([...played].some((key) => key.startsWith('P1:'))).toBe(true);
  if (hotSeat) {
    expect([...played].some((key) => key.startsWith('P2:'))).toBe(true);
    expect([...handovers].sort()).toEqual(['P1', 'P2']);
  }
  const result = page.getByTestId('game-over-modal');
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute('data-result-kind', /^(points|draw|annihilation)$/);
}

for (const mode of ['GreedyBot', 'Hot-Seat'] as const) {
  test(`PWA: riavvio e partita completa ${mode} senza rete`, async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await expect(page.getByTestId('home-screen')).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration?.active?.state === 'activated';
    });
    // La prima pagina può non essere ancora controllata dal worker appena installato.
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    await context.setOffline(true);
    // Distrugge il documento e la memoria dell'app prima della riapertura offline.
    await page.goto('about:blank');
    const errors: string[] = [];
    const failedRequests: string[] = [];
    const assets: { type: string; url: string; cached: boolean }[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('requestfailed', (request) => failedRequests.push(request.url()));
    page.on('response', (response) => {
      const type = response.request().resourceType();
      if (['stylesheet', 'script', 'font', 'image'].includes(type)) {
        assets.push({ type, url: response.url(), cached: response.fromServiceWorker() });
      }
    });
    const response = await page.goto('/');
    expect(response?.fromServiceWorker()).toBe(true);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await expect(page.getByTestId('home-screen')).toBeVisible();
    await page.getByTestId('open-match-settings-btn').click();
    await page.getByTestId('home-seed-input').fill('e2e-pwa-offline-three-eras');
    await page.getByRole('button', { name: 'Chiudi finestra' }).click();
    const hotSeat = mode === 'Hot-Seat';
    await page.getByTestId(hotSeat ? 'open-hotseat-setup-btn' : 'open-bot-setup-btn').click();
    if (!hotSeat) await page.getByTestId('select-bot-greedy').click();
    await page.getByTestId(hotSeat ? 'start-hotseat-match-btn' : 'start-bot-match-btn').click();
    await expect(page.getByTestId('mulligan-modal')).toBeVisible();

    // Le illustrazioni non sono state visitate prima del distacco dalla rete:
    // devono provenire dal precache, con immagini decodificate correttamente.
    await expect
      .poll(() =>
        page
          .getByTestId('mulligan-modal')
          .locator('img')
          .evaluateAll(
            (images) =>
              images.length > 0 &&
              images.every(
                (image) =>
                  image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
              ),
          ),
      )
      .toBe(true);

    await completeOfflineMatch(page, hotSeat);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    for (const type of ['stylesheet', 'script', 'font', 'image']) {
      expect(
        assets.some((asset) => asset.type === type),
        `Asset ${type} caricati offline`,
      ).toBe(true);
    }
    expect(assets.filter((asset) => !asset.cached)).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath('offline-finished.png') });
    await page.getByTestId('game-over-home-btn').click();
    await expect(page.getByTestId('home-screen')).toBeVisible();
  });
}
