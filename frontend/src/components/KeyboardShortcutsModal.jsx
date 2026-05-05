import CommonModal from "./CommonModal.jsx";
import { Keyboard } from "./ui/AppIcons.jsx";
import "./StructuredForm.css";
import "./KeyboardShortcutsModal.css";

/**
 * Renders a key combo as <kbd> segments (split on "+").
 * @param {string} keys e.g. "Shift+Enter" or "↓"
 */
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

/**
 * Compact trigger for opening keyboard help (use in modal headers, toolbars).
 */
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

/**
 * Reusable shortcuts dialog (nested CommonModal with portal + higher z-index).
 *
 * @param {{ open: boolean, onClose: () => void, title?: string, subtitle?: string, items: Array<{ description: string, keys: string }> }} props
 */
export default function KeyboardShortcutsModal({ open, onClose, title = "Keyboard shortcuts", subtitle = "", items = [] }) {
  return (
    <CommonModal
      open={open}
      onClose={onClose}
      ariaLabel="keyboard-shortcuts-help"
      title={title}
      subtitle={subtitle}
      icon={<Keyboard />}
      size="sm"
      portal
      portalZIndex={560}
      footer={
        <div className="kshFooter sfmModalFooter">
          <button type="button" className="sfmBtnGhost" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <ul className="kshList">
        {(items || []).map((row, i) => (
          <li key={i} className="kshRow">
            <span className="kshDesc">{row.description}</span>
            <KeyCombo keys={row.keys} />
          </li>
        ))}
      </ul>
    </CommonModal>
  );
}
