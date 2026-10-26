// @ts-nocheck

// Global fast data-entry navigation:
// pressing Enter inside a <form> input moves focus to the next field
// (same behavior as Tab), so users can fill entire forms with one hand on the keyboard.
// On the last field Enter keeps the default behavior (submitting the form).
export function installEnterNavigation(): () => void {
  const handler = (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (!t || t.tagName !== 'INPUT') return;
    const input = t as HTMLInputElement;
    const skip = ['button', 'submit', 'file', 'checkbox', 'radio', 'hidden', 'range', 'color', 'reset', 'image'];
    if (skip.includes(input.type)) return;
    if (input.readOnly) return;

    const scope: ParentNode = input.form || t.closest('form');
    if (!scope) return; // only inside real forms, never hijack search boxes / inline grids

    const selector =
      'input:not([type=file]):not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=reset]), select, textarea';
    const controls = Array.from(scope.querySelectorAll<HTMLElement>(selector)).filter(
      (el) => !el.hasAttribute('disabled') && !el.hasAttribute('readonly') && el.getClientRects().length > 0
    );
    const idx = controls.indexOf(input);
    if (idx === -1) return;
    const next = controls[idx + 1];
    if (!next) return; // last field → allow default (form submit)

    e.preventDefault();
    (next as HTMLElement).focus();
    if (next instanceof HTMLInputElement && next.select && !next.readOnly) {
      try { next.select(); } catch {}
    }
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}
