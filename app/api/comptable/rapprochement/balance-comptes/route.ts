import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Noms courts des comptes du plan comptable mauricien utilises ici.
const COMPTES_LIB: Record<string, string> = {
  '108': 'Compte de l exploitant',
  '401': 'Fournisseurs',
  '411': 'Clients',
  '421': 'Personnel — remunerations',
  '425': 'Avances au personnel',
  '431': 'Securite sociale',
  '44551': 'TVA deductible',
  '447': 'Etat — impots et taxes',
  '455': 'Comptes courants associes',
  '467': 'Comptes inter-societes',
  '471': 'Charges a classer',
  '512': 'Banques',
  '580': 'Virements internes (transit)',
  '627': 'Services bancaires',
  '635': 'Droits de timbre',
  '641': 'Remuneration du personnel',
  '658': 'Autres charges de gestion',
  '665': 'Escomptes accordes',
  '666': 'Pertes de change',
  '673': 'Charges exceptionnelles',
  '758': 'Autres produits de gestion',
  '765': 'Escomptes obtenus',
  '766': 'Gains de change',
  '773': 'Produits exceptionnels',
}

function libForCompte(numero: string): string {
  if (!numero) return ''
  // Match exact d abord, sinon prefixe progressif (ex: 401001 -> 401)
  if (COMPTES_LIB[numero]) return COMPTES_LIB[numero]
  for (let len = numero.length - 1; len >= 3; len--) {
    const prefix = numero.substring(0, len)
    if (COMPTES_LIB[prefix]) return COMPTES_LIB[prefix]
  }
  return ''
}

/**
 * GET /api/comptable/rapprochement/balance-comptes?societe_id=xxx&mois=YYYY-MM
 *
 * Retourne la balance par compte pour la periode donnee :
 *   - compte, libelle, debit_total, credit_total, solde (debit - credit),
 *     nb_ecritures, nb_lettrees
 *
 * Si mois non specifie, retourne la balance sur toutes les ecritures.
 */
export async function GET(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const mois = searchParams.get('mois') // YYYY-MM, optionnel
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()

    const { data: dossier } = await supabase
      .from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
    if (!dossier) return NextResponse.json({ comptes: [], message: 'Aucun dossier' })

    let query = supabase
      .from('ecritures_comptables_v2')
      .select('numero_compte, debit_mur, credit_mur, lettre, date_ecriture, libelle, journal, ref_folio')
      .eq('dossier_id', dossier.id)
      .order('date_ecriture', { ascending: false })

    if (mois && /^\d{4}-\d{2}$/.test(mois)) {
      const [yy, mm] = mois.split('-').map(Number)
      const start = `${yy}-${String(mm).padStart(2, '0')}-01`
      const lastDay = new Date(yy, mm, 0).getDate()
      const end = `${yy}-${String(mm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      query = query.gte('date_ecriture', start).lte('date_ecriture', end)
    }

    const { data: ecritures, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Agregation par compte
    type CompteRow = {
      compte: string
      libelle: string
      debit_total: number
      credit_total: number
      solde: number
      nb_ecritures: number
      nb_lettrees: number
      derniere_ecriture: string | null
      sample: any[]
    }
    const map: Record<string, CompteRow> = {}

    for (const e of ecritures || []) {
      const compte = String(e.numero_compte || '')
      if (!compte) continue
      if (!map[compte]) {
        map[compte] = {
          compte,
          libelle: libForCompte(compte),
          debit_total: 0,
          credit_total: 0,
          solde: 0,
          nb_ecritures: 0,
          nb_lettrees: 0,
          derniere_ecriture: null,
          sample: [],
        }
      }
      const row = map[compte]
      row.debit_total += Number(e.debit_mur) || 0
      row.credit_total += Number(e.credit_mur) || 0
      row.nb_ecritures++
      if (e.lettre) row.nb_lettrees++
      if (!row.derniere_ecriture || String(e.date_ecriture) > row.derniere_ecriture) {
        row.derniere_ecriture = String(e.date_ecriture || '')
      }
      // Garder les 5 dernieres ecritures comme echantillon
      if (row.sample.length < 5) {
        row.sample.push({
          date: e.date_ecriture,
          libelle: e.libelle,
          debit: Number(e.debit_mur) || 0,
          credit: Number(e.credit_mur) || 0,
          journal: e.journal,
          lettre: e.lettre,
          ref_folio: e.ref_folio,
        })
      }
    }

    for (const row of Object.values(map)) {
      row.solde = Math.round((row.debit_total - row.credit_total) * 100) / 100
      row.debit_total = Math.round(row.debit_total * 100) / 100
      row.credit_total = Math.round(row.credit_total * 100) / 100
    }

    const comptes = Object.values(map).sort((a, b) => a.compte.localeCompare(b.compte))

    const totals = {
      debit_total: comptes.reduce((s, c) => s + c.debit_total, 0),
      credit_total: comptes.reduce((s, c) => s + c.credit_total, 0),
      difference: 0,
      nb_comptes: comptes.length,
      nb_ecritures: comptes.reduce((s, c) => s + c.nb_ecritures, 0),
    }
    totals.difference = Math.round((totals.debit_total - totals.credit_total) * 100) / 100

    return NextResponse.json({ societe_id, mois: mois || null, comptes, totals })
  } catch (e: any) {
    console.error('[balance-comptes]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
