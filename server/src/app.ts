import { existsSync } from "node:fs";
import { join } from "node:path";
import express, { type Express } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { Config } from "./config.js";
import { buildApi } from "./api.js";
import { COUNTRIES } from "./countries.js";
import { CURRENCIES, getCurrency } from "./currencies.js";
import { createPiPlatform, verifyAccessToken, type PiPlatform, type PiUser } from "./pi/client.js";
import type { Store } from "./store/types.js";

export const APP_VERSION = "0.5.0";

export interface Deps {
  config: Config;
  store?: Store; // absent : l'API répond 503 mais /health et /validation-key.txt restent disponibles
  verifyToken?: (accessToken: string) => Promise<PiUser>;
  platform?: PiPlatform;
  payoutFactory?: () => Promise<import("./testnet.js").PayoutClient>;
  clientDir?: string;
}

export function createApp({ config, store, verifyToken = (t) => verifyAccessToken(t), platform, payoutFactory, clientDir }: Deps): Express {
  platform ??= config.PI_API_KEY ? createPiPlatform(config.PI_API_KEY) : undefined;
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Render place un proxy devant l'app

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://sdk.minepi.com"],
          connectSrc: ["'self'", "https://api.minepi.com", "https://*.minepi.com"],
          frameSrc: ["'self'", "https://*.minepi.com"], // le SDK Pi peut ouvrir ses écrans de paiement
          imgSrc: ["'self'", "data:"],
          frameAncestors: ["*"], // l'app s'ouvre dans Pi Browser
        },
      },
      frameguard: false,
    }),
  );
  app.use(express.json({ limit: "50kb" }));
  app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

  // Version visible : permet de savoir quelle version est réellement déployée.
  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      app: "FacturePro",
      version: APP_VERSION,
      network: config.PI_NETWORK,
      commit: config.RENDER_GIT_COMMIT?.slice(0, 7) ?? null,
    });
  });

  // Vérification du domaine dans le Pi Developer Portal.
  app.get("/validation-key.txt", (_req, res) => {
    if (!config.PI_VALIDATION_KEY) {
      res.status(404).type("text/plain").send("PI_VALIDATION_KEY non configurée");
      return;
    }
    res.type("text/plain").send(config.PI_VALIDATION_KEY);
  });

  // Référentiel pays/devises : données statiques, disponibles même sans base de données.
  app.get("/api/reference", (_req, res) => {
    res.json({ countries: COUNTRIES, currencies: [...CURRENCIES, getCurrency("PI")] });
  });

  if (store) app.use("/api", buildApi({ config, store, verifyToken, platform, payoutFactory }));
  else app.use("/api", (_req, res) => { res.status(503).json({ error: "Base de données non configurée" }); });

  // Interface React compilée (si présente) + repli SPA : /i/:token, /factures, etc.
  if (clientDir && existsSync(join(clientDir, "index.html"))) {
    app.use(express.static(clientDir, { index: false, maxAge: "1h" }));
    app.get(/^\/(?!api\/|health|validation-key\.txt).*/, (_req, res) => { res.sendFile(join(clientDir, "index.html")); });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: "Introuvable" });
  });

  return app;
}
