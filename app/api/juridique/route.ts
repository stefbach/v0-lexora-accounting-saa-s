import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { genererContrat, verifierContrat } from '@/lib/rh/expertRH'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Sprint 8 — admin client (service_role) pour contourner les RLS policies
// sur contrats_employes qui référencent auth.users (mig 028) → "permission
// denied for table users" pour l'user-auth client qui n'a pas ce droit.
function getAdminClient() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(request: Request) {
  try {
    // On garde le client user-auth UNIQUEMENT pour valider la session.
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    // Toutes les opérations DB passent par l'admin client (bypass RLS).
    const supabase = getAdminClient()

    const body = await request.json()
    const { action } = body

    // Multi-tenant guard : si un societe_id est fourni, l'utilisateur doit pouvoir y accéder
    // avant toute lecture de societes.contacts (ou autres données tenantées).
    if (body.societe_id) {
      try {
        await assertSocieteAccess(supabase, user.id, body.societe_id)
      } catch (err) {
        if (err instanceof SocieteAccessError) {
          return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })
        }
        throw err
      }
    }

    if (action === 'generer_contrat') {
      // Sprint 6 FIX 4 — pré-remplissage étendu :
      //   1. Infos société + contact principal (depuis societe.contacts JSONB mig 140)
      //      → auto-remplit le nom du signataire (dirigeant)
      //   2. Horaires depuis societes.heures_semaine (fallback 45)
      //   3. Période d'essai configurable (body.periode_essai_jours)
      //   4. Poste éditable (body.poste — envoyé par le frontend)
      let societe_info = { nom: 'Société', brn: '______', adresse: 'Mauritius', heures_semaine: 45 }
      let signataire_nom_complet: string | null = null
      if (body.societe_id) {
        const { data: soc } = await supabase
          .from('societes')
          .select('nom, brn, adresse, heures_semaine, contacts')
          .eq('id', body.societe_id)
          .single()
        if (soc) {
          societe_info = {
            nom: soc.nom || 'Société',
            brn: soc.brn || '______',
            adresse: (soc as any).adresse || 'Mauritius',
            heures_semaine: Number((soc as any).heures_semaine) || 45,
          }
          // Sprint 6 FIX 4 — trouver le contact principal parmi societe.contacts
          const contacts = Array.isArray((soc as any).contacts) ? (soc as any).contacts : []
          const principal = contacts.find((c: any) => c?.principal === true) || contacts[0]
          if (principal) {
            const fullName = [principal.prenom, principal.nom].filter(Boolean).join(' ').trim()
            if (fullName) {
              signataire_nom_complet = principal.poste
                ? `${fullName}, ${principal.poste}`
                : fullName
            }
          }
        }
      }

      // Récupérer NIC et date de naissance depuis la fiche employé
      let employe_nic = '______'
      let employe_dob = '______'
      if (body.employe_id) {
        const { data: emp } = await supabase
          .from('employes')
          .select('nic_number, date_naissance, prenom, nom')
          .eq('id', body.employe_id)
          .single()
        if (emp) {
          if (emp.nic_number) employe_nic = emp.nic_number
          if (emp.date_naissance) {
            // Format DD/MM/YYYY
            const d = new Date(emp.date_naissance)
            employe_dob = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
          }
          // Utiliser le nom réel si non fourni
          if (!body.employe_nom && emp.prenom && emp.nom) {
            body.employe_nom = `${emp.prenom} ${emp.nom}`
          }
        }
      }

      // Sprint 6 FIX 4 — transmettre au template heures_semaine, periode_essai, signataire
      const periodeEssaiJours = body.periode_essai_oui === false
        ? 0
        : (Number(body.periode_essai_jours) || 90)
      const heuresSemaine = Number(body.heures_semaine) || societe_info.heures_semaine

      const html = await genererContrat({
        type: body.type || 'CDI',
        secteur: body.secteur || 'general',
        employe_nom: body.employe_nom,
        poste: body.poste,
        salaire: body.salaire,
        date_debut: body.date_debut,
        date_fin: body.date_fin,
        societe_nom: societe_info.nom,
        societe_brn: societe_info.brn,
        societe_adresse: societe_info.adresse,
        employe_nic,
        employe_dob,
        heures_semaine: heuresSemaine,
        periode_essai: periodeEssaiJours,
        signataire_nom_complet: signataire_nom_complet || undefined,
      })

      // Sauvegarder en base — on pré-remplit signature_nom_complet (mig 142)
      // pour que l'édition RH voit immédiatement le nom du dirigeant et
      // qu'il s'affiche sur la vue employé /salarie/contrats.
      // Best-effort : si les colonnes mig 142 manquent, retry sans.
      const insertRow: Record<string, unknown> = {
        employe_id: body.employe_id,
        societe_id: body.societe_id,
        type_contrat: body.type || 'CDI',
        secteur: body.secteur,
        date_debut: body.date_debut,
        date_fin: body.date_fin || null,
        salaire_brut: body.salaire,
        poste: body.poste,
        html_content: html,
        statut: 'brouillon',
      }
      if (signataire_nom_complet) {
        insertRow.signature_nom_complet = signataire_nom_complet
      }
      let contrat: any = null
      const ins1 = await supabase.from('contrats_employes').insert(insertRow).select().single()
      if (ins1.error) {
        if (ins1.error.code === '42703' && /signature_nom_complet/.test(ins1.error.message)) {
          // Mig 142 absente → retry sans la colonne
          delete insertRow.signature_nom_complet
          const ins2 = await supabase.from('contrats_employes').insert(insertRow).select().single()
          if (ins2.error) {
            console.error('[juridique generer_contrat] insert error (retry):', ins2.error.message)
            return NextResponse.json({ error: ins2.error.message, code: ins2.error.code }, { status: 500 })
          }
          contrat = ins2.data
        } else {
          console.error('[juridique generer_contrat] insert error:', ins1.error.message, ins1.error.code)
          return NextResponse.json({ error: ins1.error.message, code: ins1.error.code }, { status: 500 })
        }
      } else {
        contrat = ins1.data
      }

      return NextResponse.json({ contrat, html, signataire_nom_complet })
    }

    if (action === 'verifier_contrat') {
      const analyse = await verifierContrat(body.html)
      return NextResponse.json({ analyse })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
