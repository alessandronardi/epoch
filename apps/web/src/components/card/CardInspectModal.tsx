import {
  getCard,
  getKeywordTooltip,
  type CatalogCard,
  type KeywordName,
} from '@epochs/content';
import {
  useEffect,
  type MouseEvent,
  type ReactElement,
} from 'react';
import { ERA_LABELS_IT } from '../icons/DomainIcons.js';
import { Card } from './Card.js';
import './card.css';

export interface CardInspectModalProps {
  readonly cardId?: string | null | undefined;
  readonly card?: CatalogCard | null | undefined;
  readonly atkMod?: number | undefined;
  readonly demBonus?: number | undefined;
  readonly currentHp?: number | undefined;
  readonly onClose: () => void;
}

export function CardInspectModal({
  cardId,
  card,
  atkMod = 0,
  demBonus = 0,
  currentHp,
  onClose,
}: CardInspectModalProps): ReactElement | null {
  const resolved: CatalogCard | null =
    card !== undefined && card !== null
      ? card
      : cardId !== undefined && cardId !== null
        ? getCard(cardId)
        : null;

  useEffect(() => {
    if (resolved === null) {
      return;
    }
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [resolved, onClose]);

  if (resolved === null) {
    return null;
  }

  const handleBackdropClick = (): void => {
    onClose();
  };

  const handleDialogClick = (event: MouseEvent<HTMLDivElement>): void => {
    event.stopPropagation();
  };

  const titleId = `inspect-card-title-${resolved.id}`;

  return (
    <div
      className="epochs-inspect-backdrop"
      data-testid="card-inspect-backdrop"
      onClick={handleBackdropClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="epochs-inspect-dialog"
        data-testid="card-inspect-modal"
        data-inspected-card-id={resolved.id}
        onClick={handleDialogClick}
      >
        <Card
          card={resolved}
          atkMod={atkMod}
          demBonus={demBonus}
          currentHp={currentHp}
        />

        <div className="epochs-inspect-details">
          <div className="epochs-inspect-header">
            <div>
              <h2
                id={titleId}
                className="font-display"
                style={{ margin: '0 0 4px 0', fontSize: '1.35rem' }}
              >
                {resolved.text.name}
              </h2>
              <p
                style={{
                  margin: 0,
                  color: 'var(--chalk-muted)',
                  fontSize: '0.95rem',
                }}
              >
                {resolved.text.typeLine} · {ERA_LABELS_IT[resolved.rules.era]}
              </p>
            </div>

            <button
              type="button"
              className="epochs-inspect-close touch-target"
              data-testid="card-inspect-close"
              aria-label="Chiudi ispezione carta"
              onClick={onClose}
            >
              Chiudi (Esc)
            </button>
          </div>

          <div
            style={{
              backgroundColor: 'var(--surface-card)',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(233, 229, 214, 0.14)',
            }}
          >
            <p
              style={{ margin: '0 0 6px 0', fontSize: '1rem' }}
              data-testid="inspect-rules-text"
            >
              {resolved.rulesText}
            </p>
            <p
              style={{
                margin: 0,
                fontStyle: 'italic',
                color: 'var(--chalk-muted)',
                fontSize: '0.9rem',
              }}
              data-testid="inspect-flavor-text"
            >
              {resolved.text.flavor}
            </p>
          </div>

          {resolved.keywords.length > 0 && (
            <section
              className="epochs-inspect-keywords"
              aria-label="Promemoria parole chiave"
              data-testid="inspect-keywords-list"
            >
              {resolved.keywords.map((keyword: KeywordName) => (
                <div
                  key={keyword}
                  className="epochs-inspect-keyword-box"
                  data-testid={`keyword-tooltip-${keyword}`}
                  data-keyword={keyword}
                >
                  <h3 className="epochs-inspect-keyword-title">{keyword}</h3>
                  <p className="epochs-inspect-keyword-desc">
                    {getKeywordTooltip(keyword, 'it')}
                  </p>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
