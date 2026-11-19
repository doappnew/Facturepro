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
