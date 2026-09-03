import { useMemo, useState } from "react";
import { useLocation } from "react-router";
import { ListFilter } from "lucide-react";
import { PageHeader } from "@/app/components/shared/PageLayout";
import { SearchInput } from "@/app/components/shared/SearchInput";
import { EmptyState } from "@/app/components/shared/StateViews";
import { RuleRow } from "@/app/components/shared/RulePanel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { groupByCategory, liveCategoryStats } from "@/app/data/rules";
import { useSession } from "@/app/lib/SessionContext";

const ALL_SOURCES = "__all__";

/**
 * The drawer is a quick glimpse (capped preview per category), this is the
 * actual browsing surface: every rule, searchable, filterable by source and
 * category, nothing held back. Reached from the drawer's "Browse all rules"
 * link, which carries the drawer's current scope forward as router state so
 * this page opens already matching what the user was just looking at.
 */
export default function RulesLibrary() {
  const { connected, rules, toggleRule } = useSession();
  const location = useLocation();
  const initial = (location.state ?? {}) as { sourceId?: string; category?: string };

  const sources = connected.filter((c) => c.kind === "source");
  const [sourceId, setSourceId] = useState<string | undefined>(initial.sourceId);
  const [category, setCategory] = useState<string | undefined>(initial.category);
  const [query, setQuery] = useState("");

  const stats = liveCategoryStats(rules, sourceId);
  const allCategories = Array.from(new Set(stats.map((c) => c.category)));

  // Matches source + search only, ignoring the category filter, so a chip's
  // count always reflects "how many if you picked this one," not a number
  // that changes depending on which chip happens to be active right now.
  const bySourceAndQuery = useMemo(() => {
    return rules.filter((r) => {
      if (sourceId && !r.sourceIds.includes(sourceId)) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!r.name.toLowerCase().includes(q) && !r.reason.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rules, sourceId, query]);

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of bySourceAndQuery) map.set(r.category, (map.get(r.category) ?? 0) + 1);
    return map;
  }, [bySourceAndQuery]);

  const scoped = useMemo(
    () => (category ? bySourceAndQuery.filter((r) => r.category === category) : bySourceAndQuery),
    [bySourceAndQuery, category],
  );

  const grouped = groupByCategory(scoped);

  return (
    <div className="w-full max-w-[1180px] mx-auto">
      <PageHeader
        title="Reduction rules"
        subtitle="Every rule currently applicable across your connected sources, search or filter to narrow it down."
      />

      {/* Source narrows down to one of a handful of connected sources, a
          single committed choice, that's a dropdown, not a row of chips to
          scan. Category stays a chip cloud below since you're meant to
          compare options at a glance across five or six of them, a dropdown
          would hide that. Different shapes because they're different kinds
          of choice, not the same filter twice. */}
      <div className="flex items-center justify-center gap-2 mb-5">
        <SearchInput value={query} onChange={setQuery} placeholder="Search rule name or reason…" className="w-full max-w-md" />
        <Select value={sourceId ?? ALL_SOURCES} onValueChange={(v) => setSourceId(v === ALL_SOURCES ? undefined : v)}>
          <SelectTrigger className="w-[160px] shrink-0" size="sm">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SOURCES}>All sources</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5 mb-4">
        <button
          onClick={() => setCategory(undefined)}
          className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
            !category ? "border-primary/60 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          All ({bySourceAndQuery.length})
        </button>
        {allCategories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(category === c ? undefined : c)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              category === c ? "border-primary/60 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {c} ({categoryCounts.get(c) ?? 0})
          </button>
        ))}
      </div>

      {scoped.length === 0 ? (
        <EmptyState
          icon={ListFilter}
          title="No rules match"
          description="Try a different source, category, or search term."
        />
      ) : (
        <div className="space-y-8">
          {grouped.map(([groupCategory, categoryRules]) => (
            <div key={groupCategory}>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                {groupCategory} <span className="font-mono-db normal-case">· {categoryRules.length}</span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {categoryRules.map((rule) => (
                  <RuleRow key={rule.id} rule={rule} onToggle={() => toggleRule(rule.id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
