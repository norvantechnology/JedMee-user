import { useState } from "react";
import CommonSelectField from "./CommonSelectField.jsx";
import QuickCreateMasterModal from "./QuickCreateMasterModal.jsx";
import { can } from "../utils/access.js";
import CommonInlineAddButton from "./CommonInlineAddButton.jsx";
import "./MasterSelectWithCreate.css";

const PERM = {
  vendor: ["VENDORS", "ADD"],
  division: ["DIVISIONS", "ADD"],
  customer: ["CUSTOMERS", "ADD"],
  product: ["PRODUCT_BATCHES", "ADD"],
  mfgCompany: ["MFG_COMPANIES", "ADD"]
};

const KIND_LABEL = {
  vendor: "vendor",
  division: "division",
  customer: "customer",
  product: "product",
  mfgCompany: "manufacturer"
};

/**
 * Standard dropdown plus “quick add” for master lists. Reuses POST APIs via QuickCreateMasterModal.
 */
export default function MasterSelectWithCreate({
  kind,
  value,
  onChange,
  options = [],
  placeholder = "Select",
  disabled = false,
  className = "",
  selectClassName = "",
  /** Refetch lists in the parent after a successful create (e.g. listVendors + listProducts). */
  onListsRefresh,
  productMfgOptions,
  buttonTitle,
  selectAutoOpenOnFocus = false
}) {
  const [quickOpen, setQuickOpen] = useState(false);
  const [resKey, setResKey] = useState(0);
  const perm = PERM[kind];
  const allowCreate =
    kind === "division"
      ? can("DIVISIONS", "ADD") || can("VENDORS", "ADD")
      : perm && can(perm[0], perm[1]);
  const label = KIND_LABEL[kind] || "record";
  /** Match flat modal inputs (Add product, division, vendor, …); keep line-item pages on default csf chrome. */
  const modalMfzLayout = /\bmfzInput\b/.test(selectClassName || "");
  const emphasizeLineItem = !modalMfzLayout && (kind === "division" || kind === "product");
  const effectiveSelectClass = `${selectClassName || ""} ${emphasizeLineItem ? "mswStrong" : ""}`.trim();

  return (
    <div className={["msw", modalMfzLayout ? "msw_mfz" : "", className].filter(Boolean).join(" ")}>
      <CommonSelectField
        key={resKey}
        className={effectiveSelectClass}
        value={value ?? ""}
        disabled={disabled}
        autoOpenOnFocus={selectAutoOpenOnFocus}
        onChange={(v) => onChange?.(v)}
        placeholder={placeholder}
        options={options}
      />
      {allowCreate && !disabled ? (
        <CommonInlineAddButton
          variant="icon"
          className="mswAdd"
          title={buttonTitle || `Create new ${label}`}
          onClick={() => setQuickOpen(true)}
        />
      ) : null}
      <QuickCreateMasterModal
        open={quickOpen}
        kind={kind}
        productMfgOptions={productMfgOptions}
        onClose={() => setQuickOpen(false)}
        onCreated={async (record) => {
          await onListsRefresh?.();
          setResKey((k) => k + 1);
          const id = record?.id != null ? String(record.id) : "";
          if (id) onChange?.(id, record);
        }}
      />
    </div>
  );
}
