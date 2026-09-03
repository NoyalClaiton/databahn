import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useSession } from "@/app/lib/SessionContext";
import { CONNECTORS, type ConnectorKind } from "@/app/data/connectors";
import { VendorLogo, hasVendorLogo, chipSafeColor } from "./VendorLogo";
import { Button } from "@/app/components/ui/button";

/**
 * Floating progress dock, adapted from the reference app's connected-sources
 * tray: springs up once anything is connected, shows real avatars, live count,
 * and the forward action. Gives the screen a persistent sense of momentum
 * instead of a static strip at the top.
 */
export function ConnectedDock({
  kind,
  onContinue,
  continueLabel,
}: {
  kind: ConnectorKind;
  onContinue: () => void;
  continueLabel: string;
}) {
  const { connected } = useSession();
  const items = connected.filter((c) => c.kind === kind);
  const total = CONNECTORS.filter((c) => c.kind === kind).length;

  return (
    <AnimatePresence>
      {items.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-5 px-5 py-3 rounded glass-card border border-primary/25"
          style={{ boxShadow: "0 12px 48px rgba(0,0,0,0.5), 0 0 24px rgba(74,148,249,0.10)" }}
        >
          <div className="flex items-center gap-1.5">
            {items.map((c, i) => {
              const def = CONNECTORS.find((d) => d.name === c.name);
              return (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.06, type: "spring", stiffness: 400, damping: 20 }}
                  title={c.name}
                  className="w-9 h-9 rounded flex items-center justify-center bg-white shrink-0"
                  style={{ color: def ? chipSafeColor(def.brandColor) : undefined }}
                >
                  {def && hasVendorLogo(def.id) ? (
                    <VendorLogo connectorId={def.id} size={18} />
                  ) : (
                    <span className="text-[10px] font-semibold">{def?.initials}</span>
                  )}
                </motion.div>
              );
            })}
          </div>

          <div className="min-w-[120px]">
            <p className="text-sm text-foreground font-medium leading-none">
              <span className="font-mono-db">{items.length}</span>
              <span className="text-muted-foreground font-mono-db"> / {total}</span> connected
            </p>
            <div className="h-1 rounded-full bg-muted/50 mt-2 overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(items.length / total) * 100}%` }}
                transition={{ type: "spring", stiffness: 200, damping: 30 }}
              />
            </div>
          </div>

          <Button size="sm" onClick={onContinue} className="gap-1.5">
            {continueLabel}
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
