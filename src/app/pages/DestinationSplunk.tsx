import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ExternalLink } from "lucide-react";
import { OnboardingWizard, type WizardStep } from "@/app/components/shared/OnboardingWizard";
import { FieldRow } from "@/app/components/shared/FieldRow";
import { Input } from "@/app/components/ui/input";
import { LiveTestState } from "@/app/components/shared/LiveTestState";
import { SuccessState } from "@/app/components/shared/StateViews";
import { ColdStorageNudge } from "@/app/components/shared/ColdStorageNudge";
import { Button } from "@/app/components/ui/button";
import { useSession } from "@/app/lib/SessionContext";

const CONNECTOR_NAME = "Splunk";

function AlreadyConnectedQuickRoute({ onDone }: { onDone: () => void }) {
  return (
    <div className="max-w-xl mx-auto rounded border border-border glass-card p-6 text-center">
      <p className="text-sm text-foreground font-medium">Splunk is already connected this session.</p>
      <p className="text-sm text-muted-foreground mt-1.5">Route this source there too? No re-authentication needed.</p>
      <Button size="lg" className="mt-5 min-w-[160px]" onClick={onDone}>
        Route here too
      </Button>
    </div>
  );
}

export default function DestinationSplunk() {
  const [testPassed, setTestPassed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { connectEntity, addRoute, isConnected } = useSession();
  const [hecUrl, setHecUrl] = useState("");
  const [hecToken, setHecToken] = useState("");
  const urlLooksValid = /^https?:\/\/.+/.test(hecUrl);
  const pendingSourceId = (location.state as { pendingSourceId?: string } | null)?.pendingSourceId;

  const finish = () => {
    connectEntity({ id: "splunk", name: CONNECTOR_NAME, kind: "destination", connectedAt: Date.now() });
    if (pendingSourceId) addRoute(pendingSourceId, "splunk");
    navigate("/pipeline");
  };

  const finishAndAddAnother = () => {
    connectEntity({ id: "splunk", name: CONNECTOR_NAME, kind: "destination", connectedAt: Date.now() });
    if (pendingSourceId) addRoute(pendingSourceId, "splunk");
    navigate("/destinations", { state: { pendingSourceId } });
  };

  // Captured once, not read live: finishing this exact wizard connects
  // Splunk itself, and AnimatePresence keeps this component mounted and
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
      label: "Connect Splunk",
      render: () => (
        <div>
          <FieldRow
            label="HEC URL"
            hint="Your Splunk HTTP Event Collector endpoint."
            askCruzQuestion="Where do I find my Splunk HEC URL and token?"
          >
            <Input
              value={hecUrl}
              onChange={(e) => setHecUrl(e.target.value)}
              placeholder="https://splunk.acme.com:8088"
              aria-invalid={hecUrl.length > 0 && !urlLooksValid}
            />
            {hecUrl.length > 0 && !urlLooksValid && (
              <p className="text-xs text-destructive mt-1">Should start with http:// or https://</p>
            )}
          </FieldRow>
          <FieldRow label="HEC Token">
            <Input value={hecToken} onChange={(e) => setHecToken(e.target.value)} type="password" placeholder="•••••••••••••••" />
          </FieldRow>
        </div>
      ),
      primary: { label: "Continue", disabled: !urlLooksValid || !hecToken },
    },
    {
      id: "test",
      label: "Test & map",
      render: () => (
        <div>
          <LiveTestState
            targetLabel={hecUrl || "your Splunk instance"}
            successSampleLines={["HEC endpoint reachable", "Suggested index: main"]}
            checklist={[
              "Confirm the HEC token hasn't been disabled or expired",
              "Check the index exists and the token has write access to it",
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
        <SuccessState title="Pipeline is live" description="No further setup needed in Splunk. Data will start appearing automatically.">
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
              <a href="#" onClick={(e) => e.preventDefault()} className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 inline-flex items-center gap-1.5">
                Open in Splunk <ExternalLink className="w-3.5 h-3.5" />
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
