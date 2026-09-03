import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DatabahnLogo } from "./DatabahnLogo";

const SESSION_KEY = "databahn-intro-played";

const TAGLINES = [
  "Connecting your security data.",
  "Cutting the noise before it costs you.",
  "No black boxes. No SME required.",
];

/**
 * A real arrival moment, not a form cold-open. Seeded from the reference
 * app's splash-screen phased reveal (logo glow-in, cycling micro-copy),
 * adapted for Databahn's real brand. Plays once per browser session, never
 * blocks: click, press any key, or wait it out.
 */
export function IntroSplash({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(false);
  const [taglineIndex, setTaglineIndex] = useState(0);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) onDone();
    else setVisible(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!visible) return;
    const cycle = setInterval(() => setTaglineIndex((i) => (i + 1) % TAGLINES.length), 1400);
    const auto = setTimeout(dismiss, 4600);
    const onKey = () => dismiss();
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(cycle);
      clearTimeout(auto);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function dismiss() {
    sessionStorage.setItem(SESSION_KEY, "1");
    setVisible(false);
    onDone();
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="intro"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          onClick={dismiss}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background cursor-pointer overflow-hidden"
        >
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2 }}
            style={{
              background:
                "radial-gradient(ellipse 900px 600px at 50% 45%, rgba(83, 217, 255, 0.14), transparent 65%)",
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            <motion.div
              className="absolute inset-0 blur-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.6, 0.35] }}
              transition={{ duration: 1.8, times: [0, 0.6, 1] }}
              style={{ background: "radial-gradient(ellipse, var(--db-cyan-light), transparent 70%)" }}
            />
            <DatabahnLogo height={40} />
          </motion.div>

          <div className="relative h-6 mt-8 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p
                key={taglineIndex}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35 }}
                className="text-sm text-muted-foreground font-mono-db"
              >
                {TAGLINES[taglineIndex]}
              </motion.p>
            </AnimatePresence>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2, duration: 0.6 }}
            className="absolute bottom-8 text-xs text-muted-foreground/60"
          >
            Click, or press any key, to continue
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
