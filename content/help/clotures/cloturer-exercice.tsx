import { ArticleProse, H2, OL, LI, P, Note, UL } from "../article-shell"

export default function CloturerExercice() {
  return (
    <ArticleProse>
      <P>
        La clôture d&apos;exercice est l&apos;ensemble des opérations comptables qui
        permettent d&apos;arrêter les comptes à la date de fin d&apos;exercice et de
        produire les états financiers (bilan, compte de résultat, tableau des flux de
        trésorerie, annexe).
      </P>
      <H2>1. Pré-clôture (mois précédant la clôture)</H2>
      <OL>
        <LI>Saisir l&apos;intégralité des factures clients et fournisseurs.</LI>
        <LI>Importer et rapprocher tous les relevés bancaires.</LI>
        <LI>Lettrer les comptes de tiers (411, 401, 421).</LI>
        <LI>Vérifier la cohérence TVA&nbsp;: déclarations déposées, soldes 4456/4457.</LI>
      </OL>
      <H2>2. Travaux d&apos;inventaire</H2>
      <UL>
        <LI><strong>Stocks</strong>&nbsp;: inventaire physique, valorisation au coût ou à la valeur nette de réalisation (IAS 2).</LI>
        <LI><strong>Immobilisations</strong>&nbsp;: enregistrement des dotations aux amortissements, tests de dépréciation (IAS 36).</LI>
        <LI><strong>Provisions</strong>&nbsp;: créances douteuses, litiges, garanties, IAS&nbsp;19 (engagements de retraite).</LI>
        <LI><strong>Charges et produits constatés d&apos;avance</strong>&nbsp;: rattachement à l&apos;exercice (CCA / PCA).</LI>
        <LI><strong>Charges à payer / produits à recevoir</strong>&nbsp;: factures non parvenues (FNP), commissions courues.</LI>
        <LI><strong>Écarts de change</strong>&nbsp;: réévaluation des positions en devises au cours de clôture (IAS 21).</LI>
      </UL>
      <H2>3. Calcul de l&apos;impôt sur les sociétés (CIT)</H2>
      <OL>
        <LI>Déterminer le résultat fiscal&nbsp;: résultat comptable + réintégrations &minus; déductions.</LI>
        <LI>Appliquer le taux de 15&nbsp;% (taux standard mauricien) ou 3&nbsp;% (régime <em>Global Business</em>, sous conditions).</LI>
        <LI>Comptabiliser la <strong>charge d&apos;impôt</strong> et l&apos;<strong>impôt différé</strong> (IAS 12) sur les différences temporelles.</LI>
      </OL>
      <H2>4. Production des états financiers</H2>
      <OL>
        <LI>Ouvrez <strong>Clôture &gt; Exercice</strong>.</LI>
        <LI>Lancez la <strong>liasse de clôture</strong>&nbsp;: Lexora produit le bilan, le compte de résultat, le tableau de variation des capitaux propres, le tableau de flux de trésorerie et les notes annexes.</LI>
        <LI>Vérifiez chaque rubrique. Les anomalies (écart de bilan, comptes non lettrés) sont listées dans le panneau <strong>Contrôles de clôture</strong>.</LI>
      </OL>
      <H2>5. Verrouillage et archivage</H2>
      <OL>
        <LI>Une fois les états validés, cliquez sur <strong>Clôturer l&apos;exercice</strong>. L&apos;ensemble des écritures est verrouillé.</LI>
        <LI>Lexora génère l&apos;<strong>écriture d&apos;à-nouveau</strong> au 1er&nbsp;jour de l&apos;exercice suivant.</LI>
        <LI>Le dossier complet (PDF + journaux + grand livre + balance) est archivé dans <strong>Documents &gt; Clôtures</strong> et conservé <strong>10&nbsp;ans</strong>.</LI>
      </OL>
      <Note>
        La clôture est une opération <strong>irréversible</strong>. Pour corriger une
        erreur après clôture, il est nécessaire de passer par une procédure de
        ré-ouverture supervisée (rôle Administrateur), qui sera tracée dans le journal
        d&apos;audit.
      </Note>
    </ArticleProse>
  )
}
