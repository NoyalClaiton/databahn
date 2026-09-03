import { useState, useRef, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Tier 1 ambient guidance (see plan principle 2b), a static, portal-rendered
 * hover tooltip. Positioning logic adapted from the reference app's HoverTooltip:
 * prefers above the trigger, flips below if there isn't room, clamps to viewport.
 */
export function ContextualHelpTip({
  children,
  content,
  maxWidth = 280,
  placement = "vertical",
  triggerClassName = "inline-flex",
}: {
  children: ReactNode;
  content: ReactNode;
  maxWidth?: number;
  /** "vertical" prefers above the trigger, flipping below if there isn't
   * room, this is what every existing caller wants. "right" is for a
   * narrow, tightly-stacked column like the collapsed nav rail, where
   * above/below would collide with the next item instead of clearing it. */
  placement?: "vertical" | "right";
  /** Every existing caller wraps an inline trigger (a badge, an icon), this
   * default fits that. A full-width nav row needs the wrapper to stretch
   * with it instead, or the tooltip's own hover/click target and the row's
   * visible width quietly stop matching. */
  triggerClassName?: string;
}) {
  const [show, setShow] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; arrowDir: "down" | "up" | "left" }>({
    top: 0,
    left: 0,
    arrowDir: "down",
  });

  useEffect(() => {
    if (!show || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const pad = 12;
    if (placement === "right") {
      setPos({ top: rect.top + rect.height / 2, left: rect.right + pad, arrowDir: "left" });
      return;
    }
    const fitsAbove = rect.top > 80;
    const top = fitsAbove ? rect.top - pad : rect.bottom + pad;
    let left = rect.left + rect.width / 2;
    const half = maxWidth / 2;
    if (left - half < 8) left = 8 + half;
    if (left + half > window.innerWidth - 8) left = window.innerWidth - 8 - half;
    setPos({ top, left, arrowDir: fitsAbove ? "down" : "up" });
  }, [show, maxWidth, placement]);

  return (
    // A span, not a div: several callers place this inside a <p> (an eps
    // figure with a hoverable unit label, say), and a div there is invalid
    // HTML, a span is phrasing content and renders identically since
    // display is fully controlled by triggerClassName either way.
    <span
      ref={triggerRef}
      className={triggerClassName}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show &&
        createPortal(
          pos.arrowDir === "left" ? (
            <div
              className="fixed z-[9999] pointer-events-none flex items-center"
              style={{ top: pos.top, left: pos.left, transform: "translate(0, -50%)", maxWidth }}
              role="tooltip"
            >
              <div
                className="w-2 h-2 rotate-45 ml-[-5px] bg-popover border border-border shrink-0"
                style={{ borderTop: "none", borderRight: "none" }}
              />
              <div className="px-3 py-2.5 rounded-lg bg-popover border border-border shadow-2xl text-xs text-foreground/85 leading-relaxed whitespace-nowrap">
                {content}
              </div>
            </div>
          ) : (
            <div
              className="fixed z-[9999] pointer-events-none"
              style={{
                top: pos.top,
                left: pos.left,
                transform: pos.arrowDir === "down" ? "translate(-50%, -100%)" : "translate(-50%, 0)",
                maxWidth,
              }}
              role="tooltip"
            >
              {pos.arrowDir === "up" && (
                <div
                  className="w-2 h-2 rotate-45 mx-auto mb-[-5px] bg-popover border border-border"
                  style={{ borderBottom: "none", borderRight: "none" }}
                />
              )}
              <div className="px-3 py-2.5 rounded-lg bg-popover border border-border shadow-2xl text-xs text-foreground/85 leading-relaxed">
                {content}
              </div>
              {pos.arrowDir === "down" && (
                <div
                  className="w-2 h-2 rotate-45 mx-auto mt-[-5px] bg-popover border border-border"
                  style={{ borderTop: "none", borderLeft: "none" }}
                />
              )}
            </div>
          ),
          document.body,
        )}
    </span>
  );
}
