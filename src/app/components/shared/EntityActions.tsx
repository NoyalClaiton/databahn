import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import {
  PauseCircle, PlayCircle, UserCheck, Stethoscope, Route, ListFilter, Pencil, Unplug, CheckCircle2, AlertTriangle, XCircle, Loader2,
  MoreHorizontal, ChevronDown,
} from "lucide-react";
import { useSession } from "@/app/lib/SessionContext";
import { useEnvironment, type SourceView, type DestinationView } from "@/app/lib/environment";
import { ME, PEOPLE, initials } from "@/app/lib/people";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuLabel,
} from "@/app/components/ui/dropdown-menu";
import { PauseDialog } from "./PauseDialog";
import { HealthDot } from "./HealthBadge";
import { useEscape } from "@/app/lib/useEscape";

export type ActionTarget = { kind: "source"; s: SourceView } | { kind: "destination"; d: DestinationView };

const keyOf = (t: ActionTarget) => (t.kind === "source" ? t.s.id : `dest:${t.d.id}`);
const nameOf = (t: ActionTarget) => (t.kind === "source" ? t.s.name : t.d.name);
const stateOf = (t: ActionTarget) => (t.kind === "source" ? t.s.state : t.d.state);
const isProblem = (t: ActionTarget) => stateOf(t) === "stopped" || stateOf(t) === "degraded";

const SOURCE_WIZARD: Record<string, string> = { paloalto: "/sources/paloalto", entraid: "/sources/entraid" };
const DEST_WIZARD: Record<string, string> = { sentinel: "/destinations/sentinel", splunk: "/destinations/splunk" };

/** "Palo Alto · DC East", or "5 sources" / "2 destinations" / "7 items". */
function describe(ts: ActionTarget[]) {
  if (ts.length === 1) return nameOf(ts[0]);
  const kinds = new Set(ts.map((t) => t.kind));
  const noun = kinds.size > 1 ? "items" : ts[0].kind === "source" ? "sources" : "destinations";
  return `${ts.length} ${noun}`;
}

/* ------------------------------------------------------------------ */
/* Dialogs                                                              */
/* ------------------------------------------------------------------ */

function Frame({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer: ReactNode }) {
  useEscape(onClose);
  // Portalled: rendered inside an animated (transformed) table card, a
  // fixed overlay is positioned against the card, not the window.
  return createPortal(
    <div className="fixed inset-0 z-[110] bg-background/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-border glass-card p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <div className="mt-3">{children}</div>
        <div className="flex items-center justify-end gap-3 mt-5">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}

const cancelBtn = (onClick: () => void, label = "Cancel") => (
  <button
    // eslint-disable-next-line jsx-a11y/no-autofocus
    autoFocus
    onClick={onClick}
    className="text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-2 py-1"
  >
    {label}
  </button>
);

function HealthCheckDialog({ targets, onClose }: { targets: ActionTarget[]; onClose: () => void }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 1400);
    return () => clearTimeout(t);
  }, []);
  const results = targets.map((t) => ({ t, hc: t.kind === "source" ? t.s.healthCheck : t.d.healthCheck }));
  const failed = results.filter((r) => r.hc.status !== "passed").length;
  return (
    <Frame title={`Health check · ${describe(targets)}`} onClose={onClose} footer={cancelBtn(onClose, "Close")}>
      {!done ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Checking connectivity and authentication…
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-2">
            {failed === 0 ? "All passed." : `${results.length - failed} passed · ${failed} need a look`}
          </p>
          <ul className="max-h-72 overflow-y-auto divide-y divide-border rounded border border-border">
            {results.map(({ t, hc }) => (
              <li key={keyOf(t)} className="px-3 py-2 flex items-start gap-2.5">
                {hc.status === "passed" ? (
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
                ) : hc.status === "warning" ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{nameOf(t)}</p>
                  <p className="text-xs text-muted-foreground">{hc.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Frame>
  );
}

function RoutingDialog({ sources, onClose }: { sources: SourceView[]; onClose: () => void }) {
  const env = useEnvironment();
  const { updateSourceStatus, addRoute, removeRoute } = useSession();
  // Per destination: all / some / none of the selection routes there.
  const initial = Object.fromEntries(
    env.destinations.map((d) => {
      const n = sources.filter((s) => s.destIds.includes(d.id)).length;
      return [d.id, n === sources.length ? "all" : n === 0 ? "none" : "some"] as const;
    }),
  );
  const [choice, setChoice] = useState<Record<string, "all" | "some" | "none">>(initial);
  const apply = () => {
    for (const s of sources) {
      let next = [...s.destIds];
      for (const d of env.destinations) {
        if (choice[d.id] === "all" && !next.includes(d.id)) {
          next.push(d.id);
          if (s.fromSession) addRoute(s.id, d.id);
        }
        if (choice[d.id] === "none" && next.includes(d.id)) {
          next = next.filter((x) => x !== d.id);
          if (s.fromSession) removeRoute(s.id, d.id);
        }
      }
      if (!s.fromSession) updateSourceStatus(s.id, { destIds: next });
    }
    onClose();
  };
  return (
    <Frame
      title={`Routing · ${sources.length === 1 ? sources[0].name : `${sources.length} sources`}`}
      onClose={onClose}
      footer={
        <>
          {cancelBtn(onClose)}
          <button onClick={apply} className="text-sm rounded-full px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90">
            Save routing
          </button>
        </>
      }
    >
      <p className="text-xs text-muted-foreground mb-2">Where these sources send their data. Changes apply from now; nothing already delivered moves.</p>
      <div className="space-y-1.5">
        {env.destinations.map((d) => (
          <label key={d.id} className="flex items-center gap-2.5 rounded border border-border px-3 py-2 text-sm cursor-pointer hover:bg-muted/15">
            <input
              type="checkbox"
              checked={choice[d.id] === "all"}
              ref={(el) => {
                if (el) el.indeterminate = choice[d.id] === "some";
              }}
              onChange={() => setChoice((c) => ({ ...c, [d.id]: c[d.id] === "all" ? "none" : "all" }))}
              className="accent-[var(--db-blue)] w-4 h-4"
            />
            <HealthDot state={d.state} />
            <span className="flex-1 text-foreground">{d.name}</span>
            {choice[d.id] === "some" && <span className="text-xs text-muted-foreground">some selected</span>}
          </label>
        ))}
      </div>
    </Frame>
  );
}

function DisconnectDialog({ targets, onConfirm, onClose }: { targets: ActionTarget[]; onConfirm: () => void; onClose: () => void }) {
  const srcs = targets.filter((t) => t.kind === "source").length;
  const dsts = targets.length - srcs;
  return (
    <Frame
      title={`Disconnect ${describe(targets)}?`}
      onClose={onClose}
      footer={
        <>
          {cancelBtn(onClose)}
          <button onClick={onConfirm} className="text-sm rounded-full px-4 py-2 bg-destructive text-destructive-foreground hover:brightness-110">
            Disconnect
          </button>
        </>
      }
    >
      <div className="text-sm text-muted-foreground space-y-1.5">
        {srcs > 0 && <p>Databahn stops collecting from {srcs === 1 ? "this source" : `these ${srcs} sources`} immediately. Data already delivered is unaffected.</p>}
        {dsts > 0 && <p>Databahn stops routing data to {dsts === 1 ? "this destination" : `these ${dsts} destinations`}. Sources that only routed there will show as not routed.</p>}
        <p>You can reconnect any time.</p>
      </div>
      {targets.length > 1 && (
        <ul className="mt-3 max-h-40 overflow-y-auto text-xs text-foreground/85 space-y-0.5">
          {targets.map((t) => (
            <li key={keyOf(t)} className="truncate">· {nameOf(t)}</li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* Menu                                                                 */
/* ------------------------------------------------------------------ */

/**
 * One list of actions for a single source or destination and for any
 * multi-row selection. Each item is enabled when it fits at least one
 * selected row, shows how many it applies to when that's fewer than all,
 * and when disabled says why, in the item itself (a greyed item with no
 * reason reads as a bug). Rendered inside the caller's DropdownMenuContent;
 * `dialogs` must be rendered somewhere by the caller too.
 */
export function useEntityActions(targets: ActionTarget[], opts?: { onDone?: () => void }) {
  const navigate = useNavigate();
  const { updateSourceStatus, disconnectEntity, connected } = useSession();
  const [dialog, setDialog] = useState<null | "pause" | "health" | "routing" | "disconnect">(null);
  const single = targets.length === 1;
  const close = () => setDialog(null);
  const done = () => {
    close();
    opts?.onDone?.();
  };

  const pausable = targets.filter((t) => stateOf(t) !== "paused");
  const resumable = targets.filter((t) => stateOf(t) === "paused");
  const assignable = targets.filter(isProblem);
  const sources = targets.filter((t): t is Extract<ActionTarget, { kind: "source" }> => t.kind === "source").map((t) => t.s);
  const count = (n: number) => (targets.length > 1 && n < targets.length ? ` (${n})` : "");

  const assign = (personId: string) => {
    for (const t of assignable)
      updateSourceStatus(keyOf(t), {
        ackAt: Date.now(),
        ownerId: personId,
        ownerVia: "app",
        released: false,
        assignedBy: personId === ME ? undefined : ME,
        previousOwnerId: undefined,
      });
    opts?.onDone?.();
  };

  const Item = ({
    icon: Icon,
    label,
    reason,
    onSelect,
    destructive,
  }: {
    icon: typeof PauseCircle;
    label: string;
    reason?: string | false;
    onSelect: () => void;
    destructive?: boolean;
  }) => (
    <DropdownMenuItem disabled={Boolean(reason)} onSelect={onSelect} variant={destructive ? "destructive" : "default"} className="items-start">
      <Icon className="w-4 h-4 mt-0.5" />
      <span className="flex flex-col">
        <span>{label}</span>
        {reason && <span className="text-xs text-muted-foreground">{reason}</span>}
      </span>
    </DropdownMenuItem>
  );

  const menu = (
    <>
      {targets.length > 1 && <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">{describe(targets)} selected</DropdownMenuLabel>}
      <Item icon={PauseCircle} label={`Pause alerts${count(pausable.length)}`} reason={pausable.length === 0 && "Already paused"} onSelect={() => setDialog("pause")} />
      {resumable.length > 0 && (
        <Item
          icon={PlayCircle}
          label={`Resume alerts${count(resumable.length)}`}
          onSelect={() => {
            for (const t of resumable) updateSourceStatus(keyOf(t), { pausedUntil: undefined, pausedAt: undefined, pauseReason: undefined, resumedAt: Date.now() });
            opts?.onDone?.();
          }}
        />
      )}
      {assignable.length > 0 ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <UserCheck className="w-4 h-4 text-muted-foreground" /> Assign to…{count(assignable.length)}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="z-[120] w-52">
            {PEOPLE.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => assign(p.id)}>
                <span className="w-5 h-5 rounded-full bg-muted/50 text-[9px] font-semibold flex items-center justify-center">{initials(p.name)}</span>
                {p.id === ME ? `${p.name} (you)` : p.name}
                <span className="ml-auto text-xs text-muted-foreground">{p.team.replace(" team", "")}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : (
        <Item icon={UserCheck} label="Assign to…" reason="Only open problems can be assigned" onSelect={() => {}} />
      )}
      <Item icon={Stethoscope} label="Run health check" onSelect={() => setDialog("health")} />
      <Item
        icon={Route}
        label={`Change routing${count(sources.length)}`}
        reason={sources.length === 0 && "Routing is set on sources"}
        onSelect={() => setDialog("routing")}
      />
      <DropdownMenuSeparator />
      <Item
        icon={ListFilter}
        label="See rules"
        reason={!single ? "Select one source" : targets[0].kind !== "source" && "Rules apply to sources"}
        onSelect={() => targets[0].kind === "source" && navigate("/rules", { state: { sourceId: targets[0].s.connectorId } })}
      />
      <Item
        icon={Pencil}
        label="Edit connection"
        reason={!single && `Select one ${targets[0]?.kind ?? "item"}`}
        onSelect={() => {
          const t = targets[0];
          if (t.kind === "source") navigate(SOURCE_WIZARD[t.s.connectorId] ?? `/sources/connect/${t.s.connectorId}`);
          else navigate(DEST_WIZARD[t.d.id] ?? `/destinations/connect/${t.d.id}`);
        }}
      />
      <DropdownMenuSeparator />
      <Item icon={Unplug} label={`Disconnect${targets.length > 1 ? ` ${targets.length}` : ""}`} destructive onSelect={() => setDialog("disconnect")} />
    </>
  );

  const dialogs = (
    <>
      {dialog === "pause" && (
        <PauseDialog
          name={describe(pausable)}
          onCancel={close}
          onConfirm={(until, reason) => {
            for (const t of pausable) updateSourceStatus(keyOf(t), { pausedAt: Date.now(), pausedUntil: until, pauseReason: reason, resumedAt: undefined });
            done();
          }}
        />
      )}
      {dialog === "health" && <HealthCheckDialog targets={targets} onClose={close} />}
      {dialog === "routing" && <RoutingDialog sources={sources} onClose={done} />}
      {dialog === "disconnect" && (
        <DisconnectDialog
          targets={targets}
          onClose={close}
          onConfirm={() => {
            for (const t of targets) {
              // Session connections are removed outright; the sample's are
              // hidden, since they aren't this session's to delete.
              const fromSession =
                t.kind === "source" ? t.s.fromSession : connected.some((c) => c.kind === "destination" && c.id === t.d.id);
              if (fromSession) disconnectEntity(t.kind === "source" ? t.s.id : t.d.id);
              else updateSourceStatus(keyOf(t), { removed: true });
            }
            done();
          }}
        />
      )}
    </>
  );

  return { menu, dialogs };
}

/* ------------------------------------------------------------------ */
/* Table pieces                                                         */
/* ------------------------------------------------------------------ */

/** The ⋯ at the end of a row: the same menu, for that row alone. */
export function RowActions({ target }: { target: ActionTarget }) {
  const { menu, dialogs } = useEntityActions([target]);
  return (
    // Pinned to the right edge: when the table scrolls sideways (Cruz open),
    // a row's actions stay reachable.
    <td
      className="sticky right-0 z-[1] bg-card pl-2 pr-3 py-2.5 text-right shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.5)]"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Actions for ${nameOf(target)}`}
            className="w-7 h-7 rounded inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {menu}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogs}
    </td>
  );
}

/** Row checkbox. Its own cell, so ticking it never opens the drawer. */
export function RowSelect({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <td className="pl-4 py-2.5 w-9" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={checked} onChange={onChange} aria-label={`Select ${label}`} className="accent-[var(--db-blue)] w-4 h-4 cursor-pointer align-middle" />
    </td>
  );
}

export function SelectAll({ total, selected, onChange }: { total: number; selected: number; onChange: (all: boolean) => void }) {
  return (
    <th className="pl-4 py-2 w-9 font-normal">
      <input
        type="checkbox"
        checked={total > 0 && selected === total}
        ref={(el) => {
          if (el) el.indeterminate = selected > 0 && selected < total;
        }}
        onChange={() => onChange(selected < total)}
        aria-label="Select all"
        className="accent-[var(--db-blue)] w-4 h-4 cursor-pointer align-middle"
      />
    </th>
  );
}

/** Shown while rows are selected: how many, the same action menu, Clear. */
export function SelectionBar({ targets, onClear }: { targets: ActionTarget[]; onClear: () => void }) {
  const { menu, dialogs } = useEntityActions(targets, { onDone: onClear });
  if (targets.length === 0) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-primary/[0.06]">
      <span className="text-sm text-foreground">
        <span className="font-mono-db">{targets.length}</span> selected
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="h-7 px-2.5 rounded border border-border text-xs text-foreground hover:bg-muted/30 inline-flex items-center gap-1">
            Actions <ChevronDown className="w-3 h-3" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          {menu}
        </DropdownMenuContent>
      </DropdownMenu>
      <button onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
        Clear
      </button>
      {dialogs}
    </div>
  );
}
