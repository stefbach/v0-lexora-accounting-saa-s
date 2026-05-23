import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

interface RequestBody {
  societeId: string
  jurisdictionCode: string
  periodStart: string  // ISO date
  periodEnd: string
  comparativePeriodStart?: string
  comparativePeriodEnd?: string
  statementType: 'bilan' | 'compte-resultat' | 'tafire' | 'notes' | 'all'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as RequestBody

    if (!body.societeId || !body.jurisdictionCode || !body.periodStart || !body.periodEnd) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Validate OHADA jurisdiction
    const ohadaCodes = ['SN', 'CI', 'ML', 'BF', 'NE', 'BJ', 'TG', 'GW', 'CM', 'GA', 'CG', 'TD', 'CF', 'GQ', 'KM', 'CD', 'GN']
    if (!ohadaCodes.includes(body.jurisdictionCode)) {
      return NextResponse.json({ error: 'Not an OHADA jurisdiction' }, { status: 400 })
    }

    const input = {
      societeId: body.societeId,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      comparativePeriodStart: body.comparativePeriodStart ? new Date(body.comparativePeriodStart) : undefined,
      comparativePeriodEnd: body.comparativePeriodEnd ? new Date(body.comparativePeriodEnd) : undefined,
    }

    // Mock account balances getter - in production this would query Supabase
    const mockGetBalances = async (accountCodes: string[]): Promise<Map<string, number>> => {
      const balances = new Map<string, number>()
      // Return zero balances for all accounts - real impl would query DB
      for (const code of accountCodes) {
        balances.set(code, 0)
      }
      return balances
    }

    const result: any = { jurisdictionCode: body.jurisdictionCode, period: { start: body.periodStart, end: body.periodEnd } }

    if (body.statementType === 'bilan' || body.statementType === 'all') {
      try {
        const { generateBilan } = await import('@/lib/jurisdictions/ohada/statements/bilan')
        result.bilan = await generateBilan(input, mockGetBalances)
      } catch (e) {
        result.bilan = { error: String(e) }
      }
    }

    if (body.statementType === 'compte-resultat' || body.statementType === 'all') {
      try {
        const { generateCompteDeResultat } = await import('@/lib/jurisdictions/ohada/statements/compte-resultat')
        result.compteResultat = await generateCompteDeResultat(input, mockGetBalances)
      } catch (e) {
        result.compteResultat = { error: String(e) }
      }
    }

    if (body.statementType === 'tafire' || body.statementType === 'all') {
      try {
        const { generateTAFIRE } = await import('@/lib/jurisdictions/ohada/statements/tafire')
        const mockPriorBalances = mockGetBalances
        result.tafire = await generateTAFIRE(input, mockGetBalances, mockPriorBalances)
      } catch (e) {
        result.tafire = { error: String(e) }
      }
    }

    if (body.statementType === 'notes' || body.statementType === 'all') {
      try {
        const { generateNotesAnnexes } = await import('@/lib/jurisdictions/ohada/statements/notes-annexes')
        result.notes = await generateNotesAnnexes(input)
      } catch (e) {
        result.notes = { error: String(e) }
      }
    }

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Internal error' }, { status: 500 })
  }
}
