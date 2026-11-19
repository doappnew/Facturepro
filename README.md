# FacturePro

Facturation professionnelle compatible Pi Network. Application indépendante, non affiliée à Pi Network.
Pi Network is a trademark of PI Community Company.

## État (étapes 1 à 5)
- `server/src/calc.ts` : calcul en entiers (unités mineures), testé (`cd server && npm install && npm test`).
- `server/sql/migrations/` : schéma Supabase (RLS activée, sans politique publique) et référentiels 19 devises / 22 pays. Déjà appliqué sur le projet Supabase `facturepro-testnet`.

- `server/src/app.ts` : serveur Express (`/health`, `/validation-key.txt`, `POST /api/auth/pi` qui vérifie le jeton par `GET /v2/me`). Pas encore de session ni d'écriture en base.

## Déploiement (Render)
Build : `cd server && npm ci --include=dev && npm run build` — Démarrage : `cd server && npm start` — Variables : voir `.env.example` (saisies dans Render uniquement).

- API (étape 4) : connexion Pi → session signée, profil, clients, factures (brouillon, émission numérotée, annulation), lien de partage + QR, PDF, page publique, paiement Pi U2A (approbation / complétion / paiements incomplets). Mode `pi_only` : facturation en Pi (devise interne `PI`), sans conversion. Mode `web` : devises fiat et instructions de paiement hors Pi (jamais candidat au listing Mainnet).
- Variables d'environnement : voir `.env.example` (`SESSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `PI_API_KEY`, `PI_VALIDATION_KEY`).

- Interface React (`client/`) : accueil, factures, nouvelle facture (3 étapes), détail avec partage/QR/PDF, clients, entreprise, page de facture publique avec « Payer en Pi », pages légales provisoires. Thème clair.
- Tests Testnet (`server/src/testnet.ts`) : envoi A2U et réception U2A, fermés par défaut, absents en Mainnet, 0,1 Pi fixé par le serveur, une fois par compte.
- Le build serveur (`npm run build`) compile aussi le client : une seule commande de build sur Render.

## Mise en route Testnet (Render + Developer Portal)
1. Render : saisir `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` (32+ caractères), `PUBLIC_BASE_URL`, puis `PI_VALIDATION_KEY` et `PI_API_KEY` (une clé par application Pi).
2. Developer Portal : application Testnet « Self Hosted », URL = celle de Render, fichier `/validation-key.txt` servi par l'app.
3. Tests core team : `TESTNET_RECEIVE=1` puis `TESTNET_PAYOUT=1` (+ `PI_WALLET_SEED`) ; 5 comptes distincts pour l'envoi ; ensuite remettre à 0, supprimer `PI_WALLET_SEED`, retirer le code de test.

## Limites connues
- Déclaration de paiement hors Pi (mode web) et avoirs : tables prêtes, écrans et routes non codés.
- Les appels réels à Pi et à Supabase ne sont vérifiables qu'une fois déployé avec les clés.
- Décimales du Pi : 7 supposées, à confirmer en Testnet.

## À venir
Avoirs, déclarations de paiement (mode web), relecture juridique des pages légales, application Mainnet séparée.

## Règles
Aucun secret dans ce dépôt (voir `.env.example`). Mode `pi_only` seul candidat au listing Mainnet (transactions en Pi uniquement).
