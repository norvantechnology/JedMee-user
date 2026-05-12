import { AppButton } from "./ui/buttons.jsx";
import { Children, cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import ConfirmDialog from "./ConfirmDialog.jsx";
import CommonLoading, { SkeletonLine } from "./CommonLoading.jsx";
import { TableFilterSheetBody, TableSearch, TableToolbarFilterSlot } from "./ui/tableFilters.jsx";
import { inferBulkDeleteIconName, renderBulkTableIcon } from "./TableBulkActionIcons.jsx";
import CommonModal from "./CommonModal.jsx";
import { IconChevronLeft, IconChevronRight, IconDots, IconPlus, Search, IconSettings, IconTableFunnel } from "./ui/AppIcons.jsx";
import {
  getCustomizableColumns,
  isColumnAlwaysVisible,
  loadColumnVisibility,
  saveColumnVisibility
} from "../utils/commonTableColumnPrefs.js";
import "./CommonTable.css";

function initials(name = "") {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "U";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function statusClass(status) {
  const s = String(status || "").toUpperCase();
  if (s === "APPROVED") return "tblBadge tblBadge_ok";
  if (s === "PENDING") return "tblBadge tblBadge_wait";
  if (s === "REJECTED") return "tblBadge tblBadge_bad";
  if (s === "BLOCKED") return "tblBadge tblBadge_muted";
  return "tblBadge tblBadge_muted";
}

function roleClass(role) {
  const r = String(role || "").toUpperCase();
  if (r === "WHOLESALER") return "tblBadge tblBadge_info";
  if (r === "RETAILER") return "tblBadge tblBadge_info";
  if (r === "ADMIN") return "tblBadge tblBadge_ok";
  if (r === "PHARMACIST") return "tblBadge tblBadge_wait";
  return "tblBadge tblBadge_muted";
}

function SortGlyph({ dir }) {
  const d = String(dir || "").toLowerCase();
  return (
    <span className={`tblSortGlyph ${d ? `tblSortGlyph_${d}` : ""}`.trim()} aria-hidden="true">
      <IconChevronRight />
    </span>
  );
}

function normalizeActionNode(node) {
  if (!isValidElement(node)) return node;
  const prevClass = String(node.props?.className || "").trim();
  return cloneElement(node, {
    className: `${prevClass} tblInlineActions`.trim()
  });
}

function mobileizeHeaderActionNode(node) {
  if (node == null) return node;
  if (!isValidElement(node)) return node;

  // Recurse fragments/arrays
  if (node.type === Symbol.for("react.fragment")) {
    return <>{Children.map(node.props?.children, mobileizeHeaderActionNode)}</>;
  }

  // AppButton: keep label visible on mobile, just normalize sizing.
  if (node.type === AppButton) {
    const prevClass = String(node.props?.className || "").trim();
    return cloneElement(node, {
      size: "sm",
      className: `${prevClass} tblMobileAct`.trim(),
      // Keep any existing aria-label/title untouched
    });
  }

  // Generic buttons/links: add a class so CSS can normalize size.
  const prevClass = String(node.props?.className || "").trim();
  return cloneElement(node, { className: `${prevClass} tblMobileAct`.trim() });
}

function pushMobileActionFromNode(node, out) {
  if (node == null) return;
  if (Array.isArray(node)) {
    node.forEach((n) => pushMobileActionFromNode(n, out));
    return;
  }
  if (!isValidElement(node)) return;

  // Recurse fragments/wrappers
  if (node.type === Symbol.for("react.fragment")) {
    Children.forEach(node.props?.children, (c) => pushMobileActionFromNode(c, out));
    return;
  }

  const typeName = typeof node.type === "string" ? node.type : node.type?.name;

  // Handle AppButton reliably
  if (node.type === AppButton) {
    const label =
      node.props?.["aria-label"] ||
      node.props?.title ||
      (typeof node.props?.children === "string" ? node.props.children : "") ||
      "Action";
    const onClick = node.props?.onClick;
    if (typeof onClick !== "function") return;
    out.push({
      key: `ab_${label}_${out.length}`,
      label,
      icon: node.props?.icon || null,
      variant: node.props?.variant || "secondary",
      disabled: Boolean(node.props?.disabled),
      onClick
    });
    return;
  }

  // Generic buttons/anchors: try to extract label + click
  const onClick = node.props?.onClick;
  const label =
    node.props?.["aria-label"] ||
    node.props?.title ||
    (typeof node.props?.children === "string" ? node.props.children : "") ||
    (typeof typeName === "string" ? typeName : "Action");
  if (typeof onClick === "function") {
    out.push({
      key: `el_${label}_${out.length}`,
      label,
      icon: null,
      variant: "secondary",
      disabled: Boolean(node.props?.disabled),
      onClick
    });
    return;
  }

  // Otherwise recurse into children (e.g. wrappers like TableCsvActions div)
  if (node.props?.children) {
    Children.forEach(node.props.children, (c) => pushMobileActionFromNode(c, out));
  }
}

export default function CommonTable({
  title,
  subtitle,
  countText,
  loading = false,
  compact = false,
  pageSize = 10,
  pageSizeOptions = [10, 20, 50, 100],
  onPageSizeChange,
  showRowNumbers = true,
  controlsPlacement = "top", // "below" | "top"
  search,
  onSearchChange,
  filter,
  filters,
  sort,
  onSortChange,
  primaryAction,
  /** Optional node(s) rendered next to the primary action (e.g. import/export). */
  extraHeaderActions = null,
  rows = [],
  selectedId,
  onRowClick,
  onRowDelete,
  getRowId,
  columns = [],
  rowClassName,
  pagination,
  preserveSelectionAcrossPages = false,
  /**
   * When set, shows row checkboxes, select-all (current page), and bulk action bar.
   * Optional `icon`: key (`"cancel"`, `"trash"`, …) or `ReactNode`; if omitted, inferred from `label` (Cancel → cancel, else trash).
   */
  bulkDelete = null,
  /** Optional callback to consume currently selected row ids (for custom bulk actions like print/export). */
  onSelectionChange,
  /**
   * Optional extra bulk actions: `{ id, label, onClick, disabled, danger, icon }`.
   * `icon` is a key resolved by `TableBulkActionIcons` (e.g. `"payment"`, `"print"`, `"email"`) or a `ReactNode`.
   */
  bulkActions = [],
  /**
   * Stable id for persisting column visibility in localStorage (defaults to current route path).
   * Pass when multiple tables exist on one route (e.g. main table + nested ledger).
   */
  columnPrefsKey,
  /** When true (default), shows a Columns (gear) control with per-column visibility toggles. */
  enableColumnCustomizer = true
}) {
  const keyFn = getRowId || ((r) => r?.id);
  const showBulk = Boolean(bulkDelete && typeof bulkDelete.onDelete === "function");
  const showSelection = showBulk || typeof onSelectionChange === "function";
  const hasRows = Array.isArray(rows) && rows.length > 0;
  const loadingFromCountText = String(countText || "")
    .toLowerCase()
    .includes("loading");
  // Prevent UI flicker: if rows are already present, keep showing them
  // instead of replacing table body with skeleton for row-level actions.
  const isLoading = Boolean(loading) || (loadingFromCountText && !hasRows);

  const useLocalPagination = !pagination;
  const [localPageSize, setLocalPageSize] = useState(Math.max(1, Math.min(100, Number(pageSize || 10))));
  useEffect(() => {
    const next = Math.max(1, Math.min(100, Number(pageSize || 10)));
    setLocalPageSize(next);
  }, [pageSize]);
  const safePageSize = Math.max(1, Math.min(100, Number(localPageSize || 10)));
  const [localPage, setLocalPage] = useState(1);

  useEffect(() => {
    if (!useLocalPagination) return;
    setLocalPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useLocalPagination, safePageSize, rows]);

  const effectivePagination = useMemo(() => {
    if (!useLocalPagination) return pagination;
    const totalItems = Array.isArray(rows) ? rows.length : 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
    const page = Math.max(1, Math.min(Number(localPage || 1), totalPages));
    const from = totalItems ? (page - 1) * safePageSize + 1 : 0;
    const to = totalItems ? Math.min(totalItems, page * safePageSize) : 0;
    return {
      page,
      totalPages,
      totalItems,
      from,
      to,
      onPrev: () => setLocalPage((p) => Math.max(1, Number(p || 1) - 1)),
      onNext: () => setLocalPage((p) => Math.min(totalPages, Number(p || 1) + 1)),
      onPage: (p) => setLocalPage(Math.max(1, Math.min(totalPages, Number(p || 1))))
    };
  }, [useLocalPagination, pagination, rows, safePageSize, localPage]);

  const displayRows = useMemo(() => {
    if (!useLocalPagination) return rows || [];
    const totalItems = Array.isArray(rows) ? rows.length : 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
    const page = Math.max(1, Math.min(Number(localPage || 1), totalPages));
    const start = (page - 1) * safePageSize;
    return (rows || []).slice(start, start + safePageSize);
  }, [useLocalPagination, rows, safePageSize, localPage]);

  const rowNumberOffset = useMemo(() => {
    if (!useLocalPagination) return 0;
    return (Math.max(1, Number(localPage || 1)) - 1) * safePageSize;
  }, [useLocalPagination, localPage, safePageSize]);

  const pageButtons = useMemo(() => {
    const total = Number(effectivePagination?.totalPages || 1);
    const cur = Number(effectivePagination?.page || 1);
    const max = Math.max(1, Math.min(total, 7));
    if (total <= max) return Array.from({ length: total }, (_, i) => i + 1);
    const start = Math.max(1, Math.min(cur - 2, total - (max - 1)));
    return Array.from({ length: max }, (_, i) => start + i);
  }, [effectivePagination?.page, effectivePagination?.totalPages]);

  const location = useLocation();

  const customizableCols = useMemo(() => getCustomizableColumns(columns), [columns]);

  const customizableSig = useMemo(() => customizableCols.map((c) => String(c.id)).sort().join("|"), [customizableCols]);

  /** Path + column-id signature avoids clashes when multiple CommonTables share one route (e.g. modal ledger). */
  const resolvedColumnPrefsKey = useMemo(() => {
    const manual = String(columnPrefsKey || "").trim();
    if (manual) return manual;
    const path = String(location.pathname || "").trim() || "_";
    return `${path}::${customizableSig}`;
  }, [columnPrefsKey, location.pathname, customizableSig]);

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return Boolean(window.matchMedia?.("(max-width: 720px)")?.matches);
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const mq = typeof window !== "undefined" ? window.matchMedia?.("(max-width: 720px)") : null;
    if (!mq) return;
    function update() {
      try {
        setIsMobile(Boolean(mq.matches));
      } catch {
        setIsMobile(false);
      }
    }
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  const [hiddenColumnIds, setHiddenColumnIds] = useState(() => new Set());
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const colsBtnRef = useRef(null);
  const colsPopRef = useRef(null);

  useEffect(() => {
    const loaded = loadColumnVisibility(resolvedColumnPrefsKey);
    const allowed = new Set(customizableCols.map((c) => String(c.id)));
    const fromStorage = new Set((loaded?.hidden || []).filter((id) => allowed.has(String(id))));
    setHiddenColumnIds(fromStorage);
  }, [resolvedColumnPrefsKey, customizableSig]);

  useEffect(() => {
    if (!columnSettingsOpen) return;
    if (isMobile) return; // mobile uses modal
    function onDocDown(e) {
      const t = e.target;
      if (colsBtnRef.current?.contains?.(t)) return;
      if (colsPopRef.current?.contains?.(t)) return;
      setColumnSettingsOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setColumnSettingsOpen(false);
    }
    document.addEventListener("mousedown", onDocDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDocDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [columnSettingsOpen, isMobile]);

  const visibleColumns = useMemo(() => {
    const list = Array.isArray(columns) ? columns : [];
    return list.filter((c) => isColumnAlwaysVisible(c) || !hiddenColumnIds.has(String(c.id)));
  }, [columns, hiddenColumnIds]);

  const toggleColumnHidden = useCallback(
    (columnId) => {
      const id = String(columnId);
      setHiddenColumnIds((prev) => {
        const next = new Set(prev);
        const currentlyHidden = next.has(id);
        if (currentlyHidden) {
          next.delete(id);
        } else {
          const visibleOthers = customizableCols.filter((c) => String(c.id) !== id && !next.has(String(c.id)));
          if (visibleOthers.length === 0) return prev;
          next.add(id);
        }
        saveColumnVisibility(resolvedColumnPrefsKey, [...next]);
        return next;
      });
    },
    [customizableCols, resolvedColumnPrefsKey]
  );

  const resetColumnVisibility = useCallback(() => {
    setHiddenColumnIds(new Set());
    saveColumnVisibility(resolvedColumnPrefsKey, []);
  }, [resolvedColumnPrefsKey]);

  const showColumnCustomizer = Boolean(enableColumnCustomizer) && customizableCols.length > 0;

  const skelRows = useMemo(() => {
    const colCount = Math.max(1, visibleColumns.length || 1) + (showRowNumbers ? 1 : 0) + (showBulk ? 1 : 0);
    const n = Math.max(4, Math.min(10, safePageSize));
    return Array.from({ length: n }, (_, i) => ({
      key: `sk_${i}`,
      cells: Array.from({ length: colCount }, (_, j) => {
        const seed = (i * 7 + j * 11) % 100;
        const w = j === 0 ? 68 : j === colCount - 1 ? 36 : 52 + (seed % 28);
        return { w };
      })
    }));
  }, [visibleColumns.length, safePageSize, showRowNumbers, showBulk]);

  const filterList = Array.isArray(filters) ? filters.filter(Boolean) : filter ? [filter] : [];

  const selectAllRef = useRef(null);
  // Tracks last row touch start so we can suppress click if the user was scrolling.
  const rowTouchRef = useRef(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const isRowSelectableFn = bulkDelete?.isRowSelectable;

  const displaySelectableRows = useMemo(() => {
    return (displayRows || []).filter((r) => (typeof isRowSelectableFn === "function" ? isRowSelectableFn(r) : true));
  }, [displayRows, isRowSelectableFn]);

  const selectedOnPage = useMemo(() => {
    const set = new Set(selectedIds.map(String));
    return (displaySelectableRows || []).filter((r) => set.has(String(keyFn(r))));
  }, [selectedIds, displaySelectableRows, keyFn]);

  const allPageSelected =
    displaySelectableRows.length > 0 && selectedOnPage.length === displaySelectableRows.length;
  const somePageSelected = selectedOnPage.length > 0 && !allPageSelected;

  useEffect(() => {
    const el = selectAllRef.current;
    if (el) el.indeterminate = somePageSelected;
  }, [somePageSelected, allPageSelected, displaySelectableRows.length]);

  function toggleSelected(id) {
    const s = String(id);
    setSelectedIds((prev) => (prev.map(String).includes(s) ? prev.filter((x) => String(x) !== s) : [...prev, s]));
  }

  function toggleSelectAllOnPage() {
    const pageIds = displaySelectableRows.map((r) => String(keyFn(r)));
    if (!pageIds.length) return;
    setSelectedIds((prev) => {
      const set = new Set(prev.map(String));
      const allIn = pageIds.every((id) => set.has(id));
      if (allIn) {
        pageIds.forEach((id) => set.delete(id));
      } else {
        pageIds.forEach((id) => set.add(id));
      }
      return [...set];
    });
  }

  useEffect(() => {
    if (!showSelection) {
      setSelectedIds([]);
      return;
    }
    if (pagination && preserveSelectionAcrossPages) return;
    const allowed = new Set(
      ((pagination ? displayRows : rows) || [])
        .filter((r) => (typeof isRowSelectableFn === "function" ? isRowSelectableFn(r) : true))
        .map((r) => String(keyFn(r)))
    );
    setSelectedIds((prev) => {
      const next = prev.map(String).filter((id) => allowed.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [showSelection, rows, displayRows, isRowSelectableFn, keyFn, pagination, preserveSelectionAcrossPages]);

  useEffect(() => {
    if (typeof onSelectionChange === "function") onSelectionChange(selectedIds);
  }, [selectedIds, onSelectionChange]);

  function isEditableEl(el) {
    const node = el;
    if (!node) return false;
    const tag = String(node.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (node.isContentEditable) return true;
    return false;
  }

  /** Main page body: list pages can use Enter to add without focusing the table. */
  function isAppMainSurface(el) {
    if (!el) return true;
    if (el === document.body || el === document.documentElement) return true;
    return Boolean(el.closest?.("[data-app-main]"));
  }

  function isEnterDelegatedToInteractive(el) {
    if (!el?.closest) return false;
    return Boolean(el.closest("button, a[href], [role='button'], [data-skip-table-enter='true']"));
  }

  function isKeyboardBlocked() {
    if (document.querySelector(".cmRoot, .mcm")) return true;
    if (document.querySelector('.udpRoot[aria-hidden="false"]')) return true;
    if (document.querySelector('[role="dialog"][aria-hidden="false"]')) return true;
    if (document.querySelector('[role="listbox"]')) return true;
    return false;
  }

  function useTableShortcuts({
    enabled,
    wrapRef,
    searchRef,
    rowIds,
    onCreate,
    onOpenById,
    onDeleteById,
    primaryDisabled,
    tableControlActive,
    rowKeyboardEngaged,
    setRowKeyboardEngaged,
    canOpenRow,
    canDeleteRow
  }) {
    const [kbdId, setKbdId] = useState("");

    useEffect(() => {
      if (!enabled) return;
      if (!rowIds.length) {
        setKbdId("");
        return;
      }
      if (kbdId && rowIds.includes(String(kbdId))) return;
      setKbdId(String(rowIds[0]));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, rowIds.join("|")]);

    const move = useCallback(
      (dir) => {
        if (!rowIds.length) return;
        setRowKeyboardEngaged(true);
        const curIdx = kbdId ? rowIds.indexOf(String(kbdId)) : -1;
        const nextIdx = Math.max(0, Math.min(rowIds.length - 1, (curIdx >= 0 ? curIdx : 0) + dir));
        setKbdId(String(rowIds[nextIdx]));
      },
      [kbdId, rowIds, setRowKeyboardEngaged]
    );

    useEffect(() => {
      if (!enabled) return;
      function onKeyDown(e) {
        // Modals / drawers / popups own keyboard.
        if (isKeyboardBlocked()) return;

        const active = document.activeElement;
        if (isEditableEl(active)) return;

        const wrap = wrapRef.current;
        if (!wrap) return;

        const inTable = active ? wrap.contains(active) : false;
        const inMain = isAppMainSurface(active);
        if (!(inTable || inMain)) return;
        if (active?.closest?.(".sidebar")) return;

        // Search focus:
        // - Ctrl/Cmd+F (works when table is focused; prevents browser find)
        // - Alt+F (browser-safe alternative)
        const keyLower = String(e.key || "").toLowerCase();
        if (((e.ctrlKey || e.metaKey) && keyLower === "f") || (e.altKey && keyLower === "f")) {
          e.preventDefault();
          const inp = searchRef.current;
          if (inp && typeof inp.focus === "function") {
            inp.focus();
            inp.select?.();
          }
          return;
        }

        // Create: Alt+N or Ctrl/Cmd+Shift+N (sidebar nav uses F-keys, not Alt+letter)
        if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && keyLower === "n") {
          if (!onCreate || primaryDisabled) return;
          e.preventDefault();
          onCreate();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && keyLower === "n") {
          if (!onCreate || primaryDisabled) return;
          e.preventDefault();
          onCreate();
          return;
        }

        if ((e.key === "Enter" || e.key === "Delete" || e.key === "Backspace") && !tableControlActive) {
          return;
        }

        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          if (!rowIds.length) return;
          e.preventDefault();
          if (e.key === "ArrowDown") move(1);
          else move(-1);
          return;
        }
        if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
          if (isEnterDelegatedToInteractive(active)) return;
          // Sortable headers use Enter/Space locally
          if (active?.closest?.("thead")) return;
          if (rowKeyboardEngaged && canOpenRow && kbdId) {
            e.preventDefault();
            onOpenById(String(kbdId));
            return;
          }
          if (onCreate && !primaryDisabled) {
            e.preventDefault();
            onCreate();
            return;
          }
          return;
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          if (!rowKeyboardEngaged || !canDeleteRow || !onDeleteById || !kbdId) return;
          if (isEnterDelegatedToInteractive(active)) return;
          e.preventDefault();
          onDeleteById(String(kbdId));
        }
      }

      document.addEventListener("keydown", onKeyDown, true);
      return () => document.removeEventListener("keydown", onKeyDown, true);
    }, [
      enabled,
      wrapRef,
      searchRef,
      move,
      rowIds,
      kbdId,
      onCreate,
      onOpenById,
      onDeleteById,
      primaryDisabled,
      tableControlActive,
      rowKeyboardEngaged,
      canOpenRow,
      canDeleteRow,
      setRowKeyboardEngaged
    ]);

    return { kbdId, setKbdId };
  }

  const wrapRef = useRef(null);
  const searchRef = useRef(null);
  const [controlZone, setControlZone] = useState("table"); // "sidebar" | "table"
  /** True after user clicks a data row or uses ↑/↓ row navigation; false when clicking table chrome / empty area  Enter then opens Add. */
  const [rowKeyboardEngaged, setRowKeyboardEngaged] = useState(false);

  const rowIds = useMemo(() => (displayRows || []).map((r) => String(keyFn(r))), [displayRows, keyFn]);

  const onOpenById = useCallback(
    (id) => {
      const row = (displayRows || []).find((r) => String(keyFn(r)) === String(id));
      if (row) onRowClick?.(row);
    },
    [displayRows, keyFn, onRowClick]
  );

  const onDeleteById = useCallback(
    (id) => {
      if (!onRowDelete) return;
      const row = (displayRows || []).find((r) => String(keyFn(r)) === String(id));
      if (row) onRowDelete(row);
    },
    [displayRows, keyFn, onRowDelete]
  );

  const { kbdId, setKbdId } = useTableShortcuts({
    enabled: true,
    wrapRef,
    searchRef,
    rowIds,
    onCreate: primaryAction?.onClick,
    onOpenById,
    onDeleteById,
    primaryDisabled: Boolean(primaryAction?.disabled),
    tableControlActive: controlZone === "table",
    rowKeyboardEngaged,
    setRowKeyboardEngaged,
    canOpenRow: typeof onRowClick === "function",
    canDeleteRow: typeof onRowDelete === "function"
  });

  // Keep focus-zone state in sync with user intent.
  useEffect(() => {
    function onFocusIn(e) {
      const t = e.target;
      if (t?.closest?.(".sidebar")) setControlZone("sidebar");
      else if (wrapRef.current?.contains?.(t)) setControlZone("table");
    }
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  // Clicking in main content area transfers control from sidebar to this table.
  useEffect(() => {
    function onPointerDown(e) {
      if (isKeyboardBlocked()) return;
      const t = e.target;
      if (!t?.closest) return;
      if (t.closest(".sidebar")) {
        setControlZone("sidebar");
        return;
      }
      if (isEditableEl(t)) return;
      if (t.closest("[role='dialog'], .cmRoot, .udpRoot, .userMenu")) return;
      const inMain = t.closest("[data-app-main]");
      if (!inMain) return;
      const wrap = wrapRef.current;
      if (!wrap) return;

      setControlZone("table");
      const dataRow = t.closest("tbody tr.tblRow:not(.tblRow_skel)");
      if (t.closest(".tblScroller")) {
        if (dataRow) setRowKeyboardEngaged(true);
        else setRowKeyboardEngaged(false);
      }
      if (!rowIds.length) return;
      if (!kbdId || !rowIds.includes(String(kbdId))) setKbdId(String(rowIds[0]));
      requestAnimationFrame(() => {
        try {
          wrap.focus({ preventScroll: true });
        } catch {
          wrap.focus?.();
        }
      });
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [rowIds, kbdId, setKbdId]);

  const activeFilterCount = useMemo(() => {
    const list = filterList || [];
    let n = 0;
    for (const f of list) {
      const v = f?.value;
      const s = String(v ?? "").trim();
      if (!s) continue;
      // common sentinel values
      if (s === "ALL" || s === "all" || s === "ANY" || s === "any") continue;
      n += 1;
    }
    return n;
  }, [filterList]);

  const mobileActions = useMemo(() => {
    const out = [];
    pushMobileActionFromNode(extraHeaderActions, out);
    if (primaryAction?.onClick) {
      out.push({
        key: `primary_${primaryAction.label || "Create"}`,
        label: primaryAction.label || "Create",
        icon: <IconPlus />,
        variant: "primary",
        disabled: Boolean(primaryAction.disabled),
        onClick: primaryAction.onClick
      });
    }
    return out;
  }, [extraHeaderActions, primaryAction]);

  const controls = (
    <div className={`tblTools ${controlsPlacement === "top" ? "tblTools_top" : ""}`}>
      <div className="tblToolsRow">
        {controlsPlacement === "top" && countText ? (
          <div className="tblKpi tblKpi_toolbar" aria-live="polite">
            {loadingFromCountText
              ? String(Array.isArray(rows) ? rows.length : 0)
              : String(countText).split(/\s+/)[0]}
          </div>
        ) : null}
        <TableSearch
          value={search || ""}
          onChange={(v) => onSearchChange?.(v)}
          icon={<Search aria-hidden="true" size={18} strokeWidth={2.2} />}
          onClear={() => onSearchChange?.("")}
        />

        {!isMobile ? filterList.map((f, idx) => <TableToolbarFilterSlot key={f.id || f.label || String(idx)} filter={f} />) : null}

        {controlsPlacement === "top" && !isMobile && (extraHeaderActions || primaryAction) ? (
          <div className="tblToolsRowActions">
            {extraHeaderActions}
            {primaryAction ? (
              <AppButton
                className="tblPrimary"
                variant="primary"
                size="sm"
                disabled={Boolean(primaryAction.disabled)}
                onClick={primaryAction.onClick}
                icon={<IconPlus />}
              >
                {primaryAction.label || "Create"}
              </AppButton>
            ) : null}
          </div>
        ) : null}

        {isMobile && filterList.length ? (
          <button
            type="button"
            className={`tblFilterBtn ${activeFilterCount ? "tblFilterBtn_on" : ""}`.trim()}
            onClick={() => setMobileFiltersOpen(true)}
            aria-label="Open filters"
          >
            <span className="tblFilterBtnIcon" aria-hidden="true">
              <IconTableFunnel />
            </span>
            <span className="tblFilterBtnText">Filters</span>
            {activeFilterCount ? <span className="tblFilterBtnBadge">{activeFilterCount}</span> : null}
          </button>
        ) : null}

        {isMobile && mobileActions.length ? (
          <button type="button" className="tblActionBtn" onClick={() => setMobileActionsOpen(true)} aria-label="Open actions">
            <span className="tblFilterBtnIcon" aria-hidden="true">
              <IconDots />
            </span>
            <span className="tblFilterBtnText">Actions</span>
            <span className="tblActionBtnCount" aria-hidden="true">
              {mobileActions.length}
            </span>
          </button>
        ) : null}

        {/* Columns icon — always last/rightmost */}
        {showColumnCustomizer ? (
          <div className="tblColsWrap">
            <button
              ref={colsBtnRef}
              type="button"
              className="tblFilterBtn tblColsBtn"
              onClick={() => setColumnSettingsOpen((v) => !v)}
              aria-label="Choose visible columns"
              aria-expanded={columnSettingsOpen}
            >
              <span className="tblFilterBtnIcon" aria-hidden="true">
                <IconSettings />
              </span>
            </button>

            {!isMobile && columnSettingsOpen ? (
              <div className="tblColsPop" ref={colsPopRef} role="dialog" aria-label="Choose columns">
                <div className="tblColsPopHead">
                  <span className="tblColsPopTitle">Columns</span>
                  <button type="button" className="tblColsPopReset" onClick={resetColumnVisibility}>
                    Reset
                  </button>
                </div>
                <div className="tblColSettingsList tblColSettingsList_pop">
                  {customizableCols.map((c) => {
                    const id = String(c.id);
                    const visible = !hiddenColumnIds.has(id);
                    const visibleCount = customizableCols.filter((x) => !hiddenColumnIds.has(String(x.id))).length;
                    const isOnlyRemainingVisible = visible && visibleCount <= 1;
                    return (
                      <label key={id} className="tblColSettingsRow">
                        <input
                          type="checkbox"
                          className="tblColSettingsCheck"
                          checked={visible}
                          disabled={isOnlyRemainingVisible}
                          onChange={() => toggleColumnHidden(id)}
                          aria-label={`Show column ${String(c.header || id)}`}
                        />
                        <span className="tblColSettingsLabel">{c.header || id}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {isMobile && mobileActions.length ? (
        <CommonModal
          open={mobileActionsOpen}
          onClose={() => setMobileActionsOpen(false)}
          title="Actions"
          icon={IconDots}
          size="md"
          drawer={false}
          footer={
            <div className="tblFilterSheetFoot">
              <AppButton variant="secondary" size="md" onClick={() => setMobileActionsOpen(false)}>
                Close
              </AppButton>
              <AppButton
                variant="primary"
                size="md"
                onClick={() => setMobileActionsOpen(false)}
                aria-label="Done"
              >
                Done
              </AppButton>
            </div>
          }
        >
          <div className="tblActionSheet">
            {mobileActions.map((a) => (
              <AppButton
                key={a.key}
                variant={a.variant === "primary" ? "primary" : "secondary"}
                size="md"
                disabled={Boolean(a.disabled)}
                icon={a.icon}
                onClick={() => {
                  setMobileActionsOpen(false);
                  a.onClick?.();
                }}
              >
                {a.label}
              </AppButton>
            ))}
          </div>
        </CommonModal>
      ) : null}

      {isMobile && filterList.length ? (
        <CommonModal
          open={mobileFiltersOpen}
          onClose={() => setMobileFiltersOpen(false)}
          title="Filters"
          icon={IconTableFunnel}
          size="md"
          drawer={false}
          footer={
            <div className="tblFilterSheetFoot">
              <AppButton variant="secondary" size="md" onClick={() => setMobileFiltersOpen(false)}>
                Close
              </AppButton>
              <AppButton variant="primary" size="md" onClick={() => setMobileFiltersOpen(false)}>
                Apply
              </AppButton>
            </div>
          }
        >
          <TableFilterSheetBody filterList={filterList} />
        </CommonModal>
      ) : null}

      {showColumnCustomizer && isMobile ? (
        <CommonModal
          open={columnSettingsOpen}
          onClose={() => setColumnSettingsOpen(false)}
          drawer={false}
          title="Columns"
          icon={<IconSettings />}
          size="md"
          footer={
            <div className="tblColSettingsFoot">
              <AppButton variant="secondary" size="md" type="button" data-cm-cancel="true" onClick={resetColumnVisibility}>
                Reset
              </AppButton>
              <AppButton variant="primary" size="md" type="button" data-cm-primary="true" onClick={() => setColumnSettingsOpen(false)}>
                Done
              </AppButton>
            </div>
          }
        >
          <div className="tblColSettingsBody">
            <p className="tblColSettingsHint">Hidden columns stay saved on this device.</p>
            <div className="tblColSettingsList" role="group" aria-label="Visible columns">
              {customizableCols.map((c) => {
                const id = String(c.id);
                const visible = !hiddenColumnIds.has(id);
                const visibleCount = customizableCols.filter((x) => !hiddenColumnIds.has(String(x.id))).length;
                const isOnlyRemainingVisible = visible && visibleCount <= 1;
                return (
                  <label key={id} className="tblColSettingsRow">
                    <input
                      type="checkbox"
                      className="tblColSettingsCheck"
                      checked={visible}
                      disabled={isOnlyRemainingVisible}
                      onChange={() => toggleColumnHidden(id)}
                      aria-label={`Show column ${String(c.header || id)}`}
                    />
                    <span className="tblColSettingsLabel">{c.header || id}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </CommonModal>
      ) : null}
    </div>
  );

  return (
    <div
      ref={wrapRef}
      className={`tbl ${compact ? "tbl_compact" : ""} ${isLoading ? "tbl_loading" : ""}`}
      tabIndex={-1}
      data-ct-control-zone={controlZone}
      aria-label="Data table"
    >
      <header className={`tblHead ${controlsPlacement === "top" ? "tblHead_controlsTop" : ""}`}>
        {controlsPlacement === "top" ? (
          <>
            <div className="tblHeadTop">
              {(title || subtitle) ? (
                <div className="tblHeadMain">
                  <div className="tblTitles">
                    {title ? <h2 className="tblTitle">{title}</h2> : null}
                    {subtitle ? <p className="tblSub">{subtitle}</p> : null}
                  </div>
                </div>
              ) : null}
              <div className="tblHeadFilters">{controls}</div>
            </div>
          </>
        ) : (
          <>
            <div className="tblHeadMain">
              <div className="tblTitles">
                {title ? <h2 className="tblTitle">{title}</h2> : null}
                {subtitle ? <p className="tblSub">{subtitle}</p> : null}
              </div>
            </div>

            {!isMobile ? (
              <div className="tblHeadActions">
                <div className="tblHeadToolbarInner tblHeadToolbarInner_below">
                  {extraHeaderActions}
                  {primaryAction ? (
                    <AppButton
                      className="tblPrimary"
                      variant="primary"
                      size="sm"
                      disabled={Boolean(primaryAction.disabled)}
                      onClick={primaryAction.onClick}
                      icon={<IconPlus />}
                    >
                      {primaryAction.label || "Create"}
                    </AppButton>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </header>

      {controlsPlacement === "below" ? controls : null}

      <section className="tblCard">
        <div className="tblCardTop">{isLoading ? <CommonLoading variant="bar" /> : null}</div>
        {(showBulk || (Array.isArray(bulkActions) && bulkActions.length > 0)) && selectedIds.length > 0 ? (
          <div className="tblBulk" role="status" aria-live="polite" aria-label={`${selectedIds.length} rows selected`}>
            <div className="tblBulkLead">
              <div className="tblBulkMeta">
                <span className="tblBulkCount">{selectedIds.length}</span>
                <span className="tblBulkText">selected</span>
              </div>
            </div>
            <div className="tblBulkRail">
            <div className="tblBulkActions">
              {(Array.isArray(bulkActions) ? bulkActions : [])
                .filter(Boolean)
                .map((a, idx) => {
                  const ico = renderBulkTableIcon(a.icon);
                  return (
                    <button
                      key={a.id || a.label || String(idx)}
                      type="button"
                      className={`tblBulkBtn ${a.danger ? "tblBulkBtn_danger" : "tblBulkBtn_neutral"}`}
                      disabled={Boolean(bulkBusy) || Boolean(a.disabled)}
                      onClick={() => a.onClick?.([...selectedIds])}
                    >
                      {ico ? (
                        <span className="tblBulkBtnIcon" aria-hidden="true">
                          {ico}
                        </span>
                      ) : null}
                      <span className="tblBulkBtnText">{a.label || "Action"}</span>
                    </button>
                  );
                })}
              {showBulk ? (
                <button
                  type="button"
                  className={`tblBulkBtn ${bulkDelete.danger === false ? "tblBulkBtn_neutral" : "tblBulkBtn_danger"}`}
                  disabled={bulkBusy || bulkDelete.disabled}
                  onClick={() => setBulkConfirmOpen(true)}
                >
                  {(() => {
                    const ico = renderBulkTableIcon(bulkDelete.icon != null ? bulkDelete.icon : inferBulkDeleteIconName(bulkDelete));
                    return ico ? (
                      <span className="tblBulkBtnIcon" aria-hidden="true">
                        {ico}
                      </span>
                    ) : null;
                  })()}
                  <span className="tblBulkBtnText">
                    {bulkDelete.label || "Delete"} ({selectedIds.length})
                  </span>
                </button>
              ) : null}
            </div>
            </div>
          </div>
        ) : null}
        <div className="tblScroller" role="region" aria-label="Table">
          <table className="tblTable" aria-busy={isLoading ? "true" : "false"}>
            <thead className="tblThead">
              <tr>
                {showSelection ? (
                  <th className="tblTh tblTh_check" scope="col">
                    <span className="tblCheck tblCheck_head">
                      <input
                        className="tblCheckInput"
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allPageSelected}
                        disabled={isLoading || !displaySelectableRows.length}
                        onChange={toggleSelectAllOnPage}
                        aria-label="Select all rows on this page"
                      />
                    </span>
                  </th>
                ) : null}
                {showRowNumbers ? <th className="tblTh tblTh_num">#</th> : null}
                {visibleColumns.map((c) => {
                  const sortable = c.sortable === false ? false : Boolean(onSortChange);
                  const active = String(sort?.by || "") === String(c.id || "");
                  const dir = active ? String(sort?.dir || "") : "";
                  return (
                    <th
                      key={c.id}
                      className={`tblTh ${c.align === "right" ? "tblTh_right" : ""} ${sortable ? "tblTh_sortable" : ""} ${
                        active ? "tblTh_sorted" : ""
                      }`}
                      onClick={() => {
                        if (!sortable) return;
                        const nextBy = String(c.id || "");
                        const nextDir = active ? (String(sort?.dir || "").toLowerCase() === "asc" ? "desc" : "asc") : "asc";
                        onSortChange?.({ by: nextBy, dir: nextDir });
                      }}
                      role={sortable ? "button" : undefined}
                      tabIndex={sortable ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (!sortable) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          const nextBy = String(c.id || "");
                          const nextDir = active ? (String(sort?.dir || "").toLowerCase() === "asc" ? "desc" : "asc") : "asc";
                          onSortChange?.({ by: nextBy, dir: nextDir });
                        }
                      }}
                    >
                      <span className="tblThInner">
                        <span className="tblThText">{c.header}</span>
                        {sortable ? (
                          <SortGlyph dir={dir} />
                        ) : null}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                skelRows.map((r) => (
                  <tr key={r.key} className="tblRow tblRow_skel">
                    {r.cells.map((c, idx) => (
                      <td key={idx} className={`tblTd ${idx === r.cells.length - 1 ? "tblTd_right" : ""}`}>
                        <SkeletonLine width={`${c.w}%`} height={12} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : displayRows?.length ? (
                displayRows.map((r, idx) => {
                  const id = String(keyFn(r));
                  const active = (selectedId && String(selectedId) === id) || (kbdId && String(kbdId) === id);
                  const extraClass = rowClassName ? String(rowClassName(r) || "") : "";
                  return (
                    <tr
                      key={id}
                      className={`tblRow ${active ? "tblRow_active" : ""} ${extraClass}`}
                      aria-selected={active ? "true" : "false"}
                      onTouchStart={(e) => {
                        const t = e.touches?.[0];
                        if (!t) return;
                        rowTouchRef.current = { x: t.clientX, y: t.clientY, moved: false };
                      }}
                      onTouchMove={(e) => {
                        const ref = rowTouchRef.current;
                        if (!ref) return;
                        const t = e.touches?.[0];
                        if (!t) return;
                        const dx = Math.abs(t.clientX - ref.x);
                        const dy = Math.abs(t.clientY - ref.y);
                        // ~10px movement threshold = treat as scroll, not tap
                        if (dx > 10 || dy > 10) ref.moved = true;
                      }}
                      onClick={(e) => {
                        // If the user was scrolling (touch moved beyond threshold)
                        // ignore the click so the page can scroll smoothly.
                        const ref = rowTouchRef.current;
                        if (ref && ref.moved) {
                          rowTouchRef.current = null;
                          return;
                        }
                        rowTouchRef.current = null;
                        // Skip click when the user is selecting text
                        try {
                          const sel = typeof window !== "undefined" ? window.getSelection?.() : null;
                          if (sel && String(sel.toString() || "").length > 0) return;
                        } catch {
                          // ignore
                        }
                        // Don't fire row click when interacting with a control inside the row
                        const target = e.target;
                        if (target?.closest && target.closest('button, a, input, select, textarea, [role="button"], [data-row-click-skip="true"]')) {
                          return;
                        }
                        setControlZone("table");
                        setRowKeyboardEngaged(true);
                        setKbdId(id);
                        onRowClick?.(r);
                      }}
                    >
                      {showSelection ? (
                        <td
                          className="tblTd tblTd_check"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {(typeof isRowSelectableFn === "function" ? isRowSelectableFn(r) : true) ? (
                            <span className="tblCheck">
                              <input
                                className="tblCheckInput"
                                type="checkbox"
                                checked={selectedIds.map(String).includes(id)}
                                onChange={() => toggleSelected(id)}
                                aria-label={`Select row ${rowNumberOffset + idx + 1}`}
                              />
                            </span>
                          ) : (
                            <span aria-hidden="true" />
                          )}
                        </td>
                      ) : null}
                      {showRowNumbers ? (
                        <td className="tblTd tblTd_num" data-label="#">
                          {rowNumberOffset + idx + 1}
                        </td>
                      ) : null}
                      {visibleColumns.map((c) => {
                        const cellNode = c.render
                          ? c.id === "actions"
                            ? normalizeActionNode(c.render(r, { initials, roleClass, statusClass }))
                            : c.render(r, { initials, roleClass, statusClass })
                          : null;
                        const emptyPrimitive =
                          cellNode == null ||
                          cellNode === "" ||
                          (typeof cellNode === "string" && !cellNode.trim());
                        return (
                          <td
                            key={c.id}
                            data-label={String(c.header || c.id || "")}
                            data-primary={c.mobilePrimary ? "true" : undefined}
                            className={`tblTd ${c.align === "right" ? "tblTd_right" : ""} ${c.id === "actions" ? "tblTd_actions" : ""} ${
                              Number(c.mobilePriority || 1) >= 3 ? "tblTd_mobileHidden" : ""
                            } ${emptyPrimitive ? "tblTd_empty" : ""}`.trim()}
                          >
                            {c.id === "actions" ? (
                              <div className="tblActionsCell">{cellNode}</div>
                            ) : (
                              <div className="tblCellVal">{cellNode}</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="tblEmpty" colSpan={visibleColumns.length + (showRowNumbers ? 1 : 0) + (showSelection ? 1 : 0)}>
                    <div className="tblEmptyTitle">No results</div>
                    <div className="tblEmptySub">Try adjusting your search, filters, or date range.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {effectivePagination && !isLoading ? (
          <div className="tblFoot" role="navigation" aria-label="Pagination">
            <div className="tblFootLeft">
              <label className="tblPageSize">
                <span className="tblPageSizeLabel">Rows</span>
                <select
                  className="tblPageSizeSelect"
                  value={safePageSize}
                  onChange={(e) => {
                    const next = Math.max(1, Math.min(100, Number(e.target.value) || 10));
                    if (onPageSizeChange) {
                      onPageSizeChange(next);
                    } else {
                      setLocalPageSize(next);
                      if (useLocalPagination) setLocalPage(1);
                    }
                  }}
                  aria-label="Rows per page"
                >
                  {(Array.isArray(pageSizeOptions) ? pageSizeOptions : [10, 20, 50, 100]).map((n) => (
                    <option key={String(n)} value={Number(n)}>
                      {Number(n)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="tblFootMeta" aria-live="polite">
                {Number(effectivePagination.totalItems) > 0 &&
                effectivePagination.from != null &&
                effectivePagination.to != null ? (
                  <span>
                    Showing <strong>{effectivePagination.from}</strong>–<strong>{effectivePagination.to}</strong> of{" "}
                    <strong>{effectivePagination.totalItems}</strong>
                  </span>
                ) : hasRows ? (
                  <span>
                    <strong>{displayRows.length}</strong> {displayRows.length === 1 ? "row" : "rows"} on this page
                  </span>
                ) : (
                  <span>No results</span>
                )}
                {!isMobile && effectivePagination.totalPages ? (
                  <>
                    <span className="tblFootSep" aria-hidden="true">
                      ·
                    </span>
                    <span className="tblFootPages">
                      Page <strong>{effectivePagination.page}</strong> / <strong>{effectivePagination.totalPages}</strong>
                    </span>
                  </>
                ) : null}
              </div>
            </div>

            <div className="tblFootRight">
              <div className="tblPager" aria-label="Pagination controls">
                <button
                  className="tblPagerBtn"
                  type="button"
                  onClick={effectivePagination.onPrev}
                  disabled={effectivePagination.page <= 1}
                  aria-label="Previous page"
                >
                  <IconChevronLeft />
                </button>
                {isMobile ? (
                  <span className="tblPagerCur" aria-current="page">
                    <span className="tblSrOnly">
                      Page {effectivePagination.page} of {effectivePagination.totalPages}
                    </span>
                    <span className="tblPagerCurInner" aria-hidden="true">
                      <span className="tblPagerCurNum">{effectivePagination.page}</span>
                      <span className="tblPagerCurSep">/</span>
                      <span className="tblPagerCurTot">{effectivePagination.totalPages}</span>
                    </span>
                  </span>
                ) : (
                  pageButtons.map((p) => (
                    <button
                      key={p}
                      className={`tblPageBtn ${Number(effectivePagination.page) === p ? "tblPageBtn_active" : ""}`}
                      type="button"
                      onClick={() => effectivePagination.onPage?.(p)}
                      aria-current={Number(effectivePagination.page) === p ? "page" : undefined}
                      aria-label={`Page ${p}`}
                    >
                      {p}
                    </button>
                  ))
                )}
                <button
                  className="tblPagerBtn"
                  type="button"
                  onClick={effectivePagination.onNext}
                  disabled={effectivePagination.page >= effectivePagination.totalPages}
                  aria-label="Next page"
                >
                  <IconChevronRight />
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {showBulk ? (
        <ConfirmDialog
          open={bulkConfirmOpen}
          title={bulkDelete.confirmTitle || "Delete selected?"}
          message={
            typeof bulkDelete.confirmMessage === "function"
              ? bulkDelete.confirmMessage(selectedIds.length, selectedIds)
              : bulkDelete.confirmMessage || `Delete ${selectedIds.length} selected record(s)?`
          }
          confirmLabel={bulkDelete.confirmLabel || bulkDelete.label || "Delete"}
          danger={bulkDelete.danger !== false}
          busy={bulkBusy}
          onClose={() => (bulkBusy ? null : setBulkConfirmOpen(false))}
          onConfirm={async () => {
            if (!selectedIds.length) return;
            setBulkBusy(true);
            try {
              await bulkDelete.onDelete([...selectedIds]);
              setSelectedIds([]);
              setBulkConfirmOpen(false);
            } finally {
              setBulkBusy(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

