/**
 * /api/admin/demandes-inscription/[id]
 *
 * POST  → valide la demande
 *           body : { plan_attribue_id?, modules_attribues?, tarif_final_mur?,
 *                    creer_societe?: boolean, role?: 'client_admin' | 'comptable' }
 *         Crée auth.user + profile + société (optionnelle) + dossier.
 *         Envoie l'email d'identifiants au prospect.
 *
 * DELETE → refuse la demande
 *           body : { rejected_reason: string }
 *         Marque la demande comme refusée et envoie l'email de refus.
 *
 * Admin/super_admin uniquement.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function requireAdmin() {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const supabase = getAdminClient()
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) return null
  return user
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log('[demande validate] RESEND_API_KEY absent, skip email:', to)
    return
  }
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Lexora <noreply@lexora.finance>',
        to: [to], subject, html,
      }),
    })
  } catch (e: any) {
    console.warn('[demande validate] sendEmail error:', e?.message)
  }
}

function genPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let pwd = ''
  for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
  return pwd
}

// ─── Validation ─────────────────────────────────────────────────────
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const {
    plan_attribue_id,
    modules_attribues,
    tarif_final_mur,
    creer_societe = true,
    role: forcedRole,
  } = body

  const supabase = getAdminClient()

  // 1. Charge la demande
  const { data: demande, error: dErr } = await supabase
    .from('demandes_inscription')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (dErr || !demande) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })
  if (demande.statut !== 'en_attente') {
    return NextResponse.json({ error: `Demande déjà ${demande.statut}` }, { status: 400 })
  }

  // 2. Détermine le rôle à appliquer
  const role = forcedRole || (demande.type_demandeur === 'comptable' ? 'comptable' : 'client_admin')

  // 3. Crée l'auth user + profile
  const password = genPassword()
  const fullName = `${demande.prenom} ${demande.nom}`.trim()

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: demande.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (authError || !authData?.user) {
    return NextResponse.json({
      error: `Création auth échouée : ${authError?.message || 'unknown'}`,
    }, { status: 500 })
  }
  const newUserId = authData.user.id

  // Upsert profile
  const { error: profileErr } = await supabase.from('profiles').upsert({
    id: newUserId,
    email: demande.email,
    full_name: fullName,
    role,
    phone: demande.telephone || null,
    is_active: true,
  }, { onConflict: 'id' })
  if (profileErr) {
    return NextResponse.json({ error: `Erreur profile : ${profileErr.message}` }, { status: 500 })
  }

  // 4. Crée société + dossier si demande dirigeant et option activée
  let createdSocieteId: string | null = null
  if (creer_societe && demande.type_demandeur === 'dirigeant' && demande.societe_data?.nom) {
    const sd = demande.societe_data as any
    const planEffectif = plan_attribue_id || demande.plan_id || null
    let modulesActifs = modules_attribues || null
    if (!modulesActifs && planEffectif) {
      const { data: plan } = await supabase.from('plans').select('modules_inclus').eq('id', planEffectif).maybeSingle()
      modulesActifs = (plan as any)?.modules_inclus || null
    }
    // Normalise : toutes les clés sidebar doivent être présentes (les
    // absentes deviennent explicitement false). Sinon la sidebar afficherait
    // les sections par défaut quand une clé manque.
    if (modulesActifs && typeof modulesActifs === 'object') {
      const keys = ['comptabilite','rh','juridique','facturation','documents','fiscal','etats_financiers','employe_portal']
      const normalized: Record<string, boolean> = {}
      for (const k of keys) normalized[k] = (modulesActifs as any)[k] === true
      modulesActifs = normalized
    }

    const { data: societe, error: socErr } = await supabase
      .from('societes')
      .insert({
        nom: sd.nom,
        brn: sd.brn || null,
        numero_tva_mra: sd.vat_number || null,
        secteur_activite: sd.secteur_activite || null,
        adresse: sd.adresse || null,
        ville: sd.ville || null,
        telephone: sd.telephone || demande.telephone || null,
        email: sd.email || demande.email,
        created_by: newUserId,
        client_id: newUserId,
        modules_actifs: modulesActifs,
      })
      .select('id')
      .single()

    if (socErr) {
      console.warn('[validate] société non créée:', socErr.message)
    } else if (societe) {
      createdSocieteId = societe.id
      await supabase.from('dossiers').insert({
        client_id: newUserId,
        societe_id: societe.id,
        statut: 'actif',
      })
    }
  }

  // 5. Met à jour la demande
  await supabase.from('demandes_inscription').update({
    statut: 'validee',
    plan_attribue_id: plan_attribue_id || demande.plan_id || null,
    modules_attribues: modules_attribues || null,
    tarif_final_mur: tarif_final_mur != null ? Number(tarif_final_mur) : null,
    validated_at: new Date().toISOString(),
    validated_by: adminUser.id,
    created_user_id: newUserId,
    created_societe_id: createdSocieteId,
  }).eq('id', id)

  // 5bis. Génération automatique de la facture Lexora (DDS Ltd → client SaaS).
  //       Idempotente : si une facture existe déjà pour la demande, réutilisée.
  try {
    const planEffectifId = plan_attribue_id || demande.plan_id || null
    let planRow: any = null
    if (planEffectifId) {
      const { data: p } = await supabase.from('plans').select('code,nom,prix_mensuel_mur,prix_annuel_mur').eq('id', planEffectifId).maybeSingle()
      planRow = p
    }
    const periodicite = (demande.periodicite || 'mensuelle') as 'mensuelle' | 'annuelle'
    const planPriceFallback = planRow
      ? (periodicite === 'annuelle' ? Number(planRow.prix_annuel_mur || 0) : Number(planRow.prix_mensuel_mur || 0))
      : 0
    const tarifFinal = tarif_final_mur != null ? Number(tarif_final_mur) : planPriceFallback
    if (tarifFinal > 0) {
      const { createLexoraInvoice } = await import('@/lib/lexora-billing/create-invoice')
      const invoiceDate = (demande.created_at || new Date().toISOString()).slice(0, 10)
      await createLexoraInvoice({
        supabaseAdmin: supabase,
        demande_id: id,
        client_societe_id: createdSocieteId,
        client_user_id: newUserId,
        plan: planRow,
        periodicite,
        tarif_final_mur: tarifFinal,
        invoice_date: invoiceDate,
        cgv_accepted_at: demande.created_at || null,
        customer: {
          nom: demande.societe_data?.nom || `${demande.prenom} ${demande.nom}`.trim(),
          brn: demande.societe_data?.brn || null,
          vat: demande.societe_data?.vat_number || null,
          adresse: demande.societe_data?.adresse || null,
          ville: demande.societe_data?.ville || null,
          dirigeant_nom: `${demande.prenom} ${demande.nom}`.trim(),
          dirigeant_email: demande.email,
          telephone: demande.telephone || demande.societe_data?.telephone || null,
        },
        created_by: adminUser.id,
      })
    }
  } catch (e: any) {
    console.warn('[validate] facture Lexora non créée :', e?.message)
  }


  // 6. Email identifiants au prospect
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lexora.finance'
  void sendEmail(
    demande.email,
    'Lexora — Votre compte est activé 🎉',
    `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fafafa">
        <div style="background:linear-gradient(135deg,#0B0F2E 0%,#1a2659 100%);color:#fff;padding:24px;border-radius:8px;text-align:center">
          <h1 style="margin:0;font-size:24px">Bienvenue ${demande.prenom} 🎉</h1>
          <p style="margin:8px 0 0;opacity:0.85">Votre compte Lexora est activé</p>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #eee;border-top:none">
          <p>Bonne nouvelle ! Votre demande d'inscription a été validée et vous pouvez maintenant accéder à votre espace Lexora.</p>

          <div style="background:#0B0F2E;color:#fff;padding:16px;border-radius:6px;margin:20px 0;font-family:monospace">
            <p style="margin:0 0 8px"><strong>Email :</strong> ${demande.email}</p>
            <p style="margin:0"><strong>Mot de passe :</strong> ${password}</p>
          </div>

          <p style="background:#fef3c7;padding:12px;border-radius:4px;border-left:3px solid #d4af37;font-size:14px">
            ⚠️ <strong>Important :</strong> Changez votre mot de passe à la première connexion (Profil → Sécurité).
          </p>

          <p style="text-align:center;margin:24px 0">
            <a href="${baseUrl}/auth/login"
               style="background:#D4AF37;color:#0B0F2E;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">
              Se connecter
            </a>
          </p>

          <p style="font-size:13px;color:#666">À très vite,<br>L'équipe Lexora</p>
        </div>
      </div>
    `,
  )

  return NextResponse.json({
    ok: true,
    user_id: newUserId,
    societe_id: createdSocieteId,
    password_sent_to: demande.email,
  })
}

// ─── Refus ──────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const rejected_reason: string = body?.rejected_reason || ''
  if (!rejected_reason.trim()) {
    return NextResponse.json({ error: 'rejected_reason requis' }, { status: 400 })
  }

  const supabase = getAdminClient()
  const { data: demande } = await supabase
    .from('demandes_inscription').select('email, prenom').eq('id', id).maybeSingle()
  if (!demande) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })

  await supabase.from('demandes_inscription').update({
    statut: 'refusee',
    rejected_reason: rejected_reason.trim(),
    validated_at: new Date().toISOString(),
    validated_by: adminUser.id,
  }).eq('id', id)

  void sendEmail(
    demande.email,
    'Lexora — Suite à votre demande d\'inscription',
    `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#0B0F2E">Bonjour ${demande.prenom},</h2>
        <p>Nous avons étudié votre demande d'inscription à Lexora et ne pouvons pas y donner suite pour le moment.</p>
        <p><strong>Motif :</strong></p>
        <blockquote style="background:#f9fafb;padding:12px;border-left:3px solid #e5e7eb;margin:12px 0">
          ${rejected_reason.replace(/\n/g, '<br>')}
        </blockquote>
        <p>N'hésitez pas à nous recontacter si vous avez des questions.</p>
        <p>Cordialement,<br>L'équipe Lexora</p>
      </div>
    `,
  )

  return NextResponse.json({ ok: true })
}
