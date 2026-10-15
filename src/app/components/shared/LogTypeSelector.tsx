import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Sparkles, RotateCcw } from "lucide-react";
import type { LogType } from "@/app/data/logTypes";
import { Switch } from "@/app/components/ui/switch";
import { ContextualHelpTip } from "./ContextualHelpTip";

const fmtGb = (gb: number) => (gb >= 1000 ? `${(gb / 1000).toFixed(2)} TB` : `${Math.round(gb)} GB`);

/**
 * Choosing which log types to collect is where the volume and cost decision
 * actually gets made, so it is a real step rather than an assumption. Cruz
 * pre-selects, states its reasoning per row, and the running total updates as
 * the user overrides, which keeps the tradeoff visible while they decide.
 */
export function LogTypeSelector({
  types,
  totalVolumeGb,
  onChange,
}: {
  types: LogType[];
  /** Total GB/day this source would emit with everything enabled. */
  totalVolumeGb: number;
  onChange?: (selectedIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(types.filter((t) => t.defaultOn).map((t) => t.id)),
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onChange?.(Array.from(next));
      return next;
    });
  };

  const resetToCruz = () => {
    const next = new Set(types.filter((t) => t.defaultOn).map((t) => t.id));
    setSelected(next);
    onChange?.(Array.from(next));
  };

  const { estimated, isDefault } = useMemo(() => {
    const est = types
      .filter((t) => selected.has(t.id))
      .reduce((a, t) => a + totalVolumeGb * t.volumeShare * (t.recommended === "sample" ? 0.25 : 1), 0);
    const def = types.every((t) => selected.has(t.id) === t.defaultOn);
    return { estimated: est, isDefault: def };
  }, [selected, types, totalVolumeGb]);

  return (
    // h-full so the list below can genuinely fill whatever room is left
    // instead of guessing a max-height that either wastes space or clips
    // the total, the wizard's step body now hands this component a real
    // height to size against (see OnboardingWizard).
    <div className="h-full flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-3 shrink-0">
        <p className="text-sm text-muted-foreground">
          Cruz pre-selected {types.filter((t) => t.defaultOn).length} of {types.length} log types based on
          detection value per byte. Change anything you like.
        </p>
        {!isDefault && (
          <button
            onClick={resetToCruz}
            className="shrink-0 text-xs text-info underline underline-offset-2 inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>

      {/* flex-1 + min-h-0 is what actually lets this shrink below its
          content size so it scrolls instead of pushing the total off the
          bottom, a plain flex-1 child ignores overflow and grows past its
          container otherwise. */}
      <div className="flex-1 min-h-0 rounded border border-border divide-y divide-border overflow-y-auto">
        {types.map((t) => {
          const on = selected.has(t.id);
          return (
            <div key={t.id} className={`flex items-start gap-3 px-3 py-2.5 ${on ? "" : "opacity-60"}`}>
              <Switch checked={on} onCheckedChange={() => toggle(t.id)} aria-label={`Collect ${t.name} logs`} className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-foreground">{t.name}</span>
                  {t.recommended === "sample" && on && (
                    <ContextualHelpTip content={t.rationale}>
                      <span className="text-[10px] font-mono-db text-info border border-info/30 bg-info/10 rounded px-1.5 py-0.5">
                        sampled
                      </span>
                    </ContextualHelpTip>
                  )}
                  {t.defaultOn && (
                    <ContextualHelpTip content={t.rationale}>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Sparkles className="w-2.5 h-2.5 text-info" aria-hidden="true" />
                        Cruz
                      </span>
                    </ContextualHelpTip>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{t.purpose}</p>
              </div>
              <span className="font-mono-db text-xs text-muted-foreground shrink-0 mt-0.5">
                {(t.volumeShare * 100).toFixed(t.volumeShare < 0.01 ? 1 : 0)}%
              </span>
            </div>
          );
        })}
      </div>

      <motion.div
        layout
        className="shrink-0 flex items-center justify-between mt-3 rounded border border-border bg-background/40 px-3 py-2.5"
      >
        <span className="text-xs text-muted-foreground">Estimated after sampling</span>
        <span className="font-mono-db text-sm text-foreground">
          {fmtGb(estimated)}/day
          <span className="text-muted-foreground"> of {fmtGb(totalVolumeGb)}</span>
        </span>
      </motion.div>
    </div>
  );
}
