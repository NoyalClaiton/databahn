import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import type { ConnectorDef, ConnectorKind } from "@/app/data/connectors";
import { useSession } from "@/app/lib/SessionContext";
import { buildConnectorLiveState, type ConnectorLiveState } from "@/app/lib/pipelineData";
import { VendorLogo, hasVendorLogo, chipSafeColor } from "./VendorLogo";
import { StaggerItem } from "./PageLayout";
import { ContextualHelpTip } from "./ContextualHelpTip";
import { SearchInput } from "./SearchInput";

/**
 * Card anatomy follows the reference: a horizontal header (brand chip, name,
 * three-word tagline, explicit Connect affordance) over a row of data-type
 * pills. The pills matter most, they tell the user what data they actually
 * get, which a prose sentence never did.
 */
export function ConnectorCatalogCard({
  connector,
  onSelect,
  live,
}: {
  connector: ConnectorDef;
  onSelect: () => void;
  /** Present only once this connector is connected. Computed once by the
   * catalog rather than per card, so 28 cards don't each re-scan 940 rules. */
  live?: ConnectorLiveState;
}) {
  const { isConnected } = useSession();
  const connected = isConnected(connector.name);
  const isSource = connector.kind === "source";

  return (
    <motion.button
      onClick={onSelect}
      aria-label={`${connector.name}, ${connected ? "connected, manage" : "connect"}`}
      whileHover={{ y: -3, boxShadow: connected ? `0 10px 40px -12px rgba(41,204,150,0.35)` : `0 10px 40px -12px ${connector.brandColor}40` }}
      whileTap={{ scale: 0.99 }}
      className={`group relative h-full w-full flex flex-col text-left rounded-lg border p-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        connected
          ? "border-success/40 bg-success/[0.04] hover:border-success/60 hover:shadow-[0_10px_40px_-12px_rgba(41,204,150,0.35)]"
          : "border-border glass-card hover:border-primary/40"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className="relative w-11 h-11 rounded-lg flex items-center justify-center shrink-0 bg-white"
          style={{ color: chipSafeColor(connector.brandColor), boxShadow: `0 6px 20px -6px ${connector.brandColor}99` }}
        >
          {hasVendorLogo(connector.id) ? (
            <VendorLogo connectorId={connector.id} size={22} />
          ) : (
            <span className="text-xs font-bold" style={{ color: chipSafeColor(connector.brandColor) }}>
              {connector.initials}
            </span>
          )}
          {/* Same connected-indicator dot the Pipeline view uses on a source's
              logo chip, so "this is live" reads identically everywhere. */}
          {connected && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card bg-success" />}
        </div>

        {/* No "Connected" chip beside the name: in a three-up grid the card is
            ~250px, and a shrink-0 chip next to a truncating name crushed
            "Palo Alto" down to "P". Connected state is already carried by the
            green treatment, the logo dot, the Manage verb, and the live line
            below, so the chip was the fifth encoding of one fact. */}
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-foreground leading-tight">{connector.name}</p>
          <p className="text-[13px] text-muted-foreground mt-0.5">{connector.tagline}</p>
        </div>

        <span className="inline-flex items-center gap-1 text-xs text-primary shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
          {connected ? "Manage" : "Connect"}
          <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </div>

      {/* Before connecting, the pills answer "what could I get from this?".
          After connecting that question is settled and the live answer is what
          it's actually moving, so the card swaps capability for state rather
          than keeping stale advertising for data types the wizard may not even
          have switched on. */}
      {connected && live ? (
        // Two explicit rows rather than one wrapping row: throughput and
        // routing are separate facts, and letting them share a wrapping line
        // left a dangling "·" at the break.
        <div className="mt-4 pt-3 border-t border-success/15 space-y-1 text-[11px]">
          <p className="text-foreground">
            {isSource ? (
              <>
                <span className="font-mono-db">{live.gbPerDay}</span> GB/day in
                <span className="text-muted-foreground/40 mx-1.5">·</span>
                <span className="text-muted-foreground">
                  <span className="font-mono-db">{live.reductionPct}%</span> reduced
                </span>
              </>
            ) : (
              <>
                <span className="font-mono-db">${live.rate?.toFixed(2)}</span>/GB ingested
              </>
            )}
          </p>
          {/* A count, not a list of names. Naming each destination read fine
              with two and turned into a crowded run-on at four, on a card with
              ~250px to work with. The names belong on Pipeline, where routing
              is the actual subject. */}
          {live.linked.length > 0 ? (
            <p className="text-muted-foreground">
              {isSource ? "→" : "←"} <span className="font-mono-db">{live.linked.length}</span>{" "}
              {isSource
                ? `destination${live.linked.length === 1 ? "" : "s"}`
                : `source${live.linked.length === 1 ? "" : "s"}`}
            </p>
          ) : (
            <p className="text-amber-400">
              {isSource ? "not routed anywhere" : "no sources routed here"}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5 mt-4">
          {connector.dataTypes.slice(0, 4).map((t) => (
            <span
              key={t}
              className="font-mono-db text-[10px] text-muted-foreground/90 border border-border rounded px-2 py-1 bg-background/40"
            >
              {t}
            </span>
          ))}
          {connector.dataTypes.length > 4 && (
            <ContextualHelpTip content={connector.dataTypes.slice(4).join(", ")}>
              <span className="font-mono-db text-[10px] text-info border border-info/30 rounded px-2 py-1 bg-info/10 cursor-pointer">
                +{connector.dataTypes.length - 4} more
              </span>
            </ContextualHelpTip>
          )}
        </div>
      )}
    </motion.button>
  );
}

export function ConnectorCatalog({
  connectors,
  kind,
  onSelect,
}: {
  connectors: ConnectorDef[];
  kind: ConnectorKind;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const { connected: connectedEntities, routes, rules } = useSession();
  // Once per grid, not once per card.
  const liveByConnector = buildConnectorLiveState(connectedEntities, routes, rules);

  const inKind = connectors.filter((c) => c.kind === kind);
  /** Broad family (the part before the comma), which is how people actually
   * narrow a large catalogue: "show me the identity ones". */
  const families = Array.from(new Set(inKind.map((c) => c.category.split(",")[0].trim()))).sort();

  const q = query.trim().toLowerCase();
  const matches = inKind.filter((c) => {
    const haystack = `${c.name} ${c.tagline} ${c.category} ${c.dataTypes.join(" ")}`.toLowerCase();
    const matchesQuery = q === "" || haystack.includes(q);
    const matchesCategory = !category || c.category.split(",")[0].trim() === category;
    return matchesQuery && matchesCategory;
  });

  const filtered = matches;

  return (
    <div>
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={`Search ${inKind.length} ${kind === "source" ? "sources" : "destinations"}...`}
        className="mb-4 max-w-md mx-auto"
      />

      <div className="flex flex-wrap items-center justify-center gap-1.5 mb-4">
        <button
          onClick={() => setCategory(null)}
          className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
            !category
              ? "border-primary/60 bg-primary/15 text-foreground"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          All ({inKind.length})
        </button>
        {families.map((f) => {
          const count = inKind.filter((c) => c.category.split(",")[0].trim() === f).length;
          return (
            <button
              key={f}
              onClick={() => setCategory(category === f ? null : f)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                category === f
                  ? "border-primary/60 bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f} ({count})
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-tour="connector-grid">
        {filtered.map((c, i) => (
          <StaggerItem key={c.id} index={i}>
            <ConnectorCatalogCard connector={c} onSelect={() => onSelect(c.id)} live={liveByConnector[c.id]} />
          </StaggerItem>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-10">
          <p className="text-sm text-muted-foreground">No match for "{query}".</p>
          <p className="text-sm text-muted-foreground mt-1">
            Databahn ships 500+ integrations and builds new ones on request.
          </p>
          <button className="text-sm text-info underline underline-offset-2 mt-3">
            Request this integration
          </button>
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-center text-[11px] text-muted-foreground/60 mt-6">
          Not seeing yours? Databahn ships 500+ integrations.{" "}
          <button className="text-info underline underline-offset-2">Request an integration</button>
        </p>
      )}
    </div>
  );
}
