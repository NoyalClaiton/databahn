import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard, Database, Send, Waypoints, Search, Share2, ListFilter,
  LogOut, UserRound, HelpCircle, PanelLeftClose, PanelLeftOpen,
  RotateCcw, X, Settings, Radio,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GuidedTourOverlay } from "./GuidedTourOverlay";
import { DatabahnLogo } from "./DatabahnLogo";
import { AtmosphericBackground } from "./AtmosphericBackground";
import { IntroSplash } from "./IntroSplash";
import { CruzAssistant } from "./CruzAssistant";
import { ContextualHelpTip } from "./ContextualHelpTip";
import { useSession } from "@/app/lib/SessionContext";
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
];

function ConnectedStatusStrip({ collapsed }: { collapsed: boolean }) {
  const { connected, routes, hiddenIds } = useSession();
  if (connected.length === 0) return null;

  const sources = connected.filter((c) => c.kind === "source");
  const dests = connected.filter((c) => c.kind === "destination");

  // Pipeline overview falls back to a full mesh (everything reaches
  // everything) until the first explicit route exists, so this strip has to
  // agree with that same rule, otherwise a source shows "live" here while
  // Pipeline is telling the truth that it's actually going nowhere.
  const hasExplicitRouting = routes.length > 0;
  const sourceRouted = (id: string) => !hasExplicitRouting || routes.some((r) => r.sourceId === id);
  const destReceiving = (id: string) => !hasExplicitRouting || routes.some((r) => r.destId === id);

  if (collapsed) {
    // A dot per entity stopped scaling the moment there were more than two
    // of a kind, the extras just silently disappeared off the slice, and
    // hovering the right one out of a growing stack only gets harder from
    // here. One trigger, one list, works the same at 4 connections or 40.
    const anyIssue = sources.some((e) => !sourceRouted(e.id)) || dests.some((e) => !destReceiving(e.id));

    const StatusChip = ({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) => (
      <span
        className={`shrink-0 text-[11px] font-medium px-1.5 py-[1px] rounded ${
          ok ? "bg-success/15 text-success" : "bg-amber-500/15 text-amber-400"
        }`}
      >
        {ok ? okLabel : badLabel}
      </span>
    );

    const summary = (
      <div className="max-h-80 overflow-y-auto -m-1 p-1">
        {/* The dot color alone was the only signal before, spelling out what
            green vs amber actually means up front means the list below
            doesn't have to be decoded row by row. */}
        {anyIssue && (
          <div className="flex items-center gap-3 mb-3 pb-2.5 border-b border-border/60 text-[11px]">
            <span className="flex items-center gap-1.5 text-success"><span className="w-2 h-2 rounded-full bg-success shrink-0" /> Flowing</span>
            <span className="flex items-center gap-1.5 text-amber-400"><span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" /> Needs a route</span>
          </div>
        )}
        {sources.length > 0 && (
          <div className="mb-3 last:mb-0">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Database className="w-3 h-3 text-muted-foreground/70" aria-hidden="true" />
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70 font-semibold">Sources</p>
            </div>
            <div className="space-y-1">
              {sources.map((e) => {
                const hidden = hiddenIds.includes(e.id);
                const routed = sourceRouted(e.id);
                return (
                  <div key={e.id} className="flex items-center gap-2 py-0.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${hidden ? "bg-muted-foreground/40" : routed ? "bg-success" : "bg-amber-500"}`} />
                    <span className={`text-[13px] font-medium truncate flex-1 ${hidden ? "text-muted-foreground/70" : "text-foreground"}`}>{e.name}</span>
                    {hidden ? (
                      <span className="shrink-0 text-[11px] font-medium px-1.5 py-[1px] rounded bg-muted-foreground/15 text-muted-foreground">Hidden</span>
                    ) : (
                      <StatusChip ok={routed} okLabel="Routed" badLabel="Not routed" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {dests.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Send className="w-3 h-3 text-muted-foreground/70" aria-hidden="true" />
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70 font-semibold">Destinations</p>
            </div>
            <div className="space-y-1">
              {dests.map((e) => {
                const receiving = destReceiving(e.id);
                return (
                  <div key={e.id} className="flex items-center gap-2 py-0.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${receiving ? "bg-info" : "bg-amber-500"}`} />
                    <span className="text-foreground text-[13px] font-medium truncate flex-1">{e.name}</span>
                    <StatusChip ok={receiving} okLabel="Receiving" badLabel="Empty" />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );

    const issueCount = sources.filter((e) => !sourceRouted(e.id)).length + dests.filter((e) => !destReceiving(e.id)).length;
    const totalCount = sources.length + dests.length;
    // A bare icon gives no reason to hover it, the badge is what says "there's
    // a number here, look closer": the issue count when something needs
    // attention (the more useful, actionable number), the total otherwise.
    const badgeCount = anyIssue ? issueCount : totalCount;

    return (
      <div className="px-2 py-3 border-t border-border flex justify-center">
        <ContextualHelpTip content={summary} maxWidth={300}>
          <div
            role="status"
            aria-label={`${sources.length} source${sources.length === 1 ? "" : "s"}, ${dests.length} destination${dests.length === 1 ? "" : "s"} connected${
              anyIssue ? `, ${issueCount} not fully routed` : ""
            }`}
            className="relative w-7 h-7 rounded flex items-center justify-center hover:bg-muted/30 transition-colors cursor-default"
          >
            <Radio className={`w-3.5 h-3.5 ${anyIssue ? "text-amber-500" : "text-success"}`} aria-hidden="true" />
            <span
              className={`absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-[3px] rounded-full text-[9px] font-mono-db font-semibold flex items-center justify-center border-2 border-card ${
                anyIssue ? "bg-amber-500 text-amber-950" : "bg-success text-success-foreground"
              }`}
            >
              {badgeCount}
            </span>
          </div>
        </ContextualHelpTip>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 border-t border-border">
      <div className="flex items-center gap-1.5 mb-2">
        <Radio className="w-3 h-3 text-success" aria-hidden="true" />
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-medium">Live</p>
      </div>
      {sources.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {sources.map((e) => {
            const hidden = hiddenIds.includes(e.id);
            const routed = sourceRouted(e.id);
            return (
              <div
                key={e.id}
                className="flex items-center gap-2"
                title={hidden ? "Hidden from pipeline" : routed ? undefined : "Not routed to a destination"}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    hidden ? "bg-muted-foreground/40" : routed ? "bg-success live-pulse-dot" : "bg-amber-500"
                  }`}
                />
                <span className={`text-xs truncate ${hidden ? "text-muted-foreground/40 line-through" : routed ? "text-foreground/70" : "text-muted-foreground/60"}`}>
                  {e.name}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {dests.length > 0 && (
        <div className="space-y-1.5">
          {dests.map((e) => {
            const receiving = destReceiving(e.id);
            return (
              <div key={e.id} className="flex items-center gap-2" title={receiving ? undefined : "No source routed here yet"}>
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${receiving ? "bg-info/60" : "bg-amber-500"}`} />
                <span className={`text-xs truncate ${receiving ? "text-muted-foreground" : "text-muted-foreground/60"}`}>{e.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { resetSession } = useSession();
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
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground/50 font-medium mb-3">Account</p>
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

        <section>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground/50 font-medium mb-3">Display</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between py-2.5 px-3 rounded border border-border bg-card/20">
              <span className="text-sm text-foreground">Theme</span>
              <span className="text-xs text-muted-foreground font-mono-db">Dark</span>
            </div>
            <div className="flex items-center justify-between py-2.5 px-3 rounded border border-border bg-card/20">
              <span className="text-sm text-foreground">Density</span>
              <span className="text-xs text-muted-foreground font-mono-db">Comfortable</span>
            </div>
          </div>
        </section>

        <section>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground/50 font-medium mb-3">Notifications</p>
          <div className="space-y-1">
            {["Pipeline alerts", "Source health", "Rule changes"].map((item) => (
              <div key={item} className="flex items-center justify-between py-2.5 px-3 rounded border border-border bg-card/20">
                <span className="text-sm text-foreground">{item}</span>
                <div className="w-8 h-4 rounded-full bg-primary relative cursor-pointer">
                  <div className="absolute right-0.5 top-0.5 w-3 h-3 rounded-full bg-white" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground/50 font-medium mb-3">Demo</p>
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
                  <p className="px-3 text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide mb-1.5 whitespace-nowrap">
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
          <ConnectedStatusStrip collapsed={navCollapsed} />
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
        <main className="flex-1 px-6 lg:px-12 py-10 lg:py-14 overflow-y-auto">{children}</main>
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
