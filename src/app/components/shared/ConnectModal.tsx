import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, ShieldCheck, ExternalLink } from "lucide-react";
import type { ConnectorDef } from "@/app/data/connectors";
import { VendorLogo, hasVendorLogo, chipSafeColor } from "./VendorLogo";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { AskCruzButton } from "./CruzAssistant";

/** First field each connector needs, so the modal collects something real
 * rather than being a splash screen with a button. */
const FIRST_FIELD: Record<string, { label: string; placeholder: string; secret?: boolean }> = {
  paloalto: { label: "Firewall hostname or serial", placeholder: "fw-edge-01" },
  entraid: { label: "Tenant domain", placeholder: "acme.onmicrosoft.com" },
  sentinel: { label: "Workspace name", placeholder: "prod-secops" },
  splunk: { label: "HEC URL", placeholder: "https://splunk.acme.com:8088" },
};

/**
 * Hybrid connect flow, step one. The modal handles identification and consent
 * over the still-visible catalogue (matching the reference's auth modal), then
 * hands off to the full-page wizard for the genuinely multi-step work: log type
 * selection, the PAN-OS commit, live testing and field mapping. Those do not
 * belong in a small dialog.
 */
export function ConnectModal({
  connector,
  isConnected,
  onClose,
  onContinue,
  onDisconnect,
}: {
  connector: ConnectorDef | null;
  /** Already connected, so this becomes a manage dialog rather than a setup one. */
  isConnected?: boolean;
  onClose: () => void;
  onContinue: (id: string) => void;
  onDisconnect?: (id: string) => void;
}) {
  const [value, setValue] = useState("");
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const field = connector ? FIRST_FIELD[connector.id] : undefined;

  // The modal instance is reused across connectors (only its `connector` prop
  // changes), so a confirm step left open from a previous one would silently
  // carry over onto the next connector without this.
  useEffect(() => {
    setConfirmingDisconnect(false);
  }, [connector?.id]);

  return (
    <AnimatePresence>
      {connector && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center px-4"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-background/75 backdrop-blur-md" />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Connect ${connector.name}`}
            className="relative w-full max-w-md rounded-lg border border-border glass-card overflow-hidden"
          >
            <div className="flex items-start justify-between px-6 pt-6 pb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-lg flex items-center justify-center bg-white shrink-0"
                  style={{ color: chipSafeColor(connector.brandColor), boxShadow: `0 6px 20px -6px ${connector.brandColor}99` }}
                >
                  {hasVendorLogo(connector.id) ? (
                    <VendorLogo connectorId={connector.id} size={22} />
                  ) : (
                    <span className="text-xs font-bold" style={{ color: chipSafeColor(connector.brandColor) }}>
                      {connector.initials}
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">
                    {isConnected ? connector.name : `Connect ${connector.name}`}
                  </p>
                  <p className="text-[13px] text-muted-foreground">{connector.tagline}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground p-1 rounded focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6">
              {confirmingDisconnect ? (
                <div className="rounded border border-destructive/30 bg-destructive/5 p-4">
                  <p className="text-sm font-medium text-foreground">Disconnect {connector.name}?</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {connector.kind === "source"
                      ? "Databahn stops collecting from this source immediately. Data already delivered to your destinations is unaffected. You can reconnect it any time."
                      : "Databahn stops routing data here immediately. Sources that only routed to this destination will show as not yet routed. You can reconnect it any time."}
                  </p>
                </div>
              ) : isConnected ? (
                <div className="rounded border border-border bg-background/40 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] text-foreground">Current configuration</span>
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-success">
                      <span className="w-1.5 h-1.5 rounded-full bg-success live-pulse-dot" />
                      Healthy
                    </span>
                  </div>
                  <dl className="space-y-1.5 text-[12px]">
                    {[
                      ["Collecting", `${connector.dataTypes.length} log types`],
                      ["Ingest", "ingest-usw2.databahn.ai:514 UDP"],
                      ["Last event", "3 seconds ago"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-3">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="font-mono-db text-foreground text-right truncate">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : (
              <div className="rounded border border-border bg-background/40 p-4">
                <p className="text-[13px] text-foreground mb-2.5 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-success" aria-hidden="true" />
                  Databahn will request read-only access to:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {connector.dataTypes.map((t) => (
                    <span
                      key={t}
                      className="font-mono-db text-[10px] text-info border border-info/30 bg-info/10 rounded px-2 py-1"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2.5">
                  You pick exactly which of these to collect on the next screen.
                </p>
              </div>
              )}

              {field && !isConnected && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="connect-first-field" className="text-sm font-medium text-foreground">
                      {field.label}
                    </label>
                    <AskCruzButton question={`Where do I find my ${connector.name} ${field.label.toLowerCase()}?`} />
                  </div>
                  <Input
                    id="connect-first-field"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={field.placeholder}
                    type={field.secret ? "password" : "text"}
                  />
                </div>
              )}
            </div>

            {confirmingDisconnect ? (
              <div className="px-6 py-5 flex items-center justify-end gap-3">
                <button
                  onClick={() => setConfirmingDisconnect(false)}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <Button size="lg" variant="destructive" className="shrink-0" onClick={() => onDisconnect?.(connector.id)}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <div className="px-6 py-5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  {isConnected && onDisconnect ? (
                    <button
                      onClick={() => setConfirmingDisconnect(true)}
                      className="text-[12px] text-destructive underline underline-offset-2"
                    >
                      Disconnect this {connector.kind}
                    </button>
                  ) : (
                    <a
                      href="#"
                      onClick={(e) => e.preventDefault()}
                      className="text-[12px] text-muted-foreground hover:text-foreground underline underline-offset-2 inline-flex items-center gap-1"
                    >
                      Integration guide <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <Button
                  size="lg"
                  className="shrink-0"
                  onClick={() => onContinue(connector.id)}
                  disabled={Boolean(field) && !isConnected && value.trim() === ""}
                >
                  {isConnected ? "Edit configuration" : "Continue to setup"}
                </Button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
