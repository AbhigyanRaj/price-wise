// Crockford-style alphabet: no I, L, O or U, which removes 1/l and 0/O
// confusion when someone reads a code aloud or types it from a screenshot.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 12;

export function generateInviteCode(): string {
  // crypto.getRandomValues, never Math.random: an invite code grants access to a
  // tenant, so it must not be predictable from previous codes.
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
