import { useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { ExternalLink } from "lucide-react";
import { OnboardingWizard, type WizardStep } from "@/app/components/shared/OnboardingWizard";
import { FieldRow } from "@/app/components/shared/FieldRow";
import { Input } from "@/app/components/ui/input";
import { LiveTestState } from "@/app/components/shared/LiveTestState";
import { SuccessState, ErrorState } from "@/app/components/shared/StateViews";
import { Button } from "@/app/components/ui/button";
import { useSession } from "@/app/lib/SessionContext";
import { CONNECTORS } from "@/app/data/connectors";
import { getWizardConfig } from "@/app/data/wizardConfigs";
import { RulePanel } from "@/app/components/shared/RulePanel";
import { ColdStorageNudge } from "@/app/components/shared/ColdStorageNudge";

/**
 * The reusable-pattern deliverable, proven live: every connector beyond the
 * four bespoke flows runs through this one component, driven entirely by its
 * config object. Same `OnboardingWizard` shell, same `LiveTestState`, same
 * `SuccessState`, zero new UI code per connector.
 */
export default function GenericConnectorWizard({ kind }: { kind: "source" | "destination" }) {
  const [testPassed, setTestPassed] = useState(false);
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { connectEntity, addRoute, isConnected, rules, toggleRule } = useSession();
  const connector = CONNECTORS.find((c) => c.id === id);
  const pendingSourceId = (location.state as { pendingSourceId?: string } | null)?.pendingSourceId;

  const [fieldValue, setFieldValue] = useState("");
  const [showRules, setShowRules] = useState(false);
  // Captured once, before the early return below, not read live: finishing
  // this exact wizard connects the destination itself, and AnimatePresence
  // keeps this component mounted and re-rendering through its own exit
  // fade after navigate() fires. Reading isConnected() live meant that fade
  // briefly showed "already connected, route here too?" over its own
  // success screen, a flash caused by this wizard reacting to the state
  // change it had just made itself.
  const wasAlreadyConnected = useRef(connector ? isConnected(connector.name) : false).current;

  if (!connector) {
    // Defensive: a bad URL should still offer a way out, not a bare sentence.
    return (
      <div className="max-w-md mx-auto mt-16">
        <ErrorState
          title="We could not find that connector"
          description={`Nothing in the catalogue matches "${id}". It may have been renamed.`}
          onRetry={() => navigate(kind === "source" ? "/sources" : "/destinations")}
          retryLabel={`Back to ${kind}s`}
        />
      </div>
    );
  }

  const config = getWizardConfig(connector);

  // Destination completion is where a pending route actually gets recorded,
  // whichever door the user came through to get here.
  const finish = () => {
    connectEntity({ id: connector.id, name: connector.name, kind: connector.kind, connectedAt: Date.now() });
    if (kind === "destination" && pendingSourceId) addRoute(pendingSourceId, connector.id);
    navigate(kind === "source" ? "/destinations" : "/pipeline", kind === "source" ? { state: { pendingSourceId: connector.id, returnTo: "/pipeline" } } : undefined);
  };

  // Bulk onboarding, sources queued before any destination is wired, or one
  // source fanned out to more than one destination, is a real pattern for an
  // admin doing this 10+ times in a sitting, not a corner case.
  const finishAndAddAnother = () => {
    connectEntity({ id: connector.id, name: connector.name, kind: connector.kind, connectedAt: Date.now() });
    if (kind === "source") {
      navigate("/sources");
    } else {
      if (pendingSourceId) addRoute(pendingSourceId, connector.id);
      navigate("/destinations", { state: { pendingSourceId } });
    }
  };

  if (kind === "destination" && wasAlreadyConnected) {
    return (
      <div className="max-w-xl mx-auto rounded border border-border glass-card p-6 text-center">
        <p className="text-sm text-foreground font-medium">{connector.name} is already connected this session.</p>
        <p className="text-sm text-muted-foreground mt-1.5">Route this source there too? No re-authentication needed.</p>
        <Button size="lg" className="mt-5 min-w-[160px]" onClick={finish}>
          Route here too
        </Button>
      </div>
    );
  }

  const steps: WizardStep[] = [
    {
      id: "connect",
      label: `Connect ${connector.name}`,
      render: () => (
        <div>
          <FieldRow label={config.fieldLabel} hint={config.fieldHint} askCruzQuestion={`Where do I find my ${connector.name} ${config.fieldLabel.toLowerCase()}?`}>
            <Input value={fieldValue} onChange={(e) => setFieldValue(e.target.value)} placeholder={config.fieldPlaceholder} />
          </FieldRow>
        </div>
      ),
      primary: { label: "Continue", disabled: !fieldValue },
    },
    {
      id: "test",
      label: "Test & confirm",
      render: () => (
        <div>
          <LiveTestState
            targetLabel={config.testTargetLabel}
            successSampleLines={[config.successSampleLine]}
            checklist={[
              `Confirm the credential has the right scope for ${connector.name}`,
              "Check nothing is blocking outbound access to Databahn",
            ]}
            onComplete={(result) => setTestPassed(result !== "timeout")}
          />
        </div>
      ),
      primary: { label: "Continue", disabled: !testPassed },
    },
    {
      id: "success",
      label: `${connector.kind === "source" ? "Source" : "Destination"} connected`,
      render: () => (
        <SuccessState
          title={`${connector.name} is live`}
          description={
            connector.kind === "source"
              ? config.ruleCount > 0
                ? `Databahn applied ${config.ruleCount} default reduction rules to this source.`
                : "Ready to route to a destination."
              : `No further setup needed in ${connector.name}. Data will start appearing automatically.`
          }
        >
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-col items-center gap-3 max-w-xs w-full">
              <Button size="lg" className="w-full" onClick={finish}>
                {connector.kind === "source" ? "Route to a destination now" : "View this pipeline"}
              </Button>
              <Button size="lg" variant="outline" className="w-full" onClick={finishAndAddAnother}>
                {connector.kind === "source" ? "Add another source first" : "Add another destination first"}
              </Button>
            </div>
            {/* h-10 matches the buttons above, a bare text row otherwise
                reads noticeably shorter/thinner even though it's still a
                real action, not a footnote. Its own unconstrained,
                non-wrapping row for the same reason the bespoke Sentinel
                and Splunk success screens use one: two phrases plus a
                divider don't fit inside the buttons' narrower column. */}
            {connector.kind === "source" && config.ruleCount > 0 && (
              <button
                onClick={() => {
                  connectEntity({ id: connector.id, name: connector.name, kind: connector.kind, connectedAt: Date.now() });
                  setShowRules(true);
                }}
                className="h-10 flex items-center text-xs text-info underline underline-offset-2 hover:text-foreground"
              >
                See which rules were applied
              </button>
            )}
            {connector.kind === "destination" && (
              <div className="h-10 flex items-center justify-center gap-3 whitespace-nowrap">
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 inline-flex items-center gap-1.5"
                >
                  Open in {connector.name} <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <ColdStorageNudge withDivider />
              </div>
            )}
          </div>
        </SuccessState>
      ),
    },
  ];

  return (
    <>
      <OnboardingWizard connectorName={connector.name} connectorKind={connector.kind} steps={steps} />
      {showRules && (
        <RulePanel
          rules={rules.filter((r) => r.sourceIds.includes(connector.id))}
          scopeLabel={connector.name}
          sourceId={connector.id}
          onClose={() => setShowRules(false)}
          onToggle={toggleRule}
        />
      )}
    </>
  );
}
