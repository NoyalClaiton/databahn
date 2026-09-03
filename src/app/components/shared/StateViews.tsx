import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";

/** Nielsen #8 (minimalist), icon + message + one optional CTA, nothing more. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="relative mb-4">
        <div
          className="absolute inset-0 rounded-xl"
          style={{ background: "radial-gradient(ellipse at center, rgba(74,148,249,0.12), transparent 70%)" }}
          aria-hidden="true"
        />
        <div className="relative w-14 h-14 rounded-xl glass-card border border-primary/20 flex items-center justify-center">
          <Icon className="w-6 h-6 text-primary/70" aria-hidden="true" />
        </div>
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>}
      {action && (
        <Button size="sm" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

/**
 * Nielsen #9, specific, plain-language, recoverable. Never a bare "failed."
 * `checklist` renders Cruz's proactive troubleshooting steps (principle 2b/7c).
 */
export function ErrorState({
  title,
  description,
  checklist,
  onRetry,
  retryLabel = "Retry",
  escapeHatch,
}: {
  title: string;
  description: string;
  checklist?: string[];
  onRetry?: () => void;
  retryLabel?: string;
  escapeHatch?: { label: string; onClick: () => void };
}) {
  return (
    <div
      className="rounded border border-destructive/30 bg-destructive/[0.06] p-5"
      role="alert"
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
      {checklist && checklist.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {checklist.map((item, i) => (
            <li key={i} className="text-sm text-foreground/80 flex gap-2">
              <span className="text-destructive mt-0.5">·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex items-center gap-3">
        {onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
        {escapeHatch && (
          <button
            onClick={escapeHatch.onClick}
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {escapeHatch.label}
          </button>
        )}
      </div>
    </div>
  );
}

/** Peak-End Rule, the success moment carries disproportionate weight in how the
 * whole flow is remembered, so it gets real motion polish, not just a checkmark. */
export function SuccessState({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-6">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 140, damping: 15 }}
        className="relative w-14 h-14 rounded-full bg-success/15 flex items-center justify-center mb-4"
      >
        <span className="success-ring absolute inset-0 rounded-full border-2 border-success" aria-hidden="true" />
        <span className="success-ring absolute inset-0 rounded-full border-2 border-success" style={{ animationDelay: "0.5s" }} aria-hidden="true" />
        <CheckCircle2 className="w-7 h-7 text-success" aria-hidden="true" />
      </motion.div>
      <p className="text-base font-medium text-foreground">{title}</p>
      {description && <p className="text-sm text-muted-foreground mt-1.5 max-w-md">{description}</p>}
      {children && <div className="mt-5 w-full">{children}</div>}
    </div>
  );
}
