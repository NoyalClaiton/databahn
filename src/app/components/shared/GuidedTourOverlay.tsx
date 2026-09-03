import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";

const STORAGE_KEY = "databahn-tour-seen";
const CALLOUT_W = 300;
const CALLOUT_H_ESTIMATE = 180;
const VIEWPORT_PAD = 12;

interface TourStep {
  selector: string;
  route?: string;
  title: string;
  body: string;
  placement: "top" | "bottom" | "left" | "right";
  /** Nudges the callout after the normal placement math, for the rare step
   * whose target sits right where the page's own content starts. Without
   * this, "right" placement puts the callout at the target's own top edge,
   * which is calm empty space on most pages but lands directly on top of
   * Pipeline's stage tiles, covering the exact diagram the step is about. */
  calloutOffset?: { top?: number; left?: number };
}

/**
 * Pendo/Appcues-style product tour: a spotlight cut into a dimmed overlay
 * around the real UI element, with an anchored callout explaining the
 * *benefit* rather than labelling the control. Walks real screens, skippable
 * at every step, and replayable from the header.
 *
 * Two failure modes previously made this render nothing at all, both fixed:
 *  1. Framer Motion owns `transform` on an animated element, so a manual
 *     `transform: translateX(...)` in `style` was silently dropped and the
 *     callout landed off-screen. Positions are now computed in pixels.
 *  2. The component early-returned when the measured rect was null, so any
 *     measurement hiccup produced total silence. It now always renders the
 *     callout (centered as a fallback) and only the spotlight depends on a
 *     successful measurement.
 */
const STEPS: TourStep[] = [
  {
    selector: '[data-tour="nav-sources"]',
    route: "/sources",
    title: "Start here",
    body: "Connect a data source. You don't need to already know Databahn, since Cruz fills in the technical details as you go. Minutes, not a training session.",
    placement: "right",
  },
  {
    // The whole grid used to be the target, which lit up nearly the entire
    // page, a spotlight that big doesn't point at anything. One card makes
    // the same claim ("every connector looks like this") concrete instead
    // of abstract, and its rect is small enough that the callout below it
    // lands well clear of the sticky connection-count bar at the bottom.
    selector: '[data-tour="connector-grid"] > div:first-child',
    route: "/sources",
    title: "Pick what you're connecting",
    body: "Every connector runs the same guided steps, on purpose. Once you've done one, the next feels familiar and goes faster.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="cruz-launcher"]',
    title: "Cruz travels with you",
    body: "Cruz already knows which step you're on and what you've filled in, so you never re-explain context. Often it just does the step for you.",
    placement: "left",
  },
  {
    selector: '[data-tour="nav-pipeline"]',
    route: "/pipeline",
    title: "See it actually working",
    body: "Watch your data flow through here, including exactly what's being filtered and why. Nothing about your pipeline is a black box.",
    placement: "right",
    // Unshifted, this callout's top edge lands exactly on Pipeline's stage
    // tiles and its compliance-guardrail line, the precise numbers "exactly
    // what's being filtered and why" is telling the user to look at. Pushed
    // down, it clears both and sits beside the source/destination cards
    // instead.
    calloutOffset: { top: 140 },
  },
  {
    selector: '[data-tour="nav-search"]',
    route: "/search",
    title: "Search everything at once",
    body: "Ask one question across every connected source, including data that never reached your SIEM, without leaving Databahn.",
    placement: "right",
  },
];

/** Measures the target, retrying across frames, and tracks scroll/resize.
 * Returns null only while genuinely unresolved; callers must tolerate that. */
function useTargetRect(selector: string | null, deps: unknown[]) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    setRect(null);
    let attempts = 0;
    const measure = () => {
      const el = document.querySelector(selector);
      if (el) {
        setRect(el.getBoundingClientRect());
      } else if (attempts++ < 120) {
        // element may not be mounted yet (route transition in flight)
        rafRef.current = requestAnimationFrame(measure);
      }
    };
    measure();
    const track = () => {
      const el = document.querySelector(selector);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", track);
    window.addEventListener("scroll", track, true);
    return () => {
      window.removeEventListener("resize", track);
      window.removeEventListener("scroll", track, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, ...deps]);

  return rect;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

export function GuidedTourOverlay({
  readyToStart,
  restartSignal = 0,
}: {
  readyToStart: boolean;
  /** Incremented by "Replay tour" so guidance stays reachable, never one-shot. */
  restartSignal?: number;
}) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  // First-run auto start, once the intro has finished.
  useEffect(() => {
    if (readyToStart && !localStorage.getItem(STORAGE_KEY)) setActive(true);
  }, [readyToStart]);

  // Manual replay always wins, regardless of storage or intro state.
  useEffect(() => {
    if (restartSignal > 0) {
      setStepIndex(0);
      setActive(true);
    }
  }, [restartSignal]);

  const step = active ? STEPS[stepIndex] : null;

  useEffect(() => {
    if (step?.route && location.pathname !== step.route) navigate(step.route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, active]);

  const rect = useTargetRect(step?.selector ?? null, [stepIndex, location.pathname]);

  // Both ending the tour and skipping it early should land on the dashboard,
  // never wherever the last demonstrated step happened to leave the route.
  // The dashboard's empty state is what tells the user what to do next, so
  // stranding them mid-tour on Sources or Pipeline defeats that.
  const end = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setActive(false);
    navigate("/");
  };

  if (!active || !step) return null;

  const PAD = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Anchored beside the target when measured; centered fallback otherwise, so
  // the tour is always visible even if a target can't be resolved.
  let top: number;
  let left: number;
  if (rect) {
    const gap = 16;
    top = rect.top;
    left = rect.right + gap;
    if (step.placement === "left") left = rect.left - gap - CALLOUT_W;
    else if (step.placement === "top") {
      left = rect.left;
      top = rect.top - gap - CALLOUT_H_ESTIMATE;
    } else if (step.placement === "bottom") {
      left = rect.left;
      top = rect.bottom + gap;
    }
    if (step.calloutOffset) {
      top += step.calloutOffset.top ?? 0;
      left += step.calloutOffset.left ?? 0;
    }
    left = clamp(left, VIEWPORT_PAD, vw - CALLOUT_W - VIEWPORT_PAD);
    top = clamp(top, VIEWPORT_PAD, vh - CALLOUT_H_ESTIMATE - VIEWPORT_PAD);
  } else {
    left = (vw - CALLOUT_W) / 2;
    top = vh / 2 - CALLOUT_H_ESTIMATE / 2;
  }

  return (
    <div className="fixed inset-0 z-[80] pointer-events-none">
      {/* Dim + spotlight cutout. Falls back to a plain dim if unmeasured. */}
      {rect ? (
        <motion.div
          key={step.selector}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute rounded pointer-events-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(2, 5, 10, 0.62)",
            border: "2px solid var(--db-cyan-light)",
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: "rgba(2, 5, 10, 0.62)" }} />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={stepIndex}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="absolute rounded border border-border glass-card p-4 pointer-events-auto shadow-2xl"
          style={{ top, left, width: CALLOUT_W }}
          role="dialog"
          aria-label="Product tour"
        >
          <p className="text-xs font-mono-db text-info mb-1">
            {stepIndex + 1} of {STEPS.length}
          </p>
          <h3 className="text-sm font-medium text-foreground mb-1.5">{step.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
          <div className="flex items-center justify-between mt-4">
            <button onClick={() => end()} className="text-xs text-muted-foreground hover:text-foreground">
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <button
                  onClick={() => setStepIndex((i) => i - 1)}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
                >
                  Back
                </button>
              )}
              <button
                onClick={() => (stepIndex < STEPS.length - 1 ? setStepIndex((i) => i + 1) : end())}
                className="text-xs bg-primary text-primary-foreground rounded px-3 py-1.5 font-medium hover:bg-primary/90"
              >
                {stepIndex < STEPS.length - 1 ? "Next" : "Done"}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
