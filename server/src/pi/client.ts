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

// ---- Paiements (clé API serveur : « Authorization: Key <clé> ») ----
export interface PiPaymentDTO {
  identifier: string;
  user_uid: string;
  amount: number;
  memo: string;
  metadata: Record<string, unknown> | null;
  direction: "user_to_app" | "app_to_user";
  network: "Pi Network" | "Pi Testnet";
  status: { developer_approved: boolean; transaction_verified: boolean; developer_completed: boolean; cancelled: boolean; user_cancelled: boolean };
  transaction: null | { txid: string; verified?: boolean };
}

export interface PiPlatform {
  getPayment(paymentId: string): Promise<PiPaymentDTO>;
  approvePayment(paymentId: string): Promise<void>;
  completePayment(paymentId: string, txid: string): Promise<void>;
}

export function createPiPlatform(apiKey: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): PiPlatform {
  const call = async (method: "GET" | "POST", path: string, body?: unknown) => {
    const res = await (fetchImpl as unknown as (u: string, i: unknown) => ReturnType<FetchLike>)(`${PI_API_BASE}${path}`, {
      method,
      headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      // Code d'état et chemin sans identifiant : c'est ce qui permet de diagnostiquer, sans journaliser de clé.
      console.error(`payments: API Pi ${method} ${path.replace(/\/[^/]+(\/(approve|complete))?$/, "/{id}$1")} ${res.status}`);
      throw new PiApiError(res.status, `API Pi ${method} ${res.status}`);
    }
    return res.json();
  };
  return {
    async getPayment(id) { return (await call("GET", `/payments/${encodeURIComponent(id)}`)) as PiPaymentDTO; },
    async approvePayment(id) { await call("POST", `/payments/${encodeURIComponent(id)}/approve`); },
    async completePayment(id, txid) { await call("POST", `/payments/${encodeURIComponent(id)}/complete`, { txid }); },
  };
}
