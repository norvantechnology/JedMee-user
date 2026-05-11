import { useEffect, useMemo, useState } from "react";
import VendorMasterModal from "./VendorMasterModal.jsx";
import CommonModal, { useCustomerModalForm, CustomerModalFormBody, CustomerModalFooter } from "./CommonModal.jsx";
import { IconCustomerMark } from "./ui/AppIcons.jsx";
import { readAuth } from "../services/authStorage.js";
import { isRetailerAuth } from "../utils/businessRole.js";
import DivisionMasterModal from "./DivisionMasterModal.jsx";
import MfgCompanyMasterModal from "./MfgCompanyMasterModal.jsx";
import ProductMasterModal from "./ProductMasterModal.jsx";
import { createVendor } from "../services/vendorService.js";
import { createCustomer } from "../services/customerService.js";
import { createProduct } from "../services/productService.js";
import { createMfgCompany, listMfgCompanies } from "../services/mfgCompanyService.js";
import { createDivision, listDivisions } from "../services/divisionService.js";
import { parseApiError } from "../utils/api.js";
import { emitToast } from "../services/toastBus.js";

/**
 * Thin dispatcher that opens the full master modal for the requested kind. Keeps a single
 * source of truth for add/edit UI per master (vendor, customer, product, mfg company, division).
 *
 * `productMfgOptions` is accepted for backward compatibility (older callers pass raw mfg
 * company rows used to populate manufacturer selects inside the product/vendor/division
 * forms). When absent we lazy-load it from the API so every quick-create form sees the
 * same fields as the dedicated master pages.
 */
export default function QuickCreateMasterModal({ open, kind, onClose, onCreated, productMfgOptions = [] }) {
  const [busy, setBusy] = useState(false);
  const [depsLoading, setDepsLoading] = useState(false);
  const [mfgRows, setMfgRows] = useState([]);
  const [divisionRows, setDivisionRows] = useState([]);

  const isRetailer = isRetailerAuth(readAuth());
  const customerForm = useCustomerModalForm({
    open: Boolean(open && kind === "customer"),
    mode: "add",
    initialValue: null,
    isRetailer,
    busy,
    onClose
  });

  async function refreshMfgCompanies() {
    const r = await listMfgCompanies({ sortBy: "name", sortDir: "asc" });
    if (r.status >= 200 && r.status < 300 && r.json?.ok) setMfgRows(r.json?.data?.companies || []);
  }

  async function refreshDivisions() {
    const dr = await listDivisions({ sortBy: "name", sortDir: "asc" });
    if (dr.status >= 200 && dr.status < 300 && dr.json?.ok) setDivisionRows(dr.json?.data?.divisions || []);
  }

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setDepsLoading(false);
    if (Array.isArray(productMfgOptions) && productMfgOptions.length) {
      setMfgRows(productMfgOptions);
    }
    if (kind === "product" || kind === "vendor" || kind === "division" || kind === "mfgCompany") {
      (async () => {
        setDepsLoading(true);
        try {
          const tasks = [];
          if (!Array.isArray(productMfgOptions) || !productMfgOptions.length) tasks.push(refreshMfgCompanies());
          if (kind === "product") tasks.push(refreshDivisions());
          await Promise.all(tasks);
        } finally {
          setDepsLoading(false);
        }
      })();
    }
  }, [open, kind, productMfgOptions]);

  async function handleSubmit(payload) {
    setBusy(true);
    const toastOpts = { toast: "none" };
    try {
      let resp = null;
      let record = null;
      if (kind === "vendor") {
        resp = await createVendor(payload, toastOpts);
        record = resp?.json?.data?.vendor;
      } else if (kind === "customer") {
        resp = await createCustomer(payload, toastOpts);
        record = resp?.json?.data?.customer;
      } else if (kind === "product") {
        resp = await createProduct(payload, toastOpts);
        record = resp?.json?.data?.product;
      } else if (kind === "division") {
        resp = await createDivision(payload, toastOpts);
        record = resp?.json?.data?.division;
      } else if (kind === "mfgCompany") {
        resp = await createMfgCompany(payload, toastOpts);
        record = resp?.json?.data?.company;
      }
      if (resp && resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
        emitToast({ type: "success", message: resp.json?.meta?.message || "Saved." });
        await Promise.resolve(onCreated?.(record));
        onClose?.();
      } else if (resp && resp.status !== 401) {
        emitToast({ type: "error", message: parseApiError(resp) });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  if (kind === "vendor") {
    return (
      <VendorMasterModal
        open={open}
        mode="add"
        busy={busy}
        loading={depsLoading}
        mfgCompanyOptions={mfgRows}
        onRefreshMfgCompanies={refreshMfgCompanies}
        onClose={onClose}
        onSubmit={handleSubmit}
        portal
        portalZIndex={560}
      />
    );
  }
  if (kind === "customer") {
    return (
      <CommonModal
        open={open}
        title="Add Customer"
        subtitle=""
        icon={<IconCustomerMark />}
        onClose={customerForm.handleExplicitClose}
        onOverlayClose={customerForm.handleOverlayClose}
        portal
        portalZIndex={560}
        footer={
          <CustomerModalFooter
            busy={busy}
            mode="add"
            canSubmit={customerForm.canSubmit}
            form={customerForm.form}
            setSubmitted={customerForm.setSubmitted}
            onCancel={customerForm.handleExplicitClose}
            onSubmit={handleSubmit}
          />
        }
      >
        <CustomerModalFormBody
          form={customerForm.form}
          setForm={customerForm.setForm}
          busy={busy}
          submitted={customerForm.submitted}
          showCompliance={customerForm.showCompliance}
          setShowCompliance={customerForm.setShowCompliance}
          isRetailer={isRetailer}
          taxIdLabel={customerForm.taxIdLabel}
          typeOptions={customerForm.typeOptions}
          gstError={customerForm.gstError}
          phoneClean={customerForm.phoneClean}
          phoneRequired={customerForm.phoneRequired}
          phone={customerForm.phone}
        />
      </CommonModal>
    );
  }
  if (kind === "division") {
    return (
      <DivisionMasterModal
        open={open}
        mode="add"
        busy={busy}
        loading={depsLoading}
        mfgCompanyOptions={mfgRows}
        onRefreshMfgCompanies={refreshMfgCompanies}
        onClose={onClose}
        onSubmit={handleSubmit}
        portal
        portalZIndex={560}
      />
    );
  }
  if (kind === "mfgCompany") {
    return (
      <MfgCompanyMasterModal
        open={open}
        mode="add"
        busy={busy}
        existingRows={mfgRows}
        onClose={onClose}
        onSubmit={handleSubmit}
        portal
        portalZIndex={560}
      />
    );
  }
  if (kind === "product") {
    return (
      <ProductMasterModal
        open={open}
        mode="add"
        busy={busy}
        loading={depsLoading}
        mfgCompanyOptions={mfgRows}
        divisionOptions={divisionRows}
        onRefreshMfg={refreshMfgCompanies}
        onRefreshDivisions={refreshDivisions}
        onClose={onClose}
        onSubmit={handleSubmit}
        portal
        portalZIndex={560}
      />
    );
  }
  return null;
}
