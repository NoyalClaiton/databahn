import { useState } from "react";
import { createPortal } from "react-dom";
import { PauseCircle } from "lucide-react";
import { Input } from "@/app/components/ui/input";
import { useEscape } from "@/app/lib/useEscape";

const OPTIONS: { id: string; label: string; until: () => number }[] = [
  { id: "1h", label: "1 hour", until: () => Date.now() + 3600000 },
  { id: "4h", label: "4 hours", until: () => Date.now() + 4 * 3600000 },
  {
    id: "morning",
    label: "Until tomorrow 09:00",
    until: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d.getTime();
    },
  },
  { id: "manual", label: "Until I resume it", until: () => Number.MAX_SAFE_INTEGER },
];

/**
 * Pausing is a decision someone else will later have to understand, so it
 * asks for how long and why. Same frame as the app's other confirm dialogs
 * (disconnecting a source or a channel).
 */
export function PauseDialog({
  name,
  onCancel,
  onConfirm,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: (until: number, reason: string) => void;
}) {
  useEscape(onCancel);
  const [choice, setChoice] = useState("4h");
  const [reason, setReason] = useState("");
  // Portalled, so it centres on the window wherever it's opened from.
  return createPortal(
    <div className="fixed inset-0 z-[110] bg-background/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-lg border border-border glass-card p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
      >
        <p id="pause-title" className="text-sm font-medium text-foreground flex items-center gap-2">
          <PauseCircle className="w-4 h-4 text-muted-foreground" aria-hidden="true" /> Pause alerts for {name}
        </p>
        <p className="text-xs text-muted-foreground mt-1.5">
          Databahn keeps collecting whatever arrives, it just won't alert. Monitoring resumes on its own when the pause ends.
        </p>

        <fieldset className="mt-4 space-y-1.5">
          <legend className="text-xs text-foreground mb-1.5">For how long</legend>
          {OPTIONS.map((o) => (
            <label
              key={o.id}
              className={`flex items-center gap-2.5 rounded border px-3 py-2 text-sm cursor-pointer transition-colors ${
                choice === o.id ? "border-primary/60 bg-primary/10 text-foreground" : "border-border text-foreground/85 hover:bg-muted/15"
              }`}
            >
              <input type="radio" name="pause-for" checked={choice === o.id} onChange={() => setChoice(o.id)} className="accent-[var(--db-blue)]" />
              {o.label}
            </label>
          ))}
        </fieldset>

        <label className="block mt-4">
          <span className="text-xs text-foreground">
            Reason <span className="text-muted-foreground">(optional, shown to your team)</span>
          </span>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Firewall upgrade" className="mt-1.5" />
        </label>

        <div className="flex items-center justify-end gap-3 mt-5">
          <button
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            onClick={onCancel}
            className="text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-2 py-1"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(OPTIONS.find((o) => o.id === choice)!.until(), reason)}
            className="text-sm rounded-full px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Pause alerts
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
