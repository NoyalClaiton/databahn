import { useEffect, useRef } from "react";

/** Open overlays, newest last. Escape closes only the topmost, so a
 * confirmation over a drawer closes first, then the drawer. */
const stack: { current: () => void }[] = [];

function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape" || stack.length === 0) return;
  // A menu or dropdown inside the overlay handles its own Escape first.
  if (document.querySelector("[data-radix-popper-content-wrapper]")) return;
  e.stopPropagation();
  stack[stack.length - 1].current();
}

/** Every drawer, dialog and confirmation closes on Escape, the same way. */
export function useEscape(close: () => void, active = true) {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    if (!active) return;
    const entry = { current: () => ref.current() };
    // Capture phase: some rows stop key events from bubbling (so a key in
    // their menu doesn't open the row), which also hid Escape from here.
    if (stack.length === 0) window.addEventListener("keydown", onKey, true);
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0) window.removeEventListener("keydown", onKey, true);
    };
  }, [active]);
}
