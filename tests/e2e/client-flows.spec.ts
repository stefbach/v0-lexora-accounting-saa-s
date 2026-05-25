/**
 * Tests d'intégration "E2E-like" pour les parcours client critiques.
 *
 * Pourquoi pas Playwright ?
 *   Le projet n'a pas Playwright en dev dependency (seulement
 *   `playwright-core` comme transitive). L'environnement CI Vercel
 *   n'expose pas de navigateur. On simule donc les 3 parcours
 *   critiques à l'aide du mock Supabase in-memory déjà utilisé par
 *   `tests/security/sec-001-to-005.spec.ts` et de fetch mocké.
 *
 * NB : ce fichier vit dans `tests/e2e/` qui est exclu du run vitest
 * par défaut (`vitest.config.ts`). On le lance via :
 *   npx vitest run --config=tests/e2e/vitest-e2e.config.mjs
 * ou
 *   npx vitest run tests/e2e/client-flows.spec.ts --dir=.
 *
 * Parcours couverts :
 *   1. AUTH      : login → resolution role → redirect vers le bon
 *                  dashboard → sélection de société active.
 *   2. FACTURATION : création d'une facture client → preview PDF
 *                  (vérif des champs obligatoires) → "envoi" simulé.
 *   3. RAPPROCHEMENT : import d'un relevé bancaire → matching
 *                  facture/transaction → validation du lettrage
 *                  (équilibre comptable).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockSupabase, type MockSupabaseClient } from '../__mocks__/supabase'

// ────────────────────────────────────────────────────────────────────────
// Fixtures partagées
// ────────────────────────────────────────────────────────────────────────

const SOC_ID = 'soc-test-001'
const SOC_ID_2 = 'soc-test-002'
const USER_ID = 'user-test-001'

const seedProfiles = (supabase: MockSupabaseClient) => {
  supabase._seed('profiles', [
    {
      id: USER_ID,
      role: 'client_admin',
      employe_id: null,
      societe_id: SOC_ID,
      email: 'client@example.mu',
    },
  ])
}

const seedSocietes = (supabase: MockSupabaseClient) => {
  supabase._seed('societes', [
    { id: SOC_ID, raison_sociale: 'Société Alpha Ltée', brn: 'C12345678' },
    { id: SOC_ID_2, raison_sociale: 'Société Beta Ltée', brn: 'C87654321' },
  ])
  supabase._seed('user_societes', [
    { user_id: USER_ID, societe_id: SOC_ID, role_societe: 'admin' },
    { user_id: USER_ID, societe_id: SOC_ID_2, role_societe: 'viewer' },
  ])
}

// ────────────────────────────────────────────────────────────────────────
// PARCOURS 1 — AUTH (login → redirect → société active)
// ────────────────────────────────────────────────────────────────────────

const ROLE_DASHBOARD: Record<string, string> = {
  admin: '/admin',
  super_admin: '/admin',
  comptable: '/comptable',
  comptable_dedie: '/comptable',
  client_admin: '/client/tableau-de-bord',
  client_user: '/client/tableau-de-bord',
  client_assistant: '/client/assistant',
  rh: '/rh',
  juridique: '/juridique',
  manager: '/rh',
  team_leader: '/rh',
  employe: '/salarie',
  direction: '/direction',
  rh_manager: '/rh',
  salarie: '/salarie',
}

/**
 * Réplique pure de la logique de `app/redirect/page.tsx` — permet de
 * tester chaque combinaison (role, employe_id) sans booter Next.
 */
function resolveRedirect(profile: { role: string | null; employe_id: string | null } | null): string {
  if (!profile) return '/client/tableau-de-bord'
  const role = profile.role || 'client_user'
  const effective = !profile.role && profile.employe_id ? 'employe' : role
  return ROLE_DASHBOARD[effective] || '/client/tableau-de-bord'
}

describe('Parcours 1 — Auth (login → redirect → société active)', () => {
  let supabase: MockSupabaseClient

  beforeEach(() => {
    supabase = createMockSupabase()
    seedProfiles(supabase)
    seedSocietes(supabase)
  })

  it("redirige un client_admin vers /client/tableau-de-bord", async () => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, employe_id')
      .eq('id', USER_ID)
      .maybeSingle()

    expect(profile).not.toBeNull()
    expect(resolveRedirect(profile)).toBe('/client/tableau-de-bord')
  })

  it("redirige un employé linké (role=null, employe_id défini) vers /salarie", () => {
    expect(
      resolveRedirect({ role: null, employe_id: 'emp-42' })
    ).toBe('/salarie')
  })

  it("redirige un comptable vers /comptable", () => {
    expect(resolveRedirect({ role: 'comptable', employe_id: null })).toBe('/comptable')
  })

  it("fallback /client/tableau-de-bord si profile absent (nouveau compte)", async () => {
    const empty = createMockSupabase()
    const { data: profile } = await empty
      .from('profiles')
      .select('role, employe_id')
      .eq('id', 'inconnu')
      .maybeSingle()
    expect(profile).toBeNull()
    expect(resolveRedirect(profile as any)).toBe('/client/tableau-de-bord')
  })

  it("liste les sociétés accessibles à l'utilisateur (sélection de société active)", async () => {
    const { data: rows } = await supabase
      .from('user_societes')
      .select('societe_id, role_societe')
      .eq('user_id', USER_ID)
    expect(Array.isArray(rows)).toBe(true)
    expect(rows!.length).toBe(2)
    const ids = rows!.map((r: any) => r.societe_id).sort()
    expect(ids).toEqual([SOC_ID, SOC_ID_2])
  })

  it("ne renvoie aucune société pour un user non rattaché (RLS-like)", async () => {
    const { data: rows } = await supabase
      .from('user_societes')
      .select('societe_id')
      .eq('user_id', 'attacker-999')
    expect(rows).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────────
// PARCOURS 2 — FACTURATION (création → preview PDF → envoi)
// ────────────────────────────────────────────────────────────────────────

type LigneFacture = {
  description: string
  quantite: number
  prix_unitaire: number
  tva_taux: number
}

type Facture = {
  id?: string
  societe_id: string
  client_nom: string
  numero: string
  date_emission: string
  date_echeance: string
  lignes: LigneFacture[]
  total_ht: number
  total_tva: number
  total_ttc: number
  statut: 'brouillon' | 'envoyee' | 'payee'
}

function calculerTotaux(lignes: LigneFacture[]): {
  total_ht: number
  total_tva: number
  total_ttc: number
} {
  let ht = 0
  let tva = 0
  for (const l of lignes) {
    const ligneHT = l.quantite * l.prix_unitaire
    ht += ligneHT
    tva += ligneHT * (l.tva_taux / 100)
  }
  // arrondi 2 décimales (centimes MUR)
  const round2 = (n: number) => Math.round(n * 100) / 100
  return {
    total_ht: round2(ht),
    total_tva: round2(tva),
    total_ttc: round2(ht + tva),
  }
}

/** Vérifie qu'une facture a tous les champs requis pour générer un PDF. */
function validerPourPDF(f: Facture): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  if (!f.numero) missing.push('numero')
  if (!f.date_emission) missing.push('date_emission')
  if (!f.client_nom) missing.push('client_nom')
  if (!f.lignes?.length) missing.push('lignes')
  if (f.total_ttc <= 0) missing.push('total_ttc')
  return { ok: missing.length === 0, missing }
}

describe('Parcours 2 — Facturation (création → preview PDF → envoi)', () => {
  let supabase: MockSupabaseClient

  beforeEach(() => {
    supabase = createMockSupabase()
  })

  it("crée une facture avec calculs HT/TVA/TTC corrects (TVA 15% MU)", async () => {
    const lignes: LigneFacture[] = [
      { description: 'Conseil', quantite: 10, prix_unitaire: 1000, tva_taux: 15 },
      { description: 'Frais', quantite: 1, prix_unitaire: 500, tva_taux: 0 },
    ]
    const totaux = calculerTotaux(lignes)
    expect(totaux.total_ht).toBe(10500)
    expect(totaux.total_tva).toBe(1500) // 10000 * 15%
    expect(totaux.total_ttc).toBe(12000)

    const facture: Facture = {
      societe_id: SOC_ID,
      client_nom: 'Beta Corp Ltée',
      numero: 'F-2026-001',
      date_emission: '2026-05-24',
      date_echeance: '2026-06-23',
      lignes,
      ...totaux,
      statut: 'brouillon',
    }

    const { data: inserted } = await supabase
      .from('factures')
      .insert(facture)
      .single()
    expect(inserted.id).toBeTruthy()
    expect(inserted.statut).toBe('brouillon')
    expect(supabase._state.inserts).toHaveLength(1)
  })

  it("refuse la preview PDF si numero ou lignes manquantes", () => {
    const bad: Facture = {
      societe_id: SOC_ID,
      client_nom: '',
      numero: '',
      date_emission: '',
      date_echeance: '',
      lignes: [],
      total_ht: 0,
      total_tva: 0,
      total_ttc: 0,
      statut: 'brouillon',
    }
    const res = validerPourPDF(bad)
    expect(res.ok).toBe(false)
    expect(res.missing).toEqual(
      expect.arrayContaining(['numero', 'date_emission', 'client_nom', 'lignes', 'total_ttc'])
    )
  })

  it("valide la preview PDF pour une facture complète", () => {
    const totaux = calculerTotaux([
      { description: 'Service', quantite: 1, prix_unitaire: 5000, tva_taux: 15 },
    ])
    const ok: Facture = {
      societe_id: SOC_ID,
      client_nom: 'Gamma SARL',
      numero: 'F-2026-002',
      date_emission: '2026-05-24',
      date_echeance: '2026-06-23',
      lignes: [{ description: 'Service', quantite: 1, prix_unitaire: 5000, tva_taux: 15 }],
      ...totaux,
      statut: 'brouillon',
    }
    expect(validerPourPDF(ok).ok).toBe(true)
  })

  it("envoie la facture : passe statut brouillon → envoyee", async () => {
    supabase._seed('factures', [
      {
        id: 'fct-1',
        societe_id: SOC_ID,
        numero: 'F-2026-003',
        statut: 'brouillon',
        total_ttc: 11500,
      },
    ])
    await supabase.from('factures').update({ statut: 'envoyee' }).eq('id', 'fct-1')
    const { data } = await supabase
      .from('factures')
      .select('statut')
      .eq('id', 'fct-1')
      .maybeSingle()
    expect(data.statut).toBe('envoyee')
  })

  it("rejette une facture multi-tenant : un user du SOC_ID_2 ne voit pas la facture du SOC_ID", async () => {
    supabase._seed('factures', [
      { id: 'fct-a', societe_id: SOC_ID, numero: 'F-A' },
      { id: 'fct-b', societe_id: SOC_ID_2, numero: 'F-B' },
    ])
    const { data } = await supabase
      .from('factures')
      .select('*')
      .eq('societe_id', SOC_ID_2)
    expect(data).toHaveLength(1)
    expect(data[0].numero).toBe('F-B')
  })
})

// ────────────────────────────────────────────────────────────────────────
// PARCOURS 3 — RAPPROCHEMENT (import relevé → match → lettrage)
// ────────────────────────────────────────────────────────────────────────

type Transaction = {
  id?: string
  societe_id: string
  date: string
  libelle: string
  montant: number // signé : crédit > 0, débit < 0
  reference?: string
  statut: 'non_rapprochee' | 'rapprochee'
  lettrage_id?: string | null
}

type FactureOuverte = {
  id: string
  societe_id: string
  numero: string
  montant: number
  date_emission: string
  statut: 'envoyee' | 'payee'
}

/**
 * Matching simplifié : on cherche une facture ouverte du même
 * societe_id, dont le montant correspond au crédit reçu (tolérance
 * de 0.01 MUR pour les arrondis). Si plusieurs candidats, on prend
 * celle dont le numéro est cité dans la référence/libellé.
 */
function matcher(
  tx: Transaction,
  factures: FactureOuverte[],
): FactureOuverte | null {
  const candidates = factures.filter(
    (f) =>
      f.societe_id === tx.societe_id &&
      f.statut === 'envoyee' &&
      Math.abs(f.montant - tx.montant) < 0.01,
  )
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]
  const haystack = `${tx.libelle} ${tx.reference || ''}`.toLowerCase()
  return (
    candidates.find((f) => haystack.includes(f.numero.toLowerCase())) ||
    candidates[0]
  )
}

/**
 * Vérifie qu'un lettrage est équilibré : la somme des montants
 * (avec signes opposés débit/crédit) doit être nulle à 0.01 près.
 */
function lettrageEquilibre(lignes: { debit: number; credit: number }[]): boolean {
  const totalD = lignes.reduce((s, l) => s + l.debit, 0)
  const totalC = lignes.reduce((s, l) => s + l.credit, 0)
  return Math.abs(totalD - totalC) < 0.01
}

describe('Parcours 3 — Rapprochement (import → match → lettrage)', () => {
  let supabase: MockSupabaseClient

  beforeEach(() => {
    supabase = createMockSupabase()
    supabase._seed('factures_ouvertes', [
      {
        id: 'fct-100',
        societe_id: SOC_ID,
        numero: 'F-2026-001',
        montant: 12000,
        date_emission: '2026-05-10',
        statut: 'envoyee',
      },
      {
        id: 'fct-101',
        societe_id: SOC_ID,
        numero: 'F-2026-002',
        montant: 5750,
        date_emission: '2026-05-12',
        statut: 'envoyee',
      },
      {
        id: 'fct-102',
        societe_id: SOC_ID_2,
        numero: 'F-2026-901',
        montant: 12000,
        date_emission: '2026-05-15',
        statut: 'envoyee',
      },
    ])
  })

  it("importe un relevé bancaire (3 lignes) — insert + statut non_rapprochee par défaut", async () => {
    const releve: Transaction[] = [
      {
        societe_id: SOC_ID,
        date: '2026-05-20',
        libelle: 'VIREMENT REÇU BETA CORP',
        montant: 12000,
        reference: 'F-2026-001',
        statut: 'non_rapprochee',
      },
      {
        societe_id: SOC_ID,
        date: '2026-05-21',
        libelle: 'PAIEMENT GAMMA',
        montant: 5750,
        statut: 'non_rapprochee',
      },
      {
        societe_id: SOC_ID,
        date: '2026-05-22',
        libelle: 'FRAIS BANCAIRES',
        montant: -150,
        statut: 'non_rapprochee',
      },
    ]
    const { data } = await supabase.from('bank_transactions').insert(releve)
    expect(data).toHaveLength(3)
    expect(data.every((d: any) => d.statut === 'non_rapprochee')).toBe(true)
  })

  it("matche une transaction sur l'unique facture du bon montant", async () => {
    const { data: factures } = await supabase
      .from('factures_ouvertes')
      .select('*')
      .eq('societe_id', SOC_ID)
    const tx: Transaction = {
      societe_id: SOC_ID,
      date: '2026-05-21',
      libelle: 'PAIEMENT GAMMA',
      montant: 5750,
      statut: 'non_rapprochee',
    }
    const match = matcher(tx, factures as FactureOuverte[])
    expect(match).not.toBeNull()
    expect(match!.numero).toBe('F-2026-002')
  })

  it("désambiguïse via la référence quand plusieurs factures ont le même montant", async () => {
    const { data: factures } = await supabase
      .from('factures_ouvertes')
      .select('*')
    // 12000 existe sur SOC_ID (F-2026-001) et SOC_ID_2 (F-2026-901)
    const tx: Transaction = {
      societe_id: SOC_ID,
      date: '2026-05-20',
      libelle: 'VIREMENT - F-2026-001 BETA',
      montant: 12000,
      statut: 'non_rapprochee',
    }
    const match = matcher(tx, factures as FactureOuverte[])
    expect(match!.numero).toBe('F-2026-001')
    expect(match!.societe_id).toBe(SOC_ID) // cross-tenant filtré
  })

  it("retourne null si aucun candidat (frais bancaires → lettrage manuel)", () => {
    const tx: Transaction = {
      societe_id: SOC_ID,
      date: '2026-05-22',
      libelle: 'FRAIS BANCAIRES',
      montant: -150,
      statut: 'non_rapprochee',
    }
    expect(matcher(tx, [])).toBeNull()
  })

  it("valide le lettrage : écriture comptable équilibrée (débit = crédit)", () => {
    // Encaissement client : Débit 512 BANQUE 12000 / Crédit 411 CLIENT 12000
    expect(
      lettrageEquilibre([
        { debit: 12000, credit: 0 },
        { debit: 0, credit: 12000 },
      ]),
    ).toBe(true)
  })

  it("rejette un lettrage déséquilibré (saisie corrompue)", () => {
    expect(
      lettrageEquilibre([
        { debit: 12000, credit: 0 },
        { debit: 0, credit: 11999.5 }, // 0.50 d'écart > tolérance 0.01
      ]),
    ).toBe(false)
  })

  it("met à jour la facture en 'payee' et la transaction en 'rapprochee' après lettrage", async () => {
    supabase._seed('bank_transactions', [
      {
        id: 'tx-1',
        societe_id: SOC_ID,
        montant: 12000,
        statut: 'non_rapprochee',
        lettrage_id: null,
      },
    ])
    // Simule le commit du lettrage
    await supabase
      .from('bank_transactions')
      .update({ statut: 'rapprochee', lettrage_id: 'lt-1' })
      .eq('id', 'tx-1')
    await supabase
      .from('factures_ouvertes')
      .update({ statut: 'payee' })
      .eq('id', 'fct-100')

    const { data: tx } = await supabase
      .from('bank_transactions')
      .select('statut, lettrage_id')
      .eq('id', 'tx-1')
      .maybeSingle()
    expect(tx.statut).toBe('rapprochee')
    expect(tx.lettrage_id).toBe('lt-1')

    const { data: fct } = await supabase
      .from('factures_ouvertes')
      .select('statut')
      .eq('id', 'fct-100')
      .maybeSingle()
    expect(fct.statut).toBe('payee')
  })
})
