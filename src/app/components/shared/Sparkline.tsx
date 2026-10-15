import { useId } from "react";

/**
 * Trend with its own "normal" line. A drop only means something relative to
 * what this source usually does, so the dashed baseline is drawn every time,
 * a flat line at zero reads as "stopped" at a glance without needing the
 * number beside it.
 */
export function Sparkline({
  points,
  baseline,
  color,
  width = 96,
  height = 24,
  label,
}: {
  points: (number | null)[];
  baseline: number;
  color: string;
  width?: number;
  height?: number;
  /** Screen-reader summary, e.g. "Dropped to zero 2 hours ago". */
  label?: string;
}) {
  const uid = useId();
  const values = points.filter((p): p is number => p !== null);
  const max = Math.max(baseline, ...values, 1) * 1.12;
  const n = points.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * width);
  const y = (v: number) => height - 1 - (v / max) * (height - 2);

  // Break the line where there's no data yet rather than drawing it at zero,
  // "not connected yet" and "stopped" are different facts.
  let d = "";
  let pen = false;
  points.forEach((p, i) => {
    if (p === null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)} `;
    pen = true;
  });
  const first = points.findIndex((p) => p !== null);
  const area = first >= 0 && d ? `${d}L${x(n - 1).toFixed(1)},${height} L${x(first).toFixed(1)},${height} Z` : "";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? "Trend"} className="block shrink-0">
      <defs>
        <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        x1="0"
        x2={width}
        y1={y(baseline)}
        y2={y(baseline)}
        stroke="var(--db-neutral-70)"
        strokeOpacity="0.35"
        strokeDasharray="2 3"
        strokeWidth="1"
      />
      {area && <path d={area} fill={`url(#${uid}-fill)`} />}
      {d && <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  );
}
