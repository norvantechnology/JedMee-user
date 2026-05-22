import { useState } from "react";
import CommonSelectField from "./CommonSelectField.jsx";
import QuickCreateMasterModal from "./QuickCreateMasterModal.jsx";
import { can } from "../utils/access.js";
import CommonInlineAddButton from "./CommonInlineAddButton.jsx";
import "./MasterSelectWithCreate.css";

/**
 * Permission map: kind → [resource, action]
 * Add new kinds here to enable the + button for new master types.
 */
const PERM = {
  vendor:     ["VENDORS",        "ADD"],
  division:   ["DIVISIONS",      "ADD"],
  customer:   ["CUSTOMERS",      "ADD"],
  product:    ["PRODUCT_BATCHES","ADD"],
  mfgCompany: ["MFG_COMPANIES",  "ADD"],
};

/** Human-readable label used in the + button tooltip */
const KIND_LABEL = {
  vendor:     "vendor",
  division:   "division",
  customer:   "customer",
  product:    "product",
  mfgCompany: "manufacturer",
};

/**
 * MasterSelectWithCreate — dropdown + attached + button for any master list.
 *
 * Usage:
 *   <MasterSelectWithCreate
 *     kind="customer"           // "vendor" | "division" | "customer" | "product" | "mfgCompany"
 *     value={form.customerId}
 *     options={customerOptions}
 *     onChange={(id, record) => setForm(f => ({ ...f, customerId: id }))}
 *     onListsRefresh={refreshCustomers}
 *     placeholder="Select customer…"
 *   />
 *
 * The + button is shown only when the user has ADD permission for the kind.
 * The button stretches to match the select field height automatically.
 * Mobile responsive via MasterSelectWithCreate.css.
 *
 * To add a new kind:
 *   1. Add to PERM: { myKind: ["MY_RESOURCE", "ADD"] }
 *   2. Add to KIND_LABEL: { myKind: "my label" }
 *   3. Handle in QuickCreateMasterModal
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
  /** Refetch lists in the parent after a successful create. */
  onListsRefresh,
  productMfgOptions,
  /** Override the + button tooltip. */
  buttonTitle,
  selectAutoOpenOnFocus = false,
}) {
  const [quickOpen, setQuickOpen] = useState(false);
  const [resKey, setResKey] = useState(0);

  const perm = PERM[kind];
  const allowCreate =
    kind === "division"
      ? can("DIVISIONS", "ADD") || can("VENDORS", "ADD")
      : perm && can(perm[0], perm[1]);

  const label = KIND_LABEL[kind] || "record";

  /* Detect modal context (mfzInput class) to apply tighter layout */
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
          title={buttonTitle || `Add new ${label}`}
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
