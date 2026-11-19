// Enveloppe du SDK Pi (https://sdk.minepi.com/pi-sdk.js). Le SDK n'existe que dans Pi Browser.
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { Pi?: any } }

export const hasPi = () => typeof window !== "undefined" && !!window.Pi;

let inited = false;
function init() {
  if (!inited && window.Pi) { window.Pi.init({ version: "2.0" }); inited = true; } // avant toute autre méthode
}

export interface PiAuth { accessToken: string }

export async function piAuthenticate(scopes: string[], onIncomplete: (payment: { identifier: string }) => void): Promise<PiAuth> {
  if (!hasPi()) throw new Error("Ouvrez FacturePro dans Pi Browser pour vous connecter avec Pi.");
  init();
  return window.Pi.authenticate(scopes, onIncomplete);
}

export interface PayEndpoints { approve: string; complete: string; cancel?: string }

// Les trois phases : le navigateur ne fait que relayer ; le serveur décide et vérifie tout.
export function piPay(
  data: { amount: number; memo: string; metadata: object },
  ep: PayEndpoints,
  post: (path: string, body: unknown) => Promise<unknown>,
): Promise<void> {
  if (!hasPi()) return Promise.reject(new Error("Ouvrez cette page dans Pi Browser pour payer en Pi."));
  init();
  return new Promise<void>((resolve, reject) => {
    window.Pi.createPayment(data, {
      onReadyForServerApproval: (paymentId: string) => { post(ep.approve, { paymentId }).catch(reject); },
      onReadyForServerCompletion: (paymentId: string, txid: string) => { post(ep.complete, { paymentId, txid }).then(() => resolve(), reject); },
      onCancel: (paymentId: string) => { if (ep.cancel) void post(ep.cancel, { paymentId }).catch(() => {}); reject(new Error("Paiement annulé")); },
      onError: (e: Error) => reject(e),
    });
  });
}
