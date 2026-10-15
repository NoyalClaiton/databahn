import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { useSession, type WizardFieldState, type WizardKind } from "@/app/lib/SessionContext";
import { CONNECTORS } from "@/app/data/connectors";
import { VendorLogo, hasVendorLogo, chipSafeColor } from "./VendorLogo";

export interface WizardStep {
  id: string;
  label: string;
  render: (helpers: { advance: () => void; back: () => void }) => ReactNode;
  /** Declared here rather than inside `render` so the shell can pin the action
   * bar to the card. Steps whose body owns its own actions (a success screen)
   * simply omit it. */
  primary?: { label: string; disabled?: boolean; onClick?: () => void };
  secondary?: { label: string; onClick: () => void };
  hideBack?: boolean;
}

/** Where each kind of wizard came from, and goes back to. */
const CATALOG: Record<WizardKind, { path: string; label: string }> = {
  source: { path: "/sources", label: "Sources" },
  destination: { path: "/destinations", label: "Destinations" },
  notification: { path: "/notifications", label: "Notifications" },
};

/**
 * Principle 7: everything a user connects, a source, a destination or a
 * notification channel, runs through this same shell. Publishes live state
 * into `SessionContext` (7b) so Cruz never needs re-briefing.
 */
export function OnboardingWizard({
  connectorName,
  connectorKind,
  steps,
  onFinish,
  logo,
}: {
  connectorName: string;
  connectorKind: WizardKind;
  steps: WizardStep[];
  onFinish?: () => void;
  /** For things not in the data connector catalog (a Slack workspace, a
   * PagerDuty service), which bring their own mark. */
  logo?: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();
  const { setWizard } = useSession();
  const catalogPath = CATALOG[connectorKind].path;
  const catalogLabel = CATALOG[connectorKind].label;
  const step = steps[index];
  const def = CONNECTORS.find((c) => c.name === connectorName);

  useEffect(() => {
    setWizard({
      connectorName,
      connectorKind,
      stepIndex: index,
      totalSteps: steps.length,
      stepLabel: step.label,
      fields: {},
    });
  }, [index, connectorName, connectorKind, step.label, steps.length, setWizard]);

  useEffect(() => () => setWizard(null), [setWizard]);

  const advance = () => {
    if (index < steps.length - 1) setIndex((i) => i + 1);
    else onFinish?.();
  };
  const back = () => {
    if (index === 0) {
      navigate(catalogPath);
      return;
    }
    // A step with no `primary` (a "redirecting…" beat, say) auto-advances
    // itself, landing back here would just replay it and bounce forward
    // again, so going back has to walk past it to the nearest step the
    // user can actually act on.
    let i = index - 1;
    while (i > 0 && !steps[i].primary) i--;
    setIndex(i);
  };

  return (
    // One panel, one alignment system. Breadcrumb, identity, progress and the
    // step body all share the card's left edge, so nothing floats free.
    <div className="w-full max-w-2xl mx-auto flex flex-col justify-center min-h-[calc(100vh-14rem)]">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded border border-border glass-card overflow-hidden"
      >
        {/* header */}
        <div className="px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-center justify-between gap-4">
            <nav aria-label="Breadcrumb" className="flex items-center min-w-0">
              <button
                onClick={() => navigate(catalogPath)}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                {catalogLabel}
              </button>
              <span className="text-sm text-muted-foreground/40 mx-1.5">/</span>
              <span className="text-sm text-foreground truncate">{connectorName}</span>
            </nav>
            <span className="shrink-0 font-mono-db text-xs text-muted-foreground">
              Step {index + 1} of {steps.length}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-4">
            {!def && logo}
            {def && (
              <div
                className="w-10 h-10 rounded flex items-center justify-center bg-white shrink-0"
                style={{ color: chipSafeColor(def.brandColor), boxShadow: `0 6px 20px -8px ${def.brandColor}99` }}
              >
                {hasVendorLogo(def.id) ? (
                  <VendorLogo connectorId={def.id} size={20} />
                ) : (
                  <span className="text-xs font-bold" style={{ color: chipSafeColor(def.brandColor) }}>{def.initials}</span>
                )}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg leading-tight font-semibold text-foreground truncate">
                Connect {connectorName}
              </h1>
              {/* The step name, unless it would just repeat the title. */}
              <p className="text-sm text-muted-foreground">
                {step.label === `Connect ${connectorName}` ? "Enter credentials" : step.label}
              </p>
            </div>
          </div>

          {/* progress rail plus compact step dots, both left-aligned */}
          <div className="mt-4">
            <div className="flex items-center gap-1.5" role="list" aria-label="Onboarding steps">
              {steps.map((st, i) => (
                <span
                  key={st.id}
                  role="listitem"
                  title={st.label}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i < index ? "bg-success/60" : i === index ? "bg-primary" : "bg-muted/60"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* body: fixed silhouette, scrolls internally. h-full on the
            animated wrapper doesn't change anything for a normal, short
            step, the outer box was already a fixed 360px regardless of
            content, this just gives a step that wants to fill the whole
            height (a scrollable list with a pinned summary underneath, say)
            something concrete to size against, opt-in per step. */}
        <div className="px-6 py-5 overflow-y-auto" style={{ height: 360 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="h-full"
            >
              {step.render({ advance, back })}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* actions: pinned, so the primary never moves between steps */}
        {step.primary && (
          <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-4">
            {step.hideBack ? (
              <span />
            ) : (
              <button
                onClick={back}
                className="text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                Back
              </button>
            )}
            <div className="flex items-center gap-3">
              {step.secondary && (
                <button
                  onClick={step.secondary.onClick}
                  className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  {step.secondary.label}
                </button>
              )}
              <Button
                size="lg"
                onClick={step.primary.onClick ?? advance}
                disabled={step.primary.disabled}
                className="min-w-[150px]"
              >
                {step.primary.label}
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/**
 * Fitts's Law (principle 9b): every step's primary action renders through this
 * same footer bar, same position, same size, never relocated screen to screen.
 */
export function WizardActionBar({
  primary,
  secondary,
  onBack,
}: {
  primary?: { label: string; onClick: () => void; disabled?: boolean };
  secondary?: { label: string; onClick: () => void };
  onBack?: () => void;
}) {
  return (
    <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
      <div>
        {onBack && (
          <button
            onClick={onBack}
            className="text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            Back
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        {secondary && (
          <button
            onClick={secondary.onClick}
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {secondary.label}
          </button>
        )}
        {primary && (
          <Button size="lg" onClick={primary.onClick} disabled={primary.disabled} className="min-w-[160px]">
            {primary.label}
          </Button>
        )}
      </div>
    </div>
  );
}

export function useFieldTracker() {
  const { updateWizardField } = useSession();
  return (key: string, patch: Partial<WizardFieldState>) => updateWizardField(key, patch);
}
