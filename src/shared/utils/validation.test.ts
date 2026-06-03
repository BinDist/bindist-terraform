/**
 * Tests for sanitizeFileName — defense-in-depth for filenames that end up in
 * S3 object keys and Content-Disposition response headers.
 *
 * Two attack classes drive these tests:
 *   - path traversal / key escape: `/`, `\`, and `..` must not survive, or a
 *     crafted name could write/read outside the intended key prefix.
 *   - header injection: CR/LF and quotes must not survive, or a name could
 *     break out of the quoted Content-Disposition value and inject headers.
 *
 * The function is pure, so each case asserts the exact transformation where
 * it's stable, plus a broad invariant: whatever goes in, the output never
 * contains a dangerous character and is never empty.
 */

import { describe, test, expect } from 'vitest';
import { sanitizeFileName, validation } from './validation.js';

describe('sanitizeFileName', () => {
  test('leaves an ordinary filename untouched (including version dots)', () => {
    expect(sanitizeFileName('myapp-1.2.3.exe')).toBe('myapp-1.2.3.exe');
  });

  test('neutralizes path separators and traversal sequences', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('etc_passwd');
    const out = sanitizeFileName('a/b\\c..d');
    expect(out).not.toMatch(/[/\\]/);
    expect(out).not.toContain('..');
  });

  test('strips CR/LF and quotes (Content-Disposition header injection)', () => {
    // Classic breakout: close the quoted filename, then inject.
    const out = sanitizeFileName('invoice.pdf"; filename="evil.exe');
    expect(out).not.toContain('"');

    const crlf = sanitizeFileName('report\r\nSet-Cookie: x.exe');
    expect(crlf).not.toMatch(/[\r\n]/);

    expect(sanitizeFileName("a'b.exe")).not.toContain("'");
  });

  test('strips control characters and DEL', () => {
    const out = sanitizeFileName('na\x00me\x1f\x7f.bin');
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/[\x00-\x1f\x7f]/);
    expect(out).toBe('na_me_.bin');
  });

  test('removes leading and trailing dots', () => {
    expect(sanitizeFileName('.hidden')).toBe('hidden');
    expect(sanitizeFileName('name.')).toBe('name');
  });

  test('collapses repeated underscores', () => {
    expect(sanitizeFileName('a___b.exe')).toBe('a_b.exe');
  });

  test('strips Windows-illegal characters (colon/ADS and the reserved set)', () => {
    // Colon is the drive separator and Alternate Data Stream marker — a name
    // like `report.pdf:hidden.exe` must not survive to a Windows download.
    expect(sanitizeFileName('report.pdf:hidden.exe')).not.toContain(':');
    const out = sanitizeFileName('a<b>c|d?e*f.exe');
    expect(out).not.toMatch(/[<>:|?*]/);
  });

  test('folds Unicode homoglyph separators via NFKC', () => {
    // Fullwidth '．．／' (U+FF0E U+FF0E U+FF0F) normalizes to '../'.
    const out = sanitizeFileName('．．／etc／passwd');
    expect(out).not.toMatch(/[/\\]/);
    expect(out).not.toContain('..');
  });

  test('neutralizes Windows reserved device names (regardless of extension)', () => {
    expect(sanitizeFileName('CON.exe')).toBe('_CON.exe');
    expect(sanitizeFileName('nul')).toBe('_nul');
    expect(sanitizeFileName('COM1.txt')).toBe('_COM1.txt');
    // A name that merely contains a reserved word is fine.
    expect(sanitizeFileName('console.exe')).toBe('console.exe');
  });

  test('trims surrounding whitespace', () => {
    expect(sanitizeFileName('  spaced.exe  ')).toBe('spaced.exe');
  });

  test("falls back to 'file' when nothing safe remains", () => {
    for (const stripped of ['', '   ', '...', '///', '\\\\', '..']) {
      expect(sanitizeFileName(stripped)).toBe('file');
    }
  });

  test('output is always header/key-safe and non-empty (invariant)', () => {
    const hostile = [
      '../../etc/passwd',
      'a/b\\c',
      'x\r\ny.exe',
      'q"u\'ote.exe',
      'null\x00byte.bin',
      '...',
      '   ',
      '///',
      '',
      '..\\..\\windows\\system32',
      '．．／．．／etc',
      'evil.exe::$DATA',
      'a<b>c|d?e*f',
    ];
    for (const input of hostile) {
      const out = sanitizeFileName(input);
      expect(out).not.toMatch(/[/\\]/);
      expect(out).not.toContain('..');
      // eslint-disable-next-line no-control-regex
      expect(out).not.toMatch(/[\x00-\x1f\x7f"'\r\n]/);
      expect(out).not.toMatch(/[<>:|?*]/);
      expect(out.length).toBeGreaterThan(0);
    }
  });

  test('is idempotent — sanitizing an already-clean name is a no-op', () => {
    for (const input of ['../../etc/passwd', 'report\r\nx.exe', 'a___b', '...']) {
      const once = sanitizeFileName(input);
      expect(sanitizeFileName(once)).toBe(once);
    }
  });
});

/**
 * The Joi fileName rule is the primary gate — it rejects bad names outright,
 * with sanitizeFileName as the backstop. Exercised via the exported
 * patterns.fileName schema; `.validate()` returns an error for rejects.
 */
describe('fileName validation (reject gate)', () => {
  const check = (name: string) => validation.patterns.fileName.validate(name).error;

  test('accepts an ordinary filename', () => {
    expect(check('myapp-1.2.3.exe')).toBeUndefined();
  });

  test('rejects path separators and traversal', () => {
    for (const name of ['a/b', 'a\\b', '..\\evil', '../etc']) {
      expect(check(name)).toBeDefined();
    }
  });

  test('rejects Windows-illegal characters including colon/ADS', () => {
    for (const name of ['evil.exe:stream', 'f.exe::$DATA', 'a<b', 'a>b', 'a|b', 'a?b', 'a*b']) {
      expect(check(name)).toBeDefined();
    }
  });

  test('rejects Windows reserved device names regardless of extension', () => {
    for (const name of ['CON', 'nul', 'COM1.txt', 'LPT9.dat', 'AuX']) {
      expect(check(name)).toBeDefined();
    }
    // Names that merely contain or extend a reserved word are still fine.
    expect(check('console.exe')).toBeUndefined();
    expect(check('com10.txt')).toBeUndefined();
  });

  test('rejects Unicode homoglyph traversal after NFKC folding', () => {
    // Fullwidth '．．／etc' normalizes to '../etc'.
    expect(check('．．／etc')).toBeDefined();
  });

  test('normalizes the accepted value to NFKC', () => {
    // Fullwidth 'ＡＢＣ.exe' folds to ASCII on the way through and is returned.
    const { value, error } = validation.patterns.fileName.validate('ＡＢＣ.exe');
    expect(error).toBeUndefined();
    expect(value).toBe('ABC.exe');
  });
});
