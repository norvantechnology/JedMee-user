import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { GUIDE_LINKS } from "../../data/resourceLinks.js";

/**
 * Resources dropdown for main nav — reuses existing ln-nav link styles.
 */
export default function ResourcesNav({ onNavigate, linkClassName = "" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const cls = linkClassName || undefined;

  return (
    <li className="ln-nav-resources" ref={wrapRef}>
      <button
        type="button"
        className={cls || "ln-nav-resources-btn"}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        Resources
        <span aria-hidden="true" style={{ marginLeft: 4, fontSize: "0.65em" }}>▾</span>
      </button>
      {open && (
        <ul className="ln-nav-resources-menu" role="menu">
          {GUIDE_LINKS.map((g) => (
            <li key={g.to} role="none">
              <Link
                to={g.to}
                role="menuitem"
                className="ln-nav-resources-item"
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
              >
                {g.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
