"use client"

import React, { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Calendar, CheckCircle2, Lock, AlertCircle, ChevronRight, Loader2 } from "lucide-react"

interface MonthStats {
  mois: string // YYYY-MM
  total_tx: number
  rapproche: number
  a_verifier: number
  non_identifie: number
  interne: number
  nb_factures: number
  factures_payees: number
  factures_retard: number
  factures_attente: number
  montant_factures_total: number
  ecritures_401_non_lettrees: number
  ecritures_411_non_lettrees: number
  solde_580: number
  reconciliation_status: string | null
  completion_pct: number
}

const MOIS_FR = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."]

function formatMoisLong(ym: string) {
  const [y, m] = ym.split("-")
  return `${MOIS_FR[parseInt(m, 10) - 1]} ${y}`
}

function statusBadge(status: string | null) {
  if (status === "locked") return <Badge className="bg-slate-900 text-white border-0 text-[10px]"><Lock className="w-2.5 h-2.5 mr-1" />Verrouillé</Badge>
  if (status === "validated") return <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px]"><CheckCircle2 className="w-2.5 h-2.5 mr-1" />Validé</Badge>
  if (status === "submitted") return <Badge className="bg-blue-100 text-blue-800 border-0 text-[10px]">Soumis</Badge>
  if (status === "draft") return <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px]">Brouillon</Badge>
  return <Badge variant="outline" className="text-[10px]">Ouvert</Badge>
}

export function PeriodeBar({
  societeId,
  activeMonth,
  onSelectMonth,
  onCloturer,
}: {
  societeId: string | null
  activeMonth: string | null
  onSelectMonth: (month: string | null) => void
  onCloturer?: (month: string) => void
}) {
  const [months, setMonths] = useState<MonthStats[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!societeId) return
    setLoading(true)
    fetch(`/api/comptable/rapprochement/mois-overview?societe_id=${societeId}`)
      .then(r => r.json())
      .then(d => setMonths(d.months || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [societeId])

  if (!societeId) return null
  if (loading && months.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement des périodes…
      </div>
    )
  }
  if (months.length === 0) return null

  const activeStats = months.find(m => m.mois === activeMonth)

  return (
    <Card className="border-2 border-[#D4AF37]/30 bg-gradient-to-r from-[#FFFAF0] to-white">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-[#0B0F2E]" />
          <h3 className="font-semibold text-sm text-[#0B0F2E]">
            Période active : {activeMonth ? formatMoisLong(activeMonth) : "Toutes périodes"}
          </h3>
          {activeStats && statusBadge(activeStats.reconciliation_status)}
          {activeStats && (
            <span className="text-xs text-slate-500 ml-2">
              {activeStats.completion_pct}% rapproché · {activeStats.a_verifier} à vérifier · {activeStats.non_identifie} inconnues · {activeStats.ecritures_401_non_lettrees} écritures à lettrer
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onSelectMonth(null)}
            >
              Toutes périodes
            </Button>
            {activeMonth && activeStats && activeStats.reconciliation_status !== "locked" && onCloturer && (
              <Button
                size="sm"
                className="h-7 text-xs bg-[#0B0F2E] hover:bg-[#1a1f4a] text-white"
                onClick={() => onCloturer(activeMonth)}
                disabled={activeStats.a_verifier > 0 || activeStats.non_identifie > 0}
                title={
                  activeStats.a_verifier > 0 || activeStats.non_identifie > 0
                    ? `${activeStats.a_verifier + activeStats.non_identifie} tx non classifiées - classez-les avant de clôturer`
                    : "Crée le tableau officiel + verrouille la période"
                }
              >
                <Lock className="w-3 h-3 mr-1" />
                Clôturer ce mois
              </Button>
            )}
          </div>
        </div>

        {/* Carrousel horizontal des mois */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {months.map(m => {
            const isActive = m.mois === activeMonth
            const hasIssue = m.a_verifier > 0 || m.non_identifie > 0 || m.ecritures_401_non_lettrees > 0
            return (
              <button
                key={m.mois}
                onClick={() => onSelectMonth(m.mois)}
                className={`shrink-0 min-w-[180px] text-left rounded-lg border-2 transition-all p-2 ${
                  isActive
                    ? "border-[#D4AF37] bg-white shadow-md"
                    : "border-slate-200 bg-white/60 hover:border-slate-300 hover:bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-semibold text-xs text-[#0B0F2E]">{formatMoisLong(m.mois)}</span>
                  {statusBadge(m.reconciliation_status)}
                </div>
                <div className="flex items-center gap-1 mb-1">
                  <Progress value={m.completion_pct} className="h-1.5 flex-1" />
                  <span className="text-[10px] font-mono text-slate-600 w-8 text-right">{m.completion_pct}%</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-600">
                  <span>{m.total_tx} tx</span>
                  {m.a_verifier > 0 && <span className="text-amber-600">• {m.a_verifier} ⚠</span>}
                  {m.non_identifie > 0 && <span className="text-red-600">• {m.non_identifie} ?</span>}
                  {m.ecritures_401_non_lettrees > 0 && <span className="text-blue-600">• {m.ecritures_401_non_lettrees} 401</span>}
                </div>
                {isActive && <ChevronRight className="w-3 h-3 text-[#D4AF37] absolute" />}
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
