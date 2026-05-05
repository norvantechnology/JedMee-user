import { AppButton } from "./ui/buttons.jsx";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { IconChevronRight, IconPlus, IconProducts, Search } from "./ui/AppIcons.jsx";
import "./MasterModalForm.css";
import "./ProductPicker.css";

function clean(v) {
  return String(v ?? "").trim();
}

function norm(s) {
  return clean(s).toLowerCase();
}

function metaLine(selected) {
  const parts = [
    selected.code ? selected.code : "",
    selected.drug_name || "",
    selected.division_name
      ? `${selected.division_name}${
          selected.mfg_short_name || selected.mfg_company_name
            ? ` · ${selected.mfg_short_name || selected.mfg_company_name}`
            : ""
        }`
      : selected.mfg_company_name || ""
  ].filter(Boolean);
  return parts.join(" · ");
}

/**
 * Searchable product picker with catalog search and optional “new product” action.
 * Uses shared field classes (mfzInput), AppButton, and theme tokens only.
 */
export default function ProductPicker({
  value,
  products = [],
  disabled = false,
  readOnly = false,
  placeholder = "Search name, code, or drug…",
  onSelect,
  onCreateNew,
  allowCreate = true,
  autoFocus = false
}) {
  const idBase = useId();
  const labelId = `${idBase}-label`;
  const hintId = `${idBase}-hint`;
  const listId = `${idBase}-listbox`;

  const selected = useMemo(() => {
    const id = clean(value);
    if (!id) return null;
    return (products || []).find((p) => String(p.id) === id) || null;
  }, [value, products]);

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setSearch("");
    setOpen(false);
    setHighlight(0);
  }, [selected?.id]);

  useEffect(() => {
    function onDocClick(e) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
  }, [autoFocus]);

  const filtered = useMemo(() => {
    const q = norm(search);
    const list = (products || []).filter((p) => !p.deleted_at);
    if (!q) return list.slice(0, 50);
    return list
      .filter((p) => {
        const blob = norm(
          `${p.name || ""} ${p.code || ""} ${p.drug_name || ""} ${p.division_name || ""} ${p.mfg_company_name || ""}`
        );
        return blob.includes(q);
      })
      .slice(0, 50);
  }, [products, search]);

  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(0);
  }, [filtered.length, highlight]);

  function pick(p) {
    onSelect?.(p || null);
    setOpen(false);
    setSearch("");
  }

  function onKey(e) {
    if (readOnly || disabled) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      if (open && filtered[highlight]) {
        e.preventDefault();
        pick(filtered[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  if (selected && !readOnly) {
    return (
      <div className={`ppShell${disabled ? " ppShell_disabled" : ""}`}>
        <div className="ppChoiceCard" role="group" aria-labelledby={labelId}>
          <div className="ppChoiceHero">
            <div className="ppChoiceMark" aria-hidden="true">
              <IconProducts />
            </div>
            <div className="ppChoiceText">
              <h3 id={labelId} className="ppChoiceTitle">
                {selected.name || "(Untitled)"}
              </h3>
              {metaLine(selected) ? <p className="ppChoiceMeta">{metaLine(selected)}</p> : null}
            </div>
          </div>
          <div className="ppChoiceBar">
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => pick(null)}
              title="Choose a different product"
            >
              Change product
            </AppButton>
          </div>
        </div>
      </div>
    );
  }

  if (readOnly && selected) {
    return (
      <div className="ppShell ppShell_ro">
        <div className="ppChoiceCard ppChoiceCard_ro" role="group" aria-labelledby={labelId}>
          <div className="ppChoiceHero">
            <div className="ppChoiceMark" aria-hidden="true">
              <IconProducts />
            </div>
            <div className="ppChoiceText">
              <h3 id={labelId} className="ppChoiceTitle">{selected.name || "(Untitled)"}</h3>
              {[selected.code, selected.drug_name].filter(Boolean).length ? (
                <p className="ppChoiceMeta">
                  {[selected.code, selected.drug_name].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`ppShell${disabled ? " ppShell_disabled" : ""}`} ref={wrapRef}>
      <div className="ppSearchStage">
        <div className="ppCombo" role="combobox" aria-expanded={open ? "true" : "false"} aria-haspopup="listbox" aria-owns={listId}>
          <div className={`ppComboField${open ? " ppComboField_open" : ""}`}>
            <span className="ppComboGlyph" aria-hidden="true">
              <Search size={18} strokeWidth={2.25} />
            </span>
            <input
              ref={inputRef}
              id={`${idBase}-input`}
              className="mfzInput ppComboInput"
              value={search}
              disabled={disabled}
              placeholder={placeholder}
              onFocus={() => setOpen(true)}
              onChange={(e) => {
                setSearch(e.target.value);
                setOpen(true);
              }}
              onKeyDown={onKey}
              autoComplete="off"
              aria-label="Search product"
              aria-controls={listId}
              aria-activedescendant={open && filtered[highlight] ? `${idBase}-opt-${highlight}` : undefined}
            />
            <span className={`ppComboAffordance${open ? " ppComboAffordance_open" : ""}`} aria-hidden="true">
              <IconChevronRight />
            </span>
          </div>

          {open && !disabled ? (
            <div id={listId} className="ppMenu" role="listbox" aria-label="Product results">
              {filtered.length === 0 ? (
                <div className="ppEmpty" role="presentation">
                  No products match your search.
                </div>
              ) : (
                filtered.map((p, i) => (
                  <button
                    type="button"
                    key={String(p.id)}
                    id={`${idBase}-opt-${i}`}
                    className={`ppOpt${i === highlight ? " ppOpt_active" : ""}`}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pick(p)}
                    role="option"
                    aria-selected={i === highlight ? "true" : "false"}
                  >
                    <span className="ppOptMain">
                      <span className="ppOptName">{p.name || "(Untitled)"}</span>
                      {p.code ? <span className="ppOptCode">{p.code}</span> : null}
                    </span>
                    <span className="ppOptSub">
                      {[
                        p.drug_name || "",
                        p.division_name
                          ? `${p.division_name}${p.mfg_short_name || p.mfg_company_name ? ` · ${p.mfg_short_name || p.mfg_company_name}` : ""}`
                          : p.mfg_company_name || "",
                        p.sales_gst != null && p.sales_gst !== "" ? `GST ${p.sales_gst}%` : "",
                        p.active_batch_count != null ? `${p.active_batch_count} batches` : ""
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        {allowCreate && onCreateNew && !disabled ? (
          <div className="ppCreateRow">
            <AppButton type="button" variant="secondary" size="sm" icon={<IconPlus />} onClick={() => onCreateNew?.()} title="Create a new catalog product">
              New product
            </AppButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
