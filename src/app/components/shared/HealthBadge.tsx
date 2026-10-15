import type { HealthState, Severity } from "@/app/data/fleet";
import { ContextualHelpTip } from "./ContextualHelpTip";

/**
 * One vocabulary for source health, used by the dashboard widget, the
 * pipeline table, the source drawer and the sidebar. Six states rather than
 * up/down: "paused" and "learning" exist so planned maintenance and
 * brand-new sources never raise an alarm, a widget that cries wolf gets
 * ignored the day it matters. Color is never the only signal, every state
 * also carries its word.
 */
export const HEALTH_META: Record<
  HealthState,
  { label: string; dot: string; text: string; chip: string; bar: string; description: string }
> = {
  stopped: {
    label: "Stopped",
    dot: "bg-destructive",
    text: "text-destructive",
    chip: "border-destructive/40 bg-destructive/10 text-destructive",
    bar: "var(--db-red)",
    description: "Not sending: no events for longer than this source's normal gap. Raises a critical alert.",
  },
  degraded: {
    label: "Degraded",
    dot: "bg-amber-500",
    text: "text-amber-400",
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    bar: "#f59e0b",
    description: "Below normal: data still arrives, but volume is low, events fail to parse, or delivery is falling behind.",
  },
  recovering: {
    label: "Recovering",
    dot: "bg-info",
    text: "text-info",
    chip: "border-info/40 bg-info/10 text-info",
    bar: "var(--db-teal)",
    description: "Recovering: data is back. Watched for 30 minutes before it's marked healthy, so a flapping source doesn't bounce.",
  },
  paused: {
    label: "Paused",
    dot: "bg-muted-foreground/60",
    text: "text-muted-foreground",
    chip: "border-border bg-muted/20 text-muted-foreground",
    bar: "var(--db-neutral-70)",
    description: "Paused on purpose, for maintenance. No alerts until the pause ends or someone resumes it.",
  },
  learning: {
    label: "Learning",
    dot: "bg-primary",
    text: "text-primary",
    chip: "border-primary/40 bg-primary/10 text-primary",
    bar: "var(--db-blue)",
    description: "Learning: newly connected, still learning its normal volume. Alerts only if it stops completely.",
  },
  healthy: {
    label: "Healthy",
    dot: "bg-success",
    text: "text-success",
    chip: "border-success/30 bg-success/10 text-success",
    bar: "var(--db-green)",
    description: "Healthy: arriving at its normal volume, health check passing.",
  },
};

/** Every state explains itself on hover, wherever its dot or badge appears,
 * so nobody has to guess what "Learning" or "Recovering" means. */
export function HealthDot({ state, pulse, tip = true }: { state: HealthState; pulse?: boolean; tip?: boolean }) {
  const dot = (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${HEALTH_META[state].dot} ${pulse ? "live-pulse-dot" : ""}`}
      aria-hidden="true"
    />
  );
  return tip ? (
    <ContextualHelpTip content={HEALTH_META[state].description} maxWidth={260} triggerClassName="inline-flex shrink-0">
      {dot}
    </ContextualHelpTip>
  ) : (
    dot
  );
}

export function HealthBadge({ state, size = "sm" }: { state: HealthState; size?: "sm" | "xs" }) {
  const m = HEALTH_META[state];
  return (
    <ContextualHelpTip content={m.description} maxWidth={260}>
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap ${m.chip} ${
        size === "xs" ? "text-[10px] px-1.5 py-[1px]" : "text-xs px-2 py-0.5"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} aria-hidden="true" />
      {m.label}
    </span>
    </ContextualHelpTip>
  );
}

/**
 * Alert severity, Databahn's own scale: it ranks alerts, not sources.
 * Anything that stops data coming in or going out is critical; processing
 * that holds up delivery is high; medium is a risk that will become an
 * outage if nobody acts; low is informational. Distinct hues from the
 * health states, so "Critical" and "Stopped" never read as the same label.
 */
export const SEVERITY_META: Record<Severity, { label: string; chip: string; dot: string; text: string; definition: string }> = {
  critical: {
    label: "Critical",
    chip: "border-destructive/50 bg-destructive/15 text-destructive",
    dot: "bg-destructive",
    text: "text-destructive",
    definition: "Data coming in or going out is affected",
  },
  high: {
    label: "High",
    chip: "border-orange-500/50 bg-orange-500/15 text-orange-400",
    dot: "bg-orange-500",
    text: "text-orange-400",
    definition: "Processing is holding up delivery",
  },
  medium: {
    label: "Medium",
    chip: "border-yellow-400/40 bg-yellow-400/10 text-yellow-300",
    dot: "bg-yellow-400",
    text: "text-yellow-300",
    definition: "Will affect data if nobody acts",
  },
  low: {
    label: "Low",
    chip: "border-border bg-muted/20 text-muted-foreground",
    dot: "bg-muted-foreground/60",
    text: "text-muted-foreground",
    definition: "For awareness, nothing affected",
  },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const m = SEVERITY_META[severity];
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide border rounded px-1.5 py-[1px] whitespace-nowrap ${m.chip}`}
    >
      {m.label}
    </span>
  );
}
