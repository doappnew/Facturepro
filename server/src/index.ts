import { createApp, APP_VERSION } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp({ config });

app.listen(config.PORT, () => {
  console.log(`FacturePro ${APP_VERSION} (${config.PI_NETWORK}) à l'écoute sur le port ${config.PORT}`);
});
