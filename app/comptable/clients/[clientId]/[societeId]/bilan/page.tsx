"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table"
import {
  ArrowLeft, FileText, Download, Send, Pencil, CheckCircle2, Landmark,
  Loader2, AlertCircle, FileSpreadsheet,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) {
  return Math.round(n).toLocaleString("fr-FR") + " MUR"
}

function deltaPct(current: number, prev: number): string | null {
  if (!prev || prev === 0) return null
  const pct = ((current - prev) / Math.abs(prev)) * 100
  const sign = pct >= 0 ? "+" : ""
  return `${sign}${pct.toFixed(1)}%`
}

// ---------------------------------------------------------------------------
// Types matching the API response
// ---------------------------------------------------------------------------
type BilanActif = {
  non_courant: { immo_corp: number; immo_incorp: number; amortissements: number; immo_fin: number; total: number }
  courant: { stocks: number; clients: number; autres_creances: number; tresorerie: number; total: number }
  total: number
}
type BilanPassif = {
  capitaux_propres: { capital: number; reserves: number; report_nvx: number; resultat_net: number; total: number }
  dettes_lt: { emprunts_lt: number; total: number }
  dettes_ct: { fournisseurs: number; dettes_fisc: number; autres_dettes: number; total: number }
  total: number
}
type BilanData = {
  actif: BilanActif
  passif: BilanPassif
  equilibre: boolean
  delta: number
}
type PnlData = {
  produits: { ca_services: number; ca_ventes: number; autres_produits: number; total: number }
  charges: { achats: number; charges_perso: number; autres_charges: number; dotations: number; total: number }
  resultats: {
    resultat_exploitation: number
    ebitda: number
    resultat_financier: number
    resultat_exceptionnel: number
    resultat_avant_is: number
    impot_societes: number
    resultat_net: number
  }
}
type ParClasse = { classe: string; total_debit: number; total_credit: number; solde: number; nb_ecritures: number }

type ApiResponse = {
  ok: boolean
  error?: string
  message?: string
  bilan: BilanData | null
  pnl: PnlData | null
  par_classe: ParClasse[]
  bilan_n1: BilanData | null
  pnl_n1: PnlData | null
  rpc_used: boolean
  periode: { date_debut: string | null; date_fin: string | null; exercice: string | null }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const exercises = ["2025-2026", "2024-2025", "2023-2024"]

const statuses: Record<string, { label: string; color: string }> = {
  brouillon: { label: "Brouillon", color: "bg-orange-100 text-orange-700" },
  finalise: { label: "Finalisé", color: "bg-blue-100 text-blue-700" },
  audite: { label: "Audité", color: "bg-green-100 text-green-700" },
}

export default function BilanOfficielPage() {
  const params = useParams()
  const clientId = params.clientId as string
  const societeId = params.societeId as string

  const [selectedExercise, setSelectedExercise] = useState(exercises[0])
  const [status, setStatus] = useState<"brouillon" | "finalise" | "audite">("brouillon")
  const [comparatif, setComparatif] = useState<boolean>(true)

  // API state
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Societe name (best-effort fetch)
  const [societeName, setSocieteName] = useState<string>("—")

  useEffect(() => {
    if (!societeId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    const qp = new URLSearchParams()
    qp.set("societe_id", societeId)
    qp.set("exercice", selectedExercise)
    qp.set("comparatif_n1", comparatif ? "true" : "false")
    fetch(`/api/comptable/etats-financiers?${qp.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error || `Erreur HTTP ${res.status}`)
        }
        return res.json() as Promise<ApiResponse>
      })
      .then((json) => {
        if (cancelled) return
        setData(json)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "Erreur de chargement")
        setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [societeId, selectedExercise, comparatif])

  // Fetch société name for display
  useEffect(() => {
    if (!societeId) return
    let cancelled = false
    fetch(`/api/comptable/societes?id=${societeId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (cancelled || !j) return
        const name = j?.societe?.nom || j?.data?.nom || j?.nom
        if (name) setSocieteName(name)
      })
      .catch(() => { /* ignore, keep fallback */ })
    return () => { cancelled = true }
  }, [societeId])

  const bilan = data?.bilan ?? null
  const bilanN1 = data?.bilan_n1 ?? null
  const equilibre = bilan?.equilibre ?? false
  const hasData = !!bilan

  // Rows helpers computed from API
  const actifNonCourant = useMemo(() => {
    if (!bilan) return [] as { compte: string; montant: number; prev?: number }[]
    const nc = bilan.actif.non_courant
    const ncP = bilanN1?.actif.non_courant
    return [
      { compte: "Immobilisations corporelles", montant: nc.immo_corp, prev: ncP?.immo_corp },
      { compte: "Immobilisations incorporelles", montant: nc.immo_incorp, prev: ncP?.immo_incorp },
      { compte: "Immobilisations financières", montant: nc.immo_fin, prev: ncP?.immo_fin },
      { compte: "Amortissements cumulés", montant: -nc.amortissements, prev: ncP ? -ncP.amortissements : undefined },
    ].filter((r) => r.montant !== 0 || (r.prev !== undefined && r.prev !== 0))
  }, [bilan, bilanN1])

  const actifCourant = useMemo(() => {
    if (!bilan) return [] as { compte: string; montant: number; prev?: number }[]
    const c = bilan.actif.courant
    const cP = bilanN1?.actif.courant
    return [
      { compte: "Stocks", montant: c.stocks, prev: cP?.stocks },
      { compte: "Créances clients", montant: c.clients, prev: cP?.clients },
      { compte: "Autres créances", montant: c.autres_creances, prev: cP?.autres_creances },
      { compte: "Trésorerie et équivalents", montant: c.tresorerie, prev: cP?.tresorerie },
    ].filter((r) => r.montant !== 0 || (r.prev !== undefined && r.prev !== 0))
  }, [bilan, bilanN1])

  const capitauxPropres = useMemo(() => {
    if (!bilan) return [] as { compte: string; montant: number; prev?: number }[]
    const cp = bilan.passif.capitaux_propres
    const cpP = bilanN1?.passif.capitaux_propres
    return [
      { compte: "Capital social", montant: cp.capital, prev: cpP?.capital },
      { compte: "Réserves", montant: cp.reserves, prev: cpP?.reserves },
      { compte: "Report à nouveau", montant: cp.report_nvx, prev: cpP?.report_nvx },
      { compte: "Résultat de l'exercice", montant: cp.resultat_net, prev: cpP?.resultat_net },
    ].filter((r) => r.montant !== 0 || (r.prev !== undefined && r.prev !== 0))
  }, [bilan, bilanN1])

  const passifCourant = useMemo(() => {
    if (!bilan) return [] as { compte: string; montant: number; prev?: number }[]
    const dc = bilan.passif.dettes_ct
    const dcP = bilanN1?.passif.dettes_ct
    const lt = bilan.passif.dettes_lt
    const ltP = bilanN1?.passif.dettes_lt
    return [
      { compte: "Emprunts LT", montant: lt.emprunts_lt, prev: ltP?.emprunts_lt },
      { compte: "Fournisseurs", montant: dc.fournisseurs, prev: dcP?.fournisseurs },
      { compte: "Dettes fiscales & sociales", montant: dc.dettes_fisc, prev: dcP?.dettes_fisc },
      { compte: "Autres dettes", montant: dc.autres_dettes, prev: dcP?.autres_dettes },
    ].filter((r) => r.montant !== 0 || (r.prev !== undefined && r.prev !== 0))
  }, [bilan, bilanN1])

  const totalActifNonCourant = bilan?.actif.non_courant.total ?? 0
  const totalActifCourant    = bilan?.actif.courant.total ?? 0
  const totalActif           = bilan?.actif.total ?? 0
  const totalCapitaux        = bilan?.passif.capitaux_propres.total ?? 0
  const totalPassifCT        = bilan?.passif.dettes_ct.total ?? 0
  const totalPassifLT        = bilan?.passif.dettes_lt.total ?? 0
  const totalPassif          = bilan?.passif.total ?? 0

  const totalActifN1    = bilanN1?.actif.total
  const totalPassifN1   = bilanN1?.passif.total

  // ----------------------------------------------------------------------
  // Rendu
  // ----------------------------------------------------------------------
  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: "#F4F6FB" }}>
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { margin: 15mm; size: A4; }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center gap-3 mb-2 no-print">
        <Link href={`/comptable/clients/${clientId}/${societeId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" /> Retour
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            Bilan Officiel — {societeName}
          </h1>
          <p className="text-sm text-gray-500">
            Vue consolidée des actifs et passifs
            {data?.rpc_used && (
              <span className="ml-2 text-xs text-green-600">• données calculées via fn_soldes_par_classe</span>
            )}
          </p>
        </div>
        <Badge className={statuses[status].color}>{statuses[status].label}</Badge>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap no-print">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium" style={{ color: NAVY }}>Exercice :</label>
          <select
            value={selectedExercise}
            onChange={(e) => setSelectedExercise(e.target.value)}
            className="border rounded-md px-3 py-1.5 text-sm"
          >
            {exercises.map((ex) => (
              <option key={ex} value={ex}>{ex}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm" style={{ color: NAVY }}>
          <input
            type="checkbox"
            checked={comparatif}
            onChange={(e) => setComparatif(e.target.checked)}
          />
          Comparatif N-1
        </label>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setStatus("brouillon")}>
          <Pencil className="w-4 h-4 mr-1" /> Modifier
        </Button>
        <Button
          size="sm"
          style={{ background: GOLD, color: NAVY }}
          onClick={() => setStatus("finalise")}
        >
          <CheckCircle2 className="w-4 h-4 mr-1" /> Finaliser
        </Button>
        <Button size="sm" variant="outline">
          <Send className="w-4 h-4 mr-1" /> Publier au client
        </Button>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Download className="w-4 h-4 mr-1" /> Exporter PDF
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            // TODO: implémenter export Excel (xlsx) — à brancher ultérieurement
            alert("Export Excel : à venir (utilisera xlsx côté serveur).")
          }}
        >
          <FileSpreadsheet className="w-4 h-4 mr-1" /> Exporter Excel
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center gap-3 py-16">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: NAVY }} />
          <p className="text-sm text-gray-500">Chargement des états financiers…</p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <Card className="border-red-200">
          <CardContent className="p-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-semibold text-red-700">Impossible de charger le bilan</p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
              <p className="text-xs text-gray-500 mt-2">
                Vérifiez que l'exercice sélectionné contient des écritures comptabilisées pour cette société.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No data */}
      {!loading && !error && !hasData && (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="w-10 h-10 mx-auto mb-3 text-gray-400" />
            <p className="text-sm font-medium" style={{ color: NAVY }}>
              Aucune écriture comptabilisée sur cet exercice
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {data?.message || "Importez des documents pour générer automatiquement le bilan."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Data */}
      {!loading && !error && hasData && bilan && (
        <>
          {/* Equilibré badge */}
          {equilibre ? (
            <div className="flex justify-center">
              <Badge className="bg-green-100 text-green-700 text-base px-4 py-1">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Équilibré — Total Actif = Total Passif = {fmt(totalActif)}
              </Badge>
            </div>
          ) : (
            <div className="flex justify-center">
              <Badge className="bg-orange-100 text-orange-700 text-base px-4 py-1">
                <AlertCircle className="w-4 h-4 mr-2" />
                Écart Actif/Passif : {fmt(bilan.delta)}
              </Badge>
            </div>
          )}

          {/* 2-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ACTIF */}
            <Card className="border-t-4" style={{ borderTopColor: NAVY }}>
              <CardHeader>
                <CardTitle style={{ color: NAVY }}>ACTIF</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Non-courant */}
                <div>
                  <h3 className="font-semibold text-sm mb-2" style={{ color: NAVY }}>
                    Actif non courant
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Compte</TableHead>
                        <TableHead className="text-right">Exercice N</TableHead>
                        {comparatif && bilanN1 && <TableHead className="text-right">N-1</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {actifNonCourant.map((r) => (
                        <TableRow key={r.compte}>
                          <TableCell className="text-sm">{r.compte}</TableCell>
                          <TableCell className={`text-right text-sm font-medium ${r.montant < 0 ? "text-red-600" : ""}`}>
                            {fmt(r.montant)}
                          </TableCell>
                          {comparatif && bilanN1 && (
                            <TableCell className="text-right text-xs text-gray-500">
                              {r.prev !== undefined ? fmt(r.prev) : "—"}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                      {actifNonCourant.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={comparatif && bilanN1 ? 3 : 2} className="text-center text-xs text-gray-400 py-3">
                            Aucune immobilisation
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-bold">Sous-total</TableCell>
                        <TableCell className="text-right font-bold">{fmt(totalActifNonCourant)}</TableCell>
                        {comparatif && bilanN1 && (
                          <TableCell className="text-right text-xs text-gray-500">
                            {fmt(bilanN1.actif.non_courant.total)}
                          </TableCell>
                        )}
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>

                {/* Courant */}
                <div>
                  <h3 className="font-semibold text-sm mb-2" style={{ color: NAVY }}>
                    Actif courant
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Compte</TableHead>
                        <TableHead className="text-right">Exercice N</TableHead>
                        {comparatif && bilanN1 && <TableHead className="text-right">N-1</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {actifCourant.map((r) => (
                        <TableRow key={r.compte}>
                          <TableCell className="text-sm">{r.compte}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{fmt(r.montant)}</TableCell>
                          {comparatif && bilanN1 && (
                            <TableCell className="text-right text-xs text-gray-500">
                              {r.prev !== undefined ? fmt(r.prev) : "—"}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                      {actifCourant.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={comparatif && bilanN1 ? 3 : 2} className="text-center text-xs text-gray-400 py-3">
                            Aucun actif courant
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-bold">Sous-total</TableCell>
                        <TableCell className="text-right font-bold">{fmt(totalActifCourant)}</TableCell>
                        {comparatif && bilanN1 && (
                          <TableCell className="text-right text-xs text-gray-500">
                            {fmt(bilanN1.actif.courant.total)}
                          </TableCell>
                        )}
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>

                {/* Total Actif */}
                <div className="rounded-lg p-3" style={{ background: NAVY }}>
                  <div className="flex justify-between text-white font-bold text-lg">
                    <span>TOTAL ACTIF</span>
                    <span>
                      {fmt(totalActif)}
                      {comparatif && totalActifN1 !== undefined && (
                        <span className="ml-3 text-xs opacity-75">
                          (N-1 : {fmt(totalActifN1)}
                          {deltaPct(totalActif, totalActifN1) && ` · ${deltaPct(totalActif, totalActifN1)}`})
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* PASSIF */}
            <Card className="border-t-4" style={{ borderTopColor: GOLD }}>
              <CardHeader>
                <CardTitle style={{ color: NAVY }}>PASSIF</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Capitaux Propres */}
                <div>
                  <h3 className="font-semibold text-sm mb-2" style={{ color: NAVY }}>
                    Capitaux propres
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Compte</TableHead>
                        <TableHead className="text-right">Exercice N</TableHead>
                        {comparatif && bilanN1 && <TableHead className="text-right">N-1</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {capitauxPropres.map((r) => (
                        <TableRow key={r.compte}>
                          <TableCell className="text-sm">{r.compte}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{fmt(r.montant)}</TableCell>
                          {comparatif && bilanN1 && (
                            <TableCell className="text-right text-xs text-gray-500">
                              {r.prev !== undefined ? fmt(r.prev) : "—"}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                      {capitauxPropres.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={comparatif && bilanN1 ? 3 : 2} className="text-center text-xs text-gray-400 py-3">
                            Aucun capital renseigné
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-bold">Sous-total</TableCell>
                        <TableCell className="text-right font-bold">{fmt(totalCapitaux)}</TableCell>
                        {comparatif && bilanN1 && (
                          <TableCell className="text-right text-xs text-gray-500">
                            {fmt(bilanN1.passif.capitaux_propres.total)}
                          </TableCell>
                        )}
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>

                {/* Passif courant + LT */}
                <div>
                  <h3 className="font-semibold text-sm mb-2" style={{ color: NAVY }}>
                    Dettes
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Compte</TableHead>
                        <TableHead className="text-right">Exercice N</TableHead>
                        {comparatif && bilanN1 && <TableHead className="text-right">N-1</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {passifCourant.map((r) => (
                        <TableRow key={r.compte}>
                          <TableCell className="text-sm">{r.compte}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{fmt(r.montant)}</TableCell>
                          {comparatif && bilanN1 && (
                            <TableCell className="text-right text-xs text-gray-500">
                              {r.prev !== undefined ? fmt(r.prev) : "—"}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                      {passifCourant.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={comparatif && bilanN1 ? 3 : 2} className="text-center text-xs text-gray-400 py-3">
                            Aucune dette
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-bold">Sous-total</TableCell>
                        <TableCell className="text-right font-bold">{fmt(totalPassifCT + totalPassifLT)}</TableCell>
                        {comparatif && bilanN1 && (
                          <TableCell className="text-right text-xs text-gray-500">
                            {fmt(bilanN1.passif.dettes_ct.total + bilanN1.passif.dettes_lt.total)}
                          </TableCell>
                        )}
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>

                {/* Total Passif */}
                <div className="rounded-lg p-3" style={{ background: NAVY }}>
                  <div className="flex justify-between text-white font-bold text-lg">
                    <span>TOTAL PASSIF</span>
                    <span>
                      {fmt(totalPassif)}
                      {comparatif && totalPassifN1 !== undefined && (
                        <span className="ml-3 text-xs opacity-75">
                          (N-1 : {fmt(totalPassifN1)}
                          {deltaPct(totalPassif, totalPassifN1) && ` · ${deltaPct(totalPassif, totalPassifN1)}`})
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Par classe (synthèse) */}
          {data?.par_classe && data.par_classe.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base" style={{ color: NAVY }}>
                  <Landmark className="w-5 h-5" />
                  Synthèse par classe comptable
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Classe</TableHead>
                      <TableHead className="text-right">Total Débit</TableHead>
                      <TableHead className="text-right">Total Crédit</TableHead>
                      <TableHead className="text-right">Solde</TableHead>
                      <TableHead className="text-right">Nb écritures</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.par_classe.map((c) => (
                      <TableRow key={c.classe}>
                        <TableCell className="font-medium">Classe {c.classe}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(c.total_debit)}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(c.total_credit)}</TableCell>
                        <TableCell className={`text-right text-sm font-medium ${c.solde < 0 ? "text-red-600" : ""}`}>
                          {fmt(c.solde)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-gray-500">{c.nb_ecritures}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
