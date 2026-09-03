export interface ReductionRule {
  id: string;
  category: string;
  name: string;
  reason: string;
  /** Which sources this applies to. Most rules today happen to apply to
   * exactly one, but that's not a rule of the model, a compliance exclusion
   * raised from a Search result might reasonably need to cover two firewalls
   * and not a third, so this was never really a single value to begin with. */
  sourceIds: string[];
  before: string;
  after: string;
  enabled: boolean;
}

/**
 * Realistic scale, matching Databahn's published figures: a library of 900+
 * security-specific reduction rules, of which a few hundred are applicable to
 * any given source. The panel used to show a small hand-authored sample next
 * to a much larger aggregate count, "218 of 312 active" above a dozen visible
 * cards, which read as broken rather than illustrative. The full set below is
 * generated to match those counts exactly, so what the panel says and what
 * it shows are always the same list, just a long one.
 */
export const RULE_LIBRARY_TOTAL = 940;

export interface RuleCategoryStat {
  category: string;
  sourceId: string;
  /** Rules in the library that apply to this source. */
  applicable: number;
  /** Currently switched on. */
  active: number;
  /** Share of this source's volume this category removes. */
  volumeShare: number;
}

export const RULE_CATEGORIES: RuleCategoryStat[] = [
  { category: "Duplicate & heartbeat suppression", sourceId: "paloalto", applicable: 86, active: 74, volumeShare: 0.18 },
  { category: "Debug-noise trimming", sourceId: "paloalto", applicable: 62, active: 48, volumeShare: 0.11 },
  { category: "Field trimming", sourceId: "paloalto", applicable: 91, active: 58, volumeShare: 0.14 },
  { category: "Payload sampling", sourceId: "paloalto", applicable: 44, active: 22, volumeShare: 0.06 },
  { category: "Compliance-safe exclusions", sourceId: "paloalto", applicable: 29, active: 16, volumeShare: 0.03 },
  { category: "Duplicate & heartbeat suppression", sourceId: "entraid", applicable: 41, active: 34, volumeShare: 0.12 },
  { category: "Debug-noise trimming", sourceId: "entraid", applicable: 38, active: 29, volumeShare: 0.09 },
  { category: "Field trimming", sourceId: "entraid", applicable: 47, active: 26, volumeShare: 0.08 },
  { category: "Compliance-safe exclusions", sourceId: "entraid", applicable: 22, active: 7, volumeShare: 0.02 },
];

/** Hand-authored rules with a real, specific before/after sample, the ones
 * worth reading closely. Every category also gets machine-generated filler
 * (below) so the visible list actually matches RULE_CATEGORIES' counts,
 * these just sort first within their category since they're the most
 * concretely illustrative. */
const HERO_RULES: ReductionRule[] = [
  { id: "r1", category: "Duplicate & heartbeat suppression", name: "Drop duplicate keepalives", reason: "Suppresses duplicate TCP keepalives, no security signal, seen ~40,000x/hour with identical payloads.", sourceIds: ["paloalto"], before: "14:02:01 keepalive src=10.20.4.1\n14:02:01 keepalive src=10.20.4.1\n14:02:02 keepalive src=10.20.4.1", after: "14:02:01 keepalive src=10.20.4.1  (39,998 duplicates suppressed)", enabled: true },
  { id: "r2", category: "Duplicate & heartbeat suppression", name: "Collapse repeated identical events", reason: "Identical events within a 5s window are collapsed into one with a count, not dropped.", sourceIds: ["paloalto"], before: "action=allow rule=Default x3,204 in 5s", after: "action=allow rule=Default (x3,204, collapsed)", enabled: true },
  { id: "r3", category: "Debug-noise trimming", name: "Trim verbose debug fields", reason: "Strips internal debug fields with no analytical value; the event itself is kept.", sourceIds: ["paloalto"], before: "…debug_trace=full stack_depth=12 internal_seq=88291…", after: "(debug fields removed, core event preserved)", enabled: true },
  { id: "r4", category: "Field trimming", name: "Drop raw packet payload for allow-listed traffic", reason: "Full packet bodies for known-good, allow-listed internal traffic add cost with no detection value.", sourceIds: ["paloalto"], before: "payload=<4KB raw packet body>", after: "payload=(omitted, allow-listed internal traffic)", enabled: false },
  { id: "r5", category: "Payload sampling", name: "Sample 1-in-10 URL filtering allows", reason: "Permitted web requests to reputable categories are sampled rather than dropped, keeping a statistical baseline.", sourceIds: ["paloalto"], before: "url_allow x18,400/hour to category=business-and-economy", after: "url_allow x1,840/hour retained (1:10 sample, counts preserved)", enabled: true },
  { id: "r6", category: "Compliance-safe exclusions", name: "Never reduce authentication failures", reason: "Guardrail rule. Auth failures are exempt from every reduction rule regardless of volume, because audits depend on them.", sourceIds: ["paloalto"], before: "(any reduction rule matching auth failure events)", after: "(exempt, always forwarded in full)", enabled: true },
  { id: "r7", category: "Duplicate & heartbeat suppression", name: "Drop repeated sign-in success from same session", reason: "Entra ID emits a heartbeat-like repeat for long-lived sessions; only the first is kept.", sourceIds: ["entraid"], before: "signIn success session=abc x220/day", after: "signIn success session=abc (x220, collapsed)", enabled: true },
  { id: "r8", category: "Debug-noise trimming", name: "Trim Graph API pagination metadata", reason: "Pagination tokens and API scaffolding fields carry no security signal.", sourceIds: ["entraid"], before: "@odata.nextLink=… @odata.context=…", after: "(pagination metadata removed)", enabled: true },
  { id: "r9", category: "Compliance-safe exclusions", name: "Never reduce privileged role changes", reason: "Guardrail rule. Directory role assignments are always forwarded in full, they are the highest-value audit trail.", sourceIds: ["entraid"], before: "(any reduction rule matching role assignment events)", after: "(exempt, always forwarded in full)", enabled: true },
];

/** What each category's filler rules target, real enough to name specific
 * protocols/fields rather than a generic "noisy event" placeholder. */
const NOISE_PATTERNS: Record<string, string[]> = {
  "Duplicate & heartbeat suppression": [
    "ARP announcements", "DHCP lease renewals", "NTP sync responses", "ICMP echo replies",
    "BGP keepalives", "STP BPDUs", "LLDP announcements", "OSPF hello packets",
    "VRRP advertisements", "syslog heartbeats", "SNMP polling acknowledgements", "health-check pings",
    "load-balancer probes", "session keep-alives", "TLS session-resumption pings", "mDNS announcements",
  ],
  "Debug-noise trimming": [
    "stack-trace metadata", "internal correlation IDs", "trace-context headers", "request-timing breakdowns",
    "cache-hit annotations", "build and version tags", "internal routing hops", "retry-attempt counters",
    "connection-pool statistics", "GC pause markers", "internal feature-flag echoes", "verbose SDK logging",
  ],
  "Field trimming": [
    "full HTTP response bodies", "base64 attachment blobs", "verbose user-agent strings", "redundant geo-IP lookups",
    "full DNS answer records", "certificate chain dumps", "raw SNMP OID trees", "full process command lines",
    "raw multipart form bodies", "verbose TLS cipher negotiation logs",
  ],
  "Payload sampling": [
    "benign DNS queries", "routine outbound TLS handshakes", "known-good file hash matches",
    "internal health-check traffic", "CDN cache-hit responses", "allow-listed webhook callbacks",
  ],
  "Compliance-safe exclusions": [
    "policy modification events", "audit-log deletions", "MFA challenge results", "account lockout events",
    "password reset requests", "admin console logins", "conditional-access policy changes", "legal-hold events",
  ],
};

const CATEGORY_SLUG: Record<string, string> = {
  "Duplicate & heartbeat suppression": "dup",
  "Debug-noise trimming": "debug",
  "Field trimming": "field",
  "Payload sampling": "sample",
  "Compliance-safe exclusions": "exclude",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// A raw "(pattern 3)" counter is implementation showing through, and a
// single reason sentence repeated verbatim for 40+ rows reads as
// copy-pasted rather than each rule meaning something on its own. Rotating
// through a few natural phrasings keeps every row readable without
// resorting to either.
const GUARDRAIL_NAME: ((p: string) => string)[] = [
  (p) => `Never reduce ${p}`,
  (p) => `Always forward ${p}`,
  (p) => `Keep ${p} intact`,
];
const GUARDRAIL_REASON: ((p: string) => string)[] = [
  (p) => `${cap(p)} matter for audits, so this rule keeps them out of every reduction pass no matter how much volume they add.`,
  (p) => `${cap(p)} carry investigative value that outweighs the volume they add, this exemption overrides every reduction rule for this pattern.`,
  (p) => `Compliance requires ${p} stay intact, so nothing here ever gets trimmed, sampled, or dropped.`,
];
const REDUCE_NAME: ((p: string) => string)[] = [
  (p) => `Drop ${p}`,
  (p) => `Suppress ${p}`,
  (p) => `Trim ${p}`,
];
const REDUCE_REASON: ((p: string) => string)[] = [
  (p) => `${cap(p)} carry no security signal for this source, Cruz's noise model drops them before they reach a destination.`,
  (p) => `No detection rule keys on ${p}, keeping them around just adds volume without adding value.`,
  (p) => `${cap(p)} are routine background traffic here, safe to reduce without losing anything an analyst would look for.`,
];

/** Fills one category up to its real applicable/active counts, hero rules
 * for that category/source count toward both totals first, generated rules
 * make up the rest, enabled in the same proportion RULE_CATEGORIES reports. */
function fillCategory(category: string, sourceId: string, applicable: number, active: number): ReductionRule[] {
  const heroes = HERO_RULES.filter((r) => r.category === category && r.sourceIds.includes(sourceId));
  const rules = [...heroes];
  let enabledCount = heroes.filter((r) => r.enabled).length;
  const pool = NOISE_PATTERNS[category] ?? ["low-value events"];
  const slug = CATEGORY_SLUG[category] ?? "rule";
  let n = 1;
  // Guardrails protect, they don't reduce, using the same "suppress /
  // reduced" language as the other four categories would have said the
  // opposite of what this category actually does.
  const isGuardrail = category === "Compliance-safe exclusions";
  while (rules.length < applicable) {
    const pattern = pool[(n - 1) % pool.length];
    const shouldEnable = enabledCount < active;
    if (shouldEnable) enabledCount++;
    rules.push(
      isGuardrail
        ? {
            id: `${sourceId}-${slug}-${n}`,
            category,
            name: GUARDRAIL_NAME[n % GUARDRAIL_NAME.length](pattern),
            reason: GUARDRAIL_REASON[(n + 1) % GUARDRAIL_REASON.length](pattern),
            sourceIds: [sourceId],
            before: `(any reduction rule matching ${pattern})`,
            after: shouldEnable ? "(exempt, always forwarded in full)" : "(not yet enabled)",
            enabled: shouldEnable,
          }
        : {
            id: `${sourceId}-${slug}-${n}`,
            category,
            name: `${REDUCE_NAME[n % REDUCE_NAME.length](cap(pattern))}`,
            reason: REDUCE_REASON[(n + 1) % REDUCE_REASON.length](pattern),
            sourceIds: [sourceId],
            before: `<matches ${pattern}, ~${(n * 137) % 900 + 100}x/hour>`,
            after: shouldEnable ? "(reduced, no security signal)" : "(not yet enabled)",
            enabled: shouldEnable,
          },
    );
    n++;
  }
  return rules;
}

/** The full rule set, one entry per applicable rule across every category and
 * source in RULE_CATEGORIES, hero rules first. This is what the panel
 * actually renders now, not a curated sample sitting next to a bigger number
 * it didn't back up. */
export const DEFAULT_RULES: ReductionRule[] = RULE_CATEGORIES.flatMap((c) =>
  fillCategory(c.category, c.sourceId, c.applicable, c.active),
);

export function rulesForSource(sourceId: string) {
  return DEFAULT_RULES.filter((r) => r.sourceIds.includes(sourceId));
}

export function categoriesForSource(sourceId?: string) {
  return sourceId ? RULE_CATEGORIES.filter((c) => c.sourceId === sourceId) : RULE_CATEGORIES;
}

/** Real applicable/active totals across the given scope, used everywhere a
 * rule count is displayed so the UI never contradicts itself. */
export function ruleTotals(sourceIds: string[]) {
  const scoped = RULE_CATEGORIES.filter((c) => sourceIds.includes(c.sourceId));
  return {
    applicable: scoped.reduce((a, c) => a + c.applicable, 0),
    active: scoped.reduce((a, c) => a + c.active, 0),
  };
}

/** `RULE_CATEGORIES.active` is the count at generation time, it never moves
 * again, toggling a rule in the panel or the library page only ever flipped
 * that one rule's own switch, every count anywhere else in the app kept
 * reading the frozen snapshot. These recompute `active`/`applicable` from
 * the live `rules` array instead, `volumeShare` and the category/source
 * pairing stay from the static table since those describe what a category
 * is, not how many of its rules happen to be on right now. */
export function liveCategoryStats(rules: ReductionRule[], sourceId?: string): RuleCategoryStat[] {
  const base = categoriesForSource(sourceId);
  return base.map((c) => {
    const matching = rules.filter((r) => r.category === c.category && r.sourceIds.includes(c.sourceId));
    return { ...c, applicable: matching.length, active: matching.filter((r) => r.enabled).length };
  });
}

export function liveRuleTotals(rules: ReductionRule[], sourceIds: string[]) {
  const scoped = rules.filter((r) => r.sourceIds.some((id) => sourceIds.includes(id)));
  return { applicable: scoped.length, active: scoped.filter((r) => r.enabled).length };
}

/** Weights each connected source's raw volume by how much of its
 * volumeShare is actually being realized right now: a category's full
 * volumeShare only counts if every one of its rules for that source is
 * switched on, half its rules on realizes half that category's share. This
 * is what makes "Volume reduced" respond to a toggle instead of sitting at
 * a fixed number regardless of what's actually enabled. */
export function liveReductionFactor(rules: ReductionRule[], sourceNodes: { id: string; volume: number }[]): number {
  const totalVolume = sourceNodes.reduce((a, s) => a + s.volume, 0);
  if (totalVolume === 0) return 0;

  let reducedVolume = 0;
  for (const s of sourceNodes) {
    let sourceReduction = 0;
    for (const cat of categoriesForSource(s.id)) {
      const inCategory = rules.filter((r) => r.category === cat.category && r.sourceIds.includes(s.id));
      if (inCategory.length === 0) continue;
      const activeFraction = inCategory.filter((r) => r.enabled).length / inCategory.length;
      sourceReduction += cat.volumeShare * activeFraction;
    }
    reducedVolume += s.volume * sourceReduction;
  }
  return reducedVolume / totalVolume;
}

export function groupByCategory(rules: ReductionRule[]) {
  const map = new Map<string, ReductionRule[]>();
  for (const r of rules) {
    if (!map.has(r.category)) map.set(r.category, []);
    map.get(r.category)!.push(r);
  }
  return Array.from(map.entries());
}
