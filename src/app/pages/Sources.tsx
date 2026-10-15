import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { CONNECTORS } from "@/app/data/connectors";
import { ConnectorCatalog } from "@/app/components/shared/ConnectorCatalog";
import { ConnectModal } from "@/app/components/shared/ConnectModal";
import { PageHeader } from "@/app/components/shared/PageLayout";
import { ConnectedDock } from "@/app/components/shared/ConnectedDock";
import { useSession } from "@/app/lib/SessionContext";
import { useEnvironment, connectorSummary, fmtSize, type ConnectorSummary } from "@/app/lib/environment";

const BUILT_IN_ROUTES: Record<string, string> = {
  paloalto: "/sources/paloalto",
  entraid: "/sources/entraid",
};


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

export default function Sources() {
  const navigate = useNavigate();
  // Arriving from the pipeline should return there, so both Add CTAs behave
  // the same way instead of ending in different places.
  const returnTo = (useLocation().state as { returnTo?: string } | null)?.returnTo;
  // Modal handles identify + consent, the wizard handles the multi-step work.
  const [pending, setPending] = useState<string | null>(null);
  const { isConnected, disconnectEntity } = useSession();
  const pendingDef = CONNECTORS.find((c) => c.id === pending) ?? null;
  const summary = connectorSummary(useEnvironment());
  const pendingSummary = pending ? summary[pending] : undefined;
  const sampleOnly = Boolean(pendingSummary && !pendingSummary.fromSession);
  return (
    <div className="w-full max-w-[1180px] mx-auto">
      <PageHeader
        title="Connect your sources"
        subtitle="Pick what you're connecting and Cruz handles the technical setup. Read-only access, nothing leaves your control."
      />
      <div style={{ paddingBottom: 120 }}>
        <ConnectorCatalog
          connectors={CONNECTORS}
          kind="source"
          onSelect={(id) => setPending(id)}
        />
      </div>
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
        copy={sampleManageCopy(pendingSummary, true)}
        onClose={() => setPending(null)}
        onContinue={(id) => {
          setPending(null);
          if (sampleOnly) {
            navigate("/pipeline", { state: { search: CONNECTORS.find((c) => c.id === id)?.name ?? id } });
            return;
          }
          navigate(BUILT_IN_ROUTES[id] ?? `/sources/connect/${id}`, { state: { returnTo } });
        }}
      />
      <ConnectedDock kind="source" continueLabel="Route to a destination" onContinue={() => navigate("/destinations")} />
    </div>
  );
}
