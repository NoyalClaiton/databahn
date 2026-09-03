import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { OnboardingWizard, type WizardStep } from "@/app/components/shared/OnboardingWizard";
import { FieldRow } from "@/app/components/shared/FieldRow";
import { Input } from "@/app/components/ui/input";
import { LiveTestState } from "@/app/components/shared/LiveTestState";
import { RedirectingToProvider } from "@/app/components/shared/RedirectingToProvider";
import { SuccessState } from "@/app/components/shared/StateViews";
import { ColdStorageNudge } from "@/app/components/shared/ColdStorageNudge";
import { Button } from "@/app/components/ui/button";
import { useSession } from "@/app/lib/SessionContext";
import { ExternalLink } from "lucide-react";

const CONNECTOR_NAME = "Microsoft Sentinel";

function AlreadyConnectedQuickRoute({ onDone }: { onDone: () => void }) {
  return (
    <div className="max-w-xl mx-auto rounded border border-border glass-card p-6 text-center">
      <p className="text-sm text-foreground font-medium">Microsoft Sentinel is already connected this session.</p>
      <p className="text-sm text-muted-foreground mt-1.5">Route this source there too? No re-authentication needed.</p>
      <Button size="lg" className="mt-5 min-w-[160px]" onClick={onDone}>
        Route here too
      </Button>
    </div>
  );
}

export default function DestinationSentinel() {
  const [testPassed, setTestPassed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { connectEntity, addRoute, isConnected } = useSession();
  const [authMethod, setAuthMethod] = useState<"oauth" | "manual">("oauth");
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceKey, setWorkspaceKey] = useState("");
  const pendingSourceId = (location.state as { pendingSourceId?: string } | null)?.pendingSourceId;

  const finish = () => {
    connectEntity({ id: "sentinel", name: CONNECTOR_NAME, kind: "destination", connectedAt: Date.now() });
    if (pendingSourceId) addRoute(pendingSourceId, "sentinel");
    navigate("/pipeline");
  };

  // Fanning one source out to more than one destination (a primary SIEM and
  // a compliance archive, say) is a real pattern, so this carries the same
  // pendingSourceId forward rather than forcing a second trip through a
  // source's success screen to wire the next destination.
  const finishAndAddAnother = () => {
    connectEntity({ id: "sentinel", name: CONNECTOR_NAME, kind: "destination", connectedAt: Date.now() });
    if (pendingSourceId) addRoute(pendingSourceId, "sentinel");
    navigate("/destinations", { state: { pendingSourceId } });
  };

  // Captured once, not read live: finishing this exact wizard connects
  // Sentinel itself, and AnimatePresence keeps this component mounted and
  // re-rendering through its own exit fade after navigate() fires. Reading
  // isConnected() live meant that fade briefly showed "already connected,
  // route here too?" over its own success screen, a flash caused by this
  // wizard reacting to the state change it had just made itself.
  const wasAlreadyConnected = useRef(isConnected(CONNECTOR_NAME)).current;
  if (wasAlreadyConnected) {
    return <AlreadyConnectedQuickRoute onDone={finish} />;
  }

  const steps: WizardStep[] = [
    {
      id: "connect",
      label: "Connect Sentinel",
      render: () => (
        <div>
          <div className="flex gap-2 mb-4">
            {/* Labels must differ from the primary CTA below, otherwise the
                screen shows two identical "Sign in with Microsoft" buttons
                that do different things. */}
            {(
              [
                { id: "oauth", label: "Microsoft sign-in" },
                { id: "manual", label: "Workspace ID + key" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setAuthMethod(opt.id)}
                className={`flex-1 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  authMethod === opt.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {authMethod === "manual" && (
            <>
              <FieldRow
                label="Workspace ID"
                hint="Identifies which Sentinel instance to send data to."
                askCruzQuestion="Where do I find my Sentinel workspace ID?"
              >
                <Input value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
              </FieldRow>
              <FieldRow
                label="Primary or secondary key"
                hint="From the workspace's Agents configuration page in Azure. Either key works."
                askCruzQuestion="Where do I find my Sentinel workspace key?"
              >
                <Input value={workspaceKey} onChange={(e) => setWorkspaceKey(e.target.value)} type="password" placeholder="•••••••••••••••" />
              </FieldRow>
            </>
          )}
          {authMethod === "oauth" && (
            <p className="text-sm text-muted-foreground mb-4">
              Fewer clicks, no secret-pasting. Cruz will pull your workspace automatically after sign-in.
            </p>
          )}
        </div>
      ),
      primary: {
        label: authMethod === "oauth" ? "Sign in with Microsoft" : "Continue",
        disabled: authMethod === "manual" && (!workspaceId || !workspaceKey),
      },
    },
    // Manual entry never leaves Databahn, so only OAuth gets the redirect
    // beat, there's nothing to simulate leaving for otherwise.
    ...(authMethod === "oauth"
      ? [
          {
            id: "redirecting",
            label: "Redirecting to Microsoft",
            render: () => <RedirectingToProvider provider="Microsoft" />,
            primary: { label: "Continue" },
          },
        ]
      : []),
    {
      id: "test",
      label: "Test & map",
      render: () => (
        <div>
          <LiveTestState
            targetLabel="Microsoft Sentinel"
            successSampleLines={[
              "Connected to workspace \"prod-secops\"",
              "Suggested table: CommonSecurityLog (CEF-compatible)",
            ]}
            checklist={[
              "Confirm the signed-in account has Sentinel Contributor access",
              "Check the workspace hasn't been moved to a different resource group",
            ]}
            onComplete={(result) => setTestPassed(result !== "timeout")}
          />
        </div>
      ),
      primary: { label: "Continue", disabled: !testPassed },
    },
    {
      id: "success",
      label: "Destination connected",
      render: () => (
        <SuccessState
          title="Pipeline is live"
          description="No further setup needed in Sentinel. Data will start appearing automatically."
        >
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-col items-center gap-3 max-w-xs w-full">
              <Button size="lg" className="w-full" onClick={finish}>
                View this pipeline
              </Button>
              <Button size="lg" variant="outline" className="w-full" onClick={finishAndAddAnother}>
                Add another destination first
              </Button>
            </div>
            {/* Both tertiary, same weight, one row: stacking them was what
                pushed the nudge below the fold, needing a scroll to see the
                one thing this screen exists to raise. The two main buttons
                above stay full-width and stacked, that's every wizard's
                primary/secondary shape, not something to shrink here. Its
                own, wider, unconstrained row so the two phrases don't wrap
                mid-word inside the buttons' narrower column. */}
            <div className="h-10 flex items-center justify-center gap-3 whitespace-nowrap">
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 inline-flex items-center gap-1.5"
              >
                Open in Sentinel <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <ColdStorageNudge withDivider />
            </div>
          </div>
        </SuccessState>
      ),
    },
  ];

  return <OnboardingWizard connectorName={CONNECTOR_NAME} connectorKind="destination" steps={steps} />;
}
