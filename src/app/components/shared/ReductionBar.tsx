/**
 * The one picture of "how much did rules remove, and which ones": a single
 * bar where the full width is everything received, filled to the share
 * removed, split by rule type. Drawn identically on the Savings page (priced
 * in dollars) and in a source's Data flow (measured in data), so the same
 * 38% looks the same wherever someone meets it first.
 */
export interface ReductionSegment {
  label: string;
  /** Share of everything received this rule type removes, 0–1. */
  share: number;
}

/** One colour per rule type, fixed everywhere (Savings, the drawer, any
 * source or destination), so "Field trimming" is always the same colour.
 * Deliberately clear of the status colours (red, amber, green) so a
 * segment never reads as a health state. */
const RULE_TYPE_COLOR: Record<string, string> = {
  "Duplicate & heartbeat suppression": "#4a94f9",
  "Field trimming": "#53d9ff",
  "Debug-noise trimming": "#a78bfa",
  "Payload sampling": "#f472b6",
  "Compliance-safe exclusions": "#94a3b8",
};
const FALLBACK = ["#4a94f9", "#53d9ff", "#a78bfa", "#f472b6", "#94a3b8", "#fbbf24"];
export const ruleTypeColor = (label: string, i = 0) => RULE_TYPE_COLOR[label] ?? FALLBACK[i % FALLBACK.length];

export function SegmentSwatch({ label, index = 0 }: { label: string; index?: number }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: ruleTypeColor(label, index) }} aria-hidden="true" />;
}

export function ReductionBar({ segments, height = 6 }: { segments: ReductionSegment[]; height?: number }) {
  const total = segments.reduce((a, s) => a + s.share, 0);
  return (
    <div
      className="w-full rounded-full bg-muted/30 overflow-hidden flex"
      style={{ height }}
      role="img"
      aria-label={`${Math.round(total * 100)}% removed by rules: ${segments.map((s) => `${s.label} ${Math.round(s.share * 100)}%`).join(", ")}`}
    >
      {segments.map((s, i) => (
        <div
          key={s.label}
          className="h-full"
          style={{
            width: `${s.share * 100}%`,
            background: ruleTypeColor(s.label, i),
            // A hairline between segments so neighbours don't merge.
            boxShadow: i < segments.length - 1 ? "inset -1px 0 0 rgba(10,16,28,0.9)" : undefined,
          }}
          title={`${s.label} · ${Math.round(s.share * 100)}%`}
        />
      ))}
    </div>
  );
}
