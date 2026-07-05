/**
 * crypto.ts — application-layer field encryption (server-only).
 *
 * Scope (per product decision): accounts.name, accounts.institution,
 * profiles.display_name, profiles.partner_label.
 *
 * Design:
 *   - AES-256-GCM via WebCrypto (Node 18+ / edge compatible).
 *   - Random 12-byte IV per value; GCM gives integrity (tampered
 *     ciphertext fails to decrypt rather than returning garbage).
 *   - Wire format: "enc:v1:<iv b64>:<ciphertext+tag b64>" — the prefix
 *     makes encrypted values self-describing and enables migration of
 *     any legacy plaintext rows.
 *   - Blind index: HMAC-SHA-256 of the normalized plaintext, so UNIQUE
 *     constraints and equality lookups still work without revealing the
 *     value (same plaintext -> same index; ciphertext stays randomized).
 *
 * Key management:
 *   - ENCRYPTION_KEY: 32 bytes, base64 (`openssl rand -base64 32`).
 *   - Server-only. NEVER prefix with NEXT_PUBLIC_. Losing the key means
 *     losing the encrypted fields — store it in a secret manager.
 */

const PREFIX = "enc:v1:";

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Buffer.from(bytes).toString("base64");
}

function b64decode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64"));
}

function rawKey(): Uint8Array {
  const env = process.env.ENCRYPTION_KEY;
  if (!env) throw new Error("ENCRYPTION_KEY is not set (openssl rand -base64 32)");
  const key = b64decode(env);
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64");
  return key;
}

let aesKeyPromise: Promise<CryptoKey> | null = null;
let hmacKeyPromise: Promise<CryptoKey> | null = null;

function aesKey(): Promise<CryptoKey> {
  aesKeyPromise ??= crypto.subtle.importKey(
    "raw",
    rawKey() as unknown as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  return aesKeyPromise;
}

function hmacKey(): Promise<CryptoKey> {
  hmacKeyPromise ??= crypto.subtle.importKey(
    "raw",
    rawKey() as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return hmacKeyPromise;
}

/** Encrypt a field value. Null/empty passes through untouched. */
export async function encryptField(plaintext: string | null): Promise<string | null> {
  if (plaintext == null || plaintext === "") return plaintext;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    await aesKey(),
    new TextEncoder().encode(plaintext)
  );
  return `${PREFIX}${b64encode(iv)}:${b64encode(ciphertext)}`;
}

/**
 * Decrypt a field value. Legacy plaintext (no prefix) is returned as-is
 * so pre-encryption rows keep rendering during migration. Tampered or
 * wrong-key ciphertext returns a visible placeholder instead of throwing
 * so one bad row can't take down a whole page.
 */
export async function decryptField(stored: string | null): Promise<string | null> {
  if (stored == null || stored === "") return stored;
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  try {
    const [ivB64, dataB64] = stored.slice(PREFIX.length).split(":");
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64decode(ivB64) as unknown as BufferSource },
      await aesKey(),
      b64decode(dataB64) as unknown as BufferSource
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return "[unreadable]";
  }
}

/**
 * Deterministic blind index for equality/uniqueness on encrypted columns.
 * Normalizes (trim + case-fold) so "TD Chequing" and "td chequing " collide,
 * matching how a plaintext UNIQUE(user_id, name) would behave in practice.
 */
export async function blindIndex(plaintext: string): Promise<string> {
  const normalized = plaintext.trim().toLowerCase();
  const sig = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    new TextEncoder().encode(normalized)
  );
  return b64encode(sig);
}

export function isEncrypted(stored: string | null): boolean {
  return stored != null && stored.startsWith(PREFIX);
}
