import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_RULES, type ReductionRule } from "@/app/data/rules";

export type FieldStatus = "empty" | "filled" | "valid" | "invalid";

export interface WizardFieldState {
  label: string;
  value: string;
  status: FieldStatus;
}

export interface WizardState {
  connectorName: string;
  connectorKind: "source" | "destination";
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
}

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
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}
