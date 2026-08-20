/**
 * Version-string policy — the single definition of what counts as an orderable
 * version, and of which of two versions is newer.
 *
 * Plain `semver.valid()` is too narrow for the versions BinDist actually stores.
 * It rejects zero-padded CalVer (`2025.01.0`), which is a deliberate style rather
 * than a mistake, and the one- and two-part forms (`2`, `2.5`) that vendors write.
 * Since a list is only sorted by precedence when *every* entry parses, one such
 * version used to drag the whole list into alphabetical ordering — where a release
 * sorts below its own release candidates, because `1.0.0` is a byte-prefix of
 * `1.0.0-rc.1`.
 *
 * So the rule is: strict semver, plus zero-padded numeric segments, plus missing
 * trailing segments. Keep it in one place: consumers that validate or order version
 * strings should call this rather than reaching for `semver.valid()` themselves, so
 * a version that sorts here cannot be rejected somewhere else.
 */

import { valid as validSemver } from 'semver';

/** Matches the `semver` package's own MAX_SAFE_COMPONENT_LENGTH. */
const SEGMENT_WIDTH = 16;
const PARTIAL_RE = new RegExp(`^(\\d{1,${SEGMENT_WIDTH}})(?:\\.(\\d{1,${SEGMENT_WIDTH}}))?$`);

/**
 * Rewrite a version into the strict-semver spelling that carries the same
 * precedence, or return null when the string is not an orderable version at all
 * (`nightly`, `build-17`, `2.3.x`).
 *
 * Normalization is precedence-preserving only — the caller keeps the vendor's
 * original string for display:
 *   `v2.5.0` → `2.5.0`       (a leading v is decoration)
 *   `2025.01.0` → `2025.1.0` (leading zeros carry no value)
 *   `2.5` → `2.5.0`          (missing segments are zero)
 */
export function toComparableVersion(version: string): string | null {
  const trimmed = String(version ?? '')
    .trim()
    .replace(/^v(?=\d)/i, '');
  if (!trimmed) return null;

  // De-pad the numeric core only. A leading zero after the first '-' belongs to a
  // prerelease identifier: legal when alphanumeric, and illegal when numeric
  // (`-rc.01`), which stays rejected — as the semver spec requires.
  const dash = trimmed.indexOf('-');
  const core = dash === -1 ? trimmed : trimmed.slice(0, dash);
  const depadded = core.replace(/(^|\.)0+(\d)/g, '$1$2') + (dash === -1 ? '' : trimmed.slice(dash));

  const strict = validSemver(depadded);
  if (strict) return strict;

  const partial = depadded.match(PARTIAL_RE);
  if (partial) return `${Number(partial[1])}.${Number(partial[2] ?? 0)}.0`;

  return null;
}

/** Whether a version string is orderable under the policy above. */
export function isOrderableVersion(version: string): boolean {
  return toComparableVersion(version) !== null;
}
