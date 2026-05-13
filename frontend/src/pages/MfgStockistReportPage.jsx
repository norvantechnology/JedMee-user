import { useEffect, useMemo, useRef, useState } from "react";
import { useSeoMeta } from "../utils/seo.js";
import { emitToast } from "../services/toastBus.js";
import { parseApiError } from "../utils/api.js";
import { can } from "../utils/access.js";
import { getMfgStockistReport } from "../services/reportService.js";
import { NAV_LABELS } from "../constants/navLabels.js";
import {
  ReportShell,
  ReportDenied,
  ReportPageIntro,
  ReportCard,
  ReportToolbar,
  ReportToolbarPrim,
  ReportToolbarFilters,
  ReportToolbarHint,
  ReportSearchInput,
  ReportCountChip,
  ReportListEmpty,
  ReportTableScroll,
  ReportPane,
  ReportPaneHead,
  ReportPaneTitle,
  ReportPaneSub,
  ReportPaneBody,
  downloadCsvFile
} from "../components/reports/index.js";
import { fmtDateIndian } from "../utils/format.js";

export function MfgStockistReportContent({ embedded = false } = {}) {
  const canView = can("MFG_COMPANIES", "VIEW") || can("PRODUCT_BATCHES", "VIEW");

  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [data, setData] = useState({ manufacturers: [], stockists: [] });
  const [selectedMfgId, setSelectedMfgId] = useState("");
  const debounceRef = useRef(null);

  async function refresh(query) {
    setBusy(true);
    const resp = await getMfgStockistReport({ q: String(query || "").trim() });
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      const next = resp.json?.data || { manufacturers: [], stockists: [] };
      setData(next);
      const ids = (next.manufacturers || []).map((m) => m.id);
      setSelectedMfgId((prev) => (ids.includes(prev) ? prev : ids[0] || ""));
    } else if (resp.status !== 401) {
      emitToast({ type: "error", message: parseApiError(resp) });
    }
    setBusy(false);
  }

  useEffect(() => {
    if (!canView) return;
    refresh("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  useEffect(() => {
    if (!canView) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      refresh(search);
    }, 300);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const manufacturers = data.manufacturers || [];
  const selectedMfg = useMemo(
    () => manufacturers.find((m) => m.id === selectedMfgId) || manufacturers[0] || null,
    [manufacturers, selectedMfgId]
  );

  const stockistsForSelected = useMemo(() => {
    if (!selectedMfg) return [];
    const mid = String(selectedMfg.id || "");
    return (data.stockists || []).filter((s) => String(s.mfg_company_id || "") === mid);
  }, [data.stockists, selectedMfg]);

  function exportStockistsCsv() {
    if (!selectedMfg || stockistsForSelected.length === 0) return;
    const slug = String(selectedMfg.code || selectedMfg.name || "manufacturer")
      .replace(/[^\w\-]+/g, "-")
      .slice(0, 48);
    downloadCsvFile(
      `mfg-stockists-${slug}.csv`,
      [
        { key: "vendor_name", label: "Stockist" },
        { key: "vendor_phone", label: "Phone" },
        {
          key: "last_supplied_on",
          label: "Last supplied",
          value: (r) => (r.last_supplied_on ? fmtDateIndian(r.last_supplied_on) : "")
        },
        { key: "vendor_address", label: "Address" }
      ],
      stockistsForSelected.map((r) => ({
        vendor_name: r.vendor_name || r.vendor_short || "",
        vendor_phone: r.vendor_phone || "",
        last_supplied_on: r.last_supplied_on,
        vendor_address: r.vendor_address || ""
      }))
    );
  }

  if (!canView) {
    return (
      <ReportDenied title={NAV_LABELS.reportMfgStockist} message="You don’t have permission to view this report." />
    );
  }

  const body = (
    <div className={embedded ? "" : "pageWrap"}>
      {embedded ? null : (
        <ReportPageIntro
          title={NAV_LABELS.reportMfgStockist}
          subtitle={
            <>
              Pick a manufacturer to see which suppliers (stockists) provide its products to you. Data comes from
              purchase history, product–supplier links, and any explicit manufacturer–vendor mappings.
            </>
          }
        />
      )}

      <ReportCard busy={busy}>
          <ReportToolbar>
            <ReportToolbarPrim>
              <ReportSearchInput
                placeholder="Search by manufacturer name or code…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              {!busy && <ReportCountChip>{`${manufacturers.length} mfg(s)`}</ReportCountChip>}
            </ReportToolbarPrim>
            <ReportToolbarFilters className="rptToolbarFilters--tight">
              <ReportToolbarHint className="rptToolbarHint--end">
                Click a manufacturer on the left to view its stockists.
              </ReportToolbarHint>
              <button
                type="button"
                className="sfmBtnGhost"
                disabled={busy || !selectedMfg || stockistsForSelected.length === 0}
                onClick={exportStockistsCsv}
              >
                Export CSV
              </button>
            </ReportToolbarFilters>
          </ReportToolbar>

          <div className="rptThreePane rptThreePane--balanced">
            {/* ── Left pane: Manufacturer list ── */}
            <ReportPane aria-label="Manufacturers">
              <ReportPaneHead className="rptPaneHead--aligned">
                <ReportPaneTitle>Manufacturers</ReportPaneTitle>
                <ReportPaneSub className="rptPaneSub--muted">Sorted A → Z</ReportPaneSub>
              </ReportPaneHead>
              <ReportPaneBody>
                {!busy && manufacturers.length === 0 ? (
                  <ReportListEmpty>
                    {"No manufacturers match your search."}
                  </ReportListEmpty>
                ) : (
                  <div className="rptList" role="listbox" aria-label="Manufacturer list">
                    {manufacturers.map((m) => {
                      const isSelected = m.id === selectedMfg?.id;
                      const initial = (m.name || m.code || "?")[0].toUpperCase();
                      return (
                        <button
                          key={m.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={`rptListItem rptMfgItem${isSelected ? " is-selected" : ""}`}
                          onClick={() => setSelectedMfgId(m.id)}
                        >
                          <div className={`rptMfgAvatar${isSelected ? " rptMfgAvatar--active" : ""}`}>
                            {initial}
                          </div>
                          <div className="rptListItemText">
                            <span className="rptListItemPrimary">{m.name || m.code || ""}</span>
                            {m.code ? (
                              <span className="rptMfgCodeBadge">#{m.code}</span>
                            ) : null}
                          </div>
                          {isSelected && (
                            <span className="rptMfgChevron" aria-hidden="true">›</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </ReportPaneBody>
            </ReportPane>

            {/* ── Right pane: Stockists ── */}
            <ReportPane aria-label="Stockists">
              <ReportPaneHead className="rptPaneHead--aligned">
                <ReportPaneTitle>Stockists</ReportPaneTitle>
                <ReportPaneSub className="rptPaneSub--muted">
                  {stockistsForSelected.length > 0
                    ? `${stockistsForSelected.length} supplier${stockistsForSelected.length !== 1 ? "s" : ""} · latest first`
                    : "Latest supply first"}
                </ReportPaneSub>
              </ReportPaneHead>

              {/* Selected manufacturer card */}
              {selectedMfg ? (
                <div className="rptMfgSelectedCard">
                  <div className="rptMfgSelectedAvatar">
                    {(selectedMfg.name || selectedMfg.code || "?")[0].toUpperCase()}
                  </div>
                  <div className="rptMfgSelectedInfo">
                    <div className="rptMfgSelectedName">{selectedMfg.name || ""}</div>
                    {selectedMfg.code ? (
                      <span className="rptMfgSelectedCode">#{selectedMfg.code}</span>
                    ) : null}
                  </div>
                  <div className="rptMfgSelectedHint">
                    Suppliers who stock products from this manufacturer
                  </div>
                </div>
              ) : null}

              <ReportPaneBody>
                {stockistsForSelected.length === 0 ? (
                  <ReportListEmpty busy={busy && Boolean(selectedMfg)}>
                    {!selectedMfg ? (
                      <span className="rptEmptyHint">
                        ← Select a manufacturer to view its stockists
                      </span>
                    ) : busy ? null : (
                      <span className="rptEmptyHint">
                        No stockists found for this manufacturer yet.<br />
                        <span className="rptEmptyHintSub">
                          Confirm a purchase invoice for its products, or add a supplier–manufacturer link.
                        </span>
                      </span>
                    )}
                  </ReportListEmpty>
                ) : (
                  <ReportTableScroll>
                    <table className="rptBatchTable rptBatchTable--mfgStockist">
                      <colgroup>
                        <col className="rptColMfgStockistName" />
                        <col className="rptColMfgStockistPhone" />
                        <col className="rptColMfgStockistDate" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th scope="col">Stockist / Supplier</th>
                          <th scope="col">Phone</th>
                          <th scope="col">Last Supplied</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stockistsForSelected.map((s, idx) => (
                          <tr key={`${s.mfg_company_id}-${s.vendor_id}`}>
                            <td>
                              <div className="rptVendorContact">
                                <div className="rptVendorRow">
                                  <span className="rptVendorRank">#{idx + 1}</span>
                                  <span className="rptVendorName">{s.vendor_name || s.vendor_short || "Stockist"}</span>
                                </div>
                                {s.vendor_address ? (
                                  <span className="rptVendorAddress">{s.vendor_address}</span>
                                ) : null}
                              </div>
                            </td>
                            <td>
                              {s.vendor_phone ? (
                                <a className="rptVendorPhone rptVendorPhoneLink" href={`tel:${s.vendor_phone}`}>
                                  {s.vendor_phone}
                                </a>
                              ) : (
                                <span className="rptVendorPhoneEmpty">—</span>
                              )}
                            </td>
                            <td>
                              <span className={`rptSupplyDate${s.last_supplied_on ? "" : " rptSupplyDate--none"}`}>
                                {s.last_supplied_on ? fmtDateIndian(s.last_supplied_on) : "Not recorded"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ReportTableScroll>
                )}
              </ReportPaneBody>
            </ReportPane>
          </div>
      </ReportCard>
    </div>
  );

  return embedded ? body : <ReportShell>{body}</ReportShell>;
}

export default function MfgStockistReportPage() {
  useSeoMeta({ title: "Manufacturer Stockist Report" });
  return <MfgStockistReportContent embedded={false} />;
}
