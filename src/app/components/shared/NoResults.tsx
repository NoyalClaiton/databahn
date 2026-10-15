import type { ReactNode } from "react";
import { SearchX } from "lucide-react";

/**
 * The one "nothing matches" state, for every search and filter in the app
 * (tables, catalogs, rules, search, graph). Says what didn't match, how to
 * widen it, and gives the way out in the same place every time.
 */
export function NoResults({
  what,
  query,
  hint,
  onClear,
  clearLabel = "Clear search",
  children,
}: {
  /** "sources", "rules", "results"… */
  what: string;
  query?: string;
  hint: string;
  onClear?: () => void;
  clearLabel?: string;
  /** An extra next step under the clear action (e.g. request an integration). */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-10">
      <SearchX className="w-5 h-5 text-muted-foreground mb-2.5" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">
        No {what} match{query?.trim() ? <> “{query.trim()}”</> : " these filters"}
      </p>
      <p className="text-xs text-muted-foreground mt-1 max-w-sm">{hint}</p>
      {onClear && (
        <button onClick={onClear} className="mt-3 text-xs font-medium text-primary hover:text-primary/80 underline underline-offset-2">
          {clearLabel}
        </button>
      )}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
