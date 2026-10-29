import { MatchGuidance } from './MatchGuidance.js';
import { CARDS_RULES, getCard } from '@epochs/content';
import { autoDiscard, getTotalCardCost, type CardInstance, type PlayerView } from '@epochs/engine';
import type { ReactElement } from 'react';
import type { GameController } from '../../controllers/types.js';
import { useGameStore } from '../../state/game-store.js';
import { Card } from '../card/Card.js';
import { ERA_ROMAN_LABELS } from '../icons/DomainIcons.js';

export interface MulliganModalProps {
  readonly view?: PlayerView | null | undefined;
  readonly controller?: GameController | null | undefined;
  readonly selectedMulliganUids?: readonly string[] | undefined;
  readonly onToggleMulliganUid?: ((uid: string) => void) | undefined;
  readonly onSubmitMulligan?: ((cardUids: readonly string[]) => void) | undefined;
  readonly onInspectCard?: ((cardId: string) => void) | undefined;
}

export interface HandLimitModalProps {
  readonly view?: PlayerView | null | undefined;
  readonly controller?: GameController | null | undefined;
  readonly selectedDiscardUids?: readonly string[] | undefined;
  readonly onToggleDiscardUid?: ((uid: string) => void) | undefined;
  readonly onSetSelectedDiscardUids?: ((uids: readonly string[]) => void) | undefined;
  readonly onSubmitDiscard?: ((cardUids: readonly string[]) => void) | undefined;
  readonly onInspectCard?: ((cardId: string) => void) | undefined;
}

export interface MulliganAndDiscardModalsProps {
  readonly view?: PlayerView | null | undefined;
  readonly controller?: GameController | null | undefined;
  readonly onSubmitMulligan?: ((cardUids: readonly string[]) => void) | undefined;
  readonly onSubmitDiscard?: ((cardUids: readonly string[]) => void) | undefined;
  readonly onInspectCard?: ((cardId: string) => void) | undefined;
}

/**
 * Modale dedicata per la finestra simultanea di `mulligan` in Era I (§9.4 riga 810):
 * mostra le 8 carte pescate, consente di selezionare/deselezionare quelle da sostituire
 * e invia `SubmitMulligan` tramite `"Conferma Mulligan (N carte)"` o `"Mantieni mano"`.
 */
export function MulliganModal({
  view: propView,
  controller,
  selectedMulliganUids: propSelectedUids,
  onToggleMulliganUid,
  onSubmitMulligan,
  onInspectCard,
}: MulliganModalProps): ReactElement | null {
  const storeView = useGameStore((s) => s.view);
  const storeSelectedUids = useGameStore((s) => s.selectedMulliganUids);
  const toggleMulliganUid = useGameStore((s) => s.toggleMulliganUid);
  const setSelectedMulliganUids = useGameStore((s) => s.setSelectedMulliganUids);
  const setInspectedCardId = useGameStore((s) => s.setInspectedCardId);

  const view = propView !== undefined ? propView : storeView;
  if (view === null || view.phase !== 'mulligan') {
    return null;
  }

  const validHandUids = new Set(view.self.hand.map((c) => c.uid));
  const rawSelectedUids = propSelectedUids !== undefined ? propSelectedUids : storeSelectedUids;
  const selectedUids = rawSelectedUids.filter((uid) => validHandUids.has(uid));
  const selectedCount = selectedUids.length;
  const canSubmit = view.self.legal.canSubmitMulligan && !view.self.committed;

  const handleToggleCard = (uid: string): void => {
    if (!canSubmit) {
      return;
    }
    if (onToggleMulliganUid) {
      onToggleMulliganUid(uid);
      return;
    }
    toggleMulliganUid(uid);
  };

  const handleInspect = (cardId: string): void => {
    if (onInspectCard) {
      onInspectCard(cardId);
      return;
    }
    setInspectedCardId(cardId);
  };

  const submitMulliganUids = (uidsToSubmit: readonly string[]): void => {
    if (!canSubmit) {
      return;
    }
    setSelectedMulliganUids([]);
    if (onSubmitMulligan) {
      onSubmitMulligan(uidsToSubmit);
      return;
    }
    controller?.dispatch({
      type: 'SubmitMulligan',
      cardUids: [...uidsToSubmit],
    });
  };

  const primaryButtonLabel =
    selectedCount === 0 ? 'Mantieni mano' : `Conferma Mulligan (${selectedCount} carte)`;

  return (
    <div className="epochs-inspect-backdrop" data-testid="mulligan-modal-backdrop">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mulligan-modal-title"
        data-testid="mulligan-modal"
        data-selected-count={String(selectedCount)}
        style={{
          width: 'min(980px, 96vw)',
          maxHeight: '92dvh',
          backgroundColor: 'var(--table, #1C2B38)',
          border: '2px solid var(--brass, #B58E48)',
          borderRadius: '14px',
          boxShadow: 'var(--shadow-modal)',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          overflowY: 'auto',
          color: 'var(--chalk, #E9E5D6)',
        }}
      >
        <MatchGuidance />
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            borderBottom: '1px solid var(--brass-subtle)',
            paddingBottom: '10px',
          }}
        >
          <div>
            <h2
              id="mulligan-modal-title"
              className="font-display"
              style={{ margin: '0 0 4px 0', fontSize: '1.3rem', color: 'var(--brass)' }}
            >
              Mulligan Iniziale — Era I (Bronzo)
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: '0.92rem',
                color: 'var(--chalk-muted)',
              }}
            >
              Tocca le carte da sostituire dal sotto-mazzo di Era I (massimo{' '}
              {view.self.legal.maxMulliganCards || view.self.hand.length}). Le carte rese saranno
              riposte in fondo al mazzo dopo la pesca sostitutiva.
            </p>
          </div>

          <span className="board-badge board-badge--brass" data-testid="mulligan-selection-counter">
            Selezionate: {selectedCount}/{view.self.hand.length}
          </span>
        </header>

        {view.self.committed ? (
          <div
            className="board-zone__empty"
            data-testid="mulligan-waiting-opponent"
            style={{ minHeight: '120px', fontSize: '1rem' }}
          >
            Scelta di Mulligan confermata — In attesa dell&apos;avversario...
          </div>
        ) : (
          <div
            role="list"
            aria-label="Carte della mano iniziale per il Mulligan"
            data-testid="mulligan-cards-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))',
              gap: '12px',
              justifyItems: 'center',
              padding: '4px 0',
            }}
          >
            {view.self.hand.map((instance) => {
              const isSelected = selectedUids.includes(instance.uid);
              return (
                <div
                  key={instance.uid}
                  role="listitem"
                  data-testid={`mulligan-card-slot-${instance.uid}`}
                  data-selected={isSelected ? 'true' : 'false'}
                  style={{
                    width: '100%',
                    maxWidth: '156px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Card
                    cardId={instance.cardId}
                    playable={!isSelected}
                    selected={isSelected}
                    onSelect={() => handleToggleCard(instance.uid)}
                    onInspect={handleInspect}
                  />
                  <button
                    type="button"
                    className="touch-target"
                    data-testid={`mulligan-toggle-btn-${instance.uid}`}
                    aria-pressed={isSelected}
                    onClick={() => handleToggleCard(instance.uid)}
                    style={{
                      width: '100%',
                      padding: '4px 8px',
                      borderRadius: '5px',
                      border: isSelected
                        ? '1px solid var(--crimson, #A8404D)'
                        : '1px solid rgba(233, 229, 214, 0.24)',
                      backgroundColor: isSelected
                        ? 'rgba(168, 64, 77, 0.28)'
                        : 'var(--surface-card, #223444)',
                      color: 'var(--chalk, #E9E5D6)',
                      fontFamily: 'var(--font-numeric)',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {isSelected ? 'Da sostituire' : 'Mantieni'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            borderTop: '1px solid var(--brass-subtle)',
            paddingTop: '12px',
          }}
        >
          <span style={{ fontSize: '0.86rem', color: 'var(--chalk-muted)' }}>
            {view.opponent.committed
              ? "L'avversario ha già bloccato il proprio Mulligan."
              : "L'avversario sta decidendo il proprio Mulligan..."}
          </span>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {selectedCount > 0 && (
              <button
                type="button"
                className="touch-target"
                data-testid="mulligan-keep-hand-btn"
                disabled={!canSubmit}
                onClick={() => submitMulliganUids([])}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid rgba(233, 229, 214, 0.35)',
                  backgroundColor: 'var(--surface-card, #223444)',
                  color: 'var(--chalk, #E9E5D6)',
                  fontFamily: 'var(--font-numeric)',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                }}
              >
                Mantieni mano
              </button>
            )}

            <button
              type="button"
              className="touch-target"
              data-testid="mulligan-submit-btn"
              disabled={!canSubmit}
              onClick={() => submitMulliganUids(selectedUids)}
              style={{
                padding: '8px 18px',
                borderRadius: '6px',
                border: '1.5px solid var(--brass, #B58E48)',
                backgroundColor: canSubmit
                  ? 'var(--brass, #B58E48)'
                  : 'var(--surface-card, #223444)',
                color: canSubmit ? 'var(--table-deep, #141E27)' : 'var(--chalk-muted, #A7B4C2)',
                fontFamily: 'var(--font-numeric)',
                fontSize: '0.98rem',
                fontWeight: 700,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
              }}
            >
              {primaryButtonLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/**
 * Modale dedicata per la finestra `hand_limit` quando la mano supera 10 carte (§9.4 riga 811):
 * mostra `"Seleziona N carte da scartare"`, abilita `"Conferma Scarto"` solo a esattamente `N`
 * carte selezionate e offre `"Suggerisci (FIFO)"` collegato a `autoDiscard`.
 */
export function HandLimitModal({
  view: propView,
  controller,
  selectedDiscardUids: propSelectedUids,
  onToggleDiscardUid,
  onSetSelectedDiscardUids,
  onSubmitDiscard,
  onInspectCard,
}: HandLimitModalProps): ReactElement | null {
  const storeView = useGameStore((s) => s.view);
  const storeSelectedUids = useGameStore((s) => s.selectedDiscardUids);
  const toggleDiscardUid = useGameStore((s) => s.toggleDiscardUid);
  const setSelectedDiscardUids = useGameStore((s) => s.setSelectedDiscardUids);
  const setInspectedCardId = useGameStore((s) => s.setInspectedCardId);

  const view = propView !== undefined ? propView : storeView;
  if (view === null || view.phase !== 'hand_limit') {
    return null;
  }

  const mustDiscardCount = view.self.legal.mustDiscardCount;
  if (mustDiscardCount <= 0 && !view.self.legal.canSubmitDiscard) {
    return null;
  }

  const validHandUids = new Set(view.self.hand.map((c) => c.uid));
  const rawSelectedUids = propSelectedUids !== undefined ? propSelectedUids : storeSelectedUids;
  const selectedUids = rawSelectedUids.filter((uid) => validHandUids.has(uid));
  const selectedCount = selectedUids.length;
  const isExactCount = selectedCount === mustDiscardCount;
  const canConfirm = view.self.legal.canSubmitDiscard && isExactCount;

  const updateSelectedUids = (nextUids: readonly string[]): void => {
    if (onSetSelectedDiscardUids) {
      onSetSelectedDiscardUids(nextUids);
      return;
    }
    setSelectedDiscardUids(nextUids);
  };

  const handleToggleCard = (instance: CardInstance): void => {
    if (!view.self.legal.canSubmitDiscard) {
      return;
    }
    const alreadySelected = selectedUids.includes(instance.uid);
    if (!alreadySelected && selectedCount >= mustDiscardCount) {
      // Sostituisce l'ultima carta selezionata se l'utente tocca una nuova carta a limite già raggiunto
      const updated = [...selectedUids.slice(0, Math.max(0, mustDiscardCount - 1)), instance.uid];
      updateSelectedUids(updated);
      return;
    }
    if (onToggleDiscardUid) {
      onToggleDiscardUid(instance.uid);
      return;
    }
    toggleDiscardUid(instance.uid);
  };

  const handleSuggestFifo = (): void => {
    const suggestedUids = autoDiscard(view.self.hand, CARDS_RULES, mustDiscardCount);
    updateSelectedUids(suggestedUids);
  };

  const handleConfirmDiscard = (): void => {
    if (!canConfirm) {
      return;
    }
    const toSubmit = [...selectedUids];
    updateSelectedUids([]);
    if (onSubmitDiscard) {
      onSubmitDiscard(toSubmit);
      return;
    }
    controller?.dispatch({
      type: 'SubmitDiscard',
      cardUids: toSubmit,
    });
  };

  const handleInspect = (cardId: string): void => {
    if (onInspectCard) {
      onInspectCard(cardId);
      return;
    }
    setInspectedCardId(cardId);
  };

  return (
    <div className="epochs-inspect-backdrop" data-testid="hand-limit-modal-backdrop">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hand-limit-modal-title"
        data-testid="hand-limit-modal"
        data-must-discard={String(mustDiscardCount)}
        data-selected-count={String(selectedCount)}
        style={{
          width: 'min(980px, 96vw)',
          maxHeight: '92dvh',
          backgroundColor: 'var(--table, #1C2B38)',
          border: '2px solid var(--brass, #B58E48)',
          borderRadius: '14px',
          boxShadow: 'var(--shadow-modal)',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          overflowY: 'auto',
          color: 'var(--chalk, #E9E5D6)',
        }}
      >
        <MatchGuidance />
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            borderBottom: '1px solid var(--brass-subtle)',
            paddingBottom: '10px',
          }}
        >
          <div>
            <h2
              id="hand-limit-modal-title"
              className="font-display"
              data-testid="hand-limit-instruction"
              style={{ margin: '0 0 4px 0', fontSize: '1.28rem', color: 'var(--brass)' }}
            >
              Seleziona {mustDiscardCount} {mustDiscardCount === 1 ? 'carta' : 'carte'} da scartare
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: '0.9rem',
                color: 'var(--chalk-muted)',
              }}
            >
              Limite massimo di mano: 10 carte (hai {view.self.hand.length} carte). Le carte
              scartate restano segrete per l&apos;avversario (D3).
            </p>
          </div>

          <span
            className={`board-badge ${
              isExactCount ? 'board-badge--brass' : 'board-badge--crimson'
            }`}
            data-testid="hand-limit-counter"
          >
            Selezionate: {selectedCount}/{mustDiscardCount}
          </span>
        </header>

        <div
          role="list"
          aria-label="Carte in mano per lo scarto al limite di 10"
          data-testid="hand-limit-cards-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(124px, 1fr))',
            gap: '12px',
            justifyItems: 'center',
            padding: '4px 0',
          }}
        >
          {view.self.hand.map((instance) => {
            const isSelected = selectedUids.includes(instance.uid);
            const catalogCard = getCard(instance.cardId);
            const totalCost = getTotalCardCost(catalogCard.rules);

            return (
              <div
                key={instance.uid}
                role="listitem"
                data-testid={`hand-limit-card-slot-${instance.uid}`}
                data-selected={isSelected ? 'true' : 'false'}
                style={{
                  width: '100%',
                  maxWidth: '154px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Card
                  card={catalogCard}
                  selected={isSelected}
                  onSelect={() => handleToggleCard(instance)}
                  onInspect={handleInspect}
                />
                <button
                  type="button"
                  className="touch-target"
                  data-testid={`hand-limit-toggle-btn-${instance.uid}`}
                  aria-pressed={isSelected}
                  onClick={() => handleToggleCard(instance)}
                  style={{
                    width: '100%',
                    padding: '4px 8px',
                    borderRadius: '5px',
                    border: isSelected
                      ? '1px solid var(--crimson, #A8404D)'
                      : '1px solid rgba(233, 229, 214, 0.24)',
                    backgroundColor: isSelected
                      ? 'rgba(168, 64, 77, 0.3)'
                      : 'var(--surface-card, #223444)',
                    color: 'var(--chalk, #E9E5D6)',
                    fontFamily: 'var(--font-numeric)',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isSelected
                    ? 'Da scartare'
                    : `Era ${ERA_ROMAN_LABELS[catalogCard.rules.era]} · Costo ${totalCost} · #${instance.drawnOrder}`}
                </button>
              </div>
            );
          })}
        </div>

        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            borderTop: '1px solid var(--brass-subtle)',
            paddingTop: '12px',
          }}
        >
          <button
            type="button"
            className="touch-target"
            data-testid="hand-limit-suggest-fifo-btn"
            onClick={handleSuggestFifo}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: '1px solid var(--brass, #B58E48)',
              backgroundColor: 'var(--surface-card, #223444)',
              color: 'var(--chalk, #E9E5D6)',
              fontFamily: 'var(--font-numeric)',
              fontSize: '0.94rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Suggerisci (FIFO)
          </button>

          <button
            type="button"
            className="touch-target"
            data-testid="hand-limit-submit-btn"
            disabled={!canConfirm}
            onClick={handleConfirmDiscard}
            style={{
              padding: '8px 18px',
              borderRadius: '6px',
              border: '1.5px solid var(--brass, #B58E48)',
              backgroundColor: canConfirm
                ? 'var(--brass, #B58E48)'
                : 'var(--surface-card, #223444)',
              color: canConfirm ? 'var(--table-deep, #141E27)' : 'var(--chalk-muted, #A7B4C2)',
              fontFamily: 'var(--font-numeric)',
              fontSize: '0.98rem',
              fontWeight: 700,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              opacity: canConfirm ? 1 : 0.65,
            }}
          >
            Conferma Scarto
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Wrapper composito che monta automaticamente `<MulliganModal>` o `<HandLimitModal>`
 * in base alla fase attiva della `PlayerView`.
 */
export function MulliganAndDiscardModals({
  view,
  controller,
  onSubmitMulligan,
  onSubmitDiscard,
  onInspectCard,
}: MulliganAndDiscardModalsProps): ReactElement | null {
  const awaitingHandover = useGameStore((s) => s.awaitingHotSeatHandover);
  if (awaitingHandover) return null;

  return (
    <>
      <MulliganModal
        view={view}
        controller={controller}
        onSubmitMulligan={onSubmitMulligan}
        onInspectCard={onInspectCard}
      />
      <HandLimitModal
        view={view}
        controller={controller}
        onSubmitDiscard={onSubmitDiscard}
        onInspectCard={onInspectCard}
      />
    </>
  );
}
