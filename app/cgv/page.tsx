import type { Metadata } from "next"
import {
  Info,
  Package,
  KeyRound,
  Calculator,
  Briefcase,
  CreditCard,
  Undo2,
  RefreshCcw,
  UserCog,
  ShieldCheck,
  Scale,
  Brain,
} from "lucide-react"
import {
  LegalShell,
  LegalSection,
  LegalField,
  LegalSubtitle,
} from "@/components/legal/LegalShell"

export const metadata: Metadata = {
  title: "CGV | Lexora",
  description:
    "Conditions Générales de Vente de l'abonnement Lexora — ERP mauricien comptable, RH et santé. Tarification, programme partenaire expert-comptable, paiement, résiliation.",
}

export default function CGVPage() {
  return (
    <LegalShell
      eyebrow="Conditions de vente"
      title="CGV — Conditions Générales de Vente"
      subtitle={
        <>
          Modalités commerciales de l&apos;abonnement <strong>Lexora</strong>{" "}
          proposé aux dirigeants d&apos;entreprise, professionnels et
          experts-comptables agréés <strong>MIPA</strong> par{" "}
          <strong>Digital Data Solutions Ltd</strong>. Toute souscription
          implique l&apos;adhésion pleine et entière aux présentes CGV.
        </>
      }
    >
      {/* Préambule */}
      <LegalSection icon={Info} title="Préambule">
        <p style={{ margin: "0 0 12px" }}>
          Les présentes Conditions Générales de Vente (ci-après « CGV »)
          régissent la souscription à l&apos;abonnement Lexora, édité par{" "}
          <strong>Digital Data Solutions Ltd</strong>, société à responsabilité
          limitée de droit mauricien, immatriculée au Registrar of Companies
          sous le numéro C20173522, dont le siège social est situé à Bourdet
          Road, Grand Baie, Maurice.
        </p>
        <dl style={{ margin: 0 }}>
          <LegalField label="TVA" value="27816949" />
          <LegalField label="Téléphone" value="+230 4687378" />
          <LegalField
            label="E-mail commercial"
            value={
              <a
                href="mailto:contact@lexora.finance"
                style={{ color: "#4191FF", textDecoration: "none", fontWeight: 600 }}
              >
                contact@lexora.finance
              </a>
            }
          />
        </dl>
      </LegalSection>

      {/* 1. Objet */}
      <LegalSection icon={Info} title="1. Objet">
        <p style={{ margin: 0 }}>
          Les présentes CGV ont pour objet de définir les conditions dans
          lesquelles Digital Data Solutions Ltd fournit à ses clients
          (ci-après « le Client ») un abonnement à la plateforme SaaS{" "}
          <strong>Lexora</strong>, donnant accès à sept modules intégrés
          (Comptabilité, Paie &amp; RH, Facturation, Juridique, Fiscal, OCR
          IA, TIBOK Santé salariés) pilotés par six agents d&apos;intelligence
          artificielle.
        </p>
      </LegalSection>

      {/* 2. Description */}
      <LegalSection icon={Package} title="2. Description des services">
        <p style={{ margin: "0 0 12px" }}>L&apos;abonnement Lexora comprend :</p>
        <ul style={{ margin: "0 0 14px", paddingLeft: "20px" }}>
          <li>Un accès à la plateforme Lexora 24/7 via navigateur web ;</li>
          <li>L&apos;utilisation des 7 modules intégrés conformes à la réglementation mauricienne (MRA, ROC, WRA 2019, IFRS/IAS) ;</li>
          <li>L&apos;assistance des 6 agents IA (OCR, Rapprochement, Juridique, RH, Fiscal, Facturation) ;</li>
          <li>La téléconsultation <strong>TIBOK Santé salariés</strong> — inclus pour les salariés de l&apos;entreprise cliente ;</li>
          <li>Les mises à jour réglementaires continues (TVA, PAYE, CSG, NSF, WRA) ;</li>
          <li>L&apos;hébergement sécurisé (chiffrement TLS 1.3 + AES-256, sauvegardes quotidiennes) ;</li>
          <li>Le support client par e-mail (et prioritaire selon la formule).</li>
        </ul>
      </LegalSection>

      {/* 3. Conditions d'accès */}
      <LegalSection icon={KeyRound} title="3. Conditions d'accès">
        <p style={{ margin: 0 }}>Le service est accessible :</p>
        <ul style={{ margin: "8px 0 0", paddingLeft: "20px" }}>
          <li>24 heures sur 24, 7 jours sur 7, hors périodes planifiées de maintenance ;</li>
          <li>À toute société, entrepreneur individuel, expert-comptable, cabinet comptable ou gestionnaire de paie opérant à Maurice ;</li>
          <li>À toute personne physique majeure (18 ans ou plus) habilitée à engager la société cliente ;</li>
          <li>Depuis tout appareil disposant d&apos;un navigateur web moderne et d&apos;un accès Internet ;</li>
          <li>Sous réserve d&apos;inscription préalable avec des informations exactes (raison sociale, BRN, TVA, NIC, coordonnées).</li>
        </ul>
      </LegalSection>

      {/* 4. Tarification */}
      <LegalSection icon={Calculator} title="4. Tarification">
        <LegalSubtitle>4.1. Quatre formules</LegalSubtitle>
        <p style={{ margin: "0 0 8px" }}>
          Lexora propose quatre formules d&apos;abonnement mensuel incluant le
          bundle <strong>Comptabilité + RH/Paie + TIBOK Santé</strong> :
        </p>
        <dl style={{ margin: "0 0 14px" }}>
          <LegalField label="Solo" value="Rs 2 720 / mois — 1 à 3 salariés" />
          <LegalField label="Business" value="Rs 4 960 / mois — 4 à 15 salariés" />
          <LegalField label="PME" value="Rs 10 560 / mois — 16 à 50 salariés" />
          <LegalField label="Enterprise" value="Rs 21 200 / mois — 51+ salariés · sur devis" />
        </dl>

        <LegalSubtitle>4.2. Simulateur par salarié — plancher Rs 250</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }}>
          Le module <strong>RH &amp; Paie</strong> peut également être facturé
          au réel, selon un calcul par salarié avec tarif dégressif au volume.
          Le <strong>prix plancher est de Rs 250 / mois</strong> (pour une
          entreprise d&apos;un salarié). Les tranches marginales sont les
          suivantes :
        </p>
        <ul style={{ margin: "0 0 14px", paddingLeft: "20px" }}>
          <li>Salariés <strong>1 à 5</strong> : Rs 250 / salarié / mois</li>
          <li>Salariés <strong>6 à 15</strong> : Rs 180 / salarié / mois</li>
          <li>Salariés <strong>16 à 50</strong> : Rs 120 / salarié / mois</li>
          <li>Salariés <strong>51 à 100</strong> : Rs 90 / salarié / mois</li>
          <li>Salariés <strong>101 et plus</strong> : Rs 70 / salarié / mois</li>
        </ul>
        <p style={{ margin: "0 0 12px" }}>
          TIBOK Santé salariés est <strong>inclus sans surcoût</strong> dans
          le prix RH &amp; Paie pour chaque salarié actif.
        </p>

        <LegalSubtitle>4.3. Paiement annuel — 2 mois offerts</LegalSubtitle>
        <p style={{ margin: 0 }}>
          Le paiement annuel donne droit à une remise équivalente à{" "}
          <strong>2 mois offerts</strong> (soit 10 mois facturés pour 12 mois
          d&apos;abonnement).
        </p>

        <LegalSubtitle>4.4. Taxes</LegalSubtitle>
        <p style={{ margin: 0 }}>
          Les prix sont indiqués en roupies mauriciennes (MUR), hors taxes
          sauf mention contraire. La TVA mauricienne de 15 % est appliquée sur
          la facture pour les clients assujettis à la TVA à Maurice.
        </p>
      </LegalSection>

      {/* 5. Programme Expert-Comptable */}
      <LegalSection icon={Briefcase} title="5. Programme Expert-Comptable (multi-dossiers)" accentColor="#D4AF37">
        <p style={{ margin: "0 0 12px" }}>
          Lexora propose aux experts-comptables agréés{" "}
          <strong>MIPA</strong> un programme partenaire dédié pour piloter
          l&apos;ensemble de leur portefeuille clients depuis un tableau de
          bord unique.
        </p>

        <LegalSubtitle>5.1. Accès cabinet gratuit</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }}>
          L&apos;ouverture du compte cabinet <strong>Lexora Expert-Comptable
          </strong> est <strong>gratuite</strong>, sans engagement de durée ni
          volume minimum. Le cabinet accède à :
        </p>
        <ul style={{ margin: "0 0 14px", paddingLeft: "20px" }}>
          <li>Un <strong>tableau de bord multi-dossiers</strong> consolidé (tous ses clients Lexora en un écran) ;</li>
          <li>Des <strong>permissions différenciées</strong> cabinet / client par module (compta, paie, fiscal, juridique) ;</li>
          <li>Des <strong>alertes fiscales consolidées</strong> sur tout le portefeuille (TVA, IT Form 3, Annual Return ROC) ;</li>
          <li>Un <strong>badge « Validé par un expert-comptable »</strong> sur les écritures et déclarations qu&apos;il contrôle ;</li>
          <li>Un espace de travail isolé par dossier client, avec cloisonnement strict des données.</li>
        </ul>

        <LegalSubtitle>5.2. Commission de rétrocession</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }}>
          Pour chaque client actif rattaché au cabinet, l&apos;expert-comptable
          perçoit une <strong>commission mensuelle récurrente</strong> sur le
          chiffre d&apos;affaires généré, versée aussi longtemps que le client
          reste actif sur Lexora. Les conditions financières précises (taux,
          modalités de versement, seuils) sont détaillées dans l&apos;Accord
          de Partenariat signé entre le cabinet et Digital Data Solutions Ltd
          à l&apos;activation du compte.
        </p>

        <LegalSubtitle>5.3. Responsabilité professionnelle</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }}>
          L&apos;expert-comptable conserve l&apos;entière responsabilité
          professionnelle des écritures, déclarations et comptes annuels qu&apos;il
          valide via Lexora pour ses clients. Lexora met à disposition des
          outils automatisés de production et de contrôle ; la{" "}
          <strong>certification des comptes annuels</strong> relève
          exclusivement de la compétence de l&apos;expert-comptable MIPA
          conformément à la loi mauricienne.
        </p>

        <LegalSubtitle>5.4. Conformité MIPA</LegalSubtitle>
        <p style={{ margin: 0 }}>
          L&apos;accès au programme Expert-Comptable est subordonné à la
          fourniture d&apos;un numéro de membre MIPA valide et d&apos;une
          attestation d&apos;inscription en cours de validité. Digital Data
          Solutions Ltd se réserve le droit de vérifier l&apos;authenticité de
          ces informations et de suspendre l&apos;accès cabinet en cas de
          radiation ou de non-conformité.
        </p>
      </LegalSection>

      {/* 6. Paiement */}
      <LegalSection icon={CreditCard} title="6. Paiement">
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          <li>Le paiement est exigé <strong>à l&apos;avance</strong>, mensuellement ou annuellement, par carte bancaire ou virement (SEPA/SWIFT) via une plateforme de paiement sécurisée (PCI-DSS) ;</li>
          <li>L&apos;accès au service s&apos;active immédiatement après encaissement ;</li>
          <li>Une <strong>facture électronique</strong> conforme MRA est transmise par e-mail et archivée dans l&apos;espace personnel du Client ;</li>
          <li>En cas d&apos;impayé, l&apos;accès peut être suspendu après deux relances et un délai de 15 jours ;</li>
          <li>Les abonnements annuels sont non-remboursables au prorata en cas de résiliation anticipée à l&apos;initiative du Client, sauf défaillance grave du service imputable à Lexora.</li>
        </ul>
      </LegalSection>

      {/* 7. Droit de rétractation */}
      <LegalSection icon={Undo2} title="7. Droit de rétractation">
        <p style={{ margin: "0 0 12px" }}>
          Les services Lexora étant fournis à des professionnels dans le cadre
          de leur activité (B2B),{" "}
          <strong>le droit de rétractation des consommateurs ne
          s&apos;applique pas</strong> aux présentes CGV.
        </p>
        <p style={{ margin: 0 }}>
          Pour les particuliers (cas exceptionnel), conformément à la
          réglementation applicable, le droit de rétractation ne peut être
          exercé lorsque le service numérique a déjà été exécuté avec
          l&apos;accord exprès du Client, notamment si la plateforme a déjà
          été activée et qu&apos;au moins une opération a été enregistrée.
        </p>
      </LegalSection>

      {/* 8. Résiliation */}
      <LegalSection icon={RefreshCcw} title="8. Résiliation et remboursement">
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          <li><strong>Abonnement mensuel</strong> : résiliable à tout moment depuis l&apos;espace Client, effet au terme du mois en cours payé, sans frais ;</li>
          <li><strong>Abonnement annuel</strong> : engagement 12 mois, non-remboursable au prorata sauf défaillance grave et persistante du service ;</li>
          <li>En cas de résiliation, le Client dispose de <strong>30 jours</strong> pour exporter ses données (compta, paie, documents) dans des formats standards (CSV, Excel, PDF, JSON) ;</li>
          <li>À l&apos;issue de ce délai, les données sont <strong>supprimées</strong> des serveurs actifs, sous réserve des obligations légales de conservation (voir Charte Protection des Données).</li>
        </ul>
      </LegalSection>

      {/* 9. Responsabilités */}
      <LegalSection icon={UserCog} title="9. Responsabilités">
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          <li>Lexora agit en qualité d&apos;éditeur et d&apos;hébergeur d&apos;une solution SaaS ;</li>
          <li>L&apos;expert-comptable, le juriste, le gestionnaire de paie ou le dirigeant utilisateur conserve <strong>l&apos;entière responsabilité professionnelle</strong> des écritures, bulletins, déclarations et contrats produits via la plateforme ;</li>
          <li>Lexora ne peut être tenue pour responsable d&apos;un redressement fiscal, d&apos;une pénalité MRA ou d&apos;un litige issu d&apos;une donnée erronée saisie ou validée par le Client ;</li>
          <li>Lexora s&apos;engage à une <strong>disponibilité cible de 99,5 %</strong> (hors maintenances planifiées annoncées 48 h à l&apos;avance).</li>
        </ul>
      </LegalSection>

      {/* 10. Données et sécurité */}
      <LegalSection icon={ShieldCheck} title="10. Données personnelles et sécurité">
        <p style={{ margin: "0 0 12px" }}>
          Digital Data Solutions Ltd met en œuvre une politique stricte de
          protection des données, conforme au{" "}
          <strong>Data Protection Act 2017</strong> mauricien et aux normes
          internationales applicables :
        </p>
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          <li>Hébergement sur serveurs <strong>Supabase</strong> conformes SOC 2 Type II, ISO 27001 et HIPAA ;</li>
          <li>Chiffrement TLS 1.3 en transit, AES-256 au repos ;</li>
          <li>Accès strictement réservé aux utilisateurs habilités, dans un cadre sécurisé et audité ;</li>
          <li>Aucune donnée n&apos;est revendue, exploitée à des fins commerciales ou utilisée pour entraîner les modèles IA ;</li>
          <li>Le Client peut à tout moment exporter, rectifier ou demander la suppression de ses données ;</li>
          <li>Un <strong>Délégué à la Protection des Données (DPO)</strong> est désigné : <a href="mailto:dpo@lexora.finance" style={{ color: "#4191FF", textDecoration: "none", fontWeight: 600 }}>dpo@lexora.finance</a>.</li>
        </ul>
        <p style={{ margin: "12px 0 0" }}>
          Voir notre{" "}
          <a href="/protection-donnees" style={{ color: "#4191FF", textDecoration: "none", fontWeight: 600 }}>
            Charte de Protection des Données Personnelles
          </a>{" "}
          pour le détail.
        </p>
      </LegalSection>

      {/* 11. Litiges */}
      <LegalSection icon={Scale} title="11. Litiges">
        <p style={{ margin: 0 }}>
          En cas de différend, les parties s&apos;engagent à rechercher une
          solution amiable. À défaut, le litige sera soumis à la juridiction
          exclusive des <strong>tribunaux de Port-Louis (île Maurice)</strong>.
          La loi applicable est la <strong>législation mauricienne</strong>.
        </p>
      </LegalSection>

      {/* 12. IA */}
      <LegalSection icon={Brain} title="12. Intelligence artificielle et protection des données">
        <LegalSubtitle>Outil propriétaire d&apos;assistance par IA</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }}>
          Lexora intègre six agents propriétaires d&apos;assistance (OCR,
          Rapprochement, Juridique, RH, Fiscal, Facturation), développés en
          interne et reposant sur l&apos;API{" "}
          <strong>Anthropic (Claude)</strong>. Ces outils constituent un
          support à l&apos;analyse et à la production, sans jamais remplacer
          la responsabilité professionnelle de l&apos;utilisateur.
        </p>
        <LegalSubtitle>Anonymisation et sécurité</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }}>
          Les données transmises à l&apos;IA sont strictement{" "}
          <strong>anonymisées</strong> et <strong>cryptées</strong>. Aucune
          donnée nominative (nom, prénom, NIC, coordonnées bancaires) n&apos;est
          envoyée sous forme identifiante. Les données envoyées{" "}
          <strong>ne sont pas utilisées pour entraîner les modèles</strong>.
        </p>
        <LegalSubtitle>Consentement</LegalSubtitle>
        <p style={{ margin: 0 }}>
          Le Client est informé que l&apos;IA est un outil d&apos;assistance
          et que l&apos;expert-comptable, le juriste ou le dirigeant valide
          personnellement et in fine chaque production. Le consentement
          explicite est recueilli à la souscription.
        </p>
      </LegalSection>
    </LegalShell>
  )
}
