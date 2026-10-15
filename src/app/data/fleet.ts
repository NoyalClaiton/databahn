/**
 * Sample environment: what a mid-size Databahn customer looks like in steady
 * state, ~170 sources across ~30 connector types and three destinations, not
 * the one or two a fresh walkthrough connects. Health, source-level metrics
 * and the dashboard only show their real shape at this scale.
 *
 * Everything here is simulated and labeled as such in the product. The
 * scripted problems cover the failure kinds Databahn says its customers
 * actually hit:
 *   - sources: API failures (auth, throttling), a syslog listener down
 *     (Databahn's side), a source no longer forwarding (the customer's side)
 *   - processing: parse failures, a backlog delaying delivery
 *   - destinations, which reject data "very often": a data-type mismatch,
 *     throttling, authentication failing after a credential rotation
 *
 * Every problem is presented as triage, not a verdict: what Databahn
 * observed, the likely causes ranked with their evidence (including what's
 * been ruled out), and what to check.
 */

export type HealthState = "stopped" | "degraded" | "recovering" | "healthy" | "learning" | "paused";
export type Severity = "critical" | "high" | "medium" | "low";
export type SourceGroup = "Network security" | "Identity" | "Endpoint" | "Cloud" | "Email" | "SaaS" | "Vulnerability";
export type CollectionMethod = "syslog" | "api" | "agent";

/**
 * Where a problem hits the pipeline. Severity follows from this, not from
 * which source it is: Databahn doesn't rank sources, it ranks alerts, and
 * anything that stops data coming in or going out is critical, processing
 * that holds up delivery is high.
 */
export type ImpactArea = "ingest" | "delivery" | "processing" | "risk" | "info";

export const SEVERITY_FOR_AREA: Record<ImpactArea, Severity> = {
  ingest: "critical",
  delivery: "critical",
  processing: "high",
  risk: "medium",
  info: "low",
};

export interface HealthCheck {
  status: "passed" | "warning" | "failed";
  detail: string;
}

export interface LikelyCause {
  cause: string;
  likelihood: "Most likely" | "Possible" | "Unlikely" | "Ruled out";
  evidence: string;
}

export interface Incident {
  area: ImpactArea;
  /** What Databahn observed, stated as an observation, not a conclusion. */
  observed: string;
  timeline: { minutesAgo: number; text: string }[];
  healthCheck: HealthCheck;
  /** Initial triage: ranked, each with the evidence behind it. */
  causes: LikelyCause[];
  /** Recommendations on what to check to find the source of the issue. */
  checks: string[];
  /** Only where Databahn can act on its own side (its listener, its parser,
   * its request rate, its stored credential). Anything on the customer's
   * device stays a check, never a button that reaches into their config. */
  action?: { label: string; detail: string; kind: "databahn" | "reauth" };
  /** Shown arriving once the problem is resolved. */
  sampleLines: string[];
  impact: string;
  detections?: string[];
  backfill: { available: boolean; text: string };
  /** One root cause behind several sources (a shared listener). */
  groupId?: string;
  groupTitle?: string;
  /** Received volume relative to normal (0.38 = throttled, 1.7 = a spike). */
  receivedFactor?: number;
  /** Share of received events that make it through processing right now. */
  processedFraction?: number;
  parseErrorPct?: number;
  backlogMin?: number;
  /** Destinations: share of delivered events refused. */
  rejectedPct?: number;
}

interface Recovered {
  downMin: number;
  cause: string;
}

export interface FleetSource {
  id: string;
  connectorId: string;
  /** Instance label, e.g. the site or account, shown after the vendor. */
  label: string;
  group: SourceGroup;
  collection: CollectionMethod;
  /** Syslog listener or agent collector this source arrives through. */
  collector?: string;
  owner: string;
  /** Normal daily volume, the baseline health is measured against. */
  gbPerDay: number;
  destIds: string[];
  /** Typical gap between events. Quiet sources (a weekly scanner, an HR app)
   * legitimately go silent for hours; a fixed "no data in 15 minutes" rule
   * would page someone about them every day. */
  cadenceMin: number;
  firstEventDaysAgo: number;
  state: HealthState;
  /** Minutes in the current state. */
  sinceMin?: number;
  incident?: Incident;
  pause?: { reason: string; by: string; untilMin: number; indefinite?: boolean };
  learning?: { connectedDaysAgo: number; daysLeft: number };
  recovered?: Recovered;
  /** Something that will break if nobody acts, raised before it does. */
  risk?: { text: string; inDays: number; actionLabel: string; detail: string };
  /** Informational, nothing is affected yet. */
  notice?: { title: string; detail: string };
  incidents30d: number;
  /** Already being handled by a teammate in the sample, so the "someone
   * else is on it" case is visible without setting it up. */
  seedOwner?: { personId: string; minutesAgo: number; via: "app" | "slack" | "teams" };
}

export interface FleetDestination {
  id: string;
  state: HealthState;
  sinceMin?: number;
  incident?: Incident;
  recovered?: Recovered;
  incidents30d: number;
  /** Already being handled by a teammate in the sample, so the "someone
   * else is on it" case is visible without setting it up. */
  seedOwner?: { personId: string; minutesAgo: number; via: "app" | "slack" | "teams" };
}

const GROUP: Record<string, SourceGroup> = {
  paloalto: "Network security", fortinet: "Network security", checkpoint: "Network security", ciscoasa: "Network security",
  zscaler: "Network security", umbrella: "Network security", cloudflare: "Network security", zeek: "Network security",
  crowdstrike: "Endpoint", defender: "Endpoint", sentinelone: "Endpoint", "windows-events": "Endpoint", "linux-auditd": "Endpoint",
  entraid: "Identity", okta: "Identity", duo: "Identity", cyberark: "Identity",
  "aws-cloudtrail": "Cloud", "gcp-audit": "Cloud", kubernetes: "Cloud",
  proofpoint: "Email", mimecast: "Email",
  github: "SaaS", salesforce: "SaaS", box: "SaaS", workday: "SaaS",
  tenable: "Vulnerability", qualys: "Vulnerability",
};

const COLLECTION: Record<string, CollectionMethod> = {
  paloalto: "syslog", fortinet: "syslog", checkpoint: "syslog", ciscoasa: "syslog", zeek: "agent",
  "windows-events": "agent", "linux-auditd": "agent",
};

const COLLECTOR: Record<string, string> = {
  paloalto: "dc-syslog-01",
  fortinet: "edge-branch-01",
  checkpoint: "dmz-syslog-01",
  ciscoasa: "dc-syslog-02",
  zeek: "agent-fleet",
  "windows-events": "agent-fleet",
  "linux-auditd": "agent-fleet",
};

const OWNER: Record<SourceGroup, string> = {
  "Network security": "Network team",
  Endpoint: "Endpoint team",
  Identity: "IAM team",
  Cloud: "Cloud platform team",
  Email: "Messaging team",
  SaaS: "IT applications",
  Vulnerability: "Vulnerability management",
};

const CADENCE: Record<string, number> = { workday: 45, box: 20, salesforce: 10, github: 8, tenable: 720, qualys: 360, cyberark: 15 };

/** connectorId, instance labels, typical GB/day per instance. */
const TEMPLATES: Array<[string, string[], number]> = [
  ["paloalto", ["DC East", "DC West", "HQ Core", "London", "Frankfurt", "Singapore", "Tokyo", "São Paulo", "Branch-01", "Branch-02", "Branch-03", "Branch-04"], 260],
  ["fortinet", Array.from({ length: 20 }, (_, i) => `Branch-${101 + i}`), 55],
  ["checkpoint", ["DMZ-1", "DMZ-2", "Partner edge", "Lab"], 90],
  ["ciscoasa", ["Branch VPN", "Remote access EU", "Remote access US", "Remote access APAC", "Datacenter edge", "Lab"], 40],
  ["zscaler", ["ZIA global", "ZIA China"], 180],
  ["umbrella", ["Global"], 120],
  ["cloudflare", ["acme.com", "api.acme.com", "status.acme.com"], 45],
  ["zeek", ["Sensor DC East", "Sensor DC West", "Sensor HQ", "Sensor London", "Sensor Singapore", "Sensor lab"], 70],
  ["crowdstrike", ["US-1", "EU-1", "APAC-1"], 140],
  ["defender", ["Corp", "Servers"], 120],
  ["sentinelone", ["Northwind"], 60],
  ["windows-events", [
    "Domain controllers", "Exchange", "File servers", "SQL servers", "Citrix", "Jump hosts", "Print servers",
    "Workstations EU", "Workstations US", "Workstations APAC", "Dev VMs", "ADFS", "Certificate services", "SCCM",
    "Hyper-V hosts", "RDS farm", "SharePoint", "Finance desktops", "HR desktops", "Kiosks", "Lab",
    "Build agents", "VDI pool A", "VDI pool B", "Backup servers", "DNS servers", "DHCP servers", "WSUS",
    "Branch servers", "Executive laptops",
  ], 30],
  ["linux-auditd", [
    "Web tier", "API tier", "Payments", "Data warehouse", "Build farm", "Bastion hosts", "Mail relays", "Proxy",
    "Kafka brokers", "Elastic nodes", "Postgres primary", "Postgres replicas", "Redis", "Monitoring", "CI runners",
    "Staging web", "Staging API", "Batch workers", "ML training", "Edge caches", "SFTP", "LDAP", "NTP", "Jump hosts",
  ], 18],
  ["entraid", ["Corp tenant", "Northwind tenant"], 140],
  ["okta", ["Workforce"], 95],
  ["duo", ["Global"], 12],
  ["cyberark", ["Vault prod", "Vault DR"], 8],
  ["aws-cloudtrail", [
    "prod-payments", "prod-web", "prod-data", "prod-ml", "prod-shared", "security", "logging", "network",
    "staging", "dev", "sandbox", "identity", "backup", "audit", "analytics", "partner-api", "eu-prod", "apac-prod",
  ], 22],
  ["gcp-audit", ["analytics-prod", "analytics-dev", "ml-platform", "bigquery-shared", "web-prod", "web-dev", "data-lake", "security"], 20],
  ["kubernetes", ["prod-us", "prod-eu", "prod-apac", "staging-us", "staging-eu", "dev", "ml", "ci", "edge", "tools"], 35],
  ["proofpoint", ["Inbound", "Outbound"], 30],
  ["mimecast", ["EU"], 20],
  ["github", ["acme", "acme-labs"], 3],
  ["salesforce", ["Prod"], 6],
  ["box", ["Corp"], 4],
  ["workday", ["Prod"], 2],
  ["tenable", ["Internal", "External"], 15],
  ["qualys", ["Cloud agents"], 10],
];

/** Firewalls feed both SIEMs (the NOC lives in Splunk, the SOC in Sentinel);
 * cloud and SaaS audit trails are also archived to Snowflake. */
function destinationsFor(connectorId: string, group: SourceGroup): string[] {
  if (["paloalto", "fortinet", "ciscoasa", "zeek"].includes(connectorId)) return ["sentinel", "splunk"];
  if (connectorId === "linux-auditd" || connectorId === "kubernetes") return ["splunk", "snowflake"];
  if (group === "Vulnerability") return ["splunk"];
  if (group === "Cloud" || group === "SaaS") return ["sentinel", "snowflake"];
  return ["sentinel"];
}

/** Deterministic pseudo-random, so the sample environment is identical on
 * every load and every machine, a demo that reshuffles itself is not one
 * anyone can rehearse. */
export function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const FORTI_SAMPLE = [
  "type=traffic subtype=forward srcip=10.114.2.20 dstip=8.8.8.8 action=accept",
  "type=utm subtype=webfilter srcip=10.115.2.31 action=blocked",
  "type=traffic subtype=forward srcip=10.114.4.12 dstip=10.40.0.5 action=accept",
];

/** Both branches share this listener, so they share one incident. */
const LISTENER_INCIDENT: Incident = {
  area: "ingest",
  groupId: "listener:edge-branch-02",
  groupTitle: "Syslog listener edge-branch-02 stopped accepting data",
  observed: "No events received",
  timeline: [
    { minutesAgo: 343, text: "Listener edge-branch-02 stopped responding to health checks" },
    { minutesAgo: 342, text: "Last event from Fortinet · Branch-114 and Fortinet · Branch-115" },
    { minutesAgo: 327, text: "Alert sent to #secops-pipeline and the Network team" },
  ],
  healthCheck: { status: "failed", detail: "Listener edge-branch-02 not accepting connections on UDP 514" },
  causes: [
    {
      cause: "Databahn's syslog listener edge-branch-02 is down",
      likelihood: "Most likely",
      evidence: "Both sources on this listener stopped within the same minute, and its health check has failed since then.",
    },
    {
      cause: "The FortiGates stopped forwarding",
      likelihood: "Unlikely",
      evidence: "Two devices at two branches failing in the same minute points to what they share, the listener, not the devices.",
    },
  ],
  checks: [
    "Nothing to change on the FortiGates. Restart the listener first",
    "If it fails again, check the collector host edge-branch-02 for disk or memory pressure",
  ],
  action: {
    kind: "databahn",
    label: "Restart listener edge-branch-02",
    detail: "Databahn restarts its own listener. Both Branch-114 and Branch-115 resume once it accepts connections. Nothing changes on your devices.",
  },
  sampleLines: FORTI_SAMPLE,
  impact: "Firewall traffic from Branch-114 and Branch-115 isn't reaching detections.",
  detections: ["Internal port scan", "Known-malware traffic blocked"],
  backfill: { available: false, text: "Syslog has no replay. Events sent while the listener was down can't be recovered." },
};

const SCRIPT: Record<string, Partial<FleetSource>> = {
  "paloalto-dc-east": {
    state: "stopped",
    sinceMin: 134,
    incidents30d: 1,
    incident: {
      area: "ingest",
      observed: "No events received",
      timeline: [
        { minutesAgo: 134, text: "Last event received" },
        { minutesAgo: 119, text: "No events for 15 minutes, outside this source's normal pattern" },
        { minutesAgo: 119, text: "Alert sent to #secops-pipeline and the Network team" },
        { minutesAgo: 118, text: "Health check: listener dc-syslog-01 healthy, nothing arriving from 10.20.0.1" },
      ],
      healthCheck: { status: "warning", detail: "Listener dc-syslog-01 healthy, nothing arriving from this firewall (10.20.0.1)" },
      causes: [
        {
          cause: "The firewall stopped forwarding logs",
          likelihood: "Most likely",
          evidence: "The stream ended mid-flow with no shutdown message, which is typical of a log forwarding profile being detached or the syslog server profile changing in a commit.",
        },
        {
          cause: "The network path to the listener is blocked",
          likelihood: "Possible",
          evidence: "An ACL or routing change between DC East and dc-syslog-01 would look the same from Databahn's side.",
        },
        {
          cause: "Databahn's syslog listener",
          likelihood: "Ruled out",
          evidence: "The 11 other Palo Alto firewalls on dc-syslog-01 are arriving normally.",
        },
      ],
      checks: [
        "In PAN-OS, check Monitor > Logs > Configuration for a commit at about the time it stopped",
        "Confirm the log forwarding profile is still attached to your security rules",
        "Check Device > Server Profiles > Syslog still points at dc-syslog-01, UDP 514",
        "Check for ACL or routing changes between DC East and the listener",
      ],
      sampleLines: [
        "TRAFFIC  10.20.4.18 → 172.217.3.110  allow  web-browsing",
        "THREAT   10.20.9.44 → 198.51.100.9   alert  Block-Known-Malware",
        "TRAFFIC  10.20.6.12 → 10.40.0.5      allow  ms-ds-smb",
      ],
      impact: "Threat and traffic detections in Sentinel and Splunk have no data from the DC East firewall.",
      detections: ["Outbound C2 beaconing", "Internal port scan", "Known-malware traffic blocked"],
      backfill: { available: false, text: "Syslog has no replay. Events from this window were never sent, so they can't be recovered." },
    },
  },
  "fortinet-branch-114": { state: "stopped", sinceMin: 342, incidents30d: 1, collector: "edge-branch-02", incident: LISTENER_INCIDENT },
  "fortinet-branch-115": { state: "stopped", sinceMin: 342, incidents30d: 1, collector: "edge-branch-02", incident: LISTENER_INCIDENT },
  "okta-workforce": {
    state: "stopped",
    sinceMin: 41,
    incidents30d: 0,
    seedOwner: { personId: "lnguyen", minutesAgo: 22, via: "slack" },
    incident: {
      area: "ingest",
      observed: "No events received",
      timeline: [
        { minutesAgo: 41, text: "Okta System Log API returned 401 Unauthorized" },
        { minutesAgo: 41, text: "Last event received" },
        { minutesAgo: 36, text: "Alert sent to #secops-pipeline and the IAM team" },
      ],
      healthCheck: { status: "failed", detail: "API returned 401 Unauthorized" },
      causes: [
        {
          cause: "The API token was revoked or rotated in Okta",
          likelihood: "Most likely",
          evidence: "Okta started returning 401 on the very next poll after the last successful one.",
        },
        {
          cause: "The token owner's admin role changed",
          likelihood: "Possible",
          evidence: "A token stops working if the admin who created it loses the Read-only Admin role.",
        },
        { cause: "An Okta outage", likelihood: "Ruled out", evidence: "Okta's API responds normally to unauthenticated requests." },
      ],
      checks: [
        "In Okta Admin > Security > API > Tokens, check the Databahn token is still listed",
        "Check the token's owner still has the Read-only Admin role",
      ],
      action: { kind: "reauth", label: "Reconnect Okta", detail: "Sign in to Okta again to issue Databahn a new token." },
      sampleLines: [
        "user.session.start       j.rivera@acme.com  SUCCESS",
        "user.authentication.auth_via_mfa  a.patel@acme.com  SUCCESS",
        "policy.evaluate_sign_on  m.chen@acme.com  ALLOW",
      ],
      impact: "Identity detections have no Okta sign-in data.",
      detections: ["Impossible travel", "MFA fatigue", "Password spray"],
      backfill: {
        available: true,
        text: "Okta keeps 90 days of System Log. After reconnecting, Databahn resumes from its last checkpoint and fetches the missed events automatically.",
      },
    },
  },
  "crowdstrike-us-1": {
    state: "degraded",
    sinceMin: 86,
    incidents30d: 1,
    seedOwner: { personId: "dokafor", minutesAgo: 64, via: "app" },
    incident: {
      area: "ingest",
      receivedFactor: 0.38,
      observed: "Receiving 38% of normal volume",
      timeline: [
        { minutesAgo: 86, text: "Event Streams API began returning 429 Too Many Requests" },
        { minutesAgo: 81, text: "Volume fell to 38% of normal" },
        { minutesAgo: 71, text: "Alert sent to #secops-pipeline and the Endpoint team" },
      ],
      healthCheck: { status: "warning", detail: "API reachable, responding 429 Too Many Requests" },
      causes: [
        { cause: "The API rate limit was reached", likelihood: "Most likely", evidence: "429 responses started at the same moment volume dropped." },
        {
          cause: "Another integration is sharing the same API client",
          likelihood: "Possible",
          evidence: "CrowdStrike's limits apply per API client. A second tool using it would use up the budget.",
        },
      ],
      checks: [
        "In Falcon > Support > API clients, check whether other tools use the same client ID",
        "Check whether a new integration was added around the time volume dropped",
      ],
      action: {
        kind: "databahn",
        label: "Switch to adaptive back-off",
        detail: "Databahn spaces out its own requests to stay under the limit. Events wait in CrowdStrike's queue meanwhile, nothing is lost.",
      },
      sampleLines: [
        "ProcessRollup2  host=nyc-lt-0412  cmd=powershell.exe -enc …",
        "DnsRequest      host=nyc-lt-0388  domain=updates.example.net",
        "NetworkConnectIP4  host=nyc-srv-12  remote=10.40.0.5:445",
      ],
      impact: "Endpoint detections for US-1 are running on partial data.",
      detections: ["Suspicious PowerShell", "Credential dumping", "Lateral movement over SMB"],
      backfill: { available: true, text: "CrowdStrike queues events for 7 days. Databahn catches up automatically once throughput recovers." },
    },
  },
  "windows-events-domain-controllers": {
    state: "degraded",
    sinceMin: 201,
    incidents30d: 0,
    incident: {
      area: "processing",
      parseErrorPct: 18.2,
      processedFraction: 0.818,
      observed: "18% of events failing to parse",
      timeline: [
        { minutesAgo: 201, text: "New field layout in Sysmon Event ID 1 (process create)" },
        { minutesAgo: 200, text: "Parse failures rose from 0.1% to 18%" },
        { minutesAgo: 185, text: "Alert sent to #secops-pipeline and the Endpoint team" },
      ],
      healthCheck: { status: "passed", detail: "Agents reporting, heartbeat OK" },
      causes: [
        {
          cause: "A Sysmon configuration change added new fields",
          likelihood: "Most likely",
          evidence: "Every failure is Sysmon Event ID 1, all starting at the same time, each with the same 3 fields the parser doesn't recognise.",
        },
        { cause: "An agent version update", likelihood: "Possible", evidence: "An agent upgrade can change the event layout in the same way." },
        { cause: "Collection", likelihood: "Ruled out", evidence: "Agents are reporting and received volume is normal." },
      ],
      checks: [
        "Check whether the Sysmon configuration on the domain controllers changed this morning",
        "Review the 3 unrecognised fields in Databahn's proposed parser update",
      ],
      action: {
        kind: "databahn",
        label: "Apply parser update",
        detail: "Databahn adds the 3 new fields to its own parser. Tested against 500 failed samples, all of which now parse.",
      },
      sampleLines: [
        "4624  An account was successfully logged on  DC01  ACME\\svc-backup",
        "1     Process Create  DC02  C:\\Windows\\System32\\lsass.exe",
        "4769  Kerberos service ticket requested  DC01  ACME\\j.rivera",
      ],
      impact: "Process-creation events from domain controllers are partly missing from detections.",
      detections: ["Credential dumping", "Kerberoasting"],
      backfill: { available: true, text: "Failed events are kept raw in the dead-letter queue. They're re-parsed and delivered once the parser is updated." },
    },
  },
  "zscaler-zia-global": {
    state: "degraded",
    sinceMin: 38,
    incidents30d: 0,
    incident: {
      area: "processing",
      receivedFactor: 1.7,
      processedFraction: 0.62,
      backlogMin: 14,
      observed: "Delivery running 14 minutes behind",
      timeline: [
        { minutesAgo: 38, text: "Received volume rose 70% above normal" },
        { minutesAgo: 30, text: "Processing fell behind, backlog growing" },
        { minutesAgo: 23, text: "Alert sent to #secops-pipeline and the Network team" },
      ],
      healthCheck: { status: "passed", detail: "API reachable, auth valid" },
      causes: [
        {
          cause: "A volume spike, likely from a Zscaler policy change",
          likelihood: "Most likely",
          evidence: "Received volume jumped 70% in one step, the pattern of more logging being switched on rather than more traffic.",
        },
        {
          cause: "Processing capacity for this pipeline",
          likelihood: "Possible",
          evidence: "This pipeline's workers are at 100% while the others are under 60%.",
        },
      ],
      checks: [
        "Check whether a Zscaler policy change enabled more logging about 40 minutes ago",
        "If the higher volume is expected, keep the added capacity",
      ],
      action: {
        kind: "databahn",
        label: "Add processing capacity",
        detail: "Databahn adds workers for this pipeline until the backlog clears. Events are queued, none are dropped.",
      },
      sampleLines: [
        "web  user=a.patel@acme.com  url=github.com  action=allowed",
        "web  user=m.chen@acme.com   url=drive.google.com  action=allowed",
        "fw   src=10.30.2.9  dst=203.0.113.4:443  action=blocked",
      ],
      impact: "Web and DNS events are reaching detections about 14 minutes late.",
      detections: ["Malicious domain access", "Data exfiltration over web"],
      backfill: { available: true, text: "Nothing is lost. Events are queued and delivered late, then the backlog clears." },
    },
  },
  "ciscoasa-branch-vpn": {
    state: "recovering",
    sinceMin: 12,
    incidents30d: 1,
    recovered: { downMin: 65, cause: "VPN concentrator rebooted for patching" },
  },
  "kubernetes-staging-eu": { state: "paused", sinceMin: 50, pause: { reason: "Cluster upgrade", by: "A. Patel", untilMin: 190 } },
  "windows-events-lab": { state: "paused", sinceMin: 1440, pause: { reason: "Lab rebuild", by: "J. Rivera", untilMin: 2880 } },
  "checkpoint-lab": { state: "paused", sinceMin: 1440, pause: { reason: "Lab rebuild", by: "J. Rivera", untilMin: 2880 } },
  "linux-auditd-ml-training": {
    state: "paused",
    sinceMin: 300,
    pause: { reason: "Nodes scaled to zero overnight", by: "ML platform", untilMin: 420 },
  },
  "github-acme-labs": { state: "learning", learning: { connectedDaysAgo: 2, daysLeft: 5 } },
  "sentinelone-northwind": { state: "learning", learning: { connectedDaysAgo: 1, daysLeft: 6 } },
  "entraid-corp-tenant": {
    risk: {
      text: "Client secret expires in 6 days",
      inDays: 6,
      actionLabel: "Renew credential",
      detail: "Collection stops on that date if it isn't renewed, the same outage as a rejected credential today, just avoidable.",
    },
  },
  "umbrella-global": {
    risk: {
      text: "API key expires in 13 days",
      inDays: 13,
      actionLabel: "Renew API key",
      detail: "Collection stops on that date if it isn't renewed.",
    },
  },
  "github-acme": {
    notice: {
      title: "API rate limit at 85% of the hourly quota",
      detail: "Collection is unaffected today. If the organisation keeps growing, events would start arriving late.",
    },
  },
};

export const SAMPLE_DESTINATIONS: FleetDestination[] = [
  {
    id: "sentinel",
    state: "recovering",
    sinceMin: 18,
    incidents30d: 4,
    recovered: { downMin: 34, cause: "Sentinel was throttling ingestion (HTTP 429). Queued events were delivered once it eased" },
  },
  {
    id: "splunk",
    state: "degraded",
    sinceMin: 52,
    incidents30d: 2,
    incident: {
      area: "delivery",
      rejectedPct: 3.1,
      observed: "3.1% of events rejected",
      timeline: [
        { minutesAgo: 53, text: "Palo Alto output mapping changed: bytes_out now sent as text" },
        { minutesAgo: 52, text: "Splunk began rejecting batches with HTTP 400" },
        { minutesAgo: 47, text: "Alert sent to #secops-pipeline and the Platform team" },
      ],
      healthCheck: { status: "warning", detail: "HEC accepting connections, 3.1% of batches rejected (400)" },
      causes: [
        {
          cause: "Data type mismatch on bytes_out",
          likelihood: "Most likely",
          evidence: "Every rejected event carries bytes_out as text, starting a minute after the mapping change. Index netfw expects a number.",
        },
        { cause: "Index quota", likelihood: "Ruled out", evidence: "Index netfw is at 61% of its daily quota." },
        { cause: "Authentication", likelihood: "Ruled out", evidence: "The HEC token is valid, 96.9% of batches are accepted." },
      ],
      checks: [
        "Review the Palo Alto field mapping change made just before rejections began",
        "Confirm the field type of bytes_out in the netfw index",
      ],
      action: {
        kind: "databahn",
        label: "Send bytes_out as a number",
        detail: "Databahn converts bytes_out to a number in its output to Splunk, then resends the rejected events from its retry queue.",
      },
      sampleLines: [
        "HEC 200  batch 8812  1,000 events accepted  index=netfw",
        "HEC 200  batch 8813  1,000 events accepted  index=netfw",
        "Retry queue: 41,200 events resent",
      ],
      impact: "Firewall events with this field are missing from Splunk. Sentinel still receives its copy.",
      backfill: { available: true, text: "Rejected events are held in Databahn's retry queue for 72 hours and resent once fixed." },
    },
  },
  {
    id: "snowflake",
    state: "stopped",
    sinceMin: 128,
    incidents30d: 1,
    incident: {
      area: "delivery",
      rejectedPct: 100,
      observed: "Not accepting data",
      timeline: [
        { minutesAgo: 132, text: "Key pair rotated for user DATABAHN_SVC" },
        { minutesAgo: 128, text: "Authentication began failing (JWT token is invalid)" },
        { minutesAgo: 113, text: "Alert sent to #secops-pipeline and the Data platform team" },
      ],
      healthCheck: { status: "failed", detail: "Key-pair authentication rejected" },
      causes: [
        {
          cause: "The key was rotated in Snowflake but not updated in Databahn",
          likelihood: "Most likely",
          evidence: "Authentication started failing 4 minutes after DATABAHN_SVC's key was rotated.",
        },
        { cause: "The service user was disabled", likelihood: "Possible", evidence: "A disabled user returns the same authentication error." },
      ],
      checks: ["Confirm DATABAHN_SVC's public key was rotated recently", "Confirm the user is still enabled"],
      action: {
        kind: "reauth",
        label: "Update Snowflake credential",
        detail: "Paste the new private key so Databahn can authenticate again.",
      },
      sampleLines: [
        "COPY INTO raw.cloudtrail  2,400 rows loaded",
        "COPY INTO raw.gcp_audit   1,150 rows loaded",
        "Buffer: 186 GB delivered from the last 2 hours",
      ],
      impact: "Cloud and SaaS audit data isn't reaching your Snowflake archive.",
      backfill: {
        available: true,
        text: "Databahn buffers up to 24 hours for this destination. Everything since it stopped is delivered once it reconnects.",
      },
    },
  },
];

function build(): FleetSource[] {
  const out: FleetSource[] = [];
  for (const [connectorId, labels, gb] of TEMPLATES) {
    const group = GROUP[connectorId];
    for (const label of labels) {
      const id = `${connectorId}-${slug(label)}`;
      const rand = seeded(id);
      // Branches and labs are smaller than datacenters, everything else
      // varies around the type's typical volume.
      const scale = /branch|lab|sandbox|dev|kiosk/i.test(label) ? 0.35 + rand() * 0.3 : 0.6 + rand() * 0.8;
      const base: FleetSource = {
        id,
        connectorId,
        label,
        group,
        collection: COLLECTION[connectorId] ?? "api",
        collector: COLLECTOR[connectorId],
        owner: OWNER[group],
        gbPerDay: Math.max(1, Math.round(gb * scale)),
        destIds: destinationsFor(connectorId, group),
        cadenceMin: CADENCE[connectorId] ?? 0,
        firstEventDaysAgo: 60 + Math.floor(rand() * 800),
        state: "healthy",
        incidents30d: rand() < 0.12 ? 1 : 0,
      };
      out.push({ ...base, ...SCRIPT[id] });
    }
  }
  return out;
}

export const SAMPLE_FLEET: FleetSource[] = build();

export function inferGroup(connectorId: string): SourceGroup {
  return GROUP[connectorId] ?? "SaaS";
}
export function inferCollection(connectorId: string): CollectionMethod {
  return COLLECTION[connectorId] ?? "api";
}
export function inferCollector(connectorId: string): string | undefined {
  return COLLECTOR[connectorId];
}
export function ownerFor(group: SourceGroup) {
  return OWNER[group];
}
