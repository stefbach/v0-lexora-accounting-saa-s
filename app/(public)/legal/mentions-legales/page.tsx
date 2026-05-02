"use client"

import { useState } from "react"
import { LegalPageLayout, Section, type Lang } from "@/components/legal/LegalPageLayout"

const LAST_UPDATED = "2 mai 2026"

export default function MentionsLegalesPage() {
  const [lang, setLang] = useState<Lang>("fr")
  return (
    <LegalPageLayout
      currentPath="/legal/mentions-legales"
      title="Mentions légales"
      titleEn="Legal Notice"
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
      <Section title="1. Éditeur du site">
        <p>
          Le présent site et la plateforme <strong>Lexora</strong> sont édités par&nbsp;:
        </p>
        <ul>
          <li><strong>Raison sociale</strong> : Digital Data Solutions Ltd</li>
          <li><strong>Forme juridique</strong> : Société privée à responsabilité limitée (Private Company Limited by Shares)</li>
          <li><strong>Numéro BRN</strong> : C12345678 (Business Registration Number, Maurice)</li>
          <li><strong>Numéro TAN</strong> : 27812345 (Tax Account Number)</li>
          <li><strong>Siège social</strong> : Cybercity, Ebène, République de Maurice</li>
          <li><strong>Représentant légal</strong> : Le Directeur Général</li>
          <li><strong>Capital social</strong> : MUR 1 000 000</li>
          <li><strong>Contact</strong> : <a href="mailto:contact@lexora.finance">contact@lexora.finance</a></li>
        </ul>
      </Section>

      <Section title="2. Hébergeur">
        <p>
          La plateforme est hébergée par&nbsp;:
        </p>
        <ul>
          <li><strong>Vercel Inc.</strong> — 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis (frontend Next.js)</li>
          <li><strong>Supabase Inc.</strong> — 970 Toa Payoh North #07-04, Singapour 318992 (base de données et authentification, région UE&nbsp;: Frankfurt)</li>
        </ul>
        <p>
          Les données comptables sont stockées dans l&apos;Union européenne (Francfort, Allemagne)
          afin d&apos;assurer un haut niveau de protection conforme au RGPD.
        </p>
      </Section>

      <Section title="3. Directeur de la publication">
        <p>
          Le Directeur de la publication est le représentant légal de Digital Data Solutions Ltd,
          joignable à l&apos;adresse <a href="mailto:contact@lexora.finance">contact@lexora.finance</a>.
        </p>
      </Section>

      <Section title="4. Propriété intellectuelle">
        <p>
          L&apos;ensemble des éléments de la plateforme Lexora (textes, logos, code source,
          interfaces, bases de données) est protégé par les législations applicables en
          matière de propriété intellectuelle, notamment la <em>Copyright Act 1997</em> de
          Maurice. Toute reproduction non autorisée est interdite.
        </p>
      </Section>

      <Section title="5. Contact">
        <p>
          Pour toute question relative au site&nbsp;:&nbsp;
          <a href="mailto:contact@lexora.finance">contact@lexora.finance</a>
          <br />
          Pour les demandes liées aux données personnelles&nbsp;:&nbsp;
          <a href="mailto:dpo@lexora.finance">dpo@lexora.finance</a>
        </p>
      </Section>
    </>
  )
}

function ContentEn() {
  return (
    <>
      <Section title="1. Publisher">
        <p>
          This website and the <strong>Lexora</strong> platform are published by:
        </p>
        <ul>
          <li><strong>Company name</strong>: Digital Data Solutions Ltd</li>
          <li><strong>Legal form</strong>: Private Company Limited by Shares</li>
          <li><strong>BRN</strong>: C12345678 (Business Registration Number, Mauritius)</li>
          <li><strong>TAN</strong>: 27812345 (Tax Account Number)</li>
          <li><strong>Registered office</strong>: Cybercity, Ebène, Republic of Mauritius</li>
          <li><strong>Legal representative</strong>: The Managing Director</li>
          <li><strong>Share capital</strong>: MUR 1,000,000</li>
          <li><strong>Contact</strong>: <a href="mailto:contact@lexora.finance">contact@lexora.finance</a></li>
        </ul>
      </Section>

      <Section title="2. Hosting">
        <p>The platform is hosted by:</p>
        <ul>
          <li><strong>Vercel Inc.</strong> — 440 N Barranca Avenue #4133, Covina, CA 91723, USA (Next.js frontend)</li>
          <li><strong>Supabase Inc.</strong> — 970 Toa Payoh North #07-04, Singapore 318992 (database and authentication, EU region: Frankfurt)</li>
        </ul>
        <p>
          Accounting data is stored in the European Union (Frankfurt, Germany) to ensure
          a high level of protection compliant with GDPR.
        </p>
      </Section>

      <Section title="3. Publishing director">
        <p>
          The Publishing Director is the legal representative of Digital Data Solutions Ltd,
          reachable at <a href="mailto:contact@lexora.finance">contact@lexora.finance</a>.
        </p>
      </Section>

      <Section title="4. Intellectual property">
        <p>
          All elements of the Lexora platform (texts, logos, source code, interfaces,
          databases) are protected by applicable intellectual property laws, including the
          Mauritius <em>Copyright Act 1997</em>. Any unauthorised reproduction is prohibited.
        </p>
      </Section>

      <Section title="5. Contact">
        <p>
          General queries: <a href="mailto:contact@lexora.finance">contact@lexora.finance</a>
          <br />
          Data protection queries: <a href="mailto:dpo@lexora.finance">dpo@lexora.finance</a>
        </p>
      </Section>
    </>
  )
}
