/** Words that carry no search meaning on their own. */
const STOP = new Set(
  "show me everything all any the a an from in on at to of for with and or over under last past what which who where when how did does is are was were this that these those connected path reached touched find get list events event log logs".split(" "),
);

/** The meaningful terms of a free-text query, singularised loosely. */
export function queryTerms(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[\s,;:"'()]+/)
    .map((t) => t.replace(/[?.!]+$/, ""))
    .filter((t) => t.length >= 3 && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t));
}

/** True when any meaningful term appears in the text. A query with no
 * meaningful terms matches nothing. */
export function matchesQuery(q: string, text: string): boolean {
  const terms = queryTerms(q);
  if (terms.length === 0) return false;
  const hay = text.toLowerCase();
  return terms.some((t) => hay.includes(t));
}
