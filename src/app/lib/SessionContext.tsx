import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_RULES, type ReductionRule } from "@/app/data/rules";
import { DEFAULT_NOTIFICATIONS, SAMPLE_CHANNEL, withChannel, type NotificationSettings } from "./notifications";

export type FieldStatus = "empty" | "filled" | "valid" | "invalid";

export interface WizardFieldState {
  label: string;
  value: string;
  status: FieldStatus;
}

export type WizardKind = "source" | "destination" | "notification";

export interface WizardState {
  connectorName: string;
  connectorKind: WizardKind;
  stepIndex: number;
  totalSteps: number;
  stepLabel: string;
  fields: Record<string, WizardFieldState>;
}

export interface ConnectedEntity {
  id: string;
  name: string;
  kind: "source" | "destination";
  connectedAt: number;
  meta?: Record<string, string>;
}

/** Which source actually feeds which destination. Without this the pipeline
 * view has no way to know a real routing choice from an unrelated connector,
 * so it was fanning every source out to every destination evenly. */
export interface FlowRoute {
  sourceId: string;
  destId: string;
}

/** Deliberately not a `ConnectedEntity`. Cold storage isn't a source or
 * destination a customer picks from a catalogue once, it's their own
 * archive bucket(s), and unlike Sentinel or Splunk there can genuinely be
 * more than one (an EU bucket and a US bucket for residency, say), so it
 * needs its own name per instance rather than reusing a fixed connector
 * name the way `isConnected` and the catalogue assume. */
/** What the user has done about a source's health, layered over whatever the
 * environment itself reports. Kept separate from the simulated telemetry so
 * an acknowledgement or a fix survives a reload the same way a connection
 * does, instead of the demo forgetting someone already said "I'm on it." */
export interface SourceStatusOverride {
  /** Fix verified: the source is recovering from this moment. */
  recoveredAt?: number;
  /** How long it had been down when the fix landed. */
  downMin?: number;
  /** Someone took ownership, so the team doesn't triple up on one problem. */
  ackAt?: number;
  /** Who owns it. Missing with ackAt set means the signed-in user (the
   * original "I'm on it", before ownership named a person). */
  ownerId?: string;
  ownerVia?: "app" | "slack" | "teams";
  assignedBy?: string;
  previousOwnerId?: string;
  /** Explicitly released, so a seeded owner doesn't come back. */
  released?: boolean;
  /** Paused on purpose (maintenance), alerts held until this time. */
  /** Infinity-like value (Number.MAX_SAFE_INTEGER) means "until resumed". */
  pausedUntil?: number;
  pausedAt?: number;
  pauseReason?: string;
  /** Resumed by hand, which also ends a pause that came with the sample. */
  resumedAt?: number;
  /** Disconnected. Session connections are removed outright; this covers
   * the sample environment's, which aren't this session's to delete. */
  removed?: boolean;
  /** Routing changed by hand (sample sources; session ones use routes). */
  destIds?: string[];
  /** An upcoming risk (an expiring credential) was dealt with. */
  riskResolved?: boolean;
}

export interface ColdStorageTarget {
  id: string;
  label: string;
  endpoint: string;
  connectedAt: number;
}

interface SessionContextValue {
  wizard: WizardState | null;
  setWizard: (w: WizardState | null) => void;
  updateWizardField: (key: string, patch: Partial<WizardFieldState>) => void;
  connected: ConnectedEntity[];
  connectEntity: (e: ConnectedEntity) => void;
  /** Permanent removal, distinct from the pipeline's temporary hide. */
  disconnectEntity: (id: string) => void;
  routes: FlowRoute[];
  addRoute: (sourceId: string, destId: string) => void;
  removeRoute: (sourceId: string, destId: string) => void;
  /** Reversible, unlike disconnect, and shared session-wide (not just local
   * to whichever page happens to be mounted) so a source hidden from
   * Pipeline overview also reads as hidden anywhere else that shows
   * connection status, and survives navigating away and back. */
  hiddenIds: string[];
  toggleHidden: (id: string) => void;
  /** Lives here, not as local state on Pipeline overview, so a rule proposed
   * from a Search result (see Search's "flag" action) actually shows up
   * where rules are reviewed, instead of vanishing the moment that page
   * unmounts. */
  rules: ReductionRule[];
  toggleRule: (id: string) => void;
  addRule: (rule: ReductionRule) => void;
  /** Clears everything, for starting a walkthrough from scratch. */
  resetSession: () => void;
  isConnected: (name: string) => ConnectedEntity | undefined;
  coldStorageTargets: ColdStorageTarget[];
  addColdStorageTarget: (label: string, endpoint: string) => void;
  removeColdStorageTarget: (id: string) => void;
  /** sourceId → coldStorageTarget id. Unset means "use the first connected
   * target," most sources never need to touch this, it only earns its place
   * once a second target exists to choose between. */
  coldStorageAssignments: Record<string, string>;
  assignColdStorage: (sourceId: string, targetId: string | null) => void;
  /** Loads the ~170-source sample environment alongside whatever this
   * session connected, so health and the dashboard can be shown at the
   * scale they're designed for. Off by default, so the onboarding
   * walkthrough still starts from an empty workspace. */
  sampleEnvironment: boolean;
  setSampleEnvironment: (on: boolean) => void;
  sourceStatus: Record<string, SourceStatusOverride>;
  /** `null` clears every override for that source. */
  updateSourceStatus: (id: string, patch: Partial<SourceStatusOverride> | null) => void;
  /** Recommendations the user said "not now" to. */
  dismissedRecs: string[];
  dismissRec: (id: string) => void;
  /** Whose eyes the dashboard is shown through. A viewing preference, not
   * data, so it survives "Reset demo data". */
  lens: DashboardLens;
  setLens: (lens: DashboardLens) => void;
  /** Where alerts go outside the app: channels and routing by severity. */
  notifications: NotificationSettings;
  setNotifications: (update: (prev: NotificationSettings) => NotificationSettings) => void;
}

export type DashboardLens = "executive" | "engineer";

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Principle 7b, the shared flow-state store `OnboardingWizard` writes to and
 * `CruzAssistant` reads from continuously, so Cruz "travels with" the user
 * instead of being re-briefed at every step. Also the mechanism behind
 * cross-flow reuse ("Sentinel already connected this session, route here too?").
 */
const STORAGE_KEY = "databahn-connected";
const ROUTES_STORAGE_KEY = "databahn-routes";
const HIDDEN_STORAGE_KEY = "databahn-hidden";
const RULES_STORAGE_KEY = "databahn-rules";
const COLD_STORAGE_TARGETS_KEY = "databahn-cold-storage-targets";
const COLD_STORAGE_ASSIGNMENTS_KEY = "databahn-cold-storage-assignments";
const SAMPLE_ENV_KEY = "databahn-sample-environment";
const SOURCE_STATUS_KEY = "databahn-source-status";
const DISMISSED_RECS_KEY = "databahn-dismissed-recs";
const LENS_KEY = "databahn-dashboard-lens";
const NOTIFICATIONS_KEY = "databahn-notifications";

/** One loader for the newer keys, rather than another copy of the same
 * try/parse/fallback shape per key. */
function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable; the session still works in memory */
  }
}

/** Connected entities persist across reloads. In the real product this is
 * server state; here it means an accidental refresh during a walkthrough does
 * not wipe everything that was just set up. */
function loadConnected(): ConnectedEntity[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ConnectedEntity[]) : [];
  } catch {
    return [];
  }
}

function loadRoutes(): FlowRoute[] {
  try {
    const raw = localStorage.getItem(ROUTES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FlowRoute[]) : [];
  } catch {
    return [];
  }
}

function loadHidden(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function loadRules(): ReductionRule[] {
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ReductionRule[]) : DEFAULT_RULES;
  } catch {
    return DEFAULT_RULES;
  }
}

function loadColdStorageTargets(): ColdStorageTarget[] {
  try {
    const raw = localStorage.getItem(COLD_STORAGE_TARGETS_KEY);
    return raw ? (JSON.parse(raw) as ColdStorageTarget[]) : [];
  } catch {
    return [];
  }
}

function loadColdStorageAssignments(): Record<string, string> {
  try {
    const raw = localStorage.getItem(COLD_STORAGE_ASSIGNMENTS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [connected, setConnected] = useState<ConnectedEntity[]>(loadConnected);
  const [routes, setRoutes] = useState<FlowRoute[]>(loadRoutes);
  const [hiddenIds, setHiddenIds] = useState<string[]>(loadHidden);
  const [rules, setRules] = useState<ReductionRule[]>(loadRules);
  const [coldStorageTargets, setColdStorageTargets] = useState<ColdStorageTarget[]>(loadColdStorageTargets);
  const [coldStorageAssignments, setColdStorageAssignments] = useState<Record<string, string>>(loadColdStorageAssignments);
  const [sampleEnvironment, setSampleEnvironmentState] = useState<boolean>(() => loadJson(SAMPLE_ENV_KEY, false));
  const [notifications, setNotificationsState] = useState<NotificationSettings>(
    () =>
      loadJson<NotificationSettings | null>(NOTIFICATIONS_KEY, null) ??
      // First load with the sample already on (saved before notifications
      // existed) still gets the sample's channel.
      (loadJson(SAMPLE_ENV_KEY, false) ? withChannel(DEFAULT_NOTIFICATIONS, SAMPLE_CHANNEL, ["critical", "high"]) : DEFAULT_NOTIFICATIONS),
  );
  useEffect(() => saveJson(NOTIFICATIONS_KEY, notifications), [notifications]);
  const setNotifications = useCallback((update: (prev: NotificationSettings) => NotificationSettings) => setNotificationsState(update), []);
  // The sample's history says alerts went to #secops-pipeline, so turning it
  // on connects that channel (if nothing is connected yet), and turning it
  // off removes it again. A user's own channels are never touched.
  const setSampleEnvironment = useCallback((on: boolean) => {
    setSampleEnvironmentState(on);
    setNotificationsState((prev) => {
      const without = { ...prev, channels: prev.channels.filter((c) => !c.sample) };
      for (const sv of Object.keys(without.routing) as (keyof typeof without.routing)[])
        without.routing = { ...without.routing, [sv]: without.routing[sv].filter((id) => id !== SAMPLE_CHANNEL.id) };
      return on && without.channels.length === 0 ? withChannel(without, SAMPLE_CHANNEL, ["critical", "high"]) : without;
    });
  }, []);
  const [sourceStatus, setSourceStatus] = useState<Record<string, SourceStatusOverride>>(() => loadJson(SOURCE_STATUS_KEY, {}));
  const [dismissedRecs, setDismissedRecs] = useState<string[]>(() => loadJson(DISMISSED_RECS_KEY, []));
  const [lens, setLens] = useState<DashboardLens>(() => loadJson<DashboardLens>(LENS_KEY, "engineer"));
  useEffect(() => saveJson(LENS_KEY, lens), [lens]);

  useEffect(() => saveJson(SAMPLE_ENV_KEY, sampleEnvironment), [sampleEnvironment]);
  useEffect(() => saveJson(SOURCE_STATUS_KEY, sourceStatus), [sourceStatus]);
  useEffect(() => saveJson(DISMISSED_RECS_KEY, dismissedRecs), [dismissedRecs]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(connected));
    } catch {
      /* storage may be unavailable; the session still works in memory */
    }
  }, [connected]);

  useEffect(() => {
    try {
      localStorage.setItem(ROUTES_STORAGE_KEY, JSON.stringify(routes));
    } catch {
      /* storage may be unavailable; the session still works in memory */
    }
  }, [routes]);

  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify(hiddenIds));
    } catch {
      /* storage may be unavailable; the session still works in memory */
    }
  }, [hiddenIds]);

  useEffect(() => {
    try {
      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
    } catch {
      /* storage may be unavailable; the session still works in memory */
    }
  }, [rules]);

  useEffect(() => {
    try {
      localStorage.setItem(COLD_STORAGE_TARGETS_KEY, JSON.stringify(coldStorageTargets));
    } catch {
      /* storage may be unavailable; the session still works in memory */
    }
  }, [coldStorageTargets]);

  useEffect(() => {
    try {
      localStorage.setItem(COLD_STORAGE_ASSIGNMENTS_KEY, JSON.stringify(coldStorageAssignments));
    } catch {
      /* storage may be unavailable; the session still works in memory */
    }
  }, [coldStorageAssignments]);

  const updateWizardField = useCallback((key: string, patch: Partial<WizardFieldState>) => {
    setWizard((prev) => {
      if (!prev) return prev;
      const existing = prev.fields[key] ?? { label: key, value: "", status: "empty" as FieldStatus };
      return { ...prev, fields: { ...prev.fields, [key]: { ...existing, ...patch } } };
    });
  }, []);

  const connectEntity = useCallback((e: ConnectedEntity) => {
    setConnected((prev) => [...prev.filter((c) => c.name !== e.name), e]);
  }, []);

  const disconnectEntity = useCallback((id: string) => {
    setConnected((prev) => prev.filter((c) => c.id !== id));
    setRoutes((prev) => prev.filter((r) => r.sourceId !== id && r.destId !== id));
    setHiddenIds((prev) => prev.filter((h) => h !== id));
    // A disconnected source's assignment is meaningless, and a removed
    // target can't stay the answer to "where does this source's filtered
    // remainder go" for anyone still pointed at it.
    setColdStorageAssignments((prev) => {
      const next = { ...prev };
      delete next[id];
      for (const key of Object.keys(next)) if (next[key] === id) delete next[key];
      return next;
    });
  }, []);

  const toggleHidden = useCallback((id: string) => {
    setHiddenIds((prev) => (prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]));
  }, []);

  const toggleRule = useCallback((id: string) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  }, []);

  const addRule = useCallback((rule: ReductionRule) => {
    setRules((prev) => [...prev, rule]);
  }, []);

  const addRoute = useCallback((sourceId: string, destId: string) => {
    setRoutes((prev) =>
      prev.some((r) => r.sourceId === sourceId && r.destId === destId) ? prev : [...prev, { sourceId, destId }],
    );
  }, []);

  const removeRoute = useCallback((sourceId: string, destId: string) => {
    setRoutes((prev) => prev.filter((r) => !(r.sourceId === sourceId && r.destId === destId)));
  }, []);

  const resetSession = useCallback(() => {
    setConnected([]);
    setRoutes([]);
    setHiddenIds([]);
    setRules(DEFAULT_RULES);
    setColdStorageTargets([]);
    setColdStorageAssignments({});
    setSampleEnvironmentState(false);
    setNotificationsState(DEFAULT_NOTIFICATIONS);
    setSourceStatus({});
    setDismissedRecs([]);
  }, []);

  const updateSourceStatus = useCallback((id: string, patch: Partial<SourceStatusOverride> | null) => {
    setSourceStatus((prev) => {
      const next = { ...prev };
      if (patch === null) delete next[id];
      else next[id] = { ...prev[id], ...patch };
      return next;
    });
  }, []);

  const dismissRec = useCallback((id: string) => {
    setDismissedRecs((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const isConnected = useCallback(
    (name: string) => connected.find((c) => c.name === name),
    [connected],
  );

  const addColdStorageTarget = useCallback((label: string, endpoint: string) => {
    const id = `cs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setColdStorageTargets((prev) => [...prev, { id, label, endpoint, connectedAt: Date.now() }]);
  }, []);

  const removeColdStorageTarget = useCallback((id: string) => {
    setColdStorageTargets((prev) => prev.filter((t) => t.id !== id));
    setColdStorageAssignments((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) if (next[key] === id) delete next[key];
      return next;
    });
  }, []);

  const assignColdStorage = useCallback((sourceId: string, targetId: string | null) => {
    setColdStorageAssignments((prev) => {
      if (targetId === null) {
        const next = { ...prev };
        delete next[sourceId];
        return next;
      }
      return { ...prev, [sourceId]: targetId };
    });
  }, []);

  const value = useMemo(
    () => ({
      wizard,
      setWizard,
      updateWizardField,
      connected,
      connectEntity,
      disconnectEntity,
      routes,
      addRoute,
      removeRoute,
      hiddenIds,
      toggleHidden,
      rules,
      toggleRule,
      addRule,
      resetSession,
      isConnected,
      coldStorageTargets,
      addColdStorageTarget,
      removeColdStorageTarget,
      coldStorageAssignments,
      assignColdStorage,
      sampleEnvironment,
      setSampleEnvironment,
      sourceStatus,
      updateSourceStatus,
      dismissedRecs,
      dismissRec,
      lens,
      setLens,
      notifications,
      setNotifications,
    }),
    [
      wizard,
      updateWizardField,
      connected,
      connectEntity,
      disconnectEntity,
      routes,
      addRoute,
      removeRoute,
      hiddenIds,
      toggleHidden,
      rules,
      toggleRule,
      addRule,
      resetSession,
      isConnected,
      coldStorageTargets,
      addColdStorageTarget,
      removeColdStorageTarget,
      coldStorageAssignments,
      assignColdStorage,
      sampleEnvironment,
      sourceStatus,
      updateSourceStatus,
      dismissedRecs,
      dismissRec,
      lens,
      notifications,
      setSampleEnvironment,
      setNotifications,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}
