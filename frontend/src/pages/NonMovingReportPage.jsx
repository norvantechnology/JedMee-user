import { useEffect, useMemo, useState } from "react";
import { useSeoMeta } from "../utils/seo.js";
import { emitToast } from "../services/toastBus.js";
import { parseApiError } from "../utils/api.js";
import { can } from "../utils/access.js";
import { getNonMovingReport } from "../services/reportService.js";
import {
  ReportShell,
  ReportDenied,
  ReportPageIntro,
  ReportCard,
  ReportToolbar,
  ReportToolbarPrim,
  ReportToolbarFilters,
  ReportSearchInput,
  ReportCountChip,
  ReportListEmpty,
  ReportTableScroll,
  ReportPaneBody,
  filterReportItemsBySearch
} from "../components/reports/index.js";
import { fmtDateIndian } from "../utils/format.js";

export function NonMovingReportContent({ embedded = false } = {}) {
  const canView = can("PRODUCT_BATCHES", "VIEW");

  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(90);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [thresholdDays, setThresholdDays] = useState(90);

  async function refresh(daysParam) {
    setBusy(true);
    const params = {};
    if (Number(daysParam) > 0) params.days = Number(daysParam);
    const resp = await getNonMovingReport(params);
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      const data = resp.json?.data || {};
      setItems(Array.isArray(data.items) ? data.items : []);
      setThresholdDays(Number(data.thresholdDays || 90));
    } else if (resp.status !== 401) {
      emitToast({ type: "error", message: parseApiError(resp) });
    }
    setBusy(false);
  }

  useEffect(() => {
    if (!canView) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  const filtered = useMemo(() => filterReportItemsBySearch(items, search), [items, search]);

  if (!canView) {
    return (
      <ReportDenied title="Non-Moving Report" message="You don’t have permission to view this report." />
    );
  }

  const body = (
    <div className={embedded ? "" : "pageWrap"}>
      {embedded ? null : (
        <ReportPageIntro
          title="Non Moving Report"
          subtitle={
            <>
              Batches with stock but no sale <em>or</em> purchase activity in the last{" "}
              <strong>{thresholdDays}</strong> days. Newly purchased items appear only after the threshold passes.
              Use this to plan returns, schemes or push these items at the counter.
            </>
          }
        />
      )}

      <ReportCard busy={busy}>
          <ReportToolbar>
            <ReportToolbarPrim>
              <ReportSearchInput
                placeholder="Search product / batch / supplier…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              <ReportCountChip busy={busy}>{`${filtered.length} item(s)`}</ReportCountChip>
            </ReportToolbarPrim>
            <ReportToolbarFilters>
              <label className="rptToolbarHint" htmlFor="nonmoving-days">
                Threshold (days)
              </label>
              <input
                id="nonmoving-days"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className="rptSearchInput rptSearchInput_narrow"
                value={days}
                onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, "") || "1")}
              />
              <button className="sfmBtnGhost" type="button" onClick={() => refresh(days)} disabled={busy}>
                Apply
              </button>
            </ReportToolbarFilters>
          </ReportToolbar>

          <ReportPaneBody>
            {filtered.length === 0 ? (
              <ReportListEmpty busy={busy}>
                {busy ? null : "No non-moving stock for the selected window."}
              </ReportListEmpty>
            ) : (
              <ReportTableScroll>
                <table className="rptBatchTable">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Batch</th>
                      <th>Mfg</th>
                      <th>Supplier</th>
                      <th>Stock</th>
                      <th>Last sold</th>
                      <th>Days idle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const stock = Number(r.current_stock || 0) + Number(r.loose_stock || 0);
                      return (
                        <tr key={r.batch_id}>
                          <td>
                            <div className="rptVendorContact">
                              <span className="rptVendorName">{r.product_name || r.product_code || ""}</span>
                              {r.drug_name ? <span className="rptVendorAddress">{r.drug_name}</span> : null}
                            </div>
                          </td>
                          <td>{r.batch_no || ""}</td>
                          <td>{r.mfg_name || ""}</td>
                          <td>{r.supplier_name || ""}</td>
                          <td>{stock}</td>
                          <td>{r.last_sale_date ? fmtDateIndian(r.last_sale_date) : "Never"}</td>
                          <td>{r.days_idle != null ? `${r.days_idle}d` : (r.days_since_last_sale != null ? `${r.days_since_last_sale}d` : "")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ReportTableScroll>
            )}
          </ReportPaneBody>
      </ReportCard>
    </div>
  );

  return embedded ? body : <ReportShell>{body}</ReportShell>;
}

export default function NonMovingReportPage() {
  useSeoMeta({ title: "Non-Moving Products Report" });
  return <NonMovingReportContent embedded={false} />;
}
