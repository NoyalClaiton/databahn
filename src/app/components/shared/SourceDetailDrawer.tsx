import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  X, UserCheck, Bell, CheckCircle2, AlertTriangle, PauseCircle, KeyRound, Info,
  ArrowRight, MessageCircleQuestion, Clock, Server, Link2, MoreHorizontal, ChevronDown, ChevronRight, ChevronLeft, ListFilter, UserX,
} from "lucide-react";
import { useSession } from "@/app/lib/SessionContext";
import { useCruz } from "@/app/lib/CruzContext";
import {
  useEnvironment, trendPoints, funnelFor, fmtDuration, fmtAgo, clockAt, dateAt, fmtCount, fmtSize,
  type SourceView, type DestinationView, type AlertTarget,
} from "@/app/lib/environment";
import { SEVERITY_FOR_AREA, type Incident, type LikelyCause, type HealthCheck, type Severity } from "@/app/data/fleet";
import { whereAlertsGo } from "@/app/lib/notifications";
import { reductionSplit } from "@/app/lib/savings";
import { HEALTH_META, HealthBadge, SeverityBadge } from "./HealthBadge";
import { Sparkline } from "./Sparkline";
import { ContextualHelpTip } from "./ContextualHelpTip";
import { LiveTestState } from "./LiveTestState";
import { VendorLogo, hasVendorLogo, chipSafeColor } from "./VendorLogo";
import { FunnelBars } from "./Funnel";
import { DRAWER_WIDTH } from "./PageLayout";
import { PauseDialog } from "./PauseDialog";
import { useEscape } from "@/app/lib/useEscape";
import { useEntityActions } from "./EntityActions";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { ME, PEOPLE, initials, type Owner } from "@/app/lib/people";

const COLLECTION_LABEL = { syslog: "Syslog", api: "API", agent: "Agent" } as const;

/* ------------------------------------------------------------------ */
/* Building blocks                                                      */
/* ------------------------------------------------------------------ */

function Block({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mb-6 last:mb-0">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Signal({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "bad" | "warn" | "good" }) {
  const color = tone === "bad" ? "text-destructive" : tone === "warn" ? "text-amber-400" : tone === "good" ? "text-success" : "text-foreground";
  return (
    <div className="rounded border border-border bg-background/40 px-3 py-2 min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-mono-db text-sm truncate ${color}`}>{value}</p>
      {sub && (
        <p className="text-xs text-muted-foreground/70 mt-0.5 truncate" title={sub}>
          {sub}
        </p>
      )}
    </div>
  );
}

const LIKELIHOOD_CLASS: Record<LikelyCause["likelihood"], string> = {
  "Most likely": "border-primary/50 bg-primary/15 text-primary",
  Possible: "border-border bg-muted/20 text-foreground/80",
  Unlikely: "border-border text-muted-foreground",
  "Ruled out": "border-border text-muted-foreground/70 line-through decoration-muted-foreground/50",
};

function checkTone(h: HealthCheck): "bad" | "warn" | "good" {
  return h.status === "failed" ? "bad" : h.status === "warning" ? "warn" : "good";
}

function Cause({ c }: { c: LikelyCause }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className={`shrink-0 mt-0.5 text-[10px] border rounded px-1.5 py-[1px] whitespace-nowrap ${LIKELIHOOD_CLASS[c.likelihood]}`}>{c.likelihood}</span>
      <div className="min-w-0">
        <p className={`text-sm ${c.likelihood === "Ruled out" ? "text-muted-foreground" : "text-foreground/85"}`}>{c.cause}</p>
        <p className="text-xs text-muted-foreground">{c.evidence}</p>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* What to do: the one area that answers "what's wrong, what do I do"  */
/* ------------------------------------------------------------------ */

/**
 * Always visible, above the tabs. Three things only: the most likely cause
 * with its evidence, the action, and the impact in one line. Enough to act
 * without scrolling or switching tabs. The action exists as a button only
 * where Databahn can act on its own side; otherwise it's a health check that
 * confirms the user's own fix by listening for data arriving again.
 */
function WhatToDo({
  inc,
  state,
  targetLabel,
  listen,
  impact,
  onResolved,
}: {
  inc: Incident;
  state: "stopped" | "degraded" | "recovering" | string;
  targetLabel: string;
  listen: boolean;
  impact: ReactNode;
  onResolved: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const { notifications } = useSession();
  const recoveryTo = notifications.recoveryNotices ? whereAlertsGo(notifications, SEVERITY_FOR_AREA[inc.area]) : null;
  const likely = inc.causes.find((c) => c.likelihood === "Most likely") ?? inc.causes[0];
  // Neutral card with a thin coloured edge: the badge and dot already say
  // how bad it is, the frame doesn't need to shout it again.
  const tone = state === "stopped" ? "border-border bg-card shadow-[inset_3px_0_0_var(--db-red)]" : "border-border bg-card shadow-[inset_3px_0_0_#f59e0b]";

  return (
    <div className={`rounded-lg border p-5 ${tone}`}>
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">What to do</h3>

      <div className="grid grid-cols-[96px_1fr] gap-x-4 gap-y-4">
        <p className="text-xs text-muted-foreground pt-0.5">Likely cause</p>
        <div>
          {/* Body size, set apart by weight: the drawer title above is the
              only thing at title size. */}
          <p className="text-sm font-semibold text-foreground">{likely.cause}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{likely.evidence}</p>
        </div>

        <p className="text-xs text-muted-foreground pt-1.5">Action</p>
        <div>
          {phase === "idle" &&
            (inc.action ? (
              <>
                <div className="flex items-center gap-3 flex-wrap">
                  <Button size="sm" onClick={() => setPhase("running")}>
                    {inc.action.kind === "reauth" && <KeyRound className="w-3.5 h-3.5" />}
                    {inc.action.label}
                  </Button>
                  <button onClick={() => setPhase("running")} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                    I fixed it on my side, run health check
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {inc.action.detail}
                  {inc.action.kind === "databahn" && " Only Databahn's side changes."}
                </p>
              </>
            ) : (
              <>
                <Button size="sm" onClick={() => setPhase("running")}>
                  Run health check
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  The likely cause is on your side. Work through <span className="text-foreground/80">What to check</span> below, then run a
                  health check and Databahn confirms the moment data arrives.
                </p>
              </>
            ))}
          {phase !== "idle" && (
            <LiveTestState
              targetLabel={targetLabel}
              mode={listen ? "listen" : "check"}
              successSampleLines={inc.sampleLines}
              checklist={inc.checks}
              escapeHatchLabel="Not yet, keep investigating"
              onComplete={(result) => {
                if (result === "success") {
                  onResolved();
                  setPhase("done");
                } else if (result === "skipped") setPhase("idle");
              }}
            />
          )}
          {phase === "done" && (
            <p className="text-xs text-success mt-3 flex items-start gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              Data is flowing again. Marked as recovering, and Databahn watches it for 30 minutes.
              {recoveryTo ? ` A recovery notice went to ${recoveryTo}.` : ""}
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground pt-0.5">Impact</p>
        <div className="text-xs text-muted-foreground space-y-1">{impact}</div>
      </div>
    </div>
  );
}

function ImpactLine({ inc, gb, verb, siblings, onOpen }: { inc: Incident; gb: number; verb: string; siblings?: SourceView[]; onOpen?: (t: AlertTarget) => void }) {
  return (
    <>
      <p className="text-xs text-foreground">{inc.impact}</p>
      <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="font-mono-db text-foreground/90">~{fmtSize(gb)}</span> {verb}
        <span className="text-muted-foreground/40">·</span>
        {inc.backfill.available ? (
          <span className="text-success inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> recoverable
          </span>
        ) : (
          <span className="text-amber-300 inline-flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" aria-hidden="true" /> not recoverable
          </span>
        )}
        {inc.detections && inc.detections.length > 0 && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <ContextualHelpTip content={inc.detections.join(", ")}>
              <span className="underline decoration-dotted underline-offset-2">
                {inc.detections.length} detection{inc.detections.length === 1 ? "" : "s"} affected
              </span>
            </ContextualHelpTip>
          </>
        )}
      </p>
      {siblings && siblings.length > 0 && (
        <p className="text-muted-foreground flex items-start gap-1.5">
          <Link2 className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Same cause as{" "}
            {siblings.map((m, i) => (
              <span key={m.id}>
                {i > 0 && ", "}
                <button onClick={() => onOpen?.({ kind: "source", id: m.id, name: m.name })} className="underline underline-offset-2 hover:text-foreground">
                  {m.name}
                </button>
              </span>
            ))}
            , resolving here resolves both
          </span>
        </p>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                 */
/* ------------------------------------------------------------------ */

function TriageTab({ inc, signals, onAskCruz }: { inc: Incident; signals: ReactNode; onAskCruz: () => void }) {
  const [showRuledOut, setShowRuledOut] = useState(false);
  const likely = inc.causes.find((c) => c.likelihood === "Most likely") ?? inc.causes[0];
  const others = inc.causes.filter((c) => c !== likely && c.likelihood !== "Ruled out");
  const ruledOut = inc.causes.filter((c) => c.likelihood === "Ruled out");
  return (
    <>
      <Block title="What to check">
        <ol className="space-y-2">
          {inc.checks.map((c, i) => (
            <li key={c} className="flex gap-3 text-sm text-foreground/80">
              <span className="w-5 h-5 rounded-full bg-muted/30 text-xs font-mono-db text-muted-foreground flex items-center justify-center shrink-0">{i + 1}</span>
              {c}
            </li>
          ))}
        </ol>
        <button onClick={onAskCruz} className="mt-3 inline-flex items-center gap-1.5 text-xs text-info hover:text-info/80">
          <MessageCircleQuestion className="w-3.5 h-3.5" aria-hidden="true" />
          Ask Cruz about this
        </button>
      </Block>

      {(others.length > 0 || ruledOut.length > 0) && (
        <Block title="Other possible causes">
          <ul className="space-y-2.5">
            {others.map((c) => (
              <Cause key={c.cause} c={c} />
            ))}
          </ul>
          {ruledOut.length > 0 && (
            <>
              <button
                onClick={() => setShowRuledOut((v) => !v)}
                aria-expanded={showRuledOut}
                className={`inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ${others.length ? "mt-3" : ""}`}
              >
                {ruledOut.length} ruled out
                <ChevronDown className={`w-3 h-3 transition-transform ${showRuledOut ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
              {showRuledOut && (
                <ul className="space-y-2.5 mt-2.5">
                  {ruledOut.map((c) => (
                    <Cause key={c.cause} c={c} />
                  ))}
                </ul>
              )}
            </>
          )}
        </Block>
      )}

      <Block title="Signals">
        <div className="grid grid-cols-3 gap-2">{signals}</div>
      </Block>
    </>
  );
}

function ActivityTab({
  inc,
  alertedMin,
  owner,
  severity,
  assignee,
  recovered,
  incidents30d,
  since,
}: {
  inc?: Incident;
  alertedMin?: number;
  owner: string;
  severity?: Severity;
  assignee?: Owner;
  recovered?: { downMin: number; cause: string; sinceMin: number };
  incidents30d: number;
  since?: string;
}) {
  const navigate = useNavigate();
  const { notifications } = useSession();
  const to = severity ? whereAlertsGo(notifications, severity) : null;
  const who = [to, notifications.notifyOwners ? owner : null].filter(Boolean).join(" and ");
  const events = [
    ...(inc?.timeline ?? []).map((t) => ({ m: t.minutesAgo, text: t.text })),
    ...(assignee ? [{ m: (Date.now() - assignee.at) / 60000, text: ownershipText(assignee) }] : []),
    ...(recovered ? [{ m: recovered.sinceMin, text: `Recovered after ${fmtDuration(recovered.downMin)}. ${recovered.cause}` }] : []),
  ].sort((a, b) => b.m - a.m);

  return (
    <>
      <Block title="What happened">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing notable recently.</p>
        ) : (
          <ol className="relative border-l border-border ml-1.5 space-y-2.5">
            {events.map((e, i) => (
              <li key={i} className="pl-4 relative">
                <span className="absolute -left-[4.5px] top-1.5 w-2 h-2 rounded-full bg-muted-foreground/50" aria-hidden="true" />
                <p className="text-sm text-foreground/85">{e.text}</p>
                <p className="text-xs font-mono-db text-muted-foreground">
                  {clockAt(e.m)} · {fmtAgo(e.m)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Block>

      {severity && (
        <Block title="Notifications">
          <p className="text-sm text-foreground/85 flex items-center gap-2">
            <Bell className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            {to ? (alertedMin !== undefined ? `Alerted ${who} at ${clockAt(alertedMin)}` : `Alerting ${who}`) : "Alerts stay in Databahn"}
          </p>
          <button onClick={() => navigate("/notifications")} className="mt-2 text-xs text-primary hover:text-primary/80">
            {to ? "Manage notifications" : "Set up notifications"}
          </button>
        </Block>
      )}

      <Block title="History">
        <p className="text-sm text-foreground/85">
          {incidents30d === 0 ? "No other incidents in the last 30 days." : `${incidents30d} other incident${incidents30d === 1 ? "" : "s"} in the last 30 days.`}
        </p>
        {since && <p className="text-xs text-muted-foreground mt-1">{since}</p>}
      </Block>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Ownership                                                            */
/* ------------------------------------------------------------------ */

const VIA_LABEL = { app: "", slack: " via Slack", teams: " via Teams" } as const;

/** One line for the Activity timeline, naming who did what. */
function ownershipText(a: Owner) {
  const who = a.isMe ? "You" : a.person.name;
  if (a.previous) return `${who} took over from ${a.previous.id === ME ? "you" : a.previous.name}`;
  if (a.assignedBy) return `${a.assignedBy.id === ME ? "You" : a.assignedBy.name} assigned it to ${a.isMe ? "you" : a.person.name}${a.isMe ? "" : `, notified them`}`;
  return `${who} took ownership${VIA_LABEL[a.via]}`;
}

function Avatar({ name, me }: { name: string; me?: boolean }) {
  return (
    <span
      // The same neutral mark as OwnerAvatar in lists, a ring for you.
      className={`w-6 h-6 rounded-full bg-muted/50 text-foreground/85 text-[10px] font-semibold flex items-center justify-center shrink-0 ${
        me ? "ring-1 ring-primary ring-offset-1 ring-offset-card" : ""
      }`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/**
 * Who's handling this, and changing that. Unassigned offers "I'm on it";
 * a teammate's claim is shown by name, with "Take over" rather than a lock,
 * nobody should be blocked from acting during an outage, but nobody should
 * work it unaware of each other either. Assign lists the source's owning
 * team first.
 */
function OwnerControl({
  assignee,
  owningTeam,
  onSet,
  onRelease,
}: {
  assignee?: Owner;
  owningTeam: string;
  onSet: (patch: { ownerId: string; assignedBy?: string; previousOwnerId?: string }) => void;
  onRelease: () => void;
}) {
  const team = PEOPLE.filter((p) => p.team === owningTeam);
  const others = PEOPLE.filter((p) => p.team !== owningTeam);
  const assign = (id: string) =>
    onSet({ ownerId: id, assignedBy: id === ME ? undefined : ME, previousOwnerId: assignee && assignee.person.id !== id ? assignee.person.id : undefined });

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 border border-border">
          Assign <ChevronDown className="w-3 h-3" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[100] w-56">
        {team.length > 0 && <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">{owningTeam}</DropdownMenuLabel>}
        {team.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => assign(p.id)} disabled={assignee?.person.id === p.id}>
            <Avatar name={p.name} me={p.id === ME} /> {p.id === ME ? `${p.name} (you)` : p.name}
          </DropdownMenuItem>
        ))}
        {team.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Everyone else</DropdownMenuLabel>
        {others.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => assign(p.id)} disabled={assignee?.person.id === p.id}>
            <Avatar name={p.name} me={p.id === ME} /> {p.id === ME ? `${p.name} (you)` : p.name}
            <span className="ml-auto text-xs text-muted-foreground">{p.team.replace(" team", "")}</span>
          </DropdownMenuItem>
        ))}
        {assignee && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onRelease}>
              <UserX className="w-4 h-4" /> Unassign
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (!assignee)
    return (
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground">Unassigned</span>
        <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => onSet({ ownerId: ME })}>
          <UserCheck className="w-3.5 h-3.5" /> I'm on it
        </Button>
        {menu}
      </div>
    );

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Avatar name={assignee.person.name} me={assignee.isMe} />
      <span className="text-xs text-foreground">
        {assignee.isMe ? "You're on it" : `${assignee.person.name} is on it`}
        <span className="text-muted-foreground">
          {" "}
          · {fmtDuration((Date.now() - assignee.at) / 60000)}
          {VIA_LABEL[assignee.via]}
        </span>
      </span>
      {!assignee.isMe && (
        <button
          onClick={() => onSet({ ownerId: ME, previousOwnerId: assignee.person.id })}
          className="shrink-0 h-7 px-2 rounded text-xs text-foreground hover:bg-muted/30 border border-border"
        >
          Take over
        </button>
      )}
      {menu}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                                */
/* ------------------------------------------------------------------ */

function Shell({
  title,
  kind,
  logoId,
  color,
  badges,
  meta,
  statusLine,
  ownerSlot,
  menu,
  headerAction,
  actions,
  back,
  onClose,
  children,
}: {
  title: string;
  /** Said in the header, so moving from a source to a destination is never
   * mistaken for the same drawer showing something else. */
  kind: "source" | "destination";
  logoId: string;
  color: string;
  badges: ReactNode;
  meta: string;
  /** What's wrong and for how long, in one line. */
  statusLine?: ReactNode;
  /** Ownership, pinned in the header so it's never scrolled away. */
  ownerSlot?: ReactNode;
  /** Rare actions, out of the way. */
  menu: { label: string; icon: typeof Info; onSelect: () => void }[];
  /** A visible header action beside the menu (Pause alerts). */
  headerAction?: ReactNode;
  /** The shared action menu (same as the Pipeline tables'), after `menu`. */
  actions?: ReactNode;
  /** Opened from inside another drawer: the way back to it. */
  back?: { label: string; onBack: () => void };
  onClose: () => void;
  children: ReactNode;
}) {
  // Shared Escape: a dialog opened from the drawer (Pause, Disconnect)
  // closes first, the drawer on the next press.
  useEscape(onClose);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[95] bg-background/70 backdrop-blur-sm flex justify-end"
        style={{ paddingRight: "var(--cruz-width, 0px)" }}
        onClick={onClose}
      >
        <motion.div
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className={`w-full ${DRAWER_WIDTH} h-full bg-card border-l border-border overflow-y-auto`}
          role="dialog"
          aria-label={`${title} details`}
        >
          <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-4">
            {back && (
              <button
                onClick={back.onBack}
                className="mb-3 -ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-w-full"
              >
                <ChevronLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">Back to {back.label}</span>
              </button>
            )}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shrink-0" style={{ color: chipSafeColor(color) }}>
                  {hasVendorLogo(logoId) ? <VendorLogo connectorId={logoId} size={20} /> : <span className="text-xs font-bold">{title.slice(0, 2).toUpperCase()}</span>}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{kind === "source" ? "Source" : "Destination"}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-base font-semibold text-foreground truncate">{title}</p>
                    {badges}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{meta}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {headerAction}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button aria-label="More actions" className="w-8 h-8 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-[100] w-60">
                    {menu.map((m) => (
                      <DropdownMenuItem key={m.label} onSelect={m.onSelect}>
                        <m.icon className="w-4 h-4" /> {m.label}
                      </DropdownMenuItem>
                    ))}
                    {actions && <DropdownMenuSeparator />}
                    {actions}
                  </DropdownMenuContent>
                </DropdownMenu>
                <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {(statusLine || ownerSlot) && (
              <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
                <div className="text-sm min-w-0">{statusLine}</div>
                {ownerSlot}
              </div>
            )}
          </div>
          <div className="px-6 py-5">{children}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/** Notes that don't warrant a focus area (paused, learning, a credential
 * expiring, a destination refusing this source's data). */
function Note({ tone, icon: Icon, children, action }: { tone: "info" | "warn" | "muted" | "primary"; icon: typeof Info; children: ReactNode; action?: ReactNode }) {
  const cls = {
    info: "border-info/35 bg-info/[0.06]",
    warn: "border-amber-500/30 bg-amber-500/[0.04]",
    muted: "border-border bg-muted/10",
    primary: "border-primary/30 bg-primary/[0.05]",
  }[tone];
  const iconCls = { info: "text-info", warn: "text-amber-400", muted: "text-muted-foreground", primary: "text-primary" }[tone];
  return (
    <div className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${cls}`}>
      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${iconCls}`} aria-hidden="true" />
      <div className="flex-1 min-w-0 text-sm text-foreground/90">{children}</div>
      {action}
    </div>
  );
}

type TabKey = "triage" | "flow" | "activity";

/** Classic underline tabs: a full-width row on a divider, the active tab
 * marked by a 2px primary bar, the same bar the side nav uses for the
 * current page. Unmistakably tabs, and never mistaken for an action. */
function DrawerTabs({ tabs, value, onChange }: { tabs: { value: TabKey; label: string }[]; value: TabKey; onChange: (t: TabKey) => void }) {
  return (
    <div className="flex items-center gap-6 border-b border-border" role="tablist">
      {tabs.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={`relative -mb-px pb-2.5 pt-1 text-sm transition-colors focus-visible:outline-none focus-visible:text-foreground ${
              active ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            <span
              className={`absolute left-0 right-0 bottom-0 h-0.5 rounded-full transition-colors ${active ? "bg-primary" : "bg-transparent"}`}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Source                                                               */
/* ------------------------------------------------------------------ */

function SourcePanel({
  s,
  range,
  onClose,
  onOpen,
  initialTab,
  back,
  onTabChange,
}: {
  s: SourceView;
  range: string;
  onClose: () => void;
  onOpen: (t: AlertTarget) => void;
  initialTab?: TabKey;
  back?: { label: string; onBack: () => void };
  onTabChange?: (t: TabKey) => void;
}) {
  const navigate = useNavigate();
  const env = useEnvironment();
  const { updateSourceStatus, rules } = useSession();
  const { open: openCruz } = useCruz();
  const [riskDone, setRiskDone] = useState(false);
  const [pausing, setPausing] = useState(false);
  const sourceActions = useEntityActions([{ kind: "source", s }]);
  // Keeps the focus area mounted through the moment the fix lands, so its
  // confirmation stays instead of vanishing as the state flips.
  const [justResolved, setJustResolved] = useState(false);
  const meta = HEALTH_META[s.state];
  const inc = s.incident;
  const problem = s.state === "stopped" || s.state === "degraded";
  const [tab, setTab] = useState<TabKey>(initialTab ?? (problem ? "triage" : "flow"));
  const siblings = inc?.groupId ? env.sources.filter((m) => m.id !== s.id && m.incident?.groupId === inc.groupId) : [];
  const alertedMin = inc?.timeline.find((t) => /alert sent/i.test(t.text))?.minutesAgo;
  const funnel = funnelFor(s, range, "total", env.destinations);
  const outageMin = s.state === "recovering" && s.recovered ? s.recovered.downMin : s.sinceMin;
  const missedFactor =
    inc?.receivedFactor !== undefined && inc.receivedFactor < 1 ? 1 - inc.receivedFactor : inc?.parseErrorPct ? inc.parseErrorPct / 100 : 1;
  const missedGb = inc?.backlogMin ? (s.gbPerDay * inc.backlogMin) / 1440 : ((s.gbPerDay * outageMin) / 1440) * missedFactor;
  const group = [s, ...siblings];

  const resolveAll = () => {
    for (const m of group) updateSourceStatus(m.id, { recoveredAt: Date.now(), downMin: outageMin, ackAt: undefined });
  };

  const statusLine = problem && inc ? (
    <p className={meta.text}>
      {inc.observed} for {fmtDuration(s.sinceMin)}
      <span className="text-muted-foreground">
        {" "}
        · {s.state === "stopped" ? `last event ${clockAt(s.sinceMin)}` : `normally ${fmtCount(s.normalEpm)}/min`}
      </span>
    </p>
  ) : s.state === "healthy" ? (
    <p className="text-success">
      Arriving normally <span className="text-muted-foreground">· last event {s.lastEventMin < 1 ? "just now" : fmtAgo(s.lastEventMin)}</span>
    </p>
  ) : undefined;

  const tabs: { value: TabKey; label: string }[] = [
    ...(problem && inc ? [{ value: "triage" as const, label: "Triage" }] : []),
    { value: "flow", label: "Data flow" },
    { value: "activity", label: "Activity" },
  ];

  return (
    <Shell
      kind="source"
      title={s.name}
      logoId={s.connectorId}
      color={s.color}
      onClose={onClose}
      back={back}
      badges={
        <>
          <HealthBadge state={s.state} size="xs" />
          {s.severity && problem && <SeverityBadge severity={s.severity} />}
        </>
      }
      meta={`${s.group} · ${COLLECTION_LABEL[s.collection]}${s.collector ? ` via ${s.collector}` : ""} · ${s.owner}`}
      statusLine={statusLine}
      ownerSlot={
        problem ? (
          <OwnerControl
            assignee={s.assignee}
            owningTeam={s.owner}
            onSet={(patch) =>
              group.forEach((m) =>
                updateSourceStatus(m.id, { ackAt: Date.now(), ownerVia: "app", released: false, assignedBy: undefined, previousOwnerId: undefined, ...patch }),
              )
            }
            onRelease={() => group.forEach((m) => updateSourceStatus(m.id, { ackAt: undefined, ownerId: undefined, released: true }))}
          />
        ) : undefined
      }
      menu={[
        { label: "Ask Cruz about this source", icon: MessageCircleQuestion, onSelect: () => openCruz(`What should I check for ${s.name}?`) },
      ]}
      actions={sourceActions.menu}
      headerAction={
        s.state !== "paused" ? (
          <button
            onClick={() => setPausing(true)}
            className="h-8 px-2.5 mr-1 rounded border border-border text-xs text-foreground hover:bg-muted/30 inline-flex items-center gap-1.5"
          >
            <PauseCircle className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" /> Pause alerts
          </button>
        ) : undefined
      }
    >
      <div className="space-y-3 mb-6">
        {inc && (problem || justResolved) && (
          <WhatToDo
            inc={inc}
            state={s.state}
            targetLabel={s.name}
            listen={s.collection === "syslog"}
            onResolved={() => {
              setJustResolved(true);
              resolveAll();
            }}
            impact={
              <ImpactLine
                inc={inc}
                gb={missedGb}
                verb={inc.backlogMin ? `queued, ${inc.backlogMin} min behind` : `missed over ${fmtDuration(outageMin)}`}
                siblings={siblings}
                onOpen={onOpen}
              />
            }
          />
        )}

        {s.state === "recovering" && s.recovered && !justResolved && (
          <Note tone="info" icon={CheckCircle2}>
            <span className="text-info font-medium">Recovered {fmtAgo(s.sinceMin)}</span> after {fmtDuration(s.recovered.downMin)} down. Watching for
            30 minutes before marking it healthy.
          </Note>
        )}
        {s.state === "paused" && s.pause && (
          <Note
            tone="muted"
            icon={PauseCircle}
            // Any pause can be ended here, including ones planned outside
            // Databahn (a cluster upgrade, a lab rebuild).
            action={
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs shrink-0"
                onClick={() => updateSourceStatus(s.id, { pausedUntil: undefined, pausedAt: undefined, pauseReason: undefined, resumedAt: Date.now() })}
              >
                Resume
              </Button>
            }
          >
            <span className="font-medium text-foreground">Paused: {s.pause.reason}</span>
            <span className="text-muted-foreground">
              {" "}
              · by {s.pause.by} · {s.pause.indefinite ? "until someone resumes it" : `alerts held until ${clockAt(-s.pause.untilMin)}, then monitoring resumes on its own`}
            </span>
          </Note>
        )}
        {s.state === "learning" && s.learning && (
          <Note tone="primary" icon={Info}>
            Learning this source's normal volume. Volume alerts start in {s.learning.daysLeft} day{s.learning.daysLeft === 1 ? "" : "s"}; until
            then it still alerts if data stops completely.
          </Note>
        )}
        {s.deliveryIssue && (
          <Note
            tone="warn"
            icon={AlertTriangle}
            action={
              <button
                onClick={() => {
                  const d = env.destinations.find((x) => s.deliveryIssue?.startsWith(x.name));
                  if (d) onOpen({ kind: "destination", id: d.id, name: d.name });
                }}
                className="text-xs text-primary hover:text-primary/80 shrink-0 inline-flex items-center gap-1"
              >
                Triage <ArrowRight className="w-3 h-3" />
              </button>
            }
          >
            Sending normally, but {s.deliveryIssue.replace(" not accepting", " isn't accepting it").replace(" rejecting", " is rejecting")}
            {s.deliveryIssue.includes("rejecting") ? " of its events" : ""}.
          </Note>
        )}
        {s.risk && (
          <Note
            tone="warn"
            icon={KeyRound}
            action={
              !riskDone ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs shrink-0"
                  onClick={() => {
                    setRiskDone(true);
                    setTimeout(() => updateSourceStatus(s.id, { riskResolved: true }), 1200);
                  }}
                >
                  {s.risk.actionLabel}
                </Button>
              ) : undefined
            }
          >
            {riskDone ? "Renewed. Nothing will break on this date." : `${s.risk.text}. ${s.risk.detail}`}
          </Note>
        )}
        {s.notice && (
          <Note tone="muted" icon={Info}>
            {s.notice.title}. {s.notice.detail}
          </Note>
        )}
      </div>

      <div className="mb-5">
        <DrawerTabs
          tabs={tabs}
          value={tabs.some((t) => t.value === tab) ? tab : "flow"}
          onChange={(t) => {
            setTab(t);
            onTabChange?.(t);
          }}
        />
      </div>

      {tab === "triage" && inc && problem && (
        <TriageTab
          inc={inc}
          onAskCruz={() => openCruz(`What should I check for ${s.name}?`)}
          signals={
            <>
              <Signal label="First event" value={dateAt(s.firstEventDaysAgo)} />
              <Signal
                label="Last event"
                value={s.state === "stopped" ? fmtAgo(s.lastEventMin) : "just now"}
                sub={s.state === "stopped" ? `at ${clockAt(s.lastEventMin)}` : undefined}
                tone={s.state === "stopped" ? "bad" : undefined}
              />
              <Signal label="Health check" value={s.healthCheck.status} sub={s.healthCheck.detail} tone={checkTone(s.healthCheck)} />
              <Signal label="Received/min" value={fmtCount(s.epm.received)} sub={`normal ${fmtCount(s.normalEpm)}`} tone={s.epm.received < s.normalEpm * 0.8 ? "bad" : undefined} />
              <Signal
                label="Processed/min"
                value={fmtCount(s.epm.processed)}
                sub={s.epm.received > 0 ? `${Math.round(s.processedFraction * 100)}% of received` : "nothing received"}
                tone={s.epm.received > 0 && s.processedFraction < 0.95 ? "warn" : undefined}
              />
              <Signal label="Forwarded/min" value={fmtCount(s.epm.forwarded)} sub={s.destNames.join(", ") || "no destination"} />
            </>
          }
        />
      )}

      {(tab === "flow" || (tab === "triage" && !problem)) && (
        <>
          <Block
            title={`Last ${range}`}
            aside={<span className="text-xs text-muted-foreground font-mono-db">≈{fmtCount(s.epm.received)}/min received now</span>}
          >
            <FunnelBars
              funnel={funnel}
              mode="total"
              reducedSplit={reductionSplit(s.connectorId, s.reduction, rules)
                .filter((c) => c.share > 0)
                .map((c) => ({ label: c.category, share: c.share }))}
            />
          </Block>
          <Block
            title={`Received · ${range}`}
            aside={
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block w-4 border-t border-dashed border-muted-foreground/60" aria-hidden="true" /> normal
              </span>
            }
          >
            <div className="rounded border border-border bg-background/40 p-3">
              <Sparkline points={trendPoints(s, range)} baseline={s.normalEps} color={meta.bar} width={720} height={64} label={`${s.name} received over ${range}`} />
            </div>
          </Block>
          {!problem && (
            <Block title="Signals">
              <div className="grid grid-cols-3 gap-2">
                <Signal label="First event" value={dateAt(s.firstEventDaysAgo)} />
                <Signal label="Last event" value={s.lastEventMin < 1 ? "just now" : fmtAgo(s.lastEventMin)} sub={s.cadenceMin > 0 ? `normally every ~${s.cadenceMin}m` : undefined} />
                <Signal label="Health check" value={s.healthCheck.status} sub={`${s.healthCheck.detail} · ${s.healthCheck.checkedMinAgo}m ago`} tone={checkTone(s.healthCheck)} />
              </div>
            </Block>
          )}
        </>
      )}

      {tab === "activity" && (
        <ActivityTab
          inc={inc && (problem || s.state === "recovering") ? inc : undefined}
          alertedMin={alertedMin}
          owner={s.owner}
          severity={problem ? s.severity : undefined}
          assignee={s.assignee}
          recovered={s.recovered ? { ...s.recovered, sinceMin: s.sinceMin } : undefined}
          incidents30d={s.incidents30d}
          since={`Sending since ${dateAt(s.firstEventDaysAgo)}.`}
        />
      )}
      {sourceActions.dialogs}
      {pausing && (
        <PauseDialog
          name={s.name}
          onCancel={() => setPausing(false)}
          onConfirm={(until, reason) => {
            updateSourceStatus(s.id, { pausedAt: Date.now(), pausedUntil: until, pauseReason: reason, resumedAt: undefined });
            setPausing(false);
          }}
        />
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* Destination                                                          */
/* ------------------------------------------------------------------ */

function DestinationPanel({
  d,
  onClose,
  onOpen,
  initialTab,
  back,
  onTabChange,
}: {
  d: DestinationView;
  onClose: () => void;
  onOpen: (t: AlertTarget) => void;
  initialTab?: TabKey;
  back?: { label: string; onBack: () => void };
  onTabChange?: (t: TabKey) => void;
}) {
  const env = useEnvironment();
  const navigate = useNavigate();
  const { updateSourceStatus } = useSession();
  const { open: openCruz } = useCruz();
  const inc = d.incident;
  const problem = d.state === "stopped" || d.state === "degraded";
  const [tab, setTab] = useState<TabKey>(initialTab ?? (problem ? "triage" : "flow"));
  const [justResolved, setJustResolved] = useState(false);
  const key = `dest:${d.id}`;
  const destActions = useEntityActions([{ kind: "destination", d }]);
  const alertedMin = inc?.timeline.find((t) => /alert sent/i.test(t.text))?.minutesAgo;
  const feeding = env.sources.filter((s) => d.sourceIds.includes(s.id)).sort((a, b) => b.gbOut - a.gbOut);
  const heldGb = ((d.gbIn * d.sinceMin) / 1440) * (1 - d.acceptance);

  const tabs: { value: TabKey; label: string }[] = [
    ...(problem && inc ? [{ value: "triage" as const, label: "Triage" }] : []),
    { value: "flow", label: "Data flow" },
    { value: "activity", label: "Activity" },
  ];

  return (
    <Shell
      kind="destination"
      title={d.name}
      logoId={d.id}
      color={d.color}
      onClose={onClose}
      back={back}
      badges={
        <>
          <HealthBadge state={d.state} size="xs" />
          {d.severity && problem && <SeverityBadge severity={d.severity} />}
        </>
      }
      meta={`${d.sourceIds.length} source${d.sourceIds.length === 1 ? "" : "s"} routed`}
      statusLine={
        problem && inc ? (
          <p className={HEALTH_META[d.state].text}>
            {inc.observed} for {fmtDuration(d.sinceMin)}
            <span className="text-muted-foreground">
              {" "}
              · {d.state === "stopped" ? `last delivery ${clockAt(d.sinceMin)}` : `${fmtCount(d.sentEpm - d.deliveredEpm)}/min refused`}
            </span>
          </p>
        ) : d.state === "healthy" ? (
          <p className="text-success">Accepting everything the pipeline sends</p>
        ) : undefined
      }
      ownerSlot={
        problem ? (
          <OwnerControl
            assignee={d.assignee}
            owningTeam="Platform team"
            onSet={(patch) =>
              updateSourceStatus(key, { ackAt: Date.now(), ownerVia: "app", released: false, assignedBy: undefined, previousOwnerId: undefined, ...patch })
            }
            onRelease={() => updateSourceStatus(key, { ackAt: undefined, ownerId: undefined, released: true })}
          />
        ) : undefined
      }
      menu={[
        { label: "Ask Cruz about this destination", icon: MessageCircleQuestion, onSelect: () => openCruz(`What should I check for ${d.name}?`) },
      ]}
      actions={destActions.menu}
    >
      <div className="space-y-3 mb-6">
        {inc && (problem || justResolved) && (
          <WhatToDo
            inc={inc}
            state={d.state}
            targetLabel={d.name}
            listen={false}
            onResolved={() => {
              setJustResolved(true);
              updateSourceStatus(key, { recoveredAt: Date.now(), downMin: d.sinceMin, ackAt: undefined });
            }}
            impact={<ImpactLine inc={inc} gb={heldGb} verb={`held since ${clockAt(d.sinceMin)}`} />}
          />
        )}
        {d.state === "recovering" && d.recovered && !justResolved && (
          <Note tone="info" icon={CheckCircle2}>
            <span className="text-info font-medium">Recovered {fmtAgo(d.sinceMin)}</span> after {fmtDuration(d.recovered.downMin)}. Watching for 30
            minutes before marking it healthy.
          </Note>
        )}
      </div>

      <div className="mb-5">
        <DrawerTabs
          tabs={tabs}
          value={tabs.some((t) => t.value === tab) ? tab : "flow"}
          onChange={(t) => {
            setTab(t);
            onTabChange?.(t);
          }}
        />
      </div>

      {tab === "triage" && inc && problem && (
        <TriageTab
          inc={inc}
          onAskCruz={() => openCruz(`What should I check for ${d.name}?`)}
          signals={
            <>
              <Signal label="Sent/min" value={fmtCount(d.sentEpm)} sub="from the pipeline" />
              <Signal label="Delivered/min" value={fmtCount(d.deliveredEpm)} tone={d.acceptance < 1 ? (d.acceptance === 0 ? "bad" : "warn") : undefined} />
              <Signal label={d.state === "stopped" ? "Held/min" : "Rejected/min"} value={fmtCount(d.sentEpm - d.deliveredEpm)} tone="warn" />
              <Signal label="Last delivery" value={d.lastDeliveryMin > 0 ? fmtAgo(d.lastDeliveryMin) : "just now"} tone={d.lastDeliveryMin > 0 ? "bad" : undefined} />
              <Signal label="Health check" value={d.healthCheck.status} sub={d.healthCheck.detail} tone={checkTone(d.healthCheck)} />
              <Signal label="Sources affected" value={String(d.sourceIds.length)} />
            </>
          }
        />
      )}

      {tab === "flow" && (
        <>
          <Block title="Right now">
            <div className="grid grid-cols-3 gap-2">
              {/* Every tile carries a second line, so the row has one height. */}
              <Signal label="Sent/min" value={fmtCount(d.sentEpm)} sub={`from ${d.sourceIds.length} sources`} />
              <Signal label="Delivered/min" value={fmtCount(d.deliveredEpm)} sub={`${Math.round(d.acceptance * 100)}% accepted`} />
              <Signal label="Volume" value={`${fmtSize(d.gbIn)}/day`} sub="after reduction" />
            </div>
          </Block>
          <Block title={`Largest sources routed here · ${feeding.length}`}>
            <div className="rounded border border-border divide-y divide-border">
              {feeding.slice(0, 8).map((s) => (
                <button
                  key={s.id}
                  onClick={() => onOpen({ kind: "source", id: s.id, name: s.name })}
                  className="group w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-left hover:bg-muted/15 transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${HEALTH_META[s.state].dot}`} aria-hidden="true" />
                    <span className="truncate text-foreground/90">{s.name}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-mono-db text-xs text-muted-foreground">{fmtSize(s.gbOut)}/day</span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>
            {feeding.length > 8 && (
              <button
                onClick={() => {
                  onClose();
                  navigate("/pipeline", { state: { destFilter: { id: d.id, name: d.name } } });
                }}
                className="mt-3 text-xs font-medium text-primary hover:text-primary/80 inline-flex items-center gap-1 underline underline-offset-2"
              >
                View all {feeding.length} sources on Pipeline
                <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </button>
            )}
          </Block>
        </>
      )}

      {tab === "activity" && (
        <ActivityTab
          inc={inc && (problem || d.state === "recovering") ? inc : undefined}
          alertedMin={alertedMin}
          owner="the Platform team"
          severity={problem ? d.severity : undefined}
          assignee={d.assignee}
          recovered={d.recovered ? { ...d.recovered, sinceMin: d.sinceMin } : undefined}
          incidents30d={d.incidents30d}
        />
      )}
      {destActions.dialogs}
    </Shell>
  );
}

/**
 * The one place to act on anything in the pipeline, a source or a
 * destination, reached from the dashboard, the pipeline tables, alerts and
 * notifications. Reads live from the environment, so a fix made here shows
 * everywhere at once.
 */
export function DetailDrawer({
  target,
  range,
  onClose,
  initialTab,
}: {
  target: AlertTarget;
  range: string;
  onClose: () => void;
  /** Kept for callers; links inside the drawer are handled here now, as a
   * stack, so there's always a way back. */
  onOpen?: (t: AlertTarget) => void;
  /** Opened from somewhere about volume or cost (Savings), not a problem:
   * start on Data flow rather than Triage. */
  initialTab?: "triage" | "flow" | "activity";
}) {
  const env = useEnvironment();
  // Following a link inside the drawer (a destination's triage, a related
  // source) stacks the new view; Back returns to the previous one on the
  // tab it was left on. A new target from the page starts a fresh stack.
  const [stack, setStack] = useState<{ target: AlertTarget; tab?: TabKey }[]>([{ target, tab: initialTab }]);
  const [origin, setOrigin] = useState(target);
  if (origin.kind !== target.kind || origin.id !== target.id) {
    setOrigin(target);
    setStack([{ target, tab: initialTab }]);
  }
  const top = stack[stack.length - 1];
  const prev = stack.length > 1 ? stack[stack.length - 2] : null;
  const push = (t: AlertTarget) => setStack((st) => [...st, { target: t }]);
  const back = prev ? { label: prev.target.name, onBack: () => setStack((st) => st.slice(0, -1)) } : undefined;
  const rememberTab = (t: TabKey) => setStack((st) => st.map((e, i) => (i === st.length - 1 ? { ...e, tab: t } : e)));
  const key = `${top.target.kind}:${top.target.id}:${stack.length}`;

  if (top.target.kind === "source") {
    const s = env.sources.find((x) => x.id === top.target.id);
    return s ? (
      <SourcePanel key={key} s={s} range={range} onClose={onClose} onOpen={push} initialTab={top.tab} back={back} onTabChange={rememberTab} />
    ) : null;
  }
  const d = env.destinations.find((x) => x.id === top.target.id);
  return d ? <DestinationPanel key={key} d={d} onClose={onClose} onOpen={push} initialTab={top.tab} back={back} onTabChange={rememberTab} /> : null;
}
