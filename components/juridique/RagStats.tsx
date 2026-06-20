"use client"
/**
 * RagStats — référence, dans le tableau de bord, TOUTES les données du corpus
 * juridique réellement chargées en base (lois, jurisprudence, passages,
 * embeddings). Données live depuis /api/juridique/rag/stats.
 */
import React, { useEffect, useState } from "react"
import { Database, BookOpen, Gavel, Sparkles, Loader2 } from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface SourceStat { source: string; domaine: string; n: number; emb: number }
interface Stats { total: number; embedded: number; sources: SourceStat[]; jurisprudence: number; nb_sources: number }

const DOMAINE_LABEL: Record<string, string> = {
  travail: "Travail", societes: "Sociétés", commercial: "Commercial", civil: "Civil",
  procedure: "Procédure", penal: "Pénal", donnees: "Données", financier: "Financier",
  immobilier: "Immobilier", arbitrage: "Arbitrage", insolvabilite: "Insolvabilité", fiscal: "Fiscal",
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
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/juridique/rag/stats")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setStats(d) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Chargement de la base de connaissances…</div>
  }
  if (!stats || stats.total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-5 text-sm text-gray-500">
        Base de connaissances vide. Lance l'ingestion via <span className="font-semibold" style={{ color: NAVY }}>Administration RAG</span> ci-dessous.
      </div>
    )
  }

  const pct = stats.total ? Math.round((stats.embedded / stats.total) * 100) : 0
  const lois = stats.sources.filter((s) => s.source !== "Jurisprudence")

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat icon={<Database className="w-4 h-4" style={{ color: GOLD }} />} value={stats.total.toLocaleString("fr-FR")} label="Passages indexés" />
        <Stat icon={<Sparkles className="w-4 h-4" style={{ color: GOLD }} />} value={`${pct}%`} label="Vectorisés (sémantique)" />
        <Stat icon={<BookOpen className="w-4 h-4" style={{ color: GOLD }} />} value={lois.length} label="Lois & codes" />
        <Stat icon={<Gavel className="w-4 h-4" style={{ color: GOLD }} />} value={stats.jurisprudence.toLocaleString("fr-FR")} label="Jurisprudence" />
      </div>

      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="font-bold text-sm" style={{ color: NAVY }}>Base de connaissances ({stats.nb_sources} sources)</p>
          <span className="text-[11px] text-gray-400">{stats.embedded.toLocaleString("fr-FR")} / {stats.total.toLocaleString("fr-FR")} vectorisés</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-5 py-2 font-semibold">Source</th>
                <th className="px-3 py-2 font-semibold">Domaine</th>
                <th className="px-3 py-2 font-semibold text-right">Passages</th>
                <th className="px-3 py-2 font-semibold text-right">Vectorisés</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stats.sources.map((s) => (
                <tr key={s.source} className="hover:bg-gray-50">
                  <td className="px-5 py-2 font-medium text-gray-800">{s.source}</td>
                  <td className="px-3 py-2 text-gray-500">{DOMAINE_LABEL[s.domaine] || s.domaine}</td>
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
