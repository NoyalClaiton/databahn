import { useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { Copy, Check, ServerCog, ListChecks, GitCommitVertical, ShieldCheck, Activity } from "lucide-react";
import { DeploymentSequence, type DeploymentStep } from "@/app/components/shared/DeploymentSequence";
import { LogTypeSelector } from "@/app/components/shared/LogTypeSelector";
import { FieldMappingEditor, type FieldMapping } from "@/app/components/shared/FieldMappingEditor";
import { PALO_ALTO_LOG_TYPES } from "@/app/data/logTypes";
import { OnboardingWizard, type WizardStep } from "@/app/components/shared/OnboardingWizard";
import { FieldRow } from "@/app/components/shared/FieldRow";
import { Input } from "@/app/components/ui/input";
import { Checkbox } from "@/app/components/ui/checkbox";
import { SegmentedToggle } from "@/app/components/shared/SegmentedToggle";
import { LiveTestState } from "@/app/components/shared/LiveTestState";
import { SuccessState } from "@/app/components/shared/StateViews";
import { Button } from "@/app/components/ui/button";
import { useSession } from "@/app/lib/SessionContext";
import { ruleTotals } from "@/app/data/rules";
import { RulePanel } from "@/app/components/shared/RulePanel";

const INGEST_ADDRESS = "ingest-usw2.databahn.ai";

/** What Cruz proposes from the captured sample. Confidence drives which rows
 * get flagged for a second look. */
const PA_MAPPING: FieldMapping[] = [
  { raw: "src", sample: "10.20.4.18", mapped: "Source IP", confidence: "high" },
  { raw: "dst", sample: "198.51.100.9", mapped: "Destination IP", confidence: "high" },
  { raw: "action", sample: "alert", mapped: "Action", confidence: "high" },
  { raw: "rule", sample: "Block-Known-Malware", mapped: "Rule name", confidence: "high" },
  { raw: "app", sample: "web-browsing", mapped: "Application", confidence: "medium" },
  { raw: "srcuser", sample: "acme\\j.rivera", mapped: "User", confidence: "medium" },
  { raw: "sessionid", sample: "0x4f21", mapped: "Do not collect", confidence: "low" },
];

/**
 * A live demo can't sit through a genuine PAN-OS commit, but the numbers on
 * screen stay the real ones, `demoSpeed` only divides wall-clock time and the
 * sequence keeps a persistent label saying so.
 */
const DEMO_SPEED = 25;

/** The five operations a PAN-OS syslog onboarding actually performs, in order,
 * with the durations they genuinely take. The commit dominates: PAN-OS
 * revalidates the whole candidate config and pushes it to the dataplane, which
 * is why "just add a syslog server" is a multi-minute change window in practice. */
function panOsDeploymentSteps(port: string, protocol: string): DeploymentStep[] {
  return [
    {
      id: "server-profile",
      icon: ServerCog,
      title: "Syslog server profile created",
      runningLabel: "Device > Server Profiles > Syslog",
      doneLabel: `databahn-syslog, ${INGEST_ADDRESS}:${port} ${protocol}, IETF format, facility LOG_USER`,
      realMs: 2000,
      expected: "typically 1-3s",
    },
    {
      id: "log-forwarding",
      icon: ListChecks,
      title: "Log forwarding profile attached to 4 rule(s)",
      runningLabel: "Match lists: Traffic, Threat, URL Filtering, WildFire",
      doneLabel: "Objects > Log Forwarding, referenced by 4 security policy rules",
      realMs: 3000,
      expected: "typically 2-5s",
    },
    {
      id: "commit",
      icon: GitCommitVertical,
      title: "Committing configuration in PAN-OS",
      runningLabel: "Validating candidate config, then pushing to the dataplane",
      doneLabel: "Commit 47281 succeeded, no validation warnings",
      realMs: 90000,
      expected: "typically 60-180s",
    },
    {
      id: "listener",
      icon: ShieldCheck,
      title: "Listener provisioned, source IP allowlisted",
      runningLabel: `Opening ${protocol} ${port}, allowlisting 203.0.113.4`,
      doneLabel: "Listener up, firewall egress IP 203.0.113.4 allowlisted",
      realMs: 4000,
      expected: "typically 3-8s",
    },
    {
      id: "first-events",
      icon: Activity,
      title: "First events received",
      runningLabel: "Waiting for the first datagrams after commit",
      doneLabel: "PAN-OS format auto-detected from the first 3 samples",
      realMs: 5000,
      expected: "typically 5-30s after commit",
    },
  ];
}

function CopyableAddress() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2">
      <code className="font-mono-db text-sm text-foreground flex-1">{INGEST_ADDRESS}</code>
      <AnimatePresence>
        {copied && (
          <motion.span
            initial={{ opacity: 0, x: 4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs text-success"
          >
            Copied
          </motion.span>
        )}
      </AnimatePresence>
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={() => {
          navigator.clipboard?.writeText(INGEST_ADDRESS);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label="Copy address"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded p-1"
      >
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.span key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} className="block">
              <Check className="w-4 h-4 text-success" />
            </motion.span>
          ) : (
            <motion.span key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} className="block">
              <Copy className="w-4 h-4" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}

export default function SourcePaloAlto() {
  const navigate = useNavigate();
  const { connectEntity, rules, toggleRule } = useSession();
  const [port, setPort] = useState("514");
  const [protocol, setProtocol] = useState<"UDP" | "TCP">("UDP");
  const [testPassed, setTestPassed] = useState(false);
  const [deployed, setDeployed] = useState(false);
  // Opened in place from the success screen, not navigated to, so choosing
  // to add another source afterward doesn't mean backtracking through pages.
  const [showRules, setShowRules] = useState(false);

  const steps: WizardStep[] = [
    {
      id: "listener",
      label: "Listener setup",
      render: () => (
        <div>
          <FieldRow label="Point Palo Alto here" hint="This is Databahn's ingest address for your account. Copy it into your syslog forwarding config.">
            <CopyableAddress />
          </FieldRow>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Port" htmlFor="port">
              <Input id="port" value={port} onChange={(e) => setPort(e.target.value)} />
            </FieldRow>
            <FieldRow
              label="Protocol"
              askCruzQuestion="Why UDP 514 for Palo Alto?"
            >
              <SegmentedToggle
                layoutId="protocol-pill"
                value={protocol}
                onChange={setProtocol}
                options={[
                  { value: "UDP", label: "UDP" },
                  { value: "TCP", label: "TCP" },
                ]}
              />
            </FieldRow>
          </div>
          <p className="text-xs text-muted-foreground -mt-2 mb-4">
            Most Palo Alto syslog forwarding uses UDP 514. Change only if yours differs.
          </p>
        </div>
      ),
      primary: { label: "Continue" },
    },
    {
      id: "log-types",
      label: "Choose log types",
      render: () => (
        <div className="h-full">
          <LogTypeSelector types={PALO_ALTO_LOG_TYPES} totalVolumeGb={820} />
        </div>
      ),
      primary: { label: "Continue" },
    },
    {
      id: "deploy",
      label: "Deploying to PAN-OS",
      render: () => (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Databahn is writing the server profile and log forwarding profile into your firewall, then committing.
            The commit is the slow part, PAN-OS revalidates the full candidate config before it pushes.
          </p>
          <DeploymentSequence
            steps={panOsDeploymentSteps(port, protocol)}
            demoSpeed={DEMO_SPEED}
            headerLabel="deploying to fw-edge-01"
            onComplete={() => setDeployed(true)}
          />
        </div>
      ),
      primary: { label: "Continue", disabled: !deployed },
    },
    {
      id: "live-test",
      label: "Waiting for logs",
      render: () => (
        <div>
          {/* The commit already landed one step back, so this is no longer "paste
              this config in", it's confirming the firewall keeps sending. */}
          <LiveTestState
            targetLabel={`${INGEST_ADDRESS}:${port}/${protocol}`}
            mode="listen"
            partialSignalMessage="Traffic and Threat logs are arriving. URL Filtering hasn't sent yet, that log type only fires on a match."
            successSampleLines={[
              "<14>1 2026-08-26T21:04:12Z fw-edge-01 PAN-OS - THREAT 0",
              'src=10.20.4.18 dst=198.51.100.9 action=alert rule="Block-Known-Malware"',
            ]}
            checklist={[
              "Confirm the commit finished, a queued commit holds the new config back",
              "Check the log forwarding profile is attached to rules that are actually matching traffic",
              "Confirm the firewall allows outbound syslog on this port to the ingest address",
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
          <FieldMappingEditor initial={PA_MAPPING} />
        </div>
      ),
      primary: { label: "Continue" },
    },
    {
      id: "success",
      label: "Source connected",
      render: () => (
        <SuccessState
          title="Palo Alto is live"
          description={`Databahn applied ${ruleTotals(["paloalto"]).active} of ${ruleTotals(["paloalto"]).applicable} applicable reduction rules to this source.`}
        >
          <div className="flex flex-col items-center gap-3 max-w-xs mx-auto">
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                connectEntity({ id: "paloalto", name: "Palo Alto", kind: "source", connectedAt: Date.now() });
                navigate("/destinations", { state: { pendingSourceId: "paloalto" } });
              }}
            >
              Route to a destination now
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full"
              onClick={() => {
                connectEntity({ id: "paloalto", name: "Palo Alto", kind: "source", connectedAt: Date.now() });
                navigate("/sources");
              }}
            >
              Add another source first
            </Button>
            <button
              onClick={() => {
                connectEntity({ id: "paloalto", name: "Palo Alto", kind: "source", connectedAt: Date.now() });
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
      <OnboardingWizard connectorName="Palo Alto" connectorKind="source" steps={steps} />
      {showRules && (
        <RulePanel
          rules={rules.filter((r) => r.sourceIds.includes("paloalto"))}
          scopeLabel="Palo Alto"
          sourceId="paloalto"
          onClose={() => setShowRules(false)}
          onToggle={toggleRule}
        />
      )}
    </>
  );
}
