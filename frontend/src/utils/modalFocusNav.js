/**
 * Shared modal keyboard navigation.
 * - CommonModal (capture): Enter → next field (required-first when marked), Shift+Enter → primary submit.
 * - `focusAdjacentModalField`: optional legacy chain including in-form buttons via `buttonDataAttr`.
 */

/** Pixels: elements within this vertical band are treated as one row (left-to-right). */
const VISUAL_ROW_EPS = 8;

/** Match CommonModal `getFocusables` - body fields only (no footer buttons). */
export const CM_MODAL_FIELD_FOCUSABLE_SELECTOR =
  'input:not([type="hidden"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled]), [contenteditable=""]:not([aria-disabled="true"]), [contenteditable="true"]:not([aria-disabled="true"])';

function cmFieldVisible(el) {
  if (!el) return false;
  if (el.hidden) return false;
  const rect = el.getBoundingClientRect?.();
  if (!rect) return true;
  return rect.width > 0 && rect.height > 0;
}

export function getCmModalFieldFocusables(panel) {
  if (!panel) return [];
  const raw = [...panel.querySelectorAll(CM_MODAL_FIELD_FOCUSABLE_SELECTOR)].filter(
    (el) => cmFieldVisible(el) && el.tabIndex !== -1
  );
  return sortFocusablesByVisualOrder(raw);
}

export function isCmModalFieldRequired(el) {
  if (!el?.matches) return false;
  if (el.matches("[required], [aria-required='true']")) return true;
  return Boolean(el.closest?.("[data-cm-required='true']"));
}

function trySelectFieldValue(el) {
  const tag = String(el?.tagName || "").toLowerCase();
  if (tag === "input") {
    const t = String(el.type || "text").toLowerCase();
    if (["text", "search", "url", "tel", "email", "password", "number", "date", "time"].includes(t)) {
      try {
        el.select?.();
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Move focus to the next logical field inside `panel` (top-to-bottom, left-to-right).
 * Scans forward from the active field, then the segment above the current row; first prefers
 * a `required` field in that segment, otherwise the next field. After the last focusable,
 * wraps to index 0 (same behaviour for a single focusable: refocus + select).
 * @returns {boolean} true if focus was applied (including wrap to first)
 */
export function focusNextCmModalField(panel, activeEl) {
  const list = getCmModalFieldFocusables(panel);
  if (!list.length) return false;
  const n = list.length;

  function applyFocus(el) {
    if (!el) return false;
    try {
      el.focus({ preventScroll: false });
    } catch {
      el.focus?.();
    }
    scrollModalFieldIntoView(el);
    trySelectFieldValue(el);
    return true;
  }

  const start = activeEl ? list.indexOf(activeEl) : -1;
  if (start < 0) return applyFocus(list[0]);

  function scanRange(from, to) {
    if (from > to) return null;
    for (let i = from; i <= to; i++) {
      if (isCmModalFieldRequired(list[i])) return list[i];
    }
    return list[from];
  }

  let next = null;
  if (start < n - 1) next = scanRange(start + 1, n - 1);
  if (!next && start > 0) next = scanRange(0, start - 1);

  // After the last field (or single-field form), wrap to the first focusable again.
  if (!next || next === activeEl) {
    next = list[(start + 1) % n];
  }
  return applyFocus(next);
}

export function getTopMostCmRoot() {
  if (typeof document === "undefined") return null;
  const roots = document.querySelectorAll(".mcm, .cmRoot");
  return roots.length ? roots[roots.length - 1] : null;
}

/**
 * True if `panel` belongs to the front-most stacked CommonModal (`.mcm` / legacy `.cmRoot`).
 */
export function isCmPanelTopStackLayer(panel) {
  if (!panel) return true;
  const mine = panel.closest(".mcm, .cmRoot");
  const top = getTopMostCmRoot();
  return !top || mine === top;
}

/**
 * Reading order: top-to-bottom, then left-to-right within a row (handles flex/grid reorder).
 */
export function sortFocusablesByVisualOrder(elements) {
  if (!elements?.length) return [];
  return [...elements].sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const dy = ra.top - rb.top;
    if (Math.abs(dy) > VISUAL_ROW_EPS) return dy;
    return ra.left - rb.left;
  });
}

/** Keep focused inputs visible inside tall / scrollable modals (Tab and programmatic focus). */
export function scrollModalFieldIntoView(el) {
  if (!el || typeof el.scrollIntoView !== "function") return;
  try {
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  } catch {
    /* ignore */
  }
}

export function getModalFocusableElements(modalEl, buttonDataAttr) {
  if (!modalEl) return [];
  const btnPart = buttonDataAttr ? `, button:not([disabled])[${buttonDataAttr}]` : "";
  const selector = `input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])${btnPart}`;
  const list = Array.from(modalEl.querySelectorAll(selector)).filter((el) => {
    if (el.tabIndex === -1) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
  });
  return sortFocusablesByVisualOrder(list);
}

/**
 * @param {HTMLElement | null} modalEl
 * @param {Element | null} currentEl
 * @param {number} delta +1 next, -1 previous
 * @param {{ buttonDataAttr?: string }} [opts]
 */
export function focusAdjacentModalField(modalEl, currentEl, delta, opts = {}) {
  const { buttonDataAttr } = opts;
  const focusable = getModalFocusableElements(modalEl, buttonDataAttr);
  const idx = currentEl ? focusable.indexOf(currentEl) : -1;
  if (!focusable.length) return;
  let nextIdx;
  if (idx === -1) {
    nextIdx = delta > 0 ? 0 : focusable.length - 1;
  } else {
    const len = focusable.length;
    nextIdx = ((idx + delta) % len + len) % len;
  }
  const target = focusable[nextIdx];
  target.focus();
  scrollModalFieldIntoView(target);
  if (target.tagName === "INPUT" && (target.type === "number" || target.type === "text" || target.type === "date")) {
    try {
      target.select();
    } catch {
      /* ignore */
    }
  }
}

/** Attribute used on optional in-form buttons for Sales Billing modal focus chain */
export const SALES_MODAL_FOCUS_BUTTON_ATTR = "data-sb-focusable";

/** Attribute used on optional in-form buttons for Purchase modal focus chain */
export const PURCHASE_MODAL_FOCUS_BUTTON_ATTR = "data-pi-focusable";
