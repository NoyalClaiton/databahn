import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { motion } from "motion/react";
import {
  ArrowRight, CheckCircle2, Circle, Wallet, AlertTriangle, AlertOctagon,
  Archive, Database, Send, TrendingDown, Activity, Gauge, Radio,
  UserCheck, ShieldPlus, PiggyBank, RotateCcw, FlaskConical, Repeat, Briefcase, Wrench, type LucideIcon,
} from "lucide-react";
import { useSession, type DashboardLens } from "@/app/lib/SessionContext";
import { PageHeader, SectionHeading, StatTile, StaggerItem } from "@/app/components/shared/PageLayout";
import {
  buildSavings, buildActivity, rateFor,
  type SourceSaving, type Savings, type ActivityEvent,
} from "@/app/lib/pipelineData";
import {
  useEnvironment, totalFunnel, RANGE_MINUTES, SEVERITY_ORDER, fmtDuration, fmtAgo, fmtCount,
  type Environment, type Alert, type AlertTarget,
} from "@/app/lib/environment";
import type { Severity } from "@/app/data/fleet";
import { liveCategoryStats, categoriesForSource } from "@/app/data/rules";
import { fmtGb } from "@/app/components/shared/PipelineSankey";
import type { FlowNode } from "@/app/components/shared/PipelineSankey";
import { SourceHealthWidget } from "@/app/components/shared/SourceHealthWidget";
import { DetailDrawer } from "@/app/components/shared/SourceDetailDrawer";
import { SeverityBadge, SEVERITY_META } from "@/app/components/shared/HealthBadge";
import { FunnelBars } from "@/app/components/shared/Funnel";
import { SAMPLE_FLEET } from "@/app/data/fleet";
import { whereAlertsGo } from "@/app/lib/notifications";
import { OwnerAvatar } from "@/app/components/shared/OwnerAvatar";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const RANGES = ["24H", "7D", "30D"] as const;

/** Someone checking daily and someone checking weekly want the same page
 * over a different window, so the window is a control, not a guess about
 * who's looking. */
function RangeToggle({ range, setRange }: { range: string; setRange: (r: string) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-background/40 p-1" role="group" aria-label="Time range">
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => setRange(r)}
          aria-pressed={range === r}
          className={`text-xs px-2.5 py-1 rounded font-mono-db transition-colors ${
            range === r ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

/** Two audiences, one dashboard. A segmented control rather than a
 * dropdown: with two roles both stay visible and switching is one click.
 * The lens changes emphasis and depth, never the numbers, so an executive
 * and an engineer looking at the same moment never see different counts. */
function LensToggle({ lens, setLens }: { lens: DashboardLens; setLens: (l: DashboardLens) => void }) {
  const options: { value: DashboardLens; label: string; icon: LucideIcon }[] = [
    { value: "executive", label: "Executive", icon: Briefcase },
    { value: "engineer", label: "Data engineer", icon: Wrench },
  ];
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-background/40 p-1" role="group" aria-label="View as">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => setLens(o.value)}
          aria-pressed={lens === o.value}
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded transition-colors ${
            lens === o.value ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <o.icon className="w-3.5 h-3.5" aria-hidden="true" />
          {o.label}
        </button>
      ))}
    </div>
  );
}

function OnboardingPath() {
  const navigate = useNavigate();
  const { connected } = useSession();
  const hasSource = connected.some((c) => c.kind === "source");
  const hasDest = connected.some((c) => c.kind === "destination");

  const steps = [
    {
      n: "01",
      title: "Connect a data source",
      description: "Most integrations take under 5 minutes. Cruz handles the technical setup, you just authenticate.",
      cta: hasSource ? "Add another" : "Browse sources",
      to: "/sources",
      done: hasSource,
      active: !hasSource,
      locked: false,
    },
    {
      n: "02",
      title: "Route to a destination",
      description: "Route to any destination. One connection, every future source reuses it.",
      cta: hasDest ? "Manage" : "Browse destinations",
      to: "/destinations",
      done: hasDest,
      active: hasSource && !hasDest,
      locked: !hasSource,
    },
    {
      n: "03",
      title: "Review your live pipeline",
      description: "See exactly what is flowing, what Cruz is filtering, and why. Nothing about your data pipeline is a black box.",
      cta: "Open pipeline",
      to: "/pipeline",
      done: false,
      active: hasSource && hasDest,
      locked: !hasSource || !hasDest,
    },
  ];

  return (
    <div className="space-y-3">
      {steps.map((step, i) => (
        <StaggerItem key={step.n} index={i}>
          <div
            className={`rounded border p-5 transition-all ${
              step.done
                ? "border-success/25 bg-success/[0.04] backdrop-blur-lg"
                : step.active
                ? "border-primary/50 glass-card listening-border"
                : step.locked
                ? "border-border/40 opacity-40"
                : "border-border glass-card"
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="shrink-0">
                  {step.done ? (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  ) : step.active ? (
                    <div className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    </div>
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground/30" />
                  )}
                </div>
                <div>
                  <p className={`text-sm font-medium ${step.done ? "text-muted-foreground line-through decoration-success/40" : "text-foreground"}`}>
                    {step.title}
                  </p>
                  {!step.done && !step.locked && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.description}</p>
                  )}
                </div>
              </div>
              {!step.locked && !step.done && (
                <motion.button
                  whileHover={{ x: 2 }}
                  onClick={() => navigate(step.to)}
                  className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded transition-colors ${
                    step.active
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "text-muted-foreground hover:text-foreground border border-border"
                  }`}
                >
                  {step.cta}
                  <ArrowRight className="w-3 h-3" />
                </motion.button>
              )}
              {step.done && (
                <button
                  onClick={() => navigate(step.to)}
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {step.cta}
                </button>
              )}
            </div>
          </div>
        </StaggerItem>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Environment status: "is everything OK?" answered in one look        */
/* ------------------------------------------------------------------ */

/** Share of monitored source-time with data arriving, over the range. Open
 * incidents count from when they started; earlier, already-resolved ones
 * from each source's 30-day record. Paused and learning sources are left
 * out: planned downtime isn't unavailability. */
function availability(env: Environment, range: string) {
  const span = RANGE_MINUTES[range] ?? 1440;
  const monitored = env.sources.filter((s) => s.state !== "paused" && s.state !== "learning");
  let down = 0;
  let resolved = 0;
  for (const s of monitored) {
    if (s.state === "stopped") down += Math.min(s.sinceMin, span);
    if (s.state === "degraded" && (s.incident?.receivedFactor ?? 1) < 1) down += Math.min(s.sinceMin, span) * (1 - (s.incident?.receivedFactor ?? 1));
    if (s.state === "recovering" && s.recovered) {
      down += Math.max(0, Math.min(span, s.sinceMin + s.recovered.downMin) - s.sinceMin);
      if (s.sinceMin < span) resolved++;
    }
    down += s.incidents30d * 45 * (span / 43200);
    resolved += s.incidents30d * (span / 43200);
  }
  for (const d of env.destinations) {
    if (d.state === "recovering" && d.sinceMin < span) resolved++;
    resolved += d.incidents30d * (span / 43200);
  }
  return {
    pct: monitored.length ? 1 - down / (monitored.length * span) : 1,
    resolved: Math.round(resolved),
  };
}

function EnvironmentStatus({ env, range, lens, monthlySaving }: { env: Environment; range: string; lens: DashboardLens; monthlySaving: string }) {
  const navigate = useNavigate();
  const { counts, total, severityCounts, alerts } = env.summary;
  const unrouted = env.sources.filter((s) => s.destIds.length === 0);
  const live = env.sources.filter((s) => s.state !== "paused");
  const epm = live.reduce((a, s) => a + s.epm.received, 0);
  const normalEpm = live.reduce((a, s) => a + s.normalEpm, 0);
  const avail = availability(env, range);
  const notSending = counts.stopped;
  const destProblems = env.destinations.filter((d) => d.state === "stopped" || d.state === "degraded");
  const destsAccepting = env.destinations.length - destProblems.length;
  const open = alerts.filter((a) => a.kind === "incident").length;

  const parts = [
    notSending && `${notSending} source${notSending === 1 ? " isn't" : "s aren't"} sending`,
    counts.degraded && `${counts.degraded} ${counts.degraded === 1 ? "is" : "are"} below normal`,
    destProblems.length && `${destProblems.length} destination${destProblems.length === 1 ? " isn't" : "s aren't"} accepting everything`,
  ].filter(Boolean) as string[];

  const verdict =
    severityCounts.critical > 0
      ? { tone: "bad" as const, icon: AlertOctagon, title: `Action needed: ${severityCounts.critical} critical alert${severityCounts.critical === 1 ? "" : "s"}` }
      : severityCounts.high > 0
        ? { tone: "warn" as const, icon: AlertTriangle, title: "Running with issues" }
        : env.destinations.length === 0 || unrouted.length > 0
          ? { tone: "warn" as const, icon: AlertTriangle, title: "Setup incomplete" }
          : { tone: "good" as const, icon: CheckCircle2, title: "All systems normal" };
  const line =
    parts.length > 0
      ? `${parts.join(", ")}.`.replace(/^./, (c) => c.toUpperCase())
      : env.destinations.length === 0
        ? "Sources are collecting, but nothing is being delivered yet."
        : unrouted.length > 0
          ? `${unrouted.length} source${unrouted.length === 1 ? " isn't" : "s aren't"} routed to a destination.`
          : "Every source is arriving normally and every destination is accepting data.";

  // The same treatment as every other status card in the app (drawer focus
  // card, Search banners): neutral surface, a thin coloured edge, a coloured
  // icon. Only one fully tinted block on the page competed with everything.
  const toneClass = {
    bad: "border-border bg-card shadow-[inset_3px_0_0_var(--db-red)]",
    warn: "border-border bg-card shadow-[inset_3px_0_0_#f59e0b]",
    good: "border-border bg-card shadow-[inset_3px_0_0_var(--db-green)]",
  }[verdict.tone];
  const iconClass = { bad: "text-destructive", warn: "text-amber-400", good: "text-success" }[verdict.tone];

  return (
    <div className="space-y-3">
      <div className={`rounded-lg border p-5 flex items-start gap-4 ${toneClass}`} role="status">
        <verdict.icon className={`w-6 h-6 shrink-0 mt-0.5 ${iconClass}`} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-lg font-semibold text-foreground">{verdict.title}</p>
          <p className="text-sm text-foreground/85 mt-0.5">{line}</p>
          <p className="text-xs text-muted-foreground mt-2 font-mono-db">
            {total} source{total === 1 ? "" : "s"} · {env.destinations.length} destination{env.destinations.length === 1 ? "" : "s"} ·{" "}
            {fmtCount(epm)} events/min flowing now
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          icon={Radio}
          label="Sources sending"
          value={`${total - counts.stopped - counts.paused}/${total}`}
          tone={counts.stopped > 0 ? "warning" : "good"}
          sub={
            [counts.stopped && `${counts.stopped} not sending`, counts.degraded && `${counts.degraded} below normal`, counts.paused && `${counts.paused} paused`]
              .filter(Boolean)
              .join(" · ") || "every source is sending"
          }
          onClick={counts.stopped + counts.degraded > 0 ? () => navigate("/pipeline", { state: { healthFilter: "issues" } }) : undefined}
          actionLabel="See which"
        />
        <StatTile
          icon={Send}
          label="Destinations accepting"
          value={env.destinations.length === 0 ? "None yet" : `${destsAccepting}/${env.destinations.length}`}
          tone={env.destinations.length === 0 || destProblems.length ? "warning" : "good"}
          sub={
            env.destinations.length === 0
              ? "connect a destination to deliver"
              : destProblems.length
                ? destProblems.map((d) => (d.state === "stopped" ? `${d.name} not accepting` : `${d.name} rejecting ${d.incident?.rejectedPct}%`)).join(" · ")
                : "every destination is accepting data"
          }
          onClick={env.destinations.length === 0 ? () => navigate("/destinations") : undefined}
          actionLabel="Add destination"
        />
        {lens === "engineer" ? (
          <StatTile
            icon={Activity}
            label="Data flowing"
            value={`${fmtCount(epm)}/min`}
            sub={normalEpm > 0 ? `${Math.round((epm / normalEpm) * 100)}% of normal right now` : "no sources yet"}
          />
        ) : (
          <StatTile icon={Wallet} label="Monthly saving" value={monthlySaving} sub="from reduction rules, at list rates" />
        )}
        <StatTile
          icon={Gauge}
          label={`Availability · ${range}`}
          value={`${(avail.pct * 100).toFixed(avail.pct > 0.999 ? 2 : 1)}%`}
          sub={`${open} open incident${open === 1 ? "" : "s"} · ${avail.resolved} resolved in ${range}`}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Alerts                                                               */
/* ------------------------------------------------------------------ */

const ALERTS_VISIBLE = 6;

/**
 * Engineer lens. One list across sources, destinations and Databahn's own
 * components, ranked by severity (Databahn's own scale: data in or out
 * affected is critical, processing holding up delivery is high), then by
 * how long it has been open. Each alert names the first place to look.
 */
/** Same colours as the severity badges and the Pipeline table's row edges. */
const SEVERITY_EDGE: Record<Alert["severity"], string> = {
  critical: "var(--db-red)",
  high: "#f97316",
  medium: "#facc15",
  low: "rgba(178,181,190,0.5)",
};

function AlertsList({ alerts, onOpen }: { alerts: Alert[]; onOpen: (a: Alert) => void }) {
  const [filter, setFilter] = useState<Severity | null>(null);
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) {
    return (
      <div className="rounded border border-success/25 bg-success/[0.04] p-4 flex items-start gap-3">
        <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-sm text-foreground">No open alerts</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Every source is arriving normally and every destination is accepting data.
          </p>
        </div>
      </div>
    );
  }

  const filtered = filter ? alerts.filter((a) => a.severity === filter) : alerts;
  const shown = expanded ? filtered : filtered.slice(0, ALERTS_VISIBLE);
  return (
    <div className="rounded border border-border glass-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex flex-wrap gap-1.5">
        <button
          onClick={() => setFilter(null)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            !filter ? "border-primary/60 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          All <span className="font-mono-db">{alerts.length}</span>
        </button>
        {SEVERITY_ORDER.map((sv) => {
          const n = alerts.filter((a) => a.severity === sv).length;
          if (n === 0) return null;
          return (
            <button
              key={sv}
              onClick={() => setFilter(filter === sv ? null : sv)}
              title={SEVERITY_META[sv].definition}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1.5 ${
                filter === sv ? "border-primary/60 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_META[sv].dot}`} aria-hidden="true" />
              {SEVERITY_META[sv].label} <span className="font-mono-db">{n}</span>
            </button>
          );
        })}
      </div>
      <div className="divide-y divide-border">
        {shown.map((a, i) => (
          // The whole row opens the alert, like every other list in the app.
          // "Triage →" stays as the visible cue for what a click does.
          <div
            key={a.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(a)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(a);
              }
            }}
            // Severity as a thin left edge (scannable down the list, like the
            // Pipeline table's rows) plus a badge after the title, so it isn't
            // colour alone. No column of its own: the title leads the row.
            className="group p-4 flex items-start gap-3 cursor-pointer hover:bg-muted/15 transition-colors focus-visible:outline-none focus-visible:bg-muted/20"
            style={{ boxShadow: `inset 3px 0 0 ${SEVERITY_EDGE[a.severity]}` }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{a.title}</span>
                <SeverityBadge severity={a.severity} />
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{a.detail}</p>
              <p className="text-xs mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-muted-foreground/80">
                {a.likelyCause && <span className="text-foreground/80">Likely: {a.likelyCause}</span>}
                {a.kind === "incident" && <span>For {fmtDuration(a.sinceMin)}</span>}
                {a.targets.length > 1 && <span>{a.targets.length} sources affected</span>}
              </p>
            </div>
            {a.kind === "incident" && <OwnerAvatar assignee={a.assignee} />}
            <span
              aria-hidden="true"
              className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium rounded px-2.5 py-1 transition-colors ${
                "border border-border text-foreground group-hover:bg-muted/20"
              }`}
            >
              {a.kind === "incident" ? "Triage" : "View"}
              <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        ))}
      </div>
      {filtered.length > ALERTS_VISIBLE && (
        <button onClick={() => setExpanded((v) => !v)} className="w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground border-t border-border">
          {expanded ? "Show fewer" : `Show ${filtered.length - ALERTS_VISIBLE} more`}
        </button>
      )}
    </div>
  );
}

/** Executive lens: how many, how bad, and the headline of each, without
 * triage detail. One click to the engineer's view of the same alerts. */
function AlertsSummary({ alerts, onOpen, onSeeAll }: { alerts: Alert[]; onOpen: (a: Alert) => void; onSeeAll: () => void }) {
  return (
    <div className="rounded border border-border glass-card overflow-hidden">
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border border-b border-border">
        {SEVERITY_ORDER.map((sv) => {
          const n = alerts.filter((a) => a.severity === sv).length;
          return (
            <div key={sv} className="px-4 py-3">
              <p className={`text-xs uppercase tracking-wide font-semibold ${n ? SEVERITY_META[sv].text : "text-muted-foreground/60"}`}>
                {SEVERITY_META[sv].label}
              </p>
              <p className={`text-lg font-mono-db ${n ? "text-foreground" : "text-muted-foreground/50"}`}>{n}</p>
              <p className="text-xs text-muted-foreground leading-snug">{SEVERITY_META[sv].definition}</p>
            </div>
          );
        })}
      </div>
      {alerts.length > 0 ? (
        <div className="divide-y divide-border">
          {alerts.slice(0, 3).map((a) => (
            <button key={a.id} onClick={() => onOpen(a)} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-muted/15">
              <SeverityBadge severity={a.severity} />
              <span className="text-sm text-foreground truncate flex-1">{a.title}</span>
              {a.kind === "incident" && <span className="text-xs text-muted-foreground shrink-0">{fmtDuration(a.sinceMin)}</span>}
              {a.kind === "incident" && <OwnerAvatar assignee={a.assignee} size={20} />}
            </button>
          ))}
        </div>
      ) : (
        <p className="px-4 py-3 text-sm text-muted-foreground">No open alerts.</p>
      )}
      <div className="px-4 py-2.5 border-t border-border bg-muted/5 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {alerts.filter((a) => a.ackAt).length} of {alerts.filter((a) => a.kind === "incident").length} open incidents have an owner
        </span>
        <button onClick={onSeeAll} className="text-xs text-primary hover:text-primary/80 inline-flex items-center gap-1 underline underline-offset-2">
          See all in the engineer view
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recommendations: what to do when nothing is on fire                 */
/* ------------------------------------------------------------------ */

interface Rec {
  id: string;
  kind: "Save" | "Coverage" | "Retain" | "Reliability";
  title: string;
  why: string;
  impact: string;
  action: { label: string; onClick: () => void };
}

const REC_META: Record<Rec["kind"], { icon: LucideIcon; className: string }> = {
  Save: { icon: PiggyBank, className: "text-success" },
  Coverage: { icon: ShieldPlus, className: "text-primary" },
  Retain: { icon: Archive, className: "text-info" },
  Reliability: { icon: Repeat, className: "text-amber-400" },
};

function Recommendations({ recs, onDismiss }: { recs: Rec[]; onDismiss: (id: string) => void }) {
  if (recs.length === 0) {
    return (
      <div className="rounded border border-border glass-card p-4 text-sm text-muted-foreground">
        No recommendations right now. Cruz checks for savings, coverage gaps and recurring problems continuously.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {recs.map((r) => {
        const meta = REC_META[r.kind];
        return (
          <div key={r.id} className="rounded border border-border glass-card p-4 flex flex-col">
            <div className="flex items-center justify-between gap-2 mb-2">
              {/* Category as a quiet label, the icon carries the colour, so four
                  cards don't read as four competing coloured pills. */}
              <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <meta.icon className={`w-3.5 h-3.5 ${meta.className}`} aria-hidden="true" />
                {r.kind}
              </span>
              <span className="text-xs font-mono-db text-foreground">{r.impact}</span>
            </div>
            <p className="text-sm font-medium text-foreground">{r.title}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed flex-1">{r.why}</p>
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={r.action.onClick}
                className="inline-flex items-center gap-1 text-xs font-medium rounded px-2.5 py-1 border border-border text-foreground hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {r.action.label}
                <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </button>
              <button onClick={() => onDismiss(r.id)} className="text-xs text-muted-foreground hover:text-foreground">
                Not now
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cost                                                                 */
/* ------------------------------------------------------------------ */

/** The same tile Pipeline overview uses, not a second look for the same idea.
 * Pipeline answers "what is being filtered"; these answer "what is that
 * worth", which is the same traffic in the unit that reaches an invoice. */
function CostTiles({ savings, reductionPct }: { savings: Savings; reductionPct: number }) {
  const prefix = savings.isPotential ? "~" : "";
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <StatTile
        icon={Wallet}
        label={savings.isPotential ? "Projected monthly saving" : "Monthly saving"}
        value={`${prefix}${usd(savings.monthlyUsd)}`}
        sub={savings.isPotential ? "once routed to a destination" : `${usd(savings.annualUsd)} a year at current rules`}
      />
      <StatTile icon={TrendingDown} label="Volume reduced" value={`${reductionPct}%`} sub={`${fmtGb(savings.gbPerDayFiltered)}/day never billed`} />
      <StatTile
        icon={Send}
        label="Billed destinations"
        value={String(savings.perDestination.length)}
        sub={
          savings.perDestination.length === 0
            ? "nothing is being delivered yet"
            : savings.perDestination.map((d) => `${d.name} at $${d.rate.toFixed(2)}/GB`).join(", ")
        }
      />
    </div>
  );
}

const SAVINGS_VISIBLE = 5;

/** Capped at five: at 170 sources the list is about where tuning effort
 * pays off, and that's always the top few. */
function SavingsBySource({ perSource }: { perSource: SourceSaving[] }) {
  const navigate = useNavigate();
  return (
    <div className="rounded border border-border glass-card divide-y divide-border">
      {perSource.slice(0, SAVINGS_VISIBLE).map((s) => (
        <button
          key={s.id}
          onClick={() => navigate("/pipeline")}
          className="w-full text-left p-4 hover:bg-muted/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring first:rounded-t last:rounded-b"
        >
          <div className="flex items-baseline justify-between gap-4 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              {/* No brand-coloured dot here: next to status dots everywhere
                  else, Palo Alto's orange read as "stopped". */}
              <span className="text-sm font-medium text-foreground truncate">{s.name}</span>
              {s.isPotential && (
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-amber-400 bg-amber-500/15 rounded-full px-1.5 py-[1px]">Not routed</span>
              )}
            </div>
            <span className="font-mono-db text-sm text-foreground shrink-0">
              {s.isPotential ? "~" : ""}
              {usd(s.monthlyUsd)}
              <span className="text-muted-foreground/60 text-xs ml-1">/mo</span>
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted/30 overflow-hidden mb-2">
            <div className="h-full rounded-full transition-all opacity-70" style={{ width: `${s.reductionFactor * 100}%`, background: "var(--db-green)" }} />
          </div>
          <p className="text-xs text-muted-foreground font-mono-db">
            {fmtGb(s.gbPerDay)}/day in · {Math.round(s.reductionFactor * 100)}% reduced ·{" "}
            {s.destinationCount === 0 ? "no destination" : `${s.destinationCount} destination${s.destinationCount === 1 ? "" : "s"}`}
          </p>
        </button>
      ))}
      {perSource.length > SAVINGS_VISIBLE && (
        <button onClick={() => navigate("/pipeline")} className="w-full px-4 py-2.5 text-xs text-primary hover:text-primary/80 inline-flex items-center justify-center gap-1">
          All {perSource.length} sources on Pipeline
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function RecentActivity({ events }: { events: ActivityEvent[] }) {
  const ICON: Record<ActivityEvent["kind"], LucideIcon> = {
    archive: Archive,
    unretained: AlertTriangle,
    connect: Database,
    down: AlertOctagon,
    recovered: RotateCcw,
    ack: UserCheck,
  };
  const TONE: Record<ActivityEvent["kind"], string> = {
    archive: "text-info",
    unretained: "text-amber-400",
    connect: "text-muted-foreground/60",
    down: "text-destructive",
    recovered: "text-success",
    ack: "text-success",
  };
  if (events.length === 0) return <div className="rounded border border-border glass-card p-4 text-sm text-muted-foreground">Nothing in this period.</div>;
  return (
    <div className="rounded border border-border glass-card divide-y divide-border">
      {events.map((e) => {
        const Icon = ICON[e.kind];
        return (
          // History, so a step quieter than Alerts: secondary size, one line.
          <div key={e.id} className="flex items-center gap-2.5 px-3 py-2">
            <Icon className={`w-3.5 h-3.5 shrink-0 ${TONE[e.kind]}`} aria-hidden="true" />
            <p className="text-xs text-foreground/85 min-w-0 flex-1 truncate">
              {e.text}
              {e.detail && <span className="text-muted-foreground"> · {e.detail}</span>}
            </p>
            <span className="text-xs text-muted-foreground/70 font-mono-db shrink-0">{fmtAgo(e.minutesAgo)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

/** Detection-relevant source types and the connector to start each with.
 * A missing one isn't an outage, it's a blind spot, which is why it's a
 * recommendation and not an alert. */
const COVERAGE: { group: string; what: string; connect: string; label: string; to: string }[] = [
  { group: "Identity", what: "sign-in and account-takeover detections", connect: "Entra ID", label: "Connect Entra ID", to: "/sources/entraid" },
  { group: "Network security", what: "firewall, scanning and C2 detections", connect: "Palo Alto", label: "Connect Palo Alto", to: "/sources/paloalto" },
  { group: "Endpoint", what: "process, malware and lateral-movement detections", connect: "CrowdStrike", label: "Connect CrowdStrike", to: "/sources/connect/crowdstrike" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { connected, rules, coldStorageTargets, sampleEnvironment, setSampleEnvironment, dismissedRecs, dismissRec, lens, setLens, notifications } =
    useSession();
  const env = useEnvironment();
  const [range, setRange] = useState<string>("24H");
  // Opened from a notification or the sidebar lands with the drawer open.
  const stateTarget = (location.state as { openTarget?: AlertTarget } | null)?.openTarget ?? null;
  const [openTarget, setOpenTarget] = useState<AlertTarget | null>(stateTarget);
  // Same-route navigation doesn't remount the page, so the request is also
  // picked up from state changes.
  useEffect(() => {
    if (stateTarget) setOpenTarget(stateTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);
  const sourceCount = env.sources.length;
  const destCount = env.destinations.length;

  if (sourceCount === 0) {
    return (
      <div className="w-full max-w-[1180px] mx-auto">
        <PageHeader
          title="Welcome to Databahn"
          subtitle="Connect your first source and Databahn routes it to your SIEM, filtered and mapped by Cruz."
        />
        <div className="max-w-2xl mx-auto">
          <OnboardingPath />
          <p className="text-xs text-muted-foreground/40 pt-4 pl-9">Cruz guides you through every step. No SME required.</p>
          {/* A way to see the dashboard at real scale without connecting 170
              sources first. Labeled as simulated wherever it shows. */}
          <button
            onClick={() => setSampleEnvironment(true)}
            className="mt-6 ml-9 inline-flex items-center gap-2 text-xs text-primary hover:text-primary/80 underline underline-offset-2"
          >
            <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" />
            Or explore a sample environment with {SAMPLE_FLEET.length} sources
          </button>
        </div>
      </div>
    );
  }

  const isSetup = destCount > 0;

  // Same per-source numbers the Pipeline table shows, priced per destination.
  const sourceNodes: FlowNode[] = env.sources.map((s) => ({ id: s.id, name: s.name, volume: s.gbIn, color: s.color, reduction: s.reduction }));
  const destNodes: FlowNode[] = env.destinations.map((d) => ({ id: d.id, name: d.name, volume: 0, color: d.color }));
  const savings = buildSavings(sourceNodes, destNodes, env.edges, rules);
  const totalIn = sourceNodes.reduce((a, s) => a + s.volume, 0);
  const reductionPct = Math.round((savings.gbPerDayFiltered / Math.max(totalIn, 1)) * 100);

  /* Alerts, plus setup items that only the dashboard knows about. */
  const proposed = rules.filter((r) => r.id.startsWith("flagged-") && !r.enabled);
  const unrouted = env.sources.filter((s) => s.destIds.length === 0);
  const alerts: Alert[] = [...env.summary.alerts];
  if (unrouted.length > 0 && isSetup)
    alerts.push({
      id: "setup:unrouted",
      kind: "risk",
      severity: "medium",
      area: "risk",
      title: `${unrouted.map((s) => s.name).join(", ")} not routed anywhere`,
      detail: `Collecting ${fmtGb(unrouted.reduce((a, s) => a + s.gbIn, 0))}/day with nowhere to land.`,
      sinceMin: 0,
      targets: unrouted.map((s) => ({ kind: "source" as const, id: s.id, name: s.name })),
      open: { kind: "source", id: unrouted[0].id, name: unrouted[0].name },
    });
  if (proposed.length > 0)
    alerts.push({
      id: "setup:proposed",
      kind: "notice",
      severity: "low",
      area: "info",
      title: `${proposed.length} proposed exclusion${proposed.length === 1 ? "" : "s"} awaiting review`,
      detail: "Flagged from Search by an analyst. Nothing changes until you enable them.",
      sinceMin: 0,
      targets: [],
      open: { kind: "source", id: env.sources[0].id, name: env.sources[0].name },
    });
  // Setup items have nothing to triage, they go where the work is.
  const openAlert = (a: Alert) => {
    if (a.id === "setup:proposed") navigate("/pipeline", { state: { focusRuleId: proposed[0].id } });
    else setOpenTarget(a.open);
  };

  /* Recommendations */
  const recs: Rec[] = [];
  const byConnector = new Map<string, typeof env.sources>();
  for (const s of env.sources) byConnector.set(s.connectorId, [...(byConnector.get(s.connectorId) ?? []), s]);
  let best: { connectorId: string; vendor: string; count: number; gbPerDay: number; monthly: number; live: boolean; off: number } | null = null;
  for (const [connectorId, members] of byConnector) {
    const gb = members.reduce((a, s) => a + s.gbIn, 0);
    const rate = rateFor(members[0].destIds[0] ?? "");
    const live = categoriesForSource(connectorId).length > 0;
    let extraShare = 0;
    let off = 0;
    if (live) {
      for (const c of liveCategoryStats(rules, connectorId)) {
        if (c.applicable > 0) extraShare += c.volumeShare * (1 - c.active / c.applicable);
        off += c.applicable - c.active;
      }
    } else if (env.isSample && ["fortinet", "windows-events", "zscaler"].includes(connectorId)) {
      extraShare = 0.09;
      off = 14;
    }
    const monthly = gb * extraShare * 30 * rate;
    if (off > 0 && monthly > (best?.monthly ?? 0))
      best = { connectorId, vendor: members[0].vendor, count: members.length, gbPerDay: gb * extraShare, monthly, live, off };
  }
  if (best) {
    const b = best;
    recs.push({
      id: `save-${b.connectorId}`,
      kind: "Save",
      title: b.live ? `Turn on ${b.off} more ${b.vendor} rules` : `Cruz found ${b.off} more rules for ${b.vendor}`,
      why: `Would remove another ${fmtGb(b.gbPerDay)}/day across ${b.count} source${b.count === 1 ? "" : "s"}, without touching anything detection rules use. Each rule shows its before/after sample first.`,
      impact: `~${usd(b.monthly)}/mo`,
      action: b.live
        ? { label: "Review rules", onClick: () => navigate("/rules", { state: { sourceId: b.connectorId, offOnly: true } }) }
        : { label: "Review in Pipeline", onClick: () => navigate("/pipeline") },
    });
  }
  // Destinations reject data often; one that keeps doing it deserves a
  // standing fix, not another alert next week.
  const flaky = env.destinations.filter((d) => d.incidents30d >= 3).sort((a, b) => b.incidents30d - a.incidents30d)[0];
  if (flaky)
    recs.push({
      id: `reliability-${flaky.id}`,
      kind: "Reliability",
      title: `Stop ${flaky.name} throttling from recurring`,
      why: `${flaky.name} has throttled delivery ${flaky.incidents30d} times in 30 days. Sending in larger, steadier batches keeps Databahn under its ingestion limit instead of reacting each time.`,
      impact: `${flaky.incidents30d}× in 30 days`,
      action: { label: "View destination", onClick: () => setOpenTarget({ kind: "destination", id: flaky.id, name: flaky.name }) },
    });
  if (env.isSample) {
    recs.push({
      id: "coverage-aws",
      kind: "Coverage",
      title: "3 AWS accounts have no CloudTrail coverage",
      why: "Your AWS Organization has 21 accounts and 18 are connected. The 3 created this month (ml-sandbox, vendor-share, dr-west) send nothing, so activity in them is invisible to detection.",
      impact: "3 accounts",
      action: { label: "Connect them", onClick: () => navigate("/sources/connect/aws-cloudtrail") },
    });
  } else {
    const gap = COVERAGE.find((c) => !env.sources.some((s) => s.group === c.group));
    if (gap)
      recs.push({
        id: `coverage-${gap.group}`,
        kind: "Coverage",
        title: `No ${gap.group.toLowerCase()} source connected`,
        why: `${gap.what.charAt(0).toUpperCase() + gap.what.slice(1)} have nothing to run on. ${gap.connect} is the quickest place to start.`,
        impact: "Blind spot",
        action: { label: gap.label, onClick: () => navigate(gap.to) },
      });
  }
  if (coldStorageTargets.length === 0 && savings.gbPerDayFiltered > 0) {
    recs.push({
      id: "retain-cold",
      kind: "Retain",
      title: "Keep what your rules filter out",
      why: "No cold storage is connected, so filtered events aren't retained anywhere and can't be searched or recovered later.",
      impact: `${fmtGb(savings.gbPerDayFiltered)}/day`,
      action: { label: "Connect cold storage", onClick: () => navigate("/pipeline", { state: { openColdStorage: true } }) },
    });
  }
  const visibleRecs = recs.filter((r) => !dismissedRecs.includes(r.id)).slice(0, 4);

  /* Activity */
  const span = RANGE_MINUTES[range] ?? 1440;
  const sentTo = (sv: Severity) => {
    const to = whereAlertsGo(notifications, sv);
    return to ? ` Alert sent to ${to}.` : "";
  };
  const healthEvents: ActivityEvent[] = [
    ...env.summary.alerts
      .filter((a) => a.kind === "incident")
      .flatMap<ActivityEvent>((a) => {
        const out: ActivityEvent[] = [
          { id: `down-${a.id}`, kind: "down", text: a.title, detail: a.likelyCause ? `Likely: ${a.likelyCause}.${sentTo(a.severity)}` : undefined, minutesAgo: a.sinceMin },
        ];
        if (a.assignee) out.push({ id: `ack-${a.id}`, kind: "ack", text: `${a.assignee.isMe ? "You" : a.assignee.person.name} took ownership: ${a.title}`, minutesAgo: (Date.now() - a.assignee.at) / 60000 });
        return out;
      }),
    ...[...env.sources, ...env.destinations]
      .filter((x) => x.state === "recovering" && x.recovered)
      .map<ActivityEvent>((x) => ({
        id: `rec-${x.id}`,
        kind: "recovered",
        text: `${x.name} recovered after ${fmtDuration(x.recovered!.downMin)}`,
        detail: notifications.recoveryNotices && whereAlertsGo(notifications, "critical") ? `Recovery notice sent to ${whereAlertsGo(notifications, "critical")}` : undefined,
        minutesAgo: x.sinceMin,
      })),
  ];
  // Flow lines keep the feed alive but would bury every health event at
  // 170 sources, so only the three biggest stay.
  const baseActivity = buildActivity(savings.perSource, connected, coldStorageTargets);
  const flowLines = baseActivity.filter((e) => e.kind === "archive" || e.kind === "unretained").slice(0, 3);
  const activity = [...healthEvents, ...flowLines, ...baseActivity.filter((e) => e.kind === "connect")]
    .filter((e) => e.minutesAgo <= span)
    .sort((a, b) => a.minutesAgo - b.minutesAgo)
    .slice(0, 8);

  const monthlySaving = `${savings.isPotential ? "~" : ""}${usd(savings.monthlyUsd)}`;
  const flow = lens === "executive" ? totalFunnel(env, range, "total") : null;

  return (
    <div className="w-full max-w-[1180px] mx-auto">
      <PageHeader
        align="left"
        title={isSetup ? "Your data plane" : "Welcome to Databahn"}
        subtitle={
          env.isSample ? (
            <>
              Sample environment · {sourceCount} simulated sources{" "}
              <span className="text-muted-foreground/40">·</span>{" "}
              <button onClick={() => setSampleEnvironment(false)} className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2">
                Exit sample
              </button>
            </>
          ) : isSetup ? (
            `${sourceCount} source${sourceCount === 1 ? "" : "s"} and ${destCount} destination${destCount === 1 ? "" : "s"} live right now.`
          ) : (
            `${sourceCount} source${sourceCount === 1 ? "" : "s"} connected. Route to a destination to start delivering.`
          )
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <LensToggle lens={lens} setLens={setLens} />
            <RangeToggle range={range} setRange={setRange} />
          </div>
        }
      />

      <div className="space-y-8">
        {!isSetup && !sampleEnvironment && (
          <section>
            <SectionHeading title="Finish setup" />
            <OnboardingPath />
          </section>
        )}

        <StaggerItem index={1}>
          <section>
            <SectionHeading title="Environment status" />
            <EnvironmentStatus env={env} range={range} lens={lens} monthlySaving={monthlySaving} />
          </section>
        </StaggerItem>

        {lens === "engineer" ? (
          <>
            {/* Engineer: what needs me, triage-first, then the health
                picture behind it. */}
            <StaggerItem index={2}>
              <section>
                <SectionHeading title="Alerts" count={alerts.length} />
                <AlertsList alerts={alerts} onOpen={openAlert} />
              </section>
            </StaggerItem>
            <StaggerItem index={3}>
              <section>
                <SectionHeading title="Source health" />
                <SourceHealthWidget env={env} range={range} onOpen={setOpenTarget} />
              </section>
            </StaggerItem>
            <StaggerItem index={4}>
              <section>
                <SectionHeading title="Recommendations" count={visibleRecs.length} />
                <Recommendations recs={visibleRecs} onDismiss={dismissRec} />
              </section>
            </StaggerItem>
            <StaggerItem index={5}>
              <section>
                <SectionHeading title={`Recent activity · ${range}`} />
                <RecentActivity events={activity} />
              </section>
            </StaggerItem>
          </>
        ) : (
          <>
            {/* Executive: how bad, how much data, what it's worth, what to
                decide. No triage detail, one click to it. */}
            <StaggerItem index={2}>
              <section>
                <SectionHeading title="Alerts" count={alerts.length} />
                <AlertsSummary alerts={alerts} onOpen={openAlert} onSeeAll={() => setLens("engineer")} />
              </section>
            </StaggerItem>
            {flow && (
              <StaggerItem index={3}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <section>
                    <SectionHeading title={`Data flow · ${range}`} />
                    <div className="rounded border border-border glass-card p-4">
                      <FunnelBars funnel={flow} mode="total" showDestinations={false} />
                      <p className="text-xs text-muted-foreground mt-3">
                        {fmtCount(flow.received.events)} events received in {range}; rules removed{" "}
                        {flow.received.gb > 0 ? Math.round((flow.reduced.gb / flow.received.gb) * 100) : 0}% of the volume before delivery.
                      </p>
                    </div>
                  </section>
                  <section>
                    <SectionHeading title="Source health" />
                    <SourceHealthWidget env={env} range={range} onOpen={setOpenTarget} compact />
                  </section>
                </div>
              </StaggerItem>
            )}
            <StaggerItem index={4}>
              <section>
                <SectionHeading title="Recommendations" count={visibleRecs.length} />
                <Recommendations recs={visibleRecs} onDismiss={dismissRec} />
              </section>
            </StaggerItem>
            <StaggerItem index={5}>
              <section>
                <SectionHeading title={savings.isPotential ? "Projected cost impact" : "Cost impact"} />
                <CostTiles savings={savings} reductionPct={reductionPct} />
              </section>
            </StaggerItem>
            <StaggerItem index={6}>
              <section>
                <SectionHeading title="Savings by source" count={savings.perSource.length} />
                <SavingsBySource perSource={savings.perSource} />
              </section>
            </StaggerItem>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground/50 mt-8 text-center leading-relaxed">
        Savings estimated from published list rates. Your negotiated rate will differ.
        {env.isSample && " Sample environment: health, volume and incidents are simulated for this prototype."}
      </p>

      {openTarget && <DetailDrawer target={openTarget} range={range} onClose={() => setOpenTarget(null)} onOpen={setOpenTarget} />}
    </div>
  );
}
