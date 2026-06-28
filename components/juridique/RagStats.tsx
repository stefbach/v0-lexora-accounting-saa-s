"use client"
/**
 * RagStats — référence, dans le tableau de bord, TOUTES les données du corpus
 * juridique réellement chargées en base (lois, jurisprudence, passages,
 * embeddings). Données live depuis /api/juridique/rag/stats.
 */
import React, { useEffect, useState } from "react"
import { Database, BookOpen, Gavel, Sparkles, Loader2 } from "lucide-react"
import { t, getLocale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface SourceStat { source: string; domaine: string; n: number; emb: number }
interface Stats { total: number; embedded: number; sources: SourceStat[]; jurisprudence: number; nb_sources: number }

const DOMAINE_KEY: Record<string, string> = {
  travail: "scjur.ragstats.dom_travail", societes: "scjur.ragstats.dom_societes",
  commercial: "scjur.ragstats.dom_commercial", civil: "scjur.ragstats.dom_civil",
  procedure: "scjur.ragstats.dom_procedure", penal: "scjur.ragstats.dom_penal",
  donnees: "scjur.ragstats.dom_donnees", financier: "scjur.ragstats.dom_financier",
  immobilier: "scjur.ragstats.dom_immobilier", arbitrage: "scjur.ragstats.dom_arbitrage",
  insolvabilite: "scjur.ragstats.dom_insolvabilite", fiscal: "scjur.ragstats.dom_fiscal",
}

function Stat({ value, label, icon }: { value: React.ReactNode; label: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white border border-gray-100 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-1.5">{icon}<p className="text-2xl font-bold" style={{ color: NAVY }}>{value}</p></div>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

export function RagStats() {
  const locale = getLocale()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/juridique/rag/stats")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setStats(d) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> {t('scjur.ragstats.loading_kb', locale)}</div>
  }
  if (!stats || stats.total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-5 text-sm text-gray-500">
        {t('scjur.ragstats.empty_kb_pre', locale)}<span className="font-semibold" style={{ color: NAVY }}>{t('scjur.ragstats.empty_kb_admin', locale)}</span>{t('scjur.ragstats.empty_kb_post', locale)}
      </div>
    )
  }

  const pct = stats.total ? Math.round((stats.embedded / stats.total) * 100) : 0
  const lois = stats.sources.filter((s) => s.source !== "Jurisprudence")

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat icon={<Database className="w-4 h-4" style={{ color: GOLD }} />} value={stats.total.toLocaleString("fr-FR")} label={t('scjur.ragstats.passages_indexed', locale)} />
        <Stat icon={<Sparkles className="w-4 h-4" style={{ color: GOLD }} />} value={`${pct}%`} label={t('scjur.ragstats.vectorized_semantic', locale)} />
        <Stat icon={<BookOpen className="w-4 h-4" style={{ color: GOLD }} />} value={lois.length} label={t('scjur.ragstats.laws_codes', locale)} />
        <Stat icon={<Gavel className="w-4 h-4" style={{ color: GOLD }} />} value={stats.jurisprudence.toLocaleString("fr-FR")} label={t('scjur.ragstats.case_law', locale)} />
      </div>

      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="font-bold text-sm" style={{ color: NAVY }}>{t('scjur.ragstats.kb_sources', locale).replace('{n}', String(stats.nb_sources))}</p>
          <span className="text-[11px] text-gray-400">{t('scjur.ragstats.vectorized_ratio', locale).replace('{a}', stats.embedded.toLocaleString("fr-FR")).replace('{b}', stats.total.toLocaleString("fr-FR"))}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-5 py-2 font-semibold">{t('scjur.ragstats.col_source', locale)}</th>
                <th className="px-3 py-2 font-semibold">{t('scjur.ragstats.col_domain', locale)}</th>
                <th className="px-3 py-2 font-semibold text-right">{t('scjur.ragstats.col_passages', locale)}</th>
                <th className="px-3 py-2 font-semibold text-right">{t('scjur.ragstats.col_vectorized', locale)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stats.sources.map((s) => (
                <tr key={s.source} className="hover:bg-gray-50">
                  <td className="px-5 py-2 font-medium text-gray-800">{s.source}</td>
                  <td className="px-3 py-2 text-gray-500">{DOMAINE_KEY[s.domaine] ? t(DOMAINE_KEY[s.domaine], locale) : s.domaine}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{s.n.toLocaleString("fr-FR")}</td>
                  <td className="px-3 py-2 text-right">
                    {s.emb === s.n
                      ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">100%</span>
                      : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{s.n ? Math.round((s.emb / s.n) * 100) : 0}%</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
