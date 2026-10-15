import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowRight } from "lucide-react";
import { CONNECTORS } from "@/app/data/connectors";
import { ConnectorCatalog, ConnectorCatalogCard } from "@/app/components/shared/ConnectorCatalog";
import { ConnectModal } from "@/app/components/shared/ConnectModal";
import { PageHeader, StaggerItem } from "@/app/components/shared/PageLayout";
import { ConnectedDock } from "@/app/components/shared/ConnectedDock";
import { SegmentedToggle } from "@/app/components/shared/SegmentedToggle";
import { VendorLogo, hasVendorLogo, chipSafeColor } from "@/app/components/shared/VendorLogo";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Button } from "@/app/components/ui/button";
import { useSession } from "@/app/lib/SessionContext";
import { useEnvironment, connectorSummary, fmtSize, type ConnectorSummary } from "@/app/lib/environment";
import { buildConnectorLiveState } from "@/app/lib/pipelineData";

const BUILT_IN_ROUTES: Record<string, string> = {
  sentinel: "/destinations/sentinel",
  splunk: "/destinations/splunk",
};

type Tab = "all" | "connected";


/** For a type connected as part of the sample environment: the manage
 * dialog reports live state and leads to Pipeline, since "edit
 * configuration" of 18 accounts at once isn't one thing. */
function sampleManageCopy(s: ConnectorSummary | undefined, isSource: boolean) {
  if (!s || s.fromSession) return undefined;
  return {
    configuration: (isSource
      ? [
          ["Connected", `${s.count} source${s.count === 1 ? "" : "s"}`],
          ["Not sending", String(s.stopped)],
          ["Below normal", String(s.degraded)],
          ["Volume", `${fmtSize(s.gbPerDay)}/day`],
        ]
      : [
          ["Status", s.state ?? "healthy"],
          ["Sources routed", String(s.sourcesRouted ?? 0)],
          ["Volume", `${fmtSize(s.gbPerDay)}/day`],
        ]) as [string, string][],
    manageLabel: "View in Pipeline",
    status: (s.stopped
      ? { label: isSource ? `${s.stopped} not sending` : "Not accepting", tone: "bad" }
      : s.degraded
        ? { label: isSource ? `${s.degraded} below normal` : "Rejecting some", tone: "warn" }
        : s.state === "recovering"
          ? { label: "Recovering", tone: "info" }
          : { label: "Healthy", tone: "good" }) as { label: string; tone: "good" | "warn" | "bad" | "info" },
  };
}

export default function Destinations() {
  const navigate = useNavigate();
  // Arriving from the pipeline should return there, so both Add CTAs behave
  // the same way instead of ending in different places. Arriving from a
  // source's success screen carries which source is waiting to be routed, so
  // it survives the trip through this catalog into whichever destination
  // wizard gets picked.
  const locationState = useLocation().state as { returnTo?: string; pendingSourceId?: string } | null;
  const returnTo = locationState?.returnTo;
  const pendingSourceId = locationState?.pendingSourceId;
  // Modal handles identify + consent, the wizard handles the multi-step work.
  const [pending, setPending] = useState<string | null>(null);
  const { isConnected, disconnectEntity, connected, routes, rules, addRoute } = useSession();
  const liveByConnector = buildConnectorLiveState(connected, routes, rules);
  const pendingDef = CONNECTORS.find((c) => c.id === pending) ?? null;
  const summary = connectorSummary(useEnvironment());
  const pendingSummary = pending ? summary[pending] : undefined;
  const sampleOnly = Boolean(pendingSummary && !pendingSummary.fromSession);

  const connectedDestinations = connected.filter((c) => c.kind === "destination");
  // Already routed to the pending source doesn't need to be offered again,
  // it's already the answer, not a choice left to make.
  const routableDestinations = pendingSourceId
    ? connectedDestinations.filter((d) => !routes.some((r) => r.sourceId === pendingSourceId && r.destId === d.id))
    : connectedDestinations;

  // Defaulting to "Connected" only makes sense when there's a source
  // waiting to be routed, that's the quick-route case this tab exists for.
  // Arriving with no pending source (Pipeline's "+ Add destination", or the
  // catalog nav link) means the intent is to add something new, so it
  // should never open on a list of things already connected.
  const [tab, setTab] = useState<Tab>(pendingSourceId && routableDestinations.length > 0 ? "connected" : "all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const confirmRouting = () => {
    if (!pendingSourceId) return;
    selectedIds.forEach((destId) => addRoute(pendingSourceId, destId));
    navigate("/pipeline");
  };

  return (
    <div className="w-full max-w-[1180px] mx-auto">
      <PageHeader
        title="Where should it go?"
        subtitle="Connect a destination once. Every source you add after this can route to it without setting it up again."
      />

      {/* Destinations are reused across sources, so "pick from what I already
          have" is a real standing task here with no equivalent on Sources:
          routing an existing source to an existing destination needs a way in
          that doesn't depend on having just finished a source wizard. */}
      {connectedDestinations.length > 0 && (
        <div className="max-w-xs mx-auto mb-8">
          <SegmentedToggle
            layoutId="destinations-tab"
            value={tab}
            onChange={setTab}
            options={[
              { value: "connected", label: `Connected (${connectedDestinations.length})` },
              { value: "all", label: "Add new" },
            ]}
          />
        </div>
      )}

      {tab === "connected" && connectedDestinations.length > 0 ? (
        <div style={{ paddingBottom: 120 }}>
          {pendingSourceId ? (
            <p className="text-sm text-muted-foreground text-center mb-5">
              Select any destination this source should route to. No re-authentication needed for these.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground text-center mb-5">
              Everything you have connected. Pick one to manage it.
            </p>
          )}
          {pendingSourceId ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {connectedDestinations.map((d) => {
              const def = CONNECTORS.find((c) => c.name === d.name);
              const alreadyRouted = pendingSourceId ? !routableDestinations.some((r) => r.id === d.id) : false;
              const selected = selectedIds.includes(d.id);
              return (
                <button
                  key={d.id}
                  disabled={alreadyRouted}
                  onClick={() => (pendingSourceId ? toggleSelected(d.id) : setPending(def?.id ?? null))}
                  className={`group flex items-center gap-3 rounded-lg border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    alreadyRouted
                      ? "border-success/30 bg-success/[0.04] cursor-default"
                      : selected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card/60 hover:border-primary/40"
                  }`}
                >
                  {pendingSourceId && (
                    <Checkbox checked={selected || alreadyRouted} disabled={alreadyRouted} className="pointer-events-none" />
                  )}
                  <span
                    className="w-8 h-8 rounded flex items-center justify-center shrink-0 bg-white"
                    style={{ color: def ? chipSafeColor(def.brandColor) : undefined }}
                  >
                    {def && hasVendorLogo(def.id) ? (
                      <VendorLogo connectorId={def.id} size={16} />
                    ) : (
                      <span className="text-[9px] font-bold">{def?.initials}</span>
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-foreground font-medium truncate">{d.name}</span>
                    {alreadyRouted && <span className="block text-xs text-success">Already routed here</span>}
                  </span>
                  {!pendingSourceId && (
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {connectedDestinations.map((d, i) => {
                const def = CONNECTORS.find((c) => c.name === d.name);
                if (!def) return null;
                return (
                  <StaggerItem key={d.id} index={i}>
                    <ConnectorCatalogCard
                      connector={def}
                      onSelect={() => setPending(def.id)}
                      live={liveByConnector[def.id]}
                    />
                  </StaggerItem>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div style={{ paddingBottom: 120 }}>
          {/* The Connected tab owns what's already set up, so repeating those
              here would be the same card behind two different clicks. */}
          <ConnectorCatalog
            connectors={CONNECTORS.filter((c) => !isConnected(c.name))}
            kind="destination"
            onSelect={(id) => setPending(id)}
          />
        </div>
      )}

      <ConnectModal
        connector={pendingDef}
        isConnected={Boolean(pendingDef && (isConnected(pendingDef.name) || pendingSummary))}
        // Sample sources aren't this session's to disconnect.
        onDisconnect={
          sampleOnly
            ? undefined
            : (id) => {
                disconnectEntity(id);
                setPending(null);
              }
        }
        copy={sampleManageCopy(pendingSummary, false)}
        onClose={() => setPending(null)}
        onContinue={(id) => {
          setPending(null);
          if (sampleOnly) {
            navigate("/pipeline", { state: { search: undefined } });
            return;
          }
          navigate(BUILT_IN_ROUTES[id] ?? `/destinations/connect/${id}`, { state: { returnTo, pendingSourceId } });
        }}
      />

      {pendingSourceId && tab === "connected" && selectedIds.length > 0 ? (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-5 py-3 rounded glass-card border border-primary/25" style={{ boxShadow: "0 12px 48px rgba(0,0,0,0.5), 0 0 24px rgba(74,148,249,0.10)" }}>
          <p className="text-sm text-foreground">
            <span className="font-mono-db">{selectedIds.length}</span> destination{selectedIds.length === 1 ? "" : "s"} selected
          </p>
          <Button size="sm" onClick={confirmRouting} className="gap-1.5">
            Route here
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : (
        <ConnectedDock kind="destination" continueLabel="View pipeline" onContinue={() => navigate("/pipeline")} />
      )}
    </div>
  );
}
