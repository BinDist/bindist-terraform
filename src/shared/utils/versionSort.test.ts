/**
 * Tests for sortVersionsDescending — the ordering behind
 * GET /v1/applications/{id}/versions.
 *
 * The contract has two branches:
 *   - all-semver lists sort by true semver precedence (so 10.0.0 > 9.0.0, and a
 *     release outranks its own pre-release), newest first;
 *   - any non-semver entry drops the whole list to numeric-aware alphabetical
 *     ordering, so a mixed list still comes back in a stable, sensible order.
 *
 * Helper builds the minimal `{ version }` shape the function accepts; each case
 * asserts the resulting version order.
 */

import { describe, test, expect } from 'vitest';
import { sortVersionsDescending } from './versionSort.js';

const order = (versions: string[]): string[] =>
  sortVersionsDescending(versions.map((version) => ({ version }))).map((v) => v.version);

describe('sortVersionsDescending', () => {
  describe('all valid semver → semver precedence', () => {
    test('orders by numeric precedence, not string comparison', () => {
      // The whole point: alphabetically "10.0.0" < "9.0.0", but 10 > 9.
      expect(order(['1.0.0', '9.0.0', '10.0.0', '10.2.1'])).toEqual([
        '10.2.1',
        '10.0.0',
        '9.0.0',
        '1.0.0',
      ]);
    });

    test('a release outranks its own pre-release', () => {
      expect(order(['10.2.1-rc.1', '10.2.1', '10.2.1-alpha'])).toEqual([
        '10.2.1',
        '10.2.1-rc.1',
        '10.2.1-alpha',
      ]);
    });

    test('accepts a leading v prefix', () => {
      expect(order(['v1.0.0', 'v2.0.0', 'v1.5.0'])).toEqual(['v2.0.0', 'v1.5.0', 'v1.0.0']);
    });

    test('CalVer (padded or not) sorts newest-first', () => {
      // Zero-padded segments are not strict semver, but they carry precedence, so
      // the policy parses them rather than dropping the list to alphabetical.
      expect(order(['2025.02', '2024.12', '2025.10', '2025.01'])).toEqual([
        '2025.10',
        '2025.02',
        '2025.01',
        '2024.12',
      ]);
      expect(order(['2025.01.0', '2025.10.0', '2024.12.0'])).toEqual([
        '2025.10.0',
        '2025.01.0',
        '2024.12.0',
      ]);
    });

    test('a padded CalVer release outranks its own pre-release', () => {
      // The regression this policy exists to fix: alphabetically "2025.01.0" is a
      // prefix of "2025.01.0-rc.1", so the fallback ranked the shipped release last.
      expect(order(['2025.01.0', '2025.01.0-rc.1', '2025.01.0-rc.2'])).toEqual([
        '2025.01.0',
        '2025.01.0-rc.2',
        '2025.01.0-rc.1',
      ]);
    });

    test('mixed spellings of one version stay adjacent', () => {
      // 2025.01.0 and 2025.1.0 are the same version; either order between them is
      // fine, but both must outrank 2025.0.9.
      expect(order(['2025.1.0', '2025.0.9', '2025.01.0']).slice(-1)).toEqual(['2025.0.9']);
    });
  });

  describe('any non-semver entry → numeric-aware alphabetical fallback', () => {
    test('falls back when one entry carries no version precedence', () => {
      expect(order(['1.0.0', 'nightly', '2.0.0'])).toEqual(['nightly', '2.0.0', '1.0.0']);
    });

    test('fallback is numeric-aware for non-semver numbered builds', () => {
      // Two-segment strings are not valid semver, so this exercises the
      // localeCompare branch — which still orders 10 above 9.
      expect(order(['build-9', 'build-10', 'build-1'])).toEqual([
        'build-10',
        'build-9',
        'build-1',
      ]);
    });

  });

  describe('edge cases', () => {
    test('empty list stays empty', () => {
      expect(order([])).toEqual([]);
    });

    test('single version is returned unchanged', () => {
      expect(order(['1.2.3'])).toEqual(['1.2.3']);
    });

    test('sorts in place and returns the same array reference', () => {
      const items = [{ version: '1.0.0' }, { version: '2.0.0' }];
      const result = sortVersionsDescending(items);
      expect(result).toBe(items);
      expect(result.map((v) => v.version)).toEqual(['2.0.0', '1.0.0']);
    });
  });
});
