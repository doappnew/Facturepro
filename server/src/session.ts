// Jeton de session signé (HMAC-SHA256), émis après vérification du jeton Pi. Pas de dépendance externe.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const b64 = (b: Buffer) => b.toString("base64url");

export function signSession(secret: string, userId: string, ttlSeconds = 12 * 3600, now = Date.now()): string {
  const payload = b64(Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(now / 1000) + ttlSeconds })));
  const sig = b64(createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifySession(secret: string, token: string, now = Date.now()): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let given: Buffer;
  try { given = Buffer.from(sig, "base64url"); } catch { return null; }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: unknown; exp?: unknown };
    if (typeof sub !== "string" || typeof exp !== "number" || exp * 1000 < now) return null;
    return sub;
  } catch { return null; }
}

// Jeton de lien de facture : 256 bits imprévisibles ; seul le hash est stocké.
export function newShareToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
