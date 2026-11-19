import { z } from "zod";

// Toute la configuration vient de l'environnement. Aucun secret n'est journalisé ni écrit dans le code.
const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PI_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  PI_VALIDATION_KEY: z.string().trim().min(1).optional(),
  PI_API_KEY: z.string().trim().min(1).optional(), // utilisée à l'étape paiements
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1).optional(),
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
