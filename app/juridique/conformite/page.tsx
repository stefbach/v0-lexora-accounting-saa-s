"use client"
import React from "react"
import { ShieldCheck, CalendarClock, Clock, BookOpen } from "lucide-react"
import { JuridiqueHeader } from "@/components/juridique/JuridiqueHeader"
import { LOIS_MAURICIENNES, DELAIS_PRESCRIPTION } from "@/lib/juridique/referentielMauricien"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

// Calendrier des obligations légales récurrentes (sources citées).
const OBLIGATIONS = [
  { obligation: "Assemblée générale annuelle", echeance: "6 mois après clôture", autorite: "ROC", base: "CA 2001 s.118", cat: "Sociétés" },
  { obligation: "Dépôt du rapport annuel", echeance: "28 jours après l'AG", autorite: "ROC", base: "CA 2001 s.176", cat: "Sociétés" },
  { obligation: "Notification changement de dirigeant", echeance: "28 jours", autorite: "ROC", base: "CA 2001 s.163", cat: "Sociétés" },
  { obligation: "Déclaration bénéficiaires effectifs (UBO)", echeance: "14 jours", autorite: "ROC", base: "BORA 2020 s.4", cat: "Sociétés" },
  { obligation: "Impôt sur les sociétés", echeance: "6 mois après clôture", autorite: "MRA", base: "ITA s.118", cat: "Fiscal" },
  { obligation: "Déclaration TVA mensuelle", echeance: "20 du mois suivant", autorite: "MRA", base: "VAT Act s.24", cat: "Fiscal" },
  { obligation: "PAYE mensuel", echeance: "20 du mois suivant", autorite: "MRA", base: "ITA s.93", cat: "Fiscal" },
  { obligation: "CSG / NSF mensuel", echeance: "20 du mois suivant", autorite: "MRA", base: "CSG Act", cat: "Social" },
  { obligation: "Renouvellement licence FSC", echeance: "1 mois avant expiry", autorite: "FSC", base: "FSA 2007 s.20", cat: "Financier" },
  { obligation: "Rapport annuel FSC (GBL/AC)", echeance: "3 mois après clôture", autorite: "FSC", base: "FSC Guidelines", cat: "Financier" },
]

const CAT_COLOR: Record<string, string> = {
  "Sociétés": "#0B0F2E", "Fiscal": "#9A3412", "Social": "#047857", "Financier": "#6D28D9",
}

export default function ConformitePage() {
  return (
    <div className="space-y-5">
      <JuridiqueHeader
        icon={<ShieldCheck className="w-6 h-6" style={{ color: GOLD }} />}
        title="Conformité & délais légaux"
        subtitle="Calendrier des obligations récurrentes, délais de prescription et corpus légal applicable. Chaque échéance est rattachée à sa base légale."
        showSelector={false}
      />

      {/* Calendrier des obligations */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <CalendarClock className="w-4 h-4" style={{ color: GOLD }} />
          <p className="font-bold text-sm" style={{ color: NAVY }}>Calendrier des obligations</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-5 py-2 font-semibold">Obligation</th>
                <th className="px-3 py-2 font-semibold">Échéance</th>
                <th className="px-3 py-2 font-semibold">Autorité</th>
                <th className="px-3 py-2 font-semibold">Base légale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {OBLIGATIONS.map((o, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: CAT_COLOR[o.cat] || GOLD }} />
                      <span className="font-medium text-gray-800">{o.obligation}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{o.echeance}</td>
                  <td className="px-3 py-2.5"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{o.autorite}</span></td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{o.base}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Délais de prescription */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4" style={{ color: GOLD }} />
          <p className="font-bold text-sm" style={{ color: NAVY }}>Délais de prescription</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {DELAIS_PRESCRIPTION.map((d, i) => (
            <div key={i} className="rounded-xl border border-gray-100 px-3 py-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">{d.action}</p>
                <p className="text-[11px] text-gray-400">{d.base}</p>
              </div>
              <span className="text-sm font-bold" style={{ color: NAVY }}>{d.delai}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Corpus légal */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4" style={{ color: GOLD }} />
          <p className="font-bold text-sm" style={{ color: NAVY }}>Corpus légal référencé ({LOIS_MAURICIENNES.length})</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {LOIS_MAURICIENNES.map((l) => (
            <span key={l.code} title={l.titre} className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-gray-200 text-gray-700 hover:border-[#D4AF37]/50">
              {l.code}
            </span>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-gray-400 text-center">
        Calendrier indicatif — vérifiez les dates exactes selon la date de clôture et le statut de chaque entité.
      </p>
    </div>
  )
}
