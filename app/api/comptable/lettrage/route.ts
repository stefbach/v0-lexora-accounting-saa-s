import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { buildMatches, balanceCheck, type Entry } from '@/lib/accounting/lettrage-engine'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireAllowedRole() {
  const supabaseAuth = await createServerClient()
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
  if (!user || authError) return { user: null, email: null }
  const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin', 'comptable', 'comptable_dedie', 'client_admin'].includes(profile.role)) {
    return { user: null, email: null }
  }
  return { user, email: user.email }
}

type EntryFull = Entry & { lettre?: string | null; date_lettrage?: string | null; lettrage_auto?: boolean }

async function fetchEntries(
  supabase: ReturnType<typeof getAdminClient>,
  societe_id: string,
  opts: { compte?: string | null; date_debut?: string | null; date_fin?: string | null; only_unlettered?: boolean },
): Promise<EntryFull[]> {
  const { data: dossiers } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id)
  const dossierIds = (dossiers || []).map((d: { id: string }) => d.id)

  const entries: EntryFull[] = []

  if (dossierIds.length > 0) {
    let q = supabase
      .from('ecritures_comptables')
      .select('id, compte, libelle, date_ecriture, debit, credit, lettre, date_lettrage, lettrage_auto, piece_justificative')
      .in('dossier_id', dossierIds)
    if (opts.only_unlettered) q = q.is('lettre', null)
    if (opts.compte) q = q.like('compte', `${opts.compte}%`)
    if (opts.date_debut) q = q.gte('date_ecriture', opts.date_debut)
    if (opts.date_fin) q = q.lte('date_ecriture', opts.date_fin)
    const { data } = await q.order('compte').order('date_ecriture').limit(2000)
    for (const e of data || []) {
      entries.push({
        id: e.id,
        compte: e.compte,
        libelle: e.libelle,
        date_ecriture: e.date_ecriture,
        debit: Number(e.debit) || 0,
        credit: Number(e.credit) || 0,
        piece_justificative: e.piece_justificative,
        lettre: e.lettre,
        date_lettrage: e.date_lettrage,
        lettrage_auto: e.lettrage_auto,
      })
    }
  }

  return entries
}

export async function GET(request: Request) {
  try {
    const { user } = await requireAllowedRole()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const compte = searchParams.get('compte')
    const date_debut = searchParams.get('date_debut')
    const date_fin = searchParams.get('date_fin')
    const view = searchParams.get('view') || 'unlettered' // unlettered | all

    const entries = await fetchEntries(supabase, societe_id, {
      compte, date_debut, date_fin,
      only_unlettered: view === 'unlettered',
    })

    // Also include already-lettered for display when view=all
    let all: Entry[] = entries
    if (view === 'all') {
      all = entries
    }

    const byCompte: Record<string, Entry[]> = {}
    for (const e of all) (byCompte[e.compte] ||= []).push(e)

    return NextResponse.json({
      ecritures: all,
      par_compte: byCompte,
      nb: all.length,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

async function logAudit(
  supabase: ReturnType<typeof getAdminClient>,
  params: {
    societe_id: string
    action: string
    lettre_code?: string
    montant?: number
    strategy?: string
    reason?: string
    ecriture_ids?: string[]
    user_id?: string
    user_email?: string | null
  },
) {
  try {
    await supabase.from('rapprochement_audit_log').insert({
      societe_id: params.societe_id,
      action: params.action,
      lettre_code: params.lettre_code,
      montant: params.montant,
      strategy: params.strategy,
      reason: params.reason,
      facture_ids: [],
      ecriture_id: params.ecriture_ids?.[0],
      after_state: { ecriture_ids: params.ecriture_ids || [] },
      user_id: params.user_id,
      user_email: params.user_email,
    })
  } catch {
    // audit log is best-effort — don't break the main flow
  }
}

export async function POST(request: Request) {
  try {
    const { user, email } = await requireAllowedRole()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action, societe_id, ecriture_ids, lettre } = body

    if (action === 'propose' || action === 'auto_v2') {
      const entries = await fetchEntries(supabase, societe_id, {
        compte: body.compte || null,
        date_debut: body.date_debut || null,
        date_fin: body.date_fin || null,
        only_unlettered: true,
      })

      // Determine starting lettre index by scanning existing letters
      const { data: existing } = await supabase
        .from('ecritures_comptables')
        .select('lettre')
        .not('lettre', 'is', null)
        .limit(500)
      const existingLetters = new Set((existing || []).map((e: { lettre: string | null }) => e.lettre))
      let lettreStart = 0
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      while (lettreStart < 26 * 27) {
        const code = lettreStart < 26
          ? alphabet[lettreStart]
          : alphabet[Math.floor(lettreStart / 26) - 1] + alphabet[lettreStart % 26]
        if (!existingLetters.has(code)) break
        lettreStart++
      }

      const groups = buildMatches(entries, lettreStart)

      if (action === 'propose') {
        return NextResponse.json({ groups, nb_entries_analyzed: entries.length })
      }

      // auto_v2: apply the groups
      let applied = 0
      for (const g of groups) {
        const today = new Date().toISOString().split('T')[0]
        const { error } = await supabase
          .from('ecritures_comptables')
          .update({ lettre: g.lettre, date_lettrage: today, lettrage_auto: true })
          .in('id', g.ids)
        if (!error) {
          applied += g.ids.length
          await logAudit(supabase, {
            societe_id,
            action: 'lettrer_auto_v2',
            lettre_code: g.lettre,
            montant: g.total_debit,
            strategy: g.strategy,
            reason: g.reason,
            ecriture_ids: g.ids,
            user_id: user.id,
            user_email: email,
          })
        }
      }
      return NextResponse.json({
        nb_groups: groups.length,
        nb_lettres: applied,
        message: `${groups.length} groupe(s) lettré(s) — ${applied} écritures`,
      })
    }

    if (action === 'auto') {
      // Legacy simple 1↔1 exact-amount algo (kept for backward-compat)
      const entries = await fetchEntries(supabase, societe_id, { only_unlettered: true })
      if (!entries.length) return NextResponse.json({ nb_lettres: 0, message: 'Aucune écriture non lettrée' })

      const byCompte: Record<string, Entry[]> = {}
      for (const e of entries) (byCompte[e.compte] ||= []).push(e)

      let matchCount = 0
      let lettreIdx = 0
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      const nextLettre = () => {
        const i = lettreIdx++
        return i < 26 ? alphabet[i] : alphabet[Math.floor(i / 26) - 1] + alphabet[i % 26]
      }

      for (const [, items] of Object.entries(byCompte)) {
        const debits = items.filter(e => e.debit > 0)
        const credits = items.filter(e => e.credit > 0)
        const usedCredits = new Set<string>()
        for (const d of debits) {
          const matchingCredit = credits.find(c =>
            !usedCredits.has(c.id) && Math.abs(d.debit - c.credit) < 0.01,
          )
          if (matchingCredit) {
            const code = nextLettre()
            const today = new Date().toISOString().split('T')[0]
            await supabase.from('ecritures_comptables')
              .update({ lettre: code, date_lettrage: today, lettrage_auto: true })
              .in('id', [d.id, matchingCredit.id])
            usedCredits.add(matchingCredit.id)
            matchCount += 2
            await logAudit(supabase, {
              societe_id,
              action: 'lettrer_auto',
              lettre_code: code,
              montant: d.debit,
              strategy: 'exact_1to1_simple',
              ecriture_ids: [d.id, matchingCredit.id],
              user_id: user.id,
              user_email: email,
            })
          }
        }
      }
      return NextResponse.json({ nb_lettres: matchCount, message: `${matchCount} écritures lettrées` })
    }

    if (action === 'manuel') {
      if (!ecriture_ids?.length || !lettre) {
        return NextResponse.json({ error: 'ecriture_ids et lettre requis' }, { status: 400 })
      }

      // Validate balance: sum(debit) must equal sum(credit) within tolerance
      const { data: rows } = await supabase
        .from('ecritures_comptables')
        .select('id, compte, debit, credit, date_ecriture, libelle')
        .in('id', ecriture_ids)
      if (!rows || rows.length !== ecriture_ids.length) {
        return NextResponse.json({ error: 'Certaines écritures sont introuvables' }, { status: 422 })
      }
      type RowType = { id: string; compte: string; debit: number; credit: number; date_ecriture: string; libelle: string | null }
      const typedRows = rows as RowType[]
      const comptes = new Set(typedRows.map(r => r.compte))
      if (comptes.size > 1 && !body.allow_cross_account) {
        return NextResponse.json({
          error: `Lettrage multi-compte refusé (${[...comptes].join(', ')}). Ajouter allow_cross_account=true pour forcer.`,
        }, { status: 422 })
      }
      const entries: Entry[] = typedRows.map(r => ({
        id: r.id,
        compte: r.compte,
        debit: Number(r.debit) || 0,
        credit: Number(r.credit) || 0,
        date_ecriture: r.date_ecriture,
        libelle: r.libelle,
      }))
      const { debit, credit, ecart } = balanceCheck(entries, ecriture_ids)
      if (ecart > 0.01 && !body.force) {
        return NextResponse.json({
          error: `Déséquilibre ${ecart.toFixed(2)} (D=${debit.toFixed(2)}, C=${credit.toFixed(2)}). Ajouter force=true pour lettrage partiel.`,
          balance: { debit, credit, ecart },
        }, { status: 422 })
      }

      const today = new Date().toISOString().split('T')[0]
      await supabase.from('ecritures_comptables')
        .update({ lettre, date_lettrage: today, lettrage_auto: false })
        .in('id', ecriture_ids)

      await logAudit(supabase, {
        societe_id,
        action: 'lettrer_manuel',
        lettre_code: lettre,
        montant: debit,
        strategy: ecart > 0.01 ? 'manuel_partiel' : 'manuel_equilibre',
        reason: ecart > 0.01 ? `Lettrage partiel (écart ${ecart.toFixed(2)})` : undefined,
        ecriture_ids,
        user_id: user.id,
        user_email: email,
      })
      return NextResponse.json({
        message: `${ecriture_ids.length} écritures lettrées avec ${lettre}`,
        balance: { debit, credit, ecart },
      })
    }

    if (action === 'delettrer') {
      if (!ecriture_ids?.length) return NextResponse.json({ error: 'ecriture_ids requis' }, { status: 400 })
      const { data: rows } = await supabase
        .from('ecritures_comptables')
        .select('lettre')
        .in('id', ecriture_ids)
      const codes = [...new Set((rows || []).map((r: { lettre: string | null }) => r.lettre).filter(Boolean))]
      await supabase.from('ecritures_comptables')
        .update({ lettre: null, date_lettrage: null, lettrage_auto: false })
        .in('id', ecriture_ids)
      await logAudit(supabase, {
        societe_id,
        action: 'delettrer',
        lettre_code: codes.join(','),
        ecriture_ids,
        user_id: user.id,
        user_email: email,
      })
      return NextResponse.json({ message: 'Lettrage supprimé' })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
