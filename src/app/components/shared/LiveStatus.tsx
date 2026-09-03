import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Principle 7c / 9c (Doherty Threshold), the general "system is actively
 * working, show it" primitive. Used directly for lightweight inline progress
 * (Federated Search's per-source lines, Pipeline overview's "last updated"),
 * and as the base for `LiveTestState` (connector test/verify steps).
 */
export function LiveStatus({
  label,
  tone = "active",
}: {
  label: string;
  tone?: "active" | "done" | "error";
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {tone === "active" && (
        <span className="relative flex w-2 h-2">
          <span className="absolute -inset-1.5 rounded-full bg-info/30 blur-sm live-pulse-dot" />
          <span className="live-pulse-dot absolute inline-flex w-full h-full rounded-full bg-info" />
        </span>
      )}
      {tone === "done" && <span className="w-2 h-2 rounded-full bg-success" />}
      {tone === "error" && <span className="w-2 h-2 rounded-full bg-destructive" />}
      <span className={tone === "active" ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

export type PerSourceStatus = { source: string; state: "pending" | "active" | "done" };

/** Federated Search's honest per-source progress, separate systems, separate speeds. */
export function PerSourceProgress({ sources }: { sources: PerSourceStatus[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-mono-db text-muted-foreground">
      {sources.map((s) => (
        <span key={s.source} className="inline-flex items-center gap-1.5">
          {s.state === "active" ? (
            <Loader2 className="w-3 h-3 animate-spin text-info" aria-hidden="true" />
          ) : (
            <span
              className={`w-1.5 h-1.5 rounded-full ${s.state === "done" ? "bg-success" : "bg-muted-foreground/40"}`}
            />
          )}
          <span className={s.state === "done" ? "text-foreground/70" : ""}>
            {s.source}: {s.state === "done" ? "done" : s.state === "active" ? "searching…" : "queued"}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Rounds up elapsed ms into a friendly "Ns" readout for escalating status copy. */
export function useElapsedSeconds(active: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(id);
  }, [active]);
  return elapsed;
}
