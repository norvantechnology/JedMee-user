import { useSeoMeta } from "../utils/seo.js";
import { AppButton } from "../components/ui/buttons.jsx";
import { useEffect, useState } from "react";
import AppShell from "../layouts/AppShell.jsx";
import CommonTable from "../components/CommonTable.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { readAuth } from "../services/authStorage.js";
import { can } from "../utils/access.js";
import { listPurchaseReturns, confirmPurchaseReturn } from "../services/purchaseService.js";
import { parseApiError } from "../utils/api.js";
import { emitToast } from "../services/toastBus.js";
import { NAV_LABELS } from "../constants/navLabels.js";
import { fmtMoney } from "../utils/format.js";
import { IconBtn, IconConfirm } from "../components/TableActionKit.jsx";
import { downloadCsvFile } from "../components/reports/reportExport.js";
import TableCsvActions from "../components/ui/TableCsvActions.jsx";
import CsvImportWizard from "../components/import/CsvImportWizard.jsx";

export default function PurchaseReturnsPage() {
  useSeoMeta({ title: "Purchase Returns" });
  const auth = readAuth();
  const user = auth?.user || null;

  const canView = can("PURCHASE_RETURNS", "VIEW");
  const canUpdate = can("PURCHASE_RETURNS", "UPDATE");
  const canAdd = can("PURCHASE_RETURNS", "ADD");

  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [confirm, setConfirm] = useState({ open: false, id: "" });
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  async function refresh() {
    setBusy(true);
    const r = await listPurchaseReturns({
      search: search || undefined,
      status: statusFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit: 500
    });
    if (r.status >= 200 && r.status < 300 && r.json?.ok) {
      setRows(r.json?.data?.items || []);
    } else if (r.status !== 401) {
      emitToast({ type: "error", message: parseApiError(r) });
    }
    setBusy(false);
  }

  useEffect(() => {
    if (canView) refresh();
  }, [canView, search, statusFilter, dateFrom, dateTo]);

  async function handleConfirm() {
    if (!confirm.id) return;
    setConfirmBusy(true);
    const r = await confirmPurchaseReturn(confirm.id);
    setConfirmBusy(false);
    if (r.status >= 200 && r.status < 300 && r.json?.ok) {
      emitToast({ type: "success", message: "Purchase return confirmed. Stock adjusted." });
      setConfirm({ open: false, id: "" });
      await refresh();
    } else if (r.status !== 401) {
      emitToast({ type: "error", message: parseApiError(r) });
    }
  }

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
            <div className="raTitle">{NAV_LABELS.purchaseReturns}</div>
            <div className="raSub">You do not have permission to view purchase returns.</div>
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
            <div className="raTitle">{NAV_LABELS.purchaseReturns}</div>
            <div className="raSub">Manage returns to vendors with credit note tracking.</div>
          </div>
        </div>
        <div className="pageCard">
          <CommonTable
            title=""
            subtitle=""
            compact
            countText={busy ? "Loading..." : `${rows.length} return${rows.length !== 1 ? "s" : ""}`}
            search={search}
            onSearchChange={setSearch}
            filters={[
              {
                id: "status",
                label: "Status",
                value: statusFilter,
                onChange: setStatusFilter,
                options: [
                  { value: "", label: "All status" },
                  { value: "DRAFT", label: "Draft" },
                  { value: "CONFIRMED", label: "Confirmed" },
                  { value: "CANCELLED", label: "Cancelled" }
                ]
              },
              { id: "from", type: "date", label: "From", value: dateFrom, onChange: setDateFrom },
              { id: "to", type: "date", label: "To", value: dateTo, onChange: setDateTo }
            ]}
            extraHeaderActions={
              canAdd ? (
                <TableCsvActions
                  disabled={busy}
                  onImport={() => setImportOpen(true)}
                  onExport={() => {
                    const cols = [
                      { key: "return_number", label: "return_number" },
                      { key: "return_date", label: "return_date" },
                      { key: "status", label: "status" },
                      { key: "vendor_name", label: "vendor_name" },
                      { key: "original_invoice_number", label: "original_invoice_number" },
                      { key: "return_reason", label: "return_reason" },
                      { key: "total_amount", label: "total_amount" }
                    ];
                    downloadCsvFile(
                      "purchase_returns_export.csv",
                      cols,
                      rows.map((r) => ({
                        return_number: r.return_number || "",
                        return_date: String(r.return_date || "").slice(0, 10),
                        status: r.status || "",
                        vendor_name: r.vendor_name || r.division_name || "",
                        original_invoice_number: r.original_invoice_number || "",
                        return_reason: String(r.return_reason || "").replace(/_/g, " "),
                        total_amount: r.total_amount || 0
                      }))
                    );
                  }}
                />
              ) : null
            }
            primaryAction={null}
            rows={rows}
            getRowId={(r) => r.id}
            columns={[
              {
                id: "return_number",
                header: "Return #",
                render: (r) => <span style={{ fontWeight: 700 }}>{r.return_number || "—"}</span>
              },
              {
                id: "return_date",
                header: "Date",
                render: (r) => String(r.return_date || "").slice(0, 10) || "—"
              },
              {
                id: "vendor_name",
                header: "Supplier / Division",
                render: (r) => r.vendor_name || r.division_name || "—"
              },
              {
                id: "original_invoice_number",
                header: "Original Invoice",
                sortable: false,
                render: (r) => r.original_invoice_number || "—"
              },
              {
                id: "return_reason",
                header: "Reason",
                sortable: false,
                render: (r) => (
                  <span style={{ color: "var(--color-text-3)" }}>
                    {String(r.return_reason || "").replace(/_/g, " ") || "—"}
                  </span>
                )
              },
              {
                id: "total_amount",
                header: "Amount",
                align: "right",
                render: (r) => fmtMoney(r.total_amount || 0)
              },
              {
                id: "status",
                header: "Status",
                render: (r) => <span style={{ fontWeight: 700 }}>{r.status || "—"}</span>
              },
              {
                id: "actions",
                header: "Actions",
                align: "right",
                sortable: false,
                render: (r) => (
                  <div className="ibGroup" onClick={(e) => e.stopPropagation()}>
                    {r.status === "DRAFT" && canUpdate ? (
                      <IconBtn
                        tooltip="Confirm return and adjust stock"
                        variant="success"
                        onClick={() => setConfirm({ open: true, id: r.id })}
                      >
                        <IconConfirm />
                      </IconBtn>
                    ) : null}
                  </div>
                )
              }
            ]}
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirm.open}
        title="Confirm Purchase Return"
        message="Confirm this purchase return? Stock will be adjusted and this action cannot be undone."
        confirmLabel="Confirm Return"
        busy={confirmBusy}
        onConfirm={handleConfirm}
        onCancel={() => setConfirm({ open: false, id: "" })}
      />

      <CsvImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityType="PURCHASE_RETURNS"
        title="Import Purchase Returns"
        onCompleted={() => { setImportOpen(false); refresh(); }}
      />
    </AppShell>
  );
}