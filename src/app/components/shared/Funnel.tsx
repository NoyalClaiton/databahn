import { fmtCount, fmtSize, type Amount, type Funnel } from "@/app/lib/environment";
import { HEALTH_META } from "./HealthBadge";

export type FunnelMode = "rate" | "total";

/** Per minute is what's happening now; a total is what the range added up
 * to. Both are asked for, so both are one click apart. */
export function FunnelModeToggle({
  mode,
  setMode,
  range,
}: {
  mode: FunnelMode;
  setMode: (m: FunnelMode) => void;
  range: string;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background/40 p-0.5" role="group" aria-label="Show as">
      {(
        [
          ["rate", "Per minute"],
          ["total", `Total · ${range}`],
        ] as const
      ).map(([m, label]) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          aria-pressed={mode === m}
          className={`text-xs px-2 py-0.5 rounded transition-colors ${
            mode === m ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export const fmtAmount = (a: Amount, mode: FunnelMode) => ({
  events: `${fmtCount(a.events)}${mode === "rate" ? "/min" : ""}`,
  size: `${fmtSize(a.gb)}${mode === "rate" ? "/min" : ""}`,
});

/**
 * The four stages Databahn's customers asked to see: what came in, what
 * made it through processing, what the rules removed, and what landed at
 * each destination. Bars are scaled to received events, so a parse failure
 * or a rejecting destination shows as a visibly shorter bar, not just a
 * different number.
 */
export function FunnelBars({
  funnel,
  mode,
  showDestinations = true,
}: {
  funnel: Omit<Funnel, "perDestination"> & { perDestination?: Funnel["perDestination"] };
  mode: FunnelMode;
  showDestinations?: boolean;
}) {
  const base = Math.max(funnel.received.events, 1);
  const rows: { label: string; hint: string; amount: Amount; color: string; tone?: string }[] = [
    { label: "Received", hint: "arriving from the source", amount: funnel.received, color: "var(--db-blue)" },
    {
      label: "Processed",
      hint:
        funnel.received.events > 0 && funnel.processed.events / funnel.received.events < 0.99
          ? `${Math.round((1 - funnel.processed.events / funnel.received.events) * 100)}% not processed yet or failed`
          : "parsed and normalized",
      amount: funnel.processed,
      color: "var(--db-blue)",
    },
    {
      label: "Reduced",
      hint:
        funnel.processed.gb > 0 ? `${Math.round((funnel.reduced.gb / funnel.processed.gb) * 100)}% of size removed by rules` : "removed by rules",
      amount: funnel.reduced,
      color: "var(--db-green)",
      tone: "text-success",
    },
    { label: "Delivered", hint: "landed at destinations", amount: funnel.delivered, color: "var(--db-blue)" },
  ];

  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const f = fmtAmount(r.amount, mode);
        return (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-foreground">
                {r.label} <span className="text-muted-foreground/70">· {r.hint}</span>
              </span>
              <span className={`font-mono-db whitespace-nowrap ${r.tone ?? "text-foreground"}`}>
                {r.label === "Reduced" && r.amount.events > 0 ? "−" : ""}
                {f.events} <span className="text-muted-foreground/70">· {f.size}</span>
              </span>
            </div>
            {/* One hue for the flow itself; only what the rules removed is
                set apart. Four colours read as four unrelated things. */}
            <div className="h-1 rounded-full bg-muted/30 overflow-hidden mt-1">
              <div className="h-full rounded-full opacity-70" style={{ width: `${Math.min(100, (r.amount.events / base) * 100)}%`, background: r.color }} />
            </div>
          </div>
        );
      })}
      {showDestinations && funnel.perDestination && funnel.perDestination.length > 0 && (
        <div className="pl-3 border-l border-border space-y-1 pt-1">
          {funnel.perDestination.map((d) => {
            const f = fmtAmount(d.amount, mode);
            const problem = Math.round(d.acceptance * 100) < 100 || (d.state === "stopped" && mode === "rate");
            return (
              <div key={d.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${HEALTH_META[d.state].dot}`} aria-hidden="true" />
                  <span className="truncate">{d.name}</span>
                  {problem && (
                    <span className={d.state === "stopped" ? "text-destructive" : "text-amber-400"}>
                      {d.state === "stopped" && mode === "rate" ? "not accepting, held" : `${Math.round(d.acceptance * 100)}% accepted`}
                    </span>
                  )}
                </span>
                <span className="font-mono-db text-muted-foreground whitespace-nowrap">
                  {f.events} · {f.size}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
