import { useState, type ReactElement, type ReactNode } from 'react';
import type { PlayerView } from '@epochs/engine';
import type { GameController } from '../../controllers/types.js';
import { useGameStore } from '../../state/game-store.js';
import { ConversionModal } from '../modals/ConversionModal.js';
import {
  HotSeatAndGameOverModal,
  HotSeatHandoverModal,
} from '../modals/HotSeatAndGameOverModal.js';
import { MulliganAndDiscardModals } from '../modals/MulliganAndDiscardModals.js';
import {
  ActionControls,
  DevelopmentPlayDndProvider,
  triggerPlayHandCardByUid,
} from './ActionControls.js';
import { BattlefieldBoard } from './BattlefieldBoard.js';
import { PlayerHand } from './PlayerHand.js';
import { PrebattleInstantsBar } from './PrebattleInstantsBar.js';

/** Un'unica composizione dei controlli, in partita libera e nell'esercitazione. */
export function MatchTable({
  view,
  controller,
  sidebar,
  suggestedCardIds,
  onRematch,
  onReturnHome,
  onCancelPass,
  onCancelConversion,
}: {
  readonly view: PlayerView | null;
  readonly controller: GameController | null;
  readonly sidebar: ReactNode;
  readonly suggestedCardIds?: readonly string[] | undefined;
  readonly onRematch: () => void;
  readonly onReturnHome: () => void;
  readonly onCancelPass?: (() => void) | undefined;
  readonly onCancelConversion?: ((cardId: string) => void) | undefined;
}): ReactElement {
  const [isDropzoneOver, setIsDropzoneOver] = useState(false);
  const conversionUid = useGameStore((state) => state.activeConversionUid);
  const handover = useGameStore((state) => state.awaitingHotSeatHandover);
  const busy = useGameStore((state) => state.isPlaying);
  const inspect = (cardId: string): void => useGameStore.getState().setInspectedCardId(cardId);
  const play = (cardUid: string): void => {
    const state = useGameStore.getState();
    if (state.isPlaying) return;
    triggerPlayHandCardByUid(cardUid, {
      view: state.view,
      controller,
      setSelectedHandUid: state.setSelectedHandUid,
      setActiveConversionUid: state.setActiveConversionUid,
      setUnplayableBanner: state.setUnplayableBanner,
    });
  };
  if (handover) return <HotSeatHandoverModal controller={controller} />;
  return (
    <DevelopmentPlayDndProvider
      view={view}
      controller={controller}
      onDropzoneOverChange={setIsDropzoneOver}
    >
      <BattlefieldBoard
        view={view}
        isDroppableOverSelfCity={isDropzoneOver}
        onInspectCard={inspect}
        handSlot={
          view?.phase === 'prebattle' ? (
            <PrebattleInstantsBar view={view} controller={controller} onInspectCard={inspect} />
          ) : (
            <PlayerHand
              view={view}
              enableDrag={!busy}
              suggestedCardIds={suggestedCardIds}
              onPlayCard={play}
              onInspectCard={inspect}
            />
          )
        }
        actionControlsSlot={
          view?.phase === 'prebattle' ? undefined : (
            <ActionControls
              view={view}
              controller={controller}
              onInspectCard={inspect}
              onCancelPass={onCancelPass}
            />
          )
        }
        sidebarSlot={sidebar}
        overlaySlot={
          <>
            {!busy && (
              <MulliganAndDiscardModals
                view={view}
                controller={controller}
                onInspectCard={inspect}
              />
            )}
            {!busy && (
              <ConversionModal
                view={view}
                controller={controller}
                onInspectCard={inspect}
                onClose={() => {
                  const card = view?.self.hand.find((item) => item.uid === conversionUid);
                  if (card) onCancelConversion?.(card.cardId);
                }}
              />
            )}
            {!busy && (
              <HotSeatAndGameOverModal
                view={view}
                controller={controller}
                onRematch={onRematch}
                onReturnHome={onReturnHome}
              />
            )}
          </>
        }
      />
    </DevelopmentPlayDndProvider>
  );
}
