import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowRight } from "lucide-react";
import { CONNECTORS } from "@/app/data/connectors";
import { VendorLogo, hasVendorLogo, chipSafeColor } from "./VendorLogo";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Button } from "@/app/components/ui/button";
import { useSession } from "@/app/lib/SessionContext";

/**
 * The reverse of the Destinations catalog's quick-route bar: a destination
 * connected standalone (from Pipeline's "+ Add destination", not from a
 * source's success screen) has nothing routed to it yet. Without this it
 * silently joins the pipeline as dead weight, the same "No source routed
 * here yet" state Pipeline overview already flags, just discovered later
 * and requiring a trip to the routing panel instead of being solved here.
 */
export function RouteExistingSources({ destId, destName }: { destId: string; destName: string }) {
  const navigate = useNavigate();
  const { connected, routes, addRoute } = useSession();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const candidateSources = connected
    .filter((c) => c.kind === "source")
    .filter((s) => !routes.some((r) => r.sourceId === s.id && r.destId === destId));

  if (candidateSources.length === 0) return null;

  const toggle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const confirm = () => {
    selectedIds.forEach((sourceId) => addRoute(sourceId, destId));
    navigate("/pipeline");
  };

  return (
    <div className="w-full max-w-md mx-auto mt-6 rounded-lg border border-border glass-card p-4 text-left">
      <p className="text-sm font-medium text-foreground">Route an existing source to {destName}?</p>
      <p className="text-xs text-muted-foreground mt-0.5 mb-3">Already connected this session, no re-authentication needed.</p>
      <div className="space-y-2">
        {candidateSources.map((s) => {
          const def = CONNECTORS.find((c) => c.name === s.name);
          const selected = selectedIds.includes(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className={`w-full flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selected ? "border-primary bg-primary/10" : "border-border bg-card/60 hover:border-primary/40"
              }`}
            >
              <Checkbox checked={selected} className="pointer-events-none" />
              <span
                className="w-7 h-7 rounded flex items-center justify-center shrink-0 bg-white"
                style={{ color: def ? chipSafeColor(def.brandColor) : undefined }}
              >
                {def && hasVendorLogo(def.id) ? (
                  <VendorLogo connectorId={def.id} size={14} />
                ) : (
                  <span className="text-[8px] font-bold">{def?.initials}</span>
                )}
              </span>
              <span className="text-sm text-foreground font-medium">{s.name}</span>
            </button>
          );
        })}
      </div>
      {selectedIds.length > 0 && (
        <Button size="sm" className="w-full mt-3 gap-1.5" onClick={confirm}>
          Route {selectedIds.length} source{selectedIds.length === 1 ? "" : "s"} here
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}
