import { MatchGuidance } from '../modals/MatchGuidance.js';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { getCard } from '@epochs/content';
import type { PlayerView } from '@epochs/engine';
import { useState, type ReactElement, type ReactNode } from 'react';
import type { GameController } from '../../controllers/types.js';
import { useGameStore } from '../../state/game-store.js';
import { Card } from '../card/Card.js';
import { RESOURCE_LABELS_IT } from '../icons/DomainIcons.js';
import { buildUnplayableBannerMessage, type DraggedHandCardData } from './PlayerHand.js';

export const PLAY_FIELD_DROPZONE_ID = 'epochs-play-field-dropzone';
export const ACTION_CONTROLS_DROPZONE_ID = 'epochs-action-controls-dropzone';

export function extractDraggedHandCardData(
  event: DragStartEvent | DragOverEvent | DragEndEvent,
): DraggedHandCardData | null {
  const raw = event.active.data.current as Partial<DraggedHandCardData> | undefined;
  if (
    raw !== undefined &&
    typeof raw.uid === 'string' &&
    typeof raw.cardId === 'string' &&
    typeof raw.cardType === 'string' &&
    typeof raw.playable === 'boolean'
  ) {
    return {
      uid: raw.uid,
      cardId: raw.cardId,
      cardType: raw.cardType,
      playable: raw.playable,
      unplayableReason: raw.unplayableReason,
    };
  }
  return null;
}

export interface ActionControlsProps {
  readonly view?: PlayerView | null | undefined;
  readonly controller?: GameController | null | undefined;
  readonly selectedHandUid?: string | null | undefined;
  readonly confirmPassEnabled?: boolean | undefined;
  readonly onPlayFieldCard?: ((cardUid: string) => void) | undefined;
  readonly onOpenConversionModal?: ((conversionUid: string) => void) | undefined;
  readonly onCancelPass?: (() => void) | undefined;
  readonly onPassTurn?: (() => void) | undefined;
  readonly onInspectCard?: ((cardId: string) => void) | undefined;
}

export interface DevelopmentPlayDndProviderProps {
  readonly view?: PlayerView | null | undefined;
  readonly controller?: GameController | null | undefined;
  readonly onPlayFieldCard?: ((cardUid: string) => void) | undefined;
  readonly onOpenConversionModal?: ((conversionUid: string) => void) | undefined;
  readonly onDropzoneOverChange?: ((isOver: boolean) => void) | undefined;
  readonly children: ReactNode;
}

/**
 * Esegue l'azione di giocata di una carta dalla mano (comune a Drag & Drop e Tap-to-Play):
 * - Edificio o Unità giocabile -> comando `PlayCard`
 * - Riconversione (`e3_gld`, `e3_frn`) giocabile -> apre `ConversionModal` (`activeConversionUid`)
 * - Carta non giocabile -> imposta `unplayableBanner` con il motivo in italiano
 */
export function triggerPlayHandCardByUid(
  cardUid: string,
  options: {
    readonly view: PlayerView | null;
    readonly controller?: GameController | null | undefined;
    readonly onPlayFieldCard?: ((uid: string) => void) | undefined;
    readonly onOpenConversionModal?: ((uid: string) => void) | undefined;
    readonly setSelectedHandUid: (uid: string | null) => void;
    readonly setActiveConversionUid: (uid: string | null) => void;
    readonly setUnplayableBanner: (
      banner: {
        readonly uid: string;
        readonly cardId: string;
        readonly reason: NonNullable<
          PlayerView['self']['legal']['handPlayability'][string]['reason']
        >;
        readonly message: string;
      } | null,
    ) => void;
  },
): boolean {
  const {
    view,
    controller,
    onPlayFieldCard,
    onOpenConversionModal,
    setSelectedHandUid,
    setActiveConversionUid,
    setUnplayableBanner,
  } = options;

  if (view === null) {
    return false;
  }

  const instance = view.self.hand.find((c) => c.uid === cardUid);
  if (instance === undefined) {
    return false;
  }

  const catalogCard = getCard(instance.cardId, view.catalogVersion);
  const playability = view.self.legal.handPlayability[instance.uid];

  if (!playability?.playable) {
    const reason = playability?.reason ?? 'wrong_phase';
    const message = buildUnplayableBannerMessage(catalogCard, reason, view);
    setUnplayableBanner({
      uid: instance.uid,
      cardId: instance.cardId,
      reason,
      message,
    });
    return false;
  }

  setUnplayableBanner(null);
  setSelectedHandUid(null);

  if (catalogCard.rules.type === 'conversion') {
    setActiveConversionUid(instance.uid);
    onOpenConversionModal?.(instance.uid);
    return true;
  }

  if (onPlayFieldCard) {
    onPlayFieldCard(instance.uid);
    return true;
  }

  if (controller) {
    const res = controller.dispatch({
      type: 'PlayCard',
      cardUid: instance.uid,
    });
    return res.ok;
  }

  return false;
}

/**
 * Provider `@dnd-kit/core` per il trascinamento delle carte dalla mano sul campo di battaglia
 * o nell'area dei controlli d'azione (§9.4 riga 814).
 */
export function DevelopmentPlayDndProvider({
  view: propView,
  controller,
  onPlayFieldCard,
  onOpenConversionModal,
  onDropzoneOverChange,
  children,
}: DevelopmentPlayDndProviderProps): ReactElement {
  const storeView = useGameStore((s) => s.presentationView ?? s.view);
  const setSelectedHandUid = useGameStore((s) => s.setSelectedHandUid);
  const setActiveConversionUid = useGameStore((s) => s.setActiveConversionUid);
  const setUnplayableBanner = useGameStore((s) => s.setUnplayableBanner);

  const [activeDragData, setActiveDragData] = useState<DraggedHandCardData | null>(null);

  const view = propView !== undefined ? propView : storeView;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = (event: DragStartEvent): void => {
    const data = extractDraggedHandCardData(event);
    setActiveDragData(data);
    if (data !== null && data.playable) {
      setSelectedHandUid(data.uid);
      setUnplayableBanner(null);
    }
  };

  const handleDragOver = (event: DragOverEvent): void => {
    const overId = event.over?.id ? String(event.over.id) : null;
    const isOverDropzone =
      overId === PLAY_FIELD_DROPZONE_ID || overId === ACTION_CONTROLS_DROPZONE_ID;
    onDropzoneOverChange?.(isOverDropzone);
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    const data = extractDraggedHandCardData(event) ?? activeDragData;
    setActiveDragData(null);
    onDropzoneOverChange?.(false);

    if (useGameStore.getState().isPlaying || data === null || event.over === null) {
      return;
    }

    const overId = String(event.over.id);
    if (overId === PLAY_FIELD_DROPZONE_ID || overId === ACTION_CONTROLS_DROPZONE_ID) {
      triggerPlayHandCardByUid(data.uid, {
        view,
        controller,
        onPlayFieldCard,
        onOpenConversionModal,
        setSelectedHandUid,
        setActiveConversionUid,
        setUnplayableBanner,
      });
    }
  };

  const handleDragCancel = (): void => {
    setActiveDragData(null);
    onDropzoneOverChange?.(false);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {activeDragData !== null ? (
          <div
            style={{ width: '116px', pointerEvents: 'none', opacity: 0.92 }}
            data-testid="hand-drag-overlay-card"
          >
            <Card cardId={activeDragData.cardId} playable={activeDragData.playable} selected />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export function ActionControls({
  view: propView,
  controller,
  confirmPassEnabled: propConfirmPassEnabled,
  onPassTurn,
  onCancelPass,
}: ActionControlsProps): ReactElement {
  const storeView = useGameStore((s) => s.presentationView ?? s.view);
  const storeConfirmPassEnabled = useGameStore((s) => s.confirmPassEnabled);
  const isPlaying = useGameStore((s) => s.isPlaying);
  const setSelectedHandUid = useGameStore((s) => s.setSelectedHandUid);
  const setUnplayableBanner = useGameStore((s) => s.setUnplayableBanner);
  const setConfirmPassEnabled = useGameStore((s) => s.setConfirmPassEnabled);

  const [isPassDialogOpen, setIsPassDialogOpen] = useState(false);

  const { setNodeRef: setDropzoneRef, isOver: isDropzoneOver } = useDroppable({
    id: ACTION_CONTROLS_DROPZONE_ID,
  });

  const view = propView !== undefined ? propView : storeView;
  const confirmPassEnabled =
    propConfirmPassEnabled !== undefined ? propConfirmPassEnabled : storeConfirmPassEnabled;

  if (view === null) {
    return (
      <div className="action-controls action-controls--empty" data-testid="action-controls-empty" />
    );
  }

  const canPass = !isPlaying && view.phase === 'development' && view.self.legal.canPass;

  const executePass = (): void => {
    if (!canPass) return;
    setIsPassDialogOpen(false);
    setSelectedHandUid(null);
    setUnplayableBanner(null);

    if (onPassTurn) {
      onPassTurn();
      return;
    }
    controller?.dispatch({ type: 'Pass' });
  };

  const handlePassButtonClick = (): void => {
    if (!canPass) {
      return;
    }
    if (confirmPassEnabled) {
      setIsPassDialogOpen(true);
      return;
    }
    executePass();
  };

  return (
    <section
      ref={setDropzoneRef}
      className="action-controls"
      data-testid="action-controls"
      data-dropzone-over={isDropzoneOver ? 'true' : 'false'}
      aria-label="Controlli d'azione di sviluppo"
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 10px',
        borderRadius: '6px',
        backgroundColor: isDropzoneOver ? 'rgba(181, 142, 72, 0.2)' : 'rgba(20, 30, 39, 0.92)',
        border: isDropzoneOver
          ? '1.5px dashed var(--brass, #B58E48)'
          : '1px solid rgba(181, 142, 72, 0.35)',
        minWidth: '0',
      }}
    >
      {(view.self.legal.marketCommands ?? []).length > 0 && (
        <div aria-label="Scambi del Mercato">
          {view.self.legal.marketCommands!.map((cmd) => (
            <button
              type="button"
              className="touch-target"
              disabled={isPlaying || !controller}
              key={`${cmd.structureUid}-${cmd.give}-${cmd.receive}`}
              onClick={() => {
                if (!useGameStore.getState().isPlaying) controller?.dispatch(cmd);
              }}
            >
              Mercato: 2 {RESOURCE_LABELS_IT[cmd.give]} → 1 {RESOURCE_LABELS_IT[cmd.receive]}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="touch-target"
        data-testid="pass-turn-btn"
        disabled={!canPass}
        onClick={handlePassButtonClick}
        style={{
          padding: '8px 16px',
          borderRadius: '6px',
          border: '1px solid var(--brass, #B58E48)',
          backgroundColor: 'rgba(25, 25, 22, 0.88)',
          color: canPass ? 'var(--chalk, #E9E5D6)' : 'var(--chalk-muted, #A7B4C2)',
          fontFamily: 'var(--font-display)',
          fontSize: '0.92rem',
          fontWeight: 700,
          cursor: canPass ? 'pointer' : 'not-allowed',
          opacity: canPass ? 1 : 0.6,
        }}
      >
        Passo
      </button>

      {/* Dialogo di conferma rapida per il pulsante "Passo" (§9.4 riga 816) */}
      {isPassDialogOpen && (
        <div
          className="epochs-inspect-backdrop"
          data-testid="pass-confirm-backdrop"
          onClick={() => {
            setIsPassDialogOpen(false);
            onCancelPass?.();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pass-confirm-dialog-title"
            data-testid="pass-confirm-dialog"
            onClick={(ev) => ev.stopPropagation()}
            style={{
              width: 'min(440px, 92vw)',
              backgroundColor: 'var(--table, #1C2B38)',
              border: '2px solid var(--brass, #B58E48)',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-modal)',
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              maxHeight: '92dvh',
              overflowY: 'auto',
              color: 'var(--chalk, #E9E5D6)',
            }}
          >
            <MatchGuidance />
            <h2
              id="pass-confirm-dialog-title"
              className="font-display"
              style={{ margin: 0, fontSize: '1.15rem', color: 'var(--brass)' }}
            >
              Conferma Passo d&apos;Era
            </h2>

            <p style={{ margin: 0, fontSize: '0.96rem' }}>
              Passare il turno per il resto dell&apos;Era? L&apos;azione è irrevocabile
            </p>

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.85rem',
                color: 'var(--chalk-muted)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                data-testid="pass-dialog-disable-confirm-checkbox"
                checked={!confirmPassEnabled}
                onChange={(ev) => setConfirmPassEnabled(!ev.target.checked)}
              />
              <span>Disattiva conferma per giocatori esperti</span>
            </label>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
              }}
            >
              <button
                type="button"
                className="touch-target"
                data-testid="cancel-pass-btn"
                onClick={() => {
                  setIsPassDialogOpen(false);
                  onCancelPass?.();
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid rgba(233, 229, 214, 0.3)',
                  backgroundColor: 'var(--surface-card, #223444)',
                  color: 'var(--chalk, #E9E5D6)',
                  fontFamily: 'var(--font-numeric)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Annulla
              </button>

              <button
                type="button"
                className="touch-target"
                data-testid="confirm-pass-btn"
                onClick={executePass}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1.5px solid var(--crimson, #A8404D)',
                  backgroundColor: 'var(--crimson, #A8404D)',
                  color: 'var(--chalk, #E9E5D6)',
                  fontFamily: 'var(--font-numeric)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Conferma Passo
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
