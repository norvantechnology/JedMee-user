/**
 * Central exports for list/table filtering: search field, styled native select,
 * calendar-backed date filter, and shared filter-sheet / toolbar slot markup.
 *
 * Import from `components/ui/tableFilters.jsx` instead of scattering filter UI.
 */
import { useRef } from "react";
import CommonDatePicker from "../CommonDatePicker.jsx";
import { AppButton } from "./buttons.jsx";
import { IconChevronRight, IconTableCalendar, IconTableFunnel, IconX } from "./AppIcons.jsx";
import "./tableFilters.css";

export function TableSearch({
  value,
  onChange,
  placeholder = "Search records…",
  ariaLabel = "Search records",
  icon,
  onClear
}) {
  const v = value ?? "";
  return (
    <div className="tcSearch" role="search">
      {icon ? (
        <span className="tcSearchIcon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <input
        className="tcSearchInput"
        value={v}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
      {v ? (
        <AppButton
          className="tcClearBtn"
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Clear search"
          onClick={() => (onClear ? onClear() : onChange?.(""))}
          icon={<IconX />}
        />
      ) : null}
    </div>
  );
}

export function TableSelect({ value, onChange, ariaLabel = "Filter", icon = null, children, className = "" }) {
  const selRef = useRef(null);
  return (
    <div
      className={`tcSelectWrap ${className}`.trim()}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === selRef.current) return;
        e.preventDefault();
        try {
          selRef.current?.focus?.();
          selRef.current?.click?.();
        } catch {
          // ignore
        }
      }}
    >
      {icon ? (
        <span className="tcSelectIconSlot" aria-hidden="true">
          {icon}
        </span>
      ) : (
        <span className="tcSelectIcon" aria-hidden="true" />
      )}
      <select
        ref={selRef}
        className="tcSelect"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        aria-label={ariaLabel}
      >
        {children}
      </select>
      <span className="tcSelectChevronSlot" aria-hidden="true">
        <span className="tcSelectChevronIco">
          <IconChevronRight />
        </span>
      </span>
    </div>
  );
}

export function TableIconFunnel() {
  return <IconTableFunnel />;
}

export function TableIconCalendar() {
  return <IconTableCalendar />;
}

/** One row inside the mobile filter modal (and shared structure with toolbar). */
function TableFilterDateControl({ f }) {
  return (
    <div className="tcDateWrap">
      <span className="tcDateIcon" aria-hidden="true">
        <TableIconCalendar />
      </span>
      <CommonDatePicker
        value={f.value || ""}
        onChange={(v) => f.onChange?.(v)}
        ariaLabel={f.ariaLabel || f.label || "Date filter"}
        placeholder={f.placeholder || "dd/mm/yyyy"}
        size="sm"
        className="tblDateFilter"
      />
    </div>
  );
}

/** Mobile / sheet body: all filters in vertical layout. */
export function TableFilterSheetBody({ filterList = [] }) {
  return (
    <div className="tblFilterSheet">
      {filterList.map((f, idx) => {
        const rowKey = f.id || f.label || String(idx);
        if (f?.type === "date") {
          return (
            <div className="tblFilterRow" key={rowKey}>
              <div className="tblFilterLabel">{f.label || "Date"}</div>
              <div className="tblFilterCtrl">
                <TableFilterDateControl f={f} />
              </div>
            </div>
          );
        }
        return (
          <div className="tblFilterRow" key={rowKey}>
            <div className="tblFilterLabel">{f.label || "Filter"}</div>
            <div className="tblFilterCtrl">
              <TableSelect value={f.value} onChange={(v) => f.onChange?.(v)} ariaLabel={f.ariaLabel || f.label || "Filter"}>
                {f.options?.map((o) => (
                  <option key={String(o.value)} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </TableSelect>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Desktop toolbar slot for a single filter definition (date or select). */
export function TableToolbarFilterSlot({ filter: f }) {
  if (!f) return null;
  if (f.type === "date") {
    return (
      <div className="tblToolSlot tblToolSlot_date">
        <TableFilterDateControl f={f} />
      </div>
    );
  }
  return (
    <div className="tblToolSlot">
      <TableSelect value={f.value} onChange={(v) => f.onChange?.(v)} ariaLabel={f.ariaLabel || f.label || "Filter"}>
        {f.options?.map((o) => (
          <option key={String(o.value)} value={o.value}>
            {o.label}
          </option>
        ))}
      </TableSelect>
    </div>
  );
}
