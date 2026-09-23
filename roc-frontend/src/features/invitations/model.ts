export const INVITATION_CODE_LENGTH = 5;

export function normalizeInvitationCodeInput(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, INVITATION_CODE_LENGTH);
}

export function isInvitationCodeComplete(value: string): boolean {
  return /^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{5}$/.test(value);
}
