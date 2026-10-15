import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import {
  STATE_ORDER, trendPoints, funnelFor, fmtDuration, fmtAgo, fmtCount,
  type SourceView, type DestinationView, type Amount,
} from "@/app/lib/environment";
import type { HealthState, SourceGroup } from "@/app/data/fleet";
import { HEALTH_META, HealthBadge, SeverityBadge } from "./HealthBadge";
import { Sparkline } from "./Sparkline";
import { SearchInput } from "./SearchInput";
import { VendorLogo, hasVendorLogo, chipSafeColor } from "./VendorLogo";
import { fmtAmount } from "./Funnel";
import { RowActions, RowSelect, SelectAll, SelectionBar } from "./EntityActions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { NoResults } from "./NoResults";

export type HealthFilter = HealthState | "issues" | null;

/** Rows picked from the diagram. Not a filter: every row stays, in its
 * usual order; these are just marked. `nonce` replays the flash and the
 * scroll when the same group is picked again. */
export interface RowHighlight {
  group: SourceGroup;
  color: string;
  nonce: number;
}

export interface TableFilters {
  search: string;
  health: HealthFilter;
  group: SourceGroup | null;
  /** Only sources sending to this destination (from a destination's
   * "View all on Pipeline"). Optional, so existing filters stay valid. */
  dest?: { id: string; name: string } | null;
}

const RANGE_LABEL_HEALTH: Record<string, string> = {
  issues: "Needs attention",
  stopped: "Stopped",
  degraded: "Degraded",
  recovering: "Recovering",
  paused: "Paused",
  learning: "Learning",
  healthy: "Healthy",
};

/** The table's filter as a function, so the Destinations table can follow
 * exactly the same set of sources the user is looking at. */
export function filterSources(sources: SourceView[], f: TableFilters) {
  const q = f.search.trim().toLowerCase();
  return sources.filter(
    (s) =>
      (!f.group || s.group === f.group) &&
      (!f.dest || s.destIds.includes(f.dest.id)) &&
      (!q || s.name.toLowerCase().includes(q) || s.owner.toLowerCase().includes(q) || s.group.toLowerCase().includes(q)) &&
      (!f.health || (f.health === "issues" ? s.state === "stopped" || s.state === "degraded" : s.state === f.health)),
  );
}

/** "Network · Stopped", or null when nothing is filtered. */
export function describeFilters(f: TableFilters): string | null {
  const parts = [f.dest ? `sending to ${f.dest.name}` : null, f.group, f.health ? RANGE_LABEL_HEALTH[f.health] : null, f.search.trim() ? `matching “${f.search.trim()}”` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

type SortKey = "priority" | "name" | "received" | "delivered";

const PAGE = 25;
const RANGE_WORDS: Record<string, string> = { "1H": "hour", "24H": "24 hours", "7D": "7 days", "30D": "30 days" };
const ALL_TYPES = "__all";

function SortHeader({
  label,
  k,
  sort,
  setSort,
  className = "",
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; flip: boolean };
  setSort: (s: { key: SortKey; flip: boolean }) => void;
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <th className={`font-normal px-3 py-2 ${className}`} aria-sort={active ? (sort.flip ? "ascending" : "descending") : "none"}>
      <button
        onClick={() => setSort({ key: k, flip: active ? !sort.flip : false })}
        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        {label}
        {active && (sort.flip ? <ArrowUp className="w-3 h-3" aria-hidden="true" /> : <ArrowDown className="w-3 h-3" aria-hidden="true" />)}
      </button>
    </th>
  );
}

/** Totals for the selected range. `rate` adds the "right now" line, used
 * on Received only, where "is it still flowing?" is the question. */
function StageCell({ amount, tone, note, rate, rateTone }: { amount: Amount; tone?: string; note?: string; rate?: string; rateTone?: string }) {
  const f = fmtAmount(amount, "total");
  return (
    <td className="px-3 py-2.5 font-mono-db text-xs whitespace-nowrap">
      <p className={`truncate ${tone ?? "text-foreground"}`}>{f.events}</p>
      <p className="text-xs text-muted-foreground truncate" title={note ?? f.size}>
        {note ?? f.size}
      </p>
      {rate && (
        <p className={`text-xs truncate ${rateTone ?? "text-muted-foreground/60"}`} title="Right now">
          {rate}
        </p>
      )}
    </td>
  );
}

/**
 * Every source, side by side, through the four stages Databahn's customers
 * asked to see: received, processed, reduced, delivered, each as events and
 * size, per minute or as totals for the range. Defaults to most urgent
 * first; filters by status and type; searches name, owner and type. A row
 * opens the same drawer every other screen uses.
 */
export function SourceMetricsTable({
  sources,
  destinations,
  range,
  filters,
  onFiltersChange,
  onOpen,
  highlight,
  onClearHighlight,
}: {
  sources: SourceView[];
  destinations: DestinationView[];
  range: string;
  filters: TableFilters;
  onFiltersChange: (f: TableFilters) => void;
  onOpen: (s: SourceView) => void;
  highlight?: RowHighlight | null;
  onClearHighlight?: () => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; flip: boolean }>({ key: "priority", flip: false });
  const [limit, setLimit] = useState(PAGE);
  // Selection is by id and cleared whenever the filter changes, so a bulk
  // action never reaches rows the user can no longer see.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set()), [filters.search, filters.health, filters.group, filters.dest]);

  const groups = useMemo(() => {
    const m = new Map<SourceGroup, number>();
    for (const s of sources) m.set(s.group, (m.get(s.group) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [sources]);

  // Counts ignore the status filter itself, so each chip says "how many if
  // you pick this", the same rule the Rules library's chips follow.
  const base = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return sources.filter(
      (s) =>
        (!filters.group || s.group === filters.group) &&
        (!filters.dest || s.destIds.includes(filters.dest.id)) &&
        (!q || s.name.toLowerCase().includes(q) || s.owner.toLowerCase().includes(q) || s.group.toLowerCase().includes(q)),
    );
  }, [sources, filters.search, filters.group, filters.dest]);

  const matchesHealth = (s: SourceView, h: HealthFilter) =>
    !h || (h === "issues" ? s.state === "stopped" || s.state === "degraded" : s.state === h);

  const rows = useMemo(() => {
    const withFunnel = base
      .filter((s) => matchesHealth(s, filters.health))
      .map((s) => ({ s, f: funnelFor(s, range, "total", destinations) }));
    const by: Record<SortKey, (a: (typeof withFunnel)[number], b: (typeof withFunnel)[number]) => number> = {
      priority: (a, b) =>
        b.s.priority - a.s.priority || STATE_ORDER.indexOf(a.s.state) - STATE_ORDER.indexOf(b.s.state) || b.s.gbPerDay - a.s.gbPerDay,
      name: (a, b) => a.s.name.localeCompare(b.s.name),
      received: (a, b) => b.f.received.events - a.f.received.events,
      delivered: (a, b) => b.f.delivered.events - a.f.delivered.events,
    };
    const sorted = withFunnel.sort(by[sort.key]);
    return sort.flip ? sorted.reverse() : sorted;
  }, [base, filters.health, sort, range, destinations]);

  // Bring the first highlighted row into view: show enough pages to reach
  // it, then scroll it to the middle of the screen.
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const highlightCount = highlight ? rows.filter(({ s }) => s.group === highlight.group).length : 0;
  useEffect(() => {
    if (!highlight) return;
    const index = rows.findIndex(({ s }) => s.group === highlight.group);
    if (index < 0) return;
    if (index >= limit) setLimit(Math.ceil((index + 1) / PAGE) * PAGE);
    const t = setTimeout(() => {
      tbodyRef.current?.querySelector(`[data-row-id="${rows[index].s.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => clearTimeout(t);
    // Only when a new pick arrives, not on every re-sort.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight?.nonce]);

  const chip = (value: HealthFilter, label: string) => {
    const count = base.filter((s) => matchesHealth(s, value)).length;
    if (value && value !== "issues" && count === 0) return null;
    const active = filters.health === value;
    return (
      <button
        key={String(value)}
        onClick={() => {
          onFiltersChange({ ...filters, health: active && value ? null : value });
          setLimit(PAGE);
        }}
        className={`text-xs px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1.5 ${
          active ? "border-primary/60 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
        }`}
      >
        {value && value !== "issues" && <span className={`w-1.5 h-1.5 rounded-full ${HEALTH_META[value].dot}`} aria-hidden="true" />}
        {label} <span className="font-mono-db">{count}</span>
      </button>
    );
  };

  return (
    <div className="rounded-lg border border-border glass-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <SearchInput
            value={filters.search}
            onChange={(v) => {
              onFiltersChange({ ...filters, search: v });
              setLimit(PAGE);
            }}
            placeholder="Search sources, sites, owners…"
            className="flex-1"
          />
          <Select
            value={filters.group ?? ALL_TYPES}
            onValueChange={(v) => {
              onFiltersChange({ ...filters, group: v === ALL_TYPES ? null : (v as SourceGroup) });
              setLimit(PAGE);
            }}
          >
            <SelectTrigger className="sm:w-[180px] h-[42px]" aria-label="Filter by source type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TYPES}>All types ({sources.length})</SelectItem>
              {groups.map(([g, n]) => (
                <SelectItem key={g} value={g}>
                  {g} ({n})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {filters.dest && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Sending to</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/60 bg-primary/15 text-foreground px-2.5 py-1">
              {filters.dest.name}
              <button
                onClick={() => onFiltersChange({ ...filters, dest: null })}
                aria-label={`Clear ${filters.dest.name} filter`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {chip(null, "All")}
            {chip("issues", "Needs attention")}
            {STATE_ORDER.map((st) => chip(st, HEALTH_META[st].label))}
          </div>
          <div className="flex items-center gap-3">
            {highlight && highlightCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-foreground/85">
                <span className="w-2 h-2 rounded-full" style={{ background: highlight.color }} aria-hidden="true" />
                {highlight.group} · {highlightCount} highlighted
                <button onClick={onClearHighlight} className="text-muted-foreground hover:text-foreground underline underline-offset-2">
                  Clear
                </button>
              </span>
            )}
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Totals for the last {RANGE_WORDS[range] ?? range} · ≈ rate now
            </span>
          </div>
        </div>
      </div>

      <SelectionBar
        targets={rows.filter(({ s }) => selected.has(s.id)).map(({ s }) => ({ kind: "source" as const, s }))}
        onClear={() => setSelected(new Set())}
      />
      <div className="overflow-x-auto">
        {/* Fixed layout with set widths: switching Per minute ↔ Total
            swaps "0/min" for "223M", and auto-sized columns jumped every
            time. Widths come from here, never from the numbers. */}
        <table className="w-full min-w-[920px] table-fixed text-sm">
          <colgroup>
            <col style={{ width: 36 }} />
            <col style={{ width: "21%" }} />
            <col style={{ width: "19%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: 44 }} />
          </colgroup>
          <thead className="text-xs text-muted-foreground text-left border-b border-border bg-muted/5">
            <tr>
              <SelectAll
                total={rows.length}
                selected={rows.filter(({ s }) => selected.has(s.id)).length}
                onChange={(all) => setSelected(all ? new Set(rows.map(({ s }) => s.id)) : new Set())}
              />
              <SortHeader label="Source" k="name" sort={sort} setSort={setSort} className="pl-2" />
              <SortHeader label="Status" k="priority" sort={sort} setSort={setSort} />
              <SortHeader label="Received" k="received" sort={sort} setSort={setSort} />
              <th className="font-normal px-3 py-2">Processed</th>
              <th className="font-normal px-3 py-2">Reduced</th>
              <SortHeader label="Delivered" k="delivered" sort={sort} setSort={setSort} />
              <th className="font-normal px-3 py-2">Received · {range}</th>
              <th aria-label="Actions" className="sticky right-0 z-[1] bg-card" />
            </tr>
          </thead>
          <tbody ref={tbodyRef} className="divide-y divide-border">
            {rows.slice(0, limit).map(({ s, f }) => {
              const lit = highlight?.group === s.group;
              const meta = HEALTH_META[s.state];
              const stopped = s.state === "stopped";
              const problem = stopped || s.state === "degraded";
              const processedShort = f.received.events > 0 && f.processed.events / f.received.events < 0.95;
              const deliveredShort = s.deliveredShare < 1 && f.forwarded.events > 0;
              return (
                <tr
                  // A new pick remounts the marked rows so the flash replays.
                  key={lit ? `${s.id}-${highlight!.nonce}` : s.id}
                  data-row-id={s.id}
                  tabIndex={0}
                  onClick={() => onOpen(s)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpen(s);
                    }
                  }}
                  className={`cursor-pointer hover:bg-muted/15 focus-visible:outline-none focus-visible:bg-muted/20 ${lit ? "row-flash" : ""} ${
                    !lit && stopped ? "shadow-[inset_2px_0_0_var(--db-red)]" : !lit && s.state === "degraded" ? "shadow-[inset_2px_0_0_#f59e0b]" : ""
                  }`}
                  // The diagram row's own color, so the two read as the same thing.
                  style={
                    lit
                      ? ({
                          backgroundColor: `${highlight!.color}1f`,
                          boxShadow: `inset 3px 0 0 ${highlight!.color}`,
                          "--row-tint": `${highlight!.color}1f`,
                          "--row-flash": `${highlight!.color}66`,
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  <RowSelect
                    checked={selected.has(s.id)}
                    label={s.name}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        return next;
                      })
                    }
                  />
                  <td className="pl-2 pr-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded bg-white flex items-center justify-center shrink-0" style={{ color: chipSafeColor(s.color) }}>
                        {hasVendorLogo(s.connectorId) ? (
                          <VendorLogo connectorId={s.connectorId} size={14} />
                        ) : (
                          <span className="text-[9px] font-bold">{s.vendor.slice(0, 2).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate" title={s.name}>
                          {s.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {s.group} · {s.destNames.length ? s.destNames.join(", ") : "not routed"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <HealthBadge state={s.state} size="xs" />
                      {problem && s.severity && <SeverityBadge severity={s.severity} />}
                    </div>
                    <p className="text-xs mt-0.5 whitespace-nowrap text-muted-foreground">
                      {stopped
                        ? `last event ${fmtAgo(s.lastEventMin)}`
                        : problem || s.state === "recovering"
                          ? `for ${fmtDuration(s.sinceMin)}`
                          : `last event ${s.lastEventMin < 1 ? "just now" : fmtAgo(s.lastEventMin)}`}
                    </p>
                  </td>
                  <StageCell
                    amount={f.received}
                    rate={`≈${fmtCount(s.epm.received)}/min`}
                  />
                  <StageCell amount={f.processed} note={processedShort ? `${Math.round((f.processed.events / f.received.events) * 100)}%` : undefined} />
                  <StageCell amount={f.reduced} note={`${fmtAmount(f.reduced, "total").size} · ${Math.round(s.reduction * 100)}%`} />
                  <StageCell
                    amount={f.delivered}
                    note={deliveredShort ? s.deliveryIssue : undefined}
                  />
                  <td className="px-3 py-2.5">
                    <Sparkline points={trendPoints(s, range)} baseline={s.normalEps} color={meta.bar} label={`${s.name} received over ${range}`} />
                  </td>
                  <RowActions target={{ kind: "source", s }} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <NoResults
          what="sources"
          query={filters.search}
          hint="Try a different name, status or source type."
          onClear={() => onFiltersChange({ search: "", health: null, group: null, dest: null })}
          clearLabel="Clear filters"
        />
      )}

      {rows.length > 0 && (
        <div className="px-4 py-2.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing <span className="font-mono-db text-foreground">{Math.min(limit, rows.length)}</span> of{" "}
            <span className="font-mono-db text-foreground">{rows.length}</span>
            <span className="text-muted-foreground/60"> · Delivered is the average per destination copy</span>
          </span>
          {rows.length > limit && (
            <div className="flex items-center gap-3">
              <button onClick={() => setLimit((l) => l + PAGE)} className="hover:text-foreground underline underline-offset-2">
                Show {Math.min(PAGE, rows.length - limit)} more
              </button>
              <button onClick={() => setLimit(rows.length)} className="hover:text-foreground underline underline-offset-2">
                Show all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Destinations reject data often (type mismatches, throttling, credentials
 * rotated on one side only), so they get the same at-a-glance row a source
 * does: what the pipeline sent, what landed, what was refused or held.
 */
export function DestinationsTable(props: Parameters<typeof DestinationsTableInner>[0]) {
  return <DestinationsTableInner {...props} />;
}

function DestinationsTableInner({
  destinations,
  onOpen,
  selectedId,
  scope,
  onShowAll,
}: {
  destinations: DestinationView[];
  onOpen: (d: DestinationView) => void;
  /** Picked in the pipeline diagram: marked in its own color, not filtered,
   * there are only a handful of destinations. */
  selectedId?: string | null;
  /** When the sources table is filtered, this follows it: only destinations
   * those sources send to, with numbers from just those sources. A
   * destination's own health stays alongside, clearly labelled, so "source
   * stopped" and "destination healthy" never read as a contradiction. */
  scope?: { label: string; sources: SourceView[] } | null;
  onShowAll?: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  if (scope) return <ScopedDestinations destinations={destinations} scope={scope} onOpen={onOpen} selectedId={selectedId} onShowAll={onShowAll} />;
  return (
    <div className="rounded-lg border border-border glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <SelectionBar
          targets={destinations.filter((d) => selected.has(d.id)).map((d) => ({ kind: "destination" as const, d }))}
          onClear={() => setSelected(new Set())}
        />
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-xs text-muted-foreground text-left border-b border-border bg-muted/5">
            <tr>
              <SelectAll
                total={destinations.length}
                selected={selected.size}
                onChange={(all) => setSelected(all ? new Set(destinations.map((d) => d.id)) : new Set())}
              />
              <th className="font-normal px-3 py-2 pl-2">Destination</th>
              <th className="font-normal px-3 py-2">Status</th>
              <th className="font-normal px-3 py-2">Sent/min</th>
              <th className="font-normal px-3 py-2">Delivered/min</th>
              <th className="font-normal px-3 py-2">Rejected or held/min</th>
              <th className="font-normal px-3 py-2">Health check</th>
              <th aria-label="Actions" className="w-11 sticky right-0 z-[1] bg-card" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {destinations.map((d) => {
              const problem = d.state === "stopped" || d.state === "degraded";
              const refused = d.sentEpm - d.deliveredEpm;
              return (
                <tr
                  key={d.id}
                  tabIndex={0}
                  onClick={() => onOpen(d)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpen(d);
                    }
                  }}
                  data-dest-id={d.id}
                  className={`cursor-pointer hover:bg-muted/15 focus-visible:outline-none focus-visible:bg-muted/20 ${selectedId === d.id ? "row-flash" : ""} ${
                    selectedId === d.id ? "" : d.state === "stopped" ? "shadow-[inset_2px_0_0_var(--db-red)]" : d.state === "degraded" ? "shadow-[inset_2px_0_0_#f59e0b]" : ""
                  }`}
                  style={
                    selectedId === d.id
                      ? ({
                          backgroundColor: `${d.color}1f`,
                          boxShadow: `inset 3px 0 0 ${d.color}`,
                          "--row-tint": `${d.color}1f`,
                          "--row-flash": `${d.color}66`,
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  <RowSelect checked={selected.has(d.id)} label={d.name} onChange={() => toggle(d.id)} />
                  <td className="pl-2 pr-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded bg-white flex items-center justify-center shrink-0" style={{ color: chipSafeColor(d.color) }}>
                        {hasVendorLogo(d.id) ? <VendorLogo connectorId={d.id} size={14} /> : <span className="text-[9px] font-bold">{d.name.slice(0, 2).toUpperCase()}</span>}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{d.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.sourceIds.length} source{d.sourceIds.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <HealthBadge state={d.state} size="xs" />
                      {problem && d.severity && <SeverityBadge severity={d.severity} />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 whitespace-nowrap">
                      {problem ? `${d.incident?.observed} · ${fmtDuration(d.sinceMin)}` : d.state === "recovering" ? `recovered ${fmtAgo(d.sinceMin)}` : "accepting everything"}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 font-mono-db text-xs text-foreground">{fmtCount(d.sentEpm)}</td>
                  <td className="px-3 py-2.5 font-mono-db text-xs text-foreground">
                    {fmtCount(d.deliveredEpm)}
                  </td>
                  <td className={`px-3 py-2.5 font-mono-db text-xs ${refused > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                    {fmtCount(refused)}
                    {refused > 0 && <span className="text-xs text-muted-foreground font-sans"> {d.state === "stopped" ? "held" : "rejected"}</span>}
                  </td>
                  <td className="px-3 py-2.5 pr-4 text-xs">
                    <span className={d.healthCheck.status === "failed" ? "text-destructive" : d.healthCheck.status === "warning" ? "text-amber-400" : "text-success"}>
                      {d.healthCheck.status}
                    </span>
                    <span className="text-muted-foreground"> · {d.healthCheck.checkedMinAgo}m ago</span>
                  </td>
                  <RowActions target={{ kind: "destination", d }} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScopedDestinations({
  destinations,
  scope,
  onOpen,
  selectedId,
  onShowAll,
}: {
  destinations: DestinationView[];
  scope: { label: string; sources: SourceView[] };
  onOpen: (d: DestinationView) => void;
  selectedId?: string | null;
  onShowAll?: () => void;
}) {
  // Forwarded is what a source sends on after processing and reduction, the
  // same figure the destination receives from it. "Normal" uses the same
  // reduction, so the two are comparable.
  const normalFwd = (s: SourceView) => s.normalEpm * (1 - s.reduction * 0.75);
  const rows = destinations
    .map((d) => {
      const from = scope.sources.filter((s) => s.destIds.includes(d.id));
      const now = from.reduce((a, s) => a + s.epm.forwarded, 0);
      const normal = from.reduce((a, s) => a + normalFwd(s), 0);
      return { d, from, now, normal, delivered: now * d.acceptance };
    })
    .filter((r) => r.from.length > 0);
  const n = scope.sources.length;
  // Same selection and actions as the full table, so filtering by source
  // never takes the destination actions away.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="rounded-lg border border-border glass-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-muted/5 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Receiving from <span className="text-foreground">{scope.label}</span> · {n} source{n === 1 ? "" : "s"}
        </p>
        {onShowAll && (
          <button onClick={onShowAll} className="text-xs text-primary hover:text-primary/80 underline underline-offset-2">
            Show all destinations
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">None of these sources is routed to a destination.</p>
      ) : (
        <div className="overflow-x-auto">
          <SelectionBar
            targets={rows.filter(({ d }) => selected.has(d.id)).map(({ d }) => ({ kind: "destination" as const, d }))}
            onClear={() => setSelected(new Set())}
          />
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-xs text-muted-foreground text-left border-b border-border">
              <tr>
                <SelectAll
                  total={rows.length}
                  selected={rows.filter(({ d }) => selected.has(d.id)).length}
                  onChange={(all) => setSelected(all ? new Set(rows.map(({ d }) => d.id)) : new Set())}
                />
                <th className="font-normal px-3 py-2 pl-2">Destination</th>
                <th className="font-normal px-3 py-2">From these sources, now</th>
                <th className="font-normal px-3 py-2">Delivered from them</th>
                <th className="font-normal px-3 py-2">Destination overall</th>
                <th aria-label="Actions" className="w-11 sticky right-0 z-[1] bg-card" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ d, from, now, normal, delivered }) => {
                const low = normal > 0 && now < normal * 0.8;
                const problem = d.state === "stopped" || d.state === "degraded";
                return (
                  <tr
                    key={d.id}
                    data-dest-id={d.id}
                    tabIndex={0}
                    onClick={() => onOpen(d)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpen(d);
                      }
                    }}
                    className={`cursor-pointer hover:bg-muted/15 focus-visible:outline-none focus-visible:bg-muted/20 ${selectedId === d.id ? "row-flash" : ""}`}
                    style={
                      selectedId === d.id
                        ? ({
                            backgroundColor: `${d.color}1f`,
                            boxShadow: `inset 3px 0 0 ${d.color}`,
                            "--row-tint": `${d.color}1f`,
                            "--row-flash": `${d.color}66`,
                          } as React.CSSProperties)
                        : undefined
                    }
                  >
                    <RowSelect checked={selected.has(d.id)} label={d.name} onChange={() => toggle(d.id)} />
                    <td className="pl-2 pr-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded bg-white flex items-center justify-center shrink-0" style={{ color: chipSafeColor(d.color) }}>
                          {hasVendorLogo(d.id) ? <VendorLogo connectorId={d.id} size={14} /> : <span className="text-[9px] font-bold">{d.name.slice(0, 2).toUpperCase()}</span>}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{d.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {from.length} of these source{from.length === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono-db text-xs">
                      <p className={now === 0 ? "text-destructive" : low ? "text-amber-400" : "text-foreground"}>{fmtCount(now)}/min</p>
                      <p className="text-xs text-muted-foreground">normally {fmtCount(normal)}/min</p>
                    </td>
                    <td className="px-3 py-2.5 font-mono-db text-xs">
                      <p className={d.acceptance < 1 && now > 0 ? "text-amber-400" : "text-foreground"}>{fmtCount(delivered)}/min</p>
                      {d.acceptance < 1 && now > 0 && <p className="text-xs text-muted-foreground">{Math.round(d.acceptance * 100)}% accepted</p>}
                    </td>
                    <td className="px-3 py-2.5 pr-4">
                      <div className="flex items-center gap-1.5">
                        <HealthBadge state={d.state} size="xs" />
                        {problem && d.severity && <SeverityBadge severity={d.severity} />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {problem ? d.incident?.observed : d.state === "recovering" ? `recovered ${fmtAgo(d.sinceMin)}` : "accepting everything"} ·{" "}
                        {d.sourceIds.length} sources in total
                      </p>
                    </td>
                    <RowActions target={{ kind: "destination", d }} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
