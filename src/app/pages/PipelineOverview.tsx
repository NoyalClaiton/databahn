import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { TrendingDown, ShieldCheck, ListFilter, Activity } from "lucide-react";
import { useSession } from "@/app/lib/SessionContext";
import { EmptyState } from "@/app/components/shared/StateViews";
import { PipelineSankey } from "@/app/components/shared/PipelineSankey";
import { RulePanel } from "@/app/components/shared/RulePanel";
import { RoutingPanel } from "@/app/components/shared/RoutingPanel";
import { ColdStoragePanel } from "@/app/components/shared/ColdStoragePanel";
import { liveRuleTotals, liveReductionFactor, RULE_LIBRARY_TOTAL } from "@/app/data/rules";
import { PageHeader, SectionHeading, StatTile } from "@/app/components/shared/PageLayout";
import { useEnvironment, diagramNodes } from "@/app/lib/environment";
import {
  SourceMetricsTable, DestinationsTable, filterSources, describeFilters, type TableFilters, type HealthFilter,
} from "@/app/components/shared/SourceMetricsTable";
import { DetailDrawer } from "@/app/components/shared/SourceDetailDrawer";
import { fmtSize, type AlertTarget } from "@/app/lib/environment";
import type { SourceGroup } from "@/app/data/fleet";

export default function PipelineOverview() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    disconnectEntity,
    addRoute,
    removeRoute,
    rules,
    toggleRule,
    coldStorageTargets,
    addColdStorageTarget,
    removeColdStorageTarget,
    coldStorageAssignments,
    assignColdStorage,
  } = useSession();
  // "View in Pipeline" on a just-proposed rule (see Search's flag flow)
  // carries which rule that was, landing on the dashboard with no clue
  // where to look isn't actually an answer to "where do I go next."
  const focusRuleId = (location.state as { focusRuleId?: string } | null)?.focusRuleId;
  const [panelScope, setPanelScope] = useState<null | { label: string; sourceId?: string; category?: string }>(() =>
    focusRuleId ? { label: "All connected sources" } : null,
  );
  const [routingFocus, setRoutingFocus] = useState<null | { sourceId?: string; destId?: string }>(null);
  // A destination's success step nudges toward connecting cold storage next,
  // landing here with no sign that's what to do next would just be the same
  // "where do I go now" gap the focusRuleId pattern already fixed for rules.
  const [showColdStorage, setShowColdStorage] = useState(
    () => (location.state as { openColdStorage?: boolean } | null)?.openColdStorage ?? false,
  );
  // Owned here, not inside PipelineSankey, so the "Volume reduced" tile can
  // use the same range factor the diagram itself is showing instead of the
  // two silently disagreeing the moment someone clicks "7D".
  const [range, setRange] = useState("24H");
  const env = useEnvironment();
  // Arriving from a dashboard health count ("3 stopped") lands on the table
  // already filtered to exactly that, not on an unfiltered list of 170.
  const [filters, setFilters] = useState<TableFilters>(() => ({
    // "View in Pipeline" from a catalog card lands on that vendor's sources.
    search: (location.state as { search?: string } | null)?.search ?? "",
    health: ((location.state as { healthFilter?: HealthFilter } | null)?.healthFilter ?? null) as HealthFilter,
    group: null,
    dest: (location.state as { destFilter?: { id: string; name: string } } | null)?.destFilter ?? null,
  }));
  // Arriving again while already here (from a drawer on this page) doesn't
  // remount, so pick the request up from state changes too.
  useEffect(() => {
    const st = location.state as { destFilter?: { id: string; name: string } } | null;
    if (st?.destFilter) {
      setFilters({ search: "", health: null, group: null, dest: st.destFilter });
      setTimeout(() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, [location.state]);
  const [openTarget, setOpenTarget] = useState<AlertTarget | null>(null);
  const [selectedDest, setSelectedDest] = useState<string | null>(null);
  // Destinations follow the sources filter by default; "Show all" opts out
  // until the filter changes again.
  const [destUnscoped, setDestUnscoped] = useState(false);
  useEffect(() => setDestUnscoped(false), [filters.group, filters.health, filters.search]);
  const destTableRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const focusTable = (patch: Partial<TableFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (env.sources.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No sources connected yet"
        description="Connect a source to see it flow through Databahn to a destination."
        action={{ label: "Connect a source", onClick: () => navigate("/sources") }}
      />
    );
  }

  const { sourceNodes, destNodes, edges, grouped } = diagramNodes(env, range);
  // Real scale, not the handful of sample rule bodies we render.
  const connectedSourceIds = Array.from(new Set(env.sources.map((s) => s.connectorId)));
  // Live, not a frozen snapshot: RULE_CATEGORIES.active never moved once a
  // rule was toggled anywhere in the app, every count that read it silently
  // stopped reflecting reality the moment someone flipped a switch. These
  // recompute from the actual `rules` array on every render.
  const totals = liveRuleTotals(rules, connectedSourceIds);
  // Volume-weighted across every node's own rate. Nodes always carry one
  // now (live rules for Palo Alto and Entra ID, typical rates for the rest),
  // so this is the same number the diagram and the table both show.
  const nodeVolume = sourceNodes.reduce((a, n) => a + n.volume, 0);
  const reductionFactor =
    nodeVolume > 0
      ? sourceNodes.reduce((a, n) => a + n.volume * (n.reduction ?? liveReductionFactor(rules, [n])), 0) / nodeVolume
      : 0;

  // Real numbers, not placeholders: volume reduced comes from the same
  // ingest total, reduction factor, and time range the Sankey itself
  // renders, and health is measured by actual graph completeness (every
  // source reaching a destination), not a fabricated uptime figure this
  // prototype has no way to honestly track.
  const totalInRange = sourceNodes.reduce((a, s) => a + (s.total?.gb ?? 0), 0);
  const unroutedSources = env.sources.filter((s) => s.destIds.length === 0);
  const { severityCounts, alerts } = env.summary;
  const urgent = alerts.filter((a) => a.severity === "critical" || a.severity === "high").length;

  const panelRules = panelScope?.sourceId
    ? rules.filter((r) => r.sourceIds.includes(panelScope.sourceId!))
    : rules;

  // Wider than the shared 1180px page measure, deliberately: this is the one
  // page carrying a dense diagram plus source/destination cards side by
  // side, the standard width read as cramped, not consistent. Every
  // list-shaped page (Sources, Rules, Search, ...) still shares 1180px.
  return (
    <div className="w-full max-w-[1400px] mx-auto">
      <PageHeader
        title="Pipeline overview"
        subtitle="Everything flowing from your sources, through Cruz, out to your destinations. Click anywhere to see exactly what's being filtered."
      />

      {destNodes.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No destination connected yet"
          description="Route this source to a destination to complete the pipeline."
          action={{ label: "Connect a destination", onClick: () => navigate("/destinations") }}
        />
      ) : (
        <PipelineSankey
          sources={sourceNodes}
          destinations={destNodes}
          edges={edges}
          reductionFactor={reductionFactor}
          range={range}
          onRangeChange={setRange}
          ruleSourceIds={connectedSourceIds}
          groupedSourceCount={grouped ? env.sources.length : undefined}
          coldStorageTargetCount={coldStorageTargets.length}
          onManageColdStorage={() => setShowColdStorage(true)}
          onHighwayClick={(category) =>
            setPanelScope(category ? { label: category, category } : { label: "All connected sources" })
          }
          // A grouped row filters the table to that type, so the dropdown and
          // every count reflect what was clicked, and narrows to Stopped when
          // anything of that type has stopped. It never opens a drawer on its
          // own: the same click always lands on the table, whatever the count.
          // Clicking the same row again clears the filter. An individual row
          // (ungrouped diagram) opens its drawer.
          onSourceClick={(id) => {
            if (!id.startsWith("group:")) {
              setOpenTarget({ kind: "source", id, name: env.sources.find((x) => x.id === id)?.name ?? id });
              return;
            }
            const group = id.slice(6) as SourceGroup;
            if (filters.group === group) {
              setFilters((f) => ({ ...f, group: null, health: null }));
              return;
            }
            const stopped = env.sources.filter((x) => x.group === group && x.state === "stopped");
            focusTable({ group, health: stopped.length ? "stopped" : null, search: "" });
          }}
          // The diagram row stays selected for exactly as long as its type
          // is the table's filter, whichever way that filter was set.
          selectedSourceId={grouped ? (filters.group ? `group:${filters.group}` : null) : undefined}
          onDestinationClick={(id) => {
            setSelectedDest((cur) => (cur === id ? null : id));
            if (selectedDest !== id) destTableRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          selectedDestinationId={selectedDest}
          onDisconnectSource={grouped ? undefined : (id) => disconnectEntity(id)}
          onDisconnectDestination={grouped ? undefined : (id) => disconnectEntity(id)}
          onAddSource={() => navigate("/sources", { state: { returnTo: "/pipeline" } })}
          onAddDestination={() => navigate("/destinations", { state: { returnTo: "/pipeline" } })}
          onManageRouting={grouped ? undefined : (focus) => setRoutingFocus(focus ?? {})}
        />
      )}

      {/* Only once there's a destination. Three tiles reading "N/A" under an
          empty state that already says why is noise, not information. */}
      {destNodes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8">
          <StatTile
            icon={TrendingDown}
            label="Volume reduced"
            value={`${Math.round(reductionFactor * 100)}%`}
            sub={`${fmtSize(totalInRange * reductionFactor)} filtered by active rules in ${range}`}
          />
          {/* Alerts first, routing second: data not arriving or not landing
              is an outage, an unrouted source is unfinished setup. */}
          {urgent > 0 ? (
            <StatTile
              icon={Activity}
              label="Open alerts"
              value={String(alerts.length)}
              tone="warning"
              sub={[
                severityCounts.critical && `${severityCounts.critical} critical`,
                severityCounts.high && `${severityCounts.high} high`,
                severityCounts.medium && `${severityCounts.medium} medium`,
                severityCounts.low && `${severityCounts.low} low`,
              ]
                .filter(Boolean)
                .join(" · ")}
              onClick={() => focusTable({ health: "issues", group: null })}
              actionLabel="Show affected sources"
            />
          ) : unroutedSources.length > 0 ? (
            <StatTile
              icon={ShieldCheck}
              label="Pipeline health"
              value={`${unroutedSources.length} unrouted`}
              tone="warning"
              sub={`${unroutedSources.map((s) => s.name).join(", ")} not routed anywhere yet`}
              onClick={grouped ? undefined : () => setRoutingFocus({})}
              actionLabel="Manage routing"
            />
          ) : (
            <StatTile
              icon={ShieldCheck}
              label="Pipeline health"
              value="Healthy"
              tone="good"
              sub="Every source is arriving normally and reaches a destination"
            />
          )}
          <StatTile icon={ListFilter} label="Rule adoption" value={`${totals.active}/${totals.applicable}`} sub={`applicable rules active, ${RULE_LIBRARY_TOTAL}+ in library`} />
        </div>
      )}

      {/* Ask 1: per-source metrics. The diagram shows how data flows; this
          is where individual sources are compared and checked. */}
      {destNodes.length > 0 && (
        <section ref={tableRef} className="mt-10 scroll-mt-6">
          <SectionHeading
            title={filters.dest ? `Sources · sending to ${filters.dest.name}` : filters.group ? `Sources · ${filters.group}` : "Sources"}
            count={filterSources(env.sources, { ...filters, health: null, search: "" }).length}
          />
          <SourceMetricsTable
            sources={env.sources}
            destinations={env.destinations}
            range={range}
            filters={filters}
            onFiltersChange={setFilters}
            onOpen={(src) => setOpenTarget({ kind: "source", id: src.id, name: src.name })}
          />
          <div ref={destTableRef} className="mt-8 scroll-mt-6">
            <SectionHeading
              title="Destinations"
              count={
                describeFilters(filters) && !destUnscoped
                  ? env.destinations.filter((d) => filterSources(env.sources, filters).some((x) => x.destIds.includes(d.id))).length
                  : env.destinations.length
              }
              action={
                selectedDest ? (
                  <button onClick={() => setSelectedDest(null)} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                    Clear selection
                  </button>
                ) : undefined
              }
            />
            <DestinationsTable
              destinations={env.destinations}
              selectedId={selectedDest}
              scope={
                describeFilters(filters) && !destUnscoped
                  ? { label: describeFilters(filters)!, sources: filterSources(env.sources, filters) }
                  : null
              }
              onShowAll={() => setDestUnscoped(true)}
              onOpen={(d) => setOpenTarget({ kind: "destination", id: d.id, name: d.name })}
            />
          </div>
          {env.isSample && (
            <p className="text-xs text-muted-foreground/50 mt-3 text-center">
              Sample environment. Health and volume figures are simulated for this prototype.
            </p>
          )}
        </section>
      )}

      {openTarget && <DetailDrawer target={openTarget} range={range} onClose={() => setOpenTarget(null)} onOpen={setOpenTarget} />}

      {panelScope && (
        <RulePanel
          rules={panelRules}
          scopeLabel={panelScope.label}
          sourceId={panelScope.sourceId}
          category={panelScope.category}
          onClose={() => setPanelScope(null)}
          onToggle={toggleRule}
          focusRuleId={focusRuleId}
        />
      )}

      {routingFocus && (
        <RoutingPanel
          sources={sourceNodes}
          destinations={destNodes}
          edges={edges}
          onToggle={(sourceId, destId, routed) => (routed ? addRoute(sourceId, destId) : removeRoute(sourceId, destId))}
          onClose={() => setRoutingFocus(null)}
          focusSourceId={routingFocus.sourceId}
          focusDestId={routingFocus.destId}
        />
      )}

      {showColdStorage && (
        <ColdStoragePanel
          targets={coldStorageTargets}
          sources={sourceNodes}
          assignments={coldStorageAssignments}
          onAdd={addColdStorageTarget}
          onRemove={removeColdStorageTarget}
          onAssign={assignColdStorage}
          onClose={() => setShowColdStorage(false)}
        />
      )}
    </div>
  );
}
