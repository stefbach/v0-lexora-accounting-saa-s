"use client"
import React from "react"
import { ShieldCheck, CalendarClock, Clock, BookOpen } from "lucide-react"
import { JuridiqueHeader } from "@/components/juridique/JuridiqueHeader"
import { LOIS_MAURICIENNES, DELAIS_PRESCRIPTION } from "@/lib/juridique/referentielMauricien"
import { t, getLocale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

// Calendrier des obligations légales récurrentes (sources citées).
// `obligation`/`echeance` are rendered via t("uiconf." + id + "_obligation"/"_echeance").
// `autorite`, `base`, `cat` are kept as-is (codes / legal refs / filter+color key).
const OBLIGATIONS = [
  { id: "oblig_ag_annuelle", autorite: "ROC", base: "CA 2001 s.118", cat: "Sociétés" },
  { id: "oblig_rapport_annuel", autorite: "ROC", base: "CA 2001 s.176", cat: "Sociétés" },
  { id: "oblig_changement_dirigeant", autorite: "ROC", base: "CA 2001 s.163", cat: "Sociétés" },
  { id: "oblig_ubo", autorite: "ROC", base: "BORA 2020 s.4", cat: "Sociétés" },
  { id: "oblig_is", autorite: "MRA", base: "ITA s.118", cat: "Fiscal" },
  { id: "oblig_tva", autorite: "MRA", base: "VAT Act s.24", cat: "Fiscal" },
  { id: "oblig_paye", autorite: "MRA", base: "ITA s.93", cat: "Fiscal" },
  { id: "oblig_csg_nsf", autorite: "MRA", base: "CSG Act", cat: "Social" },
  { id: "oblig_licence_fsc", autorite: "FSC", base: "FSA 2007 s.20", cat: "Financier" },
  { id: "oblig_rapport_fsc", autorite: "FSC", base: "FSC Guidelines", cat: "Financier" },
  { id: "oblig_audit_legal", autorite: "ROC", base: "CA 2001 s.194-198", cat: "Sociétés" },
  { id: "oblig_registre_charges", autorite: "ROC", base: "CA 2001 s.127", cat: "Sociétés" },
  { id: "oblig_prix_transfert", autorite: "MRA", base: "ITA · TP rules", cat: "Fiscal" },
  { id: "oblig_tds", autorite: "MRA", base: "ITA s.111", cat: "Fiscal" },
  { id: "oblig_return_employees", autorite: "MRA", base: "ITA", cat: "Social" },
  { id: "oblig_substance_return", autorite: "FSC / MRA", base: "ITA · FSA 2007", cat: "Financier" },
  { id: "oblig_aml_cft", autorite: "FIU / FSC", base: "FIAMLA s.17", cat: "Financier" },
  { id: "oblig_work_permit", autorite: "EDB", base: "Immigration / Non-Citizens Act", cat: "Social" },
]

const CAT_COLOR: Record<string, string> = {
  "Sociétés": "#0B0F2E", "Fiscal": "#9A3412", "Social": "#047857", "Financier": "#6D28D9",
}

const CATEGORIES = ["Tous", "Sociétés", "Fiscal", "Social", "Financier"]

export default function ConformitePage() {
  const locale = getLocale()
  const [cat, setCat] = React.useState("Tous")
  const obligations = cat === "Tous" ? OBLIGATIONS : OBLIGATIONS.filter((o) => o.cat === cat)
  return (
    <div className="space-y-5">
      <JuridiqueHeader
        icon={<ShieldCheck className="w-6 h-6" style={{ color: GOLD }} />}
        title={t("jurd.conf.title", locale)}
        subtitle={t("jurd.conf.subtitle", locale)}
        showSelector={false}
      />

      {/* Calendrier des obligations */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4" style={{ color: GOLD }} />
            <p className="font-bold text-sm" style={{ color: NAVY }}>{t("jurd.conf.calendrier", locale)}</p>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${cat === c ? "border-transparent text-[#0B0F2E]" : "border-gray-200 text-gray-500 hover:border-gray-300"}`} style={cat === c ? { background: "rgba(212,175,55,0.16)" } : {}}>{t(`jurd.conf.cat.${c}`, locale)}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-5 py-2 font-semibold">{t("jurd.conf.colObligation", locale)}</th>
                <th className="px-3 py-2 font-semibold">{t("jurd.conf.colEcheance", locale)}</th>
                <th className="px-3 py-2 font-semibold">{t("jurd.conf.colAutorite", locale)}</th>
                <th className="px-3 py-2 font-semibold">{t("jurd.conf.colBase", locale)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {obligations.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: CAT_COLOR[o.cat] || GOLD }} />
                      <span className="font-medium text-gray-800">{t("uiconf." + o.id + "_obligation", locale)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{t("uiconf." + o.id + "_echeance", locale)}</td>
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
          <p className="font-bold text-sm" style={{ color: NAVY }}>{t("jurd.conf.prescription", locale)}</p>
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
          <p className="font-bold text-sm" style={{ color: NAVY }}>{t("jurd.conf.corpus", locale)} ({LOIS_MAURICIENNES.length})</p>
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
        {t("jurd.conf.disclaimer", locale)}
      </p>
    </div>
  )
}
