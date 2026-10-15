import { useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, ChevronUp, ExternalLink, ShieldAlert, ShieldCheck, Database, Flag, X, CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/app/components/shared/StateViews";
import { PerSourceProgress, type PerSourceStatus } from "@/app/components/shared/LiveStatus";
import { PageHeader } from "@/app/components/shared/PageLayout";
import { SearchInput } from "@/app/components/shared/SearchInput";
import { ReefGraph } from "@/app/components/shared/ReefGraph";
import { REEF_NODES, ENTITY_INDEX, subgraphFrom } from "@/app/data/graphData";
import { MOCK_RESULTS, type SearchResult } from "@/app/data/searchResults";
import { CONNECTORS } from "@/app/data/connectors";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Button } from "@/app/components/ui/button";
import { useSession } from "@/app/lib/SessionContext";
import { useEnvironment, clockAt } from "@/app/lib/environment";
import { useEscape } from "@/app/lib/useEscape";
import { matchesQuery } from "@/app/lib/matchQuery";
import { NoResults } from "@/app/components/shared/NoResults";

/** "Evaluated" has to hold for whichever destination actually saw this event,
 * not just whichever one or two happened to get named in a conditional.
 * Cold storage is the only state that means "nothing looked at this." */
function ProvenanceBadge({ provenance }: { provenance: SearchResult["provenance"] }) {
  if (provenance === "cold-storage") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/40 rounded-full px-2 py-0.5">
        <ShieldAlert className="w-3 h-3" aria-hidden="true" />
        Not evaluated by detection rules
      </span>
    );
  }
  const destName = CONNECTORS.find((c) => c.id === provenance)?.name ?? "detection rules";
  return (
    <span className="inline-flex items-center gap-1 text-xs text-info bg-info/10 rounded-full px-2 py-0.5">
      <ShieldCheck className="w-3 h-3" aria-hidden="true" />
      Evaluated by {destName}
    </span>
  );
}

/** A severity level only means something if some detection logic actually
 * assigned it. Cold storage was never evaluated by anything, so it gets its
 * own "Unscored" bucket rather than silently inheriting whatever severity
 * happened to sit in the data, or collapsing into the same "Informational"
 * bucket as a result that WAS evaluated and just came back low-priority.
 * Those are different facts, not shades of the same one. */
type SeverityBucketKey = "critical" | "high" | "medium" | "low" | "informational" | "unscored";
const SEVERITY_LEVELS: { key: SeverityBucketKey; label: string; dot: string }[] = [
  { key: "critical", label: "Critical", dot: "bg-destructive" },
  { key: "high", label: "High", dot: "bg-amber-500" },
  { key: "medium", label: "Medium", dot: "bg-amber-500/50" },
  { key: "low", label: "Low", dot: "bg-muted-foreground/50" },
  { key: "informational", label: "Informational", dot: "bg-info/50" },
  { key: "unscored", label: "Unscored", dot: "bg-muted-foreground/25" },
];

function severityBucket(r: SearchResult): SeverityBucketKey {
  if (r.provenance === "cold-storage") return "unscored";
  return r.severity ?? "informational";
}

function SeverityBadge({ r }: { r: SearchResult }) {
  const meta = SEVERITY_LEVELS.find((g) => g.key === severityBucket(r))!;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function ResultCard({
  r,
  expanded,
  mode,
  onToggleExpand,
  onFlag,
  flaggedRuleId,
  navigate,
}: {
  r: SearchResult;
  expanded: boolean;
  mode: "parsed" | "raw";
  onToggleExpand: () => void;
  onFlag: () => void;
  flaggedRuleId?: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const focusIndex = ENTITY_INDEX[r.relatedEntityId] ?? null;
  const focusLabel = focusIndex !== null ? REEF_NODES[focusIndex]?.label : null;
  const graphSubset = subgraphFrom(focusIndex, 1);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={onToggleExpand}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleExpand();
        }
      }}
      className={`rounded border bg-card p-3 cursor-pointer transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        expanded ? "border-primary/40" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-sm text-foreground">{r.summary}</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            {r.source} · <span className="font-mono-db">{r.timestamp}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SeverityBadge r={r} />
          <ProvenanceBadge provenance={r.provenance} />
        </div>
      </div>
      {mode === "raw" ? (
        <code className="font-mono-db text-xs text-muted-foreground block">{r.raw}</code>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono-db text-xs text-muted-foreground">
          {Object.entries(r.parsed).map(([k, v]) => (
            <span key={k}>
              {k}=<span className="text-foreground">{v}</span>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mt-2">
        {/* The whole card triggers this now, so this is a label for
            what clicking anywhere on the card does, not its own
            separate target. */}
        <span className="inline-flex items-center gap-1 text-xs text-info">
          {expanded ? "Hide graph" : "Investigate in graph"}
          {expanded ? (
            <ChevronUp className="w-3 h-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3 h-3" aria-hidden="true" />
          )}
        </span>
        {/* Only cold storage was ever a candidate for "this should have
            reached detection", an already-evaluated result was already
            seen by something, there's nothing to propose here. */}
        {r.provenance === "cold-storage" &&
          (flaggedRuleId ? (
            <span className="inline-flex items-center gap-2 text-xs">
              {/* A status pill and a link in the same plain-text color were
                  reading as one continuous phrase, not two different things,
                  a badge shape for the status separates them at a glance. */}
              <span className="inline-flex items-center gap-1 text-success bg-success/15 px-1.5 py-[1px] rounded-full font-medium">
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                Flagged for review
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // Carrying the rule id is what makes this land on the
                  // exact proposed rule instead of a general dashboard with
                  // no clue which of 900+ rules is the new one.
                  navigate("/pipeline", { state: { focusRuleId: flaggedRuleId } });
                }}
                className="inline-flex items-center gap-1 text-info font-medium underline underline-offset-2"
              >
                View in Pipeline
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </button>
            </span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFlag();
              }}
              className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
            >
              <Flag className="w-3 h-3" aria-hidden="true" />
              Should this reach detection?
            </button>
          ))}
      </div>

      {/* Expanding in place keeps the result list as the anchor, so the
          analyst never loses the surrounding evidence to see the graph. */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mt-3 pt-3 border-t border-border">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="font-mono-db text-xs text-muted-foreground">
                  {focusLabel ? (
                    <>
                      Focused on <span className="text-foreground">{focusLabel}</span>
                    </>
                  ) : (
                    "Full entity graph"
                  )}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate("/graph", { state: { seedEntityId: r.relatedEntityId, seedQuery: r.summary } });
                    }}
                    className="inline-flex items-center gap-1 text-xs text-info underline underline-offset-2"
                  >
                    Open full graph
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleExpand();
                    }}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    Collapse
                    <ChevronUp className="w-3 h-3" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {/* reef-inline-graph bounds the shared canvas for list context, see fonts.css */}
              <div className="reef-inline-graph rounded overflow-hidden">
                <ReefGraph nodes={graphSubset.nodes} initialFocusIndex={graphSubset.focusIndex} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Like marking an email "not spam": this event was reduced before reaching a
 * SIEM, but the analyst who found it during investigation thinks it
 * shouldn't have been. Proposing an exclusion rule is how that feedback
 * gets back into Cruz's pipeline, scoped to whichever sources it should
 * actually cover, not applied blind or automatically. It lands disabled by
 * default in the "Compliance-safe exclusions" category and lives in
 * shared session state (see SessionContext), review and enable it from
 * there, same as any other rule.
 */
function FlagForDetectionModal({
  result,
  onClose,
  onSubmitted,
}: {
  result: SearchResult;
  onClose: () => void;
  onSubmitted: (ruleId: string) => void;
}) {
  useEscape(onClose);
  const { addRule } = useSession();
  // One entry per connected source type, from the environment (sample
  // included). An exclusion applies to a type of source, not one instance.
  const env = useEnvironment();
  const sources = Array.from(new Map(env.sources.map((s) => [s.connectorId, { id: s.connectorId, name: s.vendor }])).values());
  const originId = CONNECTORS.find((c) => c.name === result.source)?.id;
  const [selected, setSelected] = useState<string[]>(originId ? [originId] : []);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = () => {
    const ruleId = `flagged-${result.id}-${Date.now()}`;
    addRule({
      id: ruleId,
      category: "Compliance-safe exclusions",
      name: `Always forward: ${result.summary}`,
      reason: `Flagged from Search, an analyst determined this pattern should reach detection rather than sit in cold storage. Proposed, not yet reviewed.`,
      sourceIds: selected,
      before: result.raw,
      after: "(exempt, always forwarded in full)",
      // The modal's own copy promises this doesn't take effect until
      // reviewed, "not applied here, it lands in Pipeline overview for
      // review first", so it has to actually land off, not on.
      enabled: false,
    });
    // Proposing a rule shouldn't yank the analyst out of the investigation
    // they were mid-way through, it just needs to be findable later, in
    // Pipeline overview, whenever they're ready to review it. Carrying the
    // id forward is what makes "View in Pipeline" actually land on it
    // instead of a wall of 900+ rules with no clue which one is new.
    onSubmitted(ruleId);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[95] bg-background/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border glass-card p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Propose a detection exclusion"
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <p className="text-sm font-medium text-foreground">Should this reach detection?</p>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          This was reduced before it ever reached a SIEM. Proposing an exclusion means events like it get forwarded in
          full going forward, not applied here, it lands in Pipeline overview for review first.
        </p>
        <code className="block font-mono-db text-xs text-muted-foreground bg-background/40 rounded px-2.5 py-2 mb-4">
          {result.raw}
        </code>

        <p className="text-xs text-muted-foreground mb-2">Apply to which sources?</p>
        <div className="space-y-1.5 mb-4">
          {sources.map((s) => {
            const def = CONNECTORS.find((c) => c.name === s.name);
            const checked = def ? selected.includes(def.id) : false;
            return (
              <button
                key={s.id}
                onClick={() => def && toggle(def.id)}
                disabled={!def}
                className={`w-full flex items-center gap-2.5 rounded-lg border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  checked ? "border-primary bg-primary/10" : "border-border bg-card/60 hover:border-primary/40"
                }`}
              >
                <Checkbox checked={checked} className="pointer-events-none" />
                <span className="text-sm text-foreground">{s.name}</span>
                {s.name === result.source && <span className="text-xs text-muted-foreground ml-auto">source of this event</span>}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <Button size="sm" disabled={selected.length === 0} onClick={submit}>
            Propose exclusion
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Concrete starting points, so the user never faces a blank box wondering what
 * syntax is allowed. Each states why it is worth running. */
const EXAMPLE_QUERIES = [
  { q: "failed sign-ins from 198.51.100.4 in the last 24h", why: "Cross-references identity and firewall data in one pass" },
  { q: "show me everything svc-backup touched", why: "Follows a service account across all connected sources" },
  { q: "large outbound transfers over 1 GB", why: "Includes cold storage, where volume anomalies usually hide" },
];

export default function SearchExperience() {
  const navigate = useNavigate();
  const { coldStorageTargets } = useSession();
  const env = useEnvironment();
  const sourceCount = env.sources.length;
  // Sources that weren't sending during the search window. Their silence is
  // missing data, not an absence of activity, and the results have to say so.
  const gaps = env.summary.issues.filter((s) => s.state === "stopped" || s.state === "degraded");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"parsed" | "raw">("parsed");
  const [status, setStatus] = useState<"idle" | "searching" | "done">("idle");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [severityFilter, setSeverityFilter] = useState<SeverityBucketKey | null>(null);
  // Maps a flagged result to the rule id it produced, so "View in Pipeline"
  // can land on that exact rule instead of the general dashboard.
  const [flaggedRuleIds, setFlaggedRuleIds] = useState<Map<string, string>>(new Map());
  const [progress, setProgress] = useState<PerSourceStatus[]>([]);
  /** Only one result holds the graph open, so the list never turns into a
   * stack of competing canvases the analyst has to scroll past. */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [flaggingResult, setFlaggingResult] = useState<SearchResult | null>(null);

  if (sourceCount === 0) {
    return (
      <div className="w-full max-w-[1180px] mx-auto">
        <PageHeader title="Ask anything, anywhere" subtitle="Search across every connected source, including data filtered through active rules." />
        <EmptyState
          icon={Database}
          title="No sources connected yet"
          description="Connect a source to search across your data."
          action={{ label: "Connect a source", onClick: () => navigate("/sources") }}
        />
      </div>
    );
  }

  // Cold storage is the customer's own bucket, connected like any other
  // destination, not something Databahn silently provides. Without one
  // connected there's genuinely nowhere for filtered events to have landed,
  // so those results wouldn't exist to search, not just be worth hiding.
  const coldStorageConnected = coldStorageTargets.length > 0;
  const hiddenColdStorageCount = coldStorageConnected
    ? 0
    : MOCK_RESULTS.filter((r) => r.provenance === "cold-storage").length;

  const runSearch = (override?: string) => {
    const q = (override ?? query).trim();
    if (!q) return;
    setStatus("searching");
    setResults([]);
    setExpandedId(null);
    setSeverityFilter(null);

    // At scale, progress per source type; 170 rows of per-source progress
    // would be the wait itself.
    const sourceNames =
      sourceCount > 8
        ? Array.from(new Set(env.sources.map((src) => src.group))).map(
            (g) => `${g} sources (${env.sources.filter((src) => src.group === g).length})`,
          )
        : env.sources.map((src) => src.name);
    const initialProgress = sourceNames.map((name, idx) => ({
      source: name,
      state: idx === 0 ? ("active" as const) : ("pending" as const),
    }));
    setProgress(initialProgress);

    let currentIdx = 0;
    const interval = setInterval(() => {
      currentIdx++;
      if (currentIdx >= sourceNames.length) {
        clearInterval(interval);
        setProgress((p) => p.map((s) => ({ ...s, state: "done" as const })));
        // Sample results only come back for a query that matches something in
        // them, so a query about nothing in the data reaches the no-results
        // state instead of the same eight results every time.
        const pool = coldStorageConnected ? MOCK_RESULTS : MOCK_RESULTS.filter((r) => r.provenance !== "cold-storage");
        const relevant = MOCK_RESULTS.some((r) => matchesQuery(q, `${r.summary} ${r.raw} ${r.source} ${Object.values(r.parsed).join(" ")}`));
        setResults(relevant ? pool : []);
        setStatus("done");
        return;
      }
      setProgress((p) =>
        p.map((s, idx) =>
          idx === currentIdx - 1 ? { ...s, state: "done" } : idx === currentIdx ? { ...s, state: "active" } : s
        )
      );
    }, 500);
  };

  return (
    <div className="w-full max-w-[1180px] mx-auto">
      <PageHeader
        title="Ask anything, anywhere"
        subtitle={`Search across your ${sourceCount} connected source${sourceCount === 1 ? "" : "s"}. Results include data filtered through active rules.`}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="e.g. failed sign-ins from 198.51.100.4 in the last 24h"
          className="mb-3"
        />
      </form>

      {status === "searching" && <PerSourceProgress sources={progress} />}

      {status === "done" && gaps.length > 0 && (
        <div className="flex items-start justify-between gap-3 mb-2 px-3 py-2 rounded-lg border border-border bg-card shadow-[inset_2px_0_0_var(--db-red)]" role="status">
          <div className="text-xs text-foreground/90">
            <p className="font-medium text-foreground">Results may be incomplete</p>
            <p className="mt-0.5 text-muted-foreground">
              {gaps
                .slice(0, 3)
                .map((g) => `${g.name} (${g.state === "stopped" ? "no data" : "partial data"} since ${clockAt(g.sinceMin)})`)
                .join(", ")}
              {gaps.length > 3 && ` and ${gaps.length - 3} more`}. No results from these sources in those windows means no data, not no
              activity.
            </p>
          </div>
          <button
            onClick={() => navigate("/")}
            className="text-xs font-medium text-primary hover:text-primary/80 underline underline-offset-2 shrink-0"
          >
            View source health
          </button>
        </div>
      )}

      {status === "done" && results.length === 0 && (
        <div className="rounded border border-border glass-card">
          <NoResults
            what="events"
            query={query}
            hint="Searched every connected source over the last 24 hours. Try an address, user, host or event type, or one of these:"
            onClear={() => {
              setQuery("");
              setStatus("idle");
            }}
          >
            <div className="flex flex-wrap justify-center gap-1.5 max-w-xl">
              {EXAMPLE_QUERIES.map((ex) => (
                <button
                  key={ex.q}
                  onClick={() => {
                    setQuery(ex.q);
                    runSearch(ex.q);
                  }}
                  className="text-xs text-left text-info bg-info/8 hover:bg-info/15 rounded-full px-2.5 py-1 transition-colors"
                >
                  {ex.q}
                </button>
              ))}
            </div>
          </NoResults>
        </div>
      )}

      {status === "done" && results.length > 0 && hiddenColdStorageCount > 0 && (
        <div className="flex items-center justify-between gap-3 mb-3 px-3 py-2 rounded-lg border border-border bg-card shadow-[inset_2px_0_0_#f59e0b]">
          <p className="text-xs text-muted-foreground">
            {hiddenColdStorageCount} filtered event{hiddenColdStorageCount === 1 ? "" : "s"} not shown, no cold storage
            connected, so nothing was retained after your rules filtered them out.
          </p>
          <button
            onClick={() => navigate("/pipeline")}
            className="text-xs font-medium text-primary hover:text-primary/80 underline underline-offset-2 shrink-0"
          >
            Connect cold storage
          </button>
        </div>
      )}

      {status === "done" && results.length > 0 && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-mono-db text-foreground">{results.length}</span> results across {sourceCount} source{sourceCount === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            {(["parsed", "raw"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                  mode === m ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "parsed" ? "Parsed" : "Raw"}
              </button>
            ))}
          </div>
        </div>
      )}

      {status === "done" && results.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          <button
            onClick={() => setSeverityFilter(null)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              severityFilter === null ? "border-primary/60 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            All ({results.length})
          </button>
          {SEVERITY_LEVELS.map((level) => {
            const count = results.filter((r) => severityBucket(r) === level.key).length;
            if (count === 0) return null;
            return (
              <button
                key={level.key}
                onClick={() => setSeverityFilter(severityFilter === level.key ? null : level.key)}
                className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  severityFilter === level.key ? "border-primary/60 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${level.dot}`} aria-hidden="true" />
                {level.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {status === "done" && results.length > 0 && (
        <div className="space-y-2">
          {results
            .filter((r) => severityFilter === null || severityBucket(r) === severityFilter)
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
            .map((r) => (
              <ResultCard
                key={r.id}
                r={r}
                expanded={expandedId === r.id}
                mode={mode}
                onToggleExpand={() => setExpandedId(expandedId === r.id ? null : r.id)}
                onFlag={() => setFlaggingResult(r)}
                flaggedRuleId={flaggedRuleIds.get(r.id)}
                navigate={navigate}
              />
            ))}
        </div>
      )}

      {status === "idle" && (
        <div className="mt-6">
          <p className="text-xs text-muted-foreground mb-2.5">Try one of these</p>
          <div className="space-y-2">
            {EXAMPLE_QUERIES.map((ex) => (
              <button
                key={ex.q}
                onClick={() => {
                  setQuery(ex.q);
                  runSearch(ex.q);
                }}
                className="w-full text-left rounded border border-border glass-card px-4 py-3 hover:border-primary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="text-sm text-foreground">{ex.q}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{ex.why}</p>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/70 mt-4">
            Plain language works. Cruz translates it into the query each store expects.
          </p>
        </div>
      )}

      {flaggingResult && (
        <FlagForDetectionModal
          result={flaggingResult}
          onClose={() => setFlaggingResult(null)}
          onSubmitted={(ruleId) => setFlaggedRuleIds((prev) => new Map(prev).set(flaggingResult.id, ruleId))}
        />
      )}
    </div>
  );
}
