import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { nom, email, entreprise, telephone, message } = await request.json()

    if (!nom || !email || !message) {
      return NextResponse.json(
        { error: 'Nom, email et message sont requis.' },
        { status: 400 }
      )
    }

    // Save to Supabase
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (url && serviceKey) {
      const supabase = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      })

      const { error: dbError } = await supabase
        .from('contact_messages')
        .insert({
          nom,
          email,
          entreprise: entreprise || null,
          telephone: telephone || null,
          message,
        })

      if (dbError) {
        console.error('Error saving contact message:', dbError)
        // Don't fail — still return success to the user
      }
    }

    // Optional: send WhatsApp notification via WATI
    const watiUrl = process.env.WATI_API_URL
    const watiKey = process.env.WATI_API_KEY
    const adminPhone = process.env.ADMIN_WHATSAPP_PHONE

    if (watiUrl && watiKey && adminPhone) {
      try {
        await fetch(`${watiUrl}/api/v1/sendSessionMessage/${adminPhone}`, {
          method: 'POST',
          headers: {
            'Authorization': watiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messageText: `Nouveau contact Lexora\nNom : ${nom}\nEmail : ${email}\nEntreprise : ${entreprise || '-'}\nMessage : ${message.substring(0, 200)}`,
          }),
        })
      } catch {
        // Non-blocking — don't fail if WhatsApp notification fails
      }
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('Contact form error:', e)
    return NextResponse.json(
      { error: "Erreur lors de l'envoi du message." },
      { status: 500 }
    )
  }
}
