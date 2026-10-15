import type { Incident } from "@/app/data/fleet";
import { fmtDuration } from "./environment";

/** Anything with an open incident, source or destination. */
export interface TriageSubject {
  kind: "source" | "destination";
  name: string;
  label?: string;
  state: string;
  sinceMin: number;
  /** GB/day normally arriving (sources) or sent (destinations). */
  gbPerDay: number;
  incident?: Incident;
}

interface ReplyContext {
  coldStorageConnected: boolean;
  /** The log-type question wording is now shared by two wizards (Palo Alto,
   * Entra ID), a keyword match alone can't tell which one asked, the answer
   * has to branch on this or it states the wrong vendor's log types and
   * percentages to whichever source didn't ask about them. */
  connectorName?: string;
  /** "Isn't sending anything" is the same shared verify-step question for
   * every connector, but the fix is different for a source (a firewall
   * config problem) than a destination (a credential or endpoint problem),
   * naming firewall rules to someone stuck connecting Sentinel would be
   * actively wrong, not just unhelpful. */
  connectorKind?: "source" | "destination" | "notification";
}

/**
 * Simulated tier-2 responder for the prototype, rule-based keyword matching,
 * not a live model. What's being demonstrated is the interaction pattern
 * (globally reachable, context-seeded, plain-language, occasionally agentic),
 * not a production AI backend.
 */
const RULES: Array<{ match: RegExp; reply: string | ((ctx: ReplyContext) => string) }> = [
  { match: /which alerts should go|go to (slack|teams|pagerduty|opsgenie|email|webhook)/i, reply: "Page people only for critical: data not arriving or not landing. Send critical and high to your team channel, and keep medium and low for a daily email digest, so the channel stays worth reading." },
  { match: /critical and high|difference between critical/i, reply: "Critical means data coming in or going out is affected right now, a source stopped or a destination is refusing data. High means processing is holding up delivery, data is late or partly failing, but still moving." },
  { match: /message look like/i, reply: "One message per problem: what's wrong, since when, the likely cause and a link straight to its triage, plus an I'm on it button. When it gets worse or recovers, that same message is updated rather than a new one sent." },
  { match: /who gets notified/i, reply: "Whoever is in the channel you pick, plus the team that owns the affected source if 'Also notify the owning team' is on. You can change both on the Notifications page any time." },
  { match: /hostname|serial/i, reply: "It's on the firewall's Dashboard tab in PAN-OS, top left, or run `show system info` from the CLI. Any hostname that resolves works, I only use it to label the source." },
  { match: /tenant domain|tenant/i, reply: "Your Entra ID tenant domain looks like acme.onmicrosoft.com. It's in the Azure portal under Microsoft Entra ID, Overview. Or just sign in and I'll read it from the token." },
  { match: /workspace name|workspace/i, reply: "In the Azure portal, Log Analytics workspaces, it's the name of the workspace your Sentinel instance sits on. Signing in with OAuth means you can pick it from a list instead of typing it." },
  { match: /log type|which log|what.{0,10}collect/i, reply: ({ connectorName }) => connectorName === "Entra ID"
    ? "Start with Sign-in logs and Audit logs, they're the bulk of detection value. Risk detections and Risky users are cheap to add. Provisioning and service-principal sign-ins are off by default, niche unless you specifically hunt those."
    : "Start with Threat, WildFire, Config and User-ID, they're small and high value. Traffic and URL Filtering are 80% of your volume, which is why I sample rather than drop them." },
  { match: /sampled|sampling/i, reply: "Sampled means I keep a statistically representative slice plus full counts, rather than every record. Denies and blocks are always kept in full, only the permitted traffic gets sampled." },
  { match: /traffic off|turn traffic|turn off sign-in/i, reply: ({ connectorName }) => connectorName === "Entra ID"
    ? "You'd cut about 55% of volume, but lose the core identity signal almost every detection starts from. I'd leave it on."
    : "You'd cut about 62% of volume, but lose session-level visibility for threat hunting. Most teams sample it instead, which is what I've set up." },
  { match: /commit take|commit so long|why.{0,15}commit/i, reply: "PAN-OS revalidates the entire candidate configuration and pushes it to the dataplane, not just your change. That's why it's 60 to 180 seconds even for a small edit." },
  { match: /keep working|while it commits/i, reply: "Yes. The commit runs on the firewall, so you can leave this screen. I'll keep tracking it and the source will show as live when events arrive." },
  { match: /tenant/i, reply: "Your Entra ID tenant ID identifies your organization's directory. I can pull this automatically once you sign in with Microsoft, no need to dig through the Azure portal." },
  { match: /oauth/i, reply: "Signing in directly means fewer clicks and no secrets to copy around. Manual app-registration is still there as a fallback if your tenant restricts direct sign-in." },
  { match: /client secret|app registration/i, reply: "A client secret is only needed for the manual app-registration path. If your tenant allows it, signing in with Microsoft directly skips this entirely." },
  { match: /hec|token/i, reply: "The HEC token authorizes Databahn to send data into Splunk. You'll find it in Splunk under Settings, Data Inputs, HTTP Event Collector." },
  { match: /scope|permission|audit.?log/i, reply: "AuditLog.Read.All just means \"read sign-in and audit logs,\" Entra ID's own wording, not ours. You're not granting anything beyond read access to those logs." },
  { match: /udp|514|port/i, reply: "UDP 514 is the standard port for Palo Alto syslog forwarding. Only change it if your firewall config uses something different." },
  { match: /syslog/i, reply: "On PAN-OS, that's under Device > Log Settings > Syslog. Point it at the address shown on this screen and you're set." },
  { match: /isn.?t (sending|working)|not (sending|working)|no data|nothing.{0,15}(happen|arriv|connect)/i, reply: ({ connectorKind }) => connectorKind === "destination"
    ? "A few things to check: the credential is still valid and hasn't expired, the endpoint address matches exactly, and nothing on your network is blocking outbound access to it. If it's still quiet in the next 20 seconds or so, I'll show you a checklist right on this screen."
    : "A few things to check: the firewall rule allows outbound traffic on this port, the address matches exactly, and the log forwarding profile is actually attached to a security rule. If it's still quiet in the next 20 seconds or so, I'll show you a checklist right on this screen." },
  { match: /pan-os|what.{0,15}format/i, reply: ({ connectorName }) => connectorName === "Entra ID"
    ? "Entra ID returns its sign-in and audit events as JSON from the Graph API, no format to detect, I read the field names directly from your sample and mapped what I recognized."
    : "PAN-OS is Palo Alto's own log format. I detected it automatically from your sample traffic, that's how I knew which fields map to what." },
  { match: /mapping/i, reply: "If a field looks wrong, you don't have to redo the whole mapping. Just tell me which one, and I'll fix that field specifically." },
  { match: /rule|filter|reduc/i, reply: ({ coldStorageConnected }) => coldStorageConnected
    ? "Default reduction rules trim duplicate and low-value events before they hit your SIEM. Nothing is deleted, it's routed to your connected cold storage instead. You can review or disable any specific rule from Pipeline overview."
    : "Default reduction rules trim duplicate and low-value events before they hit your SIEM. Right now you don't have cold storage connected, so filtered events aren't being retained anywhere, connect one from the Destinations catalogue if you want to keep them." },
  { match: /cold storage/i, reply: ({ coldStorageConnected }) => coldStorageConnected
    ? "Cold storage holds data that was filtered out before reaching your SIEM. It was never evaluated by your SIEM's detection rules, so treat a cold-storage result as unscored, not \"already checked.\""
    : "Cold storage is your own storage, an S3 bucket or similar, that Databahn routes filtered events into so nothing's lost. You don't have one connected yet, add it from the Destinations catalogue the same way you connected Sentinel or Splunk." },
  { match: /raw (and|vs\.?) parsed|difference.{0,15}(raw|parsed)/i, reply: "Raw is the original, unmodified log line. Parsed is the same event broken into named fields (user, IP, action) so you can filter and read it faster. Same data, two views." },
  { match: /dashed/i, reply: ({ coldStorageConnected }) => coldStorageConnected
    ? "A dashed border means that entity came from cold storage, it was filtered out before reaching your SIEM, so nothing there has evaluated it yet."
    : "A dashed border means that entity came from cold storage. You don't have cold storage connected right now though, so you shouldn't be seeing any, tell me if you are." },
  { match: /which (source|destination)|fastest|first|start/i, reply: "If you're just getting a feel for it, Palo Alto or Entra ID are the quickest, both auto-detect their format so there's almost nothing to configure by hand." },
  { match: /what happens (to|next)|now what/i, reply: "Once connected, data flows through Highway automatically, no further setup here. You'll see it live on Pipeline overview, and it's queryable from Search right away." },
  { match: /add another (source|destination)|how do i add/i, reply: "Use the \"Add another\" button right here on this screen, it takes you straight back to the catalogue without losing what you just connected." },
  { match: /how does databahn work|what is databahn/i, reply: "Databahn sits between your data sources and your SIEM, collecting, filtering, and routing telemetry so you pay for and see only what matters. I handle the plumbing." },
  { match: /stuck|help|confus/i, reply: "No problem, tell me what field you're on and I'll walk through it, or I can just fill in what I can detect automatically." },
];

/** Never dead-ends. Points at the two things that always help: the field's own
 * inline hint, and the fact that nothing is committed until the final step. */
const FALLBACK =
  "I don't have that one to hand. Every field on this screen has an inline hint next to its label, and nothing is sent anywhere until you finish the last step, so it's safe to try a value and adjust.";

/** Health questions are answered from the live incident, not a keyword
 * table: "why did it stop" has a different, specific answer for every
 * source, and Cruz already did the investigation. Returns null when the
 * question isn't about a current health problem. */
function healthReply(text: string, subjects: TriageSubject[]): string | null {
  const t = text.toLowerCase();
  const open = subjects.filter((s) => (s.state === "stopped" || s.state === "degraded") && s.incident);
  if (open.length === 0) return null;

  if (/what did i miss|missed|lost|gap/.test(t)) {
    const lines = open
      .filter((s) => s.incident!.area === "ingest" || s.incident!.area === "delivery")
      .map((s) => {
        const inc = s.incident!;
        const share = inc.area === "delivery" ? (inc.rejectedPct ?? 100) / 100 : 1 - (inc.receivedFactor ?? 0);
        const gb = ((s.gbPerDay * s.sinceMin) / 1440) * share;
        const verb = inc.area === "delivery" ? "held back from" : "missed from";
        return `about ${Math.round(gb)} GB ${verb} ${s.name} over ${fmtDuration(s.sinceMin)}, ${
          inc.backfill.available ? "recoverable once it's fixed" : "not recoverable, syslog has no replay"
        }`;
      });
    if (lines.length === 0) return null;
    return `So far: ${lines.join("; ")}. Searches covering those windows are flagged as incomplete, so nobody reads a gap as "nothing happened."`;
  }

  const named = open.find((s) => t.includes(s.name.toLowerCase()) || (s.label && t.includes(s.label.toLowerCase())));
  if (named && /why|stop|degrad|down|cause|what happened|fix|check|reject/.test(t)) {
    const inc = named.incident!;
    const likely = inc.causes.find((c) => c.likelihood === "Most likely") ?? inc.causes[0];
    const ruledOut = inc.causes.filter((c) => c.likelihood === "Ruled out");
    const next = inc.action
      ? `If that doesn't explain it, I can ${inc.action.label.charAt(0).toLowerCase()}${inc.action.label.slice(1)} from its panel, which only changes Databahn's side.`
      : "Once you've checked, run a health check from its panel and I'll confirm the moment data arrives.";
    return `My first pass on ${named.name}. Most likely: ${likely.cause}. ${likely.evidence}${
      ruledOut.length ? ` Ruled out: ${ruledOut.map((c) => c.cause).join(", ")}.` : ""
    } Check first: ${inc.checks[0]}. ${next}`;
  }
  return null;
}

export function cruzRespond(
  userText: string,
  coldStorageConnected = false,
  connectorName?: string,
  connectorKind?: "source" | "destination" | "notification",
  subjects: TriageSubject[] = [],
): string {
  const health = healthReply(userText, subjects);
  if (health) return health;
  const hit = RULES.find((r) => r.match.test(userText));
  if (!hit) return FALLBACK;
  return typeof hit.reply === "function" ? hit.reply({ coldStorageConnected, connectorName, connectorKind }) : hit.reply;
}
