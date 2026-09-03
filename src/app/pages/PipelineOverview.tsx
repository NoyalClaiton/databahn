import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { TrendingDown, ShieldCheck, ListFilter } from "lucide-react";
import { useSession } from "@/app/lib/SessionContext";
import { EmptyState } from "@/app/components/shared/StateViews";
import { PipelineSankey, fmtGb, RANGE_FACTOR } from "@/app/components/shared/PipelineSankey";
import { RulePanel } from "@/app/components/shared/RulePanel";
import { RoutingPanel } from "@/app/components/shared/RoutingPanel";
import { ColdStoragePanel } from "@/app/components/shared/ColdStoragePanel";
import { liveRuleTotals, liveReductionFactor, RULE_LIBRARY_TOTAL } from "@/app/data/rules";
import { CONNECTORS } from "@/app/data/connectors";
import { buildFlowNodes } from "@/app/lib/pipelineData";
import { PageHeader, StatTile } from "@/app/components/shared/PageLayout";

export default function PipelineOverview() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    connected,
    routes,
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

  const connectedSources = connected.filter((c) => c.kind === "source");

  if (connectedSources.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No sources connected yet"
        description="Connect a source to see it flow through Databahn to a destination."
        action={{ label: "Connect a source", onClick: () => navigate("/sources") }}
      />
    );
  }

  const { sourceNodes, destNodes, edges } = buildFlowNodes(connected, routes);
  // Real scale, not the handful of sample rule bodies we render.
  const connectedSourceIds = connectedSources
    .map((c) => CONNECTORS.find((d) => d.name === c.name)?.id)
    .filter((x): x is string => Boolean(x));
  // Live, not a frozen snapshot: RULE_CATEGORIES.active never moved once a
  // rule was toggled anywhere in the app, every count that read it silently
  // stopped reflecting reality the moment someone flipped a switch. These
  // recompute from the actual `rules` array on every render.
  const totals = liveRuleTotals(rules, connectedSourceIds);
  const reductionFactor = liveReductionFactor(rules, sourceNodes);

  // Real numbers, not placeholders: volume reduced comes from the same
  // ingest total, reduction factor, and time range the Sankey itself
  // renders, and health is measured by actual graph completeness (every
  // source reaching a destination), not a fabricated uptime figure this
  // prototype has no way to honestly track.
  const rangeFactor = RANGE_FACTOR[range] ?? 1;
  const totalInRaw = sourceNodes.reduce((a, s) => a + s.volume, 0) * rangeFactor;
  const unroutedSources = sourceNodes.filter((s) => !edges.some((e) => e.sourceId === s.id));
  const isHealthy = destNodes.length > 0 && unroutedSources.length === 0;

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
          coldStorageTargetCount={coldStorageTargets.length}
          onManageColdStorage={() => setShowColdStorage(true)}
          onHighwayClick={(category) =>
            setPanelScope(category ? { label: category, category } : { label: "All connected sources" })
          }
          onSourceClick={(id) => setPanelScope({ label: CONNECTORS.find((c) => c.id === id)?.name ?? id, sourceId: id })}
          onDisconnectSource={(id) => disconnectEntity(id)}
          onDisconnectDestination={(id) => disconnectEntity(id)}
          onAddSource={() => navigate("/sources", { state: { returnTo: "/pipeline" } })}
          onAddDestination={() => navigate("/destinations", { state: { returnTo: "/pipeline" } })}
          onManageRouting={(focus) => setRoutingFocus(focus ?? {})}
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
            sub={`${fmtGb(totalInRaw * reductionFactor)}/day filtered by active rules`}
          />
          <StatTile
            icon={ShieldCheck}
            label="Pipeline health"
            value={isHealthy ? "Healthy" : `${unroutedSources.length} unrouted`}
            tone={isHealthy ? "good" : "warning"}
            sub={
              isHealthy
                ? "Every connected source reaches a destination"
                : `${unroutedSources.map((s) => s.name).join(", ")} not routed anywhere yet`
            }
            onClick={isHealthy ? undefined : () => setRoutingFocus({})}
            actionLabel="Manage routing"
          />
          <StatTile icon={ListFilter} label="Rule adoption" value={`${totals.active}/${totals.applicable}`} sub={`applicable rules active, ${RULE_LIBRARY_TOTAL}+ in library`} />
        </div>
      )}

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
