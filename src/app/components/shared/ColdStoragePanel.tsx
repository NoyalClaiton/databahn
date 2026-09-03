import { useState } from "react";
import { Archive, X, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import type { ColdStorageTarget } from "@/app/lib/SessionContext";
import type { FlowNode } from "./PipelineSankey";

/**
 * Cold storage isn't a source/destination pair like Sentinel or Splunk, it's
 * the customer's own archive bucket(s) for whatever a rule already filtered
 * out, connected here rather than through the Destinations catalogue so it
 * never reads as a routing choice. A source only needs an explicit
 * assignment once a second target exists to choose between, most sources
 * never touch this section at all.
 */
export function ColdStoragePanel({
  targets,
  sources,
  assignments,
  onAdd,
  onRemove,
  onAssign,
  onClose,
}: {
  targets: ColdStorageTarget[];
  sources: FlowNode[];
  assignments: Record<string, string>;
  onAdd: (label: string, endpoint: string) => void;
  onRemove: (id: string) => void;
  onAssign: (sourceId: string, targetId: string | null) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [connecting, setConnecting] = useState(false);
  // Disconnecting a source or destination elsewhere in the app confirms
  // first and says what stops happening, removing a target is the same
  // kind of irreversible-in-session action (any source still assigned to
  // it falls back to whatever's left), it deserves the same pause.
  const [pendingRemove, setPendingRemove] = useState<ColdStorageTarget | null>(null);

  const submit = () => {
    if (!label.trim() || !endpoint.trim()) return;
    setConnecting(true);
    // Even a settings-panel action gets a visible moment of "working," not
    // an instant teleport to success, same rule as everywhere else in this
    // app that something asynchronous happens.
    setTimeout(() => {
      onAdd(label.trim(), endpoint.trim());
      setLabel("");
      setEndpoint("");
      setConnecting(false);
    }, 600);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[95] bg-background/70 backdrop-blur-sm flex justify-end"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg h-full bg-card border-l border-border overflow-y-auto"
          role="dialog"
          aria-label="Cold storage"
        >
          <div className="sticky top-0 z-10 bg-card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <p className="text-sm font-medium text-foreground">Cold storage</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono-db">{targets.length}</span> connected target{targets.length === 1 ? "" : "s"}
                </p>
              </div>
              <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="px-5 py-3 text-xs text-muted-foreground border-b border-border">
              Whatever a reduction rule filters out routes here automatically, for every source, this isn't a destination
              you route to like a SIEM. Connect your own bucket(s) below, if you have more than one, assign which source
              uses which.
            </p>
          </div>

          <div className="p-5 space-y-5">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Connected targets</p>
              {targets.length === 0 ? (
                <p className="text-sm text-muted-foreground">None connected yet, filtered events have nowhere to land.</p>
              ) : (
                <div className="space-y-2">
                  {targets.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Archive className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="text-sm text-foreground font-medium truncate">{t.label}</p>
                          <p className="text-xs text-muted-foreground truncate font-mono-db">{t.endpoint}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setPendingRemove(t)}
                        aria-label={`Disconnect ${t.label}`}
                        className="text-muted-foreground hover:text-destructive shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Connect a target</p>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. EU Archive" />
              <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="Endpoint URL, e.g. s3://acme-eu-archive" />
              <Button size="sm" className="w-full" disabled={!label.trim() || !endpoint.trim() || connecting} onClick={submit}>
                {connecting ? "Connecting…" : "Connect"}
              </Button>
            </div>

            {targets.length > 0 && sources.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Per-source assignment
                </p>
                {targets.length === 1 && (
                  <p className="text-xs text-muted-foreground mb-2">
                    Every source uses your one connected target for now, connect a second to split traffic between them.
                  </p>
                )}
                <div className="space-y-2">
                  {sources.map((s) => {
                    const current = assignments[s.id] ?? targets[0].id;
                    return (
                      <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                        <span className="text-sm text-foreground">{s.name}</span>
                        <Select value={current} onValueChange={(v) => onAssign(s.id, v)} disabled={targets.length === 1}>
                          <SelectTrigger className="w-[180px]" size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {targets.map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      {pendingRemove && (
        <div
          className="fixed inset-0 z-[105] bg-background/70 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setPendingRemove(null)}
          aria-hidden="true"
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border glass-card p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-target-title"
            aria-describedby="remove-target-desc"
            aria-hidden="false"
          >
            <p id="remove-target-title" className="text-sm font-medium text-foreground">
              Disconnect {pendingRemove.label}?
            </p>
            <p id="remove-target-desc" className="text-sm text-muted-foreground mt-2">
              Filtered events stop routing here immediately. Any source assigned to it falls back to whatever target is
              left, or has nowhere to land if none are. You can reconnect it any time.
            </p>
            <div className="flex items-center justify-end gap-3 mt-5">
              <button
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                onClick={() => setPendingRemove(null)}
                className="text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-2 py-1 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onRemove(pendingRemove.id);
                  setPendingRemove(null);
                }}
                className="text-sm rounded-full px-4 py-2 bg-destructive text-destructive-foreground hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
