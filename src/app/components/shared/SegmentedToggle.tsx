import { motion } from "motion/react";

/** A sliding-pill segmented control, replaces flat instant-color-swap toggle
 * buttons wherever there's a small fixed set of options (protocol, raw/parsed,
 * auth method). The pill uses a shared `layoutId` so it physically slides
 * between options instead of the two buttons just swapping colors. */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  layoutId,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  layoutId: string;
}) {
  return (
    <div className="relative flex gap-1 p-1 rounded-lg bg-background/60 border border-border">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`relative flex-1 h-8 rounded text-sm font-medium transition-colors z-10 ${
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {active && (
              <motion.div
                layoutId={layoutId}
                className="absolute inset-0 bg-primary rounded -z-10"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
