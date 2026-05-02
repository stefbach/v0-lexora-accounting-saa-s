"use client"

import { useState } from "react"
import { LegalPageLayout, Section, type Lang } from "@/components/legal/LegalPageLayout"

const LAST_UPDATED = "2 mai 2026"

export default function PrivacyPage() {
  const [lang, setLang] = useState<Lang>("fr")
  return (
    <LegalPageLayout
      currentPath="/legal/privacy"
      title="Politique de confidentialité"
      titleEn="Privacy Policy"
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
          La présente Politique de confidentialité décrit les modalités selon lesquelles
          <strong> Digital Data Solutions Ltd</strong> (ci-après «&nbsp;Lexora&nbsp;»)
          collecte et traite les données à caractère personnel des utilisateurs de la
          plateforme. Lexora s&apos;efforce d&apos;assurer le plus haut niveau de
          conformité possible avec le Règlement européen 2016/679 (RGPD) et le
          <em> Mauritius Data Protection Act 2017</em>, dans la limite de ses moyens et
          des évolutions réglementaires.
        </p>
      </Section>

      <Section title="1. Responsable du traitement">
        <p>
          Le responsable du traitement est Digital Data Solutions Ltd, BRN C12345678,
          dont le siège est situé à Cybercity, Ebène, République de Maurice. Pour les
          données comptables et de paie de ses Clients, Lexora agit en qualité de
          sous-traitant au sens de l&apos;article&nbsp;28 RGPD&nbsp;; le Client demeure
          le responsable de traitement.
        </p>
      </Section>

      <Section title="2. Données collectées">
        <ul>
          <li><strong>Données de compte</strong> : nom, prénom, e-mail, mot de passe (haché), numéro de téléphone, fonction.</li>
          <li><strong>Données de facturation</strong> : raison sociale, adresse, numéro BRN/TVA, RIB, historique de paiement.</li>
          <li><strong>Données de connexion</strong> : adresse IP, agent utilisateur, horodatage, journaux d&apos;audit.</li>
          <li><strong>Données métier déposées par le Client</strong> : pièces comptables, factures, relevés bancaires, données de paie (salaires, identifiants nationaux), correspondances.</li>
          <li><strong>Cookies techniques</strong> : session, préférences linguistiques, état d&apos;authentification.</li>
        </ul>
      </Section>

      <Section title="3. Finalités et bases légales">
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #E2E5F0", textAlign: "left" }}>
              <th style={{ padding: "8px 6px" }}>Finalité</th>
              <th style={{ padding: "8px 6px" }}>Base légale</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid #F1F2F8" }}>
              <td style={{ padding: "8px 6px" }}>Fourniture du service souscrit</td>
              <td style={{ padding: "8px 6px" }}>Exécution du contrat (art. 6.1.b RGPD)</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #F1F2F8" }}>
              <td style={{ padding: "8px 6px" }}>Facturation et recouvrement</td>
              <td style={{ padding: "8px 6px" }}>Obligation légale (art. 6.1.c)</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #F1F2F8" }}>
              <td style={{ padding: "8px 6px" }}>Conservation comptable et fiscale</td>
              <td style={{ padding: "8px 6px" }}>Obligation légale (Income Tax Act §96, VAT Act)</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #F1F2F8" }}>
              <td style={{ padding: "8px 6px" }}>Sécurité et prévention de la fraude</td>
              <td style={{ padding: "8px 6px" }}>Intérêt légitime (art. 6.1.f)</td>
            </tr>
            <tr>
              <td style={{ padding: "8px 6px" }}>Communication produit</td>
              <td style={{ padding: "8px 6px" }}>Consentement (art. 6.1.a)</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="4. Durées de conservation">
        <ul>
          <li><strong>Données comptables et fiscales</strong> : <em>10&nbsp;ans</em> à compter de la clôture de l&apos;exercice (Income Tax Act 1995 §96 et VAT Act §65 — Maurice)&nbsp;;</li>
          <li><strong>Données de paie</strong> : <em>10&nbsp;ans</em> (Employment Rights Act, Maurice)&nbsp;;</li>
          <li><strong>Données de compte utilisateur</strong> : durée du contrat + 3&nbsp;ans après la dernière connexion&nbsp;;</li>
          <li><strong>Logs techniques d&apos;audit</strong> : 1&nbsp;an&nbsp;;</li>
          <li><strong>Données de prospection</strong> : 3&nbsp;ans à compter du dernier contact.</li>
        </ul>
      </Section>

      <Section title="5. Droits des personnes concernées">
        <p>Conformément au RGPD et au DPA 2017, vous disposez des droits suivants&nbsp;:</p>
        <ul>
          <li>droit d&apos;accès à vos données&nbsp;;</li>
          <li>droit de rectification&nbsp;;</li>
          <li>droit à l&apos;effacement (sous réserve des obligations légales de conservation)&nbsp;;</li>
          <li>droit à la limitation du traitement&nbsp;;</li>
          <li>droit à la portabilité&nbsp;;</li>
          <li>droit d&apos;opposition&nbsp;;</li>
          <li>droit de définir des directives post-mortem&nbsp;;</li>
          <li>droit d&apos;introduire une réclamation auprès de la <em>Data Protection Office</em> de Maurice ou auprès d&apos;une autorité de contrôle européenne (CNIL pour la France).</li>
        </ul>
        <p>
          Pour exercer vos droits&nbsp;: <a href="mailto:dpo@lexora.finance">dpo@lexora.finance</a>.
          Lexora répond dans un délai d&apos;un (1)&nbsp;mois.
        </p>
      </Section>

      <Section title="6. Transferts internationaux">
        <p>
          Les données sont stockées principalement dans l&apos;Union européenne
          (Francfort, Allemagne) chez notre prestataire Supabase. Certains sous-traitants
          techniques (Vercel pour l&apos;hébergement applicatif) peuvent être situés aux
          États-Unis&nbsp;; les transferts sont alors encadrés par les <em>Standard
          Contractual Clauses</em> de la Commission européenne (Décision 2021/914) et,
          le cas échéant, le <em>Data Privacy Framework</em>.
        </p>
      </Section>

      <Section title="7. Sécurité">
        <p>
          Lexora met en œuvre des mesures techniques et organisationnelles appropriées&nbsp;:
          chiffrement TLS 1.2+ en transit, chiffrement au repos, isolation multi-tenant
          via <em>Row Level Security</em> Supabase, MFA, sauvegardes quotidiennes,
          journalisation d&apos;audit, revues d&apos;accès trimestrielles. Aucun système
          n&apos;étant infaillible, Lexora s&apos;engage à notifier toute violation
          confirmée dans un délai de 72&nbsp;heures aux personnes concernées et aux
          autorités compétentes lorsque la réglementation l&apos;impose.
        </p>
      </Section>

      <Section title="8. Cookies">
        <p>
          La plateforme utilise uniquement des cookies strictement nécessaires (session,
          authentification, préférences). Aucun cookie publicitaire ou de mesure
          d&apos;audience tiers n&apos;est déposé sans consentement explicite. Vous
          pouvez configurer votre navigateur pour refuser les cookies, étant précisé que
          certaines fonctionnalités peuvent alors être altérées.
        </p>
      </Section>

      <Section title="9. Sous-traitants">
        <ul>
          <li><strong>Supabase Inc.</strong> — base de données, authentification (région UE)</li>
          <li><strong>Vercel Inc.</strong> — hébergement applicatif (US/UE)</li>
          <li><strong>Resend</strong> — envoi des e-mails transactionnels (UE)</li>
          <li><strong>Stripe</strong> — traitement des paiements (UE/US)</li>
        </ul>
        <p>
          La liste détaillée et à jour est disponible sur demande auprès du DPO.
        </p>
      </Section>

      <Section title="10. Délégué à la protection des données (DPO)">
        <p>
          Lexora a désigné un délégué à la protection des données joignable à&nbsp;:&nbsp;
          <a href="mailto:dpo@lexora.finance">dpo@lexora.finance</a>.
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
          This Privacy Policy describes how <strong>Digital Data Solutions Ltd</strong>{" "}
          (&quot;Lexora&quot;) collects and processes personal data of platform users.
          Lexora endeavours to ensure the highest possible level of compliance with EU
          Regulation 2016/679 (GDPR) and the Mauritius Data Protection Act 2017, to the
          best of its ability and in line with regulatory developments.
        </p>
      </Section>

      <Section title="1. Data controller">
        <p>
          The data controller is Digital Data Solutions Ltd, BRN C12345678, headquartered
          in Cybercity, Ebène, Republic of Mauritius. For Customers&apos; accounting and
          payroll data, Lexora acts as a processor within the meaning of Article 28
          GDPR; the Customer remains the controller.
        </p>
      </Section>

      <Section title="2. Data collected">
        <ul>
          <li><strong>Account data</strong>: first name, last name, email, hashed password, phone number, role.</li>
          <li><strong>Billing data</strong>: company name, address, BRN/VAT number, bank details, payment history.</li>
          <li><strong>Connection data</strong>: IP address, user agent, timestamp, audit logs.</li>
          <li><strong>Business data uploaded by the Customer</strong>: accounting documents, invoices, bank statements, payroll data (salaries, national IDs), correspondence.</li>
          <li><strong>Technical cookies</strong>: session, language preferences, authentication state.</li>
        </ul>
      </Section>

      <Section title="3. Purposes and legal bases">
        <ul>
          <li>Service delivery — performance of contract (Art. 6.1.b GDPR).</li>
          <li>Billing and collection — legal obligation (Art. 6.1.c).</li>
          <li>Accounting and tax retention — legal obligation (Income Tax Act §96, VAT Act).</li>
          <li>Security and fraud prevention — legitimate interest (Art. 6.1.f).</li>
          <li>Product communications — consent (Art. 6.1.a).</li>
        </ul>
      </Section>

      <Section title="4. Retention periods">
        <ul>
          <li><strong>Accounting and tax data</strong>: 10 years from the end of the financial year (Income Tax Act 1995 §96 and VAT Act §65 — Mauritius).</li>
          <li><strong>Payroll data</strong>: 10 years (Employment Rights Act, Mauritius).</li>
          <li><strong>User account data</strong>: term of contract + 3 years after last login.</li>
          <li><strong>Technical audit logs</strong>: 1 year.</li>
          <li><strong>Prospect data</strong>: 3 years from last contact.</li>
        </ul>
      </Section>

      <Section title="5. Data subject rights">
        <p>Under GDPR and the DPA 2017, you have the following rights:</p>
        <ul>
          <li>right of access;</li>
          <li>right to rectification;</li>
          <li>right to erasure (subject to legal retention obligations);</li>
          <li>right to restriction;</li>
          <li>right to data portability;</li>
          <li>right to object;</li>
          <li>right to set post-mortem directives;</li>
          <li>right to lodge a complaint with the Mauritius Data Protection Office or a European supervisory authority (e.g. CNIL in France).</li>
        </ul>
        <p>
          To exercise your rights: <a href="mailto:dpo@lexora.finance">dpo@lexora.finance</a>.
          Lexora responds within one (1) month.
        </p>
      </Section>

      <Section title="6. International transfers">
        <p>
          Data is mainly stored in the European Union (Frankfurt, Germany) with our
          provider Supabase. Some technical sub-processors (Vercel for application
          hosting) may be located in the United States; transfers are then framed by the
          European Commission&apos;s Standard Contractual Clauses (Decision 2021/914)
          and, where applicable, by the Data Privacy Framework.
        </p>
      </Section>

      <Section title="7. Security">
        <p>
          Lexora implements appropriate technical and organisational measures: TLS 1.2+
          encryption in transit, encryption at rest, multi-tenant isolation via Supabase
          Row Level Security, MFA, daily backups, audit logging, quarterly access
          reviews. As no system is infallible, Lexora commits to notifying any
          confirmed breach within 72 hours to data subjects and competent authorities
          when required.
        </p>
      </Section>

      <Section title="8. Cookies">
        <p>
          The platform uses only strictly necessary cookies (session, authentication,
          preferences). No third-party advertising or audience-measurement cookies are
          placed without explicit consent. You may configure your browser to refuse
          cookies; some features may then be impaired.
        </p>
      </Section>

      <Section title="9. Sub-processors">
        <ul>
          <li><strong>Supabase Inc.</strong> — database, authentication (EU region)</li>
          <li><strong>Vercel Inc.</strong> — application hosting (US/EU)</li>
          <li><strong>Resend</strong> — transactional email (EU)</li>
          <li><strong>Stripe</strong> — payment processing (EU/US)</li>
        </ul>
        <p>The full and up-to-date list is available on request from the DPO.</p>
      </Section>

      <Section title="10. Data Protection Officer (DPO)">
        <p>
          Lexora has appointed a Data Protection Officer reachable at:{" "}
          <a href="mailto:dpo@lexora.finance">dpo@lexora.finance</a>.
        </p>
      </Section>
    </>
  )
}
