import { useEffect, useRef, useState, type ReactElement } from 'react';
import { AudioControls } from './audio/AudioControls.js';
import { connectGameAudio, soundEffects } from './audio/sound-effects.js';
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
import { DeckBuilderScreen } from './screens/DeckBuilderScreen.js';
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
import { useDeckBuilderStore } from './state/deck-builder-store.js';

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
  const savedDecks = useDeckBuilderStore((state) => state.savedDecks);
  const availableDecks = [
    ...PRESET_DECK_OPTIONS,
    ...savedDecks.flatMap((deck) =>
      deck.id === undefined
        ? []
        : [{
            id: `custom:${deck.id}`,
            name: `${deck.name} · Personale`,
            description: deck.description ?? 'Mazzo personale da 60 carte.',
            payload: deck,
          }],
    ),
  ];

  const view = useGameStore((s) => s.view);
  const inspectedCardId = useGameStore((s) => s.inspectedCardId);
  const setInspectedCardId = useGameStore((s) => s.setInspectedCardId);
  const setSelectedHandUid = useGameStore((s) => s.setSelectedHandUid);
  const setActiveConversionUid = useGameStore((s) => s.setActiveConversionUid);
  const setUnplayableBanner = useGameStore((s) => s.setUnplayableBanner);
  const resetStore = useGameStore((s) => s.resetStore);

  useEffect(() => {
    const disconnect = connectGameAudio(useGameStore, soundEffects);
    const unlock = (): void => {
      void soundEffects.unlock();
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    return () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      disconnect();
    };
  }, []);

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
          audioControls={<AudioControls />}
          availableDecks={availableDecks}
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
              <AudioControls />
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
          availableDecks={availableDecks}
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

  return (
    <>
      <DeckBuilderScreen
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
