export interface GenericWizardConfig {
  fieldLabel: string;
  fieldHint: string;
  fieldPlaceholder: string;
  testTargetLabel: string;
  successSampleLine: string;
  ruleCount: number;
}

/**
 * The reusable-pattern deliverable, made concrete: every connector not
 * fully custom-built plugs into the same `OnboardingWizard` shell through
 * one config object here. No new UI code per connector.
 */
export const EXPLICIT_WIZARD_CONFIGS: Record<string, GenericWizardConfig> = {
  "aws-cloudtrail": {
    fieldLabel: "IAM Role ARN",
    fieldHint: "The cross-account role Databahn assumes to read CloudTrail events.",
    fieldPlaceholder: "arn:aws:iam::123456789012:role/databahn-read",
    testTargetLabel: "AWS CloudTrail",
    successSampleLine: "eventName=ConsoleLogin sourceIPAddress=203.0.113.9 userIdentity=arn:aws:iam::...:user/j.rivera",
    ruleCount: 9,
  },
  okta: {
    fieldLabel: "API Token",
    fieldHint: "An Okta API token with read access to system log events.",
    fieldPlaceholder: "00a1B2c3D4...",
    testTargetLabel: "Okta System Log",
    successSampleLine: 'eventType=user.session.start actor="j.rivera@acme.com" outcome=SUCCESS',
    ruleCount: 5,
  },
  crowdstrike: {
    fieldLabel: "API Client ID & Secret",
    fieldHint: "CrowdStrike Falcon API credentials with detections read scope.",
    fieldPlaceholder: "Client ID",
    testTargetLabel: "CrowdStrike Falcon API",
    successSampleLine: "detection_id=ldt:abc123 severity=high tactic=CredentialAccess",
    ruleCount: 7,
  },
  defender: {
    fieldLabel: "API Token",
    fieldHint: "Microsoft Defender API token with alerts read scope.",
    fieldPlaceholder: "eyJ0eXAiOiJKV1Qi...",
    testTargetLabel: "Microsoft Defender API",
    successSampleLine: "alertId=da637... severity=Medium category=SuspiciousActivity",
    ruleCount: 6,
  },
  fortinet: {
    fieldLabel: "Port",
    fieldHint: "The port your FortiGate forwards syslog to.",
    fieldPlaceholder: "514",
    testTargetLabel: "ingest-usw2.databahn.ai:514/UDP",
    successSampleLine: "date=2026-08-26 devname=FGT-EDGE-01 action=deny srcip=10.20.4.9",
    ruleCount: 8,
  },
  "gcp-audit": {
    fieldLabel: "Service Account Key",
    fieldHint: "A GCP service account with logging.viewer permission.",
    fieldPlaceholder: "Paste JSON key",
    testTargetLabel: "Google Cloud Audit Logs",
    successSampleLine: "protoPayload.methodName=SetIamPolicy resourceName=projects/acme-prod",
    ruleCount: 4,
  },
  "google-secops": {
    fieldLabel: "Ingestion API Key",
    fieldHint: "Your Google SecOps ingestion API key.",
    fieldPlaceholder: "AIza...",
    testTargetLabel: "Google SecOps",
    successSampleLine: "Connected, suggested log type: CS_EDR",
    ruleCount: 0,
  },
  qradar: {
    fieldLabel: "API Token",
    fieldHint: "A QRadar API token with events write access.",
    fieldPlaceholder: "12345678-90ab-cdef...",
    testTargetLabel: "IBM QRadar",
    successSampleLine: "Connected, suggested log source: DatabahnHighway",
    ruleCount: 0,
  },
  exabeam: {
    fieldLabel: "API Key",
    fieldHint: "Your Exabeam ingestion API key.",
    fieldPlaceholder: "xbm_...",
    testTargetLabel: "Exabeam",
    successSampleLine: "Connected, suggested collector: databahn-highway",
    ruleCount: 0,
  },
  securonix: {
    fieldLabel: "API Token",
    fieldHint: "A Securonix API token with ingestion access.",
    fieldPlaceholder: "sx-token-...",
    testTargetLabel: "Securonix",
    successSampleLine: "Connected, suggested data source: DatabahnHighway",
    ruleCount: 0,
  },
  devo: {
    fieldLabel: "Relay Token",
    fieldHint: "Your Devo relay token for HTTPS ingestion.",
    fieldPlaceholder: "devo-relay-...",
    testTargetLabel: "Devo",
    successSampleLine: "Connected, events landing in my.app.databahn",
    ruleCount: 0,
  },
  snowflake: {
    fieldLabel: "Account URL",
    fieldHint: "Your Snowflake account identifier and warehouse.",
    fieldPlaceholder: "acme.snowflakecomputing.com",
    testTargetLabel: "Snowflake",
    successSampleLine: "Connected, suggested warehouse: DATABAHN_WH",
    ruleCount: 0,
  },
  sumologic: {
    fieldLabel: "HTTP Source Address",
    fieldHint: "Your Sumo Logic HTTP Source collector endpoint.",
    fieldPlaceholder: "https://endpoint.collection.sumologic.com/...",
    testTargetLabel: "Sumo Logic",
    successSampleLine: "Connected, events landing in default source category",
    ruleCount: 0,
  },
  databricks: {
    fieldLabel: "Workspace URL & Token",
    fieldHint: "Your Databricks workspace URL and a personal access token.",
    fieldPlaceholder: "https://acme.cloud.databricks.com",
    testTargetLabel: "Databricks",
    successSampleLine: "Connected, suggested table: security.raw_events",
    ruleCount: 0,
  },
};


import type { ConnectorDef } from "./connectors";

/**
 * Any connector without an explicit config gets one derived from its own
 * definition. This is what makes the catalogue genuinely scalable: adding a
 * connector never requires touching wizard code, and no entry can ever lead to
 * a dead screen because someone forgot to write a config.
 */
export function getWizardConfig(connector: ConnectorDef): GenericWizardConfig {
  const explicit = EXPLICIT_WIZARD_CONFIGS[connector.id];
  if (explicit) return explicit;

  const family = connector.category.toLowerCase();
  const isSyslog = family.includes("syslog");
  const isAgent = family.includes("agent");
  const isStorage = family.includes("storage") || family.includes("data platform") || family.includes("streaming");

  const field = isSyslog
    ? { fieldLabel: "Port", fieldHint: `The port your ${connector.name} appliance forwards syslog to.`, fieldPlaceholder: "514" }
    : isAgent
      ? { fieldLabel: "Collector group", fieldHint: `Which ${connector.name} collector group should report in.`, fieldPlaceholder: "default" }
      : isStorage
        ? { fieldLabel: "Endpoint URL", fieldHint: `Where Databahn should write your ${connector.name} data.`, fieldPlaceholder: "https://" }
        : { fieldLabel: "API token", fieldHint: `A ${connector.name} token with read access to ${connector.dataTypes[0]?.toLowerCase() ?? "events"}.`, fieldPlaceholder: "Paste your token" };

  return {
    ...field,
    testTargetLabel: connector.name,
    successSampleLine:
      connector.kind === "source"
        ? `Received ${connector.dataTypes[0] ?? "events"} from ${connector.name}`
        : `Connected, ready to deliver to ${connector.name}`,
    ruleCount: connector.kind === "source" ? 6 : 0,
  };
}
