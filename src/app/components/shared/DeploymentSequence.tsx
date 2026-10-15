import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion, type Transition } from "motion/react";
import { Check, Loader2, X, type LucideIcon } from "lucide-react";
import { LiveStatus } from "./LiveStatus";
import { Button } from "@/app/components/ui/button";

export type DeploymentStepState = "pending" | "running" | "done" | "failed";
export type DeploymentResult = "done" | "failed" | "skipped";

export interface DeploymentStep {
  id: string;
  icon: LucideIcon;
  /** Row title, phrased as the completed fact so the finished list reads as a receipt. */
  title: string;
  /** Sub-status while the step is in flight, e.g. "pushing candidate config". */
  runningLabel: string;
  /** Sub-status once the step lands, e.g. "commit 47281, 12s of policy validation". */
  doneLabel: string;
  /** Honest real-world duration of this step, in milliseconds. */
  realMs: number;
  /** Operator-facing expectation, e.g. "typically 60-180s". */
  expected: string;
  /** Steps default to succeeding; set "failed" to halt the sequence here. */
  outcome?: "done" | "failed";
  /** Sub-status when `outcome` is "failed". */
  failedLabel?: string;
}

/** "104000" reads as nothing at a glance, "1m 44s" reads as a wait you can plan around. */
function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/** Live counter is a clock, not a duration string, so it reads as time passing. */
function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function stateOf(index: number, activeIndex: number, failedIndex: number | null): DeploymentStepState {
  if (failedIndex !== null && index === failedIndex) return "failed";
  if (index < activeIndex) return "done";
  if (index === activeIndex) return "running";
  return "pending";
}

function StepRow({
  step,
  state,
  isLast,
  /** Real-world equivalent elapsed for the running step, already un-compressed. */
  elapsedRealMs,
  reduceMotion,
}: {
  step: DeploymentStep;
  state: DeploymentStepState;
  isLast: boolean;
  elapsedRealMs: number;
  reduceMotion: boolean;
}) {
  const Icon = step.icon;
  const running = state === "running";
  const done = state === "done";
  const failed = state === "failed";

  // A spring gives the checkmark the small overshoot that makes a step feel
  // *landed*; reduced-motion users get the same information without the pop.
  const checkTransition: Transition = reduceMotion
    ? { duration: 0.12 }
    : { type: "spring", stiffness: 420, damping: 18 };

  let subStatus: ReactNode = step.runningLabel;
  if (done) subStatus = step.doneLabel;
  else if (failed) subStatus = step.failedLabel ?? "This step did not complete.";
  // Pending rows already carry `expected` in the right-hand column, so the
  // sub-status stays a single word rather than repeating it.
  else if (state === "pending") subStatus = "Queued";

  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {/* Connector rail, drawn behind the chips, so the list reads as one ordered run. */}
      {!isLast && (
        <span
          aria-hidden="true"
          className={`absolute left-[15px] top-8 bottom-0 w-px ${done ? "bg-success/40" : "bg-border"}`}
        />
      )}

      <div
        className={`relative z-10 w-8 h-8 shrink-0 rounded flex items-center justify-center border transition-colors ${
          done
            ? "border-success/40 bg-success/15 text-success"
            : failed
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : running
                ? "border-info/40 bg-info/10 text-info"
                : "border-border bg-card text-muted-foreground/60"
        }`}
      >
        <AnimatePresence mode="wait" initial={false}>
          {done ? (
            <motion.span
              key="done"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={checkTransition}
              className="block"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
            </motion.span>
          ) : failed ? (
            <motion.span key="failed" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={checkTransition} className="block">
              <X className="w-4 h-4" aria-hidden="true" />
            </motion.span>
          ) : running && !reduceMotion ? (
            <motion.span key="running" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="block">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            </motion.span>
          ) : (
            <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="block">
              <Icon className="w-4 h-4" aria-hidden="true" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <p
            className={`text-sm truncate ${
              done || running || failed ? "text-foreground" : "text-muted-foreground"
            } ${running ? "font-medium" : ""}`}
          >
            {step.title}
          </p>
          <span className="font-mono-db text-xs shrink-0 tabular-nums">
            {running ? (
              <span className="text-info">{formatClock(elapsedRealMs)}</span>
            ) : done ? (
              <span className="text-muted-foreground">{formatDuration(step.realMs)}</span>
            ) : failed ? (
              <span className="text-destructive">failed</span>
            ) : (
              <span className="text-muted-foreground/50">{step.expected}</span>
            )}
          </span>
        </div>
        <p
          className={`text-xs mt-0.5 truncate ${
            failed ? "text-destructive/90" : running ? "text-muted-foreground" : "text-muted-foreground/70"
          }`}
        >
          {subStatus}
        </p>
        {running && (
          <p className="text-xs text-muted-foreground/60 mt-0.5">{step.expected}</p>
        )}
      </div>
    </li>
  );
}

/**
 * Sequential deployment checklist, modeled on the reference app's "Deploying
 * autonomous SOC" screen: one row per real operation, states advancing in order,
 * a live clock on whatever is in flight.
 *
 * The point of this component is *honesty about time*. A PAN-OS commit really
 * does take one to three minutes, and a demo that pretends otherwise teaches the
 * wrong expectation. So the step durations here are the real ones, `demoSpeed`
 * only divides wall-clock time, the on-row clock keeps counting in real-world
 * seconds, and a persistent label plus a Skip ahead control make the compression
 * explicit rather than hidden.
 */
export function DeploymentSequence({
  steps,
  demoSpeed = 1,
  headerLabel = "deployment in progress",
  onComplete,
}: {
  steps: DeploymentStep[];
  /** Wall-clock divisor. 1 runs the genuine durations, 30 compresses 90s into 3s. */
  demoSpeed?: number;
  headerLabel?: string;
  onComplete?: (result: DeploymentResult) => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedIndex, setFailedIndex] = useState<number | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Both refs exist so callers can pass inline arrays and arrow callbacks without
  // a fresh object identity restarting the run on every parent render.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const speed = demoSpeed > 0 ? demoSpeed : 1;
  const compressed = speed !== 1;
  const totalRealMs = steps.reduce((sum, s) => sum + s.realMs, 0);
  const finished = failedIndex === null && activeIndex >= steps.length;
  const activeStep = finished || failedIndex !== null ? null : steps[activeIndex];
  const running = failedIndex === null && activeIndex < steps.length;

  // Advance one step at a time. Each step owns its own timeout so a long step
  // (the commit) can't be short-changed by drift in the ones before it.
  useEffect(() => {
    if (!running) return;
    const step = stepsRef.current[activeIndex];
    const timer = setTimeout(() => {
      if (step.outcome === "failed") setFailedIndex(activeIndex);
      else setActiveIndex((i) => i + 1);
    }, step.realMs / speed);
    return () => clearTimeout(timer);
  }, [activeIndex, running, speed]);

  // Clock for the in-flight step, restarted whenever the active step changes.
  useEffect(() => {
    if (!running) return;
    setElapsedMs(0);
    const start = Date.now();
    const id = setInterval(() => setElapsedMs(Date.now() - start), 100);
    return () => clearInterval(id);
  }, [activeIndex, running]);

  useEffect(() => {
    if (finished) onCompleteRef.current?.(skipped ? "skipped" : "done");
    else if (failedIndex !== null) onCompleteRef.current?.("failed");
  }, [finished, failedIndex, skipped]);

  const skipAhead = () => {
    setSkipped(true);
    setActiveIndex(steps.length);
  };

  // Clock counts in real-world seconds even when wall-clock time is compressed,
  // so the readout stays consistent with the "typically 60-180s" expectation.
  const elapsedRealMs = activeStep ? Math.min(elapsedMs * speed, activeStep.realMs) : 0;

  const headerTone = failedIndex !== null ? "error" : finished ? "done" : "active";
  const headerText =
    failedIndex !== null
      ? "deployment halted"
      : finished
        ? skipped
          ? "deployment complete, remaining steps skipped for the demo"
          : "deployment complete"
        : headerLabel;

  return (
    <div className="rounded border border-border glass-card p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <LiveStatus label={headerText} tone={headerTone} />
        <span className="font-mono-db text-xs text-muted-foreground/70 tabular-nums">
          {Math.min(activeIndex, steps.length)}/{steps.length}
        </span>
      </div>

      <ol className="list-none" aria-label="Deployment steps">
        {steps.map((step, i) => (
          <StepRow
            key={step.id}
            step={step}
            state={stateOf(i, activeIndex, failedIndex)}
            isLast={i === steps.length - 1}
            elapsedRealMs={i === activeIndex ? elapsedRealMs : 0}
            reduceMotion={reduceMotion}
          />
        ))}
      </ol>

      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-3">
        {/* Persistent, not a one-off toast: the compression claim has to stay
            visible for as long as the compressed timings are on screen. */}
        <p className="text-xs text-muted-foreground/70 leading-snug">
          {compressed ? (
            <>
              Demo speed <span className="font-mono-db text-muted-foreground">{speed}x</span>. In production this
              sequence takes about <span className="font-mono-db text-muted-foreground">{formatDuration(totalRealMs)}</span>,
              nearly all of it the PAN-OS commit.
            </>
          ) : (
            <>
              Running at real PAN-OS durations, about{" "}
              <span className="font-mono-db text-muted-foreground">{formatDuration(totalRealMs)}</span> end to end.
            </>
          )}
        </p>
        {running && (
          <Button variant="link" size="sm" onClick={skipAhead} className="shrink-0 px-0 text-muted-foreground">
            Skip ahead
          </Button>
        )}
      </div>
    </div>
  );
}
