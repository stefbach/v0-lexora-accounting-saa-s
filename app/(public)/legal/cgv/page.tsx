"use client"

import { useState } from "react"
import { LegalPageLayout, Section, type Lang } from "@/components/legal/LegalPageLayout"

const LAST_UPDATED = "2 mai 2026"

export default function CgvPage() {
  const [lang, setLang] = useState<Lang>("fr")
  return (
    <LegalPageLayout
      currentPath="/legal/cgv"
      title="Conditions Générales de Vente"
      titleEn="General Terms of Sale"
      lastUpdated={LAST_UPDATED}
      lang={lang}
      onLangChange={setLang}
    >
      {lang === "fr" ? <ContentFr /> : <ContentEn />}
    </LegalPageLayout>
  )
}

function ContentFr() {
  return (
    <>
      <Section title="Préambule">
        <p>
          Les présentes Conditions Générales de Vente (ci-après «&nbsp;CGV&nbsp;») régissent
          la fourniture, par <strong>Digital Data Solutions Ltd</strong> (ci-après «&nbsp;Lexora&nbsp;»),
          d&apos;un service en ligne de comptabilité et de gestion à destination des
          professionnels (B2B) établis à Maurice ou dans l&apos;Union européenne. La
          souscription au service emporte acceptation pleine et entière des présentes CGV.
        </p>
      </Section>

      <Section title="1. Objet">
        <p>
          Lexora fournit un logiciel SaaS (Software as a Service) accessible en ligne
          permettant&nbsp;: (i)&nbsp;la tenue de la comptabilité conforme aux <em>Mauritius
          Accounting Standards</em> (IFRS et IFRS pour PME), (ii)&nbsp;la déclaration de la
          TVA mauricienne, (iii)&nbsp;le traitement de la paie, (iv)&nbsp;le rapprochement
          bancaire et (v)&nbsp;la production des états financiers. Le périmètre exact des
          fonctionnalités est défini dans l&apos;offre commerciale souscrite.
        </p>
      </Section>

      <Section title="2. Prix et modalités de paiement">
        <p>
          Les prix sont exprimés en roupies mauriciennes (MUR) ou en euros (EUR) selon la
          juridiction du Client, hors taxes. La TVA mauricienne (15&nbsp;%) ou la TVA
          européenne applicable est ajoutée sur la facture. Le paiement s&apos;effectue
          mensuellement ou annuellement par carte bancaire, prélèvement SEPA ou virement.
          Tout retard de paiement entraîne, après mise en demeure restée infructueuse
          pendant 8 jours, la suspension du service et l&apos;application d&apos;intérêts
          de retard au taux légal mauricien.
        </p>
      </Section>

      <Section title="3. Durée et reconduction">
        <p>
          L&apos;abonnement est conclu pour une durée minimale d&apos;un (1) mois ou
          d&apos;un (1) an selon l&apos;offre choisie. Il est reconduit tacitement pour des
          périodes équivalentes, sauf résiliation notifiée par l&apos;une ou l&apos;autre
          des parties au moins quinze (15) jours avant l&apos;échéance.
        </p>
      </Section>

      <Section title="4. Résiliation">
        <p>
          Chaque partie peut résilier le contrat par notification écrite à&nbsp;:
          <a href="mailto:contact@lexora.finance"> contact@lexora.finance</a>. En cas de
          manquement grave et persistant de l&apos;une des parties à ses obligations, le
          contrat peut être résilié de plein droit après mise en demeure restée
          infructueuse pendant trente (30) jours. À l&apos;issue de la résiliation, les
          données du Client sont conservées pendant la durée légale de conservation
          comptable (10&nbsp;ans à Maurice) puis supprimées, sauf demande contraire.
        </p>
      </Section>

      <Section title="5. Propriété intellectuelle">
        <p>
          Lexora reste seule titulaire de l&apos;ensemble des droits de propriété
          intellectuelle sur la plateforme, son code source, ses interfaces, ses marques
          et ses bases de données. Le Client bénéficie d&apos;un droit d&apos;usage
          personnel, non-exclusif et non-transférable, limité à la durée de
          l&apos;abonnement. Les données saisies par le Client demeurent sa propriété
          exclusive.
        </p>
      </Section>

      <Section title="6. Limitation de responsabilité">
        <p>
          Lexora s&apos;engage à fournir le service avec diligence et conformément aux
          règles de l&apos;art. La responsabilité de Lexora est limitée aux dommages
          directs et prévisibles, et plafonnée au montant des sommes effectivement payées
          par le Client au cours des douze (12)&nbsp;mois précédant le fait générateur.
          Lexora ne pourra être tenue responsable des dommages indirects (perte
          d&apos;exploitation, perte de chance, préjudice commercial). Le Client demeure
          seul responsable de l&apos;exactitude des données qu&apos;il saisit et des
          déclarations qu&apos;il transmet aux administrations.
        </p>
      </Section>

      <Section title="7. Disponibilité du service">
        <p>
          Lexora s&apos;efforce de garantir une disponibilité de 99,5&nbsp;% sur une base
          mensuelle, hors fenêtres de maintenance planifiée et cas de force majeure. Toute
          indisponibilité prolongée donne droit à un avoir calculé au prorata.
        </p>
      </Section>

      <Section title="8. Protection des données personnelles (RGPD &amp; DPA 2017)">
        <p>
          Lexora traite les données personnelles dans le respect du Règlement européen
          2016/679 (RGPD) et du <em>Data Protection Act 2017</em> de Maurice. Les modalités
          détaillées figurent dans la <a href="/legal/privacy">Politique de
          confidentialité</a>. Lexora agit en qualité de sous-traitant des données de
          comptabilité et de paie de ses Clients.
        </p>
      </Section>

      <Section title="9. Droit applicable et juridiction">
        <p>
          Les présentes CGV sont régies par le droit mauricien. Tout litige relatif à leur
          interprétation ou à leur exécution relèvera de la compétence exclusive des
          tribunaux de Port-Louis, République de Maurice, sauf disposition impérative
          contraire applicable au Client consommateur européen.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          Pour toute question relative aux présentes CGV&nbsp;:&nbsp;
          <a href="mailto:contact@lexora.finance">contact@lexora.finance</a>.
        </p>
      </Section>
    </>
  )
}

function ContentEn() {
  return (
    <>
      <Section title="Preamble">
        <p>
          These General Terms of Sale (the &quot;Terms&quot;) govern the supply, by
          <strong> Digital Data Solutions Ltd</strong> (&quot;Lexora&quot;), of an online
          accounting and management service to professional customers (B2B) established
          in Mauritius or in the European Union. Subscribing to the service implies full
          acceptance of these Terms.
        </p>
      </Section>

      <Section title="1. Purpose">
        <p>
          Lexora provides a SaaS (Software as a Service) platform accessible online for
          (i) bookkeeping under the Mauritius Accounting Standards (IFRS and IFRS for
          SMEs), (ii) Mauritian VAT filing, (iii) payroll, (iv) bank reconciliation and
          (v) financial statements. The exact scope of features is defined in the
          subscribed commercial offer.
        </p>
      </Section>

      <Section title="2. Pricing and payment">
        <p>
          Prices are stated in Mauritian rupees (MUR) or euros (EUR) depending on the
          Customer&apos;s jurisdiction, exclusive of taxes. Mauritian VAT (15%) or
          applicable European VAT is added to the invoice. Payment is made monthly or
          annually by card, SEPA direct debit or wire transfer. Late payment will, after
          a formal notice remaining unsuccessful for 8 days, result in suspension of
          service and statutory late payment interest under Mauritian law.
        </p>
      </Section>

      <Section title="3. Term and renewal">
        <p>
          The subscription is concluded for a minimum term of one (1) month or one (1)
          year depending on the chosen offer. It is tacitly renewed for equivalent
          periods, unless terminated by either party with at least fifteen (15) days&apos;
          notice prior to renewal.
        </p>
      </Section>

      <Section title="4. Termination">
        <p>
          Either party may terminate the agreement by written notice to{" "}
          <a href="mailto:contact@lexora.finance">contact@lexora.finance</a>. In case of
          serious and persistent breach by either party, the agreement may be terminated
          automatically after a formal notice remaining unsuccessful for thirty (30)
          days. Upon termination, Customer data is retained for the legal accounting
          retention period (10 years in Mauritius) and then deleted, unless otherwise
          requested.
        </p>
      </Section>

      <Section title="5. Intellectual property">
        <p>
          Lexora retains all intellectual property rights over the platform, its source
          code, interfaces, trademarks and databases. The Customer is granted a personal,
          non-exclusive, non-transferable right of use, limited to the subscription
          period. Data entered by the Customer remains its exclusive property.
        </p>
      </Section>

      <Section title="6. Limitation of liability">
        <p>
          Lexora undertakes to provide the service diligently and in accordance with
          industry standards. Lexora&apos;s liability is limited to direct and
          foreseeable damages, capped at the amounts actually paid by the Customer during
          the twelve (12) months preceding the triggering event. Lexora shall not be
          liable for indirect damages (loss of business, loss of opportunity, commercial
          prejudice). The Customer remains solely responsible for the accuracy of data
          entered and for filings submitted to authorities.
        </p>
      </Section>

      <Section title="7. Service availability">
        <p>
          Lexora endeavours to ensure 99.5% monthly availability, excluding scheduled
          maintenance windows and force majeure. Prolonged unavailability entitles the
          Customer to a pro-rata credit.
        </p>
      </Section>

      <Section title="8. Personal data (GDPR &amp; DPA 2017)">
        <p>
          Lexora processes personal data in accordance with EU Regulation 2016/679 (GDPR)
          and the Mauritius Data Protection Act 2017. Details are set out in the
          <a href="/legal/privacy"> Privacy Policy</a>. Lexora acts as a processor in
          respect of its Customers&apos; accounting and payroll data.
        </p>
      </Section>

      <Section title="9. Governing law and jurisdiction">
        <p>
          These Terms are governed by Mauritian law. Any dispute relating to their
          interpretation or performance falls within the exclusive jurisdiction of the
          courts of Port-Louis, Republic of Mauritius, save mandatory provisions
          applicable to European consumer Customers.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          For any question relating to these Terms:{" "}
          <a href="mailto:contact@lexora.finance">contact@lexora.finance</a>.
        </p>
      </Section>
    </>
  )
}
