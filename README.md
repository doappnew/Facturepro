# FacturePro

Facturation professionnelle compatible Pi Network. Application indépendante, non affiliée à Pi Network.
Pi Network is a trademark of PI Community Company.

## État (étapes 1 à 3)
- `server/src/calc.ts` : calcul en entiers (unités mineures), testé (`cd server && npm install && npm test`).
- `server/sql/migrations/` : schéma Supabase (RLS activée, sans politique publique) et référentiels 19 devises / 22 pays. Déjà appliqué sur le projet Supabase `facturepro-testnet`.

- `server/src/app.ts` : serveur Express (`/health`, `/validation-key.txt`, `POST /api/auth/pi` qui vérifie le jeton par `GET /v2/me`). Pas encore de session ni d'écriture en base.

## Déploiement (Render)
Build : `cd server && npm ci --include=dev && npm run build` — Démarrage : `cd server && npm start` — Variables : voir `.env.example` (saisies dans Render uniquement).

## À venir
Sessions et utilisateurs en base, API factures, paiements Pi (Testnet puis Mainnet), PDF et QR, interface React.

## Règles
Aucun secret dans ce dépôt (voir `.env.example`). Mode `pi_only` seul candidat au listing Mainnet (transactions en Pi uniquement).
