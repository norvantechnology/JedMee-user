import { AppButton } from "./buttons.jsx";
import { Upload, Download } from "./AppIcons.jsx";
import "./TableCsvActions.css";

const ICON_SZ = 17;

/**
 * Standard Import / Export CSV controls for list pages (matches primary “Add” styling family).
 */
export default function TableCsvActions({
  onImport,
  onExport,
  disabled = false,
  importLabel = "Import CSV",
  exportLabel = "Export CSV"
}) {
  return (
    <div className="tableCsvActions">
      <AppButton type="button" variant="secondary" size="md" disabled={disabled} icon={<Upload size={ICON_SZ} strokeWidth={2.25} />} onClick={onImport} aria-label={importLabel || "Import file"}>
        {importLabel}
      </AppButton>
      <AppButton type="button" variant="secondary" size="md" disabled={disabled} icon={<Download size={ICON_SZ} strokeWidth={2.25} />} onClick={onExport} aria-label={exportLabel || "Export file"}>
        {exportLabel}
      </AppButton>
    </div>
  );
}
