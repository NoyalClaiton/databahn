import { categoriesForSource, type ReductionRule } from "@/app/data/rules";
import { rateFor } from "./pipelineData";
import { trendPoints, EPS_PER_GB_DAY, RANGE_MINUTES, type Environment, type SourceView } from "./environment";

export const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/** Typical rate used when a source isn't routed yet, so its figure is a
 * projection, never presented as money already saved. */
const TYPICAL_RATE = 4.3;

/** Where a source's reduction comes from. Sources with authored rule
 * categories (Palo Alto, Entra ID) use them; the rest split their reduction
 * across the standard categories so the breakdown reads the same way. */
const GENERIC_SPLIT: [string, number][] = [
  ["Duplicate & heartbeat suppression", 0.4],
  ["Debug-noise trimming", 0.25],
  ["Field trimming", 0.25],
  ["Payload sampling", 0.1],
];

/** Each rule type's share of everything a source receives, removed. Sums to
 * the source's reduction, so the parts always add up to the headline %.
 * Shared by the Savings page and the source drawer. */
export function reductionSplit(connectorId: string, reduction: number, rules: ReductionRule[]): { category: string; share: number; rulesOff: number }[] {
  const authored = categoriesForSource(connectorId);
  if (authored.length > 0) {
    return authored
      .map((c) => {
        const inCat = rules.filter((r) => r.category === c.category && r.sourceIds.includes(c.sourceId));
        const on = inCat.length ? inCat.filter((r) => r.enabled).length / inCat.length : 0;
        return { category: c.category, share: c.volumeShare * on, rulesOff: inCat.filter((r) => !r.enabled).length, offShare: c.volumeShare * (1 - on) };
      })
      .map(({ offShare: _o, ...rest }) => rest)
      .sort((a, b) => b.share - a.share);
  }
  return GENERIC_SPLIT.map(([category, w]) => ({ category, share: reduction * w, rulesOff: 0 }));
}

export interface CategorySaving {
  category: string;
  gbPerDay: number;
  monthlyUsd: number;
  /** Rules in this category still off for the source. */
  rulesOff: number;
  /** Share of everything received this category removes. */
  share: number;
}

export interface SourceSavingDetail {
  s: SourceView;
  gbInPerDay: number;
  gbNotBilledPerDay: number;
  reduction: number;
  /** Summed rate across every destination it's billed at (each one bills
   * the same GB separately). */
  rate: number;
  monthlyUsd: number;
  /** Not routed: the figure is a projection at a typical rate. */
  projected: boolean;
  categories: CategorySaving[];
  /** What turning on this source's remaining rules would add. */
  extraMonthlyUsd: number;
  rulesOff: number;
}

export interface DestinationSavingDetail {
  id: string;
  name: string;
  color: string;
  rate: number;
  gbNotBilledPerDay: number;
  monthlyUsd: number;
  billedMonthlyUsd: number;
}

export interface SavingsModel {
  sources: SourceSavingDetail[];
  destinations: DestinationSavingDetail[];
  monthlyUsd: number;
  billedMonthlyUsd: number;
  withoutDatabahnMonthlyUsd: number;
  gbInPerDay: number;
  gbNotBilledPerDay: number;
  extraMonthlyUsd: number;
  rulesOff: number;
}

/** One model for the Savings page and the dashboard's cost summary, built
 * from the same per-source figures Pipeline shows, so the three agree. */
export function buildSavingsModel(env: Environment, rules: ReductionRule[]): SavingsModel {
  const destById = new Map(env.destinations.map((d) => [d.id, d]));
  const sources = env.sources
    .map((s): SourceSavingDetail => {
      const routed = s.destIds.filter((id) => destById.has(id));
      const projected = routed.length === 0;
      const rate = projected ? TYPICAL_RATE : routed.reduce((a, id) => a + rateFor(id), 0);
      const gbNotBilled = s.gbIn * s.reduction;
      const authored = categoriesForSource(s.connectorId);
      let categories: CategorySaving[];
      let extra = 0;
      let rulesOff = 0;
      if (authored.length > 0) {
        categories = authored.map((c) => {
          const inCat = rules.filter((r) => r.category === c.category && r.sourceIds.includes(c.sourceId));
          const on = inCat.length ? inCat.filter((r) => r.enabled).length / inCat.length : 0;
          const off = inCat.filter((r) => !r.enabled).length;
          rulesOff += off;
          extra += s.gbIn * c.volumeShare * (1 - on) * 30 * rate;
          const gb = s.gbIn * c.volumeShare * on;
          return { category: c.category, gbPerDay: gb, monthlyUsd: gb * 30 * rate, rulesOff: off, share: c.volumeShare * on };
        });
      } else {
        categories = GENERIC_SPLIT.map(([category, share]) => {
          const gb = gbNotBilled * share;
          return { category, gbPerDay: gb, monthlyUsd: gb * 30 * rate, rulesOff: 0, share: s.reduction * share };
        });
      }
      return {
        s,
        gbInPerDay: s.gbIn,
        gbNotBilledPerDay: gbNotBilled,
        reduction: s.reduction,
        rate,
        monthlyUsd: gbNotBilled * 30 * rate,
        projected,
        categories: categories.filter((c) => c.gbPerDay > 0 || c.rulesOff > 0).sort((a, b) => b.monthlyUsd - a.monthlyUsd),
        extraMonthlyUsd: extra,
        rulesOff,
      };
    })
    .sort((a, b) => b.monthlyUsd - a.monthlyUsd);

  const destinations = env.destinations
    .map((d) => {
      const feeding = env.sources.filter((s) => s.destIds.includes(d.id));
      const rate = rateFor(d.id);
      const notBilled = feeding.reduce((a, s) => a + s.gbIn * s.reduction, 0);
      const billed = feeding.reduce((a, s) => a + s.gbIn * (1 - s.reduction), 0);
      return { id: d.id, name: d.name, color: d.color, rate, gbNotBilledPerDay: notBilled, monthlyUsd: notBilled * 30 * rate, billedMonthlyUsd: billed * 30 * rate };
    })
    .sort((a, b) => b.monthlyUsd - a.monthlyUsd);

  const real = sources.filter((x) => !x.projected);
  const monthlyUsd = real.reduce((a, x) => a + x.monthlyUsd, 0);
  const billedMonthlyUsd = destinations.reduce((a, d) => a + d.billedMonthlyUsd, 0);
  return {
    sources,
    destinations,
    monthlyUsd,
    billedMonthlyUsd,
    withoutDatabahnMonthlyUsd: billedMonthlyUsd + monthlyUsd,
    gbInPerDay: env.sources.reduce((a, s) => a + s.gbIn, 0),
    gbNotBilledPerDay: env.sources.reduce((a, s) => a + s.gbIn * s.reduction, 0),
    extraMonthlyUsd: real.reduce((a, x) => a + x.extraMonthlyUsd, 0),
    // A rule applies to a source type, not one instance: Palo Alto's 94 off
    // rules are the same 94 for all twelve Palo Alto firewalls.
    rulesOff: Array.from(new Map(real.map((x) => [x.s.connectorId, x.rulesOff] as const)).values()).reduce((a, n) => a + n, 0),
  };
}

/** Dollars saved per day across the range, from each source's own traffic
 * curve, so an outage shows as a dip in savings too. */
export function savingsTrend(model: SavingsModel, range: string): { points: number[]; totalUsd: number } {
  let points: number[] = [];
  for (const x of model.sources) {
    if (x.projected) continue;
    const t = trendPoints(x.s, range);
    if (points.length === 0) points = new Array(t.length).fill(0);
    t.forEach((eps, i) => {
      if (eps === null) return;
      points[i] += (eps / EPS_PER_GB_DAY) * x.reduction * x.rate;
    });
  }
  const days = (RANGE_MINUTES[range] ?? 1440) / 1440;
  const avgPerDay = points.length ? points.reduce((a, v) => a + v, 0) / points.length : 0;
  return { points, totalUsd: avgPerDay * days };
}

/** What each rule is worth per month across the given sources: its share of
 * its category's volume, priced at each source's billed rate. On rules sum
 * exactly to the sources' savings; off rules show what they'd add. */
export function ruleValues(rules: ReductionRule[], scope: SourceSavingDetail[], rateOverride?: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const x of scope) {
    for (const c of categoriesForSource(x.s.connectorId)) {
      const inCat = rules.filter((r) => r.category === c.category && r.sourceIds.includes(c.sourceId));
      if (inCat.length === 0) continue;
      // A destination's view prices at that destination's rate alone.
      const each = (x.gbInPerDay * c.volumeShare * 30 * (rateOverride ?? x.rate)) / inCat.length;
      for (const r of inCat) out.set(r.id, (out.get(r.id) ?? 0) + each);
    }
  }
  return out;
}

/** Sources whose rules Databahn can list individually. */
export const hasRuleDetail = (connectorId: string) => categoriesForSource(connectorId).length > 0;
