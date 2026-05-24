import { NextRequest, NextResponse } from 'next/server'
import { verifyHmac } from '@/lib/security/hmac-auth'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/telegram/internal/payslip-latest?chat_id=<n>
 *
 * Renvoie le dernier bulletin de paie de l'utilisateur connecté (employé).
 * Données chiffrées seulement (montants) — le PDF est envoyé via /attachments dans Phase 3.
 */
export async function GET(req: NextRequest) {
  const __hmac = await verifyHmac(req)
  if (!__hmac.ok) {
    return NextResponse.json(
      { status: 'error', error_msg: `hmac_failed:${__hmac.reason}`, result: null },
      { status: 403 },
    )
  }

  return withTelegramAuth(req, 'payslip.latest.get', async (ctx) => {
    if (!ctx.employe_id) {
      return { result: null, status: 'denied', error_msg: 'Aucun employé lié à votre compte' }
    }
    const admin = getAdminClient()
    const { data, error } = await admin
      .from('bulletins_paie')
      .select('periode, salaire_brut, salaire_net, paye, csg_salarie, nsf_salarie, statut, created_at')
      .eq('employe_id', ctx.employe_id)
      .eq('societe_id', ctx.societe_id)
      .in('statut', ['valide', 'paye', 'comptabilise'])
      .order('periode', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return { result: null, status: 'error', error_msg: error.message }
    if (!data) return { result: null, status: 'success', error_msg: undefined } as any

    return {
      result: {
        periode: data.periode,
        salaire_brut: Number(data.salaire_brut || 0),
        salaire_net: Number(data.salaire_net || 0),
        paye: Number(data.paye || 0),
        csg_salarie: Number(data.csg_salarie || 0),
        nsf_salarie: Number(data.nsf_salarie || 0),
        statut: data.statut,
        emise_le: data.created_at,
      },
    }
  })
}
