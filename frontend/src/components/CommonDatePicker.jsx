import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, IconChevronLeft, IconChevronRight } from "./ui/AppIcons.jsx";
import "./CommonDatePicker.css";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEK_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const POPOVER_WIDTH = 292;
const POPOVER_WIDTH_SM = 280;
// Compact popover (no dropdowns / no internal scroll)
const POPOVER_HEIGHT = 320;
const POPOVER_MIN_HEIGHT = 260;
const VIEWPORT_MARGIN = 8;

function pad(n) {
  return String(n).padStart(2, "0");
}

function parseYmd(ymd) {
  const s = String(ymd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  if (`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` !== s) return null;
  return d;
}

function toYmd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toDisplay(d) {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function IconCalendar() {
  return <Calendar aria-hidden="true" size={18} strokeWidth={2.2} />;
}

function computePopoverPosition(triggerRect, popoverWidth) {
  if (!triggerRect) return { top: 0, left: 0, maxHeight: POPOVER_HEIGHT };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceBelow = Math.max(0, vh - triggerRect.bottom - VIEWPORT_MARGIN - 6);
  const spaceAbove = Math.max(0, triggerRect.top - VIEWPORT_MARGIN - 6);
  const openUp = spaceBelow < POPOVER_HEIGHT && spaceAbove > spaceBelow;
  const available = openUp ? spaceAbove : spaceBelow;
  const maxAllowed = Math.max(POPOVER_MIN_HEIGHT, vh - VIEWPORT_MARGIN * 2);
  const maxHeight = Math.max(POPOVER_MIN_HEIGHT, Math.min(POPOVER_HEIGHT, available || maxAllowed, maxAllowed));

  let top = openUp ? triggerRect.top - maxHeight - 6 : triggerRect.bottom + 6;
  if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;
  if (top + maxHeight > vh - VIEWPORT_MARGIN) top = Math.max(VIEWPORT_MARGIN, vh - maxHeight - VIEWPORT_MARGIN);

  let left = triggerRect.left;
  if (left + popoverWidth > vw - VIEWPORT_MARGIN) {
    left = Math.max(VIEWPORT_MARGIN, vw - popoverWidth - VIEWPORT_MARGIN);
  }
  if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

  return { top, left, maxHeight };
}

export default function CommonDatePicker({
  value,
  onChange,
  placeholder = "dd/mm/yyyy",
  ariaLabel = "Date",
  className = "",
  size = "md",
  disabled = false
}) {
  const selectedDate = useMemo(() => parseYmd(value), [value]);
  const today = useMemo(() => new Date(), []);
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState(""); // "" | "month" | "year"
  const [viewYear, setViewYear] = useState(selectedDate?.getFullYear() || today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate?.getMonth() || today.getMonth());
  const [pos, setPos] = useState({ top: 0, left: 0, maxHeight: POPOVER_HEIGHT });

  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const yearStripRef = useRef(null);

  const popoverWidth = size === "sm" ? POPOVER_WIDTH_SM : POPOVER_WIDTH;

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos(computePopoverPosition(rect, popoverWidth));
  }, [popoverWidth]);

  useEffect(() => {
    if (!selectedDate) return;
    setViewYear(selectedDate.getFullYear());
    setViewMonth(selectedDate.getMonth());
  }, [selectedDate]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const onReflow = () => updatePosition();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    function isEventInsidePicker(e) {
      const path = typeof e.composedPath === "function" ? e.composedPath() : [];
      if (path.length) {
        if (triggerRef.current && path.includes(triggerRef.current)) return true;
        if (popoverRef.current && path.includes(popoverRef.current)) return true;
      }
      const t = e.target;
      if (triggerRef.current?.contains(t)) return true;
      if (popoverRef.current?.contains(t)) return true;
      return false;
    }
    function onDocClick(e) {
      if (isEventInsidePicker(e)) return;
      setOpen(false);
    }
    function onDocKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    // Use click instead of mousedown so native <select> year/month picks don't
    // get treated as outside clicks before their change event is applied.
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("click", onDocClick, true);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const active = yearStripRef.current?.querySelector(".cdpYearChip_active");
    if (active && typeof active.scrollIntoView === "function") {
      active.scrollIntoView({ block: "nearest", inline: "center" });
    }
  }, [open, viewYear]);

  useEffect(() => {
    if (!open) setPanel("");
  }, [open]);

  function shiftMonth(dir) {
    if (disabled) return;
    let nextMonth = viewMonth + dir;
    let nextYear = viewYear;
    if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    }
    setViewMonth(nextMonth);
    setViewYear(nextYear);
  }

  function pickDate(day) {
    if (disabled) return;
    const d = new Date(viewYear, viewMonth, day);
    onChange?.(toYmd(d));
    setOpen(false);
  }

  function pickToday() {
    if (disabled) return;
    const t = new Date();
    onChange?.(toYmd(t));
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
    setOpen(false);
  }

  function clearDate() {
    if (disabled) return;
    onChange?.("");
    setOpen(false);
  }

  const yearPageStart = Math.floor(Number(viewYear || today.getFullYear()) / 16) * 16;
  const yearPage = Array.from({ length: 16 }, (_, i) => yearPageStart + i);
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  const dayCells = [];
  for (let i = firstDay - 1; i >= 0; i -= 1) {
    dayCells.push({ day: daysInPrevMonth - i, otherMonth: true, disabled: true });
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    dayCells.push({ day: d, otherMonth: false, disabled: false });
  }
  for (let d = 1; d <= totalCells - firstDay - daysInMonth; d += 1) {
    dayCells.push({ day: d, otherMonth: true, disabled: true });
  }

  const selectedYmd = selectedDate ? toYmd(selectedDate) : "";
  const todayYmd = toYmd(today);
  const displayText = selectedDate ? toDisplay(selectedDate) : placeholder;

  const popoverNode = open ? (
    <div
      ref={popoverRef}
      className={`cdpPopover ${size === "sm" ? "cdpPopover_sm" : ""}`.trim()}
      role="dialog"
      aria-label="Date picker"
      style={{ top: pos.top, left: pos.left, width: popoverWidth, maxHeight: pos.maxHeight }}
    >
      <div className="cdpHeader">
        <button type="button" className="cdpNavBtn" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          <IconChevronLeft />
        </button>
        <div className="cdpHeadMid" aria-label="Month and year">
          <button
            type="button"
            className={`cdpHeadPill ${panel === "month" ? "cdpHeadPill_on" : ""}`.trim()}
            onClick={() => setPanel((p) => (p === "month" ? "" : "month"))}
            aria-label="Select month"
          >
            {MONTHS_SHORT[viewMonth]}
          </button>
          <button
            type="button"
            className={`cdpHeadPill ${panel === "year" ? "cdpHeadPill_on" : ""}`.trim()}
            onClick={() => setPanel((p) => (p === "year" ? "" : "year"))}
            aria-label="Select year"
          >
            {viewYear}
          </button>
        </div>
        <button type="button" className="cdpNavBtn" onClick={() => shiftMonth(1)} aria-label="Next month">
          <IconChevronRight />
        </button>
      </div>

      {panel === "month" ? (
        <div className="cdpPanel" aria-label="Pick month">
          <div className="cdpPanelGrid cdpPanelGrid_month">
            {MONTHS.map((m, i) => (
              <button
                key={m}
                type="button"
                className={`cdpPanelChip ${i === viewMonth ? "cdpPanelChip_on" : ""}`.trim()}
                onClick={() => {
                  setViewMonth(i);
                  setPanel("");
                }}
              >
                {MONTHS_SHORT[i]}
              </button>
            ))}
          </div>
        </div>
      ) : panel === "year" ? (
        <div className="cdpPanel" aria-label="Pick year">
          <div className="cdpYearPager">
            <button type="button" className="cdpYearPagerBtn" onClick={() => setViewYear((y) => Number(y || 0) - 16)} aria-label="Previous years">
              <IconChevronLeft />
            </button>
            <div className="cdpYearPagerText">
              {yearPageStart}–{yearPageStart + 15}
            </div>
            <button type="button" className="cdpYearPagerBtn" onClick={() => setViewYear((y) => Number(y || 0) + 16)} aria-label="Next years">
              <IconChevronRight />
            </button>
          </div>
          <div className="cdpPanelGrid cdpPanelGrid_year">
            {yearPage.map((y) => (
              <button
                key={y}
                type="button"
                className={`cdpPanelChip ${y === viewYear ? "cdpPanelChip_on" : ""}`.trim()}
                onClick={() => {
                  setViewYear(y);
                  setPanel("");
                }}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="cdpGridWrap">
          <div className="cdpWeekdays">
            {WEEK_DAYS.map((w, i) => (
              <div key={w} className={`cdpWd ${i === 0 || i === 6 ? "cdpWd_weekend" : ""}`}>
                {w}
              </div>
            ))}
          </div>
          <div className="cdpDays">
            {dayCells.map((cell, idx) => {
              const ymd = `${viewYear}-${pad(viewMonth + 1)}-${pad(cell.day)}`;
              const isSelected = !cell.otherMonth && ymd === selectedYmd;
              const isToday = !cell.otherMonth && ymd === todayYmd;
              const dayIndex = idx % 7;
              const isWeekend = dayIndex === 0 || dayIndex === 6;
              return (
                <button
                  key={`${ymd}_${idx}`}
                  type="button"
                  className={`cdpDay ${cell.otherMonth ? "cdpDay_other cdpDay_empty" : ""} ${isSelected ? "cdpDay_selected" : ""} ${
                    isToday ? "cdpDay_today" : ""
                  } ${isWeekend ? "cdpDay_weekend" : ""}`.trim()}
                  disabled={cell.disabled}
                  tabIndex={cell.disabled ? -1 : 0}
                  onClick={() => pickDate(cell.day)}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="cdpFooter">
        <button type="button" className="cdpTodayBtn" onClick={pickToday}>
          Today
        </button>
        <button type="button" className="cdpClearBtn" onClick={clearDate}>
          Clear
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className={`cdp ${size === "sm" ? "cdp_sm" : ""} ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className={`cdpInput ${!selectedDate ? "cdpInput_placeholder" : ""} ${open ? "cdpInput_open" : ""}`}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open ? "true" : "false"}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="cdpInputText">{displayText}</span>
        <span className="cdpInputIcon" aria-hidden="true">
          <IconCalendar />
        </span>
      </button>

      {popoverNode && typeof document !== "undefined" ? createPortal(popoverNode, document.body) : null}
    </div>
  );
}
