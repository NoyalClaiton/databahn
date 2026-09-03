export interface SearchResult {
  id: string;
  summary: string;
  raw: string;
  parsed: Record<string, string>;
  /** The destination id that actually evaluated this event (matches a
   * connector id, whichever ones the user has connected), or "cold-storage"
   * if it was reduced before reaching any of them. Not a fixed set of named
   * vendors, "evaluated" has to hold for any destination, not just whichever
   * two happened to get hardcoded first. */
  provenance: string;
  source: string;
  timestamp: string;
  severity?: "critical" | "high" | "medium" | "low";
  /** Which Reef graph node this result centers on, so "Investigate in graph"
   * lands directly on the relevant entity instead of a blank prompt. */
  relatedEntityId: string;
}

export const MOCK_RESULTS: SearchResult[] = [
  {
    id: "1",
    summary: "Failed sign-in: j.rivera@acme.com from 198.51.100.4",
    raw: 'signInActivity: user="j.rivera@acme.com" status=failure ip=198.51.100.4 reason=badPassword attempts=7',
    parsed: { user: "j.rivera@acme.com", ip: "198.51.100.4", result: "failure", attempts: "7" },
    provenance: "sentinel",
    source: "Entra ID",
    timestamp: "14:22:08",
    severity: "high",
    relatedEntityId: "u1",
  },
  {
    id: "2",
    summary: "Threat blocked by Block-Known-Malware rule",
    raw: 'src=10.20.4.18 dst=198.51.100.9 action=alert rule="Block-Known-Malware" app=web-browsing',
    parsed: { src: "10.20.4.18", dst: "198.51.100.9", rule: "Block-Known-Malware", action: "alert" },
    provenance: "sentinel",
    source: "Palo Alto",
    timestamp: "14:19:51",
    severity: "critical",
    relatedEntityId: "ip1",
  },
  {
    id: "3",
    summary: "Impossible travel: sign-in from two regions in 4 minutes",
    raw: 'signInActivity: user="j.rivera@acme.com" ip=203.0.113.77 geo="Singapore" prevGeo="Austin, TX" delta=4m',
    parsed: { user: "j.rivera@acme.com", geo: "Singapore", prevGeo: "Austin, TX", delta: "4m" },
    provenance: "sentinel",
    source: "Entra ID",
    timestamp: "14:18:30",
    severity: "critical",
    relatedEntityId: "u1",
  },
  {
    id: "4",
    summary: "RDP session opened to SRV-DC-03",
    raw: 'src=10.20.4.18 dst=10.20.9.3 app=ms-rdp action=allow session=0x4f21 duration=1841s',
    parsed: { src: "10.20.4.18", dst: "10.20.9.3", app: "ms-rdp", action: "allow" },
    provenance: "exabeam",
    source: "Palo Alto",
    timestamp: "14:11:02",
    severity: "high",
    relatedEntityId: "d1",
  },
  {
    id: "5",
    summary: "Privileged group membership changed: Domain Admins",
    raw: 'auditLog: operation="Add member to group" group="Domain Admins" target="svc-backup" actor="j.rivera@acme.com"',
    parsed: { operation: "Add member", group: "Domain Admins", target: "svc-backup" },
    provenance: "sentinel",
    source: "Entra ID",
    timestamp: "14:08:44",
    severity: "critical",
    relatedEntityId: "u1",
  },
  {
    id: "6",
    summary: "Outbound transfer to unrecognized host, 2.4 GB",
    raw: 'src=10.20.9.3 dst=198.51.100.9 bytes=2411724800 app=ssl action=allow duration=612s',
    parsed: { src: "10.20.9.3", dst: "198.51.100.9", bytes: "2.4 GB", app: "ssl" },
    provenance: "splunk",
    source: "Palo Alto",
    timestamp: "14:02:19",
    severity: "critical",
    relatedEntityId: "ip1",
  },
  {
    id: "7",
    summary: "Duplicate keepalive burst on fw-edge-01",
    raw: "14:02:01 keepalive src=10.20.4.1 (39,998 duplicates suppressed)",
    parsed: { src: "10.20.4.1", type: "keepalive", suppressed: "39,998" },
    provenance: "cold-storage",
    source: "Palo Alto",
    timestamp: "14:02:01",
    relatedEntityId: "ip2",
  },
  {
    id: "8",
    summary: "DNS TXT query volume spike from 10.20.4.18",
    raw: 'src=10.20.4.18 query_type=TXT count=4127 window=300s entropy=0.91',
    parsed: { src: "10.20.4.18", query_type: "TXT", count: "4,127", entropy: "0.91" },
    provenance: "cold-storage",
    source: "Palo Alto",
    timestamp: "13:58:12",
    relatedEntityId: "d1",
  },
  {
    id: "9",
    summary: "Service account authenticated outside business hours",
    raw: 'signInActivity: user="svc-backup" status=success ip=10.20.9.3 hour=02 policy="off-hours"',
    parsed: { user: "svc-backup", result: "success", ip: "10.20.9.3", hour: "02" },
    provenance: "cold-storage",
    source: "Entra ID",
    timestamp: "02:14:37",
    relatedEntityId: "u2",
  },
  {
    id: "10",
    summary: "Debug-level health probe, endpoint /healthz",
    raw: "13:44:00 GET /healthz 200 debug_trace=full latency=2ms",
    parsed: { path: "/healthz", status: "200", latency: "2ms" },
    provenance: "cold-storage",
    source: "Palo Alto",
    timestamp: "13:44:00",
    relatedEntityId: "ip2",
  },
  {
    id: "11",
    summary: "MFA challenge satisfied for j.rivera@acme.com",
    raw: 'signInActivity: user="j.rivera@acme.com" mfa=satisfied method=authenticatorApp ip=198.51.100.4',
    parsed: { user: "j.rivera@acme.com", mfa: "satisfied", method: "authenticatorApp" },
    provenance: "sentinel",
    source: "Entra ID",
    timestamp: "14:22:31",
    severity: "medium",
    relatedEntityId: "u1",
  },
  {
    id: "12",
    summary: "New device registered to svc-backup",
    raw: 'auditLog: operation="Add device" device="LAPTOP-JR-04" owner="svc-backup" trust=unmanaged',
    parsed: { operation: "Add device", device: "LAPTOP-JR-04", trust: "unmanaged" },
    provenance: "splunk",
    source: "Entra ID",
    timestamp: "13:51:09",
    severity: "high",
    relatedEntityId: "d1",
  },
];
