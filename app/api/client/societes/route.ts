import { createClient } from '@/lib/supabase/server'
import { getAdminClient as getAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const admin = getAdmin()
    const { data: profile } = await admin.from('profiles').select('role, societe_id').eq('id', user.id).maybeSingle()
    const role = profile?.role || ''

    let societes: any[] = []

    if (['admin', 'super_admin'].includes(role)) {
      const { data } = await admin.from('societes').select('*').order('nom')
      societes = data || []

    } else if (['comptable', 'comptable_dedie'].includes(role)) {
      // Via comptable_societes + via dossiers
      const [{ data: viaCS }, { data: viaDossiers }] = await Promise.all([
        admin.from('comptable_societes').select('societe_id, societes(*)').eq('comptable_id', user.id).eq('actif', true),
        admin.from('dossiers').select('societe_id, societes(*)').eq('comptable_id', user.id).eq('statut', 'actif'),
      ])
      const map = new Map()
      ;(viaCS || []).forEach((r: any) => { if (r.societes) map.set(r.societes.id, r.societes) })
      ;(viaDossiers || []).forEach((d: any) => { if (d.societes) map.set(d.societes.id, d.societes) })
      societes = Array.from(map.values())

    } else if (['client_admin', 'client_user', 'client_assistant'].includes(role)) {
      // Via created_by + via dossiers + via user_societes
      const { data: owned } = await admin.from('societes').select('*').eq('created_by', user.id)

      const { data: dossiers } = await admin.from('dossiers').select('societe_id').eq('client_id', user.id)
      const dossierSocieteIds = (dossiers || []).map(d => d.societe_id).filter(Boolean)

      const { data: userSocietes } = await admin.from('user_societes').select('societe_id').eq('user_id', user.id)
      const userSocieteIds = (userSocietes || []).map(us => us.societe_id).filter(Boolean)

      // Combine all société IDs
      const allSocieteIds = [...new Set([
        ...(owned || []).map((s: any) => s.id),
        ...dossierSocieteIds,
        ...userSocieteIds,
      ])]

      const map = new Map()
      ;(owned || []).forEach((s: any) => map.set(s.id, s))

      // Fetch remaining sociétés by ID
      const missingIds = allSocieteIds.filter(id => !map.has(id))
      if (missingIds.length > 0) {
        const { data: extra } = await admin.from('societes').select('*').in('id', missingIds)
        ;(extra || []).forEach((s: any) => map.set(s.id, s))
      }

      societes = Array.from(map.values())

    } else if (['rh', 'juridique', 'employe', 'manager', 'direction'].includes(role)) {
      if (profile?.societe_id) {
        const { data } = await admin.from('societes').select('*').eq('id', profile.societe_id)
        societes = data || []
      }

    } else {
      // Rôle inconnu ou profil manquant — chercher via dossiers en dernier recours
      const { data: viaDossiers } = await admin.from('dossiers').select('societe_id, societes(*)').eq('client_id', user.id)
      const map = new Map()
      ;(viaDossiers || []).forEach((d: any) => { if (d.societes) map.set(d.societes.id, d.societes) })
      societes = Array.from(map.values())
    }

    return NextResponse.json({ societes }, { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' } })
  } catch (e: unknown) {
    console.error('[client/societes] GET error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const body = await request.json()
    if (!body.nom) return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 })

    const admin = getAdmin()

    // Insert société — include created_by so the client can see it
    const insertData: Record<string, unknown> = {
      nom: body.nom,
      brn: body.brn || null,
      numero_tva_mra: body.numero_tva_mra || null,
      statut_tva: body.statut_tva || false,
      adresse: body.adresse || null,
      telephone: body.telephone || null,
      email: body.email || null,
      created_by: user.id,
    }
    if (body.ern) insertData.ern = body.ern
    if (body.secteur_activite) insertData.secteur_activite = body.secteur_activite
    // Phase K — paramétrage régime + monnaie fonctionnelle + FSC
    if (body.regime) insertData.regime = body.regime
    if (body.devise_fonctionnelle) insertData.devise_fonctionnelle = body.devise_fonctionnelle
    if (body.fsc_license_number) insertData.fsc_license_number = body.fsc_license_number
    if (body.fsc_license_type) insertData.fsc_license_type = body.fsc_license_type
    if (body.fsc_license_issued) insertData.fsc_license_issued = body.fsc_license_issued
    if (body.fsc_license_expiry) insertData.fsc_license_expiry = body.fsc_license_expiry
    if (body.tax_residency_country) insertData.tax_residency_country = body.tax_residency_country
    if (body.gbc_activity_main) insertData.gbc_activity_main = body.gbc_activity_main

    const { data, error } = await admin.from('societes').insert(insertData).select().single()

    if (error) {
      console.error('[client/societes] POST insert error:', error.message, error.details, error.hint)
      // Retry without optional columns
      const fallbackData: Record<string, unknown> = {
        nom: body.nom,
        brn: body.brn || null,
        numero_tva_mra: body.numero_tva_mra || null,
        statut_tva: body.statut_tva || false,
        adresse: body.adresse || null,
        telephone: body.telephone || null,
        email: body.email || null,
      }
      const retry = await admin.from('societes').insert(fallbackData).select().single()
      if (retry.error) {
        console.error('[client/societes] POST fallback error:', retry.error.message)
        return NextResponse.json({ error: retry.error.message }, { status: 500 })
      }

      // Société created without created_by — create dossier to ensure visibility
      if (retry.data?.id) {
        await admin.from('dossiers').upsert({
          client_id: user.id,
          societe_id: retry.data.id,
          comptable_id: user.id, // fallback if NOT NULL
          statut: 'actif',
        }, { onConflict: 'client_id,societe_id', ignoreDuplicates: true })
      }
      return NextResponse.json({ societe: retry.data })
    }

    // Société created with created_by — also create a dossier as backup visibility path
    if (data?.id) {
      const { error: dossierError } = await admin.from('dossiers').insert({
        client_id: user.id,
        societe_id: data.id,
        comptable_id: user.id, // use self as fallback if NOT NULL required
        statut: 'actif',
      })
      if (dossierError) {
        console.error('[client/societes] dossier error:', dossierError.message)
        // Try with null comptable_id (if column is nullable)
        await admin.from('dossiers').insert({
          client_id: user.id,
          societe_id: data.id,
          comptable_id: null,
          statut: 'actif',
        })
      }
    }

    return NextResponse.json({ societe: data })
  } catch (e: unknown) {
    console.error('[client/societes] POST fatal:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
    const body = await request.json()
    const admin = getAdmin()

    // Tenant isolation: vérifier l'accès du caller à la société
    await assertSocieteAccess(admin, user.id, id)

    const updateData: Record<string, unknown> = {}
    if (body.nom !== undefined) updateData.nom = body.nom
    if (body.brn !== undefined) updateData.brn = body.brn || null
    if (body.ern !== undefined) updateData.ern = body.ern || null
    if (body.numero_tva_mra !== undefined) updateData.numero_tva_mra = body.numero_tva_mra || null
    if (body.statut_tva !== undefined) updateData.statut_tva = body.statut_tva
    if (body.secteur_activite !== undefined) updateData.secteur_activite = body.secteur_activite || null
    if (body.adresse !== undefined) updateData.adresse = body.adresse || null
    if (body.telephone !== undefined) updateData.telephone = body.telephone || null
    if (body.email !== undefined) updateData.email = body.email || null

    // Phase K — paramétrage régime + monnaie fonctionnelle + FSC (mig 258)
    if (body.regime !== undefined) updateData.regime = body.regime
    if (body.devise_fonctionnelle !== undefined) updateData.devise_fonctionnelle = body.devise_fonctionnelle
    if (body.fsc_license_number !== undefined) updateData.fsc_license_number = body.fsc_license_number || null
    if (body.fsc_license_type !== undefined) updateData.fsc_license_type = body.fsc_license_type || null
    if (body.fsc_license_issued !== undefined) updateData.fsc_license_issued = body.fsc_license_issued || null
    if (body.fsc_license_expiry !== undefined) updateData.fsc_license_expiry = body.fsc_license_expiry || null
    if (body.tax_residency_country !== undefined) updateData.tax_residency_country = body.tax_residency_country || null
    if (body.gbc_activity_main !== undefined) updateData.gbc_activity_main = body.gbc_activity_main || null

    // Champs facturation (mig 243) + coordonnées bancaires (mig 106) +
    // logo (mig 046 / mig 242) + devise (mig 006). Tous facultatifs.
    if (body.website !== undefined) updateData.website = body.website || null
    if (body.logo_url !== undefined) updateData.logo_url = body.logo_url || null
    if (body.devise_principale !== undefined) updateData.devise_principale = body.devise_principale || 'MUR'
    if (body.bank_name !== undefined) updateData.bank_name = body.bank_name || null
    if (body.bank_account_number !== undefined) updateData.bank_account_number = body.bank_account_number || null
    if (body.iban !== undefined) updateData.iban = body.iban || null
    if (body.banque_swift !== undefined) updateData.banque_swift = body.banque_swift || null
    if (body.facture_prefixe !== undefined) updateData.facture_prefixe = body.facture_prefixe || 'INV-'
    if (body.facture_prochain_numero !== undefined) {
      const n = Number(body.facture_prochain_numero)
      updateData.facture_prochain_numero = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
    }
    if (body.facture_conditions_paiement !== undefined) {
      const n = Number(body.facture_conditions_paiement)
      updateData.facture_conditions_paiement = Number.isFinite(n) && n >= 0 && n <= 365 ? Math.floor(n) : 30
    }
    if (body.facture_footer_text !== undefined) updateData.facture_footer_text = body.facture_footer_text || null
    if (body.facture_mention_legale !== undefined) updateData.facture_mention_legale = body.facture_mention_legale || null

    // Numérotation devis / avoir / note de débit (mig 247) — même
    // pattern que facture_*, avec préfixe + compteur. Le retry défensif
    // plus bas filtre les colonnes manquantes si mig 247 pas appliquée.
    if (body.devis_prefixe !== undefined) updateData.devis_prefixe = body.devis_prefixe || 'DEV-'
    if (body.devis_prochain_numero !== undefined) {
      const n = Number(body.devis_prochain_numero)
      updateData.devis_prochain_numero = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
    }
    if (body.avoir_prefixe !== undefined) updateData.avoir_prefixe = body.avoir_prefixe || 'AV-'
    if (body.avoir_prochain_numero !== undefined) {
      const n = Number(body.avoir_prochain_numero)
      updateData.avoir_prochain_numero = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
    }
    if (body.note_debit_prefixe !== undefined) updateData.note_debit_prefixe = body.note_debit_prefixe || 'ND-'
    if (body.note_debit_prochain_numero !== undefined) {
      const n = Number(body.note_debit_prochain_numero)
      updateData.note_debit_prochain_numero = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
    }

    // Tentative initiale d'update. Si elle échoue à cause d'une colonne
    // qui n'existe pas en DB (typique : mig 243/106/046 pas appliquée),
    // on retire la colonne fautive et on retry. Boucle bornée pour
    // éviter un infinite loop sur erreur non-schema.
    //
    // Code d'erreur Postgres "42703" = undefined_column. Le message
    // Supabase contient typiquement "Could not find the 'xxx' column".
    let updateRes = await admin.from('societes').update(updateData).eq('id', id).select().single()
    let safety = 20
    while (updateRes.error && safety > 0) {
      const msg = updateRes.error.message || ''
      const code = (updateRes.error as any).code
      // Extrait le nom de la colonne manquante du message d'erreur PostgREST
      // Pattern: Could not find the 'XYZ' column of 'societes' in the schema cache
      const colMatch = msg.match(/['"]([a-z_]+)['"][\s_]*column/i)
        || msg.match(/column ['"]?([a-z_]+)['"]? does not exist/i)
        || msg.match(/column "([a-z_]+)"/i)
      const missingCol = colMatch?.[1]
      const isSchemaError = code === '42703' || /column.*(not exist|schema cache)/i.test(msg)
      if (!isSchemaError || !missingCol || !(missingCol in updateData)) {
        // Pas une erreur de colonne manquante → on abandonne avec un
        // message clair pour l'UI au lieu de crasher silencieusement.
        return NextResponse.json(
          {
            error: `Erreur sauvegarde : ${msg}`,
            hint: `Migrations 243-246 sans doute pas appliquées. Lance le SQL des migrations sur ta DB Supabase.`,
            details: msg,
          },
          { status: 500 },
        )
      }
      console.warn(`[client/societes] PATCH : colonne "${missingCol}" manquante en DB, retrait et retry`)
      delete updateData[missingCol]
      if (Object.keys(updateData).length === 0) {
        return NextResponse.json(
          { error: 'Aucun champ valide à sauvegarder. Vérifie que les migrations DB sont appliquées.' },
          { status: 500 },
        )
      }
      updateRes = await admin.from('societes').update(updateData).eq('id', id).select().single()
      safety -= 1
    }
    const { data, error } = updateRes
    if (error) throw error
    return NextResponse.json({ societe: data })
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
