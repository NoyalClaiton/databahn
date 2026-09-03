import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles, Send, ArrowRightLeft, PanelRightOpen, Check, Eye, Zap } from "lucide-react";
import { useCruz } from "@/app/lib/CruzContext";
import { useSession } from "@/app/lib/SessionContext";
import { getRecommendations, getCruzContext } from "@/app/lib/cruzRecommendations";
import { Button } from "@/app/components/ui/button";

const DEFAULT_PANEL_W = 300;
const MIN_PANEL_W = 300;
const MAX_PANEL_W = 560;
/** Past this width the panel stops shrinking the main content (the pipeline
 * chart, most visibly) and instead detaches into a floating overlay, docked
 * width frozen at the threshold so widening Cruz further never costs the
 * chart any more room. */
const OVERLAY_THRESHOLD = 420;
const PANEL_W_KEY = "databahn-cruz-width";

function loadPanelWidth(): number {
  try {
    const raw = localStorage.getItem(PANEL_W_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? Math.min(MAX_PANEL_W, Math.max(MIN_PANEL_W, n)) : DEFAULT_PANEL_W;
  } catch {
    return DEFAULT_PANEL_W;
  }
}

function WizardRecap() {
  const { wizard, connected } = useSession();
  if (!wizard) return null;
  const fieldEntries = Object.values(wizard.fields);
  const validCount = fieldEntries.filter((f) => f.status === "valid" || f.status === "filled").length;
  const reusable = connected.find((c) => c.kind === "destination");

  return (
    <div className="shrink-0 px-4 py-2.5 border-b border-border bg-background/40">
      <p className="text-xs font-mono-db text-info">
        Step {wizard.stepIndex + 1}/{wizard.totalSteps} · {wizard.stepLabel}
        {fieldEntries.length > 0 && ` · ${validCount}/${fieldEntries.length} matched`}
      </p>
      {reusable && wizard.connectorKind === "source" && (
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
          <ArrowRightLeft className="w-3 h-3" aria-hidden="true" />
          {reusable.name} already connected. I can route this there too.
        </p>
      )}
    </div>
  );
}

function CruzContextCard() {
  const { wizard, connected, coldStorageTargets } = useSession();
  const location = useLocation();
  const ctx = getCruzContext(location.pathname, wizard, connected, coldStorageTargets.length > 0);

  return (
    <div className="shrink-0 rounded border border-border bg-background/40 p-3">
      <p className="text-xs font-medium text-foreground mb-2">{ctx.heading}</p>
      <ul className="space-y-1.5">
        {ctx.handled.map((h) => (
          <li key={h} className="flex items-start gap-2 text-xs text-muted-foreground">
            <Check className="w-3 h-3 mt-0.5 shrink-0 text-success" aria-hidden="true" />
            <span>{h}</span>
          </li>
        ))}
      </ul>
      {ctx.watching && (
        <p className="text-xs text-info/90 mt-2.5 pt-2.5 border-t border-border flex items-start gap-2">
          <Eye className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{ctx.watching}</span>
        </p>
      )}
    </div>
  );
}

function CruzWelcome({ recommendations, onSend }: { recommendations: string[]; onSend: (q: string) => void }) {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex flex-col items-center text-center gap-3 pt-4 pb-2">
        <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Cruz</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-[220px]">
            I already know where you are and what you have connected. Ask me anything.
          </p>
        </div>
      </div>

      <CruzContextCard />

      {recommendations.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-medium mb-2 flex items-center gap-1.5">
            <Zap className="w-3 h-3" />
            Suggested
          </p>
          <div className="flex flex-col gap-1.5">
            {recommendations.map((r) => (
              <button
                key={r}
                onClick={() => onSend(r)}
                className="text-xs text-left text-info bg-info/8 hover:bg-info/15 border border-info/20 hover:border-info/30 rounded-lg px-3 py-2 transition-colors leading-snug"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function CruzAssistant() {
  const { isOpen, isTyping, messages, open, close, send } = useCruz();
  const { wizard } = useSession();
  const location = useLocation();
  const [draft, setDraft] = useState("");
  const recommendations = getRecommendations(location.pathname, wizard);
  const hasMessages = messages.length > 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(loadPanelWidth);
  const [isDragging, setIsDragging] = useState(false);

  // A new message or the typing indicator should always be the thing the
  // user sees next, not something they have to scroll down to find, so the
  // transcript follows the conversation instead of staying pinned at top.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isTyping]);

  // Default width covers most people; a few will want it wider for longer
  // Cruz replies or side-by-side reading, so the choice is theirs, not fixed.
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidth;
    setIsDragging(true);
    let finalWidth = startWidth;
    const onMove = (ev: PointerEvent) => {
      const delta = startX - ev.clientX;
      finalWidth = Math.min(MAX_PANEL_W, Math.max(MIN_PANEL_W, startWidth + delta));
      setPanelWidth(finalWidth);
    };
    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      try {
        localStorage.setItem(PANEL_W_KEY, String(finalWidth));
      } catch {
        /* storage may be unavailable; the width still works for this session */
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (!isOpen) {
    return (
      <motion.button
        data-tour="cruz-launcher"
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => open()}
        aria-label="Open Cruz AI assistant"
        title="Ask Cruz"
        className="cruz-breathe fixed bottom-6 right-6 z-[80] w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:bg-primary/90 transition-colors"
      >
        <Sparkles className="w-5 h-5" aria-hidden="true" />
      </motion.button>
    );
  }

  const isOverlay = panelWidth > OVERLAY_THRESHOLD;
  const dockedWidth = Math.min(panelWidth, OVERLAY_THRESHOLD);

  const resizeHandle = (
    <div
      onPointerDown={startResize}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize Cruz panel"
      className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-20 group flex justify-center"
    >
      <div className="w-px h-full bg-transparent group-hover:bg-primary/50 transition-colors" />
    </div>
  );

  const panelBody = (
      <div style={{ width: panelWidth }} className="h-full max-h-full flex flex-col overflow-hidden">
        <div
          data-tour="cruz-launcher"
          className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0"
          style={{ background: "linear-gradient(180deg, rgba(74,148,249,0.07) 0%, transparent 100%)" }}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
            <span className="text-sm font-medium">Cruz</span>
            <span className="text-[10px] font-mono-db text-muted-foreground/60 bg-muted/40 px-1.5 py-0.5 rounded">AI</span>
          </div>
          <button
            onClick={close}
            aria-label="Collapse Cruz"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded transition-colors"
          >
            <PanelRightOpen className="w-4 h-4" />
          </button>
        </div>

        <WizardRecap />

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
          {!hasMessages ? (
            <CruzWelcome recommendations={recommendations} onSend={(q) => { send(q); }} />
          ) : (
            <>
              <CruzContextCard />
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`text-sm max-w-[90%] rounded-lg px-3 py-2 leading-relaxed ${
                    m.role === "cruz"
                      ? "bg-muted/50 text-foreground"
                      : "bg-primary text-primary-foreground ml-auto"
                  }`}
                >
                  {m.text}
                </motion.div>
              ))}
              {isTyping && (
                <div className="flex items-center gap-1 bg-muted/50 rounded-lg px-3 py-2.5 w-fit">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
                      animate={{ y: [0, -3, 0] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {hasMessages && recommendations.length > 0 && (
          <div className="px-3 pt-2 pb-1 flex flex-wrap gap-1.5 border-t border-border shrink-0">
            {recommendations.map((r) => (
              <button
                key={r}
                onClick={() => send(r)}
                className="text-xs text-left text-info bg-info/8 hover:bg-info/15 rounded-full px-2.5 py-1 transition-colors"
              >
                {r}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { send(draft); setDraft(""); } }}
          className="flex items-center gap-2 p-3 border-t border-border shrink-0"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask Cruz anything…"
            className="cruz-input flex-1 bg-background/60 border border-border rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" size="icon" disabled={!draft.trim()} aria-label="Send">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
  );

  return (
    <>
      {/* Reserves layout space up to the overlay threshold, docked width
          frozen there once the user drags past it, so the chart's width
          never keeps shrinking just because Cruz keeps growing. */}
      <motion.div
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: dockedWidth, opacity: 1 }}
        exit={{ width: 0, opacity: 0 }}
        transition={isDragging ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 32 }}
        className={`relative z-[80] shrink-0 overflow-hidden ${isOverlay ? "" : "border-l border-border glass-card flex flex-col"}`}
        role={isOverlay ? undefined : "complementary"}
        aria-label={isOverlay ? undefined : "Cruz assistant"}
      >
        {!isOverlay && (
          <>
            {resizeHandle}
            {panelBody}
          </>
        )}
      </motion.div>

      {isOverlay && (
        <motion.div
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 24, opacity: 0 }}
          transition={isDragging ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 32 }}
          style={{ width: panelWidth }}
          className="absolute inset-y-0 right-0 z-[85] border-l border-border glass-card flex flex-col overflow-hidden shadow-2xl"
          role="complementary"
          aria-label="Cruz assistant"
        >
          {resizeHandle}
          {panelBody}
        </motion.div>
      )}
    </>
  );
}

export function AskCruzButton({ question }: { question: string }) {
  const { open } = useCruz();
  return (
    <button
      type="button"
      onClick={() => open(question)}
      className="text-xs text-info underline underline-offset-2 inline-flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-ring rounded transition-colors"
    >
      <Sparkles className="w-3 h-3" aria-hidden="true" />
      Ask Cruz
    </button>
  );
}
