import {
  getOpponent,
  type GameResultKind,
  type PlayerId,
  type PlayerView,
} from '@epochs/engine';
import { useState, type ReactElement } from 'react';
import type { GameController } from '../../controllers/types.js';
import { useGameStore } from '../../state/game-store.js';
import { ERA_ROMAN_LABELS, StatIcon } from '../icons/DomainIcons.js';

export const GAME_RESULT_TITLES_IT: Readonly<Record<GameResultKind, string>> =
  Object.freeze({
    annihilation: 'Annientamento del Centro Città',
    points: 'Verdetto ai Punti (Fine Era III)',
    draw: 'Pareggio Perfetto',
    concession: 'Resa del Giocatore',
    timeout: 'Abbandono per Timeout Consecutivi',
  });

export const GAME_RESULT_DESCRIPTIONS_IT: Readonly<
  Record<GameResultKind, string>
> = Object.freeze({
  annihilation:
    'Il Centro Città del difensore è stato ridotto a 0 HP durante la Fase 4 di Assedio.',
  points:
    "Al termine dell'Era III la vittoria è stata assegnata confrontando gli HP residui del Centro Città (e i criteri di spareggio GDD §6.2).",
  draw: 'Entrambi i giocatori hanno concluso l’Era III in perfetta parità su Centro Città, Mura, Risorse totali ed Edifici.',
  concession: 'Un giocatore ha dichiarato la resa sul Tavolo del Cartografo.',
  timeout:
    'La partita è terminata per il superamento della soglia di 3 timeout consecutivi (D2).',
});

export interface HotSeatHandoverModalProps {
  readonly awaitingHandover?: boolean | undefined;
  readonly nextPlayer?: PlayerId | null | undefined;
  readonly controller?: GameController | null | undefined;
  readonly onAcknowledge?: (() => void) | undefined;
}

export interface GameOverModalProps {
  readonly view?: PlayerView | null | undefined;
  readonly onRematch?: (() => void) | undefined;
  readonly onReturnHome?: (() => void) | undefined;
}

export interface HotSeatAndGameOverModalProps {
  readonly view?: PlayerView | null | undefined;
  readonly controller?: GameController | null | undefined;
  readonly onAcknowledgeHandover?: (() => void) | undefined;
  readonly onRematch?: (() => void) | undefined;
  readonly onReturnHome?: (() => void) | undefined;
}

/**
 * Schermata interstiziale di privacy per la modalità Hot-Seat (§9.8 riga 852):
 * protegge le informazioni nascoste (mano, risorse ed edifici coperti) quando il turno
 * o la finestra segreta passa all'altro giocatore sullo stesso dispositivo.
 */
export function HotSeatHandoverModal({
  awaitingHandover: propAwaiting,
  nextPlayer: propNextPlayer,
  controller,
  onAcknowledge,
}: HotSeatHandoverModalProps): ReactElement | null {
  const storeAwaiting = useGameStore((s) => s.awaitingHotSeatHandover);
  const storeNextPlayer = useGameStore((s) => s.hotSeatNextPlayer);
  const storeView = useGameStore((s) => s.view);
  const setHotSeatHandover = useGameStore((s) => s.setHotSeatHandover);

  const awaiting =
    propAwaiting !== undefined ? propAwaiting : storeAwaiting;
  const nextPlayer =
    propNextPlayer !== undefined
      ? propNextPlayer
      : storeNextPlayer ?? storeView?.me ?? 'P2';

  if (!awaiting || storeView?.phase === 'finished') {
    return null;
  }

  const playerNumber = nextPlayer === 'P1' ? '1' : '2';

  const handleRevealHand = (): void => {
    if (onAcknowledge) {
      onAcknowledge();
      return;
    }
    if (controller?.acknowledgeHotSeatHandover) {
      controller.acknowledgeHotSeatHandover();
      return;
    }
    setHotSeatHandover(false, null);
  };

  return (
    <div
      className="epochs-inspect-backdrop"
      data-testid="hotseat-handover-backdrop"
      style={{
        backgroundColor: 'rgba(12, 18, 24, 0.98)',
        zIndex: 95,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hotseat-handover-title"
        data-testid="hotseat-handover-modal"
        data-next-player={nextPlayer}
        style={{
          width: 'min(540px, 92vw)',
          backgroundColor: 'var(--table, #1C2B38)',
          border: '2px solid var(--brass, #B58E48)',
          borderRadius: '14px',
          boxShadow: 'var(--shadow-modal)',
          padding: '28px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '18px',
          color: 'var(--chalk, #E9E5D6)',
        }}
      >
        <span className="board-badge board-badge--brass">
          Modalità Locale Hot-Seat · Protezione Privacy
        </span>

        <h2
          id="hotseat-handover-title"
          className="font-display"
          data-testid="hotseat-handover-heading"
          style={{
            margin: 0,
            fontSize: '1.35rem',
            lineHeight: 1.35,
            color: 'var(--brass, #B58E48)',
          }}
        >
          Passa il dispositivo al Giocatore {playerNumber} ({nextPlayer}) — Tocca
          per svelare la tua mano
        </h2>

        <p
          style={{
            margin: 0,
            fontSize: '0.95rem',
            color: 'var(--chalk-muted, #A7B4C2)',
          }}
        >
          La mano, le risorse segrete e gli Edifici Economici coperti sono stati
          oscurati per impedire la visione accidentale durante il passaggio del
          dispositivo.
        </p>

        <button
          type="button"
          className="touch-target"
          data-testid="hotseat-reveal-hand-btn"
          onClick={handleRevealHand}
          style={{
            width: '100%',
            maxWidth: '340px',
            padding: '12px 20px',
            borderRadius: '8px',
            border: '1.5px solid var(--brass, #B58E48)',
            backgroundColor: 'var(--brass, #B58E48)',
            color: 'var(--table-deep, #141E27)',
            fontFamily: 'var(--font-numeric)',
            fontSize: '1.05rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Tocca per svelare la tua mano ({nextPlayer})
        </button>
      </div>
    </div>
  );
}

/**
 * Modale di riepilogo di fine partita (`finished`) per tutti gli esiti (§4.9, §9.4):
 * `annihilation`, `points`, `draw`, `concession`, `timeout`.
 */
export function GameOverModal({
  view: propView,
  onRematch,
  onReturnHome,
}: GameOverModalProps): ReactElement | null {
  const storeView = useGameStore((s) => s.view);
  const skipToEnd = useGameStore((s) => s.skipToEnd);
  const isPlaying = useGameStore((s) => s.isPlaying);
  const [dismissedForStateVersion, setDismissedForStateVersion] = useState<
    number | null
  >(null);

  const view = propView !== undefined ? propView : storeView;
  if (view === null || view.phase !== 'finished' || view.result === null) {
    return null;
  }

  const isDismissed = dismissedForStateVersion === view.stateVersion;

  if (isDismissed) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          zIndex: 85,
        }}
      >
        <button
          type="button"
          className="touch-target"
          data-testid="reopen-game-over-modal-btn"
          onClick={() => setDismissedForStateVersion(null)}
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            border: '2px solid var(--brass, #B58E48)',
            backgroundColor: 'var(--brass, #B58E48)',
            color: 'var(--table-deep, #141E27)',
            fontFamily: 'var(--font-numeric)',
            fontSize: '0.95rem',
            fontWeight: 700,
            boxShadow: 'var(--shadow-modal)',
            cursor: 'pointer',
          }}
        >
          Mostra Riepilogo Fine Partita
        </button>
      </div>
    );
  }

  const { kind, winner } = view.result;
  const selfId = view.me;
  const opponentId = getOpponent(selfId);
  const isDraw = winner === 'DRAW';
  const isSelfWinner = winner === selfId;

  const headline = isDraw
    ? 'Pareggio sul Tavolo del Cartografo'
    : isSelfWinner
      ? `Vittoria di ${selfId}!`
      : `Vittoria di ${winner} (${opponentId})`;

  const selfTotalResources =
    view.self.resources.food +
    view.self.resources.wood +
    view.self.resources.metal;
  const opponentTotalResources =
    view.opponent.resources !== null
      ? view.opponent.resources.food +
        view.opponent.resources.wood +
        view.opponent.resources.metal
      : null;

  return (
    <div
      className="epochs-inspect-backdrop"
      data-testid="game-over-modal-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-over-modal-title"
        data-testid="game-over-modal"
        data-result-kind={kind}
        data-winner={winner}
        style={{
          width: 'min(640px, 94vw)',
          maxHeight: '92dvh',
          backgroundColor: 'var(--table, #1C2B38)',
          border: '2px solid var(--brass, #B58E48)',
          borderRadius: '14px',
          boxShadow: 'var(--shadow-modal)',
          padding: '22px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          overflowY: 'auto',
          color: 'var(--chalk, #E9E5D6)',
        }}
      >
        <header
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            borderBottom: '1px solid var(--brass-subtle)',
            paddingBottom: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <span
              className={`board-badge ${
                isDraw
                  ? ''
                  : isSelfWinner
                    ? 'board-badge--brass'
                    : 'board-badge--crimson'
              }`}
              data-testid="game-over-result-badge"
            >
              Esito: {GAME_RESULT_TITLES_IT[kind]} ({kind})
            </span>

            <span className="board-badge board-badge--muted">
              Conclusa in Era {ERA_ROMAN_LABELS[view.era]}
            </span>
          </div>

          <h2
            id="game-over-modal-title"
            className="font-display"
            data-testid="game-over-headline"
            style={{
              margin: 0,
              fontSize: '1.5rem',
              color: isDraw
                ? 'var(--chalk)'
                : isSelfWinner
                  ? 'var(--brass, #B58E48)'
                  : 'var(--crimson, #A8404D)',
            }}
          >
            {headline}
          </h2>

          <p
            data-testid="game-over-description"
            style={{
              margin: 0,
              fontSize: '0.94rem',
              color: 'var(--chalk-muted, #A7B4C2)',
            }}
          >
            {GAME_RESULT_DESCRIPTIONS_IT[kind]}
          </p>
        </header>

        {/* Riepilogo comparativo Centro Città, Mura e Risorse (GDD §6.2) */}
        <section
          aria-label="Statistiche finali dei giocatori"
          data-testid="game-over-stats-summary"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: '12px',
          }}
        >
          {/* Colonna Giocatore Attivo */}
          <div
            data-testid="game-over-self-card"
            style={{
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: 'var(--surface-card, #223444)',
              border: isSelfWinner
                ? '1.5px solid var(--brass, #B58E48)'
                : '1px solid rgba(233, 229, 214, 0.18)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <strong className="font-display" style={{ fontSize: '1rem' }}>
              Tu ({selfId}) {isSelfWinner ? '· Vincitore' : ''}
            </strong>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-numeric)',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <StatIcon stat="cityCenter" size={14} /> Centro Città:
              </span>
              <strong data-testid="game-over-self-city-hp">
                {view.self.cityHp}/{view.self.cityMax} HP
              </strong>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-numeric)',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <StatIcon stat="walls" size={14} /> Mura finali:
              </span>
              <strong data-testid="game-over-self-walls">
                {view.self.walls} HP
              </strong>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-numeric)',
                fontSize: '0.88rem',
                color: 'var(--chalk-muted)',
              }}
            >
              <span>Risorse in magazzino:</span>
              <span>{selfTotalResources} totali</span>
            </div>
          </div>

          {/* Colonna Avversario */}
          <div
            data-testid="game-over-opponent-card"
            style={{
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: 'var(--surface-card, #223444)',
              border:
                winner === opponentId
                  ? '1.5px solid var(--brass, #B58E48)'
                  : '1px solid rgba(233, 229, 214, 0.18)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <strong className="font-display" style={{ fontSize: '1rem' }}>
              Avversario ({opponentId}) {winner === opponentId ? '· Vincitore' : ''}
            </strong>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-numeric)',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <StatIcon stat="cityCenter" size={14} /> Centro Città:
              </span>
              <strong data-testid="game-over-opponent-city-hp">
                {view.opponent.cityHp}/{view.opponent.cityMax} HP
              </strong>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-numeric)',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <StatIcon stat="walls" size={14} /> Mura finali:
              </span>
              <strong data-testid="game-over-opponent-walls">
                {view.opponent.walls} HP
              </strong>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-numeric)',
                fontSize: '0.88rem',
                color: 'var(--chalk-muted)',
              }}
            >
              <span>Risorse in magazzino:</span>
              <span>
                {opponentTotalResources !== null
                  ? `${opponentTotalResources} totali`
                  : 'Nascoste'}
              </span>
            </div>
          </div>
        </section>

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
            data-testid="game-over-inspect-board-btn"
            onClick={() => {
              if (isPlaying) {
                skipToEnd();
              }
              setDismissedForStateVersion(view.stateVersion);
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
            Esplora Tavolo e Registro
          </button>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {onReturnHome !== undefined && (
              <button
                type="button"
                className="touch-target"
                data-testid="game-over-home-btn"
                onClick={onReturnHome}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid var(--brass, #B58E48)',
                  backgroundColor: 'var(--surface-card, #223444)',
                  color: 'var(--chalk, #E9E5D6)',
                  fontFamily: 'var(--font-numeric)',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Torna alla Home
              </button>
            )}

            {onRematch !== undefined && (
              <button
                type="button"
                className="touch-target"
                data-testid="game-over-rematch-btn"
                onClick={onRematch}
                style={{
                  padding: '8px 18px',
                  borderRadius: '6px',
                  border: '1.5px solid var(--brass, #B58E48)',
                  backgroundColor: 'var(--brass, #B58E48)',
                  color: 'var(--table-deep, #141E27)',
                  fontFamily: 'var(--font-numeric)',
                  fontSize: '0.98rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Nuova Partita
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

/**
 * Componente composito che monta `<HotSeatHandoverModal>` e `<GameOverModal>`.
 */
export function HotSeatAndGameOverModal({
  view,
  controller,
  onAcknowledgeHandover,
  onRematch,
  onReturnHome,
}: HotSeatAndGameOverModalProps): ReactElement {
  return (
    <>
      <HotSeatHandoverModal
        controller={controller}
        onAcknowledge={onAcknowledgeHandover}
      />
      <GameOverModal
        view={view}
        onRematch={onRematch}
        onReturnHome={onReturnHome}
      />
    </>
  );
}
