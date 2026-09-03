import { useNavigate } from "react-router";
import { Archive } from "lucide-react";
import { useSession } from "@/app/lib/SessionContext";

/**
 * Shown once a destination is connected, the moment a customer has a real
 * SIEM to compare against and "what happens to what gets filtered out" stops
 * being an abstract question. Without this, cold storage was only
 * discoverable by noticing an amber row on the Pipeline page later, nothing
 * in the onboarding path itself ever raised it. Self-hides once at least one
 * target exists, this is a one-time nudge, not a standing reminder.
 */
export function ColdStorageNudge({ withDivider }: { withDivider?: boolean }) {
  const navigate = useNavigate();
  const { coldStorageTargets } = useSession();
  if (coldStorageTargets.length > 0) return null;

  return (
    <>
      {/* Lives inside the component, not the caller, so it vanishes with
          the button on the same condition, a caller-side divider would
          otherwise dangle in front of nothing once a target exists. */}
      {withDivider && <span className="text-border" aria-hidden="true">|</span>}
      <button
        onClick={() => navigate("/pipeline", { state: { openColdStorage: true } })}
        className="text-sm text-amber-300 hover:text-amber-200 underline underline-offset-2 inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        <Archive className="w-3.5 h-3.5" aria-hidden="true" />
        Also connect cold storage
      </button>
    </>
  );
}
