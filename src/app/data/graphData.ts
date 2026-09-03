import type { ReefNode } from "@/app/components/shared/ReefGraph";

/**
 * A real investigation shape: a compromised identity, the addresses and
 * devices it touched, lateral movement into a domain controller, privilege
 * escalation, and the exfil destination. `targets` indices drive the DAG
 * layout, so the graph lays itself out left to right by longest path.
 *
 * `status` carries provenance and risk together:
 *   compromised → confirmed malicious
 *   detected    → suspicious, under investigation
 *   blocked     → benign / already stopped
 *   initial     → context only, unscored (cold storage, never hit the SIEM)
 */
export const REEF_NODES: ReefNode[] = [
  {
    label: "203.0.113.77",
    sublabel: "Sign-in IP, Singapore",
    phase: "Network",
    status: "detected",
    targets: [1],
    edgeMeta: { 1: { label: "signed in from", protocol: "HTTPS" } },
  },
  {
    label: "j.rivera@acme.com",
    sublabel: "User, 7 failed sign-ins",
    phase: "Identity",
    status: "compromised",
    targets: [2, 3, 6],
    edgeMeta: {
      2: { label: "signed in from" },
      3: { label: "authenticated on", protocol: "Kerberos" },
      6: { label: "added svc-backup to" },
    },
  },
  {
    label: "198.51.100.4",
    sublabel: "Source IP, flagged",
    phase: "Network",
    status: "detected",
    targets: [7],
    edgeMeta: { 7: { label: "connected to", protocol: "TCP" } },
  },
  {
    label: "LAPTOP-JR-04",
    sublabel: "Device, unmanaged",
    phase: "Endpoint",
    status: "compromised",
    targets: [4, 5],
    edgeMeta: {
      4: { label: "registered" },
      5: { label: "RDP session", protocol: "MS-RDP", dataSize: "31m" },
    },
  },
  {
    label: "svc-backup",
    sublabel: "Service account, off-hours",
    phase: "Identity",
    status: "initial",
    targets: [5],
    edgeMeta: { 5: { label: "authenticated to" } },
  },
  {
    label: "SRV-DC-03",
    sublabel: "Domain controller",
    phase: "Directory",
    status: "compromised",
    targets: [8],
    edgeMeta: { 8: { label: "transferred", protocol: "SSL", dataSize: "2.4 GB" } },
  },
  {
    label: "Domain Admins",
    sublabel: "Privileged group",
    phase: "Privilege",
    status: "compromised",
  },
  {
    label: "10.20.4.1",
    sublabel: "Internal IP, keepalives",
    phase: "Network",
    status: "initial",
  },
  {
    label: "198.51.100.9",
    sublabel: "Exfil destination",
    phase: "Data",
    status: "compromised",
  },
];

/** Maps a search result's entity to its index in REEF_NODES so
 * "Investigate in graph" can open focused on the right node. */
export const ENTITY_INDEX: Record<string, number> = {
  u1: 1,
  u2: 4,
  ip1: 2,
  ip2: 7,
  d1: 3,
};

/**
 * Every investigation was rendering the identical full 9-node graph, just
 * recentered on a different node, because `ReefGraph` was always handed the
 * whole static array regardless of what was actually being investigated.
 * This returns the neighborhood around one focus node instead, so different
 * starting points produce genuinely different node sets and layouts, not
 * just a different camera position on the same picture.
 *
 * `targets`/`edgeMeta` are absolute positions into REEF_NODES (confirmed by
 * tracing `layoutGraph`'s own index resolution), so slicing the array
 * without remapping would silently drop or misdraw edges, every surviving
 * reference gets rewritten to its new position in the filtered array.
 */
export function subgraphFrom(focusIndex: number | null, hops = 1): { nodes: ReefNode[]; focusIndex: number | null } {
  if (focusIndex === null || focusIndex < 0 || focusIndex >= REEF_NODES.length) {
    return { nodes: REEF_NODES, focusIndex };
  }

  const keep = new Set<number>([focusIndex]);
  let frontier = new Set<number>([focusIndex]);
  for (let h = 0; h < hops; h++) {
    const next = new Set<number>();
    for (const i of frontier) {
      for (const t of REEF_NODES[i].targets ?? []) next.add(t);
      REEF_NODES.forEach((n, j) => {
        if (n.targets?.includes(i)) next.add(j);
      });
    }
    next.forEach((i) => keep.add(i));
    frontier = next;
  }

  const kept = [...keep].sort((a, b) => a - b);
  const oldToNew = new Map(kept.map((old, idx) => [old, idx]));

  const nodes = kept.map((old) => {
    const n = REEF_NODES[old];
    return {
      ...n,
      targets: n.targets?.filter((t) => oldToNew.has(t)).map((t) => oldToNew.get(t)!),
      edgeMeta:
        n.edgeMeta &&
        Object.fromEntries(
          Object.entries(n.edgeMeta)
            .filter(([k]) => oldToNew.has(Number(k)))
            .map(([k, v]) => [oldToNew.get(Number(k))!, v]),
        ),
    };
  });

  return { nodes, focusIndex: oldToNew.get(focusIndex)! };
}
