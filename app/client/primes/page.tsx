"use client"

import { useState, useEffect, useCallback } from "react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Loader2, Target, Building2, Calculator, CheckCircle, Plus,
  Calendar, FileText, History, DollarSign, ArrowRight
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"
import { t, getLocale, type Locale } from '@/lib/i18n'

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MUR"
}

interface Societe { id: string; nom: string }
interface ReglePrime {
  id: string; nom: string; type: string; montant: number; taux?: number
  scope: string; scope_value?: string; conditions?: string
  periode?: string; plafond?: number; actif: boolean
}
interface PrimeCalculee {
  id: string; employe_nom: string; prime_nom: string; montant: number
  periode: string; statut: string
}

const TYPE_LABELS_FR: Record<string, string> = {
  fixe: "Fixe", pourcentage: "Pourcentage", anciennete: "Anciennete",
  assiduite: "Assiduite", objectif: "Objectif",
}
const TYPE_LABELS_EN: Record<string, string> = {
  fixe: "Fixed", pourcentage: "Percentage", anciennete: "Seniority",
  assiduite: "Attendance", objectif: "Target",
}
const SCOPE_LABELS_FR: Record<string, string> = {
  tous: "Tous", groupe: "Groupe", individuel: "Individuel",
}
const SCOPE_LABELS_EN: Record<string, string> = {
  tous: "All", groupe: "Group", individuel: "Individual",
}

export default function PrimesPage() {
  const locale = getLocale()
  const TYPE_LABELS = locale === 'fr' ? TYPE_LABELS_FR : TYPE_LABELS_EN
  const SCOPE_LABELS = locale === 'fr' ? SCOPE_LABELS_FR : SCOPE_LABELS_EN
  const { profile, loading: profileLoading } = useProfile()
  const { societeId } = useSocieteActive()
  const [regles, setRegles] = useState<ReglePrime[]>([])
  const [calculs, setCalculs] = useState<PrimeCalculee[]>([])
  const [historique, setHistorique] = useState<PrimeCalculee[]>([])
  const [fetching, setFetching] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [periode, setPeriode] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({
    nom: "", type: "fixe", montant: "", scope: "tous",
    scope_value: "", conditions: "", periode: "", plafond: "",
  })

  const fetchRegles = useCallback(async () => {
    if (!societeId) return
    setFetching(true)
    try {
      const r = await fetch(`/api/rh/primes/regles?societe_id=${societeId}`)
      if (r.ok) { const d = await r.json(); setRegles(d.regles || []) }
    } catch { /* silent */ }
    setFetching(false)
  }, [societeId])

  const fetchHistorique = useCallback(async () => {
    if (!societeId) return
    try {
      const r = await fetch(`/api/rh/primes/regles?societe_id=${societeId}&historique=true`)
      if (r.ok) { const d = await r.json(); setHistorique(d.primes || []) }
    } catch { /* silent */ }
  }, [societeId])

  useEffect(() => { fetchRegles(); fetchHistorique() }, [fetchRegles, fetchHistorique])

  const handleCreerRegle = async () => {
    if (!form.nom || !societeId) return
    try {
      const r = await fetch("/api/rh/primes/regles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "creer_regle", societe_id: societeId,
          nom: form.nom, type: form.type,
          montant: form.montant ? parseFloat(form.montant) : 0,
          scope: form.scope, scope_value: form.scope_value || null,
          conditions: form.conditions || null,
          periode: form.periode || null,
          plafond: form.plafond ? parseFloat(form.plafond) : null,
        }),
      })
      if (r.ok) {
        setDialogOpen(false)
        setForm({ nom: "", type: "fixe", montant: "", scope: "tous", scope_value: "", conditions: "", periode: "", plafond: "" })
        fetchRegles()
      }
    } catch { /* silent */ }
  }

  const handleToggleActif = async (regle: ReglePrime) => {
    try {
      await fetch("/api/rh/primes/regles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_regle", regle_id: regle.id, actif: !regle.actif,
        }),
      })
      fetchRegles()
    } catch { /* silent */ }
  }

  const handleCalculer = async () => {
    if (!societeId || !periode) return
    setCalculating(true)
    try {
      const r = await fetch("/api/rh/primes/regles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "calculer", societe_id: societeId, periode }),
      })
      if (r.ok) { const d = await r.json(); setCalculs(d.primes || []) }
    } catch { /* silent */ }
    setCalculating(false)
  }

  const handleValider = async () => {
    try {
      await fetch("/api/rh/primes/regles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "valider", societe_id: societeId, periode }),
      })
      fetchHistorique()
    } catch { /* silent */ }
  }

  const handleIntegrerPaie = async () => {
    try {
      await fetch("/api/rh/primes/regles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "integrer_paie", societe_id: societeId, periode }),
      })
    } catch { /* silent */ }
  }

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]">{t('hr.primes.title', locale)}</h1>
          <p className="text-sm text-gray-500">{t('hr.primes.subtitle', locale)}</p>
        </div>
      </div>

      <Tabs defaultValue="catalogue">
        <TabsList className="bg-[#0B0F2E]/5">
          <TabsTrigger value="catalogue" className="data-[state=active]:bg-[#0B0F2E] data-[state=active]:text-white">
            <Target className="w-4 h-4 mr-1.5" /> {t('hr.primes.tab_catalog', locale)}
          </TabsTrigger>
          <TabsTrigger value="calcul" className="data-[state=active]:bg-[#0B0F2E] data-[state=active]:text-white">
            <Calculator className="w-4 h-4 mr-1.5" /> {t('hr.primes.tab_calc', locale)}
          </TabsTrigger>
          <TabsTrigger value="historique" className="data-[state=active]:bg-[#0B0F2E] data-[state=active]:text-white">
            <History className="w-4 h-4 mr-1.5" /> {t('hr.primes.tab_history', locale)}
          </TabsTrigger>
        </TabsList>

        {/* --- CATALOGUE --- */}
        <TabsContent value="catalogue" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#D4AF37] hover:bg-[#b8963f] text-[#0B0F2E]">
                  <Plus className="w-4 h-4 mr-1.5" /> {t('hr.primes.create_bonus', locale)}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="text-[#0B0F2E]">{t('hr.primes.create_bonus', locale)}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid gap-1.5">
                    <Label>{t('hr.primes.name', locale)}</Label>
                    <Input value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} placeholder={t('hr.primes.name_ph', locale)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label>{t('hr.primes.type', locale)}</Label>
                      <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixe">{t('hr.primes.type_fixed', locale)}</SelectItem>
                          <SelectItem value="pourcentage">{t('hr.primes.type_pct', locale)}</SelectItem>
                          <SelectItem value="anciennete">{t('hr.primes.type_seniority', locale)}</SelectItem>
                          <SelectItem value="assiduite">{t('hr.primes.type_attendance', locale)}</SelectItem>
                          <SelectItem value="objectif">{t('hr.primes.type_target', locale)}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>{t('hr.primes.amount_rate', locale)}</Label>
                      <Input type="number" value={form.montant} onChange={e => setForm(p => ({ ...p, montant: e.target.value }))} placeholder="5000" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label>{t('hr.primes.scope', locale)}</Label>
                      <Select value={form.scope} onValueChange={v => setForm(p => ({ ...p, scope: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tous">{t('hr.primes.scope_all', locale)}</SelectItem>
                          <SelectItem value="groupe">{t('hr.primes.scope_group', locale)}</SelectItem>
                          <SelectItem value="individuel">{t('hr.primes.scope_individual', locale)}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.scope !== "tous" && (
                      <div className="grid gap-1.5">
                        <Label>{t('hr.primes.scope_value', locale)}</Label>
                        <Input value={form.scope_value} onChange={e => setForm(p => ({ ...p, scope_value: e.target.value }))} placeholder={form.scope === "groupe" ? t('hr.primes.group_name_ph', locale) : t('hr.primes.employee_id_ph', locale)} />
                      </div>
                    )}
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{t('hr.primes.conditions', locale)}</Label>
                    <Input value={form.conditions} onChange={e => setForm(p => ({ ...p, conditions: e.target.value }))} placeholder={t('hr.primes.conditions_ph', locale)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label>{t('hr.primes.period', locale)}</Label>
                      <Input value={form.periode} onChange={e => setForm(p => ({ ...p, periode: e.target.value }))} placeholder={t('hr.primes.period_ph', locale)} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>{t('hr.primes.cap', locale)}</Label>
                      <Input type="number" value={form.plafond} onChange={e => setForm(p => ({ ...p, plafond: e.target.value }))} placeholder="50000" />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('hr.primes.cancel', locale)}</Button>
                  <Button className="bg-[#0B0F2E] hover:bg-[#16203a] text-white" onClick={handleCreerRegle}>{t('hr.primes.save', locale)}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#0B0F2E]/5">
                    <TableHead>{t('hr.primes.name', locale)}</TableHead>
                    <TableHead>{t('hr.primes.type', locale)}</TableHead>
                    <TableHead className="text-right">{t('hr.primes.amount_rate', locale)}</TableHead>
                    <TableHead>{t('hr.primes.scope', locale)}</TableHead>
                    <TableHead className="text-center">{t('hr.primes.active', locale)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fetching ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#D4AF37]" />
                    </TableCell></TableRow>
                  ) : regles.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-400">
                      {t('hr.primes.no_rules', locale)}
                    </TableCell></TableRow>
                  ) : regles.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium text-[#0B0F2E]">{r.nom}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-[#D4AF37] text-[#D4AF37]">
                          {TYPE_LABELS[r.type] || r.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {r.type === "pourcentage" ? `${r.taux ?? r.montant}%` : fmt(r.montant)}
                      </TableCell>
                      <TableCell>{SCOPE_LABELS[r.scope] || r.scope}</TableCell>
                      <TableCell className="text-center">
                        <Switch checked={r.actif} onCheckedChange={() => handleToggleActif(r)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- CALCUL MENSUEL --- */}
        <TabsContent value="calcul" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-[#0B0F2E] text-base">{t('hr.primes.calc_title', locale)}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-4">
                <div className="grid gap-1.5">
                  <Label>{t('hr.primes.period', locale)}</Label>
                  <Input type="month" value={periode} onChange={e => setPeriode(e.target.value)} className="w-48" />
                </div>
                <Button onClick={handleCalculer} disabled={calculating} className="bg-[#0B0F2E] hover:bg-[#16203a] text-white">
                  {calculating ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Calculator className="w-4 h-4 mr-1.5" />}
                  {t('hr.primes.calculate', locale)}
                </Button>
              </div>
            </CardContent>
          </Card>

          {calculs.length > 0 && (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#0B0F2E]/5">
                      <TableHead>{t('hr.primes.employee', locale)}</TableHead>
                      <TableHead>{t('hr.primes.bonus', locale)}</TableHead>
                      <TableHead className="text-right">{t('hr.primes.amount', locale)}</TableHead>
                      <TableHead>{t('hr.primes.status', locale)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calculs.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.employe_nom}</TableCell>
                        <TableCell>{c.prime_nom}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(c.montant)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {c.statut || t('hr.primes.status_calculated', locale)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex justify-between items-center p-4 border-t">
                  <div className="text-sm text-gray-500">
                    {calculs.length} {t('hr.primes.lines', locale)} - {t('hr.primes.total', locale)}: <span className="font-semibold text-[#0B0F2E]">{fmt(calculs.reduce((s, c) => s + c.montant, 0))}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleValider} className="border-[#0B0F2E] text-[#0B0F2E]">
                      <CheckCircle className="w-4 h-4 mr-1.5" /> {t('hr.primes.validate', locale)}
                    </Button>
                    <Button onClick={handleIntegrerPaie} className="bg-[#D4AF37] hover:bg-[#b8963f] text-[#0B0F2E]">
                      <ArrowRight className="w-4 h-4 mr-1.5" /> {t('hr.primes.integrate_payroll', locale)}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {!calculating && calculs.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-gray-400">
                <Calculator className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>{t('hr.primes.select_period', locale)}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* --- HISTORIQUE --- */}
        <TabsContent value="historique" className="space-y-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#0B0F2E]/5">
                    <TableHead>{t('hr.primes.period', locale)}</TableHead>
                    <TableHead>{t('hr.primes.employee', locale)}</TableHead>
                    <TableHead>{t('hr.primes.bonus', locale)}</TableHead>
                    <TableHead className="text-right">{t('hr.primes.amount', locale)}</TableHead>
                    <TableHead>{t('hr.primes.status', locale)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historique.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-400">
                      <History className="w-5 h-5 mx-auto mb-2 opacity-40" />
                      {t('hr.primes.no_history', locale)}
                    </TableCell></TableRow>
                  ) : historique.map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium text-[#0B0F2E]">{h.periode}</TableCell>
                      <TableCell>{h.employe_nom}</TableCell>
                      <TableCell>{h.prime_nom}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(h.montant)}</TableCell>
                      <TableCell>
                        <Badge variant={h.statut === "integre" ? "default" : "outline"} className={h.statut === "integre" ? "bg-green-100 text-green-800" : ""}>
                          {h.statut}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
