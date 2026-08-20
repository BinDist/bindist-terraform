/**
 * Tests for the version-string policy — what BinDist treats as an orderable
 * version, and the strict-semver spelling it compares as.
 *
 * The cases below are the contract: anything accepted here has a well-defined
 * position in a version ordering, and anything rejected has none.
 */

import { describe, test, expect } from 'vitest';
import { toComparableVersion, isOrderableVersion } from './versionPolicy.js';

describe('toComparableVersion', () => {
  test('passes strict semver through unchanged', () => {
    expect(toComparableVersion('2.5.0')).toBe('2.5.0');
    expect(toComparableVersion('2.5.0-rc.1')).toBe('2.5.0-rc.1');
    expect(toComparableVersion('1000.0.0')).toBe('1000.0.0');
  });

  test('strips decoration that carries no precedence', () => {
    expect(toComparableVersion('v2.5.0')).toBe('2.5.0');
    expect(toComparableVersion('  2.5.0  ')).toBe('2.5.0');
    expect(toComparableVersion('2.5.0+ci.42')).toBe('2.5.0'); // build metadata
  });

  test('de-pads zero-padded CalVer', () => {
    expect(toComparableVersion('2025.01.0')).toBe('2025.1.0');
    expect(toComparableVersion('2025.01')).toBe('2025.1.0');
    expect(toComparableVersion('2025.01.0-rc.1')).toBe('2025.1.0-rc.1');
    expect(toComparableVersion('2025.00.1')).toBe('2025.0.1');
  });

  test('fills in missing trailing segments', () => {
    expect(toComparableVersion('2.5')).toBe('2.5.0');
    expect(toComparableVersion('2')).toBe('2.0.0');
  });

  test('rejects strings that carry no version precedence', () => {
    for (const v of ['nightly', 'build-17', '2.3.x', '', '   ', 'vnext']) {
      expect(toComparableVersion(v)).toBeNull();
    }
  });

  test('rejects what the semver spec rejects', () => {
    expect(toComparableVersion('1.2.3-rc.01')).toBeNull(); // leading zero, numeric id
    expect(toComparableVersion('12345678901234567.0.0')).toBeNull(); // past the 16-digit cap
  });

  test('isOrderableVersion is the boolean form', () => {
    expect(isOrderableVersion('2025.01.0')).toBe(true);
    expect(isOrderableVersion('nightly')).toBe(false);
  });
});
