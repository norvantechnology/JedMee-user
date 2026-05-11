import { InlineButtonProgress } from "./ui/buttons.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { emitToast } from "../services/toastBus.js";
import {
  resolveStoredDocumentUrl,
  uploadRegistrationDocViaPresign
} from "../services/registrationService.js";
import "./DocumentUploadField.css";
import CommonModal from "./CommonModal.jsx";
import { IconDocMark, IconDownloadMark, IconEyeMark, IconUploadMark } from "./ui/AppIcons.jsx";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "application/msword",                                                    // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document" // .docx
]);

function pickFileError(file) {
  if (!file) return "File is required.";
  if (!ALLOWED_TYPES.has(String(file.type || "").toLowerCase())) return "Invalid file type. Use jpg, png, webp, gif, pdf, doc, or docx.";
  if (file.size > MAX_FILE_BYTES) return "Max file size is 5MB.";
  return "";
}

function niceNameFromUrl(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(last).slice(0, 120) || "document";
  } catch {
    return String(url || "").slice(0, 120) || "document";
  }
}

export default function DocumentUploadField({ label, docType, url, onUrlChange, disabled, variant = "card" }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  /** Same-session image preview (works when bucket objects are private). */
  const [inlinePreview, setInlinePreview] = useState(null);
  const [remotePreviewSrc, setRemotePreviewSrc] = useState(null);

  const fileName = useMemo(() => (url ? niceNameFromUrl(url) : ""), [url]);
  const canAct = Boolean(url) && !busy;
  const allowRealUpload = import.meta.env.VITE_SKIP_S3_UPLOAD !== "true";

  useEffect(() => {
    if (!url) setInlinePreview(null);
  }, [url]);

  useEffect(() => {
    if (!previewOpen) {
      setRemotePreviewSrc(null);
      return;
    }
    if (inlinePreview) {
      setRemotePreviewSrc(null);
      return;
    }
    const href = String(url || "").trim();
    if (!href) {
      setRemotePreviewSrc(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const resolved = await resolveStoredDocumentUrl(href, { toast: "none" });
      if (!cancelled) setRemotePreviewSrc(resolved || href);
    })();
    return () => {
      cancelled = true;
    };
  }, [previewOpen, url, inlinePreview]);

  async function openStoredHref(href) {
    const h = String(href || "").trim();
    if (!h) return;
    if (h.includes(".local/mock")) {
      window.open(h, "_blank", "noopener,noreferrer");
      return;
    }
    const resolved = await resolveStoredDocumentUrl(h, { toast: "none" });
    window.open(resolved || h, "_blank", "noopener,noreferrer");
  }

  async function uploadDoc(file) {
    const err = pickFileError(file);
    if (err) {
      emitToast({ type: "error", message: err });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setInlinePreview(String(reader.result || ""));
    reader.readAsDataURL(file);

    setBusy(true);
    try {
      if (!allowRealUpload) {
        const safeName = encodeURIComponent(String(file?.name || docType).slice(0, 120));
        const fileUrl = `https://uploads.jedmee.local/mock/${docType}/${Date.now()}-${safeName}`;
        onUrlChange?.(fileUrl);
        emitToast({ type: "success", message: `${label} uploaded.` });
        return;
      }

      const result = await uploadRegistrationDocViaPresign({ docType, file }, { toast: "none" });
      if (!result.ok) {
        emitToast({ type: "error", message: result.error || "Upload failed." });
        return;
      }

      onUrlChange?.(result.fileUrl);
      emitToast({ type: "success", message: `${label} uploaded.` });
    } finally {
      setBusy(false);
    }
  }

  const previewImgSrc = inlinePreview || remotePreviewSrc || url || "";

  const statusNode = busy ? (
    <span className="dufPill dufPill_busy">Uploading</span>
  ) : url ? (
    <span className="dufPill dufPill_ok">Uploaded</span>
  ) : (
    <span className="dufPill">Pending</span>
  );

  if (variant === "row") {
    return (
      <div className="duf duf_row">
        <div className="dufRowMain">
          <div className="dufId">
            <div className="dufGlyph" aria-hidden="true">
              <IconDocMark />
            </div>
            <div className="dufTitle">
              <div className="dufLabel">{label}</div>
              <div className="dufFileName" title={url ? fileName : ""}>
                {url ? fileName : "No file uploaded"}
              </div>
            </div>
          </div>

          <div className="dufRowRight">
            <div className="dufState">{statusNode}</div>
            <button className="dufBtn dufBtn_primary" type="button" disabled={Boolean(disabled) || busy} onClick={() => inputRef.current?.click()}>
              <span className="dufBtnIcon" aria-hidden="true">
                <IconUploadMark />
              </span>
              {busy ? <InlineButtonProgress label="Uploading…" /> : url ? "Replace" : "Upload"}
            </button>
          </div>
        </div>

        <input
          ref={inputRef}
          className="dufFileInput"
          type="file"
          accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={Boolean(disabled) || busy}
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            e.target.value = "";
            if (f) uploadDoc(f);
          }}
        />
      </div>
    );
  }

  if (variant === "box") {
    const isDisabled = Boolean(disabled) || busy;

    function handleBoxDragOver(e) {
      e.preventDefault();
      e.stopPropagation();
      if (!isDisabled) setIsDragOver(true);
    }
    function handleBoxDragLeave(e) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    }
    function handleBoxDrop(e) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (isDisabled) return;
      const f = e.dataTransfer.files?.[0] || null;
      if (f) uploadDoc(f);
    }
    function handleBoxClick(e) {
      // Don't trigger if clicking the button itself (it handles its own click)
      if (isDisabled) return;
      inputRef.current?.click();
    }

    return (
      <div
        className={[
          "duf duf_box",
          url ? "duf_box_has" : "",
          isDragOver ? "duf_box_drag" : "",
          isDisabled ? "" : "duf_box_clickable"
        ].filter(Boolean).join(" ")}
        onClick={handleBoxClick}
        onDragOver={handleBoxDragOver}
        onDragLeave={handleBoxDragLeave}
        onDrop={handleBoxDrop}
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        aria-label={`${label} — click or drag a file here`}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleBoxClick(e); } }}
      >
        <div className="dufBoxTop">
          <div className="dufId">
            <div className="dufGlyph" aria-hidden="true">
              <IconDocMark />
            </div>
            <div className="dufTitle">
              <div className="dufLabel">{label}</div>
              <div className="dufSub">
                    {isDragOver ? "Drop to upload" : "Click or drag & drop · jpg/png/pdf/doc · max 5MB"}
                  </div>
            </div>
          </div>
          <div className="dufState">{statusNode}</div>
        </div>

        <div className="dufBoxDropZone" aria-hidden="true">
          <span className="dufBoxDropIcon">
            <IconUploadMark />
          </span>
          <span className="dufBoxDropText">
            {isDragOver ? "Release to upload" : url ? "Click to replace" : "Click or drag file here"}
          </span>
        </div>

        <input
          ref={inputRef}
          className="dufFileInput"
          type="file"
          accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={isDisabled}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            e.target.value = "";
            if (f) uploadDoc(f);
          }}
        />
      </div>
    );
  }

  return (
    <div className="duf">
      <CommonModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={label}
        subtitle={url ? fileName : ""}
        ariaLabel={`${label} preview`}
        size="lg"
        drawer={false}
      >
        <div className="dufPreviewWrap">
          {previewImgSrc ? (
            <img className="dufPreviewImg" src={previewImgSrc} alt={`${label} preview`} loading="lazy" />
          ) : (
            <div className="dufPreviewEmpty">No file uploaded.</div>
          )}
        </div>
        <div className="dufPreviewActions">
          <button
            type="button"
            className={`dufBtn dufBtn_ghost ${url ? "" : "dufBtn_dis"}`.trim()}
            disabled={!url}
            onClick={() => openStoredHref(url)}
          >
            <span className="dufBtnIcon" aria-hidden="true">
              <IconEyeMark />
            </span>
            Open in new tab
          </button>
          <button
            type="button"
            className={`dufBtn dufBtn_primary ${url ? "" : "dufBtn_dis"}`.trim()}
            disabled={!url}
            onClick={() => openStoredHref(url)}
          >
            <span className="dufBtnIcon" aria-hidden="true">
              <IconDownloadMark />
            </span>
            Download
          </button>
        </div>
      </CommonModal>

      <div className="dufTop">
        <div className="dufId">
          <div className="dufGlyph" aria-hidden="true">
            <IconDocMark />
          </div>
          <div className="dufTitle">
            <div className="dufLabel">{label}</div>
            <div className="dufSub">jpg/png/webp/gif · pdf · doc/docx · max 5MB</div>
          </div>
        </div>
      </div>

      <div className="dufFileRow" aria-label="File status">
        <div className="dufFileName" title={url ? fileName : ""}>
          {url ? fileName : "No file uploaded"}
        </div>
        <div className="dufState">{statusNode}</div>
      </div>

      <div className="dufActions" aria-label="Document actions">
        <button
          className="dufBtn dufBtn_ghost"
          type="button"
          disabled={!canAct}
          onClick={() => {
            if (!url) return;
            setPreviewOpen(true);
          }}
        >
          <span className="dufBtnIcon" aria-hidden="true">
            <IconEyeMark />
          </span>
          Preview
        </button>

        <button
          type="button"
          className={`dufBtn dufBtn_ghost ${canAct ? "" : "dufBtn_dis"}`.trim()}
          disabled={!canAct}
          onClick={() => openStoredHref(url)}
        >
          <span className="dufBtnIcon" aria-hidden="true">
            <IconDownloadMark />
          </span>
          Download
        </button>

        <button
          className="dufBtn dufBtn_primary"
          type="button"
          disabled={Boolean(disabled) || busy}
          onClick={() => inputRef.current?.click()}
        >
          <span className="dufBtnIcon" aria-hidden="true">
            <IconUploadMark />
          </span>
          {busy ? <InlineButtonProgress label="Uploading…" /> : url ? "Replace file" : "Upload file"}
        </button>
      </div>

      <input
        ref={inputRef}
        className="dufFileInput"
        type="file"
        accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        disabled={Boolean(disabled) || busy}
        onChange={(e) => {
          const f = e.target.files?.[0] || null;
          e.target.value = "";
          if (f) uploadDoc(f);
        }}
      />
    </div>
  );
}

