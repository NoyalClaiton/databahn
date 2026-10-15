import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, CheckCircle2, ChevronDown, ChevronRight, Bell } from "lucide-react";
import {
  STATE_ORDER, trendPoints, fmtDuration, fmtAgo, clockAt, fmtCount,
  type Environment, type SourceView, type DestinationView, type AlertTarget,
} from "@/app/lib/environment";
import type { HealthState } from "@/app/data/fleet";
import { HEALTH_META, HealthDot } from "./HealthBadge";
import { Sparkline } from "./Sparkline";
import { useSession } from "@/app/lib/SessionContext";
import { whereAlertsGo } from "@/app/lib/notifications";

const VISIBLE_ROWS = 5;

function belowNormalLine(s: SourceView) {
  const inc = s.incident;
  if (inc?.parseErrorPct) return `${inc.parseErrorPct}% failing to parse · ${fmtDuration(s.sinceMin)}`;
  if (inc?.backlogMin) return `delivery ${inc.backlogMin} min behind · ${fmtDuration(s.sinceMin)}`;
  return `receiving ${Math.round((inc?.receivedFactor ?? 1) * 100)}% of normal · ${fmtDuration(s.sinceMin)}`;
}

/**
 * A state row, not a work item: which source, what state, for how long,
 * and its trend. Likely cause, severity, owner and Triage live in Alerts,
 * the work list above; repeating them here put the same problem on screen
 * twice. The whole row still opens the source's drawer.
 */
function Row({ state, name, line, trend, onClick }: { state: HealthState; name: string; line: string; trend?: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-muted/15 transition-colors focus-visible:outline-none focus-visible:bg-muted/20"
    >
      <HealthDot state={state} pulse={state === "stopped"} />
      <span className="text-sm text-foreground truncate w-64 shrink-0">{name}</span>
      <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">{line}</span>
      {trend && <div className="hidden md:block shrink-0">{trend}</div>}
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />
    </button>
  );
}

function Group({ title, count, children, tone }: { title: string; count: number; children: ReactNode; tone?: string }) {
  return (
    <div className="border-t border-border">
      <p className={`px-4 pt-2.5 pb-1 text-xs uppercase tracking-wide ${tone ?? "text-muted-foreground"}`}>
        {title} <span className="font-mono-db">· {count}</span>
      </p>
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  );
}

function DestinationLine({ d, onClick, compact }: { d: DestinationView; onClick: () => void; compact?: boolean }) {
  const problem = d.state === "stopped" || d.state === "degraded";
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-muted/15 transition-colors">
      <HealthDot state={d.state} pulse={d.state === "stopped"} />
      <span className={`text-sm text-foreground truncate shrink-0 ${compact ? "w-32" : "w-64"}`}>{d.name}</span>
      <span className="text-xs flex-1 min-w-0 truncate text-foreground/80">
        {problem
          ? `${d.incident?.observed} · ${fmtDuration(d.sinceMin)}`
          : d.state === "recovering"
            ? `recovered ${fmtAgo(d.sinceMin)}${compact ? "" : ` · ${d.incidents30d} incidents in 30 days`}`
            : "accepting everything"}
      </span>
      {!compact && <span className="text-xs font-mono-db text-muted-foreground shrink-0">{fmtCount(d.deliveredEpm)}/min delivered</span>}
    </button>
  );
}

/**
 * Health across every source and destination, built for "a source quietly
 * stopped and nobody noticed for days". Sources that aren't sending come
 * first, longest-silent at the top, each with when its last event arrived,
 * then sources below normal, then destinations, which reject data often
 * enough to deserve the same standing. Paused and learning sources are
 * kept apart so planned work never reads as an outage.
 *
 * `compact` is the executive lens: the distribution and destination status,
 * no per-source triage.
 */
export function SourceHealthWidget({
  env,
  range,
  onOpen,
  compact = false,
}: {
  env: Environment;
  range: string;
  onOpen: (t: AlertTarget) => void;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const { notifications } = useSession();
  const alertsTo = whereAlertsGo(notifications, "critical");
  const [showAllStopped, setShowAllStopped] = useState(false);
  const [showQuiet, setShowQuiet] = useState(false);
  const { counts, total } = env.summary;
  const stopped = env.sources.filter((s) => s.state === "stopped").sort((a, b) => b.lastEventMin - a.lastEventMin);
  const below = env.sources.filter((s) => s.state === "degraded").sort((a, b) => b.priority - a.priority);
  const recovering = env.sources.filter((s) => s.state === "recovering");
  const quiet = env.sources.filter((s) => s.state === "paused" || s.state === "learning");
  const toPipeline = (state?: HealthState | "issues") => navigate("/pipeline", { state: { healthFilter: state } });
  const open = (s: SourceView) => onOpen({ kind: "source", id: s.id, name: s.name });

  return (
    <div className="rounded border border-border glass-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-success live-pulse-dot" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground whitespace-nowrap">Fleet</span>
          <span className="text-xs text-muted-foreground font-mono-db whitespace-nowrap">
            {total} source{total === 1 ? "" : "s"}
            {compact ? "" : ` · ${env.destinations.length} destination${env.destinations.length === 1 ? "" : "s"}`}
          </span>
        </div>
        {!compact && <span className="text-xs text-muted-foreground">Health checks run every few minutes</span>}
      </div>

      <div className="px-4 pt-3 pb-3">
        <div className="flex h-2 rounded-full overflow-hidden bg-muted/30" role="img" aria-label="Source health distribution">
          {STATE_ORDER.map((st) =>
            counts[st] > 0 ? (
              <div
                key={st}
                style={{ width: `${(counts[st] / Math.max(total, 1)) * 100}%`, background: HEALTH_META[st].bar, minWidth: 4 }}
                title={`${counts[st]} ${HEALTH_META[st].label.toLowerCase()}`}
              />
            ) : null,
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5">
          {STATE_ORDER.filter((st) => counts[st] > 0).map((st) => (
            <button
              key={st}
              onClick={() => toPipeline(st)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              <HealthDot state={st} />
              <span className="font-mono-db text-foreground">{counts[st]}</span> {HEALTH_META[st].label.toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {!compact && stopped.length === 0 && below.length === 0 && (
        <div className="px-4 py-3 border-t border-border flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-foreground">
            Every source is sending at its normal level
            <span className="block text-xs text-muted-foreground mt-0.5">
              If one stops or drops well below its usual volume, it appears here and its owner is alerted.
            </span>
          </p>
        </div>
      )}

      {!compact && stopped.length > 0 && (
        <Group title="Not sending" count={stopped.length} tone="text-destructive">
          {(showAllStopped ? stopped : stopped.slice(0, VISIBLE_ROWS)).map((s) => (
            <Row
              key={s.id}
              state={s.state}
              name={s.name}
              line={`No events for ${fmtDuration(s.lastEventMin)} · last event ${clockAt(s.lastEventMin)}`}
              trend={<Sparkline points={trendPoints(s, range)} baseline={s.normalEps} color={HEALTH_META.stopped.bar} label={`${s.name} trend`} />}
              onClick={() => open(s)}
            />
          ))}
          {stopped.length > VISIBLE_ROWS && (
            <button onClick={() => setShowAllStopped((v) => !v)} className="w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground">
              {showAllStopped ? "Show fewer" : `Show ${stopped.length - VISIBLE_ROWS} more`}
            </button>
          )}
        </Group>
      )}

      {!compact && below.length > 0 && (
        <Group title="Below normal" count={below.length} tone="text-amber-400">
          {below.map((s) => (
            <Row
              key={s.id}
              state={s.state}
              name={s.name}
              line={belowNormalLine(s)}
              trend={<Sparkline points={trendPoints(s, range)} baseline={s.normalEps} color={HEALTH_META.degraded.bar} label={`${s.name} trend`} />}
              onClick={() => open(s)}
            />
          ))}
        </Group>
      )}

      {!compact && recovering.length > 0 && (
        <Group title="Recovering" count={recovering.length} tone="text-info">
          {recovering.map((s) => (
            <Row
              key={s.id}
              state={s.state}
              name={s.name}
              line={s.recovered ? `Recovered ${fmtAgo(s.sinceMin)} after ${fmtDuration(s.recovered.downMin)} down, watching for 30 min` : "Recovering"}
              onClick={() => open(s)}
            />
          ))}
        </Group>
      )}

      {/* Destinations, the far end of the pipe. Data missing from the SIEM
          looks the same to an analyst whichever end failed. */}
      {env.destinations.length > 0 && (
        <div className="border-t border-border">
          <p className="px-4 pt-2.5 pb-1 text-xs uppercase tracking-wide text-muted-foreground">
            Destinations <span className="font-mono-db">· {env.destinations.length}</span>
          </p>
          <div className="pb-1">
            {env.destinations.map((d) => (
              <DestinationLine key={d.id} d={d} compact={compact} onClick={() => onOpen({ kind: "destination", id: d.id, name: d.name })} />
            ))}
          </div>
        </div>
      )}

      {!compact && quiet.length > 0 && (
        <div className="border-t border-border">
          <button
            onClick={() => setShowQuiet((v) => !v)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={showQuiet}
          >
            <span>
              {counts.paused > 0 && `${counts.paused} paused for maintenance`}
              {counts.paused > 0 && counts.learning > 0 && " · "}
              {counts.learning > 0 && `${counts.learning} learning normal volume`}
              <span className="text-muted-foreground/60">, no alerts while in this state</span>
            </span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showQuiet ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          {showQuiet && (
            <div className="px-4 pb-3 space-y-1.5">
              {quiet.map((s) => (
                <button key={s.id} onClick={() => open(s)} className="w-full text-left flex items-center gap-2 text-xs hover:text-foreground text-muted-foreground">
                  <HealthDot state={s.state} />
                  <span className="text-foreground/85 truncate">{s.name}</span>
                  <span className="truncate">
                    {s.state === "paused" && s.pause
                      ? `${s.pause.reason}, until ${clockAt(-s.pause.untilMin)}`
                      : s.learning
                        ? `alerts start in ${s.learning.daysLeft}d`
                        : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-border px-4 py-2.5 flex items-center justify-between gap-3 bg-muted/5">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0">
          <Bell className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {alertsTo ? `Alerts go to ${alertsTo} when something stops, gets worse, or recovers` : "Alerts stay in Databahn"}
          </span>
          <button onClick={() => navigate("/notifications")} className="shrink-0 text-primary hover:text-primary/80 underline underline-offset-2">
            {alertsTo ? "Manage" : "Set up notifications"}
          </button>
        </p>
        <button onClick={() => toPipeline()} className="shrink-0 text-xs text-primary hover:text-primary/80 inline-flex items-center gap-1 underline underline-offset-2">
          All sources
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
