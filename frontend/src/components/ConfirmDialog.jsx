import { InlineButtonProgress } from "./ui/buttons.jsx";
import CommonModal from "./CommonModal.jsx";
import "./ConfirmDialog.css";
import { IconConfirmMarkDanger, IconConfirmMarkOk } from "./ui/AppIcons.jsx";

export default function ConfirmDialog({
  open,
  title = "Confirm action",
  message = "Are you sure?",
  hint = "",
  metaItems = [],
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = true,
  busy = false,
  onConfirm,
  onClose
}) {
  return (
    <CommonModal
      open={open}
      title={title}
      subtitle=""
      ariaLabel={title}
      size="sm"
      danger={danger}
      icon={danger ? <IconConfirmMarkDanger /> : <IconConfirmMarkOk />}
      onClose={() => (busy ? null : onClose?.())}
      closeOnOverlay={!busy}
      drawer={false}
      footer={
        <div className="cdlgActions">
          <button className="cdlgBtn appBtn appBtn_secondary appBtn_md" type="button" data-cm-cancel="true" onClick={onClose} disabled={busy}>
            {cancelLabel || "Cancel"}
          </button>
          <button
            className={`cdlgBtn appBtn_md ${danger ? "cdlgBtn_danger appBtn appBtn_danger" : "cdlgBtn_primary appBtn appBtn_primary"}`.trim()}
            type="button"
            data-cm-primary="true"
            disabled={busy}
            onClick={async () => {
              await onConfirm?.();
            }}
          >
            {busy ? (
              <InlineButtonProgress label={danger ? "Deleting…" : "Processing…"} />
            ) : (
              confirmLabel || (danger ? "Delete" : "Confirm")
            )}
          </button>
        </div>
      }
    >
      <div className="cdlg">
        <div className="cdlgBody">
          <div className="cdlgMessage">{message}</div>

          {(metaItems || []).length ? (
            <div className="cdlgMeta">
              {(metaItems || []).map((item, idx) => (
                <div className="cdlgMetaTile" key={String(item?.label || item?.value || idx)}>
                  <div className="cdlgMetaLabel">{item?.label || ""}</div>
                  <div className="cdlgMetaValue">{item?.value || ""}</div>
                </div>
              ))}
            </div>
          ) : null}

          {hint ? <div className="cdlgHint">{hint}</div> : null}
        </div>
      </div>
    </CommonModal>
  );
}

