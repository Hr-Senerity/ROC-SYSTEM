import { describe, expect, it } from 'vitest';
import { isInvitationCodeComplete, normalizeInvitationCodeInput } from './model';

describe('invitation code model', () => {
  it('normalizes lowercase and strips separators', () => {
    expect(normalizeInvitationCodeInput('a2-b 3c')).toBe('A2B3C');
  });

  it('limits input to five alphanumeric characters', () => {
    expect(normalizeInvitationCodeInput('AB12C9')).toBe('AB12C');
    expect(isInvitationCodeComplete('AB12C')).toBe(true);
    expect(isInvitationCodeComplete('AB12')).toBe(false);
    expect(isInvitationCodeComplete('AB-2C')).toBe(false);
    expect(isInvitationCodeComplete('ABCDE')).toBe(false);
    expect(isInvitationCodeComplete('12345')).toBe(false);
  });
});
