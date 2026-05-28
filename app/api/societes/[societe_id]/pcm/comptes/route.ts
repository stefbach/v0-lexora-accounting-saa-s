/**
 * GET  /api/societes/{societe_id}/pcm/comptes
 *      ?classe=4&search=tva&include_archived=false&parent=4511
 * POST /api/societes/{societe_id}/pcm/comptes
 *      Crée un compte unitaire.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { deriveParent } from '@/lib/pcm/templates'
import { writeAuditLog } from '@/lib/pcm/audit-log'
import { PCMError, isPCMError } from '@/lib/pcm/errors'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const SELECT_COLS =
  'id, numero, numero_parent, intitule, intitule_custom, classe, type, nature, sens_normal, lettrable, obligatoire, archive, archive_reason, archive_target, template_source, tags, created_at, updated_at'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ societe_id: string }> },
) {
  try {
    const { societe_id } = await params
    const user = await resolveUserAuth(request)
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    const { searchParams } = new URL(request.url)
    const classe = searchParams.get('classe')
    const search = searchParams.get('search')
    const includeArchived = searchParams.get('include_archived') === 'true'
    const parent = searchParams.get('parent')

    let q = admin.from('comptes_societes').select(SELECT_COLS).eq('societe_id', societe_id)
    if (classe) q = q.eq('classe', Number(classe))
    if (!includeArchived) q = q.eq('archive', false)
    if (parent) q = q.eq('numero_parent', parent)
    if (search) q = q.or(`numero.ilike.%${search}%,intitule.ilike.%${search}%`)
    q = q.order('numero', { ascending: true })

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ comptes: data || [], count: data?.length || 0 })
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

const NUMERO_REGEX = /^[0-9]{1,8}(\.[A-Z0-9_]{1,16})?$/

const createSchema = z.object({
  numero: z.string().regex(NUMERO_REGEX, 'Numéro invalide (ex: 4511 ou 4511.OCC)'),
  intitule: z.string().min(1),
  classe: z.number().int().min(1).max(8),
  type: z.enum(['actif', 'passif', 'charge', 'produit', 'mixte', 'tresorerie']),
  nature: z.string().optional(),
  sens_normal: z.enum(['debit', 'credit', 'mixte']).default('mixte'),
  lettrable: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ societe_id: string }> },
) {
  try {
    const { societe_id } = await params
    const user = await resolveUserAuth(request)
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    const raw = await request.json().catch(() => ({}))
    const parsed = createSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Body invalide', details: parsed.error.issues }, { status: 400 })
    }
    const c = parsed.data

    // Cohérence classe / numéro
    if (Number(c.numero[0]) !== c.classe) {
      throw new PCMError('PCM_009', `Compte ${c.numero} incohérent avec classe ${c.classe}`)
    }

    // Doublon ?
    const { data: existing } = await admin
      .from('comptes_societes').select('id')
      .eq('societe_id', societe_id).eq('numero', c.numero).maybeSingle()
    if (existing) {
      throw new PCMError('PCM_003', `Le compte ${c.numero} existe déjà pour cette société`)
    }

    const numeroParent = deriveParent(c.numero)
    // Si sous-compte, vérifier que le parent existe
    if (numeroParent) {
      const { data: parentRow } = await admin
        .from('comptes_societes').select('id')
        .eq('societe_id', societe_id).eq('numero', numeroParent).maybeSingle()
      if (!parentRow) {
        throw new PCMError('PCM_004', `Compte parent ${numeroParent} introuvable — créez-le d'abord`)
      }
    }

    const { data: inserted, error } = await admin.from('comptes_societes').insert({
      societe_id, numero: c.numero, numero_parent: numeroParent,
      intitule: c.intitule, intitule_custom: false,
      classe: c.classe, type: c.type, nature: c.nature ?? null,
      sens_normal: c.sens_normal, lettrable: c.lettrable, obligatoire: false,
      template_source: 'custom', tags: c.tags, metadata: c.metadata ?? {},
      created_by: user.id, updated_by: user.id,
    }).select(SELECT_COLS).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog(admin, {
      societe_id, action: 'create_compte', entity_type: 'compte', entity_id: c.numero,
      after_state: inserted, actor_id: user.id,
      actor_type: user.source === 'api_key' ? 'mcp_llm' : 'user',
      reason: 'Création manuelle compte',
    })

    return NextResponse.json({ success: true, compte: inserted })
  } catch (e: any) {
    if (isPCMError(e)) return NextResponse.json(e.toJSON(), { status: e.httpStatus })
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
