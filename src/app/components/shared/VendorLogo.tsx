import awsSvg from "@/assets/logos/aws.svg?raw";
import azureblobSvg from "@/assets/logos/azure-blob.svg?raw";
import boxSvg from "@/assets/logos/box.svg?raw";
import ciscoSvg from "@/assets/logos/cisco.svg?raw";
import ciscoasaSvg from "@/assets/logos/ciscoasa.svg?raw";
import clickhouseSvg from "@/assets/logos/clickhouse.svg?raw";
import cloudflareSvg from "@/assets/logos/cloudflare.svg?raw";
import databricksSvg from "@/assets/logos/databricks.svg?raw";
import datadogSvg from "@/assets/logos/datadog.svg?raw";
import duoSvg from "@/assets/logos/duo.svg?raw";
import elasticSvg from "@/assets/logos/elastic.svg?raw";
import fortinetSvg from "@/assets/logos/fortinet.svg?raw";
import githubSvg from "@/assets/logos/github.svg?raw";
import googlecloudSvg from "@/assets/logos/googlecloud.svg?raw";
import ibmSvg from "@/assets/logos/ibm.svg?raw";
import kafkaSvg from "@/assets/logos/kafka.svg?raw";
import kubernetesSvg from "@/assets/logos/kubernetes.svg?raw";
import linuxauditdSvg from "@/assets/logos/linux-auditd.svg?raw";
import microsoftSvg from "@/assets/logos/microsoft.svg?raw";
import newrelicSvg from "@/assets/logos/newrelic.svg?raw";
import oktaSvg from "@/assets/logos/okta.svg?raw";
import paloaltoSvg from "@/assets/logos/paloalto.svg?raw";
import qualysSvg from "@/assets/logos/qualys.svg?raw";
import s3Svg from "@/assets/logos/s3.svg?raw";
import salesforceSvg from "@/assets/logos/salesforce.svg?raw";
import securitylakeSvg from "@/assets/logos/security-lake.svg?raw";
import snowflakeSvg from "@/assets/logos/snowflake.svg?raw";
import splunkSvg from "@/assets/logos/splunk.svg?raw";
import sumologicSvg from "@/assets/logos/sumologic.svg?raw";
import umbrellaSvg from "@/assets/logos/umbrella.svg?raw";
import windowseventsSvg from "@/assets/logos/windows-events.svg?raw";

/**
 * Real vendor marks (Simple Icons, an open-source brand icon library) wherever
 * one exists. Connectors without an open-source mark fall back to a branded
 * monogram rather than a grey placeholder, so nothing on screen reads as
 * unfinished. Paths carry no fill of their own, so `fill="currentColor"` on the
 * root cascades and each usage recolours via CSS `color`.
 */
const LOGO_BY_CONNECTOR: Record<string, string> = {
  "aws": awsSvg,
  "aws-cloudtrail": awsSvg,
  "azure-blob": azureblobSvg,
  "box": boxSvg,
  "cisco": ciscoSvg,
  "ciscoasa": ciscoasaSvg,
  "clickhouse": clickhouseSvg,
  "cloudflare": cloudflareSvg,
  "databricks": databricksSvg,
  "datadog": datadogSvg,
  "defender": microsoftSvg,
  "duo": duoSvg,
  "elastic": elasticSvg,
  "entraid": microsoftSvg,
  "fortinet": fortinetSvg,
  "gcp-audit": googlecloudSvg,
  "github": githubSvg,
  "google-secops": googlecloudSvg,
  "googlecloud": googlecloudSvg,
  "ibm": ibmSvg,
  "kafka": kafkaSvg,
  "kubernetes": kubernetesSvg,
  "linux-auditd": linuxauditdSvg,
  "microsoft": microsoftSvg,
  "newrelic": newrelicSvg,
  "okta": oktaSvg,
  "paloalto": paloaltoSvg,
  "qradar": ibmSvg,
  "qualys": qualysSvg,
  "s3": s3Svg,
  "salesforce": salesforceSvg,
  "security-lake": securitylakeSvg,
  "sentinel": microsoftSvg,
  "snowflake": snowflakeSvg,
  "splunk": splunkSvg,
  "sumologic": sumologicSvg,
  "umbrella": umbrellaSvg,
  "windows-events": windowseventsSvg,
};

function withCurrentColor(svg: string) {
  return svg.replace("<svg ", '<svg fill="currentColor" ');
}

function hexToRgb(hex: string) {
  const n = hex.replace("#", "");
  return { r: parseInt(n.slice(0, 2), 16), g: parseInt(n.slice(2, 4), 16), b: parseInt(n.slice(4, 6), 16) };
}

function rgbToHex(r: number, g: number, b: number) {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }) {
  const chan = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const WHITE = { r: 255, g: 255, b: 255 };

/**
 * Every connector chip is a fixed white box (`bg-white`), so its icon or
 * initials-fallback text is only ever legible if the brand color itself
 * happens to be dark enough. Several real brand colors (bright yellows,
 * light teals) fail WCAG AA against white outright, which read as washed-out
 * icons or barely-visible initials. This darkens a color just enough to
 * clear 4.5:1 against white, leaving already-safe colors untouched so real
 * brand color still shows everywhere else (ribbons, borders, glows).
 */
export function chipSafeColor(hex: string): string {
  let { r, g, b } = hexToRgb(hex);
  let steps = 0;
  while (contrastRatio({ r, g, b }, WHITE) < 4.5 && steps < 30) {
    r -= 10;
    g -= 10;
    b -= 10;
    steps++;
  }
  return rgbToHex(r, g, b);
}

export function hasVendorLogo(connectorId: string) {
  return connectorId in LOGO_BY_CONNECTOR;
}

/** Extracts raw path data so a logo can be drawn inside a parent <svg> (the
 * Sankey), where an <img> or nested markup would not compose. Simple Icons
 * marks are 24x24, so callers scale by size/24. */
export function getVendorLogoPaths(connectorId: string): string[] {
  const svg = LOGO_BY_CONNECTOR[connectorId];
  if (!svg) return [];
  return Array.from(svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)).map((m) => m[1]);
}

export function VendorLogo({ connectorId, size = 20 }: { connectorId: string; size?: number }) {
  const svg = LOGO_BY_CONNECTOR[connectorId];
  if (!svg) return null;
  return (
    <span
      style={{ width: size, height: size, display: "inline-block" }}
      dangerouslySetInnerHTML={{ __html: withCurrentColor(svg) }}
    />
  );
}
