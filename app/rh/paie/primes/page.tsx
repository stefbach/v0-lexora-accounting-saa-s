"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Plus, CheckCircle, Pencil, Trash2, Upload, FileSpreadsheet, AlertTriangle, X } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import * as XLSX from "xlsx"
import { t, getLocale, type Locale } from "@/lib/i18n"
import { Switch } from "@/components/ui/switch"
import { SectionOvertime } from "./_components/section-overtime"
import { ImportPrimesDialog } from "./_components/import-primes-dialog"

function typePrimeLabels(locale: Locale): Record<string, string> {
  return {
    fixe: t('rhp.primes.type_fixe', locale),
    variable_unitaire: t('rhp.primes.type_variable_unitaire', locale),
    bonus_objectif: t('rhp.primes.type_bonus_objectif', locale),
    pourcentage: t('rhp.primes.type_pourcentage', locale),
    commission: t('rhp.primes.type_commission', locale),
    meal_allowance: "Meal Allowance",
    call_allowance: "Call Allowance",
    astreinte: t('rhp.primes.type_astreinte', locale),
    night_shift: "Night Shift Allowance (+15%)",
  }
}

const STATUT_COLORS: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  approuve: "bg-green-100 text-green-700",
  integre: "bg-blue-100 text-blue-700",
}

function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " MUR" }

export default function PrimesPage() {
  const locale = getLocale()
  const TYPE_PRIME_LABELS = typePrimeLabels(locale)
  const [tab, setTab] = useState<"catalogue" | "saisie" | "regles">("catalogue")
  const [regles, setRegles] = useState<any[]>([])
  const [regleDialog, setRegleDialog] = useState(false)
  const [regleForm, setRegleForm] = useState({ nom: "", type: "meal_allowance", montant: "", conditions_ot_min: "1", scope: "tous", scope_value: "", actif: true })
  const [regleError, setRegleError] = useState<string | null>(null)
  const [societes, setSocietes] = useState<any[]>([])
  const [employes, setEmployes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0, 7))
  const [catalogue, setCatalogue] = useState<any[]>([])
  const [saisies, setSaisies] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Dialog nouvelle prime catalogue
  const [catDialog, setCatDialog] = useState(false)
  const [catForm, setCatForm] = useState({ code: "", libelle: "", type_prime: "fixe", montant_fixe: "", montant_par_unite: "", unite: "", pourcentage: "", bonus_objectif_montant: "", periode_application: "mensuel", postes_eligibles: "" })
  const [catError, setCatError] = useState<string | null>(null)

  // Dialog saisie prime
  const [saisieDialog, setSaisieDialog] = useState(false)
  const [saisieForm, setSaisieForm] = useState({ employe_id: "", prime_id: "", quantite: "", notes: "" })

  // Dialog édition prime mensuelle
  const [editDialog, setEditDialog] = useState<any | null>(null)
  const [editForm, setEditForm] = useState({ montant: "", quantite: "", notes: "" })
  const [editError, setEditError] = useState<string | null>(null)

  // Excel import
  const [importDialog, setImportDialog] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPrimeId, setImportPrimeId] = useState("")
  const [importPreview, setImportPreview] = useState<any[]>([])
  const [importRunning, setImportRunning] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [saisieCalc, setSaisieCalc] = useState<number | null>(null)
  const [saisieError, setSaisieError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  useEffect(() => {
    if (societe !== "all") {
      fetch(`/api/rh/employes?societe_id=${societe}`).then(r => r.json()).then(d => setEmployes(d.employes || []))
    }
  }, [societe])

  const loadCatalogue = useCallback(async () => {
    setLoading(true)
    try {
      const params = societe !== "all" ? `?societe_id=${societe}&type=catalogue` : "?type=catalogue"
      const data = await fetch(`/api/rh/primes${params}`).then(r => r.json())
      setCatalogue(data.primes || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [societe])

  const loadSaisies = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ periode, type: "saisie" })
    if (societe !== "all") params.set("societe_id", societe)
    const requestUrl = `/api/rh/primes?${params}`
    try {
      const res = await fetch(requestUrl)
      const body = await res.json().catch(() => ({ error: t('rhp.primes.err_non_json', locale) }))
      setSaisies(Array.isArray(body?.primes) ? body.primes : [])
    } catch (e: any) {
      console.error(e)
      setSaisies([])
    } finally { setLoading(false) }
  }, [societe, periode])

  const loadRegles = useCallback(async () => {
    if (societe === "all") return
    setLoading(true)
    try {
      const data = await fetch(`/api/rh/primes/regles?societe_id=${societe}`).then(r => r.json())
      setRegles(data.regles || [])
    } catch { /* noop */ } finally { setLoading(false) }
  }, [societe])

  useEffect(() => {
    if (tab === "catalogue") loadCatalogue()
    else if (tab === "saisie") loadSaisies()
    else if (tab === "regles") loadRegles()
  }, [tab, loadCatalogue, loadSaisies, loadRegles])

  const creerRegle = async () => {
    if (!regleForm.nom || societe === "all") { setRegleError(t('rhp.primes.err_nom_societe', locale)); return }
    setSaving(true); setRegleError(null)
    try {
      const res = await fetch("/api/rh/primes/regles", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "creer_regle", societe_id: societe, nom: regleForm.nom, type: regleForm.type, montant: Number(regleForm.montant) || 0, scope: regleForm.scope, scope_value: regleForm.scope_value || null, conditions: { ot_min_heures: Number(regleForm.conditions_ot_min) || 0 } })
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setRegleDialog(false)
      setRegleForm({ nom: "", type: "meal_allowance", montant: "", conditions_ot_min: "1", scope: "tous", scope_value: "", actif: true })
      loadRegles()
    } catch (e: any) { setRegleError(e.message) }
    finally { setSaving(false) }
  }

  const toggleRegle = async (id: string, actif: boolean) => {
    await fetch("/api/rh/primes/regles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "modifier_regle", id, actif }) })
    loadRegles()
  }

  const deleteRegle = async (id: string) => {
    if (!confirm(t('rhp.primes.confirm_del_regle', locale))) return
    await fetch("/api/rh/primes/regles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "supprimer_regle", id }) })
    loadRegles()
  }

  const creerCatalogue = async () => {
    if (!catForm.libelle || !catForm.type_prime) { setCatError(t('rhp.primes.err_libelle_type', locale)); return }
    setSaving(true); setCatError(null)
    try {
      const res = await fetch("/api/rh/primes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "creer_catalogue", ...catForm, societe_id: societe !== "all" ? societe : null, montant_fixe: catForm.montant_fixe ? Number(catForm.montant_fixe) : null, montant_par_unite: catForm.montant_par_unite ? Number(catForm.montant_par_unite) : null, pourcentage: catForm.pourcentage ? Number(catForm.pourcentage) : null, bonus_objectif_montant: catForm.bonus_objectif_montant ? Number(catForm.bonus_objectif_montant) : null })
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setCatDialog(false)
      setCatForm({ code: "", libelle: "", type_prime: "fixe", montant_fixe: "", montant_par_unite: "", unite: "", pourcentage: "", bonus_objectif_montant: "", periode_application: "mensuel", postes_eligibles: "" })
      loadCatalogue()
    } catch (e: unknown) { setCatError(e instanceof Error ? e.message : t('rhp.primes.err_generic', locale)) }
    finally { setSaving(false) }
  }

  const toggleActif = async (id: string, actif: boolean) => {
    await fetch(`/api/rh/primes/${id}?type=catalogue`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "catalogue", actif }) })
    loadCatalogue()
  }

  // Calculer montant en temps réel
  useEffect(() => {
    if (!saisieForm.prime_id) { setSaisieCalc(null); return }
    const prime = catalogue.find(p => p.id === saisieForm.prime_id)
    if (!prime) return
    let calc: number | null = null
    switch (prime.type_prime) {
      case "fixe": calc = prime.montant_fixe || 0; break
      case "variable_unitaire": case "commission":
        calc = Number(saisieForm.quantite || 0) * (prime.montant_par_unite || 0)
        break
      case "bonus_objectif": calc = prime.bonus_objectif_montant || 0; break
      case "pourcentage": {
        const emp = employes.find(e => e.id === saisieForm.employe_id)
        if (emp) calc = Math.round(Number(emp.salaire_base || 0) * ((prime.pourcentage || 0) / 100) * 100) / 100
        break
      }
    }
    setSaisieCalc(calc)
  }, [saisieForm.prime_id, saisieForm.quantite, saisieForm.employe_id, catalogue, employes])

  const saisirPrime = async () => {
    if (!saisieForm.employe_id || !saisieForm.prime_id) { setSaisieError(t('rhp.primes.err_employe_prime', locale)); return }
    setSaving(true); setSaisieError(null)
    try {
      const res = await fetch("/api/rh/primes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saisir", ...saisieForm, periode, quantite: saisieForm.quantite ? Number(saisieForm.quantite) : null, societe_id: societe !== "all" ? societe : null })
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setSaisieDialog(false)
      setSaisieForm({ employe_id: "", prime_id: "", quantite: "", notes: "" })
      loadSaisies()
    } catch (e: unknown) { setSaisieError(e instanceof Error ? e.message : t('rhp.primes.err_generic', locale)) }
    finally { setSaving(false) }
  }

  const approuverPrime = async (id: string) => {
    await fetch("/api/rh/primes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approuver", id }) })
    loadSaisies()
  }

  const openEditSaisie = (s: any) => {
    setEditForm({
      montant: String(s.montant ?? ""),
      quantite: String(s.quantite ?? ""),
      notes: s.notes ?? "",
    })
    setEditError(null)
    setEditDialog(s)
  }

  const sauverEditSaisie = async () => {
    if (!editDialog) return
    setSaving(true); setEditError(null)
    try {
      const res = await fetch(`/api/rh/primes/${editDialog.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          montant: Number(editForm.montant) || 0,
          quantite: Number(editForm.quantite) || 0,
          notes: editForm.notes || null,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || t('rhp.primes.err_generic', locale)) }
      setEditDialog(null)
      loadSaisies()
    } catch (e: any) { setEditError(e.message) }
    finally { setSaving(false) }
  }

  const supprimerSaisie = async (id: string, employeName: string, primeLabel: string) => {
    if (!confirm(t('rhp.primes.confirm_del_saisie', locale).replace('{prime}', primeLabel).replace('{employe}', employeName))) return
    try {
      const res = await fetch(`/api/rh/primes/${id}`, { method: "DELETE" })
      if (!res.ok) { const d = await res.json(); alert(d.error || t('rhp.primes.err_del', locale)); return }
      loadSaisies()
    } catch (e: any) {
      alert(t('rhp.primes.err_reseau', locale) + (e?.message || ""))
    }
  }

  // ─── Excel import ─────────────────────────────────────────────
  const handleImportFile = async (file: File) => {
    setImportFile(file)
    setImportError(null)
    setImportPreview([])
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rowsRaw: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" })
      // Normalize strings (remove accents, lowercase)
      const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
      // Parse amount: handle "1,500.50", "1.500,50", "1 500,50", etc.
      const parseAmount = (v: any): number => {
        if (typeof v === "number") return v
        let s = String(v || "").trim()
        if (!s) return 0
        // Remove non-numeric except , . -
        s = s.replace(/[^\d,.-]/g, "")
        // If both , and . present, last one is decimal
        if (s.includes(",") && s.includes(".")) {
          if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
            s = s.replace(/\./g, "").replace(",", ".")
          } else {
            s = s.replace(/,/g, "")
          }
        } else if (s.includes(",")) {
          s = s.replace(",", ".")
        }
        const n = parseFloat(s)
        return isNaN(n) ? 0 : n
      }
      const normalized = rowsRaw.map((r: any) => {
        const out: any = {}
        for (const [k, v] of Object.entries(r)) {
          const key = norm(k)
          if (!key) continue
          if ((key.includes("nom") && key.includes("complet")) || key === "employe" || key === "employee" || key === "name" || key === "salarie" || key === "collaborateur") {
            out.nom_complet = String(v || "")
          } else if (key === "nom" || (key.includes("nom") && !key.includes("prenom") && !key.includes("complet"))) {
            out.nom = String(v || "")
          } else if (key.includes("prenom") || key === "firstname" || key === "first name") {
            out.prenom = String(v || "")
          } else if (key.includes("montant") || key === "amount" || key === "prime" || key === "valeur" || key === "somme" || key === "mur") {
            out.montant = parseAmount(v)
          } else if (key.includes("quantite") || key === "qty" || key === "quantity" || key === "nb") {
            out.quantite = parseAmount(v)
          } else if (key.includes("note") || key.includes("motif") || key.includes("comment") || key.includes("observation")) {
            out.notes = String(v || "")
          } else if (key === "code" || key === "matricule") {
            out.nom_complet = out.nom_complet || String(v || "")
          }
        }
        if (!out.nom_complet && (out.nom || out.prenom)) {
          out.nom_complet = `${out.prenom || ""} ${out.nom || ""}`.trim()
        }
        return out
      }).filter((r: any) => (r.nom_complet || r.nom || r.prenom) && (r.montant || 0) !== 0)
      if (normalized.length === 0) {
        setImportError(t('rhp.primes.import_no_valid', locale))
        return
      }
      setImportPreview(normalized)
    } catch (e: any) {
      setImportError(t('rhp.primes.import_read_fail', locale) + (e.message || ""))
    }
  }

  const runImport = async () => {
    if (!importPrimeId) { setImportError(t('rhp.primes.import_pick_prime', locale)); return }
    if (importPreview.length === 0) { setImportError(t('rhp.primes.import_no_rows', locale)); return }
    if (societe === "all") { setImportError(t('rhp.primes.import_pick_societe', locale)); return }
    setImportRunning(true)
    setImportError(null)
    try {
      const res = await fetch("/api/rh/primes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import_excel",
          societe_id: societe,
          periode,
          prime_id: importPrimeId,
          rows: importPreview,
        })
      })
      const data = await res.json()
      if (!res.ok) { setImportError(data.error || t('rhp.primes.import_err', locale)); return }
      setImportResult(data)
      loadSaisies()
    } catch (e: any) {
      setImportError(t('rhp.primes.err_reseau', locale) + (e.message || ""))
    } finally { setImportRunning(false) }
  }

  const resetImport = () => {
    setImportFile(null)
    setImportPreview([])
    setImportResult(null)
    setImportError(null)
    setImportPrimeId("")
  }

  const totalSaisies = saisies.filter(s => s.approuve).reduce((sum, s) => sum + Number(s.montant || 0), 0)

  const primeSelectionnee = catalogue.find(p => p.id === saisieForm.prime_id)

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]">{t('rha.a.primes.title', locale)}</h1>
          <p className="text-sm text-gray-500">{t('rha.a.primes.subtitle2', locale)}</p>
        </div>
        <div className="flex gap-3 items-center">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-48"><SelectValue placeholder={t('rha.a.primes.societe_ph', locale)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('rha.a.primes.toutes_societes', locale)}</SelectItem>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { id: "catalogue", label: t('rha.a.primes.tab_catalogue', locale) },
          { id: "regles", label: t('rha.a.primes.tab_regles', locale) },
          { id: "saisie", label: t('rha.a.primes.tab_saisie', locale) },
        ] as { id: "catalogue" | "saisie" | "regles"; label: string }[]).map(tx => (
          <button key={tx.id} onClick={() => setTab(tx.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === tx.id ? "border-[#0B0F2E] text-[#0B0F2E]" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {tx.label}
          </button>
        ))}
      </div>

      {/* CATALOGUE */}
      {tab === "catalogue" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-[#0B0F2E]">{t('rha.a.primes.cat_title', locale)} ({catalogue.filter(p => p.actif !== false).length} {t('rha.a.primes.actives', locale)})</CardTitle>
              <Button onClick={() => setCatDialog(true)} className="bg-[#0B0F2E] text-white">
                <Plus className="w-4 h-4 mr-2" />{t('rha.a.primes.new', locale)}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
              : catalogue.length === 0 ? <div className="text-center py-12 text-gray-500">{t('rha.a.primes.cat_empty', locale)}</div>
              : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('rha.a.primes.col_code', locale)}</TableHead><TableHead>{t('rha.a.primes.col_libelle', locale)}</TableHead>
                      <TableHead>{t('rha.a.primes.col_type', locale)}</TableHead><TableHead>{t('rha.a.primes.col_valeur', locale)}</TableHead>
                      <TableHead>{t('rha.a.primes.col_periode', locale)}</TableHead><TableHead>{t('rha.a.primes.col_actif', locale)}</TableHead><TableHead>{t('rha.a.primes.col_actions', locale)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalogue.map(p => (
                      <TableRow key={p.id} className={p.actif === false ? "opacity-50" : ""}>
                        <TableCell className="font-mono text-sm">{p.code}</TableCell>
                        <TableCell className="font-medium">{p.libelle}</TableCell>
                        <TableCell><span className="text-sm">{TYPE_PRIME_LABELS[p.type_prime] || p.type_prime}</span></TableCell>
                        <TableCell className="text-sm">
                          {p.type_prime === "fixe" && `${fmt(p.montant_fixe || 0)}`}
                          {p.type_prime === "variable_unitaire" && `${fmt(p.montant_par_unite || 0)} / ${p.unite || t('rhp.primes.unit_default', locale)}`}
                          {p.type_prime === "bonus_objectif" && `${fmt(p.bonus_objectif_montant || 0)}`}
                          {p.type_prime === "pourcentage" && `${p.pourcentage}${t('rhp.primes.pct_brut', locale)}`}
                          {p.type_prime === "commission" && `${fmt(p.montant_par_unite || 0)} / ${p.unite || t('rhp.primes.unit_vente', locale)}`}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500 capitalize">{p.periode_application}</TableCell>
                        <TableCell>
                          <Switch checked={p.actif !== false} onCheckedChange={v => toggleActif(p.id, v)} />
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title={t('rhp.primes.action_edit', locale)}>
                            <Pencil className="w-3.5 h-3.5" />
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

      {/* SAISIE */}
      {tab === "saisie" && (
        <div className="space-y-4">
          <div className="flex gap-3 items-center">
            <Input type="month" value={periode} onChange={e => setPeriode(e.target.value)} className="w-36" />
            <Button onClick={loadSaisies} variant="outline">{t('rha.a.primes.show', locale)}</Button>
            <div className="ml-auto flex items-center gap-3">
              {totalSaisies > 0 && (
                <div className="bg-green-50 border border-green-200 px-4 py-2 rounded-lg text-sm">
                  {t('rha.a.primes.total_approuve', locale)} : <strong className="text-green-700">{fmt(totalSaisies)}</strong>
                </div>
              )}
              <ImportPrimesDialog
                societeId={societe === "all" ? null : societe}
                periode={`${periode}-01`}
                onImportSuccess={loadSaisies}
              />
              <Button onClick={() => setSaisieDialog(true)} disabled={societe === "all"} className="bg-[#0B0F2E] text-white">
                <Plus className="w-4 h-4 mr-2" />{t('rha.a.primes.saisir', locale)}
              </Button>
            </div>
          </div>

          {societe === "all" && <p className="text-sm text-gray-500">{t('rha.a.primes.saisie_pick_societe', locale)}</p>}


          <Card>
            <CardHeader><CardTitle className="text-[#0B0F2E]">{t('rha.a.primes.primes_de', locale)} {periode} ({saisies.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
                : saisies.length === 0 ? <div className="text-center py-12 text-gray-500">{t('rha.a.primes.saisie_empty', locale)}</div>
                : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('rha.a.primes.col_employe', locale)}</TableHead><TableHead>{t('rha.a.primes.col_prime', locale)}</TableHead>
                        <TableHead>{t('rha.a.primes.col_quantite', locale)}</TableHead><TableHead className="text-right">{t('rha.a.primes.col_montant', locale)}</TableHead>
                        <TableHead>{t('rha.a.primes.col_notes', locale)}</TableHead><TableHead>{t('rha.a.primes.col_statut', locale)}</TableHead><TableHead>{t('rha.a.primes.col_actions', locale)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {saisies.map(s => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.employe?.prenom} {s.employe?.nom}</TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">{s.prime?.libelle}</p>
                              <p className="text-xs text-gray-400">{TYPE_PRIME_LABELS[s.prime?.type_prime] || ""}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{s.quantite || "—"}</TableCell>
                          <TableCell className="text-right font-semibold text-[#0B0F2E]">{fmt(s.montant || 0)}</TableCell>
                          <TableCell className="text-sm text-gray-500 max-w-32 truncate">{s.notes || "—"}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.integre_paie ? "bg-blue-100 text-blue-700" : s.approuve ? STATUT_COLORS.approuve : STATUT_COLORS.brouillon}`}>
                              {s.integre_paie ? t('rha.a.primes.statut_integre', locale) : s.approuve ? t('rha.a.primes.statut_approuve', locale) : t('rha.a.primes.statut_brouillon', locale)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {!s.approuve && (
                                <Button size="sm" variant="ghost" className="text-green-600 h-7" onClick={() => approuverPrime(s.id)}>
                                  <CheckCircle className="w-4 h-4 mr-1" />{t('rha.a.primes.approuver', locale)}
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title={t('rhp.primes.action_edit', locale)} onClick={() => openEditSaisie(s)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" title={t('rhp.primes.action_delete', locale)}
                                onClick={() => supprimerSaisie(s.id, `${s.employe?.prenom ?? ''} ${s.employe?.nom ?? ''}`.trim(), s.prime?.libelle ?? '—')}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
            </CardContent>
          </Card>

          <SectionOvertime societeId={societe === "all" ? null : societe} />
        </div>
      )}

      {/* REGLES AUTOMATIQUES */}
      {tab === "regles" && (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800 font-medium">{t('rha.a.primes.regles_info1', locale)}</p>
            <p className="text-xs text-amber-600 mt-1">{t('rha.a.primes.regles_info2', locale)}</p>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#0B0F2E]">{t('rha.a.primes.regles_title', locale)} ({regles.filter(r => r.actif !== false).length} {t('rha.a.primes.actives', locale)})</CardTitle>
                <Button onClick={() => setRegleDialog(true)} disabled={societe === "all"} className="bg-[#0B0F2E] text-white">
                  <Plus className="w-4 h-4 mr-2" />{t('rha.a.primes.regles_new', locale)}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {societe === "all" ? <p className="text-center text-gray-500 py-8">{t('rha.a.primes.regles_pick_societe', locale)}</p>
                : loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
                : regles.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p>{t('rha.a.primes.regles_empty', locale)}</p>
                    <p className="text-xs mt-2">{t('rha.a.primes.regles_empty_hint', locale)}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('rha.a.primes.col_nom', locale)}</TableHead>
                        <TableHead>{t('rha.a.primes.col_type', locale)}</TableHead>
                        <TableHead>{t('rha.a.primes.col_montant', locale)}</TableHead>
                        <TableHead>{t('rha.a.primes.col_condition', locale)}</TableHead>
                        <TableHead>{t('rha.a.primes.col_scope', locale)}</TableHead>
                        <TableHead>{t('rha.a.primes.col_actif', locale)}</TableHead>
                        <TableHead>{t('rha.a.primes.col_actions', locale)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {regles.map(r => (
                        <TableRow key={r.id} className={r.actif === false ? "opacity-50" : ""}>
                          <TableCell className="font-medium">{r.nom}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              r.type === "meal_allowance" ? "bg-orange-100 text-orange-700" :
                              r.type === "call_allowance" ? "bg-blue-100 text-blue-700" :
                              r.type === "astreinte" ? "bg-purple-100 text-purple-700" :
                              "bg-gray-100 text-gray-700"
                            }`}>
                              {TYPE_PRIME_LABELS[r.type] || r.type}
                            </span>
                          </TableCell>
                          <TableCell className="font-semibold">{fmt(r.montant || 0)}</TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {r.type === "meal_allowance" && t('rhp.primes.cond_meal', locale).replace('{h}', String(r.conditions?.ot_min_heures || 1))}
                            {r.type === "night_shift" && t('rhp.primes.cond_night', locale)}
                            {r.type === "call_allowance" && t('rhp.primes.cond_astreinte', locale)}
                            {r.type === "astreinte" && t('rhp.primes.cond_astreinte', locale)}
                            {r.type === "fixe" && t('rhp.primes.cond_fixe', locale)}
                            {!["meal_allowance", "night_shift", "call_allowance", "astreinte", "fixe"].includes(r.type) && (r.description || "—")}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500 capitalize">{r.scope === "tous" ? t('rhp.primes.scope_tous', locale) : `${r.scope}: ${r.scope_value || ""}`}</TableCell>
                          <TableCell><Switch checked={r.actif !== false} onCheckedChange={v => toggleRegle(r.id, v)} /></TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => deleteRegle(r.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialog nouvelle regle */}
      <Dialog open={regleDialog} onOpenChange={open => !open && setRegleDialog(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t('rhp.primes.regle_dlg_title', locale)}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            {regleError && <p className="text-sm text-red-600">{regleError}</p>}
            <div><Label>{t('rhp.primes.regle_nom', locale)}</Label>
              <Input value={regleForm.nom} onChange={e => setRegleForm(f => ({ ...f, nom: e.target.value }))} placeholder="Ex: Meal Allowance OT" />
            </div>
            <div><Label>{t('rhp.primes.lbl_type', locale)}</Label>
              <Select value={regleForm.type} onValueChange={v => setRegleForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meal_allowance">{t('rhp.primes.regletype_meal', locale)}</SelectItem>
                  <SelectItem value="night_shift">{t('rhp.primes.regletype_night', locale)}</SelectItem>
                  <SelectItem value="call_allowance">{t('rhp.primes.regletype_call', locale)}</SelectItem>
                  <SelectItem value="astreinte">{t('rhp.primes.regletype_astreinte', locale)}</SelectItem>
                  <SelectItem value="fixe">{t('rhp.primes.regletype_fixe', locale)}</SelectItem>
                  <SelectItem value="par_heure">{t('rhp.primes.regletype_par_heure', locale)}</SelectItem>
                  <SelectItem value="par_jour">{t('rhp.primes.regletype_par_jour', locale)}</SelectItem>
                  <SelectItem value="pourcentage">{t('rhp.primes.regletype_pourcentage', locale)}</SelectItem>
                  <SelectItem value="par_anciennete">{t('rhp.primes.regletype_anciennete', locale)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t('rhp.primes.lbl_montant_mur', locale)}</Label>
              <Input type="number" value={regleForm.montant} onChange={e => setRegleForm(f => ({ ...f, montant: e.target.value }))} placeholder="Ex: 200" />
            </div>
            {(regleForm.type === "meal_allowance" || regleForm.type === "par_heure") && (
              <div><Label>{t('rhp.primes.regle_ot_min', locale)}</Label>
                <Input type="number" value={regleForm.conditions_ot_min} onChange={e => setRegleForm(f => ({ ...f, conditions_ot_min: e.target.value }))} placeholder="1" />
                <p className="text-[10px] text-gray-400 mt-1">{t('rhp.primes.regle_ot_min_hint', locale)}</p>
              </div>
            )}
            <div><Label>{t('rhp.primes.regle_scope', locale)}</Label>
              <Select value={regleForm.scope} onValueChange={v => setRegleForm(f => ({ ...f, scope: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">{t('rhp.primes.scope_tous_emp', locale)}</SelectItem>
                  <SelectItem value="groupe">{t('rhp.primes.scope_groupe', locale)}</SelectItem>
                  <SelectItem value="departement">{t('rhp.primes.scope_departement', locale)}</SelectItem>
                  <SelectItem value="individuel">{t('rhp.primes.scope_individuel', locale)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {regleForm.scope !== "tous" && (
              <div><Label>{t('rhp.primes.regle_scope_value', locale).replace('{scope}', regleForm.scope)}</Label>
                <Input value={regleForm.scope_value} onChange={e => setRegleForm(f => ({ ...f, scope_value: e.target.value }))} placeholder={regleForm.scope === "individuel" ? t('rhp.primes.ph_nom_employe', locale) : t('rhp.primes.ph_nom_groupe', locale)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegleDialog(false)}>{t('rhp.primes.cancel', locale)}</Button>
            <Button onClick={creerRegle} disabled={saving} className="bg-[#0B0F2E] text-white">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}{t('rhp.primes.regle_create', locale)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog nouvelle prime catalogue */}
      <Dialog open={catDialog} onOpenChange={open => !open && setCatDialog(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t('rhp.primes.cat_dlg_title', locale)}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2 max-h-[70vh] overflow-y-auto pr-2">
            {catError && <p className="text-sm text-red-600">{catError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t('rhp.primes.cat_code', locale)}</Label><Input value={catForm.code} onChange={e => setCatForm(f => ({ ...f, code: e.target.value }))} placeholder="PRM-001" /></div>
              <div><Label>{t('rhp.primes.cat_periode', locale)}</Label>
                <Select value={catForm.periode_application} onValueChange={v => setCatForm(f => ({ ...f, periode_application: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensuel">{t('rhp.primes.per_mensuel', locale)}</SelectItem>
                    <SelectItem value="trimestriel">{t('rhp.primes.per_trimestriel', locale)}</SelectItem>
                    <SelectItem value="annuel">{t('rhp.primes.per_annuel', locale)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>{t('rhp.primes.cat_libelle', locale)}</Label><Input value={catForm.libelle} onChange={e => setCatForm(f => ({ ...f, libelle: e.target.value }))} placeholder="Ex: Prime consultation TIBOK" /></div>
            <div><Label>{t('rhp.primes.lbl_type', locale)}</Label>
              <Select value={catForm.type_prime} onValueChange={v => setCatForm(f => ({ ...f, type_prime: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_PRIME_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {catForm.type_prime === "fixe" && (
              <div><Label>{t('rhp.primes.cat_montant_mensuel', locale)}</Label><Input type="number" value={catForm.montant_fixe} onChange={e => setCatForm(f => ({ ...f, montant_fixe: e.target.value }))} /></div>
            )}
            {(catForm.type_prime === "variable_unitaire" || catForm.type_prime === "commission") && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t('rhp.primes.cat_montant_unite', locale)}</Label><Input type="number" value={catForm.montant_par_unite} onChange={e => setCatForm(f => ({ ...f, montant_par_unite: e.target.value }))} /></div>
                <div><Label>{t('rhp.primes.cat_unite', locale)}</Label><Input value={catForm.unite} onChange={e => setCatForm(f => ({ ...f, unite: e.target.value }))} placeholder="consultation" /></div>
              </div>
            )}
            {catForm.type_prime === "pourcentage" && (
              <div><Label>{t('rhp.primes.cat_pourcentage', locale)}</Label><Input type="number" step="0.1" value={catForm.pourcentage} onChange={e => setCatForm(f => ({ ...f, pourcentage: e.target.value }))} placeholder="5" /></div>
            )}
            {catForm.type_prime === "bonus_objectif" && (
              <div><Label>{t('rhp.primes.cat_bonus', locale)}</Label><Input type="number" value={catForm.bonus_objectif_montant} onChange={e => setCatForm(f => ({ ...f, bonus_objectif_montant: e.target.value }))} /></div>
            )}
            <div><Label>{t('rhp.primes.cat_postes', locale)}</Label><Input value={catForm.postes_eligibles} onChange={e => setCatForm(f => ({ ...f, postes_eligibles: e.target.value }))} placeholder={t('rhp.primes.cat_postes_ph', locale)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialog(false)}>{t('rhp.primes.cancel', locale)}</Button>
            <Button onClick={creerCatalogue} disabled={saving} className="bg-[#0B0F2E] text-white">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}{t('rhp.primes.cat_create', locale)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog saisie prime */}
      {/* ═══════ Dialog IMPORT EXCEL ═══════ */}
      <Dialog open={importDialog} onOpenChange={open => { if (!open) { setImportDialog(false); resetImport() } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-[#D4AF37]" />
              {t('rhp.primes.import_title', locale)} {periode}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {importError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {importError}
              </div>
            )}

            {!importResult && (
              <>
                {/* Step 1: Select prime */}
                <div>
                  <Label className="text-sm font-semibold mb-1 block">{t('rhp.primes.import_step1', locale)}</Label>
                  <Select value={importPrimeId} onValueChange={setImportPrimeId}>
                    <SelectTrigger><SelectValue placeholder={t('rhp.primes.ph_choisir_prime', locale)} /></SelectTrigger>
                    <SelectContent>
                      {catalogue.filter(p => p.actif !== false).map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.libelle} ({TYPE_PRIME_LABELS[p.type_prime] || p.type_prime})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Step 2: File upload */}
                <div>
                  <Label className="text-sm font-semibold mb-1 block">{t('rhp.primes.import_step2', locale)}</Label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-5 text-center hover:border-[#D4AF37] transition-colors">
                    <input type="file" id="import-file" accept=".xlsx,.xls,.csv" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }}
                    />
                    <label htmlFor="import-file" className="cursor-pointer">
                      <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                      <p className="text-sm font-medium text-gray-700">
                        {importFile ? importFile.name : t('rhp.primes.import_click', locale)}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {t('rhp.primes.import_cols', locale)}
                      </p>
                    </label>
                  </div>
                </div>

                {/* Step 3: Preview */}
                {importPreview.length > 0 && (
                  <div>
                    <Label className="text-sm font-semibold mb-1 block">{t('rhp.primes.import_step3', locale).replace('{n}', String(importPreview.length))}</Label>
                    <div className="max-h-60 overflow-y-auto border rounded-lg">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="p-2 text-left">{t('rhp.primes.col_employe', locale)}</th>
                            <th className="p-2 text-right">{t('rhp.primes.col_montant', locale)}</th>
                            <th className="p-2 text-right">{t('rhp.primes.col_quantite', locale)}</th>
                            <th className="p-2 text-left">{t('rhp.primes.col_notes', locale)}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.map((r, i) => (
                            <tr key={i} className="border-t">
                              <td className="p-2 font-medium">{r.nom_complet || `${r.prenom || ""} ${r.nom || ""}`}</td>
                              <td className="p-2 text-right">{fmt(r.montant || 0)}</td>
                              <td className="p-2 text-right text-gray-500">{r.quantite || "—"}</td>
                              <td className="p-2 text-gray-500 truncate max-w-xs">{r.notes || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{t('rhp.primes.import_fuzzy', locale)}</p>
                  </div>
                )}
              </>
            )}

            {/* Result */}
            {importResult && (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-center">
                    <p className="text-xs text-gray-500">{t('rhp.primes.res_imported', locale)}</p>
                    <p className="text-2xl font-bold text-green-700">{importResult.summary?.matched || 0}</p>
                  </div>
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-center">
                    <p className="text-xs text-gray-500">{t('rhp.primes.res_unmatched', locale)}</p>
                    <p className="text-2xl font-bold text-orange-700">{importResult.summary?.unmatched || 0}</p>
                  </div>
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-center">
                    <p className="text-xs text-gray-500">{t('rhp.primes.res_errors', locale)}</p>
                    <p className="text-2xl font-bold text-red-700">{importResult.summary?.failed || 0}</p>
                  </div>
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-center">
                    <p className="text-xs text-gray-500">{t('rhp.primes.res_total', locale)}</p>
                    <p className="text-2xl font-bold text-gray-700">{importResult.summary?.total || 0}</p>
                  </div>
                </div>
                {importResult.unmatched?.length > 0 && (
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <p className="text-xs font-bold text-orange-700 mb-1">{t('rhp.primes.res_unmatched_list', locale)}</p>
                    <ul className="text-xs text-orange-600 space-y-0.5">
                      {importResult.unmatched.slice(0, 10).map((u: any, i: number) => (
                        <li key={i}>• {u.searchName}</li>
                      ))}
                      {importResult.unmatched.length > 10 && <li className="italic">{t('rhp.primes.res_and_more', locale).replace('{n}', String(importResult.unmatched.length - 10))}</li>}
                    </ul>
                  </div>
                )}
                {importResult.errors?.length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs font-bold text-red-700 mb-1">{t('rhp.primes.res_errors_list', locale)}</p>
                    <ul className="text-xs text-red-600 space-y-0.5">
                      {importResult.errors.slice(0, 10).map((e: string, i: number) => <li key={i}>• {e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            {importResult ? (
              <>
                <Button variant="outline" onClick={resetImport}>{t('rhp.primes.import_another', locale)}</Button>
                <Button onClick={() => { setImportDialog(false); resetImport() }} className="bg-[#0B0F2E] text-white">{t('rhp.primes.close', locale)}</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => { setImportDialog(false); resetImport() }}>{t('rhp.primes.cancel', locale)}</Button>
                <Button onClick={runImport} disabled={importRunning || importPreview.length === 0 || !importPrimeId} className="bg-[#D4AF37] text-white">
                  {importRunning && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {t('rhp.primes.import_run', locale).replace('{n}', String(importPreview.length))}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog : modifier une prime saisie */}
      <Dialog open={!!editDialog} onOpenChange={open => !open && setEditDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('rhp.primes.edit_dlg_title', locale)} {editDialog?.employe?.prenom} {editDialog?.employe?.nom}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {editError && <p className="text-sm text-red-600">{editError}</p>}
            <div className="text-sm text-gray-600 bg-gray-50 rounded p-2">
              <p><strong>{editDialog?.prime?.libelle || '—'}</strong> · {t('rhp.primes.periode_label', locale)} {periode}</p>
              {editDialog?.integre_paie && (
                <p className="text-amber-700 text-xs mt-1">
                  {t('rhp.primes.edit_integre_warn', locale)}
                </p>
              )}
            </div>
            <div><Label>{t('rhp.primes.lbl_quantite', locale)}</Label>
              <Input type="number" step="0.01" value={editForm.quantite}
                onChange={e => setEditForm(f => ({ ...f, quantite: e.target.value }))} />
            </div>
            <div><Label>{t('rhp.primes.lbl_montant_mur', locale)}</Label>
              <Input type="number" step="0.01" value={editForm.montant}
                onChange={e => setEditForm(f => ({ ...f, montant: e.target.value }))} />
            </div>
            <div><Label>{t('rhp.primes.col_notes', locale)}</Label>
              <Input value={editForm.notes}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                placeholder={t('rhp.primes.ph_edit_notes', locale)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>{t('rhp.primes.cancel', locale)}</Button>
            <Button onClick={sauverEditSaisie} disabled={saving} className="bg-[#0B0F2E] text-white">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}{t('rhp.primes.save', locale)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={saisieDialog} onOpenChange={open => !open && setSaisieDialog(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('rhp.primes.saisie_dlg_title', locale)} {periode}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            {saisieError && <p className="text-sm text-red-600">{saisieError}</p>}
            <div><Label>{t('rhp.primes.lbl_employe', locale)}</Label>
              <Select value={saisieForm.employe_id} onValueChange={v => setSaisieForm(f => ({ ...f, employe_id: v }))}>
                <SelectTrigger><SelectValue placeholder={t('rhp.primes.ph_choisir', locale)} /></SelectTrigger>
                <SelectContent>{employes.map(e => <SelectItem key={e.id} value={e.id}>{e.prenom} {e.nom}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>{t('rhp.primes.lbl_prime_cat', locale)}</Label>
              <Select value={saisieForm.prime_id} onValueChange={v => setSaisieForm(f => ({ ...f, prime_id: v }))}>
                <SelectTrigger><SelectValue placeholder={t('rhp.primes.ph_choisir_prime', locale)} /></SelectTrigger>
                <SelectContent>
                  {catalogue.filter(p => p.actif !== false).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.libelle} ({TYPE_PRIME_LABELS[p.type_prime]})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {primeSelectionnee && (primeSelectionnee.type_prime === "variable_unitaire" || primeSelectionnee.type_prime === "commission") && (
              <div><Label>{t('rhp.primes.lbl_quantite', locale)} ({primeSelectionnee.unite || t('rhp.primes.unites', locale)})</Label>
                <Input type="number" value={saisieForm.quantite} onChange={e => setSaisieForm(f => ({ ...f, quantite: e.target.value }))} placeholder="Ex: 12" />
              </div>
            )}
            {saisieCalc !== null && (
              <div className="bg-[#0B0F2E]/5 border border-[#0B0F2E]/20 p-3 rounded-lg">
                <p className="text-sm font-medium text-[#0B0F2E]">{t('rhp.primes.montant_calcule', locale)} <strong>{fmt(saisieCalc)}</strong></p>
                {primeSelectionnee && <p className="text-xs text-gray-500 mt-1">{TYPE_PRIME_LABELS[primeSelectionnee.type_prime]}</p>}
              </div>
            )}
            <div><Label>{t('rhp.primes.lbl_notes_opt', locale)}</Label>
              <Input value={saisieForm.notes} onChange={e => setSaisieForm(f => ({ ...f, notes: e.target.value }))} placeholder={t('rhp.primes.ph_saisie_notes', locale)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaisieDialog(false)}>{t('rhp.primes.cancel', locale)}</Button>
            <Button onClick={saisirPrime} disabled={saving} className="bg-[#0B0F2E] text-white">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}{t('rhp.primes.saisie_save', locale)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </ClientPageShell>
  )
}
