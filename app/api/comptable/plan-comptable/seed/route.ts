import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/**
 * Seed Plan Comptable Mauricien (PCM) — toutes classes 1 à 8.
 * Idempotent: upsert sur onConflict compte.
 * Inséré comme "global" (societe_id = null) pour être partagé.
 */
type Row = { compte: string; libelle: string; type_compte: string; sens_normal: 'D' | 'C'; compte_parent: string | null; niveau: number }

const PCM_MAURICE: Row[] = [
  // ─── CLASSE 1 : CAPITAUX ─────────────────────────────────────
  { compte: '10', libelle: 'CAPITAL ET RESERVES', type_compte: 'capitaux', sens_normal: 'C', compte_parent: null, niveau: 2 },
  { compte: '101', libelle: 'Capital social', type_compte: 'capitaux', sens_normal: 'C', compte_parent: '10', niveau: 3 },
  { compte: '106', libelle: 'Réserves', type_compte: 'capitaux', sens_normal: 'C', compte_parent: '10', niveau: 3 },
  { compte: '1061', libelle: 'Réserve légale', type_compte: 'capitaux', sens_normal: 'C', compte_parent: '106', niveau: 4 },
  { compte: '1068', libelle: 'Autres réserves', type_compte: 'capitaux', sens_normal: 'C', compte_parent: '106', niveau: 4 },
  { compte: '11', libelle: 'REPORT A NOUVEAU', type_compte: 'capitaux', sens_normal: 'C', compte_parent: null, niveau: 2 },
  { compte: '110', libelle: 'Report à nouveau créditeur', type_compte: 'capitaux', sens_normal: 'C', compte_parent: '11', niveau: 3 },
  { compte: '119', libelle: 'Report à nouveau débiteur', type_compte: 'capitaux', sens_normal: 'D', compte_parent: '11', niveau: 3 },
  { compte: '12', libelle: 'RESULTAT DE L\'EXERCICE', type_compte: 'capitaux', sens_normal: 'C', compte_parent: null, niveau: 2 },
  { compte: '120', libelle: 'Résultat bénéficiaire', type_compte: 'capitaux', sens_normal: 'C', compte_parent: '12', niveau: 3 },
  { compte: '129', libelle: 'Résultat déficitaire', type_compte: 'capitaux', sens_normal: 'D', compte_parent: '12', niveau: 3 },
  { compte: '16', libelle: 'EMPRUNTS ET DETTES ASSIMILÉES', type_compte: 'passif', sens_normal: 'C', compte_parent: null, niveau: 2 },
  { compte: '164', libelle: 'Emprunts auprès des établissements de crédit', type_compte: 'passif', sens_normal: 'C', compte_parent: '16', niveau: 3 },
  { compte: '165', libelle: 'Dépôts et cautionnements reçus', type_compte: 'passif', sens_normal: 'C', compte_parent: '16', niveau: 3 },
  { compte: '168', libelle: 'Autres emprunts et dettes assimilées', type_compte: 'passif', sens_normal: 'C', compte_parent: '16', niveau: 3 },

  // ─── CLASSE 2 : IMMOBILISATIONS ──────────────────────────────
  { compte: '20', libelle: 'IMMOBILISATIONS INCORPORELLES', type_compte: 'actif', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '201', libelle: 'Frais d\'établissement', type_compte: 'actif', sens_normal: 'D', compte_parent: '20', niveau: 3 },
  { compte: '205', libelle: 'Logiciels, brevets, licences', type_compte: 'actif', sens_normal: 'D', compte_parent: '20', niveau: 3 },
  { compte: '207', libelle: 'Fonds commercial', type_compte: 'actif', sens_normal: 'D', compte_parent: '20', niveau: 3 },
  { compte: '21', libelle: 'IMMOBILISATIONS CORPORELLES', type_compte: 'actif', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '211', libelle: 'Terrains', type_compte: 'actif', sens_normal: 'D', compte_parent: '21', niveau: 3 },
  { compte: '213', libelle: 'Constructions', type_compte: 'actif', sens_normal: 'D', compte_parent: '21', niveau: 3 },
  { compte: '215', libelle: 'Installations techniques, matériel et outillage', type_compte: 'actif', sens_normal: 'D', compte_parent: '21', niveau: 3 },
  { compte: '2181', libelle: 'Installations générales, aménagements', type_compte: 'actif', sens_normal: 'D', compte_parent: '218', niveau: 4 },
  { compte: '2182', libelle: 'Matériel de transport', type_compte: 'actif', sens_normal: 'D', compte_parent: '218', niveau: 4 },
  { compte: '2183', libelle: 'Matériel de bureau et informatique', type_compte: 'actif', sens_normal: 'D', compte_parent: '218', niveau: 4 },
  { compte: '2184', libelle: 'Mobilier', type_compte: 'actif', sens_normal: 'D', compte_parent: '218', niveau: 4 },
  { compte: '27', libelle: 'AUTRES IMMOBILISATIONS FINANCIÈRES', type_compte: 'actif', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '275', libelle: 'Dépôts et cautionnements versés', type_compte: 'actif', sens_normal: 'D', compte_parent: '27', niveau: 3 },
  { compte: '28', libelle: 'AMORTISSEMENTS DES IMMOBILISATIONS', type_compte: 'actif', sens_normal: 'C', compte_parent: null, niveau: 2 },
  { compte: '2805', libelle: 'Amort. logiciels', type_compte: 'actif', sens_normal: 'C', compte_parent: '280', niveau: 4 },
  { compte: '2813', libelle: 'Amort. constructions', type_compte: 'actif', sens_normal: 'C', compte_parent: '281', niveau: 4 },
  { compte: '2815', libelle: 'Amort. installations techniques', type_compte: 'actif', sens_normal: 'C', compte_parent: '281', niveau: 4 },
  { compte: '2818', libelle: 'Amort. autres immobilisations corporelles', type_compte: 'actif', sens_normal: 'C', compte_parent: '281', niveau: 4 },

  // ─── CLASSE 3 : STOCKS ───────────────────────────────────────
  { compte: '31', libelle: 'MATIÈRES PREMIÈRES', type_compte: 'actif', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '32', libelle: 'AUTRES APPROVISIONNEMENTS', type_compte: 'actif', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '35', libelle: 'PRODUITS FINIS', type_compte: 'actif', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '37', libelle: 'MARCHANDISES', type_compte: 'actif', sens_normal: 'D', compte_parent: null, niveau: 2 },

  // ─── CLASSE 4 : TIERS ────────────────────────────────────────
  { compte: '40', libelle: 'FOURNISSEURS ET COMPTES RATTACHÉS', type_compte: 'passif', sens_normal: 'C', compte_parent: null, niveau: 2 },
  { compte: '401', libelle: 'Fournisseurs', type_compte: 'passif', sens_normal: 'C', compte_parent: '40', niveau: 3 },
  { compte: '4010', libelle: 'Fournisseurs — achats de biens et services', type_compte: 'passif', sens_normal: 'C', compte_parent: '401', niveau: 4 },
  { compte: '4011', libelle: 'Fournisseurs — achats hors exploitation', type_compte: 'passif', sens_normal: 'C', compte_parent: '401', niveau: 4 },
  { compte: '403', libelle: 'Fournisseurs — effets à payer', type_compte: 'passif', sens_normal: 'C', compte_parent: '40', niveau: 3 },
  { compte: '408', libelle: 'Fournisseurs — factures non parvenues', type_compte: 'passif', sens_normal: 'C', compte_parent: '40', niveau: 3 },
  { compte: '409', libelle: 'Fournisseurs — avances versées', type_compte: 'actif', sens_normal: 'D', compte_parent: '40', niveau: 3 },
  { compte: '41', libelle: 'CLIENTS ET COMPTES RATTACHÉS', type_compte: 'actif', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '411', libelle: 'Clients', type_compte: 'actif', sens_normal: 'D', compte_parent: '41', niveau: 3 },
  { compte: '413', libelle: 'Clients — effets à recevoir', type_compte: 'actif', sens_normal: 'D', compte_parent: '41', niveau: 3 },
  { compte: '416', libelle: 'Clients douteux ou litigieux', type_compte: 'actif', sens_normal: 'D', compte_parent: '41', niveau: 3 },
  { compte: '418', libelle: 'Clients — produits non encore facturés', type_compte: 'actif', sens_normal: 'D', compte_parent: '41', niveau: 3 },
  { compte: '419', libelle: 'Clients — avances reçues', type_compte: 'passif', sens_normal: 'C', compte_parent: '41', niveau: 3 },
  { compte: '42', libelle: 'PERSONNEL ET COMPTES RATTACHÉS', type_compte: 'passif', sens_normal: 'C', compte_parent: null, niveau: 2 },
  { compte: '421', libelle: 'Personnel — rémunérations dues', type_compte: 'passif', sens_normal: 'C', compte_parent: '42', niveau: 3 },
  { compte: '4210', libelle: 'Salaires nets à payer', type_compte: 'passif', sens_normal: 'C', compte_parent: '421', niveau: 4 },
  { compte: '4211', libelle: 'Primes et gratifications à payer', type_compte: 'passif', sens_normal: 'C', compte_parent: '421', niveau: 4 },
  { compte: '4212', libelle: '13ème mois à payer (EOY Bonus)', type_compte: 'passif', sens_normal: 'C', compte_parent: '421', niveau: 4 },
  { compte: '425', libelle: 'Personnel — avances et acomptes', type_compte: 'actif', sens_normal: 'D', compte_parent: '42', niveau: 3 },
  { compte: '427', libelle: 'Personnel — oppositions et saisies', type_compte: 'passif', sens_normal: 'C', compte_parent: '42', niveau: 3 },
  { compte: '43', libelle: 'ORGANISMES SOCIAUX', type_compte: 'passif', sens_normal: 'C', compte_parent: null, niveau: 2 },
  { compte: '431', libelle: 'CSG — part salariale & patronale', type_compte: 'passif', sens_normal: 'C', compte_parent: '43', niveau: 3 },
  { compte: '432', libelle: 'NSF / Training Levy', type_compte: 'passif', sens_normal: 'C', compte_parent: '43', niveau: 3 },
  { compte: '433', libelle: 'PAYE — Pay As You Earn', type_compte: 'passif', sens_normal: 'C', compte_parent: '43', niveau: 3 },
  { compte: '4330', libelle: 'PAYE à reverser à la MRA', type_compte: 'passif', sens_normal: 'C', compte_parent: '433', niveau: 4 },
  { compte: '44', libelle: 'ETAT ET COLLECTIVITES PUBLIQUES', type_compte: 'passif', sens_normal: 'C', compte_parent: null, niveau: 2 },
  { compte: '4451', libelle: 'TVA à décaisser', type_compte: 'passif', sens_normal: 'C', compte_parent: '445', niveau: 4 },
  { compte: '4452', libelle: 'TVA due intracommunautaire', type_compte: 'passif', sens_normal: 'C', compte_parent: '445', niveau: 4 },
  { compte: '4453', libelle: 'TVA collectée (output)', type_compte: 'passif', sens_normal: 'C', compte_parent: '445', niveau: 4 },
  { compte: '4456', libelle: 'TVA déductible (input)', type_compte: 'actif', sens_normal: 'D', compte_parent: '445', niveau: 4 },
  { compte: '4457', libelle: 'TVA à régulariser', type_compte: 'actif', sens_normal: 'D', compte_parent: '445', niveau: 4 },
  { compte: '447', libelle: 'Autres impôts, taxes et versements assimilés', type_compte: 'passif', sens_normal: 'C', compte_parent: '44', niveau: 3 },
  { compte: '4471', libelle: 'Impôt sur les sociétés (CIT 15%)', type_compte: 'passif', sens_normal: 'C', compte_parent: '447', niveau: 4 },
  { compte: '4472', libelle: 'CSR — Corporate Social Responsibility', type_compte: 'passif', sens_normal: 'C', compte_parent: '447', niveau: 4 },
  { compte: '45', libelle: 'COMPTES COURANTS ASSOCIÉS', type_compte: 'passif', sens_normal: 'C', compte_parent: null, niveau: 2 },
  { compte: '455', libelle: 'Comptes courants associés', type_compte: 'passif', sens_normal: 'C', compte_parent: '45', niveau: 3 },
  { compte: '46', libelle: 'DEBITEURS ET CREDITEURS DIVERS', type_compte: 'actif', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '467', libelle: 'Autres comptes débiteurs ou créditeurs', type_compte: 'actif', sens_normal: 'D', compte_parent: '46', niveau: 3 },
  { compte: '47', libelle: 'COMPTES TRANSITOIRES OU D\'ATTENTE', type_compte: 'actif', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '471', libelle: 'Comptes d\'attente', type_compte: 'actif', sens_normal: 'D', compte_parent: '47', niveau: 3 },

  // ─── CLASSE 5 : TRESORERIE ───────────────────────────────────
  { compte: '50', libelle: 'VALEURS MOBILIERES DE PLACEMENT', type_compte: 'actif', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '51', libelle: 'BANQUES ET ÉTABLISSEMENTS FINANCIERS', type_compte: 'actif', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '512', libelle: 'Banque', type_compte: 'actif', sens_normal: 'D', compte_parent: '51', niveau: 3 },
  { compte: '512100', libelle: 'Banque MUR', type_compte: 'actif', sens_normal: 'D', compte_parent: '512', niveau: 4 },
  { compte: '512200', libelle: 'Banque EUR', type_compte: 'actif', sens_normal: 'D', compte_parent: '512', niveau: 4 },
  { compte: '512300', libelle: 'Banque USD', type_compte: 'actif', sens_normal: 'D', compte_parent: '512', niveau: 4 },
  { compte: '512400', libelle: 'Banque GBP', type_compte: 'actif', sens_normal: 'D', compte_parent: '512', niveau: 4 },
  { compte: '514', libelle: 'Chèques postaux', type_compte: 'actif', sens_normal: 'D', compte_parent: '51', niveau: 3 },
  { compte: '53', libelle: 'CAISSE', type_compte: 'actif', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '531', libelle: 'Caisse principale', type_compte: 'actif', sens_normal: 'D', compte_parent: '53', niveau: 3 },
  { compte: '58', libelle: 'VIREMENTS INTERNES', type_compte: 'actif', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '581', libelle: 'Virements internes', type_compte: 'actif', sens_normal: 'D', compte_parent: '58', niveau: 3 },
  { compte: '59', libelle: 'PROVISIONS POUR DEPRECIATION', type_compte: 'actif', sens_normal: 'C', compte_parent: null, niveau: 2 },

  // ─── CLASSE 6 : CHARGES ──────────────────────────────────────
  { compte: '60', libelle: 'ACHATS ET VARIATIONS DE STOCKS', type_compte: 'charge', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '601', libelle: 'Achats de matières premières', type_compte: 'charge', sens_normal: 'D', compte_parent: '60', niveau: 3 },
  { compte: '606', libelle: 'Achats non stockés (fournitures)', type_compte: 'charge', sens_normal: 'D', compte_parent: '60', niveau: 3 },
  { compte: '607', libelle: 'Achats de marchandises', type_compte: 'charge', sens_normal: 'D', compte_parent: '60', niveau: 3 },
  { compte: '61', libelle: 'SERVICES EXTÉRIEURS', type_compte: 'charge', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '611', libelle: 'Sous-traitance générale', type_compte: 'charge', sens_normal: 'D', compte_parent: '61', niveau: 3 },
  { compte: '612', libelle: 'Loyers et charges locatives', type_compte: 'charge', sens_normal: 'D', compte_parent: '61', niveau: 3 },
  { compte: '613', libelle: 'Locations mobilières', type_compte: 'charge', sens_normal: 'D', compte_parent: '61', niveau: 3 },
  { compte: '615', libelle: 'Entretien et réparations', type_compte: 'charge', sens_normal: 'D', compte_parent: '61', niveau: 3 },
  { compte: '616', libelle: 'Primes d\'assurance', type_compte: 'charge', sens_normal: 'D', compte_parent: '61', niveau: 3 },
  { compte: '62', libelle: 'AUTRES SERVICES EXTÉRIEURS', type_compte: 'charge', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '621', libelle: 'Personnel extérieur à l\'entreprise', type_compte: 'charge', sens_normal: 'D', compte_parent: '62', niveau: 3 },
  { compte: '622', libelle: 'Honoraires, commissions', type_compte: 'charge', sens_normal: 'D', compte_parent: '62', niveau: 3 },
  { compte: '623', libelle: 'Publicité, annonces, relations publiques', type_compte: 'charge', sens_normal: 'D', compte_parent: '62', niveau: 3 },
  { compte: '624', libelle: 'Transport de biens et transports collectifs', type_compte: 'charge', sens_normal: 'D', compte_parent: '62', niveau: 3 },
  { compte: '625', libelle: 'Déplacements, missions, réceptions', type_compte: 'charge', sens_normal: 'D', compte_parent: '62', niveau: 3 },
  { compte: '626', libelle: 'Frais postaux et télécommunications', type_compte: 'charge', sens_normal: 'D', compte_parent: '62', niveau: 3 },
  { compte: '627', libelle: 'Services bancaires et assimilés', type_compte: 'charge', sens_normal: 'D', compte_parent: '62', niveau: 3 },
  { compte: '628', libelle: 'Autres charges externes diverses', type_compte: 'charge', sens_normal: 'D', compte_parent: '62', niveau: 3 },
  { compte: '63', libelle: 'IMPOTS, TAXES ET VERSEMENTS ASSIMILÉS', type_compte: 'charge', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '635', libelle: 'Autres impôts, taxes (hors IS)', type_compte: 'charge', sens_normal: 'D', compte_parent: '63', niveau: 3 },
  { compte: '64', libelle: 'CHARGES DE PERSONNEL', type_compte: 'charge', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '641', libelle: 'Rémunérations du personnel', type_compte: 'charge', sens_normal: 'D', compte_parent: '64', niveau: 3 },
  { compte: '641100', libelle: 'Salaires bruts', type_compte: 'charge', sens_normal: 'D', compte_parent: '641', niveau: 4 },
  { compte: '641200', libelle: 'Primes', type_compte: 'charge', sens_normal: 'D', compte_parent: '641', niveau: 4 },
  { compte: '641300', libelle: '13ème mois', type_compte: 'charge', sens_normal: 'D', compte_parent: '641', niveau: 4 },
  { compte: '645', libelle: 'Charges sociales patronales', type_compte: 'charge', sens_normal: 'D', compte_parent: '64', niveau: 3 },
  { compte: '645100', libelle: 'Cotisations CSG patronales', type_compte: 'charge', sens_normal: 'D', compte_parent: '645', niveau: 4 },
  { compte: '645200', libelle: 'Cotisations NSF patronales', type_compte: 'charge', sens_normal: 'D', compte_parent: '645', niveau: 4 },
  { compte: '65', libelle: 'AUTRES CHARGES DE GESTION COURANTE', type_compte: 'charge', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '651', libelle: 'Redevances SaaS, concessions, droits', type_compte: 'charge', sens_normal: 'D', compte_parent: '65', niveau: 3 },
  { compte: '66', libelle: 'CHARGES FINANCIÈRES', type_compte: 'charge', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '661', libelle: 'Intérêts et charges assimilées', type_compte: 'charge', sens_normal: 'D', compte_parent: '66', niveau: 3 },
  { compte: '666', libelle: 'Pertes de change', type_compte: 'charge', sens_normal: 'D', compte_parent: '66', niveau: 3 },
  { compte: '67', libelle: 'CHARGES EXCEPTIONNELLES', type_compte: 'charge', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '68', libelle: 'DOTATIONS AUX AMORTISSEMENTS', type_compte: 'charge', sens_normal: 'D', compte_parent: null, niveau: 2 },
  { compte: '681', libelle: 'Dotations aux amortissements — exploitation', type_compte: 'charge', sens_normal: 'D', compte_parent: '68', niveau: 3 },
  { compte: '695', libelle: 'Impôt sur les sociétés', type_compte: 'charge', sens_normal: 'D', compte_parent: null, niveau: 2 },

  // ─── CLASSE 7 : PRODUITS ─────────────────────────────────────
  { compte: '70', libelle: 'VENTES DE PRODUITS ET SERVICES', type_compte: 'produit', sens_normal: 'C', compte_parent: null, niveau: 2 },
  { compte: '701', libelle: 'Ventes de produits finis', type_compte: 'produit', sens_normal: 'C', compte_parent: '70', niveau: 3 },
  { compte: '706', libelle: 'Prestations de services', type_compte: 'produit', sens_normal: 'C', compte_parent: '70', niveau: 3 },
  { compte: '707', libelle: 'Ventes de marchandises', type_compte: 'produit', sens_normal: 'C', compte_parent: '70', niveau: 3 },
  { compte: '708', libelle: 'Produits des activités annexes', type_compte: 'produit', sens_normal: 'C', compte_parent: '70', niveau: 3 },
  { compte: '74', libelle: 'SUBVENTIONS D\'EXPLOITATION', type_compte: 'produit', sens_normal: 'C', compte_parent: null, niveau: 2 },
  { compte: '75', libelle: 'AUTRES PRODUITS DE GESTION', type_compte: 'produit', sens_normal: 'C', compte_parent: null, niveau: 2 },
  { compte: '753', libelle: 'Jetons de présence, commissions', type_compte: 'produit', sens_normal: 'C', compte_parent: '75', niveau: 3 },
  { compte: '76', libelle: 'PRODUITS FINANCIERS', type_compte: 'produit', sens_normal: 'C', compte_parent: null, niveau: 2 },
  { compte: '761', libelle: 'Produits des participations', type_compte: 'produit', sens_normal: 'C', compte_parent: '76', niveau: 3 },
  { compte: '766', libelle: 'Gains de change', type_compte: 'produit', sens_normal: 'C', compte_parent: '76', niveau: 3 },
  { compte: '77', libelle: 'PRODUITS EXCEPTIONNELS', type_compte: 'produit', sens_normal: 'C', compte_parent: null, niveau: 2 },
]

async function requireAdmin() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin', 'comptable', 'comptable_dedie', 'client_admin'].includes(profile.role)) {
    return null
  }
  return user
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = getAdminClient()
    const body = await request.json().catch(() => ({}))
    const societe_id: string | null = body.societe_id || null

    const rows = PCM_MAURICE.map(r => ({ ...r, societe_id, actif: true }))

    const { data, error } = await supabase
      .from('plan_comptable')
      .upsert(rows, { onConflict: societe_id ? 'societe_id,compte' : 'compte', ignoreDuplicates: true })
      .select('compte')

    if (error) throw error

    // Count total after seed
    const { count } = await supabase
      .from('plan_comptable')
      .select('compte', { head: true, count: 'exact' })

    return NextResponse.json({
      seeded: data?.length || 0,
      total_in_db: count,
      message: `${data?.length || 0} comptes ajoutés (total: ${count})`,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
