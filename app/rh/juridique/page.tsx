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
import { Loader2, FileText, Eye, Download, Printer, CheckCircle, XCircle, AlertCircle, Link2, Copy, CheckCheck, Pencil, Save, Upload, ImageIcon } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { ContractEditor } from "@/components/rh/ContractEditor"
import { t, getLocale, type Locale } from "@/lib/i18n"

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
  brouillon:     "bg-gray-100 text-gray-700",
  signe_employe: "bg-blue-100 text-blue-700",
  signe:         "bg-green-100 text-green-700",
  expire:        "bg-orange-100 text-orange-700",
  resilie:       "bg-red-100 text-red-700",
}

const STATUT_LABELS: Record<string, string> = {
  brouillon:     "Brouillon",
  signe_employe: "Signé par employé",
  signe:         "Signé ✓✓",
  expire:        "Expiré",
  resilie:       "Résilié",
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
  const locale: Locale = getLocale()
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

  // ── Sprint 5 AMÉLIO F — édition + signature dirigeant ──
  const [editMode, setEditMode] = useState(false)
  const [editedHtml, setEditedHtml] = useState<string>("")
  const [sigNom, setSigNom] = useState<string>("")
  const [sigImage, setSigImage] = useState<string>("") // data URI
  const [savingEdit, setSavingEdit] = useState(false)

  // ── Section 2 : générer contrat ──
  // Sprint 6 FIX 4 — champs enrichis : poste éditable, horaires, période d'essai
  const [genSociete, setGenSociete] = useState("")
  const [genForm, setGenForm] = useState({
    employe_id: "", type: "CDI", secteur: "general",
    date_debut: "", date_fin: "", salaire: "",
    poste: "",
    heures_semaine: "45",
    periode_essai_oui: true,
    periode_essai_jours: "90",
  })
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  // ── Section 3 : vérification ──
  const [verifyText, setVerifyText] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<any[] | null>(null)

  // ── Signature électronique ──
  const [genLienLoading, setGenLienLoading] = useState<string | null>(null)
  const [lienSignature, setLienSignature] = useState<{ id: string; lien: string; whatsapp: boolean; telephone: string | null; employe: string } | null>(null)
  const [copied, setCopied] = useState(false)

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

  // ── Pré-remplissage depuis fiche employé (Sprint 6 FIX 4 : +poste, +date_debut) ──
  useEffect(() => {
    const emp = employes.find(e => e.id === genForm.employe_id)
    if (!emp) return
    setGenForm(f => {
      const next = { ...f }
      if (emp.salaire_base && !next.salaire) next.salaire = String(emp.salaire_base)
      if (emp.poste && !next.poste) next.poste = emp.poste
      if (emp.date_arrivee && !next.date_debut) next.date_debut = String(emp.date_arrivee).slice(0, 10)
      return next
    })
  }, [genForm.employe_id, employes])

  // Sprint 6 FIX 4 — pré-remplissage horaires depuis la société
  useEffect(() => {
    if (!genSociete) return
    const soc = societes.find(s => s.id === genSociete)
    if (soc?.heures_semaine) {
      setGenForm(f => ({ ...f, heures_semaine: String(soc.heures_semaine) }))
    }
  }, [genSociete, societes])

  // ── Générer contrat (Sprint 6 FIX 4 — champs enrichis) ──
  const genererContrat = async () => {
    const emp = employes.find(e => e.id === genForm.employe_id)
    if (!emp || !genForm.date_debut || !genForm.salaire) { alert("Champs requis : Employé, Date début, Salaire"); return }
    if (!genForm.poste) { alert("Poste requis (pré-rempli depuis la fiche employé — vérifiez le champ)"); return }
    setGenerating(true); setGenResult(null); setSavedId(null)
    try {
      const res = await fetch("/api/juridique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generer_contrat",
          societe_id: genSociete,
          employe_id: genForm.employe_id,
          type: genForm.type,
          secteur: genForm.secteur,
          date_debut: genForm.date_debut,
          date_fin: genForm.date_fin || null,
          employe_nom: `${emp.prenom} ${emp.nom}`,
          poste: genForm.poste,  // éditable depuis le formulaire (plus emp.poste hardcodé)
          salaire: parseFloat(genForm.salaire),
          heures_semaine: parseInt(genForm.heures_semaine, 10) || 45,
          periode_essai_oui: genForm.periode_essai_oui,
          periode_essai_jours: genForm.periode_essai_oui
            ? (parseInt(genForm.periode_essai_jours, 10) || 90)
            : 0,
        })
      })
      const data = await res.json()
      if (!res.ok || data?.error) {
        console.error('[juridique genererContrat]', res.status, data)
        alert(`Erreur génération : ${data?.error || `HTTP ${res.status}`}`)
        setGenResult(null)
        return
      }
      setGenResult(data.html || "Erreur génération")
      // Sprint 6 FIX 4 — le contrat est déjà inséré en DB par /api/juridique
      // (avec signature_nom_complet pré-rempli depuis societe.contacts principal).
      // On refresh la liste des contrats pour afficher le nouveau immédiatement.
      if (data.contrat?.id) {
        setSavedId(data.contrat.id)
        loadContrats()
      }
    } catch (e: any) {
      console.error('[juridique genererContrat] exception', e)
      alert(`Erreur réseau : ${e?.message || ''}`)
      setGenResult(null)
    }
    finally { setGenerating(false) }
  }

  // ── Sauvegarder contrat généré ──
  const sauvegarderContrat = async () => {
    if (!genResult || !genForm.employe_id) return
    setSaving(true)
    try {
      const res = await fetch("/api/rh/contrats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employe_id: genForm.employe_id,
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
      if (d.contrat?.id) {
        setSavedId(d.contrat.id)
        loadContrats()
      } else {
        alert("Erreur sauvegarde : " + (d.error || "Inconnue"))
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

  // ── Générer lien de signature ──
  const genererLienSignature = async (id: string) => {
    setGenLienLoading(id)
    try {
      const res = await fetch(`/api/rh/contrats/${id}/signer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generer_token" }),
      })
      const data = await res.json()
      if (data.lien_signature) {
        setLienSignature({ id, lien: data.lien_signature, whatsapp: data.whatsapp_envoye, telephone: data.telephone, employe: data.employe })
      } else {
        alert("Erreur : " + (data.error || "Impossible de générer le lien"))
      }
    } catch { alert("Erreur réseau") }
    finally { setGenLienLoading(null) }
  }

  const copierLien = () => {
    if (!lienSignature) return
    navigator.clipboard.writeText(lienSignature.lien)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

  // ── Contresignature dirigeant ──
  const [contresignant, setContresignant] = useState(false)
  const contresigner = async (id: string) => {
    if (!confirm("Confirmer votre contresignature ? Cette action est irréversible.")) return
    setContresignant(true)
    try {
      const res = await fetch(`/api/rh/contrats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "contresigner" })
      })
      const data = await res.json()
      if (data.error) { alert("Erreur : " + data.error); return }
      if (viewContrat?.id === id) setViewContrat((c: any) => ({ ...c, statut: "signe" }))
      loadContrats()
    } catch (e) { console.error(e) }
    finally { setContresignant(false) }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[#0B0F2E]">{t('rha.b.jur.title', locale)}</h1>
        <p className="text-sm text-gray-500">{t('rha.b.jur.subtitle', locale)}</p>
      </div>

      <Tabs defaultValue="contrats" className="space-y-4">
        <TabsList className="bg-white border">
          <TabsTrigger value="contrats">{t('rha.b.jur.tab_existing', locale)}</TabsTrigger>
          <TabsTrigger value="generer">{t('rha.b.jur.tab_generate', locale)}</TabsTrigger>
          <TabsTrigger value="verifier">{t('rha.b.jur.tab_verify', locale)}</TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════════════════════
            SECTION 1 — Contrats existants
        ══════════════════════════════════════════════════════════ */}
        <TabsContent value="contrats" className="space-y-4">
          <Card>
            <CardContent className="p-4 flex gap-3 flex-wrap">
              <Select value={filtSociete} onValueChange={setFiltSociete}>
                <SelectTrigger className="w-48"><SelectValue placeholder={t('rha.b.jur.filter_all_societes', locale)} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('rha.b.jur.filter_all_societes', locale)}</SelectItem>
                  {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtType} onValueChange={setFiltType}>
                <SelectTrigger className="w-40"><SelectValue placeholder={t('rha.b.jur.filter_contract_type', locale)} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('rha.b.jur.filter_all_types', locale)}</SelectItem>
                  {TYPES_CONTRAT.map(tc => <SelectItem key={tc} value={tc}>{tc}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtStatut} onValueChange={setFiltStatut}>
                <SelectTrigger className="w-36"><SelectValue placeholder={t('rha.b.jur.filter_status', locale)} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('rha.b.jur.filter_all_status', locale)}</SelectItem>
                  {Object.entries(STATUT_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loadingContrats ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : contrats.length === 0 ? (
                <div className="text-center py-12 text-gray-500">{t('rha.b.jur.no_contract', locale)}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('rha.b.jur.col_employee', locale)}</TableHead>
                      <TableHead>{t('rha.b.jur.col_societe', locale)}</TableHead>
                      <TableHead>{t('rha.b.jur.col_type', locale)}</TableHead>
                      <TableHead>{t('rha.b.jur.col_position', locale)}</TableHead>
                      <TableHead>{t('rha.b.jur.col_start', locale)}</TableHead>
                      <TableHead>{t('rha.b.jur.col_end', locale)}</TableHead>
                      <TableHead>{t('rha.b.jur.col_status', locale)}</TableHead>
                      <TableHead>{t('rha.b.jur.col_actions', locale)}</TableHead>
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
                        <TableCell className="text-sm font-mono">{c.date_fin ?? <span className="text-gray-400">{t('rha.b.jur.indeterminate', locale)}</span>}</TableCell>
                        <TableCell><StatutBadge statut={c.statut} /></TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setViewContrat(c)}>
                              <Eye className="w-3 h-3 mr-1" />{t('rha.b.jur.btn_view', locale)}
                            </Button>
                            {c.id && (
                              <a href={`/api/rh/contrats/${c.id}/pdf`} target="_blank" rel="noopener noreferrer">
                                <Button size="sm" variant="outline" className="h-7 text-xs px-2">
                                  <Download className="w-3 h-3 mr-1" />{t('rha.b.jur.btn_pdf', locale)}
                                </Button>
                              </a>
                            )}
                            {c.html_content && (
                              <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => imprimerContrat(c.html_content)}>
                                <Printer className="w-3 h-3" />
                              </Button>
                            )}
                            {c.statut !== "signe" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2 border-[#D4AF37] text-[#0B0F2E] hover:bg-[#D4AF37]/10"
                                onClick={() => genererLienSignature(c.id)}
                                disabled={genLienLoading === c.id}
                              >
                                {genLienLoading === c.id
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <><Link2 className="w-3 h-3 mr-1" />{t('rha.b.jur.btn_sign', locale)}</>
                                }
                              </Button>
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
              <CardTitle className="text-[#0B0F2E] flex items-center gap-2 text-base">
                <FileText className="w-4 h-4" /> {t('rha.b.jur.gen_title', locale)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label>{t('rha.b.jur.lbl_societe_req', locale)}</Label>
                  <Select value={genSociete} onValueChange={setGenSociete}>
                    <SelectTrigger><SelectValue placeholder={t('rha.b.jur.choose', locale)} /></SelectTrigger>
                    <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('rha.b.jur.lbl_employee_req', locale)}</Label>
                  <Select value={genForm.employe_id} onValueChange={v => setGenForm(f => ({ ...f, employe_id: v }))}>
                    <SelectTrigger><SelectValue placeholder={t('rha.b.jur.choose', locale)} /></SelectTrigger>
                    <SelectContent>{employes.map(e => <SelectItem key={e.id} value={e.id}>{e.prenom} {e.nom}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('rha.b.jur.lbl_contract_type', locale)}</Label>
                  <Select value={genForm.type} onValueChange={v => setGenForm(f => ({ ...f, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TYPES_CONTRAT.map(tc => <SelectItem key={tc} value={tc}>{tc}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('rha.b.jur.lbl_sector', locale)}</Label>
                  <Select value={genForm.secteur} onValueChange={v => setGenForm(f => ({ ...f, secteur: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SECTEURS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {/* Sprint 6 FIX 4 — Poste éditable (pré-rempli depuis fiche employé) */}
                <div>
                  <Label>{t('rha.b.jur.lbl_position_req', locale)}</Label>
                  <Input
                    value={genForm.poste}
                    onChange={e => setGenForm(f => ({ ...f, poste: e.target.value }))}
                    placeholder={t('rha.b.jur.position_ph', locale)}
                  />
                </div>
                <div>
                  <Label>{t('rha.b.jur.lbl_start_req', locale)}</Label>
                  <Input type="date" value={genForm.date_debut} onChange={e => setGenForm(f => ({ ...f, date_debut: e.target.value }))} />
                </div>
                {(genForm.type === "CDD" || genForm.type === "Stage") && (
                  <div>
                    <Label>{t('rha.b.jur.lbl_end_date', locale)}</Label>
                    <Input type="date" value={genForm.date_fin} onChange={e => setGenForm(f => ({ ...f, date_fin: e.target.value }))} />
                  </div>
                )}
                <div>
                  <Label>{t('rha.b.jur.lbl_gross_req', locale)}</Label>
                  <Input type="number" value={genForm.salaire} onChange={e => setGenForm(f => ({ ...f, salaire: e.target.value }))} placeholder="Ex: 45000" />
                </div>
                {/* Sprint 6 FIX 4 — Horaires semaine */}
                <div>
                  <Label>{t('rha.b.jur.lbl_hours_week', locale)}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={genForm.heures_semaine}
                    onChange={e => setGenForm(f => ({ ...f, heures_semaine: e.target.value }))}
                    placeholder="45"
                  />
                </div>
              </div>

              {/* Sprint 6 FIX 4 — Période d'essai */}
              <div className="flex flex-wrap items-center gap-4 rounded-lg bg-slate-50 border p-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={genForm.periode_essai_oui}
                    onChange={e => setGenForm(f => ({ ...f, periode_essai_oui: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  <span className="font-medium text-[#0B0F2E]">{t('rha.b.jur.lbl_trial_period', locale)}</span>
                </label>
                {genForm.periode_essai_oui && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-gray-600">{t('rha.b.jur.duration', locale)}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={genForm.periode_essai_jours}
                      onChange={e => setGenForm(f => ({ ...f, periode_essai_jours: e.target.value }))}
                      className="w-24 h-9"
                    />
                    <span className="text-xs text-gray-600">{t('rha.b.jur.days', locale)}</span>
                    <span className="text-xs text-gray-400">{t('rha.b.jur.trial_default', locale)}</span>
                  </div>
                )}
              </div>

              <Button
                onClick={genererContrat}
                disabled={generating || !genForm.employe_id || !genForm.date_debut || !genForm.salaire}
                className="bg-[#0B0F2E] text-white"
              >
                {generating ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />{t('rha.b.jur.btn_generating', locale)}</> : t('rha.b.jur.btn_generate_ai', locale)}
              </Button>

              {genResult && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-[#0B0F2E]">{t('rha.b.jur.contract_generated', locale)}</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => imprimerContrat(genResult)}>
                        <Printer className="w-4 h-4 mr-1" />{t('rha.b.jur.btn_print_pdf', locale)}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => telechargerHTML(genResult, "contrat_nouveau")}>
                        <Download className="w-4 h-4 mr-1" />{t('rha.b.jur.btn_dl_html', locale)}
                      </Button>
                      <Button
                        size="sm"
                        className="bg-green-700 text-white hover:bg-green-800"
                        onClick={sauvegarderContrat}
                        disabled={saving || !!savedId}
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                        {savedId ? t('rha.b.jur.btn_saved', locale) : t('rha.b.jur.btn_save', locale)}
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
              <CardTitle className="text-[#0B0F2E] flex items-center gap-2 text-base">
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
                className="bg-[#0B0F2E] text-white"
              >
                {verifying ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Analyse en cours...</> : "🔍 Analyser avec IA"}
              </Button>

              {verifyResult && (
                <div className="space-y-2 mt-4">
                  <p className="text-sm font-semibold text-[#0B0F2E]">Résultats de conformité</p>
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

      {/* ── Dialog : lien de signature généré ── */}
      <Dialog open={!!lienSignature} onOpenChange={open => { if (!open) { setLienSignature(null); setCopied(false) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#0B0F2E]">
              <Link2 className="w-5 h-5 text-[#D4AF37]" />
              Lien de signature généré
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-600">
              Envoyez ce lien à l'employé par email ou WhatsApp. Le lien est à usage unique et sera invalidé après signature.
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={lienSignature?.lien || ""}
                className="flex-1 text-xs border rounded-lg px-3 py-2 bg-gray-50 font-mono text-gray-700 focus:outline-none"
              />
              <Button
                size="sm"
                onClick={copierLien}
                className="shrink-0 bg-[#0B0F2E] text-white hover:bg-[#0B0F2E]/80"
              >
                {copied ? <><CheckCheck className="w-4 h-4 mr-1" />Copié</> : <><Copy className="w-4 h-4 mr-1" />Copier</>}
              </Button>
            </div>
            {lienSignature?.whatsapp ? (
              <div className="text-sm p-3 bg-green-50 text-green-800 rounded-lg border border-green-200">
                ✅ WhatsApp envoyé à <strong>{lienSignature.employe}</strong> ({lienSignature.telephone})
              </div>
            ) : (
              <div className="text-sm p-3 bg-amber-50 text-amber-800 rounded-lg border border-amber-200">
                ⚠️ Aucun téléphone enregistré — envoyez le lien manuellement.
              </div>
            )}
            <div className="text-xs text-gray-400 p-3 bg-gray-50 rounded-lg">
              ✅ Conforme Electronic Transactions Act 2000 — La signature enregistre l'IP, la date et l'heure de l'employé.
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog : voir / modifier contrat ── */}
      <Dialog
        open={!!viewContrat}
        onOpenChange={open => {
          if (!open) {
            setViewContrat(null)
            setEditMode(false)
            setEditedHtml("")
            setSigNom("")
            setSigImage("")
          }
        }}
      >
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
                className={`h-7 text-xs ${viewContrat?.statut === v ? "bg-[#0B0F2E] text-white" : ""}`}
                disabled={updatingStatut || viewContrat?.statut === v}
                onClick={() => updateStatut(viewContrat!.id, v)}
              >
                {l}
              </Button>
            ))}
            <div className="ml-auto flex gap-2">
              {viewContrat?.id && (
                <a href={`/api/rh/contrats/${viewContrat.id}/pdf`} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    <Download className="w-3 h-3 mr-1" />PDF
                  </Button>
                </a>
              )}
              {(viewContrat?.html_content_modified || viewContrat?.html_content) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => imprimerContrat(viewContrat.html_content_modified || viewContrat.html_content)}
                >
                  <Printer className="w-3 h-3 mr-1" />Imprimer
                </Button>
              )}
              {/* Sprint 5 AMÉLIO F — bouton Modifier / Enregistrer */}
              {!editMode ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={!viewContrat || viewContrat.statut === "signe"}
                  onClick={() => {
                    if (!viewContrat) return
                    setEditedHtml(viewContrat.html_content_modified || viewContrat.html_content || "")
                    setSigNom(viewContrat.signature_nom_complet || "")
                    setSigImage(viewContrat.signature_image_dirigeant_url || "")
                    setEditMode(true)
                  }}
                >
                  <Pencil className="w-3 h-3 mr-1" />Modifier
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={savingEdit}
                    onClick={() => { setEditMode(false); setEditedHtml(""); setSigNom(""); setSigImage("") }}
                  >
                    Annuler
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-[#0B0F2E] text-white"
                    disabled={savingEdit}
                    onClick={async () => {
                      if (!viewContrat) return
                      setSavingEdit(true)
                      try {
                        const res = await fetch(`/api/rh/contrats/${viewContrat.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            html_content_modified: editedHtml,
                            signature_nom_complet: sigNom || null,
                            signature_image_dirigeant_url: sigImage || null,
                          }),
                        })
                        const d = await res.json()
                        if (!res.ok) { alert(d.error || "Erreur de sauvegarde"); return }
                        setViewContrat({ ...viewContrat, ...d.contrat })
                        setEditMode(false)
                        loadContrats()
                      } catch (e: any) {
                        alert("Erreur réseau : " + (e?.message || ""))
                      } finally {
                        setSavingEdit(false)
                      }
                    }}
                  >
                    {savingEdit ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                    Enregistrer
                  </Button>
                </>
              )}
              {viewContrat?.statut === "brouillon" && !editMode && (
                <Button
                  size="sm"
                  className="h-7 text-xs bg-[#D4AF37] text-[#0B0F2E] hover:bg-[#D4AF37]/80"
                  onClick={() => genererLienSignature(viewContrat!.id)}
                  disabled={genLienLoading === viewContrat?.id}
                >
                  {genLienLoading === viewContrat?.id
                    ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    : <Link2 className="w-3 h-3 mr-1" />
                  }
                  Envoyer à l'employé
                </Button>
              )}
              {viewContrat?.statut === "signe_employe" && !editMode && (
                <Button
                  size="sm"
                  className="h-7 text-xs bg-green-700 text-white hover:bg-green-800"
                  onClick={() => contresigner(viewContrat!.id)}
                  disabled={contresignant}
                >
                  {contresignant
                    ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    : "✍️ Contresigner"
                  }
                </Button>
              )}
            </div>
          </div>
          <ScrollArea className="flex-1 mt-2">
            {editMode ? (
              <div className="space-y-4 p-2">
                {/* Sprint 5 AMÉLIO F — éditeur TipTap */}
                <ContractEditor initialHtml={editedHtml} onChange={setEditedHtml} />

                <div className="rounded-xl border p-4 bg-amber-50/40 space-y-3">
                  <h3 className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" /> Signature du dirigeant
                  </h3>
                  <p className="text-xs text-amber-800">
                    Le nom et l'image seront rendus au bas du contrat. Visible à l'employé
                    au moment de la signature.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Nom du signataire</Label>
                      <Input
                        value={sigNom}
                        onChange={e => setSigNom(e.target.value)}
                        placeholder="Stephane BACH, CEO"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Image signature (PNG/JPG)</Label>
                      <Input
                        type="file"
                        accept="image/png,image/jpeg"
                        className="h-9 text-xs"
                        onChange={async e => {
                          const f = e.target.files?.[0]
                          if (!f) return
                          if (f.size > 500_000) {
                            alert("Image trop lourde (> 500 Ko). Compressez avant upload.")
                            return
                          }
                          const reader = new FileReader()
                          reader.onload = () => setSigImage(typeof reader.result === 'string' ? reader.result : "")
                          reader.readAsDataURL(f)
                        }}
                      />
                    </div>
                  </div>
                  {sigImage && (
                    <div className="flex items-center gap-3">
                      <img src={sigImage} alt="Signature" className="h-16 border rounded bg-white p-1" />
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSigImage("")}>
                        <XCircle className="w-3 h-3 mr-1" />Retirer
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (viewContrat?.html_content_modified || viewContrat?.html_content) ? (
              <>
                <div
                  className="prose prose-sm max-w-none p-4 text-sm text-gray-800"
                  dangerouslySetInnerHTML={{
                    __html: viewContrat.html_content_modified || viewContrat.html_content,
                  }}
                />
                {/* Bloc signature dirigeant rendu en bas du contrat */}
                {(viewContrat?.signature_nom_complet || viewContrat?.signature_image_dirigeant_url) && (
                  <div className="mx-4 mt-6 mb-4 p-4 border-t bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-2">Signature de l'employeur</p>
                    {viewContrat.signature_image_dirigeant_url && (
                      <img
                        src={viewContrat.signature_image_dirigeant_url}
                        alt="Signature dirigeant"
                        className="h-16 bg-white border p-1 rounded mb-2"
                      />
                    )}
                    {viewContrat.signature_nom_complet && (
                      <p className="text-sm font-medium text-gray-800">{viewContrat.signature_nom_complet}</p>
                    )}
                  </div>
                )}
              </>
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
    </ClientPageShell>
  )
}

