import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { convertWithLiveRate } from '@/lib/forex/real-time-rates'
import { getHistoricalRate } from '@/lib/forex/historical-rates'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { amount: number; from: string; to: string; date?: string }

    if (typeof body.amount !== 'number' || !body.from || !body.to) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    if (body.date) {
      const rate = await getHistoricalRate({
        base: body.from,
        quote: body.to,
        date: new Date(body.date)
      })
      return NextResponse.json({
        amount: body.amount * rate.rate,
        rate,
        date: body.date,
        historical: true
      })
    }

    const result = await convertWithLiveRate(body.amount, body.from, body.to)
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Conversion error' }, { status: 500 })
  }
}
