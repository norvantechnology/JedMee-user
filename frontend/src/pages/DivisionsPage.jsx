import { useEffect, useMemo, useState } from "react";
import { useSeoMeta } from "../utils/seo.js";
import AppShell from "../layouts/AppShell.jsx";
import CommonTable from "../components/CommonTable.jsx";
import DivisionMasterModal from "../components/DivisionMasterModal.jsx";
import { can } from "../utils/access.js";
import { onAuthChanged, readAuth } from "../services/authStorage.js";
import { emitToast } from "../services/toastBus.js";
import { parseApiError } from "../utils/api.js";
import { clean } from "../utils/format.js";
import { createDivision, deleteDivision, listDivisions, updateDivision } from "../services/divisionService.js";
import { listMfgCompanies } from "../services/mfgCompanyService.js";
import { NAV_LABELS } from "../constants/navLabels.js";
import "./VendorsPage.css";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import "../components/StructuredForm.css";
import { IconBtn, IconEdit, IconLayers, IconLinkOut, IconTrash, TableIconLink } from "../components/TableActionKit.jsx";
import CsvImportWizard from "../components/import/CsvImportWizard.jsx";
import { downloadCsvFile } from "../components/reports/reportExport.js";
import TableCsvActions from "../components/ui/TableCsvActions.jsx";

function permDiv(resource, action) {
  return can(resource, action) || (resource === "DIVISIONS" && can("VENDORS", action));
}

export default function DivisionsPage() {
  useSeoMeta({ title: "Divisions" });
  const auth = readAuth();
  const user = auth?.user || null;
  const [authTick, setAuthTick] = useState(0);

  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [mfgFilter, setMfgFilter] = useState("");
  const [sort, setSort] = useState({ by: "name", dir: "asc" });

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [mfgCompanies, setMfgCompanies] = useState([]);
  const [mfgCompaniesLoading, setMfgCompaniesLoading] = useState(false);
  const [confirm, setConfirm] = useState({ open: false, id: "", name: "" });

  useEffect(() => {
    return onAuthChanged(() => setAuthTick((t) => t + 1));
  }, []);

  // eslint-disable-next-line no-unused-vars
  const _ = authTick;
  const canView = permDiv("DIVISIONS", "VIEW");
  const canAdd = permDiv("DIVISIONS", "ADD");
  const canUpdate = permDiv("DIVISIONS", "UPDATE");
  const canDelete = permDiv("DIVISIONS", "DELETE");

  async function refresh() {
    setBusy(true);
    const resp = await listDivisions({ sortBy: sort.by, sortDir: sort.dir });
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      setRows(resp.json?.data?.divisions || []);
    } else {
      if (resp.status !== 401) emitToast({ type: "error", message: parseApiError(resp) });
    }
    setBusy(false);
  }

  useEffect(() => {
    if (canView) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, authTick, sort.by, sort.dir]);

  async function refreshMfgCompanies() {
    setMfgCompaniesLoading(true);
    try {
      const m = await listMfgCompanies({ limit: 500, offset: 0 });
      if (m.status >= 200 && m.status < 300 && m.json?.ok) {
        setMfgCompanies(m.json?.data?.companies || []);
      }
    } finally {
      setMfgCompaniesLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setMfgCompaniesLoading(true);
      try {
        const m = await listMfgCompanies({ limit: 500, offset: 0 });
        if (!alive) return;
        if (m.status >= 200 && m.status < 300 && m.json?.ok) setMfgCompanies(m.json?.data?.companies || []);
      } finally {
        if (alive) setMfgCompaniesLoading(false);
      }
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
        if (!mfgFilter) return true;
        return String(v.mfg_company_id || "") === String(mfgFilter);
      });
    if (!q) return base;
    return base.filter((v) => {
      const blob = `${v.code || ""} ${v.name || ""} ${v.short_name || ""} ${v.mfg_company_name || ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search, statusFilter, mfgFilter]);

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
            <div className="raTitle">{NAV_LABELS.divisions}</div>
            <div className="raSub">You don’t have permission to view divisions.</div>
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
            <div className="raTitle">{NAV_LABELS.divisions}</div>
            <div className="raSub">Supplier divisions under manufacturers  used for purchases and batches.</div>
          </div>
        </div>

        <div className="pageCard">
          <CommonTable
            title=""
            subtitle=""
            compact
            countText={busy ? "Loading…" : `${filtered.length} divisions`}
            search={search}
            onSearchChange={setSearch}
            controlsPlacement="top"
            sort={sort}
            onSortChange={setSort}
            filters={[
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
                id: "mfg",
                label: "Manufacturer",
                value: mfgFilter,
                onChange: setMfgFilter,
                options: [
                  { value: "", label: "All manufacturers" },
                  ...(mfgCompanies || []).map((c) => ({ value: String(c.id), label: c.name || c.code || String(c.id) }))
                ]
              }
            ]}
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
                      { key: "manufacturer_name", label: "manufacturer_name" },
                      { key: "credit_days", label: "credit_days" },
                      { key: "phone", label: "phone" },
                      { key: "email", label: "email" },
                      { key: "address", label: "address" },
                      { key: "is_active", label: "is_active" }
                    ];
                    downloadCsvFile(
                      "divisions_export.csv",
                      cols,
                      filtered.map((r) => ({
                        code: r.code,
                        name: r.name,
                        short_name: r.short_name || "",
                        manufacturer_name: r.mfg_company_name || "",
                        credit_days: r.credit_days ?? 0,
                        phone: r.phone_number || "",
                        email: r.email || "",
                        address: r.address || "",
                        is_active: r.is_active ? "TRUE" : "FALSE"
                      }))
                    );
                  }}
                />
              ) : null
            }
            primaryAction={
              canAdd
                ? {
                    label: "Add division",
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
                mfgCompanyId: r.mfg_company_id ? String(r.mfg_company_id) : "",
                creditDays: Number(r.credit_days ?? 0),
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
            columns={[
              { id: "code", header: "Code", render: (v) => <span style={{ fontWeight: 800 }}>{v.code}</span> },
              { id: "name", header: "Name", render: (v) => <span style={{ fontWeight: 700 }}>{v.name}</span> },
              { id: "short_name", header: "Short", sortable: false, render: (v) => <span style={{ color: "var(--color-text-3)" }}>{v.short_name || ""}</span> },
              {
                id: "mfg_company_name",
                header: "Manufacturer",
                render: (v) => <span style={{ color: "var(--color-text-3)" }}>{v.mfg_company_name || ""}</span>
              },
              {
                id: "is_active",
                header: "Status",
                render: (v) => (
                  <span style={{ fontWeight: 800, color: v.is_active ? "var(--color-success)" : "var(--color-text-4)" }}>
                    {v.is_active ? "Active" : "Inactive"}
                  </span>
                )
              },
              {
                id: "credit_days",
                header: "Credit days",
                align: "right",
                render: (v) => <span style={{ color: "var(--color-text-3)" }}>{Number(v.credit_days ?? 0)}</span>
              },
              {
                id: "contact",
                header: "Contact",
                render: (v) => (
                  <span style={{ color: "var(--color-text-3)", fontSize: 12.5 }}>
                    {[v.phone_number ? `${v.phone_country_code || ""} ${v.phone_number}`.trim() : "", v.email || ""].filter(Boolean).join(" · ") || ""}
                  </span>
                )
              },
              { id: "address", header: "Address", sortable: false, render: (v) => <span style={{ color: "var(--color-text-3)" }}>{v.address || ""}</span> },
              {
                id: "actions",
                header: "Actions",
                sortable: false,
                align: "right",
                render: (v) => (
                  <div className="ibGroup" onClick={(e) => e.stopPropagation()}>
                    <TableIconLink to={`/purchase-invoices?divisionId=${encodeURIComponent(String(v.id))}`} tooltip="Open purchase invoices for this division">
                      <IconLinkOut />
                    </TableIconLink>
                    <TableIconLink to={`/quality-master?divisionId=${encodeURIComponent(String(v.id))}`} tooltip="Open quality / stock for this division">
                      <IconLayers />
                    </TableIconLink>
                    {canUpdate ? (
                      <IconBtn
                        tooltip="Edit division"
                        disabled={busy}
                        onClick={() => {
                          setEditing({
                            id: v.id,
                            code: v.code || "",
                            name: v.name || "",
                            shortName: v.short_name || "",
                            mfgCompanyId: v.mfg_company_id ? String(v.mfg_company_id) : "",
                            creditDays: Number(v.credit_days ?? 0),
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
                      <IconBtn variant="danger" disabled={busy} tooltip="Delete division" onClick={() => setConfirm({ open: true, id: v.id, name: v.name || v.code || "" })}>
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
        entityType="DIVISIONS"
        title="Import divisions"
        onCompleted={() => refresh()}
      />

      <DivisionMasterModal
        open={createOpen}
        mode="add"
        busy={busy}
        mfgCompanyOptions={mfgCompanies}
        loading={mfgCompaniesLoading}
        onRefreshMfgCompanies={refreshMfgCompanies}
        onClose={() => !busy && setCreateOpen(false)}
        onSubmit={async (payload) => {
          if (!canAdd) return;
          setBusy(true);
          const resp = await createDivision(payload);
          if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
            setCreateOpen(false);
            await refresh();
          } else if (resp.status !== 401) emitToast({ type: "error", message: parseApiError(resp) });
          setBusy(false);
        }}
      />

      <DivisionMasterModal
        open={editOpen}
        mode="edit"
        busy={busy}
        initialValue={editing}
        mfgCompanyOptions={mfgCompanies}
        loading={mfgCompaniesLoading}
        onRefreshMfgCompanies={refreshMfgCompanies}
        onClose={() => !busy && setEditOpen(false)}
        onSubmit={async (payload) => {
          if (!canUpdate || !editing?.id) return;
          setBusy(true);
          const resp = await updateDivision(editing.id, payload);
          if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
            setEditOpen(false);
            await refresh();
          } else if (resp.status !== 401) emitToast({ type: "error", message: parseApiError(resp) });
          setBusy(false);
        }}
      />

      <ConfirmDialog
        open={confirm.open}
        title="Delete division?"
        message={confirm.name ? `Remove ${confirm.name}?` : "Remove this division?"}
        hint="Blocked if non-cancelled purchase invoices exist. This is a soft delete."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        busy={busy}
        onClose={() => setConfirm({ open: false, id: "", name: "" })}
        onConfirm={async () => {
          if (!confirm.id) return;
          setBusy(true);
          const resp = await deleteDivision(confirm.id);
          if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
            await refresh();
          } else if (resp.status !== 401) emitToast({ type: "error", message: parseApiError(resp) });
          setBusy(false);
          setConfirm({ open: false, id: "", name: "" });
        }}
      />
    </AppShell>
  );
}
