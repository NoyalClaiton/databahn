import { useMemo } from "react";
import { useSession, type ConnectedEntity, type FlowRoute, type SourceStatusOverride } from "./SessionContext";
import { buildFlowNodes } from "./pipelineData";
import { CONNECTORS } from "@/app/data/connectors";
import {
  SAMPLE_FLEET, SAMPLE_DESTINATIONS, SEVERITY_FOR_AREA, seeded,
  inferGroup, inferCollection, inferCollector, ownerFor,
  type FleetSource, type FleetDestination, type HealthState, type SourceGroup, type Severity,
  type HealthCheck, type ImpactArea, type Incident,
} from "@/app/data/fleet";
import { categoriesForSource, liveReductionFactor, type ReductionRule } from "@/app/data/rules";
import type { FlowNode } from "@/app/components/shared/PipelineSankey";
import { ME, personById, type Owner } from "./people";

/** Override first (claimed, assigned, released here), then the sample's
 * own seeded owner. Only problems have owners. */
function resolveOwner(
  o: SourceStatusOverride | undefined,
  seed: { personId: string; minutesAgo: number; via: "app" | "slack" | "teams" } | undefined,
  now: number,
): Owner | undefined {
  if (o?.released) return undefined;
  if (o?.ackAt) {
    const person = personById(o.ownerId ?? ME);
    if (!person) return undefined;
    return {
      person,
      at: o.ackAt,
      via: o.ownerVia ?? "app",
      assignedBy: personById(o.assignedBy),
      previous: personById(o.previousOwnerId),
      isMe: person.id === ME,
    };
  }
  if (seed) {
    const person = personById(seed.personId);
    if (person) return { person, at: now - seed.minutesAgo * 60000, via: seed.via, isMe: person.id === ME };
  }
  return undefined;
}

/** Same conversion the pipeline diagram has always used, so a source's rate
 * here and on its diagram row are the same number. */
export const EPS_PER_GB_DAY = 14;

/** Rules drop whole events (dedupe, noise) and also trim fields, which only
 * shrinks bytes. So events fall by less than bytes do. */
const EVENT_SHARE_OF_REDUCTION = 0.75;

/** Reduction for connectors without hand-authored rules in this prototype.
 * Palo Alto and Entra ID use their live rules instead, so toggling a rule
 * still moves their numbers everywhere. */
const TYPE_REDUCTION: Record<string, number> = {
  fortinet: 0.44, checkpoint: 0.42, ciscoasa: 0.4, zscaler: 0.42, umbrella: 0.38, cloudflare: 0.35, zeek: 0.4,
  crowdstrike: 0.3, defender: 0.3, sentinelone: 0.28, "windows-events": 0.36, "linux-auditd": 0.33,
  okta: 0.22, duo: 0.15, cyberark: 0.1, "aws-cloudtrail": 0.28, "gcp-audit": 0.26, kubernetes: 0.4,
  proofpoint: 0.2, mimecast: 0.2, github: 0.12, salesforce: 0.12, box: 0.1, workday: 0.08, tenable: 0.15, qualys: 0.15,
};

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];
export const STATE_ORDER: HealthState[] = ["stopped", "degraded", "recovering", "paused", "learning", "healthy"];

/** Events per minute through each stage, the unit Databahn already tracks. */
export interface StageRates {
  received: number;
  processed: number;
  forwarded: number;
}

export interface SourceView extends FleetSource {
  name: string;
  vendor: string;
  color: string;
  sinceMin: number;
  normalEps: number;
  currentEps: number;
  epm: StageRates;
  /** Normal events per minute, for "x of normal". */
  normalEpm: number;
  /** GB/day arriving right now (0 while stopped). */
  gbIn: number;
  /** GB/day forwarded after processing and reduction. */
  gbOut: number;
  reduction: number;
  processedFraction: number;
  lastEventMin: number;
  parseErrorPct: number;
  healthCheck: HealthCheck & { checkedMinAgo: number };
  /** A destination this source feeds that isn't taking everything, so a
   * healthy source that isn't landing doesn't look like a silent one. */
  deliveryIssue?: string;
  /** Average share of this source's copies the destinations accept. */
  deliveredShare: number;
  destNames: string[];
  ackAt?: number;
  /** Who's handling the open problem (a person, unlike `owner`, the team). */
  assignee?: Owner;
  severity?: Severity;
  fromSession: boolean;
  /** Higher is more urgent: alert severity first, then how long it's lasted. */
  priority: number;
}

export interface DestinationView extends FleetDestination {
  name: string;
  color: string;
  sinceMin: number;
  sourceIds: string[];
  /** Events per minute the pipeline sends, and how many land. */
  sentEpm: number;
  deliveredEpm: number;
  acceptance: number;
  gbIn: number;
  lastDeliveryMin: number;
  healthCheck: HealthCheck & { checkedMinAgo: number };
  ackAt?: number;
  /** Who's handling the open problem (a person, unlike `owner`, the team). */
  assignee?: Owner;
  severity?: Severity;
  pause?: undefined;
  learning?: undefined;
  risk?: undefined;
  notice?: undefined;
}

export interface AlertTarget {
  kind: "source" | "destination";
  id: string;
  name: string;
}

export interface Alert {
  id: string;
  severity: Severity;
  area: ImpactArea;
  title: string;
  detail: string;
  /** The top line of triage, so the alert says where to look first. */
  likelyCause?: string;
  sinceMin: number;
  targets: AlertTarget[];
  open: AlertTarget;
  ackAt?: number;
  /** Who's handling the open problem (a person, unlike `owner`, the team). */
  assignee?: Owner;
  kind: "incident" | "risk" | "notice";
}

export interface HealthSummary {
  counts: Record<HealthState, number>;
  destCounts: Record<HealthState, number>;
  total: number;
  destTotal: number;
  /** Sources stopped, degraded or recovering, most urgent first. */
  issues: SourceView[];
  alerts: Alert[];
  severityCounts: Record<Severity, number>;
}

export interface Environment {
  isSample: boolean;
  sources: SourceView[];
  destinations: DestinationView[];
  edges: FlowRoute[];
  summary: HealthSummary;
}

export const GROUP_COLOR: Record<SourceGroup, string> = {
  "Network security": "#4a94f9",
  Endpoint: "#53d9ff",
  Identity: "#9b8cff",
  Cloud: "#0fb4ba",
  Email: "#f5a524",
  SaaS: "#29cc96",
  Vulnerability: "#ff7a59",
};

/** How long something fixed stays "recovering" before it's trusted as
 * healthy again; one good minute after an outage proves very little. */
const RECOVERY_WATCH_MIN = 30;

const SEV_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

type Resolvable = {
  state: HealthState;
  sinceMin?: number;
  incident?: Incident;
  recovered?: { downMin: number; cause: string };
  pause?: { reason: string; by: string; untilMin: number; indefinite?: boolean };
  risk?: unknown;
};

/** Applies what the user did (fixed, paused, renewed) over what the
 * environment reports. Shared by sources and destinations. */
function resolveState<T extends Resolvable>(item: T, o: SourceStatusOverride | undefined, now: number): T {
  const next = { ...item };
  if (o?.riskResolved) next.risk = undefined;
  if (o?.pausedUntil && o.pausedUntil > now) {
    const indefinite = o.pausedUntil >= Number.MAX_SAFE_INTEGER;
    return {
      ...next,
      state: "paused",
      sinceMin: Math.max(0, (now - (o.pausedAt ?? now)) / 60000),
      pause: {
        reason: o.pauseReason?.trim() || "Paused from Databahn",
        by: "J. Rivera",
        untilMin: indefinite ? Infinity : (o.pausedUntil - now) / 60000,
        indefinite,
      },
    };
  }
  // Resumed by hand: a pause that came with the source (planned elsewhere)
  // ends now, and it's watched like any other source again.
  if (o?.resumedAt && item.state === "paused") {
    return { ...next, state: "healthy", sinceMin: (now - o.resumedAt) / 60000, pause: undefined } as T;
  }
  if (o?.recoveredAt) {
    const m = (now - o.recoveredAt) / 60000;
    if (m >= RECOVERY_WATCH_MIN) return { ...next, state: "healthy", sinceMin: m, incident: undefined, recovered: undefined };
    return {
      ...next,
      state: "recovering",
      sinceMin: m,
      recovered: { downMin: o.downMin ?? 0, cause: item.incident?.groupTitle ?? item.incident?.causes[0]?.cause ?? "Resolved from Databahn" },
    };
  }
  return next;
}

/** A source connected in this session, in the same shape as the sample. It
 * starts in "learning": Databahn doesn't yet know its normal volume, so it
 * can't honestly call a quiet hour a problem. */
function fromConnected(connected: ConnectedEntity[], routes: FlowRoute[], now: number): FleetSource[] {
  const { sourceNodes, edges } = buildFlowNodes(connected, routes);
  return sourceNodes.map((n) => {
    const entity = connected.find((c) => c.name === n.name);
    const days = entity ? (now - entity.connectedAt) / 86400000 : 0;
    const group = inferGroup(n.id);
    return {
      id: n.id,
      connectorId: n.id,
      label: "",
      group,
      collection: inferCollection(n.id),
      collector: inferCollector(n.id),
      owner: ownerFor(group),
      gbPerDay: n.volume,
      destIds: edges.filter((e) => e.sourceId === n.id).map((e) => e.destId),
      cadenceMin: 0,
      firstEventDaysAgo: Math.floor(days),
      state: "learning" as const,
      sinceMin: entity ? (now - entity.connectedAt) / 60000 : 0,
      learning: { connectedDaysAgo: Math.floor(days), daysLeft: Math.max(1, 7 - Math.floor(days)) },
      incidents30d: 0,
    };
  });
}

const isProblem = (state: HealthState) => state === "stopped" || state === "degraded";

function acceptanceOf(d: { state: HealthState; incident?: Incident }) {
  if (d.state === "stopped") return 0;
  if (d.state === "degraded") return 1 - (d.incident?.rejectedPct ?? 0) / 100;
  return 1;
}

function defaultCheck(collection: string, collector: string | undefined): HealthCheck {
  if (collection === "syslog") return { status: "passed", detail: `Listener ${collector ?? ""} receiving`.trim() };
  if (collection === "agent") return { status: "passed", detail: "Agents reporting, heartbeat OK" };
  return { status: "passed", detail: "API reachable, auth valid" };
}

export function buildEnvironment(
  connected: ConnectedEntity[],
  routes: FlowRoute[],
  rules: ReductionRule[],
  sample: boolean,
  overrides: Record<string, SourceStatusOverride>,
  now = Date.now(),
): Environment {
  /* Destinations first: whether each accepts data feeds every source's
     delivered numbers. */
  const sessionDestIds = buildFlowNodes(connected, routes).destNodes.map((d) => d.id);
  const destDefs: FleetDestination[] = sessionDestIds.map((id) => ({ id, state: "healthy", incidents30d: 0 }));
  if (sample)
    for (const d of SAMPLE_DESTINATIONS) {
      const i = destDefs.findIndex((x) => x.id === d.id);
      if (i >= 0) destDefs[i] = d;
      else destDefs.push(d);
    }
  // Overrides for destinations are keyed `dest:<id>` so they can't collide
  // with a source of the same connector id.
  const resolvedDests = destDefs.filter((d) => !overrides[`dest:${d.id}`]?.removed).map((d) => resolveState(d, overrides[`dest:${d.id}`], now));
  const destById = new Map(resolvedDests.map((d) => [d.id, d]));

  const raw: Array<FleetSource & { fromSession: boolean }> = [
    ...fromConnected(connected, routes, now).map((s) => ({ ...s, fromSession: true })),
    ...(sample ? SAMPLE_FLEET.map((s) => ({ ...s, fromSession: false })) : []),
  ]
    .filter((s) => !overrides[s.id]?.removed)
    .map((s) => (overrides[s.id]?.destIds ? { ...s, destIds: overrides[s.id].destIds! } : s));

  const reductionCache = new Map<string, number>();
  const reductionFor = (connectorId: string) => {
    if (!reductionCache.has(connectorId)) {
      reductionCache.set(
        connectorId,
        categoriesForSource(connectorId).length > 0
          ? liveReductionFactor(rules, [{ id: connectorId, volume: 1 }])
          : TYPE_REDUCTION[connectorId] ?? 0.25,
      );
    }
    return reductionCache.get(connectorId)!;
  };

  const sources: SourceView[] = raw.map((base) => {
    const src = resolveState(base, overrides[base.id], now);
    const def = CONNECTORS.find((c) => c.id === src.connectorId);
    const vendor = def?.name ?? src.connectorId;
    const rand = seeded(`${src.id}-metrics`);
    const sinceMin = src.sinceMin ?? 0;
    const active = isProblem(src.state) ? src.incident : undefined;
    const receivedFactor =
      src.state === "stopped" || src.state === "paused" ? 0 : active?.receivedFactor ?? 1;
    const noise = 0.94 + rand() * 0.12;
    const parseErrorPct = active?.parseErrorPct ?? Math.round(rand() * 30) / 100;
    const processedFraction = active?.processedFraction ?? 1 - parseErrorPct / 100;
    const reduction = reductionFor(src.connectorId);
    const normalEps = src.gbPerDay * EPS_PER_GB_DAY;
    const received = normalEps * 60 * receivedFactor * noise;
    const processed = received * processedFraction;
    const forwarded = processed * (1 - reduction * EVENT_SHARE_OF_REDUCTION);
    const gbIn = src.gbPerDay * receivedFactor * noise;

    const validDests = src.destIds.filter((d) => destById.has(d));
    const dests = validDests.map((id) => destById.get(id)!);
    const worst = dests
      .filter((d) => d.state === "stopped" || d.state === "degraded")
      .sort((a, b) => acceptanceOf(a) - acceptanceOf(b))[0];
    const destName = (id: string) => CONNECTORS.find((c) => c.id === id)?.name ?? id;

    const severity: Severity | undefined = active
      ? SEVERITY_FOR_AREA[active.area]
      : src.risk
        ? "medium"
        : src.notice
          ? "low"
          : undefined;
    const healthCheck = active?.healthCheck ?? defaultCheck(src.collection, src.collector);

    return {
      ...src,
      name: src.label ? `${vendor} · ${src.label}` : vendor,
      vendor,
      color: def?.brandColor ?? "#4a94f9",
      sinceMin,
      normalEps,
      currentEps: received / 60,
      epm: { received, processed, forwarded },
      normalEpm: normalEps * 60,
      gbIn,
      gbOut: gbIn * processedFraction * (1 - reduction),
      reduction,
      processedFraction,
      lastEventMin:
        src.state === "stopped" || src.state === "paused" ? sinceMin : src.cadenceMin > 0 ? rand() * src.cadenceMin * 0.8 : 0,
      parseErrorPct,
      healthCheck: { ...healthCheck, checkedMinAgo: 1 + Math.floor(rand() * 4) },
      deliveryIssue:
        worst && receivedFactor > 0
          ? worst.state === "stopped"
            ? `${destName(worst.id)} not accepting`
            : `${destName(worst.id)} rejecting ${worst.incident?.rejectedPct}%`
          : undefined,
      deliveredShare: dests.length ? dests.reduce((a, d) => a + acceptanceOf(d), 0) / dests.length : 0,
      destIds: validDests,
      destNames: validDests.map(destName),
      ...(() => {
        const assignee = isProblem(src.state) ? resolveOwner(overrides[src.id], src.seedOwner, now) : undefined;
        return { assignee, ackAt: assignee?.at };
      })(),
      severity,
      fromSession: base.fromSession,
      priority: active ? SEV_RANK[SEVERITY_FOR_AREA[active.area]] * 10000 + sinceMin : src.state === "recovering" ? 1 : 0,
    };
  });

  const edges: FlowRoute[] = sources.flatMap((s) => s.destIds.map((destId) => ({ sourceId: s.id, destId })));

  const destinations: DestinationView[] = resolvedDests.map((d) => {
    const def = CONNECTORS.find((c) => c.id === d.id);
    const feeding = sources.filter((s) => s.destIds.includes(d.id));
    const sentEpm = feeding.reduce((a, s) => a + s.epm.forwarded, 0);
    const acceptance = acceptanceOf(d);
    const rand = seeded(`${d.id}-dest`);
    const active = isProblem(d.state) ? d.incident : undefined;
    return {
      ...d,
      name: def?.name ?? d.id,
      color: def?.brandColor ?? "#53d9ff",
      sinceMin: d.sinceMin ?? 0,
      sourceIds: feeding.map((s) => s.id),
      sentEpm,
      deliveredEpm: sentEpm * acceptance,
      acceptance,
      gbIn: feeding.reduce((a, s) => a + s.gbOut, 0),
      lastDeliveryMin: d.state === "stopped" ? d.sinceMin ?? 0 : 0,
      healthCheck: {
        ...(active?.healthCheck ?? { status: "passed" as const, detail: "Accepting data, credentials valid" }),
        checkedMinAgo: 1 + Math.floor(rand() * 4),
      },
      ...(() => {
        const assignee = isProblem(d.state) ? resolveOwner(overrides[`dest:${d.id}`], d.seedOwner, now) : undefined;
        return { assignee, ackAt: assignee?.at };
      })(),
      severity: active ? SEVERITY_FOR_AREA[active.area] : undefined,
    };
  });

  /* Alerts: one per root cause, ranked by severity, then longest-running. */
  const alerts: Alert[] = [];
  const grouped = new Set<string>();
  for (const s of sources) {
    if (s.incident && isProblem(s.state)) {
      const inc = s.incident;
      if (inc.groupId) {
        if (grouped.has(inc.groupId)) continue;
        grouped.add(inc.groupId);
        const members = sources.filter((m) => m.incident?.groupId === inc.groupId && isProblem(m.state));
        alerts.push({
          id: inc.groupId,
          kind: "incident",
          severity: SEVERITY_FOR_AREA[inc.area],
          area: inc.area,
          title: inc.groupTitle ?? `${members.length} sources stopped`,
          detail: inc.impact,
          likelyCause: inc.causes[0]?.cause,
          sinceMin: Math.max(...members.map((m) => m.sinceMin)),
          targets: members.map((m) => ({ kind: "source" as const, id: m.id, name: m.name })),
          open: { kind: "source", id: s.id, name: s.name },
          ackAt: members.find((m) => m.assignee)?.ackAt,
          assignee: members.find((m) => m.assignee)?.assignee,
        });
        continue;
      }
      alerts.push({
        id: `src:${s.id}`,
        kind: "incident",
        severity: SEVERITY_FOR_AREA[inc.area],
        area: inc.area,
        title:
          s.state === "stopped"
            ? `${s.name} stopped sending`
            : inc.parseErrorPct
              ? `${s.name}: ${inc.parseErrorPct}% of events failing to parse`
              : inc.backlogMin
                ? `${s.name}: delivery ${inc.backlogMin} min behind`
                : `${s.name} receiving ${Math.round((inc.receivedFactor ?? 1) * 100)}% of normal`,
        detail: inc.impact,
        likelyCause: inc.causes[0]?.cause,
        sinceMin: s.sinceMin,
        targets: [{ kind: "source", id: s.id, name: s.name }],
        open: { kind: "source", id: s.id, name: s.name },
        ackAt: s.ackAt,
        assignee: s.assignee,
      });
    }
  }
  for (const d of destinations) {
    if (d.incident && isProblem(d.state)) {
      alerts.push({
        id: `dest:${d.id}`,
        kind: "incident",
        severity: SEVERITY_FOR_AREA[d.incident.area],
        area: d.incident.area,
        title: d.state === "stopped" ? `${d.name} is not accepting data` : `${d.name} is rejecting ${d.incident.rejectedPct}% of events`,
        detail: d.incident.impact,
        likelyCause: d.incident.causes[0]?.cause,
        sinceMin: d.sinceMin,
        targets: [{ kind: "destination", id: d.id, name: d.name }],
        open: { kind: "destination", id: d.id, name: d.name },
        ackAt: d.ackAt,
        assignee: d.assignee,
      });
    }
  }
  for (const s of sources) {
    if (s.risk)
      alerts.push({
        id: `risk:${s.id}`,
        kind: "risk",
        severity: "medium",
        area: "risk",
        title: `${s.name}: ${s.risk.text.charAt(0).toLowerCase()}${s.risk.text.slice(1)}`,
        detail: s.risk.detail,
        sinceMin: 0,
        targets: [{ kind: "source", id: s.id, name: s.name }],
        open: { kind: "source", id: s.id, name: s.name },
      });
    if (s.notice)
      alerts.push({
        id: `notice:${s.id}`,
        kind: "notice",
        severity: "low",
        area: "info",
        title: `${s.name}: ${s.notice.title}`,
        detail: s.notice.detail,
        sinceMin: 0,
        targets: [{ kind: "source", id: s.id, name: s.name }],
        open: { kind: "source", id: s.id, name: s.name },
      });
  }
  alerts.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.sinceMin - a.sinceMin);

  const counts = Object.fromEntries(STATE_ORDER.map((st) => [st, 0])) as Record<HealthState, number>;
  for (const s of sources) counts[s.state]++;
  const destCounts = Object.fromEntries(STATE_ORDER.map((st) => [st, 0])) as Record<HealthState, number>;
  for (const d of destinations) destCounts[d.state]++;
  const severityCounts = Object.fromEntries(SEVERITY_ORDER.map((sv) => [sv, 0])) as Record<Severity, number>;
  for (const a of alerts) severityCounts[a.severity]++;

  return {
    isSample: sample,
    sources,
    destinations,
    edges,
    summary: {
      counts,
      destCounts,
      total: sources.length,
      destTotal: destinations.length,
      issues: sources
        .filter((s) => isProblem(s.state) || s.state === "recovering")
        .sort((a, b) => b.priority - a.priority),
      alerts,
      severityCounts,
    },
  };
}

export function useEnvironment(): Environment {
  const { connected, routes, rules, sampleEnvironment, sourceStatus } = useSession();
  return useMemo(
    () => buildEnvironment(connected, routes, rules, sampleEnvironment, sourceStatus),
    [connected, routes, rules, sampleEnvironment, sourceStatus],
  );
}

/* ------------------------------------------------------------------ */
/* Diagram nodes                                                        */
/* ------------------------------------------------------------------ */

/** Past this many sources the diagram groups them by type. 170 rows can't
 * be read as a diagram, and the per-source table below it is where
 * individual sources are compared anyway. */
export const GROUP_THRESHOLD = 12;

const worstState = (states: HealthState[]): HealthState => STATE_ORDER.find((st) => states.includes(st)) ?? "healthy";

function healthLabel(sources: SourceView[]) {
  const parts: string[] = [];
  const n = (st: HealthState) => sources.filter((s) => s.state === st).length;
  if (n("stopped")) parts.push(`${n("stopped")} stopped`);
  if (n("degraded")) parts.push(`${n("degraded")} degraded`);
  return parts.join(" · ");
}

export function diagramNodes(env: Environment, range = "24H"): {
  sourceNodes: FlowNode[];
  destNodes: FlowNode[];
  edges: FlowRoute[];
  grouped: boolean;
} {
  // Real totals for the range, per source, from the same funnel the table
  // and drawer use, so every number on the page agrees.
  const totals = new Map(env.sources.map((s) => [s.id, funnelFor(s, range, "total", env.destinations).received] as const));
  const sum = (members: SourceView[]) =>
    members.reduce((a, m) => ({ events: a.events + (totals.get(m.id)?.events ?? 0), gb: a.gb + (totals.get(m.id)?.gb ?? 0) }), { events: 0, gb: 0 });

  const destNodes: FlowNode[] = env.destinations.map((d) => ({
    id: d.id,
    name: d.name,
    volume: 0,
    color: d.color,
    health:
      d.state === "stopped"
        ? { state: "stopped", label: "Not accepting" }
        : d.state === "degraded"
          ? { state: "degraded", label: `Rejecting ${d.incident?.rejectedPct}%` }
          : { state: d.state, label: "" },
  }));

  if (env.sources.length <= GROUP_THRESHOLD) {
    return {
      sourceNodes: env.sources.map((s) => ({
        id: s.id,
        name: s.name,
        volume: s.gbIn,
        color: s.color,
        reduction: s.reduction,
        health: { state: s.state, label: isProblem(s.state) ? s.state : "" },
        total: totals.get(s.id),
        rateEpm: s.epm.received,
      })),
      destNodes,
      edges: env.edges,
      grouped: false,
    };
  }

  const groups = new Map<SourceGroup, SourceView[]>();
  for (const s of env.sources) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group)!.push(s);
  }
  const sourceNodes: FlowNode[] = Array.from(groups.entries())
    .map(([group, members]) => {
      const volume = members.reduce((a, s) => a + s.gbIn, 0);
      return {
        id: `group:${group}`,
        name: `${group} · ${members.length}`,
        volume,
        color: GROUP_COLOR[group],
        reduction: volume > 0 ? members.reduce((a, s) => a + s.gbIn * s.reduction, 0) / volume : 0,
        health: { state: worstState(members.map((m) => m.state)), label: healthLabel(members) },
        total: sum(members),
        rateEpm: members.reduce((a, m) => a + m.epm.received, 0),
      };
    })
    .sort((a, b) => b.volume - a.volume);

  const edges: FlowRoute[] = [];
  for (const [group, members] of groups) {
    for (const d of env.destinations) {
      if (members.some((m) => m.destIds.includes(d.id))) edges.push({ sourceId: `group:${group}`, destId: d.id });
    }
  }
  return { sourceNodes, destNodes, edges, grouped: true };
}

/* ------------------------------------------------------------------ */
/* Trend                                                                */
/* ------------------------------------------------------------------ */

export const RANGE_MINUTES: Record<string, number> = { "1H": 60, "24H": 1440, "7D": 10080, "30D": 43200 };
const RANGE_POINTS: Record<string, number> = { "1H": 12, "24H": 24, "7D": 28, "30D": 30 };

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/**
 * Events/sec received over the selected range, oldest first. Each point
 * covers an equal slice of the range, and an outage removes exactly the
 * share of a slice it overlaps, so a 2-hour stop is a cliff at 1H, a dip at
 * 24H and a barely visible notch at 30D, which is the honest picture at each
 * scale. `null` where the source wasn't connected yet.
 */
export function trendPoints(s: SourceView, range: string): (number | null)[] {
  const span = RANGE_MINUTES[range] ?? 1440;
  const n = RANGE_POINTS[range] ?? 24;
  const step = span / n;
  const rand = seeded(`${s.id}-trend-${range}`);
  const out: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    const end = (n - 1 - i) * step; // minutes ago, newer edge
    const start = end + step; // older edge
    if (s.state === "learning" && s.learning && start > (s.learning.connectedDaysAgo + 1) * 1440) {
      out.push(null);
      continue;
    }
    // Gentle daily rhythm plus noise, so a real drop reads as a drop.
    const hour = ((Date.now() / 60000 - (start + end) / 2) / 60) % 24;
    const diurnal = 1 + 0.12 * Math.sin(((hour - 8) / 24) * Math.PI * 2);
    let v = s.normalEps * diurnal * (0.92 + rand() * 0.16);
    const inWindow = overlap(end, start, 0, s.sinceMin) / step;
    if (s.state === "stopped" || s.state === "paused") v *= 1 - inWindow;
    if (s.state === "degraded") v *= 1 + inWindow * ((s.incident?.receivedFactor ?? 1) - 1);
    if (s.state === "recovering" && s.recovered) {
      v *= 1 - overlap(end, start, s.sinceMin, s.sinceMin + s.recovered.downMin) / step;
    }
    out.push(Math.max(0, v));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Funnel: received → processed → reduced → delivered                   */
/* ------------------------------------------------------------------ */

export interface Amount {
  events: number;
  gb: number;
}

export interface Funnel {
  received: Amount;
  processed: Amount;
  reduced: Amount;
  forwarded: Amount;
  /** Average per destination copy, so one rejecting destination shows. */
  delivered: Amount;
  perDestination: { id: string; name: string; state: HealthState; amount: Amount; acceptance: number }[];
}

const scale = (a: Amount, f: number): Amount => ({ events: a.events * f, gb: a.gb * f });
const minus = (a: Amount, b: Amount): Amount => ({ events: a.events - b.events, gb: a.gb - b.gb });

/**
 * What one source has put through each stage, as either a per-minute rate
 * (right now) or a total over the selected range. Totals follow the trend
 * line, so an outage earlier in the range shows up as less received, and a
 * destination's outage reduces only the part of the range it overlapped.
 */
export function funnelFor(s: SourceView, range: string, mode: "rate" | "total", destinations: DestinationView[]): Funnel {
  const minutes = RANGE_MINUTES[range] ?? 1440;
  let received: Amount;
  let processedFraction: number;
  if (mode === "rate") {
    received = { events: s.epm.received, gb: s.gbIn / 1440 };
    processedFraction = s.processedFraction;
  } else {
    const pts = trendPoints(s, range);
    const factor = s.normalEps > 0 ? pts.reduce<number>((a, p) => a + (p ?? 0), 0) / pts.length / s.normalEps : 0;
    received = { events: s.normalEps * 60 * minutes * factor, gb: ((s.gbPerDay * minutes) / 1440) * factor };
    // A backlog clears over the range; only parse failures are truly lost.
    processedFraction = 1 - s.parseErrorPct / 100;
  }
  const processed = scale(received, processedFraction);
  const reduced: Amount = { events: processed.events * s.reduction * EVENT_SHARE_OF_REDUCTION, gb: processed.gb * s.reduction };
  const forwarded = minus(processed, reduced);
  const perDestination = s.destIds.map((id) => {
    const d = destinations.find((x) => x.id === id);
    let acceptance = d ? d.acceptance : 1;
    if (d && mode === "total" && d.acceptance < 1) {
      const share = Math.min(d.sinceMin, minutes) / minutes;
      acceptance = 1 - share * (1 - d.acceptance);
    }
    return { id, name: d?.name ?? id, state: d?.state ?? "healthy", amount: scale(forwarded, acceptance), acceptance };
  });
  const delivered: Amount = perDestination.length
    ? {
        events: perDestination.reduce((a, p) => a + p.amount.events, 0) / perDestination.length,
        gb: perDestination.reduce((a, p) => a + p.amount.gb, 0) / perDestination.length,
      }
    : { events: 0, gb: 0 };
  return { received, processed, reduced, forwarded, delivered, perDestination };
}

/** The whole environment's funnel, for the executive view. */
export function totalFunnel(env: Environment, range: string, mode: "rate" | "total"): Omit<Funnel, "perDestination"> {
  const zero = { events: 0, gb: 0 };
  const sum = { received: { ...zero }, processed: { ...zero }, reduced: { ...zero }, forwarded: { ...zero }, delivered: { ...zero } };
  for (const s of env.sources) {
    const f = funnelFor(s, range, mode, env.destinations);
    for (const k of ["received", "processed", "reduced", "forwarded", "delivered"] as const) {
      sum[k].events += f[k].events;
      sum[k].gb += f[k].gb;
    }
  }
  return sum;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                           */
/* ------------------------------------------------------------------ */

export function fmtDuration(min: number) {
  const m = Math.round(min);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  if (m < 1440) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h}h ${r}m` : `${h}h`;
  }
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return h ? `${d}d ${h}h` : `${d}d`;
}

export const fmtAgo = (min: number) => (min < 1 ? "just now" : `${fmtDuration(min)} ago`);

export function clockAt(minutesAgo: number) {
  const d = new Date(Date.now() - minutesAgo * 60000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function dateAt(daysAgo: number) {
  return new Date(Date.now() - daysAgo * 86400000).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

export const fmtEpsValue = (eps: number) =>
  eps >= 1000 ? `${(eps / 1000).toFixed(eps >= 10000 ? 0 : 1)}K` : `${Math.round(eps)}`;

/** Event counts at any scale: 812, 48K, 3.4M, 1.2B. */
export function fmtCount(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return `${Math.round(n)}`;
}

/** Sizes from GB, stepping down to MB for per-minute rates. */
export function fmtSize(gb: number) {
  if (gb <= 0) return "0 GB";
  if (gb < 1) return `${Math.round(gb * 1024)} MB`;
  if (gb < 1024) return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`;
  return `${(gb / 1024).toFixed(1)} TB`;
}

/* ------------------------------------------------------------------ */
/* Catalog summary                                                      */
/* ------------------------------------------------------------------ */

export interface ConnectorSummary {
  /** Sources of this type connected, or 1 for a connected destination. */
  count: number;
  stopped: number;
  degraded: number;
  gbPerDay: number;
  /** Destinations only. */
  state?: HealthState;
  sourcesRouted?: number;
  /** Connected in this session's walkthrough, so it can be disconnected. */
  fromSession: boolean;
}

/** What's connected, per catalog entry, from the same environment Pipeline
 * reads, so a catalog card and a Pipeline group always agree. */
export function connectorSummary(env: Environment): Record<string, ConnectorSummary> {
  const out: Record<string, ConnectorSummary> = {};
  for (const s of env.sources) {
    const c = (out[s.connectorId] ??= { count: 0, stopped: 0, degraded: 0, gbPerDay: 0, fromSession: false });
    c.count++;
    if (s.state === "stopped") c.stopped++;
    if (s.state === "degraded") c.degraded++;
    c.gbPerDay += s.gbIn;
    if (s.fromSession) c.fromSession = true;
  }
  for (const d of env.destinations) {
    out[d.id] = {
      count: 1,
      stopped: d.state === "stopped" ? 1 : 0,
      degraded: d.state === "degraded" ? 1 : 0,
      gbPerDay: d.gbIn,
      state: d.state,
      sourcesRouted: d.sourceIds.length,
      fromSession: !SAMPLE_DESTINATIONS.some((x) => x.id === d.id) || !env.isSample,
    };
  }
  return out;
}
