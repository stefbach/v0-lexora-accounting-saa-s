import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function requireRole() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role, email').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin', 'comptable', 'comptable_dedie', 'client_admin'].includes(profile.role)) {
    return null
  }
  return { id: user.id, email: user.email || profile.email, role: profile.role }
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

async function buildSnapshot(
  supabase: ReturnType<typeof getAdminClient>,
  rapprochement_id: string,
) {
  const { data: rapp } = await supabase
    .from('rapprochements_bancaires')
    .select('*')
    .eq('id', rapprochement_id)
    .single()

  const { data: lignes } = await supabase
    .from('lignes_rapprochement')
    .select('*')
    .eq('rapprochement_id', rapprochement_id)
    .order('id')

  const snapshot = {
    rapprochement: rapp,
    lignes: lignes || [],
    snapshotted_at: new Date().toISOString(),
    version: 1,
  }
  const hash = sha256(JSON.stringify(snapshot))
  return { snapshot, hash }
}

// GET history of validation events
export async function GET(request: Request) {
  try {
    const user = await requireRole()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const rapprochement_id = searchParams.get('rapprochement_id')
    const societe_id = searchParams.get('societe_id')

    let q = supabase
      .from('rapprochement_validation_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (rapprochement_id) q = q.eq('rapprochement_id', rapprochement_id)
    else if (societe_id) q = q.eq('societe_id', societe_id)
    else return NextResponse.json({ error: 'rapprochement_id ou societe_id requis' }, { status: 400 })

    const { data, error } = await q
    if (error) throw error

    // Also re-check integrity hash if rapprochement_id is supplied
    let integrity: { ok: boolean; expected?: string; current?: string } | null = null
    if (rapprochement_id) {
      const { data: rapp } = await supabase
        .from('rapprochements_bancaires')
        .select('hash_integrite, locked, snapshot_at_validation')
        .eq('id', rapprochement_id)
        .single()
      if (rapp?.locked && rapp.hash_integrite && rapp.snapshot_at_validation) {
        const current = sha256(JSON.stringify(rapp.snapshot_at_validation))
        integrity = {
          ok: current === rapp.hash_integrite,
          expected: rapp.hash_integrite,
          current,
        }
      }
    }

    return NextResponse.json({ log: data, integrity })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST: validate / unvalidate / lock / unlock
export async function POST(request: Request) {
  try {
    const user = await requireRole()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { rapprochement_id, action, raison, force_ecart } = body

    if (!rapprochement_id || !action) {
      return NextResponse.json({ error: 'rapprochement_id et action requis' }, { status: 400 })
    }

    const { data: rapp } = await supabase
      .from('rapprochements_bancaires')
      .select('*')
      .eq('id', rapprochement_id)
      .single()
    if (!rapp) return NextResponse.json({ error: 'Rapprochement introuvable' }, { status: 404 })

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || null

    const logEntry = {
      rapprochement_id,
      societe_id: rapp.societe_id,
      action,
      statut_avant: rapp.statut,
      statut_apres: rapp.statut,
      solde_releve: rapp.solde_releve,
      solde_comptable: rapp.solde_comptable,
      ecart: rapp.ecart,
      raison: raison || null,
      user_id: user.id,
      user_email: user.email,
      user_role: user.role,
      ip_address: ip,
    }

    if (action === 'validate') {
      if (rapp.locked) {
        return NextResponse.json({ error: 'Rapprochement verrouillé' }, { status: 422 })
      }
      if (Math.abs(Number(rapp.ecart) || 0) > 0.01 && !force_ecart) {
        return NextResponse.json({
          error: `Écart de ${rapp.ecart} non nul — fournir raison + force_ecart=true ou ajuster le rapprochement`,
        }, { status: 422 })
      }
      if (Math.abs(Number(rapp.ecart) || 0) > 0.01 && !raison) {
        return NextResponse.json({
          error: 'Raison obligatoire pour valider avec un écart',
        }, { status: 422 })
      }

      const { snapshot, hash } = await buildSnapshot(supabase, rapprochement_id)
      const newStatut = Math.abs(Number(rapp.ecart) || 0) > 0.01 ? 'ecart_justifie' : 'valide'

      const { error } = await supabase
        .from('rapprochements_bancaires')
        .update({
          statut: newStatut,
          valide_par: user.id,
          valide_le: new Date().toISOString(),
          snapshot_at_validation: snapshot,
          hash_integrite: hash,
          justification_ecart: raison || null,
          locked: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rapprochement_id)
      if (error) throw error

      await supabase.from('rapprochement_validation_log').insert({
        ...logEntry,
        statut_apres: newStatut,
        snapshot,
      })

      return NextResponse.json({
        message: `Rapprochement validé (${newStatut})`,
        statut: newStatut,
        hash,
        locked: true,
      })
    }

    if (action === 'unvalidate' || action === 'unlock') {
      if (!['admin', 'super_admin', 'comptable'].includes(user.role)) {
        return NextResponse.json({
          error: 'Seuls admin/comptable peuvent dévalider',
        }, { status: 403 })
      }
      if (!raison || raison.length < 5) {
        return NextResponse.json({
          error: 'Raison détaillée obligatoire pour dévalider (min. 5 caractères)',
        }, { status: 422 })
      }

      const { error } = await supabase
        .from('rapprochements_bancaires')
        .update({
          statut: 'en_cours',
          locked: false,
          valide_par: null,
          valide_le: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rapprochement_id)
      if (error) throw error

      await supabase.from('rapprochement_validation_log').insert({
        ...logEntry,
        statut_apres: 'en_cours',
        action: 'unvalidate',
      })

      return NextResponse.json({ message: 'Rapprochement dévalidé', statut: 'en_cours', locked: false })
    }

    if (action === 'lock') {
      const { snapshot, hash } = await buildSnapshot(supabase, rapprochement_id)
      const { error } = await supabase
        .from('rapprochements_bancaires')
        .update({
          locked: true,
          snapshot_at_validation: snapshot,
          hash_integrite: hash,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rapprochement_id)
      if (error) throw error

      await supabase.from('rapprochement_validation_log').insert({
        ...logEntry,
        action: 'lock',
        snapshot,
      })

      return NextResponse.json({ message: 'Rapprochement verrouillé', hash })
    }

    if (action === 'comment') {
      if (!raison) return NextResponse.json({ error: 'raison requise' }, { status: 400 })
      await supabase.from('rapprochement_validation_log').insert(logEntry)
      return NextResponse.json({ message: 'Commentaire ajouté' })
    }

    return NextResponse.json({ error: `Action inconnue: ${action}` }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
