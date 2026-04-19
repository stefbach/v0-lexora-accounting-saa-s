/**
 * API — Historique des mouvements d'un CCA (côté comptable).
 *
 * GET  /api/comptable/cca/[ccaId]/mouvements?societe_id=...
 * POST /api/comptable/cca/[ccaId]/mouvements
 *   body : { societe_id, type, montant, date_mouvement?, description?, facture_id? }
 */
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertSocieteAccess,
  mapSocieteAccessError,
} from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = [
  'comptable',
  'comptable_dedie',
  'admin',
  'super_admin',
  'client_admin',
]

async function requireUserWithRole() {
  const supabaseAuth = await createServerClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }

  const admin = getAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const role = (profile?.role as string) ?? ''
  if (!ALLOWED_ROLES.includes(role)) {
    return { error: NextResponse.json({ error: 'Rôle non autorisé' }, { status: 403 }) }
  }
  return { user, admin }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ ccaId: string }> },
) {
  try {
    const ctx = await requireUserWithRole()
    if ('error' in ctx) return ctx.error
    const { user, admin } = ctx

    const { ccaId } = await context.params
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id || !ccaId) {
      return NextResponse.json({ error: 'societe_id et ccaId requis' }, { status: 400 })
    }

    try {
      await assertSocieteAccess(admin, user.id, societe_id)
    } catch (err) {
      const mapped = mapSocieteAccessError(err)
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
      throw err
    }

    const { data: cca } = await admin
      .from('comptes_courants_associes')
      .select('*')
      .eq('id', ccaId)
      .eq('societe_id', societe_id)
      .maybeSingle()
    if (!cca) return NextResponse.json({ error: 'CCA introuvable' }, { status: 404 })

    const { data: mouvements, error } = await admin
      .from('mouvements_compte_courant')
      .select('*')
      .eq('compte_courant_id', ccaId)
      .eq('societe_id', societe_id)
      .order('date_mouvement', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error

    return NextResponse.json({ compte: cca, mouvements: mouvements ?? [] })
  } catch (e: unknown) {
    console.error('[cca/[ccaId]/mouvements GET]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ ccaId: string }> },
) {
  try {
    const ctx = await requireUserWithRole()
    if ('error' in ctx) return ctx.error
    const { user, admin } = ctx

    const { ccaId } = await context.params
    const body = await request.json()
    const { societe_id, type, montant, description, date_mouvement, facture_id } = body ?? {}
    if (!societe_id || !ccaId) {
      return NextResponse.json({ error: 'societe_id et ccaId requis' }, { status: 400 })
    }
    if (!['avance', 'remboursement'].includes(type)) {
      return NextResponse.json({ error: 'type invalide' }, { status: 400 })
    }
    const montantNum = Number(montant)
    if (!Number.isFinite(montantNum) || montantNum <= 0) {
      return NextResponse.json({ error: 'montant doit être > 0' }, { status: 400 })
    }
    const today = new Date().toISOString().split('T')[0]
    const dateMvt = (date_mouvement as string) || today
    if (dateMvt > today) {
      return NextResponse.json({ error: 'date_mouvement ne peut pas être future' }, { status: 400 })
    }

    try {
      await assertSocieteAccess(admin, user.id, societe_id)
    } catch (err) {
      const mapped = mapSocieteAccessError(err)
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
      throw err
    }

    const { data: cca } = await admin
      .from('comptes_courants_associes')
      .select('*')
      .eq('id', ccaId)
      .eq('societe_id', societe_id)
      .maybeSingle()
    if (!cca) return NextResponse.json({ error: 'CCA introuvable' }, { status: 404 })

    const signed = type === 'avance' ? montantNum : -montantNum
    const { data: mouvement, error } = await admin
      .from('mouvements_compte_courant')
      .insert({
        compte_courant_id: ccaId,
        societe_id,
        date_mouvement: dateMvt,
        type,
        montant: signed,
        description: description ?? null,
        facture_id: facture_id || null,
      })
      .select()
      .single()
    if (error) throw error

    const ccaTyped = cca as { nom: string; type: string; solde: number | string | null }
    const newSolde = Number(ccaTyped.solde ?? 0) + signed
    await admin
      .from('comptes_courants_associes')
      .update({ solde: newSolde, updated_at: new Date().toISOString() })
      .eq('id', ccaId)

    const compteTiers = ccaTyped.type === 'associe' ? '455001' : '467001'
    const ecriture_suggestion =
      type === 'avance'
        ? {
            debit: '6',
            credit: compteTiers,
            montant: montantNum,
            libelle: `Avance ${ccaTyped.nom}${description ? ' — ' + description : ''}`,
          }
        : {
            debit: compteTiers,
            credit: '512100',
            montant: montantNum,
            libelle: `Remboursement ${ccaTyped.nom}${description ? ' — ' + description : ''}`,
          }

    return NextResponse.json({ mouvement, newSolde, ecriture_suggestion })
  } catch (e: unknown) {
    console.error('[cca/[ccaId]/mouvements POST]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}
