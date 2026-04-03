"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Loader2, CheckCircle2, AlertTriangle, XCircle, Play, FileCheck,
  Users, TrendingUp, TrendingDown, Building2, ShieldCheck
} from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n)
}

const STATUT_COLORS: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  valide: "bg-blue-100 text-blue-700",
  paye: "bg-green-100 text-green-700",
  declare_mra: "bg-purple-100 text-purple-700",
}

interface Anomaly {
  employe_id: string
  employe_nom: string
  type: string
  message: string
  severite: "erreur" | "avertissement"
}

interface ValidationResult {
  statut: string
  nb_employes: number
  nb_anomalies: number
  anomalies: Anomaly[]
  periode: string
  societe_id: string
}

interface Bulletin {
  id: string
  employe_id: string
  employe?: { nom: string; prenom: string; poste?: string; devise_salaire?: string }
  periode: string
  salaire_base: number
  salaire_brut: number
  salaire_net: number
  heures_sup_montant: number
  special_allowance_1: number
  transport_allowance: number
  montant_absence: number
  total_deductions: number
  total_charges_patronales: number
  csg_salarie: number
  nsf_salarie: number
  paye: number
  statut: string
}

interface Totaux {
  masse_salariale_brute: number
  masse_salariale_nette: number
  total_charges_patronales: number
  cout_total_employeur: number
}

export default function PayrollValidationPage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0, 7))

  // Bulletins
  const [bulletins, setBulletins] = useState<Bulletin[]>([])
  const [totaux, setTotaux] = useState<Totaux | null>(null)
  const [loadingBulletins, setLoadingBulletins] = useState(false)
  const [errorBulletins, setErrorBulletins] = useState("")

  // Validation / contrôle pré-paie
  const [loadingValidation, setLoadingValidation] = useState(false)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [errorValidation, setErrorValidation] = useState("")

  // Validation individuelle
  const [validatingId, setValidatingId] = useState<string | null>(null)

  // Load societes on mount (deduplicate from both endpoints)
  useEffect(() => {
    Promise.all([
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values()) as any[]
      setSocietes(unique)
      if (unique.length > 0) setSociete(unique[0].id)
    })
  }, [])

  // Load bulletins whenever societe or periode changes
  const loadBulletins = useCallback(async () => {
    if (!societe) return
    setLoadingBulletins(true)
    setErrorBulletins("")
    try {
      const params = new URLSearchParams({ periode, societe_id: societe })
      const data = await fetch(`/api/rh/paie?${params}`).then(r => r.json())
      if (data.error) { setErrorBulletins(data.error); return }
      setBulletins(data.bulletins || [])
      setTotaux(data.totaux || null)
    } catch {
      setErrorBulletins("Erreur lors du chargement des bulletins")
    } finally {
      setLoadingBulletins(false)
    }
  }, [societe, periode])

  useEffect(() => {
    setBulletins([])
    setTotaux(null)
    setValidationResult(null)
    loadBulletins()
  }, [loadBulletins])

  // Run pre-payroll control (validate)
  const runValidation = async () => {
    if (!societe) { setErrorValidation("Veuillez sélectionner une société"); return }
    setLoadingValidation(true)
    setErrorValidation("")
    setValidationResult(null)
    try {
      const res = await fetch("/api/rh/paie/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societe, periode }),
      })
      const data = await res.json()
      if (data.error) { setErrorValidation(data.error); return }
      setValidationResult(data)
    } catch {
      setErrorValidation("Erreur réseau lors du contrôle")
    } finally {
      setLoadingValidation(false)
    }
  }

  // Validate a single bulletin
  const validerBulletin = async (bulletin: Bulletin) => {
    setValidatingId(bulletin.id)
    try {
      await fetch("/api/rh/paie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "valider",
          employe_id: bulletin.employe_id,
          societe_id: societe,
          periode,
        }),
      })
      await loadBulletins()
    } catch {
      // silently handle
    } finally {
      setValidatingId(null)
    }
  }

  const erreurs = validationResult?.anomalies.filter(a => a.severite === "erreur") || []
  const avertissements = validationResult?.anomalies.filter(a => a.severite === "avertissement") || []
  const canGenerate = validationResult && erreurs.length === 0

  const nbValides = bulletins.filter(b => b.statut === "valide" || b.statut === "paye").length
  const nbBrouillons = bulletins.filter(b => b.statut === "brouillon").length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Contrôle prépaiement & Validation</h1>
          <p className="text-sm text-gray-500">
            Vérification automatique avant génération des bulletins — bulletins en cours, anomalies, validation
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={runValidation}
            disabled={loadingValidation || !societe}
            style={{ backgroundColor: NAVY }}
            className="text-white gap-2"
          >
            {loadingValidation
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <ShieldCheck className="w-4 h-4" />}
            {loadingValidation ? "Vérification..." : "Lancer le contrôle"}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-400" />
            <Select value={societe} onValueChange={v => { setSociete(v); setValidationResult(null) }}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Sélectionner une société" />
              </SelectTrigger>
              <SelectContent>
                {societes.length === 0 && (
                  <SelectItem value="_loading" disabled>Chargement...</SelectItem>
                )}
                {societes.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            type="month"
            value={periode}
            onChange={e => { setPeriode(e.target.value); setValidationResult(null) }}
            className="w-40"
          />
          <Button variant="outline" onClick={loadBulletins} disabled={loadingBulletins || !societe}>
            {loadingBulletins ? <Loader2 className="w-4 h-4 animate-spin" /> : "Actualiser"}
          </Button>
        </CardContent>
      </Card>

      {/* Errors */}
      {errorBulletins && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">{errorBulletins}</div>
      )}

      {/* KPIs */}
      {(totaux || bulletins.length > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-500">Employés</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: NAVY }}>{bulletins.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {nbValides} validé(s) · {nbBrouillons} brouillon(s)
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-500">Masse salariale brute</p>
              </div>
              <p className="text-xl font-bold" style={{ color: NAVY }}>
                {fmt(totaux?.masse_salariale_brute || 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-500">Masse salariale nette</p>
              </div>
              <p className="text-xl font-bold text-green-700">
                {fmt(totaux?.masse_salariale_nette || 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-500">Charges patronales</p>
              </div>
              <p className="text-xl font-bold text-orange-600">
                {fmt(totaux?.total_charges_patronales || 0)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Validation result summary */}
      {validationResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: NAVY }}
                >
                  <span className="text-white font-bold text-sm">{validationResult.nb_employes}</span>
                </div>
                <div>
                  <p className="text-sm font-medium">Employés vérifiés</p>
                  <p className="text-xs text-gray-500">Période {validationResult.periode}</p>
                </div>
              </CardContent>
            </Card>
            <Card className={erreurs.length > 0 ? "border-red-300" : "border-green-300"}>
              <CardContent className="p-4 flex items-center gap-3">
                {erreurs.length > 0
                  ? <XCircle className="w-10 h-10 text-red-500 shrink-0" />
                  : <CheckCircle2 className="w-10 h-10 text-green-500 shrink-0" />}
                <div>
                  <p className="text-sm font-medium">{erreurs.length} erreur(s)</p>
                  <p className="text-xs text-gray-500">Bloquent la génération</p>
                </div>
              </CardContent>
            </Card>
            <Card className={avertissements.length > 0 ? "border-orange-300" : "border-green-300"}>
              <CardContent className="p-4 flex items-center gap-3">
                {avertissements.length > 0
                  ? <AlertTriangle className="w-10 h-10 text-orange-500 shrink-0" />
                  : <CheckCircle2 className="w-10 h-10 text-green-500 shrink-0" />}
                <div>
                  <p className="text-sm font-medium">{avertissements.length} avertissement(s)</p>
                  <p className="text-xs text-gray-500">À vérifier</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {canGenerate ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
              <p className="text-sm text-green-800 font-medium">
                Tous les contrôles sont OK — vous pouvez valider les bulletins.
              </p>
            </div>
          ) : erreurs.length > 0 ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
              <XCircle className="w-5 h-5 text-red-600 shrink-0" />
              <p className="text-sm text-red-800 font-medium">
                {erreurs.length} erreur(s) bloquante(s) — corrigez avant de valider.
              </p>
            </div>
          ) : null}

          {/* Anomalies list */}
          {validationResult.anomalies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base" style={{ color: NAVY }}>
                  Détail des anomalies ({validationResult.anomalies.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {validationResult.anomalies.map((a, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${
                        a.severite === "erreur"
                          ? "bg-red-50 border-red-200"
                          : "bg-orange-50 border-orange-200"
                      }`}
                    >
                      {a.severite === "erreur"
                        ? <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                        : <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{a.employe_nom}</span>
                          <Badge
                            className={`text-[10px] ${
                              a.severite === "erreur"
                                ? "bg-red-100 text-red-800 hover:bg-red-100"
                                : "bg-orange-100 text-orange-800 hover:bg-orange-100"
                            }`}
                          >
                            {a.type}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">{a.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Validation error */}
      {errorValidation && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">{errorValidation}</div>
      )}

      {/* Empty state for validation */}
      {!validationResult && !loadingValidation && societe && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3 text-sm text-blue-800">
          <ShieldCheck className="w-5 h-5 text-blue-500 shrink-0" />
          <p>
            Cliquez sur <strong>Lancer le contrôle</strong> pour vérifier les bulletins avant validation finale
            (salaires, pointages, congés, primes, champs obligatoires).
          </p>
        </div>
      )}

      {/* Bulletins table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle style={{ color: NAVY }}>
            Bulletins de paie — {periode}
            {bulletins.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500">({bulletins.length} bulletin(s))</span>
            )}
          </CardTitle>
          {bulletins.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700">brouillon</span>
              <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700">valide</span>
              <span className="px-2 py-1 rounded-full bg-green-100 text-green-700">paye</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loadingBulletins ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : !societe ? (
            <div className="text-center py-12 text-gray-400">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Sélectionnez une société</p>
            </div>
          ) : bulletins.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Play className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Aucun bulletin pour cette période</p>
              <p className="text-sm mt-1">
                Allez sur <a href="/rh/paie" className="underline text-blue-500">Paie &amp; Bulletins</a> pour calculer la paie d&apos;abord.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employé</TableHead>
                    <TableHead>Poste</TableHead>
                    <TableHead className="text-right">Salaire brut</TableHead>
                    <TableHead className="text-right">OT</TableHead>
                    <TableHead className="text-right">Primes</TableHead>
                    <TableHead className="text-right text-red-600">Absences</TableHead>
                    <TableHead className="text-right">CSG sal.</TableHead>
                    <TableHead className="text-right">NSF sal.</TableHead>
                    <TableHead className="text-right">PAYE</TableHead>
                    <TableHead className="text-right">Charges pat.</TableHead>
                    <TableHead className="text-right font-semibold">Net à payer</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulletins.map(b => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {b.employe?.prenom} {b.employe?.nom}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">{b.employe?.poste || "—"}</TableCell>
                      <TableCell className="text-right">{fmt(b.salaire_brut || b.salaire_base)}</TableCell>
                      <TableCell className="text-right text-orange-600 text-sm">
                        {Number(b.heures_sup_montant) > 0 ? fmt(b.heures_sup_montant) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-purple-600 text-sm">
                        {Number(b.special_allowance_1) > 0 ? fmt(b.special_allowance_1) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {Number(b.montant_absence) > 0
                          ? <span className="text-red-600 font-medium">-{fmt(b.montant_absence)}</span>
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm text-gray-600">
                        {Number(b.csg_salarie) > 0 ? fmt(b.csg_salarie) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm text-gray-600">
                        {Number(b.nsf_salarie) > 0 ? fmt(b.nsf_salarie) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm text-gray-600">
                        {Number(b.paye) > 0 ? fmt(b.paye) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-orange-600 text-sm">
                        {fmt(b.total_charges_patronales || 0)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-700 whitespace-nowrap">
                        {fmt(b.salaire_net)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            STATUT_COLORS[b.statut] || "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {b.statut}
                        </span>
                      </TableCell>
                      <TableCell>
                        {b.statut === "brouillon" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 border-blue-300 text-blue-700 hover:bg-blue-50"
                            onClick={() => validerBulletin(b)}
                            disabled={validatingId === b.id}
                          >
                            {validatingId === b.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <FileCheck className="w-3 h-3" />}
                            Valider
                          </Button>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle2 className="w-3 h-3" /> OK
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
