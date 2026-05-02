"use client"

import { useState } from "react"
import { LegalPageLayout, Section, type Lang } from "@/components/legal/LegalPageLayout"

const LAST_UPDATED = "2 mai 2026"

export default function CguPage() {
  const [lang, setLang] = useState<Lang>("fr")
  return (
    <LegalPageLayout
      currentPath="/legal/cgu"
      title="Conditions Générales d'Utilisation"
      titleEn="General Terms of Use"
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
          Les présentes Conditions Générales d&apos;Utilisation (ci-après «&nbsp;CGU&nbsp;»)
          régissent l&apos;accès et l&apos;utilisation de la plateforme <strong>Lexora</strong>.
          Toute personne accédant au service en qualité d&apos;utilisateur (employé,
          collaborateur du Client, comptable, salarié) est tenue de respecter les
          présentes CGU.
        </p>
      </Section>

      <Section title="1. Compte utilisateur">
        <p>
          L&apos;accès aux fonctionnalités de la plateforme nécessite la création
          d&apos;un compte personnel. L&apos;utilisateur s&apos;engage à&nbsp;:
        </p>
        <ul>
          <li>fournir des informations exactes, à jour et complètes lors de l&apos;inscription&nbsp;;</li>
          <li>conserver la confidentialité de ses identifiants (e-mail, mot de passe, code MFA)&nbsp;;</li>
          <li>notifier immédiatement Lexora en cas de perte ou de suspicion de compromission&nbsp;;</li>
          <li>ne pas créer de compte au nom d&apos;une tierce personne sans son autorisation explicite.</li>
        </ul>
        <p>
          L&apos;utilisateur est seul responsable des actions effectuées sous son
          identifiant. Une session inactive est automatiquement déconnectée après une
          période de sécurité.
        </p>
      </Section>

      <Section title="2. Comportement attendu">
        <p>
          L&apos;utilisateur s&apos;engage à utiliser la plateforme dans le respect des
          lois en vigueur, notamment&nbsp;:
        </p>
        <ul>
          <li>ne pas tenter d&apos;accéder à des données qui ne lui sont pas destinées (autres tenants, autres rôles)&nbsp;;</li>
          <li>ne pas effectuer d&apos;ingénierie inverse, de scraping massif ou de tentatives d&apos;intrusion&nbsp;;</li>
          <li>ne pas saisir de contenus illicites, diffamatoires, frauduleux ou contraires aux bonnes mœurs&nbsp;;</li>
          <li>ne pas utiliser la plateforme à des fins de blanchiment, de fraude fiscale ou de financement du terrorisme&nbsp;;</li>
          <li>respecter les droits de propriété intellectuelle de Lexora et des tiers.</li>
        </ul>
      </Section>

      <Section title="3. Contenu utilisateur">
        <p>
          L&apos;utilisateur conserve la propriété exclusive des contenus qu&apos;il
          dépose sur la plateforme (factures, justificatifs, fichiers de paie, données
          comptables). Il concède à Lexora une licence non-exclusive, limitée aux seules
          opérations techniques nécessaires à l&apos;exécution du service (stockage,
          affichage, indexation, sauvegarde, restitution).
        </p>
        <p>
          L&apos;utilisateur garantit qu&apos;il dispose de l&apos;ensemble des droits
          nécessaires sur les contenus déposés et qu&apos;ils ne portent atteinte à aucun
          droit de tiers.
        </p>
      </Section>

      <Section title="4. Suspension et résiliation">
        <p>
          Lexora se réserve le droit de suspendre ou de résilier l&apos;accès d&apos;un
          utilisateur en cas&nbsp;:
        </p>
        <ul>
          <li>de manquement grave aux présentes CGU&nbsp;;</li>
          <li>d&apos;atteinte à la sécurité de la plateforme&nbsp;;</li>
          <li>de violation des droits d&apos;un tiers ou d&apos;une autorité&nbsp;;</li>
          <li>de demande motivée de l&apos;administrateur du Client (employeur).</li>
        </ul>
        <p>
          La suspension est notifiée par e-mail. L&apos;utilisateur dispose d&apos;un délai
          raisonnable pour faire valoir ses observations, sauf urgence sécuritaire.
        </p>
      </Section>

      <Section title="5. Évolution des CGU">
        <p>
          Lexora peut modifier les présentes CGU pour des raisons légales ou pour refléter
          l&apos;évolution du service. Les modifications substantielles seront notifiées
          au moins quinze (15)&nbsp;jours avant leur entrée en vigueur. La poursuite de
          l&apos;utilisation du service vaut acceptation.
        </p>
      </Section>

      <Section title="6. Contact">
        <p>
          Pour toute question relative aux présentes CGU&nbsp;:&nbsp;
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
          These General Terms of Use (&quot;Terms of Use&quot;) govern access to and use
          of the <strong>Lexora</strong> platform. Any person accessing the service as a
          user (employee, Customer&apos;s collaborator, accountant, payroll user) is
          required to comply with these Terms of Use.
        </p>
      </Section>

      <Section title="1. User account">
        <p>Access to the platform requires the creation of a personal account. The user agrees to:</p>
        <ul>
          <li>provide accurate, up-to-date and complete information at sign-up;</li>
          <li>keep credentials (email, password, MFA code) confidential;</li>
          <li>notify Lexora immediately of any loss or suspected compromise;</li>
          <li>not create an account on behalf of a third party without explicit authorisation.</li>
        </ul>
        <p>
          The user is solely responsible for actions taken under their identifier.
          Inactive sessions are automatically disconnected after a security period.
        </p>
      </Section>

      <Section title="2. Expected behaviour">
        <p>The user undertakes to use the platform in compliance with applicable laws, including:</p>
        <ul>
          <li>not attempting to access data not intended for them (other tenants, other roles);</li>
          <li>not engaging in reverse engineering, mass scraping or intrusion attempts;</li>
          <li>not entering unlawful, defamatory, fraudulent or indecent content;</li>
          <li>not using the platform for money laundering, tax fraud or terrorism financing;</li>
          <li>respecting Lexora&apos;s and third parties&apos; intellectual property rights.</li>
        </ul>
      </Section>

      <Section title="3. User content">
        <p>
          The user retains exclusive ownership of the content uploaded to the platform
          (invoices, receipts, payroll files, accounting data). The user grants Lexora a
          non-exclusive licence, limited to the technical operations strictly necessary
          to perform the service (storage, display, indexing, backup, restitution).
        </p>
        <p>
          The user warrants that they hold all necessary rights over uploaded content and
          that it does not infringe any third-party rights.
        </p>
      </Section>

      <Section title="4. Suspension and termination">
        <p>Lexora reserves the right to suspend or terminate a user&apos;s access in case of:</p>
        <ul>
          <li>serious breach of these Terms of Use;</li>
          <li>compromise of the platform&apos;s security;</li>
          <li>infringement of a third party&apos;s rights or of an authority;</li>
          <li>justified request from the Customer&apos;s administrator (employer).</li>
        </ul>
        <p>
          Suspension is notified by email. The user has a reasonable period to submit
          observations, save in case of security urgency.
        </p>
      </Section>

      <Section title="5. Changes to the Terms of Use">
        <p>
          Lexora may amend these Terms of Use for legal reasons or to reflect changes to
          the service. Material amendments will be notified at least fifteen (15) days
          before they take effect. Continued use of the service constitutes acceptance.
        </p>
      </Section>

      <Section title="6. Contact">
        <p>
          For any question relating to these Terms of Use:{" "}
          <a href="mailto:contact@lexora.finance">contact@lexora.finance</a>.
        </p>
      </Section>
    </>
  )
}
