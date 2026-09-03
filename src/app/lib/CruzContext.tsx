import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface CruzMessage {
  id: string;
  role: "user" | "cruz";
  text: string;
}

interface CruzContextValue {
  isOpen: boolean;
  isTyping: boolean;
  messages: CruzMessage[];
  open: (seedQuestion?: string) => void;
  close: () => void;
  send: (text: string) => void;
  pushProactive: (text: string) => void;
}

const CruzContext = createContext<CruzContextValue | null>(null);

let idCounter = 0;
const nextId = () => `msg-${++idCounter}`;

/**
 * Lets any field/step anywhere in the app open Cruz pre-seeded with exactly
 * what the user was looking at (principle 2b), no prop drilling required.
 * The actual "intelligence" (`respond`) is a simulated rule-based responder,
 * appropriate for a design prototype: the point being demonstrated is the
 * interaction pattern (globally reachable, context-seeded, proactive), not a
 * production AI backend.
 */
export function CruzProvider({
  children,
  respond,
}: {
  children: ReactNode;
  respond: (userText: string) => string;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<CruzMessage[]>([
    { id: nextId(), role: "cruz", text: "Hi, I'm Cruz. Ask me anything about this step, or I'll jump in if I notice you're stuck." },
  ]);

  const open = useCallback(
    (seedQuestion?: string) => {
      setIsOpen(true);
      if (seedQuestion) {
        setMessages((prev) => [...prev, { id: nextId(), role: "user", text: seedQuestion }]);
        setIsTyping(true);
        setTimeout(() => {
          setIsTyping(false);
          setMessages((prev) => [...prev, { id: nextId(), role: "cruz", text: respond(seedQuestion) }]);
        }, 750);
      }
    },
    [respond],
  );

  const close = useCallback(() => setIsOpen(false), []);

  const send = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      setMessages((prev) => [...prev, { id: nextId(), role: "user", text }]);
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages((prev) => [...prev, { id: nextId(), role: "cruz", text: respond(text) }]);
      }, 800);
    },
    [respond],
  );

  const pushProactive = useCallback((text: string) => {
    setMessages((prev) => {
      if (prev.some((m) => m.text === text)) return prev;
      return [...prev, { id: nextId(), role: "cruz", text }];
    });
    setIsOpen((prevOpen) => prevOpen);
  }, []);

  const value = useMemo(
    () => ({ isOpen, isTyping, messages, open, close, send, pushProactive }),
    [isOpen, isTyping, messages, open, close, send, pushProactive],
  );

  return <CruzContext.Provider value={value}>{children}</CruzContext.Provider>;
}

export function useCruz() {
  const ctx = useContext(CruzContext);
  if (!ctx) throw new Error("useCruz must be used within a CruzProvider");
  return ctx;
}
