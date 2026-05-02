import { ArticleProse, H2, OL, LI, P, Note, UL } from "../article-shell"

export default function ComprendreBalance() {
  return (
    <ArticleProse>
      <P>
        La <strong>balance générale</strong> est le document central de la comptabilité
        d&apos;une période&nbsp;: elle liste tous les comptes du grand livre avec leurs
        totaux débit, crédit et leur solde. Elle est la base de tous les contrôles et de
        la production des états financiers.
      </P>
      <H2>1. Accéder à la balance</H2>
      <OL>
        <LI>Ouvrez <strong>Comptabilité &gt; Balance</strong>.</LI>
        <LI>Choisissez la <strong>période</strong> (mois, trimestre, exercice).</LI>
        <LI>Sélectionnez le <strong>niveau de détail</strong> (classe, racine, compte complet).</LI>
      </OL>
      <H2>2. Lire les colonnes</H2>
      <UL>
        <LI><strong>Débit période</strong>&nbsp;: somme des mouvements débiteurs sur la période choisie.</LI>
        <LI><strong>Crédit période</strong>&nbsp;: somme des mouvements créditeurs sur la période.</LI>
        <LI><strong>Solde débiteur</strong> / <strong>Solde créditeur</strong>&nbsp;: solde net du compte (un seul des deux est non nul).</LI>
      </UL>
      <H2>3. Vérifications de cohérence</H2>
      <OL>
        <LI>Le <strong>total des débits</strong> doit toujours égaler le <strong>total des crédits</strong> (principe de la partie double).</LI>
        <LI>Les comptes de classe&nbsp;1 à 5 sont les comptes de bilan, les classes&nbsp;6 et&nbsp;7 sont les comptes de résultat.</LI>
        <LI>Avant déclaration TVA, vérifiez que le solde du compte <em>4457 — TVA collectée</em> correspond au cumul des factures émises.</LI>
        <LI>Les comptes de tiers (411, 401) doivent être justifiés par le <strong>grand livre auxiliaire</strong>.</LI>
      </OL>
      <Note>
        Un déséquilibre débit/crédit en balance révèle une saisie corrompue ou un
        problème d&apos;import. Lexora bloque la validation des écritures déséquilibrées,
        mais une migration de données peut introduire l&apos;anomalie. Lancez le rapport
        <em> Contrôle d&apos;intégrité</em> pour identifier l&apos;écriture fautive.
      </Note>
    </ArticleProse>
  )
}
