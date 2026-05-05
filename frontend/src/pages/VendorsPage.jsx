import { useEffect, useMemo, useState } from "react";
import { useSeoMeta } from "../utils/seo.js";
import AppShell from "../layouts/AppShell.jsx";
import CommonTable from "../components/CommonTable.jsx";
import VendorMasterModal from "../components/VendorMasterModal.jsx";
import { can } from "../utils/access.js";
import { onAuthChanged, readAuth } from "../services/authStorage.js";
import { isRetailerAuth } from "../utils/businessRole.js";
import { emitToast } from "../services/toastBus.js";
import { parseApiError } from "../utils/api.js";
import { bulkDeleteVendors, createVendor, deleteVendor, listVendors, updateVendor } from "../services/vendorService.js";
import { listMfgCompanies } from "../services/mfgCompanyService.js";
import { NAV_LABELS } from "../constants/navLabels.js";
import "./VendorsPage.css";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import "../components/StructuredForm.css";
import { IconBtn, IconEdit, IconTrash } from "../components/TableActionKit.jsx";
import CsvImportWizard from "../components/import/CsvImportWizard.jsx";
import { downloadCsvFile } from "../components/reports/reportExport.js";
import TableCsvActions from "../components/ui/TableCsvActions.jsx";

function clean(v) {
  return String(v ?? "").trim();
}

export default function VendorsPage() {
  useSeoMeta({ title: "Suppliers" });
  const auth = readAuth();
  const user = auth?.user || null;
  const [authTick, setAuthTick] = useState(0);
  const isRetailer = useMemo(() => isRetailerAuth(auth), [auth]);
  const entityLabel = isRetailer ? "supplier" : "vendor";

  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [vendorTypeFilter, setVendorTypeFilter] = useState("");
  const [sort, setSort] = useState({ by: "created_at", dir: "desc" });

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [mfgCompanies, setMfgCompanies] = useState([]);
  const [confirm, setConfirm] = useState({ open: false, id: "", name: "" });
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    return onAuthChanged(() => setAuthTick((t) => t + 1));
  }, []);

  // eslint-disable-next-line no-unused-vars
  const _ = authTick;
  const canView = can("VENDORS", "VIEW");
  const canAdd = can("VENDORS", "ADD");
  const canUpdate = can("VENDORS", "UPDATE");
  const canDelete = can("VENDORS", "DELETE");

  async function refresh() {
    setBusy(true);
    const resp = await listVendors({ sortBy: sort.by, sortDir: sort.dir });
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      setRows(resp.json?.data?.vendors || []);
    } else {
      // 401 errors are auto-toasted by apiClient (avoid double toasts).
      if (resp.status !== 401) emitToast({ type: "error", message: parseApiError(resp) });
    }
    setBusy(false);
  }

  useEffect(() => {
    if (canView) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, authTick, sort.by, sort.dir]);

  async function refreshMfgCompanies() {
    const m = await listMfgCompanies({ limit: 500, offset: 0 });
    if (m.status >= 200 && m.status < 300 && m.json?.ok) {
      setMfgCompanies(m.json?.data?.companies || []);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const m = await listMfgCompanies({ limit: 500, offset: 0 });
      if (!alive) return;
      if (m.status >= 200 && m.status < 300 && m.json?.ok) setMfgCompanies(m.json?.data?.companies || []);
    })();
    return () => {
      alive = false;
    };
  }, [authTick]);

  const filtered = useMemo(() => {
    const q = clean(search).toLowerCase();
    const base = (rows || [])
      .filter((v) => {
        if (!statusFilter) return true;
        if (statusFilter === "ACTIVE") return Boolean(v.is_active);
        if (statusFilter === "INACTIVE") return !Boolean(v.is_active);
        return true;
      })
      .filter((v) => {
        if (isRetailer) {
          if (!vendorTypeFilter) return true;
          return String(v.vendor_type || "WHOLESALER") === vendorTypeFilter;
        }
        if (!companyFilter) return true;
        const c = String(v.main_company || "").trim();
        if (companyFilter === "__none__") return !c;
        return c === companyFilter;
      });
    if (!q) return base;
    return base.filter((v) => {
      const blob = `${v.code || ""} ${v.name || ""} ${v.short_name || ""} ${v.main_company || ""} ${v.rack_number || ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search, statusFilter, companyFilter, vendorTypeFilter, isRetailer]);

  const companyOptions = useMemo(() => {
    const set = new Set();
    for (const v of rows || []) {
      const c = String(v?.main_company || "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  if (!canView) {
    return (
      <AppShell
       
        userName={user?.full_name || "User"}
        userEmail={user?.email || auth?.email || ""}
        userBusinessName={user?.firm_name || ""}
        userGstNumber={user?.gst_number || ""}
        variant="user"
      >
        <div className="pageWrap">
          <div className="pageCard">
            <div className="raTitle">{NAV_LABELS.vendors}</div>
            <div className="raSub">You don’t have permission to view {isRetailer ? "suppliers" : "vendors"}.</div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
     
      userName={user?.full_name || "User"}
      userEmail={user?.email || auth?.email || ""}
      userBusinessName={user?.firm_name || ""}
      userGstNumber={user?.gst_number || ""}
      variant="user"
    >
      <div className="pageWrap">
        <div className="raTop">
          <div>
            <div className="raTitle">{NAV_LABELS.vendors}</div>
            <div className="raSub">
              {isRetailer
                ? "Local wholesalers and distributors you purchase stock from."
                : "Manage vendors, rack numbers, and key details."}
            </div>
          </div>
        </div>

        <div className="pageCard">
          <CommonTable
            title=""
            subtitle=""
            compact
            countText={busy ? "Loading…" : `${filtered.length} ${isRetailer ? "suppliers" : "vendors"}`}
            search={search}
            onSearchChange={setSearch}
            controlsPlacement="top"
            sort={sort}
            onSortChange={setSort}
            filters={
              isRetailer
                ? [
                    {
                      id: "status",
                      label: "Status",
                      value: statusFilter,
                      onChange: setStatusFilter,
                      options: [
                        { value: "", label: "All status" },
                        { value: "ACTIVE", label: "Active" },
                        { value: "INACTIVE", label: "Inactive" }
                      ]
                    },
                    {
                      id: "vendor_type",
                      label: "Type",
                      value: vendorTypeFilter,
                      onChange: setVendorTypeFilter,
                      options: [
                        { value: "", label: "All types" },
                        { value: "WHOLESALER", label: "Wholesaler" },
                        { value: "DISTRIBUTOR", label: "Distributor" },
                        { value: "DIRECT_MFG", label: "Direct manufacturer" },
                        { value: "OTHER", label: "Other" }
                      ]
                    }
                  ]
                : [
                    {
                      id: "status",
                      label: "Status",
                      value: statusFilter,
                      onChange: setStatusFilter,
                      options: [
                        { value: "", label: "All status" },
                        { value: "ACTIVE", label: "Active" },
                        { value: "INACTIVE", label: "Inactive" }
                      ]
                    },
                    {
                      id: "company",
                      label: "Main company",
                      value: companyFilter,
                      onChange: setCompanyFilter,
                      options: [{ value: "", label: "All companies" }, { value: "__none__", label: "No company" }, ...companyOptions.map((c) => ({ value: c, label: c }))]
                    }
                  ]
            }
            extraHeaderActions={
              canAdd ? (
                <TableCsvActions
                  disabled={busy}
                  onImport={() => setImportOpen(true)}
                  onExport={() => {
                    const cols = [
                      { key: "code", label: "code" },
                      { key: "name", label: "name" },
                      { key: "short_name", label: "short_name" },
                      { key: "vendor_type", label: "vendor_type" },
                      { key: "credit_days", label: "credit_days" },
                      { key: "phone", label: "phone" },
                      { key: "email", label: "email" },
                      { key: "address", label: "address" },
                      { key: "main_brand", label: "main_brand" },
                      { key: "notes", label: "notes" },
                      { key: "is_active", label: "is_active" }
                    ];
                    downloadCsvFile(
                      "suppliers_export.csv",
                      cols,
                      filtered.map((v) => ({
                        code: v.code,
                        name: v.name,
                        short_name: v.short_name || "",
                        vendor_type: v.vendor_type || "WHOLESALER",
                        credit_days: v.credit_days ?? 0,
                        phone: v.phone_number || "",
                        email: v.email || "",
                        address: v.address || "",
                        main_brand: v.main_company || "",
                        notes: v.notes || "",
                        is_active: v.is_active ? "TRUE" : "FALSE"
                      }))
                    );
                  }}
                />
              ) : null
            }
            primaryAction={
              canAdd
                ? {
                    label: `Add ${entityLabel}`,
                    onClick: () => {
                      setEditing(null);
                      setCreateOpen(true);
                    }
                  }
                : null
            }
            rows={filtered}
            selectedId={editing?.id || ""}
            getRowId={(r) => r.id}
            onRowClick={(r) => {
              if (!canUpdate) return;
              setEditing({
                id: r.id,
                code: r.code || "",
                name: r.name || "",
                shortName: r.short_name || "",
                rackNumber: r.rack_number || "",
                mainCompany: r.main_company || "",
                creditDays: Number(r.credit_days ?? 0),
                mfgCompanyId: r.mfg_company_id ? String(r.mfg_company_id) : "",
                vendorType: r.vendor_type || "WHOLESALER",
                phoneCountryCode: r.phone_country_code || "+91",
                phoneNumber: r.phone_number || "",
                email: r.email || "",
                address: r.address || "",
                notes: r.notes || "",
                isActive: Boolean(r.is_active)
              });
              setEditOpen(true);
            }}
            onRowDelete={(v) => {
              if (!canDelete) return;
              setConfirm({ open: true, id: v.id, name: v.name || v.code || "" });
            }}
            bulkDelete={
              canDelete
                ? {
                    label: "Delete All",
                    confirmTitle: isRetailer ? "Delete suppliers?" : "Delete vendors?",
                    confirmMessage: (n) => `Remove ${n} selected ${entityLabel}(s)?`,
                    onDelete: async (ids) => {
                      setBusy(true);
                      const r = await bulkDeleteVendors(ids);
                      setBusy(false);
                      if (r.status >= 200 && r.status < 300 && r.json?.ok) {
                        const failed = r.json?.data?.failed || [];
                        if (failed.length) emitToast({ type: "warning", message: `${failed.length} ${entityLabel}(s) were not found or already removed.` });
                        await refresh();
                      } else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
                    }
                  }
                : undefined
            }
            columns={[
              { id: "code", header: "Code", render: (v) => <span style={{ fontWeight: 800 }}>{v.code}</span> },
              { id: "name", header: "Name", render: (v) => <span style={{ fontWeight: 700 }}>{v.name}</span> },
              { id: "short_name", header: "Short name", render: (v) => <span style={{ color: "var(--color-text-3)" }}>{v.short_name || ""}</span> },
              {
                id: "is_active",
                header: "Status",
                render: (v) => (
                  <span style={{ fontWeight: 800, color: v.is_active ? "var(--color-success)" : "var(--color-text-4)" }}>
                    {v.is_active ? "Active" : "Inactive"}
                  </span>
                )
              },
              ...(isRetailer
                ? [
                    {
                      id: "vendor_type",
                      header: "Type",
                      render: (v) => {
                        const t = String(v.vendor_type || "WHOLESALER");
                        const map = {
                          WHOLESALER: "Wholesaler",
                          DISTRIBUTOR: "Distributor",
                          DIRECT_MFG: "Direct mfg",
                          OTHER: "Other"
                        };
                        return <span style={{ color: "var(--color-text-3)" }}>{map[t] || t}</span>;
                      }
                    }
                  ]
                : [
                    { id: "rack_number", header: "Rack", render: (v) => <span style={{ color: "var(--color-text-3)" }}>{v.rack_number || ""}</span> },
                    { id: "main_company", header: "Main company", render: (v) => <span style={{ color: "var(--color-text-3)" }}>{v.main_company || ""}</span> }
                  ]),
              {
                id: "credit_days",
                header: "Credit days",
                align: "right",
                render: (v) => <span style={{ color: "var(--color-text-3)" }}>{Number(v.credit_days ?? 0)}</span>
              },
              {
                id: "phone_number",
                header: "Phone",
                sortable: false,
                render: (v) => `${v.phone_country_code || ""} ${v.phone_number || ""}`.trim()
              },
              {
                id: "email",
                header: "Email",
                sortable: false,
                render: (v) => <span style={{ color: "var(--color-text-3)" }}>{v.email || ""}</span>
              },
              {
                id: "actions",
                header: "Actions",
                sortable: false,
                align: "right",
                render: (v) => (
                  <div className="ibGroup" onClick={(e) => e.stopPropagation()}>
                    {canUpdate ? (
                      <IconBtn
                        tooltip={`Edit ${entityLabel}`}
                        disabled={busy}
                        onClick={() => {
                          setEditing({
                            id: v.id,
                            code: v.code || "",
                            name: v.name || "",
                            shortName: v.short_name || "",
                            rackNumber: v.rack_number || "",
                            mainCompany: v.main_company || "",
                            creditDays: Number(v.credit_days ?? 0),
                            mfgCompanyId: v.mfg_company_id ? String(v.mfg_company_id) : "",
                            vendorType: v.vendor_type || "WHOLESALER",
                            phoneCountryCode: v.phone_country_code || "+91",
                            phoneNumber: v.phone_number || "",
                            email: v.email || "",
                            address: v.address || "",
                            notes: v.notes || "",
                            isActive: Boolean(v.is_active)
                          });
                          setEditOpen(true);
                        }}
                      >
                        <IconEdit />
                      </IconBtn>
                    ) : null}
                    {canDelete ? (
                      <IconBtn
                        variant="danger"
                        disabled={busy}
                        tooltip={`Delete ${entityLabel}`}
                        onClick={() => {
                          setConfirm({ open: true, id: v.id, name: v.name || v.code || "" });
                        }}
                      >
                        <IconTrash />
                      </IconBtn>
                    ) : null}
                  </div>
                )
              }
            ]}
            pagination={null}
          />
        </div>
      </div>

      <CsvImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityType="SUPPLIERS"
        title={isRetailer ? "Import suppliers" : "Import vendors"}
        onCompleted={() => refresh()}
      />

      <VendorMasterModal
        open={createOpen}
        mode="add"
        busy={busy}
        mfgCompanyOptions={mfgCompanies}
        onRefreshMfgCompanies={refreshMfgCompanies}
        onClose={() => !busy && setCreateOpen(false)}
        onSubmit={async (payload) => {
          if (!canAdd) return;
          setBusy(true);
          const resp = await createVendor(payload);
          if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
            setCreateOpen(false);
            await refresh();
          } else if (resp.status !== 401) emitToast({ type: "error", message: parseApiError(resp) });
          setBusy(false);
        }}
      />

      <VendorMasterModal
        open={editOpen}
        mode="edit"
        busy={busy}
        initialValue={editing}
        mfgCompanyOptions={mfgCompanies}
        onRefreshMfgCompanies={refreshMfgCompanies}
        onClose={() => !busy && setEditOpen(false)}
        onSubmit={async (payload) => {
          if (!canUpdate || !editing?.id) return;
          setBusy(true);
          const resp = await updateVendor(editing.id, payload);
          if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
            setEditOpen(false);
            await refresh();
          } else if (resp.status !== 401) emitToast({ type: "error", message: parseApiError(resp) });
          setBusy(false);
        }}
      />

      <ConfirmDialog
        open={confirm.open}
        title={isRetailer ? "Delete supplier?" : "Delete vendor?"}
        message={confirm.name ? `Delete ${confirm.name}?` : `Delete this ${entityLabel}?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        busy={busy}
        onClose={() => setConfirm({ open: false, id: "", name: "" })}
        onConfirm={async () => {
          if (!confirm.id) return;
          setBusy(true);
          const resp = await deleteVendor(confirm.id);
          if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
            await refresh();
          }
          setBusy(false);
          setConfirm({ open: false, id: "", name: "" });
        }}
      />
    </AppShell>
  );
}

