import type { Severity } from "@/app/data/fleet";

/**
 * Where alerts go when nobody is looking at Databahn. Called "notifications"
 * rather than "integrations" on purpose: in Databahn, integrations are the
 * sources and destinations data flows through, and a third place to
 * "integrate" would send people looking for Slack next to Palo Alto.
 */
export type ChannelType = "slack" | "teams" | "email" | "pagerduty" | "opsgenie" | "webhook";

export interface NotificationChannel {
  id: string;
  type: ChannelType;
  /** The specific place: a channel, a service, an address list, a URL. */
  target: string;
  connectedAt: number;
  /** Part of the sample environment, so its history of sent alerts exists. */
  sample?: boolean;
}

export interface NotificationSettings {
  channels: NotificationChannel[];
  /** Which channels receive each severity. */
  routing: Record<Severity, string[]>;
  /** Also message the team that owns the affected source. */
  notifyOwners: boolean;
  /** Say so when something recovers, so nobody keeps chasing it. */
  recoveryNotices: boolean;
  /** Holds medium and low until morning. Critical and high always go out. */
  quietHours: { on: boolean; from: string; to: string };
}

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  channels: [],
  routing: { critical: [], high: [], medium: [], low: [] },
  notifyOwners: true,
  recoveryNotices: true,
  quietHours: { on: false, from: "20:00", to: "08:00" },
};

export interface ChannelTypeDef {
  name: string;
  /** Short positioning line, the same slot a connector card's tagline uses. */
  tagline: string;
  /** What it's for, in one line. */
  purpose: string;
  /** What Databahn will be able to do there, shown as the card's pills. */
  capabilities: string[];
  monogram: string;
  color: string;
  auth: "oauth" | "fields";
  /** Shown on the sign-in button and the redirect screen. */
  provider?: string;
  /** For pasted credentials. */
  field?: { label: string; placeholder: string; hint: string };
  /** Step two: pick where in the tool. Absent means the field is the target. */
  targets?: { label: string; options: string[] };
  /** Severities it receives by default once connected. */
  defaults: Severity[];
  /** Digest channels batch; everything else is sent the moment it happens. */
  delivery: "immediate" | "digest";
  testLines: (target: string) => string[];
}

export const CHANNEL_TYPES: Record<ChannelType, ChannelTypeDef> = {
  slack: {
    name: "Slack",
    tagline: "Team chat",
    capabilities: ["Channel posts", "Claim alerts from chat", "Recovery updates", "Post-only access"],
    purpose: "Post alerts to a channel your team can claim from chat",
    monogram: "SL",
    color: "#4A154B",
    auth: "oauth",
    provider: "Slack",
    targets: { label: "Channel", options: ["#secops-pipeline", "#soc-alerts", "#network-ops", "#platform-oncall"] },
    defaults: ["critical", "high"],
    delivery: "immediate",
    testLines: (t) => [`Posted to ${t} as Databahn`, "Test alert: Example source stopped sending", "Buttons: Triage in Databahn · I'm on it"],
  },
  teams: {
    name: "Microsoft Teams",
    tagline: "Team chat",
    capabilities: ["Channel posts", "Claim alerts from chat", "Recovery updates", "Post-only access"],
    purpose: "Post alerts to a Teams channel",
    monogram: "MT",
    color: "#5059C9",
    auth: "oauth",
    provider: "Microsoft",
    targets: { label: "Channel", options: ["SecOps › Pipeline alerts", "SecOps › General", "Network › Alerts"] },
    defaults: ["critical", "high"],
    delivery: "immediate",
    testLines: (t) => [`Posted to ${t} as Databahn`, "Test alert: Example source stopped sending", "Card actions: Triage in Databahn · I'm on it"],
  },
  pagerduty: {
    name: "PagerDuty",
    tagline: "On-call paging",
    capabilities: ["On-call pages", "Auto-resolve on recovery", "Urgency by severity"],
    purpose: "Page the on-call engineer for critical alerts",
    monogram: "PD",
    color: "#06AC38",
    auth: "oauth",
    provider: "PagerDuty",
    targets: { label: "Service", options: ["SecOps on-call", "Platform on-call", "Network on-call"] },
    defaults: ["critical"],
    delivery: "immediate",
    testLines: (t) => [`Incident created on ${t} (test, auto-resolves)`, "Urgency: high · Assigned to the current on-call", "Resolved automatically after the test"],
  },
  opsgenie: {
    name: "Opsgenie",
    tagline: "On-call alerting",
    capabilities: ["On-call alerts", "Auto-close on recovery", "Priority by severity"],
    purpose: "Alert the on-call team for critical alerts",
    monogram: "OG",
    color: "#2684FF",
    auth: "fields",
    field: { label: "API key", placeholder: "Opsgenie integration API key", hint: "Settings › Integrations › API in Opsgenie" },
    targets: { label: "Team", options: ["SecOps", "Platform", "Network"] },
    defaults: ["critical"],
    delivery: "immediate",
    testLines: (t) => [`Alert created for team ${t} (test, auto-closes)`, "Priority: P1 · Routed to the current on-call", "Closed automatically after the test"],
  },
  email: {
    name: "Email",
    tagline: "Daily digest",
    capabilities: ["Daily digest", "Distribution lists", "Recovery summary"],
    purpose: "A daily digest of everything lower priority",
    monogram: "@",
    color: "#45536E",
    auth: "fields",
    field: { label: "Send to", placeholder: "secops@company.com, j.rivera@company.com", hint: "Comma-separated. A distribution list works best." },
    defaults: ["medium", "low"],
    delivery: "digest",
    testLines: (t) => [`Delivered to ${t}`, "Subject: [Databahn] Test digest", "Accepted by the receiving mail server"],
  },
  webhook: {
    name: "Webhook",
    tagline: "Any other tool",
    capabilities: ["Signed JSON", "Every alert change", "Any endpoint"],
    purpose: "Send alerts as JSON to any other tool",
    monogram: "{}",
    color: "#0FB4BA",
    auth: "fields",
    field: { label: "Endpoint URL", placeholder: "https://hooks.example.com/databahn", hint: "Databahn sends a signed JSON POST for each alert." },
    defaults: ["critical", "high"],
    delivery: "immediate",
    testLines: (t) => [`POST ${t}`, "Response 200 OK in 142 ms", "Signature verified header sent: X-Databahn-Signature"],
  },
};

export const CHANNEL_ORDER: ChannelType[] = ["slack", "teams", "pagerduty", "opsgenie", "email", "webhook"];

/** The sample environment's history says alerts went to #secops-pipeline,
 * so the sample comes with that channel connected, a month back. */
export const SAMPLE_CHANNEL: NotificationChannel = {
  id: "ch-sample-slack",
  type: "slack",
  target: "#secops-pipeline",
  connectedAt: Date.now() - 30 * 86400000,
  sample: true,
};

export function channelName(c: NotificationChannel) {
  if (c.type === "slack" || c.type === "teams") return c.target;
  if (c.type === "email") return "email";
  if (c.type === "webhook") return "a webhook";
  return `${CHANNEL_TYPES[c.type].name} (${c.target})`;
}

/** "#secops-pipeline and PagerDuty (SecOps on-call)" for the channels that
 * receive this severity, or null when nothing would be sent. */
export function whereAlertsGo(settings: NotificationSettings, severity: Severity = "critical"): string | null {
  const ids = settings.routing[severity] ?? [];
  const names = settings.channels.filter((c) => ids.includes(c.id)).map(channelName);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function withChannel(settings: NotificationSettings, channel: NotificationChannel, severities: Severity[]): NotificationSettings {
  const routing = { ...settings.routing };
  for (const sv of Object.keys(routing) as Severity[]) {
    routing[sv] = severities.includes(sv) ? [...routing[sv].filter((id) => id !== channel.id), channel.id] : routing[sv].filter((id) => id !== channel.id);
  }
  return { ...settings, channels: [...settings.channels.filter((c) => c.id !== channel.id), channel], routing };
}

export function withoutChannel(settings: NotificationSettings, id: string): NotificationSettings {
  const routing = { ...settings.routing };
  for (const sv of Object.keys(routing) as Severity[]) routing[sv] = routing[sv].filter((x) => x !== id);
  return { ...settings, channels: settings.channels.filter((c) => c.id !== id), routing };
}
