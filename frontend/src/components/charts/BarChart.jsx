import ChartFrame from "./ChartFrame.jsx";

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/**
 * BarChart
 * groups: [{ xLabel, series: [{ id,label,color,y }] }]
 * variant: "GROUPED" | "STACKED"
 */
export default function BarChart({
  height = 180,
  groups = [],
  variant = "GROUPED",
  yFormatter,
}) {
  const safeGroups = Array.isArray(groups) ? groups : [];
  const maxY = Math.max(
    1,
    ...safeGroups.map((g) => {
      const vals = (g.series || []).map((s) => n(s.y));
      if (variant === "STACKED") return vals.reduce((a, b) => a + b, 0);
      return Math.max(0, ...vals);
    })
  );

  return (
    <ChartFrame
      height={height}
      getTooltip={(p) => {
        const w = Number(p?.w || 0);
        if (!(w > 0)) return null;
        const ix = Math.round((Number(p?.x || 0) / w) * Math.max(0, safeGroups.length - 1));
        const g = safeGroups[Math.max(0, Math.min(safeGroups.length - 1, ix))] || null;
        if (!g) return null;
        return {
          title: String(g.xLabel || ""),
          lines: (g.series || []).map((s) => ({
            label: s.label,
            value: yFormatter ? yFormatter(n(s.y)) : n(s.y),
            color: s.color
          }))
        };
      }}
    >
      {({ innerW, innerH }) => {
        const nG = Math.max(1, safeGroups.length);
        const bw = innerW / nG;
        const pad = Math.min(10, bw * 0.16);

        return (
          <>
            <g className="chGrid">
              {[0.25, 0.5, 0.75].map((t) => (
                <line key={t} x1="0" y1={innerH * t} x2={innerW} y2={innerH * t} />
              ))}
            </g>
            {safeGroups.map((g, i) => {
              const x0 = i * bw + pad;
              const sArr = Array.isArray(g.series) ? g.series : [];
              const inner = Math.max(1, bw - pad * 2);
              const colW = variant === "GROUPED" ? inner / Math.max(1, sArr.length) : inner;
              let stackY = innerH;
              return (
                <g key={`${g.xLabel || i}`}>
                  {sArr.map((s, j) => {
                    const v = n(s.y);
                    const h = (v / maxY) * (innerH - 8);
                    const rx = 3;
                    const x = variant === "GROUPED" ? x0 + j * colW : x0;
                    const y = variant === "GROUPED" ? innerH - h : stackY - h;
                    if (variant === "STACKED") stackY -= h;
                    return (
                      <rect
                        key={String(s.id || s.label || j)}
                        x={x + 1}
                        y={y}
                        width={Math.max(2, colW - 3)}
                        height={Math.max(1, h)}
                        rx={rx}
                        fill={s.color}
                        opacity="0.26"
                        stroke={s.color}
                        strokeWidth="1.2"
                      />
                    );
                  })}
                </g>
              );
            })}
          </>
        );
      }}
    </ChartFrame>
  );
}

