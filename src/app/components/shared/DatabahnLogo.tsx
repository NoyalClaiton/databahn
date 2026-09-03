import logo from "@/assets/databahn-logo.avif";

/** Databahn's real logo (the dark-background variant, pulled from databahn.ai),
 * not a placeholder mark. */
export function DatabahnLogo({ height = 20 }: { height?: number }) {
  return <img src={logo} alt="Databahn" style={{ height }} />;
}
