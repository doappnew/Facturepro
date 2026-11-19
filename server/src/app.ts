import express, { type Express } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { Config } from "./config.js";
import { PiApiError, verifyAccessToken, type PiUser } from "./pi/client.js";

export const APP_VERSION = "0.3.0";

export interface Deps {
  config: Config;
  verifyToken?: (accessToken: string) => Promise<PiUser>;
}

export function createApp({ config, verifyToken = (t) => verifyAccessToken(t) }: Deps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Render place un proxy devant l'app

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://sdk.minepi.com"],
          connectSrc: ["'self'", "https://api.minepi.com"],
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

  // Connexion Pi : seul l'accessToken est accepté ; l'identité vient de GET /v2/me.
  // NOTE : pas encore de session ni d'écriture en base (étape suivante).
  const authBody = z.object({ accessToken: z.string().min(10).max(4096) }).strict();
  const authLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
  app.post("/api/auth/pi", authLimiter, async (req, res) => {
    const parsed = authBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "accessToken manquant ou invalide" });
      return;
    }
    try {
      const user = await verifyToken(parsed.data.accessToken);
      res.json({ uid: user.uid, username: user.username ?? null, scopes: user.scopes });
    } catch (e) {
      if (e instanceof PiApiError && e.status === 401) {
        res.status(401).json({ error: "Jeton Pi invalide" });
      } else {
        res.status(502).json({ error: "Vérification Pi indisponible" });
      }
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "Introuvable" });
  });

  return app;
}
