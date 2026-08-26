"use client"

/**
 * GrilleView — tableau croisé compte × section (résultat analytique).
 * Lignes = comptes de charge/produit, colonnes = sections, + « Non affecté »
 * et « Total ». Pied de tableau : charges / produits / marge par section.
 */

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, RefreshCw } from "lucide-react"

function fmt(n: number): string {
  if (!n) return "—"
  return new Intl.NumberFormat("en-MU", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

interface Section { id: string; code: string; libelle: string; type: string; statut: string }
interface CompteRow {
  numero_compte: string; nom_compte: string; nature: "charge" | "produit"
  parSection: Record<string, number>; total: number; non_affecte: number
}
interface Grille {
  sections: Section[]
  comptes: CompteRow[]
  totauxSection: Record<string, { charges: number; produits: number; marge: number }>
  total: { charges: number; produits: number; marge: number; charges_non_affectees: number; produits_non_affectes: number }
}

export function GrilleView({ societeId }: { societeId: string | null }) {
  const [data, setData] = useState<Grille | null>(null)
  const [loading, setLoading] = useState(false)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const qs = new URLSearchParams({ societe_id: societeId })
      if (from) qs.set("from", from)
      if (to) qs.set("to", to)
      const res = await fetch(`/api/client/analytique/grille?${qs.toString()}`)
      const d = await res.json()
      if (res.ok) setData(d)
    } finally {
      setLoading(false)
    }
  }, [societeId, from, to])

  useEffect(() => { load() }, [load])

  const sections = data?.sections || []

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2 flex-wrap">
        <div><label className="text-xs text-slate-500">Du</label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8" /></div>
        <div><label className="text-xs text-slate-500">Au</label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8" /></div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
        {data && (
          <div className="ml-auto text-sm text-slate-500">
            Résultat global : <strong className={data.total.marge < 0 ? "text-red-600" : "text-emerald-700"}>{fmt(data.total.marge)} MUR</strong>
          </div>
        )}
      </div>

      <div className="rounded-xl border overflow-x-auto bg-white">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 sticky top-0">
            <tr>
              <th className="text-left p-2 sticky left-0 bg-slate-50 min-w-[200px]">Compte</th>
              {sections.map((s) => (
                <th key={s.id} className="text-right p-2 whitespace-nowrap min-w-[90px]" title={s.libelle}>{s.code}</th>
              ))}
              <th className="text-right p-2 min-w-[90px]">Non affecté</th>
              <th className="text-right p-2 min-w-[90px] font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {(data?.comptes || []).length === 0 && (
              <tr><td colSpan={sections.length + 3} className="p-8 text-center text-slate-400">
                {loading ? "Chargement…" : "Aucune charge / produit sur la période."}
              </td></tr>
            )}
            {(data?.comptes || []).map((c) => (
              <tr key={c.numero_compte} className="border-t hover:bg-slate-50">
                <td className="p-2 sticky left-0 bg-white">
                  <span>{c.nom_compte || c.numero_compte}</span>
                  <span className={`ml-1 text-[10px] ${c.nature === "produit" ? "text-emerald-600" : "text-red-600"}`}>{c.nature}</span>
                </td>
                {sections.map((s) => (
                  <td key={s.id} className="p-2 text-right tabular-nums">{fmt(c.parSection[s.id] || 0)}</td>
                ))}
                <td className={`p-2 text-right tabular-nums ${c.non_affecte > 0.5 ? "text-amber-600 font-medium" : "text-slate-300"}`}>{fmt(c.non_affecte)}</td>
                <td className="p-2 text-right tabular-nums font-medium">{fmt(c.total)}</td>
              </tr>
            ))}
          </tbody>
          {data && (
            <tfoot className="bg-slate-50 border-t-2">
              <tr>
                <td className="p-2 sticky left-0 bg-slate-50 font-medium">Charges</td>
                {sections.map((s) => <td key={s.id} className="p-2 text-right tabular-nums text-red-600">{fmt(data.totauxSection[s.id]?.charges || 0)}</td>)}
                <td className="p-2 text-right tabular-nums text-amber-600">{fmt(data.total.charges_non_affectees)}</td>
                <td className="p-2 text-right tabular-nums font-medium">{fmt(data.total.charges)}</td>
              </tr>
              <tr>
                <td className="p-2 sticky left-0 bg-slate-50 font-medium">Produits</td>
                {sections.map((s) => <td key={s.id} className="p-2 text-right tabular-nums text-emerald-700">{fmt(data.totauxSection[s.id]?.produits || 0)}</td>)}
                <td className="p-2 text-right tabular-nums text-amber-600">{fmt(data.total.produits_non_affectes)}</td>
                <td className="p-2 text-right tabular-nums font-medium">{fmt(data.total.produits)}</td>
              </tr>
              <tr className="font-semibold">
                <td className="p-2 sticky left-0 bg-slate-50">Marge</td>
                {sections.map((s) => {
                  const m = data.totauxSection[s.id]?.marge || 0
                  return <td key={s.id} className={`p-2 text-right tabular-nums ${m < 0 ? "text-red-600" : "text-emerald-700"}`}>{fmt(m)}</td>
                })}
                <td className="p-2 text-right">—</td>
                <td className={`p-2 text-right tabular-nums ${data.total.marge < 0 ? "text-red-600" : "text-emerald-700"}`}>{fmt(data.total.marge)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-slate-400">
        « Non affecté » = part d'un compte non encore ventilée sur une section. Ventilez-la depuis le bouton « Ventiler ».
      </p>
    </div>
  )
}
