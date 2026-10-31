import {
  V2_CARD_CATALOG as CARD_CATALOG,
  CIVILIZATIONS,
  KEYWORD_TOOLTIPS_IT,
  type CardType,
  type CatalogCard,
  type EraNo,
  type KeywordName,
  type Line,
  type UnitCategory,
} from '@epochs/content';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Card } from '../components/card/Card.js';
import { CardInspectModal } from '../components/card/CardInspectModal.js';
import {
  ERA_LABELS_IT,
  LINE_LABELS_IT,
  UNIT_CATEGORY_LABELS_IT,
} from '../components/icons/DomainIcons.js';

export const CARD_TYPE_LABELS_IT: Readonly<Record<CardType, string>> = Object.freeze({
  structure: 'Struttura',
  economy: 'Economia',
  unit: 'Unità',
  instant: 'Istantanea',
  conversion: 'Riconversione',
});

export type ArchiveEraFilter = 'all' | EraNo;
export type ArchiveTypeFilter = 'all' | CardType;
export type ArchiveCategoryFilter = 'all' | UnitCategory;
export type ArchiveLineFilter = 'all' | Line;

export interface CardArchiveFilterState {
  readonly era: ArchiveEraFilter;
  readonly type: ArchiveTypeFilter;
  readonly category: ArchiveCategoryFilter;
  readonly line: ArchiveLineFilter;
  readonly searchQuery: string;
}

export function filterCatalogCards(
  cards: readonly CatalogCard[],
  filters: CardArchiveFilterState,
): CatalogCard[] {
  const normalizedQuery = filters.searchQuery.trim().toLowerCase();

  return cards.filter((card) => {
    if (filters.era !== 'all' && card.rules.era !== filters.era) {
      return false;
    }
    if (filters.type !== 'all' && card.rules.type !== filters.type) {
      return false;
    }
    if (filters.category !== 'all' && card.rules.category !== filters.category) {
      return false;
    }
    if (filters.line !== 'all' && card.rules.line !== filters.line) {
      return false;
    }
    if (normalizedQuery.length > 0) {
      const haystack = [
        card.id,
        card.text.name,
        card.text.typeLine,
        card.rulesText,
        card.text.flavor,
        ...card.keywords,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(normalizedQuery)) {
        return false;
      }
    }
    return true;
  });
}

export interface CardArchiveScreenProps {
  readonly onFiltersChange?: ((filters: CardArchiveFilterState) => void) | undefined;
  readonly onBackHome?: (() => void) | undefined;
  readonly onInspectCard?: ((cardId: string) => void) | undefined;
}

const ERA_OPTIONS: readonly { readonly value: ArchiveEraFilter; readonly label: string }[] = [
  { value: 'all', label: 'Tutte le Ere' },
  { value: 1, label: ERA_LABELS_IT[1] },
  { value: 2, label: ERA_LABELS_IT[2] },
  { value: 3, label: ERA_LABELS_IT[3] },
];

const TYPE_OPTIONS: readonly { readonly value: ArchiveTypeFilter; readonly label: string }[] = [
  { value: 'all', label: 'Tutti i Tipi' },
  { value: 'economy', label: CARD_TYPE_LABELS_IT.economy },
  { value: 'unit', label: CARD_TYPE_LABELS_IT.unit },
  { value: 'instant', label: CARD_TYPE_LABELS_IT.instant },
  { value: 'conversion', label: CARD_TYPE_LABELS_IT.conversion },
];

const CATEGORY_OPTIONS: readonly {
  readonly value: ArchiveCategoryFilter;
  readonly label: string;
}[] = [
  { value: 'all', label: 'Tutte le Categorie' },
  { value: 'infantry', label: UNIT_CATEGORY_LABELS_IT.infantry },
  { value: 'spearman', label: UNIT_CATEGORY_LABELS_IT.spearman },
  { value: 'cavalry', label: UNIT_CATEGORY_LABELS_IT.cavalry },
  { value: 'archer', label: UNIT_CATEGORY_LABELS_IT.archer },
  { value: 'siege', label: UNIT_CATEGORY_LABELS_IT.siege },
];

const LINE_OPTIONS: readonly { readonly value: ArchiveLineFilter; readonly label: string }[] = [
  { value: 'all', label: 'Tutte le Linee' },
  { value: 'front', label: LINE_LABELS_IT.front },
  { value: 'center', label: LINE_LABELS_IT.center },
  { value: 'rear', label: LINE_LABELS_IT.rear },
];

const ALL_KEYWORDS = Object.keys(KEYWORD_TOOLTIPS_IT) as KeywordName[];

export function CardArchiveScreen({
  onBackHome,
  onInspectCard,
  onFiltersChange,
}: CardArchiveScreenProps): ReactElement {
  const [eraFilter, setEraFilter] = useState<ArchiveEraFilter>('all');
  const [civilizationFilter,setCivilizationFilter]=useState('all');
  const [typeFilter, setTypeFilter] = useState<ArchiveTypeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<ArchiveCategoryFilter>('all');
  const [lineFilter, setLineFilter] = useState<ArchiveLineFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [localInspectedCardId, setLocalInspectedCardId] = useState<string | null>(null);

  useEffect(() => {
    onFiltersChange?.({
      era: eraFilter,
      type: typeFilter,
      category: categoryFilter,
      line: lineFilter,
      searchQuery,
    });
  }, [eraFilter, typeFilter, categoryFilter, lineFilter, searchQuery, onFiltersChange]);

  const filteredCards = useMemo(
    () =>
      filterCatalogCards(CARD_CATALOG.allCards.filter(c=>civilizationFilter==='all'||c.rules.affiliation==='common'||c.rules.affiliation===civilizationFilter), {
        era: eraFilter,
        type: typeFilter,
        category: categoryFilter,
        line: lineFilter,
        searchQuery,
      }),
    [eraFilter, typeFilter, categoryFilter, lineFilter, searchQuery,civilizationFilter],
  );

  const hasActiveFilters =
    civilizationFilter !== 'all' ||
    eraFilter !== 'all' ||
    typeFilter !== 'all' ||
    categoryFilter !== 'all' ||
    lineFilter !== 'all' ||
    searchQuery.trim().length > 0;

  const handleResetFilters = (): void => {
    setCivilizationFilter('all');
    setEraFilter('all');
    setTypeFilter('all');
    setCategoryFilter('all');
    setLineFilter('all');
    setSearchQuery('');
  };

  const handleOpenInspect = (cardId: string): void => {
    setLocalInspectedCardId(cardId);
    onInspectCard?.(cardId);
  };

  return (
    <main
      className="cartographer-table archive-screen"
      data-testid="screen-archive"
      style={{
        width: '100%',
        height: '100dvh',
        maxHeight: '100dvh',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: 'clamp(12px, 2.5vw, 24px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      <div
        style={{
          width: 'min(1160px, 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Intestazione Archivio Carte */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '14px 18px',
            borderRadius: '10px',
            backgroundColor: 'var(--panel)',
            border: '1px solid var(--panel-border)',
          }}
        >
          <div>
            <h1
              className="font-display"
              style={{ margin: 0, fontSize: '1.45rem', color: 'var(--brass)' }}
            >
              Archivio Carte — Catalogo Ufficiale (45 Carte)
            </h1>
            <p
              style={{
                margin: '4px 0 0 0',
                fontSize: '0.9rem',
                color: 'var(--chalk-muted)',
              }}
            >
              Tocca una carta (o premi a lungo 250ms / doppio tap) per aprire la vista ingrandita
              con i promemoria delle parole chiave.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              className="font-numeric"
              data-testid="archive-results-count"
              aria-live="polite"
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--surface-card)',
                border: '1px solid var(--panel-border)',
                color: 'var(--chalk)',
                fontWeight: 700,
                fontSize: '0.95rem',
              }}
            >
              {filteredCards.length} / {CARD_CATALOG.allCards.length} carte
            </span>

            {onBackHome && (
              <button
                type="button"
                className="touch-target"
                data-testid="back-to-home-btn"
                onClick={onBackHome}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid var(--brass)',
                  backgroundColor: 'var(--surface-card)',
                  color: 'var(--chalk)',
                  fontFamily: 'var(--font-numeric)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Torna alla Home
              </button>
            )}
          </div>
        </header>

        {/* Barra Filtri Combinabili */}
        <section
          aria-label="Filtri del catalogo carte"
          data-testid="archive-filters-panel"
          style={{
            padding: '14px 16px',
            borderRadius: '10px',
            backgroundColor: 'var(--panel-soft)',
            border: '1px solid var(--panel-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* Riga 1: Ricerca testuale + Pulsanti Era + Pulsante Reset */}
          <label>Civiltà<select value={civilizationFilter} onChange={e=>setCivilizationFilter(e.target.value)}><option value="all">Tutte</option>{Object.entries(CIVILIZATIONS).map(([id,c])=><option key={id} value={id}>{c.name} e comuni</option>)}</select></label>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              gap: '12px',
            }}
          >
            <div
              style={{
                flex: '1 1 240px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <label
                htmlFor="archive-search-input"
                className="font-numeric"
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: 'var(--chalk-muted)',
                }}
              >
                Cerca per nome, testo regole o parola chiave
              </label>
              <input
                id="archive-search-input"
                type="search"
                className="touch-target"
                data-testid="archive-search-input"
                placeholder="Es. Cavaliere, Impalamento, +1 DEM, Cibo..."
                value={searchQuery}
                onChange={(ev) => setSearchQuery(ev.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--panel-border)',
                  backgroundColor: 'var(--surface-card)',
                  color: 'var(--chalk)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.95rem',
                }}
              />
            </div>

            <div
              role="group"
              aria-label="Filtra per Era"
              style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}
            >
              {ERA_OPTIONS.map((opt) => {
                const active = eraFilter === opt.value;
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    className="touch-target"
                    data-testid={`archive-filter-era-${String(opt.value)}`}
                    aria-pressed={active}
                    onClick={() => setEraFilter(opt.value)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: '6px',
                      border: active
                        ? '1.5px solid var(--brass)'
                        : '1px solid rgba(233, 229, 214, 0.22)',
                      backgroundColor: active ? 'rgba(181, 142, 72, 0.25)' : 'var(--surface-card)',
                      color: 'var(--chalk)',
                      fontFamily: 'var(--font-numeric)',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="touch-target"
              data-testid="archive-reset-filters-btn"
              disabled={!hasActiveFilters}
              onClick={handleResetFilters}
              style={{
                padding: '7px 14px',
                borderRadius: '6px',
                border: '1px solid rgba(233, 229, 214, 0.3)',
                backgroundColor: hasActiveFilters ? 'rgba(168, 64, 77, 0.25)' : 'var(--panel-soft)',
                color: 'var(--chalk)',
                fontFamily: 'var(--font-numeric)',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: hasActiveFilters ? 'pointer' : 'not-allowed',
                opacity: hasActiveFilters ? 1 : 0.6,
              }}
            >
              Azzera Filtri
            </button>
          </div>

          {/* Riga 2: Selettori Tipo, Categoria e Linea */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label
                htmlFor="archive-type-select"
                className="font-numeric"
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: 'var(--chalk-muted)',
                }}
              >
                Tipo Carta
              </label>
              <select
                id="archive-type-select"
                className="touch-target"
                data-testid="archive-filter-type"
                value={typeFilter}
                onChange={(ev) => setTypeFilter(ev.target.value as ArchiveTypeFilter)}
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--panel-border)',
                  backgroundColor: 'var(--surface-card)',
                  color: 'var(--chalk)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.92rem',
                }}
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label
                htmlFor="archive-category-select"
                className="font-numeric"
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: 'var(--chalk-muted)',
                }}
              >
                Categoria Unità
              </label>
              <select
                id="archive-category-select"
                className="touch-target"
                data-testid="archive-filter-category"
                value={categoryFilter}
                onChange={(ev) => setCategoryFilter(ev.target.value as ArchiveCategoryFilter)}
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--panel-border)',
                  backgroundColor: 'var(--surface-card)',
                  color: 'var(--chalk)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.92rem',
                }}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label
                htmlFor="archive-line-select"
                className="font-numeric"
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: 'var(--chalk-muted)',
                }}
              >
                Linea di Schieramento
              </label>
              <select
                id="archive-line-select"
                className="touch-target"
                data-testid="archive-filter-line"
                value={lineFilter}
                onChange={(ev) => setLineFilter(ev.target.value as ArchiveLineFilter)}
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--panel-border)',
                  backgroundColor: 'var(--surface-card)',
                  color: 'var(--chalk)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.92rem',
                }}
              >
                {LINE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Legenda rapida delle 6 parole chiave con filtro rapido al click */}
        <section
          aria-label="Glossario rapido parole chiave"
          data-testid="archive-keywords-bar"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '8px',
          }}
        >
          {ALL_KEYWORDS.map((kw) => (
            <div
              key={kw}
              data-testid={`archive-keyword-ref-${kw}`}
              style={{
                padding: '8px 10px',
                borderRadius: '8px',
                backgroundColor: 'var(--panel)',
                border: '1px solid var(--panel-border)',
                fontSize: '0.82rem',
              }}
            >
              <strong className="font-display" style={{ color: 'var(--brass)', display: 'block' }}>
                {kw}
              </strong>
              <span style={{ color: 'var(--chalk-muted)' }}>{KEYWORD_TOOLTIPS_IT[kw]}</span>
            </div>
          ))}
        </section>

        {/* Griglia Carte o Stato Vuoto */}
        {filteredCards.length === 0 ? (
          <section
            data-testid="archive-empty-state"
            style={{
              padding: '28px 20px',
              borderRadius: '10px',
              backgroundColor: 'var(--panel-soft)',
              border: '1px dashed rgba(181, 142, 72, 0.45)',
              textAlign: 'center',
            }}
          >
            <p style={{ margin: '0 0 12px 0', fontSize: '1.05rem' }}>
              Nessuna carta corrisponde ai filtri selezionati.
            </p>
            <button
              type="button"
              className="touch-target"
              onClick={handleResetFilters}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid var(--brass)',
                backgroundColor: 'var(--surface-card)',
                color: 'var(--chalk)',
                fontFamily: 'var(--font-numeric)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Mostra tutte le 45 carte
            </button>
          </section>
        ) : (
          <section
            aria-label="Catalogo delle carte filtrate"
            data-testid="archive-cards-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))',
              gap: '14px',
              justifyItems: 'center',
            }}
          >
            {filteredCards.map((card) => (
              <div
                key={card.id}
                data-testid={`archive-card-cell-${card.id}`}
                style={{ width: '100%', maxWidth: '185px' }}
              >
                <Card
                  card={card}
                  onSelect={(id) => handleOpenInspect(id)}
                  onInspect={(id) => handleOpenInspect(id)}
                />
              </div>
            ))}
          </section>
        )}
      </div>

      {onInspectCard === undefined && (
        <CardInspectModal
          version="2.0"
          cardId={localInspectedCardId}
          onClose={() => setLocalInspectedCardId(null)}
        />
      )}
    </main>
  );
}
