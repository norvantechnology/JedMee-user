import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { subscribeToasts } from "../services/toastBus.js";
import { IconBtn } from "./IconBtn.jsx";
import { IconAlert, IconCancel, IconMessageChannelDeco, IconSuccess, IconX } from "./ui/AppIcons.jsx";
import "./ToastProvider.css";

const ToastContext = createContext(null);

function toastTypeFrom(input) {
  const t = String(input || "info").toLowerCase();
  if (t === "success" || t === "error" || t === "info" || t === "warning") return t;
  return "info";
}

/** Maps TTL to a CSS class that sets `--toast-dur` (no inline styles). */
function toastDurClass(ms) {
  const raw = Math.round(Number(ms) / 1000) || 4;
  const sec = Math.max(1, Math.min(60, raw));
  return `toast_dur_${sec}`;
}

function kindLabel(type) {
  if (type === "success") return "Success";
  if (type === "error") return "Error";
  if (type === "warning") return "Attention";
  return "Notice";
}

function IconByType({ type }) {
  if (type === "success") {
    return <IconSuccess />;
  }
  if (type === "error") {
    return <IconCancel />;
  }
  if (type === "warning") {
    return <IconAlert />;
  }
  return <IconMessageChannelDeco />;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map()); // id -> timeout
  const prevIdsRef = useRef(new Set()); // basic dedupe per render tick

  const removeToast = useCallback((id) => {
    const t = timersRef.current.get(id);
    if (t) window.clearTimeout(t);
    timersRef.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t)));
  }, []);

  const showToast = useCallback(
    (type, titleOrMessage, opts) => {
      const t = toastTypeFrom(type);
      const title = String(opts?.title ?? titleOrMessage ?? "").trim();
      const message = String(opts?.message ?? "").trim();

      if (!title && !message) return;

      const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const autoHide = opts?.autoHide === undefined ? true : Boolean(opts.autoHide);
      const ttlMs = Number(opts?.ttlMs ?? 4000);

      const toast = {
        id,
        type: t,
        title: title || message,
        message: title ? message : "",
        autoHide,
        ttlMs,
        dismissing: false
      };

      setToasts((prev) => [toast, ...prev].slice(0, 4));

      if (autoHide) {
        const timer = window.setTimeout(() => dismissToast(id), ttlMs);
        timersRef.current.set(id, timer);
      }
    },
    [dismissToast]
  );

  useEffect(() => {
    return subscribeToasts((t) => {
      const type = t?.type || "info";
      const title = t?.title;
      const message = t?.message;
      const ttlMs = t?.ttlMs;
      const autoHide = t?.autoHide;

      const sig = `${type}::${String(title ?? "")}::${String(message ?? "")}`;
      if (prevIdsRef.current.has(sig)) return;
      prevIdsRef.current.add(sig);
      queueMicrotask(() => prevIdsRef.current.delete(sig));

      showToast(type, title || message || "", { title, message, ttlMs, autoHide });
    });
  }, [showToast]);

  const value = useMemo(
    () => ({
      showToast
    }),
    [showToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container" aria-live="polite" aria-relevant="additions removals">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={["toast", t.type, t.dismissing ? "dismissing" : "", t.autoHide ? toastDurClass(t.ttlMs) : ""].filter(Boolean).join(" ")}
            role="status"
            onAnimationEnd={(e) => {
              if (!t.dismissing) return;
              if (e.animationName !== "toastOut" && e.animationName !== "toastOutReduced") return;
              removeToast(t.id);
            }}
          >
            {t.autoHide ? (
              <div className="toast-meter" aria-hidden="true">
                <div className="toast-meterFill" />
              </div>
            ) : null}
            <div className="toast-sheet">
              <header className="toast-head">
                <div className="toast-kind">
                  <span className="toast-kindGlyph" aria-hidden="true">
                    <IconByType type={t.type} />
                  </span>
                  <span className="toast-kindText">{kindLabel(t.type)}</span>
                </div>
                <IconBtn
                  className="toastDismiss"
                  type="button"
                  tooltip="Dismiss"
                  ariaLabel="Dismiss notification"
                  onClick={() => dismissToast(t.id)}
                >
                  <IconX />
                </IconBtn>
              </header>
              <div className="toast-copy">
                <p className="toast-lead">{t.title}</p>
                {t.message ? <p className="toast-detail">{t.message}</p> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
