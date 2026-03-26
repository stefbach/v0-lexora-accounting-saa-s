import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export interface NotificationParams {
  destinataire_id: string
  destinataire_type: 'client' | 'comptable'
  societe_id?: string
  type: string
  titre: string
  message: string
  niveau?: 'critique' | 'important' | 'info'
  canaux?: ('app' | 'whatsapp' | 'email')[]
  cron_name?: string
}

export async function envoyerNotification(params: NotificationParams): Promise<void> {
  const { destinataire_id, destinataire_type, societe_id, type, titre, message, niveau = 'info', canaux = ['app'], cron_name } = params
  const supabase = getServiceClient()

  // 1. Always create in-app notification
  await supabase.from('notifications').insert({
    destinataire_id, destinataire_type, societe_id, type, titre, message, niveau,
    envoye_app: true, cron_name,
  })

  if (canaux.length <= 1) return

  // Get contact info
  const { data: profile } = await supabase.from('profiles').select('email, phone').eq('id', destinataire_id).single()
  if (!profile) return

  // 2. WhatsApp via WATI
  if (canaux.includes('whatsapp') && profile.phone) {
    const watiUrl = process.env.WATI_API_URL
    const watiKey = process.env.WATI_API_KEY
    if (watiUrl && watiKey) {
      try {
        await fetch(`${watiUrl}/api/v1/sendSessionMessage/${profile.phone}`, {
          method: 'POST',
          headers: { Authorization: watiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageText: message }),
        })
      } catch (err) { console.error('[notifications] WATI error:', err) }
    }
  }

  // 3. Email via Resend
  if (canaux.includes('email') && profile.email) {
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      try {
        const { Resend } = await import('resend')
        const resend = new Resend(resendKey)
        await resend.emails.send({
          from: 'Lexora <onboarding@resend.dev>',
          to: profile.email,
          subject: titre,
          html: `<p>${message}</p>`,
        })
      } catch (err) { console.error('[notifications] Resend error:', err) }
    }
  }
}
