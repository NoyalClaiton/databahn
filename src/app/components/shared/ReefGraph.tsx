import { useState, useMemo, useCallback, useRef, useEffect, useId } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle, Database, Eye, Globe, Key, LocateFixed,
  Monitor, Pause, Play, Shield, Terminal, X,
} from "lucide-react";

/**
 * Reef investigation graph.
 *
 * Ported from the reference app's `AttackPathFlow` rather than reinvented: it
 * already solves longest-path DAG layering, curved-bezier edge routing,
 * pan/zoom, animated edge particles, a replay stepper, per-instance SVG defs
 * via useId(), and a drag-resizable canvas. Only the palette, the copy, and
 * the domain vocabulary are adapted for Databahn; the mechanics are unchanged.
 *
 * The node contract is deliberately kept identical to the original so the
 * internals did not need rewriting: `phase` carries the entity category and
 * `status` carries how the record reached us (see STATUS_MEANING below).
 */

const F = { sans: "Inter, sans-serif", mono: "'DM Mono', monospace" } as const;
const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4a94f9] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0d182b]";

function hexA(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Entity categories, coloured from the Databahn palette. */
const PHASE_COLOR: Record<string, string> = {
  Identity: "#4a94f9",
  Network: "#53d9ff",
  Endpoint: "#0fb4ba",
  Cloud: "#29cc96",
  Privilege: "#F59E0B",
  Data: "#e55c5c",
  Directory: "#80b4fa",
};

export interface ReefNode {
  label: string;
  sublabel: string;
  /** Entity category, drives node colour. */
  phase: string;
  /**
   * compromised → confirmed malicious / highest risk
   * detected    → suspicious, under investigation
   * blocked     → benign or already stopped
   * initial     → context only, unscored (typically cold storage)
   */
  status: "initial" | "detected" | "compromised" | "blocked";
  targets?: number[];
  edgeMeta?: Record<number, { label?: string; protocol?: string; dataSize?: string }>;
}

type AttackNode = ReefNode;

/** Category glyph, remapped from the reference app's MITRE phases to
 * Databahn's entity categories. */
function PhaseIcon({ phase, color, size = 18 }: { phase: string; color: string; size?: number }) {
  const s = { color };
  if (phase.includes("Identity")) return <Key size={size} style={s} />;
  if (phase.includes("Endpoint")) return <Monitor size={size} style={s} />;
  if (phase.includes("Directory")) return <Terminal size={size} style={s} />;
  if (phase.includes("Data")) return <Database size={size} style={s} />;
  if (phase.includes("Privilege")) return <Shield size={size} style={s} />;
  if (phase.includes("Cloud")) return <Eye size={size} style={s} />;
  return <Globe size={size} style={s} />;
}

interface LayoutNode { x: number; y: number; node: AttackNode; idx: number; depth: number; }
interface LayoutEdge { from: number; to: number; label?: string; protocol?: string; dataSize?: string; }
interface Layout { lnodes: LayoutNode[]; ledges: LayoutEdge[]; width: number; height: number; }

/**
 * Spacing is driven by the text block under each node, not by the node circle.
 * A node is a 26px ring but carries a centred label, sublabel and phase chip
 * that run ~140px wide and ~30px tall, so two nodes an ordinary circle-width
 * apart still have their sublabels written over each other. These floors keep
 * one text block clear of the next; the layout grows the viewBox to honour
 * them and lets preserveAspectRatio scale the result to fit, which also stops
 * rows collapsing into each other when the canvas is dragged short.
 */
const MIN_COL_SPACING = 165;
const MIN_ROW_SPACING = 96;
const PAD_X = 76;
const PAD_TOP = 55;
/** Deeper than PAD_TOP because the text block hangs below the node centre. */
const PAD_BOTTOM = 80;
const BASE_W = 700;

/** Longest sublabel that still fits inside MIN_COL_SPACING at 9px DM Mono
 * (0.6em advance). Anything longer is clipped here and read in full from the
 * click-to-select detail panel, which always shows the untouched string. */
const SUBLABEL_MAX = 26;

function clipText(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

function layoutGraph(nodes: AttackNode[], viewH = 320): Layout {
  const n = nodes.length;
  if (n === 0) return { lnodes: [], ledges: [], width: BASE_W, height: viewH };

  const lnodes: LayoutNode[] = [];
  const ledges: LayoutEdge[] = [];

  // Build adjacency and collect edges
  const hasTargets = nodes.some(nd => nd.targets && nd.targets.length > 0);

  if (!hasTargets) {
    // Linear chain fallback, staggered zigzag
    const W = Math.max(BASE_W, PAD_X * 2 + Math.max(0, n - 1) * MIN_COL_SPACING);
    const H = viewH, padX = PAD_X;
    const usableW = W - padX * 2;
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0.5;
      const x = padX + t * usableW;
      const yBase = H / 2;
      const amp = 50;
      const yOff = i % 2 === 0 ? -amp * (0.5 + Math.sin(t * Math.PI) * 0.5) : amp * (0.3 + Math.cos(t * Math.PI * 0.7) * 0.4);
      lnodes.push({ x, y: yBase + yOff, node: nodes[i], idx: i, depth: i });
      if (i > 0) ledges.push({ from: i - 1, to: i });
    }
    return { lnodes, ledges, width: W, height: H };
  }

  // DAG layout, compute depth (longest path from any root)
  const children: number[][] = nodes.map(() => []);
  const parents: number[][] = nodes.map(() => []);
  for (let i = 0; i < n; i++) {
    const tgts = nodes[i].targets || [];
    for (const t of tgts) {
      if (t >= 0 && t < n) {
        children[i].push(t);
        parents[t].push(i);
      }
    }
  }

  // Topological depth assignment, longest path from roots (handles diamonds correctly)
  const depth = new Array(n).fill(0);
  const roots: number[] = [];
  for (let i = 0; i < n; i++) {
    if (parents[i].length === 0) roots.push(i);
  }
  if (roots.length === 0) roots.push(0);

  // Iterative relaxation, ensures longest-path depth assignment
  let changed = true;
  let iterations = 0;
  while (changed && iterations < n * 2) {
    changed = false;
    iterations++;
    for (let i = 0; i < n; i++) {
      for (const ch of children[i]) {
        const newDepth = depth[i] + 1;
        if (newDepth > depth[ch]) {
          depth[ch] = newDepth;
          changed = true;
        }
      }
    }
  }

  // Group nodes by depth level
  const maxDepth = Math.max(...depth);
  const levels: number[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (let i = 0; i < n; i++) levels[depth[i]].push(i);

  // Position nodes. The canvas is sized from the layout rather than the other
  // way round, so a deep graph or a crowded level widens/heightens the viewBox
  // instead of packing text blocks on top of each other.
  const widest = Math.max(...levels.map(l => l.length));
  const W = Math.max(BASE_W, PAD_X * 2 + maxDepth * MIN_COL_SPACING);
  const H = Math.max(viewH, PAD_TOP + PAD_BOTTOM + Math.max(0, widest - 1) * MIN_ROW_SPACING);
  const usableW = W - PAD_X * 2;
  const usableH = H - PAD_TOP - PAD_BOTTOM;
  const colWidth = maxDepth > 0 ? usableW / maxDepth : 0;

  for (let d = 0; d <= maxDepth; d++) {
    const nodesAtLevel = levels[d];
    const count = nodesAtLevel.length;
    for (let j = 0; j < count; j++) {
      const idx = nodesAtLevel[j];
      const x = PAD_X + d * colWidth;
      const ySpacing = count > 1 ? usableH / (count - 1) : 0;
      const y = count > 1 ? PAD_TOP + j * ySpacing : H / 2;
      lnodes[idx] = { x, y, node: nodes[idx], idx, depth: d };
    }
  }

  // Build edges with metadata
  for (let i = 0; i < n; i++) {
    const tgts = nodes[i].targets || [];
    for (const t of tgts) {
      if (t >= 0 && t < n) {
        const meta = nodes[i].edgeMeta?.[t];
        ledges.push({ from: i, to: t, label: meta?.label, protocol: meta?.protocol, dataSize: meta?.dataSize });
      }
    }
  }

  return { lnodes, ledges, width: W, height: H };
}

// ── Animated flowing particles along edges ──────────────────────────
function FlowParticles({ x1, y1, x2, y2, color, status, edgeLabel, edgeProtocol, edgeDataSize }: {
  x1: number; y1: number; x2: number; y2: number; color: string; status: string;
  edgeLabel?: string; edgeProtocol?: string; edgeDataSize?: string;
}) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  // Control point for curve, gentler curvature
  const curveFactor = 0.12;
  const mx = (x1 + x2) / 2 - dy * curveFactor;
  const my = (y1 + y2) / 2 + dx * curveFactor;
  const path = `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
  const isCompromised = status === "compromised";
  const isBlocked = status === "blocked";
  // Slower particle speed, informative pace
  const dur = Math.max(3.5, len / 50);

  // Edge label text
  // Show most informative label: prefer protocol+dataSize, then label alone
  const labelParts: string[] = [];
  if (edgeProtocol) labelParts.push(edgeProtocol);
  if (edgeDataSize) labelParts.push(edgeDataSize);
  if (!edgeProtocol && !edgeDataSize && edgeLabel) labelParts.push(edgeLabel);
  const displayLabel = labelParts.length > 0 ? labelParts.join(" · ") : null;

  return (
    <g>
      {/* Edge glow under */}
      <path d={path} fill="none" stroke={hexA(color, 0.04)} strokeWidth={6} />
      {/* Edge line */}
      <path d={path} fill="none" stroke={hexA(color, 0.2)} strokeWidth={1.2}
        strokeDasharray={isBlocked ? "6 4" : undefined} />
      {/* Animated particles, only for active/compromised paths */}
      {!isBlocked && (
        <>
          <circle r={isCompromised ? 2.5 : 2} fill={color} opacity={0.85}>
            <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={path} />
          </circle>
          <circle r={isCompromised ? 1.5 : 1} fill={color} opacity={0.4}>
            <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={path} begin={`${dur * 0.45}s`} />
          </circle>
        </>
      )}
      {/* Blocked X mark at midpoint */}
      {isBlocked && (
        <g transform={`translate(${mx}, ${my})`}>
          <circle r={8} fill="rgba(5,10,18,0.9)" stroke="rgba(41,204,150,0.4)" strokeWidth={1.2} />
          <line x1={-3} y1={-3} x2={3} y2={3} stroke="#29cc96" strokeWidth={1.5} strokeLinecap="round" />
          <line x1={3} y1={-3} x2={-3} y2={3} stroke="#29cc96" strokeWidth={1.5} strokeLinecap="round" />
        </g>
      )}
      {/* Direction arrow */}
      {!isBlocked && (
        <polygon fill={color} opacity={0.4}>
          <animateMotion dur={`${dur * 1.8}s`} repeatCount="indefinite" path={path} rotate="auto" />
          <set attributeName="points" to="-2.5,-1.5 2.5,0 -2.5,1.5" />
        </polygon>
      )}
      {/* Edge label at midpoint */}
      {displayLabel && (
        <g transform={`translate(${mx}, ${my})`}>
          <rect x={-displayLabel.length * 2.8 - 5} y={-8} width={displayLabel.length * 5.6 + 10} height={16} rx={4}
            fill="rgba(5,10,18,0.85)" stroke={hexA(color, 0.15)} strokeWidth={0.5} />
          <text textAnchor="middle" y={4} fill={hexA(color, 0.7)}
            style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: "0.02em" }}>
            {displayLabel}
          </text>
        </g>
      )}
    </g>
  );
}

// ── Interactive Attack Path Canvas ──────────────────────────────────
export function ReefGraph({
  nodes,
  initialFocusIndex = null,
}: {
  nodes: ReefNode[];
  /** Opens with this node already selected, so arriving from a Search result
   * lands on the relevant entity rather than an unfocused graph. */
  initialFocusIndex?: number | null;
}) {
  const svgId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(initialFocusIndex);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [replayIdx, setReplayIdx] = useState<number | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [replayPaused, setReplayPaused] = useState(false);
  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [narrationPos, setNarrationPos] = useState<{ x: number; y: number } | null>(null);
  const [narrationDragging, setNarrationDragging] = useState(false);
  const narrationDragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });
  // Two-finger pinch, tracked separately from mouse drag since touch events
  // carry a `touches` list instead of a single client position. Trackpad
  // pinch already worked (browsers report it as a ctrl+wheel event, which
  // the existing wheel handler zooms on), but an actual touchscreen has no
  // wheel events at all, so pinch there did nothing until now.
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);
  const CANVAS_MIN_H = 260;
  const CANVAS_DEFAULT_H = 400;
  const CANVAS_MAX_H = 980;
  const [canvasHeight, setCanvasHeight] = useState(CANVAS_DEFAULT_H);
  const [resizing, setResizing] = useState(false);
  const resizeStart = useRef({ my: 0, oh: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);

  // A flat default left a wall of empty page below the canvas on anything
  // taller than a laptop screen, the fixed 400px never actually meant "the
  // available space," it just meant "an arbitrary number." Filling down to
  // the viewport's bottom on mount, once, still leaves the drag handle free
  // for the user's own adjustment afterward.
  useEffect(() => {
    if (!wrapperRef.current) return;
    const top = wrapperRef.current.getBoundingClientRect().top;
    const available = window.innerHeight - top - 24;
    setCanvasHeight(Math.min(CANVAS_MAX_H, Math.max(CANVAS_MIN_H, available)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const svgViewH = Math.round(320 * canvasHeight / CANVAS_DEFAULT_H);
  // The layout may need more room than the requested view box, so it reports
  // back the size it actually used and the SVG is scaled to fit that.
  const { lnodes, ledges, width: viewW, height: viewH } = useMemo(
    () => layoutGraph(nodes, svgViewH), [nodes, svgViewH],
  );

  // Pan handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setPan({
      x: dragStart.current.panX + (e.clientX - dragStart.current.x),
      y: dragStart.current.panY + (e.clientY - dragStart.current.y),
    });
  }, [dragging]);
  const onMouseUp = useCallback(() => setDragging(false), []);
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    setZoom(z => Math.min(2, Math.max(0.5, z - e.deltaY * 0.001)));
  }, []);

  const touchDist = (touches: React.TouchList) => {
    const [a, b] = [touches[0], touches[1]];
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  };
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchStart.current = { dist: touchDist(e.touches), zoom };
    }
  }, [zoom]);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStart.current) {
      e.preventDefault();
      const scale = touchDist(e.touches) / pinchStart.current.dist;
      setZoom(Math.min(2, Math.max(0.5, pinchStart.current.zoom * scale)));
    }
  }, []);
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchStart.current = null;
  }, []);

  const resetView = useCallback(() => { setPan({ x: 0, y: 0 }); setZoom(1); setSelectedIdx(null); setCanvasHeight(CANVAS_DEFAULT_H); }, []);

  // Replay this path, step through depth levels
  const startReplay = useCallback(() => {
    if (replaying) {
      if (replayTimer.current) clearTimeout(replayTimer.current);
      setReplaying(false);
      setReplayPaused(false);
      setReplayIdx(null);
      return;
    }
    setReplaying(true);
    setReplayPaused(false);
    setSelectedIdx(null);
    setReplayIdx(0);
    setNarrationPos(null);
  }, [replaying]);

  const toggleReplayPause = useCallback(() => {
    setReplayPaused(p => !p);
  }, []);

  // Narration bar drag handlers
  const onNarrationDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const currentX = narrationPos?.x ?? 0;
    const currentY = narrationPos?.y ?? 0;
    narrationDragStart.current = { mx: e.clientX, my: e.clientY, ox: currentX, oy: currentY };
    setNarrationDragging(true);
  }, [narrationPos]);

  useEffect(() => {
    if (!narrationDragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - narrationDragStart.current.mx;
      const dy = e.clientY - narrationDragStart.current.my;
      setNarrationPos({ x: narrationDragStart.current.ox + dx, y: narrationDragStart.current.oy + dy });
    };
    const onUp = () => setNarrationDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [narrationDragging]);

  // Canvas height resize handlers
  const onResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStart.current = { my: e.clientY, oh: canvasHeight };
    setResizing(true);
  }, [canvasHeight]);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const dy = e.clientY - resizeStart.current.my;
      const next = Math.min(CANVAS_MAX_H, Math.max(CANVAS_MIN_H, resizeStart.current.oh + dy));
      setCanvasHeight(next);
    };
    const onUp = () => setResizing(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [resizing]);

  // Max depth for replay stepping
  const maxDepth = useMemo(() => {
    if (lnodes.length === 0) return 0;
    return Math.max(...lnodes.map(n => n.depth));
  }, [lnodes]);

  useEffect(() => {
    if (!replaying || replayIdx === null || replayPaused) return;
    if (replayIdx > maxDepth) {
      setReplaying(false);
      setReplayPaused(false);
      setReplayIdx(null);
      return;
    }
    replayTimer.current = setTimeout(() => {
      setReplayIdx(prev => prev !== null ? prev + 1 : null);
    }, 1800);
    return () => { if (replayTimer.current) clearTimeout(replayTimer.current); };
  }, [replaying, replayPaused, replayIdx, maxDepth]);

  // Which nodes are connected to hovered node (direct neighbors in DAG)
  const connectedToHovered = useMemo(() => {
    if (hoveredIdx === null) return null;
    const set = new Set<number>([hoveredIdx]);
    for (const e of ledges) {
      if (e.from === hoveredIdx) set.add(e.to);
      if (e.to === hoveredIdx) set.add(e.from);
    }
    return set;
  }, [hoveredIdx, ledges]);

  const selectedNode = selectedIdx !== null ? lnodes[selectedIdx] : null;

  // What this node actually did, in both directions, so the panel tells an
  // investigative story instead of reporting its own position in the layout
  // (which was graph-traversal bookkeeping with no analyst value).
  const selectedConnections = useMemo(() => {
    if (selectedIdx === null) return { out: [], in: [] };
    const out = ledges
      .filter((e) => e.from === selectedIdx)
      .map((e) => ({ label: e.label, protocol: e.protocol, dataSize: e.dataSize, other: lnodes[e.to]?.node }));
    const inbound = ledges
      .filter((e) => e.to === selectedIdx)
      .map((e) => ({ label: e.label, protocol: e.protocol, dataSize: e.dataSize, other: lnodes[e.from]?.node }));
    return { out, in: inbound };
  }, [selectedIdx, ledges, lnodes]);

  return (
    <div ref={wrapperRef} className="group/canvas relative rounded overflow-hidden select-none"
      style={{
        height: canvasHeight,
        background: "radial-gradient(ellipse at 30% 40%, rgba(74,148,249,0.03), transparent 60%), radial-gradient(ellipse at 80% 70%, rgba(229,92,92,0.02), transparent 50%), rgba(5,10,18,0.4)",
        border: "1px solid rgba(255,255,255,0.04)",
        transition: resizing ? "none" : "height 0.2s ease-out",
      }}>
      {/* Canvas area */}
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ cursor: dragging ? "grabbing" : "grab" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <svg
          width="100%" height="100%"
          viewBox={`0 0 ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMid meet"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: dragging ? "none" : "transform 0.15s ease-out",
          }}
        >
          {/* Subtle grid background */}
          <defs>
            <pattern id={`${svgId}-grid`} width="40" height="40" patternUnits="userSpaceOnUse">
              <circle cx="20" cy="20" r="0.5" fill="rgba(255,255,255,0.03)" />
            </pattern>
          </defs>
          <rect width={viewW} height={viewH} fill={`url(#${svgId}-grid)`} />

          {/* Edges with animated particles */}
          {ledges.map((edge, i) => {
            const from = lnodes[edge.from];
            const to = lnodes[edge.to];
            if (!from || !to) return null;
            const toCol = PHASE_COLOR[to.node.phase] || "#4a94f9";
            const edgeDimmed = connectedToHovered && !(connectedToHovered.has(edge.from) && connectedToHovered.has(edge.to));
            const replayDimmed = replaying && replayIdx !== null && (to.depth > (replayIdx ?? 0));
            return (
              <g key={`e-${i}`} opacity={replayDimmed ? 0.06 : edgeDimmed ? 0.12 : 1} style={{ transition: "opacity 0.3s" }}>
                {!reducedMotion ? (
                  <FlowParticles
                    x1={from.x} y1={from.y}
                    x2={to.x} y2={to.y}
                    color={toCol}
                    status={to.node.status}
                    edgeLabel={edge.label}
                    edgeProtocol={edge.protocol}
                    edgeDataSize={edge.dataSize}
                  />
                ) : (
                  <>
                    <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                      stroke={hexA(toCol, 0.3)} strokeWidth={1.2}
                      strokeDasharray={to.node.status === "blocked" ? "6 4" : undefined} />
                    {/* Static edge label for reduced motion */}
                    {edge.label && (
                      <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 6}
                        textAnchor="middle" fill={hexA(toCol, 0.5)}
                        style={{ fontFamily: F.mono, fontSize: 8 }}>
                        {edge.label}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {lnodes.map((ln, i) => {
            const col = PHASE_COLOR[ln.node.phase] || "#4a94f9";
            const st = ln.node.status;
            const isCompromised = st === "compromised";
            const isBlocked = st === "blocked";
            const isDetected = st === "detected";
            const statusCol = col;
            const riskCol = isCompromised ? "#e55c5c" : isBlocked ? "#29cc96" : isDetected ? "#F59E0B" : col;
            const isHovered = hoveredIdx === i;
            const isSelected = selectedIdx === i;
            const isDimmed = (connectedToHovered !== null && !connectedToHovered.has(i)) || (replaying && replayIdx !== null && ln.depth > replayIdx);
            const needsAttention = isCompromised || isDetected;

            return (
              <g key={`n-${i}`} data-node
                transform={`translate(${ln.x}, ${ln.y})`}
                style={{ cursor: "pointer", transition: "opacity 0.2s" }}
                opacity={isDimmed ? 0.2 : 1}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={(e) => { e.stopPropagation(); setSelectedIdx(prev => prev === i ? null : i); }}
              >
                {/* Subtle status ring for compromised/detected, no pulsing blob */}
                {needsAttention && (
                  <circle r={26} fill="none" stroke={riskCol} strokeWidth={1.4}
                    opacity={isHovered || isSelected ? 0.8 : 0.5}
                    style={{ transition: "opacity 0.2s" }} />
                )}
                {/* Containment ring for blocked */}
                {isBlocked && (
                  <circle r={26} fill="none" stroke="#29cc96" strokeWidth={1} strokeDasharray="3 2.5" opacity={0.3} />
                )}
                {/* Outer ring */}
                <circle r={22} fill="none"
                  stroke={hexA(statusCol, isHovered || isSelected ? 0.45 : 0.15)}
                  strokeWidth={isHovered || isSelected ? 1.5 : 0.8}
                  style={{ transition: "stroke-opacity 0.2s, stroke-width 0.2s" }} />
                {/* Inner bg */}
                <circle r={18}
                  fill={`url(#${svgId}-ng-${i})`}
                  stroke={hexA(statusCol, 0.3)}
                  strokeWidth={1} />
                {/* Radial gradient for node fill */}
                <defs>
                  <radialGradient id={`${svgId}-ng-${i}`}>
                    <stop offset="0%" stopColor={hexA(statusCol, 0.18)} />
                    <stop offset="100%" stopColor="rgba(5,10,18,0.85)" />
                  </radialGradient>
                </defs>
                {/* Icon, using foreignObject for React icons */}
                <foreignObject x={-9} y={-9} width={18} height={18} style={{ pointerEvents: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, pointerEvents: "none" }}>
                    <PhaseIcon phase={ln.node.phase} color={statusCol} size={14} />
                  </div>
                </foreignObject>
                {/* Status indicator dot */}
                <circle cx={14} cy={-14} r={3.5}
                  fill={statusCol}
                  stroke="rgba(5,10,18,0.9)" strokeWidth={1.2} style={{ pointerEvents: "none" }} />
                {/* Shadow ellipse */}
                <ellipse cx={0} cy={24} rx={12} ry={3} fill={hexA(statusCol, 0.06)} style={{ pointerEvents: "none" }} />
                {/* Label. Painted with a canvas-coloured halo under the glyphs
                    so that a stray crossing, an edge line or a long label on an
                    adjacent node, still reads cleanly. */}
                <text y={36} textAnchor="middle" fill="rgba(238,240,250,0.82)"
                  stroke="rgba(5,10,18,0.9)" strokeWidth={3} strokeLinejoin="round"
                  style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 600, paintOrder: "stroke", pointerEvents: "none" }}>
                  {ln.node.label}
                </text>
                <text y={47} textAnchor="middle" fill="rgba(168,171,180,0.5)"
                  stroke="rgba(5,10,18,0.9)" strokeWidth={2.5} strokeLinejoin="round"
                  style={{ fontFamily: F.mono, fontSize: 7.5, paintOrder: "stroke", pointerEvents: "none" }}>
                  {clipText(ln.node.sublabel, SUBLABEL_MAX)}
                </text>
                {/* Phase tag below */}
                <rect x={-30} y={53} width={60} height={12} rx={3}
                  fill={hexA(statusCol, 0.06)} stroke={hexA(statusCol, 0.12)} strokeWidth={0.5} style={{ pointerEvents: "none" }} />
                <text y={61.5} textAnchor="middle" fill={hexA(statusCol, 0.6)}
                  style={{ fontFamily: F.mono, fontSize: 6.5, letterSpacing: "0.04em", pointerEvents: "none" }}>
                  {ln.node.phase.length > 14 ? ln.node.phase.slice(0, 13) + "…" : ln.node.phase}
                </text>
                {/* Invisible hitarea to prevent hover flicker */}
                <circle r={24} fill="transparent" />
                {/* Replay highlight ring, matches current depth level */}
                {replayIdx === ln.depth && !reducedMotion && (
                  <circle r={24} fill="none" stroke="#53d9ff" strokeWidth={2} opacity={0.6}>
                    <animate attributeName="r" values="22;26;22" dur="1s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.6;0.25;0.6" dur="1s" repeatCount="indefinite" />
                  </circle>
                )}
                {replayIdx === ln.depth && reducedMotion && (
                  <circle r={24} fill="none" stroke="#53d9ff" strokeWidth={2} opacity={0.5} />
                )}
              </g>
            );
          })}

          {/* Timeline labels at top */}
          {lnodes.length > 0 && (() => {
            const roots = lnodes.filter(n => n.depth === 0);
            const maxD = Math.max(...lnodes.map(n => n.depth));
            const leaves = lnodes.filter(n => n.depth === maxD);
            return (
              <>
                {roots[0] && (
                  <text x={roots[0].x} y={16} textAnchor="middle"
                    fill="rgba(168,171,180,0.20)" style={{ fontFamily: F.mono, fontSize: 9 }}>
                    T-0: Entry
                  </text>
                )}
                {leaves[0] && maxD > 0 && (
                  <text x={leaves[0].x} y={16} textAnchor="middle"
                    fill="rgba(168,171,180,0.20)" style={{ fontFamily: F.mono, fontSize: 9 }}>
                    T+{(maxD + 1) * 3}m: Current
                  </text>
                )}
              </>
            );
          })()}
        </svg>
      </div>

      {/* Controls overlay, top-right */}
      <div className="absolute top-2 right-2 flex items-center gap-1" style={{ zIndex: 20 }}>
        <button onClick={startReplay}
          className={`h-7 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer px-2.5 ${FOCUS_RING}`}
          style={{
            background: replaying ? "rgba(83,217,255,0.15)" : "rgba(5,10,18,0.7)",
            border: `1px solid ${replaying ? "rgba(83,217,255,0.3)" : "rgba(255,255,255,0.08)"}`,
            backdropFilter: "blur(8px)",
          }}
          aria-label={replaying ? "Stop replay" : "Replay this path"}>
          {replaying
            ? <><div className="w-2 h-2 rounded-sm" style={{ background: "#53d9ff" }} /><span style={{ fontFamily: F.sans, fontSize: 11, color: "#53d9ff" }}>Stop</span></>
            : <><Play size={11} style={{ color: "rgba(168,171,180,0.55)" }} /><span style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(168,171,180,0.55)" }}>Replay</span></>
          }
        </button>
        <button onClick={() => setZoom(z => Math.min(2, z + 0.2))}
          className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer ${FOCUS_RING}`}
          style={{ background: "rgba(5,10,18,0.7)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(8px)" }}
          aria-label="Zoom in">
          <span style={{ fontFamily: F.mono, fontSize: 14, color: "rgba(168,171,180,0.55)" }}>+</span>
        </button>
        <button onClick={() => setZoom(z => Math.max(0.5, z - 0.2))}
          className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer ${FOCUS_RING}`}
          style={{ background: "rgba(5,10,18,0.7)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(8px)" }}
          aria-label="Zoom out">
          <span style={{ fontFamily: F.mono, fontSize: 14, color: "rgba(168,171,180,0.55)" }}>−</span>
        </button>
        <button onClick={resetView}
          className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer ${FOCUS_RING}`}
          style={{ background: "rgba(5,10,18,0.7)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(8px)" }}
          aria-label="Reset view">
          <LocateFixed size={12} style={{ color: "rgba(168,171,180,0.55)" }} />
        </button>
      </div>

      {/* Replay narration bar, draggable, defaults to top-center */}
      {replaying && replayIdx !== null && replayIdx <= maxDepth && (() => {
        const nodesAtDepth = lnodes.filter(n => n.depth === replayIdx);
        if (nodesAtDepth.length === 0) return null;
        const firstNode = nodesAtDepth[0].node;
        const phaseCol = PHASE_COLOR[firstNode.phase] || "#4a94f9";
        return (
          <div
            className="absolute flex items-center gap-2 rounded"
            onMouseDown={onNarrationDown}
            style={{
              top: 6 + (narrationPos?.y ?? 0),
              left: `calc(50% + ${narrationPos?.x ?? 0}px)`,
              transform: "translateX(-50%)",
              padding: "5px 10px 5px 6px",
              background: "rgba(5,10,18,0.92)",
              border: `1px solid ${hexA(phaseCol, 0.25)}`,
              backdropFilter: "blur(12px)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              zIndex: 25,
              maxWidth: "90%",
              cursor: narrationDragging ? "grabbing" : "grab",
              userSelect: "none",
              transition: narrationDragging ? "none" : "top 0.15s, left 0.15s",
            }}
          >
            {/* Drag handle */}
            <div className="flex flex-col gap-px shrink-0 px-1 py-1 rounded cursor-grab" style={{ opacity: 0.3 }}>
              {[0, 1, 2].map(r => (
                <div key={r} className="flex gap-px">
                  <div className="w-1 h-1 rounded-full" style={{ background: "rgba(168,171,180,0.6)" }} />
                  <div className="w-1 h-1 rounded-full" style={{ background: "rgba(168,171,180,0.6)" }} />
                </div>
              ))}
            </div>

            {/* Pause / Resume button */}
            <button
              onClick={(e) => { e.stopPropagation(); toggleReplayPause(); }}
              className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 cursor-pointer ${FOCUS_RING}`}
              style={{
                background: replayPaused ? "rgba(74,148,249,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${replayPaused ? "rgba(74,148,249,0.3)" : "rgba(255,255,255,0.08)"}`,
              }}
              aria-label={replayPaused ? "Resume replay" : "Pause replay"}
            >
              {replayPaused
                ? <Play size={10} style={{ color: "#80b4fa", marginLeft: 1 }} />
                : <Pause size={10} style={{ color: "rgba(168,171,180,0.65)" }} />
              }
            </button>

            {/* Phase icons */}
            <div className="flex items-center gap-1.5 shrink-0">
              {nodesAtDepth.map((nd, j) => (
                <div key={j} className="w-5 h-5 rounded-md flex items-center justify-center"
                  style={{ background: hexA(PHASE_COLOR[nd.node.phase] || "#4a94f9", 0.15) }}>
                  <PhaseIcon phase={nd.node.phase} color={PHASE_COLOR[nd.node.phase] || "#4a94f9"} size={11} />
                </div>
              ))}
            </div>

            {/* Node info */}
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span style={{ fontFamily: F.mono, fontSize: 10, color: "rgba(168,171,180,0.40)" }}>
                {replayIdx + 1}/{maxDepth + 1}
              </span>
              {nodesAtDepth.map((nd, j) => {
                const stCol = nd.node.status === "compromised" ? "#e55c5c" : nd.node.status === "blocked" ? "#29cc96" : nd.node.status === "detected" ? "#F59E0B" : "rgba(168,171,180,0.55)";
                return (
                  <span key={j} className="flex items-center gap-1">
                    <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: "rgba(238,240,250,0.90)" }}>
                      {nd.node.label}
                    </span>
                    <span className="px-1 py-px rounded" style={{
                      fontFamily: F.sans, fontSize: 9, color: stCol,
                      background: hexA(stCol, 0.1),
                    }}>
                      {nd.node.status}
                    </span>
                    {j < nodesAtDepth.length - 1 && <span style={{ color: "rgba(168,171,180,0.20)" }}>·</span>}
                  </span>
                );
              })}
            </div>

            {/* Progress dots */}
            <div className="flex items-center gap-1 shrink-0 ml-1">
              {Array.from({ length: maxDepth + 1 }, (_, d) => (
                <div key={d} className="w-1.5 h-1.5 rounded-full" style={{
                  background: d < replayIdx ? "#53d9ff" : d === replayIdx ? "#fff" : "rgba(255,255,255,0.12)",
                  transition: "background 0.2s",
                }} />
              ))}
            </div>

            {/* Paused indicator */}
            {replayPaused && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-md" style={{
                background: "rgba(74,148,249,0.1)",
                border: "1px solid rgba(74,148,249,0.2)",
                fontFamily: F.mono, fontSize: 9, color: "#80b4fa",
              }}>
                paused
              </span>
            )}
          </div>
        );
      })()}

      {/* Legend overlay, bottom-left */}
      <div className="absolute bottom-2 left-2 flex items-center gap-3 px-2.5 py-1.5 rounded-lg"
        style={{ background: "rgba(5,10,18,0.75)", border: "1px solid rgba(255,255,255,0.05)", backdropFilter: "blur(8px)", zIndex: 20 }}>
        {[
          { color: "#e55c5c", label: "Confirmed malicious" },
          { color: "#F59E0B", label: "Under investigation" },
          { color: "#29cc96", label: "Benign" },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: l.color, boxShadow: `0 0 4px ${hexA(l.color, 0.3)}` }} />
            <span style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(168,171,180,0.50)" }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Drag hint */}
      {zoom === 1 && pan.x === 0 && pan.y === 0 && selectedIdx === null && (
        <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md"
          style={{ background: "rgba(5,10,18,0.6)", border: "1px solid rgba(255,255,255,0.04)", zIndex: 20 }}>
          <span style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(168,171,180,0.30)" }}>
            Drag to pan · Scroll to zoom · Click nodes · Drag bottom edge to resize
          </span>
        </div>
      )}

      {/* Selected node detail flyout */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.2 }}
            className="absolute top-2 right-12 w-[292px] rounded overflow-hidden"
            style={{
              background: "linear-gradient(180deg, rgba(13,24,43,0.97), rgba(5,10,18,0.99))",
              border: `1px solid ${hexA(PHASE_COLOR[selectedNode.node.phase] || "#4a94f9", 0.2)}`,
              backdropFilter: "blur(16px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              zIndex: 25,
            }}
          >
            <div className="px-3.5 py-3 flex flex-col gap-2.5">
              {/* Node header */}
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{
                    background: hexA(PHASE_COLOR[selectedNode.node.phase] || "#4a94f9", 0.12),
                    border: `1px solid ${hexA(PHASE_COLOR[selectedNode.node.phase] || "#4a94f9", 0.2)}`,
                  }}>
                  <PhaseIcon phase={selectedNode.node.phase} color={PHASE_COLOR[selectedNode.node.phase] || "#4a94f9"} size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 600, color: "rgba(238,240,250,0.92)" }}>{selectedNode.node.label}</p>
                  <p style={{ fontFamily: F.mono, fontSize: 10, color: "rgba(168,171,180,0.45)" }}>{selectedNode.node.sublabel}</p>
                </div>
                <button onClick={() => setSelectedIdx(null)} className="w-5 h-5 rounded flex items-center justify-center cursor-pointer"
                  style={{ background: "rgba(255,255,255,0.04)" }}>
                  <X size={10} style={{ color: "rgba(168,171,180,0.45)" }} />
                </button>
              </div>

              {/* Phase + Status */}
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{
                  background: selectedNode.node.status === "compromised" ? "#e55c5c"
                    : selectedNode.node.status === "blocked" ? "#29cc96"
                    : selectedNode.node.status === "detected" ? "#F59E0B"
                    : PHASE_COLOR[selectedNode.node.phase] || "#4a94f9"
                }} />
                <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 500,
                  color: selectedNode.node.status === "compromised" ? "#e55c5c"
                    : selectedNode.node.status === "blocked" ? "#29cc96"
                    : selectedNode.node.status === "detected" ? "#F59E0B"
                    : "rgba(168,171,180,0.65)"
                }}>
                  {selectedNode.node.status === "compromised" ? "Confirmed malicious, needs containment"
                    : selectedNode.node.status === "blocked" ? "Benign or already stopped"
                    : selectedNode.node.status === "detected" ? "Under investigation"
                    : "Entry vector identified"}
                </span>
              </div>

              {/* Phase badge */}
              <div className="px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ fontFamily: F.mono, fontSize: 10, color: "rgba(168,171,180,0.40)" }}>MITRE phase</span>
                <p style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 500, color: hexA(PHASE_COLOR[selectedNode.node.phase] || "#4a94f9", 0.85), marginTop: 1 }}>
                  {selectedNode.node.phase}
                </p>
              </div>

              {/* What this node actually connects to, each on its own line so
                  a long edge label can never collide with anything else the
                  way a label/value pair crammed into one row could. This
                  replaces graph-position bookkeeping (depth, node index)
                  that told the analyst nothing about the investigation. */}
              {(selectedConnections.in.length > 0 || selectedConnections.out.length > 0) && (
                <div className="flex flex-col gap-1">
                  <span style={{ fontFamily: F.mono, fontSize: 10, color: "rgba(168,171,180,0.55)" }}>CONNECTS TO</span>
                  {/* Arrow direction, not a constructed sentence, since the
                      same edge label can be the grammatical subject from one
                      end and the object from the other ("j.rivera signed in
                      from this IP" vs "this IP [?] signed in from j.rivera"
                      makes no sense), an arrow reads correctly either way. */}
                  {selectedConnections.in.map((c, i) => (
                    <p key={`in-${i}`} style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(220,222,232,0.85)", lineHeight: 1.4 }}>
                      <span style={{ color: "rgba(83,217,255,0.85)" }}>&larr; </span>
                      {c.other?.label ?? "unknown"}
                      <span style={{ color: "rgba(168,171,180,0.55)" }}>
                        {" "}
                        ({c.label}
                        {c.protocol ? `, ${c.protocol}` : ""})
                      </span>
                    </p>
                  ))}
                  {selectedConnections.out.map((c, i) => (
                    <p key={`out-${i}`} style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(220,222,232,0.85)", lineHeight: 1.4 }}>
                      <span style={{ color: "rgba(83,217,255,0.85)" }}>&rarr; </span>
                      {c.other?.label ?? "unknown"}
                      <span style={{ color: "rgba(168,171,180,0.55)" }}>
                        {" "}
                        ({c.label}
                        {c.protocol ? `, ${c.protocol}` : ""})
                      </span>
                    </p>
                  ))}
                </div>
              )}

              {/* Remediation hint for compromised */}
              {selectedNode.node.status === "compromised" && (
                <div className="px-2.5 py-2 rounded-lg" style={{ background: "rgba(229,92,92,0.05)", border: "1px solid rgba(229,92,92,0.12)" }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle size={11} style={{ color: "#e55c5c" }} />
                    <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: "#e55c5c" }}>Immediate action needed</span>
                  </div>
                  <p style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(168,171,180,0.55)", lineHeight: 1.4 }}>
                    Isolate affected asset and revoke associated credentials. Check for lateral movement from this node.
                  </p>
                </div>
              )}
              {selectedNode.node.status === "blocked" && (
                <div className="px-2.5 py-2 rounded-lg" style={{ background: "rgba(41,204,150,0.05)", border: "1px solid rgba(41,204,150,0.12)" }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Shield size={11} style={{ color: "#29cc96" }} />
                    <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: "#29cc96" }}>Containment active</span>
                  </div>
                  <p style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(168,171,180,0.55)", lineHeight: 1.4 }}>
                    Databahn saw this activity and it scored as benign. No action needed.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resize handle at bottom edge */}
      <div
        onMouseDown={onResizeDown}
        className="absolute bottom-0 left-0 w-full flex items-center justify-center group-hover/canvas:opacity-100 opacity-0"
        style={{
          height: 12,
          cursor: "ns-resize",
          zIndex: 30,
          background: resizing ? "rgba(74,148,249,0.06)" : "linear-gradient(to top, rgba(5,10,18,0.5), transparent)",
          transition: "opacity 0.2s, background 0.15s",
          ...(resizing ? { opacity: 1 } : {}),
        }}
      >
        <div
          className="rounded-full"
          style={{
            width: resizing ? 48 : 32,
            height: 3,
            background: resizing ? "rgba(83,217,255,0.6)" : "rgba(168,171,180,0.18)",
            transition: "background 0.15s, width 0.15s",
          }}
        />
      </div>
    </div>
  );
}

// ── Blast Radius Bar (expanded view) ────────────────────────────────
