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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table"
import {
  ArrowLeft, Download, Send, Pencil, CheckCircle2, Landmark, Loader2,
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

// ---------------------------------------------------------------------------
// Types (mirrors GET /api/comptable/etats-financiers?type=bilan)
// ---------------------------------------------------------------------------
interface BilanPayload {
  type: 'bilan'
  periode?: { date_debut: string | null; date_fin: string | null; exercice: string | null }
  actif: {
    non_courant: { immo_corp: number; immo_incorp: number; amortissements: number; immo_fin: number; total: number }
    courant: { stocks: number; clients_brut: number; provision_clients: number; clients: number; autres_creances: number; tresorerie: number; total: number }
    total: number
  }
  passif: {
    capitaux_propres: { capital: number; reserves: number; report_nvx: number; resultat_exercice: number; total: number }
    dettes_lt: { emprunts_lt: number; total: number }
    dettes_ct: { fournisseurs: number; dettes_fisc: number; autres_dettes: number; total: number }
    total: number
  }
  equilibre: boolean
  delta: number
}

interface ExerciceRow {
  annee: string
  date_debut: string
  date_fin: string
}

export default function BilanOfficielPage() {
  const params = useParams()
  const locale = getLocale()
  const clientId = params.clientId as string
  const societeId = params.societeId as string

  const [societeName, setSocieteName] = useState("…")
  const [exercises, setExercises] = useState<ExerciceRow[]>([])
  const [selectedExercise, setSelectedExercise] = useState<string>("")
  const [bilan, setBilan] = useState<BilanPayload | null>(null)
  const [tresorerieDetail, setTresorerieDetail] = useState<Array<{ banque: string; montant: number }>>([])
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [loadingBilan, setLoadingBilan] = useState(true)
  const [status, setStatus] = useState<"brouillon" | "finalise" | "audite">("brouillon")

  const statuses: Record<string, { label: string; color: string }> = {
    brouillon: { label: t('cabclt.bilan.status_draft', locale), color: "bg-orange-100 text-orange-700" },
    finalise:  { label: t('cabclt.bilan.status_finalized', locale), color: "bg-blue-100 text-blue-700" },
    audite:    { label: t('cabclt.bilan.status_audited', locale), color: "bg-green-100 text-green-700" },
  }

  // -------------------------------------------------------------------------
  // Load société + exercices + trésorerie (one-shot)
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

        if (socRes.error) notifyError(t('cptb.bilan.err_load_company', locale), socRes.error.message)
        setSocieteName(socRes.data?.nom || "—")

        if (exRes.error) {
          notifyError(t('cptb.bilan.err_load_exercises', locale), exRes.error.message)
          setExercises([])
        } else {
          const rows = (exRes.data || []) as ExerciceRow[]
          setExercises(rows)
          if (rows.length > 0) setSelectedExercise(rows[0].annee)
        }

        if (!banksRes.error) {
          setTresorerieDetail(
            (banksRes.data || []).map((b: any) => ({
              banque: `${b.banque || "—"}${b.numero_compte ? " " + b.numero_compte : ""}${b.devise && b.devise !== "MUR" ? " (" + b.devise + ")" : ""}`,
              montant: Number(b.solde_actuel || 0),
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
  // Load bilan whenever selected exercise changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    async function loadBilan() {
      if (!societeId) return
      setLoadingBilan(true)
      try {
        const qs = new URLSearchParams({ societe_id: societeId, type: "bilan" })
        if (selectedExercise) qs.set("exercice", selectedExercise)
        const res = await fetch(`/api/comptable/etats-financiers?${qs.toString()}`)
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          if (!cancelled) {
            notifyError(t('cptb.bilan.err_load_balance', locale), err?.error || res.statusText)
            setBilan(null)
          }
          return
        }
        const data = await res.json()
        if (cancelled) return
        // Endpoint may return { message, data: null, type } when no écritures
        if (!data || data.type !== "bilan") {
          setBilan(null)
        } else {
          setBilan(data as BilanPayload)
        }
      } catch {
        if (!cancelled) {
          notifyError(t('cptb.bilan.err_load_balance', locale))
          setBilan(null)
        }
      } finally {
        if (!cancelled) setLoadingBilan(false)
      }
    }
    loadBilan()
    return () => {
      cancelled = true
    }
  }, [societeId, selectedExercise])

  // -------------------------------------------------------------------------
  // Derived rows (from real bilan payload)
  // -------------------------------------------------------------------------
  const actifNonCourant = bilan
    ? [
        { compte: t('cabclt.bilan.tangible_assets', locale),          montant: bilan.actif.non_courant.immo_corp },
        { compte: t('cabclt.bilan.intangible_assets', locale),        montant: bilan.actif.non_courant.immo_incorp },
        { compte: t('cabclt.bilan.accumulated_depreciation', locale), montant: -bilan.actif.non_courant.amortissements },
      ]
    : []

  const actifCourant = bilan
    ? [
        { compte: t('cabclt.bilan.trade_receivables', locale), montant: bilan.actif.courant.clients },
        { compte: t('cabclt.bilan.stocks', locale),            montant: bilan.actif.courant.stocks },
        { compte: t('cabclt.bilan.cash_equivalents', locale),  montant: bilan.actif.courant.tresorerie },
      ]
    : []

  const capitauxPropres = bilan
    ? [
        { compte: t('cabclt.bilan.share_capital', locale),     montant: bilan.passif.capitaux_propres.capital },
        { compte: t('cabclt.bilan.legal_reserves', locale),    montant: bilan.passif.capitaux_propres.reserves },
        { compte: t('cabclt.bilan.retained_earnings', locale), montant: bilan.passif.capitaux_propres.report_nvx + bilan.passif.capitaux_propres.resultat_exercice },
      ]
    : []

  const passifCourant = bilan
    ? [
        { compte: t('cabclt.bilan.suppliers', locale),       montant: bilan.passif.dettes_ct.fournisseurs },
        { compte: t('cabclt.bilan.vat_payable', locale),     montant: bilan.passif.dettes_ct.dettes_fisc },
        { compte: t('cabclt.bilan.csg_nsf_payable', locale), montant: bilan.passif.dettes_ct.autres_dettes },
      ]
    : []

  const totalActifNonCourant = bilan?.actif.non_courant.total ?? 0
  const totalActifCourant    = bilan?.actif.courant.total ?? 0
  const totalActif           = bilan?.actif.total ?? 0

  const totalCapitaux        = bilan?.passif.capitaux_propres.total ?? 0
  const totalPassifCourant   = bilan?.passif.dettes_ct.total ?? 0
  const totalPassif          = bilan?.passif.total ?? 0

  const equilibre = bilan?.equilibre ?? false

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: "#F4F6FB" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Link href={`/comptable/clients/${clientId}/${societeId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" /> {t('cabclt.bilan.back', locale)}
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            {t('cabclt.bilan.title', locale)} — {loadingMeta ? "…" : societeName}
          </h1>
          <p className="text-sm text-gray-500">
            {t('cabclt.bilan.subtitle', locale)}
          </p>
        </div>
        <Badge className={statuses[status].color}>{statuses[status].label}</Badge>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium" style={{ color: NAVY }}>{t('cabclt.bilan.fiscal_year_label', locale)}</label>
          <select
            value={selectedExercise}
            onChange={(e) => setSelectedExercise(e.target.value)}
            className="border rounded-md px-3 py-1.5 text-sm"
            disabled={loadingMeta || exercises.length === 0}
          >
            {exercises.length === 0 && <option value="">—</option>}
            {exercises.map((ex) => (
              <option key={ex.annee} value={ex.annee}>{ex.annee}</option>
            ))}
          </select>
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setStatus("brouillon")}>
          <Pencil className="w-4 h-4 mr-1" /> {t('cabclt.bilan.edit', locale)}
        </Button>
        <Button
          size="sm"
          style={{ background: GOLD, color: NAVY }}
          onClick={() => setStatus("finalise")}
        >
          <CheckCircle2 className="w-4 h-4 mr-1" /> {t('cabclt.bilan.finalize', locale)}
        </Button>
        <Button size="sm" variant="outline">
          <Send className="w-4 h-4 mr-1" /> {t('cabclt.bilan.publish', locale)}
        </Button>
        <Button size="sm" variant="outline">
          <Download className="w-4 h-4 mr-1" /> {t('cabclt.bilan.export_pdf', locale)}
        </Button>
      </div>

      {/* Loading / empty states */}
      {loadingBilan && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
        </div>
      )}

      {!loadingBilan && !bilan && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t('cptb.bilan.empty_no_entries', locale)}
          </CardContent>
        </Card>
      )}

      {!loadingBilan && bilan && (
        <>
          {/* Equilibré badge */}
          {equilibre && (
            <div className="flex justify-center">
              <Badge className="bg-green-100 text-green-700 text-base px-4 py-1">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {t('cabclt.bilan.balanced', locale)} = {fmt(totalActif)}
              </Badge>
            </div>
          )}

          {/* 2-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ACTIF */}
            <Card className="border-t-4" style={{ borderTopColor: NAVY }}>
              <CardHeader>
                <CardTitle style={{ color: NAVY }}>{t('cabclt.bilan.assets', locale)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Non-courant */}
                <div>
                  <h3 className="font-semibold text-sm mb-2" style={{ color: NAVY }}>
                    {t('cabclt.bilan.non_current_assets', locale)}
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('cabclt.bilan.col_account', locale)}</TableHead>
                        <TableHead className="text-right">{t('cabclt.bilan.col_amount', locale)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {actifNonCourant.map((r) => (
                        <TableRow key={r.compte}>
                          <TableCell className="text-sm">{r.compte}</TableCell>
                          <TableCell className={`text-right text-sm font-medium ${r.montant < 0 ? "text-red-600" : ""}`}>
                            {fmt(r.montant)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-bold">{t('cabclt.bilan.subtotal', locale)}</TableCell>
                        <TableCell className="text-right font-bold">{fmt(totalActifNonCourant)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>

                {/* Courant */}
                <div>
                  <h3 className="font-semibold text-sm mb-2" style={{ color: NAVY }}>
                    {t('cabclt.bilan.current_assets', locale)}
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('cabclt.bilan.col_account', locale)}</TableHead>
                        <TableHead className="text-right">{t('cabclt.bilan.col_amount', locale)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {actifCourant.map((r) => (
                        <TableRow key={r.compte}>
                          <TableCell className="text-sm">{r.compte}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{fmt(r.montant)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-bold">{t('cabclt.bilan.subtotal', locale)}</TableCell>
                        <TableCell className="text-right font-bold">{fmt(totalActifCourant)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>

                {/* Total Actif */}
                <div className="rounded-lg p-3" style={{ background: NAVY }}>
                  <div className="flex justify-between text-white font-bold text-lg">
                    <span>{t('cabclt.bilan.total_assets', locale)}</span>
                    <span>{fmt(totalActif)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* PASSIF */}
            <Card className="border-t-4" style={{ borderTopColor: GOLD }}>
              <CardHeader>
                <CardTitle style={{ color: NAVY }}>{t('cabclt.bilan.liabilities', locale)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Capitaux Propres */}
                <div>
                  <h3 className="font-semibold text-sm mb-2" style={{ color: NAVY }}>
                    {t('cabclt.bilan.equity', locale)}
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('cabclt.bilan.col_account', locale)}</TableHead>
                        <TableHead className="text-right">{t('cabclt.bilan.col_amount', locale)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {capitauxPropres.map((r) => (
                        <TableRow key={r.compte}>
                          <TableCell className="text-sm">{r.compte}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{fmt(r.montant)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-bold">{t('cabclt.bilan.subtotal', locale)}</TableCell>
                        <TableCell className="text-right font-bold">{fmt(totalCapitaux)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>

                {/* Passif courant */}
                <div>
                  <h3 className="font-semibold text-sm mb-2" style={{ color: NAVY }}>
                    {t('cabclt.bilan.current_liabilities', locale)}
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('cabclt.bilan.col_account', locale)}</TableHead>
                        <TableHead className="text-right">{t('cabclt.bilan.col_amount', locale)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {passifCourant.map((r) => (
                        <TableRow key={r.compte}>
                          <TableCell className="text-sm">{r.compte}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{fmt(r.montant)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-bold">{t('cabclt.bilan.subtotal', locale)}</TableCell>
                        <TableCell className="text-right font-bold">{fmt(totalPassifCourant)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>

                {/* Total Passif */}
                <div className="rounded-lg p-3" style={{ background: NAVY }}>
                  <div className="flex justify-between text-white font-bold text-lg">
                    <span>{t('cabclt.bilan.total_liabilities', locale)}</span>
                    <span>{fmt(totalPassif)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Trésorerie note */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2" style={{ color: NAVY }}>
                <Landmark className="w-5 h-5" />
                {t('cabclt.bilan.treasury_note_title', locale)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-3">
                {t('cabclt.bilan.treasury_note_desc', locale)}
              </p>
              {tresorerieDetail.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  {t('cptb.bilan.no_active_bank', locale)}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('cabclt.bilan.bank_account', locale)}</TableHead>
                      <TableHead className="text-right">{t('cabclt.bilan.balance', locale)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tresorerieDetail.map((r) => (
                      <TableRow key={r.banque}>
                        <TableCell className="text-sm">{r.banque}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{fmt(r.montant)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-bold">{t('cabclt.bilan.total_treasury', locale)}</TableCell>
                      <TableCell className="text-right font-bold">
                        {fmt(tresorerieDetail.reduce((s, r) => s + r.montant, 0))}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
