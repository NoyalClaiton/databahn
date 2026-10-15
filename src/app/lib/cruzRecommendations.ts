import type { ConnectedEntity, WizardState } from "./SessionContext";
import type { HealthSummary } from "./environment";

export interface CruzContextPanel {
  heading: string;
  /** Things Cruz has already handled, so the panel proves its usefulness
   * instead of sitting empty waiting to be asked a question. */
  handled: string[];
  watching?: string;
}

/** What Cruz is doing on this screen right now. Fills the assistant panel with
 * substance tied to real state rather than a lone greeting bubble. */
export function getCruzContext(
  pathname: string,
  wizard: WizardState | null,
  connected: ConnectedEntity[],
  coldStorageConnected = false,
  health?: HealthSummary,
): CruzContextPanel {
  if (wizard) {
    const step = wizard.stepLabel.toLowerCase();
    if (step.includes("deploy")) {
      return {
        heading: "Deploying to your firewall",
        handled: ["Wrote the syslog server profile", "Attached log forwarding to 4 security rules"],
        watching: "The PAN-OS commit is the slow part, I'll tell you the moment it lands.",
      };
    }
    if (step.includes("listener"))
      return {
        heading: `Setting up ${wizard.connectorName}`,
        handled: [
          "Provisioned your ingest address",
          "Pre-filled port 514 and UDP, the Palo Alto default",
          "Generated the exact PAN-OS command to paste",
        ],
        watching: "I'll detect the log format the moment data arrives.",
      };
    if (step.includes("waiting") || step.includes("test") || step.includes("checking")) {
      // Shared by every connector's verify step. Palo Alto genuinely
      // listens, the firewall pushes logs in on its own. Everything else
      // here, an Entra ID poll, a Sentinel or Splunk reachability check, is
      // Databahn reaching out, "watching for an inbound connection" has it
      // backwards for those, they were never waiting to be contacted.
      const isPaloAlto = wizard.connectorName === "Palo Alto";
      return isPaloAlto
        ? {
            heading: "Listening for your first events",
            handled: ["Opened the listener", "Watching for any inbound connection"],
            watching: "If nothing arrives in the next 20 seconds or so, I'll show you what to check.",
          }
        : {
            // "Read-only access" is a source-side claim, a destination test
            // is checking write access to deliver data, the opposite thing,
            // so this stays deliberately silent on which direction it is.
            heading: `Checking ${wizard.connectorName}`,
            handled: ["Sent a real connectivity check", "Watching for the response"],
            watching: "If it doesn't come back in the next 20 seconds or so, I'll show you what to check.",
          };
    }
    if (step.includes("log type")) {
      // This step is shared across connectors now, the copy can't keep
      // naming Palo Alto's own counts and format for every source that
      // reaches it.
      const isPaloAlto = wizard.connectorName === "Palo Alto";
      return {
        heading: "Choosing what to collect",
        handled: isPaloAlto
          ? [
              "Ranked all 13 PAN-OS log types by detection value per byte",
              "Pre-selected 10, sampling the two that carry 80% of the volume",
            ]
          : [
              `Ranked ${wizard.connectorName}'s log categories by detection value per byte`,
              "Pre-selected the highest-value categories, left niche ones off by default",
            ],
        watching: "Toggle anything and I'll re-estimate the daily volume.",
      };
    }
    if (step.includes("mapping")) {
      // Shared by Palo Alto and Entra ID, both real, different samples,
      // different formats, and a different number of fields, "PAN-OS" and
      // "6 of 7" are Palo Alto specific facts, not a generic mapping-step
      // description.
      const isPaloAlto = wizard.connectorName === "Palo Alto";
      return isPaloAlto
        ? {
            heading: "Format detected",
            handled: ["Identified PAN-OS from your sample", "Mapped 6 of 7 fields automatically", "Selected a matching parser"],
            watching: "Two matches are lower confidence, I flagged them inline.",
          }
        : {
            heading: "Format detected",
            handled: ["Identified the Graph API response format", "Mapped 4 of 5 fields automatically", "Selected a matching parser"],
            watching: "One match is lower confidence, I flagged it inline.",
          };
    }
    if (wizard.connectorKind === "notification" && (step.includes("connected") || step.includes("success")))
      return {
        heading: `${wizard.connectorName} is connected`,
        handled: ["Test message confirmed delivered", "Routing saved by severity"],
        watching: "When a source stops or a destination rejects data, the alert goes out there automatically.",
      };
    if (step.includes("connected") || step.includes("success"))
      // "Applied the default reduction rules" and "started routing to your
      // destinations" are both source-only facts, a destination doesn't
      // apply rules or route to other destinations, it's the thing being
      // routed to.
      return wizard.connectorKind === "source"
        ? {
            heading: `${wizard.connectorName} is live`,
            handled: ["Applied the default reduction rules", "Started routing to your destinations"],
            watching: "I'll flag it here if the source stops sending.",
          }
        : {
            heading: `${wizard.connectorName} is live`,
            handled: ["No further setup needed here", "Ready to receive your routed sources"],
            watching: "I'll flag it here if a connected source stops sending.",
          };
    if (step.includes("authenticate") || step.includes("connect"))
      // Shared by every generic connector's first step, whatever its actual
      // auth shape turns out to be (OAuth, a pasted token, a syslog port),
      // so this can't claim one specific mechanism without being wrong for
      // most of them. The four bespoke wizards each have their own,
      // mechanism-accurate copy elsewhere in this function.
      return {
        heading: `Connecting ${wizard.connectorName}`,
        handled: ["Loaded what this connector needs, read-only access only"],
        watching: "I'll validate everything the moment you continue.",
      };
    if (step.includes("review"))
      return {
        heading: "Access review",
        handled: ["Translated each scope into plain language"],
        watching: "Nothing here grants write access.",
      };
    return {
      heading: `Setting up ${wizard.connectorName}`,
      handled: [`Step ${wizard.stepIndex + 1} of ${wizard.totalSteps}`, "Nothing is sent until you finish"],
      watching: "Ask me anything about this step.",
    };
  }

  // The environment's count when there is one, so the sample environment's
  // 170 sources don't read as "no sources connected".
  const srcCount = health ? health.total : connected.filter((c) => c.kind === "source").length;
  const dstCount = health ? health.destTotal : connected.filter((c) => c.kind === "destination").length;

  if (pathname.startsWith("/notifications"))
    return {
      heading: "Where alerts go",
      handled: ["Critical and high alerts go out the moment they happen", "One message per problem, updated when it recovers"],
      watching: "Slack is the quickest to connect. Add PagerDuty if someone should be paged for critical alerts.",
    };

  // Outside a wizard, an open alert outranks anything else Cruz could say on
  // the overview screens. Cruz has already done the first pass of triage,
  // so it leads with where to look rather than "ask me."
  // Same count as the dashboard's Alerts heading (every alert, not just
  // incidents), led by the incidents themselves.
  const allAlerts = health?.alerts ?? [];
  const open = allAlerts.filter((a) => a.kind === "incident");
  if (open.length > 0 && (pathname === "/" || pathname.startsWith("/pipeline"))) {
    const critical = open.filter((a) => a.severity === "critical").length;
    return {
      heading: `${allAlerts.length} open alert${allAlerts.length === 1 ? "" : "s"}${critical ? `, ${critical} critical` : ""}`,
      handled: open.slice(0, 3).map((a) => (a.likelyCause ? `${a.title}. Likely: ${a.likelyCause}` : a.title)),
      watching: "Triage is ready on each one. I'll tell you if anything else stops, or one of these recovers.",
    };
  }

  if (pathname.startsWith("/pipeline"))
    return {
      ...(srcCount === 0
        ? {
            heading: "Nothing flowing yet",
            handled: ["No sources connected", "Reduction rules apply automatically once one is"],
            watching: "Connect a source and its data shows up here within a minute.",
          }
        : {
            heading: "Watching your pipeline",
            handled: [
              `Monitoring ${srcCount} source${srcCount === 1 ? "" : "s"} for schema drift`,
              "Applying reduction rules in-stream",
              coldStorageConnected
                ? "Routing filtered events to cold storage, not deleting them"
                : "No cold storage connected, filtered events aren't being retained",
            ],
            watching: "I'll flag it here if a source stops sending.",
          }),
    };
  if (pathname.startsWith("/search"))
    return srcCount > 0
      ? {
          heading: "Ready to search",
          handled: [
            `Indexed ${srcCount} connected source${srcCount === 1 ? "" : "s"}`,
            coldStorageConnected ? "Cold storage included in results" : "Cold storage not connected, filtered events aren't searchable",
          ],
          watching: "Results show where each record came from.",
        }
      : {
          heading: "Nothing to search yet",
          handled: ["No sources connected", "Search covers every source once one is connected"],
          watching: "Connect a source and this searches your real data.",
        };
  if (pathname.startsWith("/graph"))
    return {
      heading: "Reef is mapping entities",
      handled: ["Correlated users, devices, and addresses", "Flagged unscored cold-storage entities"],
    };
  if (pathname.startsWith("/destinations"))
    return {
      heading: "Choosing a destination",
      handled: [
        dstCount > 0 ? `${dstCount} destination already connected` : "No destination connected yet",
        "Connect one once, reuse it for every future source",
      ],
    };
  return {
    heading: srcCount > 0 ? "Your pipeline so far" : "Let's get you connected",
    handled:
      srcCount > 0
        ? [`${srcCount} source${srcCount === 1 ? "" : "s"} connected`, `${dstCount} destination${dstCount === 1 ? "" : "s"} connected`]
        : ["Nothing connected yet", "Palo Alto and Entra ID are the fastest to start with"],
    watching: srcCount > 0 ? undefined : "Pick any source and I'll handle the technical setup.",
  };
}

/**
 * Context-aware suggested questions, keyed to the current screen and wizard
 * step. This is the concrete answer to "Cruz should show recommendations at
 * every screen", not a static greeting, a live read of where the user is.
 */
export function getRecommendations(pathname: string, wizard: WizardState | null, health?: HealthSummary): string[] {
  const top = health?.alerts.find((a) => a.kind === "incident");
  if (!wizard && top && (pathname === "/" || pathname.startsWith("/pipeline")))
    return [`What should I check for ${top.open.name}?`, "What did I miss while sources were down?"];
  if (wizard) {
    const step = wizard.stepLabel.toLowerCase();
    if (step.includes("listener")) return ["Why UDP 514 for Palo Alto?", "Where do I find syslog settings on my firewall?"];
    if (step.includes("waiting") || step.includes("test") || step.includes("checking"))
      return wizard.connectorKind === "source"
        ? ["My source isn't sending anything, what do I check?"]
        : ["Nothing's connecting, what do I check?"];
    if (step.includes("deploy"))
      return ["Why does the PAN-OS commit take so long?", "Can I keep working while it commits?"];
    if (step.includes("log type"))
      return wizard.connectorName === "Palo Alto"
        ? ["Which log types actually matter?", "What does sampled mean?", "What if I turn Traffic off?"]
        : ["Which log types actually matter?", `What if I turn off Sign-in logs?`];
    if (step.includes("mapping"))
      return wizard.connectorName === "Palo Alto"
        ? ["What does PAN-OS format mean?", "What if a field mapping looks wrong?"]
        : ["What if a field mapping looks wrong?"];
    if (step.includes("authenticate")) return ["Why sign in instead of using a client secret?"];
    if (step.includes("review")) return ["What does AuditLog.Read.All actually grant?"];
    if (step.includes("connect") && wizard.connectorKind === "destination" && wizard.connectorName.includes("Sentinel"))
      return ["Where do I find my Sentinel workspace ID?", "Why is OAuth recommended here?"];
    if (step.includes("connect") && wizard.connectorName.includes("Splunk"))
      return ["Where do I find my Splunk HEC token?"];
    if (wizard.connectorKind === "notification")
      return step.includes("where")
        ? ["Which alerts should go here?", "What's the difference between critical and high?"]
        : ["What will a message look like?", "Who gets notified?"];
    if (step.includes("connected") || step.includes("success"))
      return wizard.connectorKind === "source"
        ? ["What happens to this data now?", "How do I add another source?"]
        : ["What happens to this data now?", "How do I add another destination?"];
    if (step.includes("connect")) return [`What do I need to connect ${wizard.connectorName}?`];
  }

  if (pathname.startsWith("/sources")) return ["Which source should I connect first?", "What's the fastest one to set up?"];
  if (pathname.startsWith("/destinations")) return ["Which destination should I pick?"];
  if (pathname.startsWith("/pipeline")) return ["What's a reduction rule?", "What does cold storage mean?"];
  if (pathname.startsWith("/search")) return ["What's the difference between raw and parsed?", "How do I search cold storage?"];
  if (pathname.startsWith("/graph")) return ["What do the dashed nodes mean?"];
  return ["How does Databahn work?", "Where should I start?"];
}
