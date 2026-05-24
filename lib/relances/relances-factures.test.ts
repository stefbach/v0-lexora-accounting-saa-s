import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase } from '@/tests/__mocks__/supabase'
import {
  DEFAULT_DELAIS_JOURS,
  determineNiveauDu,
  findFacturesARelancer,
  envoyerRelance,
  runRelancesQuotidiennes,
  type FactureARelancer,
} from './relances-factures'

// Pas de vrai envoi Resend / WATI dans les tests
beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv('RESEND_API_KEY', '')
  vi.stubEnv('WATI_API_URL', '')
  vi.stubEnv('WATI_API_KEY', '')
})

describe('determineNiveauDu', () => {
  const delais = DEFAULT_DELAIS_JOURS // {1:7, 2:15, 3:30}

  it("retourne null si pas de retard", () => {
    expect(determineNiveauDu(0, null, delais)).toBeNull()
    expect(determineNiveauDu(5, null, delais)).toBeNull()
  })

  it("retourne 1 à J+7 sans historique", () => {
    expect(determineNiveauDu(7, null, delais)).toBe(1)
    expect(determineNiveauDu(10, null, delais)).toBe(1)
  })

  it("retourne 2 à J+15 si N1 déjà envoyé", () => {
    expect(determineNiveauDu(15, 1, delais)).toBe(2)
  })

  it("retourne 3 à J+30 si N2 déjà envoyé", () => {
    expect(determineNiveauDu(40, 2, delais)).toBe(3)
  })

  it("retourne null si dernier niveau déjà au max", () => {
    expect(determineNiveauDu(60, 3, delais)).toBeNull()
  })

  it("saute les niveaux intermédiaires si retard >> seuils", () => {
    // 40 jours sans aucune relance → on envoie directement le N3
    expect(determineNiveauDu(40, null, delais)).toBe(3)
  })

  it("respecte des délais customisés", () => {
    const custom = { 1: 3, 2: 10, 3: 20 } as Record<1 | 2 | 3, number>
    expect(determineNiveauDu(3, null, custom)).toBe(1)
    expect(determineNiveauDu(10, 1, custom)).toBe(2)
  })
})

const SOCIETE = {
  id: 'soc-1',
  nom: 'ACME Ltd',
  relances_actif: true,
  relances_canaux: ['email'],
  relances_delais_jours: { '1': 7, '2': 15, '3': 30 },
}

function factureRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fac-1',
    societe_id: 'soc-1',
    numero_facture: 'F-001',
    tiers: 'BobCo',
    type_facture: 'client',
    date_facture: '2026-03-01',
    date_echeance: '2026-04-01',
    devise: 'MUR',
    montant_ttc: 10000,
    montant_mur: 10000,
    solde_non_paye: 10000,
    statut: 'en_attente',
    contact_id: null,
    ...overrides,
  }
}

describe('findFacturesARelancer', () => {
  it("retourne les factures clients impayées en retard avec le bon niveau", async () => {
    const supabase = createMockSupabase({
      tables: {
        societes: [SOCIETE],
        factures: [
          factureRow({ id: 'fac-late-1', date_echeance: '2026-04-01' }),   // ~40j retard
          factureRow({ id: 'fac-fresh', date_echeance: '2026-05-09' }),    // 1j retard (< 7)
          factureRow({ id: 'fac-paid', statut: 'paye', solde_non_paye: 0 }),
        ],
        factures_relances: [],
        factures_contacts: [],
        clients: [],
      },
    })
    const res = await findFacturesARelancer(supabase as unknown as Parameters<typeof findFacturesARelancer>[0], 'soc-1', {
      today: new Date('2026-05-10T12:00:00Z'),
    })
    const ids = res.map((r) => r.facture_id)
    expect(ids).toContain('fac-late-1')
    expect(ids).not.toContain('fac-fresh')   // pas assez en retard
    expect(ids).not.toContain('fac-paid')    // déjà payée
    const late = res.find((r) => r.facture_id === 'fac-late-1')!
    expect(late.niveau).toBe(3)              // 40j → niveau 3
  })

  it("respecte le dernier niveau déjà envoyé", async () => {
    const supabase = createMockSupabase({
      tables: {
        societes: [SOCIETE],
        factures: [factureRow({ id: 'fac-1', date_echeance: '2026-04-01' })],
        factures_relances: [
          { facture_id: 'fac-1', niveau: 3, statut: 'envoye', dry_run: false },
        ],
        factures_contacts: [],
        clients: [],
      },
    })
    const res = await findFacturesARelancer(supabase as unknown as Parameters<typeof findFacturesARelancer>[0], 'soc-1', {
      today: new Date('2026-05-10T12:00:00Z'),
    })
    expect(res).toHaveLength(0)              // déjà au N3, plus rien à envoyer
  })

  it("ignore les factures fournisseurs", async () => {
    const supabase = createMockSupabase({
      tables: {
        societes: [SOCIETE],
        factures: [factureRow({ id: 'fac-1', type_facture: 'fournisseur' })],
        factures_relances: [],
      },
    })
    const res = await findFacturesARelancer(supabase as unknown as Parameters<typeof findFacturesARelancer>[0], 'soc-1', {
      today: new Date('2026-05-10'),
    })
    expect(res).toHaveLength(0)
  })

  it("résout le contact depuis factures_contacts via contact_id", async () => {
    const supabase = createMockSupabase({
      tables: {
        societes: [SOCIETE],
        factures: [factureRow({ contact_id: 'ct-1' })],
        factures_contacts: [
          { id: 'ct-1', societe_id: 'soc-1', nom: 'BobCo', email: 'bob@example.com', telephone: '+23055512345' },
        ],
        factures_relances: [],
      },
    })
    const res = await findFacturesARelancer(supabase as unknown as Parameters<typeof findFacturesARelancer>[0], 'soc-1', {
      today: new Date('2026-05-10'),
    })
    expect(res[0].contact_email).toBe('bob@example.com')
    expect(res[0].contact_phone).toBe('+23055512345')
  })

  it("filtre les factures avec solde_non_paye <= 1", async () => {
    const supabase = createMockSupabase({
      tables: {
        societes: [SOCIETE],
        factures: [
          factureRow({ id: 'fac-tiny', solde_non_paye: 0.5, statut: 'partiel' }),
          factureRow({ id: 'fac-big', solde_non_paye: 5000, statut: 'partiel' }),
        ],
        factures_relances: [],
      },
    })
    const res = await findFacturesARelancer(supabase as unknown as Parameters<typeof findFacturesARelancer>[0], 'soc-1', {
      today: new Date('2026-05-10'),
    })
    expect(res.map((r) => r.facture_id)).toEqual(['fac-big'])
  })
})

describe('envoyerRelance — dry_run', () => {
  it("trace une ligne factures_relances par canal sans appeler Resend/WATI", async () => {
    const supabase = createMockSupabase()
    const facture: FactureARelancer = {
      facture_id: 'fac-1',
      societe_id: 'soc-1',
      numero_facture: 'F-001',
      tiers: 'BobCo',
      date_facture: '2026-03-01',
      date_echeance: '2026-04-01',
      jours_retard: 40,
      solde_du_mur: 5000,
      devise: 'MUR',
      montant_ttc: 5000,
      niveau: 3,
      contact_email: 'bob@example.com',
      contact_phone: '+23055512345',
    }
    const r = await envoyerRelance(supabase as unknown as Parameters<typeof findFacturesARelancer>[0], {
      facture,
      societe_nom: 'ACME',
      canaux: ['email', 'whatsapp'],
      dry_run: true,
    })
    expect(r.envois).toHaveLength(2)
    expect(r.envois.every((e) => e.statut === 'envoye')).toBe(true)

    const inserts = supabase._state.inserts.filter((i) => i.table === 'factures_relances')
    expect(inserts).toHaveLength(2)
    expect(inserts.every((i) => i.rows[0].dry_run === true)).toBe(true)
    expect(inserts[0].rows[0].sujet).toMatch(/F-001/)
  })

  it("trace 'echec' si pas de destinataire", async () => {
    const supabase = createMockSupabase()
    const facture: FactureARelancer = {
      facture_id: 'fac-1',
      societe_id: 'soc-1',
      numero_facture: 'F-001',
      tiers: 'BobCo',
      date_facture: '2026-03-01',
      date_echeance: '2026-04-01',
      jours_retard: 10,
      solde_du_mur: 5000,
      devise: 'MUR',
      montant_ttc: 5000,
      niveau: 1,
      contact_email: null,
      contact_phone: null,
    }
    const r = await envoyerRelance(supabase as unknown as Parameters<typeof findFacturesARelancer>[0], {
      facture,
      societe_nom: 'ACME',
      canaux: ['email'],
      dry_run: false,
    })
    expect(r.envois[0].statut).toBe('echec')
    expect(r.envois[0].error).toMatch(/Email destinataire manquant/)
  })
})

describe('runRelancesQuotidiennes', () => {
  it("retourne un résumé des envois", async () => {
    const supabase = createMockSupabase({
      tables: {
        societes: [SOCIETE],
        factures: [factureRow({ id: 'fac-1', date_echeance: '2026-04-01', contact_id: 'ct-1' })],
        factures_relances: [],
        factures_contacts: [{ id: 'ct-1', societe_id: 'soc-1', nom: 'BobCo', email: 'b@x.com' }],
        clients: [],
      },
    })
    const summary = await runRelancesQuotidiennes(supabase as unknown as Parameters<typeof findFacturesARelancer>[0], {
      societe_id: 'soc-1',
      dry_run: true,
      today: new Date('2026-05-10'),
    })
    expect(summary.societes_traitees).toBe(1)
    expect(summary.factures_eligibles).toBe(1)
    expect(summary.envois_ok).toBe(1)
    expect(summary.envois_echec).toBe(0)
  })
})
