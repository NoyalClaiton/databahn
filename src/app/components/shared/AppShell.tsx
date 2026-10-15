import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard, Database, Send, Waypoints, Search, Share2, ListFilter,
  LogOut, UserRound, HelpCircle, PanelLeftClose, PanelLeftOpen,
  RotateCcw, X, Settings, Bell, ChevronDown, BellRing, FlaskConical, ArrowRight,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GuidedTourOverlay } from "./GuidedTourOverlay";
import { DatabahnLogo } from "./DatabahnLogo";
import { AtmosphericBackground } from "./AtmosphericBackground";
import { IntroSplash } from "./IntroSplash";
import { CruzAssistant } from "./CruzAssistant";
import { ContextualHelpTip } from "./ContextualHelpTip";
import { useSession } from "@/app/lib/SessionContext";
import { useEnvironment, fmtAgo, type AlertTarget, type SourceView } from "@/app/lib/environment";
import { HealthDot, HEALTH_META, SEVERITY_META } from "./HealthBadge";
import { whereAlertsGo } from "@/app/lib/notifications";
import { SAMPLE_FLEET } from "@/app/data/fleet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, end: true }],
  },
  {
    label: "Onboard",
    items: [
      { to: "/sources", label: "Sources", icon: Database },
      { to: "/destinations", label: "Destinations", icon: Send },
    ],
  },
  {
    label: "Operate",
    items: [
      { to: "/pipeline", label: "Pipeline", icon: Waypoints },
      { to: "/search", label: "Search", icon: Search },
      { to: "/graph", label: "Graph", icon: Share2 },
      { to: "/rules", label: "Rules", icon: ListFilter },
    ],
  },
  {
    // About the team, not the data: where alerts reach people who aren't
    // looking at Databahn.
    label: "Manage",
    items: [{ to: "/notifications", label: "Notifications", icon: BellRing }],
  },
];

/**
 * Pipeline status, always in view: how things are right now. Its sibling,
 * the bell, says what happened. Lived at the bottom of the sidebar before,
 * where it shrank to an icon whenever the nav collapsed and listed every
 * source one by one, which stopped working past a handful.
 *
 * Counts problems at both ends of the pipe (sources not sending, below
 * normal or not routed; destinations not accepting everything) and opens
 * a short list, each item leading straight to its detail panel.
 */
/** A small dot with a soft halo; the halo is what makes "down" noticeable,
 * not a red fill across the whole control. */
function StatusDot({ tone }: { tone: "good" | "warn" | "bad" }) {
  const c = { good: "bg-success", warn: "bg-amber-500", bad: "bg-destructive" }[tone];
  const halo = { good: "", warn: "shadow-[0_0_0_3px_rgba(245,158,11,0.18)]", bad: "shadow-[0_0_0_3px_rgba(229,72,77,0.22)]" }[tone];
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c} ${halo}`} aria-hidden="true" />;
}

function StatusPill() {
  const env = useEnvironment();
  const navigate = useNavigate();
  const { sampleEnvironment } = useSession();
  if (env.sources.length === 0) return null;

  const stopped = env.sources.filter((s) => s.state === "stopped").sort((a, b) => b.lastEventMin - a.lastEventMin);
  const below = env.sources.filter((s) => s.state === "degraded");
  const unrouted = env.destinations.length > 0 ? env.sources.filter((s) => s.destIds.length === 0) : [];
  const destProblems = env.destinations.filter((d) => d.state === "stopped" || d.state === "degraded");
  const { counts, total } = env.summary;

  const parts = [
    stopped.length && `${stopped.length} source${stopped.length === 1 ? "" : "s"} not sending`,
    destProblems.length && `${destProblems.length} destination${destProblems.length === 1 ? "" : "s"} failing`,
    !stopped.length && below.length && `${below.length} below normal`,
    !stopped.length && !below.length && unrouted.length && `${unrouted.length} not routed`,
  ].filter(Boolean) as string[];
  const label = parts.length ? parts.join(" · ") : total === 1 ? "1 source sending" : `All ${total} sources sending`;
  // What the pill shows: the count first, a short label, and its own dot.
  const destStopped = destProblems.some((d) => d.state === "stopped");
  const segments: { n: number; label: string; tone: "bad" | "warn" }[] = [
    ...(stopped.length ? [{ n: stopped.length, label: `source${stopped.length === 1 ? "" : "s"} down`, tone: "bad" as const }] : []),
    ...(below.length ? [{ n: below.length, label: "below normal", tone: "warn" as const }] : []),
    ...(destProblems.length
      ? [{ n: destProblems.length, label: `destination${destProblems.length === 1 ? "" : "s"}`, tone: destStopped ? ("bad" as const) : ("warn" as const) }]
      : []),
    ...(!stopped.length && !below.length && unrouted.length ? [{ n: unrouted.length, label: "not routed", tone: "warn" as const }] : []),
  ];

  const go = (target: AlertTarget) => navigate("/", { state: { openTarget: target } });
  const SourceItem = ({ s, line }: { s: SourceView; line: string }) => (
    <DropdownMenuItem onSelect={() => go({ kind: "source", id: s.id, name: s.name })} className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer">
      <HealthDot state={s.state} />
      <span className="text-sm text-foreground truncate flex-1">{s.name}</span>
      <span className="text-xs text-muted-foreground shrink-0">{line}</span>
    </DropdownMenuItem>
  );
  const Heading = ({ children }: { children: ReactNode }) => (
    <p className="px-3 pt-2.5 pb-1 text-xs uppercase tracking-wide text-muted-foreground/80">{children}</p>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* A neutral control like its neighbours (bell, help, settings).
            Colour lives only in the small status dots; the counts carry the
            weight, labels stay muted. It used to be a red-filled sentence,
            which read like an error toast stuck in the header. */}
        <button
          aria-label={`Pipeline status: ${label}`}
          className="group inline-flex items-center gap-3 h-8 rounded-full border border-border bg-card/60 pl-3 pr-2 text-xs transition-colors hover:bg-muted/30 hover:border-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted/30"
        >
          {segments.length === 0 ? (
            <span className="inline-flex items-center gap-2">
              <StatusDot tone="good" />
              <span className="text-foreground/85 whitespace-nowrap">All systems normal</span>
            </span>
          ) : (
            segments.map((seg, i) => (
              <span key={seg.label} className={`items-center gap-1.5 whitespace-nowrap ${i === 0 ? "inline-flex" : "hidden md:inline-flex"}`}>
                <StatusDot tone={seg.tone} />
                <span className="font-mono-db font-semibold text-foreground">{seg.n}</span>
                <span className="hidden md:inline text-muted-foreground">{seg.label}</span>
              </span>
            ))
          )}
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] p-0">
        <div className="px-3 py-2.5 border-b border-border">
          <p className="text-sm font-medium">Pipeline status</p>
          <p className="text-xs text-muted-foreground">
            {total} source{total === 1 ? "" : "s"} · {env.destinations.length} destination{env.destinations.length === 1 ? "" : "s"}
            {sampleEnvironment && " · sample environment, simulated data"}
          </p>
        </div>
        <div className="max-h-[65vh] overflow-y-auto pb-1.5">
          {stopped.length > 0 && (
            <>
              <Heading>Not sending · {stopped.length}</Heading>
              {stopped.map((s) => (
                <SourceItem key={s.id} s={s} line={`last event ${fmtAgo(s.lastEventMin)}`} />
              ))}
            </>
          )}
          {below.length > 0 && (
            <>
              <Heading>Below normal · {below.length}</Heading>
              {below.map((s) => (
                <SourceItem
                  key={s.id}
                  s={s}
                  line={
                    s.incident?.parseErrorPct
                      ? `${s.incident.parseErrorPct}% failing to parse`
                      : s.incident?.backlogMin
                        ? `${s.incident.backlogMin} min behind`
                        : `${Math.round((s.incident?.receivedFactor ?? 1) * 100)}% of normal`
                  }
                />
              ))}
            </>
          )}
          {unrouted.length > 0 && (
            <>
              <Heading>Not routed · {unrouted.length}</Heading>
              {unrouted.map((s) => (
                <SourceItem key={s.id} s={s} line="no destination" />
              ))}
            </>
          )}
          {env.destinations.length > 0 && (
            <>
              <Heading>Destinations · {env.destinations.length}</Heading>
              {env.destinations.map((d) => (
                <DropdownMenuItem
                  key={d.id}
                  onSelect={() => go({ kind: "destination", id: d.id, name: d.name })}
                  className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer"
                >
                  <HealthDot state={d.state} />
                  <span className="text-sm text-foreground truncate flex-1">{d.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {d.state === "stopped"
                      ? "not accepting"
                      : d.state === "degraded"
                        ? `rejecting ${d.incident?.rejectedPct}%`
                        : d.state === "recovering"
                          ? "recovering"
                          : "accepting"}
                  </span>
                </DropdownMenuItem>
              ))}
            </>
          )}
          {/* Few sources (a fresh walkthrough): list them all, it's still
              short. At scale: the healthy majority is one line. */}
          {total <= 8 ? (
            <>
              <Heading>Sources · {total}</Heading>
              {env.sources
                .filter((s) => !stopped.includes(s) && !below.includes(s) && !unrouted.includes(s))
                .map((s) => (
                  <SourceItem key={s.id} s={s} line={HEALTH_META[s.state].label.toLowerCase()} />
                ))}
            </>
          ) : (
            <p className="px-3 pt-2.5 text-xs text-muted-foreground flex items-center gap-2">
              <HealthDot state="healthy" />
              {counts.healthy} healthy
              {counts.recovering > 0 && ` · ${counts.recovering} recovering`}
              {counts.paused + counts.learning > 0 && ` · ${counts.paused + counts.learning} paused or learning`}
            </p>
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <DropdownMenuItem onSelect={() => navigate("/pipeline")} className="px-3 py-2 text-xs text-primary cursor-pointer">
          All sources and destinations on Pipeline
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { resetSession, sampleEnvironment, setSampleEnvironment } = useSession();
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-y-0 right-0 w-80 z-[90] border-l border-border glass-card flex flex-col shadow-2xl"
      role="dialog"
      aria-label="Settings"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium">Settings</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close settings"
          className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        <section>
          <p className="text-xs uppercase tracking-widest text-muted-foreground/50 font-medium mb-3">Account</p>
          <div className="flex items-center gap-3 p-3 rounded border border-border bg-card/40">
            <div className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
              JR
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">J. Rivera</p>
              <p className="text-xs text-muted-foreground">j.rivera@company.com</p>
            </div>
          </div>
        </section>

        {/* Theme and density were display-only rows that looked like
            settings but did nothing; removed rather than left as dead ends. */}

        <section>
          <p className="text-xs uppercase tracking-widest text-muted-foreground/50 font-medium mb-3">Notifications</p>
          {/* These were placeholder switches; the real settings live on their
              own page, where channels and routing can actually be set. */}
          <button
            onClick={() => {
              navigate("/notifications");
              onClose();
            }}
            className="w-full text-left py-2.5 px-3 rounded border border-border bg-card/20 text-sm text-foreground hover:border-border/80 transition-colors flex items-center justify-between"
          >
            Channels and alert routing
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </section>

        <section>
          <p className="text-xs uppercase tracking-widest text-muted-foreground/50 font-medium mb-3">Demo</p>
          <button
            role="switch"
            aria-checked={sampleEnvironment}
            onClick={() => setSampleEnvironment(!sampleEnvironment)}
            className="w-full text-left py-2.5 px-3 mb-1 rounded border border-border bg-card/20 text-sm text-foreground hover:border-border/80 transition-colors flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2">
              <FlaskConical className="w-3.5 h-3.5 text-muted-foreground" />
              <span>
                Sample environment
                <span className="block text-xs text-muted-foreground">{SAMPLE_FLEET.length} simulated sources with realistic issues</span>
              </span>
            </span>
            <span className={`w-8 h-4 rounded-full relative shrink-0 transition-colors ${sampleEnvironment ? "bg-primary" : "bg-muted"}`}>
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${sampleEnvironment ? "right-0.5" : "left-0.5"}`} />
            </span>
          </button>
          <button
            onClick={() => { resetSession(); navigate("/"); onClose(); }}
            className="w-full text-left py-2.5 px-3 rounded border border-border bg-card/20 text-sm text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors flex items-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset demo data
          </button>
        </section>
      </div>

      <div className="px-5 py-4 border-t border-border shrink-0">
        <button className="w-full text-left py-2 text-sm text-destructive/80 hover:text-destructive flex items-center gap-2 transition-colors">
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </motion.div>
  );
}

/**
 * The in-app half of "keep the user informed". The out-of-app half (Slack,
 * email to the source owner) is what actually reaches someone who isn't
 * looking; this is where those same alerts are waiting when they open the
 * product, each one leading straight to the source, not to a generic page.
 */
function NotificationsBell() {
  const env = useEnvironment();
  const navigate = useNavigate();
  const { notifications } = useSession();
  const critTo = whereAlertsGo(notifications, "critical");
  // Open alerts by severity, then recoveries, newest first within each.
  // Recoveries are notifications too, so nobody keeps chasing a fixed one.
  const alerts = [
    ...env.summary.alerts.map((a) => ({
      id: a.id,
      severity: a.severity,
      recovered: false,
      title: a.title,
      detail: a.likelyCause ? `Likely: ${a.likelyCause}` : a.detail,
      minutesAgo: a.sinceMin,
      acked: a.assignee ? (a.assignee.isMe ? "you're on it" : `${a.assignee.person.name} is on it`) : "",
      timed: a.kind === "incident",
      open: a.open,
    })),
    ...[
      ...env.sources.map((x) => ({ x, kind: "source" as const })),
      ...env.destinations.map((x) => ({ x, kind: "destination" as const })),
    ]
      .filter(({ x }) => x.state === "recovering" && x.recovered)
      .map(({ x, kind }) => ({
        id: `rec:${x.id}`,
        severity: undefined,
        recovered: true,
        title: `${x.name} recovered`,
        detail: "Watching for 30 minutes before marking healthy",
        minutesAgo: x.sinceMin,
        acked: "",
        timed: true,
        open: { kind, id: x.id, name: x.name },
      })),
  ];
  const unread = env.summary.alerts.filter((a) => (a.severity === "critical" || a.severity === "high") && !a.ackAt).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={unread ? `Notifications, ${unread} need attention` : "Notifications"}
          title="Notifications"
          className="relative w-8 h-8 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-[3px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-mono-db font-semibold flex items-center justify-center">
              {unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] p-0">
        <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
          <span className="text-sm font-medium">Alerts</span>
          {/* The way into Notifications from here: a short action, not a
              sentence. Where alerts currently go is a hover detail. */}
          <button
            onClick={() => navigate("/notifications")}
            title={critTo ? `Critical alerts also go to ${critTo}` : "Alerts only show in Databahn"}
            className={`inline-flex items-center gap-1 text-xs font-medium ${
              critTo ? "text-muted-foreground hover:text-foreground" : "text-primary hover:text-primary/80"
            }`}
          >
            {critTo ? "Notifications" : "Set up notifications"}
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
        {alerts.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">No alerts. Every source and destination is healthy.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto py-1">
            {alerts.map((a) => (
              <DropdownMenuItem
                key={a.id}
                onSelect={() => navigate("/", { state: { openTarget: a.open } })}
                className="flex items-start gap-2.5 px-3 py-2 cursor-pointer"
              >
                <span className="mt-1.5">
                  {a.severity ? (
                    <span className={`block w-2 h-2 rounded-full ${SEVERITY_META[a.severity].dot}`} aria-hidden="true" />
                  ) : (
                    <HealthDot state="recovering" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-foreground leading-snug">{a.title}</span>
                  <span className="block text-xs text-muted-foreground truncate">{a.detail}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {a.severity ? SEVERITY_META[a.severity].label : "Recovered"}
                    {a.timed ? ` · ${fmtAgo(a.minutesAgo)}` : ""}
                    {a.acked && ` · ${a.acked}`}
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Standard app shell shape: header (real logo, avatar/settings) above a
 * persistent, grouped left nav. Nav consistency is principle 5 / Nielsen #4,
 * addressing the brief's "lack of clear navigation cues" complaint directly.
 * A left sidebar is the standard IA for this category of tool (Splunk,
 * Sentinel, Datadog, Snowflake all use it), Jakob's Law favors matching that
 * convention over a novel top-tab layout for five stable, always-visible
 * destinations. */
export function AppShell({ children }: { children: ReactNode }) {
  const [introDone, setIntroDone] = useState(false);
  const [tourRestart, setTourRestart] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Collapse preference persists, since it is a workspace choice rather than
  // per-visit state.
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try {
      return localStorage.getItem("databahn-nav-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const toggleNav = () => {
    setNavCollapsed((v) => {
      try {
        localStorage.setItem("databahn-nav-collapsed", v ? "0" : "1");
      } catch {
        /* storage may be unavailable; the toggle still works for this session */
      }
      return !v;
    });
  };
  const replayTour = () => setTourRestart((n) => n + 1);
  const { resetSession } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  // Pages share one scrolling container, so without this a new page opened
  // at the previous page's scroll depth: "Review rules" from far down the
  // dashboard landed partway down the rules list. Runs before pages that
  // then scroll to a specific spot themselves (they wait a tick).
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  // Safety net: never let the tour stay blocked if the intro fails to report
  // completion for any reason. The intro can't run longer than this.
  useEffect(() => {
    const t = setTimeout(() => setIntroDone(true), 6000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="h-screen overflow-hidden flex flex-col relative">
      <AtmosphericBackground />
      <IntroSplash onDone={() => setIntroDone(true)} />
      <header className="relative z-10 h-14 shrink-0 border-b border-border flex items-center justify-between px-5 bg-card/40 backdrop-blur-sm">
        <DatabahnLogo />
        <div className="flex items-center gap-1">
          <div className="mr-1.5">
            <StatusPill />
          </div>
          <NotificationsBell />
          <button
            onClick={replayTour}
            aria-label="Replay product tour"
            title="Replay product tour"
            className="w-8 h-8 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            aria-label="Settings"
            title="Settings"
            className="w-8 h-8 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Settings className="w-4 h-4" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Account menu"
                className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold hover:bg-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                JR
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>J. Rivera</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <UserRound className="w-4 h-4" /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="w-4 h-4" /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={replayTour}>
                <HelpCircle className="w-4 h-4" /> Replay product tour
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  resetSession();
                  navigate("/");
                }}
              >
                <RotateCcw className="w-4 h-4" /> Reset demo data
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">
                <LogOut className="w-4 h-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <div className="relative z-10 flex flex-1 min-h-0">
        <motion.aside
          animate={{ width: navCollapsed ? 56 : 220 }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className="shrink-0 border-r border-border bg-card/40 backdrop-blur-sm flex flex-col overflow-hidden"
        >
          <nav className="flex-1 px-2 py-4 space-y-5" aria-label="Main">
            {NAV_GROUPS.map((group, groupIndex) => (
              <div key={group.label}>
                {!navCollapsed && (
                  <p className="px-3 text-xs font-medium text-muted-foreground/70 uppercase tracking-wide mb-1.5 whitespace-nowrap">
                    {group.label}
                  </p>
                )}
                {/* Substitutes for the group label collapsed hides, so it
                    only makes sense between groups, the first group has
                    nothing above it to separate from. */}
                {navCollapsed && groupIndex > 0 && <div className="h-px bg-border mx-2 mb-2" />}
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const link = (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={"end" in item ? item.end : false}
                        data-tour={`nav-${item.to === "/" ? "dashboard" : item.to.replace("/", "")}`}
                        className={({ isActive }) =>
                          `group flex items-center gap-2.5 py-2 rounded text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            navCollapsed ? "justify-center px-0" : isActive ? "pl-2.5 pr-3" : "px-3"
                          } ${
                            isActive
                              ? "border-l-2 border-primary bg-primary/10 text-foreground font-medium"
                              : "border-l-2 border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
                          }`
                        }
                      >
                        <item.icon className="w-4 h-4 shrink-0 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
                        {!navCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
                      </NavLink>
                    );
                    // Collapsed, the icon is the only thing on screen, a
                    // native `title` tooltip is slow to appear and can't be
                    // styled, the same portal-based tip used everywhere else
                    // in the app reads instantly and looks like it belongs.
                    return navCollapsed ? (
                      <ContextualHelpTip key={item.to} content={item.label} placement="right" triggerClassName="block w-full">
                        {link}
                      </ContextualHelpTip>
                    ) : (
                      link
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <button
            onClick={toggleNav}
            aria-label={navCollapsed ? "Expand navigation" : "Collapse navigation"}
            title={navCollapsed ? "Expand navigation" : "Collapse navigation"}
            className={`m-2 h-8 rounded flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              navCollapsed ? "justify-center" : "px-3"
            }`}
          >
            {navCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            {!navCollapsed && <span className="text-xs whitespace-nowrap">Collapse</span>}
          </button>
        </motion.aside>
        <main ref={mainRef} className="flex-1 px-6 lg:px-12 py-10 lg:py-14 overflow-y-auto">{children}</main>
        <CruzAssistant />
      </div>
      {/* Auto-start only from the dashboard, not on every first visit
          regardless of route. The tour's first step navigates to Sources
          on its own, so auto-starting it on someone's very first look at a
          direct link they were sent (Pipeline, say) yanked them away from
          the exact page that link pointed at before they saw it. It still
          offers itself the moment a first-time visitor reaches the
          dashboard, on their own or after that deep link. */}
      <GuidedTourOverlay readyToStart={introDone && location.pathname === "/"} restartSignal={tourRestart} />
      <AnimatePresence>
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
