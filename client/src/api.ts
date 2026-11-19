// Client HTTP. La session reste en mémoire (et sessionStorage si disponible) ; elle n'est jamais écrite dans l'URL.
export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: string[]) { super(message); }
}

let session: string | null = null;
try { session = sessionStorage.getItem("fp_session"); } catch { /* stockage indisponible */ }

export function setSession(s: string | null) {
  session = s;
  try { s ? sessionStorage.setItem("fp_session", s) : sessionStorage.removeItem("fp_session"); } catch { /* ignoré */ }
}
export const hasSession = () => !!session;

async function raw(method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (session) headers.Authorization = `Bearer ${session}`;
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    let msg = `Erreur ${res.status}`; let details: string[] | undefined;
    try { const j = await res.json() as { error?: string; details?: string[] }; msg = j.error ?? msg; details = j.details; } catch { /* corps vide */ }
    if (res.status === 401 && session) { setSession(null); }
    throw new ApiError(res.status, msg, details);
  }
  return res;
}

export const api = {
  get: async <T,>(p: string) => (await raw("GET", p)).json() as Promise<T>,
  post: async <T,>(p: string, b?: unknown) => (await raw("POST", p, b ?? {})).json() as Promise<T>,
  put: async <T,>(p: string, b: unknown) => (await raw("PUT", p, b)).json() as Promise<T>,
  del: async (p: string) => { await raw("DELETE", p); },
  blob: async (p: string) => (await raw("GET", p)).blob(),
};

export const errText = (e: unknown) =>
  e instanceof ApiError ? (e.details?.length ? `${e.message} : ${e.details.join(" ; ")}` : e.message) : "Une erreur est survenue";
