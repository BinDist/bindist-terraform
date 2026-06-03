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
import { sanitizeFileName } from './validation.js';

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
    ];
    for (const input of hostile) {
      const out = sanitizeFileName(input);
      expect(out).not.toMatch(/[/\\]/);
      expect(out).not.toContain('..');
      // eslint-disable-next-line no-control-regex
      expect(out).not.toMatch(/[\x00-\x1f\x7f"'\r\n]/);
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
