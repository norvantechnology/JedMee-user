import { AppButton } from "../ui/buttons.jsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, FileSpreadsheet, Loader2, Upload } from "../ui/AppIcons.jsx";
import CommonModal from "../CommonModal.jsx";
import { downloadCsvFile } from "../reports/reportExport.js";
import { emitToast } from "../../services/toastBus.js";
import { parseApiError } from "../../utils/api.js";
import { importParse, importValidate, importExecute, importTemplateMeta, importJobsList } from "../../services/importService.js";
import {
  csvFieldColumnHeader,
  csvImportMatchColumnsHint,
  csvImportTemplatesHint
} from "../../constants/brand.js";
import "./CsvImportWizard.css";

const ICON = 18;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

const STEP_META = [
  { n: 1, label: "Template" },
  { n: 2, label: "File" },
  { n: 3, label: "Map" },
  { n: 4, label: "Review" },
  { n: 5, label: "Import" },
  { n: 6, label: "Done" }
];

function ImportStepper({ step }) {
  return (
    <div className="ciwStepper" aria-label="Import steps">
      {STEP_META.map((it, idx) => (
        <span key={it.n}>
          <span
            className={`ciwStepPill ${step === it.n ? "ciwStepPill_active" : ""} ${step > it.n ? "ciwStepPill_done" : ""}`.trim()}
            title={`Step ${it.n}: ${it.label}`}
          >
            <span aria-hidden="true">{step > it.n ? "✓ " : ""}</span>
            {it.label}
          </span>
          {idx < STEP_META.length - 1 ? <span className="ciwStepChev" aria-hidden="true">›</span> : null}
        </span>
      ))}
    </div>
  );
}

export default function CsvImportWizard({ open, onClose, entityType, title, onCompleted }) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState("");
  const [headers, setHeaders] = useState([]);
  const [sampleRows, setSampleRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [fields, setFields] = useState([]);
  const [mappings, setMappings] = useState({});
  const [summary, setSummary] = useState(null);
  const [previewErrors, setPreviewErrors] = useState([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState("UPDATE");
  const [executeResult, setExecuteResult] = useState(null);
  const [fileLabel, setFileLabel] = useState("");
  const [importHistory, setImportHistory] = useState([]);
  const [dragOver, setDragOver] = useState(false);

  const reset = useCallback(() => {
    setStep(1);
    setJobId("");
    setHeaders([]);
    setSampleRows([]);
    setTotalRows(0);
    setFields([]);
    setMappings({});
    setSummary(null);
    setPreviewErrors([]);
    setDuplicateStrategy("UPDATE");
    setExecuteResult(null);
    setFileLabel("");
    setImportHistory([]);
    setBusy(false);
    setDragOver(false);
  }, []);

  useEffect(() => {
    if (!open || step !== 1) return;
    (async () => {
      const r = await importJobsList({ entityType, limit: 20 });
      if (r.status >= 200 && r.status < 300 && r.json?.ok) setImportHistory(r.json?.data?.items || []);
    })();
  }, [open, step, entityType]);

  const modalSubtitle = useMemo(() => {
    const entity = String(entityType || "").replace(/_/g, " ");
    switch (step) {
      case 1:
        return `Get the column layout for ${entity}, then upload your export from Marg, KMS, Busy, or Excel.`;
      case 2:
        return "Choose a .csv, .xlsx, or .xls file. We keep your data in your account only.";
      case 3:
        return csvImportMatchColumnsHint();
      case 4:
        return "Check counts, duplicate rules, and errors before running the import.";
      case 5:
        return "Writing rows  keep this window open.";
      case 6:
        return "You can close this dialog or import another file.";
      default:
        return "";
    }
  }, [step, entityType]);

  const finishClose = useCallback(() => {
    reset();
    onClose?.();
  }, [onClose, reset]);

  const requestClose = useCallback(() => {
    if (busy) {
      emitToast({ type: "warning", message: "Please wait until the current operation finishes." });
      return;
    }
    finishClose();
  }, [busy, finishClose]);

  const downloadTemplate = async () => {
    setBusy(true);
    const resp = await importTemplateMeta(entityType);
    setBusy(false);
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      const cols = (resp.json?.data?.fields || []).map((f) => ({ key: f.key, label: f.key }));
      downloadCsvFile(`${entityType.toLowerCase()}_template.csv`, cols, [{}]);
    } else {
      emitToast({ type: "error", message: parseApiError(resp) });
    }
  };

  const downloadSampleWithData = async () => {
    setBusy(true);
    const resp = await importTemplateMeta(entityType);
    setBusy(false);
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      const raw = String(resp.json?.data?.sampleCsv || "").trim();
      if (!raw) {
        emitToast({ type: "warning", message: "No sample data is available for this import type." });
        return;
      }
      const blob = new Blob([raw], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${entityType.toLowerCase()}_sample.csv`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } else {
      emitToast({ type: "error", message: parseApiError(resp) });
    }
  };

  const processFile = async (file) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
      emitToast({ type: "warning", message: "Please choose a .csv, .xlsx, or .xls file." });
      return;
    }
    setBusy(true);
    setFileLabel(file.name);
    try {
      const contentBase64 = await fileToBase64(file);
      const resp = await importParse({ entityType, filename: file.name, contentBase64 });
      if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
        const d = resp.json.data || {};
        setJobId(d.jobId || "");
        setHeaders(d.headers || []);
        setSampleRows(d.sampleRows || []);
        setTotalRows(d.totalRows || 0);
        setFields(d.fields || []);
        const auto = d.autoMappings || {};
        const next = { ...auto };
        for (const h of d.headers || []) {
          if (next[h] === undefined) next[h] = "__skip__";
        }
        setMappings(next);
        setStep(3);
        emitToast({ type: "success", message: `Loaded ${d.totalRows || 0} rows  map columns next.` });
      } else {
        emitToast({ type: "error", message: parseApiError(resp) });
      }
    } catch (e) {
      emitToast({ type: "error", message: String(e.message || e) });
    }
    setBusy(false);
    setDragOver(false);
  };

  const runValidate = async () => {
    if (!jobId) return;
    setBusy(true);
    const resp = await importValidate({ jobId, columnMappings: mappings });
    setBusy(false);
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      const d = resp.json.data || {};
      setSummary(d.summary || null);
      setPreviewErrors(d.previewErrors || []);
      setStep(4);
    } else {
      emitToast({ type: "error", message: parseApiError(resp) });
    }
  };

  const runExecute = async (skipErrors) => {
    if (!jobId) return;
    setBusy(true);
    setStep(5);
    const resp = await importExecute({ jobId, duplicateStrategy, skipErrors });
    setBusy(false);
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      const d = resp.json.data || {};
      setExecuteResult(d);
      setStep(6);
      onCompleted?.();
    } else {
      emitToast({ type: "error", message: parseApiError(resp) });
      setStep(4);
    }
  };

  const fieldOptions = useMemo(() => {
    const opts = (fields || []).map((f) => ({ value: f.key, label: f.label }));
    return [{ value: "__skip__", label: " Skip column " }, ...opts];
  }, [fields]);

  const mappedColumnCount = useMemo(() => {
    let n = 0;
    for (const h of headers) {
      if (mappings[h] && mappings[h] !== "__skip__") n += 1;
    }
    return n;
  }, [headers, mappings]);

  if (!open) return null;

  return (
    <CommonModal
      open={open}
      onClose={requestClose}
      title={title || `Import ${String(entityType || "").replace(/_/g, " ")}`}
      subtitle={modalSubtitle}
      size="lg"
      closeOnOverlay={!busy}
      drawer={true}
    >
      <div className="ciwOverlay">
        <ImportStepper step={step} />

        {step === 1 ? (
          <div className="ciwStage">
            <div className="ciwCard">
              <div className="ciwCardBody">
                <p className="ciwLead">Start from a template or a filled sample, then go to the upload step.</p>
                <p className="ciwHint">{csvImportTemplatesHint()}</p>
              </div>
              <div className="ciwFooter ciwFooter_actions">
              <AppButton type="button" variant="secondary" size="md" disabled={busy} icon={<FileSpreadsheet size={ICON} />} onClick={downloadTemplate}>
                Download template (headers only)
              </AppButton>
              <AppButton type="button" variant="secondary" size="md" disabled={busy} icon={<Download size={ICON} />} onClick={downloadSampleWithData}>
                Download sample with data
              </AppButton>
              <AppButton type="button" variant="primary" size="md" disabled={busy} trailingIcon={<ChevronRight size={ICON} />} onClick={() => setStep(2)}>
                Next: upload file
              </AppButton>
            </div>
            </div>
            {importHistory.length ? (
              <div className="ciwCard">
                <div className="ciwCardHead">
                  <div className="ciwHistoryTitle">Recent imports for this type</div>
                </div>
                <div className="ciwHistoryScroll">
                  <table className="ciwMapTable">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>File</th>
                        <th>Created</th>
                        <th>Updated</th>
                        <th>Errors</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importHistory.map((row) => (
                        <tr key={row.id}>
                          <td>{String(row.created_at || "").slice(0, 10)}</td>
                          <td>{row.original_filename || ""}</td>
                          <td>{row.created_rows ?? 0}</td>
                          <td>{row.updated_rows ?? 0}</td>
                          <td>{row.error_rows ?? 0}</td>
                          <td>{row.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="ciwStage">
            <div className="ciwCard">
              <div className="ciwCardBody">
                <label
                  className={`ciwDrop ${dragOver ? "ciwDrop_drag" : ""} ${busy ? "ciwDrop_busy" : ""}`.trim()}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const f = e.dataTransfer?.files?.[0];
                    if (f) processFile(f);
                  }}
                >
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    disabled={busy}
                    onChange={(e) => processFile(e.target.files?.[0])}
                  />
                  <div className="ciwDropIcon" aria-hidden="true">
                    <Upload size={24} />
                  </div>
                  <div className="ciwDropTitle">{busy ? "Reading file…" : "Drop file here or click to browse"}</div>
                  <p className="ciwDropSub">.csv, .xlsx, .xls · max ~6 MB · up to 8,000 rows per import</p>
                </label>
                {fileLabel && !busy ? <div className="ciwFileBadge">Selected: {fileLabel}</div> : null}
              </div>
              <div className="ciwFooter ciwFooter_start">
              <AppButton type="button" variant="ghost" size="md" disabled={busy} onClick={() => setStep(1)}>
                ← Back
              </AppButton>
              </div>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="ciwStage">
            <div className="ciwCard">
              <div className="ciwCardBody">
                <div className="ciwMetaRow">
                  <p className="ciwLead">
                    {totalRows} data rows · {headers.length} columns in file
                  </p>
                  {headers.length ? (
                    <span className="ciwMapOk">
                      {mappedColumnCount} of {headers.length} columns mapped (unmapped columns are skipped).
                    </span>
                  ) : null}
                </div>
                <p className="ciwHint">Fix any “Skip” that should feed a required field (marked * in the dropdown).</p>
                <div className="ciwMapScroll">
                  <table className="ciwMapTable">
                    <thead>
                      <tr>
                        <th>Your file column</th>
                        <th>{csvFieldColumnHeader()}</th>
                        <th>Sample value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {headers.map((h) => (
                        <tr key={h}>
                          <td className="ciwColName">{h}</td>
                          <td>
                            <select value={mappings[h] || "__skip__"} onChange={(e) => setMappings((m) => ({ ...m, [h]: e.target.value }))}>
                              {fieldOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="ciwSample">{String(sampleRows[0]?.[h] ?? "")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="ciwFooter ciwFooter_start">
              <AppButton type="button" variant="ghost" size="md" disabled={busy} onClick={() => setStep(2)}>
                ← Back
              </AppButton>
              <div className="ciwFooterRight">
                <AppButton type="button" variant="primary" size="md" disabled={busy || !jobId} trailingIcon={<ChevronRight size={ICON} />} onClick={runValidate}>
                  Preview & validate
                </AppButton>
              </div>
              </div>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="ciwStage">
            <div className="ciwCard">
              <div className="ciwCardBody">
                <div className="ciwSummary">
                  <span>
                    <strong>Ready to create:</strong> {summary?.valid ?? 0}
                  </span>
                  <span>
                    <strong>Will update:</strong> {summary?.updates ?? 0}
                  </span>
                  <span className="ciwErr">
                    <strong>Row errors:</strong> {summary?.invalid ?? 0}
                  </span>
                </div>
                <div className="ciwRadioRow">
                  <strong>If a row matches an existing record (code / name / key)</strong>
                  <label>
                    <input type="radio" name="dup" checked={duplicateStrategy === "SKIP"} onChange={() => setDuplicateStrategy("SKIP")} />
                    Skip  keep existing data
                  </label>
                  <label>
                    <input type="radio" name="dup" checked={duplicateStrategy === "UPDATE"} onChange={() => setDuplicateStrategy("UPDATE")} />
                    Update  overwrite with file values (recommended)
                  </label>
                  <label>
                    <input type="radio" name="dup" checked={duplicateStrategy === "CREATE_NEW"} onChange={() => setDuplicateStrategy("CREATE_NEW")} />
                    Create new  may hit unique constraints
                  </label>
                </div>
            {previewErrors.length ? (
              <div className="ciwPreview">
                <strong>First validation issues</strong>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  {previewErrors.map((e, i) => (
                    <li key={i}>
                      Row {e.rowIndex}: {e.error}
                    </li>
                  ))}
                </ul>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  style={{ marginTop: 10 }}
                  icon={<Download size={16} />}
                  onClick={() => {
                    downloadCsvFile(
                      "import_validation_errors.csv",
                      [
                        { key: "rowIndex", label: "row" },
                        { key: "error", label: "error" }
                      ],
                      previewErrors
                    );
                  }}
                >
                  Download errors as CSV
                </AppButton>
              </div>
            ) : null}
              </div>
              <div className="ciwFooter ciwFooter_start">
              <AppButton type="button" variant="ghost" size="md" disabled={busy} onClick={() => setStep(3)}>
                ← Back
              </AppButton>
              <div className="ciwFooterRight">
                <AppButton
                  type="button"
                  variant="secondary"
                  size="md"
                  disabled={busy || !(summary && summary.valid + summary.updates > 0)}
                  onClick={() => runExecute(true)}
                >
                  Import valid rows only (skip errors)
                </AppButton>
                <AppButton type="button" variant="primary" size="md" disabled={busy || !(summary && summary.valid + summary.updates > 0)} onClick={() => runExecute(false)}>
                  Import all valid
                </AppButton>
              </div>
            </div>
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="ciwSpinnerBox">
            <Loader2 className="ciwSpin" size={40} strokeWidth={2.25} color="var(--color-primary)" aria-hidden="true" />
            <p className="ciwSpinnerText">Importing…</p>
            <p className="ciwSpinnerSub">This can take a minute for large files. Do not close this window until it finishes.</p>
          </div>
        ) : null}

        {step === 6 && executeResult ? (
          <div className="ciwStage">
            <div className="ciwCard">
              <div className="ciwCardBody">
                <div className="ciwSummary">
                  <span>
                    <strong>Created:</strong> {executeResult.created ?? 0}
                  </span>
                  <span>
                    <strong>Updated:</strong> {executeResult.updated ?? 0}
                  </span>
                  <span>
                    <strong>Skipped:</strong> {executeResult.skipped ?? 0}
                  </span>
                </div>
                {(executeResult.errors || []).length ? (
                  <div className="ciwPreview">
                    <strong>Server messages</strong>
                    <ul>
                      {(executeResult.errors || []).map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
              <div className="ciwFooter ciwFooter_actions">
                <AppButton type="button" variant="primary" size="md" onClick={finishClose}>
                  Done
                </AppButton>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="md"
                  icon={<Upload size={ICON} />}
                  onClick={() => {
                    reset();
                    setStep(1);
                  }}
                >
                  Import another file
                </AppButton>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </CommonModal>
  );
}
