import { useState } from "react";
import { motion } from "motion/react";
import { ChevronDown, Sparkles, RotateCcw, CircleSlash } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";

export interface FieldMapping {
  /** Raw field name as it arrives from the source. */
  raw: string;
  /** Example value from the captured sample, so a mapping can be verified
   * rather than trusted. */
  sample: string;
  /** Normalised field Cruz chose. */
  mapped: string;
  /** Cruz's confidence, which is what justifies reviewing the weak ones. */
  confidence: "high" | "medium" | "low";
}

const UNMAPPED = "Do not collect";

/** Normalised schema the pipeline maps into. */
const TARGET_FIELDS = [
  "Source IP",
  "Destination IP",
  "Source port",
  "Destination port",
  "User",
  "Action",
  "Rule name",
  "Application",
  "Bytes sent",
  "Bytes received",
  "Severity",
  "Timestamp",
  UNMAPPED,
];

/**
 * Mapping has to be editable, not just confirmable. Cruz proposes, and every
 * row can be reassigned or dropped, with the sample value shown so the choice
 * can be checked against real data instead of taken on trust.
 */
export function FieldMappingEditor({
  initial,
  onChange,
}: {
  initial: FieldMapping[];
  onChange?: (rows: FieldMapping[]) => void;
}) {
  const [rows, setRows] = useState(initial);

  const update = (raw: string, mapped: string) => {
    setRows((prev) => {
      const next = prev.map((r) => (r.raw === raw ? { ...r, mapped } : r));
      onChange?.(next);
      return next;
    });
  };

  const resetAll = () => {
    setRows(initial);
    onChange?.(initial);
  };

  const changed = rows.some((r, i) => r.mapped !== initial[i].mapped);
  const collected = rows.filter((r) => r.mapped !== UNMAPPED).length;

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-sm text-muted-foreground">
          Cruz detected <span className="text-foreground font-medium">PAN-OS</span> and mapped{" "}
          <span className="font-mono-db text-foreground">{collected}</span> fields. Change any of them.
        </p>
        {changed && (
          <button
            onClick={resetAll}
            className="shrink-0 text-xs text-info underline underline-offset-2 inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>

      <div className="rounded border border-border divide-y divide-border">
        {rows.map((r) => {
          const dropped = r.mapped === UNMAPPED;
          return (
            <div key={r.raw} className={`px-3 py-2.5 ${dropped ? "opacity-55" : ""}`}>
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <code className="font-mono-db text-[12px] text-foreground">{r.raw}</code>
                  <p className="font-mono-db text-[11px] text-muted-foreground truncate mt-0.5">{r.sample}</p>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="shrink-0 inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-[12px] text-foreground hover:border-primary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Change mapping for ${r.raw}`}
                    >
                      {dropped ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <CircleSlash className="w-3 h-3" /> {UNMAPPED}
                        </span>
                      ) : (
                        r.mapped
                      )}
                      <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-[260px] overflow-y-auto">
                    {TARGET_FIELDS.map((t) => (
                      <DropdownMenuItem key={t} onSelect={() => update(r.raw, t)}>
                        {t}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {r.confidence !== "high" && !dropped && (
                <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-info shrink-0" aria-hidden="true" />
                  {r.confidence === "low"
                    ? "Cruz is unsure about this one, worth a look."
                    : "Reasonable match, confirm if this field matters to you."}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <motion.p layout className="text-[11px] text-muted-foreground mt-2.5">
        Anything set to {UNMAPPED} is dropped at ingest, so it never reaches your SIEM or cold storage.
      </motion.p>
    </div>
  );
}
