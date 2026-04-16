import Link from "next/link"
import type { Metadata } from "next"
import { LexoraLogo } from "@/components/LexoraLogo"
import {
  Building2,
  Server,
  ShieldCheck,
  Scale,
  Brain,
  Lock,
  FileText,
  Mail,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react"

export const metadata: Metadata = {
  title: "Mentions légales | Lexora",
  description:
    "Mentions légales, hébergement, protection des données et IA : informations officielles concernant la plateforme Lexora, éditée par Digital Data Solutions Ltd à Maurice.",
}

const FONT = "'Poppins', sans-serif"

const C = {
  bg: "#F8F9FC",
  dark: "#0B0F2E",
  darkSoft: "#141C4A",
  white: "#FFFFFF",
  border: "#E2E5F0",
  borderDark: "#1E2760",
  text: "#0B0F2E",
  muted: "#475569",
  mutedLight: "#A8AFC7",
  accent: "#4191FF",
  gold: "#D4AF37",
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <section
      style={{
        backgroundColor: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: "16px",
        padding: "32px",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 12px 24px -16px rgba(15,23,42,0.12)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "18px" }}>
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "44px",
            height: "44px",
            borderRadius: "12px",
            background: `linear-gradient(135deg, ${C.accent}1F 0%, ${C.accent}0A 100%)`,
            border: `1px solid ${C.accent}40`,
            color: C.accent,
            flexShrink: 0,
          }}
        >
          <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <h2
          style={{
            color: C.text,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: "22px",
            letterSpacing: "-0.01em",
            margin: 0,
          }}
        >
          {title}
        </h2>
      </div>
      <div
        style={{
          color: C.muted,
          fontFamily: FONT,
          fontSize: "15px",
          lineHeight: 1.75,
        }}
      >
        {children}
      </div>
    </section>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(160px, 220px) 1fr",
        gap: "16px",
        padding: "10px 0",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <dt style={{ color: C.muted, fontWeight: 500 }}>{label}</dt>
      <dd style={{ color: C.text, fontWeight: 500, margin: 0 }}>{value}</dd>
    </div>
  )
}

export default function MentionsLegalesPage() {
  return (
    <div style={{ backgroundColor: C.bg, minHeight: "100vh", fontFamily: FONT }}>
      {/* NAV — minimal, dark */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backgroundColor: C.dark,
          borderBottom: `1px solid ${C.borderDark}`,
        }}
      >
        <div
          style={{
            maxWidth: "1100px",
            margin: "0 auto",
            padding: "0 24px",
            height: "72px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <LexoraLogo href="/" size="md" showBaseline />
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "14px",
              fontWeight: 500,
              color: "#A8AFC7",
              textDecoration: "none",
              padding: "8px 14px",
              borderRadius: "8px",
              border: `1px solid ${C.borderDark}`,
              transition: "color 0.2s",
            }}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Retour à l&apos;accueil
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section
        style={{
          padding: "56px 24px 32px",
          textAlign: "center",
          maxWidth: "900px",
          margin: "0 auto",
        }}
      >
        <span
          style={{
            display: "inline-block",
            fontSize: "11px",
            fontWeight: 700,
            color: C.accent,
            backgroundColor: `${C.accent}14`,
            border: `1px solid ${C.accent}30`,
            padding: "6px 14px",
            borderRadius: "999px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: "18px",
          }}
        >
          Information officielle
        </span>
        <h1
          style={{
            color: C.text,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: "clamp(32px, 4.5vw, 48px)",
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            margin: "0 0 14px",
          }}
        >
          Mentions légales
        </h1>
        <p
          style={{
            color: C.muted,
            fontSize: "17px",
            lineHeight: 1.7,
            margin: "0 auto",
            maxWidth: "700px",
          }}
        >
          Informations légales relatives à la plateforme{" "}
          <strong style={{ color: C.text }}>Lexora</strong>, éditée par{" "}
          <strong style={{ color: C.text }}>Digital Data Solutions Ltd</strong> à
          Maurice.
        </p>
      </section>

      {/* CONTENT */}
      <main
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          padding: "20px 24px 80px",
          display: "grid",
          gap: "20px",
        }}
      >
        {/* 1. Éditeur */}
        <Section icon={Building2} title="Éditeur de la plateforme">
          <dl style={{ margin: 0 }}>
            <Field label="Nom commercial" value="Lexora" />
            <Field label="Société exploitante" value="Digital Data Solutions Ltd" />
            <Field label="Forme juridique" value="Société à responsabilité limitée (Ltd)" />
            <Field label="Numéro d'immatriculation" value="C20173522" />
            <Field label="TVA" value="27816949" />
            <Field label="Siège social" value="Bourdet Road, Grand Baie, Maurice" />
            <Field label="Téléphone" value="+230 4687378" />
            <Field
              label="E-mail de contact"
              value={
                <a
                  href="mailto:contact@lexora.finance"
                  style={{ color: C.accent, textDecoration: "none", fontWeight: 600 }}
                >
                  contact@lexora.finance
                </a>
              }
            />
          </dl>
        </Section>

        {/* 2. Hébergement */}
        <Section icon={Server} title="Hébergement">
          <p style={{ margin: "0 0 12px" }}>
            La plateforme Lexora s&apos;appuie sur une infrastructure cloud
            sécurisée de niveau entreprise. L&apos;application est hébergée sur{" "}
            <strong style={{ color: C.text }}>Vercel Inc.</strong> (440 N
            Barranca Ave #4133, Covina, CA 91723, États-Unis), prestataire
            certifié <strong style={{ color: C.text }}>ISO 27001</strong> et{" "}
            <strong style={{ color: C.text }}>SOC 2 Type II</strong>.
          </p>
          <p style={{ margin: "0 0 12px" }}>
            Les données comptables, fiscales, RH et de paie sont stockées de
            manière chiffrée sur{" "}
            <strong style={{ color: C.text }}>Supabase</strong>{" "}
            (PostgreSQL managé), infrastructure conforme{" "}
            <strong style={{ color: C.text }}>SOC 2 Type II</strong>,{" "}
            <strong style={{ color: C.text }}>HIPAA</strong> et{" "}
            <strong style={{ color: C.text }}>ISO 27001</strong>, au sein de
            datacenters européens sous surveillance 24/7.
          </p>
          <p style={{ margin: 0 }}>
            L&apos;ensemble des échanges est protégé en transit par TLS 1.3 et
            au repos par chiffrement AES-256, garantissant la{" "}
            <strong style={{ color: C.text }}>confidentialité</strong>,
            l&apos;<strong style={{ color: C.text }}>intégrité</strong> et la{" "}
            <strong style={{ color: C.text }}>disponibilité</strong> des
            informations financières et personnelles de nos utilisateurs.
          </p>
        </Section>

        {/* 3. Responsabilité éditoriale */}
        <Section icon={FileText} title="Responsabilité éditoriale">
          <p style={{ margin: "0 0 12px" }}>
            La société{" "}
            <strong style={{ color: C.text }}>Digital Data Solutions Ltd</strong>, en
            tant qu&apos;éditeur de la plateforme Lexora, est responsable du
            contenu publié et de la conformité réglementaire du site.
          </p>
          <p style={{ margin: "0 0 12px" }}>
            Les contenus à portée{" "}
            <strong style={{ color: C.text }}>comptable et fiscale</strong>{" "}
            sont rédigés et validés par des experts-comptables et fiscalistes
            inscrits au registre du{" "}
            <strong style={{ color: C.text }}>
              Mauritius Institute of Professional Accountants (MIPA)
            </strong>
            . Les contenus à portée{" "}
            <strong style={{ color: C.text }}>juridique</strong> (contrats de
            travail, contrats commerciaux, NDA, etc.) sont établis en conformité
            avec le{" "}
            <strong style={{ color: C.text }}>Workers&apos; Rights Act 2019</strong>,
            le <strong style={{ color: C.text }}>Contract Act</strong> et le{" "}
            <strong style={{ color: C.text }}>Data Protection Act 2017</strong>{" "}
            mauriciens.
          </p>
          <p style={{ margin: "0 0 12px" }}>
            Le module santé{" "}
            <strong style={{ color: C.text }}>TIBOK · Santé salariés</strong>,
            intégré à Lexora, est opéré par la plateforme TIBOK. Les contenus à
            visée médicale sont exclusivement rédigés ou validés par des
            professionnels de santé inscrits au{" "}
            <strong style={{ color: C.text }}>Medical Council of Mauritius</strong>.
          </p>
          <p style={{ margin: 0 }}>
            Toute utilisation frauduleuse, abusive ou contraire à l&apos;éthique
            entraînera la suppression immédiate du compte utilisateur et pourra
            faire l&apos;objet de poursuites.
          </p>
        </Section>

        {/* 4. Protection des données personnelles */}
        <Section icon={ShieldCheck} title="Protection des données personnelles">
          <p style={{ margin: "0 0 12px" }}>
            Lexora collecte et traite des données personnelles, comptables, de
            paie et fiscales dans le strict respect du{" "}
            <strong style={{ color: C.text }}>
              Data Protection Act 2017 (Mauritius)
            </strong>
            , du <strong style={{ color: C.text }}>GDPR</strong> (pour les
            utilisateurs concernés) et des normes internationales applicables.
          </p>
          <p style={{ margin: "0 0 12px" }}>
            Les données sont conservées de manière chiffrée sur des serveurs
            Supabase conformes aux normes SOC 2 Type II, HIPAA et ISO 27001.{" "}
            <strong style={{ color: C.text }}>
              Elles ne sont jamais cédées, vendues ni exploitées à des fins
              commerciales.
            </strong>{" "}
            Lexora ne consulte vos données que pour fournir le service et
            répondre aux obligations légales vis-à-vis de l&apos;administration
            mauricienne (MRA, ROC).
          </p>
          <p style={{ margin: "0 0 12px" }}>
            Un{" "}
            <strong style={{ color: C.text }}>
              Délégué à la Protection des Données (DPO)
            </strong>{" "}
            a été désigné conformément à la loi afin de veiller au respect des
            obligations légales et réglementaires.
          </p>
          <p style={{ margin: 0 }}>
            Pour toute demande relative à vos données personnelles (accès,
            rectification, portabilité, suppression), vous pouvez écrire à :{" "}
            <a
              href="mailto:dpo@lexora.finance"
              style={{ color: C.accent, textDecoration: "none", fontWeight: 600 }}
            >
              dpo@lexora.finance
            </a>
            .
          </p>
        </Section>

        {/* 5. Propriété intellectuelle */}
        <Section icon={Lock} title="Droits de propriété intellectuelle">
          <p style={{ margin: "0 0 12px" }}>
            La marque <strong style={{ color: C.text }}>Lexora</strong>, le
            logo, le contenu du site (textes, images, vidéos, interfaces,
            composants logiciels), les modèles de contrats générés, les
            algorithmes d&apos;IA propriétaires et les templates de factures
            sont protégés au titre de la propriété intellectuelle.
          </p>
          <p style={{ margin: 0 }}>
            Toute reproduction, représentation, adaptation, traduction, rétro-
            ingénierie ou extraction non autorisée, totale ou partielle, est
            strictement interdite sans accord écrit préalable de{" "}
            <strong style={{ color: C.text }}>Digital Data Solutions Ltd</strong>.
          </p>
        </Section>

        {/* 6. Loi applicable */}
        <Section icon={Scale} title="Loi applicable">
          <p style={{ margin: 0 }}>
            Le présent site est soumis à la{" "}
            <strong style={{ color: C.text }}>législation mauricienne</strong>.
            Tout litige relatif à son utilisation relève de la compétence
            exclusive des juridictions de{" "}
            <strong style={{ color: C.text }}>Port-Louis (île Maurice)</strong>,
            sauf disposition contraire d&apos;ordre public.
          </p>
        </Section>

        {/* 7. IA — assistance */}
        <Section
          icon={Brain}
          title="Intelligence artificielle et traitement des données"
        >
          <h3
            style={{
              color: C.text,
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: "16px",
              margin: "0 0 10px",
            }}
          >
            Utilisation d&apos;outils d&apos;IA pour assister les métiers
          </h3>
          <p style={{ margin: "0 0 16px" }}>
            Lexora embarque six agents propriétaires d&apos;assistance
            (<strong style={{ color: C.text }}>OCR</strong>,{" "}
            <strong style={{ color: C.text }}>Rapprochement</strong>,{" "}
            <strong style={{ color: C.text }}>Juridique</strong>,{" "}
            <strong style={{ color: C.text }}>RH</strong>,{" "}
            <strong style={{ color: C.text }}>Fiscal</strong>,{" "}
            <strong style={{ color: C.text }}>Facturation</strong>), développés
            en interne et reposant sur l&apos;API{" "}
            <strong style={{ color: C.text }}>Anthropic (Claude)</strong>. Ces
            agents constituent un{" "}
            <em>support à l&apos;analyse et à la production</em>, sans jamais
            remplacer le jugement ni la responsabilité de l&apos;expert-comptable,
            du juriste, du gestionnaire de paie ou du dirigeant en charge de
            valider le document final.
          </p>
          <p style={{ margin: "0 0 16px" }}>
            Les écritures comptables, déclarations fiscales, bulletins de paie
            et contrats générés par l&apos;IA sont{" "}
            <strong style={{ color: C.text }}>
              systématiquement soumis à la validation humaine
            </strong>{" "}
            de l&apos;utilisateur avant toute transmission à un tiers ou à
            l&apos;administration (MRA, ROC, banques, salariés).
          </p>

          <h3
            style={{
              color: C.text,
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: "16px",
              margin: "16px 0 10px",
            }}
          >
            Anonymisation et sécurité des données envoyées à l&apos;IA
          </h3>
          <p style={{ margin: "0 0 12px" }}>
            Lors du traitement des informations par les agents IA, les données
            transmises sont <strong style={{ color: C.text }}>anonymisées</strong>{" "}
            et <strong style={{ color: C.text }}>chiffrées</strong>. En aucune
            circonstance des données nominatives (nom, prénom, NIC, coordonnées
            bancaires, numéros d&apos;identifiants fiscaux) ne sont envoyées à
            l&apos;API Anthropic sous forme identifiante : seules les
            informations métier strictement nécessaires à l&apos;assistance sont
            traitées.
          </p>
          <p style={{ margin: "0 0 12px" }}>
            Les communications sont protégées par des protocoles de chiffrement
            avancés (TLS 1.3 en transit, AES-256 au repos). Des mesures de
            sécurité techniques et organisationnelles strictes sont mises en
            œuvre afin de garantir la confidentialité, l&apos;intégrité et la
            conformité aux réglementations applicables (Data Protection Act
            2017 et standards internationaux).
          </p>
          <p style={{ margin: "0 0 12px" }}>
            Conformément aux engagements de notre prestataire IA (Anthropic),{" "}
            <strong style={{ color: C.text }}>
              les données envoyées ne sont pas utilisées pour entraîner les
              modèles
            </strong>
            .
          </p>

          <h3
            style={{
              color: C.text,
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: "16px",
              margin: "16px 0 10px",
            }}
          >
            Consentement de l&apos;utilisateur
          </h3>
          <p style={{ margin: 0 }}>
            L&apos;utilisateur est informé que l&apos;IA constitue uniquement un
            outil d&apos;assistance et qu&apos;il conserve à tout moment la
            garantie qu&apos;un professionnel (comptable, juriste, gestionnaire
            de paie ou dirigeant) valide personnellement et in fine les écritures,
            déclarations, bulletins et contrats. Le consentement explicite de
            l&apos;utilisateur est recueilli lors de l&apos;inscription pour tout
            traitement de données via ces agents IA.
          </p>
        </Section>

        {/* Contact card */}
        <section
          style={{
            backgroundColor: C.dark,
            border: `1px solid ${C.gold}`,
            borderRadius: "16px",
            padding: "28px",
            boxShadow: "0 20px 40px -20px rgba(212,175,55,0.35)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(212,175,55,0.14) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "11px",
                fontWeight: 700,
                color: C.gold,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: "10px",
              }}
            >
              <Mail size={12} aria-hidden="true" />
              Une question ?
            </div>
            <h2
              style={{
                color: "#E8EAFC",
                fontFamily: FONT,
                fontSize: "22px",
                fontWeight: 700,
                margin: "0 0 8px",
                letterSpacing: "-0.01em",
              }}
            >
              Notre équipe juridique et DPO sont à votre écoute
            </h2>
            <p style={{ color: "#A8AFC7", fontSize: "14px", margin: "0 0 18px" }}>
              Pour toute question relative aux mentions légales, à la
              protection de vos données ou à l&apos;exercice de vos droits.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              <a
                href="mailto:contact@lexora.finance"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 20px",
                  borderRadius: "10px",
                  backgroundColor: C.gold,
                  color: C.dark,
                  fontWeight: 700,
                  fontSize: "14px",
                  textDecoration: "none",
                  boxShadow: `0 8px 20px -8px ${C.gold}80`,
                }}
              >
                contact@lexora.finance
              </a>
              <a
                href="mailto:dpo@lexora.finance"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 20px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(232,234,252,0.06)",
                  color: "#E8EAFC",
                  fontWeight: 600,
                  fontSize: "14px",
                  textDecoration: "none",
                  border: `1px solid ${C.borderDark}`,
                }}
              >
                dpo@lexora.finance
              </a>
            </div>
          </div>
        </section>

        {/* Last updated */}
        <p
          style={{
            color: C.mutedLight,
            fontSize: "12px",
            textAlign: "center",
            margin: "8px 0 0",
          }}
        >
          Dernière mise à jour : avril 2026
        </p>
      </main>

      {/* FOOTER — dark + minimal */}
      <footer
        style={{
          backgroundColor: C.dark,
          borderTop: `1px solid ${C.borderDark}`,
          padding: "32px 24px",
        }}
      >
        <div
          style={{
            maxWidth: "1100px",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <LexoraLogo href="/" size="md" />
          <p style={{ color: "#A8AFC7", fontSize: "13px", margin: 0 }}>
            &copy; {new Date().getFullYear()} Digital Data Solutions Ltd — Tous
            droits réservés — Port-Louis, Maurice
          </p>
          <div style={{ display: "flex", gap: "20px", fontSize: "13px" }}>
            <Link
              href="/"
              style={{ color: "#A8AFC7", textDecoration: "none" }}
            >
              Accueil
            </Link>
            <Link
              href="/tarifs"
              style={{ color: "#A8AFC7", textDecoration: "none" }}
            >
              Tarifs
            </Link>
            <a
              href="mailto:contact@lexora.finance"
              style={{ color: "#A8AFC7", textDecoration: "none" }}
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
