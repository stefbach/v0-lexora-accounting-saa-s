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
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale, type Locale } from "@/lib/i18n"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ModulesConfig {
  // ── Modules visibles sur /tarifs ──
  documents: boolean         // « OCR & Documents IA »
  comptabilite: boolean      // « Comptabilité Automatisée »
  facturation: boolean       // « Facturation MRA Agréée »
  rh: boolean                // « RH & Paie Maurice »
  fiscal: boolean            // « Fiscal MRA »
  alertes_ia: boolean        // « Alertes IA & Pilotage »
  tibok: boolean             // « TIBOK Corporate » (Santé salariés)
  telegram: boolean          // « Chief of Staff IA — Telegram »
  // ── Sous-modules avancés (internes, non listés sur /tarifs) ──
  juridique: boolean
  etats_financiers: boolean
  employe_portal: boolean
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

const moduleLabels = (locale: Locale): Record<keyof ModulesConfig, string> => ({
  // ─── Modules /tarifs ───
  documents:       locale === 'en' ? 'OCR & AI Documents' : 'OCR & Documents IA',
  comptabilite:    locale === 'en' ? 'Automated Accounting' : 'Comptabilité Automatisée',
  facturation:     locale === 'en' ? 'MRA-Approved Invoicing' : 'Facturation MRA Agréée',
  rh:              locale === 'en' ? 'Mauritius HR & Payroll' : 'RH & Paie Maurice',
  fiscal:          locale === 'en' ? 'MRA Tax' : 'Fiscal MRA',
  alertes_ia:      locale === 'en' ? 'AI Alerts & Monitoring' : 'Alertes IA & Pilotage',
  tibok:           locale === 'en' ? 'TIBOK Corporate (Employee Health)' : 'TIBOK Corporate (Santé salariés)',
  telegram:        locale === 'en' ? 'Chief of Staff AI — Telegram' : 'Chief of Staff IA — Telegram',
  // ─── Sous-modules avancés ───
  juridique:       t('adm.services.mod_juridique', locale),
  etats_financiers: locale === 'en' ? 'Financial statements (advanced)' : 'États financiers (avancé)',
  employe_portal:  locale === 'en' ? 'Employee portal (self-service)' : 'Portail employé (self-service)',
})

const moduleDetails = (locale: Locale): Record<keyof ModulesConfig, string> => ({
  documents:       locale === 'en' ? 'Upload/scan any document — AI extracts and classifies entries.' : 'Upload ou photo de tout document — IA analyse, classe et génère les écritures.',
  comptabilite:    locale === 'en' ? 'General Ledger, balance sheet, P&L, auto bank reconciliation, multi-currency.' : 'Grand Livre, Balance, Bilan & P&L, rapprochement bancaire auto, multi-devises.',
  facturation:     locale === 'en' ? 'MRA-compliant invoices (IRN + QR), quotes, credit notes, auto-reminders.' : 'Factures conformes MRA (IRN + QR), devis, avoirs, relances auto.',
  rh:              locale === 'en' ? 'Compliant payslips (CSG/NSF/PAYE), digital time clock, leave per WRA 2019.' : 'Bulletins conformes (CSG/NSF/PAYE), pointeuse, congés WRA 2019.',
  fiscal:          locale === 'en' ? 'VAT 9-Box, CSG/NSF/PAYE auto, IT Form 3, Annual Return ROC, e-MRA XML.' : 'TVA 9-Box, CSG/NSF/PAYE auto, IT Form 3, Annual Return ROC, export XML e-MRA.',
  alertes_ia:      locale === 'en' ? 'AI agent for tax deadlines, budget forecasting, strategic recommendations.' : 'Agent IA échéances fiscales, prévisionnel Budget vs Réel, recommandations stratégiques IA.',
  tibok:           locale === 'en' ? 'Annual health check-up, 24/7 teleconsultation, corporate wellbeing program.' : 'Bilan santé annuel, téléconsultation médicale 24/7, programme bien-être entreprise.',
  telegram:        locale === 'en' ? 'Chief of Staff AI on Telegram — calendar, meetings, emails, OCR, HR, banking in natural language.' : 'Chief of Staff IA sur Telegram — agenda, RDV, emails, OCR, RH, banque en langage naturel.',
  juridique:       t('adm.services.mod_juridique_desc', locale),
  etats_financiers: locale === 'en' ? 'Balance sheet, P&L, IFRS 9/16, deadlines (sub-feature of accounting).' : 'Bilan, P&L, IFRS 9/16, échéances (sous-module de la compta).',
  employe_portal:  locale === 'en' ? 'Employee self-service space (payslips, leave, expenses).' : 'Espace self-service salarié (bulletins, congés, frais).',
})

const PLAN_COLORS: Record<string, string> = {
  premium: "#D4AF37",
  comptabilite: "#2563eb",
  rh_paie: "#16a34a",
  compta_rh: "#7c3aed",
  custom: "#6b7280",
}

const DEFAULT_MODULES: ModulesConfig = {
  documents: true,
  comptabilite: true,
  facturation: true,
  rh: true,
  fiscal: true,
  alertes_ia: true,
  tibok: true,
  telegram: false,           // option payante, off par défaut
  juridique: true,
  etats_financiers: true,
  employe_portal: true,
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function AdminServicesPage() {
  const locale = getLocale()
  const MODULE_LABELS = moduleLabels(locale)
  const MODULE_DETAILS = moduleDetails(locale)
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
      if (!res.ok) throw new Error(data.error || t('adm.services.error', locale))
      setPlans(data.plans || [])
      setSocietes(data.societes || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adm.services.load_err', locale))
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
      if (!res.ok) throw new Error(data.error || t('adm.services.error', locale))
      setSuccess(t('adm.services.plan_updated', locale).replace('{name}', editingPlan.nom))
      setEditPlanDialog(false)
      setEditingPlan(null)
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adm.services.error', locale))
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
      if (!res.ok) throw new Error(data.error || t('adm.services.error', locale))
      setSuccess(t('adm.services.plan_assigned', locale).replace('{name}', assignSociete.nom))
      setAssignDialog(false)
      setAssignSociete(null)
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adm.services.error', locale))
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
      if (!res.ok) throw new Error(data.error || t('adm.services.error', locale))
      setSuccess(t('adm.services.custom_saved', locale).replace('{name}', customSociete.nom))
      setCustomDialog(false)
      setCustomSociete(null)
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adm.services.error', locale))
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
    if (!code) return <Badge variant="outline" className="text-xs">{t('adm.services.plan_undefined', locale)}</Badge>
    const plan = plans.find(p => p.code === code)
    const color = PLAN_COLORS[code] || "#6b7280"
    return (
      <Badge
        className="text-xs text-white"
        style={{ backgroundColor: color }}
      >
        {plan?.nom || (code === "custom" ? t('adm.services.plan_custom', locale) : code)}
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
          <h1 className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>{t('adm.services.title', locale)}</h1>
          <p className="text-muted-foreground mt-1">{t('adm.services.loading', locale)}</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#0B0F2E" }} />
        </div>
      </div>
    )
  }

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------
  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>{t('adm.services.title', locale)}</h1>
        <p className="text-muted-foreground mt-1">
          {t('adm.services.subtitle', locale)}
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
              <Settings className="h-5 w-5" style={{ color: "#D4AF37" }} />
              <CardTitle style={{ color: "#0B0F2E" }}>{t('adm.services.section_plans', locale)}</CardTitle>
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
                        <CardTitle className="text-base" style={{ color: "#0B0F2E" }}>
                          {plan.nom}
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditPlan(plan)}
                          title={t('adm.services.edit_plan_tooltip', locale)}
                        >
                          <Pencil className="h-3.5 w-3.5" style={{ color: "#D4AF37" }} />
                        </Button>
                      </div>
                      <CardDescription className="text-xs">{plan.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 overflow-x-auto">
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
                          <span className="text-xs text-muted-foreground">{t('adm.services.monthly_price', locale)}</span>
                          <span className="font-semibold text-sm" style={{ color: "#0B0F2E" }}>
                            {plan.prix_mensuel > 0 ? `Rs ${Number(plan.prix_mensuel).toLocaleString(locale === 'fr' ? "fr-FR" : "en-GB")}` : t('adm.services.on_quote', locale)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-muted-foreground">{t('adm.services.societes', locale)}</span>
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
              <Building2 className="h-5 w-5" style={{ color: "#D4AF37" }} />
              <CardTitle style={{ color: "#0B0F2E" }}>{t('adm.services.section_assign', locale)}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <CardDescription>{societes.length} {t('adm.services.societe_suffix', locale)}</CardDescription>
              {section2Open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>
        </CardHeader>
        {section2Open && (
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('adm.services.col_societe', locale)}</TableHead>
                  <TableHead>{t('adm.services.col_brn', locale)}</TableHead>
                  <TableHead>{t('adm.services.col_clients', locale)}</TableHead>
                  <TableHead>{t('adm.services.col_current_plan', locale)}</TableHead>
                  <TableHead>{t('adm.services.col_active_modules', locale)}</TableHead>
                  <TableHead>{t('adm.services.col_created', locale)}</TableHead>
                  <TableHead className="text-right">{t('adm.services.col_actions', locale)}</TableHead>
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
                                <Badge key={c.id} variant="outline" className="text-xs" style={{ borderColor: "#D4AF37", color: "#0B0F2E" }}>
                                  {c.full_name}
                                </Badge>
                              ))
                            : <span className="text-xs text-muted-foreground">{t('adm.services.none', locale)}</span>
                          }
                        </div>
                      </TableCell>
                      <TableCell>{getPlanBadge(soc.plan_code)}</TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{t('adm.services.modules_count', locale).replace('{n}', String(activeCount))}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(soc.created_at).toLocaleDateString(locale === 'fr' ? "fr-FR" : "en-GB")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => openAssignDialog(soc)}
                          >
                            {t('adm.services.change_plan', locale)}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            style={{ color: "#D4AF37" }}
                            onClick={() => openCustomDialog(soc)}
                          >
                            {t('adm.services.customize', locale)}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {societes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {t('adm.services.no_societe', locale)}
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
              <CreditCard className="h-5 w-5" style={{ color: "#D4AF37" }} />
              <CardTitle style={{ color: "#0B0F2E" }}>{t('adm.services.section_stats', locale)}</CardTitle>
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
                    <Building2 className="h-4 w-4" style={{ color: "#D4AF37" }} />
                    <CardTitle className="text-sm">{t('adm.services.stats_societes_by_plan', locale)}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {planStats.map(ps => {
                    const color = PLAN_COLORS[ps.code] || "#6b7280"
                    const pct = societes.length > 0 ? Math.round((ps.count / societes.length) * 100) : 0
                    return (
                      <div key={ps.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span style={{ color: "#0B0F2E" }}>{ps.nom}</span>
                          <span className="font-medium">{ps.count} {t('adm.services.societe_suffix', locale)}</span>
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
                        <span style={{ color: "#0B0F2E" }}>{t('adm.services.plan_custom', locale)}</span>
                        <span className="font-medium">{customCount} {t('adm.services.societe_suffix', locale)}</span>
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
                        <span className="text-muted-foreground">{t('adm.services.plan_undefined', locale)}</span>
                        <span className="font-medium">{noPlanCount} {t('adm.services.societe_suffix', locale)}</span>
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
                    <CreditCard className="h-4 w-4" style={{ color: "#D4AF37" }} />
                    <CardTitle className="text-sm">{t('adm.services.stats_revenue', locale)}</CardTitle>
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
                            <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>{ps.nom}</p>
                            <p className="text-xs text-muted-foreground">{ps.count} {t('adm.services.societe_suffix', locale)}</p>
                          </div>
                        </div>
                        <span className="font-semibold text-sm" style={{ color: "#0B0F2E" }}>
                          {revenue > 0 ? `Rs ${revenue.toLocaleString(locale === 'fr' ? "fr-FR" : "en-GB")}` : t('adm.services.on_quote', locale)}
                        </span>
                      </div>
                    )
                  })}
                  <div className="pt-3 border-t">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: "#0B0F2E" }}>{t('adm.services.total_monthly', locale)}</span>
                      <span className="font-bold" style={{ color: "#D4AF37" }}>
                        Rs {planStats.reduce((sum, ps) => sum + ps.count * (Number(ps.prix_mensuel) || 0), 0).toLocaleString(locale === 'fr' ? "fr-FR" : "en-GB")}
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
            <DialogTitle style={{ color: "#0B0F2E" }}>
              {t('adm.services.edit_plan_title', locale)}: {editingPlan?.nom}
            </DialogTitle>
            <DialogDescription>
              {t('adm.services.edit_plan_desc', locale)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {(Object.keys(MODULE_LABELS) as (keyof ModulesConfig)[]).map(key => (
              <div key={key} className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>{MODULE_LABELS[key]}</p>
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
              <Label>{t('adm.services.price_label', locale)}</Label>
              <Input
                type="number"
                min="0"
                step="100"
                value={editPrix}
                onChange={(e) => setEditPrix(e.target.value)}
                placeholder={t('adm.services.price_placeholder', locale)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPlanDialog(false)}>{t('adm.services.cancel', locale)}</Button>
            <Button
              style={{ backgroundColor: "#D4AF37" }}
              onClick={handleSavePlan}
              disabled={savingPlan}
            >
              {savingPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {t('adm.services.save', locale)}
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
            <DialogTitle style={{ color: "#0B0F2E" }}>
              {t('adm.services.assign_title', locale)}
            </DialogTitle>
            <DialogDescription>
              {t('adm.services.assign_desc', locale)} <strong>{assignSociete?.nom}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('adm.services.plan', locale)}</Label>
              <Select value={assignPlanCode} onValueChange={setAssignPlanCode}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('adm.services.select_plan', locale)} />
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
                  <p className="text-xs font-medium text-muted-foreground">{t('adm.services.modules_included', locale)}</p>
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
            <Button variant="outline" onClick={() => setAssignDialog(false)}>{t('adm.services.cancel', locale)}</Button>
            <Button
              style={{ backgroundColor: "#D4AF37" }}
              onClick={handleAssignPlan}
              disabled={assignSaving || !assignPlanCode}
            >
              {assignSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('adm.services.assign_btn', locale)}
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
            <DialogTitle style={{ color: "#0B0F2E" }}>
              {t('adm.services.custom_title', locale)}
            </DialogTitle>
            <DialogDescription>
              {t('adm.services.custom_desc1', locale)} <strong>{customSociete?.nom}</strong>.
              {' '}{t('adm.services.custom_desc2', locale)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {(Object.keys(MODULE_LABELS) as (keyof ModulesConfig)[]).map(key => (
              <div key={key} className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>{MODULE_LABELS[key]}</p>
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
            <Button variant="outline" onClick={() => setCustomDialog(false)}>{t('adm.services.cancel', locale)}</Button>
            <Button
              style={{ backgroundColor: "#D4AF37" }}
              onClick={handleSaveCustom}
              disabled={customSaving}
            >
              {customSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {t('adm.services.save', locale)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </ClientPageShell>
  )
}
