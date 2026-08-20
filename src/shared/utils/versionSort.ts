/**
 * Version ordering helpers.
 *
 * Version lists are sorted newest-first. We prefer true semver precedence, but
 * not every application uses version strings that carry precedence at all, so we
 * fall back to numeric-aware alphabetical ordering whenever some entry in the list
 * cannot be parsed.
 */

import { rcompare } from 'semver';
import { toComparableVersion } from './versionPolicy.js';

/** Anything with a `version` string can be sorted. */
export interface HasVersion {
  version: string;
}

/**
 * Sort items by their `version` string, descending (newest first).
 *
 * - If every version is orderable under the shared version policy (strict semver,
 *   zero-padded CalVer, or a one-/two-part form), order by true semver precedence:
 *   `10.0.0` > `9.0.0`, `2025.10.0` > `2025.02.0`, and a release outranks its own
 *   pre-release so `10.2.1` > `10.2.1-rc.1`.
 * - Otherwise fall back to numeric-aware alphabetical ordering. Note this branch
 *   cannot rank a release above its pre-releases — alphabetically `1.0.0` is a
 *   prefix of `1.0.0-rc.1` — which is precisely why the policy above is wider than
 *   `semver.valid()`.
 *
 * Sorts in place and returns the same array for convenience.
 */
export function sortVersionsDescending<T extends HasVersion>(items: T[]): T[] {
  const comparable = new Map<string, string>();
  for (const item of items) {
    const c = toComparableVersion(item.version);
    if (c === null) {
      items.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
      return items;
    }
    comparable.set(item.version, c);
  }
  items.sort((a, b) => rcompare(comparable.get(a.version)!, comparable.get(b.version)!));
  return items;
}
