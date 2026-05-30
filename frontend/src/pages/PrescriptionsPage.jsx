import AppShell from "../layouts/AppShell.jsx";
import { useSeoMeta } from "../utils/seo.js";
import { readAuth } from "../services/authStorage.js";
import { NAV_LABELS } from "../constants/navLabels.js";
import { can } from "../utils/access.js";
import { useCallback, useEffect, useState } from "react";
import CommonTable from "../components/CommonTable.jsx";
import CsvImportWizard from "../components/import/CsvImportWizard.jsx";
import { downloadCsvFile } from "../components/reports/reportExport.js";
import TableCsvActions from "../components/ui/TableCsvActions.jsx";
import { listPrescriptions } from "../services/prescriptionService.js";
import { parseApiError } from "../utils/api.js";
import { emitToast } from "../services/toastBus.js";
import { fmtCreatedAt } from "../utils/format.js";
import { isRetailerAuth } from "../utils/businessRole.js";

export default function PrescriptionsPage() {
  useSeoMeta({ title: "Prescriptions" });
  const auth = readAuth();
  const user = auth?.user || null;
  const isRetailer = isRetailerAuth(auth);
  const canView = can("PRESCRIPTIONS", "VIEW");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    const r = await listPrescriptions({ search, dateFrom, dateTo, limit: 500 });
    if (r.status >= 200 && r.status < 300 && r.json?.ok) setRows(r.json?.data?.items || []);
    else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
    setBusy(false);
  }, [search, dateFrom, dateTo]);

  useEffect(() => {
    if (!canView) return;
    refresh();
  }, [canView, refresh]);

  return (
    <AppShell
     
      userName={user?.full_name || "User"}
      userEmail={user?.email || auth?.email || ""}
      userBusinessName={user?.firm_name || ""}
      userGstNumber={user?.gst_number || ""}
      variant="user"
    >
      {!canView ? (
        <div className="pageWrap"><div className="pageCard"><div className="raTitle">{NAV_LABELS.prescriptions || "Prescriptions"}</div><div className="raSub">You do not have permission to view prescriptions.</div></div></div>
      ) : (
        <div className="pageWrap">
          <div className="raTop">
            <div>
              <div className="raTitle">{NAV_LABELS.prescriptions || "Prescriptions"}</div>
              <div className="raSub">Track patient prescriptions linked to sales invoices. Records doctor-prescribed medicines for audit and compliance.</div>
            </div>
          </div>
          <div className="pageCard">
            <CommonTable
              title=""
              subtitle=""
              compact
              countText={busy ? "Loading..." : `${rows.length} prescriptions`}
              search={search}
              onSearchChange={setSearch}
              filters={[
                { id: "from", type: "date", label: "From", value: dateFrom, onChange: setDateFrom },
                { id: "to", type: "date", label: "To", value: dateTo, onChange: setDateTo }
              ]}
              extraHeaderActions={
                canView && isRetailer ? (
                  <TableCsvActions
                    disabled={busy}
                    onImport={() => setImportOpen(true)}
                    onExport={() => {
                      const cols = [
                        { key: "prescription_no", label: "prescription_no" },
                        { key: "prescription_date", label: "prescription_date" },
                        { key: "patient_name", label: "patient_name" },
                        { key: "doctor_name", label: "doctor_name" },
                        { key: "invoice_number", label: "sales_invoice_number" }
                      ];
                      downloadCsvFile(
                        "prescriptions_export.csv",
                        cols,
                        rows.map((r) => ({
                          prescription_no: r.prescription_no || "",
                          prescription_date: String(r.prescription_date || r.created_at || "").slice(0, 10),
                          patient_name: r.patient_name || "",
                          doctor_name: r.doctor_name || "",
                          invoice_number: r.invoice_number || ""
                        }))
                      );
                    }}
                  />
                ) : null
              }
              rows={rows}
              getRowId={(r) => r.id}
              columns={[
                { id: "prescription_no", header: "Rx No", render: (r) => <span style={{ fontWeight: 700 }}>{r.prescription_no || ""}</span> },
                { id: "patient_name", header: "Patient", render: (r) => r.patient_name || "" },
                { id: "doctor_name", header: "Doctor", render: (r) => r.doctor_name || "" },
                { id: "invoice_number", header: "Invoice", render: (r) => r.invoice_number || "" },
                { id: "notes", header: "Notes", sortable: false, render: (r) => <span style={{ color: "var(--color-text-3)" }}>{r.notes || ""}</span> },
                { id: "created_at", header: "Date & time", sortable: false, render: (r) => <span style={{ color: "var(--color-text-3)", whiteSpace: "nowrap" }}>{fmtCreatedAt(r.created_at)}</span> }
              ]}
            />
            <CsvImportWizard
              open={importOpen}
              onClose={() => setImportOpen(false)}
              entityType="PRESCRIPTIONS"
              title="Import prescriptions"
              onCompleted={() => refresh()}
            />
          </div>
        </div>
      )}
    </AppShell>
  );
}
