import { useMemo } from "react";

/**
 * SparklineChart - lightweight inline SVG sparkline for KPI cards.
 * Props:
 *   values   : number[]   - data points
 *   color    : string     - stroke color (CSS var or hex)
 *   height   : number     - SVG height (default 40)
 *   width    : number     - SVG width (default 100)
 *   area     : boolean    - fill area under line (default true)
 *   strokeWidth : number  - line thickness (default 1.8)
 */
export default function SparklineChart({
  values = [],
  color = "var(--color-primary)",
  height = 40,
  width = 100,
  area = true,
  strokeWidth = 1.8,
}) {
  const pts = useMemo(() => {
    const nums = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
    if (nums.length < 2) return null;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const range = max - min || 1;
    const pad = 2;
    const w = width - pad * 2;
    const h = height - pad * 2;
    const points = nums.map((v, i) => ({
      x: pad + (i / (nums.length - 1)) * w,
      y: pad + h - ((v - min) / range) * h,
    }));
    // Smooth catmull-rom path
    const d = [`M${points[0].x},${points[0].y}`];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const t = 0.2;
      d.push(
        `C${p1.x + (p2.x - p0.x) * t},${p1.y + (p2.y - p0.y) * t} ` +
        `${p2.x - (p3.x - p1.x) * t},${p2.y - (p3.y - p1.y) * t} ` +
        `${p2.x},${p2.y}`
      );
    }
    const linePath = d.join(" ");
    const areaPath = area
      ? `${linePath} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`
      : null;
    const last = points[points.length - 1];
    return { linePath, areaPath, last };
  }, [values, width, height, area]);

  if (!pts) return null;

  const uid = useMemo(() => `spk-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      style={{ display: "block", overflow: "visible" }}
    >
      {area && (
        <defs>
          <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {area && pts.areaPath && (
        <path d={pts.areaPath} fill={`url(#${uid})`} />
      )}
      <path
        d={pts.linePath}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* End dot */}
      <circle cx={pts.last.x} cy={pts.last.y} r={2.5} fill={color} />
    </svg>
  );
}