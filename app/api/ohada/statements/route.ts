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

    // Mocks par signature — chaque générateur SYSCOHADA a sa propre forme
    // de fonction de lecture de soldes. En prod ces 3 mocks seront remplacés
    // par des requêtes Supabase (planifié S2-S3).

    // bilan.ts : (codes: string[]) => Promise<Map<string, number>>
    const mockGetBalancesByCodes = async (accountCodes: string[]): Promise<Map<string, number>> => {
      const balances = new Map<string, number>()
      for (const code of accountCodes) balances.set(code, 0)
      return balances
    }

    // compte-resultat.ts : (societeId, accountPrefixes: string[], start, end) => Promise<number>
    const mockGetBalancesByPrefixes = async (
      _societeId: string,
      _accountPrefixes: string[],
      _periodStart: Date,
      _periodEnd: Date,
    ): Promise<number> => 0

    // tafire.ts : (societeId, accountPrefix: string, start, end) => Promise<number>
    const mockGetBalanceByPrefix = async (
      _societeId: string,
      _accountPrefix: string,
      _periodStart: Date,
      _periodEnd: Date,
    ): Promise<number> => 0

    const result: any = { jurisdictionCode: body.jurisdictionCode, period: { start: body.periodStart, end: body.periodEnd } }

    if (body.statementType === 'bilan' || body.statementType === 'all') {
      try {
        const { generateBilan } = await import('@/lib/jurisdictions/ohada/statements/bilan')
        result.bilan = await generateBilan(input, mockGetBalancesByCodes)
      } catch (e) {
        result.bilan = { error: String(e) }
      }
    }

    if (body.statementType === 'compte-resultat' || body.statementType === 'all') {
      try {
        const { generateCompteDeResultat } = await import('@/lib/jurisdictions/ohada/statements/compte-resultat')
        result.compteResultat = await generateCompteDeResultat(input, mockGetBalancesByPrefixes)
      } catch (e) {
        result.compteResultat = { error: String(e) }
      }
    }

    if (body.statementType === 'tafire' || body.statementType === 'all') {
      try {
        const { generateTAFIRE } = await import('@/lib/jurisdictions/ohada/statements/tafire')
        result.tafire = await generateTAFIRE(input, mockGetBalanceByPrefix, mockGetBalanceByPrefix)
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
