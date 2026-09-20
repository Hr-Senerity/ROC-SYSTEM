import { describe, expect, it } from 'vitest';
import { formatKilobytes } from './formatKilobytes';

describe('formatKilobytes', () => {
  it('always displays bytes in KB with one decimal place', () => {
    expect(formatKilobytes(0)).toBe('0.0 KB');
    expect(formatKilobytes(478)).toBe('0.5 KB');
    expect(formatKilobytes(76_432)).toBe('74.6 KB');
  });
});
