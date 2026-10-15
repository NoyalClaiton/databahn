import { User } from "lucide-react";
import { initials, ME, type Owner } from "@/app/lib/people";
import { fmtDuration } from "@/app/lib/environment";
import { ContextualHelpTip } from "./ContextualHelpTip";

const VIA = { app: "", slack: " via Slack", teams: " via Teams" } as const;

export function ownerTooltip(a?: Owner) {
  if (!a) return "Unassigned";
  return `${a.isMe ? "You're" : `${a.person.name} is`} on it · ${fmtDuration((Date.now() - a.at) / 60000)}${VIA[a.via]}`;
}

/**
 * Who's handling an alert, as one small mark at the row's edge rather than a
 * coloured sentence in the middle of it. Neutral for everyone, a thin ring
 * for you, an empty dashed circle when nobody has it, so in a list the gaps
 * stand out without spending any colour. The name is on hover.
 */
export function OwnerAvatar({ assignee, size = 22, tooltip = true }: { assignee?: Owner; size?: number; tooltip?: boolean }) {
  const mark = assignee ? (
    <span
      className={`rounded-full bg-muted/50 text-foreground/85 font-semibold flex items-center justify-center shrink-0 ${
        assignee.person.id === ME ? "ring-1 ring-primary ring-offset-1 ring-offset-card" : ""
      }`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-label={ownerTooltip(assignee)}
    >
      {initials(assignee.person.name)}
    </span>
  ) : (
    <span
      className="rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground/50 flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      aria-label="Unassigned"
    >
      <User style={{ width: size * 0.5, height: size * 0.5 }} aria-hidden="true" />
    </span>
  );
  return tooltip ? <ContextualHelpTip content={ownerTooltip(assignee)}>{mark}</ContextualHelpTip> : mark;
}
