// Client minimal de la Pi Platform API (https://api.minepi.com/v2).
// Documentation : GET /me avec « Authorization: Bearer <accessToken> » ; 401 si le jeton est invalide.

export const PI_API_BASE = "https://api.minepi.com/v2";

export interface PiUser {
  uid: string;
  username?: string;
  scopes: string[];
}

export class PiApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

// Le serveur ne fait jamais confiance à l'uid ou au pseudo envoyés par le navigateur :
// il ne retient que ce que Pi répond pour ce jeton.
export async function verifyAccessToken(accessToken: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<PiUser> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetchImpl(`${PI_API_BASE}/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      // On journalise le code d'état, jamais le jeton.
      console.error(`pi: API Pi GET /me ${res.status}`);
      throw new PiApiError(res.status, `API Pi GET /me ${res.status}`);
    }
    const body = (await res.json()) as {
      uid?: unknown;
      username?: unknown;
      credentials?: { scopes?: unknown };
    };
    if (typeof body.uid !== "string" || body.uid.length === 0) {
      throw new PiApiError(502, "Réponse Pi sans uid");
    }
    const scopes = Array.isArray(body.credentials?.scopes)
      ? (body.credentials!.scopes as unknown[]).filter((s): s is string => typeof s === "string")
      : [];
    return {
      uid: body.uid,
      username: typeof body.username === "string" ? body.username : undefined,
      scopes,
    };
  } finally {
    clearTimeout(timer);
  }
}
