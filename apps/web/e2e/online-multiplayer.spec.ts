// TECH-SPEC §10.1 Livello H, §12 M5 — Test E2E Playwright multiplayer online:
// - Avvio server Fastify autoritativo
// - 2 BrowserContext isolati (Giocatore 1 e Giocatore 2) abbinati tramite stanza privata
// - Simulazione disconnessione/riconnessione con game.resync durante la partita
// - Completamento partita fino a finished su entrambi i client
// - Caricamento e verifica del replay deterministico nel Visualizzatore Replay (P1, P2, Pubblico)

import type { AddressInfo } from 'node:net';
import { expect, test, type Page } from '@playwright/test';
import {
  createEpochsServer,
  type EpochsServerInstance,
} from '../../server/src/server.js';
import type { RemoteGameController } from '../src/controllers/remote-controller.js';

declare global {
  interface Window {
    __epochsRemoteController?: RemoteGameController;
  }
}

async function uncheckConfirmPassIfPresent(page: Page): Promise<void> {
  const toggle = page.getByTestId('confirm-pass-toggle');
  if ((await toggle.count()) > 0 && (await toggle.isVisible())) {
    if (await toggle.isChecked()) {
      await toggle.uncheck();
    }
  }
}

async function passTurnIfActive(page: Page): Promise<boolean> {
  const passBtn = page.getByTestId('pass-turn-btn');
  if ((await passBtn.count()) > 0 && (await passBtn.isEnabled())) {
    await passBtn.click();
    const confirmDialog = page.getByTestId('pass-confirm-dialog');
    if ((await confirmDialog.count()) > 0 && (await confirmDialog.isVisible())) {
      await page.getByTestId('confirm-pass-btn').click();
    }
    return true;
  }
  return false;
}

test.describe('The Epochs — Multiplayer Online E2E (2 BrowserContext, Riconnessione resync e Replay)', () => {
  let server: EpochsServerInstance;
  let wsUrl: string;
  let httpBaseUrl: string;

  test.beforeEach(async () => {
    server = await createEpochsServer({
      databasePath: ':memory:',
      enableTimers: false,
      seedGenerator: () => 'e2e-online-multiplayer-seed-2026',
      allowedOrigins: ['*'],
      logger: false,
    });
    await server.start(0, '127.0.0.1');
    const addr = server.app.server.address() as AddressInfo;
    wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
    httpBaseUrl = `http://127.0.0.1:${addr.port}`;
  });

  test.afterEach(async () => {
    await server.close();
  });

  test('abbina 2 BrowserContext in stanza privata, gestisce disconnessione + game.resync, completa la partita e verifica il Replay', async ({
    browser,
    viewport,
  }) => {
    const context1 = await browser.newContext({
      viewport: viewport ?? { width: 1280, height: 800 },
    });
    const context2 = await browser.newContext({
      viewport: viewport ?? { width: 1280, height: 800 },
    });

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // 1. Entrambi i giocatori aprono la Home e navigano alla Lobby Multiplayer Online
      await Promise.all([page1.goto('/'), page2.goto('/')]);
      await expect(page1.getByTestId('home-screen')).toBeVisible();
      await expect(page2.getByTestId('home-screen')).toBeVisible();

      await page1.getByTestId('nav-online-lobby-btn').click();
      await page2.getByTestId('nav-online-lobby-btn').click();

      await expect(page1.getByTestId('online-lobby-screen')).toBeVisible();
      await expect(page2.getByTestId('online-lobby-screen')).toBeVisible();

      // 2. Connessione di entrambi i client al server Fastify di test
      await page1.getByTestId('online-ws-url-input').fill(wsUrl);
      await page1.getByTestId('online-connect-btn').click();

      await page2.getByTestId('online-ws-url-input').fill(wsUrl);
      await page2.getByTestId('online-connect-btn').click();

      await expect(page1.getByTestId('online-connection-status')).toHaveAttribute(
        'data-status',
        'authenticated',
      );
      await expect(page2.getByTestId('online-connection-status')).toHaveAttribute(
        'data-status',
        'authenticated',
      );

      // 3. Giocatore 1 crea una stanza privata e Giocatore 2 entra con il codice stanza
      await page1.getByTestId('online-create-room-btn').click();
      const roomCodeEl = page1.getByTestId('online-created-room-code');
      await expect(roomCodeEl).toBeVisible();
      const roomCode = ((await roomCodeEl.textContent()) ?? '').trim();
      expect(roomCode.length).toBeGreaterThanOrEqual(4);

      await page2.getByTestId('online-join-room-code-input').fill(roomCode);
      await page2.getByTestId('online-join-room-btn').click();

      // 4. Entrambi i client entrano sul Tavolo di Partita in fase di Mulligan
      const board1 = page1.getByTestId('battlefield-board');
      const board2 = page2.getByTestId('battlefield-board');
      await expect(board1).toBeVisible();
      await expect(board2).toBeVisible();

      await expect(page1.getByTestId('mulligan-modal')).toBeVisible();
      await expect(page2.getByTestId('mulligan-modal')).toBeVisible();

      // P1 cambia 1 carta, P2 mantiene la mano iniziale
      await page1
        .getByTestId('mulligan-modal')
        .locator('[data-testid^="mulligan-toggle-btn-"]')
        .first()
        .click();
      await page1.getByTestId('mulligan-submit-btn').click();
      await expect(
        page1.getByTestId('mulligan-waiting-opponent'),
      ).toBeVisible();
      await page2.getByTestId('mulligan-submit-btn').click();

      await expect(board1).toHaveAttribute('data-phase', 'development');
      await expect(board2).toHaveAttribute('data-phase', 'development');

      await uncheckConfirmPassIfPresent(page1);
      await uncheckConfirmPassIfPresent(page2);

      // 5. Simulazione disconnessione di P2 durante la partita, mossa dell'avversario e riconnessione con game.resync
      await page2.evaluate(() => {
        window.__epochsRemoteController?.disconnectSocketForTest();
      });

      // Se tocca a P1 mentre P2 è disconnesso, P1 gioca una carta (avanzando stateVersion sul server)
      const p1PlayableSlot = page1
        .locator('[data-testid^="hand-slot-"][data-playable="true"]')
        .first();
      if (
        (await page1.getByTestId('pass-turn-btn').isEnabled()) &&
        (await p1PlayableSlot.count()) > 0
      ) {
        await p1PlayableSlot.click();
        const playBtn1 = page1.getByTestId('play-selected-card-btn');
        if (await playBtn1.isEnabled()) {
          await playBtn1.click();
        }
      }

      // P2 si riconnette ed esegue game.resync riallineando lo snapshot autoritativo
      await page2.evaluate(async () => {
        await window.__epochsRemoteController?.reconnectWithResync();
      });

      const syncedVersions = await Promise.all([
        page1.evaluate(
          () => window.__epochsRemoteController?.getSnapshot().stateVersion ?? -1,
        ),
        page2.evaluate(
          () => window.__epochsRemoteController?.getSnapshot().stateVersion ?? -1,
        ),
      ]);
      expect(syncedVersions[0]).toBeGreaterThanOrEqual(2);
      expect(syncedVersions[1]).toBe(syncedVersions[0]);

      // 6. Avanzamento deterministico della partita su entrambi i client fino a `finished`
      for (let step = 0; step < 80; step += 1) {
        const phase1 = await board1.getAttribute('data-phase');
        const phase2 = await board2.getAttribute('data-phase');

        if (phase1 === 'finished' && phase2 === 'finished') {
          break;
        }

        // Gestione eventuale finestra hand_limit su P1 o P2
        for (const p of [page1, page2]) {
          const hlModal = p.getByTestId('hand-limit-modal');
          if ((await hlModal.count()) > 0 && (await hlModal.isVisible())) {
            await p.getByTestId('hand-limit-suggest-fifo-btn').click();
            await p.getByTestId('hand-limit-submit-btn').click();
          }
        }

        // Gestione fase development: il giocatore attivo dichiara Passo
        if (phase1 === 'development' || phase2 === 'development') {
          const acted1 = await passTurnIfActive(page1);
          if (!acted1) {
            await passTurnIfActive(page2);
          }
        }

        // Gestione finestra simultanea prebattle su P1 e P2
        for (const p of [page1, page2]) {
          const lockBtn = p.getByTestId('lock-instants-btn');
          if (
            (await lockBtn.count()) > 0 &&
            (await lockBtn.isVisible()) &&
            (await lockBtn.isEnabled())
          ) {
            await lockBtn.click();
          }
        }

        await page1.waitForTimeout(40);
      }

      await expect(board1).toHaveAttribute('data-phase', 'finished');
      await expect(board2).toHaveAttribute('data-phase', 'finished');
      await expect(page1.getByTestId('game-over-modal')).toBeVisible();
      await expect(page2.getByTestId('game-over-modal')).toBeVisible();

      const finishedGameId = await page1.evaluate(
        () => window.__epochsRemoteController?.getGameId() ?? '',
      );
      expect(finishedGameId).toMatch(/^game_/);

      // 7. Apertura del Visualizzatore Replay e verifica dei controlli e dei punti di vista (P1, P2, Pubblico)
      await page1.getByTestId('game-over-inspect-board-btn').click();

      const isMobile = (viewport?.width ?? 1280) < 1100;
      if (isMobile) {
        await page1.getByTestId('mobile-drawer-toggle').click();
      }

      await page1.getByTestId('match-open-replay-btn').click();

      const replayScreen = page1.getByTestId('replay-viewer-screen');
      await expect(replayScreen).toBeVisible();

      // Verifica che il replay sia stato caricato dal server con lo stesso gameId
      await expect(page1.getByTestId('replay-game-id-input')).toHaveValue(
        finishedGameId,
      );
      await expect(page1.getByTestId('replay-server-url-input')).toHaveValue(
        httpBaseUrl,
      );
      await expect(page1.getByTestId('replay-controls-bar')).toBeVisible();
      await expect(page1.getByTestId('replay-step-indicator')).toContainText(
        'Passo 0 /',
      );

      // Nella prospettiva P1 al Passo 0 sono visibili le 8 carte iniziali di P1
      await expect(page1.getByTestId('replay-self-panel')).toContainText(
        'Mano visibile: 8',
      );

      // Controllo "Passo Avanti"
      await page1.getByTestId('replay-step-forward-btn').click();
      await expect(page1.getByTestId('replay-step-indicator')).toContainText(
        'Passo 1 /',
      );
      await expect(page1.getByTestId('replay-step-hash-badge')).toBeVisible();

      // Controllo "Play" / "Pausa"
      const playPauseBtn = page1.getByTestId('replay-play-pause-btn');
      await playPauseBtn.click();
      await page1.waitForTimeout(150);
      await playPauseBtn.click();

      // Cambio punto di vista a "P2" e poi a "Pubblico" (dove le mani segrete sono oscurate: 0 carte visibili)
      await page1.getByTestId('replay-perspective-P2').click();
      await expect(page1.getByTestId('replay-self-panel')).toContainText(
        'Prospettiva: P2',
      );

      await page1.getByTestId('replay-perspective-public').click();
      await expect(page1.getByTestId('replay-self-panel')).toContainText(
        'Prospettiva: public',
      );
      await expect(page1.getByTestId('replay-self-panel')).toContainText(
        'Mano visibile: 0',
      );
    } finally {
      await context1.close();
      await context2.close();
    }
  });
});
