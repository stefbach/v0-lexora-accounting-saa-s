/**
 * /api/client/virements
 *
 * GET  : liste les virements préparés / effectués pour une société.
 * POST : crée un nouveau virement (interne ou externe).
 *
 * Cette route est un STUB pour la première PR. La table
 * `virements_prepares` n'existe pas encore — l'endpoint :
 *  - GET : retourne une liste vide (avec status 200) si la table est
 *    absente, plutôt que de planter.
 *  - POST : enregistre l'intention dans la table si présente, sinon
 *    retourne le payload tel quel avec un id généré pour permettre à
 *    l'UI d'avancer (pas d'intégration bancaire réelle dans cette PR).
 *
 * Sécurité : auth multi-tenant via assertSocieteAccess.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertSocieteAccess,
  mapSocieteAccessError,
} from '@/lib/supabase/assert-societe-access'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'

export const dynamic = 'force-dynamic'

const TABLE = 'virements_prepares'

async function tableExists(supabase: any): Promise<boolean> {
  // Probe défensif — on tente une requête courte. Si la table n'existe
  // pas, on retourne false plutôt que de propager l'erreur.
  try {
    const { error } = await supabase.from(TABLE).select('id').limit(1)
    if (error && (error.code === '42P01' || /does not exist/i.test(error.message || ''))) {
      return false
    }
    return !error
  } catch {
    return false
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const statut = searchParams.get('statut') // a_effectuer | effectue | historique
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }
    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    await assertSocieteAccess(supabase, user.id, societe_id)

    const exists = await tableExists(supabase)
    if (!exists) {
      return NextResponse.json({ virements: [], _stub: true })
    }

    let q = supabase
      .from(TABLE)
      .select('*')
      .eq('societe_id', societe_id)
      .order('created_at', { ascending: false })
    if (statut && statut !== 'all') {
      q = q.eq('statut', statut)
    }
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ virements: data || [] })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const societe_id: string = body.societe_id
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }
    const compte_source_id = body.compte_source_id ? String(body.compte_source_id) : null
    const compte_destination_id = body.compte_destination_id
      ? String(body.compte_destination_id)
      : null
    const tiers_destination = body.tiers_destination ? String(body.tiers_destination) : null
    const iban_destination = body.iban_destination ? String(body.iban_destination) : null
    const montant = Number(body.montant)
    const devise = String(body.devise || 'MUR')
    const libelle = body.libelle ? String(body.libelle) : null
    const date_execution = body.date_execution ? String(body.date_execution) : null
    const mode = body.mode === 'interne' ? 'interne' : 'externe'

    if (!compte_source_id) {
      return NextResponse.json({ error: 'compte_source_id requis' }, { status: 400 })
    }
    if (!Number.isFinite(montant) || montant <= 0) {
      return NextResponse.json({ error: 'montant invalide' }, { status: 400 })
    }
    if (mode === 'interne' && !compte_destination_id) {
      return NextResponse.json(
        { error: 'compte_destination_id requis (mode interne)' },
        { status: 400 }
      )
    }
    if (mode === 'externe' && !tiers_destination && !iban_destination) {
      return NextResponse.json(
        { error: 'tiers_destination ou iban_destination requis (mode externe)' },
        { status: 400 }
      )
    }

    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    await assertSocieteAccess(supabase, user.id, societe_id)

    const payload: Record<string, any> = {
      societe_id,
      compte_source_id,
      compte_destination_id,
      tiers_destination,
      iban_destination,
      montant,
      devise,
      libelle,
      date_execution,
      mode,
      statut: 'a_effectuer',
      created_by: user.id,
    }

    const exists = await tableExists(supabase)
    if (!exists) {
      // STUB : table absente → on retourne un objet "préparé" non
      // persistant, l'UI peut continuer à afficher l'intention.
      return NextResponse.json(
        {
          virement: {
            id: `stub-${Date.now()}`,
            ...payload,
            created_at: new Date().toISOString(),
          },
          _stub: true,
        },
        { status: 201 }
      )
    }

    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ virement: data }, { status: 201 })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
