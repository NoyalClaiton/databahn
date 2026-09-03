import { HelpCircle } from "lucide-react";
import type { ReactNode } from "react";
import { ContextualHelpTip } from "./ContextualHelpTip";
import { AskCruzButton } from "./CruzAssistant";

/** One consistent field pattern (Nielsen #4) reused across every connector's
 * config step: label + tier-1 static hint + tier-2 "Ask Cruz" escalation. */
export function FieldRow({
  label,
  hint,
  askCruzQuestion,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  askCruzQuestion?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor={htmlFor} className="text-sm font-medium text-foreground flex items-center gap-1.5">
          {label}
          {hint && (
            <ContextualHelpTip content={hint}>
              <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            </ContextualHelpTip>
          )}
        </label>
        {askCruzQuestion && <AskCruzButton question={askCruzQuestion} />}
      </div>
      {children}
    </div>
  );
}
