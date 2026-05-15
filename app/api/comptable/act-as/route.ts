/**
 * /api/comptable/act-as
 *
 * Sprint 3 — Mode "Acting as client" pour comptables.
 *
 * Permet à un comptable / collaborateur d'entrer "dans la peau" d'un de
 * ses clients pour utiliser l'espace /client/* exactement comme le voit
 * le client final. Un cookie HTTP-only stocke l'ID de la société active
 * en mode cabinet ; le hook useSocieteActive le lit en priorité.
 *
 * GET     → retourne { acting_as_societe_id, societe? } si actif, sinon null
 * POST    → body { societe_id } → vérifie droits + pose le cookie
 * DELETE  → supprime le cookie ("sortir du dossier")
 *
 * Sécurité : la société doit appartenir au portefeuille (dirigeant) ou
 * être assignée au collaborateur via cabinet_collaborateurs_acces.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const COOKIE_NAME = 'lexora_acting_as_societe'
const COOKIE_MAX_AGE = 8 * 60 * 60 // 8h ; renouvelé à chaque appel API
const ALLOWED_ROLES = ['admin', 'super_admin', 'comptable', 'comptable_dedie']

async function getCabinetContext() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const supabase = getAdminClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, parent_comptable_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || !ALLOWED_ROLES.includes(profile.role)) return null
  return { user, profile, supabase, cabinetOwnerId: profile.parent_comptable_id || profile.id }
}

/**
 * Vérifie qu'un comptable peut entrer dans le dossier d'une société.
 * - Dirigeant / admin : société rattachée via dossiers, comptable_societes
 *   ou societes.comptable_id
 * - Collaborateur : assignation explicite cabinet_collaborateurs_acces
 */
async function canActAs(ctx: NonNullable<Awaited<ReturnType<typeof getCabinetContext>>>, societeId: string): Promise<boolean> {
  const { user, profile, supabase } = ctx
  if (['admin', 'super_admin'].includes(profile.role)) return true

  const isDirigeant = !profile.parent_comptable_id
  if (isDirigeant) {
    // 4 voies (idem cabinet GET)
    const [d, cs, owned] = await Promise.all([
      supabase.from('dossiers').select('societe_id').eq('comptable_id', user.id).eq('societe_id', societeId).maybeSingle(),
      supabase.from('comptable_societes').select('societe_id').eq('comptable_id', user.id).eq('societe_id', societeId).maybeSingle(),
      supabase.from('societes').select('id').eq('comptable_id', user.id).eq('id', societeId).maybeSingle(),
    ])
    if (d.data || cs.data || owned.data) return true

    // Voie D : société rattachée à un de mes clients (profiles.comptable_id)
    const { data: mesClients } = await supabase
      .from('profiles').select('id').eq('comptable_id', user.id)
    const clientIds = (mesClients || []).map(c => c.id)
    if (clientIds.length === 0) return false
    const [dossierClient, societeClient] = await Promise.all([
      supabase.from('dossiers').select('societe_id').in('client_id', clientIds).eq('societe_id', societeId).maybeSingle(),
      supabase.from('societes').select('id').in('created_by', clientIds).eq('id', societeId).maybeSingle(),
    ])
    return !!(dossierClient.data || societeClient.data)
  }

  // Collaborateur : doit être listé dans cabinet_collaborateurs_acces
  const { data } = await supabase
    .from('cabinet_collaborateurs_acces')
    .select('id')
    .eq('collaborateur_id', user.id)
    .eq('societe_id', societeId)
    .maybeSingle()
  return !!data
}

export async function GET() {
  const ctx = await getCabinetContext()
  if (!ctx) return NextResponse.json({ acting_as_societe_id: null })
  const cookieStore = await cookies()
  const cookie = cookieStore.get(COOKIE_NAME)
  if (!cookie?.value) return NextResponse.json({ acting_as_societe_id: null })

  // Recharge la société liée pour permettre l'affichage du bandeau
  const { data: societe } = await ctx.supabase
    .from('societes')
    .select('id, nom, brn, vat_number, regime, devise_defaut')
    .eq('id', cookie.value)
    .maybeSingle()

  return NextResponse.json({
    acting_as_societe_id: cookie.value,
    societe: societe || null,
  })
}

export async function POST(request: Request) {
  const ctx = await getCabinetContext()
  if (!ctx) return NextResponse.json({ error: 'Accès réservé aux comptables' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const societe_id: string = body?.societe_id || ''
  if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

  const ok = await canActAs(ctx, societe_id)
  if (!ok) {
    return NextResponse.json({
      error: 'Vous n\'avez pas accès à cette société depuis votre cabinet.',
    }, { status: 403 })
  }

  // Récupère le nom pour le retour (UI immédiat)
  const { data: societe } = await ctx.supabase
    .from('societes')
    .select('id, nom, brn, vat_number, regime, devise_defaut')
    .eq('id', societe_id)
    .maybeSingle()

  const cookieStore = await cookies()
  cookieStore.set({
    name: COOKIE_NAME,
    value: societe_id,
    httpOnly: false, // lisible côté client par useSocieteActive
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })

  return NextResponse.json({ ok: true, acting_as_societe_id: societe_id, societe })
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
  return NextResponse.json({ ok: true, acting_as_societe_id: null })
}
