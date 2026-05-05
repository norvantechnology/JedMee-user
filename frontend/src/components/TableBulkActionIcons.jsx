import { isValidElement } from "react";
import {
  Download,
  FileSpreadsheet,
  Layers,
  Package2,
  RotateCcw,
  Settings,
  Upload
} from "./ui/AppIcons.jsx";
import { IconCancel, IconConfirm, IconEmail, IconPayment, IconPrint, IconTrash } from "./ui/AppIcons.jsx";

/** Consistent Lucide sizing for bulk toolbar */
function bulkLucide(Comp) {
  function BulkLucideIcon(props) {
    return <Comp size={18} strokeWidth={2.15} aria-hidden="true" {...props} />;
  }
  BulkLucideIcon.displayName = `Bulk(${Comp.displayName || Comp.name || "Icon"})`;
  return BulkLucideIcon;
}

/** Named icons for `CommonTable` `bulkActions[].icon` and `bulkDelete.icon` (no per-page SVG). */
const NAMED = {
  payment: IconPayment,
  print: IconPrint,
  email: IconEmail,
  send: IconEmail,
  confirm: IconConfirm,
  cancel: IconCancel,
  delete: IconTrash,
  trash: IconTrash,
  remove: IconTrash,
  download: bulkLucide(Download),
  upload: bulkLucide(Upload),
  settings: bulkLucide(Settings),
  refresh: bulkLucide(RotateCcw),
  spreadsheet: bulkLucide(FileSpreadsheet),
  layers: bulkLucide(Layers),
  package: bulkLucide(Package2)
};

/**
 * Renders a shared icon for the bulk action bar, or a custom node.
 * @param {string|import('react').ReactNode} [icon]  key like `"payment"`, or a pre-built element
 */
export function renderBulkTableIcon(icon) {
  if (isValidElement(icon)) return icon;
  if (typeof icon !== "string" || !icon.trim()) return null;
  const C = NAMED[String(icon).toLowerCase().trim()];
  if (!C) return null;
  return <C />;
}

/**
 * @param {{ label?: string, icon?: string }} [bulkDelete]
 * @returns string key in `NAMED` for the bulk-delete (confirm) control
 */
export function inferBulkDeleteIconName(bulkDelete) {
  if (bulkDelete?.icon && NAMED[String(bulkDelete.icon).toLowerCase()]) {
    return String(bulkDelete.icon).toLowerCase();
  }
  if (/cancel/i.test(String(bulkDelete?.label || ""))) return "cancel";
  return "trash";
}
