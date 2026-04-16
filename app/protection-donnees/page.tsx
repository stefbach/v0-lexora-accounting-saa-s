import type { Metadata } from "next"
import {
  Building2,
  Target,
  Database,
  HandshakeIcon,
  ShieldCheck,
  Clock,
  UserCheck,
  UserCog,
  Brain,
} from "lucide-react"
import {
  LegalShell,
  LegalSection,
  LegalField,
  LegalSubtitle,
} from "@/components/legal/LegalShell"

export const metadata: Metadata = {
  title: "Protection des données personnelles | Lexora",
  description:
    "Charte de protection des données personnelles de la plateforme Lexora, conforme au Data Protection Act 2017 (Mauritius).",
}

export default function ProtectionDonneesPage() {
  return (
    <LegalShell
      eyebrow="Data Protection Act 2017"
      title="Charte de Protection des Données Personnelles"
      subtitle={
        <>
          Engagements de <strong>Lexora</strong> (éditée par{" "}
          <strong>Digital Data Solutions Ltd</strong>) en matière de
          confidentialité, de sécurité et d&apos;usage des données
          professionnelles, financières, RH et de paie confiées à la
          plateforme.
        </>
      }
    >
      {/* 1. Responsable */}
      <LegalSection icon={Building2} title="1. Responsable du traitement">
        <p style={{ margin: "0 0 12px" }}>
          Le traitement des données personnelles collectées via la plateforme
          Lexora est effectué par :
        </p>
        <dl style={{ margin: 0 }}>
          <LegalField label="Société" value="Digital Data Solutions Ltd" />
          <LegalField label="Forme" value="Société à responsabilité limitée (Ltd)" />
          <LegalField label="Immatriculation" value="C20173522" />
          <LegalField label="Siège" value="Bourdet Road, Grand Baie, Maurice" />
          <LegalField label="TVA" value="27816949" />
          <LegalField
            label="E-mail DPO"
            value={
              <a href="mailto:dpo@lexora.finance" style={{ color: "#4191FF", textDecoration: "none", fontWeight: 600 }}>
                dpo@lexora.finance
              </a>
            }
          />
        </dl>
      </LegalSection>

      {/* 2. Finalités */}
      <LegalSection icon={Target} title="2. Finalités de la collecte">
        <p style={{ margin: "0 0 12px" }}>
          Les données personnelles, professionnelles, comptables, fiscales et
          RH collectées par Lexora sont utilisées{" "}
          <strong>exclusivement</strong> pour les finalités suivantes :
        </p>
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          <li>Fournir le service SaaS de comptabilité, paie, facturation, fiscal et juridique ;</li>
          <li>Produire les écritures, bulletins, déclarations MRA, contrats et factures demandés par l&apos;utilisateur ;</li>
          <li>Gérer l&apos;abonnement, la facturation et le support client ;</li>
          <li>Assurer la conformité réglementaire (MRA, ROC, WRA 2019, DPA 2017) ;</li>
          <li>Permettre l&apos;accès au module TIBOK Santé salariés (téléconsultation médicale déléguée) ;</li>
          <li>Assister l&apos;utilisateur via les agents IA (OCR, Rapprochement, Juridique, RH, Fiscal, Facturation) ;</li>
          <li>Détecter et prévenir les fraudes, abus et incidents de sécurité.</li>
        </ul>
        <p style={{ margin: "12px 0 0", fontWeight: 600, color: "#0B0F2E" }}>
          Aucune donnée n&apos;est utilisée à des fins publicitaires, de
          revente, de profilage commercial ou d&apos;entraînement de modèles IA.
        </p>
      </LegalSection>

      {/* 3. Nature */}
      <LegalSection icon={Database} title="3. Nature des données collectées">
        <p style={{ margin: "0 0 10px" }}>Les données traitées peuvent inclure :</p>
        <LegalSubtitle>Données d&apos;identification</LegalSubtitle>
        <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }}>
          <li>Raison sociale, BRN, TVA de la société cliente ;</li>
          <li>Nom, prénom, fonction, NIC, e-mail, téléphone, adresse des utilisateurs ;</li>
          <li>Date de naissance (pour les bulletins de paie et calculs CSG).</li>
        </ul>

        <LegalSubtitle>Données comptables et financières</LegalSubtitle>
        <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }}>
          <li>Écritures, grand livre, balance, bilan, compte de résultat ;</li>
          <li>Factures (clients et fournisseurs), relevés bancaires, justificatifs ;</li>
          <li>Coordonnées bancaires (RIB IBAN des fournisseurs / salariés) ;</li>
          <li>Déclarations fiscales TVA, IT Form 3, Annual Return ROC.</li>
        </ul>

        <LegalSubtitle>Données RH et paie</LegalSubtitle>
        <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }}>
          <li>Contrats de travail, bulletins de paie, congés, pointage ;</li>
          <li>Cotisations (PAYE, CSG, NSF, NPF) ;</li>
          <li>Données de santé au travail transmises au module TIBOK (sous conditions CGU TIBOK).</li>
        </ul>

        <LegalSubtitle>Données techniques</LegalSubtitle>
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          <li>Date, heure et durée des connexions ; adresse IP ; logs de sécurité ;</li>
          <li>Empreintes de sessions pour la détection d&apos;anomalies ;</li>
          <li>Données analytiques anonymisées sur l&apos;utilisation des modules.</li>
        </ul>
      </LegalSection>

      {/* 4. Consentement */}
      <LegalSection icon={HandshakeIcon} title="4. Consentement">
        <p style={{ margin: "0 0 12px" }}>
          Le Client donne son consentement explicite lors de son inscription pour :
        </p>
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          <li>Le traitement de ses données dans le cadre du service Lexora ;</li>
          <li>La conservation sécurisée de ses documents (écritures, factures, bulletins, contrats) dans son espace Lexora ;</li>
          <li>La transmission anonymisée des données métier aux agents IA ;</li>
          <li>L&apos;activation du module TIBOK Santé pour ses salariés (consentement individuel complémentaire recueilli auprès de chaque salarié).</li>
        </ul>
        <p style={{ margin: "12px 0 0" }}>
          Le Client peut <strong>retirer son consentement à tout moment</strong>{" "}
          en contactant le DPO. Le retrait peut entraîner l&apos;interruption
          du service ou de certaines fonctionnalités.
        </p>
      </LegalSection>

      {/* 5. Sécurité */}
      <LegalSection icon={ShieldCheck} title="5. Sécurité des données">
        <p style={{ margin: "0 0 12px" }}>
          Digital Data Solutions Ltd applique des mesures techniques et
          organisationnelles strictes pour garantir la confidentialité,
          l&apos;intégrité et la disponibilité des données :
        </p>
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          <li>Hébergement sur serveurs <strong>Supabase</strong> conformes SOC 2 Type II, ISO 27001 et HIPAA ;</li>
          <li>Chiffrement systématique <strong>TLS 1.3</strong> en transit et <strong>AES-256</strong> au repos ;</li>
          <li>Cloisonnement strict des données par société cliente (row-level security) ;</li>
          <li>Authentification sécurisée multi-facteurs pour les comptes à privilèges ;</li>
          <li>Sauvegardes chiffrées quotidiennes avec rétention 30 jours + sauvegarde long terme chiffrée ;</li>
          <li>Accès restreint aux seuls personnels habilités et journalisé (audit trail immuable) ;</li>
          <li>Tests de pénétration annuels et audits de sécurité externes.</li>
        </ul>
        <p style={{ margin: "12px 0 0" }}>
          Les agents IA exploitent l&apos;API{" "}
          <strong>Anthropic (Claude)</strong>. Les données envoyées sont{" "}
          <strong>anonymisées ou pseudonymisées</strong>, les communications
          chiffrées, et{" "}
          <strong>les données ne sont pas utilisées pour entraîner les modèles</strong>{" "}
          conformément aux engagements contractuels d&apos;Anthropic.
        </p>
      </LegalSection>

      {/* 6. Durée de conservation */}
      <LegalSection icon={Clock} title="6. Durée de conservation">
        <p style={{ margin: "0 0 12px" }}>
          Les données sont conservées pendant la durée nécessaire aux finalités
          du traitement et conformément aux obligations légales mauriciennes :
        </p>
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          <li><strong>Données comptables et fiscales</strong> : 7 ans à compter de la clôture de l&apos;exercice, conformément à l&apos;Income Tax Act et au Companies Act mauriciens ;</li>
          <li><strong>Données de paie et bulletins</strong> : 5 ans à compter de l&apos;émission, conformément au Workers&apos; Rights Act 2019 ;</li>
          <li><strong>Contrats de travail et commerciaux</strong> : durée du contrat + 5 ans ;</li>
          <li><strong>Données TIBOK Santé salariés</strong> : durée fixée par les CGU TIBOK, en conformité avec la règlementation sur les données médicales ;</li>
          <li><strong>Logs techniques et audit trail</strong> : 1 an ;</li>
          <li><strong>Données de facturation de l&apos;abonnement</strong> : 10 ans.</li>
        </ul>
        <p style={{ margin: "12px 0 0" }}>
          À l&apos;issue de ces durées, les données sont{" "}
          <strong>anonymisées ou supprimées définitivement</strong>. Le Client
          peut demander une suppression anticipée, sous réserve des
          obligations légales de conservation.
        </p>
      </LegalSection>

      {/* 7. Droits */}
      <LegalSection icon={UserCheck} title="7. Droits du Client">
        <p style={{ margin: "0 0 12px" }}>
          Conformément au <strong>Data Protection Act 2017</strong> mauricien,
          tout Client dispose des droits suivants :
        </p>
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          <li><strong>Droit d&apos;accès</strong> : obtenir une copie des données personnelles le concernant ;</li>
          <li><strong>Droit de rectification</strong> : corriger les données inexactes ;</li>
          <li><strong>Droit de suppression</strong> (droit à l&apos;oubli), sous réserve des obligations légales de conservation comptable et fiscale ;</li>
          <li><strong>Droit d&apos;opposition</strong> : s&apos;opposer, pour des motifs légitimes, à certains traitements ;</li>
          <li><strong>Droit à la portabilité</strong> : recevoir ses données dans un format structuré (CSV, JSON, Excel) et les transférer à un autre prestataire ;</li>
          <li><strong>Droit de limitation</strong> : demander le gel temporaire d&apos;un traitement contesté ;</li>
          <li><strong>Droit de retirer son consentement</strong> à tout moment.</li>
        </ul>
        <p style={{ margin: "12px 0 0" }}>
          Toute demande peut être adressée à :{" "}
          <a href="mailto:rgpd@lexora.finance" style={{ color: "#4191FF", textDecoration: "none", fontWeight: 600 }}>
            rgpd@lexora.finance
          </a>
          . Lexora s&apos;engage à répondre dans un délai maximum de 30 jours.
          En cas de désaccord, le Client peut saisir le{" "}
          <strong>Data Protection Commissioner</strong> de Maurice.
        </p>
      </LegalSection>

      {/* 8. DPO */}
      <LegalSection icon={UserCog} title="8. Délégué à la Protection des Données (DPO)">
        <p style={{ margin: 0 }}>
          Digital Data Solutions Ltd a désigné un{" "}
          <strong>Délégué à la Protection des Données (DPO)</strong> chargé de
          veiller au respect des obligations de confidentialité et de sécurité,
          d&apos;auditer les traitements et d&apos;être le point de contact
          privilégié des utilisateurs et du Data Protection Commissioner.
          Contact :{" "}
          <a href="mailto:dpo@lexora.finance" style={{ color: "#4191FF", textDecoration: "none", fontWeight: 600 }}>
            dpo@lexora.finance
          </a>
          .
        </p>
      </LegalSection>

      {/* 9. IA */}
      <LegalSection icon={Brain} title="9. IA et protection des données">
        <LegalSubtitle>Outil propriétaire d&apos;assistance</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }}>
          Les utilisateurs Lexora sont assistés par six agents propriétaires
          (OCR, Rapprochement, Juridique, RH, Fiscal, Facturation) développés
          en interne et reposant sur l&apos;API{" "}
          <strong>Anthropic (Claude)</strong>. Ces outils constituent un
          support à l&apos;analyse et à la production ; l&apos;expert-comptable,
          le juriste, le gestionnaire de paie ou le dirigeant valide
          personnellement et in fine chaque document.
        </p>
        <LegalSubtitle>Anonymisation et sécurité</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }}>
          Lors du traitement par les agents IA, les données transmises sont
          strictement <strong>anonymisées ou pseudonymisées</strong> et{" "}
          <strong>cryptées</strong>. Aucune donnée nominative (nom, prénom,
          NIC, coordonnées bancaires, identifiants fiscaux) n&apos;est envoyée
          à l&apos;API sous forme identifiante. Seules les informations métier
          non identifiantes, nécessaires à l&apos;assistance, sont traitées.
          Communications protégées par chiffrement avancé (TLS 1.3 en transit,
          AES-256 au repos).
        </p>
        <LegalSubtitle>Consentement éclairé</LegalSubtitle>
        <p style={{ margin: 0 }}>
          L&apos;utilisateur est informé que l&apos;IA constitue un outil
          d&apos;assistance et qu&apos;il conserve à tout moment la garantie
          qu&apos;un professionnel valide chaque production (écriture,
          bulletin, déclaration, contrat). Le consentement explicite est
          recueilli à l&apos;inscription.
        </p>
      </LegalSection>
    </LegalShell>
  )
}
