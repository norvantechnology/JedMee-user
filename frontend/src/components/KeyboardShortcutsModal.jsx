import CommonModal, { KeyboardShortcutsTrigger, ShortcutsHelpList } from "./CommonModal.jsx";
import { Keyboard } from "./ui/AppIcons.jsx";

export { KeyboardShortcutsTrigger };

/**
 * Standalone keyboard help dialog (nested CommonModal).
 * Prefer passing `shortcutsItems` / `shortcutsTitle` on {@link CommonModal} so the trigger and dialog stay in one place.
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
      drawer={false}
      footer={
        <div className="kshFooter sfmModalFooter">
          <button type="button" className="sfmBtnGhost" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <ShortcutsHelpList items={items} />
    </CommonModal>
  );
}
