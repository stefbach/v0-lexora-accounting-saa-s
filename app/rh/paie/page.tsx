"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Calculator, Download, FileText, BookOpen, AlertTriangle, CheckCircle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n) }
const STATUT_COLORS: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  valide: "bg-blue-100 text-blue-700",
  paye: "bg-green-100 text-green-700",
  declare_mra: "bg-purple-100 text-purple-700"
}

type TabType = "bulletins" | "comptabilisation"

export default function PaiePage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0, 7))
  const [bulletins, setBulletins] = useState<any[]>([])
  const [totaux, setTotaux] = useState<any>({})
  const [loading, setLoading] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [pdfLoading, setPdfLoading] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>("bulletins")

  // Comptabilisation
  const [comptabilisationLoading, setComptabilisationLoading] = useState(false)
  const [comptabilisationResult, setComptabilisationResult] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
      setSocietes(unique)
      if (unique.length >= 1) setSociete(unique[0].id)
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ periode })
      if (societe !== "all") params.set("societe_id", societe)
      const data = await fetch(`/api/rh/paie?${params}`).then(r => r.json())
      setBulletins(data.bulletins || [])
      setTotaux(data.totaux || {})
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [societe, periode])

  useEffect(() => { load() }, [load])

  const calculerBatch = async () => {
    if (societe === "all") return alert("Sélectionnez une société")
    setCalculating(true)
    try {
      await fetch("/api/rh/paie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "calculer_batch", societe_id: societe, periode })
      }).then(r => r.json())
      load()
    } catch (e) { console.error(e) } finally { setCalculating(false) }
  }

  const exportVirements = async () => {
    if (societe === "all") return alert("Sélectionnez une société")
    const data = await fetch("/api/rh/exports/virement", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ societe_id: societe, periode, banque: "MCB" })
    }).then(r => r.json())
    if (data.content) {
      const blob = new Blob([data.content], { type: "text/csv" })
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = data.filename; a.click()
    }
  }

  const ouvrirPDF = async (bulletinId: string) => {
    setPdfLoading(bulletinId)
    try {
      const data = await fetch("/api/rh/paie/pdf", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulletin_id: bulletinId })
      }).then(r => r.json())
      if (data.html) {
        const blob = new Blob([data.html], { type: "text/html" })
        window.open(URL.createObjectURL(blob), "_blank")
      } else alert(data.error || "Erreur génération PDF")
    } catch (e) { console.error(e) } finally { setPdfLoading(null) }
  }

  const comptabiliserPaie = async () => {
    if (societe === "all") return alert("Sélectionnez une société")
    setComptabilisationLoading(true)
    setComptabilisationResult(null)
    try {
      const data = await fetch("/api/rh/paie/comptabiliser", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all_periode: true, societe_id: societe, periode })
      }).then(r => r.json())
      if (data.error) throw new Error(data.error)
      setComptabilisationResult(`✅ ${data.nb_ecritures} écritures générées dans le journal SAL pour ${data.nb_bulletins} bulletin(s)`)
      load()
    } catch (e: unknown) {
      setComptabilisationResult(`❌ Erreur : ${e instanceof Error ? e.message : "Erreur inconnue"}`)
    } finally { setComptabilisationLoading(false) }
  }

  // Bulletins validés non comptabilisés
  const bulletinsNonComptabilises = bulletins.filter(b => b.statut === "valide" && !b.comptabilise)

  const tabs: { id: TabType; label: string; icon?: string }[] = [
    { id: "bulletins", label: "Bulletins" },
    { id: "comptabilisation", label: "Comptabilisation" },
  ]

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0B0F2E]">Paie & Bulletins</h1>
            <p className="text-sm text-gray-500">Calcul MRA — CSG/NSF/PAYE + OT + Primes + Absences</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={calculerBatch} disabled={calculating} className="bg-[#0B0F2E] text-white">
              <Calculator className="w-4 h-4 mr-2" />{calculating ? "Calcul en cours..." : "Calculer la paie"}
            </Button>
            <Button onClick={exportVirements} variant="outline"><Download className="w-4 h-4 mr-2" />MCB Virement</Button>
            <a href="/rh/paie/exports-mra">
              <Button variant="outline">🏛️ Exports MRA</Button>
            </a>
          </div>
        </div>

        {/* Onglets */}
        <div className="flex gap-1 border-b border-gray-200">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-[#0B0F2E] text-[#0B0F2E]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
              {tab.id === "comptabilisation" && bulletinsNonComptabilises.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
                  {bulletinsNonComptabilises.length}
                </span>
              )}
            </button>
          ))}
          <a href="/rh/paie/primes" className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
            Primes & Variables
          </a>
          <a href="/rh/pointage/mensuel" className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
            Heures Sup
          </a>
        </div>

        <Card>
          <CardContent className="p-4 flex gap-3">
            <Select value={societe} onValueChange={setSociete}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Société" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="month" value={periode} onChange={e => setPeriode(e.target.value)} className="w-40" />
          </CardContent>
        </Card>

        {totaux.cout_total_employeur > 0 && (
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Masse salariale brute", v: fmt(totaux.masse_salariale_brute || 0) },
              { label: "Masse salariale nette", v: fmt(totaux.masse_salariale_nette || 0) },
              { label: "Charges patronales", v: fmt(totaux.total_charges_patronales || 0) },
              { label: "Coût total employeur", v: fmt(totaux.cout_total_employeur || 0) },
            ].map(k => (
              <Card key={k.label}>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500">{k.label}</p>
                  <p className="text-lg font-bold text-[#0B0F2E]">{k.v}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ═══ ONGLET BULLETINS ═══ */}
        {activeTab === "bulletins" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-[#0B0F2E]">Bulletins de paie — {periode} ({bulletins.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : bulletins.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Calculator className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>Aucun bulletin pour cette période</p>
                  <p className="text-sm mt-1">Sélectionnez une société et cliquez sur "Calculer la paie"</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employé</TableHead>
                      <TableHead>Poste</TableHead>
                      <TableHead className="text-right">Brut</TableHead>
                      <TableHead className="text-right">OT</TableHead>
                      <TableHead className="text-right">Primes</TableHead>
                      <TableHead className="text-right text-red-600">Absence</TableHead>
                      <TableHead className="text-right">Déductions</TableHead>
                      <TableHead className="text-right">Net à payer</TableHead>
                      <TableHead className="text-right">Coût employeur</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulletins.map(b => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">
                          {b.employe?.prenom} {b.employe?.nom}
                          {b.employe?.devise_salaire === "EUR" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-semibold cursor-help">EUR</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Salaire EUR — Taux appliqué: {b.employe?.taux_change_eur || 46.50} MUR</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">{b.employe?.poste || "—"}</TableCell>
                        <TableCell className="text-right">
                          {b.employe?.devise_salaire === "EUR" ? (
                            <div>
                              <p className="font-medium">{fmt(b.salaire_brut)}</p>
                              <p className="text-xs text-blue-600">EUR {new Intl.NumberFormat("fr-FR").format(Math.round(b.salaire_base / (b.employe?.taux_change_eur || 46.50)))}</p>
                            </div>
                          ) : fmt(b.salaire_brut)}
                        </TableCell>
                        <TableCell className="text-right text-orange-600 text-sm">
                          {Number(b.heures_sup_montant) > 0 ? fmt(b.heures_sup_montant) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-purple-600 text-sm">
                          {Number(b.special_allowance_1) > 0 ? fmt(b.special_allowance_1) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {Number(b.montant_absence) > 0 ? (
                            <span className="text-red-600 font-medium">-{fmt(b.montant_absence)}</span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-red-600">{fmt(b.total_deductions)}</TableCell>
                        <TableCell className="text-right font-semibold text-green-700">{fmt(b.salaire_net)}</TableCell>
                        <TableCell className="text-right text-orange-600">{fmt(b.cout_total_employeur)}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUT_COLORS[b.statut] || ""}`}>{b.statut}</span>
                          {b.jours_absence > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded">{b.jours_absence}j abs.</span>
                          )}
                          {b.comptabilise && (
                            <span className="ml-1 px-1.5 py-0.5 bg-green-100 text-green-600 text-xs rounded">✓ cpt.</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm" variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => ouvrirPDF(b.id)}
                            disabled={pdfLoading === b.id}
                          >
                            {pdfLoading === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                            📄 PDF
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* ═══ ONGLET COMPTABILISATION ═══ */}
        {activeTab === "comptabilisation" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-[#0B0F2E] flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Comptabilisation de la paie — {periode}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {bulletinsNonComptabilises.length > 0 ? (
                <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />
                  <p className="text-sm text-orange-800">
                    <strong>{bulletinsNonComptabilises.length} bulletin(s) validé(s)</strong> non encore comptabilisé(s) pour cette période.
                  </p>
                </div>
              ) : bulletins.length > 0 ? (
                <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                  <p className="text-sm text-green-800">Tous les bulletins validés ont été comptabilisés.</p>
                </div>
              ) : null}

              <div className="p-4 bg-gray-50 rounded-lg border space-y-3">
                <h3 className="font-medium text-sm text-gray-800">Générer les écritures comptables (journal SAL)</h3>
                <p className="text-xs text-gray-500">
                  Génère les écritures dans <code>ecritures_comptables_v2</code> pour chaque bulletin validé non comptabilisé :
                  Débit 641 Rémunérations / Crédit 421 Personnel net, 431 CSG/NSF, 432 Training Levy
                </p>
                <Button
                  onClick={comptabiliserPaie}
                  disabled={comptabilisationLoading || societe === "all" || bulletinsNonComptabilises.length === 0}
                  className="bg-[#0B0F2E] text-white"
                >
                  {comptabilisationLoading
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Comptabilisation...</>
                    : <><BookOpen className="w-4 h-4 mr-2" />Comptabiliser la paie ({bulletinsNonComptabilises.length} bulletin(s))</>
                  }
                </Button>
                {comptabilisationResult && (
                  <p className="text-sm font-medium mt-2">{comptabilisationResult}</p>
                )}
              </div>

              {bulletins.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">État de comptabilisation</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employé</TableHead>
                        <TableHead className="text-right">Net à payer</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Comptabilisé</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bulletins.map(b => (
                        <TableRow key={b.id}>
                          <TableCell>{b.employe?.prenom} {b.employe?.nom}</TableCell>
                          <TableCell className="text-right">{fmt(b.salaire_net)}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUT_COLORS[b.statut] || ""}`}>{b.statut}</span>
                          </TableCell>
                          <TableCell>
                            {b.comptabilise
                              ? <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="w-3 h-3" />Oui</span>
                              : <span className="text-xs text-gray-400">Non</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  )
}
