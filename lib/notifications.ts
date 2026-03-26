import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface NotificationParams {
  destinataire_id?: string
  destinataire_type: 'client' | 'comptable'
  societe_id?: string
  type: string
  titre: string
  message: string
  niveau?: 'critique' | 'important' | 'info'
  canaux?: ('app' | 'whatsapp' | 'email')[]
  cron_name?: string
  telephone?: string
  email?: string
}

export async function envoyerNotification(params: NotificationParams) {
  const supabase = getSupabase()
  const canaux = params.canaux || ['app']

  // 1. Always create in-app notification
  const { data: notif } = await supabase.from('notifications').insert({
    destinataire_id: params.destinataire_id,
    destinataire_type: params.destinataire_type,
    societe_id: params.societe_id,
    type: params.type,
    titre: params.titre,
    message: params.message,
    niveau: params.niveau || 'info',
    envoye_app: true,
    envoye_whatsapp: canaux.includes('whatsapp'),
    envoye_email: canaux.includes('email'),
    cron_name: params.cron_name,
  }).select().single()

  // 2. WhatsApp via WATI
  if (canaux.includes('whatsapp') && params.telephone && process.env.WATI_API_URL && process.env.WATI_API_KEY) {
    try {
      await fetch(`${process.env.WATI_API_URL}/api/v1/sendSessionMessage/${params.telephone.replace(/\s+/g, '')}`, {
        method: 'POST',
        headers: { Authorization: process.env.WATI_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageText: `${params.titre}\n\n${params.message}` }),
      })
    } catch (e) {
      console.error('WhatsApp notification failed:', e)
    }
  }

  // 3. Email via Resend
  if (canaux.includes('email') && params.email && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Lexora <onboarding@resend.dev>',
        to: params.email,
        subject: params.titre,
        text: params.message,
      })
    } catch (e) {
      console.error('Email notification failed:', e)
    }
  }

  return notif
}
