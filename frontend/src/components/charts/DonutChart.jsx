import { useMemo, useState } from "react";
import ChartFrame from "./ChartFrame.jsx";

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/**
 * DonutChart
 * slices: [{ id,label,value,color }]
 */
export default function DonutChart({
  height = 180,
  slices = [],
  valueFormatter,
  centerLabel,
}) {
  const safe = Array.isArray(slices) ? slices : [];
  const total = Math.max(1, safe.reduce((a, s) => a + n(s.value), 0));
  const [hovered, setHovered] = useState(null);

  const pickSlice = useMemo(() => {
    return (p) => {
      if (!p?.w || !p?.h) return null;
      const size = Math.min(p.w, p.h);
      const cx = p.w / 2;
      const cy = p.h / 2;
      const rOuter = Math.max(18, size * 0.32) + Math.max(10, (Math.max(18, size * 0.32)) * 0.38);
      const dx = (p.x || 0) - cx;
      const dy = (p.y || 0) - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > rOuter) return null;
      const ang = (Math.atan2(dy, dx) + Math.PI * 2 + Math.PI / 2) % (Math.PI * 2);
      let acc = 0;
      for (const s of safe) {
        const span = (n(s.value) / total) * (Math.PI * 2);
        if (ang >= acc && ang < acc + span) return s;
        acc += span;
      }
      return null;
    };
  }, [safe, total]);

  return (
    <ChartFrame
      height={height}
      padding={{ top: 10, right: 10, bottom: 10, left: 10 }}
      onPointerChange={(p) => setHovered(pickSlice(p))}
      getTooltip={() => {
        const hit = hovered;
        if (!hit) return null;
        return {
          title: String(hit.label || ""),
          lines: [
            { label: "Amount", value: valueFormatter ? valueFormatter(n(hit.value)) : n(hit.value), color: hit.color },
            { label: "Share", value: `${Math.round((n(hit.value) / total) * 100)}%`, color: hit.color }
          ]
        };
      }}
    >
      {({ innerW, innerH, pointer }) => {
        const size = Math.min(innerW, innerH);
        const cx = innerW / 2;
        const cy = innerH / 2;
        const r = Math.max(18, size * 0.32);
        const stroke = Math.max(10, r * 0.38);
        const C = 2 * Math.PI * r;
        let offset = 0;

        const pointerSlice = hovered;

        return (
          <>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth={stroke} />
            {safe.map((s) => {
              const dash = (C * n(s.value)) / total;
              const el = (
                <circle
                  key={String(s.id || s.label)}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${Math.max(0, C - dash)}`}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${cx} ${cy})`}
                  opacity={pointerSlice && String(pointerSlice.id || pointerSlice.label) !== String(s.id || s.label) ? 0.55 : 0.95}
                />
              );
              offset += dash;
              return el;
            })}
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11" fontWeight="900" fill="var(--color-text-heading)">
              {String(centerLabel || "")}
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle" fontSize="9" fill="var(--color-text-4)" fontWeight="700">
              {pointerSlice ? String(pointerSlice.label || "") : "Total"}
            </text>
          </>
        );
      }}
    </ChartFrame>
  );
}

