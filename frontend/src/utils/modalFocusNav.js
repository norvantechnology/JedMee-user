/**
 * Shared modal keyboard navigation for transaction forms (Sales, Purchase, etc.).
 * - Next field: plain Enter on input/select (handled by callers).
 * - Previous field: Shift+Enter (handled by callers).
 *
 * Only buttons carrying `buttonDataAttr` are included (e.g. data-sb-focusable), so
 * footer actions stay out of the tab order unless explicitly marked.
 */

/** Pixels: elements within this vertical band are treated as one row (left-to-right). */
const VISUAL_ROW_EPS = 8;

export function getTopMostCmRoot() {
  if (typeof document === "undefined") return null;
  const roots = document.querySelectorAll(".cmRoot");
  return roots.length ? roots[roots.length - 1] : null;
}

/**
 * True if `panel` (e.g. `.cmPanel`) belongs to the front-most stacked CommonModal.
 * Used so Escape and page-level capture shortcuts only affect the visible overlay.
 */
export function isCmPanelTopStackLayer(panel) {
  if (!panel) return true;
  const mine = panel.closest(".cmRoot");
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
