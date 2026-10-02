/**
 * A small version-range check for the forms `paseo-plugin.json` uses (`>=0.10.1 <0.11.0`): comparators
 * `>=`, `>`, `<=`, `<` and `=` (or none) on `major.minor.patch`, joined by spaces, all of which must hold.
 * The standard library has no semver, and setup takes no npm dependency (T7).
 */

/** The first `major.minor.patch` in `text`, as three numbers; null when it has none. */
export function parseVersion(text) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(String(text));
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compare(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

/** Whether `version` holds every comparator of `range`; false for a version or a comparator it cannot read. */
export function inRange(version, range) {
  const have = parseVersion(version);
  if (have === null) return false;
  const parts = String(range).trim().split(/\s+/).filter((part) => part !== "");
  if (parts.length === 0) return false;
  return parts.every((part) => {
    const match = /^(>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/.exec(part);
    if (match === null) return false;
    const order = compare(have, parseVersion(match[2]));
    switch (match[1] ?? "=") {
      case ">=":
        return order >= 0;
      case ">":
        return order > 0;
      case "<=":
        return order <= 0;
      case "<":
        return order < 0;
      default:
        return order === 0;
    }
  });
}
