export type ConnectorKind = "source" | "destination";

export interface ConnectorDef {
  id: string;
  name: string;
  kind: ConnectorKind;
  category: string;
  brandColor: string;
  initials: string;
  description: string;
  /** Three-word positioning, as on the reference cards. */
  tagline: string;
  /** Concrete data this connector delivers, shown as pills so the card says
   * what you actually get rather than a vague sentence. */
  dataTypes: string[];
  /** True for the fully custom, bespoke wizard flows (Palo Alto, Entra ID,
   * Sentinel, Splunk). Everything else runs the generic wizard driven purely
   * by its config below, proving the reusable-pattern deliverable: a new
   * connector plugs in with a config object, no new UI code. */
  builtIn: boolean;
  /** Surfaced in the default curated view. Everything else is reachable by
   * search or by switching to the full catalogue. */
  popular?: boolean;
}

/**
 * Reusable pattern deliverable: the whole catalog + wizard runs off this
 * config shape. Real Databahn integrations (researched from databahn.ai),
 * not invented placeholders. Only Palo Alto, Entra ID, Sentinel, and Splunk
 * get the full bespoke walkthrough; the rest demonstrate the pattern scaling.
 */
export const CONNECTORS: ConnectorDef[] = [
  // Sources
  {
    id: "paloalto",
    popular: true,
    tagline: "Next-gen firewall",
    dataTypes: ["Traffic", "Threat", "URL Filtering", "WildFire", "Data Filtering", "GlobalProtect", "User-ID", "Authentication", "Config", "System", "Decryption", "HIP Match", "Tunnel Inspection"],
    name: "Palo Alto",
    kind: "source",
    category: "Network security, syslog",
    brandColor: "#FA582D",
    initials: "PA",
    description: "Firewall and threat logs via syslog forwarding.",
    builtIn: true,
  },
  {
    id: "entraid",
    popular: true,
    tagline: "Identity & access",
    dataTypes: ["Sign-in logs", "Audit logs", "Risk detections", "Risky users", "Provisioning", "Service principal sign-ins", "Managed identity sign-ins"],
    name: "Entra ID",
    kind: "source",
    category: "Identity, API",
    brandColor: "#0078D4",
    initials: "ID",
    description: "Sign-in and audit logs via the Microsoft Graph API.",
    builtIn: true,
  },
  {
    id: "aws-cloudtrail",
    popular: true,
    tagline: "Amazon cloud platform",
    dataTypes: ["CloudTrail management", "CloudTrail data", "GuardDuty findings", "Security Hub", "IAM activity", "Config changes", "VPC Flow Logs"],
    name: "AWS",
    kind: "source",
    category: "Cloud, API",
    brandColor: "#FF9900",
    initials: "AWS",
    description: "Account activity and API call logs from AWS.",
    builtIn: false,
  },
  {
    id: "okta",
    popular: true,
    tagline: "Identity & access",
    dataTypes: ["System log", "Auth events", "MFA status", "User lifecycle", "Policy changes", "App assignments"],
    name: "Okta",
    kind: "source",
    category: "Identity, API",
    brandColor: "#007DC1",
    initials: "OK",
    description: "System log events from your Okta org.",
    builtIn: false,
  },
  {
    id: "crowdstrike",
    popular: true,
    tagline: "Cloud endpoint protection",
    dataTypes: ["Detections", "Host inventory", "IOC data", "Incidents", "Vulnerabilities", "Policies"],
    name: "CrowdStrike",
    kind: "source",
    category: "Endpoint, API",
    brandColor: "#E01F3D",
    initials: "CS",
    description: "Endpoint detections and telemetry from Falcon.",
    builtIn: false,
  },
  {
    id: "defender",
    popular: true,
    tagline: "Enterprise endpoint",
    dataTypes: ["Endpoint alerts", "Vulnerabilities", "Hunting", "Device inventory", "Software inventory", "Secure score"],
    name: "Defender",
    kind: "source",
    category: "Endpoint, API",
    brandColor: "#0078D4",
    initials: "MD",
    description: "Endpoint and identity alerts from Defender.",
    builtIn: false,
  },
  {
    id: "fortinet",
    popular: true,
    tagline: "Next-gen firewall",
    dataTypes: ["Traffic", "IPS events", "Web filter", "Application control", "Antivirus", "VPN", "System"],
    name: "Fortinet",
    kind: "source",
    category: "Network security, syslog",
    brandColor: "#EE3124",
    initials: "FG",
    description: "Firewall traffic and threat logs via syslog.",
    builtIn: false,
  },
  {
    id: "gcp-audit",
    popular: true,
    tagline: "Google cloud platform",
    dataTypes: ["Admin activity", "Data access", "System events", "Policy denied", "Access transparency"],
    name: "Google Cloud",
    kind: "source",
    category: "Cloud, API",
    brandColor: "#4285F4",
    initials: "GC",
    description: "Admin and data access logs from Google Cloud.",
    builtIn: false,
  },
  // Destinations
  {
    id: "sentinel",
    popular: true,
    tagline: "Microsoft cloud SIEM",
    dataTypes: ["CommonSecurityLog", "Custom tables", "Analytics rules", "Watchlists", "Incidents"],
    name: "Microsoft Sentinel",
    kind: "destination",
    category: "SIEM",
    brandColor: "#0078D4",
    initials: "MS",
    description: "Microsoft's cloud-native SIEM, part of Azure.",
    builtIn: true,
  },
  {
    id: "splunk",
    popular: true,
    tagline: "SIEM & event management",
    dataTypes: ["HEC ingest", "Indexes", "Notable events", "Sourcetypes", "Data models"],
    name: "Splunk",
    kind: "destination",
    category: "SIEM",
    brandColor: "#65A637",
    initials: "SP",
    description: "Route data via HTTP Event Collector (HEC).",
    builtIn: true,
  },
  {
    id: "google-secops",
    popular: true,
    tagline: "Google cloud SIEM",
    dataTypes: ["UDM ingest", "Log types", "Detections"],
    name: "Google SecOps",
    kind: "destination",
    category: "SIEM",
    brandColor: "#4285F4",
    initials: "GS",
    description: "Google's cloud-native security operations platform.",
    builtIn: false,
  },
  {
    id: "qradar",
    popular: true,
    tagline: "IBM SIEM",
    dataTypes: ["Log sources", "Offenses", "Reference sets"],
    name: "IBM QRadar",
    kind: "destination",
    category: "SIEM",
    brandColor: "#054ADA",
    initials: "QR",
    description: "IBM's on-prem and cloud SIEM.",
    builtIn: false,
  },
  {
    id: "exabeam",
    popular: true,
    tagline: "Behavioral analytics SIEM",
    dataTypes: ["Collectors", "UEBA", "Timelines"],
    name: "Exabeam",
    kind: "destination",
    category: "SIEM",
    brandColor: "#6C2EB9",
    initials: "EX",
    description: "Behavioral analytics and SIEM platform.",
    builtIn: false,
  },
  {
    id: "securonix",
    popular: true,
    tagline: "Cloud SIEM & UEBA",
    dataTypes: ["Data sources", "Policies", "Threat models"],
    name: "Securonix",
    kind: "destination",
    category: "SIEM",
    brandColor: "#F5821F",
    initials: "SX",
    description: "Cloud-native SIEM and UEBA platform.",
    builtIn: false,
  },
  {
    id: "devo",
    popular: true,
    tagline: "Cloud security platform",
    dataTypes: ["Relay ingest", "Tables", "Alerts"],
    name: "Devo",
    kind: "destination",
    category: "SIEM",
    brandColor: "#4B2E83",
    initials: "DV",
    description: "Cloud-native security data platform.",
    builtIn: false,
  },
  {
    id: "snowflake",
    popular: true,
    tagline: "Data cloud",
    dataTypes: ["Warehouses", "Tables", "Streams"],
    name: "Snowflake",
    kind: "destination",
    category: "Data platform",
    brandColor: "#29B5E8",
    initials: "SF",
    description: "Route data into your Snowflake data cloud.",
    builtIn: false,
  },
  {
    id: "sumologic",
    popular: true,
    tagline: "Cloud log analytics",
    dataTypes: ["HTTP source", "Categories", "Monitors"],
    name: "Sumo Logic",
    kind: "destination",
    category: "SIEM",
    brandColor: "#000F9F",
    initials: "SL",
    description: "Cloud-native log analytics and SIEM.",
    builtIn: false,
  },
  {
    id: "databricks",
    popular: true,
    tagline: "Lakehouse platform",
    dataTypes: ["Delta tables", "Unity Catalog", "Jobs"],
    name: "Databricks",
    kind: "destination",
    category: "Data platform",
    brandColor: "#FF3621",
    initials: "DB",
    description: "Route data into your Databricks lakehouse.",
    builtIn: false,
  },

  // Wider catalogue. These run the generic wizard, they exist so browsing and
  // searching a large integration library is a real interaction rather than a
  // claim about a number.
  { id: "zscaler", popular: false, tagline: "Secure web gateway", dataTypes: ["Web logs", "Firewall logs", "DNS logs"], name: "Zscaler", kind: "source", category: "Network security, API", brandColor: "#0075BE", initials: "ZS", description: "Web and firewall logs from Zscaler Internet Access.", builtIn: false },
  { id: "umbrella", popular: false, tagline: "DNS-layer security", dataTypes: ["DNS logs", "Proxy logs", "IP logs"], name: "Cisco Umbrella", kind: "source", category: "Network security, API", brandColor: "#1BA0D7", initials: "UM", description: "DNS and proxy activity from Cisco Umbrella.", builtIn: false },
  { id: "cloudflare", popular: false, tagline: "Edge network", dataTypes: ["HTTP requests", "Firewall events", "DNS"], name: "Cloudflare", kind: "source", category: "Network security, API", brandColor: "#F38020", initials: "CF", description: "Edge request and security event logs.", builtIn: false },
  { id: "proofpoint", popular: false, tagline: "Email security", dataTypes: ["Message events", "Threat data", "Clicks"], name: "Proofpoint", kind: "source", category: "Email, API", brandColor: "#0071C5", initials: "PP", description: "Email threat and message trace events.", builtIn: false },
  { id: "mimecast", popular: false, tagline: "Email security", dataTypes: ["Message tracking", "Attachment scan"], name: "Mimecast", kind: "source", category: "Email, API", brandColor: "#CC0000", initials: "MC", description: "Email gateway and threat events.", builtIn: false },
  { id: "sentinelone", popular: false, tagline: "Endpoint detection", dataTypes: ["Threats", "Agent telemetry", "Deep visibility"], name: "SentinelOne", kind: "source", category: "Endpoint, API", brandColor: "#6B4FBB", initials: "S1", description: "Endpoint detection and response telemetry.", builtIn: false },
  { id: "checkpoint", popular: false, tagline: "Next-gen firewall", dataTypes: ["Traffic logs", "Threat prevention"], name: "Check Point", kind: "source", category: "Network security, syslog", brandColor: "#E5001A", initials: "CP", description: "Firewall and threat prevention logs.", builtIn: false },
  { id: "ciscoasa", popular: false, tagline: "Firewall & VPN", dataTypes: ["Traffic logs", "VPN sessions"], name: "Cisco ASA", kind: "source", category: "Network security, syslog", brandColor: "#1BA0D7", initials: "CA", description: "Firewall and remote access VPN logs.", builtIn: false },
  { id: "duo", popular: false, tagline: "Multi-factor auth", dataTypes: ["Auth logs", "Admin logs", "Telephony"], name: "Duo", kind: "source", category: "Identity, API", brandColor: "#6DC066", initials: "DU", description: "Authentication and administrator activity.", builtIn: false },
  { id: "cyberark", popular: false, tagline: "Privileged access", dataTypes: ["Vault audit", "Session recordings"], name: "CyberArk", kind: "source", category: "Identity, API", brandColor: "#0C9ED9", initials: "CY", description: "Privileged access and vault audit events.", builtIn: false },
  { id: "tenable", popular: false, tagline: "Vulnerability management", dataTypes: ["Scan results", "Asset inventory"], name: "Tenable", kind: "source", category: "Vulnerability, API", brandColor: "#0A2A4A", initials: "TN", description: "Vulnerability scan findings and assets.", builtIn: false },
  { id: "qualys", popular: false, tagline: "Vulnerability management", dataTypes: ["Scan results", "Compliance"], name: "Qualys", kind: "source", category: "Vulnerability, API", brandColor: "#ED2E26", initials: "QU", description: "Vulnerability and compliance scan data.", builtIn: false },
  { id: "kubernetes", popular: false, tagline: "Container platform", dataTypes: ["Audit logs", "Events", "Pod logs"], name: "Kubernetes", kind: "source", category: "Cloud, API", brandColor: "#326CE5", initials: "K8", description: "Cluster audit logs and events.", builtIn: false },
  { id: "windows-events", popular: false, tagline: "Windows endpoints", dataTypes: ["Security log", "System log", "Sysmon"], name: "Windows Event Log", kind: "source", category: "Endpoint, agent", brandColor: "#0078D4", initials: "WE", description: "Security, system and Sysmon event channels.", builtIn: false },
  { id: "linux-auditd", popular: false, tagline: "Linux endpoints", dataTypes: ["auditd", "syslog", "auth.log"], name: "Linux auditd", kind: "source", category: "Endpoint, agent", brandColor: "#F6C915", initials: "LX", description: "Kernel audit and authentication logs.", builtIn: false },
  { id: "zeek", popular: false, tagline: "Network monitoring", dataTypes: ["conn.log", "dns.log", "http.log", "ssl.log"], name: "Zeek", kind: "source", category: "Network security, agent", brandColor: "#F5A800", initials: "ZK", description: "Network security monitoring logs.", builtIn: false },
  { id: "github", popular: false, tagline: "Source control", dataTypes: ["Audit log", "Org events"], name: "GitHub", kind: "source", category: "SaaS, API", brandColor: "#181717", initials: "GH", description: "Organisation audit and security events.", builtIn: false },
  { id: "salesforce", popular: false, tagline: "CRM platform", dataTypes: ["Event monitoring", "Login history"], name: "Salesforce", kind: "source", category: "SaaS, API", brandColor: "#00A1E0", initials: "SF", description: "Event monitoring and login history.", builtIn: false },
  { id: "box", popular: false, tagline: "Content cloud", dataTypes: ["Events", "File activity"], name: "Box", kind: "source", category: "SaaS, API", brandColor: "#0061D5", initials: "BX", description: "File and user activity events.", builtIn: false },
  { id: "workday", popular: false, tagline: "HR platform", dataTypes: ["Sign-on", "User activity"], name: "Workday", kind: "source", category: "SaaS, API", brandColor: "#F38B00", initials: "WD", description: "Sign-on and user activity audit.", builtIn: false },
  { id: "elastic", popular: false, tagline: "Search platform", dataTypes: ["Data streams", "Indices"], name: "Elastic", kind: "destination", category: "SIEM", brandColor: "#00BFB3", initials: "EL", description: "Route into Elasticsearch data streams.", builtIn: false },
  { id: "datadog", popular: false, tagline: "Observability", dataTypes: ["Log intake", "Metrics"], name: "Datadog", kind: "destination", category: "Observability", brandColor: "#632CA6", initials: "DD", description: "Route logs into Datadog.", builtIn: false },
  { id: "s3", popular: false, tagline: "Object storage", dataTypes: ["Buckets", "Parquet", "Lifecycle"], name: "Amazon S3", kind: "destination", category: "Storage", brandColor: "#FF9900", initials: "S3", description: "Archive to S3 with lifecycle policies.", builtIn: false },
  { id: "azure-blob", popular: false, tagline: "Object storage", dataTypes: ["Containers", "Parquet"], name: "Azure Blob", kind: "destination", category: "Storage", brandColor: "#0078D4", initials: "AB", description: "Archive to Azure Blob Storage.", builtIn: false },
  { id: "security-lake", popular: false, tagline: "AWS security lake", dataTypes: ["OCSF", "Parquet", "Glue catalog"], name: "Amazon Security Lake", kind: "destination", category: "Data platform", brandColor: "#FF9900", initials: "SL", description: "Route OCSF-normalised data into Security Lake.", builtIn: false },
  { id: "kafka", popular: false, tagline: "Event streaming", dataTypes: ["Topics", "Partitions"], name: "Apache Kafka", kind: "destination", category: "Streaming", brandColor: "#231F20", initials: "KF", description: "Publish to Kafka topics.", builtIn: false },
  { id: "clickhouse", popular: false, tagline: "Analytics database", dataTypes: ["Tables", "MergeTree"], name: "ClickHouse", kind: "destination", category: "Data platform", brandColor: "#FFCC01", initials: "CH", description: "Route into ClickHouse tables.", builtIn: false },
  { id: "newrelic", popular: false, tagline: "Observability", dataTypes: ["Log API", "Events"], name: "New Relic", kind: "destination", category: "Observability", brandColor: "#00AC69", initials: "NR", description: "Route logs into New Relic.", builtIn: false },
];

export function getConnector(id: string) {
  const c = CONNECTORS.find((c) => c.id === id);
  if (!c) throw new Error(`Unknown connector: ${id}`);
  return c;
}
