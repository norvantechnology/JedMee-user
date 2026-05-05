import ChartFrame from "./ChartFrame.jsx";

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function smoothPath(points) {
  const pts = Array.isArray(points) ? points : [];
  if (pts.length < 2) return "";
  const d = [`M${pts[0].x},${pts[0].y}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = 0.25;
    d.push(
      `C${p1.x + (p2.x - p0.x) * t},${p1.y + (p2.y - p0.y) * t} ` +
      `${p2.x - (p3.x - p1.x) * t},${p2.y - (p3.y - p1.y) * t} ` +
      `${p2.x},${p2.y}`
    );
  }
  return d.join(" ");
}

/**
 * LineAreaChart
 * series: [{ id, label, color, values: [{ xLabel, y }] }]
 * variant: "LINE" | "AREA"
 */
export default function LineAreaChart({
  height = 180,
  series = [],
  variant = "LINE",
  yFormatter,
}) {
  const maxY = Math.max(1, ...series.flatMap((s) => (s.values || []).map((v) => n(v?.y))));
  const pointsFor = (innerW, innerH, vals) => {
    const arr = Array.isArray(vals) ? vals : [];
    return arr.map((v, i) => ({
      x: (i / Math.max(1, arr.length - 1)) * innerW,
      y: innerH - (n(v?.y) / maxY) * (innerH - 8),
      v,
      i
    }));
  };

  return (
    <ChartFrame
      height={height}
      getTooltip={(p) => {
        const w = p?.x;
        if (w == null) return null;
        const base = series[0]?.values || [];
        const ix = Math.round((w / Math.max(1, (p?.w || 1))) * Math.max(0, base.length - 1));
        const safeIx = Math.max(0, Math.min(base.length - 1, ix));
        const title = String(base?.[safeIx]?.xLabel || "");
        return {
          title,
          lines: series.map((s) => ({
            label: s.label,
            value: yFormatter ? yFormatter(n(s.values?.[safeIx]?.y)) : n(s.values?.[safeIx]?.y),
            color: s.color
          }))
        };
      }}
    >
      {({ innerW, innerH, pointer }) => {
        const px = pointer?.x != null ? Math.max(0, Math.min(innerW, pointer.x - 10)) : null;
        return (
          <>
            <g className="chGrid">
              {[0.25, 0.5, 0.75].map((t) => (
                <line key={t} x1="0" y1={innerH * t} x2={innerW} y2={innerH * t} />
              ))}
            </g>
            {series.map((s) => {
              const pts = pointsFor(innerW, innerH, s.values);
              const d = smoothPath(pts);
              const last = pts[pts.length - 1];
              const area = variant === "AREA" && d ? `${d} L${innerW},${innerH} L0,${innerH} Z` : "";
              const gradId = `grad_${String(s.id || s.label || "s")}`;
              return (
                <g key={String(s.id || s.label)}>
                  {variant === "AREA" && area ? (
                    <>
                      <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
                          <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={area} fill={`url(#${gradId})`} />
                    </>
                  ) : null}
                  {d ? (
                    <path d={d} fill="none" stroke={s.color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  ) : null}
                  {last ? <circle cx={last.x} cy={last.y} r="3.2" fill={s.color} stroke="var(--color-card)" strokeWidth="2" /> : null}
                </g>
              );
            })}
            {px != null ? (
              <line x1={px} y1="0" x2={px} y2={innerH} stroke="color-mix(in srgb, var(--color-border) 70%, transparent)" strokeDasharray="3,3" />
            ) : null}
          </>
        );
      }}
    </ChartFrame>
  );
}

