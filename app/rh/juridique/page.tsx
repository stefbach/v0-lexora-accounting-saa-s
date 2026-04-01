"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, FileText, Eye, Download, Printer, CheckCircle, XCircle, AlertCircle } from "lucide-react"

// ── Helpers ──────────────────────────────────────────────────────────────────

const TYPES_CONTRAT = ["CDI", "CDD", "Temps_partiel", "Stage", "Consultant", "Freelance"]
const SECTEURS = [
  { value: "general",    label: "Général" },
  { value: "informatique", label: "Informatique" },
  { value: "sante",      label: "Médical / Santé" },
  { value: "bpo",        label: "BPO" },
  { value: "retail",     label: "Commerce / Retail" },
  { value: "finance",    label: "Finance / Comptabilité" },
]

const STATUT_COLORS: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  signe:     "bg-green-100 text-green-700",
  expire:    "bg-orange-100 text-orange-700",
  resilie:   "bg-red-100 text-red-700",
}

const STATUT_LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  signe:     "Signé",
  expire:    "Expiré",
  resilie:   "Résilié",
}

function StatutBadge({ statut }: { statut: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUT_COLORS[statut] ?? "bg-gray-100 text-gray-600"}`}>
      {STATUT_LABELS[statut] ?? statut}
    </span>
  )
}

// ── Composant principal ──────────────────────────────────────────────────────

export default function JuridiquePage() {
  // ── Données globales ──
  const [societes, setSocietes] = useState<any[]>([])
  const [employes, setEmployes] = useState<any[]>([])

  // ── Section 1 : liste contrats ──
  const [contrats, setContrats] = useState<any[]>([])
  const [loadingContrats, setLoadingContrats] = useState(false)
  const [filtSociete, setFiltSociete] = useState("all")
  const [filtType, setFiltType] = useState("all")
  const [filtStatut, setFiltStatut] = useState("all")
  const [viewContrat, setViewContrat] = useState<any | null>(null)
  const [updatingStatut, setUpdatingStatut] = useState(false)

  // ── Section 2 : générer contrat ──
  const [genSociete, setGenSociete] = useState("")
  const [genForm, setGenForm] = useState({
    employe_id: "", type: "CDI", secteur: "general",
    date_debut: "", date_fin: "", salaire: "",
  })
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  // ── Section 3 : vérification ──
  const [verifyText, setVerifyText] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<any[] | null>(null)

  // ── Chargement données ──
  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  useEffect(() => {
    if (genSociete) {
      fetch(`/api/rh/employes?societe_id=${genSociete}`).then(r => r.json()).then(d => setEmployes(d.employes || []))
    } else {
      setEmployes([])
    }
    setGenForm(f => ({ ...f, employe_id: "" }))
  }, [genSociete])

  const loadContrats = useCallback(async () => {
    setLoadingContrats(true)
    try {
      const params = new URLSearchParams()
      if (filtSociete !== "all") params.set("societe_id", filtSociete)
      if (filtType !== "all") params.set("type_contrat", filtType)
      if (filtStatut !== "all") params.set("statut", filtStatut)
      const res = await fetch(`/api/rh/contrats?${params}`)
      const d = await res.json()
      setContrats(d.contrats || [])
    } catch (e) { console.error(e) }
    finally { setLoadingContrats(false) }
  }, [filtSociete, filtType, filtStatut])

  useEffect(() => { loadContrats() }, [loadContrats])

  // ── Pré-remplissage salaire depuis fiche employé ──
  useEffect(() => {
    const emp = employes.find(e => e.id === genForm.employe_id)
    if (emp?.salaire_base) setGenForm(f => ({ ...f, salaire: String(emp.salaire_base) }))
  }, [genForm.employe_id, employes])

  // ── Générer contrat ──
  const genererContrat = async () => {
    const emp = employes.find(e => e.id === genForm.employe_id)
    if (!emp || !genForm.date_debut || !genForm.salaire) { alert("Champs requis : Employé, Date début, Salaire"); return }
    setGenerating(true); setGenResult(null); setSavedId(null)
    try {
      const res = await fetch("/api/juridique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generer_contrat",
          societe_id: genSociete,
          ...genForm,
          employe_nom: `${emp.prenom} ${emp.nom}`,
          poste: emp.poste,
          salaire: parseFloat(genForm.salaire),
        })
      })
      const data = await res.json()
      setGenResult(data.html || data.contrat || "Erreur génération")
    } catch { setGenResult("Erreur lors de la génération") }
    finally { setGenerating(false) }
  }

  // ── Sauvegarder contrat généré ──
  const sauvegarderContrat = async () => {
    if (!genResult || !genForm.employe_id) return
    setSaving(true)
    try {
      const { data } = await fetch("/api/rh/contrats", {
        method: "GET", // On passe par Supabase direct via la route PATCH ou on crée via /api/juridique
      }).then(() => ({ data: null })) // placeholder — voir note ci-dessous

      // Créer directement via Supabase REST (ou adapter /api/rh/contrats POST)
      const res = await fetch("/api/juridique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sauvegarder_contrat",
          employe_id: genForm.employe_id,
          societe_id: genSociete,
          type_contrat: genForm.type,
          secteur: genForm.secteur,
          date_debut: genForm.date_debut,
          date_fin: genForm.date_fin || null,
          salaire_brut: parseFloat(genForm.salaire),
          html_content: genResult,
          statut: "brouillon",
        })
      })
      const d = await res.json()
      if (d.id || d.contrat?.id) {
        setSavedId(d.id || d.contrat?.id)
        loadContrats()
      }
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const imprimerContrat = (html: string) => {
    const w = window.open("", "_blank")
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><title>Contrat</title></head><body>${html}</body></html>`)
    w.document.close()
    w.print()
  }

  const telechargerHTML = (html: string, nom = "contrat") => {
    const b = new Blob([`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Contrat</title></head><body>${html}</body></html>`], { type: "text/html" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `${nom}.html`; a.click()
  }

  // ── Vérifier contrat ──
  const verifierContrat = async () => {
    if (!verifyText.trim()) return
    setVerifying(true); setVerifyResult(null)
    try {
      const res = await fetch("/api/juridique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verifier_contrat", html: verifyText })
      })
      const data = await res.json()
      // L'API renvoie soit un tableau de points, soit un texte
      if (Array.isArray(data.points)) {
        setVerifyResult(data.points)
      } else {
        // Parser le texte en liste de points si l'API renvoie du texte brut
        const text: string = data.analyse || data.html || data.result || ""
        const lines = text.split("\n").filter((l: string) => l.trim())
        setVerifyResult(lines.map((l: string) => ({ statut: l.startsWith("✅") ? "ok" : l.startsWith("⚠️") ? "warning" : l.startsWith("❌") ? "error" : "info", texte: l })))
      }
    } catch { setVerifyResult([{ statut: "error", texte: "Erreur lors de l'analyse" }]) }
    finally { setVerifying(false) }
  }

  // ── Mettre à jour statut contrat ──
  const updateStatut = async (id: string, statut: string) => {
    setUpdatingStatut(true)
    try {
      await fetch(`/api/rh/contrats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut })
      })
      if (viewContrat?.id === id) setViewContrat((c: any) => ({ ...c, statut }))
      loadContrats()
    } catch (e) { console.error(e) }
    finally { setUpdatingStatut(false) }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[#1E2A4A]">Module Juridique</h1>
        <p className="text-sm text-gray-500">Contrats de travail — Droit mauricien (WRA 2019, Companies Act 2001)</p>
      </div>

      <Tabs defaultValue="contrats" className="space-y-4">
        <TabsList className="bg-white border">
          <TabsTrigger value="contrats">📋 Contrats existants</TabsTrigger>
          <TabsTrigger value="generer">✨ Générer un contrat</TabsTrigger>
          <TabsTrigger value="verifier">🔍 Vérifier un contrat</TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════════════════════
            SECTION 1 — Contrats existants
        ══════════════════════════════════════════════════════════ */}
        <TabsContent value="contrats" className="space-y-4">
          <Card>
            <CardContent className="p-4 flex gap-3 flex-wrap">
              <Select value={filtSociete} onValueChange={setFiltSociete}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Toutes sociétés" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes sociétés</SelectItem>
                  {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtType} onValueChange={setFiltType}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Type contrat" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous types</SelectItem>
                  {TYPES_CONTRAT.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtStatut} onValueChange={setFiltStatut}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Statut" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous statuts</SelectItem>
                  {Object.entries(STATUT_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {loadingContrats ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : contrats.length === 0 ? (
                <div className="text-center py-12 text-gray-500">Aucun contrat trouvé</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employé</TableHead>
                      <TableHead>Société</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Poste</TableHead>
                      <TableHead>Date début</TableHead>
                      <TableHead>Date fin</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contrats.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.employe?.prenom} {c.employe?.nom}</TableCell>
                        <TableCell className="text-sm text-gray-600">{c.employe?.societe?.nom ?? "—"}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{c.type_contrat}</Badge></TableCell>
                        <TableCell className="text-sm">{c.employe?.poste ?? "—"}</TableCell>
                        <TableCell className="text-sm font-mono">{c.date_debut ?? "—"}</TableCell>
                        <TableCell className="text-sm font-mono">{c.date_fin ?? <span className="text-gray-400">Indéterminée</span>}</TableCell>
                        <TableCell><StatutBadge statut={c.statut} /></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setViewContrat(c)}>
                              <Eye className="w-3 h-3 mr-1" />Voir
                            </Button>
                            {c.html_content && (
                              <>
                                <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => imprimerContrat(c.html_content)}>
                                  <Printer className="w-3 h-3" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => telechargerHTML(c.html_content, `contrat_${c.employe?.nom ?? c.id}`)}>
                                  <Download className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════
            SECTION 2 — Générer nouveau contrat
        ══════════════════════════════════════════════════════════ */}
        <TabsContent value="generer" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-[#1E2A4A] flex items-center gap-2 text-base">
                <FileText className="w-4 h-4" /> Générer un contrat de travail
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label>Société *</Label>
                  <Select value={genSociete} onValueChange={setGenSociete}>
                    <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Employé *</Label>
                  <Select value={genForm.employe_id} onValueChange={v => setGenForm(f => ({ ...f, employe_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent>{employes.map(e => <SelectItem key={e.id} value={e.id}>{e.prenom} {e.nom}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Type de contrat</Label>
                  <Select value={genForm.type} onValueChange={v => setGenForm(f => ({ ...f, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TYPES_CONTRAT.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Secteur</Label>
                  <Select value={genForm.secteur} onValueChange={v => setGenForm(f => ({ ...f, secteur: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SECTEURS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Date de début *</Label>
                  <Input type="date" value={genForm.date_debut} onChange={e => setGenForm(f => ({ ...f, date_debut: e.target.value }))} />
                </div>
                {(genForm.type === "CDD" || genForm.type === "Stage") && (
                  <div>
                    <Label>Date de fin</Label>
                    <Input type="date" value={genForm.date_fin} onChange={e => setGenForm(f => ({ ...f, date_fin: e.target.value }))} />
                  </div>
                )}
                <div>
                  <Label>Salaire brut (MUR) *</Label>
                  <Input type="number" value={genForm.salaire} onChange={e => setGenForm(f => ({ ...f, salaire: e.target.value }))} placeholder="Ex: 45000" />
                </div>
              </div>

              <Button
                onClick={genererContrat}
                disabled={generating || !genForm.employe_id || !genForm.date_debut || !genForm.salaire}
                className="bg-[#1E2A4A] text-white"
              >
                {generating ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Génération en cours...</> : "✨ Générer avec IA"}
              </Button>

              {genResult && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-[#1E2A4A]">Contrat généré</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => imprimerContrat(genResult)}>
                        <Printer className="w-4 h-4 mr-1" />Imprimer / PDF
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => telechargerHTML(genResult, "contrat_nouveau")}>
                        <Download className="w-4 h-4 mr-1" />Télécharger .html
                      </Button>
                      <Button
                        size="sm"
                        className="bg-green-700 text-white hover:bg-green-800"
                        onClick={sauvegarderContrat}
                        disabled={saving || !!savedId}
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                        {savedId ? "✅ Sauvegardé" : "💾 Sauvegarder"}
                      </Button>
                    </div>
                  </div>
                  <ScrollArea className="h-[500px] border rounded-lg bg-white p-4">
                    <div className="prose prose-sm max-w-none text-xs text-gray-800" dangerouslySetInnerHTML={{ __html: genResult }} />
                  </ScrollArea>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════
            SECTION 3 — Vérification contrat
        ══════════════════════════════════════════════════════════ */}
        <TabsContent value="verifier" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-[#1E2A4A] flex items-center gap-2 text-base">
                🔍 Vérification de conformité (WRA 2019)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Collez le texte ou HTML du contrat à analyser</Label>
                <Textarea
                  value={verifyText}
                  onChange={e => setVerifyText(e.target.value)}
                  placeholder="Collez ici le contenu du contrat..."
                  rows={10}
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <Button
                onClick={verifierContrat}
                disabled={verifying || !verifyText.trim()}
                className="bg-[#1E2A4A] text-white"
              >
                {verifying ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Analyse en cours...</> : "🔍 Analyser avec IA"}
              </Button>

              {verifyResult && (
                <div className="space-y-2 mt-4">
                  <p className="text-sm font-semibold text-[#1E2A4A]">Résultats de conformité</p>
                  <div className="space-y-1.5">
                    {verifyResult.map((point: any, i: number) => {
                      const isOk = point.statut === "ok" || point.texte?.startsWith("✅")
                      const isWarn = point.statut === "warning" || point.texte?.startsWith("⚠️")
                      const isErr = point.statut === "error" || point.texte?.startsWith("❌")
                      return (
                        <div
                          key={i}
                          className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
                            isOk ? "bg-green-50 text-green-800"
                            : isWarn ? "bg-yellow-50 text-yellow-800"
                            : isErr ? "bg-red-50 text-red-800"
                            : "bg-gray-50 text-gray-700"
                          }`}
                        >
                          {isOk && <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-green-600" />}
                          {isWarn && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-yellow-600" />}
                          {isErr && <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />}
                          {!isOk && !isWarn && !isErr && <span className="w-4 shrink-0" />}
                          <span>{point.texte ?? point}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Dialog : voir contrat complet ── */}
      <Dialog open={!!viewContrat} onOpenChange={open => !open && setViewContrat(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Contrat — {viewContrat?.employe?.prenom} {viewContrat?.employe?.nom}
              <StatutBadge statut={viewContrat?.statut ?? "brouillon"} />
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 flex-wrap border-b pb-3">
            <span className="text-sm text-gray-500">Changer statut :</span>
            {Object.entries(STATUT_LABELS).map(([v, l]) => (
              <Button
                key={v}
                size="sm"
                variant={viewContrat?.statut === v ? "default" : "outline"}
                className={`h-7 text-xs ${viewContrat?.statut === v ? "bg-[#1E2A4A] text-white" : ""}`}
                disabled={updatingStatut || viewContrat?.statut === v}
                onClick={() => updateStatut(viewContrat!.id, v)}
              >
                {l}
              </Button>
            ))}
            {viewContrat?.html_content && (
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => imprimerContrat(viewContrat.html_content)}>
                  <Printer className="w-3 h-3 mr-1" />PDF
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => telechargerHTML(viewContrat.html_content, `contrat_${viewContrat.employe?.nom ?? ""}`)}>
                  <Download className="w-3 h-3 mr-1" />.html
                </Button>
              </div>
            )}
          </div>
          <ScrollArea className="flex-1 mt-2">
            {viewContrat?.html_content ? (
              <div className="prose prose-sm max-w-none p-4 text-sm text-gray-800" dangerouslySetInnerHTML={{ __html: viewContrat.html_content }} />
            ) : (
              <div className="p-6 text-center text-gray-500">
                <p>Aucun contenu HTML disponible.</p>
                <p className="text-xs mt-1 text-gray-400">Type : {viewContrat?.type_contrat} | Secteur : {viewContrat?.secteur}</p>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
