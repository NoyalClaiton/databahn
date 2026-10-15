import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { BellOff, Moon, UserCheck, RotateCcw, Users, ChevronDown, MoreVertical, Unplug } from "lucide-react";
import { useSession } from "@/app/lib/SessionContext";
import { ME } from "@/app/lib/people";
import { useEnvironment, fmtAgo, clockAt, fmtDuration, type Alert } from "@/app/lib/environment";
import {
  CHANNEL_TYPES, CHANNEL_ORDER, channelName, withoutChannel,
  type ChannelType, type NotificationChannel,
} from "@/app/lib/notifications";
import type { Severity } from "@/app/data/fleet";
import type { ConnectorDef } from "@/app/data/connectors";
import { PageHeader, SectionHeading, StaggerItem } from "@/app/components/shared/PageLayout";
import { ConnectorCatalogCard } from "@/app/components/shared/ConnectorCatalog";
import { ConnectModal } from "@/app/components/shared/ConnectModal";
import { SeverityBadge, SEVERITY_META } from "@/app/components/shared/HealthBadge";
import { ChannelMonogram } from "@/app/components/shared/ChannelMonogram";
import { Switch } from "@/app/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/app/components/ui/dropdown-menu";

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
const SEVERITY_EDGE: Record<Severity, string> = { critical: "var(--db-red)", high: "#f97316", medium: "#facc15", low: "rgba(178,181,190,0.5)" };

/** Quiet-hours choices, 24-hour like every other time in the app. */
const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

/** A channel in the shape the connector catalog card and connect modal
 * already render, so channels look and behave like every other thing a
 * user connects in Databahn. */
function asCatalogEntry(type: ChannelType): ConnectorDef {
  const def = CHANNEL_TYPES[type];
  return {
    id: type,
    name: def.name,
    kind: "destination",
    category: "Notifications",
    brandColor: def.color,
    initials: def.monogram,
    description: def.purpose,
    tagline: def.tagline,
    dataTypes: def.capabilities,
    builtIn: false,
  };
}

const severityList = (ids: Severity[]) =>
  ids
    .map((sv) => SEVERITY_META[sv].label.toLowerCase())
    .join(", ")
    .replace(/, ([^,]*)$/, " and $1");

/* ------------------------------------------------------------------ */
/* What a message looks like                                            */
/* ------------------------------------------------------------------ */

/**
 * The actual message, not a description of it. Built from the most urgent
 * open alert when there is one, so it's recognizable. "I'm on it" works here
 * the way it would in Slack: it sets ownership in Databahn, so the team sees
 * who has it without anyone opening the app.
 */
function MessagePreview({ alert, channel }: { alert: Alert | null; channel: NotificationChannel | null }) {
  const { updateSourceStatus } = useSession();
  const sample: Alert = {
    id: "preview",
    kind: "incident",
    severity: "critical",
    area: "ingest",
    title: "Palo Alto · DC East stopped sending",
    detail: "Threat and traffic detections have no data from the DC East firewall.",
    likelyCause: "The firewall stopped forwarding logs",
    sinceMin: 15,
    targets: [],
    open: { kind: "source", id: "", name: "" },
  };
  const a = alert ?? sample;
  const acked = Boolean(a.assignee);
  const meta = SEVERITY_META[a.severity];
  const ack = () => {
    if (!alert) return;
    // Claimed from chat: same ownership as in the app, marked as via Slack.
    const patch = acked
      ? { ackAt: undefined, ownerId: undefined, released: true }
      : { ackAt: Date.now(), ownerId: ME, ownerVia: "slack" as const, released: false, assignedBy: undefined, previousOwnerId: undefined };
    if (alert.open.kind === "destination") updateSourceStatus(`dest:${alert.open.id}`, patch);
    else for (const t of alert.targets.length ? alert.targets : [alert.open]) updateSourceStatus(t.id, patch);
  };

  return (
    <div className="rounded border border-border glass-card p-4">
      <div className="rounded bg-background/60 border border-border p-4">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded bg-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0">DB</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-semibold text-foreground">Databahn</span>
              <span className="text-[10px] ml-1.5 px-1 rounded bg-muted/40 text-muted-foreground">APP</span>
              <span className="text-xs text-muted-foreground ml-2">{clockAt(Math.max(0, a.sinceMin - 15))}</span>
            </p>
            <div
              className="mt-1.5 border-l-4 rounded-sm pl-3 py-1"
              style={{ borderColor: a.severity === "critical" ? "var(--db-red)" : a.severity === "high" ? "#f97316" : "#facc15" }}
            >
              <p className="text-sm font-semibold text-foreground">
                {meta.label}: {a.title}
              </p>
              <p className="text-sm text-foreground/80 mt-1">{a.detail}</p>
              <div className="space-y-0.5 mt-2 text-xs text-muted-foreground">
                {a.kind === "incident" && (
                  <p>
                    Since <span className="text-foreground/90">{clockAt(a.sinceMin)} ({fmtDuration(a.sinceMin)})</span>
                  </p>
                )}
                {a.likelyCause && (
                  <p>
                    Likely cause <span className="text-foreground/90">{a.likelyCause}</span>
                  </p>
                )}
                {a.targets.length > 1 && (
                  <p>
                    Affected <span className="text-foreground/90">{a.targets.length} sources</span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs px-2.5 py-1 rounded border border-border text-foreground/90">Triage in Databahn</span>
                <button
                  onClick={ack}
                  disabled={!alert}
                  className={`text-xs px-2.5 py-1 rounded border inline-flex items-center gap-1 ${
                    acked ? "border-success/50 text-success" : "border-border text-foreground/90 hover:bg-muted/20"
                  }`}
                >
                  <UserCheck className="w-3 h-3" /> {a.assignee ? `${a.assignee.person.name} is on it` : "I'm on it"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        {channel ? `As it appears in ${channelName(channel)}.` : "How alerts will look once a channel is connected."} One message per problem,
        updated in place when it gets worse or recovers, never repeated.
      </p>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* What goes where                                                      */
/* ------------------------------------------------------------------ */

const DELIVERY_LABEL: Record<ChannelType, string> = {
  slack: "Immediately",
  teams: "Immediately",
  pagerduty: "Pages on-call",
  opsgenie: "Alerts on-call",
  email: "Daily digest",
  webhook: "Immediately",
};

/**
 * Channels as rows, the four severities as fixed columns: the table only
 * ever grows downward, however many channels get connected. Collapsed it's
 * one line that answers "what goes where" on its own. Removing a channel is
 * deliberate: tucked in the row menu and confirmed, the same way
 * disconnecting a source is, since a misclick would otherwise throw away a
 * setup that took a sign-in and a test to build.
 */
function RoutingSection({ justAdded }: { justAdded: string | null }) {
  const { notifications, setNotifications } = useSession();
  const { channels, routing } = notifications;
  const [open, setOpen] = useState(() => Boolean(justAdded));
  const [removing, setRemoving] = useState<NotificationChannel | null>(null);
  useEffect(() => {
    if (justAdded) setOpen(true);
  }, [justAdded]);

  const toggle = (sv: Severity, id: string) =>
    setNotifications((n) => ({
      ...n,
      routing: { ...n.routing, [sv]: n.routing[sv].includes(id) ? n.routing[sv].filter((x) => x !== id) : [...n.routing[sv], id] },
    }));

  if (channels.length === 0) {
    return (
      <div className="rounded border border-border glass-card px-4 py-4 text-sm text-muted-foreground">
        Connect a channel to choose which alerts it receives.
      </div>
    );
  }

  const severitiesOf = (id: string) => SEVERITIES.filter((sv) => routing[sv].includes(id));

  return (
    <div className="rounded border border-border glass-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full px-4 py-3 flex items-center justify-between gap-4 text-left hover:bg-muted/10 transition-colors"
      >
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          {SEVERITIES.map((sv) => {
            const n = routing[sv].length;
            return (
              <span key={sv} className="inline-flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_META[sv].dot}`} aria-hidden="true" />
                <span className="text-foreground/85">{SEVERITY_META[sv].label}</span>
                <span className={n ? "text-muted-foreground" : "text-amber-300"}>
                  {n ? `${n} channel${n === 1 ? "" : "s"}` : "only Databahn"}
                </span>
              </span>
            );
          })}
        </span>
        <span className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground">
          {open ? "Hide" : `${channels.length} channel${channels.length === 1 ? "" : "s"}`}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </span>
      </button>

      {open && (
        <>
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-xs text-muted-foreground text-left border-b border-border bg-muted/5">
                <tr>
                  <th className="font-normal px-4 py-2">Channel</th>
                  {SEVERITIES.map((sv) => (
                    <th key={sv} className="font-normal px-2 py-2 text-center" title={SEVERITY_META[sv].definition}>
                      {SEVERITY_META[sv].label}
                    </th>
                  ))}
                  <th className="font-normal px-4 py-2">Delivery</th>
                  <th className="w-10" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {channels.map((c) => {
                  const def = CHANNEL_TYPES[c.type];
                  return (
                    <tr key={c.id} className={`transition-colors ${justAdded === c.id ? "bg-success/10" : ""}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ChannelMonogram type={c.type} size={28} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate max-w-[220px]" title={c.target}>
                              {c.target}
                            </p>
                            <p className="text-xs text-muted-foreground">{def.name}</p>
                          </div>
                        </div>
                      </td>
                      {SEVERITIES.map((sv) => {
                        const on = routing[sv].includes(c.id);
                        return (
                          <td key={sv} className="px-2 py-2.5 text-center">
                            {/* The same checkbox the connect wizard's "Alerts sent
                                here" step uses, so a choice made there looks
                                identical when it's changed here. */}
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggle(sv, c.id)}
                              aria-label={`Send ${SEVERITY_META[sv].label} alerts to ${c.target}`}
                              className="accent-[var(--db-blue)] w-4 h-4 cursor-pointer align-middle"
                            />
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{DELIVERY_LABEL[c.type]}</td>
                      <td className="pr-3 py-2.5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              aria-label={`Options for ${c.target}`}
                              className="text-muted-foreground hover:text-foreground p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(c)}>
                              <Unplug className="w-4 h-4" /> Disconnect channel
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t border-border divide-y divide-border">
            <p className="px-4 pt-3 pb-1 text-xs uppercase tracking-wide text-muted-foreground">Delivery options</p>
            {[
              {
                icon: Users,
                key: "notifyOwners" as const,
                title: "Also notify the owning team",
                sub: "The team that owns the affected source (Network team, IAM team…) gets the alert directly, not just the shared channel.",
              },
              {
                icon: RotateCcw,
                key: "recoveryNotices" as const,
                title: "Send recovery notices",
                sub: "Updates the original message when it's resolved, so nobody keeps chasing something that's fixed.",
              },
            ].map((o) => (
              <div key={o.key} className="px-4 py-3 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <o.icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-sm text-foreground">{o.title}</p>
                    <p className="text-xs text-muted-foreground">{o.sub}</p>
                  </div>
                </div>
                <Switch checked={notifications[o.key]} onCheckedChange={(v) => setNotifications((n) => ({ ...n, [o.key]: v }))} aria-label={o.title} />
              </div>
            ))}
            <div className="px-4 py-3 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Moon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm text-foreground">Quiet hours</p>
                  <p className="text-xs text-muted-foreground">Holds medium and low alerts until morning. Critical and high always go out, whatever the time.</p>
                  {notifications.quietHours.on && (
                    <div className="flex items-center gap-2 mt-2.5 text-xs text-muted-foreground">
                      {(["from", "to"] as const).map((k) => (
                        <span key={k} className="inline-flex items-center gap-2">
                          {k === "from" ? "Hold from" : "until"}
                          {/* The shared Select, as in the Rules library, not
                              the browser's time input: its clock icon draws
                              dark-on-dark and its picker is the OS's own. */}
                          <Select
                            value={notifications.quietHours[k]}
                            onValueChange={(v) => setNotifications((n) => ({ ...n, quietHours: { ...n.quietHours, [k]: v } }))}
                          >
                            <SelectTrigger size="sm" className="w-[92px] font-mono-db" aria-label={k === "from" ? "Quiet hours start" : "Quiet hours end"}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-64">
                              {HALF_HOURS.map((t) => (
                                <SelectItem key={t} value={t} className="font-mono-db">
                                  {t}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <Switch
                checked={notifications.quietHours.on}
                onCheckedChange={(v) => setNotifications((n) => ({ ...n, quietHours: { ...n.quietHours, on: v } }))}
                aria-label="Quiet hours"
              />
            </div>
          </div>
        </>
      )}

      {/* Same confirm the pipeline uses to disconnect a source: names what
          stops, Cancel focused by default. */}
      {removing && (
        <div
          className="fixed inset-0 z-[70] bg-background/70 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setRemoving(null)}
          aria-hidden="true"
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border glass-card p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-channel-title"
            aria-hidden="false"
          >
            <p id="remove-channel-title" className="text-sm font-medium text-foreground">
              Disconnect {removing.target}?
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {severitiesOf(removing.id).length
                ? `${severityList(severitiesOf(removing.id)).replace(/^./, (c) => c.toUpperCase())} alerts stop going to ${removing.target} immediately.`
                : `Nothing is currently routed to ${removing.target}.`}{" "}
              {SEVERITIES.some((sv) => routing[sv].length === 1 && routing[sv][0] === removing.id)
                ? `${severityList(SEVERITIES.filter((sv) => routing[sv].length === 1 && routing[sv][0] === removing.id)).replace(/^./, (c) => c.toUpperCase())} alerts will only show in Databahn. `
                : ""}
              Reconnecting means signing in and sending a test again.
            </p>
            <div className="flex items-center justify-end gap-3 mt-5">
              <button
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                onClick={() => setRemoving(null)}
                className="text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-2 py-1 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setNotifications((n) => withoutChannel(n, removing.id));
                  setRemoving(null);
                }}
                className="text-sm rounded-full px-4 py-2 bg-destructive text-destructive-foreground hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Same shape as the Sources and Destinations catalogs on purpose: centered
 * header, the same catalog cards, the same Connect modal, then the same
 * full-page wizard. Notification channels are one more thing a user
 * connects, so they look and behave like the others. Below the catalog, the
 * part only channels have: what goes where.
 */
export default function Notifications() {
  const navigate = useNavigate();
  const location = useLocation();
  const env = useEnvironment();
  const { notifications, setNotifications } = useSession();
  const [pending, setPending] = useState<ChannelType | null>(null);
  // Back from the wizard: the new channel is marked where it landed.
  const [justAdded, setJustAdded] = useState<string | null>(
    () => (location.state as { highlightChannelId?: string } | null)?.highlightChannelId ?? null,
  );
  useEffect(() => {
    if (!justAdded) return;
    const t = setTimeout(() => setJustAdded(null), 4000);
    return () => clearTimeout(t);
  }, [justAdded]);

  const { channels, routing } = notifications;
  const topAlert = env.summary.alerts.find((a) => a.kind === "incident") ?? null;
  const pendingChannels = pending ? channels.filter((c) => c.type === pending) : [];
  const severitiesFor = (id: string) => SEVERITIES.filter((sv) => routing[sv].includes(id));

  // Only alerts raised after a channel was connected can have reached it.
  const deliveries = env.summary.alerts
    .filter((a) => a.kind === "incident")
    .map((a) => {
      const sentMinAgo = Math.max(0, a.sinceMin - 15);
      const sentAt = Date.now() - sentMinAgo * 60000;
      const to = channels.filter((c) => routing[a.severity].includes(c.id) && c.connectedAt <= sentAt);
      return { a, sentMinAgo, to };
    })
    .filter((d) => d.to.length > 0);


  return (
    <div className="w-full max-w-[1180px] mx-auto">
      <PageHeader
        title="Where should alerts go?"
        subtitle="Connect the tools your team already works in. When a source stops or a destination rejects data, the right people hear about it without watching Databahn."
      />

      {channels.length === 0 && (
        <div className="rounded border border-border bg-card shadow-[inset_3px_0_0_#f59e0b] px-4 py-3 mb-6 flex items-start gap-3">
          <BellOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-foreground/90">
            No channels connected. Alerts only show inside Databahn right now, so a source that stops overnight goes unnoticed until someone opens
            the app.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {CHANNEL_ORDER.map((type, i) => {
          const connected = channels.filter((c) => c.type === type);
          return (
            <StaggerItem key={type} index={i}>
              <ConnectorCatalogCard
                connector={asCatalogEntry(type)}
                onSelect={() => setPending(type)}
                connected={connected.length > 0}
                liveContent={
                  <>
                    {connected.map((c) => (
                      <p
                        key={c.id}
                        title={c.target}
                        className={`text-foreground rounded transition-colors truncate ${justAdded === c.id ? "bg-success/15 -mx-1 px-1" : ""}`}
                      >
                        <span className="font-mono-db">{c.target}</span>
                      </p>
                    ))}
                    {/* What reaches it and how, so a connected card says as
                        much as an unconnected one's feature pills. */}
                    <p className="text-muted-foreground">
                      {severityList(SEVERITIES.filter((sv) => connected.some((c) => routing[sv].includes(c.id)))) || "no alerts routed"} alerts
                    </p>
                    <p className="text-success">
                      {CHANNEL_TYPES[type].delivery === "digest" ? "daily digest" : "sent the moment they happen"}
                    </p>
                  </>
                }
              />
            </StaggerItem>
          );
        })}
      </div>

      <div className="space-y-8 mt-10">
        <section>
          <SectionHeading title="What goes where" />
          <RoutingSection justAdded={justAdded} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section>
            <SectionHeading title="What a message looks like" />
            <MessagePreview alert={topAlert} channel={channels.find((c) => c.type === "slack" || c.type === "teams") ?? null} />
          </section>

          <section>
            <SectionHeading title="Recently sent" count={deliveries.length} />
            <div className="rounded border border-border glass-card divide-y divide-border">
              {deliveries.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">
                  {channels.length === 0 ? "Nothing sent yet, no channels are connected." : "Nothing sent since these channels were connected."}
                </p>
              ) : (
                deliveries.slice(0, 7).map(({ a, sentMinAgo, to }) => (
                  <button
                    key={a.id}
                    onClick={() => navigate("/", { state: { openTarget: a.open } })}
                    // Same row shape as the dashboard Alerts list: severity as a
                    // thin edge plus a badge after the title, not a column.
                    className="w-full text-left px-4 py-2.5 hover:bg-muted/15 flex items-start gap-3"
                    style={{ boxShadow: `inset 3px 0 0 ${SEVERITY_EDGE[a.severity]}` }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-foreground truncate">{a.title}</span>
                        <SeverityBadge severity={a.severity} />
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Delivered to {to.map(channelName).join(", ")}
                        {notifications.notifyOwners ? " and the owning team" : ""}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground font-mono-db shrink-0">{fmtAgo(sentMinAgo)}</span>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>

        {env.isSample && (
          <p className="text-xs text-muted-foreground/50 text-center">Sample environment. Messages and deliveries are simulated for this prototype.</p>
        )}
      </div>

      {/* The same identify-and-consent step every source and destination
          goes through before its wizard. */}
      <ConnectModal
        connector={pending ? asCatalogEntry(pending) : null}
        isConnected={pendingChannels.length > 0}
        onClose={() => setPending(null)}
        onContinue={(id) => {
          setPending(null);
          navigate(`/notifications/connect/${id}`);
        }}
        onDisconnect={(id) => {
          setNotifications((n) => channels.filter((c) => c.type === id).reduce((acc, c) => withoutChannel(acc, c.id), n));
          setPending(null);
        }}
        copy={
          pending
            ? {
                accessHeading: "Databahn will be able to:",
                accessNote: "It can only post. You choose exactly which alerts go here on the next screen.",
                configuration: pendingChannels.map((c) => [c.target, severityList(severitiesFor(c.id)) || "no alerts routed"]),
                disconnectBody: `Alerts stop going to ${pendingChannels.map((c) => c.target).join(", ")} immediately. They still show in Databahn, and anything routed only here won't be sent anywhere else.`,
                disconnectLabel: `Disconnect ${CHANNEL_TYPES[pending].name}`,
                manageLabel: "Add another",
              }
            : undefined
        }
      />
    </div>
  );
}
