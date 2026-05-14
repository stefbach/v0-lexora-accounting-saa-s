/**
 * CRS / FATCA helpers — OECD CRS + US-Mauritius IGA Model 1A.
 */

export type HolderType = 'individual' | 'entity' | 'controlling_person'
export type SubmissionType = 'crs' | 'fatca' | 'combined'

export const REPORTING_DEADLINE = '07-31'  // 31 juillet de l'année N+1
export const FATCA_USD_THRESHOLD_INDIVIDUAL = 50_000
export const FATCA_USD_THRESHOLD_ENTITY = 250_000

export function isFatcaReportable(holderType: HolderType, balanceUsd: number, isUSPerson: boolean): boolean {
  if (!isUSPerson) return false
  if (holderType === 'individual' || holderType === 'controlling_person') return balanceUsd >= FATCA_USD_THRESHOLD_INDIVIDUAL
  return balanceUsd >= FATCA_USD_THRESHOLD_ENTITY
}

/** Liste non-exhaustive des juridictions CRS reportables (mise à jour OECD). */
export const CRS_REPORTABLE_JURISDICTIONS = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
  'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','GB',
  'AU','CA','CH','JP','KR','SG','HK','AE','SA','BR','MX','ZA','IN',
])

export function isCrsReportable(countryOfResidence: string): boolean {
  return CRS_REPORTABLE_JURISDICTIONS.has(countryOfResidence.toUpperCase())
}

/** Génère le XML CRS schema 2.0 simplifié (squelette — production-grade XML
 *  requires full schema compliance with namespaces, signatures, etc.). */
export function generateCrsXmlSkeleton(opts: {
  reportingYear: number
  societeName: string
  societeTin: string
  holders: Array<{
    holderName: string; countryOfResidence: string; tin?: string;
    accountNumber: string; balanceUsd: number; interestUsd?: number;
    dividendsUsd?: number; grossProceedsUsd?: number;
  }>
}): string {
  const acctRecords = opts.holders.map((h, idx) => `
    <crs:AccountReport>
      <crs:DocSpec><stf:DocTypeIndic>OECD1</stf:DocTypeIndic><stf:DocRefId>${opts.societeTin}-${idx + 1}-${opts.reportingYear}</stf:DocRefId></crs:DocSpec>
      <crs:AccountNumber>${h.accountNumber}</crs:AccountNumber>
      <crs:AccountHolder>
        <crs:Individual><crs:ResCountryCode>${h.countryOfResidence}</crs:ResCountryCode><crs:TIN>${h.tin || ''}</crs:TIN><crs:Name>${h.holderName}</crs:Name></crs:Individual>
      </crs:AccountHolder>
      <crs:AccountBalance currCode="USD">${h.balanceUsd.toFixed(2)}</crs:AccountBalance>
      ${h.interestUsd ? `<crs:Payment><crs:Type>CRS502</crs:Type><crs:PaymentAmnt currCode="USD">${h.interestUsd.toFixed(2)}</crs:PaymentAmnt></crs:Payment>` : ''}
      ${h.dividendsUsd ? `<crs:Payment><crs:Type>CRS501</crs:Type><crs:PaymentAmnt currCode="USD">${h.dividendsUsd.toFixed(2)}</crs:PaymentAmnt></crs:Payment>` : ''}
      ${h.grossProceedsUsd ? `<crs:Payment><crs:Type>CRS503</crs:Type><crs:PaymentAmnt currCode="USD">${h.grossProceedsUsd.toFixed(2)}</crs:PaymentAmnt></crs:Payment>` : ''}
    </crs:AccountReport>`).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<crs:CRS_OECD version="2.0" xmlns:crs="urn:oecd:ties:crs:v2" xmlns:stf="urn:oecd:ties:stf:v5">
  <crs:MessageSpec>
    <crs:SendingCompanyIN>${opts.societeTin}</crs:SendingCompanyIN>
    <crs:TransmittingCountry>MU</crs:TransmittingCountry>
    <crs:ReceivingCountry>MU</crs:ReceivingCountry>
    <crs:MessageType>CRS</crs:MessageType>
    <crs:ReportingPeriod>${opts.reportingYear}-12-31</crs:ReportingPeriod>
  </crs:MessageSpec>
  <crs:CrsBody>
    <crs:ReportingFI><crs:Name>${opts.societeName}</crs:Name><crs:IN>${opts.societeTin}</crs:IN></crs:ReportingFI>
    <crs:ReportingGroup>${acctRecords}</crs:ReportingGroup>
  </crs:CrsBody>
</crs:CRS_OECD>`
}
