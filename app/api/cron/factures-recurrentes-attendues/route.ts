import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCronSecret } from '@/lib/claude'
import { envoyerNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Tolérance en jours : on ne déclenche l'alerte qu'au-delà de date_attendue + TOLERANCE_JOURS
const TOLERANCE_JOURS = 3
// Fenêtre de recherche d'une facture correspondante (±)
const FENETRE_MATCH_JOURS = 5

function formatFr(d: Date): string {
  return d.toLocaleDateString('fr-FR', { timeZone: 'Indian/Mauritius' })
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d.getTime())
  r.setUTCDate(r.getUTCDate() + n)
  return r
}

function periodeYYYYMM(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// Cron quotidien (09:30) — Alerte sur factures récurrentes non reçues
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const cronName = 'factures-recurrentes-attendues'
  const now = new Date()
  const nowIso = now.toISOString()

  try {
    console.log('[factures-recurrentes-attendues] start', { at: nowIso })

    // 1. Lire les affectations récurrentes. Si la table n'existe pas → skip gracieux.
    const { data: affectations, error: affError } = await supabase
      .from('affectations_comptables')
      .select('id, societe_id, fournisseur, recurrent, derniere_utilisation, nb_utilisations, notes')
      .eq('recurrent', true)

    if (affError) {
      // Erreur "relation does not exist" → skip
      const msg = affError.message || ''
      if (/does not exist|relation/i.test(msg)) {
        console.log('[factures-recurrentes-attendues] skipped — table affectations_comptables absente')
        try {
          await supabase.from('cron_logs').insert({
            cron_name: cronName,
            statut: 'skipped',
            details: { reason: 'affectations_comptables manquante', error: msg },
            executed_at: nowIso,
          })
        } catch {
          // swallow
        }
        return NextResponse.json({ ok: true, skipped: true, reason: 'affectations_comptables manquante' })
      }
      throw affError
    }

    if (!affectations || affectations.length === 0) {
      console.log('[factures-recurrentes-attendues] aucune affectation recurrente')
      return NextResponse.json({ ok: true, societes_traitees: 0, alertes_envoyees: 0 })
    }

    // 2. Préfetch des sociétés concernées (un seul round-trip)
    const societeIds = Array.from(new Set(affectations.map((a: any) => a.societe_id).filter(Boolean)))
    const { data: societesRaw } = await supabase
      .from('societes')
      .select('id, nom, client_id, comptable_id')
      .in('id', societeIds)

    const societesMap = new Map<string, any>()
    for (const s of societesRaw || []) societesMap.set(s.id, s)

    let societesTraitees = 0
    let alertesEnvoyees = 0
    const societesVues = new Set<string>()

    for (const aff of affectations as any[]) {
      const societe = societesMap.get(aff.societe_id)
      if (!societe) continue

      if (!societesVues.has(societe.id)) {
        societesVues.add(societe.id)
        societesTraitees++
      }

      if (!aff.derniere_utilisation) continue

      // 3. Calcul date attendue : heuristique mensuelle (~30j après la dernière)
      const derniere = new Date(aff.derniere_utilisation)
      const dateAttendue = addDays(derniere, 30)
      const seuilAlerte = addDays(dateAttendue, TOLERANCE_JOURS)

      if (now < seuilAlerte) continue

      // 4. Chercher facture correspondante dans la fenêtre (±FENETRE_MATCH_JOURS)
      const debutFenetre = addDays(dateAttendue, -FENETRE_MATCH_JOURS).toISOString().slice(0, 10)
      const finFenetre = addDays(dateAttendue, FENETRE_MATCH_JOURS).toISOString().slice(0, 10)

      const { data: facturesMatch } = await supabase
        .from('factures')
        .select('id, tiers, date_facture')
        .eq('societe_id', societe.id)
        .ilike('tiers', `%${aff.fournisseur}%`)
        .gte('date_facture', debutFenetre)
        .lte('date_facture', finFenetre)
        .limit(1)

      if (facturesMatch && facturesMatch.length > 0) continue

      // 5. Idempotence : une alerte déjà émise ce mois-ci pour (societe, tiers, periode) ?
      const periode = periodeYYYYMM(dateAttendue)
      let alerteDejaEnvoyee = false
      try {
        const { data: existing } = await supabase
          .from('alertes_factures_manquantes')
          .select('id')
          .eq('societe_id', societe.id)
          .eq('tiers', aff.fournisseur)
          .eq('periode', periode)
          .maybeSingle()
        if (existing) alerteDejaEnvoyee = true
      } catch {
        // table optionnelle — on continue sans blocage
      }

      if (alerteDejaEnvoyee) continue

      // 6. Notifier le comptable (priorité) + le client si disponible
      const titre = `Facture récurrente manquante — ${aff.fournisseur}`
      const message = `Facture ${aff.fournisseur} habituellement reçue autour du ${formatFr(dateAttendue)} non trouvée ce mois-ci pour ${societe.nom}.`

      try {
        if (societe.comptable_id) {
          await envoyerNotification({
            destinataire_id: societe.comptable_id,
            destinataire_type: 'comptable',
            societe_id: societe.id,
            type: 'alerte_facture_recurrente_manquante',
            titre,
            message,
            niveau: 'important',
            canaux: ['app'],
            cron_name: cronName,
          })
        }

        if (societe.client_id) {
          await envoyerNotification({
            destinataire_id: societe.client_id,
            destinataire_type: 'client',
            societe_id: societe.id,
            type: 'alerte_facture_recurrente_manquante',
            titre,
            message,
            niveau: 'info',
            canaux: ['app'],
            cron_name: cronName,
          })
        }

        // 7. Tracer l'alerte pour idempotence (table optionnelle)
        try {
          await supabase.from('alertes_factures_manquantes').insert({
            societe_id: societe.id,
            tiers: aff.fournisseur,
            periode,
            date_attendue: dateAttendue.toISOString().slice(0, 10),
            created_at: nowIso,
          })
        } catch {
          // table optionnelle — silencieux
        }

        alertesEnvoyees++
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erreur inconnue'
        console.log('[factures-recurrentes-attendues] notif error', {
          societe_id: societe.id,
          fournisseur: aff.fournisseur,
          error: msg,
        })
      }
    }

    try {
      await supabase.from('cron_logs').insert({
        cron_name: cronName,
        statut: 'success',
        details: {
          affectations_scannees: affectations.length,
          societes_traitees: societesTraitees,
          alertes_envoyees: alertesEnvoyees,
        },
        executed_at: nowIso,
      })
    } catch (logErr) {
      console.log('[factures-recurrentes-attendues] cron_logs insert failed', {
        error: logErr instanceof Error ? logErr.message : String(logErr),
      })
    }

    console.log('[factures-recurrentes-attendues] done', {
      affectations: affectations.length,
      societesTraitees,
      alertesEnvoyees,
    })

    return NextResponse.json({
      ok: true,
      timestamp: nowIso,
      societes_traitees: societesTraitees,
      alertes_envoyees: alertesEnvoyees,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.log('[factures-recurrentes-attendues] fatal', { error: message })

    try {
      await supabase.from('cron_logs').insert({
        cron_name: cronName,
        statut: 'error',
        details: { error: message },
        executed_at: nowIso,
      })
    } catch {
      // swallow
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
