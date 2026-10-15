import { useId, useMemo, useState, useRef, useEffect, type ReactNode } from "react";
import { motion } from "motion/react";
import { Eye, EyeOff, MoreVertical, Unplug, ChevronRight, Plus, Shuffle, ShieldCheck, Archive } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { VendorLogo, hasVendorLogo, chipSafeColor } from "./VendorLogo";
import type { ReductionRule } from "@/app/data/rules";
import { ContextualHelpTip } from "./ContextualHelpTip";
import { useSession } from "@/app/lib/SessionContext";
import type { HealthState } from "@/app/data/fleet";
import { fmtCount, fmtSize } from "@/app/lib/environment";
import { useEscape } from "@/app/lib/useEscape";

/** Active rule count for a category, scoped to whichever sources are
 * actually connected and computed live from `rules`, not the frozen
 * RULE_CATEGORIES snapshot, toggling a rule anywhere used to change nothing
 * this badge showed. */
function ruleCountFor(rules: ReductionRule[], sourceIds: string[], category: string) {
  return rules.filter((r) => r.category === category && r.enabled && r.sourceIds.some((id) => sourceIds.includes(id))).length;
}

export interface FlowNode {
  id: string;
  name: string;
  /** GB/day ingested from this source. */
  volume: number;
  color: string;
  /** This node's own reduction rate, 0-1, when it's known per node (sample
   * environment sources, grouped rows). Unset falls back to the live rules. */
  reduction?: number;
  /** Health from the environment, so a stopped source reads as stopped right
   * on its row instead of only in a separate widget. `label` is the short
   * status shown before the throughput, empty when there's nothing to say. */
  health?: { state: HealthState; label: string };
  /** What actually flowed through this node in the selected range,
   * outages included. Readouts show this, never a rate scaled by a guess. */
  total?: { events: number; gb: number };
  /** Events per minute right now, the secondary "is it flowing" figure. */
  rateEpm?: number;
}

/**
 * Pipeline stages. Each carries the volume multiplier applied at that point,
 * so the funnel narrows progressively for a stated reason rather than in one
 * decorative step.
 */
const STAGES = [
  { id: "ingest", label: "Ingestion", sub: "Raw collection", factor: 1.0, latency: "0.8ms", ruleCategory: null },
  { id: "dedupe", label: "Deduplication", sub: "Repeats collapsed", factor: 0.82, latency: "0.4ms", ruleCategory: "Duplicate & heartbeat suppression" },
  { id: "reduce", label: "Noise rules", sub: "Low-value dropped", factor: 0.59, latency: "0.6ms", ruleCategory: "Debug-noise trimming" },
  { id: "trim", label: "Field trimming", sub: "Payloads slimmed", factor: 0.52, latency: "0.3ms", ruleCategory: "Field trimming" },
  { id: "sample", label: "Payload sampling", sub: "Allow-listed sampled", factor: 0.50, latency: "0.2ms", ruleCategory: "Payload sampling" },
  { id: "deliver", label: "Delivery", sub: "Routed to SIEM", factor: 0.48, latency: "0.2ms", ruleCategory: null },
] as const;


const ROW_H = 58;
const ROW_GAP = 10;
const THREADS = 5;
/** Width of each HTML card column in pixels, must match the w-[268px] Tailwind class. */
const COL_W = 268;

function ribbon(x1: number, t1: number, b1: number, x2: number, t2: number, b2: number) {
  const c1 = x1 + (x2 - x1) * 0.45;
  const c2 = x1 + (x2 - x1) * 0.55;
  return `M ${x1} ${t1} C ${c1} ${t1}, ${c2} ${t2}, ${x2} ${t2} L ${x2} ${b2} C ${c2} ${b2}, ${c1} ${b1}, ${x1} ${b1} Z`;
}

/** Node ids become SVG gradient ids referenced through url(#…). A space
 * ("group:Network security") or other punctuation breaks that reference and
 * the ribbon falls back to black, so only safe characters go in. */
const svgId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, "_");

const RANGE_WORDS: Record<string, string> = { "1H": "hour", "24H": "24 hours", "7D": "7 days", "30D": "30 days" };

export const fmtGb = (gb: number) => (gb >= 1000 ? `${(gb / 1000).toFixed(2)} TB` : `${Math.round(gb)} GB`);
const epsOf = (gb: number) => Math.round(gb * 14);
const fmtEps = (gb: number) => (epsOf(gb) >= 1000 ? `${(epsOf(gb) / 1000).toFixed(1)}K` : `${epsOf(gb)}`);

/** Rule-applying stages are buttons; Ingestion and Delivery are read-outs, so
 * they must not look or behave like they open something. */
function StageTile({
  interactive,
  onClick,
  label,
  badge,
  children,
}: {
  interactive: boolean;
  onClick?: () => void;
  label: string;
  /** Sits in the same header row as the title and chevron, so "N rules" and
   * "this opens something" read as one signal instead of two things
   * scattered across the tile. */
  badge?: string;
  children: ReactNode;
}) {
  const base = "text-left px-3 py-3 border-r border-border last:border-r-0";
  const header = (
    <div className="flex items-center justify-between gap-1.5">
      {/* Six tiles in the same row a five-tile layout used to hold, without
          this "Payload sampling" and "Field trimming" wrap to two lines and
          throw off every tile's vertical rhythm. */}
      <p title={label} className="text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
        {label}
      </p>
      {badge && (
        <span className="shrink-0 flex items-center gap-1">
          <span className="text-[10px] font-mono-db text-primary/80">{badge}</span>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors" aria-hidden="true" />
        </span>
      )}
    </div>
  );
  if (!interactive) return <div className={base}>{header}{children}</div>;
  return (
    <button
      onClick={onClick}
      className={`${base} group hover:bg-muted/20 transition-colors cursor-pointer`}
    >
      {header}
      {children}
    </button>
  );
}

/** Row anatomy adapted from the reference's source list: brand chip with a
 * health dot, name with share %, live eps, an accent bar that joins the
 * ribbon, and a hide toggle revealed on hover. */
function FlowRow({
  node,
  side,
  pct,
  hidden,
  active,
  dim,
  /** A source can be fully connected and still go nowhere, if it was never
   * routed to a destination. Its ingestion volume alone can't show that,
   * every source ingests regardless, so this is the only signal that
   * distinguishes "flowing" from "dead-ends after Field Trimming." */
  routed,
  onToggleHide,
  onDisconnect,
  onSelect,
  onHover,
  onRoute,
}: {
  node: FlowNode;
  side: "source" | "destination";
  pct: string;
  hidden?: boolean;
  active?: boolean;
  dim?: boolean;
  routed?: boolean;
  onToggleHide?: () => void;
  onDisconnect?: () => void;
  onSelect?: () => void;
  onHover?: (v: boolean) => void;
  /** Only meaningful while this row is flagged as disconnected, opens
   * routing scoped to this exact source or destination rather than making
   * the user find it again themselves in the general routing panel. */
  onRoute?: () => void;
}) {
  const unrouted = side === "source" && !hidden && routed === false;
  const noInflow = side === "destination" && !hidden && node.volume <= 0;
  const disconnectedFlow = unrouted || noInflow;
  const healthState = node.health?.state;
  const healthLabel = !hidden && !disconnectedFlow ? node.health?.label : undefined;
  const healthTone =
    healthState === "stopped" ? "text-destructive" : healthState === "degraded" ? "text-amber-400" : "text-muted-foreground";
  const dotClass =
    disconnectedFlow || healthState === "degraded"
      ? "bg-amber-500"
      : healthState === "stopped"
        ? "bg-destructive"
        : healthState === "recovering"
          ? "bg-info"
          : healthState === "paused"
            ? "bg-muted-foreground/60"
            : "bg-success";

  // Radix's dropdown item sits directly over this same row (the column is
  // only 268px wide with little room to open elsewhere), and closing the
  // menu can let the click's mouseup resolve against whatever's now
  // underneath, this row itself, opening the rule panel as an unwanted
  // side effect of hiding or disconnecting. A short suppression window
  // after any menu action blocks that fall-through click regardless of
  // the exact internal timing that causes it.
  const suppressSelectUntilRef = useRef(0);
  const guardedToggleHide = onToggleHide
    ? () => {
        suppressSelectUntilRef.current = Date.now() + 300;
        onToggleHide();
      }
    : undefined;
  const guardedDisconnect = onDisconnect
    ? () => {
        suppressSelectUntilRef.current = Date.now() + 300;
        onDisconnect();
      }
    : undefined;
  const guardedRoute = onRoute
    ? () => {
        suppressSelectUntilRef.current = Date.now() + 300;
        onRoute();
      }
    : undefined;
  const guardedSelect = () => {
    if (Date.now() < suppressSelectUntilRef.current) return;
    onSelect?.();
  };

  return (
    <motion.div
      className="relative rounded-lg overflow-hidden group"
      style={{ height: ROW_H }}
      animate={{ opacity: hidden ? 0.45 : disconnectedFlow ? 0.55 : dim ? 0.35 : 1 }}
      transition={{ duration: 0.2 }}
      onMouseEnter={() => !hidden && onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      <div
        className="h-full flex items-center gap-2.5 px-3 rounded-lg border cursor-pointer"
        style={{
          background:
            hidden || disconnectedFlow
              ? "rgba(13,24,43,0.5)"
              : active
                ? `linear-gradient(135deg, ${node.color}14, rgba(13,24,43,0.6))`
                : "linear-gradient(135deg, rgba(255,255,255,0.025), rgba(13,24,43,0.4))",
          borderColor: hidden || disconnectedFlow ? "rgba(255,255,255,0.05)" : active ? `${node.color}66` : "var(--border)",
        }}
        onClick={() => !hidden && guardedSelect()}
      >
        <div
          className="relative w-8 h-8 rounded flex items-center justify-center shrink-0 bg-white"
          style={{ color: chipSafeColor(node.color), opacity: hidden || disconnectedFlow ? 0.45 : 1 }}
        >
          {hasVendorLogo(node.id) ? (
            <VendorLogo connectorId={node.id} size={16} />
          ) : (
            <span className="text-[9px] font-bold" style={{ color: chipSafeColor(node.color) }}>
              {node.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          {!hidden && (
            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${dotClass}`} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={`truncate text-sm font-medium ${disconnectedFlow ? "text-muted-foreground" : "text-foreground"}`}>{node.name}</p>
            {!hidden && !disconnectedFlow && node.volume > 0 && <span className="font-mono-db text-xs text-muted-foreground">{pct}%</span>}
          </div>
          {hidden ? (
            <p className="text-xs text-muted-foreground/70 mt-0.5">Hidden from pipeline</p>
          ) : unrouted ? (
            <p className="text-xs text-amber-500/80 mt-0.5">Not routed to a destination</p>
          ) : noInflow ? (
            <p className="text-xs text-amber-500/80 mt-0.5">No source routed here yet</p>
          ) : (
            <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
              {healthLabel && (
                <>
                  <span className={`text-xs font-medium truncate ${healthTone}`}>{healthLabel}</span>
                  <span className="text-xs text-muted-foreground/50">·</span>
                </>
              )}
              {node.total ? (
                <span
                  className="font-mono-db text-xs text-muted-foreground truncate"
                  title={node.rateEpm !== undefined ? `≈ ${fmtCount(node.rateEpm)} events/min now` : undefined}
                >
                  <span className="text-success">{fmtCount(node.total.events)}</span>
                  {!healthLabel && <> · {fmtSize(node.total.gb)}</>}
                </span>
              ) : (
                <span className="font-mono-db text-xs text-success shrink-0">{fmtEps(node.volume)} eps</span>
              )}
            </div>
          )}
        </div>

        {(onToggleHide || onDisconnect || guardedRoute) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                aria-label={`Options for ${node.name}`}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-1 rounded"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {guardedRoute && disconnectedFlow && (
                <DropdownMenuItem onSelect={guardedRoute}>
                  <Shuffle className="w-4 h-4" />
                  {side === "source" ? "Route to a destination" : "Route a source here"}
                </DropdownMenuItem>
              )}
              {guardedToggleHide && (
                <DropdownMenuItem onSelect={guardedToggleHide}>
                  {hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  {hidden ? "Show in pipeline" : "Hide from pipeline"}
                </DropdownMenuItem>
              )}
              {guardedDisconnect && (
                <DropdownMenuItem variant="destructive" onSelect={guardedDisconnect}>
                  <Unplug className="w-4 h-4" /> Disconnect {side}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div
        className={`absolute top-0 bottom-0 w-[3px] ${side === "source" ? "right-0 rounded-r-lg" : "left-0 rounded-l-lg"}`}
        style={{
          background:
            hidden || disconnectedFlow ? "rgba(255,255,255,0.05)" : `linear-gradient(180deg, ${node.color}cc, ${node.color}44)`,
        }}
      />
    </motion.div>
  );
}

/**
 * Sources (HTML column) → staged flow (SVG) → destinations (HTML column).
 * This mirrors the reference's architecture of positioned rows with SVG
 * connectors behind them, which is what makes per-source hide, click-to-trace
 * and dimming work while keeping ribbons aligned to each row.
 */
export interface FlowEdge {
  sourceId: string;
  destId: string;
}

export function PipelineSankey({
  sources,
  destinations,
  edges,
  reductionFactor,
  onHighwayClick,
  onSourceClick,
  onDisconnectSource,
  onDisconnectDestination,
  onAddSource,
  onAddDestination,
  onManageRouting,
  coldStorageTargetCount,
  onManageColdStorage,
  range: rangeProp,
  onRangeChange,
  preview,
  ruleSourceIds,
  groupedSourceCount,
  selectedSourceId,
  onDestinationClick,
  selectedDestinationId,
}: {
  sources: FlowNode[];
  destinations: FlowNode[];
  /** Which source actually routes to which destination. Without this every
   * source silently fanned out to every destination in equal shares, which
   * looked plausible but was never what was actually connected. */
  edges: FlowEdge[];
  reductionFactor: number;
  /** Cold storage is never in `destinations`, it isn't something a source
   * gets routed to, so its connection state has to be passed in separately
   * rather than derived by looking for it in the routing graph. */
  coldStorageTargetCount: number;
  onManageColdStorage: () => void;
  /** Uncontrolled by default (Dashboard's compact preview just wants the
   * toggle to work). Pipeline overview controls it instead, so its own
   * volume-reduced stat can use the same range factor the diagram is
   * actually showing, rather than the two silently disagreeing the moment
   * someone clicks "7D". */
  range?: string;
  onRangeChange?: (range: string) => void;
  /** Dashboard renders this exact diagram as a teaser, every click just
   * navigates to Pipeline overview rather than opening anything in place.
   * Without some visible signal, it's indistinguishable from the real,
   * fully-interactive one on Pipeline overview itself, a badge says so
   * instead of leaving it to be discovered by clicking and finding out. */
  preview?: boolean;
  /** Which connector ids rule counts are scoped to. Defaults to the row ids,
   * which stops being true once rows are groups ("Network · 54"). */
  ruleSourceIds?: string[];
  /** Set when rows are groups: how many sources they stand for, so the
   * header doesn't report "7 of 7 sources" for 167. */
  groupedSourceCount?: number;
  /** Lets the page own which row is selected, so a row picked here stays
   * marked while the matching table rows are highlighted, and clearing that
   * highlight deselects it here too. Uncontrolled when left undefined. */
  selectedSourceId?: string | null;
  /** Same pattern as a source row: takes the user to the matching table row,
   * never straight into a drawer. */
  onDestinationClick?: (destId: string) => void;
  selectedDestinationId?: string | null;
  onHighwayClick: (ruleCategory?: string) => void;
  onSourceClick: (sourceId: string) => void;
  onAddSource?: () => void;
  onAddDestination?: () => void;
  /** Lives in the chart's own header, next to the range toggle, rather than
   * as a separate row above the card, since it's an action on this exact
   * chart's data, not a page-level action. A row's own "Route…" menu action
   * calls this too, scoped to that row, so the panel opens with the exact
   * card the user was already looking at highlighted, not just any card in
   * an unscoped stack. */
  onManageRouting?: (focus?: { sourceId?: string; destId?: string }) => void;
  /** Permanently removes the source from the pipeline. */
  onDisconnectSource?: (sourceId: string) => void;
  /** Permanently removes the destination from the pipeline, same confirm
   * flow as disconnecting a source, losing where data is routed deserves
   * the same pause as losing where it comes from. */
  onDisconnectDestination?: (destId: string) => void;
}) {
  const uid = useId();
  const { hiddenIds: sessionHiddenIds, toggleHidden, rules } = useSession();
  const sourceIds = useMemo(() => ruleSourceIds ?? sources.map((s) => s.id), [sources, ruleSourceIds]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(800);
  // Session-wide (not local to this one mounted instance) so a source hidden
  // here still reads as hidden in the sidebar status strip, and survives
  // navigating away from Pipeline and back instead of silently resetting.
  const hiddenIds = useMemo(() => new Set(sessionHiddenIds), [sessionHiddenIds]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selectedState, setSelected] = useState<string | null>(null);
  const selected = selectedSourceId !== undefined ? selectedSourceId : selectedState;
  const [rangeState, setRangeState] = useState("24H");
  const range = rangeProp ?? rangeState;
  const setRange = (r: string) => {
    onRangeChange?.(r);
    if (rangeProp === undefined) setRangeState(r);
  };
  const [pendingDisconnect, setPendingDisconnect] = useState<{ node: FlowNode; kind: "source" | "destination" } | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setPrefersReducedMotion(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEscape(() => setPendingDisconnect(null), Boolean(pendingDisconnect));

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const visible = useMemo(
    () => sources.filter((s) => !hiddenIds.has(s.id)),
    [sources, hiddenIds],
  );
  const totalInRaw = visible.reduce((a, s) => a + s.volume, 0);
  // Totals for the selected range, not rates. Each node carries what really
  // flowed through it in the range (an outage earlier in the range counts as
  // missing data); `scale` turns the diagram's GB/day geometry into those
  // totals, so 30D reads as roughly 30 days' worth, not an averaged rate.
  const allRate = sources.reduce((a, s) => a + s.volume, 0);
  const allTotal = sources.reduce((a, s) => a + (s.total?.gb ?? s.volume), 0);
  const scale = allRate > 0 ? allTotal / allRate : 1;
  const totalIn = totalInRaw * scale;
  const allEvents = sources.reduce((a, s) => a + (s.total?.events ?? 0), 0);
  const eventsPerGb = allTotal > 0 && allEvents > 0 ? allEvents / allTotal : 0;
  const rateIn = visible.reduce((a, s) => a + (s.rateEpm ?? 0), 0);
  const kept = 1 - reductionFactor;
  const active = selected ?? hovered;

  const toggleHide = (id: string) => {
    if (!hiddenIds.has(id) && selected === id) setSelected(null);
    toggleHidden(id);
  };

  // The HTML column centers its rows AND the trailing "Add source/destination"
  // button together as one flex group (`justify-center` on the whole column),
  // so the rows' true visual center shifts once that button is present. This
  // has to mirror that exactly, or the ribbon endpoints drift toward
  // whichever column has the extra button, which is exactly what was
  // happening before this fix.
  const ADD_BTN_H = 46;
  const colContentH = (count: number, hasAddButton: boolean) => {
    const rowsH = count * ROW_H + Math.max(0, count - 1) * ROW_GAP;
    return hasAddButton ? rowsH + ROW_GAP + ADD_BTN_H : rowsH;
  };
  const colH = Math.max(
    colContentH(sources.length, Boolean(onAddSource)),
    colContentH(destinations.length, Boolean(onAddDestination)),
    240,
  );
  const H = colH + 80;
  const midY = H / 2;
  const rowCenter = (i: number, count: number, hasAddButton: boolean) =>
    (H - colContentH(count, hasAddButton)) / 2 + i * (ROW_H + ROW_GAP) + ROW_H / 2;

  const maxStack = H * 0.6;
  // Geometry stays in the same unit the heights are drawn in (each node's
  // GB/day), so ribbon thickness only ever shows share, whatever the range.
  // Dividing by the range total here drew 1H ribbons ~22× too tall.
  const pxPerGb = totalInRaw > 0 ? maxStack / totalInRaw : 0;

  // Position stacks between the volume-weighted Y center of source cards and
  // the volume-weighted Y center of active destination cards. When all flow
  // routes to a single destination at the top of the column, this shifts the
  // stacks upward so every exit ribbon converges gently instead of arcing
  // steeply from the middle of the panel to the top-most destination.
  const srcWeightedY = (() => {
    const totalVol = visible.reduce((a, s) => a + s.volume, 0);
    if (totalVol === 0) return midY;
    return visible.reduce((a, s) => {
      const srcY = rowCenter(sources.indexOf(s), sources.length, Boolean(onAddSource));
      return a + (srcY * s.volume) / totalVol;
    }, 0);
  })();
  const destWeightedY = (() => {
    const flows = destinations.map((d, i) => ({
      dy: rowCenter(i, destinations.length, Boolean(onAddDestination)),
      vol: edges.filter((e) => e.destId === d.id).reduce((a, e) => {
        const s = visible.find((v) => v.id === e.sourceId);
        return a + (s ? s.volume : 0);
      }, 0),
    }));
    const totalVol = flows.reduce((a, d) => a + d.vol, 0);
    return totalVol > 0 ? flows.reduce((a, d) => a + (d.dy * d.vol) / totalVol, 0) : midY;
  })();
  const stackCenter = (srcWeightedY + destWeightedY) / 2;

  // Equal on both sides, the 6 stage markers represent processing in the
  // middle of the pipe, not something that hugs either end, an asymmetric
  // pad (fan-out room after sources, wider convergence room before
  // destinations) shifted the whole marker row visibly left of center. The
  // ribbon's own convergence curve into the destination card doesn't depend
  // on this value, only on where the last marker sits.
  const STAGE_PAD = 116;
  const stageAreaStart = COL_W + STAGE_PAD;
  const stageAreaEnd = W - COL_W - STAGE_PAD;
  const stageAreaWidth = Math.max(stageAreaEnd - stageAreaStart, 60);
  const stageX = STAGES.map((_, i) => stageAreaStart + (stageAreaWidth / (STAGES.length - 1)) * i);

  // stackCenter is a volume-weighted average of source/destination row
  // positions, which has no lower bound of its own, when one destination
  // near the top of its column receives all the volume, the whole ribbon
  // bundle gets pulled up with it. Clamping keeps a fixed breathing margin
  // above the stage tiles regardless of how lopsided that weighting gets.
  const STACK_TOP_PAD = 28;
  const STACK_BOTTOM_PAD = 28;
  const stackAt = useMemo(
    () => (factor: number) => {
      const hs = visible.map((s) => Math.max(s.volume * factor * pxPerGb, 3));
      const total = hs.reduce((a, b) => a + b, 0) + 8 * Math.max(0, visible.length - 1);
      let y = stackCenter - total / 2;
      y = Math.max(STACK_TOP_PAD, Math.min(y, H - STACK_BOTTOM_PAD - total));
      return hs.map((h) => {
        const seg = { top: y, bottom: y + h, center: y + h / 2 };
        y += h + 8;
        return seg;
      });
    },
    [visible, pxPerGb, stackCenter, H],
  );
  const stacks = STAGES.map((st) => stackAt(st.factor));

  // Real per-destination totals: the sum of whichever visible sources are
  // actually routed to it (mirrored in full, the way a SIEM and a second
  // detection tool both receive a complete copy), never an even split.
  const destInflows = destinations.map((d) => {
    const contributors = edges
      .filter((e) => e.destId === d.id)
      .map((e) => visible.find((s) => s.id === e.sourceId))
      .filter((s): s is FlowNode => Boolean(s));
    const total = contributors.reduce((a, s) => a + s.volume * scale * kept, 0);
    return { dest: d, contributors, total };
  });
  const totalDelivered = destInflows.reduce((a, d) => a + d.total, 0);

  const strand = (seg: { top: number; bottom: number }, t: number) => {
    const band = (seg.bottom - seg.top) / THREADS;
    const inset = Math.min(band * 0.2, 2);
    return { top: seg.top + t * band + inset, bottom: seg.top + (t + 1) * band - inset };
  };

  return (
    <div className="rounded-lg border border-border glass-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-success live-pulse-dot" />
          <span className="text-sm font-medium text-foreground">Data pipeline</span>
          {preview && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded-full px-2 py-0.5">
              Preview, click to open
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-2">
            {groupedSourceCount !== undefined
              ? `${groupedSourceCount} sources in ${sources.length} groups`
              : `${visible.length} of ${sources.length} source${sources.length === 1 ? "" : "s"}`}
            {hiddenIds.size > 0 && ` · ${hiddenIds.size} hidden`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {["1H", "24H", "7D", "30D"].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-xs px-2.5 py-1 rounded font-mono-db transition-colors ${
                range === r ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r}
            </button>
          ))}
          <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-success border border-success/30 bg-success/10 rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success live-pulse-dot" />
            Live
          </span>
        </div>
      </div>

      <div className="grid border-b border-border" style={{ gridTemplateColumns: `repeat(${STAGES.length}, minmax(0, 1fr))` }}>
        {STAGES.map((st, i) => {
          const vol = totalIn * st.factor;
          const prev = i > 0 ? totalIn * STAGES[i - 1].factor : null;
          return (
            <StageTile
              key={st.id}
              interactive={Boolean(st.ruleCategory)}
              onClick={st.ruleCategory ? () => onHighwayClick(st.ruleCategory as string) : undefined}
              label={st.label}
              badge={st.ruleCategory ? `${ruleCountFor(rules, sourceIds, st.ruleCategory)} rules` : undefined}
            >
              {/* The total for the selected range is the headline; the rate
                  underneath answers "is it flowing right now?". */}
              <ContextualHelpTip content={`Events through this stage in the last ${RANGE_WORDS[range] ?? range}, then their size. The third line is the rate right now.`}>
                <span className="mt-1 block text-lg font-mono-db text-foreground">{eventsPerGb > 0 ? fmtCount(vol * eventsPerGb) : fmtEps(vol)}</span>
              </ContextualHelpTip>
              <p className="text-xs font-mono-db text-muted-foreground/80 truncate">{fmtSize(vol)}</p>
              {rateIn > 0 && <p className="text-xs font-mono-db text-muted-foreground/60 truncate">≈{fmtCount(rateIn * st.factor)}/min now</p>}
              {prev && prev > vol ? (
                <p className="text-xs text-success font-mono-db mt-0.5 truncate">↓ {Math.round((1 - vol / prev) * 100)}% reduced</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">{st.sub}</p>
              )}
            </StageTile>
          );
        })}
      </div>

      {/* Not a funnel stage, it doesn't remove volume the way the tiles
          above do, it exempts specific events from every rule above so
          they're always forwarded in full. Giving it its own tile would
          have implied it reduces the flow the same way, when it does the
          opposite, so it sits here instead: alongside the funnel, not in it. */}
      <button
        onClick={() => onHighwayClick("Compliance-safe exclusions")}
        className="w-full flex items-center justify-center gap-1.5 px-4 py-2 border-b border-border bg-muted/5 hover:bg-muted/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ShieldCheck className="w-3.5 h-3.5 text-info shrink-0" aria-hidden="true" />
        <span className="text-xs text-muted-foreground">
          <span className="font-mono-db text-info">{ruleCountFor(rules, sourceIds, "Compliance-safe exclusions")}</span> compliance guardrails
          keep matching events exempt from every rule above, always forwarded in full
        </span>
      </button>

      <div ref={containerRef} className="relative" style={{ minHeight: H }}>
        {/* Tried as a full-width banner row matching compliance/cold storage,
            reverted: routing is checked far more often than either of those,
            a compact CTA pinned above the destination column earns its
            place without spending a full row of vertical space on it every
            time the page loads. */}
        {onManageRouting && (
          <button
            onClick={() => onManageRouting()}
            className="absolute top-3 right-3 z-20 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded px-2.5 py-1 bg-card/80 backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Shuffle className="w-3 h-3" aria-hidden="true" />
            Manage routing
          </button>
        )}
        <div className="absolute left-0 top-0 bottom-0 w-[268px] flex flex-col justify-center gap-[10px] px-3 py-5 z-10">
          {sources.map((s) => (
            <FlowRow
              key={s.id}
              node={s}
              side="source"
              // The eps/GB readout next to this never moves with the range
              // filter (it's the source's own raw volume), so its share of
              // the whole has to come from that same raw basis too, dividing
              // it by a range-scaled total was producing shares over 100%.
              pct={totalInRaw > 0 && !hiddenIds.has(s.id) ? ((s.volume / totalInRaw) * 100).toFixed(1) : "0"}
              hidden={hiddenIds.has(s.id)}
              active={active === s.id}
              dim={active !== null && active !== s.id}
              routed={edges.some((e) => e.sourceId === s.id)}
              onToggleHide={() => toggleHide(s.id)}
              onDisconnect={onDisconnectSource ? () => setPendingDisconnect({ node: s, kind: "source" }) : undefined}
              onRoute={onManageRouting ? () => onManageRouting({ sourceId: s.id }) : undefined}
              onSelect={() => {
                setSelected(selected === s.id ? null : s.id);
                onSourceClick(s.id);
              }}
              onHover={(v) => setHovered(v ? s.id : null)}
            />
          ))}
          {onAddSource && (
            <button
              onClick={onAddSource}
              className="h-[46px] rounded border border-dashed border-primary/40 bg-primary/[0.04] text-sm font-medium text-primary hover:text-primary hover:border-primary hover:bg-primary/10 transition-colors inline-flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="w-3.5 h-3.5" /> Add source
            </button>
          )}
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-hidden="true" style={{ display: "block" }}>
          <defs>
              {visible.map((s) => (
                <linearGradient key={s.id} id={`${uid}-g-${svgId(s.id)}`} gradientUnits="userSpaceOnUse" x1={COL_W} y1="0" x2={W - COL_W} y2="0">
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.9" />
                  <stop offset="30%" stopColor="var(--db-blue)" stopOpacity="0.7" />
                  <stop offset="70%" stopColor="var(--db-cyan-dark)" stopOpacity="0.65" />
                  <stop offset="100%" stopColor="var(--db-teal)" stopOpacity="0.7" />
                </linearGradient>
              ))}
              {/* The shared gradient above has fully faded to teal by the time
                  it reaches the destination hop, so which source feeds which
                  destination became invisible. This one is scoped to just that
                  final short span, so it stays recognizably the source's color
                  right up to the destination it's routed to. */}
              {edges.map((e) => {
                const s = visible.find((v) => v.id === e.sourceId);
                const d = destinations.find((v) => v.id === e.destId);
                if (!s || !d) return null;
                return (
                  <linearGradient
                    key={`${e.sourceId}-${e.destId}`}
                    id={`${uid}-e-${svgId(e.sourceId)}-${svgId(e.destId)}`}
                    gradientUnits="userSpaceOnUse"
                    x1={stageX[STAGES.length - 1]}
                    y1="0"
                    x2={W - COL_W}
                    y2="0"
                  >
                    <stop offset="0%" stopColor="var(--db-teal)" stopOpacity="0.6" />
                    <stop offset="100%" stopColor={s.color} stopOpacity="0.85" />
                  </linearGradient>
                );
              })}
              <linearGradient id={`${uid}-sweep`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2="0">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0">
                  {!prefersReducedMotion && <animate attributeName="offset" values="-0.3;1.0" dur="3s" repeatCount="indefinite" />}
                </stop>
                <stop offset="7%" stopColor="#dff6ff" stopOpacity={prefersReducedMotion ? "0" : "0.25"}>
                  {!prefersReducedMotion && <animate attributeName="offset" values="-0.23;1.07" dur="3s" repeatCount="indefinite" />}
                </stop>
                <stop offset="14%" stopColor="#ffffff" stopOpacity="0">
                  {!prefersReducedMotion && <animate attributeName="offset" values="-0.16;1.14" dur="3s" repeatCount="indefinite" />}
                </stop>
              </linearGradient>
              {visible.flatMap((s, si) => {
                const srcY = rowCenter(sources.indexOf(s), sources.length, Boolean(onAddSource));
                return edges
                  .filter((e) => e.sourceId === s.id)
                  .flatMap((e) => {
                    const destIdx = destinations.findIndex((dest) => dest.id === e.destId);
                    if (destIdx < 0) return [];
                    const edy = rowCenter(destIdx, destinations.length, Boolean(onAddDestination));
                    let pd = `M ${COL_W} ${srcY}`;
                    let px = COL_W;
                    let py = srcY;
                    STAGES.forEach((_, i) => {
                      const x = stageX[i];
                      const y = stacks[i][si].center;
                      pd += ` C ${px + (x - px) * 0.45} ${py}, ${px + (x - px) * 0.55} ${y}, ${x} ${y}`;
                      px = x;
                      py = y;
                    });
                    pd += ` C ${px + ((W - COL_W) - px) * 0.45} ${py}, ${px + ((W - COL_W) - px) * 0.55} ${edy}, ${W - COL_W} ${edy}`;
                    return [<path key={`${s.id}-${e.destId}`} id={`${uid}-mid-${s.id}-${e.destId}`} d={pd} fill="none" />];
                  });
              })}
              {/* Glow behind each stage rail and around a traced source's
                  ribbons, matching the reference's node/ribbon glow. */}
              <filter id={`${uid}-node-glow`} x="-200%" y="-20%" width="500%" height="140%">
                <feGaussianBlur stdDeviation="6" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id={`${uid}-rglow`} x="-25%" y="-35%" width="150%" height="170%">
                <feGaussianBlur stdDeviation="7" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <radialGradient id={`${uid}-ambient`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--db-blue)" stopOpacity="0.05" />
                <stop offset="60%" stopColor="var(--db-cyan-dark)" stopOpacity="0.025" />
                <stop offset="100%" stopColor="var(--db-blue-darkest)" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Ambient glow + alternating column tint give the canvas the same
                atmosphere and rhythm as the reference instead of flat black. */}
            <ellipse cx={W / 2} cy={midY} rx={W * 0.42} ry={H * 0.48} fill={`url(#${uid}-ambient)`} />
            {STAGES.slice(0, -1).map((_, i) =>
              i % 2 === 1 ? (
                <rect key={`bg-${i}`} x={stageX[i]} y={0} width={stageX[i + 1] - stageX[i]} height={H} fill="rgba(255,255,255,0.008)" />
              ) : null,
            )}

            {STAGES.map((st, i) => {
              const col = stacks[i];
              if (!col.length) return null;
              const barH = col[col.length - 1].bottom - col[0].top + 10;
              const barTop = col[0].top - 5;
              return (
                <g key={st.id}>
                  <rect x={stageX[i] - 9} y={barTop - 4} width={18} height={barH + 8} rx={9} fill="var(--db-cyan-light)" fillOpacity={0.05} filter={`url(#${uid}-node-glow)`} />
                  <rect x={stageX[i] - 1.5} y={barTop} width={3} height={barH} rx={1.5} fill="var(--db-cyan-light)" fillOpacity={0.35} />
                  <circle cx={stageX[i]} cy={barTop} r={2.5} fill="var(--db-cyan-light)" fillOpacity={0.7} />
                  <circle cx={stageX[i]} cy={barTop + barH} r={1.8} fill="var(--db-cyan-light)" fillOpacity={0.4} />
                </g>
              );
            })}

            {visible.map((s, si) => {
              const isAct = active === s.id;
              const dim = active !== null && !isAct;
              const srcY = rowCenter(sources.indexOf(s), sources.length, Boolean(onAddSource));
              return (
                <g
                  key={s.id}
                  filter={isAct ? `url(#${uid}-rglow)` : undefined}
                  onMouseEnter={() => setHovered(s.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => {
                    setSelected(selected === s.id ? null : s.id);
                    onSourceClick(s.id);
                  }}
                  style={{ cursor: "pointer" }}
                  role="button"
                  aria-label={`See what's being filtered for ${s.name}`}
                >
                  {Array.from({ length: THREADS }).map((_, t) => {
                    // Ribbon starts as a thin 6px slot at the card edge and
                    // fans out to the volume-proportional stack width at the
                    // first stage, so the flow visually emerges from the card.
                    const rowSeg = { top: srcY - 3, bottom: srcY + 3 };
                    const rowStrand = strand(rowSeg, t);
                    const a = strand(stacks[0][si], t);
                    return (
                      <path
                        key={`e-${t}`}
                        d={ribbon(COL_W, rowStrand.top, rowStrand.bottom, stageX[0], a.top, a.bottom)}
                        fill={`url(#${uid}-g-${svgId(s.id)})`}
                        fillOpacity={dim ? 0.08 : isAct ? 0.9 : 0.5}
                        stroke={s.color}
                        strokeWidth={isAct ? 0.8 : 0.3}
                        strokeOpacity={dim ? 0.03 : isAct ? 0.5 : 0.15}
                      />
                    );
                  })}
                  {STAGES.slice(0, -1).map((_, i) =>
                    Array.from({ length: THREADS }).map((_, t) => {
                      const a = strand(stacks[i][si], t);
                      const b = strand(stacks[i + 1][si], t);
                      return (
                        <path
                          key={`${i}-${t}`}
                          d={ribbon(stageX[i], a.top, a.bottom, stageX[i + 1], b.top, b.bottom)}
                          fill={`url(#${uid}-g-${svgId(s.id)})`}
                          fillOpacity={dim ? 0.08 : isAct ? 0.9 : 0.5}
                          stroke={s.color}
                          strokeWidth={isAct ? 0.8 : 0.3}
                          strokeOpacity={dim ? 0.03 : isAct ? 0.5 : 0.15}
                        />
                      );
                    }),
                  )}
                  {/* Bright center-line thread through each hop, so the flow
                      reads as moving left to right instead of a static block. */}
                  {STAGES.slice(0, -1).map((_, i) => {
                    const a = stacks[i][si];
                    const b = stacks[i + 1][si];
                    return (
                      <path
                        key={`cl-${i}`}
                        d={`M ${stageX[i]} ${a.center} C ${stageX[i] + (stageX[i + 1] - stageX[i]) * 0.45} ${a.center}, ${stageX[i] + (stageX[i + 1] - stageX[i]) * 0.55} ${b.center}, ${stageX[i + 1]} ${b.center}`}
                        fill="none"
                        stroke="var(--db-cyan-light)"
                        strokeWidth={isAct ? 1.4 : 0.6}
                        strokeOpacity={dim ? 0.05 : isAct ? 0.7 : 0.25}
                      />
                    );
                  })}
                  {STAGES.slice(0, -1).map((_, i) => {
                    const a = stacks[i][si];
                    const b = stacks[i + 1][si];
                    return (
                      <path
                        key={`sw-${i}`}
                        d={ribbon(stageX[i], a.top, a.bottom, stageX[i + 1], b.top, b.bottom)}
                        fill={`url(#${uid}-sweep)`}
                        style={{ pointerEvents: "none" }}
                        opacity={dim ? 0.15 : 1}
                      />
                    );
                  })}
                  {!prefersReducedMotion && edges.filter((e) => e.sourceId === s.id).flatMap((e, ei) => {
                    const destIdx = destinations.findIndex((dest) => dest.id === e.destId);
                    if (destIdx < 0) return [];
                    return Array.from({ length: 3 }).map((_, k) => (
                      <circle key={`p-${ei}-${k}`} r={2} fill="var(--db-cyan-light)" opacity={dim ? 0.15 : 0.95}>
                        <animateMotion dur={`${3.5 + ei * 0.7}s`} begin={`${k * 1.2 + ei * 0.3}s`} repeatCount="indefinite">
                          <mpath href={`#${uid}-mid-${s.id}-${e.destId}`} />
                        </animateMotion>
                      </circle>
                    ));
                  })}
                </g>
              );
            })}

            {destInflows.map(({ dest: d, contributors, total }, i) => {
              if (total <= 0) return null;
              const dy = rowCenter(i, destinations.length, Boolean(onAddDestination));
              // Ribbons converge to a thin 6px slot at the destination card edge,
              // mirroring the source fan-out. Each contributor gets a proportional
              // slice of that 6px, stacked around the card's center Y.
              const DEST_THIN = 6;
              let thinY = dy - DEST_THIN / 2;
              return (
                <g key={d.id}>
                  {contributors.map((s) => {
                    const segVol = s.volume * scale * kept;
                    const thinH = Math.max(total > 0 ? (segVol / total) * DEST_THIN : 1, 1);
                    const top = thinY;
                    const bottom = thinY + thinH;
                    thinY = bottom;
                    const si = visible.indexOf(s);
                    const srcSeg = stacks[STAGES.length - 1][si];
                    const isAct = active === s.id;
                    const dim = active !== null && !isAct;
                    return (
                      <path
                        key={`${s.id}-${d.id}`}
                        d={ribbon(stageX[STAGES.length - 1], srcSeg.top, srcSeg.bottom, W - COL_W, top, bottom)}
                        fill={`url(#${uid}-e-${svgId(s.id)}-${svgId(d.id)})`}
                        fillOpacity={dim ? 0.08 : isAct ? 0.85 : 0.6}
                        stroke={s.color}
                        strokeWidth={isAct ? 0.8 : 0.3}
                        strokeOpacity={dim ? 0.03 : isAct ? 0.55 : 0.2}
                        filter={isAct ? `url(#${uid}-rglow)` : undefined}
                        onMouseEnter={() => setHovered(s.id)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => {
                          setSelected(selected === s.id ? null : s.id);
                          onSourceClick(s.id);
                        }}
                        style={{ cursor: "pointer" }}
                        role="button"
                        aria-label={`See what's being filtered for ${s.name}`}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>

        <div className="absolute right-0 top-0 bottom-0 w-[268px] flex flex-col justify-center gap-[10px] px-3 py-5 z-10">
          {destInflows.map(({ dest: d, total }) => (
            <FlowRow
              key={d.id}
              node={{ ...d, volume: total, total: eventsPerGb > 0 ? { gb: total, events: total * eventsPerGb } : undefined }}
              side="destination"
              pct={totalDelivered > 0 ? ((total / totalDelivered) * 100).toFixed(0) : "0"}
              dim={total <= 0 || (selectedDestinationId != null && selectedDestinationId !== d.id)}
              active={selectedDestinationId === d.id}
              onSelect={onDestinationClick ? () => onDestinationClick(d.id) : undefined}
              onDisconnect={onDisconnectDestination ? () => setPendingDisconnect({ node: d, kind: "destination" }) : undefined}
              onRoute={onManageRouting ? () => onManageRouting({ destId: d.id }) : undefined}
            />
          ))}
          {onAddDestination && (
            <button
              onClick={onAddDestination}
              className="h-[46px] rounded border border-dashed border-primary/40 bg-primary/[0.04] text-sm font-medium text-primary hover:text-primary hover:border-primary hover:bg-primary/10 transition-colors inline-flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="w-3.5 h-3.5" /> Add destination
            </button>
          )}
        </div>
      </div>

      {/* Disconnect is destructive and irreversible in-session, so it confirms
          first and states exactly what stops happening, same flow for a
          source or a destination, just different consequences to spell out. */}
      {pendingDisconnect && (
        <div
          className="fixed inset-0 z-[70] bg-background/70 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setPendingDisconnect(null)}
          aria-hidden="true"
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border glass-card p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="disconnect-title"
            aria-describedby="disconnect-desc"
            aria-hidden="false"
          >
            <p id="disconnect-title" className="text-sm font-medium text-foreground">
              Disconnect {pendingDisconnect.node.name}?
            </p>
            <p id="disconnect-desc" className="text-sm text-muted-foreground mt-2">
              {pendingDisconnect.kind === "source"
                ? "Databahn stops collecting from this source immediately. Data already delivered to your destinations is unaffected. You can reconnect it any time."
                : "Databahn stops routing data here immediately. Sources that only routed to this destination will show as not yet routed. You can reconnect it any time."}
            </p>
            <div className="flex items-center justify-end gap-3 mt-5">
              <button
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                onClick={() => setPendingDisconnect(null)}
                className="text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-2 py-1 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (pendingDisconnect.kind === "source") onDisconnectSource?.(pendingDisconnect.node.id);
                  else onDisconnectDestination?.(pendingDisconnect.node.id);
                  setPendingDisconnect(null);
                }}
                className="text-sm rounded-full px-4 py-2 bg-destructive text-destructive-foreground hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The old left-hand hint ("click a source to trace it, row menu to
          hide or disconnect") described affordances that are already
          visible on the rows themselves (the kebab menu), and repeated a
          rule count the Rule adoption tile already states, it wasn't
          telling anyone anything they couldn't already see. Cold storage
          status earns that space instead: a real, otherwise easy-to-miss
          fact, not a UI hint. */}
      <div className="px-5 py-2.5 border-t border-border flex items-center justify-between gap-6">
        <button
          onClick={onManageColdStorage}
          className={`inline-flex items-center gap-1.5 text-xs truncate transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded ${
            coldStorageTargetCount > 0 ? "text-muted-foreground hover:text-foreground" : "text-amber-300 hover:text-amber-200"
          }`}
        >
          <Archive className={`w-3 h-3 shrink-0 ${coldStorageTargetCount > 0 ? "text-muted-foreground" : "text-amber-400"}`} aria-hidden="true" />
          {coldStorageTargetCount > 0 ? (
            <>
              <span className="text-foreground font-mono-db">{fmtSize(totalIn * reductionFactor)}</span> filtered in {range} to{" "}
              {coldStorageTargetCount === 1 ? "cold storage" : `${coldStorageTargetCount} cold storage targets`} ·{" "}
              <span className="text-foreground font-medium underline underline-offset-2">Manage</span>
            </>
          ) : (
            <>
              <span className="font-mono-db">{fmtSize(totalIn * reductionFactor)}</span> filtered in {range}, not retained ·{" "}
              <span className="text-foreground font-medium underline underline-offset-2">Connect cold storage</span>
            </>
          )}
        </button>
        <p className="text-xs font-mono-db text-muted-foreground whitespace-nowrap shrink-0">
          {fmtSize(totalIn)} in → <span className="text-success">{fmtSize(totalIn * kept)} delivered</span> · {range}
        </p>
      </div>
    </div>
  );
}
