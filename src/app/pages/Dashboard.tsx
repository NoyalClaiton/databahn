import { useNavigate } from "react-router";
import { motion } from "motion/react";
import {
  ArrowRight, CheckCircle2, Circle, Wallet, AlertTriangle,
  Archive, Flag, Database, Send, TrendingDown, type LucideIcon,
} from "lucide-react";
import { useSession } from "@/app/lib/SessionContext";
import { PageHeader, SectionHeading, StatTile, StaggerItem } from "@/app/components/shared/PageLayout";
import {
  buildFlowNodes, buildSavings, buildActivity,
  type SourceSaving, type Savings, type ActivityEvent,
} from "@/app/lib/pipelineData";
import { fmtGb } from "@/app/components/shared/PipelineSankey";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

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
                ? "border-success/25 bg-success/[0.04]"
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
        sub={
          savings.isPotential
            ? "once routed to a destination"
            : `${usd(savings.annualUsd)} a year at current rules`
        }
      />
      <StatTile
        icon={TrendingDown}
        label="Volume reduced"
        value={`${reductionPct}%`}
        sub={`${fmtGb(savings.gbPerDayFiltered)}/day never billed`}
      />
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

/** Per source rather than only per destination, because this is the view that
 * tells you where to spend your tuning effort: one firewall is usually most of
 * the bill, and a quiet audit feed is usually not worth touching. */
function SavingsBySource({ perSource }: { perSource: SourceSaving[] }) {
  const navigate = useNavigate();

  return (
    <div className="rounded border border-border glass-card divide-y divide-border">
      {perSource.map((s) => (
        <button
          key={s.id}
          onClick={() => navigate("/pipeline")}
          className="w-full text-left p-4 hover:bg-muted/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring first:rounded-t last:rounded-b"
        >
          <div className="flex items-baseline justify-between gap-4 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} aria-hidden="true" />
              <span className="text-sm font-medium text-foreground truncate">{s.name}</span>
              {s.isPotential && (
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-amber-400 bg-amber-500/15 rounded-full px-1.5 py-[1px]">
                  Not routed
                </span>
              )}
            </div>
            <span className="font-mono-db text-sm text-foreground shrink-0">
              {s.isPotential ? "~" : ""}{usd(s.monthlyUsd)}
              <span className="text-muted-foreground/60 text-xs ml-1">/mo</span>
            </span>
          </div>

          {/* One bar, one quantity: how much of this source's own volume the
              rules remove. Nesting a second track for cross-source volume put
              two unlabelled measures in one control and read as neither. */}
          <div className="h-1.5 w-full rounded-full bg-muted/30 overflow-hidden mb-2">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${s.reductionFactor * 100}%`, background: s.color }}
            />
          </div>

          <p className="text-xs text-muted-foreground font-mono-db">
            {fmtGb(s.gbPerDay)}/day in · {Math.round(s.reductionFactor * 100)}% reduced ·{" "}
            {s.destinationCount === 0
              ? "no destination"
              : `${s.destinationCount} destination${s.destinationCount === 1 ? "" : "s"}`}
          </p>
        </button>
      ))}
    </div>
  );
}

interface AttentionItem {
  key: string;
  icon: LucideIcon;
  tone: "amber" | "muted";
  title: string;
  detail: string;
  cta: string;
  onClick: () => void;
}

function AttentionPanel({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded border border-success/25 bg-success/[0.04] p-4 flex items-start gap-3">
        <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-sm text-foreground">Nothing needs your attention</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Every source is routed, filtered events are retained, and no rules are waiting on review.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.key}
          className={`rounded border p-4 flex items-start justify-between gap-4 ${
            item.tone === "amber" ? "border-amber-500/30 bg-amber-500/[0.04]" : "border-border glass-card"
          }`}
        >
          <div className="flex items-start gap-3 min-w-0">
            <item.icon
              className={`w-4 h-4 mt-0.5 shrink-0 ${item.tone === "amber" ? "text-amber-400" : "text-muted-foreground"}`}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-sm text-foreground">{item.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.detail}</p>
            </div>
          </div>
          <button
            onClick={item.onClick}
            className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-info hover:text-info/80 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded transition-colors"
          >
            {item.cta}
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}

function RecentActivity({ events }: { events: ActivityEvent[] }) {
  const ICON: Record<ActivityEvent["kind"], LucideIcon> = {
    archive: Archive,
    unretained: AlertTriangle,
    connect: Database,
  };

  return (
    <div className="rounded border border-border glass-card divide-y divide-border">
      {events.map((e) => {
        const Icon = ICON[e.kind];
        return (
          <div key={e.id} className="flex items-start gap-2.5 p-3">
            <Icon
              className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                e.kind === "unretained" ? "text-amber-400" : e.kind === "archive" ? "text-info" : "text-muted-foreground/60"
              }`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground/90 leading-snug">{e.text}</p>
              {e.detail && <p className="text-xs text-muted-foreground/60 font-mono-db mt-0.5">{e.detail}</p>}
            </div>
            <span className="text-xs text-muted-foreground/60 font-mono-db shrink-0">{e.minutesAgo}m ago</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { connected, routes, rules, coldStorageTargets } = useSession();
  const sourceCount = connected.filter((c) => c.kind === "source").length;
  const destCount = connected.filter((c) => c.kind === "destination").length;

  // Nothing connected at all, so there is genuinely nothing to report on yet.
  if (sourceCount === 0) {
    return (
      <div className="w-full max-w-[1180px] mx-auto">
        <PageHeader
          title="Welcome to Databahn"
          subtitle="Connect your first source and Databahn routes it to your SIEM, filtered and mapped by Cruz."
        />
        <div className="max-w-2xl mx-auto">
          <OnboardingPath />
          <p className="text-xs text-muted-foreground/40 pt-4 pl-9">
            Cruz guides you through every step. No SME required.
          </p>
        </div>
      </div>
    );
  }

  const isSetup = destCount > 0;
  // Same inputs Pipeline overview renders its diagram from, so the money here
  // and the percentage there always describe the same traffic.
  const { sourceNodes, destNodes, edges } = buildFlowNodes(connected, routes);
  const savings = buildSavings(sourceNodes, destNodes, edges, rules);
  const reductionPct = Math.round(
    (savings.gbPerDayFiltered / Math.max(sourceNodes.reduce((a, s) => a + s.volume, 0), 1)) * 100,
  );

  const activity = buildActivity(savings.perSource, connected, coldStorageTargets);

  const proposed = rules.filter((r) => r.id.startsWith("flagged-") && !r.enabled);
  const unrouted = savings.perSource.filter((s) => s.destinationCount === 0);
  const attentionItems: AttentionItem[] = [
    proposed.length > 0 && {
      key: "proposed",
      icon: Flag,
      tone: "amber" as const,
      title: `${proposed.length} proposed exclusion${proposed.length === 1 ? "" : "s"} awaiting review`,
      detail: "Flagged from Search by an analyst. Nothing changes until you enable them.",
      cta: "Review",
      onClick: () => navigate("/pipeline", { state: { focusRuleId: proposed[0].id } }),
    },
    unrouted.length > 0 && {
      key: "unrouted",
      icon: AlertTriangle,
      tone: "amber" as const,
      title: `${unrouted.map((s) => s.name).join(", ")} not routed anywhere`,
      detail: `Collecting ${fmtGb(unrouted.reduce((a, s) => a + s.gbPerDay, 0))}/day with nowhere to land.`,
      cta: isSetup ? "Fix routing" : "Add destination",
      onClick: () => navigate(isSetup ? "/pipeline" : "/destinations"),
    },
    coldStorageTargets.length === 0 && {
      key: "cold",
      icon: Archive,
      tone: "muted" as const,
      title: "No cold storage connected",
      detail: "Filtered events aren't retained anywhere, so nothing can be recovered or searched later.",
      cta: "Connect",
      onClick: () => navigate("/pipeline", { state: { openColdStorage: true } }),
    },
  ].filter(Boolean) as AttentionItem[];

  return (
    <div className="w-full max-w-[1180px] mx-auto">
      <PageHeader
        title={isSetup ? "Your data plane" : "Welcome to Databahn"}
        subtitle={
          isSetup
            ? `${sourceCount} source${sourceCount === 1 ? "" : "s"} and ${destCount} destination${destCount === 1 ? "" : "s"} live right now.`
            : `${sourceCount} source${sourceCount === 1 ? "" : "s"} connected. Route to a destination to start delivering.`
        }
      />

      {/* space-y-8 and the small uppercase section label are the shapes the
          rules list already uses, so this page reads as part of the same app
          rather than introducing a third heading style of its own. */}
      <div className="space-y-8">
        {!isSetup && (
          <StaggerItem index={0}>
            <section>
              <SectionHeading title="Finish setup" />
              <OnboardingPath />
            </section>
          </StaggerItem>
        )}

        <StaggerItem index={1}>
          <section>
            <SectionHeading title={savings.isPotential ? "Projected cost impact" : "Cost impact"} />
            <CostTiles savings={savings} reductionPct={reductionPct} />
          </section>
        </StaggerItem>

        <StaggerItem index={2}>
          <section>
            <SectionHeading title="Savings by source" count={savings.perSource.length} />
            <SavingsBySource perSource={savings.perSource} />
          </section>
        </StaggerItem>

        <StaggerItem index={3}>
          <section>
            <SectionHeading title="Needs your attention" count={attentionItems.length} />
            <AttentionPanel items={attentionItems} />
          </section>
        </StaggerItem>

        <StaggerItem index={4}>
          <section>
            <SectionHeading title="Recent activity" />
            <RecentActivity events={activity} />
          </section>
        </StaggerItem>
      </div>

      {/* Naming the assumption is the point: an unexplained dollar figure is
          exactly the kind of thing this product tells people not to trust. */}
      <p className="text-[11px] text-muted-foreground/50 mt-8 text-center leading-relaxed">
        Savings estimated from published list rates. Your negotiated rate will differ.
      </p>
    </div>
  );
}
