/**
 * /api/client/factures/[id]/fiscalise
 *
 * POST : déclenche la fiscalisation MRA EBS pour une facture.
 * GET  : retourne le statut MRA courant + historique des appels.
 *
 * Sécurité : tenant isolation via assertSocieteAccess. Mode mock par
 * défaut (var env MRA_USE_MOCK), à désactiver une fois les certificats
 * sandbox MRA validés.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertSocieteAccess,
  mapSocieteAccessError,
  ResourceNotFoundError,
} from '@/lib/supabase/assert-societe-access'
import {
  convertFactureToMRA,
  fiscaliseInvoiceWithAudit,
  getMRAConfig,
} from '@/lib/mra-ifp'
import { getMRAApiKey } from '@/lib/credentials/mra-vault'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    // Charge facture + société (pour BRN, VAT, ebs_id, api_key)
    const { data: facture, error: factErr } = await supabase
      .from('factures')
      .select('*, societe:societes(nom, brn, numero_tva_mra, vat_number, adresse, mra_ebs_id, mra_api_key, mra_environment, mra_fiscalisation_active)')
      .eq('id', id)
      .maybeSingle()
    if (factErr) throw factErr
    if (!facture) throw new ResourceNotFoundError('Facture introuvable')

    await assertSocieteAccess(supabase, user.id, facture.societe_id)

    // Empêche la double-fiscalisation côté client (idempotence)
    if (facture.mra_status === 'fiscalise' && facture.irn) {
      return NextResponse.json({
        ok: true,
        already_fiscalise: true,
        irn: facture.irn,
        qr_code_data: facture.qr_code_data,
        fiscalisation_date: facture.fiscalisation_date,
      })
    }

    const societe = (facture as any).societe
    if (!societe) {
      return NextResponse.json({ error: 'Société introuvable pour cette facture' }, { status: 400 })
    }

    // Retrieve encrypted MRA API key from vault
    let mraApiKey: string | null = null
    try {
      mraApiKey = await getMRAApiKey(supabase, facture.societe_id)
    } catch (e) {
      return NextResponse.json(
        {
          error: 'Impossible de récupérer les credentials MRA chiffrés.',
          hint: 'Vérifiez la configuration CRYPT_KEY et les credentials MRA.',
        },
        { status: 500 },
      )
    }

    // Vérifie que la fiscalisation est activée pour cette société
    const config = getMRAConfig({
      mra_ebs_id: societe.mra_ebs_id,
      mra_api_key: mraApiKey || societe.mra_api_key, // fallback to plaintext for migration period
      mra_environment: societe.mra_environment,
      mra_fiscalisation_active: societe.mra_fiscalisation_active,
    })
    if (!config) {
      return NextResponse.json(
        {
          error: 'Fiscalisation MRA non configurée pour cette société.',
          hint: 'Active mra_fiscalisation_active=true et renseigne mra_ebs_id + mra_api_key dans la société (paramétrage admin).',
        },
        { status: 400 },
      )
    }

    // Construit la charge utile MRA depuis la facture Lexora
    const invoice = convertFactureToMRA(facture as any, {
      nom: societe.nom || '',
      brn: societe.brn || '',
      vat_number: societe.numero_tva_mra || societe.vat_number || '',
      adresse: societe.adresse || '',
      mra_ebs_id: societe.mra_ebs_id || '',
    })

    const result = await fiscaliseInvoiceWithAudit(supabase, {
      facture_id: id,
      societe_id: facture.societe_id,
      config,
      invoice,
      source: 'manuel',
      created_by: user.id,
    })

    if (!result.success) {
      return NextResponse.json(
        {
          ok: false,
          error: result.errorMessage,
          error_code: result.errorCode,
          log_id: result.log_id,
        },
        { status: 422 },
      )
    }

    return NextResponse.json({
      ok: true,
      irn: result.irn,
      qr_code_data: result.qrCodeData,
      qr_code_image: result.qr_code_image,
      fiscalisation_date: result.fiscalisationDate,
      log_id: result.log_id,
      environment: config.environment,
    })
  } catch (e: any) {
    if (e instanceof ResourceNotFoundError) {
      return NextResponse.json({ error: e.message }, { status: 404 })
    }
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    const { data: facture, error } = await supabase
      .from('factures')
      .select('id, societe_id, mra_status, irn, qr_code_data, fiscalisation_date')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!facture) throw new ResourceNotFoundError('Facture introuvable')

    await assertSocieteAccess(supabase, user.id, facture.societe_id)

    // Historique des tentatives (10 dernières)
    const { data: logs } = await supabase
      .from('mra_fiscalisation_logs')
      .select('id, action, success, irn, http_status, duration_ms, error_code, error_message, source, environment, created_at')
      .eq('facture_id', id)
      .order('created_at', { ascending: false })
      .limit(10)

    return NextResponse.json({
      mra_status: facture.mra_status || 'non_fiscalise',
      irn: facture.irn,
      qr_code_data: facture.qr_code_data,
      fiscalisation_date: facture.fiscalisation_date,
      history: logs || [],
    })
  } catch (e: any) {
    if (e instanceof ResourceNotFoundError) {
      return NextResponse.json({ error: e.message }, { status: 404 })
    }
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
