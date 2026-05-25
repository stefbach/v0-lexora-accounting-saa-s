import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Configuration Supabase manquante')
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

async function sendWhatsApp(phone: string, message: string) {
  const apiUrl = process.env.WATI_API_URL
  const apiKey = process.env.WATI_API_KEY

  if (!apiUrl || !apiKey) {
    throw new Error('Configuration WATI manquante. Veuillez définir WATI_API_URL et WATI_API_KEY.')
  }

  const response = await fetch(`${apiUrl}/api/v1/sendSessionMessage/${phone}`, {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messageText: message }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Erreur WATI (${response.status}): ${errorBody}`)
  }

  return response.json()
}

async function sendEmail(to: string, subject: string, message: string) {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    throw new Error('Configuration Resend manquante. Veuillez définir RESEND_API_KEY.')
  }

  const resend = new Resend(apiKey)

  const { data, error } = await resend.emails.send({
    from: 'Lexora <notifications@lexora.mu>',
    to,
    subject,
    text: message,
  })

  if (error) {
    throw new Error(`Erreur Resend: ${error.message}`)
  }

  return data
}

export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { destinataire_id, type, message, sujet } = body

    if (!destinataire_id || !type || !message) {
      return NextResponse.json(
        { error: 'Les champs destinataire_id, type et message sont requis.' },
        { status: 400 }
      )
    }

    if (type !== 'whatsapp' && type !== 'email') {
      return NextResponse.json(
        { error: 'Le type doit être "whatsapp" ou "email".' },
        { status: 400 }
      )
    }

    if (type === 'email' && !sujet) {
      return NextResponse.json(
        { error: 'Le champ sujet est requis pour les notifications par email.' },
        { status: 400 }
      )
    }

    const supabase = getServiceClient()

    // Fetch the recipient's profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, phone')
      .eq('id', destinataire_id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Destinataire introuvable.' },
        { status: 404 }
      )
    }

    let statut: 'sent' | 'failed' = 'sent'
    let errorMessage: string | null = null

    try {
      if (type === 'whatsapp') {
        if (!profile.phone) {
          throw new Error('Le destinataire n\'a pas de numéro de téléphone enregistré.')
        }
        await sendWhatsApp(profile.phone, message)
      } else {
        if (!profile.email) {
          throw new Error('Le destinataire n\'a pas d\'adresse email enregistrée.')
        }
        await sendEmail(profile.email, sujet, message)
      }
    } catch (sendError: unknown) {
      statut = 'failed'
      errorMessage = sendError instanceof Error ? sendError.message : 'Erreur inconnue lors de l\'envoi'
    }

    // Save notification to database
    const { data: notification, error: insertError } = await supabase
      .from('notifications')
      .insert({
        destinataire_id,
        type,
        message,
        statut,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json(
        { error: `Notification ${statut === 'sent' ? 'envoyée' : 'échouée'} mais erreur lors de l'enregistrement: ${insertError.message}` },
        { status: 500 }
      )
    }

    if (statut === 'failed') {
      return NextResponse.json(
        { error: errorMessage, notification },
        { status: 502 }
      )
    }

    return NextResponse.json({ notification })
  } catch (e: any) {
    const message = e instanceof Error ? e.message : 'Erreur interne du serveur'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
