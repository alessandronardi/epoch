// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  BoardCardInspection,
  CARD_HOVER_DELAY_MS,
} from '../src/components/card/BoardCardInspection.js';
import { Card } from '../src/components/card/Card.js';
import { CardToken } from '../src/components/card/CardToken.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function pointer(node: Element, type: string, pointerType = 'mouse') {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, { pointerType: { value: pointerType }, buttons: { value: 0 } });
  fireEvent(node, event);
}

it('enlarges a card after one second, without a modal, and cancels on leave or Escape', () => {
  vi.useFakeTimers();
  const inspect = vi.fn();
  render(
    <BoardCardInspection>
      <Card cardId="e1_farm" onInspect={inspect} />
    </BoardCardInspection>,
  );
  const card = screen.getByTestId('card-e1_farm');
  pointer(card, 'pointerover');
  act(() => vi.advanceTimersByTime(CARD_HOVER_DELAY_MS - 1));
  expect(screen.queryByTestId('board-card-preview')).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByTestId('board-card-preview').textContent).toContain('Produzione');
  expect(inspect).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
  pointer(card, 'pointerout');
  expect(screen.queryByTestId('board-card-preview')).toBeNull();
  pointer(card, 'pointerover');
  act(() => vi.advanceTimersByTime(500));
  pointer(card, 'pointerout');
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByTestId('board-card-preview')).toBeNull();
  fireEvent.focus(card);
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByTestId('board-card-preview')).toBeDefined();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByTestId('board-card-preview')).toBeNull();
});

it('allows keyboard inspection of compact field tokens and dismisses on scrolling', () => {
  render(
    <BoardCardInspection>
      <CardToken cardId="u1_inf_l" currentHp={1} />
    </BoardCardInspection>,
  );
  const token = screen.getByTestId('card-token-u1_inf_l');
  fireEvent.keyDown(token, { key: 'i' });
  expect(screen.getByTestId('board-card-preview').textContent).toContain('1/');
  fireEvent.scroll(document);
  expect(screen.queryByTestId('board-card-preview')).toBeNull();
});

it('preserves the explicit inspection flow inside choice dialogs', () => {
  const inspect = vi.fn();
  render(
    <BoardCardInspection>
      <div role="dialog">
        <Card cardId="e1_farm" onInspect={inspect} />
      </div>
    </BoardCardInspection>,
  );
  fireEvent.doubleClick(screen.getByTestId('card-e1_farm'));
  expect(inspect).toHaveBeenCalledWith('e1_farm');
  expect(screen.queryByTestId('board-card-preview')).toBeNull();
});
