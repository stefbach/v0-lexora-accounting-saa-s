import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
  fiscaliseInvoice,
  convertFactureToMRA,
  getMRAConfig,
  generateQRCode,
} from '@/lib/mra-ifp'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * GET /api/mra/fiscalise?facture_id=xxx
 * Check fiscalisation status of an invoice.
 */
export async function GET(request: Request) {
  try {
    const supabase = getAdminClient()
    const authClient = await createClient()
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const facture_id = searchParams.get('facture_id')

    if (!facture_id) {
      return NextResponse.json({ error: 'facture_id requis' }, { status: 400 })
    }

    const { data: facture, error } = await supabase
      .from('factures')
      .select('id, irn, qr_code_data, fiscalisation_date, mra_status, type_document')
      .eq('id', facture_id)
      .single()

    if (error || !facture) {
      return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
    }

    return NextResponse.json({
      facture_id: facture.id,
      irn: facture.irn,
      qr_code_data: facture.qr_code_data,
      fiscalisation_date: facture.fiscalisation_date,
      mra_status: facture.mra_status || 'non_fiscalise',
      type_document: facture.type_document || 'facture',
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/mra/fiscalise
 * Fiscalise an invoice or cancel (annuler) a fiscalised invoice.
 *
 * Body: { facture_id, societe_id, action?: 'fiscaliser' | 'annuler' }
 */
export async function POST(request: Request) {
  try {
    const supabase = getAdminClient()
    const authClient = await createClient()
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const body = await request.json()
    const { facture_id, societe_id, action = 'fiscaliser' } = body

    if (!facture_id || !societe_id) {
      return NextResponse.json(
        { error: 'facture_id et societe_id requis' },
        { status: 400 }
      )
    }

    // Load facture
    const { data: facture, error: factureError } = await supabase
      .from('factures')
      .select('*')
      .eq('id', facture_id)
      .single()

    if (factureError || !facture) {
      return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
    }

    // Load societe
    const { data: societe, error: societeError } = await supabase
      .from('societes')
      .select('*')
      .eq('id', societe_id)
      .single()

    if (societeError || !societe) {
      return NextResponse.json({ error: 'Societe introuvable' }, { status: 404 })
    }

    // Handle cancellation (credit note)
    if (action === 'annuler') {
      return handleAnnulation(supabase, facture, societe)
    }

    // Fiscalise
    if (facture.irn) {
      return NextResponse.json(
        { error: 'Cette facture est deja fiscalisee', irn: facture.irn },
        { status: 400 }
      )
    }

    if (facture.statut === 'brouillon') {
      return NextResponse.json(
        { error: 'Impossible de fiscaliser une facture brouillon. Finalisez-la d\'abord.' },
        { status: 400 }
      )
    }

    // Build MRA config
    const mraConfig = getMRAConfig(societe) || {
      api_url: 'https://sandboxifp.mra.mu/api/v1',
      api_key: societe.mra_api_key || 'mock',
      ebs_id: societe.mra_ebs_id || 'mock',
      environment: 'sandbox' as const,
    }

    // Load company settings from societe for seller info
    const sellerInfo = {
      nom: societe.nom || '',
      brn: societe.brn || '',
      vat_number: societe.vat_number || '',
      adresse: societe.adresse || '',
      mra_ebs_id: societe.mra_ebs_id || '',
    }

    // Convert to MRA format
    const mraInvoice = convertFactureToMRA(facture, sellerInfo)

    // Call MRA IFP
    const result = await fiscaliseInvoice(mraConfig, mraInvoice)

    if (!result.success) {
      // Update status to reflect error
      await supabase
        .from('factures')
        .update({
          mra_status: 'erreur',
          updated_at: new Date().toISOString(),
        })
        .eq('id', facture_id)

      return NextResponse.json(
        {
          error: result.errorMessage || 'Erreur de fiscalisation MRA',
          errorCode: result.errorCode,
        },
        { status: 422 }
      )
    }

    // Generate QR code image from data
    const qrCodeImage = result.qrCodeData ? generateQRCode(result.qrCodeData) : null

    // Update facture with IRN and QR code
    // Persiste aussi la réponse brute MRA (audit + vérification future
    // de la signature) et la signature extraite si présente.
    const { data: updated, error: updateError } = await supabase
      .from('factures')
      .update({
        irn: result.irn,
        qr_code_data: qrCodeImage || result.qrCodeData,
        fiscalisation_date: result.fiscalisationDate,
        mra_status: result.status ?? 'fiscalise',
        mra_response_raw: result.raw ?? null,
        mra_signature: result.signature ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', facture_id)
      .select()
      .single()

    if (updateError) {
      console.error('[mra] Error updating facture:', updateError.message)
      return NextResponse.json(
        { error: 'Fiscalisation reussie mais erreur de sauvegarde: ' + updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      irn: result.irn,
      qr_code_data: qrCodeImage || result.qrCodeData,
      fiscalisation_date: result.fiscalisationDate,
      facture: updated,
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    )
  }
}

/**
 * Handle annulation: create a credit note referencing the original invoice
 * and fiscalise it as type '02' (credit note).
 */
async function handleAnnulation(
  supabase: ReturnType<typeof getAdminClient>,
  facture: Record<string, unknown>,
  societe: Record<string, unknown>
) {
  if (!facture.irn) {
    return NextResponse.json(
      { error: 'Cette facture n\'est pas encore fiscalisee.' },
      { status: 400 }
    )
  }

  // Generate credit note number
  const { data: lastAvoir } = await supabase
    .from('factures')
    .select('numero_facture')
    .eq('societe_id', facture.societe_id)
    .eq('type_document', 'avoir')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let nextNum = 1
  if (lastAvoir?.numero_facture) {
    const match = (lastAvoir.numero_facture as string).match(/(\d+)$/)
    if (match) nextNum = parseInt(match[1]) + 1
  }
  const avoirNumero = `AV-${String(nextNum).padStart(3, '0')}`

  // Create credit note record
  const { data: avoir, error: avoirError } = await supabase
    .from('factures')
    .insert({
      societe_id: facture.societe_id,
      type_facture: 'client',
      type_document: 'avoir',
      numero_facture: avoirNumero,
      tiers: facture.tiers,
      description: `Avoir sur facture ${facture.numero_facture}`,
      date_facture: new Date().toISOString().split('T')[0],
      date_echeance: facture.date_echeance,
      devise: facture.devise,
      taux_change: facture.taux_change,
      montant_ht: -(Number(facture.montant_ht) || 0),
      montant_tva: -(Number(facture.montant_tva) || 0),
      montant_ttc: -(Number(facture.montant_ttc) || 0),
      montant_mur: -(Number(facture.montant_mur) || 0),
      taux_tva: facture.taux_tva,
      statut: 'en_attente',
      lignes: facture.lignes,
      client_offshore: facture.client_offshore,
      facture_reference_id: facture.id,
    })
    .select()
    .single()

  if (avoirError) {
    return NextResponse.json(
      { error: 'Erreur lors de la creation de l\'avoir: ' + avoirError.message },
      { status: 500 }
    )
  }

  // Fiscalise the credit note
  const sellerInfo = {
    nom: (societe.nom as string) || '',
    brn: (societe.brn as string) || '',
    vat_number: (societe.vat_number as string) || '',
    adresse: (societe.adresse as string) || '',
    mra_ebs_id: (societe.mra_ebs_id as string) || '',
  }

  const creditNote = {
    ...avoir,
    type_document: 'avoir',
    montant_ht: Math.abs(Number(avoir.montant_ht) || 0),
    montant_tva: Math.abs(Number(avoir.montant_tva) || 0),
    montant_ttc: Math.abs(Number(avoir.montant_ttc) || 0),
  }

  const mraConfig = getMRAConfig(societe as Record<string, string | boolean>) || {
    api_url: 'https://sandboxifp.mra.mu/api/v1',
    api_key: (societe.mra_api_key as string) || 'mock',
    ebs_id: (societe.mra_ebs_id as string) || 'mock',
    environment: 'sandbox' as const,
  }

  const mraInvoice = convertFactureToMRA(creditNote, sellerInfo)
  const result = await fiscaliseInvoice(mraConfig, mraInvoice)

  if (result.success) {
    const qrCodeImage = result.qrCodeData ? generateQRCode(result.qrCodeData) : null

    await supabase
      .from('factures')
      .update({
        irn: result.irn,
        qr_code_data: qrCodeImage || result.qrCodeData,
        fiscalisation_date: result.fiscalisationDate,
        mra_status: result.status ?? 'fiscalise',
        mra_response_raw: result.raw ?? null,
        mra_signature: result.signature ?? null,
      })
      .eq('id', avoir.id)

    // Update original invoice status
    await supabase
      .from('factures')
      .update({
        statut: 'annule',
        mra_status: 'annule',
        updated_at: new Date().toISOString(),
      })
      .eq('id', facture.id as string)
  }

  return NextResponse.json({
    success: true,
    avoir: {
      id: avoir.id,
      numero: avoirNumero,
      irn: result.irn,
    },
    original_facture_id: facture.id,
  })
}
