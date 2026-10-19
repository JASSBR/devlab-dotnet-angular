import { describe, expect, it } from 'vitest';
import { formatBytes } from './performance-runtime';

describe('formatBytes', () => {
  it('keeps small values in bytes', () => {
    expect(formatBytes(0)).toBe('0 o');
    expect(formatBytes(64)).toBe('64 o');
  });

  // toLocaleString('fr-FR') uses a comma and may insert a narrow no-break space: normalise before comparing.
  const plain = (s: string) => s.replace(/\s/g, ' ');

  it('switches to binary units with French formatting', () => {
    expect(plain(formatBytes(4672))).toBe('4,56 Ko');
    expect(plain(formatBytes(2_400_064))).toBe('2,29 Mo');
    expect(plain(formatBytes(41_200_064))).toBe('39,3 Mo');
    expect(plain(formatBytes(5 * 1024 ** 3))).toBe('5 Go');
  });
});
