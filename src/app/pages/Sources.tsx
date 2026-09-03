import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { CONNECTORS } from "@/app/data/connectors";
import { ConnectorCatalog } from "@/app/components/shared/ConnectorCatalog";
import { ConnectModal } from "@/app/components/shared/ConnectModal";
import { PageHeader } from "@/app/components/shared/PageLayout";
import { ConnectedDock } from "@/app/components/shared/ConnectedDock";
import { useSession } from "@/app/lib/SessionContext";

const BUILT_IN_ROUTES: Record<string, string> = {
  paloalto: "/sources/paloalto",
  entraid: "/sources/entraid",
};

export default function Sources() {
  const navigate = useNavigate();
  // Arriving from the pipeline should return there, so both Add CTAs behave
  // the same way instead of ending in different places.
  const returnTo = (useLocation().state as { returnTo?: string } | null)?.returnTo;
  // Modal handles identify + consent, the wizard handles the multi-step work.
  const [pending, setPending] = useState<string | null>(null);
  const { isConnected, disconnectEntity } = useSession();
  const pendingDef = CONNECTORS.find((c) => c.id === pending) ?? null;
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
        isConnected={Boolean(pendingDef && isConnected(pendingDef.name))}
        onDisconnect={(id) => {
          disconnectEntity(id);
          setPending(null);
        }}
        onClose={() => setPending(null)}
        onContinue={(id) => {
          setPending(null);
          navigate(BUILT_IN_ROUTES[id] ?? `/sources/connect/${id}`, { state: { returnTo } });
        }}
      />
      <ConnectedDock kind="source" continueLabel="Route to a destination" onContinue={() => navigate("/destinations")} />
    </div>
  );
}
