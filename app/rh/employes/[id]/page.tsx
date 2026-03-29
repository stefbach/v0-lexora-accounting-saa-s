"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { use } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ArrowLeft, Save, Loader2, User, FileText, CalendarDays, Clock,
  Briefcase, CreditCard, Building2, Shield, CheckCircle2, XCircle, AlertCircle
} from "lucide-react"
import { BANQUES_MAURITIUS } from "@/lib/rh/banques-mauritius"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "--"
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
}

function initials(nom: string, prenom: string) {
  return `${(prenom?.[0] || "").toUpperCase()}${(nom?.[0] || "").toUpperCase()}`
}

const ROLES = ["salarie", "manager", "rh", "admin", "direction"]
const DEVISES = ["MUR", "EUR", "USD", "GBP"]
const CSG_CATEGORIES = ["A", "B"]

export default function EmployeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [employe, setEmploye] = useState<any>(null)
  const [form, setForm] = useState<any>(null)
  const [bulletins, setBulletins] = useState<any[]>([])
  const [conges, setConges] = useState<any[]>([])
  const [soldes, setSoldes] = useState<any[]>([])
  const [pointages, setPointages] = useState<any[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/rh/employes/${id}`)
      if (!res.ok) throw new Error("Employe introuvable")
      const data = await res.json()
      setEmploye(data.employe)
      setForm({ ...data.employe })
      setBulletins(data.bulletins || [])
      setConges(data.conges || [])
      setSoldes(data.soldes || [])
      setPointages(data.pointages || [])
    } catch (e: any) {
      setError(e.message || "Erreur de chargement")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!form) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch(`/api/rh/employes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: form.nom,
          prenom: form.prenom,
          poste: form.poste,
          email: form.email,
          telephone: form.telephone,
          departement: form.departement,
          salaire_base: parseFloat(form.salaire_base) || 0,
          transport_allowance: parseFloat(form.transport_allowance) || 0,
          petrol_allowance: parseFloat(form.petrol_allowance) || 0,
          date_arrivee: form.date_arrivee,
          date_depart: form.date_depart || null,
          role: form.role,
          csg_categorie: form.csg_categorie,
          bank_account: form.bank_account,
          bank_name: form.bank_name,
          nic_number: form.nic_number,
          tan_number: form.tan_number,
          iban: form.iban,
          devise_salaire: form.devise_salaire,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error)
      }
      const data = await res.json()
      setEmploye(data.employe)
      setForm({ ...data.employe })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e.message || "Erreur lors de la sauvegarde")
    } finally {
      setSaving(false)
    }
  }

  const updateForm = (field: string, value: any) => {
    setForm((f: any) => ({ ...f, [field]: value }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#1E2A4A]" />
      </div>
    )
  }

  if (error && !employe) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" onClick={() => router.push("/rh/employes")} className="text-[#1E2A4A]">
          <ArrowLeft className="w-4 h-4 mr-2" />Retour
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-10 h-10 mx-auto text-red-400 mb-3" />
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!form) return null

  const roleBadgeColor: Record<string, string> = {
    admin: "bg-red-100 text-red-800",
    direction: "bg-purple-100 text-purple-800",
    rh: "bg-blue-100 text-blue-800",
    manager: "bg-amber-100 text-amber-800",
    salarie: "bg-gray-100 text-gray-700",
  }

  // Pointage summary
  const totalHeures = pointages.reduce((sum: number, p: any) => sum + (p.heures_travaillees || 0), 0)
  const totalOT = pointages.reduce((sum: number, p: any) => sum + (p.heures_supplementaires || 0), 0)
  const joursAbsence = pointages.filter((p: any) => p.statut === "absent").length

  const congeStatusBadge = (statut: string) => {
    switch (statut) {
      case "approuve": return <Badge className="bg-green-100 text-green-800 border-0"><CheckCircle2 className="w-3 h-3 mr-1" />Approuve</Badge>
      case "en_attente": return <Badge className="bg-amber-100 text-amber-800 border-0"><AlertCircle className="w-3 h-3 mr-1" />En attente</Badge>
      case "refuse": return <Badge className="bg-red-100 text-red-800 border-0"><XCircle className="w-3 h-3 mr-1" />Refuse</Badge>
      default: return <Badge variant="outline">{statut}</Badge>
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/rh/employes")}
            className="text-[#1E2A4A] hover:bg-[#1E2A4A]/10"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <div className="w-14 h-14 rounded-full bg-[#1E2A4A] flex items-center justify-center text-white text-xl font-bold shrink-0">
            {initials(employe.nom, employe.prenom)}
          </div>

          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#1E2A4A]">
                {employe.prenom} {employe.nom}
              </h1>
              <Badge className={`${roleBadgeColor[employe.role] || roleBadgeColor.salarie} border-0`}>
                {employe.role}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
              {employe.code && (
                <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">{employe.code}</span>
              )}
              {employe.poste && <span>{employe.poste}</span>}
              {employe.departement && (
                <>
                  <span className="text-gray-300">|</span>
                  <span>{employe.departement}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="informations" className="space-y-4">
        <TabsList className="bg-gray-100">
          <TabsTrigger value="informations" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white">
            <User className="w-4 h-4 mr-2" />Informations
          </TabsTrigger>
          <TabsTrigger value="paie" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white">
            <FileText className="w-4 h-4 mr-2" />Paie
          </TabsTrigger>
          <TabsTrigger value="conges" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white">
            <CalendarDays className="w-4 h-4 mr-2" />Conges
          </TabsTrigger>
          <TabsTrigger value="pointage" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white">
            <Clock className="w-4 h-4 mr-2" />Pointage
          </TabsTrigger>
        </TabsList>

        {/* ===== TAB: Informations ===== */}
        <TabsContent value="informations" className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
              {error}
            </div>
          )}
          {saved && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />Modifications enregistrees avec succes.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Identite */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-[#1E2A4A] flex items-center gap-2 text-base">
                  <User className="w-4 h-4" />Identite
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">Nom</Label>
                    <Input value={form.nom || ""} onChange={e => updateForm("nom", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Prenom</Label>
                    <Input value={form.prenom || ""} onChange={e => updateForm("prenom", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Email</Label>
                  <Input type="email" value={form.email || ""} onChange={e => updateForm("email", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Telephone</Label>
                  <Input value={form.telephone || ""} onChange={e => updateForm("telephone", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Poste</Label>
                  <Input value={form.poste || ""} onChange={e => updateForm("poste", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Departement</Label>
                  <Input value={form.departement || ""} onChange={e => updateForm("departement", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Role</Label>
                  <Select value={form.role || "salarie"} onValueChange={v => updateForm("role", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Contrat */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-[#1E2A4A] flex items-center gap-2 text-base">
                  <Briefcase className="w-4 h-4" />Contrat
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">Date d&apos;arrivee</Label>
                    <Input
                      type="date"
                      value={form.date_arrivee?.split("T")[0] || ""}
                      onChange={e => updateForm("date_arrivee", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Date de depart</Label>
                    <Input
                      type="date"
                      value={form.date_depart?.split("T")[0] || ""}
                      onChange={e => updateForm("date_depart", e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Devise salaire</Label>
                  <Select value={form.devise_salaire || "MUR"} onValueChange={v => updateForm("devise_salaire", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEVISES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Salaire de base</Label>
                  <Input
                    type="number"
                    value={form.salaire_base || ""}
                    onChange={e => updateForm("salaire_base", e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">Transport allowance</Label>
                    <Input
                      type="number"
                      value={form.transport_allowance || ""}
                      onChange={e => updateForm("transport_allowance", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Petrol allowance</Label>
                    <Input
                      type="number"
                      value={form.petrol_allowance || ""}
                      onChange={e => updateForm("petrol_allowance", e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Administration */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-[#1E2A4A] flex items-center gap-2 text-base">
                  <Shield className="w-4 h-4" />Administration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-gray-500">NIC (National ID Card)</Label>
                  <Input
                    value={form.nic_number || ""}
                    onChange={e => updateForm("nic_number", e.target.value)}
                    placeholder="A1234567890123"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">TAN (Tax Account Number)</Label>
                  <Input
                    value={form.tan_number || ""}
                    onChange={e => updateForm("tan_number", e.target.value)}
                    placeholder="A123456789"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Categorie CSG</Label>
                  <Select value={form.csg_categorie || "A"} onValueChange={v => updateForm("csg_categorie", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CSG_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Code employe</Label>
                  <Input value={form.code || ""} disabled className="bg-gray-50" />
                </div>
              </CardContent>
            </Card>

            {/* Coordonnees bancaires */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-[#1E2A4A] flex items-center gap-2 text-base">
                  <CreditCard className="w-4 h-4" />Coordonnees bancaires
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-gray-500">Banque</Label>
                  <Select value={form.bank_name || ""} onValueChange={v => updateForm("bank_name", v)}>
                    <SelectTrigger><SelectValue placeholder="Choisir une banque..." /></SelectTrigger>
                    <SelectContent>
                      {BANQUES_MAURITIUS.map(b => (
                        <SelectItem key={b.code} value={b.code}>{b.nom}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">N. compte bancaire</Label>
                  <Input
                    value={form.bank_account || ""}
                    onChange={e => updateForm("bank_account", e.target.value)}
                    placeholder="000012345678"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">IBAN</Label>
                  <Input
                    value={form.iban || ""}
                    onChange={e => updateForm("iban", e.target.value)}
                    placeholder="MU17BOMM0101101030300200000MUR"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Save button */}
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#1E2A4A] hover:bg-[#1E2A4A]/90 text-white px-8"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Sauvegarder
            </Button>
          </div>
        </TabsContent>

        {/* ===== TAB: Paie ===== */}
        <TabsContent value="paie" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-[#1E2A4A] flex items-center gap-2 text-base">
                <FileText className="w-4 h-4" />Bulletins de paie (12 derniers)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {bulletins.length === 0 ? (
                <div className="text-center py-12 text-gray-500">Aucun bulletin de paie</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Periode</TableHead>
                      <TableHead className="text-right">Brut</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulletins.map((b: any) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.periode}</TableCell>
                        <TableCell className="text-right">{fmt(b.salaire_brut || 0)}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(b.salaire_net || 0)}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              b.statut === "valide"
                                ? "bg-green-100 text-green-800 border-0"
                                : b.statut === "brouillon"
                                ? "bg-gray-100 text-gray-700 border-0"
                                : "bg-amber-100 text-amber-800 border-0"
                            }
                          >
                            {b.statut || "brouillon"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {b.pdf_url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(b.pdf_url, "_blank")}
                              className="text-[#C9A84C] hover:text-[#C9A84C]/80"
                            >
                              <FileText className="w-4 h-4 mr-1" />PDF
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB: Conges ===== */}
        <TabsContent value="conges" className="space-y-4">
          {/* Soldes */}
          {soldes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-[#1E2A4A] flex items-center gap-2 text-base">
                  <CalendarDays className="w-4 h-4" />Soldes de conges
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {soldes.map((s: any) => (
                    <div key={s.id} className="bg-gray-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-500 mb-1">{s.type_conge || "Annuel"} ({s.annee})</p>
                      <p className="text-2xl font-bold text-[#1E2A4A]">{s.solde ?? s.jours_restants ?? "--"}</p>
                      <p className="text-xs text-gray-400">jours restants</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Demandes recentes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-[#1E2A4A] flex items-center gap-2 text-base">
                <CalendarDays className="w-4 h-4" />Demandes recentes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {conges.length === 0 ? (
                <div className="text-center py-12 text-gray-500">Aucune demande de conge</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Du</TableHead>
                      <TableHead>Au</TableHead>
                      <TableHead className="text-right">Jours</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conges.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.type_conge || "Annuel"}</TableCell>
                        <TableCell>{fmtDate(c.date_debut)}</TableCell>
                        <TableCell>{fmtDate(c.date_fin)}</TableCell>
                        <TableCell className="text-right">{c.nb_jours ?? "--"}</TableCell>
                        <TableCell>{congeStatusBadge(c.statut)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB: Pointage ===== */}
        <TabsContent value="pointage" className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <Clock className="w-6 h-6 mx-auto text-[#1E2A4A] mb-2" />
                <p className="text-2xl font-bold text-[#1E2A4A]">{totalHeures.toFixed(1)}h</p>
                <p className="text-xs text-gray-500">Heures travaillees</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <Clock className="w-6 h-6 mx-auto text-[#C9A84C] mb-2" />
                <p className="text-2xl font-bold text-[#C9A84C]">{totalOT.toFixed(1)}h</p>
                <p className="text-xs text-gray-500">Heures supplementaires</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <AlertCircle className="w-6 h-6 mx-auto text-red-400 mb-2" />
                <p className="text-2xl font-bold text-red-500">{joursAbsence}</p>
                <p className="text-xs text-gray-500">Jours absence</p>
              </CardContent>
            </Card>
          </div>

          {/* Pointage table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-[#1E2A4A] flex items-center gap-2 text-base">
                <Clock className="w-4 h-4" />Pointages (31 derniers jours)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {pointages.length === 0 ? (
                <div className="text-center py-12 text-gray-500">Aucun pointage enregistre</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Arrivee</TableHead>
                      <TableHead>Depart</TableHead>
                      <TableHead className="text-right">Heures</TableHead>
                      <TableHead className="text-right">OT</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pointages.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{fmtDate(p.date_pointage)}</TableCell>
                        <TableCell>{p.heure_arrivee || "--"}</TableCell>
                        <TableCell>{p.heure_depart || "--"}</TableCell>
                        <TableCell className="text-right">{p.heures_travaillees?.toFixed(1) || "--"}</TableCell>
                        <TableCell className="text-right">{p.heures_supplementaires?.toFixed(1) || "--"}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              p.statut === "present"
                                ? "bg-green-100 text-green-800 border-0"
                                : p.statut === "absent"
                                ? "bg-red-100 text-red-800 border-0"
                                : p.statut === "retard"
                                ? "bg-amber-100 text-amber-800 border-0"
                                : "bg-gray-100 text-gray-700 border-0"
                            }
                          >
                            {p.statut || "--"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
