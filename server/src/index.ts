import { createApp, APP_VERSION } from "./app.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { SupabaseStore } from "./store/supabase.js";

const config = loadConfig();
const store = config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY
  ? new SupabaseStore(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)
  : undefined;
const clientDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "client", "dist");
const app = createApp({ config, store, clientDir });

app.listen(config.PORT, () => {
  console.log(`FacturePro ${APP_VERSION} (${config.PI_NETWORK}) à l'écoute sur le port ${config.PORT}`);
  if (!store) console.warn("SUPABASE_SERVICE_ROLE_KEY absent : l'API est désactivée (503)");
  if (!config.SESSION_SECRET) console.warn("SESSION_SECRET absent : les connexions sont désactivées");
  if (!config.PI_API_KEY) console.warn("PI_API_KEY absent : les paiements Pi sont désactivés");
});

// Garde l'instance éveillée (offre gratuite Render : veille après ~15 min sans visite). Désactivé par défaut.
// L'offre gratuite donne ~750 h/mois pour TOUS les services du compte : on ne visite l'app que pendant la plage
// KEEP_ALIVE_HOURS (heures du Bénin, par défaut 7-23 = 16 h/jour ≈ 490 h/mois) ; hors plage, l'instance peut dormir.
// Ne peut pas réveiller une instance déjà endormie : seul un service extérieur le peut.
if (config.KEEP_ALIVE === "1" && config.PUBLIC_BASE_URL) {
  const url = new URL("/health", config.PUBLIC_BASE_URL).toString();
  const [from, to] = config.KEEP_ALIVE_HOURS.split("-").map(Number) as [number, number];
  const hourInBenin = () => Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Porto-Novo" }).format(new Date())) % 24;
  const inWindow = () => { const h = hourInBenin(); return from <= to ? h >= from && h < to : h >= from || h < to; };
  setInterval(() => { if (inWindow()) fetch(url).catch(() => undefined); }, 10 * 60 * 1000).unref();
  console.log(`KEEP_ALIVE actif : visite de /health toutes les 10 minutes, de ${from} h à ${to} h (heure du Bénin)`);
}
