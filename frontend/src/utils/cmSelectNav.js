/**
 * Native `<select size="1">` Enter sequence inside CommonModal:
 * 1) Enter — open picker (showPicker / click)
 * 2) Enter — while list is open, event is not intercepted (`:open`); after close,
 *    `change` marks "picked"; if no `change`, a plain Enter marks picked so step 3 can run
 * 3) Enter — focus next field
 */

const state = new WeakMap();

export function cmSelectNavReset(sel) {
  if (sel) state.delete(sel);
}

function get(sel) {
  return state.get(sel) || { opened: false, picked: false };
}

function set(sel, next) {
  state.set(sel, next);
}

/** Call when the user opened the list via our Enter handler. */
export function cmSelectNavMarkOpened(sel) {
  const s = get(sel);
  set(sel, { ...s, opened: true });
}

/** Call on `change` so the next closed Enter advances focus. */
export function cmSelectNavMarkPickedFromChange(sel) {
  const s = get(sel);
  if (!s.opened) return;
  set(sel, { opened: true, picked: true });
}

/** Second closed Enter without a change event (same value / dismissed): treat as confirm. */
export function cmSelectNavMarkPickedSynthetic(sel) {
  set(sel, { opened: true, picked: true });
}

/** True when the browser reports the native option list is open (Chromium 120+). */
export function nativeSelectListOpen(sel) {
  if (!sel || String(sel.tagName || "").toUpperCase() !== "SELECT") return false;
  try {
    if (typeof CSS !== "undefined" && CSS.supports?.("selector(:open)")) {
      return Boolean(sel.matches(":open"));
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * @returns {"open" | "pick" | "next" | null} action for this keydown; caller handles preventDefault
 */
export function cmSelectNavEnterAction(sel) {
  if (!sel || String(sel.tagName || "").toUpperCase() !== "SELECT") return null;
  if (Number(sel.size) > 1) return "next";

  if (nativeSelectListOpen(sel)) return null;

  const s = get(sel);
  if (!s.opened) return "open";
  if (!s.picked) return "pick";
  return "next";
}
