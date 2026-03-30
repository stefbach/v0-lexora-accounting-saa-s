import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Clé API Anthropic non configurée' }, { status: 500 })

    const anthropic = new Anthropic({ apiKey })

    const currentYear = new Date().getFullYear()
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `Tu es un expert fiscal mauricien. Donne-moi les taux en vigueur pour l'année fiscale ${currentYear}/${currentYear + 1} à Maurice.

Réponds UNIQUEMENT en JSON valide, sans aucun texte avant ou après. Le format exact:
{
  "csg_seuil_taux_reduit": 50000,
  "csg_salarie_taux_reduit": 0.015,
  "csg_salarie_taux_plein": 0.03,
  "csg_patronal": 0.06,
  "nsf_salarie": 0.015,
  "nsf_patronal": 0.025,
  "training_levy": 0.01,
  "prgf_taux": 0.045,
  "paye_seuil_exoneration": 390000,
  "paye_taux_1": 0.10,
  "paye_seuil_taux_2": 650000,
  "paye_taux_2": 0.15,
  "salary_compensation": 635,
  "jours_feries": [
    {"date": "${currentYear}-01-01", "label": "Jour de l'An"},
    {"date": "${currentYear}-01-02", "label": "Jour de l'An (suite)"}
  ],
  "source": "Finance Act ${currentYear}/${currentYear + 1}",
  "notes": "Résumé des changements éventuels"
}

IMPORTANT:
- CSG: contribution sociale généralisée (salarié taux réduit si brut ≤ seuil, taux plein sinon; patronal fixe)
- NSF: National Savings Fund
- Training Levy: HRDC
- PRGF: Portable Retirement Gratuity Fund — c'est un % du salaire brut (pas un montant fixe par jour)
- PAYE: Pay As You Earn (barème progressif annuel)
- Salary Compensation: montant fixe annuel
- Inclus TOUS les jours fériés officiels de Maurice pour ${currentYear}
- Valeurs en MUR sauf les taux qui sont des décimales (ex: 0.015 = 1.5%)
- Si tu n'es pas sûr d'un taux, utilise la dernière valeur connue`
      }]
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''

    // Parse JSON — handle potential markdown wrapping
    let rates
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found')
      rates = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Réponse IA non parseable', raw: text }, { status: 500 })
    }

    return NextResponse.json({
      rates,
      updated_at: new Date().toISOString(),
      model: 'claude-sonnet-4-20250514',
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur IA' }, { status: 500 })
  }
}
