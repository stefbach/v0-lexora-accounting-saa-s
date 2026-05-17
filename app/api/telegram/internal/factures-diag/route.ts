import { NextRequest } from 'next/server'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/telegram/internal/factures-diag?chat_id=<n>
 *
 * Diagnostic : retourne les 10 derniers documents traités + leurs factures liées
 * pour la société active du chat. Permet de voir si le pipeline a bien créé
 * la row factures ET de quel type, OU si l'INSERT a planté.
 */
export async function GET(req: NextRequest) {
  return withTelegramAuth(req, 'factures.diag', async (ctx) => {
    const admin = getAdminClient()

    const { data: societe } = await admin
      .from('societes')
      .select('id, nom, brn')
      .eq('id', ctx.societe_id)
      .maybeSingle()

    const { data: docs } = await admin
      .from('documents')
      .select('id, nom_fichier, type_fichier, type_document, statut, n8n_result, created_at, dossier_id, dossiers!inner(societe_id)')
      .eq('dossiers.societe_id', ctx.societe_id)
      .order('created_at', { ascending: false })
      .limit(10)

    const docIds = (docs || []).map((d: any) => d.id)

    const { data: factures } = await admin
      .from('factures')
      .select('id, numero_facture, type_facture, tiers, montant_ttc, devise, statut, document_id, created_at')
      .in('document_id', docIds.length > 0 ? docIds : ['00000000-0000-0000-0000-000000000000'])

    const docsWithFactures = (docs || []).map((d: any) => {
      const fac = (factures || []).find((f: any) => f.document_id === d.id)
      const ext = d.n8n_result?.extraction || {}
      const routing = d.n8n_result?.routing || {}
      return {
        document_id: d.id,
        nom_fichier: d.nom_fichier,
        statut_document: d.statut,
        type_document: d.type_document,
        ocr_routing_type: routing.type_document,
        ocr_routing_societe: routing.societe,
        ocr_emetteur: ext.emetteur,
        ocr_destinataire: ext.destinataire,
        ocr_montant_ttc: ext.montant_ttc,
        facture_associee: fac
          ? {
              id: fac.id,
              type: fac.type_facture,
              tiers: fac.tiers,
              montant: fac.montant_ttc,
              devise: fac.devise,
              statut: fac.statut,
            }
          : null,
        ocr_error: d.n8n_result?.error || null,
        created_at: d.created_at,
      }
    })

    return {
      result: {
        societe_active: societe,
        docs_count: (docs || []).length,
        factures_count: (factures || []).length,
        documents: docsWithFactures,
      },
    }
  })
}
