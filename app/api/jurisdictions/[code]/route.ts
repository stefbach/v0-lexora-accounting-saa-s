import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const upperCode = code.toUpperCase()

  // Validate code
  const validCodes = ['MU', 'SN', 'CI', 'ML', 'BF', 'NE', 'BJ', 'TG', 'GW',
                      'CM', 'GA', 'CG', 'TD', 'CF', 'GQ', 'KM', 'CD', 'GN']

  if (!validCodes.includes(upperCode)) {
    return NextResponse.json({ error: 'Jurisdiction not found' }, { status: 404 })
  }

  // Try to dynamically load tax + payroll configs
  let taxConfig = null
  let payrollConfig = null

  try {
    // Map to folder name
    const folderMap: Record<string, string> = {
      'SN': 'senegal', 'CI': 'ivory-coast', 'ML': 'mali', 'BF': 'burkina-faso',
      'NE': 'niger', 'BJ': 'benin', 'TG': 'togo', 'GW': 'guinea-bissau',
      'CM': 'cameroon', 'GA': 'gabon', 'CG': 'congo', 'TD': 'chad',
      'CF': 'central-african-republic', 'GQ': 'equatorial-guinea',
      'KM': 'comoros', 'CD': 'drc', 'GN': 'guinea'
    }

    const folder = folderMap[upperCode]
    if (folder) {
      try {
        const taxMod = await import(`@/lib/jurisdictions/ohada/countries/${folder}/tax-config`)
        taxConfig = Object.values(taxMod)[0]
      } catch { /* noop */ }
      try {
        const payMod = await import(`@/lib/jurisdictions/ohada/countries/${folder}/payroll-config`)
        payrollConfig = Object.values(payMod)[0]
      } catch { /* noop */ }
    }
  } catch (e) {
    // Config not found, return basic info only
  }

  return NextResponse.json({
    code: upperCode,
    tax: taxConfig,
    payroll: payrollConfig,
  })
}
