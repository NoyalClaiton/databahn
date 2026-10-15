import { CHANNEL_TYPES, type ChannelType } from "@/app/lib/notifications";
import { chipSafeColor } from "./VendorLogo";

/** A notification channel's mark, in the exact fallback shape the connector
 * catalog uses for a vendor without a logo (CrowdStrike, Exabeam): brand
 * initials on a white chip, so channels sit in the same visual family. */
export function ChannelMonogram({ type, size = 44 }: { type: ChannelType; size?: number }) {
  const def = CHANNEL_TYPES[type];
  return (
    <span
      className={`${size >= 36 ? "rounded-lg" : "rounded"} bg-white flex items-center justify-center font-bold shrink-0`}
      style={{
        width: size,
        height: size,
        color: chipSafeColor(def.color),
        fontSize: Math.max(8, size * 0.27),
        boxShadow: size >= 36 ? `0 6px 20px -6px ${def.color}99` : undefined,
      }}
      aria-hidden="true"
    >
      {def.monogram}
    </span>
  );
}
