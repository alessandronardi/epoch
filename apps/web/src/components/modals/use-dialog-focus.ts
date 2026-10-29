import { useEffect, type RefObject } from 'react';

/** Gestisce anche dialoghi sovrapposti, come l'ispezione sopra il Mulligan. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const dialog = ref.current?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const oldTabIndex = dialog.getAttribute('tabindex');
    dialog.tabIndex = -1;
    if (!dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true });
    const handleTab = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return;
      const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
      if (dialogs.at(-1) !== dialog) return;
      const controls = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
        ),
      ].filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleTab);
    return () => {
      document.removeEventListener('keydown', handleTab);
      if (oldTabIndex === null) dialog.removeAttribute('tabindex');
      else dialog.setAttribute('tabindex', oldTabIndex);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [enabled, ref]);
}
