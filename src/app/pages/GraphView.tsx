import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Database } from "lucide-react";
import { PageHeader } from "@/app/components/shared/PageLayout";
import { ReefGraph } from "@/app/components/shared/ReefGraph";
import { SearchInput } from "@/app/components/shared/SearchInput";
import { ENTITY_INDEX, REEF_NODES, subgraphFrom } from "@/app/data/graphData";
import { EmptyState } from "@/app/components/shared/StateViews";
import { useEnvironment } from "@/app/lib/environment";
import { useSession } from "@/app/lib/SessionContext";
import { NoResults } from "@/app/components/shared/NoResults";
import { matchesQuery } from "@/app/lib/matchQuery";

/** Concrete investigations to start from, mirroring the Search page so the
 * cold start is solved the same way in both places. */
const EXAMPLE_INVESTIGATIONS = [
  { q: "everything connected to j.rivera@acme.com", why: "Start from the compromised identity and follow what it touched" },
  { q: "what reached SRV-DC-03", why: "Work backwards from a critical asset to find the entry point" },
  { q: "the path to 198.51.100.9", why: "Trace the exfil destination back through every hop" },
];

interface GraphHandoff {
  seedEntityId?: string;
  seedQuery?: string;
}

/**
 * Reef investigation graph. The graph itself is the ported `ReefGraph`
 * (see that file), so this page only handles the query entry point and the
 * handoff from a Search result. The search bar stays visible once a query
 * has run, the same shape Search itself already uses, rather than swapping
 * to a "results" page with its own separate way back to a blank state.
 */
export default function GraphView() {
  const location = useLocation();
  const navigate = useNavigate();
  const { connected } = useSession();
  const handoff = location.state as GraphHandoff | null;
  const [query, setQuery] = useState(handoff?.seedQuery ?? "");
  const [asked, setAsked] = useState(Boolean(handoff));
  const [seedEntityId, setSeedEntityId] = useState<string | undefined>(handoff?.seedEntityId);

  // The environment, so the sample's sources count, the same as every
  // other page; a session connection alone left the graph empty.
  const sourceCount = useEnvironment().sources.length;
  if (sourceCount === 0) {
    return (
      <div className="w-full max-w-[1180px] mx-auto">
        <PageHeader
          title="See how it all connects"
          subtitle="Reef correlates entities across your connected sources, including data never evaluated by detection rules."
        />
        <EmptyState
          icon={Database}
          title="No sources connected yet"
          description="Connect a source to investigate relationships in your data."
          action={{ label: "Connect a source", onClick: () => navigate("/sources") }}
        />
      </div>
    );
  }

  const runQuery = (q: string) => {
    if (!q.trim()) return;
    setQuery(q);
    // A freshly typed query has no known entity to seed from, only the
    // Search handoff carries one, and that's specific to the query it came
    // from, not whatever gets typed here next.
    setSeedEntityId(undefined);
    setAsked(true);
  };

  const graphSubset = subgraphFrom(seedEntityId ? ENTITY_INDEX[seedEntityId] ?? null : null, 1);

  return (
    <div className="w-full max-w-[1180px] mx-auto">
      <PageHeader
        title="See how it all connects"
        subtitle={`Reef correlates entities across your ${sourceCount} connected source${sourceCount === 1 ? "" : "s"}, including data never evaluated by detection rules.`}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runQuery(query);
        }}
      >
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="e.g. show me everything connected to j.rivera@acme.com"
          className="mb-4"
        />
      </form>

      {!asked ? (
        <div>
          <p className="text-xs text-muted-foreground mb-2.5">Start with one of these</p>
          <div className="space-y-2">
            {EXAMPLE_INVESTIGATIONS.map((ex) => (
              <button
                key={ex.q}
                onClick={() => runQuery(ex.q)}
                className="w-full text-left rounded border border-border glass-card px-4 py-3 hover:border-primary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="text-sm text-foreground">{ex.q}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{ex.why}</p>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/70 mt-4">
            Reef correlates across every connected source, including records that never reached your SIEM.
          </p>
        </div>
      ) : (
        !seedEntityId && !REEF_NODES.some((n) => matchesQuery(query, `${n.label} ${n.sublabel ?? ""}`)) ? (
          // A query that names no user, host or address in the data gets the
          // shared no-results state, not the same graph every time.
          <div className="rounded border border-border glass-card">
            <NoResults
              what="entities"
              query={query}
              hint="Name a user, host, IP address or account that appears in your data, or start from one of these:"
              onClear={() => {
                setQuery("");
                setAsked(false);
              }}
            >
              <div className="flex flex-wrap justify-center gap-1.5 max-w-xl">
                {EXAMPLE_INVESTIGATIONS.map((ex) => (
                  <button
                    key={ex.q}
                    onClick={() => runQuery(ex.q)}
                    className="text-xs text-left text-info bg-info/8 hover:bg-info/15 rounded-full px-2.5 py-1 transition-colors"
                  >
                    {ex.q}
                  </button>
                ))}
              </div>
            </NoResults>
          </div>
        ) : (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            Investigating <span className="text-foreground font-medium">{query}</span>
          </p>
          {/* Keyed on the query so a genuinely new investigation gets a clean
              pan/zoom/focus instead of inheriting wherever the last one left
              the camera, initialFocusIndex is only ever read on mount.
              Subgraphed around the focus entity, otherwise every query
              rendered the identical full graph, just recentered. */}
          <ReefGraph
            key={query}
            nodes={graphSubset.nodes}
            initialFocusIndex={graphSubset.focusIndex}
          />
        </>
        )
      )}
    </div>
  );
}
