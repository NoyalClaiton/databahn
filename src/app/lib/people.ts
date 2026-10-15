/**
 * Who can own an alert. A small directory for the prototype; in the product
 * this is the workspace's users, grouped by the teams that own sources.
 * Team names match the owners in the sample environment, so a source's
 * owning team can be listed first when assigning.
 */
export interface Person {
  id: string;
  name: string;
  team: string;
}

/** The signed-in user. */
export const ME = "jrivera";

export const PEOPLE: Person[] = [
  { id: "jrivera", name: "J. Rivera", team: "Platform team" },
  { id: "rgarcia", name: "R. Garcia", team: "Platform team" },
  { id: "mchen", name: "M. Chen", team: "Network team" },
  { id: "spark", name: "S. Park", team: "Network team" },
  { id: "lnguyen", name: "L. Nguyen", team: "IAM team" },
  { id: "dokafor", name: "D. Okafor", team: "Endpoint team" },
  { id: "apatel", name: "A. Patel", team: "Cloud platform team" },
  { id: "kmori", name: "K. Mori", team: "Messaging team" },
];

export const personById = (id: string | undefined) => PEOPLE.find((p) => p.id === id);

export const initials = (name: string) =>
  name
    .replace(/\./g, "")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export type OwnerVia = "app" | "slack" | "teams";

/** Who owns an alert right now, resolved for display. */
export interface Owner {
  person: Person;
  at: number;
  via: OwnerVia;
  /** Set when someone else put them on it. */
  assignedBy?: Person;
  /** Set when they took it over from someone. */
  previous?: Person;
  isMe: boolean;
}

/** "You're on it" or "L. Nguyen is on it", for lists and badges. */
export const ownerLabel = (a: Owner) => (a.isMe ? "You're on it" : `${a.person.name} is on it`);
