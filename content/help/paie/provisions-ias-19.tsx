import { ArticleProse, H2, OL, LI, P, Note, UL, Code } from "../article-shell"

export default function ProvisionsIas19() {
  return (
    <ArticleProse>
      <P>
        La norme <strong>IAS&nbsp;19 — Avantages du personnel</strong> impose la
        comptabilisation, à la clôture de chaque exercice, d&apos;une provision
        actuarielle au titre des engagements postérieurs à l&apos;emploi. À Maurice,
        l&apos;application principale concerne le <em>Portable Retirement Gratuity Fund</em>
        (PRGF) et les indemnités de départ prévues par le <em>Workers&apos; Rights Act 2019</em>.
      </P>
      <H2>1. Périmètre</H2>
      <UL>
        <LI><strong>Régimes à cotisations définies</strong> (PRGF, fonds de pension externalisés)&nbsp;: la charge est égale à la cotisation de la période — pas de provision IAS 19.</LI>
        <LI><strong>Régimes à prestations définies</strong> (gratuité de retraite, indemnités de fin de carrière)&nbsp;: provision actuarielle obligatoire.</LI>
      </UL>
      <H2>2. Méthode de calcul (PUC)</H2>
      <P>
        IAS&nbsp;19 retient la méthode des <em>unités de crédit projetées</em> (Projected Unit Credit). Chaque période de service ouvre droit à une fraction de prestation, qui est ensuite&nbsp;:
      </P>
      <OL>
        <LI>projetée jusqu&apos;à la date probable de départ (en tenant compte de l&apos;inflation salariale)&nbsp;;</LI>
        <LI>actualisée au taux des obligations d&apos;État de duration équivalente&nbsp;;</LI>
        <LI>pondérée par la probabilité de présence à l&apos;échéance (mortalité, démission).</LI>
      </OL>
      <Note>
        Lexora intègre un module actuariel simplifié pour les PME&nbsp;: il vous suffit
        de renseigner la table d&apos;effectifs (date d&apos;entrée, salaire, âge) et
        les hypothèses (taux d&apos;actualisation, taux d&apos;inflation salariale, taux
        de rotation). Pour les sociétés cotées ou de grande taille, un actuaire externe
        reste nécessaire.
      </Note>
      <H2>3. Saisir la provision dans Lexora</H2>
      <OL>
        <LI>Ouvrez <strong>Paie &gt; IAS 19</strong>.</LI>
        <LI>Renseignez les <strong>hypothèses actuarielles</strong> de l&apos;exercice (taux d&apos;actualisation publié par la Bank of Mauritius, taux de progression salariale).</LI>
        <LI>Importez ou actualisez la <strong>table d&apos;effectifs</strong>.</LI>
        <LI>Lancez le calcul. Lexora produit&nbsp;:
          <UL>
            <LI>la <strong>Defined Benefit Obligation</strong> (DBO) à l&apos;ouverture et à la clôture&nbsp;;</LI>
            <LI>le <strong>coût des services rendus</strong> (charge de l&apos;exercice)&nbsp;;</LI>
            <LI>le <strong>coût d&apos;intérêt</strong>&nbsp;;</LI>
            <LI>les <strong>écarts actuariels</strong>, comptabilisés en autres éléments du résultat global (OCI).</LI>
          </UL>
        </LI>
        <LI>Validez. Les écritures suivantes sont générées :
          <UL>
            <LI><Code>6815 — Charge de retraite IAS 19</Code> au débit&nbsp;;</LI>
            <LI><Code>1531 — Provision pour engagements de retraite</Code> au crédit&nbsp;;</LI>
            <LI><Code>1071 — Réserves actuarielles (OCI)</Code> pour les écarts.</LI>
          </UL>
        </LI>
      </OL>
      <H2>4. Information en annexe</H2>
      <P>
        IAS&nbsp;19 exige la publication, dans les notes annexes&nbsp;: la nature du
        régime, les hypothèses actuarielles, la réconciliation d&apos;ouverture/clôture
        de la DBO, et une analyse de sensibilité aux principales hypothèses (±0,5&nbsp;point).
        Lexora génère automatiquement les notes 21 et 22 conformes IFRS.
      </P>
    </ArticleProse>
  )
}
