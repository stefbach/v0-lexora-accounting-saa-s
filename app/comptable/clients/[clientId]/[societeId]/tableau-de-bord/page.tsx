"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { useState, useEffect } from "react"
import { notifyError } from "@/lib/utils/toast"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft, RefreshCw, Send, TrendingUp, Landmark,
  ShieldCheck, Zap, Loader2,
} from "lucide-react"
import { t, getLocale } from '@/lib/i18n'

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) {
  return n.toLocaleString("fr-FR") + " MUR"
}

function pct(n: number) {
  return (Math.round(n * 100) / 100).toFixed(1) + "%"
}

interface ScoreCard {
  titre: string
  score: string
  scoreColor: string
  items: { label: string; value: string; color: string }[]
  icon: React.ReactNode
}

interface ExerciceRow {
  annee: string
  date_debut: string
  date_fin: string
}

interface BilanPayload {
  type: 'bilan'
  actif: {
    non_courant: { total: number }
    courant: { stocks: number; clients: number; tresorerie: number; total: number }
    total: number
  }
  passif: {
    capitaux_propres: { total: number }
    dettes_lt: { emprunts_lt: number; total: number }
    dettes_ct: { fournisseurs: number; dettes_fisc: number; autres_dettes: number; total: number }
    total: number
  }
}

interface PnlPayload {
  type: 'pnl'
  produits: { total: number }
  charges: { achats: number; charges_perso: number; total: number }
  resultats: { resultat_exploitation: number; ebitda: number; resultat_net: number }
  marges: { marge_brute_pct: number; marge_expl_pct: number }
}

// Score helper (seuils métier simples)
function scoreLiquidite(ratio: number): { score: string; color: string } {
  if (ratio >= 1.5) return { score: "A", color: "bg-green-100 text-green-700" }
  if (ratio >= 1)   return { score: "B", color: "bg-orange-100 text-orange-700" }
  return { score: "C", color: "bg-red-100 text-red-700" }
}
function scoreRentab(margeNet: number): { score: string; color: string } {
  if (margeNet >= 10) return { score: "A", color: "bg-green-100 text-green-700" }
  if (margeNet >= 3)  return { score: "B", color: "bg-orange-100 text-orange-700" }
  return { score: "C", color: "bg-red-100 text-red-700" }
}
function scoreStructure(debtEquity: number): { score: string; color: string } {
  if (debtEquity <= 1)   return { score: "A", color: "bg-green-100 text-green-700" }
  if (debtEquity <= 2)   return { score: "B", color: "bg-orange-100 text-orange-700" }
  return { score: "C", color: "bg-red-100 text-red-700" }
}
function scoreEfficacite(dso: number): { score: string; color: string } {
  if (dso <= 30) return { score: "A", color: "bg-green-100 text-green-700" }
  if (dso <= 60) return { score: "B", color: "bg-orange-100 text-orange-700" }
  return { score: "C", color: "bg-red-100 text-red-700" }
}

export default function TableauDeBordPage() {
  const params = useParams()
  const locale = getLocale()
  const clientId = params.clientId as string
  const societeId = params.societeId as string

  const [societeName, setSocieteName] = useState("…")
  const [exercises, setExercises] = useState<ExerciceRow[]>([])
  const [selectedExercise, setSelectedExercise] = useState<string>("")
  const [tresorerieComptes, setTresorerieComptes] = useState<Array<{ banque: string; solde: number }>>([])
  const [bilan, setBilan] = useState<BilanPayload | null>(null)
  const [pnl, setPnl] = useState<PnlPayload | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [loadingFin, setLoadingFin] = useState(true)

  // -------------------------------------------------------------------------
  // Load société + exercices + comptes bancaires (once)
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!societeId) return
      setLoadingMeta(true)
      try {
        const supabase = createClient()
        const [socRes, exRes, banksRes] = await Promise.all([
          supabase.from("societes").select("nom").eq("id", societeId).maybeSingle(),
          supabase
            .from("exercices_fiscaux")
            .select("annee, date_debut, date_fin")
            .eq("societe_id", societeId)
            .order("date_debut", { ascending: false }),
          supabase
            .from("comptes_bancaires")
            .select("banque, numero_compte, devise, solde_actuel")
            .eq("societe_id", societeId)
            .eq("actif", true),
        ])
        if (cancelled) return

        if (socRes.error) notifyError(t('cptb.tdb.err_load_company', locale), socRes.error.message)
        setSocieteName(socRes.data?.nom || "—")

        if (exRes.error) {
          notifyError(t('cptb.tdb.err_load_exercises', locale), exRes.error.message)
          setExercises([])
        } else {
          const rows = (exRes.data || []) as ExerciceRow[]
          setExercises(rows)
          if (rows.length > 0) setSelectedExercise(rows[0].annee)
        }

        if (!banksRes.error) {
          setTresorerieComptes(
            (banksRes.data || []).map((b: any) => ({
              banque: `${b.banque || "—"}${b.numero_compte ? " " + b.numero_compte : ""}${b.devise && b.devise !== "MUR" ? " (" + b.devise + ")" : ""}`,
              solde: Number(b.solde_actuel || 0),
            })),
          )
        }
      } finally {
        if (!cancelled) setLoadingMeta(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [societeId])

  // -------------------------------------------------------------------------
  // Load bilan + pnl whenever exercise changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    async function loadFin() {
      if (!societeId) return
      setLoadingFin(true)
      try {
        const qsBilan = new URLSearchParams({ societe_id: societeId, type: "bilan" })
        const qsPnl   = new URLSearchParams({ societe_id: societeId, type: "pnl" })
        if (selectedExercise) {
          qsBilan.set("exercice", selectedExercise)
          qsPnl.set("exercice", selectedExercise)
        }
        const [biRes, pnlRes] = await Promise.all([
          fetch(`/api/comptable/etats-financiers?${qsBilan.toString()}`),
          fetch(`/api/comptable/etats-financiers?${qsPnl.toString()}`),
        ])
        const biData  = biRes.ok ? await biRes.json() : null
        const pnlData = pnlRes.ok ? await pnlRes.json() : null
        if (cancelled) return
        setBilan(biData?.type === "bilan" ? (biData as BilanPayload) : null)
        setPnl(pnlData?.type === "pnl" ? (pnlData as PnlPayload) : null)
      } catch {
        if (!cancelled) {
          notifyError(t('cptb.tdb.err_load_financials', locale))
          setBilan(null)
          setPnl(null)
        }
      } finally {
        if (!cancelled) setLoadingFin(false)
      }
    }
    loadFin()
    return () => {
      cancelled = true
    }
  }, [societeId, selectedExercise])

  // -------------------------------------------------------------------------
  // Derived KPIs (only if bilan + pnl available)
  // -------------------------------------------------------------------------
  const totalTresorerie = tresorerieComptes.reduce((s, c) => s + c.solde, 0)

  // Liquidité — Actif courant / Dettes CT
  const liqRatio = bilan && bilan.passif.dettes_ct.total > 0
    ? bilan.actif.courant.total / bilan.passif.dettes_ct.total
    : 0
  const tresorerieBilan = bilan?.actif.courant.tresorerie ?? totalTresorerie
  // Couverture dettes CT par tréso
  const coverageCT = bilan && bilan.passif.dettes_ct.total > 0
    ? tresorerieBilan / bilan.passif.dettes_ct.total
    : 0

  // Rentabilité
  const margeNette = pnl && pnl.produits.total > 0
    ? (pnl.resultats.resultat_net / pnl.produits.total) * 100
    : 0
  const ebitda = pnl?.resultats.ebitda ?? 0
  const roe = bilan && bilan.passif.capitaux_propres.total > 0
    ? ((pnl?.resultats.resultat_net ?? 0) / bilan.passif.capitaux_propres.total) * 100
    : 0

  // Structure
  const debtEquity = bilan && bilan.passif.capitaux_propres.total > 0
    ? (bilan.passif.dettes_lt.total + bilan.passif.dettes_ct.total) / bilan.passif.capitaux_propres.total
    : 0
  const autonomie = bilan && bilan.passif.total > 0
    ? (bilan.passif.capitaux_propres.total / bilan.passif.total) * 100
    : 0

  // Efficacité — DSO ≈ clients / CA * 365 ; DPO ≈ fournisseurs / achats * 365
  const dso = bilan && pnl && pnl.produits.total > 0
    ? (bilan.actif.courant.clients / pnl.produits.total) * 365
    : 0
  const dpo = bilan && pnl && pnl.charges.achats > 0
    ? (bilan.passif.dettes_ct.fournisseurs / pnl.charges.achats) * 365
    : 0
  // Runway = trésorerie / (charges_perso mensuelles)
  const mensualPerso = pnl ? pnl.charges.charges_perso / 12 : 0
  const runwayMois = mensualPerso > 0 ? tresorerieBilan / mensualPerso : 0

  const sLiq    = scoreLiquidite(liqRatio)
  const sRent   = scoreRentab(margeNette)
  const sStruct = scoreStructure(debtEquity)
  const sEff    = scoreEfficacite(dso)

  // Score global : moyenne pondérée (lettre vers note 4/3/2)
  function noteOf(s: string) {
    return s === "A" ? 4 : s === "B" ? 3 : 2
  }
  const avg = (noteOf(sLiq.score) + noteOf(sRent.score) + noteOf(sStruct.score) + noteOf(sEff.score)) / 4
  const globalScore = avg >= 3.5 ? "A" : avg >= 2.5 ? "B" : "C"
  const globalColor = avg >= 3.5 ? "text-green-700 bg-green-100" : avg >= 2.5 ? "text-orange-700 bg-orange-100" : "text-red-700 bg-red-100"

  const colorFromScore = (s: string) => s === "A" ? "text-green-600" : s === "B" ? "text-orange-600" : "text-red-600"

  const quadrants: ScoreCard[] = [
    {
      titre: t('cabclt.tdb.quad_liquidity', locale),
      score: sLiq.score,
      scoreColor: sLiq.color,
      icon: <Landmark className="w-5 h-5" />,
      items: [
        { label: t('cabclt.tdb.liq_ratio', locale),         value: liqRatio.toFixed(2) + "x",  color: colorFromScore(sLiq.score) },
        { label: t('cabclt.tdb.net_treasury', locale),      value: fmt(Math.round(tresorerieBilan)), color: tresorerieBilan > 0 ? "text-green-600" : "text-red-600" },
        { label: t('cabclt.tdb.st_debt_coverage', locale),  value: coverageCT.toFixed(2) + "x", color: colorFromScore(sLiq.score) },
      ],
    },
    {
      titre: t('cabclt.tdb.quad_profitability', locale),
      score: sRent.score,
      scoreColor: sRent.color,
      icon: <TrendingUp className="w-5 h-5" />,
      items: [
        { label: t('cabclt.tdb.net_margin', locale), value: pct(margeNette), color: colorFromScore(sRent.score) },
        { label: "EBITDA",                            value: fmt(Math.round(ebitda)), color: ebitda > 0 ? "text-green-600" : "text-red-600" },
        { label: "ROE",                               value: pct(roe), color: colorFromScore(sRent.score) },
      ],
    },
    {
      titre: t('cabclt.tdb.quad_structure', locale),
      score: sStruct.score,
      scoreColor: sStruct.color,
      icon: <ShieldCheck className="w-5 h-5" />,
      items: [
        { label: t('cabclt.tdb.debt_equity', locale),    value: debtEquity.toFixed(2) + "x", color: colorFromScore(sStruct.score) },
        { label: t('cabclt.tdb.fin_autonomy', locale),   value: pct(autonomie),               color: colorFromScore(sStruct.score) },
        { label: t('cabclt.tdb.debt_capacity', locale),  value: sStruct.score === "A" ? t('cabclt.tdb.good', locale) : "—", color: colorFromScore(sStruct.score) },
      ],
    },
    {
      titre: t('cabclt.tdb.quad_efficiency', locale),
      score: sEff.score,
      scoreColor: sEff.color,
      icon: <Zap className="w-5 h-5" />,
      items: [
        { label: t('cabclt.tdb.dso', locale),     value: Math.round(dso) + " " + t('cabclt.tdb.days', locale),  color: colorFromScore(sEff.score) },
        { label: t('cabclt.tdb.dpo', locale),     value: Math.round(dpo) + " " + t('cabclt.tdb.days', locale),  color: dpo >= 30 ? "text-green-600" : "text-orange-600" },
        { label: "Runway",                        value: runwayMois > 0 ? runwayMois.toFixed(1) + " " + t('cabclt.tdb.months', locale) : "—", color: runwayMois > 6 ? "text-green-600" : "text-orange-600" },
      ],
    },
  ]

  const periods = exercises.map((e) => e.annee)

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: "#F4F6FB" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Link href={`/comptable/clients/${clientId}/${societeId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" /> {t('cabclt.tdb.back', locale)}
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            {t('cabclt.tdb.title', locale)} — {loadingMeta ? "…" : societeName}
          </h1>
          <p className="text-sm text-gray-500">
            {t('cabclt.tdb.subtitle', locale)}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium" style={{ color: NAVY }}>{t('cabclt.tdb.period_label', locale)}</label>
          <select
            value={selectedExercise}
            onChange={(e) => setSelectedExercise(e.target.value)}
            className="border rounded-md px-3 py-1.5 text-sm"
            disabled={loadingMeta || periods.length === 0}
          >
            {periods.length === 0 && <option value="">—</option>}
            {periods.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSelectedExercise((v) => v)}>
          <RefreshCw className="w-4 h-4 mr-1" /> {t('cabclt.tdb.regenerate', locale)}
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="outline">
          <Send className="w-4 h-4 mr-1" /> {t('cabclt.tdb.publish', locale)}
        </Button>
      </div>

      {loadingFin && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
        </div>
      )}

      {!loadingFin && !bilan && !pnl && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t('cptb.tdb.empty_no_entries', locale)}
          </CardContent>
        </Card>
      )}

      {!loadingFin && (bilan || pnl) && (
        <>
          {/* Score Global */}
          <Card className="border-l-4" style={{ borderLeftColor: GOLD }}>
            <CardContent className="flex items-center gap-6 py-5">
              <div className="flex flex-col items-center">
                <span className="text-xs font-medium text-gray-500 mb-1">{t('cabclt.tdb.global_score', locale)}</span>
                <span className={`text-4xl font-black rounded-xl w-16 h-16 flex items-center justify-center ${globalColor}`}>
                  {globalScore}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold mb-1" style={{ color: NAVY }}>
                  {t('cabclt.tdb.ai_advice', locale)}
                </p>
                <p className="text-sm text-gray-600">
                  {t('cabclt.tdb.ai_advice_pre', locale)} {societeName} {t('cabclt.tdb.ai_advice_mid', locale)} {fmt(Math.round(totalTresorerie))}. {t('cabclt.tdb.ai_advice_post', locale)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Trésorerie consolidée */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2" style={{ color: NAVY }}>
                <Landmark className="w-5 h-5" />
                {t('cabclt.tdb.consolidated_treasury', locale)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 mb-4">
                <span className="text-3xl font-bold" style={{ color: NAVY }}>
                  {fmt(Math.round(totalTresorerie))}
                </span>
              </div>
              {tresorerieComptes.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  {t('cptb.tdb.no_active_bank', locale)}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {tresorerieComptes.map((c) => (
                    <div key={c.banque} className="rounded-lg border p-3 flex flex-col">
                      <span className="text-xs text-gray-500 font-medium">{c.banque}</span>
                      <span className="text-lg font-bold" style={{ color: NAVY }}>
                        {fmt(Math.round(c.solde))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 4 quadrants */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {quadrants.map((q) => (
              <Card key={q.titre} className="border-t-4" style={{ borderTopColor: NAVY }}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base" style={{ color: NAVY }}>
                      {q.icon}
                      {q.titre}
                    </CardTitle>
                    <Badge className={q.scoreColor + " text-lg font-bold px-3"}>
                      {q.score}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {q.items.map((item) => (
                      <div key={item.label} className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{item.label}</span>
                        <span className={`text-sm font-semibold ${item.color}`}>
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
