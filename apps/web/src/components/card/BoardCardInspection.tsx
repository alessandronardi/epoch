import { useDndContext } from '@dnd-kit/core';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Card, type CardProps } from './Card.js';

export const CARD_HOVER_DELAY_MS = 1000;
type PreviewCard = Pick<CardProps, 'cardId' | 'atkMod' | 'demBonus' | 'currentHp'>;
type Inspection = { card: PreviewCard; anchor: HTMLElement };
interface InspectionActions {
  schedule: (card: PreviewCard, anchor: HTMLElement) => void;
  show: (card: PreviewCard, anchor: HTMLElement) => void;
  close: () => void;
}
const InspectionContext = createContext<InspectionActions | null>(null);

/** One non-blocking enlarged card for the whole table, including compact tokens. */
export function BoardCardInspection({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<Inspection | null>(null);
  const { active } = useDndContext();
  const dragging = useRef(false);
  dragging.current = active !== null;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const close = () => {
    cancelTimer();
    setPreview(null);
  };
  const show = (card: PreviewCard, anchor: HTMLElement) => {
    cancelTimer();
    if (anchor.isConnected && !dragging.current) setPreview({ card, anchor });
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', close);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      cancelTimer();
      document.removeEventListener('keydown', escape);
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, []);
  useEffect(() => {
    if (active) close();
  }, [active]);
  useEffect(() => {
    if (preview && !preview.anchor.isConnected) close();
  });
  const rect = preview?.anchor.getBoundingClientRect();
  const width = Math.min(320, window.innerWidth - 24, (window.innerHeight - 32) / 1.4);
  const height = width * 1.4;
  const left = rect
    ? Math.max(
        12,
        Math.min(
          window.innerWidth - width - 12,
          rect.right + width + 24 < window.innerWidth ? rect.right + 16 : rect.left - width - 16,
        ),
      )
    : 12;
  const top = rect
    ? Math.max(
        12,
        Math.min(window.innerHeight - height - 12, rect.top + rect.height / 2 - height / 2),
      )
    : 12;
  return (
    <InspectionContext.Provider
      value={{
        close,
        show,
        schedule: (card, anchor) => {
          cancelTimer();
          setPreview(null);
          timer.current = setTimeout(() => show(card, anchor), CARD_HOVER_DELAY_MS);
        },
      }}
    >
      {children}
      {preview &&
        createPortal(
          <InspectionContext.Provider value={null}>
            <div
              className="board-card-preview"
              data-testid="board-card-preview"
              aria-hidden="true"
              inert
              style={{ width, left, top }}
            >
              <Card {...preview.card} />
            </div>
          </InspectionContext.Provider>,
          document.body,
        )}
    </InspectionContext.Provider>
  );
}

export function useBoardCardInspection(card: PreviewCard, fallback?: (cardId: string) => void) {
  const actions = useContext(InspectionContext);
  const anchor = useRef<HTMLElement | null>(null);
  if (!actions) return null;
  return {
    ref: (node: HTMLElement | null) => {
      anchor.current = node;
    },
    inspect: () => {
      if (anchor.current?.closest('[role=dialog]')) {
        if (card.cardId) fallback?.(card.cardId);
      } else if (anchor.current) actions.show(card, anchor.current);
    },
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      anchor.current = event.currentTarget;
      if (
        event.pointerType === 'mouse' &&
        event.buttons === 0 &&
        !event.currentTarget.closest('[role=dialog]')
      )
        actions.schedule(card, event.currentTarget);
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse') actions.close();
    },
    onFocus: (event: { currentTarget: HTMLElement }) => {
      anchor.current = event.currentTarget;
      if (!event.currentTarget.closest('[role=dialog]'))
        actions.schedule(card, event.currentTarget);
    },
    onBlur: actions.close,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      anchor.current = event.currentTarget;
      actions.close();
    },
  };
}
