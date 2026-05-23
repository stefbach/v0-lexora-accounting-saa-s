import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

interface PayrollRequest {
  jurisdictionCode: string  // SN, CI, CM, etc.
  employeeId: string
  period: { year: number; month: number }
  grossSalary: number
  benefits?: number
  bonuses?: number
  overtimeHours?: number
  familyDependents?: number
  isExpat?: boolean
}

const FOLDER_MAP: Record<string, string> = {
  'SN': 'senegal', 'CI': 'ivory-coast', 'ML': 'mali', 'BF': 'burkina-faso',
  'NE': 'niger', 'BJ': 'benin', 'TG': 'togo', 'GW': 'guinea-bissau',
  'CM': 'cameroon', 'GA': 'gabon', 'CG': 'congo', 'TD': 'chad',
  'CF': 'central-african-republic', 'GQ': 'equatorial-guinea',
  'KM': 'comoros', 'CD': 'drc', 'GN': 'guinea'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as PayrollRequest

    if (!body.jurisdictionCode || !body.employeeId || !body.grossSalary) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const folder = FOLDER_MAP[body.jurisdictionCode]
    if (!folder) {
      return NextResponse.json({ error: 'Jurisdiction not supported' }, { status: 400 })
    }

    try {
      const configMod = await import(`@/lib/jurisdictions/ohada/countries/${folder}/payroll-config`)
      const config = Object.values(configMod)[0] as any

      const { BaseOhadaPayrollEngine } = await import('@/lib/jurisdictions/ohada/payroll/base-payroll-engine')

      class DynamicEngine extends BaseOhadaPayrollEngine {
        get jurisdiction() { return body.jurisdictionCode as any }
      }

      const engine = new DynamicEngine(config)
      const payslip = engine.calculatePayslip({
        employeeId: body.employeeId,
        period: body.period,
        grossSalary: body.grossSalary,
        benefits: body.benefits ?? 0,
        bonuses: body.bonuses ?? 0,
        overtimeHours: body.overtimeHours ?? 0,
        familyDependents: body.familyDependents ?? 0,
        isExpat: body.isExpat ?? false,
      })

      return NextResponse.json({ jurisdictionCode: body.jurisdictionCode, payslip })
    } catch (e: any) {
      return NextResponse.json({ error: 'Payroll calculation failed', detail: e?.message }, { status: 500 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Internal error' }, { status: 500 })
  }
}
