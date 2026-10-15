import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Switch } from "@/app/components/ui/switch";
import { VendorLogo, hasVendorLogo, chipSafeColor } from "./VendorLogo";
import { DRAWER_WIDTH } from "./PageLayout";
import type { FlowNode, FlowEdge } from "./PipelineSankey";

/**
 * Explicit source-to-destination mapping, not just an emergent side effect of
 * whichever wizard the user happened to land on next. A source can route to
 * more than one destination and a destination can receive from more than one
 * source, this is the one place that many-to-many relationship is visible
 * and editable as a matrix, rather than inferred from navigation history.
 */
export function RoutingPanel({
  sources,
  destinations,
  edges,
  onToggle,
  onClose,
  focusSourceId,
  focusDestId,
}: {
  sources: FlowNode[];
  destinations: FlowNode[];
  edges: FlowEdge[];
  onToggle: (sourceId: string, destId: string, routed: boolean) => void;
  onClose: () => void;
  /** Opened from a specific row's "not routed" menu action rather than the
   * general "Manage routing" button, so that row should be the thing the
   * user's eye lands on, not just one card in an undifferentiated stack. */
  focusSourceId?: string;
  focusDestId?: string;
}) {
  const isRouted = (sourceId: string, destId: string) => edges.some((e) => e.sourceId === sourceId && e.destId === destId);
  const focusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusSourceId) focusRef.current?.scrollIntoView({ block: "center" });
  }, [focusSourceId]);

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
          aria-label="Source to destination routing"
        >
          <div className="sticky top-0 z-10 bg-card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <p className="text-sm font-medium text-foreground">Routing</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono-db">{edges.length}</span> active route{edges.length === 1 ? "" : "s"} across{" "}
                  <span className="font-mono-db">{sources.length}</span> source{sources.length === 1 ? "" : "s"} and{" "}
                  <span className="font-mono-db">{destinations.length}</span> destination{destinations.length === 1 ? "" : "s"}
                </p>
              </div>
              <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="px-5 py-3 text-xs text-muted-foreground border-b border-border">
              Each source can route to more than one destination. Turn a pair on or off to change where its events go.
            </p>
          </div>

          <div className="p-5 space-y-5">
            {sources.map((s) => {
              const isFocusedSource = s.id === focusSourceId;
              return (
                <div
                  key={s.id}
                  ref={isFocusedSource ? focusRef : undefined}
                  className={`rounded-lg border p-3 transition-colors ${
                    isFocusedSource ? "border-primary/60 ring-1 ring-primary/30 bg-primary/[0.03]" : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    <div
                      className="w-7 h-7 rounded flex items-center justify-center shrink-0 bg-white"
                      style={{ color: chipSafeColor(s.color), boxShadow: `0 4px 14px -4px ${s.color}80` }}
                    >
                      {hasVendorLogo(s.id) ? (
                        <VendorLogo connectorId={s.id} size={14} />
                      ) : (
                        <span className="text-[9px] font-bold">{s.name.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground">{s.name}</p>
                  </div>
                  <div className="space-y-2">
                    {destinations.map((d) => {
                      const routed = isRouted(s.id, d.id);
                      const isFocusedDest = d.id === focusDestId;
                      return (
                        <div
                          key={d.id}
                          className={`flex items-center justify-between py-1.5 pl-2 pr-1.5 rounded ${
                            isFocusedDest ? "bg-primary/10 ring-1 ring-primary/25" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-5 h-5 rounded flex items-center justify-center shrink-0 bg-white"
                              style={{ color: chipSafeColor(d.color) }}
                            >
                              {hasVendorLogo(d.id) ? (
                                <VendorLogo connectorId={d.id} size={11} />
                              ) : (
                                <span className="text-[8px] font-bold">{d.name.slice(0, 2).toUpperCase()}</span>
                              )}
                            </div>
                            <span className={`text-sm ${routed ? "text-foreground" : "text-muted-foreground"}`}>{d.name}</span>
                          </div>
                          <Switch
                            checked={routed}
                            onCheckedChange={(checked) => onToggle(s.id, d.id, checked)}
                            aria-label={`Route ${s.name} to ${d.name}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
