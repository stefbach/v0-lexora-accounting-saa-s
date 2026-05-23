'use client'

import type { Payslip } from '@/lib/jurisdictions/core/payroll-engine.interface'

interface PayslipViewerProps {
  payslip: Payslip
  employee: {
    nom: string
    prenom: string
    matricule?: string
    poste?: string
  }
  societe: {
    nom: string
    adresse?: string
  }
  period: { year: number; month: number }
  jurisdictionCode: string
  currency?: string
}

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function formatAmount(amount: number, currency: string = 'F CFA'): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(amount) + ' ' + currency
}

export function PayslipViewer({ payslip, employee, societe, period, jurisdictionCode, currency = 'F CFA' }: PayslipViewerProps) {
  return (
    <div className="bg-white border rounded-lg overflow-hidden max-w-4xl mx-auto">
      {/* Header */}
      <div className="p-6 border-b bg-gradient-to-r from-indigo-50 to-blue-50">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs text-gray-500 mb-1">EMPLOYEUR</div>
            <div className="font-bold text-lg">{societe.nom}</div>
            {societe.adresse && <div className="text-sm text-gray-600">{societe.adresse}</div>}
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">BULLETIN DE PAIE</div>
            <div className="text-sm text-gray-600 mt-1">{MONTHS[period.month - 1]} {period.year}</div>
            <div className="text-xs text-gray-500">Juridiction: {jurisdictionCode}</div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-blue-200">
          <div className="text-xs text-gray-500 mb-1">SALARIÉ</div>
          <div className="font-semibold text-lg">{employee.prenom} {employee.nom}</div>
          <div className="text-sm text-gray-600">
            {employee.matricule && <span>Matricule: {employee.matricule}</span>}
            {employee.poste && <span> • {employee.poste}</span>}
          </div>
        </div>
      </div>

      {/* Détail */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-200">
        {/* Gains */}
        <div className="bg-white p-4">
          <h3 className="font-bold text-sm uppercase mb-3 text-green-700">Gains</h3>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b">
                <td className="py-2">Salaire de base</td>
                <td className="py-2 text-right font-mono">{formatAmount(payslip.grossSalary, currency)}</td>
              </tr>
              <tr className="border-b font-semibold">
                <td className="py-2">SALAIRE BRUT</td>
                <td className="py-2 text-right font-mono">{formatAmount(payslip.grossSalary, currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Retenues */}
        <div className="bg-white p-4">
          <h3 className="font-bold text-sm uppercase mb-3 text-red-700">Retenues</h3>
          <table className="w-full text-sm">
            <tbody>
              {payslip.employeeContributions.map((contrib, i) => (
                <tr key={i} className="border-b">
                  <td className="py-1">
                    <div>{contrib.label}</div>
                    <div className="text-xs text-gray-500">{(contrib.rate * 100).toFixed(2)}%</div>
                  </td>
                  <td className="py-1 text-right font-mono">{formatAmount(contrib.amount, currency)}</td>
                </tr>
              ))}
              <tr className="border-b">
                <td className="py-1">Impôt sur le revenu</td>
                <td className="py-1 text-right font-mono">{formatAmount(payslip.incomeTax, currency)}</td>
              </tr>
              <tr className="font-semibold">
                <td className="py-2">TOTAL RETENUES</td>
                <td className="py-2 text-right font-mono text-red-700">
                  {formatAmount(
                    payslip.employeeContributions.reduce((s, c) => s + c.amount, 0) + payslip.incomeTax,
                    currency
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Salaire Net */}
      <div className="p-6 bg-gradient-to-r from-green-100 to-emerald-100 border-t-2 border-green-500">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">NET À PAYER</div>
            <div className="text-xs text-gray-500">Virement / Espèces</div>
          </div>
          <div className="text-3xl font-bold text-green-700">
            {formatAmount(payslip.netSalary, currency)}
          </div>
        </div>
      </div>

      {/* Charges patronales (info) */}
      <div className="p-4 bg-gray-50 border-t">
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-gray-700">
            Charges patronales (à titre informatif)
          </summary>
          <div className="mt-3">
            <table className="w-full text-xs">
              <tbody>
                {payslip.employerContributions.map((contrib, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-1">{contrib.label} ({(contrib.rate * 100).toFixed(2)}%)</td>
                    <td className="py-1 text-right font-mono">{formatAmount(contrib.amount, currency)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2">COÛT TOTAL EMPLOYEUR</td>
                  <td className="py-2 text-right font-mono">{formatAmount(payslip.totalEmployerCost, currency)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  )
}
