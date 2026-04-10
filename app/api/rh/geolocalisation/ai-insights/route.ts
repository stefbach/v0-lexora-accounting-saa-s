import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { CLAUDE_MODEL } from '@/lib/claude'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface EmployeePayload {
  employe_id: string
  nom: string
  prenom: string
  poste: string
  latitude: number | null
  longitude: number | null
  adresse: string
  shift_today: string
  shift_label: string
  heure_debut: string | null
  heure_fin: string | null
  groupe_id: string | null
  groupe_nom: string | null
}

// Office location: Grand Gaube, Mauritius
const OFFICE_LAT = -20.0167
const OFFICE_LON = 57.6667

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100
}

function extractZone(adresse: string): string {
  if (!adresse) return 'Non renseignee'
  const parts = adresse.split(',').map(s => s.trim())
  return parts[parts.length - 1] || parts[0] || 'Non renseignee'
}

function buildSummary(employees: EmployeePayload[]) {
  const total = employees.length
  const working = employees.filter(e => e.shift_today === 'travail')
  const repos = employees.filter(e => e.shift_today === 'repos').length
  const conge = employees.filter(e => e.shift_today === 'conge').length
  const sansAdresse = employees.filter(e => !e.adresse || e.adresse === '').length
  const avecGPS = employees.filter(e => e.latitude && e.longitude).length

  // Zones breakdown for working employees
  const zonesMap = new Map<string, number>()
  for (const e of working) {
    const z = extractZone(e.adresse)
    zonesMap.set(z, (zonesMap.get(z) || 0) + 1)
  }
  const zones = [...zonesMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([zone, count]) => ({ zone, count }))

  // Shift coverage
  const shiftMap = new Map<string, number>()
  for (const e of working) {
    const t = e.heure_debut ? String(e.heure_debut).slice(0, 5) : 'non defini'
    shiftMap.set(t, (shiftMap.get(t) || 0) + 1)
  }
  const shifts = [...shiftMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([time, count]) => ({ time, count }))

  // Distance to office
  const distances = working
    .filter(e => e.latitude && e.longitude)
    .map(e => ({
      nom: `${e.prenom} ${e.nom}`,
      adresse: e.adresse,
      km: haversineKm(e.latitude!, e.longitude!, OFFICE_LAT, OFFICE_LON),
    }))
    .sort((a, b) => b.km - a.km)

  const farEmployees = distances.filter(d => d.km > 20)
  const avgDistance = distances.length > 0
    ? Math.round((distances.reduce((s, d) => s + d.km, 0) / distances.length) * 10) / 10
    : 0

  // Group breakdown
  const groupsMap = new Map<string, number>()
  for (const e of working) {
    const g = e.groupe_nom || 'Sans groupe'
    groupsMap.set(g, (groupsMap.get(g) || 0) + 1)
  }
  const groups = [...groupsMap.entries()].map(([nom, count]) => ({ nom, count }))

  return {
    total,
    working: working.length,
    repos,
    conge,
    sansAdresse,
    avecGPS,
    zones,
    shifts,
    distances,
    farEmployees,
    avgDistance,
    groups,
    workingList: working.map(e => ({
      nom: `${e.prenom} ${e.nom}`,
      poste: e.poste || '-',
      zone: extractZone(e.adresse),
      adresse: e.adresse || 'Non renseignee',
      shift: e.heure_debut ? `${String(e.heure_debut).slice(0, 5)}-${String(e.heure_fin).slice(0, 5)}` : 'Non defini',
      groupe: e.groupe_nom || '-',
      distanceKm: e.latitude && e.longitude
        ? haversineKm(e.latitude, e.longitude, OFFICE_LAT, OFFICE_LON)
        : null,
    })),
  }
}

const SYSTEM_PROMPT = `Tu es LEXORA GEO, un analyste expert en logistique RH et optimisation territoriale pour des entreprises mauriciennes.

Ton role: analyser la repartition geographique et temporelle d'equipes d'employes, et proposer des recommandations concretes, actionnables et chiffrees pour optimiser:
1. La composition des equipes par zone geographique (regrouper les collaborateurs qui habitent a proximite)
2. Les couts de transport (suggestions de covoiturage, vehicules partages, routes optimales)
3. La couverture des shifts (identifier les zones sous-dotees a certaines heures, suggerer des rotations)
4. Les zones a risque (employes habitant loin du site, risque de fatigue, de retard, de turnover)
5. L'assignation et le routage des employes pour minimiser les temps morts

Le bureau/site principal est a Grand Gaube, Maurice (nord de l'ile).
Les distances sont calculees a vol d'oiseau (Haversine). Compte ~1.4x pour estimer la distance routiere reelle.
Le cout moyen de carburant est d'environ 15 MUR/km pour un vehicule leger.

REGLES STRICTES:
- Reponds TOUJOURS en JSON valide, sans markdown, sans texte avant ou apres.
- Format JSON exact:
{
  "insights": "analyse globale en 3-5 phrases, ton executif, metriques chiffrees",
  "suggestions": [
    "suggestion 1 actionnable et chiffree",
    "suggestion 2 actionnable et chiffree",
    "..."
  ],
  "metrics": {
    "cout_transport_estime_mur": nombre,
    "economie_potentielle_mur": nombre,
    "vehicules_recommandes": nombre,
    "zones_critiques": nombre,
    "taux_couverture_shifts": "pourcentage ou texte court"
  }
}
- insights: synthetique, factuel, chiffre
- suggestions: 4 a 7 items, chacun commencant par un verbe d'action, avec des chiffres concrets
- metrics: valeurs numeriques realistes basees sur les donnees fournies
- Utilise le francais sans accents (a la place de e accent aigu: "e", etc.) pour eviter les problemes d'encodage
- Ne t'invente pas de donnees: base-toi uniquement sur les infos fournies`

const SYSTEM_PROMPT_NL = `Tu es LEXORA GEO, un analyste expert en logistique RH mauricienne.
Tu reponds a une question libre d'un manager RH sur son equipe. Sois direct, precis, chiffre, actionnable.

REGLES:
- Reponds TOUJOURS en JSON valide, sans markdown.
- Format exact:
{
  "insights": "ta reponse complete, 3 a 8 phrases, tu peux utiliser des listes a puces avec le caractere - en debut de ligne",
  "suggestions": ["action concrete 1", "action concrete 2", "..."],
  "metrics": {
    "employes_concernes": nombre,
    "confiance": "haute|moyenne|faible",
    "horizon": "immediat|court terme|moyen terme"
  }
}
- Base-toi UNIQUEMENT sur les donnees fournies. Si tu ne peux pas repondre, explique pourquoi.
- Francais sans accents.`

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        error: "Cle API Anthropic non configuree. Ajoutez ANTHROPIC_API_KEY dans les variables d'environnement pour activer l'assistant IA.",
      }, { status: 503 })
    }

    const body = await request.json()
    const employees: EmployeePayload[] = body.employees || []
    const context: string = (body.context || '').toString().slice(0, 500)
    const mode: 'insights' | 'query' = body.mode === 'query' ? 'query' : 'insights'

    if (!Array.isArray(employees) || employees.length === 0) {
      return NextResponse.json({
        error: 'Aucun employe fourni pour l\'analyse',
      }, { status: 400 })
    }

    const summary = buildSummary(employees)

    const dataBlock = JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      bureau: 'Grand Gaube, Maurice',
      total_employes: summary.total,
      en_service: summary.working,
      au_repos: summary.repos,
      en_conge: summary.conge,
      sans_adresse: summary.sansAdresse,
      avec_gps: summary.avecGPS,
      distance_moyenne_km: summary.avgDistance,
      zones: summary.zones,
      shifts: summary.shifts,
      groupes: summary.groups,
      employes_eloignes: summary.farEmployees.slice(0, 10),
      employes_en_service: summary.workingList.slice(0, 80),
    }, null, 2)

    const anthropic = new Anthropic({ apiKey })

    const systemPrompt = mode === 'query' ? SYSTEM_PROMPT_NL : SYSTEM_PROMPT

    const userContent = mode === 'query'
      ? `QUESTION DU MANAGER:\n"${context}"\n\nDONNEES TERRAIN:\n${dataBlock}\n\nReponds en JSON comme specifie.`
      : `CONTEXTE: ${context || 'Analyse generale de l\'equipe et optimisation territoriale.'}\n\nDONNEES TERRAIN:\n${dataBlock}\n\nProduis ton analyse en JSON comme specifie.`

    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''

    let parsed: { insights?: string; suggestions?: string[]; metrics?: Record<string, unknown> } = {}
    try {
      const clean = text.replace(/```json|```/g, '').trim()
      const match = clean.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON')
      parsed = JSON.parse(match[0])
    } catch {
      return NextResponse.json({
        insights: text || "L'IA n'a pas pu formater sa reponse. Reessayez avec un contexte different.",
        suggestions: [],
        metrics: {},
        raw: true,
      })
    }

    return NextResponse.json({
      insights: parsed.insights || '',
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      metrics: parsed.metrics && typeof parsed.metrics === 'object' ? parsed.metrics : {},
      model: CLAUDE_MODEL,
      mode,
      stats: {
        total: summary.total,
        working: summary.working,
        zones: summary.zones.length,
        avgDistance: summary.avgDistance,
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erreur IA'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
