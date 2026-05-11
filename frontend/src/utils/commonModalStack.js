/**
 * When several CommonModal (`.mcm`) instances are open, keep a clear visual stack:
 * the front dialog stays full size; each layer behind scales its **panel** only
 * (CSS: `.mcm_stackBehind .mcmPanel`) so the full-viewport overlay is not scaled.
 * Sort order uses z-index, then DOM order.
 */

const LIVE_SEL = '.mcm[data-mcm-live="true"]';

function parseZ(el) {
  const inline = parseInt(String(el.style.zIndex || ""), 10);
  if (Number.isFinite(inline)) return inline;
  const c = parseInt(window.getComputedStyle(el).zIndex || "0", 10);
  return Number.isFinite(c) ? c : 0;
}

/** Lower z-index first; same z → earlier in DOM first (later sibling = on top). */
function sortStackOrder(a, b) {
  const za = parseZ(a);
  const zb = parseZ(b);
  if (za !== zb) return za - zb;
  const pos = a.compareDocumentPosition(b);
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

/**
 * Front layer: full scale. First behind: 0.75, then each deeper step −0.07 (floored).
 * Tweak here if product wants a different “card stack” curve.
 */
function scaleForFromTop(fromTop) {
  if (fromTop <= 0) return 1;
  return Math.max(0.58, 0.75 - 0.07 * (fromTop - 1));
}

/**
 * Recompute `data-mcm-stack-from-top`, `--mcm-stack-scale`, and stack classes
 * on every open CommonModal root that sets `data-mcm-live="true"` while open.
 */
export function reconcileCommonModalStack() {
  if (typeof document === "undefined") return;
  const roots = [...document.querySelectorAll(LIVE_SEL)];
  if (!roots.length) return;

  const sorted = [...roots].sort(sortStackOrder);
  const n = sorted.length;

  sorted.forEach((el, i) => {
    const fromTop = n - 1 - i;
    el.dataset.mcmStackFromTop = String(fromTop);
    el.classList.toggle("mcm_stackTop", fromTop === 0);
    el.classList.toggle("mcm_stackBehind", fromTop > 0);
    if (fromTop === 0) {
      el.style.removeProperty("--mcm-stack-scale");
    } else {
      el.style.setProperty("--mcm-stack-scale", String(scaleForFromTop(fromTop)));
    }
  });
}
