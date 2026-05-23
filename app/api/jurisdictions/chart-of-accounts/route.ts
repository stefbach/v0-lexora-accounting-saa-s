import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const framework = req.nextUrl.searchParams.get('framework') ?? 'SYSCOHADA'

  if (framework !== 'SYSCOHADA' && framework !== 'PCM') {
    return NextResponse.json({ error: 'Unknown framework' }, { status: 400 })
  }

  if (framework === 'SYSCOHADA') {
    try {
      const { ALL_OHADA_ACCOUNTS, SYSCOHADA_CLASSES } = await import('@/lib/jurisdictions/ohada/chart-of-accounts')
      return NextResponse.json({
        framework,
        classes: SYSCOHADA_CLASSES,
        accounts: ALL_OHADA_ACCOUNTS,
        count: ALL_OHADA_ACCOUNTS.length
      })
    } catch (e) {
      return NextResponse.json({
        framework,
        error: 'Chart of accounts not yet built',
        message: String(e)
      }, { status: 503 })
    }
  }

  return NextResponse.json({ framework, message: 'PCM Mauritius - use existing endpoints' })
}
