import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";

/**
 * Screens slide in and out instead of hard-swapping. This is the single
 * biggest perceived-quality difference against the reference app, which
 * transitions every screen (x: 60 → 0 → -60). Routes felt "broken" partly
 * because nothing connected one screen to the next.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      // min-h, not a fixed height: a fixed-height wrapper let taller pages
      // overflow it, so the shell's bottom padding sat under the wrapper
      // instead of under the content, every scrolling page ran flush to
      // the bottom edge while keeping its full gap at the top.
      className="w-full min-h-full"
    >
      {children}
    </motion.div>
  );
}

/**
 * Full-bleed page frame with a centered hero. Replaces the `max-w-4xl mx-auto`
 * column that left most of a wide screen empty. `wide` opts into the roomier
 * content measure for dashboards and diagrams.
 */
export function PageHeader({
  title,
  subtitle,
  align = "center",
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  align?: "center" | "left";
  actions?: ReactNode;
}) {
  const centered = align === "center";
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.45 }}
      className={`mb-10 ${centered ? "text-center" : "flex items-end justify-between gap-6"}`}
    >
      <div>
        <h1
          className="text-[32px] leading-tight font-semibold tracking-tight mb-3"
          style={{
            background: "linear-gradient(100deg, var(--db-neutral-95) 0%, var(--db-blue-light) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >{title}</h1>
        {subtitle && (
          <p className={`text-base leading-relaxed text-muted-foreground ${centered ? "max-w-xl mx-auto" : "max-w-2xl"}`}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </motion.div>
  );
}

/**
 * The missing middle of the type scale. Pages jumped straight from the 32px
 * `PageHeader` h1 to 12-14px body copy, with section labels improvised inline
 * as `<p>` in five different sizes/opacities, so nothing on a multi-section
 * page read as a section. This is the one h2: same size, same weight, same
 * spacing everywhere, and a real heading element so the document actually has
 * an outline for screen readers instead of a flat wall of paragraphs.
 */
export function SectionHeading({
  title,
  count,
  action,
}: {
  title: string;
  /** Rendered as the same `· n` mono suffix the rules list already uses. */
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 mb-3">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {title}
        {count !== undefined && <span className="font-mono-db normal-case"> · {count}</span>}
      </h2>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * The app's one metric tile. Lived privately inside Pipeline overview, so
 * Dashboard had no way to show a number without inventing a second look for
 * the same idea; shared here instead of copied, so the two pages cannot drift.
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = "neutral",
  onClick,
  actionLabel,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  sub: string;
  /** Color only where it actually signals something. A plain number has no
   * inherent good or bad, and tinting it anyway is decoration that makes tiles
   * look like they follow different rules instead of one. */
  tone?: "neutral" | "good" | "warning";
  /** A tile that names a problem should lead to the fix, not just describe it. */
  onClick?: () => void;
  /** Spells out where `onClick` goes, so a clickable tile doesn't rely on the
   * user discovering it by hovering. */
  actionLabel?: string;
}) {
  // A thin coloured edge, not a coloured frame: three amber frames in a row
  // shouted louder than the status card they sit under.
  const edge = tone === "good" ? "shadow-[inset_2px_0_0_var(--db-green)]" : tone === "warning" ? "shadow-[inset_2px_0_0_#f59e0b]" : "";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`text-left rounded border border-border bg-card p-4 transition-colors ${edge} ${
        onClick ? "hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer w-full" : ""
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
        {label}
      </div>
      <p className="text-lg font-mono-db text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
      {onClick && actionLabel && <p className="text-xs text-primary mt-1">{actionLabel} →</p>}
    </Tag>
  );
}

/** Staggered entrance for grids and lists, matching the reference app's
 * per-item cascade rather than everything appearing at once. */
export function StaggerItem({ index, children }: { index: number; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 + index * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}

/** Every right-side drawer (source/destination details, rules, routing,
 * cold storage) shares this width, so they all open to the same edge. */
export const DRAWER_WIDTH = "max-w-[800px]";

/** The page-level time range control (Dashboard, Savings): one look, one
 * behaviour, wherever a page is scoped to a period. */
export function RangeToggle({
  range,
  setRange,
  ranges = ["24H", "7D", "30D"],
}: {
  range: string;
  setRange: (r: string) => void;
  ranges?: readonly string[];
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-background/40 p-1" role="group" aria-label="Time range">
      {ranges.map((r) => (
        <button
          key={r}
          onClick={() => setRange(r)}
          aria-pressed={range === r}
          className={`text-xs px-2.5 py-1 rounded font-mono-db transition-colors ${
            range === r ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
