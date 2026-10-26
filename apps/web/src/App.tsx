import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  ActionControls,
  DevelopmentPlayDndProvider,
  triggerPlayHandCardByUid,
} from './components/board/ActionControls.js';
import { BattlePlaybackAndLog } from './components/board/BattlePlaybackAndLog.js';
import { BattlefieldBoard } from './components/board/BattlefieldBoard.js';
import { PlayerHand } from './components/board/PlayerHand.js';
import { PrebattleInstantsBar } from './components/board/PrebattleInstantsBar.js';
import { CardInspectModal } from './components/card/CardInspectModal.js';
import { ConversionModal } from './components/modals/ConversionModal.js';
import { HotSeatAndGameOverModal } from './components/modals/HotSeatAndGameOverModal.js';
import { MulliganAndDiscardModals } from './components/modals/MulliganAndDiscardModals.js';
import { LocalGameController } from './controllers/local-controller.js';
import type { RemoteGameController } from './controllers/remote-controller.js';
import type { GameController } from './controllers/types.js';
import { CardArchiveScreen } from './screens/CardArchiveScreen.js';
import {
  HomeScreen,
  PRESET_DECK_OPTIONS,
  type AppScreenId,
  type StartBotMatchRequest,
  type StartHotSeatMatchRequest,
} from './screens/HomeScreen.js';
import { OnlineLobbyScreen } from './screens/OnlineLobbyScreen.js';
import { QuickRulesScreen } from './screens/QuickRulesScreen.js';
import { ReplayViewerScreen } from './screens/ReplayViewerScreen.js';
import { useGameStore } from './state/game-store.js';

type ExtendedScreenId = AppScreenId | 'replay';

interface LastMatchSetup {
  readonly kind: 'bot' | 'hotseat' | 'remote';
  readonly botRequest?: StartBotMatchRequest | undefined;
  readonly hotSeatRequest?: StartHotSeatMatchRequest | undefined;
  readonly remoteGameId?: string | undefined;
  readonly remoteHttpBaseUrl?: string | undefined;
}

const A11Y_CONTRAST_OVERRIDES_CSS = `
  .epochs-card--unplayable {
    opacity: 0.92 !important;
    filter: saturate(0.55);
  }
  .epochs-card--unplayable .epochs-card__flavor-text,
  .epochs-card--unplayable .epochs-card__nonunit-footer {
    color: var(--chalk, #E9E5D6) !important;
  }
  div[data-testid="opponent-city-zone"] > .board-zone__content,
  .board-zone__content:has(.board-zone__empty) {
    overflow: hidden !important;
  }
`;

export function App(): ReactElement {
  const [activeScreen, setActiveScreen] = useState<ExtendedScreenId>('home');
  const [controller, setController] = useState<GameController | null>(null);
  const [isDropzoneOver, setIsDropzoneOver] = useState(false);
  const [lastMatchSetup, setLastMatchSetup] = useState<LastMatchSetup | null>(
    null,
  );
  const [replayTargetGameId, setReplayTargetGameId] = useState<
    string | undefined
  >(undefined);
  const [replayHttpBaseUrl, setReplayHttpBaseUrl] = useState<
    string | undefined
  >(undefined);
  const matchCounterRef = useRef<number>(1);

  const view = useGameStore((s) => s.view);
  const inspectedCardId = useGameStore((s) => s.inspectedCardId);
  const setInspectedCardId = useGameStore((s) => s.setInspectedCardId);
  const setSelectedHandUid = useGameStore((s) => s.setSelectedHandUid);
  const setActiveConversionUid = useGameStore((s) => s.setActiveConversionUid);
  const setUnplayableBanner = useGameStore((s) => s.setUnplayableBanner);
  const resetStore = useGameStore((s) => s.resetStore);

  useEffect(() => {
    return () => {
      controller?.dispose();
    };
  }, [controller]);

  useEffect(() => {
    const tokens = document.querySelectorAll<HTMLElement>('.epochs-card-token');
    for (const token of tokens) {
      token.removeAttribute('aria-label');
    }
  });

  const startBotMatch = (request: StartBotMatchRequest): void => {
    controller?.dispose();
    const nextController = new LocalGameController({
      mode: 'bot',
      seed: request.seed,
      botKind: request.botKind,
      decks: {
        P1: request.playerDeck,
        P2: request.botDeck,
      },
    });
    nextController.startMatch();
    setController(nextController);
    setLastMatchSetup({ kind: 'bot', botRequest: request });
    setActiveScreen('match');
  };

  const startHotSeatMatch = (request: StartHotSeatMatchRequest): void => {
    controller?.dispose();
    const nextController = new LocalGameController({
      mode: 'hotseat',
      seed: request.seed,
      decks: {
        P1: request.p1Deck,
        P2: request.p2Deck,
      },
    });
    nextController.startMatch();
    setController(nextController);
    setLastMatchSetup({ kind: 'hotseat', hotSeatRequest: request });
    setActiveScreen('match');
  };

  const startRemoteMatch = (
    remoteController: RemoteGameController,
    gameId: string,
  ): void => {
    if (controller !== null && controller !== remoteController) {
      controller.dispose();
    }
    setController(remoteController);
    setReplayTargetGameId(gameId);
    setReplayHttpBaseUrl(remoteController.getHttpBaseUrl());
    setLastMatchSetup({
      kind: 'remote',
      remoteGameId: gameId,
      remoteHttpBaseUrl: remoteController.getHttpBaseUrl(),
    });
    setActiveScreen('match');
  };

  const handleOpenReplayViewer = (
    gameId?: string,
    httpBaseUrl?: string,
  ): void => {
    if (gameId !== undefined) {
      setReplayTargetGameId(gameId);
    }
    if (httpBaseUrl !== undefined) {
      setReplayHttpBaseUrl(httpBaseUrl);
    }
    controller?.dispose();
    setController(null);
    setActiveScreen('replay');
  };

  const handleReturnHome = (): void => {
    controller?.dispose();
    setController(null);
    resetStore();
    setActiveScreen('home');
  };

  const handleRematch = (): void => {
    matchCounterRef.current += 1;
    const suffix = matchCounterRef.current;

    if (lastMatchSetup?.kind === 'remote') {
      controller?.dispose();
      setController(null);
      resetStore();
      setActiveScreen('online');
      return;
    }

    if (lastMatchSetup?.kind === 'bot' && lastMatchSetup.botRequest) {
      startBotMatch({
        ...lastMatchSetup.botRequest,
        seed: `${lastMatchSetup.botRequest.seed}-r${suffix}`,
      });
      return;
    }

    if (lastMatchSetup?.kind === 'hotseat' && lastMatchSetup.hotSeatRequest) {
      startHotSeatMatch({
        ...lastMatchSetup.hotSeatRequest,
        seed: `${lastMatchSetup.hotSeatRequest.seed}-r${suffix}`,
      });
      return;
    }

    const defaultDeck = PRESET_DECK_OPTIONS[0]!.payload;
    startBotMatch({
      botKind: 'greedy',
      playerDeck: defaultDeck,
      botDeck: PRESET_DECK_OPTIONS[1]?.payload ?? defaultDeck,
      seed: `epochs-rematch-${suffix}`,
    });
  };

  const handlePlayHandCard = (cardUid: string): void => {
    triggerPlayHandCardByUid(cardUid, {
      view,
      controller,
      setSelectedHandUid,
      setActiveConversionUid,
      setUnplayableBanner,
    });
  };

  if (activeScreen === 'home') {
    return (
      <>
        <style>{A11Y_CONTRAST_OVERRIDES_CSS}</style>
        <HomeScreen
          onStartBotMatch={startBotMatch}
          onStartHotSeatMatch={startHotSeatMatch}
          onNavigate={(screen) => setActiveScreen(screen)}
        />
        <CardInspectModal
          cardId={inspectedCardId}
          onClose={() => setInspectedCardId(null)}
        />
      </>
    );
  }

  if (activeScreen === 'match') {
    const isPrebattle = view?.phase === 'prebattle';

    return (
      <>
        <style>{A11Y_CONTRAST_OVERRIDES_CSS}</style>
        <DevelopmentPlayDndProvider
        view={view}
        controller={controller}
        onDropzoneOverChange={setIsDropzoneOver}
      >
        <BattlefieldBoard
          view={view}
          isDroppableOverSelfCity={isDropzoneOver}
          onInspectCard={(cardId) => setInspectedCardId(cardId)}
          handSlot={
            isPrebattle ? (
              <PrebattleInstantsBar
                view={view}
                controller={controller}
                onInspectCard={(cardId) => setInspectedCardId(cardId)}
              />
            ) : (
              <PlayerHand
                view={view}
                onPlayCard={handlePlayHandCard}
                onInspectCard={(cardId) => setInspectedCardId(cardId)}
              />
            )
          }
          actionControlsSlot={
            isPrebattle ? undefined : (
              <ActionControls
                view={view}
                controller={controller}
                onInspectCard={(cardId) => setInspectedCardId(cardId)}
              />
            )
          }
          sidebarSlot={
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                height: '100%',
                minHeight: 0,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '6px',
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  className="touch-target"
                  data-testid="match-return-home-btn"
                  onClick={handleReturnHome}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(233, 229, 214, 0.28)',
                    backgroundColor: 'var(--surface-card, #223444)',
                    color: 'var(--chalk, #E9E5D6)',
                    fontFamily: 'var(--font-numeric)',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Menu Home
                </button>

                {view !== null && view.phase !== 'finished' && (
                  <button
                    type="button"
                    className="touch-target"
                    data-testid="match-concede-btn"
                    onClick={() => controller?.concede()}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--crimson, #A8404D)',
                      backgroundColor: 'rgba(168, 64, 77, 0.22)',
                      color: 'var(--chalk, #E9E5D6)',
                      fontFamily: 'var(--font-numeric)',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Resa
                  </button>
                )}

                {view !== null &&
                  view.phase === 'finished' &&
                  lastMatchSetup?.kind === 'remote' && (
                    <button
                      type="button"
                      className="touch-target"
                      data-testid="match-open-replay-btn"
                      onClick={() =>
                        handleOpenReplayViewer(
                          lastMatchSetup.remoteGameId,
                          lastMatchSetup.remoteHttpBaseUrl,
                        )
                      }
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--brass, #B58E48)',
                        backgroundColor: 'rgba(181, 142, 72, 0.24)',
                        color: 'var(--chalk, #E9E5D6)',
                        fontFamily: 'var(--font-numeric)',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Apri Replay
                    </button>
                  )}
              </div>

              <div style={{ flex: 1, minHeight: 0 }}>
                <BattlePlaybackAndLog
                  view={view}
                  onInspectCard={(cardId) => setInspectedCardId(cardId)}
                />
              </div>
            </div>
          }
          overlaySlot={
            <>
              <MulliganAndDiscardModals
                view={view}
                controller={controller}
                onInspectCard={(cardId) => setInspectedCardId(cardId)}
              />
              <ConversionModal
                view={view}
                controller={controller}
                onInspectCard={(cardId) => setInspectedCardId(cardId)}
              />
              <HotSeatAndGameOverModal
                view={view}
                controller={controller}
                onRematch={handleRematch}
                onReturnHome={handleReturnHome}
              />
            </>
          }
        />
      </DevelopmentPlayDndProvider>
      </>
    );
  }

  if (activeScreen === 'online') {
    return (
      <>
        <style>{A11Y_CONTRAST_OVERRIDES_CSS}</style>
        <OnlineLobbyScreen
          onMatchReady={startRemoteMatch}
          onOpenReplayViewer={handleOpenReplayViewer}
          onBackHome={handleReturnHome}
        />
        <CardInspectModal
          cardId={inspectedCardId}
          onClose={() => setInspectedCardId(null)}
        />
      </>
    );
  }

  if (activeScreen === 'replay') {
    return (
      <>
        <style>{A11Y_CONTRAST_OVERRIDES_CSS}</style>
        <ReplayViewerScreen
          initialGameId={replayTargetGameId}
          httpBaseUrl={replayHttpBaseUrl}
          onInspectCard={(cardId) => setInspectedCardId(cardId)}
          onBack={() => setActiveScreen('online')}
        />
        <CardInspectModal
          cardId={inspectedCardId}
          onClose={() => setInspectedCardId(null)}
        />
      </>
    );
  }

  if (activeScreen === 'archive') {
    return (
      <>
        <style>{A11Y_CONTRAST_OVERRIDES_CSS}</style>
        <CardArchiveScreen
          onBackHome={handleReturnHome}
          onInspectCard={(cardId) => setInspectedCardId(cardId)}
        />
        <CardInspectModal
          cardId={inspectedCardId}
          onClose={() => setInspectedCardId(null)}
        />
      </>
    );
  }

  if (activeScreen === 'rules') {
    return (
      <>
        <style>{A11Y_CONTRAST_OVERRIDES_CSS}</style>
        <QuickRulesScreen onBackHome={handleReturnHome} />
        <CardInspectModal
          cardId={inspectedCardId}
          onClose={() => setInspectedCardId(null)}
        />
      </>
    );
  }

  // Schermate di navigazione secondarie (Deck Builder, Multiplayer Online)
  return (
    <main
      className="cartographer-table"
      data-testid={`screen-${activeScreen}`}
      style={{
        width: '100%',
        height: '100dvh',
        maxHeight: '100dvh',
        overflowY: 'auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      <div
        style={{
          width: 'min(1080px, 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '14px 18px',
            borderRadius: '10px',
            backgroundColor: 'rgba(20, 30, 39, 0.9)',
            border: '1px solid var(--brass, #B58E48)',
          }}
        >
          <h1
            className="font-display"
            style={{ margin: 0, fontSize: '1.45rem', color: 'var(--brass)' }}
          >
            {activeScreen === 'deck-builder' && 'Deck Builder (3×20 Carte)'}
          </h1>

          <button
            type="button"
            className="touch-target"
            data-testid="back-to-home-btn"
            onClick={handleReturnHome}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid var(--brass, #B58E48)',
              backgroundColor: 'var(--surface-card, #223444)',
              color: 'var(--chalk, #E9E5D6)',
              fontFamily: 'var(--font-numeric)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Torna alla Home
          </button>
        </header>

        <section
          style={{
            padding: '18px 20px',
            borderRadius: '10px',
            backgroundColor: 'rgba(20, 30, 39, 0.86)',
            border: '1px solid rgba(181, 142, 72, 0.35)',
            lineHeight: 1.5,
          }}
        >
          <p style={{ margin: 0 }}>
            Sezione pronta sul Tavolo del Cartografo. Utilizza il pulsante
            &ldquo;Torna alla Home&rdquo; per avviare una partita contro Bot o
            in modalità Locale Hot-Seat.
          </p>
        </section>
      </div>

      <CardInspectModal
        cardId={inspectedCardId}
        onClose={() => setInspectedCardId(null)}
      />
    </main>
  );
}
