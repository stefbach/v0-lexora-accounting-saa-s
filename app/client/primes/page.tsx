"use client"

import { useState, useEffect, useCallback } from "react"
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

const TYPE_LABELS: Record<string, string> = {
  fixe: "Fixe", pourcentage: "Pourcentage", anciennete: "Anciennete",
  assiduite: "Assiduite", objectif: "Objectif",
}
const SCOPE_LABELS: Record<string, string> = {
  tous: "Tous", groupe: "Groupe", individuel: "Individuel",
}

export default function PrimesPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState("")
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

  const fetchSocietes = useCallback(async () => {
    if (!profile?.id) return
    try {
      const r = await fetch(`/api/societes?user_id=${profile.id}`)
      if (r.ok) { const d = await r.json(); setSocietes(d.societes || []) }
    } catch { /* silent */ }
  }, [profile?.id])

  const fetchRegles = useCallback(async () => {
    if (!selectedSociete) return
    setFetching(true)
    try {
      const r = await fetch(`/api/rh/primes/regles?societe_id=${selectedSociete}`)
      if (r.ok) { const d = await r.json(); setRegles(d.regles || []) }
    } catch { /* silent */ }
    setFetching(false)
  }, [selectedSociete])

  const fetchHistorique = useCallback(async () => {
    if (!selectedSociete) return
    try {
      const r = await fetch(`/api/rh/primes/regles?societe_id=${selectedSociete}&historique=true`)
      if (r.ok) { const d = await r.json(); setHistorique(d.primes || []) }
    } catch { /* silent */ }
  }, [selectedSociete])

  useEffect(() => { fetchSocietes() }, [fetchSocietes])
  useEffect(() => {
    if (societes.length && !selectedSociete) setSelectedSociete(societes[0].id)
  }, [societes, selectedSociete])
  useEffect(() => { fetchRegles(); fetchHistorique() }, [fetchRegles, fetchHistorique])

  const handleCreerRegle = async () => {
    if (!form.nom || !selectedSociete) return
    try {
      const r = await fetch("/api/rh/primes/regles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "creer_regle", societe_id: selectedSociete,
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
    if (!selectedSociete || !periode) return
    setCalculating(true)
    try {
      const r = await fetch("/api/rh/primes/regles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "calculer", societe_id: selectedSociete, periode }),
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
        body: JSON.stringify({ action: "valider", societe_id: selectedSociete, periode }),
      })
      fetchHistorique()
    } catch { /* silent */ }
  }

  const handleIntegrerPaie = async () => {
    try {
      await fetch("/api/rh/primes/regles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "integrer_paie", societe_id: selectedSociete, periode }),
      })
    } catch { /* silent */ }
  }

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#C9A84C]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Gestion des Primes</h1>
          <p className="text-sm text-gray-500">Catalogue, calcul et suivi des primes</p>
        </div>
        <Select value={selectedSociete} onValueChange={setSelectedSociete}>
          <SelectTrigger className="w-64">
            <Building2 className="w-4 h-4 mr-2 text-[#1E2A4A]" />
            <SelectValue placeholder="Societe" />
          </SelectTrigger>
          <SelectContent>
            {societes.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="catalogue">
        <TabsList className="bg-[#1E2A4A]/5">
          <TabsTrigger value="catalogue" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white">
            <Target className="w-4 h-4 mr-1.5" /> Catalogue
          </TabsTrigger>
          <TabsTrigger value="calcul" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white">
            <Calculator className="w-4 h-4 mr-1.5" /> Calcul mensuel
          </TabsTrigger>
          <TabsTrigger value="historique" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white">
            <History className="w-4 h-4 mr-1.5" /> Historique
          </TabsTrigger>
        </TabsList>

        {/* --- CATALOGUE --- */}
        <TabsContent value="catalogue" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#C9A84C] hover:bg-[#b8963f] text-[#1E2A4A]">
                  <Plus className="w-4 h-4 mr-1.5" /> Creer une prime
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="text-[#1E2A4A]">Creer une prime</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid gap-1.5">
                    <Label>Nom</Label>
                    <Input value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} placeholder="Prime de performance" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label>Type</Label>
                      <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixe">Fixe</SelectItem>
                          <SelectItem value="pourcentage">Pourcentage</SelectItem>
                          <SelectItem value="anciennete">Anciennete</SelectItem>
                          <SelectItem value="assiduite">Assiduite</SelectItem>
                          <SelectItem value="objectif">Objectif</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Montant / Taux</Label>
                      <Input type="number" value={form.montant} onChange={e => setForm(p => ({ ...p, montant: e.target.value }))} placeholder="5000" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label>Scope</Label>
                      <Select value={form.scope} onValueChange={v => setForm(p => ({ ...p, scope: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tous">Tous</SelectItem>
                          <SelectItem value="groupe">Groupe</SelectItem>
                          <SelectItem value="individuel">Individuel</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.scope !== "tous" && (
                      <div className="grid gap-1.5">
                        <Label>Scope (valeur)</Label>
                        <Input value={form.scope_value} onChange={e => setForm(p => ({ ...p, scope_value: e.target.value }))} placeholder={form.scope === "groupe" ? "Nom du groupe" : "ID employe"} />
                      </div>
                    )}
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Conditions</Label>
                    <Input value={form.conditions} onChange={e => setForm(p => ({ ...p, conditions: e.target.value }))} placeholder="Ex: anciennete >= 2 ans" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label>Periode</Label>
                      <Input value={form.periode} onChange={e => setForm(p => ({ ...p, periode: e.target.value }))} placeholder="mensuel / annuel" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Plafond</Label>
                      <Input type="number" value={form.plafond} onChange={e => setForm(p => ({ ...p, plafond: e.target.value }))} placeholder="50000" />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
                  <Button className="bg-[#1E2A4A] hover:bg-[#16203a] text-white" onClick={handleCreerRegle}>Enregistrer</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#1E2A4A]/5">
                    <TableHead>Nom</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Montant / Taux</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead className="text-center">Actif</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fetching ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#C9A84C]" />
                    </TableCell></TableRow>
                  ) : regles.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-400">
                      Aucune regle de prime configuree
                    </TableCell></TableRow>
                  ) : regles.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium text-[#1E2A4A]">{r.nom}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-[#C9A84C] text-[#C9A84C]">
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
              <CardTitle className="text-[#1E2A4A] text-base">Calcul des primes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-4">
                <div className="grid gap-1.5">
                  <Label>Periode</Label>
                  <Input type="month" value={periode} onChange={e => setPeriode(e.target.value)} className="w-48" />
                </div>
                <Button onClick={handleCalculer} disabled={calculating} className="bg-[#1E2A4A] hover:bg-[#16203a] text-white">
                  {calculating ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Calculator className="w-4 h-4 mr-1.5" />}
                  Calculer primes
                </Button>
              </div>
            </CardContent>
          </Card>

          {calculs.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#1E2A4A]/5">
                      <TableHead>Employe</TableHead>
                      <TableHead>Prime</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead>Statut</TableHead>
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
                            {c.statut || "calcule"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex justify-between items-center p-4 border-t">
                  <div className="text-sm text-gray-500">
                    {calculs.length} ligne(s) - Total: <span className="font-semibold text-[#1E2A4A]">{fmt(calculs.reduce((s, c) => s + c.montant, 0))}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleValider} className="border-[#1E2A4A] text-[#1E2A4A]">
                      <CheckCircle className="w-4 h-4 mr-1.5" /> Valider
                    </Button>
                    <Button onClick={handleIntegrerPaie} className="bg-[#C9A84C] hover:bg-[#b8963f] text-[#1E2A4A]">
                      <ArrowRight className="w-4 h-4 mr-1.5" /> Integrer en paie
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
                <p>Selectionnez une periode et lancez le calcul</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* --- HISTORIQUE --- */}
        <TabsContent value="historique" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#1E2A4A]/5">
                    <TableHead>Periode</TableHead>
                    <TableHead>Employe</TableHead>
                    <TableHead>Prime</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historique.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-400">
                      <History className="w-5 h-5 mx-auto mb-2 opacity-40" />
                      Aucun historique disponible
                    </TableCell></TableRow>
                  ) : historique.map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium text-[#1E2A4A]">{h.periode}</TableCell>
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
