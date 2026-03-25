import type { DocumentType } from "@/lib/types"

// ---------------------------------------------------------------------------
// Result interfaces for each document type
// ---------------------------------------------------------------------------

export interface FactureFournisseurResult {
  type: "facture_fournisseur"
  numero: string
  date: string
  fournisseur: string
  montant_ht: number
  tva: number
  ttc: number
  echeance: string
  compte_debit: string
  libelle: string
  confiance: number
}

export interface FactureClientResult {
  type: "facture_client"
  numero: string
  date: string
  client: string
  montant_ht: number
  tva: number
  ttc: number
  echeance: string
  compte_credit: string
  statut: string
  confiance: number
}

export interface ReleveBancaireLigne {
  date: string
  libelle: string
  debit: number
  credit: number
  solde: number
  tiers_identifie: string
  compte_imputable: string
}

export interface ReleveBancaireResult {
  banque: string
  compte: string
  periode: string
  lignes: ReleveBancaireLigne[]
}

export interface FichePaieResult {
  employe: string
  societe: string
  mois: string
  brut: number
  npf_salarie: number
  paye: number
  net: number
  compte: string
  confiance: number
}

export interface ChargesSocialesResult {
  periode: string
  societe: string
  npf_patronal: number
  npf_salarie: number
  hrdc: number
  nps: number
  total: number
  echeance: string
  confiance: number
}

// ---------------------------------------------------------------------------
// Prompt configuration
// ---------------------------------------------------------------------------

export interface DocumentPrompt {
  type: DocumentType
  systemPrompt: string
  expectedJsonFormat: string
}

export const DOCUMENT_PROMPTS: Record<string, DocumentPrompt> = {
  facture_fournisseur: {
    type: "facture_fournisseur",
    systemPrompt:
      "Tu es un expert-comptable mauricien MRA compliant. Extrais toutes les informations de cette facture fournisseur. TVA standard = 15%. Retourne UNIQUEMENT un JSON valide sans markdown.",
    expectedJsonFormat: JSON.stringify(
      {
        type: "facture_fournisseur",
        numero: "",
        date: "YYYY-MM-DD",
        fournisseur: "",
        montant_ht: 0,
        tva: 0,
        ttc: 0,
        echeance: "YYYY-MM-DD",
        compte_debit: "6XX",
        libelle: "",
        confiance: 0.0,
      },
      null,
      2
    ),
  },

  facture_client: {
    type: "facture_client",
    systemPrompt:
      "Tu es un expert-comptable mauricien. Extrais les données de cette facture client émise. Retourne UNIQUEMENT un JSON valide.",
    expectedJsonFormat: JSON.stringify(
      {
        type: "facture_client",
        numero: "",
        date: "YYYY-MM-DD",
        client: "",
        montant_ht: 0,
        tva: 0,
        ttc: 0,
        echeance: "YYYY-MM-DD",
        compte_credit: "7XX",
        statut: "emise",
        confiance: 0.0,
      },
      null,
      2
    ),
  },

  releve_bancaire: {
    type: "releve_bancaire",
    systemPrompt:
      "Tu es un expert-comptable mauricien. Extrais TOUTES les lignes de ce relevé bancaire. Identifie le tiers et le compte comptable pour chaque transaction. Retourne UNIQUEMENT un JSON valide.",
    expectedJsonFormat: JSON.stringify(
      {
        banque: "",
        compte: "",
        periode: "",
        lignes: [
          {
            date: "YYYY-MM-DD",
            libelle: "",
            debit: 0,
            credit: 0,
            solde: 0,
            tiers_identifie: "",
            compte_imputable: "",
          },
        ],
      },
      null,
      2
    ),
  },

  fiche_paie: {
    type: "fiche_paie",
    systemPrompt:
      "Tu es un expert-comptable RH mauricien. Extrais les données salariales. Vérifie cohérence NPF (3% salarié), PAYE selon barème MRA. Retourne UNIQUEMENT un JSON valide.",
    expectedJsonFormat: JSON.stringify(
      {
        employe: "",
        societe: "",
        mois: "",
        brut: 0,
        npf_salarie: 0,
        paye: 0,
        net: 0,
        compte: "641",
        confiance: 0.0,
      },
      null,
      2
    ),
  },

  charges_sociales: {
    type: "charges_sociales",
    systemPrompt:
      "Tu es un expert en droit social mauricien. Extrais les cotisations NPF/HRDC/NPS de ce document. Retourne UNIQUEMENT un JSON valide.",
    expectedJsonFormat: JSON.stringify(
      {
        periode: "",
        societe: "",
        npf_patronal: 0,
        npf_salarie: 0,
        hrdc: 0,
        nps: 0,
        total: 0,
        echeance: "YYYY-MM-DD",
        confiance: 0.0,
      },
      null,
      2
    ),
  },
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

export function getPromptForType(type: DocumentType): DocumentPrompt | null {
  return DOCUMENT_PROMPTS[type] ?? null
}
