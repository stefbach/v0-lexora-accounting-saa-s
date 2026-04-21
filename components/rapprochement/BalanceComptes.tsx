"use client"

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BookOpen, ChevronDown, ChevronRight, Loader2, AlertCircle, CheckCircle2, ExternalLink } from "lucide-react"
import Link from "next/link"

interface SampleEcriture {
  date: string
  libelle: string
  debit: number
  credit: number
  journal: string
  lettre: string | null
  ref_folio: string | null
}

interface CompteRow {
  compte: string
  libelle: string
  debit_total: number
  credit_total: number
  solde: number
  nb_ecritures: number
  nb_lettrees: number
  derniere_ecriture: string | null
  sample: SampleEcriture[]
}

interface Totals {
  debit_total: number
  credit_total: number
  difference: number
  nb_comptes: number
  nb_ecritures: number
}

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(d: string | null) {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" })
  } catch { return d }
}

function classeColor(compte: string): string {
  const first = compte.charAt(0)
  if (first === "1") return "bg-slate-100 text-slate-800"
  if (first === "2") return "bg-indigo-100 text-indigo-800"
  if (first === "3") return "bg-purple-100 text-purple-800"
  if (first === "4") return "bg-amber-100 text-amber-800"
  if (first === "5") return "bg-blue-100 text-blue-800"
  if (first === "6") return "bg-red-100 text-red-800"
  if (first === "7") return "bg-green-100 text-green-800"
  return "bg-gray-100 text-gray-800"
}

export function BalanceComptes({ societeId, mois }: { societeId: string | null; mois: string | null }) {
  const [comptes, setComptes] = useState<CompteRow[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState("")
  const [repairing, setRepairing] = useState(false)

  const reload = () => {
    if (!societeId) return
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams({ societe_id: societeId })
    if (mois) qs.set("mois", mois)
    fetch(`/api/comptable/rapprochement/balance-comptes?${qs.toString()}`)
      .then(r => r.json())
      .then(d => {
        if (d?.error) {
          setError(d.error)
          setComptes([])
        } else {
          setComptes(d.comptes || [])
          setTotals(d.totals || null)
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [societeId, mois])

  // Réparation automatique de la balance — deux passes :
  //   1. dry-run pour montrer un résumé à l'utilisateur
  //   2. apply si confirmé.
  // Actions activées par défaut :
  //   • consolidate_pcm           (rename 4210→421, etc.)
  //   • recompute_vte_ach_mur     (corriger les factures en devise étrangère)
  //   • regenerate_missing_vte_ach (créer les écritures manquantes)
  //   • balance_pieces            (équilibrer chaque pièce)
  // purge_duplicate_sal reste opt-in via API directe (destructif).
  const handleRepair = async () => {
    if (!societeId) return
    setRepairing(true)
    try {
      const repairActions = {
        consolidate_pcm: true,
        recompute_vte_ach_mur: true,
        regenerate_missing_vte_ach: true,
        balance_pieces: true,
        purge_duplicate_sal: false,
      }
      // Pass 1: dry-run
      const dryRes = await fetch("/api/comptable/diagnostic-balance/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, apply: false, actions: repairActions }),
      })
      const dry = await dryRes.json()
      if (!dryRes.ok) { alert(`Erreur dry-run : ${dry?.error || dryRes.status}`); return }

      const nbImbalanced = dry?.balance_pieces?.nb_imbalanced || 0
      const nbConsolidated = (dry?.consolidate_pcm || []).reduce((s: number, x: any) => s + (x.affected || 0), 0)
      const nbRecompute = dry?.recompute_vte_ach_mur?.nb_factures_affected || 0
      const nbRegen = dry?.regenerate_missing_vte_ach?.nb_factures_without_ecriture || 0
      const initial = dry?.initial?.ecart
      const msg = [
        `Diagnostic — ${dry?.initial?.nb_ecritures || 0} écritures, écart actuel ${fmt(initial || 0)} MUR.`,
        ``,
        `Actions qui seront appliquées :`,
        `  • Consolidation PCM paie : ${nbConsolidated} ligne(s) renommées (4210/4311/4321/4330 → 421/431/444).`,
        `  • Recalcul en MUR des factures en devise étrangère : ${nbRecompute} facture(s) concernée(s) (GBP/EUR/USD).`,
        `  • Génération des écritures manquantes : ${nbRegen} facture(s) sans VTE/ACH vont être recréées.`,
        `  • Équilibrage final des pièces : ${nbImbalanced} pièce(s) recevront une écriture d'ajustement (6418 ou 471).`,
        ``,
        `Appliquer la réparation ?`,
      ].join("\n")
      if (!confirm(msg)) return

      // Pass 2: apply
      const applyRes = await fetch("/api/comptable/diagnostic-balance/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, apply: true, actions: repairActions }),
      })
      const applied = await applyRes.json()
      if (!applyRes.ok) { alert(`Erreur apply : ${applied?.error || applyRes.status}`); return }
      const before = applied?.net_change?.ecart_before ?? initial
      const after = applied?.net_change?.ecart_after ?? 0
      alert(`Réparation appliquée.\nÉcart avant : ${fmt(before)} MUR\nÉcart après : ${fmt(after)} MUR`)
      reload()
    } catch (e: any) {
      alert("Erreur : " + (e?.message || e))
    } finally {
      setRepairing(false)
    }
  }

  const toggleExpand = (compte: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(compte)) next.delete(compte)
      else next.add(compte)
      return next
    })
  }

  const filtered = filter
    ? comptes.filter(c =>
        c.compte.includes(filter)
        || c.libelle.toLowerCase().includes(filter.toLowerCase())
      )
    : comptes

  if (!societeId) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2 pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          Balance par compte
          {mois && <Badge variant="outline" className="text-[10px]">{mois}</Badge>}
          {totals && (
            <span className="text-xs text-slate-500 font-normal ml-2">
              {totals.nb_comptes} comptes · {totals.nb_ecritures} écritures ·
              <span className={Math.abs(totals.difference) < 0.01 ? " text-emerald-600 font-semibold" : " text-red-600 font-semibold"}>
                {" "}équilibre {fmt(totals.difference)} MUR
                {Math.abs(totals.difference) < 0.01 ? " ✓" : " ⚠"}
              </span>
            </span>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          {totals && Math.abs(totals.difference) >= 0.01 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleRepair}
              disabled={repairing}
              title="Lance un diagnostic puis équilibre chaque pièce déséquilibrée et unifie le plan comptable paie"
            >
              {repairing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <AlertCircle className="w-3 h-3 mr-1" />}
              Réparer la balance
            </Button>
          )}
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="🔍 Filtrer par numéro ou libellé..."
            className="text-xs border rounded px-2 py-1 w-56"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Calcul des soldes par compte…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-sm text-red-600 p-4">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-slate-500 p-4">
            {comptes.length === 0
              ? (mois ? `Aucune écriture pour ${mois}` : "Aucune écriture")
              : "Aucun compte ne correspond au filtre"}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead className="w-24">Compte</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead className="text-right">Débit</TableHead>
                <TableHead className="text-right">Crédit</TableHead>
                <TableHead className="text-right">Solde</TableHead>
                <TableHead className="text-right">Écritures</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(c => (
                <React.Fragment key={c.compte}>
                  <TableRow
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => toggleExpand(c.compte)}
                  >
                    <TableCell>
                      {expanded.has(c.compte) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </TableCell>
                    <TableCell>
                      <Badge className={`font-mono text-xs ${classeColor(c.compte)} border-0`}>
                        {c.compte}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{c.libelle || <span className="text-slate-400 italic">—</span>}</TableCell>
                    <TableCell className="text-right text-sm text-red-600">
                      {c.debit_total > 0 ? fmt(c.debit_total) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm text-green-600">
                      {c.credit_total > 0 ? fmt(c.credit_total) : "—"}
                    </TableCell>
                    <TableCell className={`text-right text-sm font-bold ${c.solde > 0 ? 'text-red-700' : c.solde < 0 ? 'text-green-700' : 'text-slate-600'}`}>
                      {fmt(c.solde)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-slate-600">{c.nb_ecritures}</span>
                        {c.nb_lettrees > 0 && (
                          <span className="text-emerald-600 text-[10px]" title="Écritures lettrées">
                            ({c.nb_lettrees} ✓)
                          </span>
                        )}
                        <Link
                          href={`/client/ecritures?compte=${c.compte}${mois ? `&mois=${mois}` : ''}`}
                          onClick={e => e.stopPropagation()}
                          className="text-blue-600 hover:text-blue-800"
                          title="Voir toutes les écritures du compte"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expanded.has(c.compte) && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-slate-50 p-0">
                        <div className="p-3">
                          <p className="text-xs font-semibold text-slate-600 mb-2">
                            Dernières écritures ({c.sample.length} sur {c.nb_ecritures})
                          </p>
                          <table className="w-full text-xs">
                            <thead className="text-slate-500">
                              <tr>
                                <th className="text-left py-1">Date</th>
                                <th className="text-left py-1">Journal</th>
                                <th className="text-left py-1">Libellé</th>
                                <th className="text-right py-1">Débit</th>
                                <th className="text-right py-1">Crédit</th>
                                <th className="text-center py-1">Lettre</th>
                              </tr>
                            </thead>
                            <tbody>
                              {c.sample.map((s, idx) => (
                                <tr key={idx} className="border-t border-slate-200">
                                  <td className="py-1">{formatDate(s.date)}</td>
                                  <td className="py-1 font-mono">{s.journal}</td>
                                  <td className="py-1 max-w-[400px] truncate" title={s.libelle}>{s.libelle}</td>
                                  <td className="py-1 text-right text-red-600">{s.debit > 0 ? fmt(s.debit) : ''}</td>
                                  <td className="py-1 text-right text-green-600">{s.credit > 0 ? fmt(s.credit) : ''}</td>
                                  <td className="py-1 text-center">
                                    {s.lettre ? (
                                      <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">{s.lettre}</Badge>
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
              {totals && (
                <TableRow className="bg-slate-900 text-white font-bold">
                  <TableCell colSpan={3}>TOTAL</TableCell>
                  <TableCell className="text-right">{fmt(totals.debit_total)}</TableCell>
                  <TableCell className="text-right">{fmt(totals.credit_total)}</TableCell>
                  <TableCell className={`text-right ${Math.abs(totals.difference) < 0.01 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {Math.abs(totals.difference) < 0.01 ? (
                      <span className="flex items-center justify-end gap-1">
                        <CheckCircle2 className="w-4 h-4" /> 0.00
                      </span>
                    ) : (
                      fmt(totals.difference)
                    )}
                  </TableCell>
                  <TableCell className="text-right">{totals.nb_ecritures}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
