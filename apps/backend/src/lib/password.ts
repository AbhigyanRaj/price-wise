// Bun ships argon2id natively, so there is no native gyp build and no extra
// dependency. Verified in Phase 0.0: correct parameters, salted, ~18ms.

const OPTIONS = {
  algorithm: "argon2id",
  memoryCost: 19_456, // 19 MiB, OWASP minimum recommendation
  timeCost: 2,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain, OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await Bun.password.verify(plain, hash);
  } catch {
    // Bun.password.verify THROWS on a malformed hash rather than returning
    // false (confirmed in Phase 0.0: "UnsupportedAlgorithm"). A corrupt or
    // truncated stored hash must read as "wrong password", never as a 500.
    return false;
  }
}
