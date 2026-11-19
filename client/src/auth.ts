import { api, setSession } from "./api";
import { piAuthenticate } from "./pi";

// Connexion Pi : on n'envoie au serveur que l'accessToken ; l'identité vient de GET /v2/me côté serveur.
export async function loginWithPi(scopes: string[] = ["username", "payments"]): Promise<void> {
  const pending: string[] = [];
  const auth = await piAuthenticate(scopes, (p) => { pending.push(p.identifier); });
  const r = await api.post<{ session: string }>("/api/auth/pi", { accessToken: auth.accessToken });
  setSession(r.session);
  // Paiements incomplets : le serveur relit leur état chez Pi, il ne croit pas le navigateur.
  for (const id of pending) await api.post("/api/payments/incomplete", { paymentId: id }).catch(() => undefined);
}
