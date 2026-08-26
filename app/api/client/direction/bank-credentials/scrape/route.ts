import { NextRequest, NextResponse, after } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { scrapeBankAccount, detectAnomalies } from '@/lib/banks/scraper'

/**
 * POST /api/client/direction/bank-credentials/scrape?compte_id=Y
 * Trigger manuel d'un scrape bancaire depuis l'UI.
 * Accès : direction / admin uniquement.
 *
 * ⚠️ Exécution ASYNCHRONE. Un scrape Playwright (login + navigation SPA MCB +
 * téléchargement relevés + OCR) dure 60–140 s. Une requête HTTP aussi longue est
 * coupée par les réseaux mobiles (4G) et les passerelles → l'UI affichait
 * « Load failed » alors que le scrape RÉUSSISSAIT côté serveur. On lance donc le
 * scrape en arrière-plan via `after()` et on répond immédiatement (202) ; l'UI
 * sonde la fin via `last_scrape_at` (GET bank-credentials).
 */
export const maxDuration = 300 // le scrape en arrière-plan peut atteindre ~140 s

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('not_authenticated', 401)

  const compteId = req.nextUrl.searchParams.get('compte_id')
  if (!compteId) return NextResponse.json({ error: 'compte_id requis' }, { status: 400 })

  const admin = getAdminClient()
  const { data: compte } = await admin
    .from('comptes_bancaires').select('id, societe_id, numero_compte').eq('id', compteId).maybeSingle()
  if (!compte) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })

  await assertSocieteAccess(supabase, user.id, compte.societe_id)
  const { data: us } = await supabase
    .from('user_societes').select('role')
    .eq('user_id', user.id).eq('societe_id', compte.societe_id).maybeSingle()
  if (!['direction', 'client_admin', 'admin', 'super_admin'].includes(us?.role || '')) {
    return apiError('management_only', 403)
  }

  const societeId = compte.societe_id
  const startedAt = new Date().toISOString()

  // Lance le scrape en arrière-plan (voir en-tête). `scrapeBankAccount` journalise
  // lui-même le run (bank_scrape_runs + comptes_bancaires_scraping_creds.last_scrape_*)
  // pour TOUS les statuts, ce qui sert de signal de fin au polling de l'UI.
  // L'alimentation du rapprochement + la mise à jour du solde sont faites DANS
  // scrapeBankAccount (cron ET manuel).
  after(async () => {
    try {
      const result = await scrapeBankAccount({
        compte_bancaire_id: compteId,
        societe_id: societeId,
        trigger_source: 'manual',
      })
      if (result.status === 'success') {
        await detectAnomalies(compteId, result)
      }
    } catch {
      // Best-effort : l'échec est déjà journalisé par recordRun côté scraper.
    }
  })

  return NextResponse.json({ started: true, started_at: startedAt }, { status: 202 })
}
