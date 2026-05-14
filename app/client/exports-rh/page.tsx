"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Loader2, Download, Building2, FileText, Calculator,
  AlertTriangle, CheckCircle2, Users, CreditCard
} from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale, type Locale } from '@/lib/i18n'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BANQUES_LABELS: Record<string, string> = {
  MCB: "Mauritius Commercial Bank",
  SBM: "State Bank of Mauritius",
  ABC: "ABC Banking Corporation",
  AFRASIA: "AfrAsia Bank",
  MAUBANK: "MauBank",
  BANKONE: "Bank One",
  ABSA: "ABSA / Barclays",
  SCB: "Standard Chartered",
  HSBC: "HSBC Mauritius",
  BCP: "BCP",
  BDM: "Banque des Mascareignes",
  CIM: "CIM Finance",
  AUTRE: "Autre banque",
  SANS_BANQUE: "Coordonnees manquantes",
}

const FORMAT_LABELS: Record<string, string> = {
  MCB: "Format BP-V1 (.txt)",
  SBM: "Format BizEdge (.csv)",
  ABC: "Format CSV ABC Corporate",
  AFRASIA: "Format CSV AfrAsia",
  MAUBANK: "Format CSV MauBank",
  BANKONE: "Format CSV Bank One",
  ABSA: "Format BatchPay ABSA",
  SCB: "Format SCMUPAY SCB",
  HSBC: "Format CSV HSBC",
  DEFAULT: "Format CSV generique",
}

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MUR",
    maximumFractionDigits: 2,
  }).format(n)
}

function downloadFile(content: string, filename: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["\uFEFF" + content], { type })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Societe {
  id: string
  nom: string
}

interface VirementFichier {
  banque: string
  nom_banque: string
  devise: string
  nb_employes: number
  montant_total: number
  filename: string
  content?: string
  employes: string[]
}

interface VirementRecap {
  periode: string
  nb_bulletins_total: number
  montant_total_mur: number
  montant_total_eur: number
  nb_banques: number
  nb_employes_sans_banque: number
  fichiers: VirementFichier[]
}

interface CsgRow {
  code: string
  nom: string
  prenom: string
  nic: string
  salaire_brut: number
  csg_sal: number
  csg_pat: number
  nsf_sal: number
  nsf_pat: number
  training_levy: number
  prgf: number
}

interface PayeRow {
  tan: string
  nom: string
  prenom: string
  nic: string
  salaire_brut: number
  salaire_annualise: number
  paye_mensuel: number
  statut: string
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function ExportsRHPage() {
  const locale = getLocale()
  const { societeId, societe: activeSociete } = useSocieteActive()
  const societe = societeId || ""
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0, 7))

  const societeNom = activeSociete?.nom || ""

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-[#0B0F2E]">{t('hr.exports.title', locale)}</h1>
        <p className="text-sm text-gray-500">
          {t('hr.exports.subtitle', locale)}
        </p>
      </div>

      {/* Shared selectors */}
      <Card>
        <CardContent className="p-4">
          <div>
            <Label>{t('hr.exports.period_month', locale)}</Label>
            <Input
              type="month"
              value={periode}
              onChange={(e) => setPeriode(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {!societe && (
        <div className="text-center py-16 text-gray-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">
            {t('hr.exports.select_company_period', locale)}
          </p>
        </div>
      )}

      {societe && (
        <Tabs defaultValue="virement" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-[#0B0F2E]/5">
            <TabsTrigger
              value="virement"
              className="data-[state=active]:bg-[#0B0F2E] data-[state=active]:text-white"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              {t('hr.exports.tab_bank_transfer', locale)}
            </TabsTrigger>
            <TabsTrigger
              value="mra"
              className="data-[state=active]:bg-[#0B0F2E] data-[state=active]:text-white"
            >
              <Calculator className="w-4 h-4 mr-2" />
              {t('hr.exports.tab_mra', locale)}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="virement" className="mt-4">
            <VirementSection societe={societe} periode={periode} />
          </TabsContent>

          <TabsContent value="mra" className="mt-4">
            <MRASection
              societe={societe}
              periode={periode}
              societeNom={societeNom}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 1 -- VIREMENT BANCAIRE
// TODO i18n: VirementSection and MRASection contain many FR strings (table headers, alerts, descriptions). Top-level page i18n applied; inner sections deferred.
// ---------------------------------------------------------------------------

function VirementSection({
  societe,
  periode,
}: {
  societe: string
  periode: string
}) {
  const [comptesDisponibles, setComptesDisponibles] = useState<any[]>([])
  const [compteSelectionne, setCompteSelectionne] = useState("")
  const [compteEmetteur, setCompteEmetteur] = useState<any>(null)
  const [preview, setPreview] = useState<VirementRecap | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloads, setDownloads] = useState<string[]>([])

  // Load bank accounts
  const loadComptes = useCallback(async () => {
    if (!societe) return
    try {
      const res = await fetch(
        `/api/comptable/comptes-bancaires?societe_id=${societe}&devise=MUR`
      )
      const data = await res.json()
      const comptes = data.comptes || []
      setComptesDisponibles(comptes)

      const comptePaie =
        comptes.find((c: any) => c.usage_paie && c.compte_principal) ||
        comptes.find((c: any) => c.usage_paie) ||
        comptes.find((c: any) => c.compte_principal && c.devise === "MUR") ||
        comptes[0]

      if (comptePaie) {
        setCompteSelectionne(comptePaie.id)
        setCompteEmetteur(comptePaie)
      } else {
        setCompteEmetteur(null)
        setCompteSelectionne("")
      }
    } catch (e) {
      console.error(e)
    }
  }, [societe])

  useEffect(() => {
    loadComptes()
  }, [loadComptes])

  useEffect(() => {
    const c = comptesDisponibles.find((c) => c.id === compteSelectionne)
    if (c) setCompteEmetteur(c)
  }, [compteSelectionne, comptesDisponibles])

  // Load preview
  const chargerPreview = useCallback(async () => {
    if (!societe || !periode) return
    setLoadingPreview(true)
    setError(null)
    try {
      const res = await fetch("/api/rh/exports/virement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societe,
          periode,
          compte_emetteur_id: compteSelectionne || undefined,
          format: "json",
          preview_only: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPreview(data.recap)
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Erreur lors du chargement"
      )
      setPreview(null)
    } finally {
      setLoadingPreview(false)
    }
  }, [societe, periode, compteSelectionne])

  // Generate on button click only
  const generer = () => {
    setDownloads([])
    chargerPreview()
  }

  // Download single bank file
  const telechargerBanque = async (banqueCode: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/rh/exports/virement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societe,
          periode,
          compte_emetteur_id: compteSelectionne || undefined,
          format: "single",
          banque_filter: banqueCode,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const isTxt = data.filename?.endsWith(".txt")
      downloadFile(
        data.content,
        data.filename,
        isTxt ? "text/plain;charset=utf-8" : "text/csv;charset=utf-8"
      )
      setDownloads((prev) => [...prev, banqueCode])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur telechargement")
    } finally {
      setLoading(false)
    }
  }

  // Download all files
  const telechargerTous = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/rh/exports/virement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societe,
          periode,
          compte_emetteur_id: compteSelectionne || undefined,
          format: "json",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      for (const fichier of data.fichiers || []) {
        const isTxt = fichier.filename?.endsWith(".txt")
        downloadFile(
          fichier.content,
          fichier.filename,
          isTxt ? "text/plain" : "text/csv"
        )
        await new Promise((r) => setTimeout(r, 300))
      }
      setDownloads(data.fichiers?.map((f: any) => f.banque) || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur telechargement")
    } finally {
      setLoading(false)
    }
  }

  const banqueEmettrice =
    compteEmetteur?.bank_code ||
    compteEmetteur?.banque?.toUpperCase().slice(0, 3) ||
    "?"
  const formatFichier = FORMAT_LABELS[banqueEmettrice] || FORMAT_LABELS["DEFAULT"]

  return (
    <div className="space-y-4">
      {/* Issuing bank account */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#0B0F2E] flex items-center gap-2 text-base">
            <Building2 className="w-4 h-4" />
            Compte emetteur
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {comptesDisponibles.length === 0 ? (
            <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded text-sm text-orange-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Aucun compte bancaire MUR configure pour cette societe.
              <a href="/comptable/banque" className="underline ml-1">
                Ajouter un compte
              </a>
            </div>
          ) : (
            <Select
              value={compteSelectionne}
              onValueChange={setCompteSelectionne}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selectionner le compte debiteur" />
              </SelectTrigger>
              <SelectContent>
                {comptesDisponibles.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.banque} - {c.numero_compte || c.nom_compte}
                    {c.usage_paie ? " (Paie)" : ""}
                    {c.compte_principal ? " (Principal)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {compteEmetteur && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded">
              <Building2 className="w-5 h-5 text-blue-600 shrink-0" />
              <div className="flex-1 text-sm">
                <span className="font-semibold text-blue-800">
                  {compteEmetteur.banque}
                </span>
                <span className="text-blue-600 ml-2">
                  N. {compteEmetteur.numero_compte}
                </span>
                {compteEmetteur.iban && (
                  <span className="text-blue-500 ml-2 text-xs">
                    IBAN: {compteEmetteur.iban}
                  </span>
                )}
              </div>
              <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">
                {formatFichier}
              </Badge>
            </div>
          )}

          <Button
            onClick={generer}
            disabled={loadingPreview || !compteEmetteur}
            className="bg-[#0B0F2E] text-white"
          >
            {loadingPreview ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <FileText className="w-4 h-4 mr-2" />
            )}
            Generer fichier virement
          </Button>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loadingPreview && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Chargement des donnees...
        </div>
      )}

      {/* Preview table grouped by bank */}
      {preview && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                {preview.nb_bulletins_total} bulletin(s) valide(s)
              </CardTitle>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">
                  Total MUR :{" "}
                  <strong>{fmt(preview.montant_total_mur || 0)}</strong>
                  {preview.montant_total_eur > 0 && (
                    <>
                      {" "}
                      + EUR :{" "}
                      <strong>{preview.montant_total_eur?.toFixed(2)}</strong>
                    </>
                  )}
                </span>
                <Button
                  onClick={telechargerTous}
                  disabled={loading || !compteEmetteur}
                  className="bg-[#D4AF37] text-[#0B0F2E] hover:bg-[#D4AF37]/90"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Tout telecharger
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#0B0F2E]/5">
                  <TableHead>Banque beneficiaire</TableHead>
                  <TableHead className="text-center">Employes</TableHead>
                  <TableHead className="text-right">Montant total</TableHead>
                  <TableHead>Devise</TableHead>
                  <TableHead>Format fichier</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(preview.fichiers || []).map((f) => {
                  const isDone = downloads.includes(f.banque)
                  const isWarning = f.banque === "SANS_BANQUE"
                  return (
                    <TableRow
                      key={f.banque + f.devise}
                      className={isWarning ? "bg-orange-50" : ""}
                    >
                      <TableCell>
                        <div className="font-medium">
                          {isWarning ? (
                            <span className="text-orange-600 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {BANQUES_LABELS[f.banque] || f.banque}
                            </span>
                          ) : (
                            BANQUES_LABELS[f.banque] || f.banque
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono text-sm">
                          {f.nb_employes}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {fmt(f.montant_total)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-xs"
                        >
                          {f.devise || "MUR"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {banqueEmettrice === "MCB"
                          ? f.banque === "SANS_BANQUE"
                            ? "CSV liste"
                            : "MCB BP-V1 .txt"
                          : FORMAT_LABELS[f.banque] ||
                            FORMAT_LABELS["DEFAULT"]}
                      </TableCell>
                      <TableCell className="text-center">
                        {isDone ? (
                          <span className="flex items-center justify-center gap-1 text-green-600 text-xs">
                            <CheckCircle2 className="w-4 h-4" />
                            Telecharge
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => telechargerBanque(f.banque)}
                            disabled={
                              loading ||
                              !compteEmetteur ||
                              (banqueEmettrice === "MCB" &&
                                f.banque !== "SANS_BANQUE")
                            }
                            title={
                              banqueEmettrice === "MCB"
                                ? "MCB genere un seul fichier BP-V1 -- utiliser Tout telecharger"
                                : ""
                            }
                          >
                            <Download className="w-3 h-3 mr-1" />
                            {banqueEmettrice === "MCB" &&
                            f.banque !== "SANS_BANQUE"
                              ? "Via BP-V1"
                              : "Telecharger"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            {/* MCB note */}
            {banqueEmettrice === "MCB" && (
              <div className="p-4 bg-blue-50 border-t text-xs text-blue-700 flex items-start gap-2">
                <FileText className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong>Banque emettrice MCB :</strong> Le format BP-V1
                  regroupe tous les beneficiaires dans un seul fichier{" "}
                  <code>.txt</code>. Virements MCB internes en lignes{" "}
                  <code>1</code>, inter-bancaires en lignes <code>2</code>.
                  Utilisez &laquo; Tout telecharger &raquo; pour obtenir le
                  fichier a uploader sur MCB Juice Pro Business.
                </div>
              </div>
            )}

            {/* Warning: employees without bank */}
            {preview.nb_employes_sans_banque > 0 && (
              <div className="p-4 bg-orange-50 border-t text-sm text-orange-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <strong>
                  {preview.nb_employes_sans_banque} employe(s)
                </strong>{" "}
                sans coordonnees bancaires.
                <a href="/rh/employes" className="underline ml-1">
                  Completer les fiches employes
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 2 -- EXPORT MRA (CSG + PAYE unified)
// ---------------------------------------------------------------------------

function MRASection({
  societe,
  periode,
  societeNom,
}: {
  societe: string
  periode: string
  societeNom: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [csgRows, setCsgRows] = useState<CsgRow[]>([])
  const [payeRows, setPayeRows] = useState<PayeRow[]>([])
  const [csgTotals, setCsgTotals] = useState<any>(null)
  const [payeTotals, setPayeTotals] = useState<any>(null)
  const [generated, setGenerated] = useState(false)
  const [csvContent, setCsvContent] = useState("")
  const [csvFilename, setCsvFilename] = useState("")

  const genererExport = async () => {
    setLoading(true)
    setError(null)
    setGenerated(false)
    setCsgRows([])
    setPayeRows([])

    try {
      // Fetch both CSG and PAYE in parallel
      const [csgRes, payeRes] = await Promise.all([
        fetch("/api/rh/exports/csg-mra", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ societe_id: societe, periode }),
        }).then((r) => r.json()),
        fetch("/api/rh/exports/paye-mra", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ societe_id: societe, periode }),
        }).then((r) => r.json()),
      ])

      if (csgRes.error) throw new Error(`CSG: ${csgRes.error}`)
      if (payeRes.error) throw new Error(`PAYE: ${payeRes.error}`)

      // Parse CSG detail CSV into rows
      const csgLines = (csgRes.detail_csv || "").split("\n")
      const parsedCsg: CsgRow[] = []
      for (let i = 1; i < csgLines.length; i++) {
        const cols = csgLines[i].split(";")
        if (cols.length < 11) continue
        parsedCsg.push({
          code: cols[0],
          nom: cols[1],
          prenom: cols[2],
          nic: cols[3],
          salaire_brut: parseFloat(cols[4]) || 0,
          csg_sal: parseFloat(cols[5]) || 0,
          csg_pat: parseFloat(cols[6]) || 0,
          nsf_sal: parseFloat(cols[7]) || 0,
          nsf_pat: parseFloat(cols[8]) || 0,
          training_levy: parseFloat(cols[9]) || 0,
          prgf: parseFloat(cols[10]) || 0,
        })
      }
      setCsgRows(parsedCsg)
      setCsgTotals(csgRes.totaux)

      // Parse PAYE detail CSV into rows
      const payeLines = (payeRes.detail_csv || "").split("\n")
      const parsedPaye: PayeRow[] = []
      for (let i = 1; i < payeLines.length; i++) {
        const cols = payeLines[i].split(";")
        if (cols.length < 8) continue
        parsedPaye.push({
          tan: cols[0],
          nom: cols[1],
          prenom: cols[2],
          nic: cols[3],
          salaire_brut: parseFloat(cols[4]) || 0,
          salaire_annualise: parseFloat(cols[5]) || 0,
          paye_mensuel: parseFloat(cols[6]) || 0,
          statut: cols[7],
        })
      }
      setPayeRows(parsedPaye)
      setPayeTotals(payeRes.totaux)

      // Build unified CSV
      const safeName = societeNom.replace(/\s+/g, "_") || "SOCIETE"
      const fname = `MRA_Export_${safeName}_${periode}.csv`
      setCsvFilename(fname)

      const lines: string[] = []
      lines.push("=== SECTION 1 : CSG / NSF ===")
      lines.push(csgRes.recap_csv || "")
      lines.push("")
      lines.push(csgRes.detail_csv || "")
      lines.push("")
      lines.push("=== SECTION 2 : PAYE ===")
      lines.push(payeRes.recap_csv || "")
      lines.push("")
      lines.push(payeRes.detail_csv || "")
      setCsvContent(lines.join("\n"))

      setGenerated(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur generation MRA")
    } finally {
      setLoading(false)
    }
  }

  const telecharger = () => {
    if (csvContent && csvFilename) {
      downloadFile(csvContent, csvFilename)
    }
  }

  const fmtN = (n: number) =>
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-[#0B0F2E] flex items-center gap-2 text-base">
            <Calculator className="w-4 h-4" />
            Export MRA -- CSG/NSF + PAYE
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-500">
            Genere un fichier unique contenant les declarations CSG/NSF et PAYE
            pour la periode selectionnee.
          </p>
          <div className="flex items-center gap-3">
            <Button
              onClick={genererExport}
              disabled={loading}
              className="bg-[#0B0F2E] text-white"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <FileText className="w-4 h-4 mr-2" />
              )}
              Generer export MRA
            </Button>
            {generated && (
              <Button
                onClick={telecharger}
                variant="outline"
                className="border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10"
              >
                <Download className="w-4 h-4 mr-2" />
                Telecharger CSV
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* CSG/NSF preview */}
      {generated && csgRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-[#0B0F2E] text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Section 1 -- CSG / NSF ({csgRows.length} employes)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#0B0F2E]/5 text-xs">
                  <TableHead>Employe</TableHead>
                  <TableHead>NIC</TableHead>
                  <TableHead className="text-right">Salaire brut</TableHead>
                  <TableHead className="text-right">CSG sal. 3%</TableHead>
                  <TableHead className="text-right">CSG pat. 6%</TableHead>
                  <TableHead className="text-right">NSF sal. 1.5%</TableHead>
                  <TableHead className="text-right">NSF pat. 2.5%</TableHead>
                  <TableHead className="text-right">Training 1%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {csgRows.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-sm">
                      {row.prenom} {row.nom}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 font-mono">
                      {row.nic || "-"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtN(row.salaire_brut)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtN(row.csg_sal)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtN(row.csg_pat)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtN(row.nsf_sal)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtN(row.nsf_pat)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtN(row.training_levy)}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals row */}
                {csgTotals && (
                  <TableRow className="bg-[#0B0F2E]/5 font-semibold">
                    <TableCell colSpan={2}>TOTAL</TableCell>
                    <TableCell className="text-right">
                      {fmtN(csgTotals.total_masse_salariale)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtN(csgTotals.total_csg_sal)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtN(csgTotals.total_csg_pat)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtN(csgTotals.total_nsf_sal)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtN(csgTotals.total_nsf_pat)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtN(csgTotals.total_training)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* PAYE preview */}
      {generated && payeRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-[#0B0F2E] text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Section 2 -- PAYE ({payeRows.length} employes)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#0B0F2E]/5 text-xs">
                  <TableHead>Employe</TableHead>
                  <TableHead>TAN</TableHead>
                  <TableHead className="text-right">Salaire brut</TableHead>
                  <TableHead className="text-right">Salaire annualise</TableHead>
                  <TableHead className="text-right">PAYE mensuel</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payeRows.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-sm">
                      {row.prenom} {row.nom}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 font-mono">
                      {row.tan || "-"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtN(row.salaire_brut)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtN(row.salaire_annualise)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtN(row.paye_mensuel)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          row.statut === "Taxable"
                            ? "border-orange-300 text-orange-700 bg-orange-50"
                            : "border-green-300 text-green-700 bg-green-50"
                        }
                      >
                        {row.statut}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals row */}
                {payeTotals && (
                  <TableRow className="bg-[#0B0F2E]/5 font-semibold">
                    <TableCell colSpan={2}>TOTAL</TableCell>
                    <TableCell className="text-right">
                      {fmtN(payeTotals.total_salaires_bruts)}
                    </TableCell>
                    <TableCell className="text-right">-</TableCell>
                    <TableCell className="text-right">
                      {fmtN(payeTotals.total_paye_retenu)}
                    </TableCell>
                    <TableCell>
                      {payeTotals.nb_employes} employe(s)
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Empty state after generation */}
      {generated && csgRows.length === 0 && payeRows.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <Calculator className="w-10 h-10 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">Aucune donnee trouvee pour cette periode.</p>
        </div>
      )}
    </div>
  )
}
