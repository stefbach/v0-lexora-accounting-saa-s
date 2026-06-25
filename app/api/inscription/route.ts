/**
 * /api/inscription
 *
 * POST — Soumission d'une demande d'inscription publique.
 *
 * Workflow :
 *   1. Visiteur public remplit le formulaire /inscription
 *   2. Cet endpoint crée une ligne demandes_inscription (statut=en_attente)
 *   3. Envoie un email de confirmation au prospect + notif admin
 *   4. Admin valide / refuse depuis /admin/demandes-inscription
 *
 * Body :
 *   {
 *     type_demandeur: 'dirigeant' | 'comptable',
 *     prenom, nom, email, telephone?, poste?,
 *     societe_data?: { nom, brn, vat_number, secteur_activite, ... },
 *     cabinet_data?: { nom_cabinet, brn, nombre_clients_envisage, ... },
 *     plan_id?: string,
 *     periodicite: 'mensuelle' | 'annuelle',
 *     accept_cgu: true,
 *     accept_cgv: true,
 *     accept_marketing?: boolean,
 *     message?: string,
 *   }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * Envoie un email via Resend si la clé est configurée. Silencieux
 * sinon (la création de la demande ne doit pas échouer si l'email plante).
 */
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[inscription] RESEND_API_KEY absent — email skipped:', to, subject)
    return
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Lexora <noreply@lexora.finance>',
        to: [to],
        subject,
        html,
      }),
    })
    if (!res.ok) {
      const txt = await res.text()
      console.warn('[inscription] Resend error:', res.status, txt)
    }
  } catch (e: any) {
    console.warn('[inscription] Resend exception:', e?.message)
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      type_demandeur,
      prenom,
      nom,
      email,
      telephone,
      poste,
      societe_data,
      cabinet_data,
      plan_id,
      periodicite = 'mensuelle',
      accept_cgu,
      accept_cgv,
      accept_marketing = false,
      message,
    } = body

    // ── Validation ─────────────────────────────────────────────────
    if (!['dirigeant', 'comptable'].includes(type_demandeur)) {
      return NextResponse.json({ error: 'type_demandeur invalide' }, { status: 400 })
    }
    if (!prenom || !nom || !email) {
      return NextResponse.json({ error: 'prenom, nom et email requis' }, { status: 400 })
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
    }
    if (!accept_cgu || !accept_cgv) {
      return NextResponse.json({
        error: 'Vous devez accepter les CGU et les CGV.',
      }, { status: 400 })
    }
    if (!['mensuelle', 'annuelle'].includes(periodicite)) {
      return NextResponse.json({ error: 'periodicite invalide' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // ── Anti-doublon : refuse si demande en_attente avec même email
    const { data: existing } = await supabase
      .from('demandes_inscription')
      .select('id, statut, created_at')
      .eq('email', email.toLowerCase().trim())
      .eq('statut', 'en_attente')
      .maybeSingle()
    if (existing) {
      return NextResponse.json({
        error: 'Une demande est déjà en cours pour cet email. Notre équipe vous recontactera sous 24h.',
      }, { status: 409 })
    }

    // ── Récupère IP + UA pour audit
    const ip_address = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || request.headers.get('x-real-ip')
      || null
    const user_agent = request.headers.get('user-agent') || null

    // ── Insert ─────────────────────────────────────────────────────
    const { data: demande, error } = await supabase
      .from('demandes_inscription')
      .insert({
        type_demandeur,
        prenom: prenom.trim(),
        nom: nom.trim(),
        email: email.toLowerCase().trim(),
        telephone: telephone?.trim() || null,
        poste: poste?.trim() || null,
        societe_data: societe_data || null,
        cabinet_data: cabinet_data || null,
        plan_id: plan_id || null,
        periodicite,
        accept_cgu: !!accept_cgu,
        accept_cgv: !!accept_cgv,
        accept_marketing: !!accept_marketing,
        message: message?.trim() || null,
        ip_address,
        user_agent,
      })
      .select('id, email, prenom, nom, type_demandeur, plan_id')
      .single()

    if (error) {
      console.error('[inscription POST]', error)
      return NextResponse.json({ error: `Erreur enregistrement : ${error.message}` }, { status: 500 })
    }

    // ── Récupère le nom du plan choisi pour l'email
    let planNom = ''
    if (demande.plan_id) {
      const { data: plan } = await supabase.from('plans').select('nom').eq('id', demande.plan_id).maybeSingle()
      planNom = plan?.nom || ''
    }

    // ── Email confirmation prospect
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lexora.finance'
    void sendEmail(
      demande.email,
      'Lexora — Votre demande d\'inscription a bien été reçue',
      `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fafafa">
          <div style="background:#0B0F2E;color:#fff;padding:24px;border-radius:8px;text-align:center">
            <h1 style="margin:0;font-size:24px">Bienvenue chez Lexora ✨</h1>
          </div>
          <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #eee;border-top:none">
            <p>Bonjour ${demande.prenom},</p>
            <p>Nous avons bien reçu votre demande d'inscription pour Lexora${planNom ? ` (plan <strong>${planNom}</strong>)` : ''}.</p>
            <p>Notre équipe va examiner votre dossier et vous recontacter sous <strong>24 à 48 heures ouvrées</strong> avec vos identifiants de connexion.</p>
            <p style="background:#fef3c7;padding:12px;border-radius:4px;border-left:3px solid #d4af37">
              <strong>Récap de votre demande</strong><br>
              Type : ${type_demandeur === 'dirigeant' ? 'Dirigeant d\'entreprise' : 'Cabinet comptable'}<br>
              Email : ${demande.email}<br>
              ${societe_data?.nom ? `Société : ${societe_data.nom}<br>` : ''}
              ${cabinet_data?.nom_cabinet ? `Cabinet : ${cabinet_data.nom_cabinet}<br>` : ''}
              Périodicité : ${periodicite}
            </p>
            <p>À très vite,<br>L'équipe Lexora</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
            <p style="font-size:12px;color:#888;text-align:center">
              <a href="${baseUrl}" style="color:#0B0F2E;text-decoration:none">${baseUrl}</a> · Maurice
            </p>
          </div>
        </div>
      `,
    )

    // ── Email notification admin
    const adminEmail = process.env.LEXORA_ADMIN_EMAIL
    if (adminEmail) {
      void sendEmail(
        adminEmail,
        `[Lexora] Nouvelle demande d'inscription — ${demande.prenom} ${demande.nom}`,
        `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="color:#0B0F2E">Nouvelle demande d'inscription</h2>
            <p><strong>Type :</strong> ${type_demandeur}</p>
            <p><strong>Nom :</strong> ${demande.prenom} ${demande.nom}</p>
            <p><strong>Email :</strong> ${demande.email}</p>
            <p><strong>Téléphone :</strong> ${telephone || '—'}</p>
            ${societe_data?.nom ? `<p><strong>Société :</strong> ${societe_data.nom} (BRN ${societe_data.brn || 'n/a'})</p>` : ''}
            ${cabinet_data?.nom_cabinet ? `<p><strong>Cabinet :</strong> ${cabinet_data.nom_cabinet}</p>` : ''}
            ${planNom ? `<p><strong>Plan choisi :</strong> ${planNom} (${periodicite})</p>` : ''}
            ${message ? `<p><strong>Message :</strong><br>${message.replace(/\n/g, '<br>')}</p>` : ''}
            <p style="margin-top:24px">
              <a href="${baseUrl}/admin/demandes-inscription" style="background:#0B0F2E;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">
                Voir dans Lexora Admin
              </a>
            </p>
          </div>
        `,
      )
    }

    return NextResponse.json({
      ok: true,
      demande_id: demande.id,
      message: 'Demande enregistrée. Vous recevrez un email de confirmation et nous reviendrons vers vous sous 24-48h.',
    })
  } catch (e: any) {
    console.error('[inscription POST] exception', e)
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
