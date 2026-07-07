/**
 * Version ordering helpers.
 *
 * Version lists are sorted newest-first. We prefer true semver precedence, but
 * not every application uses semver-shaped version strings, so we fall back to
 * numeric-aware alphabetical ordering whenever the list isn't entirely valid
 * semver.
 */

import { rcompare, valid as validSemver } from 'semver';

/** Anything with a `version` string can be sorted. */
export interface HasVersion {
  version: string;
}

/**
 * Sort items by their `version` string, descending (newest first).
 *
 * - If every version is valid semver, order by semver precedence
 *   (e.g. `10.0.0` > `9.0.0`, and a release outranks its pre-release such that
 *   `10.2.1` > `10.2.1-rc.1`).
 * - Otherwise fall back to numeric-aware alphabetical ordering.
 *
 * Sorts in place and returns the same array for convenience.
 */
export function sortVersionsDescending<T extends HasVersion>(items: T[]): T[] {
  const allSemver = items.every((item) => validSemver(item.version) !== null);
  if (allSemver) {
    items.sort((a, b) => rcompare(a.version, b.version));
  } else {
    items.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  }
  return items;
}
