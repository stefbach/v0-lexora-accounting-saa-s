/**
 * GET /api/admin/users/tree
 *
 * Vue hiérarchique Client → Société → Utilisateurs pour /admin/users.
 *
 * Modèle :
 *   - CLIENT = profile.role IN ('client_admin', 'client_user', 'client_assistant')
 *     considéré comme « dirigeant principal » s'il est client_admin et a
 *     créé au moins une société.
 *   - SOCIETE = liée au client via societes.created_by OU via dossiers.client_id.
 *   - USERS = tous les profils liés à cette société via profile.societe_id OU
 *     user_societes.societe_id.
 *
 * Réponse :
 *   {
 *     clients: [{ id, full_name, email, actif, societes_count, users_count,
 *                 societes: [{ id, nom, brn, users: [...] }] }],
 *     plateforme: [...]   // admin / super_admin (hors hiérarchie client)
 *     orphelins:  [...]   // users ni admin ni rattachés à une société
 *   }
 *
 * Scalabilité : un seul appel SQL en parallèle pour les 4 tables, puis
 * groupage en mémoire (O(N+M)). Convient à ~10 000 users / société.
 * Au-delà, prévoir pagination via ?client_id=… &page=… (TODO).
 */

import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireAdmin() {
  const supabaseAuth = await createServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) return null
  return user
}

const CLIENT_ROOT_ROLES = new Set(['client_admin', 'client_user', 'client_assistant'])
const PLATFORM_ROLES    = new Set(['admin', 'super_admin'])

interface UserCard {
  id: string
  full_name: string | null
  email: string
  role: string
  actif: boolean
  phone: string | null
  modules_utilisateur: Record<string, boolean> | null
  societe_id: string | null    // société "primaire"
}

interface SocieteNode {
  id: string
  nom: string
  brn: string | null
  users: UserCard[]
}

interface ClientNode {
  id: string                    // id du client_admin "propriétaire"
  full_name: string | null
  email: string
  actif: boolean
  societes_count: number
  users_count: number
  societes: SocieteNode[]
}

export async function GET() {
  try {
    const user = await requireAdmin()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const supabase = getAdminClient()

    const [profilesRes, societesRes, userSocietesRes, dossiersRes, employesRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role, is_active, phone, modules_utilisateur, societe_id').order('full_name'),
      supabase.from('societes').select('id, nom, brn, created_by, client_id').order('nom'),
      supabase.from('user_societes').select('user_id, societe_id, role, actif'),
      supabase.from('dossiers').select('client_id, societe_id'),
      // Employés : leur lien vers un profile passe par `auth_user_id`
      // et leur société par `societe_id`. Indispensable pour ne pas
      // afficher les employés en "orphelins" (cas typique : compte
      // créé via /rh/employes/.../create-account).
      supabase.from('employes').select('auth_user_id, societe_id'),
    ])
    if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 500 })

    const profiles: any[]       = profilesRes.data || []
    const societes: any[]       = societesRes.data || []
    const userSocietes: any[]   = userSocietesRes.data || []
    const dossiers: any[]       = dossiersRes.data || []
    // Tolère l'absence de la colonne auth_user_id (anciens schémas) :
    // si la requête a échoué on prend un tableau vide.
    const employes: any[] = employesRes.error
      ? []
      : (employesRes.data || []).filter((e: any) => e.auth_user_id && e.societe_id)

    // Map profile by id
    const profileById = new Map<string, any>()
    for (const p of profiles) profileById.set(p.id, p)

    // Map société by id
    const societeById = new Map<string, any>()
    for (const s of societes) societeById.set(s.id, s)

    // Index : société → users (via profile.societe_id OU user_societes OU
    // employes.auth_user_id → employes.societe_id)
    const usersBySociete = new Map<string, Set<string>>()
    for (const p of profiles) {
      if (p.societe_id) {
        if (!usersBySociete.has(p.societe_id)) usersBySociete.set(p.societe_id, new Set())
        usersBySociete.get(p.societe_id)!.add(p.id)
      }
    }
    for (const us of userSocietes) {
      if (!us.societe_id || !us.user_id) continue
      if (!usersBySociete.has(us.societe_id)) usersBySociete.set(us.societe_id, new Set())
      usersBySociete.get(us.societe_id)!.add(us.user_id)
    }
    for (const e of employes) {
      if (!usersBySociete.has(e.societe_id)) usersBySociete.set(e.societe_id, new Set())
      usersBySociete.get(e.societe_id)!.add(e.auth_user_id)
    }

    // Index : client_admin → ses sociétés (created_by OR client_id OR dossiers)
    const societesByClient = new Map<string, Set<string>>()
    for (const s of societes) {
      const owner = s.created_by || s.client_id
      if (owner) {
        if (!societesByClient.has(owner)) societesByClient.set(owner, new Set())
        societesByClient.get(owner)!.add(s.id)
      }
    }
    for (const d of dossiers) {
      if (!d.client_id || !d.societe_id) continue
      if (!societesByClient.has(d.client_id)) societesByClient.set(d.client_id, new Set())
      societesByClient.get(d.client_id)!.add(d.societe_id)
    }

    // Construction des Client roots : profils client_admin/client_user qui
    // ont au moins une société rattachée OU role client_admin (root par
    // définition). Les client_user / assistant sans société rattachée
    // tombent en orphelins.
    const clientsRoots: ClientNode[] = []
    const seenAsClient = new Set<string>()
    for (const p of profiles) {
      if (!CLIENT_ROOT_ROLES.has(p.role)) continue
      const owns = societesByClient.get(p.id) || new Set<string>()
      const isClientAdmin = p.role === 'client_admin'
      if (!isClientAdmin && owns.size === 0) continue // attaché à un client_admin via user_societes

      seenAsClient.add(p.id)
      const sNodes: SocieteNode[] = []
      let allUserIds = new Set<string>()

      for (const sid of owns) {
        const soc = societeById.get(sid)
        if (!soc) continue
        const userIds = Array.from(usersBySociete.get(sid) || [])
        const userCards: UserCard[] = userIds
          .map(uid => profileById.get(uid))
          .filter(Boolean)
          .map(u => ({
            id: u.id, full_name: u.full_name, email: u.email, role: u.role,
            actif: u.is_active !== false, phone: u.phone || null,
            modules_utilisateur: u.modules_utilisateur || null,
            societe_id: u.societe_id || null,
          }))
        userCards.forEach(u => allUserIds.add(u.id))
        sNodes.push({ id: soc.id, nom: soc.nom, brn: soc.brn || null, users: userCards })
      }

      clientsRoots.push({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        actif: p.is_active !== false,
        societes_count: sNodes.length,
        users_count: allUserIds.size,
        societes: sNodes,
      })
    }

    // Plateforme : admin + super_admin
    const plateforme: UserCard[] = profiles
      .filter(p => PLATFORM_ROLES.has(p.role))
      .map(p => ({
        id: p.id, full_name: p.full_name, email: p.email, role: p.role,
        actif: p.is_active !== false, phone: p.phone || null,
        modules_utilisateur: p.modules_utilisateur || null,
        societe_id: p.societe_id || null,
      }))

    // Orphelins : profils non platform, non rattachés à un client root ni
    // à aucune société (ex : ancien employé sans dossier, profil mal créé).
    const allClientUserIds = new Set<string>(
      clientsRoots.flatMap(c => c.societes.flatMap(s => s.users.map(u => u.id)))
    )
    clientsRoots.forEach(c => allClientUserIds.add(c.id))
    const orphelins: UserCard[] = profiles
      .filter(p => !PLATFORM_ROLES.has(p.role))
      .filter(p => !allClientUserIds.has(p.id))
      .map(p => ({
        id: p.id, full_name: p.full_name, email: p.email, role: p.role,
        actif: p.is_active !== false, phone: p.phone || null,
        modules_utilisateur: p.modules_utilisateur || null,
        societe_id: p.societe_id || null,
      }))

    return NextResponse.json({
      clients: clientsRoots.sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email)),
      plateforme: plateforme.sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email)),
      orphelins:  orphelins.sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email)),
      totals: {
        users: profiles.length,
        societes: societes.length,
        clients: clientsRoots.length,
        plateforme: plateforme.length,
        orphelins: orphelins.length,
      },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
