import type { Metadata } from "next"
import {
  Info,
  Building2,
  LayoutGrid,
  KeyRound,
  Users,
  ShieldCheck,
  Lock,
  XCircle,
  AlertTriangle,
  Scale,
  Brain,
  HeartPulse,
} from "lucide-react"
import {
  LegalShell,
  LegalSection,
  LegalField,
  LegalSubtitle,
} from "@/components/legal/LegalShell"

export const metadata: Metadata = {
  title: "CGU | Lexora",
  description:
    "Conditions Générales d'Utilisation de la plateforme Lexora, ERP comptable et RH piloté par l'IA pour Maurice.",
}

export default function CGUPage() {
  return (
    <LegalShell
      eyebrow="Conditions d'utilisation"
      title="CGU — Conditions Générales d'Utilisation"
      subtitle={
        <>
          Règles d&apos;accès et d&apos;utilisation de la plateforme{" "}
          <strong>Lexora</strong>, ERP mauricien comptable, RH et santé, exploité
          par <strong>Digital Data Solutions Ltd</strong>.
        </>
      }
    >
      {/* 1. Préambule */}
      <LegalSection icon={Info} title="1. Préambule">
        <p style={{ margin: "0 0 12px" }}>
          Les présentes Conditions Générales d&apos;Utilisation (CGU) ont pour
          objet de définir les modalités d&apos;accès et d&apos;utilisation de
          la plateforme Lexora par tout utilisateur (ci-après « l&apos;Utilisateur »),
          qu&apos;il soit dirigeant d&apos;entreprise, gestionnaire,
          expert-comptable, salarié ou partenaire.
        </p>
        <p style={{ margin: "0 0 12px" }}>
          L&apos;accès et l&apos;utilisation de la plateforme impliquent
          l&apos;acceptation pleine et entière des présentes CGU.
        </p>
        <p style={{ margin: 0 }}>
          Lexora est un <strong>éditeur de logiciel SaaS</strong>. Lexora{" "}
          <strong>n&apos;exerce pas</strong> l&apos;activité réglementée
          d&apos;expert-comptable, d&apos;avocat, de conseil juridique ni de
          gestionnaire de paie. La plateforme met à disposition de ses
          utilisateurs des outils automatisés et assistés par intelligence
          artificielle qui demeurent sous la responsabilité et le contrôle du
          professionnel ou du dirigeant utilisateur.
        </p>
      </LegalSection>

      {/* 2. Identité de l'éditeur */}
      <LegalSection icon={Building2} title="2. Identité de l'éditeur">
        <dl style={{ margin: 0 }}>
          <LegalField label="Nom commercial" value="Lexora" />
          <LegalField label="Société exploitante" value="Digital Data Solutions Ltd" />
          <LegalField label="Forme juridique" value="Société à responsabilité limitée (Ltd) de droit mauricien" />
          <LegalField label="Immatriculation (ROC)" value="C20173522" />
          <LegalField label="TVA" value="27816949" />
          <LegalField label="Siège social" value="Bourdet Road, Grand Baie, Maurice" />
          <LegalField label="Téléphone" value="+230 4687378" />
          <LegalField
            label="E-mail de contact"
            value={
              <a href="mailto:contact@lexora.finance" style={{ color: "#4191FF", textDecoration: "none", fontWeight: 600 }}>
                contact@lexora.finance
              </a>
            }
          />
        </dl>
      </LegalSection>

      {/* 3. Description des services */}
      <LegalSection icon={LayoutGrid} title="3. Description des services">
        <p style={{ margin: "0 0 12px" }}>
          La plateforme Lexora propose aux entreprises mauriciennes, à leurs
          dirigeants et à leurs experts-comptables un ensemble de{" "}
          <strong>sept modules intégrés</strong> :
        </p>
        <ul style={{ margin: "0 0 14px", paddingLeft: "20px" }}>
          <li><strong>OCR &amp; Documents IA</strong> — extraction automatique des factures, reçus et relevés bancaires.</li>
          <li><strong>Comptabilité intelligente</strong> — plan comptable mauricien, grand livre, balance, bilan, P&amp;L, rapprochement bancaire automatique.</li>
          <li><strong>Facturation &amp; Templates IA</strong> — factures conformes MRA (IRN, QR Code), multi-devises.</li>
          <li><strong>RH &amp; Paie complète</strong> — bulletins conformes WRA 2019, congés, pointage, exports MRA.</li>
          <li><strong>Juridique &amp; Contrats IA</strong> — générateur de contrats de travail et commerciaux, signature électronique.</li>
          <li><strong>Fiscal MRA</strong> — TVA, IT Form 3, Annual Return ROC, FAR.</li>
          <li><strong>TIBOK · Santé salariés</strong> — téléconsultation médicale intégrée pour les salariés de l&apos;entreprise cliente.</li>
        </ul>
        <p style={{ margin: "0 0 12px" }}>
          L&apos;ensemble est piloté par <strong>six agents d&apos;intelligence
          artificielle</strong> propriétaires (OCR, Rapprochement, Juridique,
          RH, Fiscal, Facturation) dont les productions sont systématiquement
          soumises à la validation humaine de l&apos;utilisateur.
        </p>

        <LegalSubtitle>3.1. Nature du service</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }}>
          Lexora constitue un <strong>outil d&apos;assistance</strong>
          {" "}professionnelle. Les écritures comptables, bulletins de paie,
          déclarations fiscales, contrats de travail et contrats commerciaux
          produits via la plateforme doivent être{" "}
          <strong>contrôlés et validés par un professionnel qualifié</strong>
          {" "}(expert-comptable MIPA, juriste, gestionnaire de paie ou
          dirigeant compétent) avant toute transmission à l&apos;administration
          fiscale (MRA), au Registrar of Companies (ROC), aux banques ou aux
          salariés.
        </p>
        <p style={{ margin: 0 }}>
          Le module santé <strong>TIBOK · Santé salariés</strong> constitue une
          téléconsultation médicale réelle opérée par la plateforme TIBOK
          (également éditée par Digital Data Solutions Ltd). Les consultations
          sont réalisées par des médecins inscrits au{" "}
          <strong>Medical Council of Mauritius</strong>. L&apos;usage de ce
          module est régi par les conditions spécifiques de TIBOK, consultables
          séparément.
        </p>
      </LegalSection>

      {/* 4. Conditions d'accès */}
      <LegalSection icon={KeyRound} title="4. Conditions d'accès">
        <p style={{ margin: "0 0 12px" }}>L&apos;Utilisateur doit :</p>
        <ul style={{ margin: "0 0 14px", paddingLeft: "20px" }}>
          <li>Être majeur (18 ans ou plus) et disposer de la capacité juridique d&apos;engager la société qu&apos;il représente ;</li>
          <li>Disposer d&apos;un accès Internet et d&apos;un appareil compatible (smartphone, tablette ou ordinateur) ;</li>
          <li>Fournir des informations exactes, sincères et à jour lors de son inscription (raison sociale, BRN, NIC, TVA, coordonnées) ;</li>
          <li>Utiliser la plateforme dans l&apos;intérêt de la société cliente qu&apos;il administre ou représente.</li>
        </ul>
        <p style={{ margin: "0 0 12px" }}>
          L&apos;Utilisateur s&apos;engage à ne pas usurper l&apos;identité
          d&apos;un tiers, ni à créer plusieurs comptes sans autorisation
          expresse.
        </p>

        <LegalSubtitle>4.1. Comptes, rôles et sous-comptes</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }}>
          L&apos;accès aux services Lexora nécessite la création d&apos;un{" "}
          <strong>compte société principal</strong> par un utilisateur majeur
          habilité à engager la société. Le titulaire du compte principal peut
          créer plusieurs <strong>sous-comptes utilisateurs</strong> avec des
          rôles différenciés :
        </p>
        <ul style={{ margin: "0 0 14px", paddingLeft: "20px" }}>
          <li><strong>Administrateur</strong> — accès complet ;</li>
          <li><strong>Comptable / Expert-comptable</strong> — accès aux modules Compta, Fiscal, Facturation, OCR ;</li>
          <li><strong>RH / Gestionnaire de paie</strong> — accès aux modules RH, Paie, TIBOK Santé ;</li>
          <li><strong>Juridique</strong> — accès au module Contrats ;</li>
          <li><strong>Salarié</strong> — accès en lecture à son dossier paie, ses bulletins, ses congés et sa téléconsultation TIBOK.</li>
        </ul>
        <p style={{ margin: 0 }}>
          Chaque sous-compte dispose d&apos;un profil individuel, strictement
          confidentiel, accessible uniquement au titulaire concerné et au
          compte administrateur.
        </p>

        <LegalSubtitle>4.2. Programme Expert-Comptable (multi-dossiers)</LegalSubtitle>
        <p style={{ margin: 0 }}>
          Un Expert-Comptable agréé MIPA peut créer un <strong>compte cabinet
          distinct</strong> et accéder en délégation à plusieurs comptes
          société clients, dans la limite des permissions que chaque société
          cliente lui accorde. Les conditions commerciales du programme
          partenaire sont décrites dans les{" "}
          <a href="/cgv" style={{ color: "#4191FF", textDecoration: "none", fontWeight: 600 }}>
            CGV Lexora
          </a>
          .
        </p>
      </LegalSection>

      {/* 5. Obligations */}
      <LegalSection icon={Users} title="5. Obligations de l'Utilisateur">
        <p style={{ margin: "0 0 12px" }}>L&apos;Utilisateur s&apos;engage à :</p>
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          <li>Respecter les règles de courtoisie et de confidentialité lors des échanges avec le support ou les partenaires Lexora ;</li>
          <li>Vérifier, contrôler et valider chaque document produit par l&apos;IA avant transmission à un tiers ou à l&apos;administration ;</li>
          <li>Ne pas perturber le fonctionnement de la plateforme ni tenter d&apos;y accéder de manière frauduleuse (injection, scraping, rétro-ingénierie) ;</li>
          <li>Ne pas détourner le service à des fins commerciales non prévues, frauduleuses ou contraires à l&apos;ordre public ;</li>
          <li>Ne pas importer ou saisir dans la plateforme des données dont il ne détient pas les droits ;</li>
          <li>Conserver la confidentialité de ses identifiants et signaler immédiatement tout accès non autorisé.</li>
        </ul>
      </LegalSection>

      {/* 6. Sécurité et confidentialité */}
      <LegalSection icon={ShieldCheck} title="6. Sécurité et confidentialité">
        <p style={{ margin: "0 0 12px" }}>
          La plateforme Lexora met en œuvre toutes les mesures nécessaires pour
          garantir la sécurité, la disponibilité et la confidentialité des
          données :
        </p>
        <ul style={{ margin: "0 0 14px", paddingLeft: "20px" }}>
          <li>Hébergement sur des serveurs <strong>Supabase</strong> conformes SOC 2 Type II, ISO 27001 et HIPAA ;</li>
          <li>Chiffrement en transit (TLS 1.3) et au repos (AES-256) ;</li>
          <li>Authentification sécurisée multi-facteurs pour les comptes à privilèges élevés ;</li>
          <li>Traçabilité complète des accès, signatures et modifications (audit trail) ;</li>
          <li>Sauvegardes chiffrées quotidiennes avec rétention de 30 jours.</li>
        </ul>
        <p style={{ margin: "0 0 12px" }}>
          Certaines fonctionnalités reposent sur des outils d&apos;intelligence
          artificielle (voir section 12) dont les échanges avec le prestataire
          Anthropic sont <strong>anonymisés et chiffrés</strong>. Le
          professionnel ou le dirigeant utilisateur garde le plein contrôle des
          décisions finales.
        </p>
        <p style={{ margin: 0 }}>
          L&apos;Utilisateur peut à tout moment consulter, rectifier, exporter
          ou demander la suppression de ses données via son espace ou en
          écrivant à{" "}
          <a href="mailto:dpo@lexora.finance" style={{ color: "#4191FF", textDecoration: "none", fontWeight: 600 }}>
            dpo@lexora.finance
          </a>
          .
        </p>
      </LegalSection>

      {/* 7. Propriété intellectuelle */}
      <LegalSection icon={Lock} title="7. Propriété intellectuelle">
        <p style={{ margin: "0 0 12px" }}>
          Tous les éléments de la plateforme (textes, logos, marques, logiciels,
          interfaces, algorithmes, templates de factures, modèles de contrats,
          bibliothèques d&apos;écritures comptables pré-paramétrées, bases de
          données) sont protégés par le droit d&apos;auteur, des marques ou du
          droit <em>sui generis</em> des bases de données.
        </p>
        <p style={{ margin: 0 }}>
          Toute reproduction, représentation, extraction, rétro-ingénierie ou
          réutilisation non autorisée, totale ou partielle, est strictement
          interdite sans autorisation écrite préalable de{" "}
          <strong>Digital Data Solutions Ltd</strong>. Les données saisies par
          l&apos;Utilisateur lui appartiennent et restent sa propriété.
        </p>
      </LegalSection>

      {/* 8. Suspension / résiliation */}
      <LegalSection icon={XCircle} title="8. Suspension ou résiliation du compte">
        <p style={{ margin: "0 0 12px" }}>
          Digital Data Solutions Ltd se réserve le droit de suspendre ou de
          supprimer un compte utilisateur en cas de :
        </p>
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          <li>Comportement inapproprié ou menaçant vis-à-vis du support ou des partenaires ;</li>
          <li>Non-respect des présentes CGU ou de la législation mauricienne en vigueur ;</li>
          <li>Usage abusif ou frauduleux du service (fraude à la TVA, fausses écritures, usurpation d&apos;identité) ;</li>
          <li>Défaut de paiement persistant (voir CGV).</li>
        </ul>
      </LegalSection>

      {/* 9. Limitations du service */}
      <LegalSection icon={AlertTriangle} title="9. Limitations du service">
        <p style={{ margin: "0 0 12px" }}>La plateforme Lexora ne permet pas :</p>
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          <li>Le <strong>conseil fiscal ou juridique personnalisé</strong> : les contenus sont des outils d&apos;assistance, l&apos;analyse finale incombe à un professionnel qualifié ;</li>
          <li>La <strong>certification des comptes annuels</strong> (laquelle relève exclusivement d&apos;un expert-comptable agréé MIPA) ;</li>
          <li>Le dépôt automatisé de documents officiels auprès de la MRA ou du ROC sans validation humaine explicite ;</li>
          <li>L&apos;utilisation à des fins d&apos;opérations financières illicites, de blanchiment ou de fraude fiscale ;</li>
          <li>La prescription médicale ou le diagnostic santé hors du cadre réglementé de TIBOK (section 3).</li>
        </ul>
      </LegalSection>

      {/* 10. Limitation de responsabilité */}
      <LegalSection icon={HeartPulse} title="10. Limitation de responsabilité">
        <p style={{ margin: "0 0 12px" }}>Digital Data Solutions Ltd ne peut être tenue pour responsable :</p>
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          <li>D&apos;un dysfonctionnement lié au réseau ou à l&apos;appareil de l&apos;Utilisateur ;</li>
          <li>D&apos;une écriture comptable, déclaration fiscale, bulletin de paie ou contrat validé et transmis par l&apos;Utilisateur, qui relève de sa responsabilité professionnelle exclusive ;</li>
          <li>D&apos;un redressement fiscal, pénalité MRA ou litige issu d&apos;une donnée erronée saisie par l&apos;Utilisateur ;</li>
          <li>D&apos;une mauvaise utilisation ou interprétation des informations délivrées via la plateforme ;</li>
          <li>D&apos;un acte médical réalisé via le module TIBOK, lequel relève exclusivement de la responsabilité du médecin consulté.</li>
        </ul>
      </LegalSection>

      {/* 11. Droit applicable */}
      <LegalSection icon={Scale} title="11. Droit applicable — Litiges">
        <p style={{ margin: 0 }}>
          Les présentes CGU sont régies par la{" "}
          <strong>loi mauricienne</strong>. Tout litige sera porté devant la
          juridiction compétente de <strong>Port-Louis (île Maurice)</strong>,
          après tentative amiable de résolution.
        </p>
      </LegalSection>

      {/* 12. IA */}
      <LegalSection icon={Brain} title="12. Assistance par intelligence artificielle">
        <LegalSubtitle>Utilisation d&apos;outils propriétaires d&apos;IA</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }}>
          Les utilisateurs de Lexora (experts-comptables, juristes,
          gestionnaires de paie, dirigeants) sont assistés par six agents
          propriétaires — OCR, Rapprochement, Juridique, RH, Fiscal,
          Facturation — développés en interne et reposant sur l&apos;API{" "}
          <strong>Anthropic (Claude)</strong>. Ces outils constituent un
          support à l&apos;analyse et à la production, sans jamais remplacer le
          jugement ni la responsabilité du professionnel utilisateur.
        </p>

        <LegalSubtitle>Anonymisation et sécurité</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }}>
          Lors du traitement par les agents IA, les données transmises sont
          strictement <strong>anonymisées</strong> et{" "}
          <strong>cryptées</strong>. Aucune donnée nominative (nom, prénom,
          NIC, coordonnées bancaires, identifiants fiscaux) n&apos;est envoyée
          à l&apos;API sous forme identifiante. Seules les informations métier
          non identifiantes, nécessaires à l&apos;assistance, sont traitées.
        </p>
        <p style={{ margin: "0 0 12px" }}>
          Les communications sont protégées par des protocoles de chiffrement
          avancés (TLS 1.3 en transit, AES-256 au repos). Conformément aux
          engagements de notre prestataire IA,{" "}
          <strong>les données envoyées ne sont pas utilisées pour entraîner
          les modèles</strong>.
        </p>

        <LegalSubtitle>Consentement de l&apos;Utilisateur</LegalSubtitle>
        <p style={{ margin: 0 }}>
          L&apos;Utilisateur est informé que l&apos;IA constitue uniquement un
          outil d&apos;assistance et qu&apos;un professionnel (expert-comptable,
          juriste, gestionnaire de paie, dirigeant) valide personnellement et{" "}
          <em>in fine</em> les écritures, déclarations, bulletins et contrats.
          Le consentement explicite est recueilli à l&apos;inscription pour
          tout traitement de données via ces agents.
        </p>
      </LegalSection>
    </LegalShell>
  )
}
