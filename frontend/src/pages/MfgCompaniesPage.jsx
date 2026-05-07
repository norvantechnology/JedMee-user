import { useEffect, useMemo, useState } from "react";
import { useSeoMeta } from "../utils/seo.js";
import AppShell from "../layouts/AppShell.jsx";
import CommonTable from "../components/CommonTable.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import MfgCompanyMasterModal, { initialMfgFromRow } from "../components/MfgCompanyMasterModal.jsx";
import { can } from "../utils/access.js";
import { onAuthChanged, readAuth } from "../services/authStorage.js";
import { emitToast } from "../services/toastBus.js";
import { parseApiError } from "../utils/api.js";
import {
  bulkDeleteMfgCompanies,
  createMfgCompany,
  deleteMfgCompany,
  listMfgCompanies,
  updateMfgCompany
} from "../services/mfgCompanyService.js";
import { NAV_LABELS } from "../constants/navLabels.js";
import { clean } from "../utils/format.js";
import "../components/StructuredForm.css";
import "./MfgCompaniesPage.css";
import { IconBtn, IconEdit, IconTrash } from "../components/TableActionKit.jsx";
import CsvImportWizard from "../components/import/CsvImportWizard.jsx";
import { downloadCsvFile } from "../components/reports/reportExport.js";
import TableCsvActions from "../components/ui/TableCsvActions.jsx";

export default function MfgCompaniesPage() {
  useSeoMeta({ title: "Manufacturers" });
  const auth = readAuth();
  const user = auth?.user || null;
  const [authTick, setAuthTick] = useState(0);

  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [lockFilter, setLockFilter] = useState("");
  const [restrictionFilter, setRestrictionFilter] = useState("");
  const [sort, setSort] = useState({ by: "created_at", dir: "desc" });

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, id: "", name: "" });
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    return onAuthChanged(() => setAuthTick((t) => t + 1));
  }, []);

  // eslint-disable-next-line no-unused-vars
  const _ = authTick;
  const canView = can("MFG_COMPANIES", "VIEW");
  const canAdd = can("MFG_COMPANIES", "ADD");
  const canUpdate = can("MFG_COMPANIES", "UPDATE");
  const canDelete = can("MFG_COMPANIES", "DELETE");

  async function refresh() {
    setBusy(true);
    const resp = await listMfgCompanies({ sortBy: sort.by, sortDir: sort.dir, q: clean(search) });
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      setRows(resp.json?.data?.companies || []);
    } else {
      if (resp.status !== 401) emitToast({ type: "error", message: parseApiError(resp) });
    }
    setBusy(false);
  }

  useEffect(() => {
    if (canView) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, authTick, sort.by, sort.dir]);

  const filtered = useMemo(() => {
    const q = clean(search).toLowerCase();
    return (rows || []).filter((c) => {
      const blob = `${c.code || ""} ${c.name || ""} ${c.short_name || ""} ${c.rack_no || ""}`.toLowerCase();
      const matchesSearch = !q || blob.includes(q);
      const hasAnyLock = Boolean(c.sale_lock || c.purchase_order_lock || c.stock_report_lock);
      const hasAnyRestriction = Boolean(c.prevent_free_qty || c.prevent_discount || c.prevent_net_rate || c.prevent_return_product || c.prevent_expiry_damage_product);
      const matchesLock = !lockFilter || (lockFilter === "locked" ? hasAnyLock : !hasAnyLock);
      const matchesRestriction = !restrictionFilter || (restrictionFilter === "restricted" ? hasAnyRestriction : !hasAnyRestriction);
      return matchesSearch && matchesLock && matchesRestriction;
    });
  }, [rows, search, lockFilter, restrictionFilter]);

  if (!canView) {
    return (
      <AppShell userName={user?.full_name || "User"} userEmail={user?.email || auth?.email || ""} userBusinessName={user?.firm_name || ""} userGstNumber={user?.gst_number || ""} variant="user">
        <div className="pageWrap">
          <div className="pageCard">
            <div className="raTitle">{NAV_LABELS.mfgCompanies}</div>
            <div className="raSub">You don’t have permission to view manufacturing companies.</div>
          </div>
        </div>
      </AppShell>
    );
  }

  async function handleSubmit(payload) {
    setBusy(true);
    const resp = editOpen && editing?.id ? await updateMfgCompany(editing.id, payload) : await createMfgCompany(payload);
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      setCreateOpen(false);
      setEditOpen(false);
      setEditing(null);
      await refresh();
      emitToast({ type: "success", message: editOpen ? "Manufacturing company updated." : "Manufacturing company created." });
    } else {
      if (resp.status !== 401) emitToast({ type: "error", message: parseApiError(resp) });
    }
    setBusy(false);
  }

  return (
    <AppShell userName={user?.full_name || "User"} userEmail={user?.email || auth?.email || ""} userBusinessName={user?.firm_name || ""} userGstNumber={user?.gst_number || ""} variant="user">
      <div className="mcTop pageWrap">
        <div className="raTop">
          <div>
            <div className="raTitle">{NAV_LABELS.mfgCompanies}</div>
            <div className="raSub">Manage manufacturers and enforce company-wise locks and limits.</div>
          </div>
        </div>

        <div className="pageCard">
          <CommonTable
            title=""
            subtitle=""
            compact
            countText={busy ? "Loading…" : `${filtered.length} companies`}
            search={search}
            onSearchChange={setSearch}
            filters={[
              {
                id: "locks",
                label: "Locks",
                value: lockFilter,
                onChange: setLockFilter,
                options: [
                  { value: "", label: "All lock states" },
                  { value: "locked", label: "Any lock active" },
                  { value: "unlocked", label: "No locks" }
                ]
              },
              {
                id: "restrictions",
                label: "Restrictions",
                value: restrictionFilter,
                onChange: setRestrictionFilter,
                options: [
                  { value: "", label: "All restriction states" },
                  { value: "restricted", label: "Any restriction active" },
                  { value: "unrestricted", label: "No restrictions" }
                ]
              }
            ]}
            controlsPlacement="top"
            sort={sort}
            onSortChange={setSort}
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
                      { key: "rack_no", label: "rack_no" },
                      { key: "sale_lock", label: "sale_lock" },
                      { key: "purchase_order_lock", label: "purchase_order_lock" },
                      { key: "prevent_discount", label: "prevent_discount" },
                      { key: "prevent_free_qty", label: "prevent_free_qty" },
                      { key: "out_bill_limit", label: "out_bill_limit" },
                      { key: "out_day_limit", label: "out_day_limit" },
                      { key: "credit_limit", label: "credit_limit" }
                    ];
                    downloadCsvFile(
                      "manufacturers_export.csv",
                      cols,
                      filtered.map((r) => ({
                        code: r.code,
                        name: r.name,
                        short_name: r.short_name || "",
                        rack_no: r.rack_no || "",
                        sale_lock: r.sale_lock ? "TRUE" : "FALSE",
                        purchase_order_lock: r.purchase_order_lock ? "TRUE" : "FALSE",
                        prevent_discount: r.prevent_discount ? "TRUE" : "FALSE",
                        prevent_free_qty: r.prevent_free_qty ? "TRUE" : "FALSE",
                        out_bill_limit: r.out_bill_limit ?? "",
                        out_day_limit: r.out_day_limit ?? "",
                        credit_limit: r.credit_limit ?? ""
                      }))
                    );
                  }}
                />
              ) : null
            }
            primaryAction={
              canAdd
                ? {
                    label: "Add company",
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
              setEditing(r);
              setEditOpen(true);
            }}
            onRowDelete={(r) => {
              if (!canDelete) return;
              setConfirm({ open: true, id: r.id, name: r.name || r.code || "" });
            }}
            bulkDelete={
              canDelete
                ? {
                    label: "Delete All",
                    confirmTitle: "Delete companies?",
                    confirmMessage: (n) => `Remove ${n} selected manufacturing company record(s)?`,
                    onDelete: async (ids) => {
                      setBusy(true);
                      const r = await bulkDeleteMfgCompanies(ids);
                      setBusy(false);
                      if (r.status >= 200 && r.status < 300 && r.json?.ok) {
                        const failed = r.json?.data?.failed || [];
                        if (failed.length) emitToast({ type: "warning", message: `${failed.length} record(s) were not found or already removed.` });
                        await refresh();
                      } else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
                    }
                  }
                : undefined
            }
            columns={[
              { id: "code", header: "Code", render: (r) => <span style={{ fontWeight: 800 }}>{r.code || ""}</span> },
              { id: "name", header: "Name", render: (r) => <span style={{ fontWeight: 700 }}>{r.name || ""}</span> },
              { id: "short_name", header: "Short name", render: (r) => <span>{r.short_name || ""}</span> },
              { id: "rack_no", header: "Rack", render: (r) => <span>{r.rack_no || ""}</span> },
              {
                id: "limits",
                header: "Limits",
                sortable: false,
                render: (r) => {
                  const bill = Number(r.out_bill_limit ?? 0) || 0;
                  const day = Number(r.out_day_limit ?? 0) || 0;
                  const credit = Number(r.credit_limit ?? 0) || 0;
                  const parts = [];
                  if (bill > 0) parts.push(`Bills ${bill}`);
                  if (day > 0) parts.push(`Days ${day}`);
                  if (credit > 0) parts.push(`Credit ₹${credit}`);
                  return <span style={{ color: "var(--color-text-3)" }}>{parts.join(" · ")}</span>;
                }
              },
              {
                id: "locks",
                header: "Locks",
                sortable: false,
                render: (r) => {
                  const parts = [];
                  if (r.sale_lock) parts.push("Sale");
                  if (r.purchase_order_lock) parts.push("PO");
                  if (r.stock_report_lock) parts.push("Stock");
                  return <span style={{ color: "var(--color-text-3)" }}>{parts.length ? parts.join(", ") : ""}</span>;
                }
              },
              {
                id: "restrictions",
                header: "Restrictions",
                sortable: false,
                render: (r) => {
                  const parts = [];
                  if (r.prevent_discount) parts.push("No discount");
                  if (r.prevent_free_qty) parts.push("No free qty");
                  if (r.prevent_net_rate) parts.push("No net rate");
                  if (r.prevent_return_product) parts.push("No returns");
                  if (r.prevent_expiry_damage_product) parts.push("No expiry/damage");
                  return <span style={{ color: "var(--color-text-3)" }}>{parts.length ? parts.join(", ") : ""}</span>;
                }
              },
              { id: "created_at", header: "Created", sortable: false, render: (r) => <span style={{ color: "var(--color-text-3)" }}>{String(r.created_at || "").slice(0, 10)}</span> },
              {
                id: "actions",
                header: "Actions",
                sortable: false,
                align: "right",
                render: (r) => (
                  <div className="ibGroup" onClick={(e) => e.stopPropagation()}>
                    {canUpdate ? (
                      <IconBtn
                        tooltip="Edit manufacturer"
                        disabled={busy}
                        onClick={() => {
                          setEditing(r);
                          setEditOpen(true);
                        }}
                      >
                        <IconEdit />
                      </IconBtn>
                    ) : null}
                    {canDelete ? (
                      <IconBtn variant="danger" disabled={busy} tooltip="Delete manufacturer" onClick={() => setConfirm({ open: true, id: r.id, name: r.name || r.code || "" })}>
                        <IconTrash />
                      </IconBtn>
                    ) : null}
                  </div>
                )
              }
            ]}
          />
        </div>
      </div>

      <MfgCompanyMasterModal
        open={createOpen}
        mode="add"
        busy={busy}
        existingRows={rows}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleSubmit}
      />

      <MfgCompanyMasterModal
        open={editOpen}
        mode="edit"
        busy={busy}
        existingRows={rows}
        initialValue={editing ? initialMfgFromRow(editing) : null}
        onClose={() => {
          setEditOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
      />

      <CsvImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityType="MANUFACTURERS"
        title="Import manufacturers"
        onCompleted={() => refresh()}
      />

      <ConfirmDialog
        open={confirm.open}
        title="Delete company?"
        message={confirm.name ? `Delete “${confirm.name}”?` : "Delete this company?"}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        busy={busy}
        onClose={() => setConfirm({ open: false, id: "", name: "" })}
        onConfirm={async () => {
          if (!confirm.id) return;
          setBusy(true);
          const resp = await deleteMfgCompany(confirm.id);
          if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
            await refresh();
          } else {
            if (resp.status !== 401) emitToast({ type: "error", message: parseApiError(resp) });
          }
          setBusy(false);
          setConfirm({ open: false, id: "", name: "" });
        }}
      />
    </AppShell>
  );
}


