import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { X, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Switch } from "@/app/components/ui/switch";
import { groupByCategory, liveCategoryStats, RULE_LIBRARY_TOTAL, type ReductionRule } from "@/app/data/rules";
import { DRAWER_WIDTH } from "./PageLayout";
import { CONNECTORS } from "@/app/data/connectors";
import { useEscape } from "@/app/lib/useEscape";

/** The drawer is the quick glimpse, not the place to scroll through 300+
 * rows, that's what the full rules page is for. Capped per category, with
 * an explicit "N more" so it's obvious the list keeps going, not that this
 * is genuinely everything. */
const DRAWER_PREVIEW_LIMIT = 6;

const usdShort = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/**
 * Principle 9, the actual review surface, never a blocking gate. Grouped by
 * category, plain-language reason, live before/after sample, individually
 * toggleable. Reached by clicking the Highway band or a specific source's
 * segment (scoped filtering happens by whoever renders this, via `rules`).
 */
export function RulePanel({
  rules,
  scopeLabel,
  sourceId,
  category,
  onToggle,
  onClose,
  focusRuleId,
  savings,
}: {
  rules: ReductionRule[];
  scopeLabel: string;
  /** When set, only this rule category is shown, so clicking a pipeline stage
   * lands on the rules that stage actually applies. */
  category?: string;
  /** When set, counts are scoped to that source rather than the whole pipeline. */
  sourceId?: string;
  onToggle: (id: string) => void;
  onClose: () => void;
  /** Opened from "View in Pipeline" on a just-proposed rule, that rule is
   * the whole reason the panel opened, landing on a wall of 900+ rules with
   * no indication which one is new isn't actually an answer to "where do I
   * go next." */
  focusRuleId?: string;
  /** Opened from Savings: each rule shows what it's worth, the list is split
   * into what's applied and what's off, and nothing is capped. */
  savings?: { valueOf: (ruleId: string) => number; initialView: "applied" | "off" };
}) {
  const navigate = useNavigate();
  useEscape(onClose);
  const [view, setView]
 = useState<"applied" | "off">(savings?.initialView ?? "applied");
  const stats = liveCategoryStats(rules, sourceId);
  // Every category the current scope contains, so the drawer can switch
  // between them in place rather than sending the user back to the pipeline
  // to click a different stage.
  const allCategories = Array.from(new Set(stats.map((c) => c.category)));
  const [active, setActive] = useState<string | null>(category ?? null);
  const focusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusRuleId) focusRef.current?.scrollIntoView({ block: "center" });
  }, [focusRuleId]);
  const byCategory = active ? rules.filter((r) => r.category === active) : rules;
  const scoped = savings ? byCategory.filter((r) => (view === "applied" ? r.enabled : !r.enabled)) : byCategory;
  const grouped = groupByCategory(
    savings ? [...scoped].sort((a, b) => savings.valueOf(b.id) - savings.valueOf(a.id)) : scoped,
  );
  const savedUsd = savings ? rules.filter((r) => r.enabled).reduce((a, r) => a + savings.valueOf(r.id), 0) : 0;
  const availableUsd = savings ? rules.filter((r) => !r.enabled).reduce((a, r) => a + savings.valueOf(r.id), 0) : 0;
  const onCount = rules.filter((r) => r.enabled).length;
  const offCount = rules.length - onCount;
  const totals = stats.reduce(
    (a, c) => ({ applicable: a.applicable + c.applicable, active: a.active + c.active }),
    { applicable: 0, active: 0 },
  );
  const statFor = (category: string) => {
    const rows = stats.filter((c) => c.category === category);
    return rows.reduce(
      (a, c) => ({ applicable: a.applicable + c.applicable, active: a.active + c.active }),
      { applicable: 0, active: 0 },
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[95] bg-background/70 backdrop-blur-sm flex justify-end"
        style={{ paddingRight: "var(--cruz-width, 0px)" }}
        onClick={onClose}
      >
        <motion.div
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className={`w-full ${DRAWER_WIDTH} h-full bg-card border-l border-border overflow-y-auto`}
          role="dialog"
          aria-label="Reduction rules"
        >
          {/* Header and tabs are one sticky unit, not two independently
              positioned ones, a hardcoded pixel offset between them (the
              previous approach) silently breaks the moment either row's
              content height changes, letting a rule row's switch show
              through the gap while scrolling. */}
          <div className="sticky top-0 z-10 bg-card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <p className="text-sm font-medium text-foreground">Reduction rules</p>
                {savings ? (
                  <p className="text-xs text-muted-foreground">
                    {scopeLabel} · saving <span className="font-mono-db text-foreground">{usdShort(savedUsd)}/mo</span> from{" "}
                    <span className="font-mono-db">{onCount}</span> rules
                    {offCount > 0 && (
                      <>
                        {" "}
                        · <span className="font-mono-db text-success">~{usdShort(availableUsd)}/mo</span> more from{" "}
                        <span className="font-mono-db">{offCount}</span> off
                      </>
                    )}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {active ?? scopeLabel} · <span className="font-mono-db">{active ? statFor(active).active : totals.active}</span> of{" "}
                    <span className="font-mono-db">{active ? statFor(active).applicable : totals.applicable}</span> applicable active
                  </p>
                )}
              </div>
              <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* This is a quick glimpse, not the browsing surface, every rule
                really does live below (nothing invented), just capped per
                category so a 300+ rule scope doesn't turn into an endless
                scroll in a narrow drawer. */}
            <div className="flex items-center justify-between gap-3 px-5 py-2 border-b border-border bg-muted/10">
              {savings ? (
                // The app's quiet toggle (range, per minute / total).
                <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background/40 p-0.5" role="group" aria-label="Show rules">
                  {(
                    [
                      ["applied", `Applied (${onCount})`],
                      ["off", `Off (${offCount})`],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      aria-pressed={view === v}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${view === v ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/70">A quick preview of your active rules, capped per category below.</p>
              )}
              <button
                onClick={() => navigate("/rules", { state: { sourceId, category: active ?? undefined } })}
                className="text-xs font-medium text-primary hover:text-primary/80 underline underline-offset-2 inline-flex items-center gap-1 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                Browse all rules
                <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </button>
            </div>

            {/* category tabs */}
            <div className="flex flex-wrap gap-1.5 px-5 py-3 border-b border-border">
              <button
                onClick={() => setActive(null)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  !active ? "border-primary/60 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                All ({totals.active})
              </button>
              {allCategories.map((c) => {
                const st = statFor(c);
                return (
                  <button
                    key={c}
                    onClick={() => setActive(active === c ? null : c)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      active === c ? "border-primary/60 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {c.replace(" & heartbeat suppression", "").replace("-noise trimming", " noise")} ({st.active})
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-5 space-y-6">
            {grouped.map(([category, categoryRules]) => {
              // The just-proposed rule is the whole reason this panel might
              // be open, a hard cap that hides it would silently defeat the
              // focus/scroll feature, so it always gets a seat even past the
              // preview limit.
              const focusInCategory = categoryRules.find((r) => r.id === focusRuleId);
              const preview = savings ? categoryRules : categoryRules.slice(0, DRAWER_PREVIEW_LIMIT);
              const shown =
                focusInCategory && !preview.includes(focusInCategory) ? [...preview, focusInCategory] : preview;
              const hiddenCount = categoryRules.length - shown.length;
              return (
                <div key={category}>
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{category}</p>
                    <p className="text-xs font-mono-db text-muted-foreground">
                      {statFor(category).active}/{statFor(category).applicable} on
                    </p>
                  </div>
                  <div className="space-y-3">
                    {shown.map((rule) => (
                      <RuleRow
                        key={rule.id}
                        rule={rule}
                        onToggle={() => onToggle(rule.id)}
                        focusRef={rule.id === focusRuleId ? focusRef : undefined}
                        isFocused={rule.id === focusRuleId}
                        value={savings ? savings.valueOf(rule.id) : undefined}
                      />
                    ))}
                  </div>
                  {hiddenCount > 0 && (
                    <button
                      onClick={() => navigate("/rules", { state: { sourceId, category } })}
                      className="mt-2 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      +{hiddenCount} more in this category
                      <ArrowRight className="w-3 h-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              );
            })}
            {scoped.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {savings && view === "off" ? "Every applicable rule is on." : "No rules applied in this scope."}
              </p>
            )}

            <p className="text-xs text-muted-foreground/70 border-t border-border pt-4">
              Databahn maintains {RULE_LIBRARY_TOTAL}+ security-specific reduction rules,{" "}
              <span className="font-mono-db">{totals.applicable}</span> of them applicable in this scope.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export function RuleRow({
  rule,
  onToggle,
  focusRef,
  isFocused,
  value,
}: {
  rule: ReductionRule;
  onToggle: () => void;
  focusRef?: React.Ref<HTMLDivElement>;
  isFocused?: boolean;
  /** $/mo this rule saves (on) or would add (off), when opened from Savings. */
  value?: number;
}) {
  // Most rules apply to exactly one source, showing that back would just be
  // noise, this only earns its place once a rule genuinely spans more than
  // one, most likely a compliance exclusion raised from a Search result.
  const appliesTo =
    rule.sourceIds.length > 1
      ? rule.sourceIds.map((id) => CONNECTORS.find((c) => c.id === id)?.name ?? id).join(", ")
      : null;
  return (
    <div
      ref={focusRef}
      className={`rounded-lg border p-3 transition-colors ${
        isFocused ? "border-primary/60 ring-1 ring-primary/30 bg-primary/[0.03]" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm text-foreground font-medium">{rule.name}</p>
            {isFocused && (
              <span className="text-[10px] uppercase tracking-wide text-primary bg-primary/15 px-1.5 py-[1px] rounded-full font-medium shrink-0">
                Just proposed
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{rule.reason}</p>
          {appliesTo && <p className="text-xs text-info/80 mt-1">Applies to: {appliesTo}</p>}
          {isFocused && !rule.enabled && (
            <p className="text-xs text-amber-400 mt-1">Off until you review and turn it on.</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {value !== undefined && (
            <span className={`text-xs font-mono-db ${rule.enabled ? "text-foreground" : "text-success"}`} title={rule.enabled ? "Saving per month" : "Would save per month"}>
              {rule.enabled ? "" : "+"}
              {usdShort(value)}/mo
            </span>
          )}
          <Switch checked={rule.enabled} onCheckedChange={onToggle} aria-label={`Toggle ${rule.name}`} />
        </div>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-1.5 font-mono-db text-xs">
        {/* Bare before/after lines read as broken text, not a diff, unless
            you already know the convention, labeling makes the strikethrough
            legible on its own instead of relying on that assumption. */}
        <div className="flex items-baseline gap-1.5">
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/50">Raw</span>
          <span className={rule.enabled ? "text-muted-foreground line-through decoration-destructive/50" : "text-muted-foreground"}>
            {rule.before}
          </span>
        </div>
        {rule.enabled && (
          <div className="flex items-baseline gap-1.5">
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-success/50">Kept</span>
            <span className="text-success/90">{rule.after}</span>
          </div>
        )}
      </div>
    </div>
  );
}
