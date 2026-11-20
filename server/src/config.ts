import { z } from "zod";

// Toute la configuration vient de l'environnement. Aucun secret n'est journalisé ni écrit dans le code.
const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PI_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  PI_VALIDATION_KEY: z.string().trim().min(1).optional(),
  PI_API_KEY: z.string().trim().min(1).optional(), // utilisée à l'étape paiements
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1).optional(),
  SESSION_SECRET: z.string().min(32, "au moins 32 caractères").optional(),
  PUBLIC_BASE_URL: z.string().url().optional(),
  // Tests Testnet (à 0 par défaut) ; la clé du portefeuille de l'app n'est jamais journalisée et se supprime après les tests.
  TESTNET_PAYOUT: z.enum(["0", "1"]).default("0"),
  TESTNET_RECEIVE: z.enum(["0", "1"]).default("0"),
  // Frais de service payés en Pi par l'entreprise qui facture (0 = désactivé). Prix modifiables dans Render, sans toucher au code.
  BILLING_ENABLED: z.enum(["0", "1"]).default("0"),
  FEE_INVOICE_PI: z.string().regex(/^\d+(\.\d{1,7})?$/).default("0.5"),
  SUBSCRIPTION_PI: z.string().regex(/^\d+(\.\d{1,7})?$/).default("10"),
  SUBSCRIPTION_DAYS: z.coerce.number().int().min(1).max(366).default(30),
  KEEP_ALIVE_HOURS: z.string().regex(/^\d{1,2}-\d{1,2}$/).default("7-23"), // heures locales du Bénin pendant lesquelles KEEP_ALIVE visite l'app
  KEEP_ALIVE: z.enum(["0", "1"]).default("0"), // 1 = l'app se visite elle-même toutes les 10 min (Testnet, offre gratuite Render)
  PI_WALLET_SEED: z.string().trim().min(1).optional(),
  RENDER_GIT_COMMIT: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    // On n'affiche que les noms des variables invalides, jamais leurs valeurs.
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuration invalide : ${names}`);
  }
  return parsed.data;
}
