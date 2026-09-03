import { useState } from "react";
import { useNavigate } from "react-router";
import { OnboardingWizard, type WizardStep } from "@/app/components/shared/OnboardingWizard";
import { FieldMappingEditor, type FieldMapping } from "@/app/components/shared/FieldMappingEditor";
import { LogTypeSelector } from "@/app/components/shared/LogTypeSelector";
import { ENTRA_ID_LOG_TYPES } from "@/app/data/logTypes";
import { LiveTestState } from "@/app/components/shared/LiveTestState";
import { RedirectingToProvider } from "@/app/components/shared/RedirectingToProvider";
import { SuccessState } from "@/app/components/shared/StateViews";
import { Button } from "@/app/components/ui/button";
import { useSession } from "@/app/lib/SessionContext";
import { RulePanel } from "@/app/components/shared/RulePanel";

/** Cruz's proposal from the first Graph API poll. */
const ENTRA_MAPPING: FieldMapping[] = [
  { raw: "userPrincipalName", sample: "j.rivera@acme.com", mapped: "User", confidence: "high" },
  { raw: "ipAddress", sample: "198.51.100.4", mapped: "Source IP", confidence: "high" },
  { raw: "status.errorCode", sample: "50126", mapped: "Action", confidence: "medium" },
  { raw: "appDisplayName", sample: "Microsoft 365", mapped: "Application", confidence: "high" },
  { raw: "correlationId", sample: "8f2c-41ab", mapped: "Do not collect", confidence: "low" },
];

const SCOPES = [
  { raw: "AuditLog.Read.All", plain: "Read sign-in and audit logs" },
  { raw: "Directory.Read.All", plain: "Read basic directory info (users, groups)" },
];

export default function SourceEntraId() {
  const navigate = useNavigate();
  const { connectEntity, rules, toggleRule } = useSession();
  const [testPassed, setTestPassed] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const steps: WizardStep[] = [
    {
      id: "auth",
      label: "Authenticate to Entra ID",
      render: () => (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Sign in with an admin account to grant Databahn read access, replacing the need to manually find your tenant ID.
          </p>
        </div>
      ),
      primary: { label: "Sign in with Microsoft" },
      secondary: { label: "Use a manual app registration instead", onClick: () => {} },
    },
    {
      id: "redirecting",
      label: "Redirecting to Microsoft",
      render: () => <RedirectingToProvider provider="Microsoft" />,
      primary: { label: "Continue" },
    },
    {
      id: "scopes",
      label: "Review access",
      render: () => (
        <div>
          {/* This step represents Microsoft's own consent screen, reached
              after the redirect, not something Databahn is asking for
              itself, so the copy and the button below are Microsoft's
              wording, not ours. */}
          <p className="text-sm text-muted-foreground mb-3">
            Microsoft is asking you to approve the following for Databahn, in plain language:
          </p>
          <div className="rounded-lg border border-border overflow-hidden mb-4">
            {SCOPES.map((s, i) => (
              <div key={s.raw} className={`px-3 py-2.5 text-sm ${i % 2 ? "bg-background/40" : ""}`}>
                <p className="text-foreground">{s.plain}</p>
                <code className="font-mono-db text-xs text-muted-foreground">{s.raw}</code>
              </div>
            ))}
          </div>
        </div>
      ),
      primary: { label: "Accept" },
    },
    {
      id: "log-types",
      label: "Choose log types",
      render: () => (
        <div className="h-full">
          <LogTypeSelector types={ENTRA_ID_LOG_TYPES} totalVolumeGb={140} />
        </div>
      ),
      primary: { label: "Continue" },
    },
    {
      id: "live-test",
      label: "Checking connectivity",
      render: () => (
        <div>
          <LiveTestState
            targetLabel="Microsoft Graph API"
            successSampleLines={[
              'signInActivity: user="j.rivera@acme.com" status=success ip=198.51.100.4',
            ]}
            checklist={[
              "Confirm admin consent was granted for the requested scopes",
              "Check the account isn't restricted by Conditional Access",
            ]}
            onComplete={(result) => setTestPassed(result !== "timeout")}
          />
        </div>
      ),
      primary: { label: "Continue", disabled: !testPassed },
    },
    {
      id: "mapping",
      label: "Confirm field mapping",
      render: () => (
        <div>
          <FieldMappingEditor initial={ENTRA_MAPPING} />
        </div>
      ),
      primary: { label: "Continue" },
    },
    {
      id: "success",
      label: "Source connected",
      render: () => (
        <SuccessState title="Entra ID is live" description="Databahn applied 6 default reduction rules to this source.">
          <div className="flex flex-col items-center gap-3 max-w-xs mx-auto">
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                connectEntity({ id: "entraid", name: "Entra ID", kind: "source", connectedAt: Date.now() });
                navigate("/destinations", { state: { pendingSourceId: "entraid" } });
              }}
            >
              Route to a destination now
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full"
              onClick={() => {
                connectEntity({ id: "entraid", name: "Entra ID", kind: "source", connectedAt: Date.now() });
                navigate("/sources");
              }}
            >
              Add another source first
            </Button>
            <button
              onClick={() => {
                connectEntity({ id: "entraid", name: "Entra ID", kind: "source", connectedAt: Date.now() });
                setShowRules(true);
              }}
              className="text-xs text-info underline underline-offset-2 hover:text-foreground mt-1"
            >
              See which rules were applied
            </button>
          </div>
        </SuccessState>
      ),
    },
  ];

  return (
    <>
      <OnboardingWizard connectorName="Entra ID" connectorKind="source" steps={steps} />
      {showRules && (
        <RulePanel
          rules={rules.filter((r) => r.sourceIds.includes("entraid"))}
          scopeLabel="Entra ID"
          sourceId="entraid"
          onClose={() => setShowRules(false)}
          onToggle={toggleRule}
        />
      )}
    </>
  );
}
