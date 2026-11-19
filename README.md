# FacturePro

Facturation professionnelle compatible Pi Network. Application indépendante, non affiliée à Pi Network.
Pi Network is a trademark of PI Community Company.

## État (étape 1 et 2)
- `server/src/calc.ts` : calcul en entiers (unités mineures), testé (`cd server && npm install && npm test`).
- `server/sql/migrations/` : schéma Supabase (RLS activée, sans politique publique) et référentiels 19 devises / 22 pays. Déjà appliqué sur le projet Supabase `facturepro-testnet`.

## À venir
API Express, authentification Pi, paiements Pi (Testnet puis Mainnet), PDF et QR, interface React.

## Règles
Aucun secret dans ce dépôt (voir `.env.example`). Mode `pi_only` seul candidat au listing Mainnet (transactions en Pi uniquement).
