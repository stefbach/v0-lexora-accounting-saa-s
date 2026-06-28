/**
 * /api/comptable/cabinet
 *
 * GET — Dashboard du cabinet pour le comptable connecté.
 *   Retourne :
 *     - clients[] : liste des sociétés du portefeuille avec KPIs
 *       (CA YTD, factures impayées, TVA prochaine échéance, alertes)
 *     - collaborateurs[] : collaborateurs rattachés (parent_comptable_id)
 *     - tags[] : tags définis par le cabinet
 *     - stats globales (nb clients, nb collab, factures total impayées…)
 *
 * Accès : role IN (comptable, comptable_dedie, admin, super_admin)
 *
 * Pour un dirigeant : retourne tous les clients qu'il gère (dossiers
 * où comptable_id = auth.uid()) + les clients d'un de ses collaborateurs.
 * Pour un collaborateur : retourne uniquement les clients pour lesquels
 * il a une entrée dans cabinet_collaborateurs_acces.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['admin', 'super_admin', 'comptable', 'comptable_dedie']

export async function GET() {
  try {
    const auth = await createClient()
    const { data: { user }, error: authError } = await auth.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, parent_comptable_id, full_name, email')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: 'Accès réservé aux comptables' }, { status: 403 })
    }

    const isDirigeant = !profile.parent_comptable_id
    const cabinetOwnerId = profile.parent_comptable_id || profile.id

    // ─── 1. Société IDs accessibles ──────────────────────────────────
    let societeIds: string[] = []
    if (isDirigeant || ['admin', 'super_admin'].includes(profile.role)) {
      // Dirigeant : 5 voies de découverte (legacy + nouvelles)
      //   A. dossiers.comptable_id (legacy comptable_dedie)
      //   B. comptable_societes.comptable_id
      //   C. societes.comptable_id
      //   D. profiles.comptable_id → clients → leurs dossiers
      //   E. Fallback role 'comptable' : si aucune voie ne retourne, on
      //      tombe sur tous les clients (cohérence /api/comptable/clients).
      const [dossiersRes, csRes, ownedRes, mesClientsRes] = await Promise.all([
        supabase.from('dossiers').select('societe_id').eq('comptable_id', user.id),
        supabase.from('comptable_societes').select('societe_id').eq('comptable_id', user.id),
        supabase.from('societes').select('id').eq('comptable_id', user.id),
        supabase.from('profiles').select('id').eq('comptable_id', user.id),
      ])
      const set = new Set<string>()
      ;(dossiersRes.data || []).forEach(r => r.societe_id && set.add(r.societe_id))
      ;(csRes.data || []).forEach(r => r.societe_id && set.add(r.societe_id))
      ;(ownedRes.data || []).forEach(r => r.id && set.add(r.id))
      const clientIds = (mesClientsRes.data || []).map(c => c.id).filter(Boolean)
      if (clientIds.length > 0) {
        const [dossiersClientsRes, societesClientRes] = await Promise.all([
          supabase.from('dossiers').select('societe_id').in('client_id', clientIds),
          supabase.from('societes').select('id').in('created_by', clientIds),
        ])
        ;(dossiersClientsRes.data || []).forEach(r => r.societe_id && set.add(r.societe_id))
        ;(societesClientRes.data || []).forEach(r => r.id && set.add(r.id))
      }
      societeIds = [...set]

      // Voie E (fallback global) — cohérence avec /api/comptable/clients legacy
      if (societeIds.length === 0 && ['comptable', 'admin', 'super_admin'].includes(profile.role)) {
        const { data: allClients } = await supabase
          .from('profiles')
          .select('id')
          .in('role', ['client_admin', 'client_user'])
        const allClientIds = (allClients || []).map(c => c.id).filter(Boolean)
        if (allClientIds.length > 0) {
          const [allDossiers, allCreated] = await Promise.all([
            supabase.from('dossiers').select('societe_id').in('client_id', allClientIds),
            supabase.from('societes').select('id').in('created_by', allClientIds),
          ])
          ;(allDossiers.data || []).forEach(r => r.societe_id && set.add(r.societe_id))
          ;(allCreated.data || []).forEach(r => r.id && set.add(r.id))
          societeIds = [...set]
        }
      }
    } else {
      // Collaborateur : uniquement ses sociétés assignées
      const { data } = await supabase
        .from('cabinet_collaborateurs_acces')
        .select('societe_id')
        .eq('collaborateur_id', user.id)
      societeIds = (data || []).map(r => r.societe_id).filter(Boolean) as string[]
    }

    // ─── 2. Charger sociétés + KPI ───────────────────────────────────
    let clients: any[] = []
    if (societeIds.length > 0) {
      const [societesRes, facturesRes, accesRes] = await Promise.all([
        supabase
          .from('societes')
          .select('id, nom, brn, vat_number, regime, devise_defaut, created_at')
          .in('id', societeIds),
        supabase
          .from('factures')
          .select('societe_id, statut, montant_ttc, montant_mur, date_facture, date_echeance, type_facture')
          .in('societe_id', societeIds)
          .eq('type_facture', 'client'),
        supabase
          .from('cabinet_collaborateurs_acces')
          .select('societe_id, collaborateur_id, scope')
          .in('societe_id', societeIds),
      ])
      const factures = facturesRes.data || []
      const acces = accesRes.data || []
      const yearStart = `${new Date().getFullYear()}-01-01`
      const today = new Date().toISOString().slice(0, 10)

      // KPI par société
      clients = (societesRes.data || []).map(s => {
        const sFactures = factures.filter(f => f.societe_id === s.id)
        const caYtd = sFactures
          .filter(f => (f.date_facture || '') >= yearStart && f.statut === 'paye')
          .reduce((sum, f) => sum + (Number(f.montant_mur) || Number(f.montant_ttc) || 0), 0)
        const nbImpayees = sFactures.filter(f => f.statut === 'en_attente' || f.statut === 'partiel' || f.statut === 'retard').length
        const montantImpaye = sFactures
          .filter(f => f.statut === 'en_attente' || f.statut === 'partiel' || f.statut === 'retard')
          .reduce((sum, f) => sum + (Number(f.montant_mur) || Number(f.montant_ttc) || 0), 0)
        const nbRetard = sFactures.filter(f => f.statut === 'retard' || (f.date_echeance && f.date_echeance < today && f.statut !== 'paye' && f.statut !== 'annule')).length

        return {
          id: s.id,
          nom: s.nom,
          brn: s.brn,
          vat_number: s.vat_number,
          regime: s.regime,
          devise_defaut: s.devise_defaut || 'MUR',
          created_at: s.created_at,
          kpi: {
            ca_ytd_mur: caYtd,
            nb_impayees: nbImpayees,
            montant_impaye_mur: montantImpaye,
            nb_retard: nbRetard,
          },
          collaborateurs: acces
            .filter(a => a.societe_id === s.id)
            .map(a => ({ collaborateur_id: a.collaborateur_id, scope: a.scope })),
        }
      })
    }

    // ─── 3. Collaborateurs ───────────────────────────────────────────
    const { data: collaborateurs } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, is_active, created_at')
      .eq('parent_comptable_id', cabinetOwnerId)
      .order('created_at', { ascending: false })

    // ─── 4. Tags ─────────────────────────────────────────────────────
    const [tagsRes, tagAssignRes] = await Promise.all([
      supabase
        .from('cabinet_tags')
        .select('id, libelle, couleur, icone')
        .eq('comptable_id', cabinetOwnerId)
        .order('libelle'),
      societeIds.length > 0
        ? supabase
            .from('cabinet_tag_assignments')
            .select('tag_id, societe_id')
            .in('societe_id', societeIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    // Attache tags aux clients
    const tagsBySociete: Record<string, string[]> = {}
    ;(tagAssignRes.data || []).forEach((a: any) => {
      if (!tagsBySociete[a.societe_id]) tagsBySociete[a.societe_id] = []
      tagsBySociete[a.societe_id].push(a.tag_id)
    })
    clients = clients.map(c => ({ ...c, tag_ids: tagsBySociete[c.id] || [] }))

    // ─── 5. Stats globales ───────────────────────────────────────────
    const stats = {
      nb_clients: clients.length,
      nb_collaborateurs: (collaborateurs || []).length,
      total_impaye_mur: clients.reduce((s, c) => s + (c.kpi?.montant_impaye_mur || 0), 0),
      total_ca_ytd_mur: clients.reduce((s, c) => s + (c.kpi?.ca_ytd_mur || 0), 0),
      total_factures_retard: clients.reduce((s, c) => s + (c.kpi?.nb_retard || 0), 0),
    }

    return NextResponse.json({
      user_info: {
        is_dirigeant: isDirigeant,
        cabinet_owner_id: cabinetOwnerId,
        role: profile.role,
      },
      clients,
      collaborateurs: collaborateurs || [],
      tags: tagsRes.data || [],
      stats,
    })
  } catch (e: any) {
    console.error('[/api/comptable/cabinet] GET error:', e)
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
