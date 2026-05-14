import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/telegram/internal/kpis?chat_id=<n>&period=YYYY-MM
 * Rôle requis : comptable+ (direction, comptable, comptable_dedie, rh, manager).
 * Renvoie CA mois, dépenses, résultat, trésorerie.
 */
export async function GET(req: NextRequest) {
  return withTelegramAuth(req, 'kpis.get', async (ctx) => {
    if (!hasRole(ctx, 'manager')) {
      return { result: null, status: 'denied', error_msg: 'KPIs réservés aux managers et plus' }
    }
    const period = req.nextUrl.searchParams.get('period') ||
      new Date().toISOString().slice(0, 7)
    const [year, month] = period.split('-').map(Number)
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

    const admin = getAdminClient()

    // CA = somme factures clients du mois
    const { data: ventes } = await admin
      .from('factures')
      .select('montant_ttc')
      .eq('societe_id', ctx.societe_id)
      .eq('type_document', 'facture')
      .eq('type', 'client')
      .gte('date_facture', startDate)
      .lte('date_facture', endDate)
    const ca = (ventes || []).reduce((s: number, f: any) => s + Number(f.montant_ttc || 0), 0)

    // Dépenses = factures fournisseurs du mois
    const { data: achats } = await admin
      .from('factures')
      .select('montant_ttc')
      .eq('societe_id', ctx.societe_id)
      .eq('type_document', 'facture')
      .eq('type', 'fournisseur')
      .gte('date_facture', startDate)
      .lte('date_facture', endDate)
    const depenses = (achats || []).reduce((s: number, f: any) => s + Number(f.montant_ttc || 0), 0)

    // Trésorerie = soldes bancaires actuels
    const { data: comptes } = await admin
      .from('comptes_bancaires')
      .select('solde_actuel, devise')
      .eq('societe_id', ctx.societe_id)
    const tresorerie_mur = (comptes || [])
      .filter((c: any) => c.devise === 'MUR' || !c.devise)
      .reduce((s: number, c: any) => s + Number(c.solde_actuel || 0), 0)

    return {
      result: {
        period,
        ca_mur: Math.round(ca),
        depenses_mur: Math.round(depenses),
        resultat_mur: Math.round(ca - depenses),
        tresorerie_mur: Math.round(tresorerie_mur),
        nb_ventes: ventes?.length || 0,
        nb_achats: achats?.length || 0,
      },
    }
  })
}
