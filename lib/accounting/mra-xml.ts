/**
 * Générateurs XML pour MRA e-Services (upload portail).
 * Schémas simplifiés — à valider contre les XSD officiels MRA selon le module.
 */

const escape = (s: string | null | undefined) => String(s || '').replace(/[<>&'"]/g, c =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' } as any)[c])

export function generateVatReturnXml(opts: {
  societe_brn: string; societe_tan: string; periode: string;
  boxes: Record<string, number>  // box1..box9
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<VATReturn xmlns="urn:mra:vat:v1">
  <Taxpayer>
    <BRN>${escape(opts.societe_brn)}</BRN>
    <TAN>${escape(opts.societe_tan)}</TAN>
  </Taxpayer>
  <Period>${escape(opts.periode)}</Period>
  <Boxes>
${Object.entries(opts.boxes).map(([k, v]) => `    <${k}>${(Number(v) || 0).toFixed(2)}</${k}>`).join('\n')}
  </Boxes>
</VATReturn>`
}

export function generatePayeXml(opts: {
  societe_brn: string; societe_tan: string; periode: string;
  employees: Array<{ name: string; nic: string; tan?: string; gross_mur: number; paye_mur: number }>
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<PAYEReturn xmlns="urn:mra:paye:v1">
  <Taxpayer><BRN>${escape(opts.societe_brn)}</BRN><TAN>${escape(opts.societe_tan)}</TAN></Taxpayer>
  <Period>${escape(opts.periode)}</Period>
  <Employees>
${opts.employees.map(e => `    <Employee><Name>${escape(e.name)}</Name><NIC>${escape(e.nic)}</NIC><TAN>${escape(e.tan)}</TAN><Gross>${e.gross_mur.toFixed(2)}</Gross><PAYE>${e.paye_mur.toFixed(2)}</PAYE></Employee>`).join('\n')}
  </Employees>
  <Total>${opts.employees.reduce((s, e) => s + e.paye_mur, 0).toFixed(2)}</Total>
</PAYEReturn>`
}

export function generateTdsXml(opts: {
  societe_brn: string; societe_tan: string; periode: string;
  records: Array<{ tiers: string; brn?: string; category: string; gross_mur: number; rate: number; tds_mur: number; date: string }>
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<TDSStatement xmlns="urn:mra:tds:v1">
  <Taxpayer><BRN>${escape(opts.societe_brn)}</BRN><TAN>${escape(opts.societe_tan)}</TAN></Taxpayer>
  <Period>${escape(opts.periode)}</Period>
  <Records>
${opts.records.map(r => `    <Record><Payee>${escape(r.tiers)}</Payee><BRN>${escape(r.brn)}</BRN><Category>${escape(r.category)}</Category><Gross>${r.gross_mur.toFixed(2)}</Gross><Rate>${r.rate.toFixed(2)}</Rate><TDS>${r.tds_mur.toFixed(2)}</TDS><Date>${escape(r.date)}</Date></Record>`).join('\n')}
  </Records>
  <Total>${opts.records.reduce((s, r) => s + r.tds_mur, 0).toFixed(2)}</Total>
</TDSStatement>`
}

export function generateCitXml(opts: {
  societe_brn: string; societe_tan: string; exercice: string;
  profit_avant_impot: number; profit_imposable: number; impot_net: number;
  ftc_applied?: number; tds_credit?: number;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<CITReturn xmlns="urn:mra:cit:v1">
  <Taxpayer><BRN>${escape(opts.societe_brn)}</BRN><TAN>${escape(opts.societe_tan)}</TAN></Taxpayer>
  <FiscalYear>${escape(opts.exercice)}</FiscalYear>
  <ProfitBeforeTax>${opts.profit_avant_impot.toFixed(2)}</ProfitBeforeTax>
  <TaxableProfit>${opts.profit_imposable.toFixed(2)}</TaxableProfit>
  <FTCApplied>${(opts.ftc_applied || 0).toFixed(2)}</FTCApplied>
  <TDSCredit>${(opts.tds_credit || 0).toFixed(2)}</TDSCredit>
  <NetTax>${opts.impot_net.toFixed(2)}</NetTax>
</CITReturn>`
}

export function generateSftXml(opts: {
  societe_brn: string; year: number;
  transactions: Array<{ date: string; counterparty: string; counterparty_id?: string; amount_mur: number; type: string }>
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<SFTReturn xmlns="urn:mra:sft:v1">
  <Taxpayer><BRN>${escape(opts.societe_brn)}</BRN></Taxpayer>
  <Year>${opts.year}</Year>
  <Transactions>
${opts.transactions.map(t => `    <Tx><Date>${escape(t.date)}</Date><Counterparty>${escape(t.counterparty)}</Counterparty><ID>${escape(t.counterparty_id)}</ID><Type>${escape(t.type)}</Type><Amount>${t.amount_mur.toFixed(2)}</Amount></Tx>`).join('\n')}
  </Transactions>
</SFTReturn>`
}
