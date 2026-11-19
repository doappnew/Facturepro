import { navigate } from "../router";

// Textes provisoires à FAIRE RELIRE par un juriste avant la mise en production. Les crochets sont à compléter.
export function Legal({ kind }: { kind: "confidentialite" | "conditions" }) {
  return (
    <main className="app">
      <button className="back" onClick={() => (window.history.length > 1 ? window.history.back() : navigate("/"))}>← Retour</button>
      <div className="note warn">Texte provisoire, en attente de relecture juridique.</div>
      {kind === "confidentialite" ? (
        <>
          <h1>Confidentialité</h1>
          <h3>Données collectées</h3>
          <p>Votre identifiant Pi et votre pseudo (fournis par Pi lors de la connexion), les informations de votre entreprise et de vos clients que vous saisissez, vos factures et l'état des paiements. Aucune adresse e-mail ni numéro de téléphone n'est exigé.</p>
          <h3>Finalité</h3>
          <p>Créer, partager et suivre vos factures, et vérifier les paiements en Pi.</p>
          <h3>Partage</h3>
          <p>Une facture est visible par toute personne qui possède son lien ou son QR code. Vous pouvez révoquer un lien à tout moment. Le QR ne contient qu'un lien, sans donnée sur le client.</p>
          <h3>Conservation et droits</h3>
          <p>[Durée de conservation à définir.] Vous pouvez demander la correction ou la suppression de vos données : [adresse de contact à renseigner].</p>
          <p className="muted small">Les obligations fiscales et de facturation électronique varient selon les pays : vérifiez celles de votre pays.</p>
        </>
      ) : (
        <>
          <h1>Conditions d'utilisation</h1>
          <p>FacturePro est un outil de création et de suivi de factures. Vous restez responsable du contenu de vos factures et du respect des règles fiscales et légales de votre pays ; FacturePro ne garantit pas la conformité d'une facture à la réglementation d'un pays.</p>
          <p>Les paiements en Pi sont traités via la plateforme Pi. Une facture n'est marquée payée qu'après confirmation par Pi. Un avoir est un document comptable : il ne déclenche aucun remboursement automatique.</p>
          <p>FacturePro est une application indépendante, non affiliée à Pi Network. Pi Network is a trademark of PI Community Company.</p>
          <p>[Éditeur, droit applicable et contact à renseigner.]</p>
        </>
      )}
    </main>
  );
}
