import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CommonLoading from "./CommonLoading.jsx";
import { reconcileCommonModalStack } from "../utils/commonModalStack.js";
import {
  focusNextCmModalField,
  getCmModalFieldFocusables,
  isCmPanelTopStackLayer,
  scrollModalFieldIntoView
} from "../utils/modalFocusNav.js";
import {
  cmSelectNavEnterAction,
  cmSelectNavMarkOpened,
  cmSelectNavMarkPickedSynthetic,
  cmSelectNavReset,
  cmSelectNavMarkPickedFromChange
} from "../utils/cmSelectNav.js";
import { openFocusedDropdown } from "../utils/dropdownKeyboard.js";
import { IconCancel, IconChevronMini, IconLayers, Keyboard } from "./ui/AppIcons.jsx";
import "./ui/AppButton.css";
import "./CommonModal.css";
import { useLocale } from "../context/LocaleContext.jsx";
import CommonDatePicker from "./CommonDatePicker.jsx";
import PhoneInput, { validatePhone } from "./PhoneInput.jsx";
import AmountInput from "./ui/AmountInput.jsx";
import ModalFooterShell from "./ui/ModalFooterShell.jsx";
import { InlineButtonProgress } from "./ui/buttons.jsx";

function getFocusables(panel) {
  return getCmModalFieldFocusables(panel);
}

/** Renders a key combo as <kbd> segments (split on "+"). */
function KeyCombo({ keys }) {
  const parts = String(keys || "")
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  return (
    <span className="kshKeysInner">
      {parts.map((p, i) => (
        <span key={`${p}-${i}`} className="kshKeyWrap">
          {i > 0 ? <span className="kshPlus" aria-hidden="true">+</span> : null}
          <kbd className="kshKbd">{p}</kbd>
        </span>
      ))}
    </span>
  );
}

/** Compact trigger for opening keyboard help (rendered by CommonModal when `shortcutsItems` is set). */
export function KeyboardShortcutsTrigger({ onClick, label = "Shortcuts" }) {
  return (
    <button
      type="button"
      className="kshTrigger"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={`${label}  keyboard shortcuts`}
    >
      <Keyboard className="kshTriggerIcon" size={17} strokeWidth={2.25} aria-hidden />
      <span className="kshTriggerLabel">{label}</span>
    </button>
  );
}

/** List body for the shortcuts help dialog (used by CommonModal and KeyboardShortcutsModal). */
export function ShortcutsHelpList({ items = [] }) {
  return (
    <ul className="kshList">
      {(items || []).map((row, i) => (
        <li key={i} className="kshRow">
          <span className="kshDesc">{row.description}</span>
          <KeyCombo keys={row.keys} />
        </li>
      ))}
    </ul>
  );
}

/** Let Enter reach combobox/list widgets (e.g. ProductPicker) when the popup is open. */
function cmDeferPlainEnterToWidget(el) {
  if (!el?.closest) return false;
  const combo = el.closest('[role="combobox"]');
  if (combo?.getAttribute("aria-expanded") === "true") return true;
  if (el.closest('[data-cm-enter-keep="true"]')) return true;
  return false;
}

function getFieldSignature(el, fields) {
  if (!el) return null;
  const tag = String(el.tagName || "").toLowerCase();
  return JSON.stringify({
    tag,
    type: el.type || "",
    placeholder: el.getAttribute?.("placeholder") || "",
    aria: el.getAttribute?.("aria-label") || "",
    name: el.getAttribute?.("name") || "",
    id: el.id || "",
    idx: fields.indexOf(el)
  });
}

function findFieldBySignature(sig, fields, panel) {
  if (!sig || !fields.length) return null;
  let parsed;
  try {
    parsed = JSON.parse(sig);
  } catch {
    return null;
  }
  const exact = fields.find((f) => getFieldSignature(f, fields) === sig);
  if (exact) return exact;
  if (parsed.name && panel) {
    const byName = panel.querySelector(`[name="${window.CSS?.escape?.(parsed.name) || parsed.name}"]`);
    if (byName && fields.includes(byName)) return byName;
  }
  if (parsed.id && panel) {
    const byId = panel.querySelector(`#${window.CSS?.escape?.(parsed.id) || parsed.id}`);
    if (byId && fields.includes(byId)) return byId;
  }
  if (parsed.placeholder) {
    const byPh = fields.find(
      (f) => (f.getAttribute?.("placeholder") || "") === parsed.placeholder && String(f.tagName || "").toLowerCase() === parsed.tag
    );
    if (byPh) return byPh;
  }
  if (typeof parsed.idx === "number" && parsed.idx >= 0 && parsed.idx < fields.length) return fields[parsed.idx];
  return null;
}

function setReactInputValue(el, value) {
  const tag = String(el.tagName || "").toLowerCase();
  const proto = tag === "textarea" ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype;
  const setter = proto && Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const cmFocusMemory = (() => {
  if (typeof window === "undefined") return new Map();
  if (!window.__cmFocusMemory) window.__cmFocusMemory = new Map();
  return window.__cmFocusMemory;
})();

/**
 * CommonModal - single shell for every dialog/drawer in the app.
 * Styles: `./CommonModal.css` (`.mcm*`, modal body field tokens, `.mfz*`,
 * merged per-modal bundles: shortcuts, orders wizard, batch modal, etc.).
 *
 * **Master / form modals:** put content inside the exported layout primitives
 * so structure and class names stay identical across screens:
 * `ModalFormShell` → `ModalFormBody` → `ModalFormPanel` → `ModalFormPanelHead` / `ModalFormPanelBody` → `ModalFormGrid`.
 * **Stacked bands in one panel:** add class `mfzPanelBody_stack` on `ModalFormPanelBody` when you stack several `ModalFormGrid` / `ModalFormCheckGroup` rows; `.mcmBody` CSS adds hairline separators between siblings (replaces ad‑hoc “rail” wrappers).
 *
 * **Field grid cells:** use `ModalFormField` (label + error + hint + `mfz*` grid span) so master modals
 * stay consistent. For `label` as a React node, set `required={false}` if the node already includes `*`.
 *
 * **Section titles:** `ModalFormSectionTitle` replaces the repeated kicker (+ optional hint) block inside
 * `ModalFormPanelHead`.
 *
 * **Checkbox rows:** `ModalFormCheckGroup` is one full-width grid cell (`mfzField mfz12 mfzChecks`) - no nested wrapper.
 *
 * **Customer add/edit:** `useCustomerModalForm`, `CustomerModalFormBody`, `CustomerModalFooter` - same `.mcm*` / `.mfz*`
 * CSS; used from CustomersPage and QuickCreateMasterModal (no separate customer modal stylesheet).
 *
 * **Header:** `title` is rendered as `<h2>`; dialog `aria-labelledby` points at it when a title is present.
 * **Shortcuts help:** pass `shortcutsItems` (`{ description, keys }[]`) to add the header “Shortcuts” control and nested help dialog (same pattern for every modal).
 */
export default function CommonModal({
  open,
  title,
  subtitle,
  children,
  /** Optional controls beside the title row. Renders after the shortcuts trigger when `shortcutsItems` is set. */
  headerTools = null,
  /** When non-empty, shows a Shortcuts trigger in the header and a nested help dialog (same UX as invoice editors). */
  shortcutsItems = null,
  shortcutsTitle = "Keyboard shortcuts",
  shortcutsSubtitle = "",
  footer,
  onClose,
  /**
   * Called when the user clicks the backdrop overlay.
   * If provided, overlay click calls onOverlayClose instead of onClose -
   * allowing the parent to preserve draft form state while still closing.
   * If omitted, overlay click falls back to onClose (existing behaviour).
   */
  onOverlayClose,
  size = "md",
  closeOnOverlay = true,
  ariaLabel,
  /** When true, tints the header icon mark with danger colour (used by ConfirmDialog). */
  danger = false,
  icon,
  loading = false,
  loadingText = "Loading...",
  /** When true, footer is not shown while `loading` is true (avoids half-ready actions). */
  hideFooterWhenLoading = true,
  /** Render into document.body (avoids clipping inside another modal; use a higher z-index). */
  portal = false,
  portalZIndex = 480,
  /**
   * When true, renders as a right-side sliding drawer panel instead of a
   * centred overlay. Ideal for add/edit forms that should feel "in-page".
   * Defaults to true so all modals are drawers by default.
   */
  drawer = true
}) {
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const titleId = useId();
  const showShortcuts = Array.isArray(shortcutsItems) && shortcutsItems.length > 0;
  const memoryKey = String(ariaLabel || title || "");
  const w = useMemo(() => {
    if (typeof size === "number") return `${size}px`;
    if (size === "sm") return "448px";
    if (size === "lg") return "1000px";
    return "600px";
  }, [size]);

  useEffect(() => {
    if (!open) setShortcutsHelpOpen(false);
  }, [open]);

  // Mark this dialog as “live” while open so nested modals can share one stack pass.
  useLayoutEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    if (root) {
      root.dataset.mcmLive = "true";
    }
    reconcileCommonModalStack();
    return () => {
      if (root) {
        delete root.dataset.mcmLive;
        root.removeAttribute("data-mcm-stack-from-top");
        root.classList.remove("mcm_stackTop", "mcm_stackBehind");
        root.style.removeProperty("--mcm-stack-scale");
        root.style.removeProperty("z-index");
      }
      reconcileCommonModalStack();
    };
  }, [open]);

  // Panel width + portal z-index (can change while staying open - no stack teardown).
  useLayoutEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const panel = panelRef.current;
    if (panel) {
      panel.style.setProperty("--mcm-w", w);
    }
    if (root) {
      root.dataset.portal = portal ? "true" : "false";
      if (portal) {
        root.style.setProperty("z-index", String(portalZIndex));
      } else {
        root.style.removeProperty("z-index");
      }
    }
    reconcileCommonModalStack();
  }, [open, w, portal, portalZIndex]);

  useEffect(() => {
    if (!open) return;
    function normText(v) {
      return String(v || "")
        .trim()
        .toLowerCase();
    }

    function isCancelLike(btn) {
      if (!btn) return false;
      const cls = String(btn.className || "").toLowerCase();
      const txt = normText(btn.textContent);
      return cls.includes("ghost") || txt === "cancel" || txt === "close" || txt.includes("cancel");
    }

    function isPrimaryLike(btn) {
      if (!btn) return false;
      const cls = String(btn.className || "").toLowerCase();
      const txt = normText(btn.textContent);
      return (
        cls.includes("primary") ||
        txt.includes("save") ||
        txt.includes("create") ||
        txt.includes("confirm") ||
        txt.includes("submit") ||
        txt.includes("record") ||
        txt.includes("update")
      );
    }

    function findPrimaryButton(panel) {
      if (!panel) return null;
      const explicit = panel.querySelector?.('[data-cm-primary="true"]');
      if (explicit && !explicit.disabled) return explicit;
      const footerButtons = [...(panel.querySelectorAll?.(".mcmFooter button") || [])].filter((b) => !b.disabled);
      if (!footerButtons.length) return null;
      const byPrimaryHint = footerButtons.find((b) => isPrimaryLike(b) && !isCancelLike(b));
      if (byPrimaryHint) return byPrimaryHint;
      const nonCancel = footerButtons.filter((b) => !isCancelLike(b));
      if (nonCancel.length) return nonCancel[nonCancel.length - 1];
      return null;
    }

    function findCancelButton(panel) {
      if (!panel) return null;
      const explicit = panel.querySelector?.('[data-cm-cancel="true"]');
      if (explicit && !explicit.disabled) return explicit;
      const footerButtons = [...(panel.querySelectorAll?.(".mcmFooter button") || [])].filter((b) => !b.disabled);
      const byCancelHint = footerButtons.find((b) => isCancelLike(b));
      if (byCancelHint) return byCancelHint;
      return null;
    }

    function onKey(e) {
      const panel = panelRef.current;
      const active = document.activeElement;
      const inModal = panel && active ? panel.contains(active) : false;
      if (loading) return;

      // Esc: only the top stacked modal closes (confirm/validation on top of a form modal).
      if (e.key === "Escape") {
        if (!isCmPanelTopStackLayer(panel)) return;
        if (active?.tagName === "SELECT") cmSelectNavReset(active);
        e.preventDefault();
        e.stopPropagation();
        const cancelBtn = findCancelButton(panel);
        if (cancelBtn) {
          cancelBtn.click();
          return;
        }
        onClose?.();
        return;
      }

      // Shift+Enter: primary action (top stacked modal only).
      if (e.key === "Enter" && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!inModal || !isCmPanelTopStackLayer(panel)) return;
        e.preventDefault();
        e.stopPropagation();
        const primaryBtn = findPrimaryButton(panel);
        if (primaryBtn) primaryBtn.click();
        return;
      }

      // Any printable key / Enter / Backspace / Arrow / Space when no field is focused:
      // auto-focus the first (or last-edited) field. Only runs for the top-most modal.
      if (
        panel &&
        isCmPanelTopStackLayer(panel) &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        e.key !== "Tab"
      ) {
        const fields = getFocusables(panel);
        const focusedField = inModal && fields.includes(active);
        const shouldHijack =
          (!active || panel.contains(active)) &&
          !focusedField &&
          fields.length > 0 &&
          (e.key === "Enter" ||
            e.key === "Backspace" ||
            e.key === " " ||
            e.key === "Spacebar" ||
            e.key.startsWith("Arrow") ||
            (typeof e.key === "string" && e.key.length === 1));

        if (shouldHijack) {
          const sig = cmFocusMemory.get(memoryKey);
          const target = (sig ? findFieldBySignature(sig, fields, panel) : null) || fields[0];
          if (target) {
            e.preventDefault();
            e.stopPropagation();
            try {
              target.focus({ preventScroll: false });
            } catch {
              target.focus?.();
            }
            scrollModalFieldIntoView(target);
            const tag = String(target.tagName || "").toLowerCase();
            if ((tag === "input" || tag === "textarea") && typeof e.key === "string" && e.key.length === 1) {
              setReactInputValue(target, `${target.value || ""}${e.key}`);
              try {
                const end = target.value.length;
                target.setSelectionRange?.(end, end);
              } catch {
                // some input types don't support setSelectionRange
              }
            } else if ((tag === "input" || tag === "textarea") && e.key === "Backspace") {
              const cur = target.value || "";
              if (cur.length) setReactInputValue(target, cur.slice(0, -1));
            } else if (tag === "input" && typeof target.select === "function") {
              try { target.select(); } catch { /* ignore */ }
            }
            return;
          }
        }
      }

      // Ctrl/Cmd+Enter: primary action regardless of focus
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.altKey) {
        if (!inModal) return;
        e.preventDefault();
        const primaryBtn = findPrimaryButton(panel);
        if (primaryBtn) primaryBtn.click();
        return;
      }

      // Enter: next body field (required preferred in each segment); not plain submit.
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!inModal || !isCmPanelTopStackLayer(panel)) return;
        if (cmDeferPlainEnterToWidget(active)) return;

        const tag = String(active?.tagName || "").toLowerCase();
        if (tag === "textarea" || active?.isContentEditable) return;

        if (tag === "button" || tag === "a") return;

        if (tag === "input") {
          const it = String(active.type || "text").toLowerCase();
          if (["submit", "button", "reset", "file", "image", "color"].includes(it)) return;
        }

        if (tag === "select") {
          const sel = active;
          const action = cmSelectNavEnterAction(sel);
          if (action === null) return;

          if (action === "open") {
            e.preventDefault();
            e.stopPropagation();
            openFocusedDropdown(sel);
            cmSelectNavMarkOpened(sel);
            return;
          }
          if (action === "pick") {
            e.preventDefault();
            e.stopPropagation();
            cmSelectNavMarkPickedSynthetic(sel);
            return;
          }
          if (action === "next") {
            e.preventDefault();
            e.stopPropagation();
            cmSelectNavReset(sel);
            focusNextCmModalField(panel, sel);
            return;
          }
        }

        e.preventDefault();
        e.stopPropagation();
        focusNextCmModalField(panel, active);
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose, loading, memoryKey]);

  useEffect(() => {
    if (!open || loading) return;
    const panel = panelRef.current;
    if (!panel) return;
    function onFocusOut(ev) {
      const t = ev.target;
      if (t?.tagName !== "SELECT" || !panel.contains(t) || Number(t.size) > 1) return;
      const sel = t;
      requestAnimationFrame(() => {
        if (document.activeElement === sel) return;
        cmSelectNavReset(sel);
      });
    }
    function onChange(ev) {
      const t = ev.target;
      if (t?.tagName === "SELECT" && panel.contains(t) && Number(t.size) <= 1) cmSelectNavMarkPickedFromChange(t);
    }
    panel.addEventListener("focusout", onFocusOut, true);
    panel.addEventListener("change", onChange, true);
    return () => {
      panel.removeEventListener("focusout", onFocusOut, true);
      panel.removeEventListener("change", onChange, true);
    };
  }, [open, loading]);

  // Auto-focus on open: last-edited field if remembered, else first focusable.
  useEffect(() => {
    if (!open || loading) return;
    let cancelled = false;
    let tries = 0;
    function attempt() {
      if (cancelled) return;
      const panel = panelRef.current;
      if (!panel) {
        if (tries++ < 40) requestAnimationFrame(attempt);
        return;
      }
      const fields = getFocusables(panel);
      const target =
        fields[0] ||
        panel.querySelector(".mcmFooter button[data-cm-cancel='true']") ||
        panel.querySelector(".mcmFooter button:not([disabled])");
      if (!target) {
        if (tries++ < 40) requestAnimationFrame(attempt);
        return;
      }
      const active = document.activeElement;
      if (active && panel.contains(active)) {
        if (fields.includes(active)) return;
        if (!fields.length && active.closest?.(".mcmFooter")) return;
      }
      try {
        target.focus({ preventScroll: false });
      } catch {
        target.focus?.();
      }
      scrollModalFieldIntoView(target);
      const tag = String(target.tagName || "").toLowerCase();
      if (tag === "input" && typeof target.select === "function") {
        try { target.select(); } catch { /* ignore */ }
      }
    }
    requestAnimationFrame(attempt);
    return () => {
      cancelled = true;
    };
  }, [open, loading, memoryKey]);

  // Keep whichever field is focused visible inside scrollable bodies (native Tab order).
  useEffect(() => {
    if (!open || loading) return;
    const panel = panelRef.current;
    if (!panel) return;
    function onFocusIn(e) {
      const t = e.target;
      if (!t || !panel.contains(t)) return;
      const tag = String(t.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || t.isContentEditable) {
        scrollModalFieldIntoView(t);
      }
    }
    panel.addEventListener("focusin", onFocusIn, true);
    return () => panel.removeEventListener("focusin", onFocusIn, true);
  }, [open, loading]);

  // Remember the last edited field for this modal key.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    function record(e) {
      const t = e.target;
      if (!t || !panel.contains(t)) return;
      const fields = getFocusables(panel);
      if (!fields.includes(t)) return;
      const sig = getFieldSignature(t, fields);
      if (sig) cmFocusMemory.set(memoryKey, sig);
    }
    panel.addEventListener("input", record, true);
    panel.addEventListener("change", record, true);
    panel.addEventListener("focusin", record, true);
    return () => {
      panel.removeEventListener("input", record, true);
      panel.removeEventListener("change", record, true);
      panel.removeEventListener("focusin", record, true);
    };
  }, [open, memoryKey]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const tree = (
    <div
      ref={rootRef}
      className={[
        "mcm",
        "cmRoot",
        portal ? "mcm_portal" : "",
        drawer ? "mcm_drawer" : ""
      ].filter(Boolean).join(" ")}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : ariaLabel || "Modal"}
      style={portal ? { zIndex: portalZIndex } : undefined}
    >
      <button
        className="mcmOverlay"
        type="button"
        aria-label={closeOnOverlay ? "Close dialog" : "Dialog overlay"}
        onClick={() => {
          if (!closeOnOverlay) return;
          if (onOverlayClose) onOverlayClose();
          else onClose?.();
        }}
      />

      <section
        ref={panelRef}
        className={[
          "mcmPanel",
          `mcmPanel_${String(size || "md")}`,
          drawer ? "mcmPanel_drawer" : ""
        ].filter(Boolean).join(" ")}
        style={{ "--mcm-w": w }}
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel || "Dialog"}
      >
        <header className="mcmHead">
          <div className="mcmHeadMain">
            <div className={`mcmMark${danger ? " mcmMark_danger" : ""}`.trim()} aria-hidden="true">
              {icon ?? <IconLayers />}
            </div>

            <div className="mcmTitles">
              {title ? (
                <h2 id={titleId} className="mcmTitle">
                  {title}
                </h2>
              ) : null}
              {subtitle ? <p className="mcmSub">{subtitle}</p> : null}
            </div>
          </div>

          {showShortcuts || headerTools ? (
            <div className="mcmHeadTools">
              {showShortcuts ? <KeyboardShortcutsTrigger onClick={() => setShortcutsHelpOpen(true)} /> : null}
              {headerTools}
            </div>
          ) : null}

          <button className="mcmClose" type="button" onClick={onClose} aria-label="Close dialog">
            <IconCancel />
          </button>
        </header>

        <div className="mcmBody">
          {loading ? (
            <div className="mcmLoading">
              <CommonLoading variant="page" text={loadingText || "Loading"} />
            </div>
          ) : (
            children
          )}
        </div>

        {footer && (!hideFooterWhenLoading || !loading) ? (
          <footer className="mcmFooter">
            <div className="mcmFooterInner">{footer}</div>
          </footer>
        ) : null}
      </section>
    </div>
  );

  const shortcutsNested =
    showShortcuts && open ? (
      <CommonModal
        open={shortcutsHelpOpen}
        onClose={() => setShortcutsHelpOpen(false)}
        ariaLabel="keyboard-shortcuts-help"
        title={shortcutsTitle}
        subtitle={shortcutsSubtitle}
        icon={<Keyboard />}
        size="sm"
        portal
        portalZIndex={560}
        drawer={false}
        footer={
          <div className="kshFooter sfmModalFooter">
            <button type="button" className="sfmBtnGhost" onClick={() => setShortcutsHelpOpen(false)}>
              Close
            </button>
          </div>
        }
      >
        <ShortcutsHelpList items={shortcutsItems} />
      </CommonModal>
    ) : null;

  if (portal && typeof document !== "undefined") {
    return (
      <>
        {createPortal(tree, document.body)}
        {shortcutsNested}
      </>
    );
  }
  return (
    <>
      {tree}
      {shortcutsNested}
    </>
  );
}

/** Root wrapper for master-style forms inside a modal (`mfz` + optional class e.g. `vmShell`). */
export function ModalFormShell({ className = "", children }) {
  return <div className={["mfz", className].filter(Boolean).join(" ")}>{children}</div>;
}

/** Vertical stack of panels (`mfzBody`). */
export function ModalFormBody({ className = "", children }) {
  return <div className={["mfzBody", className].filter(Boolean).join(" ")}>{children}</div>;
}

/** One card section (`mfzPanel`); pass `aria-label` for a11y. */
export function ModalFormPanel({ className = "", children, ...rest }) {
  return (
    <section className={["mfzPanel", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </section>
  );
}

export function ModalFormPanelHead({ children }) {
  return <div className="mfzPanelHead">{children}</div>;
}

export function ModalFormPanelBody({ className = "", children, ...rest }) {
  return (
    <div className={["mfzPanelBody", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}

export function ModalFormGrid({ className = "", children, ...rest }) {
  return (
    <div className={["mfzGrid", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}

/**
 * One grid cell: optional label row, control slot, optional error + hint.
 * @param {3|4|6|8|9|12} [span=12] - column span (`mfz3` … `mfz12`).
 * @param {import("react").ReactNode} [label] - pass `false`/`null` to omit the label row (rare).
 * @param {boolean} [required] - kept for API compatibility; does not change the label UI.
 */
export function ModalFormField({ span = 12, label, required: _required = false, error, hint, className = "", children }) {
  const gridClass = span === 12 || span === 9 || span === 8 || span === 6 || span === 4 || span === 3 ? `mfz${span}` : "mfz12";
  const hasLabel = label != null && label !== false;
  return (
    <div
      className={["mfzField", gridClass, className].filter(Boolean).join(" ")}
      data-cm-required={_required ? "true" : undefined}
    >
      {hasLabel ? (
        <div className="mfzLabel">
          {label}
        </div>
      ) : null}
      {children}
      {error ? (
        <div className="mfzErr" role="alert">
          {error}
        </div>
      ) : null}
      {hint ? <div className="mfzHelp">{hint}</div> : null}
    </div>
  );
}

/** Kicker (+ optional hint) for `ModalFormPanelHead`. Omits extra wrapper when there is no hint. */
export function ModalFormSectionTitle({ kicker, hint = null }) {
  if (hint == null || hint === "") {
    return <div className="mfzHeadKicker">{kicker}</div>;
  }
  return (
    <div className="mfzSectionTitleStack">
      <div className="mfzHeadKicker">{kicker}</div>
      <div className="mfzHeadHint">{hint}</div>
    </div>
  );
}

/** One full-width row of `.mfzCheck` options (policy flags, active, …). Single grid cell - no extra inner wrapper. */
export function ModalFormCheckGroup({ className = "", children }) {
  return <div className={["mfzField", "mfz12", "mfzChecks", className].filter(Boolean).join(" ")}>{children}</div>;
}

/* ── Customer editor (CustomersPage + QuickCreateMasterModal; same `.mcm*` / `.mfz*` CSS as other modals) ── */

const CM_WHOLESALER_TYPES = ["RETAILER", "HOSPITAL", "CLINIC", "DISTRIBUTOR", "OTHER"];
const CM_RETAILER_TYPES = ["PATIENT", "CLINIC", "DOCTOR", "HOSPITAL", "OTHER"];

function cmMakeEmptyCustomer(isRetailer) {
  return {
    code: "",
    name: "",
    shortName: "",
    phoneCountryCode: "+91",
    phoneNumber: "",
    email: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    customerType: isRetailer ? "PATIENT" : "RETAILER",
    gstNumber: "",
    drugLicenseNumber: "",
    dlExpiryDate: "",
    creditDays: 0,
    creditLimit: 0,
    discountPercent: 0,
    isCashCustomer: !!isRetailer,
    isActive: true,
    notes: ""
  };
}

/** @param {{ open: boolean; mode: "add"|"edit"; initialValue: object | null; isRetailer: boolean; busy: boolean; onClose?: () => void }} opts */
export function useCustomerModalForm({ open, mode, initialValue, isRetailer, busy, onClose }) {
  const { taxIdLabel } = useLocale();
  const [form, setForm] = useState(() => cmMakeEmptyCustomer(isRetailer));
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    const base = cmMakeEmptyCustomer(isRetailer);
    if (initialValue && mode === "edit") {
      const merged = { ...base, ...initialValue };
      setForm(merged);
    } else {
      setForm(base);
    }
    setSubmitted(false);
  }, [open, mode, initialValue, isRetailer]);

  function handleOverlayClose() {
    if (busy) return;
    onClose?.();
  }

  function handleExplicitClose() {
    if (busy) return;
    overlayClosedRef.current = false;
    onClose?.();
  }

  const phoneClean = String(form.phoneNumber || "").trim();
  const phoneRequired = false;
  const phone = validatePhone(form.phoneCountryCode, form.phoneNumber);

  const gstRaw = String(form.gstNumber || "").trim().toUpperCase();
  const GST_REGEX = /^[A-Z0-9]{15}$/;
  const gstError =
    submitted && gstRaw.length > 0 && !GST_REGEX.test(gstRaw)
      ? `${taxIdLabel} must be exactly 15 alphanumeric characters (letters and digits).`
      : "";

  const canSubmit =
    !busy &&
    String(form.name || "").trim().length > 0 &&
    (phoneClean.length === 0 || phoneClean.length >= 6) &&
    !gstError;

  const typeOptions = isRetailer ? CM_RETAILER_TYPES : CM_WHOLESALER_TYPES;

  return {
    taxIdLabel,
    typeOptions,
    form,
    setForm,
    submitted,
    setSubmitted,
    handleOverlayClose,
    handleExplicitClose,
    phoneClean,
    phoneRequired,
    phone,
    gstError,
    canSubmit
  };
}

export function CustomerModalFormBody({
  form,
  setForm,
  busy,
  submitted,
  isRetailer,
  taxIdLabel,
  typeOptions,
  gstError,
  phoneClean,
  phoneRequired,
  phone
}) {
  return (
    <ModalFormShell>
      <ModalFormBody>
        <ModalFormPanel aria-label="Customer profile">
          <ModalFormPanelHead>
            <ModalFormSectionTitle kicker="Profile" />
          </ModalFormPanelHead>

          <ModalFormPanelBody>
            <ModalFormGrid>
              <ModalFormField
                span={8}
                label="Customer name"
                required
                error={submitted && !String(form.name || "").trim() ? "Customer name is required." : null}
              >
                <input
                  className={`mfzInput${submitted && !String(form.name || "").trim() ? " mfzInput_err" : ""}`}
                  value={form.name}
                  placeholder=""
                  disabled={busy}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </ModalFormField>

              <ModalFormField span={4} label="Type">
                <select
                  className="mfzInput"
                  value={form.customerType}
                  disabled={busy}
                  onChange={(e) =>
                    setForm((p) => {
                      const next = { ...p, customerType: e.target.value };
                      if (isRetailer) next.isCashCustomer = e.target.value === "PATIENT";
                      return next;
                    })
                  }
                  aria-label="Customer type"
                >
                  {typeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  {!typeOptions.includes(form.customerType) && form.customerType ? (
                    <option value={form.customerType}>{form.customerType}</option>
                  ) : null}
                </select>
              </ModalFormField>

              <ModalFormField span={4} label="Code">
                <input
                  className="mfzInput"
                  value={form.code}
                  placeholder="Optional"
                  disabled={busy}
                  onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                />
              </ModalFormField>

              <ModalFormField span={4} label="Short name">
                <input
                  className="mfzInput"
                  value={form.shortName}
                  placeholder=""
                  disabled={busy}
                  onChange={(e) => setForm((p) => ({ ...p, shortName: e.target.value }))}
                />
              </ModalFormField>

              <ModalFormField span={12} label={false}>
                <PhoneInput
                  compact
                  phonePlaceholder="7–15 digits"
                  countryCode={form.phoneCountryCode}
                  phoneNumber={form.phoneNumber}
                  onCountryCodeChange={(v) => setForm((p) => ({ ...p, phoneCountryCode: v }))}
                  onPhoneNumberChange={(v) => setForm((p) => ({ ...p, phoneNumber: v }))}
                  countryCodeError={!phoneRequired || !phoneClean || phone.ccOk ? "" : "Use prefix like +91"}
                  phoneNumberError={!phoneRequired || !phoneClean || phone.numOk ? "" : "Enter 7–15 digits"}
                />
              </ModalFormField>

              <ModalFormField span={12} label="Email">
                <input
                  className="mfzInput"
                  value={form.email}
                  placeholder=""
                  disabled={busy}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                />
              </ModalFormField>
            </ModalFormGrid>
          </ModalFormPanelBody>
        </ModalFormPanel>

        <ModalFormPanel aria-label="Address">
          <ModalFormPanelHead>
            <ModalFormSectionTitle kicker="Address" />
          </ModalFormPanelHead>
          <ModalFormPanelBody>
            <ModalFormGrid>
              <ModalFormField span={12} label="Address line">
                <input
                  className="mfzInput"
                  value={form.address}
                  placeholder=""
                  disabled={busy}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                />
              </ModalFormField>
              <ModalFormField span={4} label="City">
                <input className="mfzInput" value={form.city} disabled={busy} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
              </ModalFormField>
              <ModalFormField span={4} label="State">
                <input className="mfzInput" value={form.state} disabled={busy} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} />
              </ModalFormField>
              <ModalFormField span={4} label="Pincode">
                <input className="mfzInput" value={form.pincode} disabled={busy} onChange={(e) => setForm((p) => ({ ...p, pincode: e.target.value }))} />
              </ModalFormField>
            </ModalFormGrid>
          </ModalFormPanelBody>
        </ModalFormPanel>

        <ModalFormPanel aria-label="Compliance">
          <ModalFormPanelHead>
            <ModalFormSectionTitle kicker="Compliance" />
          </ModalFormPanelHead>
          <ModalFormPanelBody>
            <ModalFormGrid>
              <ModalFormField span={6} label={taxIdLabel} error={gstError || null}>
                <input
                  className={`mfzInput${gstError ? " mfzInput_err" : ""}`}
                  value={form.gstNumber}
                  placeholder="Tax registration number"
                  disabled={busy}
                  maxLength={15}
                  onChange={(e) => setForm((p) => ({ ...p, gstNumber: e.target.value }))}
                />
              </ModalFormField>
              <ModalFormField span={6} label="Drug license number">
                <input
                  className="mfzInput"
                  value={form.drugLicenseNumber}
                  placeholder=""
                  disabled={busy}
                  onChange={(e) => setForm((p) => ({ ...p, drugLicenseNumber: e.target.value }))}
                />
              </ModalFormField>
              <ModalFormField span={6} label="DL expiry date">
                <CommonDatePicker
                  value={form.dlExpiryDate}
                  disabled={busy}
                  onChange={(v) => setForm((p) => ({ ...p, dlExpiryDate: v }))}
                  ariaLabel="DL expiry date"
                />
              </ModalFormField>
            </ModalFormGrid>
          </ModalFormPanelBody>
        </ModalFormPanel>

        <ModalFormPanel aria-label="Billing defaults">
          <ModalFormPanelHead>
            <ModalFormSectionTitle kicker="Billing defaults" />
          </ModalFormPanelHead>

          <ModalFormPanelBody>
            <ModalFormCheckGroup>
              <label className="mfzCheck">
                <input
                  type="checkbox"
                  checked={Boolean(form.isCashCustomer)}
                  disabled={busy}
                  onChange={(e) => setForm((p) => ({ ...p, isCashCustomer: e.target.checked }))}
                />
                <span>Cash customer</span>
              </label>

              <label className="mfzCheck">
                <input
                  type="checkbox"
                  checked={Boolean(form.isActive)}
                  disabled={busy}
                  onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                />
                <span>Active customer</span>
              </label>
            </ModalFormCheckGroup>

            {!form.isCashCustomer ? (
              <ModalFormGrid className="mfzTop12">
                <ModalFormField span={4} label="Credit days">
                  <input
                    className="mfzInput"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0"
                    value={String(form.creditDays ?? "")}
                    disabled={busy}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, "");
                      setForm((p) => ({ ...p, creditDays: val }));
                    }}
                  />
                </ModalFormField>
                <ModalFormField span={4} label="Credit limit">
                  <AmountInput
                    className="mfzInput"
                    value={String(form.creditLimit ?? "")}
                    onChange={(raw) => setForm((p) => ({ ...p, creditLimit: raw }))}
                    disabled={busy}
                    placeholder="e.g. 50,000"
                  />
                </ModalFormField>
                <ModalFormField span={4} label="Default discount (%)">
                  <input
                    className="mfzInput"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*\.?[0-9]*"
                    placeholder="0"
                    value={String(form.discountPercent ?? "")}
                    disabled={busy}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1");
                      setForm((p) => ({ ...p, discountPercent: val }));
                    }}
                  />
                </ModalFormField>
              </ModalFormGrid>
            ) : null}

            <ModalFormGrid className="mfzTop12">
              <ModalFormField span={12} label="Notes">
                <textarea
                  className="mfzTextarea"
                  value={form.notes}
                  placeholder="Optional remarks"
                  disabled={busy}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={3}
                />
              </ModalFormField>
            </ModalFormGrid>
          </ModalFormPanelBody>
        </ModalFormPanel>
      </ModalFormBody>
    </ModalFormShell>
  );
}

export function CustomerModalFooter({ busy, mode, canSubmit, form, setSubmitted, onCancel, onSubmit }) {
  return (
    <ModalFooterShell>
      <button className="mfzBtn appBtn appBtn_secondary appBtn_md" type="button" data-cm-cancel="true" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      <button
        className="mfzBtn appBtn appBtn_primary appBtn_md"
        type="button"
        data-cm-primary="true"
        disabled={busy}
        onClick={() => {
          setSubmitted(true);
          if (!canSubmit) return;
          onSubmit?.({ ...form });
        }}
      >
        {busy ? (
          <InlineButtonProgress label={mode === "edit" ? "Saving…" : "Creating…"} />
        ) : mode === "edit" ? (
          "Save changes"
        ) : (
          "Create customer"
        )}
      </button>
    </ModalFooterShell>
  );
}
