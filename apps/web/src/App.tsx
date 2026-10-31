import {
  DEFAULT_PLAYER_DECK_ID,
  DEFAULT_OPPONENT_DECK_ID,
  presetOption,
} from './content/presets.js';
import { ConcedeButton } from './components/board/ConcedeButton.js';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { AudioControls } from './audio/AudioControls.js';
import { connectGameAudio, soundEffects } from './audio/sound-effects.js';
import { BattlePlaybackAndLog } from './components/board/BattlePlaybackAndLog.js';
import { MatchTable } from './components/board/MatchTable.js';
import { CardInspectModal } from './components/card/CardInspectModal.js';
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
import { TutorialScreen } from './screens/TutorialScreen.js';
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
  const [lastMatchSetup, setLastMatchSetup] = useState<LastMatchSetup | null>(null);
  const [replayTargetGameId, setReplayTargetGameId] = useState<string | undefined>(undefined);
  const [replayHttpBaseUrl, setReplayHttpBaseUrl] = useState<string | undefined>(undefined);
  const matchCounterRef = useRef<number>(1);
  const savedDecks = useDeckBuilderStore((state) => state.savedDecks);
  const draftVersion = useDeckBuilderStore((state) => state.draft.catalogVersion ?? '1.0');
  const [replayVersion, setReplayVersion] = useState<'1.0' | '2.0'>('1.0');
  const availableDecks = [
    ...PRESET_DECK_OPTIONS,
    ...savedDecks.flatMap((deck) =>
      deck.id === undefined
        ? []
        : [
            {
              id: `custom:${deck.id}`,
              name: `${deck.name} · Personale`,
              description: deck.description ?? 'Mazzo personale da 60 carte.',
              payload: deck,
            },
          ],
    ),
  ];

  const view = useGameStore((s) => s.presentationView ?? s.view);
  const inspectionVersion =
    activeScreen === 'archive' || activeScreen === 'rules'
      ? '2.0'
      : activeScreen === 'deck-builder'
        ? draftVersion
        : activeScreen === 'replay'
          ? replayVersion
          : (view?.catalogVersion ?? '1.0');
  const inspectedCardId = useGameStore((s) => s.inspectedCardId);
  const setInspectedCardId = useGameStore((s) => s.setInspectedCardId);
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

  const startRemoteMatch = (remoteController: RemoteGameController, gameId: string): void => {
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

  const handleOpenReplayViewer = (gameId?: string, httpBaseUrl?: string): void => {
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

    const defaultDeck = presetOption(DEFAULT_PLAYER_DECK_ID).payload;
    startBotMatch({
      botKind: 'greedy',
      playerDeck: defaultDeck,
      botDeck: presetOption(DEFAULT_OPPONENT_DECK_ID).payload,
      seed: `epochs-rematch-${suffix}`,
    });
  };

  if (activeScreen === 'home') {
    return (
      <>
        <style>{A11Y_CONTRAST_OVERRIDES_CSS}</style>
        <HomeScreen
          availableDecks={availableDecks}
          onStartBotMatch={startBotMatch}
          onStartHotSeatMatch={startHotSeatMatch}
          onNavigate={(screen) => setActiveScreen(screen)}
        />
        <CardInspectModal
          version={inspectionVersion}
          cardId={inspectedCardId}
          onClose={() => setInspectedCardId(null)}
        />
      </>
    );
  }

  if (activeScreen === 'tutorial') {
    return (
      <>
        <style>{A11Y_CONTRAST_OVERRIDES_CSS}</style>
        <TutorialScreen
          onBackHome={handleReturnHome}
          onStartFreeMatch={() => {
            const deck = presetOption(DEFAULT_PLAYER_DECK_ID).payload;
            startBotMatch({
              botKind: 'greedy',
              playerDeck: deck,
              botDeck: presetOption(DEFAULT_OPPONENT_DECK_ID).payload,
              seed: `epochs-after-tutorial-${Date.now()}`,
            });
          }}
        />
      </>
    );
  }

  if (activeScreen === 'match') {
    return (
      <>
        <style>{A11Y_CONTRAST_OVERRIDES_CSS}</style>
        <MatchTable
          view={view}
          controller={controller}
          onRematch={handleRematch}
          onReturnHome={handleReturnHome}
          sidebar={
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
                  <ConcedeButton controller={controller} />
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
              <details className="match-audio-settings">
                <summary>Impostazioni audio</summary>
                <AudioControls />
              </details>
            </div>
          }
        />
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
          version={inspectionVersion}
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
          onCatalogVersion={setReplayVersion}
          initialGameId={replayTargetGameId}
          httpBaseUrl={replayHttpBaseUrl}
          onInspectCard={(cardId) => setInspectedCardId(cardId)}
          onBack={() => setActiveScreen('online')}
        />
        <CardInspectModal
          version={inspectionVersion}
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
          version={inspectionVersion}
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
          version={inspectionVersion}
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
        version={inspectionVersion}
        cardId={inspectedCardId}
        onClose={() => setInspectedCardId(null)}
      />
    </>
  );
}
