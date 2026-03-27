import { NextResponse } from 'next/server'
import { getTauxChange } from '@/lib/taux-change'

export const dynamic = 'force-dynamic'

// GET — Return current exchange rates
export async function GET() {
  try {
    const rates = await getTauxChange()
    return NextResponse.json({ rates })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
