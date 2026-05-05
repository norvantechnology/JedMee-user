import medico from "../shared/print/medicoPrintDocuments.cjs";

const PRINT_STYLES = medico.getMedicoPrintDocumentCss();

function buildPrintHtml({ title, bodyHtml }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${medico.esc(title || "Print")}</title>
    <style>${PRINT_STYLES}</style>
  </head>
  <body>${bodyHtml}</body>
</html>`;
}

function removeNode(node) {
  try {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  } catch {
    // ignore
  }
}

export function printViaHiddenIframe({ title, bodyHtml }) {
  const doc = globalThis.document;
  if (!doc || !doc.body) return { ok: false, reason: "NO_DOCUMENT" };

  const frame = doc.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  frame.title = title || "Print";
  const s = frame.style;
  s.position = "fixed";
  s.right = "0";
  s.bottom = "0";
  s.width = "0";
  s.height = "0";
  s.border = "0";
  s.opacity = "0";
  s.pointerEvents = "none";

  const html = buildPrintHtml({ title, bodyHtml });
  frame.srcdoc = html;

  let printed = false;
  const cleanup = () => {
    setTimeout(() => removeNode(frame), 1000);
  };

  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      const win = frame.contentWindow;
      if (!win) {
        cleanup();
        return;
      }
      try {
        win.focus();
      } catch {
        /* ignore */
      }
      try {
        win.addEventListener("afterprint", cleanup, { once: true });
      } catch {
        /* ignore */
      }
      win.print();
    } catch {
      // ignore
    }
    cleanup();
  };

  frame.addEventListener("load", () => {
    setTimeout(triggerPrint, 120);
  });

  doc.body.appendChild(frame);
  setTimeout(triggerPrint, 1500);

  return { ok: true };
}

export function openPrintDocument(payload) {
  return printViaHiddenIframe(payload);
}

export function openPrintWindow() {
  return { __hiddenIframe: true };
}

/** Re-export for modules that historically imported esc from printDocument.js */
export function esc(v) {
  return medico.esc(v);
}
