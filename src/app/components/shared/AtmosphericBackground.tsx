import { useMemo } from "react";
import { AmbientNetworkBackground } from "./AmbientNetworkBackground";

function hexPath(cx: number, cy: number, r: number) {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  });
  return `M ${pts.join(" L ")} Z`;
}

/**
 * The layered depth the flat background was missing. Composition mirrors the
 * reference app: a multi-stop diagonal gradient base (not a flat fill, that's
 * what read as cheap), radial brand washes, a faint hex lattice, concentric
 * dashed rings, a vignette to focus the center, and corner brackets. The live
 * particle network sits on top of all of it.
 */
export function AtmosphericBackground() {
  const hexes = useMemo(() => {
    const out: { cx: number; cy: number }[] = [];
    const stepX = 8.6;
    const stepY = 7.5;
    for (let row = 0; row * stepY < 108; row++) {
      for (let col = 0; col * stepX < 108; col++) {
        out.push({ cx: col * stepX + (row % 2 ? stepX / 2 : 0), cy: row * stepY });
      }
    }
    return out;
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {/* multi-stop diagonal base + brand washes */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 70% 50% at 50% 12%, rgba(74,148,249,0.10) 0%, transparent 60%),
            radial-gradient(ellipse 45% 45% at 88% 78%, rgba(15,180,186,0.06) 0%, transparent 55%),
            linear-gradient(170deg, #050a12 0%, #0a1220 22%, #0e1a2e 44%, #0c1626 64%, #081020 82%, #050a12 100%)
          `,
        }}
      />
      {/* hex lattice + concentric rings */}
      <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {hexes.map((h, i) => (
          <path key={i} d={hexPath(h.cx, h.cy, 2.5)} fill="none" stroke="rgba(83,217,255,0.035)" strokeWidth="0.08" />
        ))}
        {[18, 32, 46].map((r, i) => (
          <circle
            key={`ring-${i}`}
            cx="50"
            cy="44"
            r={r}
            fill="none"
            stroke="rgba(74,148,249,0.035)"
            strokeWidth="0.06"
            strokeDasharray="1 2.5"
          />
        ))}
      </svg>
      {/* vignette */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 62% 52% at 50% 42%, transparent 28%, rgba(3,6,12,0.55) 100%)" }}
      />
      {/* live particle mesh */}
      <AmbientNetworkBackground />
      {/* corner brackets */}
      <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M 2 8 L 2 2 L 8 2" fill="none" stroke="rgba(83,217,255,0.10)" strokeWidth="0.1" />
        <path d="M 92 2 L 98 2 L 98 8" fill="none" stroke="rgba(83,217,255,0.10)" strokeWidth="0.1" />
        <path d="M 2 92 L 2 98 L 8 98" fill="none" stroke="rgba(83,217,255,0.10)" strokeWidth="0.1" />
        <path d="M 92 98 L 98 98 L 98 92" fill="none" stroke="rgba(83,217,255,0.10)" strokeWidth="0.1" />
      </svg>
    </div>
  );
}
