import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowDown, ArrowRight, ArrowUp, ChevronDown, PiggyBank, Receipt, Sparkles, TrendingDown, Route as RouteIcon, ListFilter } from "lucide-react";
import { useSession } from "@/app/lib/SessionContext";
import { useEnvironment, fmtSize, type AlertTarget } from "@/app/lib/environment";
import {
  buildSavingsModel, savingsTrend, ruleValues, hasRuleDetail, usd, type SourceSavingDetail, type DestinationSavingDetail,
} from "@/app/lib/savings";
import { RulePanel } from "@/app/components/shared/RulePanel";
import { ReductionBar, SegmentSwatch } from "@/app/components/shared/ReductionBar";
import type { SourceGroup } from "@/app/data/fleet";
import { PageHeader, SectionHeading, StatTile, StaggerItem, RangeToggle } from "@/app/components/shared/PageLayout";
import { EmptyState } from "@/app/components/shared/StateViews";
import { SearchInput } from "@/app/components/shared/SearchInput";
import { Sparkline } from "@/app/components/shared/Sparkline";
import { VendorLogo, hasVendorLogo, chipSafeColor } from "@/app/components/shared/VendorLogo";
import { DetailDrawer } from "@/app/components/shared/SourceDetailDrawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { NoResults } from "@/app/components/shared/NoResults";

const PAGE = 25;
const ALL_TYPES = "__all";
const RANGE_WORDS: Record<string, string> = { "24H": "24 hours", "7D": "7 days", "30D": "30 days" };
const DAYS: Record<string, number> = { "24H": 1, "7D": 7, "30D": 30 };
type SortKey = "saved" | "name" | "in" | "reduced";

/** The same mark every table uses for a source or destination. */
function Logo({ id, name, color, size = 28 }: { id: string; name: string; color: string; size?: number }) {
  return (
    <div className="rounded bg-white flex items-center justify-center shrink-0" style={{ width: size, height: size, color: chipSafeColor(color) }}>
      {hasVendorLogo(id) ? <VendorLogo connectorId={id} size={Math.round(size / 2)} /> : <span className="text-[9px] font-bold">{name.slice(0, 2).toUpperCase()}</span>}
    </div>
  );
}

/** The bar every savings figure uses: one hue (green), share of the largest. */
function ShareBar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-1 rounded-full bg-muted/30 overflow-hidden">
      <div className="h-full rounded-full opacity-70" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`, background: "var(--db-green)" }} />
    </div>
  );
}

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
      <button onClick={() => setSort({ key: k, flip: active ? !sort.flip : false })} className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}>
        {label}
        {active && (sort.flip ? <ArrowUp className="w-3 h-3" aria-hidden="true" /> : <ArrowDown className="w-3 h-3" aria-hidden="true" />)}
      </button>
    </th>
  );
}

/** What a source's saving is made of, and what's left on the table. */
function Breakdown({ x, onDetails, onRules }: { x: SourceSavingDetail; onDetails: () => void; onRules?: () => void }) {
  const cats = x.categories.filter((c) => c.share > 0);
  return (
    <div className="px-4 pb-4 pt-1 pl-[60px]">
      <div className="rounded border border-border bg-background/40 p-4">
        {/* Leads with the same % and the same bar as this source's Data flow
            ("Reduced · 38% of size removed by rules"), so the two read as
            one fact: there in data, here in dollars. */}
        <div className="flex items-baseline justify-between gap-4 mb-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Where the <span className="text-foreground font-mono-db normal-case">{Math.round(x.reduction * 100)}%</span> reduction comes from
          </p>
          <p className="text-xs font-mono-db text-muted-foreground shrink-0">
            {fmtSize(x.gbNotBilledPerDay)}/day · <span className="text-foreground">{usd(x.monthlyUsd)}/mo</span>
          </p>
        </div>
        <ReductionBar segments={cats.map((c) => ({ label: c.category, share: c.share }))} />
        <p className="text-[10px] text-muted-foreground/70 mt-1 mb-3">Full bar = everything this source sends</p>
        <div className="space-y-1.5">
          {cats.map((c, i) => (
            <div key={c.category} className="grid grid-cols-[minmax(0,1fr)_48px_100px_110px] items-center gap-x-4">
              <p className="text-sm text-foreground/90 truncate flex items-center gap-2">
                <SegmentSwatch label={c.category} index={i} />
                {c.category}
              </p>
              <p className="text-xs font-mono-db text-foreground text-right">{Math.round(c.share * 100)}%</p>
              <p className="text-xs font-mono-db text-muted-foreground text-right">{fmtSize(c.gbPerDay)}/day</p>
              <p className="text-sm font-mono-db text-foreground text-right">{usd(c.monthlyUsd)}/mo</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          {x.projected
            ? "Not routed yet, so this is what it would save at a typical $4.30/GB rate."
            : `Billed at ${x.s.destNames.join(" and ")}, $${x.rate.toFixed(2)}/GB combined: each destination bills the same GB separately.`}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-border/60">
          <p className="text-xs text-muted-foreground">
            {x.rulesOff > 0 ? (
              <>
                <span className="font-mono-db text-foreground">{x.rulesOff}</span> {x.s.vendor} rules still off ·{" "}
                <span className="text-success font-mono-db">~{usd(x.extraMonthlyUsd)}/mo</span> more if turned on
              </>
            ) : (
              "Every applicable rule is already on for this source."
            )}
          </p>
          <div className="flex items-center gap-3">
            {onRules && (
              <button
                onClick={onRules}
                className="inline-flex items-center gap-1 text-xs font-medium rounded px-2.5 py-1 border border-border text-foreground hover:bg-muted/20"
              >
                See rules <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </button>
            )}
            <button onClick={onDetails} className="text-xs text-primary hover:text-primary/80 inline-flex items-center gap-1">
              Health &amp; data flow <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The destination's side of the same question: which sources save the
 * most there, by which rule types, priced at this destination's rate. */
function DestinationBreakdown({
  d,
  feeding,
  onDetails,
  onRules,
}: {
  d: DestinationSavingDetail;
  feeding: SourceSavingDetail[];
  onDetails: () => void;
  onRules?: () => void;
}) {
  const bySource = feeding
    .map((x) => ({ x, usd: x.gbNotBilledPerDay * 30 * d.rate }))
    .sort((a, b) => b.usd - a.usd);
  const cats = new Map<string, { gb: number; usd: number }>();
  for (const x of feeding)
    for (const c of x.categories) {
      const v = cats.get(c.category) ?? { gb: 0, usd: 0 };
      cats.set(c.category, { gb: v.gb + c.gbPerDay, usd: v.usd + c.gbPerDay * 30 * d.rate });
    }
  const catRows = Array.from(cats.entries()).filter(([, v]) => v.gb > 0).sort((a, b) => b[1].gb - a[1].gb);
  const gbIn = feeding.reduce((a, x) => a + x.gbInPerDay, 0);
  const totalShare = catRows.reduce((a, [, v]) => a + v.gb, 0) / Math.max(gbIn, 1e-9);
  const maxSrc = Math.max(...bySource.map((r) => r.usd), 1);
  return (
    <div className="px-4 pb-4 pt-1 pl-[60px]">
      <div className="rounded border border-border bg-background/40 p-4">
        <div className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2.5">Top sources saving here · {feeding.length}</p>
            <div className="space-y-2.5">
              {bySource.slice(0, 5).map(({ x, usd: v }) => (
                <div key={x.s.id} className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-x-4">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground/90 truncate">{x.s.name}</p>
                    <ShareBar value={v} max={maxSrc} />
                  </div>
                  <p className="text-sm font-mono-db text-foreground text-right">{usd(v)}/mo</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Where the <span className="text-foreground font-mono-db normal-case">{Math.round(totalShare * 100)}%</span> comes from
              </p>
            </div>
            <ReductionBar segments={catRows.map(([cat, v]) => ({ label: cat, share: v.gb / Math.max(gbIn, 1e-9) }))} />
            <p className="text-[10px] text-muted-foreground/70 mt-1 mb-3">Full bar = everything routed to {d.name}</p>
            <div className="space-y-1.5">
              {catRows.map(([cat, v], i) => (
                <div key={cat} className="grid grid-cols-[minmax(0,1fr)_48px_110px] items-center gap-x-4">
                  <p className="text-sm text-foreground/90 truncate flex items-center gap-2">
                    <SegmentSwatch label={cat} index={i} />
                    {cat}
                  </p>
                  <p className="text-xs font-mono-db text-foreground text-right">{Math.round((v.gb / Math.max(gbIn, 1e-9)) * 100)}%</p>
                  <p className="text-sm font-mono-db text-foreground text-right">{usd(v.usd)}/mo</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Billed at ${d.rate.toFixed(2)}/GB. Without Databahn this destination would cost {usd(d.billedMonthlyUsd + d.monthlyUsd)}/mo; it costs{" "}
          {usd(d.billedMonthlyUsd)}/mo today.
        </p>
        <div className="flex flex-wrap items-center justify-end gap-3 mt-3 pt-3 border-t border-border/60">
          {onRules && (
            <button
              onClick={onRules}
              className="inline-flex items-center gap-1 text-xs font-medium rounded px-2.5 py-1 border border-border text-foreground hover:bg-muted/20"
            >
              See rules <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </button>
          )}
          <button onClick={onDetails} className="text-xs text-primary hover:text-primary/80 inline-flex items-center gap-1">
            Health &amp; data flow <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Savings, for the people who ask what Databahn is worth: executives and
 * FinOps. Kept off the operational screens (Pipeline, the source drawer) so
 * engineers aren't working around cost figures. Built from the same pieces
 * as those screens: page header, stat tiles, section headings, the
 * Pipeline table's toolbar and paging, the recommendation cards.
 */
export default function Savings() {
  const env = useEnvironment();
  const { rules, toggleRule } = useSession();
  // The rules behind a saving, in a drawer over this page: switching one on
  // updates every figure here live, so its dollar effect is visible at once.
  const [ruleScope, setRuleScope] = useState<null | { label: string; connectorIds: string[]; sourceIds?: string[]; view: "applied" | "off"; rate?: number }>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [range, setRange] = useState("30D");
  const [openTarget, setOpenTarget] = useState<(AlertTarget & { tab?: "flow" }) | null>(null);
  const model = useMemo(() => buildSavingsModel(env, rules), [env, rules]);
  const trend = useMemo(() => savingsTrend(model, range), [model, range]);

  // Table state
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<SourceGroup | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; flip: boolean }>({ key: "saved", flip: false });
  const [limit, setLimit] = useState(PAGE);
  // Arriving from a dashboard row: that source opens here, already expanded.
  const [expanded, setExpanded] = useState<string | null>(() => (location.state as { expand?: string } | null)?.expand ?? null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [expandedDest, setExpandedDest] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(800);
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setChartWidth(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const groups = useMemo(() => {
    const m = new Map<SourceGroup, number>();
    for (const x of model.sources) m.set(x.s.group, (m.get(x.s.group) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [model]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = model.sources.filter((x) => (!group || x.s.group === group) && (!q || x.s.name.toLowerCase().includes(q) || x.s.vendor.toLowerCase().includes(q)));
    const by: Record<SortKey, (a: SourceSavingDetail, b: SourceSavingDetail) => number> = {
      saved: (a, b) => b.monthlyUsd - a.monthlyUsd,
      name: (a, b) => a.s.name.localeCompare(b.s.name),
      in: (a, b) => b.gbInPerDay - a.gbInPerDay,
      reduced: (a, b) => b.reduction - a.reduction,
    };
    const sorted = [...list].sort(by[sort.key]);
    return sort.flip ? sorted.reverse() : sorted;
  }, [model, search, group, sort]);

  useEffect(() => {
    if (!expanded) return;
    const index = rows.findIndex((x) => x.s.id === expanded);
    if (index >= limit) setLimit(Math.ceil((index + 1) / PAGE) * PAGE);
    const t = setTimeout(() => tableRef.current?.querySelector(`[data-row-id="${expanded}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    return () => clearTimeout(t);
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (env.sources.length === 0) {
    return (
      <div className="w-full max-w-[1180px] mx-auto">
        <PageHeader title="Savings" subtitle="What Databahn keeps out of your SIEM bill, and what's left to save." />
        <EmptyState
          icon={PiggyBank}
          title="Nothing to save yet"
          description="Connect a source and route it to a destination; savings show up here as soon as rules start filtering."
          action={{ label: "Connect a source", onClick: () => navigate("/sources") }}
        />
      </div>
    );
  }

  if (env.destinations.length === 0) {
    // Nothing is billed anywhere yet, so there's no real saving to show,
    // only a projection. Same state Pipeline shows at this point.
    const projected = model.sources.reduce((a, x) => a + x.monthlyUsd, 0);
    return (
      <div className="w-full max-w-[1180px] mx-auto">
        <PageHeader title="Savings" subtitle="What Databahn keeps out of your SIEM bill, and what's left to save." />
        <EmptyState
          icon={PiggyBank}
          title="No destination connected yet"
          description={`Nothing is billed until your sources send to a destination. At a typical $4.30/GB, the rules already filtering would save about ${usd(projected)}/mo.`}
          action={{ label: "Connect a destination", onClick: () => navigate("/destinations") }}
        />
      </div>
    );
  }

  const maxSource = Math.max(...model.sources.map((x) => x.monthlyUsd), 1);
  const maxDest = Math.max(...model.destinations.map((d) => d.monthlyUsd), 1);
  const reductionPct = Math.round((model.gbNotBilledPerDay / Math.max(model.gbInPerDay, 1)) * 100);
  const opportunities = [
    ...Array.from(
      model.sources
        .filter((x) => x.rulesOff > 0 && !x.projected)
        .reduce((m, x) => {
          const v = m.get(x.s.connectorId) ?? { vendor: x.s.vendor, connectorId: x.s.connectorId, rulesOff: x.rulesOff, usd: 0, sources: 0 };
          v.usd += x.extraMonthlyUsd;
          v.sources += 1;
          m.set(x.s.connectorId, v);
          return m;
        }, new Map<string, { vendor: string; connectorId: string; rulesOff: number; usd: number; sources: number }>())
        .values(),
    ).map((o) => ({
      id: `rules-${o.connectorId}`,
      icon: ListFilter,
      kind: "Rules",
      impact: `~${usd(o.usd)}/mo`,
      title: `Turn on ${o.rulesOff} more ${o.vendor} rules`,
      why: `Applies across ${o.sources} ${o.vendor} source${o.sources === 1 ? "" : "s"}. None touch anything detection rules use, and each shows its before/after sample first.`,
      action: {
        label: "Review rules",
        onClick: () => setRuleScope({ label: `${o.vendor} · ${o.sources} source${o.sources === 1 ? "" : "s"}`, connectorIds: [o.connectorId], view: "off" }),
      },
    })),
    ...(() => {
      const unrouted = model.sources.filter((x) => x.projected);
      if (unrouted.length === 0) return [];
      return [
        {
          id: "unrouted",
          icon: RouteIcon,
          kind: "Routing",
          impact: `~${usd(unrouted.reduce((a, x) => a + x.monthlyUsd, 0))}/mo`,
          title: `${unrouted.length} source${unrouted.length === 1 ? " isn't" : "s aren't"} routed yet`,
          why: "Their rules are already filtering, but nothing is billed or saved until they send to a destination.",
          action: { label: "Route them", onClick: () => navigate("/pipeline") },
        },
      ];
    })(),
  ].sort((a, b) => b.impact.localeCompare(a.impact));

  return (
    <div className="w-full max-w-[1180px] mx-auto">
      <PageHeader title="Savings" subtitle="What Databahn keeps out of your SIEM bill, where it comes from, and what's left to save." />

      <div className="space-y-10">
        <StaggerItem index={0}>
          <section>
            <SectionHeading title={`Last ${RANGE_WORDS[range]}`} action={<RangeToggle range={range} setRange={setRange} />} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile icon={PiggyBank} label={`Saved · ${range}`} value={usd(trend.totalUsd)} sub={`${usd(model.monthlyUsd)}/mo at today's rate`} tone="good" />
              <StatTile icon={TrendingDown} label="Never billed" value={`${reductionPct}%`} sub={`${fmtSize(model.gbNotBilledPerDay)}/day of ${fmtSize(model.gbInPerDay)}/day`} />
              <StatTile
                icon={Receipt}
                label="Bill without Databahn"
                value={`${usd(model.withoutDatabahnMonthlyUsd)}/mo`}
                sub={`${usd(model.billedMonthlyUsd)}/mo with it, at list rates`}
              />
              <StatTile
                icon={Sparkles}
                label="Still available"
                value={model.extraMonthlyUsd > 0 ? `~${usd(model.extraMonthlyUsd)}/mo` : "None"}
                sub={model.rulesOff > 0 ? `${model.rulesOff} applicable rules are off` : "every applicable rule is on"}
                onClick={
                  model.rulesOff > 0
                    ? () =>
                        setRuleScope({
                          label: "All sources",
                          connectorIds: Array.from(new Set(model.sources.filter((x) => hasRuleDetail(x.s.connectorId)).map((x) => x.s.connectorId))),
                          view: "off",
                        })
                    : undefined
                }
                actionLabel="Review rules"
              />
            </div>
          </section>
        </StaggerItem>

        <StaggerItem index={1}>
          <section>
            <SectionHeading title="Saved per day" />
            <div className="rounded border border-border glass-card p-4">
              <div className="flex items-baseline justify-between mb-3">
                <p className="text-xs text-muted-foreground">
                  Dips are outages: data that never arrived was never filtered, so it saved nothing either.
                </p>
                <p className="text-xs font-mono-db text-muted-foreground shrink-0 ml-4">avg {usd(trend.totalUsd / DAYS[range])}/day</p>
              </div>
              <div ref={chartRef}>
              <Sparkline
                points={trend.points}
                baseline={trend.points.reduce((a, v) => a + v, 0) / Math.max(trend.points.length, 1)}
                color="var(--db-green)"
                // Sized to its card, so it never runs past the edge when Cruz
                // narrows the page.
                width={chartWidth}
                height={96}
                label={`Savings per day over the last ${RANGE_WORDS[range]}`}
              />
              </div>
            </div>
          </section>
        </StaggerItem>

        <StaggerItem index={2}>
          <section>
            <SectionHeading title="By destination" count={model.destinations.length} />
            <div className="rounded-lg border border-border glass-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground text-left border-b border-border bg-muted/5">
                  <tr>
                    <th aria-label="Expand" className="w-10" />
                    <th className="font-normal px-3 py-2 pl-1">Destination</th>
                    <th className="font-normal px-3 py-2">List rate</th>
                    <th className="font-normal px-3 py-2">Reduced</th>
                    <th className="font-normal px-3 py-2">Billed now</th>
                    <th className="font-normal px-3 py-2 pr-4 w-[30%]">Saved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {model.destinations.map((d) => {
                    const open = expandedDest === d.id;
                    const feeding = model.sources.filter((x) => !x.projected && x.s.destIds.includes(d.id));
                    const ruleIds = Array.from(new Set(feeding.filter((x) => hasRuleDetail(x.s.connectorId)).map((x) => x.s.connectorId)));
                    return (
                      <Fragment key={d.id}>
                        <tr
                          tabIndex={0}
                          aria-expanded={open}
                          onClick={() => setExpandedDest(open ? null : d.id)}
                          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setExpandedDest(open ? null : d.id))}
                          className={`cursor-pointer hover:bg-muted/15 focus-visible:outline-none focus-visible:bg-muted/20 ${open ? "bg-muted/10" : ""}`}
                        >
                          <td className="pl-4 py-2.5">
                            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180 text-foreground" : ""}`} aria-hidden="true" />
                          </td>
                          <td className="pl-1 pr-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <Logo id={d.id} name={d.name} color={d.color} />
                              <div>
                                <p className="text-sm font-medium text-foreground">{d.name}</p>
                                <p className="text-xs text-muted-foreground">{feeding.length} sources routed</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-mono-db text-xs text-muted-foreground">${d.rate.toFixed(2)}/GB</td>
                          <td className="px-3 py-2.5 font-mono-db text-xs text-foreground">{fmtSize(d.gbNotBilledPerDay)}/day</td>
                          <td className="px-3 py-2.5 font-mono-db text-xs text-muted-foreground">{usd(d.billedMonthlyUsd)}/mo</td>
                          <td className="px-3 py-2.5 pr-4">
                            <p className="text-sm font-mono-db text-foreground mb-1">
                              {usd(d.monthlyUsd)}
                              <span className="text-xs text-muted-foreground">/mo</span>
                            </p>
                            <ShareBar value={d.monthlyUsd} max={maxDest} />
                          </td>
                        </tr>
                        {open && (
                          <tr className="bg-muted/10">
                            <td colSpan={6} className="p-0">
                              <DestinationBreakdown
                                d={d}
                                feeding={feeding}
                                onDetails={() => setOpenTarget({ kind: "destination", id: d.id, name: d.name, tab: "flow" })}
                                onRules={
                                  ruleIds.length
                                    ? () =>
                                        setRuleScope({
                                          label: `Sources routed to ${d.name}`,
                                          connectorIds: ruleIds,
                                          sourceIds: feeding.map((x) => x.s.id),
                                          view: "applied",
                                          rate: d.rate,
                                        })
                                    : undefined
                                }
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </StaggerItem>

        <StaggerItem index={3}>
          <section ref={tableRef}>
            <SectionHeading title="By source" count={model.sources.length} />
            <div className="rounded-lg border border-border glass-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <SearchInput
                    value={search}
                    onChange={(v) => {
                      setSearch(v);
                      setLimit(PAGE);
                    }}
                    placeholder="Search sources…"
                    className="flex-1"
                  />
                  <Select
                    value={group ?? ALL_TYPES}
                    onValueChange={(v) => {
                      setGroup(v === ALL_TYPES ? null : (v as SourceGroup));
                      setLimit(PAGE);
                    }}
                  >
                    <SelectTrigger className="sm:w-[180px] h-[42px]" aria-label="Filter by source type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_TYPES}>All types ({model.sources.length})</SelectItem>
                      {groups.map(([g, n]) => (
                        <SelectItem key={g} value={g}>
                          {g} ({n})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: 40 }} />
                    <col style={{ width: "34%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "16%" }} />
                    <col />
                  </colgroup>
                  <thead className="text-xs text-muted-foreground text-left border-b border-border bg-muted/5">
                    <tr>
                      <th aria-label="Expand" />
                      <SortHeader label="Source" k="name" sort={sort} setSort={setSort} className="pl-1" />
                      {/* Same names as Pipeline and the drawer's Data flow. */}
                      <SortHeader label="Received" k="in" sort={sort} setSort={setSort} />
                      <SortHeader label="Reduced" k="reduced" sort={sort} setSort={setSort} />
                      <SortHeader label="Saved" k="saved" sort={sort} setSort={setSort} className="pr-4" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={5}>
                          <NoResults
                            what="sources"
                            query={search}
                            hint="Try a different name or source type."
                            onClear={() => {
                              setSearch("");
                              setGroup(null);
                            }}
                            clearLabel="Clear filters"
                          />
                        </td>
                      </tr>
                    )}
                    {rows.slice(0, limit).map((x) => {
                      const open = expanded === x.s.id;
                      return (
                        <Fragment key={x.s.id}>
                          <tr
                            data-row-id={x.s.id}
                            tabIndex={0}
                            aria-expanded={open}
                            onClick={() => setExpanded(open ? null : x.s.id)}
                            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setExpanded(open ? null : x.s.id))}
                            className={`cursor-pointer hover:bg-muted/15 focus-visible:outline-none focus-visible:bg-muted/20 ${open ? "bg-muted/10" : ""}`}
                          >
                            <td className="pl-4 py-2.5">
                              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180 text-foreground" : ""}`} aria-hidden="true" />
                            </td>
                            <td className="pl-1 pr-3 py-2.5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Logo id={x.s.connectorId} name={x.s.vendor} color={x.s.color} />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate" title={x.s.name}>
                                    {x.s.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {x.s.group}
                                    {x.projected ? " · not routed" : ` · ${x.s.destIds.length} destination${x.s.destIds.length === 1 ? "" : "s"}`}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 font-mono-db text-xs text-foreground">{fmtSize(x.gbInPerDay)}/day</td>
                            <td className="px-3 py-2.5 font-mono-db text-xs">
                              <p className="text-foreground">{Math.round(x.reduction * 100)}%</p>
                              <p className="text-muted-foreground">{fmtSize(x.gbNotBilledPerDay)}/day</p>
                            </td>
                            <td className="px-3 py-2.5 pr-4">
                              <p className="text-sm font-mono-db text-foreground mb-1">
                                {x.projected ? "~" : ""}
                                {usd(x.monthlyUsd)}
                                <span className="text-xs text-muted-foreground">/mo</span>
                              </p>
                              <ShareBar value={x.monthlyUsd} max={maxSource} />
                            </td>
                          </tr>
                          {open && (
                            <tr className="bg-muted/10">
                              <td colSpan={5} className="p-0">
                                <Breakdown
                                  x={x}
                                  onDetails={() => setOpenTarget({ kind: "source", id: x.s.id, name: x.s.name, tab: "flow" })}
                                  onRules={
                                    hasRuleDetail(x.s.connectorId)
                                      ? () => setRuleScope({ label: x.s.name, connectorIds: [x.s.connectorId], sourceIds: [x.s.id], view: "applied" })
                                      : undefined
                                  }
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {rows.length > 0 && (
              <div className="px-4 py-2.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Showing <span className="font-mono-db text-foreground">{Math.min(limit, rows.length)}</span> of{" "}
                  <span className="font-mono-db text-foreground">{rows.length}</span>
                  <span className="text-muted-foreground/60"> · Click a source to see where its saving comes from</span>
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
          </section>
        </StaggerItem>

        {opportunities.length > 0 && (
          <StaggerItem index={4}>
            <section>
              <SectionHeading title="Still to save" count={opportunities.length} />
              {/* Same card as the dashboard's recommendations. */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {opportunities.map((o) => (
                  <div key={o.id} className="rounded border border-border glass-card p-4 flex flex-col">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                        <o.icon className="w-3.5 h-3.5 text-success" aria-hidden="true" />
                        {o.kind}
                      </span>
                      <span className="text-xs font-mono-db text-foreground">{o.impact}</span>
                    </div>
                    <p className="text-sm font-medium text-foreground">{o.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed flex-1">{o.why}</p>
                    <div className="mt-3">
                      <button
                        onClick={o.action.onClick}
                        className="inline-flex items-center gap-1 text-xs font-medium rounded px-2.5 py-1 border border-border text-foreground hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {o.action.label}
                        <ArrowRight className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </StaggerItem>
        )}
      </div>

      <p className="text-xs text-muted-foreground/50 mt-8 text-center leading-relaxed">
        Estimated from published list rates. Your negotiated rate will differ.
        {env.isSample && " Sample environment: volume and savings are simulated for this prototype."}
      </p>

      {ruleScope &&
        (() => {
          const scope = model.sources.filter(
            (x) => !x.projected && ruleScope.connectorIds.includes(x.s.connectorId) && (!ruleScope.sourceIds || ruleScope.sourceIds.includes(x.s.id)),
          );
          const values = ruleValues(rules, scope, ruleScope.rate);
          return (
            <RulePanel
              rules={rules.filter((r) => r.sourceIds.some((id) => ruleScope.connectorIds.includes(id)))}
              scopeLabel={ruleScope.label}
              sourceId={ruleScope.connectorIds.length === 1 ? ruleScope.connectorIds[0] : undefined}
              onToggle={toggleRule}
              onClose={() => setRuleScope(null)}
              savings={{ valueOf: (id) => values.get(id) ?? 0, initialView: ruleScope.view }}
            />
          );
        })()}
      {openTarget && (
        <DetailDrawer target={openTarget} range={range} initialTab={openTarget.tab} onClose={() => setOpenTarget(null)} onOpen={(t) => setOpenTarget(t)} />
      )}
    </div>
  );
}
