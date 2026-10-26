// @vitest-environment jsdom
import { CARD_CATALOG, getCard, KEYWORD_TOOLTIPS_IT } from '@epochs/content';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Card, LONG_PRESS_MS } from '../src/components/card/Card.js';
import { CardInspectModal } from '../src/components/card/CardInspectModal.js';
import { CardToken } from '../src/components/card/CardToken.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('<Card>, <CardToken> and <CardInspectModal>', () => {
  it('renders an Economy card (e1_farm) with positive cost pips, production text and flavor', () => {
    const farmCard = getCard('e1_farm');
    render(<Card cardId="e1_farm" playable />);

    const cardEl = screen.getByTestId('card-e1_farm');
    expect(cardEl.getAttribute('data-card-type')).toBe('economy');
    expect(cardEl.getAttribute('data-era')).toBe('1');
    expect(cardEl.getAttribute('data-playable')).toBe('true');

    // Verifica le 5 fasce strutturali
    expect(cardEl.querySelector('[data-card-band="header"]')).not.toBeNull();
    expect(
      cardEl.querySelector('[data-card-band="illustration"]'),
    ).not.toBeNull();
    expect(cardEl.querySelector('[data-card-band="type-line"]')).not.toBeNull();
    expect(cardEl.querySelector('[data-card-band="text-box"]')).not.toBeNull();
    expect(cardEl.querySelector('[data-card-band="footer"]')).not.toBeNull();

    // Verifica che siano mostrati solo i pip delle risorse con costo > 0
    const expectedPips = (['food', 'wood', 'metal'] as const).filter(
      (res) => farmCard.rules.cost[res] > 0,
    );
    const costPips = cardEl.querySelectorAll('[data-cost-resource]');
    expect(costPips.length).toBe(expectedPips.length);

    const rulesText = screen.getByTestId('card-rules-text');
    expect(rulesText.textContent).toContain('Produzione: +1 Cibo.');

    const flavorText = screen.getByTestId('card-flavor-text');
    expect(flavorText.textContent).toBe(farmCard.text.flavor);
  });

  it('renders Unit cards in healthy, buffed (--brass) and damaged (--crimson) states', () => {
    const unitCard = getCard('u1_arc_h');
    const baseAtk = unitCard.rules.atk ?? 0;
    const baseDem = unitCard.rules.dem ?? 0;
    const maxHp = unitCard.rules.hp ?? 0;

    const { rerender } = render(<Card cardId="u1_arc_h" />);

    const cardEl = screen.getByTestId('card-u1_arc_h');
    const atkBadge = cardEl.querySelector('[data-stat="atk"]')!;
    const demBadge = cardEl.querySelector('[data-stat="dem"]')!;
    const hpBadge = cardEl.querySelector('[data-stat="hp"]')!;

    // Stato sano base
    expect(atkBadge.getAttribute('data-stat-state')).toBe('normal');
    expect(atkBadge.textContent).toBe(String(baseAtk));
    expect(demBadge.getAttribute('data-stat-state')).toBe('normal');
    expect(demBadge.textContent).toBe(String(baseDem));
    expect(hpBadge.getAttribute('data-stat-state')).toBe('normal');
    expect(hpBadge.textContent).toBe(String(maxHp));

    // Stato con buff ATK (+2), buff DEM (+1 da Altoforno) e danno HP (currentHp = 1)
    rerender(
      <Card
        cardId="u1_arc_h"
        atkMod={2}
        demBonus={1}
        currentHp={1}
        coveredForOpponent
      />,
    );

    expect(atkBadge.getAttribute('data-stat-state')).toBe('buffed');
    expect(atkBadge.className).toContain('epochs-card__stat-badge--buffed');
    expect(atkBadge.textContent).toBe(String(baseAtk + 2));

    expect(demBadge.getAttribute('data-stat-state')).toBe('buffed');
    expect(demBadge.className).toContain('epochs-card__stat-badge--buffed');
    expect(demBadge.textContent).toBe(String(baseDem + 1));

    expect(hpBadge.getAttribute('data-stat-state')).toBe('damaged');
    expect(hpBadge.className).toContain('epochs-card__stat-badge--damaged');
    expect(hpBadge.textContent).toBe(`1/${maxHp}`);

    expect(screen.getByTestId('card-covered-badge-u1_arc_h')).not.toBeNull();
  });

  it('renders Instant and Conversion cards with correct typeLine and rulesText', () => {
    const { rerender } = render(<Card cardId="i2_sab" />);
    expect(screen.getByTestId('card-i2_sab').getAttribute('data-card-type')).toBe(
      'instant',
    );
    expect(screen.getByTestId('card-rules-text').textContent).toContain(
      'Pre-Battaglia (0 Slot)',
    );

    rerender(<Card cardId="e3_gld" />);
    expect(
      screen.getByTestId('card-e3_gld').getAttribute('data-card-type'),
    ).toBe('conversion');
    expect(screen.getByTestId('card-rules-text').textContent).toContain(
      '0 Slot. Sacrifica 1 tuo Edificio',
    );

    rerender(<Card cardId="e3_frn" />);
    expect(
      screen.getByTestId('card-e3_frn').getAttribute('data-card-type'),
    ).toBe('conversion');
    expect(screen.getByTestId('card-rules-text').textContent).toContain(
      '+1 DEM alle tue unità in Era III.',
    );
  });

  it('renders <CardToken> with buffed/damaged badges and triggers inspect on double click', () => {
    const onInspect = vi.fn();
    const onSelect = vi.fn();
    render(
      <CardToken
        cardId="u2_cav_h"
        atkMod={1}
        demBonus={1}
        currentHp={1}
        onSelect={onSelect}
        onInspect={onInspect}
      />,
    );

    const tokenEl = screen.getByTestId('card-token-u2_cav_h');
    expect(
      tokenEl
        .querySelector('[data-token-stat="atk"]')
        ?.getAttribute('data-stat-state'),
    ).toBe('buffed');
    expect(
      tokenEl
        .querySelector('[data-token-stat="dem"]')
        ?.getAttribute('data-stat-state'),
    ).toBe('buffed');
    expect(
      tokenEl
        .querySelector('[data-token-stat="hp"]')
        ?.getAttribute('data-stat-state'),
    ).toBe('damaged');

    fireEvent.click(tokenEl);
    expect(onSelect).toHaveBeenCalledWith('u2_cav_h');

    fireEvent.doubleClick(tokenEl);
    expect(onInspect).toHaveBeenCalledWith('u2_cav_h');
  });

  it('opens <CardInspectModal> via 250ms long-press, displays keyword tooltips, and closes on Esc or backdrop click', () => {
    vi.useFakeTimers();

    function InspectHarness({
      initialCardId,
    }: {
      initialCardId: string;
    }): ReactElement {
      const [inspectedId, setInspectedId] = useState<string | null>(null);
      return (
        <div>
          <Card cardId={initialCardId} onInspect={(id) => setInspectedId(id)} />
          <CardInspectModal
            cardId={inspectedId}
            onClose={() => setInspectedId(null)}
          />
        </div>
      );
    }

    render(<InspectHarness initialCardId="u3_arc_h" />);
    expect(screen.queryByTestId('card-inspect-modal')).toBeNull();

    const cardEl = screen.getByTestId('card-u3_arc_h');
    fireEvent.pointerDown(cardEl);
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS);
    });
    fireEvent.pointerUp(cardEl);

    const modal = screen.getByTestId('card-inspect-modal');
    expect(modal.getAttribute('data-inspected-card-id')).toBe('u3_arc_h');

    // u3_arc_h ha Tiro e Demolizione (DEM)
    const tiroBox = screen.getByTestId('keyword-tooltip-Tiro');
    expect(tiroBox.textContent).toContain(KEYWORD_TOOLTIPS_IT.Tiro);
    const demBox = screen.getByTestId('keyword-tooltip-Demolizione (DEM)');
    expect(demBox.textContent).toContain(
      KEYWORD_TOOLTIPS_IT['Demolizione (DEM)'],
    );

    // Chiusura tramite tasto Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('card-inspect-modal')).toBeNull();

    // Riapertura tramite tasto dedicato 'i' e chiusura cliccando il backdrop esterno
    fireEvent.keyDown(cardEl, { key: 'i' });
    expect(screen.getByTestId('card-inspect-modal')).not.toBeNull();
    fireEvent.click(screen.getByTestId('card-inspect-backdrop'));
    expect(screen.queryByTestId('card-inspect-modal')).toBeNull();
  });

  it('renders all 6 keyword tooltips across representative cards in <CardInspectModal>', () => {
    const onClose = vi.fn();

    // 1. Impalamento + Demolizione (u1_spr_l)
    const { rerender } = render(
      <CardInspectModal cardId="u1_spr_l" onClose={onClose} />,
    );
    expect(
      screen.getByTestId('keyword-tooltip-Impalamento').textContent,
    ).toContain(KEYWORD_TOOLTIPS_IT.Impalamento);

    // 2. Accerchiamento (u1_cav_l)
    rerender(<CardInspectModal cardId="u1_cav_l" onClose={onClose} />);
    expect(
      screen.getByTestId('keyword-tooltip-Accerchiamento').textContent,
    ).toContain(KEYWORD_TOOLTIPS_IT.Accerchiamento);

    // 3. Istantanea (i1_arr)
    rerender(<CardInspectModal cardId="i1_arr" onClose={onClose} />);
    expect(
      screen.getByTestId('keyword-tooltip-Istantanea').textContent,
    ).toContain(KEYWORD_TOOLTIPS_IT.Istantanea);

    // 4. Riconversione + Demolizione (e3_frn Altoforno Reale)
    rerender(<CardInspectModal cardId="e3_frn" onClose={onClose} />);
    expect(
      screen.getByTestId('keyword-tooltip-Riconversione').textContent,
    ).toContain(KEYWORD_TOOLTIPS_IT.Riconversione);
    expect(
      screen.getByTestId('keyword-tooltip-Demolizione (DEM)').textContent,
    ).toContain(KEYWORD_TOOLTIPS_IT['Demolizione (DEM)']);

    // Verifica che tutte le 45 carte del catalogo si renderizzino senza eccezioni
    for (const card of CARD_CATALOG.allCards) {
      rerender(<CardInspectModal card={card} onClose={onClose} />);
      expect(
        screen.getByTestId('card-inspect-modal').getAttribute(
          'data-inspected-card-id',
        ),
      ).toBe(card.id);
    }
  });
});
