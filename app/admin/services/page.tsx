"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Loader2, Settings, Check, X, Building2, Users, CreditCard,
  Pencil, Save, ChevronDown, ChevronUp,
} from "lucide-react"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ModulesConfig {
  comptabilite: boolean
  rh: boolean
  juridique: boolean
  facturation: boolean
  documents: boolean
}

interface ServicePlan {
  id: string
  code: string
  nom: string
  description: string | null
  modules: ModulesConfig
  prix_mensuel: number
  actif: boolean
  created_at: string
}

interface SocieteWithClients {
  id: string
  nom: string
  brn: string | null
  plan_id: string | null
  plan_code: string | null
  modules_actifs: ModulesConfig | null
  created_at: string
  clients: { id: string; full_name: string; email: string }[]
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MODULE_LABELS: Record<keyof ModulesConfig, string> = {
  comptabilite: "Comptabilite",
  rh: "RH & Paie",
  juridique: "Juridique",
  facturation: "Facturation",
  documents: "Documents OCR",
}

const MODULE_DETAILS: Record<keyof ModulesConfig, string> = {
  comptabilite: "Documents OCR, Banque, Rapprochement, Grand Livre, Bilan, Factures, TVA",
  rh: "Employes, Pointage, Conges, Paie, Exports MRA",
  juridique: "Contrats, Documents legaux",
  facturation: "Creation et gestion de factures",
  documents: "Telechargement et OCR de documents",
}

const PLAN_COLORS: Record<string, string> = {
  premium: "#C9A84C",
  comptabilite: "#2563eb",
  rh_paie: "#16a34a",
  compta_rh: "#7c3aed",
  custom: "#6b7280",
}

const DEFAULT_MODULES: ModulesConfig = {
  comptabilite: true,
  rh: true,
  juridique: true,
  facturation: true,
  documents: true,
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function AdminServicesPage() {
  const [loading, setLoading] = useState(true)
  const [plans, setPlans] = useState<ServicePlan[]>([])
  const [societes, setSocietes] = useState<SocieteWithClients[]>([])
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Plan editing
  const [editingPlan, setEditingPlan] = useState<ServicePlan | null>(null)
  const [editModules, setEditModules] = useState<ModulesConfig>(DEFAULT_MODULES)
  const [editPrix, setEditPrix] = useState("")
  const [editPlanDialog, setEditPlanDialog] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)

  // Assign plan
  const [assignDialog, setAssignDialog] = useState(false)
  const [assignSociete, setAssignSociete] = useState<SocieteWithClients | null>(null)
  const [assignPlanCode, setAssignPlanCode] = useState("")
  const [assignSaving, setAssignSaving] = useState(false)

  // Custom modules
  const [customDialog, setCustomDialog] = useState(false)
  const [customSociete, setCustomSociete] = useState<SocieteWithClients | null>(null)
  const [customModules, setCustomModules] = useState<ModulesConfig>(DEFAULT_MODULES)
  const [customSaving, setCustomSaving] = useState(false)

  // Section collapse
  const [section1Open, setSection1Open] = useState(true)
  const [section2Open, setSection2Open] = useState(true)
  const [section3Open, setSection3Open] = useState(true)

  // ----------------------------------------------------------------
  // Fetch
  // ----------------------------------------------------------------
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/services")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      setPlans(data.plans || [])
      setSocietes(data.societes || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(null), 5000); return () => clearTimeout(t) } }, [success])
  useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 6000); return () => clearTimeout(t) } }, [error])

  // ----------------------------------------------------------------
  // Plan editing handlers
  // ----------------------------------------------------------------
  const openEditPlan = (plan: ServicePlan) => {
    setEditingPlan(plan)
    setEditModules({ ...plan.modules })
    setEditPrix(String(plan.prix_mensuel || 0))
    setEditPlanDialog(true)
  }

  const handleSavePlan = async () => {
    if (!editingPlan) return
    setSavingPlan(true)
    try {
      const res = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_plan",
          plan_id: editingPlan.id,
          modules: editModules,
          prix_mensuel: parseFloat(editPrix) || 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      setSuccess(`Plan "${editingPlan.nom}" mis a jour`)
      setEditPlanDialog(false)
      setEditingPlan(null)
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur")
    } finally {
      setSavingPlan(false)
    }
  }

  // ----------------------------------------------------------------
  // Assign plan handlers
  // ----------------------------------------------------------------
  const openAssignDialog = (soc: SocieteWithClients) => {
    setAssignSociete(soc)
    setAssignPlanCode(soc.plan_code || "premium")
    setAssignDialog(true)
  }

  const handleAssignPlan = async () => {
    if (!assignSociete || !assignPlanCode) return
    setAssignSaving(true)
    try {
      const res = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign_plan",
          societe_id: assignSociete.id,
          plan_code: assignPlanCode,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      setSuccess(`Plan attribue a "${assignSociete.nom}"`)
      setAssignDialog(false)
      setAssignSociete(null)
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur")
    } finally {
      setAssignSaving(false)
    }
  }

  // ----------------------------------------------------------------
  // Custom modules handlers
  // ----------------------------------------------------------------
  const openCustomDialog = (soc: SocieteWithClients) => {
    setCustomSociete(soc)
    setCustomModules(soc.modules_actifs || DEFAULT_MODULES)
    setCustomDialog(true)
  }

  const handleSaveCustom = async () => {
    if (!customSociete) return
    setCustomSaving(true)
    try {
      const res = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "custom_modules",
          societe_id: customSociete.id,
          modules: customModules,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      setSuccess(`Modules personnalises pour "${customSociete.nom}"`)
      setCustomDialog(false)
      setCustomSociete(null)
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur")
    } finally {
      setCustomSaving(false)
    }
  }

  // ----------------------------------------------------------------
  // Stats
  // ----------------------------------------------------------------
  const planStats = plans.map(p => {
    const count = societes.filter(s => s.plan_code === p.code).length
    return { ...p, count }
  })
  const customCount = societes.filter(s => s.plan_code === "custom").length
  const noPlanCount = societes.filter(s => !s.plan_code || !plans.some(p => p.code === s.plan_code) && s.plan_code !== "custom").length

  const getPlanBadge = (code: string | null) => {
    if (!code) return <Badge variant="outline" className="text-xs">Non defini</Badge>
    const plan = plans.find(p => p.code === code)
    const color = PLAN_COLORS[code] || "#6b7280"
    return (
      <Badge
        className="text-xs text-white"
        style={{ backgroundColor: color }}
      >
        {plan?.nom || (code === "custom" ? "Personnalise" : code)}
      </Badge>
    )
  }

  // ----------------------------------------------------------------
  // Loading
  // ----------------------------------------------------------------
  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Services & Plans</h1>
          <p className="text-muted-foreground mt-1">Chargement...</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#1E2A4A" }} />
        </div>
      </div>
    )
  }

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Services & Plans</h1>
        <p className="text-muted-foreground mt-1">
          Gestion des plans de service et attribution aux societes
        </p>
      </div>

      {/* Feedback */}
      {success && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* ============================================================ */}
      {/* SECTION 1 — Plans disponibles                                 */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <button
            onClick={() => setSection1Open(!section1Open)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5" style={{ color: "#C9A84C" }} />
              <CardTitle style={{ color: "#1E2A4A" }}>Plans disponibles</CardTitle>
            </div>
            {section1Open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
        </CardHeader>
        {section1Open && (
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {plans.map(plan => {
                const color = PLAN_COLORS[plan.code] || "#6b7280"
                const moduleKeys = Object.keys(plan.modules) as (keyof ModulesConfig)[]
                return (
                  <Card key={plan.id} className="relative overflow-hidden">
                    <div className="h-1.5" style={{ backgroundColor: color }} />
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base" style={{ color: "#1E2A4A" }}>
                          {plan.nom}
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditPlan(plan)}
                          title="Modifier le plan"
                        >
                          <Pencil className="h-3.5 w-3.5" style={{ color: "#C9A84C" }} />
                        </Button>
                      </div>
                      <CardDescription className="text-xs">{plan.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-1.5">
                        {moduleKeys.map(key => (
                          <div key={key} className="flex items-center gap-2 text-sm">
                            {plan.modules[key] ? (
                              <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                            ) : (
                              <X className="h-4 w-4 text-gray-300 flex-shrink-0" />
                            )}
                            <span className={plan.modules[key] ? "text-gray-900" : "text-gray-400"}>
                              {MODULE_LABELS[key]}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="pt-2 border-t">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Prix mensuel</span>
                          <span className="font-semibold text-sm" style={{ color: "#1E2A4A" }}>
                            {plan.prix_mensuel > 0 ? `Rs ${Number(plan.prix_mensuel).toLocaleString("fr-FR")}` : "Sur devis"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-muted-foreground">Societes</span>
                          <Badge variant="outline" className="text-xs">
                            {planStats.find(p => p.id === plan.id)?.count || 0}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </CardContent>
        )}
      </Card>

      {/* ============================================================ */}
      {/* SECTION 2 — Attribution par societe                           */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <button
            onClick={() => setSection2Open(!section2Open)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5" style={{ color: "#C9A84C" }} />
              <CardTitle style={{ color: "#1E2A4A" }}>Attribution par societe</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <CardDescription>{societes.length} societe(s)</CardDescription>
              {section2Open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>
        </CardHeader>
        {section2Open && (
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Societe</TableHead>
                  <TableHead>BRN</TableHead>
                  <TableHead>Client(s)</TableHead>
                  <TableHead>Plan actuel</TableHead>
                  <TableHead>Modules actifs</TableHead>
                  <TableHead>Date creation</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {societes.map(soc => {
                  const modules = soc.modules_actifs || DEFAULT_MODULES
                  const activeCount = (Object.keys(modules) as (keyof ModulesConfig)[]).filter(k => modules[k]).length
                  return (
                    <TableRow key={soc.id}>
                      <TableCell className="font-medium">{soc.nom}</TableCell>
                      <TableCell className="font-mono text-sm">{soc.brn || "\u2014"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {soc.clients.length > 0
                            ? soc.clients.map(c => (
                                <Badge key={c.id} variant="outline" className="text-xs" style={{ borderColor: "#C9A84C", color: "#1E2A4A" }}>
                                  {c.full_name}
                                </Badge>
                              ))
                            : <span className="text-xs text-muted-foreground">Aucun</span>
                          }
                        </div>
                      </TableCell>
                      <TableCell>{getPlanBadge(soc.plan_code)}</TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{activeCount}/5 modules</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(soc.created_at).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => openAssignDialog(soc)}
                          >
                            Changer de plan
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            style={{ color: "#C9A84C" }}
                            onClick={() => openCustomDialog(soc)}
                          >
                            Personnaliser
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {societes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Aucune societe enregistree.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      {/* ============================================================ */}
      {/* SECTION 3 — Statistiques                                      */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <button
            onClick={() => setSection3Open(!section3Open)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" style={{ color: "#C9A84C" }} />
              <CardTitle style={{ color: "#1E2A4A" }}>Statistiques</CardTitle>
            </div>
            {section3Open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
        </CardHeader>
        {section3Open && (
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {/* Societes par plan */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" style={{ color: "#C9A84C" }} />
                    <CardTitle className="text-sm">Societes par plan</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {planStats.map(ps => {
                    const color = PLAN_COLORS[ps.code] || "#6b7280"
                    const pct = societes.length > 0 ? Math.round((ps.count / societes.length) * 100) : 0
                    return (
                      <div key={ps.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span style={{ color: "#1E2A4A" }}>{ps.nom}</span>
                          <span className="font-medium">{ps.count} societe(s)</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    )
                  })}
                  {customCount > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span style={{ color: "#1E2A4A" }}>Personnalise</span>
                        <span className="font-medium">{customCount} societe(s)</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gray-400 transition-all"
                          style={{ width: `${societes.length > 0 ? Math.round((customCount / societes.length) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {noPlanCount > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Non defini</span>
                        <span className="font-medium">{noPlanCount} societe(s)</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gray-200 transition-all"
                          style={{ width: `${societes.length > 0 ? Math.round((noPlanCount / societes.length) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Revenue par plan */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" style={{ color: "#C9A84C" }} />
                    <CardTitle className="text-sm">Revenue estimatif par plan</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {planStats.map(ps => {
                    const color = PLAN_COLORS[ps.code] || "#6b7280"
                    const revenue = ps.count * (Number(ps.prix_mensuel) || 0)
                    return (
                      <div key={ps.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                          <div>
                            <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>{ps.nom}</p>
                            <p className="text-xs text-muted-foreground">{ps.count} societe(s)</p>
                          </div>
                        </div>
                        <span className="font-semibold text-sm" style={{ color: "#1E2A4A" }}>
                          {revenue > 0 ? `Rs ${revenue.toLocaleString("fr-FR")}` : "Sur devis"}
                        </span>
                      </div>
                    )
                  })}
                  <div className="pt-3 border-t">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: "#1E2A4A" }}>Total mensuel estimatif</span>
                      <span className="font-bold" style={{ color: "#C9A84C" }}>
                        Rs {planStats.reduce((sum, ps) => sum + ps.count * (Number(ps.prix_mensuel) || 0), 0).toLocaleString("fr-FR")}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ============================================================ */}
      {/* DIALOG — Edit plan                                            */}
      {/* ============================================================ */}
      <Dialog open={editPlanDialog} onOpenChange={(o) => { setEditPlanDialog(o); if (!o) setEditingPlan(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ color: "#1E2A4A" }}>
              Modifier le plan: {editingPlan?.nom}
            </DialogTitle>
            <DialogDescription>
              Activez ou desactivez les modules et definissez le prix mensuel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {(Object.keys(MODULE_LABELS) as (keyof ModulesConfig)[]).map(key => (
              <div key={key} className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>{MODULE_LABELS[key]}</p>
                  <p className="text-xs text-muted-foreground">{MODULE_DETAILS[key]}</p>
                </div>
                <Switch
                  checked={editModules[key]}
                  onCheckedChange={(checked) => setEditModules(prev => ({ ...prev, [key]: checked }))}
                  disabled={key === "documents"}
                />
              </div>
            ))}
            <div className="space-y-2">
              <Label>Prix mensuel (Rs)</Label>
              <Input
                type="number"
                min="0"
                step="100"
                value={editPrix}
                onChange={(e) => setEditPrix(e.target.value)}
                placeholder="0 = sur devis"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPlanDialog(false)}>Annuler</Button>
            <Button
              style={{ backgroundColor: "#C9A84C" }}
              onClick={handleSavePlan}
              disabled={savingPlan}
            >
              {savingPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG — Assign plan to societe                               */}
      {/* ============================================================ */}
      <Dialog open={assignDialog} onOpenChange={(o) => { setAssignDialog(o); if (!o) setAssignSociete(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle style={{ color: "#1E2A4A" }}>
              Changer de plan
            </DialogTitle>
            <DialogDescription>
              Selectionner un plan pour <strong>{assignSociete?.nom}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={assignPlanCode} onValueChange={setAssignPlanCode}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selectionner un plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map(p => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.nom} -- {p.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Preview modules for selected plan */}
            {assignPlanCode && (() => {
              const selectedPlan = plans.find(p => p.code === assignPlanCode)
              if (!selectedPlan) return null
              return (
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Modules inclus:</p>
                  {(Object.keys(MODULE_LABELS) as (keyof ModulesConfig)[]).map(key => (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      {selectedPlan.modules[key] ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-gray-300" />
                      )}
                      <span className={selectedPlan.modules[key] ? "" : "text-gray-400"}>{MODULE_LABELS[key]}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(false)}>Annuler</Button>
            <Button
              style={{ backgroundColor: "#C9A84C" }}
              onClick={handleAssignPlan}
              disabled={assignSaving || !assignPlanCode}
            >
              {assignSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Attribuer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG — Custom modules per societe                           */}
      {/* ============================================================ */}
      <Dialog open={customDialog} onOpenChange={(o) => { setCustomDialog(o); if (!o) setCustomSociete(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ color: "#1E2A4A" }}>
              Plan personnalise
            </DialogTitle>
            <DialogDescription>
              Configurez les modules pour <strong>{customSociete?.nom}</strong>.
              Cela remplacera le plan standard par un plan personnalise.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {(Object.keys(MODULE_LABELS) as (keyof ModulesConfig)[]).map(key => (
              <div key={key} className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>{MODULE_LABELS[key]}</p>
                  <p className="text-xs text-muted-foreground">{MODULE_DETAILS[key]}</p>
                </div>
                <Switch
                  checked={customModules[key]}
                  onCheckedChange={(checked) => setCustomModules(prev => ({ ...prev, [key]: checked }))}
                  disabled={key === "documents"}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomDialog(false)}>Annuler</Button>
            <Button
              style={{ backgroundColor: "#C9A84C" }}
              onClick={handleSaveCustom}
              disabled={customSaving}
            >
              {customSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
