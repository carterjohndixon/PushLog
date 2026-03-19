import crypto from "crypto";

const CHARSET = "0123456789abcdefghijklmnopqrstuvwxyz";
const CODE_LENGTH = 10;
const CODE_COUNT = 10;

export function generateRecoveryCodes(count = CODE_COUNT): string[] {
  const codes: Set<string> = new Set();
  while (codes.size < count) {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CHARSET[bytes[i] % CHARSET.length];
    }
    codes.add(code);
  }
  return Array.from(codes);
}

/**
 * Returns true if the input looks like a recovery code (10 lowercase alphanumeric chars).
 * Used to distinguish recovery codes from 6-digit TOTP codes at the /api/mfa/verify endpoint.
 */
export function looksLikeRecoveryCode(input: string): boolean {
  return /^[0-9a-z]{10}$/.test(input);
}
