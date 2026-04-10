import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createEcrituresForFacture, createEcrituresForPayment } from '@/lib/accounting/ecritures-factures'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Back-fill journal entries for all existing factures.
 * This runs once to synchronize the accounting books with the factures table.
 *
 * For each facture:
 *   1. Generate the initial journal entries (401/607/4456 or 411/706/4457)
 *   2. If statut='paye' AND linked to a bank tx → generate payment entries (401D/512C or 512D/411C)
 */
export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { societe_id, dry_run = false } = body
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    // Timeout guard
    const start = Date.now()
    const TIMEOUT = 50000
    const timedOut = () => Date.now() - start > TIMEOUT

    // Fetch all factures for this societe
    const { data: factures, error: fErr } = await supabase
      .from('factures')
      .select('*')
      .eq('societe_id', societe_id)
      .not('statut', 'eq', 'brouillon')
      .order('date_facture', { ascending: true })

    if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 })
    if (!factures || factures.length === 0) {
      return NextResponse.json({ ok: true, message: 'Aucune facture a traiter', stats: { total: 0 } })
    }

    const stats = {
      total: factures.length,
      ecritures_generees: 0,
      paiements_generes: 0,
      errors: [] as string[],
    }

    for (const f of factures) {
      if (timedOut()) {
        stats.errors.push('Timeout — traitement partiel')
        break
      }

      // Dry run: don't actually write
      if (dry_run) {
        stats.ecritures_generees++
        if (f.statut === 'paye') stats.paiements_generes++
        continue
      }

      // 1. Generate initial journal entries for the invoice
      const r = await createEcrituresForFacture(supabase, {
        id: f.id,
        societe_id: f.societe_id,
        numero_facture: f.numero_facture || '',
        tiers: f.tiers || '',
        date_facture: f.date_facture,
        montant_ht: Number(f.montant_ht) || 0,
        montant_tva: Number(f.montant_tva) || 0,
        montant_ttc: Number(f.montant_ttc) || 0,
        type_facture: (f.type_facture === 'fournisseur' ? 'fournisseur' : 'client'),
      })

      if (r.ok) {
        stats.ecritures_generees++
      } else {
        stats.errors.push(`${f.numero_facture || f.id}: ${r.error || 'echec'}`)
      }

      // 2. If paid, generate payment entries too
      if (f.statut === 'paye') {
        // Use rapproche fields if available, otherwise compose a ref from facture id
        let ref_folio: string
        let date_payment: string
        if (f.rapproche_releve_id && f.rapproche_transaction_idx != null) {
          ref_folio = `BANK-${f.rapproche_releve_id}-${f.rapproche_transaction_idx}`
          date_payment = f.rapproche_date || f.date_facture
        } else {
          // No bank link → use facture id as ref, date = invoice date
          ref_folio = `PAY-${f.id}`
          date_payment = f.date_facture
        }
        const amount = Number(f.montant_mur) || Number(f.montant_ttc) || 0
        if (amount > 0) {
          const pr = await createEcrituresForPayment(supabase, {
            societe_id: f.societe_id,
            date_payment,
            amount_mur: amount,
            type: f.type_facture === 'fournisseur' ? 'supplier' : 'client',
            tiers: f.tiers || '',
            ref_folio,
            description: `Paiement ${f.numero_facture || ''} — ${f.tiers || ''}`,
          })
          if (pr.ok) {
            stats.paiements_generes++
          } else {
            stats.errors.push(`paiement ${f.numero_facture}: ${pr.error}`)
          }
        }
      }
    }

    return NextResponse.json({ ok: true, dry_run, stats })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    // Count factures + existing entries
    const { count: nbFactures } = await supabase.from('factures')
      .select('id', { count: 'exact', head: true })
      .eq('societe_id', societe_id)
      .not('statut', 'eq', 'brouillon')

    const { count: nbEcrituresFac } = await supabase.from('ecritures_comptables_v2')
      .select('id', { count: 'exact', head: true })
      .eq('societe_id', societe_id)
      .like('ref_folio', 'FAC-%')

    const { count: nbEcrituresPay } = await supabase.from('ecritures_comptables_v2')
      .select('id', { count: 'exact', head: true })
      .eq('societe_id', societe_id)
      .or('ref_folio.like.BANK-%,ref_folio.like.PAY-%')

    return NextResponse.json({
      societe_id,
      stats: {
        nb_factures_active: nbFactures || 0,
        nb_ecritures_factures: nbEcrituresFac || 0,
        nb_ecritures_paiements: nbEcrituresPay || 0,
        missing_ecritures: Math.max(0, (nbFactures || 0) - Math.floor((nbEcrituresFac || 0) / 2)),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
