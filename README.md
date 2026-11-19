# FacturePro

Facturation professionnelle compatible Pi Network. Application indépendante, non affiliée à Pi Network.
Pi Network is a trademark of PI Community Company.

## État (étapes 1 à 3)
- `server/src/calc.ts` : calcul en entiers (unités mineures), testé (`cd server && npm install && npm test`).
- `server/sql/migrations/` : schéma Supabase (RLS activée, sans politique publique) et référentiels 19 devises / 22 pays. Déjà appliqué sur le projet Supabase `facturepro-testnet`.

- `server/src/app.ts` : serveur Express (`/health`, `/validation-key.txt`, `POST /api/auth/pi` qui vérifie le jeton par `GET /v2/me`). Pas encore de session ni d'écriture en base.

## Déploiement (Render)
Build : `cd server && npm ci --include=dev && npm run build` — Démarrage : `cd server && npm start` — Variables : voir `.env.example` (saisies dans Render uniquement).

- API (étape 4) : connexion Pi → session signée, profil, clients, factures (brouillon, émission numérotée, annulation), lien de partage + QR, PDF, page publique, paiement Pi U2A (approbation / complétion / paiements incomplets). Mode `pi_only` : facturation en Pi (devise interne `PI`), sans conversion. Mode `web` : devises fiat et instructions de paiement hors Pi (jamais candidat au listing Mainnet).
- Variables d'environnement : voir `.env.example` (`SESSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `PI_API_KEY`, `PI_VALIDATION_KEY`).

## À venir
Interface React (5 pages du prototype), boutons de test Testnet exigés par la core team (envoi A2U / réception U2A), pages légales, Mainnet.

## Règles
Aucun secret dans ce dépôt (voir `.env.example`). Mode `pi_only` seul candidat au listing Mainnet (transactions en Pi uniquement).
