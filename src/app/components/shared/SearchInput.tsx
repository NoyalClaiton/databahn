import { Search, X } from "lucide-react";

/**
 * The icon-plus-input shape every search/filter bar in the app was hand
 * rolling separately (Search page, connector catalog, Reef's query bar).
 * One shared component means the clear button, once added, shows up
 * everywhere at once instead of three places to remember to update.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`w-full bg-background/60 border border-border rounded-lg pl-9 ${value ? "pr-9" : "pr-3"} py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground rounded-full p-0.5 hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
