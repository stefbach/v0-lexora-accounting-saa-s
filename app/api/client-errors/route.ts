import { NextResponse } from 'next/server'

/**
 * Télémétrie d'erreurs CLIENT → log SERVEUR.
 *
 * Un crash React/JS qui se produit dans le navigateur n'apparaît jamais
 * dans les logs Vercel (Vercel ne capte que le code serveur). Cette route
 * reçoit l'erreur depuis le navigateur et la ré-émet via console.error :
 * elle devient alors un log serveur, consultable dans le dashboard Vercel
 * (« runtime logs / errors »), taggé [client-error] pour filtrage.
 *
 * Volontairement sans écriture DB (aucune table, aucun DDL) et sans auth
 * stricte : une erreur peut survenir avant/pendant l'authentification.
 * La charge utile est bornée pour éviter tout abus.
 */
export const dynamic = 'force-dynamic'

const MAX = 4000 // borne anti-abus par champ

function clip(v: unknown, max = MAX): string {
  if (v == null) return ''
  const s = typeof v === 'string' ? v : (() => { try { return JSON.stringify(v) } catch { return String(v) } })()
  return s.length > max ? s.slice(0, max) + '…[tronqué]' : s
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const payload = {
      scope: clip((body as any).scope || 'unknown', 60),
      message: clip((body as any).message),
      stack: clip((body as any).stack),
      source: clip((body as any).source, 500),
      url: clip((body as any).url, 500),
      ua: clip((body as any).ua, 300),
      employe_id: clip((body as any).employe_id, 60),
      at: new Date().toISOString(),
    }
    // Ce console.error remonte dans les logs serveur Vercel.
    console.error('[client-error]', JSON.stringify(payload))
    return NextResponse.json({ ok: true })
  } catch {
    // On n'échoue jamais bruyamment : la télémétrie ne doit pas casser l'app.
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
