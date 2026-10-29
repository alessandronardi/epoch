// @vitest-environment jsdom
import { CARD_CATALOG, KEYWORD_TOOLTIPS_IT, getCard } from '@epochs/content';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardArtPicture } from '../src/components/card/CardArtPicture.js';
import { CardArchiveScreen } from '../src/screens/CardArchiveScreen.js';
import { QuickRulesScreen } from '../src/screens/QuickRulesScreen.js';
import { HomeScreen } from '../src/screens/HomeScreen.js';

afterEach(() => {
  cleanup();
});

describe('<CardArchiveScreen> and <QuickRulesScreen>', () => {
  it('renders all 45 cards by default with <CardArtPicture> responsive AVIF/WebP sources and SVG fallback', () => {
    render(<CardArchiveScreen />);

    expect(screen.getByTestId('archive-results-count').textContent).toContain(
      '45 / 45 carte',
    );

    const grid = screen.getByTestId('archive-cards-grid');
    expect(grid.querySelectorAll('[data-card-id]').length).toBe(45);

    // Check <CardArtPicture> structure on a card
    const pictureEl = screen.getByTestId('card-art-picture-e1_farm');
    const sources = pictureEl.querySelectorAll('source');
    expect(sources.length).toBe(2);
    expect(sources[0]?.getAttribute('type')).toBe('image/avif');
    expect(sources[0]?.getAttribute('srcset')).toContain(
      '/cards/e1_farm-256.avif 256w',
    );
    expect(sources[0]?.getAttribute('srcset')).toContain(
      '/cards/e1_farm-512.avif 512w',
    );
    expect(sources[0]?.getAttribute('srcset')).toContain(
      '/cards/e1_farm-1024.avif 1024w',
    );
    expect(sources[1]?.getAttribute('type')).toBe('image/webp');
    expect(sources[1]?.getAttribute('srcset')).toContain(
      '/cards/e1_farm-512.webp 512w',
    );

    const img = pictureEl.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/cards/placeholders/e1_farm.svg');
    expect(img?.getAttribute('alt')).toBe(
      CARD_CATALOG.cardsById['e1_farm']?.art.alt.it,
    );
  });

  it('filters cards by Era (15 per Era), Type, Category, Line and textual search query, and resets filters', () => {
    render(<CardArchiveScreen />);

    // 1. Filter by Era I, II, III (15 cards each)
    for (const era of [1, 2, 3] as const) {
      fireEvent.click(screen.getByTestId(`archive-filter-era-${era}`));
      expect(screen.getByTestId('archive-results-count').textContent).toContain(
        '15 / 45 carte',
      );
    }

    // Back to all Eras
    fireEvent.click(screen.getByTestId('archive-filter-era-all'));
    expect(screen.getByTestId('archive-results-count').textContent).toContain(
      '45 / 45 carte',
    );

    // 2. Filter by Type: conversion (2 cards: e3_gld, e3_frn)
    fireEvent.change(screen.getByTestId('archive-filter-type'), {
      target: { value: 'conversion' },
    });
    expect(screen.getByTestId('archive-results-count').textContent).toContain(
      '2 / 45 carte',
    );
    expect(screen.getByTestId('card-e3_gld')).toBeDefined();
    expect(screen.getByTestId('card-e3_frn')).toBeDefined();

    // 3. Reset filters
    fireEvent.click(screen.getByTestId('archive-reset-filters-btn'));
    expect(screen.getByTestId('archive-results-count').textContent).toContain(
      '45 / 45 carte',
    );

    // 4. Filter by Category (cavalry -> 6 cards) + Era II (2 cards: u2_cav_l, u2_cav_h)
    fireEvent.change(screen.getByTestId('archive-filter-category'), {
      target: { value: 'cavalry' },
    });
    expect(screen.getByTestId('archive-results-count').textContent).toContain(
      '6 / 45 carte',
    );
    fireEvent.click(screen.getByTestId('archive-filter-era-2'));
    expect(screen.getByTestId('archive-results-count').textContent).toContain(
      '2 / 45 carte',
    );

    // 5. Filter by Line (rear in Era II -> incompatible with cavalry which is center -> empty state)
    fireEvent.change(screen.getByTestId('archive-filter-line'), {
      target: { value: 'rear' },
    });
    expect(screen.getByTestId('archive-results-count').textContent).toContain(
      '0 / 45 carte',
    );
    expect(screen.getByTestId('archive-empty-state')).toBeDefined();

    // 6. Reset and test textual search query (by name and by rules text)
    fireEvent.click(screen.getByTestId('archive-reset-filters-btn'));
    const searchInput = screen.getByTestId('archive-search-input');
    fireEvent.change(searchInput, { target: { value: 'Altoforno Reale' } });
    expect(screen.getByTestId('archive-results-count').textContent).toContain(
      '1 / 45 carte',
    );
    expect(screen.getByTestId('card-e3_frn')).toBeDefined();

    fireEvent.change(searchInput, { target: { value: 'Impalamento' } });
    expect(screen.getByTestId('archive-results-count').textContent).toContain(
      '6 / 45 carte',
    );
  });

  it('opens <CardInspectModal> with keyword tooltips when selecting a card in <CardArchiveScreen>', () => {
    render(<CardArchiveScreen />);

    fireEvent.click(screen.getByTestId('card-u2_spr_h'));
    const modal = screen.getByTestId('card-inspect-modal');
    expect(modal.getAttribute('data-inspected-card-id')).toBe('u2_spr_h');
    expect(
      screen.getByTestId('keyword-tooltip-Impalamento').textContent,
    ).toContain(KEYWORD_TOOLTIPS_IT.Impalamento);
    expect(
      screen.getByTestId('keyword-tooltip-Demolizione (DEM)').textContent,
    ).toContain(KEYWORD_TOOLTIPS_IT['Demolizione (DEM)']);

    fireEvent.click(screen.getByTestId('card-inspect-close'));
    expect(screen.queryByTestId('card-inspect-modal')).toBeNull();
  });

  it('opens the rules from the home menu', () => {
    const onNavigate = vi.fn();
    render(<HomeScreen onNavigate={onNavigate} onStartBotMatch={vi.fn()} onStartHotSeatMatch={vi.fn()} />);
    const button = screen.getByTestId('nav-full-rules-btn');
    expect(button.getAttribute('aria-label')).toBe('Regolamento');
    expect(button.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(button);
    expect(onNavigate).toHaveBeenCalledWith('rules');
  });

  it('renders <QuickRulesScreen> with all 6 normative sections and all 6 keyword tooltips', () => {
    const onBackHome = vi.fn();
    render(<QuickRulesScreen onBackHome={onBackHome} />);

    expect(screen.getByTestId('screen-rules')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Regolamento', level: 1 })).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Indice del regolamento' })).toBeDefined();
    expect(screen.getByTestId('rules-section-eras').textContent).toContain('scegliendo le carte da scartare');
    expect(screen.getByTestId('rules-section-settings').textContent).toContain('partita locale Hot-Seat');
    expect(screen.getByTestId('rules-section-settings').textContent).toContain('partite online');
    expect(
      screen.getByTestId('rules-section-eras').textContent,
    ).toContain('20 carte per Era');
    expect(
      screen.getByTestId('rules-section-economy').textContent,
    ).toContain('4 Cibo, 4 Legno, 0 Metallo');
    expect(
      screen.getByTestId('rules-section-development').textContent,
    ).toContain('4 slot in Era I');
    expect(
      screen.getByTestId('rules-section-battle').textContent,
    ).toContain('Fase 1 — Tiro degli Arcieri');
    expect(
      screen.getByTestId('rules-section-siege').textContent,
    ).toContain('Base nuova Era + floor(Mura residue / 2)');

    for (const [kw, desc] of Object.entries(KEYWORD_TOOLTIPS_IT)) {
      const box = screen.getByTestId(`rules-keyword-${kw}`);
      expect(box.textContent).toContain(kw);
      expect(box.textContent).toContain(desc);
    }

    fireEvent.click(screen.getByTestId('back-to-home-btn'));
    expect(onBackHome).toHaveBeenCalledTimes(1);
  });

  it('renders standalone <CardArtPicture> by cardId reflecting final and placeholder statuses', () => {
    const { rerender } = render(<CardArtPicture cardId="u3_sig_h" />);
    const picFinal = screen.getByTestId('card-art-picture-u3_sig_h');
    expect(picFinal.getAttribute('data-card-art-status')).toBe('final');

    const cardWithPlaceholder = {
      ...getCard('u3_sig_h'),
      art: {
        ...getCard('u3_sig_h').art,
        status: 'placeholder' as const,
      },
    };
    rerender(<CardArtPicture card={cardWithPlaceholder} />);
    const picPlaceholder = screen.getByTestId('card-art-picture-u3_sig_h');
    expect(picPlaceholder.getAttribute('data-card-art-status')).toBe('placeholder');
  });
});
