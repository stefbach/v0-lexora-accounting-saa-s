import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// POST /api/alertes/generate — Generate alerts based on business rules
// Can be called via cron or manually
export async function POST() {
  try {
    const supabase = getAdminClient()
    const today = new Date()
    const currentDay = today.getDate()
    const currentMonth = today.getMonth() // 0-indexed
    const alertsCreated: string[] = []

    // Get all active TVA records with status 'a_faire'
    const { data: tvaRecords } = await supabase
      .from('tva_mensuelle')
      .select('*, societe:societes(id, nom, comptable_id)')
      .eq('statut_declaration', 'a_faire')

    if (tvaRecords) {
      for (const tva of tvaRecords) {
        const deadline = new Date(tva.date_limite)
        const daysUntil = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        // TVA EN RETARD — deadline passed
        if (today > deadline) {
          const joursRetard = Math.abs(daysUntil)
          const moisRetard = Math.floor(joursRetard / 30)
          const penalite = (tva.tva_nette || 0) * 0.05 + ((tva.tva_nette || 0) * 0.01 * moisRetard)

          const { error } = await supabase.from('alertes').upsert({
            comptable_id: tva.societe?.comptable_id,
            societe_id: tva.societe?.id,
            client_id: tva.client_id,
            type_alerte: 'tva_retard',
            niveau: 'critique',
            titre: `TVA ${tva.societe?.nom} — ${tva.periode} non déclarée`,
            description: `Pénalité en cours : 5% + 1%/mois soit ${Math.round(penalite).toLocaleString()} MUR. ${joursRetard} jours de retard.`,
            montant_mur: tva.tva_nette,
            echeance: tva.date_limite,
            statut: 'active',
          }, { onConflict: 'id' })

          if (!error) alertsCreated.push(`tva_retard: ${tva.societe?.nom}`)
        }
        // TVA J-5 — deadline in 5 days or less
        else if (daysUntil <= 5 && daysUntil > 0) {
          await supabase.from('alertes').insert({
            comptable_id: tva.societe?.comptable_id,
            societe_id: tva.societe?.id,
            client_id: tva.client_id,
            type_alerte: 'tva_j5',
            niveau: 'important',
            titre: `TVA ${tva.societe?.nom} — Deadline dans ${daysUntil} jours`,
            description: `Déclaration à soumettre avant le ${tva.date_limite}. Montant : ${(tva.tva_nette || 0).toLocaleString()} MUR`,
            montant_mur: tva.tva_nette,
            echeance: tva.date_limite,
            statut: 'active',
          })
          alertsCreated.push(`tva_j5: ${tva.societe?.nom}`)
        }
      }
    }

    // Check for unpaid client invoices (from documents with type facture_client)
    // This would query the n8n_result for payment status — simplified for now

    // 13ème mois alert (November/December)
    if (currentMonth === 10 || currentMonth === 11) {
      const { data: societes } = await supabase.from('societes').select('id, nom, comptable_id').eq('actif', true)
      if (societes) {
        for (const s of societes) {
          await supabase.from('alertes').insert({
            comptable_id: s.comptable_id,
            societe_id: s.id,
            type_alerte: 'treizieme_mois',
            niveau: 'informatif',
            titre: `13ème mois ${s.nom} à provisionner`,
            description: 'Obligation légale — masse salariale annuelle / 12',
            statut: 'active',
          })
          alertsCreated.push(`treizieme_mois: ${s.nom}`)
        }
      }
    }

    // Check for documents pending > 48h
    const twoDaysAgo = new Date(today.getTime() - 48 * 60 * 60 * 1000).toISOString()
    const { data: pendingDocs } = await supabase
      .from('documents')
      .select('id, nom_fichier, uploaded_by, created_at')
      .eq('statut', 'en_attente')
      .lt('created_at', twoDaysAgo)

    if (pendingDocs && pendingDocs.length > 0) {
      await supabase.from('alertes').insert({
        type_alerte: 'document_en_attente',
        niveau: 'important',
        titre: `${pendingDocs.length} documents en attente > 48h`,
        description: `Documents uploadés il y a plus de 48h non encore traités.`,
        statut: 'active',
      })
      alertsCreated.push(`document_en_attente: ${pendingDocs.length} docs`)
    }

    return NextResponse.json({
      success: true,
      alerts_created: alertsCreated.length,
      details: alertsCreated,
    })
  } catch (e: unknown) {
    console.error('Alert generation error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
