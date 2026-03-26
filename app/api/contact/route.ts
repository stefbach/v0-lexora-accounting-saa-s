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

    const RESEND_API_KEY = process.env.RESEND_API_KEY
    const RECIPIENT = 'megane-quenette@obesity-care-clinic.com'

    if (RESEND_API_KEY) {
      // Send via Resend
      const { Resend } = await import('resend')
      const resend = new Resend(RESEND_API_KEY)

      await resend.emails.send({
        from: 'Lexora Contact <onboarding@resend.dev>',
        to: RECIPIENT,
        subject: `[Lexora Contact] ${nom}${entreprise ? ` — ${entreprise}` : ''}`,
        text: `Nouveau message de contact Lexora\n\n` +
          `Nom : ${nom}\n` +
          `Email : ${email}\n` +
          `Entreprise : ${entreprise || 'Non renseignée'}\n` +
          `Téléphone : ${telephone || 'Non renseigné'}\n\n` +
          `Message :\n${message}\n\n` +
          `---\nEnvoyé depuis le formulaire de contact Lexora`,
        replyTo: email,
      })
    } else {
      // Fallback: log to console if Resend not configured
      console.log('📬 Contact form submission (Resend not configured):')
      console.log({ nom, email, entreprise, telephone, message })
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    console.error('Contact form error:', e)
    return NextResponse.json(
      { error: 'Erreur lors de l\'envoi du message.' },
      { status: 500 }
    )
  }
}
