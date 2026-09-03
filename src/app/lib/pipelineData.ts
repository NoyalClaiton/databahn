import type { ConnectedEntity, FlowRoute } from "./SessionContext";
import type { FlowNode } from "@/app/components/shared/PipelineSankey";
import { CONNECTORS } from "@/app/data/connectors";
import { liveReductionFactor, type ReductionRule } from "@/app/data/rules";

/** GB/day ingested per source. Firewalls dominate volume, identity and audit
 * feeds are far smaller, which is what makes the reduction story land. */
const SOURCE_VOLUME: Record<string, number> = {
  paloalto: 820,
  fortinet: 640,
  crowdstrike: 410,
  "aws-cloudtrail": 295,
  defender: 260,
  entraid: 140,
  okta: 95,
  "gcp-audit": 180,
};

/**
 * Single source of truth for turning real session state into pipeline flow
 * nodes. Both Dashboard and Pipeline overview read from here, so they can
 * never diverge into one showing fabricated data while the other is honest
 * about what's actually connected.
 */
/** USD per GB ingested, by destination. Placeholder list-price estimates, not
 * contract rates: real agreements are negotiated well below list, which is why
 * every figure derived from these is labelled an estimate and shows the rate it
 * used rather than presenting a single unexplained number. */
const INGEST_RATE_PER_GB: Record<string, number> = {
  sentinel: 4.3,
  splunk: 5.0,
  "google-secops": 3.2,
  qradar: 4.0,
  exabeam: 3.5,
  securonix: 3.4,
  devo: 3.8,
  sumologic: 3.0,
  elastic: 2.2,
  datadog: 2.5,
  newrelic: 2.0,
  snowflake: 0.85,
  databricks: 0.9,
  clickhouse: 0.6,
};
const DEFAULT_INGEST_RATE = 3.0;

export interface DestinationSaving {
  id: string;
  name: string;
  rate: number;
  gbPerDayFiltered: number;
  monthlyUsd: number;
}

export interface SourceSaving {
  id: string;
  name: string;
  color: string;
  /** Raw GB/day this source produces, before any rule runs. */
  gbPerDay: number;
  gbPerDayFiltered: number;
  /** This source's own reduction rate, 0-1. Sources differ a lot: a firewall's
   * traffic logs are far more reducible than an identity audit feed. */
  reductionFactor: number;
  monthlyUsd: number;
  /** How many destinations this source feeds. Filtering pays off once per
   * destination, since the same GB would otherwise be ingested (and billed) by
   * each one separately. */
  destinationCount: number;
  /** No destination routed yet, so `monthlyUsd` is what this source *would*
   * save at a typical rate rather than money currently being saved. */
  isPotential: boolean;
}

export interface Savings {
  perSource: SourceSaving[];
  perDestination: DestinationSaving[];
  /** Unique source GB/day removed, not double-counted per destination. */
  gbPerDayFiltered: number;
  monthlyUsd: number;
  annualUsd: number;
  /** Nothing is routed anywhere yet, so every figure is a projection. */
  isPotential: boolean;
}

const rateFor = (destId: string) => INGEST_RATE_PER_GB[destId] ?? DEFAULT_INGEST_RATE;

/**
 * What reduction is worth in money rather than percent, broken down per source
 * and per destination. Derived from the same nodes and edges the pipeline
 * diagram renders, and from the same live `rules` array the pipeline's
 * percentage reads, so the two pages can never tell different stories about
 * the same traffic.
 *
 * Per-source and per-destination totals are computed from one shared
 * per-source filtered-volume figure, so the two breakdowns always add up to
 * the same headline number.
 */
export function buildSavings(
  sourceNodes: FlowNode[],
  destNodes: FlowNode[],
  edges: FlowRoute[],
  rules: ReductionRule[],
): Savings {
  // Per source, not one global factor: a global average would credit a quiet
  // identity feed with the firewall's reducibility and vice versa.
  const filteredBySource = new Map(
    sourceNodes.map((s) => [s.id, s.volume * liveReductionFactor(rules, [s])] as const),
  );

  const perSource: SourceSaving[] = sourceNodes
    .map((s) => {
      const dests = destNodes.filter((d) => edges.some((e) => e.sourceId === s.id && e.destId === d.id));
      const gbPerDayFiltered = filteredBySource.get(s.id) ?? 0;
      // With nowhere routed there's no real rate to price against, so this
      // becomes a projection at a typical rate rather than a claim.
      const isPotential = dests.length === 0;
      const summedRate = isPotential ? DEFAULT_INGEST_RATE : dests.reduce((a, d) => a + rateFor(d.id), 0);
      return {
        id: s.id,
        name: s.name,
        color: s.color,
        gbPerDay: s.volume,
        gbPerDayFiltered,
        reductionFactor: s.volume > 0 ? gbPerDayFiltered / s.volume : 0,
        monthlyUsd: gbPerDayFiltered * 30 * summedRate,
        destinationCount: dests.length,
        isPotential,
      };
    })
    .sort((a, b) => b.monthlyUsd - a.monthlyUsd);

  const perDestination: DestinationSaving[] = destNodes.map((d) => {
    const gbPerDayFiltered = sourceNodes
      .filter((s) => edges.some((e) => e.sourceId === s.id && e.destId === d.id))
      .reduce((a, s) => a + (filteredBySource.get(s.id) ?? 0), 0);
    const rate = rateFor(d.id);
    return { id: d.id, name: d.name, rate, gbPerDayFiltered, monthlyUsd: gbPerDayFiltered * 30 * rate };
  });

  const monthlyUsd = perSource.reduce((a, s) => a + s.monthlyUsd, 0);
  return {
    perSource,
    perDestination,
    gbPerDayFiltered: Array.from(filteredBySource.values()).reduce((a, v) => a + v, 0),
    monthlyUsd,
    annualUsd: monthlyUsd * 12,
    isPotential: perSource.length > 0 && perSource.every((s) => s.isPotential),
  };
}

export interface ConnectorLiveState {
  /** Sources only: raw volume and how much of it the rules remove. */
  gbPerDay?: number;
  reductionPct?: number;
  /** Destinations only: what this one charges per GB. */
  rate?: number;
  /** Destinations this source feeds, or sources feeding this destination. */
  linked: string[];
}

/**
 * What a connected connector is actually doing right now, keyed by connector
 * id. A catalog card's data-type pills answer "what could this deliver", which
 * is the right question until the moment you connect it and the wrong one
 * forever after: they keep advertising all thirteen Palo Alto log types when
 * the wizard only turned on four. Once connected the card should report state,
 * and it should read from the same numbers the pipeline and dashboard use.
 */
export function buildConnectorLiveState(
  connected: ConnectedEntity[],
  routes: FlowRoute[],
  rules: ReductionRule[],
): Record<string, ConnectorLiveState> {
  const { sourceNodes, destNodes, edges } = buildFlowNodes(connected, routes);
  const out: Record<string, ConnectorLiveState> = {};

  for (const s of sourceNodes) {
    out[s.id] = {
      gbPerDay: s.volume,
      reductionPct: Math.round(liveReductionFactor(rules, [s]) * 100),
      linked: destNodes.filter((d) => edges.some((e) => e.sourceId === s.id && e.destId === d.id)).map((d) => d.name),
    };
  }
  for (const d of destNodes) {
    out[d.id] = {
      rate: rateFor(d.id),
      linked: sourceNodes.filter((s) => edges.some((e) => e.sourceId === s.id && e.destId === d.id)).map((s) => s.name),
    };
  }
  return out;
}

/** Average security-log event size. Used only to express filtered volume in
 * events rather than gigabytes, since "8.6M events an hour" is what an analyst
 * pictures and "339 GB/day" is what a bill shows. */
const BYTES_PER_EVENT = 1500;

const fmtCount = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n));

export interface ActivityEvent {
  id: string;
  kind: "archive" | "unretained" | "connect";
  text: string;
  detail?: string;
  minutesAgo: number;
}

/**
 * What the pipeline has actually been doing, not just how it was configured.
 * A list of "X connected as a source" is a setup log: it stops changing the
 * moment setup finishes, on a page meant to show a living system. The volume
 * flowing into cold storage is the part that keeps moving, and when no cold
 * storage exists it's also the clearest statement of what's being lost.
 */
export function buildActivity(
  perSource: SourceSaving[],
  connected: ConnectedEntity[],
  coldStorage: { id: string; label: string; connectedAt: number }[],
): ActivityEvent[] {
  const hasCold = coldStorage.length > 0;
  const coldLabel = coldStorage[0]?.label ?? "cold storage";

  const flow: ActivityEvent[] = perSource
    .filter((s) => s.gbPerDayFiltered > 0)
    .map((s, i) => {
      const gbLastHour = s.gbPerDayFiltered / 24;
      const eventsLastHour = (gbLastHour * 1e9) / BYTES_PER_EVENT;
      return {
        id: `flow-${s.id}`,
        kind: hasCold ? ("archive" as const) : ("unretained" as const),
        text: hasCold
          ? `${fmtCount(eventsLastHour)} events from ${s.name} archived to ${coldLabel}`
          : `${fmtCount(eventsLastHour)} events from ${s.name} filtered with no retention`,
        detail: `${fmtGbValue(gbLastHour)} in the last hour`,
        // Staggered rather than timestamped: this is a rolling flow, not a
        // discrete event that happened at one moment.
        minutesAgo: 2 + i * 5,
      };
    });

  const setup: ActivityEvent[] = [
    ...connected.map((c) => ({
      id: `conn-${c.id}`,
      kind: "connect" as const,
      text: `${c.name} connected as a ${c.kind}`,
      minutesAgo: Math.max(1, Math.floor((Date.now() - c.connectedAt) / 60000)),
    })),
    ...coldStorage.map((t) => ({
      id: `conn-${t.id}`,
      kind: "connect" as const,
      text: `${t.label} connected as cold storage`,
      minutesAgo: Math.max(1, Math.floor((Date.now() - t.connectedAt) / 60000)),
    })),
  ];

  return [...flow, ...setup].sort((a, b) => a.minutesAgo - b.minutesAgo).slice(0, 6);
}

/** Local GB formatter, so this module doesn't have to import from a component. */
function fmtGbValue(gb: number) {
  return gb >= 1000 ? `${(gb / 1000).toFixed(1)} TB` : `${Math.round(gb)} GB`;
}

export function buildFlowNodes(connected: ConnectedEntity[], routes: FlowRoute[] = []) {
  const sources = connected.filter((c) => c.kind === "source");
  const destinations = connected.filter((c) => c.kind === "destination");

  const sourceNodes: FlowNode[] = sources.map((s) => {
    const def = CONNECTORS.find((c) => c.name === s.name);
    return { id: def?.id ?? s.id, name: s.name, volume: SOURCE_VOLUME[def?.id ?? ""] ?? 400, color: def?.brandColor ?? "#4a94f9" };
  });
  const destNodes: FlowNode[] = destinations.map((d) => {
    const def = CONNECTORS.find((c) => c.name === d.name);
    return { id: def?.id ?? d.id, name: d.name, volume: 0, color: def?.brandColor ?? "#53d9ff" };
  });

  // Only routes between things that are actually still connected count, so a
  // disconnected source or destination can't leave a dangling edge behind.
  const sourceIds = new Set(sourceNodes.map((s) => s.id));
  const destIds = new Set(destNodes.map((d) => d.id));
  let edges = routes.filter((r) => sourceIds.has(r.sourceId) && destIds.has(r.destId));

  // No routing was ever recorded (sources connected before routing existed,
  // or before any of this session's destinations were routed at all), fall
  // back to a full mesh rather than rendering every destination as empty.
  // The instant a real route is recorded anywhere, this stops applying and
  // the pipeline shows only what's actually routed.
  if (edges.length === 0 && sourceNodes.length > 0 && destNodes.length > 0) {
    edges = sourceNodes.flatMap((s) => destNodes.map((d) => ({ sourceId: s.id, destId: d.id })));
  }

  return { sourceNodes, destNodes, edges };
}
