export interface LogType {
  id: string;
  name: string;
  /** What this log actually tells you, in plain language. */
  purpose: string;
  /** Share of this source's total volume. Traffic dominates, which is exactly
   * why the cost conversation happens here. */
  volumeShare: number;
  /** Cruz's default. High value per byte goes on, high volume gets sampled,
   * niche feeds stay off until asked for. */
  defaultOn: boolean;
  /** Why Cruz chose that default, shown inline so the recommendation is
   * inspectable rather than magic. */
  rationale: string;
  recommended?: "sample" | "full";
}

/**
 * The real PAN-OS log types. Selecting these is a genuine step in a Palo Alto
 * onboarding, and it is where the volume and cost tradeoff actually gets made,
 * so it belongs in the flow rather than being assumed.
 */
export const PALO_ALTO_LOG_TYPES: LogType[] = [
  { id: "traffic", name: "Traffic", purpose: "Every session through the firewall", volumeShare: 0.62, defaultOn: true, recommended: "sample", rationale: "Highest volume by far. Sampled at 1:10 for permitted internal sessions, denies kept in full.", },
  { id: "threat", name: "Threat", purpose: "IPS, antivirus and anti-spyware hits", volumeShare: 0.08, defaultOn: true, recommended: "full", rationale: "Core detection signal, always kept in full." },
  { id: "url", name: "URL Filtering", purpose: "Web requests and category verdicts", volumeShare: 0.18, defaultOn: true, recommended: "sample", rationale: "High volume, mostly permitted browsing. Blocks kept in full, allows sampled." },
  { id: "wildfire", name: "WildFire Submissions", purpose: "Files sent for sandbox analysis", volumeShare: 0.01, defaultOn: true, recommended: "full", rationale: "Low volume, high value. Always full." },
  { id: "data", name: "Data Filtering", purpose: "DLP pattern matches", volumeShare: 0.02, defaultOn: true, recommended: "full", rationale: "Compliance relevant, exempt from reduction." },
  { id: "globalprotect", name: "GlobalProtect", purpose: "VPN connect and disconnect events", volumeShare: 0.03, defaultOn: true, recommended: "full", rationale: "Remote access is a common initial access path." },
  { id: "userid", name: "User-ID", purpose: "IP to user mappings", volumeShare: 0.02, defaultOn: true, recommended: "full", rationale: "Needed to attribute any other log to a person." },
  { id: "auth", name: "Authentication", purpose: "Firewall and captive portal auth", volumeShare: 0.01, defaultOn: true, recommended: "full", rationale: "Auth failures are never reduced, by guardrail rule." },
  { id: "config", name: "Config", purpose: "Firewall configuration changes", volumeShare: 0.002, defaultOn: true, recommended: "full", rationale: "Tiny volume, and the first thing an auditor asks for." },
  { id: "system", name: "System", purpose: "Device health and daemon events", volumeShare: 0.003, defaultOn: true, recommended: "full", rationale: "Needed to spot a firewall that stopped forwarding." },
  { id: "decryption", name: "Decryption", purpose: "TLS decryption successes and failures", volumeShare: 0.02, defaultOn: false, rationale: "Off by default. Useful for troubleshooting, rarely for detection." },
  { id: "hip", name: "HIP Match", purpose: "Endpoint posture checks", volumeShare: 0.01, defaultOn: false, rationale: "Off by default. Only relevant if you enforce host posture." },
  { id: "tunnel", name: "Tunnel Inspection", purpose: "GRE and IPSec inner-flow visibility", volumeShare: 0.005, defaultOn: false, rationale: "Off by default. Niche outside carrier and OT networks." },
];

/**
 * Real Microsoft Graph API log categories for Entra ID. No PAN-OS-style
 * sampling here, a Graph API pull is already a discrete category, not a
 * continuous stream you'd take a slice of, so every row is full-fidelity
 * or off, there's no "recommended: sample" tier for this source.
 */
export const ENTRA_ID_LOG_TYPES: LogType[] = [
  { id: "signin", name: "Sign-in logs", purpose: "Interactive and non-interactive sign-in attempts", volumeShare: 0.55, defaultOn: true, recommended: "full", rationale: "The core identity signal, almost every detection starts here." },
  { id: "audit", name: "Audit logs", purpose: "Directory changes: users, groups, roles, policies", volumeShare: 0.20, defaultOn: true, recommended: "full", rationale: "Directory role changes are never reduced, by guardrail rule." },
  { id: "risk-detections", name: "Risk detections", purpose: "Identity Protection's own risk findings", volumeShare: 0.10, defaultOn: true, recommended: "full", rationale: "Microsoft's own scoring, cheap to keep, high detection value." },
  { id: "risky-users", name: "Risky users", purpose: "Users currently flagged at elevated risk", volumeShare: 0.05, defaultOn: true, recommended: "full", rationale: "Small volume, directly actionable." },
  { id: "provisioning", name: "Provisioning", purpose: "Automated account create/update/disable events", volumeShare: 0.05, defaultOn: false, rationale: "Off by default. Only relevant if you provision via Entra." },
  { id: "spn-signin", name: "Service principal sign-ins", purpose: "App-to-app authentication, not human users", volumeShare: 0.03, defaultOn: false, rationale: "Off by default. Useful for service-account hunting, not everyone's priority on day one." },
  { id: "managed-identity", name: "Managed identity sign-ins", purpose: "Azure-resource identities authenticating", volumeShare: 0.02, defaultOn: false, rationale: "Off by default. Niche outside Azure-heavy environments." },
];
