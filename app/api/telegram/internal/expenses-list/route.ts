import { NextRequest } from 'next/server'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/telegram/internal/expenses-list?chat_id=<n>&statut=brouillon,en_validation
 *
 * Liste les notes de frais en cours pour l'employé courant.
 * - Par défaut : statut IN ('brouillon', 'en_validation').
 * - Limite 25 dernières.
 *
 * Si l'utilisateur n'a pas d'employe_id rattaché, renvoie une liste vide
 * (pas une erreur — l'agent IA pourra orienter vers contact RH).
 */
export async function GET(req: NextRequest) {
  return withTelegramAuth(req, 'expense.list', async (ctx) => {
    if (!ctx.employe_id) {
      return { result: { count: 0, expenses: [], note: 'Aucun employé lié à votre compte' } }
    }

    const statutParam = req.nextUrl.searchParams.get('statut')
    const statuts = statutParam
      ? statutParam.split(',').map((s) => s.trim()).filter(Boolean)
      : ['brouillon', 'en_validation']

    const admin = getAdminClient()
    const { data, error } = await admin
      .from('notes_de_frais')
      .select('id, vendor, montant_ttc, devise, date_facture, categorie, statut, created_at')
      .eq('societe_id', ctx.societe_id)
      .eq('employe_id', ctx.employe_id)
      .in('statut', statuts)
      .order('created_at', { ascending: false })
      .limit(25)
    if (error) {
      return { result: null, status: 'error', error_msg: error.message }
    }

    const list = (data || []).map((d: any) => ({
      id: d.id,
      vendor: d.vendor,
      montant_ttc: d.montant_ttc,
      devise: d.devise || 'MUR',
      date_facture: d.date_facture,
      categorie: d.categorie,
      statut: d.statut,
      created_at: d.created_at,
    }))

    const total_mur = list
      .filter((e: any) => (e.devise || 'MUR') === 'MUR' && typeof e.montant_ttc === 'number')
      .reduce((acc: number, e: any) => acc + Number(e.montant_ttc), 0)

    return { result: { count: list.length, expenses: list, total_mur } }
  })
}
