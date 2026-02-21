import { describe, expect, it } from 'vitest';
import { formatDuration, progressPercent, shortId } from './utils';

describe('utils', () => {
  it('formatDuration formats seconds/minutes/hours', () => {
    expect(formatDuration(12)).toBe('12s');
    expect(formatDuration(95)).toBe('1m 35s');
    expect(formatDuration(3661)).toBe('1h 1m');
  });

  it('progressPercent handles zero and non-zero totals', () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(3, 10)).toBe(30);
  });

  it('shortId truncates to 8 chars', () => {
    expect(shortId('12345678')).toBe('12345678');
    expect(shortId('1234567890abcdef')).toBe('12345678');
  });
});
