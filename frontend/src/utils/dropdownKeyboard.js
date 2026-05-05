/**
 * Open a collapsed native `<select>` (show option list). Prefers `showPicker()` when available
 * so repeated ↓ does not toggle the list closed (click() can).
 */
export function openFocusedDropdown(activeEl) {
  if (!activeEl || activeEl.tagName !== "SELECT") return false;
  if (Number(activeEl.size) > 1) return false;
  try {
    if (typeof activeEl.showPicker === "function") {
      activeEl.showPicker();
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    activeEl.click();
    return true;
  } catch {
    return false;
  }
}

export function stepFocusedDropdownValue(activeEl, direction) {
  if (!activeEl || activeEl.tagName !== "SELECT") return false;
  const step = direction === "up" ? -1 : 1;
  const len = Number(activeEl.options?.length || 0);
  if (len <= 0) return false;
  const cur = Number(activeEl.selectedIndex || 0);
  const next = Math.max(0, Math.min(len - 1, cur + step));
  if (next === cur) return true;
  activeEl.selectedIndex = next;
  activeEl.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

