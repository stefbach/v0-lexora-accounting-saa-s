"use client"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CalendarClock, Loader2, Building2, AlertTriangle, CheckCircle2, Clock } from "lucide-react"
import { useJuridiqueSociete } from "@/components/juridique/JuridiqueSocieteProvider"
import { SocieteDocuments } from "@/components/juridique/SocieteDocuments"
import { t, getLocale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface SocieteData {
  nom?: string; date_fin_exercice?: string | null; date_incorporation?: string | null
  date_creation_legale?: string | null; fsc_license_number?: string | null; fsc_license_expiry?: string | null
}

function addMonths(d: Date, m: number) { const x = new Date(d); x.setMonth(x.getMonth() + m); return x }
function addDays(d: Date, days: number) { const x = new Date(d); x.setDate(x.getDate() + days); return x }
function nextYearEnd(fin: Date) { const now = new Date(); const x = new Date(fin); x.setFullYear(now.getFullYear()); if (x < now) x.setFullYear(now.getFullYear() + 1); return x }
interface Obligation { titre: string; desc: string; ref: string; due: Date | null }

export default function ObligationsPage() {
  const locale = getLocale()
  const fmt = (d?: Date | null) => d && !isNaN(d.getTime()) ? d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'
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
    const fin = data?.date_fin_exercice ? new Date(data.date_fin_exercice) : null
    const ye = fin && !isNaN(fin.getTime()) ? nextYearEnd(fin) : null
    const agm = ye ? addMonths(ye, 6) : null
    // On affiche TOUJOURS le cadre des obligations ; les échéances sont
    // calculées si la date de clôture est connue, sinon « à configurer ».
    const list: Obligation[] = [
      { titre: t('jurs.obl.agm.titre', locale), desc: t('jurs.obl.agm.desc', locale), ref: 'Companies Act 2001 s.115', due: agm },
      { titre: t('jurs.obl.financials.titre', locale), desc: t('jurs.obl.financials.desc', locale), ref: 'Companies Act 2001 s.210-211', due: agm },
      { titre: t('jurs.obl.return.titre', locale), desc: t('jurs.obl.return.desc', locale), ref: 'Companies Act 2001 s.223', due: agm ? addDays(agm, 28) : null },
      { titre: t('jurs.obl.mra.titre', locale), desc: t('jurs.obl.mra.desc', locale), ref: 'Income Tax Act', due: ye ? addMonths(ye, 6) : null },
      { titre: t('jurs.obl.fsc.titre', locale), desc: `${t('jurs.obl.fsc.descPrefix', locale)}${data?.fsc_license_number ? `${t('jurs.obl.fsc.licenseNo', locale)}${data.fsc_license_number}` : ''}${t('jurs.obl.fsc.descSuffix', locale)}`, ref: 'FSA 2007', due: data?.fsc_license_expiry ? new Date(data.fsc_license_expiry) : null },
    ]
    return list.sort((a, b) => {
      if (a.due && b.due) return a.due.getTime() - b.due.getTime()
      if (a.due) return -1
      if (b.due) return 1
      return 0
    })
  }, [data])

  const statut = (due: Date | null) => {
    if (!due) return { label: t('jurs.obl.status.toConfigure', locale), color: '#6B7280', bg: '#F3F4F6', icon: Clock }
    const days = Math.ceil((due.getTime() - Date.now()) / 86400000)
    if (days < 0) return { label: t('jurs.obl.status.overdue', locale).replace('{d}', String(-days)), color: '#B91C1C', bg: '#FEE2E2', icon: AlertTriangle }
    if (days <= 60) return { label: t('jurs.obl.status.inDays', locale).replace('{d}', String(days)), color: '#854D0E', bg: '#FEF9C3', icon: Clock }
    return { label: t('jurs.obl.status.inDays', locale).replace('{d}', String(days)), color: '#047857', bg: '#ECFDF5', icon: CheckCircle2 }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/juridique/societe" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#0B0F2E]"><ArrowLeft className="w-4 h-4" /> {t('jurs.back', locale)}</Link>
        <div className="h-4 w-px bg-gray-200" /><CalendarClock className="w-5 h-5" style={{ color: NAVY }} />
        <h1 className="text-lg font-bold" style={{ color: NAVY }}>{t('jurs.obl.title', locale)}</h1>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>

      {!societe ? (
        <div className="rounded-2xl bg-white border border-gray-100 p-8 text-center text-sm text-gray-500"><Building2 className="w-6 h-6 mx-auto mb-2 text-gray-300" /> {t('jurs.selectSociete', locale)}</div>
      ) : (
        <>
          {!data?.date_fin_exercice && !loading && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{t('jurs.obl.noDateWarning', locale)}</span>
            </div>
          )}
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm divide-y divide-gray-50">
            {obligations.map((o, i) => {
              const st = statut(o.due); const Icon = st.icon
              return (
                <div key={i} className="px-5 py-4 flex items-start gap-4">
                  <div className="rounded-xl p-2 shrink-0" style={{ background: "rgba(11,15,46,0.05)" }}><CalendarClock className="w-4 h-4" style={{ color: NAVY }} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: NAVY }}>{o.titre}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{o.desc}</p>
                    <p className="text-[11px] text-gray-400 mt-1 font-mono">{o.ref} · {t('jurs.obl.dueEstimated', locale)} {fmt(o.due)}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0" style={{ background: st.bg, color: st.color }}>
                    <Icon className="w-3 h-3" /> {st.label}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-gray-400">
            {t('jurs.obl.footer', locale)}
          </p>

          <SocieteDocuments
            societeId={societe.id}
            categorie="obligation"
            title={t('jurs.obl.docsTitle', locale)}
            hint={t('jurs.obl.docsHint', locale)}
          />
        </>
      )}
    </div>
  )
}
