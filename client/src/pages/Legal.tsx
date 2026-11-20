import { navigate } from "../router";

// Éditeur et contact renseignés. Texte à faire relire par un juriste avant le Mainnet.
const EDITEUR = "SEDOGNIDE EULALIE ZANTCHIO";
const CONTACT = "zantchioeulalie@gmail.com";
const VERSION = "20 novembre 2026";

export function Legal({ kind }: { kind: "confidentialite" | "conditions" }) {
  return (
    <main className="app">
      <button className="back" onClick={() => (window.history.length > 1 ? window.history.back() : navigate("/"))}>← Retour</button>
      {kind === "confidentialite" ? <Privacy /> : <Terms />}
      <p className="muted small">Version du {VERSION}. FacturePro est une application indépendante, non affiliée à Pi Network. Pi Network is a trademark of PI Community Company.</p>
    </main>
  );
}

function Privacy() {
  return (
    <>
      <h1>Politique de confidentialité</h1>
      <p>Cette page explique quelles données FacturePro traite, pourquoi, et quels sont vos droits. Éditeur : {EDITEUR}. Contact : {CONTACT}.</p>

      <h3>1. Données que nous traitons</h3>
      <p><b>Connexion.</b> Vous vous connectez uniquement avec Pi. Nous recevons de Pi votre identifiant d'utilisateur (uid) et votre pseudo. Nous ne demandons ni e-mail, ni numéro de téléphone, ni mot de passe.</p>
      <p><b>Ce que vous saisissez.</b> Les informations de votre entreprise (nom, pays, adresse, numéro fiscal, contact, conditions de paiement, mentions) et de vos clients (nom, pays, adresse, numéro fiscal, contact), ainsi que le contenu de vos factures.</p>
      <p><b>Paiements en Pi.</b> Pour une facture payée en Pi, nous conservons l'identifiant du paiement, son montant, son état et l'identifiant de transaction (txid) de la blockchain. Nous ne détenons jamais votre clé privée ni votre phrase secrète.</p>
      <p><b>Technique.</b> Un jeton de session est gardé dans votre navigateur le temps de la session. Notre hébergeur peut journaliser des informations techniques (adresse IP, date, page) pour la sécurité et le diagnostic. Nous n'utilisons ni publicité, ni traceurs publicitaires, ni outil d'analyse tiers.</p>

      <h3>2. Pourquoi nous les traitons</h3>
      <ul>
        <li>Vous identifier et protéger l'accès à votre compte.</li>
        <li>Créer, émettre, partager et télécharger vos factures.</li>
        <li>Vérifier et enregistrer les paiements en Pi.</li>
        <li>Assurer la sécurité, prévenir les abus et corriger les erreurs.</li>
      </ul>
      <p>Nous ne vendons pas vos données et ne les utilisons pas à d'autres fins.</p>

      <h3>3. Partage d'une facture</h3>
      <p>Une facture partagée est visible par toute personne qui possède son lien ou son QR code. Le lien est long et aléatoire ; seule son empreinte est conservée chez nous. La page publique n'affiche que le nom du client, jamais son adresse ni ses coordonnées. Vous pouvez révoquer un lien à tout moment : un nouveau lien remplace l'ancien. Un lien expire au bout de 90 jours.</p>

      <h3>4. Qui peut accéder aux données</h3>
      <p>Vos données ne sont accessibles qu'à vous (via votre compte Pi) et aux prestataires techniques strictement nécessaires : l'hébergement de l'application (Render, Francfort) et la base de données (Supabase). La plateforme Pi traite de son côté votre connexion et vos paiements, selon ses propres conditions.</p>

      <h3>5. Conservation</h3>
      <p>Vos données sont conservées tant que votre compte est actif. Les factures émises sont des documents comptables : leur durée de conservation légale dépend de votre pays et relève de votre responsabilité. Sur demande, nous supprimons ou anonymisons vos données, sauf celles que la loi nous oblige à garder.</p>

      <h3>6. Vos droits</h3>
      <p>Vous pouvez demander l'accès à vos données, leur correction, leur export ou leur suppression, et vous opposer à leur traitement, en écrivant à {CONTACT}. Nous répondons dans un délai raisonnable. Les clients dont vous saisissez les données sont des tiers : c'est à vous de les informer et d'avoir le droit de les saisir.</p>

      <h3>7. Sécurité</h3>
      <p>Les échanges sont chiffrés (HTTPS). La clé de l'API Pi et l'accès à la base de données ne sont jamais envoyés dans votre navigateur. Aucun système n'est infaillible : en cas d'incident touchant vos données, nous vous en informerons.</p>

      <h3>8. Enfants</h3>
      <p>FacturePro s'adresse aux personnes majeures et n'est pas destiné aux enfants.</p>

      <h3>9. Modifications</h3>
      <p>Nous pouvons mettre à jour cette politique ; la date de version est indiquée en bas de page.</p>
    </>
  );
}

function Terms() {
  return (
    <>
      <h1>Conditions d'utilisation</h1>
      <p>En utilisant FacturePro, vous acceptez ces conditions. Éditeur : {EDITEUR}. Contact : {CONTACT}.</p>

      <h3>1. Le service</h3>
      <p>FacturePro est un outil de création, de partage et de suivi de factures. Vous vous connectez avec votre compte Pi. Le service est fourni « en l'état », sans garantie de disponibilité continue.</p>

      <h3>2. Votre responsabilité</h3>
      <p>Vous êtes seul responsable du contenu de vos factures, de l'exactitude des montants, des taxes et des mentions, ainsi que du respect des règles fiscales, comptables et de facturation de votre pays. FacturePro ne garantit pas qu'une facture soit conforme à la réglementation d'un pays donné et ne fournit pas de conseil fiscal ou juridique.</p>
      <p>Vous vous engagez à ne pas utiliser le service pour des activités illégales, trompeuses ou frauduleuses, ni pour saisir des données de tiers sans en avoir le droit.</p>

      <h3>3. Paiements en Pi</h3>
      <p>Les paiements en Pi sont traités via la plateforme Pi. Une facture n'est marquée payée qu'après confirmation du paiement par Pi. FacturePro n'est pas une banque, ne détient pas de fonds et n'intervient pas dans les litiges entre vendeur et client. Les transactions sur la blockchain sont irréversibles ; sur le réseau de test (Pi Testnet), les Pi n'ont aucune valeur.</p>
      <p>Un avoir est un document comptable : il ne déclenche aucun remboursement automatique.</p>

      <h3>4. Frais de service</h3>
      <p>L'émission d'une facture est un service payant, réglé en Pi : soit des frais par facture, soit un abonnement à durée limitée qui permet d'émettre sans frais supplémentaires pendant sa durée. Le tarif en vigueur est affiché dans l'application avant tout paiement ; vous confirmez chaque paiement dans Pi. Les frais réglés ne sont pas remboursables une fois la facture émise, sauf erreur de notre part. Un brouillon peut être créé et modifié sans frais, mais il n'a ni numéro définitif, ni lien de partage.</p>

      <h3>5. Partage</h3>
      <p>Toute personne qui possède le lien ou le QR code d'une facture peut la consulter. Vous choisissez à qui vous le transmettez et pouvez le révoquer à tout moment.</p>

      <h3>6. Disponibilité et responsabilité</h3>
      <p>Nous faisons de notre mieux pour que le service fonctionne, mais des interruptions sont possibles. Dans la mesure permise par la loi, FacturePro n'est pas responsable des pertes indirectes, d'un manque à gagner ou d'une perte de données résultant de l'utilisation du service. Conservez une copie PDF de vos factures importantes.</p>

      <h3>7. Suspension et fin</h3>
      <p>Vous pouvez cesser d'utiliser FacturePro à tout moment et demander la suppression de vos données (voir la politique de confidentialité). Nous pouvons suspendre un accès en cas d'abus ou d'usage contraire à ces conditions.</p>

      <h3>8. Propriété intellectuelle</h3>
      <p>Le nom FacturePro, son logo et le code de l'application appartiennent à leur éditeur. Vos données et le contenu de vos factures vous appartiennent.</p>

      <h3>9. Indépendance vis-à-vis de Pi Network</h3>
      <p>FacturePro est une application indépendante, non affiliée à Pi Network ni à PI Community Company. Pi Network is a trademark of PI Community Company.</p>

      <h3>10. Droit applicable et modifications</h3>
      <p>Ces conditions sont régies par le droit du pays de l'éditeur (Bénin). Nous pouvons les modifier ; la date de version est indiquée en bas de page. Continuer à utiliser le service vaut acceptation de la version en vigueur.</p>
    </>
  );
}
