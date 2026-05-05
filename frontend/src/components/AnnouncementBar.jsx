import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DOMPurify from "dompurify";
import {
  LEGACY_STORAGE_PREFIX,
  announcementDismissStorageKey,
  announcementGlobalKey
} from "../constants/brand.js";
import { onAuthChanged, readAuth } from "../services/authStorage.js";
import { getAnnouncement } from "../services/announcementService.js";
import { IconX } from "./ui/AppIcons.jsx";
import "./AnnouncementBar.css";

/** Sanitized HTML for admin-controlled notice (strips script/iframe/on* handlers). */
function sanitizeNoticeHtml(html) {
  return DOMPurify.sanitize(String(html || ""), {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "b", "i", "u", "s", "a", "span", "ul", "ol", "li", "small", "div"],
    ALLOWED_ATTR: ["href", "target", "rel", "class"],
    ALLOW_DATA_ATTR: false
  });
}

export default function AnnouncementBar() {
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      const nk = announcementDismissStorageKey();
      const legacy = `${LEGACY_STORAGE_PREFIX}_ann_dismiss`;
      const v = sessionStorage.getItem(legacy);
      if (v != null && sessionStorage.getItem(nk) == null) {
        sessionStorage.setItem(nk, v);
        sessionStorage.removeItem(legacy);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    return onAuthChanged(() => setTick((t) => t + 1));
  }, []);

  const load = useCallback(async () => {
    const auth = readAuth();
    if (!auth?.accessToken) {
      setData(null);
      return;
    }
    const resp = await getAnnouncement();
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      const a = resp.json?.data?.announcement;
      setData(a || null);
      const key = a?.updatedAt ? announcementGlobalKey(a.updatedAt) : "";
      try {
        const dismissKey = announcementDismissStorageKey();
        const legacyDismiss = `${LEGACY_STORAGE_PREFIX}_ann_dismiss`;
        if (
          key &&
          (sessionStorage.getItem(dismissKey) === key || sessionStorage.getItem(legacyDismiss) === key)
        )
          setHidden(true);
        else setHidden(false);
      } catch {
        setHidden(false);
      }
    } else {
      setData(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, tick]);

  const dismiss = useCallback(() => {
    const key = data?.updatedAt ? announcementGlobalKey(data.updatedAt) : "";
    try {
      if (key) sessionStorage.setItem(announcementDismissStorageKey(), key);
    } catch {
      // ignore
    }
    setHidden(true);
  }, [data?.updatedAt]);

  const rawMessage = data ? String(data.messageText || "").trim() : "";
  const safeHtml = useMemo(() => sanitizeNoticeHtml(rawMessage), [rawMessage]);
  const hasVisibleText = useMemo(() => {
    if (!rawMessage) return false;
    if (typeof document === "undefined") return true;
    const el = document.createElement("div");
    el.innerHTML = safeHtml;
    return Boolean(el.textContent?.trim());
  }, [rawMessage, safeHtml]);

  if (!data?.enabled || hidden) return null;
  if (!rawMessage || !hasVisibleText) return null;

  const label = String(data.buttonLabel || "").trim();
  const url = String(data.buttonUrl || "").trim();
  const ctaLabel = label || "Learn more";

  const onCtaClick = (e) => {
    if (!url) return;
    if (url.startsWith("/")) {
      e.preventDefault();
      navigate(url);
    }
  };

  return (
    <div className="annBar" role="region" aria-label="Announcement">
      <div className="annBarInner">
        <div className="annBarText" dangerouslySetInnerHTML={{ __html: safeHtml }} />
        {url ? (
          url.startsWith("/") ? (
            <a className="annBarBtn" href={url} onClick={onCtaClick}>
              {ctaLabel}
            </a>
          ) : (
            <a className="annBarBtn" href={url} target="_blank" rel="noopener noreferrer">
              {ctaLabel}
            </a>
          )
        ) : null}
      </div>
      <button type="button" className="annBarDismiss" onClick={dismiss} aria-label="Dismiss announcement" title="Dismiss">
        <IconX />
      </button>
    </div>
  );
}
