import { Link, useLocation } from "react-router-dom";
import { APP_DISPLAY_NAME } from "../constants/brand.js";
import { IconChevronRight } from "./ui/AppIcons.jsx";

function titleFromSegment(seg) {
  const s = String(seg || "").trim();
  if (!s) return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return "Details";
  if (/^\d+$/.test(s)) return "Details";
  return s
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Breadcrumbs
 * - Auto builds crumbs from current URL path.
 * - Optional `labels` map supports custom labels by full path or by segment.
 *
 * `labels` priority:
 * 1) labels[fullPath]  e.g. "/roles-access" => "Roles & Access"
 * 2) labels[segment]   e.g. "roles-access"  => "Roles & Access"
 * 3) derived from segment
 */
export default function Breadcrumbs({ rootLabel = APP_DISPLAY_NAME, rootTo = "/dashboard", labels, hideRoot = false }) {
  const loc = useLocation();
  const pathname = String(loc?.pathname || "/");
  const parts = pathname.split("/").filter(Boolean);

  const crumbs = [];
  let acc = "";
  for (const seg of parts) {
    acc += `/${seg}`;
    const label = labels?.[acc] || labels?.[seg] || titleFromSegment(seg);
    crumbs.push({ to: acc, label });
  }

  return (
    <nav className="hdrCrumb" aria-label="Breadcrumb">
      {!hideRoot ? (
        rootTo ? (
          <Link className="hdrCrumbItem" to={rootTo}>
            {rootLabel}
          </Link>
        ) : (
          <span className="hdrCrumbItem">{rootLabel}</span>
        )
      ) : null}

      {crumbs.map((c, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <span key={c.to} className="hdrCrumbGroup">
            {!hideRoot || idx > 0 ? (
              <span className="hdrCrumbSep" aria-hidden="true">
                <IconChevronRight />
              </span>
            ) : null}
            {isLast ? (
              <span className="hdrCrumbItem hdrCrumbItem_active">{c.label || "Dashboard"}</span>
            ) : (
              <Link className="hdrCrumbItem" to={c.to}>
                {c.label}
              </Link>
            )}
          </span>
        );
      })}

      {!crumbs.length ? <span className="hdrCrumbItem hdrCrumbItem_active">Dashboard</span> : null}
    </nav>
  );
}

