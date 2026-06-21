"use client"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CalendarClock, Loader2, Building2, AlertTriangle, CheckCircle2, Clock } from "lucide-react"
import { useJuridiqueSociete } from "@/components/juridique/JuridiqueSocieteProvider"
import { SocieteDocuments } from "@/components/juridique/SocieteDocuments"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface SocieteData {
  nom?: string; date_fin_exercice?: string | null; date_incorporation?: string | null
  date_creation_legale?: string | null; fsc_license_number?: string | null; fsc_license_expiry?: string | null
}

function addMonths(d: Date, m: number) { const x = new Date(d); x.setMonth(x.getMonth() + m); return x }
function addDays(d: Date, days: number) { const x = new Date(d); x.setDate(x.getDate() + days); return x }
function nextYearEnd(fin: Date) { const now = new Date(); const x = new Date(fin); x.setFullYear(now.getFullYear()); if (x < now) x.setFullYear(now.getFullYear() + 1); return x }
const fmt = (d?: Date | null) => d && !isNaN(d.getTime()) ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

interface Obligation { titre: string; desc: string; ref: string; due: Date | null }

export default function ObligationsPage() {
  const { societe } = useJuridiqueSociete()
  const [data, setData] = useState<SocieteData | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!societe?.id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/juridique/societe/data?societe_id=${societe.id}`)
      const d = await res.json().catch(() => ({}))
      if (res.ok) setData(d.societe)
    } finally { setLoading(false) }
  }, [societe?.id])
  useEffect(() => { load() }, [load])

  const obligations = useMemo<Obligation[]>(() => {
    if (!data) return []
    const fin = data.date_fin_exercice ? new Date(data.date_fin_exercice) : null
    const ye = fin && !isNaN(fin.getTime()) ? nextYearEnd(fin) : null
    const list: Obligation[] = []
    if (ye) {
      const agm = addMonths(ye, 6)
      list.push({ titre: 'Assemblée Générale annuelle (AGM)', desc: "Tenue de l'assemblée générale ordinaire d'approbation des comptes, dans les 6 mois suivant la clôture.", ref: 'Companies Act 2001 s.115', due: agm })
      list.push({ titre: 'Dépôt des états financiers', desc: 'Établissement et approbation des comptes annuels de la société.', ref: 'Companies Act 2001 s.210-211', due: agm })
      list.push({ titre: 'Annual Return (ROC)', desc: "Dépôt de l'annual return auprès du Registrar of Companies après l'AGM.", ref: 'Companies Act 2001 s.223', due: addDays(agm, 28) })
      list.push({ titre: 'Déclaration de résultat (MRA)', desc: "Déclaration d'impôt sur les sociétés (income tax return) dans les 6 mois de la clôture.", ref: 'Income Tax Act', due: addMonths(ye, 6) })
    }
    if (data.fsc_license_expiry) {
      list.push({ titre: 'Renouvellement de la licence FSC', desc: `Échéance de la licence${data.fsc_license_number ? ` n° ${data.fsc_license_number}` : ''} délivrée par la Financial Services Commission.`, ref: 'FSA 2007', due: new Date(data.fsc_license_expiry) })
    }
    return list.filter((o) => o.due && !isNaN(o.due.getTime())).sort((a, b) => (a.due!.getTime() - b.due!.getTime()))
  }, [data])

  const statut = (due: Date | null) => {
    if (!due) return { label: '—', color: '#9CA3AF', bg: '#F3F4F6', icon: Clock }
    const days = Math.ceil((due.getTime() - Date.now()) / 86400000)
    if (days < 0) return { label: `Échu (${-days} j)`, color: '#B91C1C', bg: '#FEE2E2', icon: AlertTriangle }
    if (days <= 60) return { label: `Dans ${days} j`, color: '#854D0E', bg: '#FEF9C3', icon: Clock }
    return { label: `Dans ${days} j`, color: '#047857', bg: '#ECFDF5', icon: CheckCircle2 }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/juridique/societe" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#0B0F2E]"><ArrowLeft className="w-4 h-4" /> Vie de la société</Link>
        <div className="h-4 w-px bg-gray-200" /><CalendarClock className="w-5 h-5" style={{ color: NAVY }} />
        <h1 className="text-lg font-bold" style={{ color: NAVY }}>Calendrier des obligations</h1>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>

      {!societe ? (
        <div className="rounded-2xl bg-white border border-gray-100 p-8 text-center text-sm text-gray-500"><Building2 className="w-6 h-6 mx-auto mb-2 text-gray-300" /> Sélectionnez une société.</div>
      ) : !data?.date_fin_exercice && !loading ? (
        <div className="rounded-2xl bg-white border border-gray-100 p-8 text-center text-sm text-gray-500">
          La date de clôture de l'exercice n'est pas renseignée pour cette société. Renseignez-la dans la fiche société pour calculer les échéances.
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm divide-y divide-gray-50">
            {obligations.map((o, i) => {
              const st = statut(o.due); const Icon = st.icon
              return (
                <div key={i} className="px-5 py-4 flex items-start gap-4">
                  <div className="rounded-xl p-2 shrink-0" style={{ background: "rgba(11,15,46,0.05)" }}><CalendarClock className="w-4 h-4" style={{ color: NAVY }} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: NAVY }}>{o.titre}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{o.desc}</p>
                    <p className="text-[11px] text-gray-400 mt-1 font-mono">{o.ref} · échéance estimée : {fmt(o.due)}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0" style={{ background: st.bg, color: st.color }}>
                    <Icon className="w-3 h-3" /> {st.label}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-gray-400">
            Échéances calculées à titre indicatif à partir de la date de clôture et des informations de la société (Companies Act 2001, Income Tax Act, FSA 2007).
            Vérifiez les délais exacts applicables à votre type de société auprès du ROC / de la MRA / de la FSC.
          </p>

          <SocieteDocuments
            societeId={societe.id}
            categorie="obligation"
            title="Justificatifs de dépôt & preuves"
            hint="Associez vos preuves de dépôt : annual return, états financiers, accusés MRA/ROC/FSC, PV d'AGM…"
          />
        </>
      )}
    </div>
  )
}
