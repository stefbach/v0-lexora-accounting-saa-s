import { ArticleProse, H2, OL, LI, P, Note, UL } from "../article-shell"

export default function ImporterReleveBancaire() {
  return (
    <ArticleProse>
      <P>
        L&apos;import du relevé bancaire est la première étape du rapprochement&nbsp;:
        il consiste à charger dans Lexora les opérations transmises par votre banque,
        afin de les apparier ensuite avec les écritures comptables.
      </P>
      <H2>1. Formats acceptés</H2>
      <UL>
        <LI><strong>CSV</strong> (Excel ou texte délimité)&nbsp;;</LI>
        <LI><strong>OFX</strong> (Open Financial Exchange) — recommandé pour MCB, SBM, ABSA, BCP&nbsp;;</LI>
        <LI><strong>MT940</strong> (norme SWIFT) — couramment utilisé par les banques internationales&nbsp;;</LI>
        <LI><strong>PDF</strong> avec reconnaissance automatique (OCR), pour les relevés non structurés.</LI>
      </UL>
      <H2>2. Procédure</H2>
      <OL>
        <LI>Ouvrez <strong>Trésorerie &gt; Rapprochement bancaire</strong>.</LI>
        <LI>Sélectionnez le <strong>compte bancaire</strong> à alimenter.</LI>
        <LI>Cliquez sur <strong>Importer</strong> et déposez le fichier (glisser-déposer ou sélection).</LI>
        <LI>Lexora détecte automatiquement le format. Vérifiez la prévisualisation&nbsp;: dates, libellés, montants débit/crédit, devise.</LI>
        <LI>Si une opération est déjà présente (import précédent), Lexora la signale et la marque comme doublon&nbsp;: vous pouvez l&apos;exclure.</LI>
        <LI>Validez l&apos;import.</LI>
      </OL>
      <Note>
        Pour les CSV non standards, Lexora propose un assistant de mapping&nbsp;: associez
        manuellement les colonnes &quot;Date&quot;, &quot;Libellé&quot;, &quot;Débit&quot;,
        &quot;Crédit&quot;, &quot;Montant&quot;, puis enregistrez le mapping pour les imports
        suivants.
      </Note>
      <H2>3. Étape suivante</H2>
      <P>
        Une fois importé, le relevé apparaît dans l&apos;onglet <strong>Rapprochement</strong>.
        Lexora propose un appariement automatique sur la base du montant et du libellé.
        Les opérations non rapprochées sont signalées&nbsp;: créez l&apos;écriture
        manquante (frais bancaires, virements internes, ATM, etc.) pour solder le compte.
      </P>
    </ArticleProse>
  )
}
