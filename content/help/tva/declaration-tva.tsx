import { ArticleProse, H2, OL, LI, P, Note, UL } from "../article-shell"

export default function DeclarationTva() {
  return (
    <ArticleProse>
      <P>
        À Maurice, la TVA (15&nbsp;% taux standard) est administrée par la <em>Mauritius
        Revenue Authority</em> (MRA). La périodicité dépend du chiffre d&apos;affaires&nbsp;:
        mensuelle au-delà de 10&nbsp;millions MUR de CA annuel, trimestrielle en deçà.
      </P>
      <H2>1. Préparation</H2>
      <OL>
        <LI>Vérifiez que toutes les factures clients et fournisseurs de la période sont saisies et validées.</LI>
        <LI>Lancez le rapport <strong>Contrôle TVA</strong> pour détecter les pièces sans taux ou avec taux incohérent.</LI>
        <LI>Rapprochez les soldes des comptes <em>4457 — TVA collectée</em> et <em>4456 — TVA déductible</em> avec le grand livre.</LI>
      </OL>
      <H2>2. Génération de la déclaration</H2>
      <OL>
        <LI>Ouvrez <strong>TVA &gt; Déclarations</strong>.</LI>
        <LI>Cliquez sur <strong>Nouvelle déclaration</strong> et sélectionnez la période.</LI>
        <LI>Lexora calcule automatiquement&nbsp;:
          <UL>
            <LI>la <strong>TVA collectée</strong> sur ventes taxables et exportations zéro-rated&nbsp;;</LI>
            <LI>la <strong>TVA déductible</strong> sur achats et importations&nbsp;;</LI>
            <LI>la <strong>TVA nette à payer</strong> ou le <strong>crédit de TVA</strong> reportable.</LI>
          </UL>
        </LI>
      </OL>
      <H2>3. Contrôles avant validation</H2>
      <UL>
        <LI>Cliquez sur chaque case pour afficher le détail des pièces ayant alimenté le montant.</LI>
        <LI>Vérifiez les opérations à régime particulier (exportations, ventes en zone franche, prestations transfrontalières).</LI>
        <LI>Comparez avec la déclaration précédente pour repérer les variations anormales.</LI>
      </UL>
      <H2>4. Soumission au MRA</H2>
      <OL>
        <LI>Validez la déclaration. Lexora génère le formulaire VAT 4 en PDF et un fichier d&apos;échange XML compatible avec le portail MRA.</LI>
        <LI>Téléchargez le fichier et téléversez-le sur le portail <em>e-Tax</em> du MRA, ou copiez les montants ligne à ligne.</LI>
        <LI>Effectuez le paiement par virement ou prélèvement avant le <strong>20 du mois suivant</strong> la fin de période.</LI>
      </OL>
      <Note>
        Conservez le justificatif de dépôt et le reçu de paiement&nbsp;: ils doivent
        être archivés <strong>10&nbsp;ans</strong> conformément au VAT Act §65.
      </Note>
    </ArticleProse>
  )
}
