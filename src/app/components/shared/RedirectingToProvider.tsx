import { useEffect } from "react";
import { motion } from "motion/react";
import { ExternalLink } from "lucide-react";

const REDIRECT_MS = 1200;

/**
 * "Sign in with Microsoft" can't trigger a real OAuth redirect here, there's
 * no backend or app registration behind this prototype to hand a token back
 * to. But silently jumping straight to a Databahn-styled "review access"
 * screen misrepresents whose screen that actually is in the real product,
 * Microsoft's, not ours. This beat sells the handoff instead of hiding it,
 * then auto-advances once it's played out.
 */
export function RedirectingToProvider({ provider, onDone }: { provider: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, REDIRECT_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="flex flex-col items-center justify-center text-center h-full py-10">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="w-8 h-8 rounded-full border-2 border-muted-foreground/25 border-t-primary mb-4"
        aria-hidden="true"
      />
      <p className="text-sm text-foreground font-medium inline-flex items-center gap-1.5">
        Redirecting to {provider}
        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
      </p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        You're leaving Databahn to sign in and approve access on {provider}'s own page.
      </p>
    </div>
  );
}
