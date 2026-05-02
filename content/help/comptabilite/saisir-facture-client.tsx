import { ArticleProse, H2, OL, LI, P, Note, Code } from "../article-shell"

export default function SaisieFactureClient() {
  return (
    <ArticleProse>
      <P>
        La saisie d&apos;une facture client génère automatiquement l&apos;écriture
        comptable correspondante (vente + TVA collectée + créance client) et alimente
        l&apos;échéancier de recouvrement.
      </P>
      <H2>1. Créer la facture</H2>
      <OL>
        <LI>Ouvrez <strong>Ventes &gt; Factures</strong> puis cliquez sur <strong>Nouvelle facture</strong>.</LI>
        <LI>Sélectionnez le <strong>client</strong> (ou créez-le à la volée).</LI>
        <LI>Indiquez la <strong>date de facturation</strong> et la <strong>date d&apos;échéance</strong>.</LI>
        <LI>Ajoutez les <strong>lignes</strong> avec quantité, prix unitaire HT, taux TVA (15&nbsp;% standard, 0&nbsp;% pour les exportations).</LI>
      </OL>
      <H2>2. Imputation comptable automatique</H2>
      <P>L&apos;écriture générée respecte les principes du PCM&nbsp;:</P>
      <OL>
        <LI><Code>411 — Clients</Code> : débité du TTC.</LI>
        <LI><Code>706 — Prestations de services</Code> ou <Code>707 — Ventes de marchandises</Code> : crédité du HT.</LI>
        <LI><Code>4457 — TVA collectée</Code> : crédité de la TVA due.</LI>
      </OL>
      <Note>
        Lexora vérifie automatiquement que le total de l&apos;écriture est équilibré
        (débit = crédit). En cas d&apos;anomalie, la facture reste en brouillon.
      </Note>
      <H2>3. Validation et envoi</H2>
      <OL>
        <LI>Vérifiez l&apos;aperçu PDF.</LI>
        <LI>Cliquez sur <strong>Valider</strong> pour rendre la facture définitive (verrouillage de l&apos;écriture).</LI>
        <LI>Cliquez sur <strong>Envoyer par e-mail</strong> pour transmettre le PDF au client avec un lien de paiement.</LI>
      </OL>
      <Note>
        Une facture validée ne peut plus être modifiée. Pour corriger une erreur, émettez
        un <strong>avoir</strong> qui contre-passera l&apos;écriture initiale.
      </Note>
    </ArticleProse>
  )
}
