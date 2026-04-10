"use client"
import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Search, Plus, Loader2, Users, Upload, Download, FileSpreadsheet, Pencil, ExternalLink, UserPlus, Key, User, Briefcase, Banknote, Building2, Trash2, AlertTriangle } from "lucide-react"
import { BANQUES_MAURITIUS } from "@/lib/rh/banques-mauritius"

/* ── Section card for grouped form fields ── */
function FormSection({ icon, title, color, children }: { icon: React.ReactNode; title: string; color: string; children: React.ReactNode }) {
  return (
    <Card className={`rounded-2xl shadow-sm border-l-4 overflow-hidden`} style={{ borderLeftColor: color }}>
      <CardHeader className="pb-3 pt-4 px-4 sm:px-5">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[#0B0F2E]" style={{ fontFamily: "Poppins, sans-serif" }}>
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 sm:px-5 pb-4 pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {children}
        </div>
      </CardContent>
    </Card>
  )
}

/* ── Styled form field ── */
function FormField({ label, required, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs font-medium text-gray-600 mb-1 block">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  )
}

const inputClass = "h-11 rounded-xl"
const selectTriggerClass = "h-11 rounded-xl"

// ── Composant formulaire creation (state isole = pas de re-render parent) ──
function CreateEmployeForm({ societes, onCreated, onClose }: { societes: any[]; onCreated: () => void; onClose: () => void }) {
  const [form, setForm] = useState({ societe_id:"",nom:"",prenom:"",poste:"",email:"",telephone:"",salaire_base:"",transport_allowance:"0",petrol_allowance:"0",date_arrivee:"",role:"salarie",csg_categorie:"A",bank_account:"",bank_name:"",nic:"",tan:"",iban:"",genre:"",date_naissance:"",departement:"",type_contrat:"CDI",devise_salaire:"MUR" })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const u = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.societe_id) errs.societe_id = "Societe requise"
    if (!form.nom) errs.nom = "Nom requis"
    if (!form.prenom) errs.prenom = "Prenom requis"
    if (!form.salaire_base) errs.salaire_base = "Salaire requis"
    if (!form.date_arrivee) errs.date_arrivee = "Date requise"
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleCreate = async () => {
    if (!validate()) return
    setSaving(true); setErrors({})
    try {
      const res = await fetch("/api/rh/employes", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ ...form, salaire_base: parseFloat(form.salaire_base), transport_allowance: parseFloat(form.transport_allowance)||0, petrol_allowance: parseFloat(form.petrol_allowance)||0 }) })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      onClose(); onCreated()
    } catch (e: unknown) { setErrors({ _global: e instanceof Error ? e.message : "Erreur" }) }
    finally { setSaving(false) }
  }

  const fieldErr = (k: string) => errors[k] ? <p className="text-xs text-red-500 mt-0.5">{errors[k]}</p> : null

  return (
    <div className="space-y-4 py-2">
      {errors._global && <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-xl">{errors._global}</div>}

      {/* Societe & Role */}
      <FormSection icon={<Building2 className="w-4 h-4 text-[#4191FF]" />} title="Organisation" color="#4191FF">
        <FormField label="Societe" required>
          <Select value={form.societe_id} onValueChange={v=>u("societe_id",v)}><SelectTrigger className={selectTriggerClass}><SelectValue placeholder="Choisir la societe..."/></SelectTrigger><SelectContent>{societes.map(s=><SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent></Select>
          {fieldErr("societe_id")}
        </FormField>
        <FormField label="Role">
          <Select value={form.role} onValueChange={v=>u("role",v)}><SelectTrigger className={selectTriggerClass}><SelectValue/></SelectTrigger><SelectContent>{["salarie","manager","rh","admin","direction"].map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
        </FormField>
      </FormSection>

      {/* Identite */}
      <FormSection icon={<User className="w-4 h-4 text-[#4191FF]" />} title="Identite" color="#4191FF">
        <FormField label="Nom" required>
          <Input className={inputClass} value={form.nom} onChange={e=>u("nom",e.target.value)} placeholder="DUPONT"/>
          {fieldErr("nom")}
        </FormField>
        <FormField label="Prenom" required>
          <Input className={inputClass} value={form.prenom} onChange={e=>u("prenom",e.target.value)} placeholder="Jean"/>
          {fieldErr("prenom")}
        </FormField>
        <FormField label="Email">
          <Input className={inputClass} type="email" value={form.email} onChange={e=>u("email",e.target.value)} placeholder="jean@example.com"/>
        </FormField>
        <FormField label="Telephone">
          <Input className={inputClass} value={form.telephone} onChange={e=>u("telephone",e.target.value)} placeholder="+230 5123 4567"/>
        </FormField>
        <FormField label="Genre">
          <Select value={form.genre} onValueChange={v=>u("genre",v)}><SelectTrigger className={selectTriggerClass}><SelectValue placeholder="Choisir..."/></SelectTrigger><SelectContent><SelectItem value="M">Masculin</SelectItem><SelectItem value="F">Feminin</SelectItem></SelectContent></Select>
        </FormField>
        <FormField label="Date de naissance">
          <Input className={inputClass} type="date" value={form.date_naissance} onChange={e=>u("date_naissance",e.target.value)}/>
        </FormField>
        <FormField label="NIC">
          <Input className={inputClass} value={form.nic} onChange={e=>u("nic",e.target.value)} placeholder="A1234567890123"/>
        </FormField>
        <FormField label="TAN">
          <Input className={inputClass} value={form.tan} onChange={e=>u("tan",e.target.value)} placeholder="A123456789"/>
        </FormField>
      </FormSection>

      {/* Emploi */}
      <FormSection icon={<Briefcase className="w-4 h-4 text-[#D4AF37]" />} title="Emploi" color="#D4AF37">
        <FormField label="Poste">
          <Input className={inputClass} value={form.poste} onChange={e=>u("poste",e.target.value)} placeholder="Comptable"/>
        </FormField>
        <FormField label="Departement">
          <Input className={inputClass} value={form.departement} onChange={e=>u("departement",e.target.value)} placeholder="Finance"/>
        </FormField>
        <FormField label="Date d'arrivee" required>
          <Input className={inputClass} type="date" value={form.date_arrivee} onChange={e=>u("date_arrivee",e.target.value)}/>
          {fieldErr("date_arrivee")}
        </FormField>
        <FormField label="Type de contrat">
          <Select value={form.type_contrat} onValueChange={v=>u("type_contrat",v)}><SelectTrigger className={selectTriggerClass}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="CDI">CDI</SelectItem><SelectItem value="CDD">CDD</SelectItem><SelectItem value="Interim">Interim</SelectItem></SelectContent></Select>
        </FormField>
        <FormField label="Categorie CSG">
          <Select value={form.csg_categorie} onValueChange={v=>u("csg_categorie",v)}><SelectTrigger className={selectTriggerClass}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="A">A</SelectItem><SelectItem value="B">B</SelectItem></SelectContent></Select>
        </FormField>
      </FormSection>

      {/* Salaire */}
      <FormSection icon={<Banknote className="w-4 h-4 text-green-600" />} title="Salaire" color="#22c55e">
        <FormField label="Salaire de base" required>
          <Input className={inputClass} type="number" value={form.salaire_base} onChange={e=>u("salaire_base",e.target.value)} placeholder="35 000"/>
          {fieldErr("salaire_base")}
        </FormField>
        <FormField label="Devise">
          <Select value={form.devise_salaire} onValueChange={v=>u("devise_salaire",v)}><SelectTrigger className={selectTriggerClass}><SelectValue/></SelectTrigger><SelectContent>{["MUR","EUR","USD","GBP"].map(d=><SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select>
        </FormField>
        <FormField label="Transport">
          <Input className={inputClass} type="number" value={form.transport_allowance} onChange={e=>u("transport_allowance",e.target.value)} placeholder="0"/>
        </FormField>
        <FormField label="Petrol">
          <Input className={inputClass} type="number" value={form.petrol_allowance} onChange={e=>u("petrol_allowance",e.target.value)} placeholder="0"/>
        </FormField>
      </FormSection>

      {/* Banque */}
      <FormSection icon={<Building2 className="w-4 h-4 text-purple-600" />} title="Banque" color="#9333ea">
        <FormField label="Banque">
          <Select value={form.bank_name} onValueChange={v=>u("bank_name",v)}><SelectTrigger className={selectTriggerClass}><SelectValue placeholder="Choisir..."/></SelectTrigger><SelectContent>{BANQUES_MAURITIUS.map(b=><SelectItem key={b.code} value={b.code}>{b.nom}</SelectItem>)}</SelectContent></Select>
        </FormField>
        <FormField label="N. compte">
          <Input className={inputClass} value={form.bank_account} onChange={e=>u("bank_account",e.target.value)} placeholder="000012345678"/>
        </FormField>
        <FormField label="IBAN" className="sm:col-span-2">
          <Input className={inputClass} value={form.iban} onChange={e=>u("iban",e.target.value)} placeholder="MU17BOMM..."/>
        </FormField>
      </FormSection>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        <Button variant="outline" onClick={onClose} className="sm:flex-1 h-11 rounded-xl">Annuler</Button>
        <Button onClick={handleCreate} disabled={saving} className="sm:flex-[2] h-11 rounded-xl bg-[#D4AF37] hover:bg-[#c9a432] text-white font-semibold shadow-md" style={{ fontFamily: "Poppins, sans-serif" }}>
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-2"/>}
          Creer l'employe
        </Button>
      </div>
    </div>
  )
}

// ── Composant formulaire édition (state isolé) ──
function EditEmployeForm({ emp, onSaved, onClose }: { emp: any; onSaved: () => void; onClose: () => void }) {
  const [e, setE] = useState({ ...emp })
  const [saving, setSaving] = useState(false)
  const u = (k: string, v: any) => setE((p: any) => ({ ...p, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/rh/employes/${e.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: e.nom, prenom: e.prenom, poste: e.poste, email: e.email, telephone: e.telephone,
          salaire_base: parseFloat(e.salaire_base) || 0,
          transport_allowance: parseFloat(e.transport_allowance) || 0,
          petrol_allowance: parseFloat(e.petrol_allowance) || 0,
          date_arrivee: e.date_arrivee, date_depart: e.date_depart || null,
          role: e.role, csg_categorie: e.csg_categorie, bank_name: e.bank_name, bank_account: e.bank_account,
          nic_number: e.nic_number, tan_number: e.tan_number, iban: e.iban, devise_salaire: e.devise_salaire,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      onClose(); onSaved()
    } catch (err: any) { alert(err.message || "Erreur") }
    finally { setSaving(false) }
  }

  return (
    <div className="grid grid-cols-2 gap-3 py-2">
      <div><Label>Nom *</Label><Input value={e.nom||""} onChange={ev=>u("nom",ev.target.value)}/></div>
      <div><Label>Prénom *</Label><Input value={e.prenom||""} onChange={ev=>u("prenom",ev.target.value)}/></div>
      <div><Label>Poste</Label><Input value={e.poste||""} onChange={ev=>u("poste",ev.target.value)}/></div>
      <div><Label>Email</Label><Input type="email" value={e.email||""} onChange={ev=>u("email",ev.target.value)}/></div>
      <div><Label>Téléphone</Label><Input value={e.telephone||""} onChange={ev=>u("telephone",ev.target.value)}/></div>
      <div><Label>Rôle</Label><Select value={e.role||"salarie"} onValueChange={v=>u("role",v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["salarie","manager","rh","admin","direction"].map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Salaire base *</Label><Input type="number" value={e.salaire_base||""} onChange={ev=>u("salaire_base",ev.target.value)}/></div>
      <div><Label>Devise</Label><Select value={e.devise_salaire||"MUR"} onValueChange={v=>u("devise_salaire",v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["MUR","EUR","USD","GBP"].map(d=><SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Transport</Label><Input type="number" value={e.transport_allowance||""} onChange={ev=>u("transport_allowance",ev.target.value)}/></div>
      <div><Label>Petrol</Label><Input type="number" value={e.petrol_allowance||""} onChange={ev=>u("petrol_allowance",ev.target.value)}/></div>
      <div><Label>Date arrivée</Label><Input type="date" value={e.date_arrivee?.split("T")[0]||""} onChange={ev=>u("date_arrivee",ev.target.value)}/></div>
      <div><Label>Date départ</Label><Input type="date" value={e.date_depart?.split("T")[0]||""} onChange={ev=>u("date_depart",ev.target.value)}/></div>
      <div><Label>NIC</Label><Input value={e.nic_number||""} onChange={ev=>u("nic_number",ev.target.value)}/></div>
      <div><Label>TAN</Label><Input value={e.tan_number||""} onChange={ev=>u("tan_number",ev.target.value)}/></div>
      <div><Label>CSG</Label><Select value={e.csg_categorie||"A"} onValueChange={v=>u("csg_categorie",v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="A">A</SelectItem><SelectItem value="B">B</SelectItem></SelectContent></Select></div>
      <div><Label>Banque</Label><Select value={e.bank_name||""} onValueChange={v=>u("bank_name",v)}><SelectTrigger><SelectValue placeholder="Choisir..."/></SelectTrigger><SelectContent>{BANQUES_MAURITIUS.map(b=><SelectItem key={b.code} value={b.code}>{b.nom}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>N° compte</Label><Input value={e.bank_account||""} onChange={ev=>u("bank_account",ev.target.value)}/></div>
      <div><Label>IBAN</Label><Input value={e.iban||""} onChange={ev=>u("iban",ev.target.value)}/></div>
      <DialogFooter className="col-span-2">
        <Button variant="outline" onClick={onClose}>Annuler</Button>
        <Button onClick={handleSave} disabled={saving} className="bg-[#0B0F2E] text-white">{saving&&<Loader2 className="w-4 h-4 animate-spin mr-2"/>}Enregistrer</Button>
      </DialogFooter>
    </div>
  )
}

function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n) }

export default function EmployesPage() {
  const router = useRouter()
  const [employes, setEmployes] = useState<any[]>([])
  const [societes, setSocietes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterSociete, setFilterSociete] = useState("all")
  const [filterStatut, setFilterStatut] = useState("presents")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File|null>(null)
  const [importSociete, setImportSociete] = useState("")
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{imported:number,errors:{row:number,message:string}[],total_rows:number}|null>(null)
  const [importError, setImportError] = useState<string|null>(null)

  // Create user access
  const [accessOpen, setAccessOpen] = useState(false)
  const [accessEmp, setAccessEmp] = useState<any>(null)
  const [accessRole, setAccessRole] = useState("employe")
  const [accessPassword, setAccessPassword] = useState("")
  const [accessSaving, setAccessSaving] = useState(false)
  const [accessResult, setAccessResult] = useState<{email:string;password:string}|null>(null)

  const genPwd = () => { const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; let p = ""; for (let i = 0; i < 10; i++) p += c[Math.floor(Math.random() * c.length)]; return p }

  const openAccess = (emp: any) => {
    setAccessEmp(emp)
    setAccessRole(emp.role_rh || emp.role || "employe")
    setAccessPassword(genPwd())
    setAccessResult(null)
    setAccessOpen(true)
  }

  const handleCreateAccess = async () => {
    if (!accessEmp || !accessEmp.email) { alert("L'employé doit avoir un email"); return }
    setAccessSaving(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: accessEmp.email,
          password: accessPassword,
          full_name: `${accessEmp.prenom} ${accessEmp.nom}`,
          role: accessRole,
          societe_id: accessEmp.societe_id,
          phone: accessEmp.telephone || null,
        }),
      })
      const data = await res.json()
      if (data.error) { alert("Erreur: " + data.error) }
      else { setAccessResult({ email: accessEmp.email, password: accessPassword }) }
    } catch { alert("Erreur réseau") }
    setAccessSaving(false)
  }

  const [editOpen, setEditOpen] = useState(false)
  const [editEmp, setEditEmp] = useState<any>(null)

  const openEdit = (emp: any) => {
    setEditEmp({ ...emp })
    setEditOpen(true)
  }

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteEmp, setDeleteEmp] = useState<any>(null)
  const [deleting, setDeleting] = useState<"soft" | "hard" | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const openDelete = (emp: any) => {
    setDeleteEmp(emp)
    setDeleteError(null)
    setDeleting(null)
    setDeleteOpen(true)
  }

  const handleDelete = async (mode: "soft" | "hard") => {
    if (!deleteEmp) return
    setDeleting(mode)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/rh/employes/${deleteEmp.id}?mode=${mode}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de la suppression")
      }
      setDeleteOpen(false)
      setDeleteEmp(null)
      load()
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : "Erreur")
    } finally {
      setDeleting(null)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterSociete !== "all") params.set("societe_id", filterSociete)
      if (filterStatut !== "tous") params.set("statut", filterStatut)
      const [empRes, socRes] = await Promise.all([fetch(`/api/rh/employes?${params}`), fetch("/api/comptable/societes")])
      setEmployes((await empRes.json()).employes || [])
      setSocietes((await socRes.json()).societes || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [filterSociete, filterStatut])

  useEffect(() => { load() }, [load])

  const handleImport = async () => {
    if (!importFile || !importSociete) { setImportError("Fichier et société requis"); return }
    setImporting(true); setImportError(null); setImportResult(null)
    try {
      const fd = new FormData()
      fd.append("file", importFile)
      fd.append("societe_id", importSociete)
      const res = await fetch("/api/rh/employes/import", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setImportResult(data)
      if (data.imported > 0) load()
    } catch (e: unknown) { setImportError(e instanceof Error ? e.message : "Erreur import") }
    finally { setImporting(false) }
  }

  const downloadTemplate = () => {
    const csv = "nom;prenom;email;poste;salaire_base;devise_salaire;date_arrivee;nic;bank_name;bank_account;telephone;role\nDUPONT;Jean;jean@example.com;Comptable;35000;MUR;2024-01-15;A1234567890123;MCB;000012345678;+230 5123 4567;salarie"
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = "modele_employes.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = employes.filter(e => !search || `${e.nom} ${e.prenom} ${e.poste||""} ${e.departement||""}`.toLowerCase().includes(search.toLowerCase()))

  const getInitials = (e: any) => `${(e.prenom||"")[0]||""}${(e.nom||"")[0]||""}`.toUpperCase()
  const getStatusBadge = (e: any) => {
    if (e.date_depart) return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs font-medium">Sorti</Badge>
    if (e.statut === "essai" || e.type_contrat === "CDD") return <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs font-medium">Periode essai</Badge>
    return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs font-medium">Actif</Badge>
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]" style={{ fontFamily: "Poppins, sans-serif" }}>Employes</h1>
          <p className="text-sm text-gray-500">{employes.length} employe(s) {filterStatut === "sortis" ? "sorti(s)" : filterStatut === "tous" ? "au total" : "actif(s)"}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
        <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if(!v){ setImportFile(null); setImportResult(null); setImportError(null) } }}>
          <DialogTrigger asChild><Button variant="outline" className="border-[#0B0F2E] text-[#0B0F2E] rounded-xl h-10"><Upload className="w-4 h-4 mr-2"/>Importer CSV</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5"/>Importer des employés</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              {importError && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{importError}</p>}
              {importResult && (
                <div className="space-y-2">
                  <p className="text-sm text-green-700 bg-green-50 p-2 rounded">{importResult.imported} employé(s) importé(s) sur {importResult.total_rows} ligne(s)</p>
                  {importResult.errors.length > 0 && (
                    <div className="bg-yellow-50 p-2 rounded max-h-32 overflow-y-auto">
                      <p className="text-sm font-medium text-yellow-800 mb-1">Erreurs ({importResult.errors.length}):</p>
                      {importResult.errors.map((err, i) => <p key={i} className="text-xs text-yellow-700">Ligne {err.row}: {err.message}</p>)}
                    </div>
                  )}
                </div>
              )}
              <div>
                <Label>Société *</Label>
                <Select value={importSociete} onValueChange={setImportSociete}>
                  <SelectTrigger><SelectValue placeholder="Choisir la société..."/></SelectTrigger>
                  <SelectContent>{societes.map(s=><SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fichier CSV ou Excel *</Label>
                <Input type="file" accept=".csv,.xlsx,.xls" onChange={e => setImportFile(e.target.files?.[0] || null)} className="mt-1"/>
                <p className="text-xs text-gray-500 mt-1">Colonnes: nom, prenom, email, poste, salaire_base, devise_salaire, date_arrivee, nic, bank_name, bank_account</p>
              </div>
              <Button variant="ghost" size="sm" onClick={downloadTemplate} className="text-[#0B0F2E]"><Download className="w-4 h-4 mr-2"/>Télécharger modèle CSV</Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={()=>setImportOpen(false)}>Fermer</Button>
              <Button onClick={handleImport} disabled={importing || !importFile || !importSociete} className="bg-[#0B0F2E] text-white">{importing&&<Loader2 className="w-4 h-4 animate-spin mr-2"/>}Importer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button className="bg-[#D4AF37] hover:bg-[#c9a432] text-white rounded-xl h-10 shadow-sm font-semibold"><Plus className="w-4 h-4 mr-2"/>Nouvel employe</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" onOpenAutoFocus={e => e.preventDefault()}>
            <DialogHeader><DialogTitle className="text-[#0B0F2E] text-lg font-bold flex items-center gap-2" style={{ fontFamily: "Poppins, sans-serif" }}><UserPlus className="w-5 h-5"/>Nouvel employe</DialogTitle></DialogHeader>
            <CreateEmployeForm societes={societes} onCreated={load} onClose={() => setDialogOpen(false)} />
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Search and filters */}
      <Card className="rounded-2xl shadow-sm"><CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
          <Input className="pl-9 h-11 rounded-xl" placeholder="Rechercher par nom, poste, departement..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div className="flex gap-2">
          <Select value={filterStatut} onValueChange={setFilterStatut}><SelectTrigger className="w-36 h-11 rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="presents">Presents</SelectItem><SelectItem value="sortis">Sortis</SelectItem><SelectItem value="tous">Tous</SelectItem></SelectContent></Select>
          <Select value={filterSociete} onValueChange={setFilterSociete}><SelectTrigger className="w-44 h-11 rounded-xl"><SelectValue placeholder="Toutes societes"/></SelectTrigger><SelectContent><SelectItem value="all">Toutes</SelectItem>{societes.map(s=><SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent></Select>
        </div>
      </CardContent></Card>

      {/* Employee list */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-[#0B0F2E] flex items-center gap-2 text-base" style={{ fontFamily: "Poppins, sans-serif" }}>
            <Users className="w-4 h-4"/>Employes ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#0B0F2E]"/></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-40"/>
              <p>Aucun employe trouve</p>
            </div>
          ) : (
            <>
              {/* Mobile: Card view */}
              <div className="sm:hidden divide-y">
                {filtered.map(e => (
                  <div key={e.id} className="p-4 hover:bg-gray-50/50 active:bg-gray-100 cursor-pointer transition-colors" onClick={() => router.push(`/rh/employes/${e.id}`)}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#0B0F2E] text-white flex items-center justify-center text-sm font-semibold shrink-0">
                        {getInitials(e)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-[#0B0F2E] truncate">{e.prenom} {e.nom}</p>
                          {getStatusBadge(e)}
                        </div>
                        <p className="text-sm text-gray-500 truncate">{e.poste || "—"}{e.departement ? ` · ${e.departement}` : ""}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-gray-400 font-mono">{e.code || "—"}</span>
                          <span className="text-xs text-gray-300">|</span>
                          <span className="text-sm font-medium text-[#0B0F2E]">{fmt(e.salaire_base)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(ev)=>{ev.stopPropagation();openEdit(e)}} title="Modifier"><Pencil className="w-4 h-4 text-[#D4AF37]"/></Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(ev)=>{ev.stopPropagation();openAccess(e)}} title="Creer acces"><Key className="w-4 h-4 text-purple-600"/></Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(ev)=>{ev.stopPropagation();openDelete(e)}} title="Supprimer"><Trash2 className="w-4 h-4 text-red-600"/></Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: Table view */}
              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/60">
                      <TableHead className="pl-5 w-[280px]">Employe</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Poste</TableHead>
                      <TableHead>Departement</TableHead>
                      <TableHead className="text-right">Salaire</TableHead>
                      <TableHead className="text-right pr-5">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(e=>(
                      <TableRow key={e.id} className="hover:bg-gray-50/50 cursor-pointer group transition-colors" onClick={()=>router.push(`/rh/employes/${e.id}`)}>
                        <TableCell className="pl-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#0B0F2E] text-white flex items-center justify-center text-xs font-semibold shrink-0">
                              {getInitials(e)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-[#0B0F2E] text-sm truncate">{e.prenom} {e.nom}</p>
                              <p className="text-xs text-gray-400">{e.email || "—"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(e)}</TableCell>
                        <TableCell className="text-sm text-gray-600">{e.poste||"—"}</TableCell>
                        <TableCell className="text-sm text-gray-500">{e.departement||"—"}</TableCell>
                        <TableCell className="text-right font-medium text-sm">{fmt(e.salaire_base)}</TableCell>
                        <TableCell className="text-right pr-5">
                          <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(ev)=>{ev.stopPropagation();router.push(`/rh/employes/${e.id}`)}} title="Voir fiche"><ExternalLink className="w-4 h-4 text-[#0B0F2E]"/></Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(ev)=>{ev.stopPropagation();openEdit(e)}} title="Modifier"><Pencil className="w-4 h-4 text-[#D4AF37]"/></Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(ev)=>{ev.stopPropagation();openAccess(e)}} title="Creer acces utilisateur"><Key className="w-4 h-4 text-purple-600"/></Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(ev)=>{ev.stopPropagation();openDelete(e)}} title="Supprimer"><Trash2 className="w-4 h-4 text-red-600"/></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog edition employe */}
      <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) setEditEmp(null) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" onOpenAutoFocus={e => e.preventDefault()}>
          <DialogHeader><DialogTitle className="text-[#0B0F2E] text-lg font-bold flex items-center gap-2" style={{ fontFamily: "Poppins, sans-serif" }}><Pencil className="w-5 h-5 text-[#D4AF37]"/>Modifier — {editEmp?.prenom} {editEmp?.nom}</DialogTitle></DialogHeader>
          {editEmp && <EditEmployeForm emp={editEmp} onSaved={load} onClose={() => { setEditOpen(false); setEditEmp(null) }} />}
        </DialogContent>
      </Dialog>

      {/* Dialog création accès utilisateur */}
      <Dialog open={accessOpen} onOpenChange={o => { setAccessOpen(o); if (!o) { setAccessEmp(null); setAccessResult(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#0B0F2E]">
              <Key className="w-5 h-5 text-purple-600" />
              Créer un accès utilisateur
            </DialogTitle>
          </DialogHeader>
          {accessEmp && !accessResult && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium">{accessEmp.prenom} {accessEmp.nom}</p>
                <p className="text-sm text-gray-500">{accessEmp.poste || "—"} • {accessEmp.email || "Pas d'email"}</p>
              </div>
              {!accessEmp.email && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  Cet employé n'a pas d'email. Modifiez sa fiche pour ajouter un email avant de créer un accès.
                </div>
              )}
              <div>
                <Label>Rôle / Fonction</Label>
                <Select value={accessRole} onValueChange={setAccessRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employe">Employé (portail salarié)</SelectItem>
                    <SelectItem value="manager">Manager (supervision équipe)</SelectItem>
                    <SelectItem value="rh">RH (gestion complète)</SelectItem>
                    <SelectItem value="rh_manager">RH Manager</SelectItem>
                    <SelectItem value="comptable">Comptable</SelectItem>
                    <SelectItem value="direction">Direction</SelectItem>
                    <SelectItem value="client_admin">Administrateur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Mot de passe généré</Label>
                <div className="flex gap-2">
                  <Input value={accessPassword} readOnly className="font-mono bg-gray-50" />
                  <Button variant="outline" size="sm" onClick={() => setAccessPassword(genPwd())}>Régénérer</Button>
                </div>
                <p className="text-xs text-orange-600 mt-1">Notez ce mot de passe avant de confirmer</p>
              </div>
              <Button onClick={handleCreateAccess} disabled={accessSaving || !accessEmp.email}
                className="w-full bg-[#0B0F2E] text-white">
                {accessSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                Créer le compte
              </Button>
            </div>
          )}
          {accessResult && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="font-semibold text-green-800 mb-2">Compte créé avec succès</p>
                <div className="space-y-1">
                  <p className="text-sm">Email : <span className="font-mono font-bold">{accessResult.email}</span></p>
                  <p className="text-sm">Mot de passe : <span className="font-mono font-bold text-lg">{accessResult.password}</span></p>
                  <p className="text-sm">Rôle : <span className="font-semibold">{accessRole}</span></p>
                </div>
              </div>
              <p className="text-xs text-gray-500">Communiquez ces identifiants à l'employé de manière sécurisée.</p>
              <Button variant="outline" className="w-full" onClick={() => { setAccessOpen(false); setAccessResult(null) }}>Fermer</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog suppression employe */}
      <Dialog open={deleteOpen} onOpenChange={o => { setDeleteOpen(o); if (!o) { setDeleteEmp(null); setDeleteError(null); setDeleting(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#0B0F2E]">
              <Trash2 className="w-5 h-5 text-red-600" />
              Supprimer l'employe
            </DialogTitle>
          </DialogHeader>
          {deleteEmp && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium">{deleteEmp.prenom} {deleteEmp.nom}</p>
                <p className="text-sm text-gray-500">{deleteEmp.poste || "—"}{deleteEmp.email ? ` • ${deleteEmp.email}` : ""}</p>
              </div>

              {deleteError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2 text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{deleteError}</span>
                </div>
              )}

              <p className="text-sm text-gray-600">Choisissez le type de suppression :</p>

              <div className="space-y-2">
                <Button
                  onClick={() => handleDelete("soft")}
                  disabled={deleting !== null}
                  className="w-full justify-start h-auto py-3 bg-orange-50 hover:bg-orange-100 text-orange-900 border border-orange-200"
                  variant="outline"
                >
                  {deleting === "soft" ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2 shrink-0" />
                  ) : (
                    <UserPlus className="w-4 h-4 mr-2 shrink-0 rotate-180" />
                  )}
                  <div className="text-left">
                    <div className="font-semibold">Marquer comme sorti</div>
                    <div className="text-xs text-orange-700 font-normal">Conserve l'historique et les bulletins</div>
                  </div>
                </Button>

                <Button
                  onClick={() => handleDelete("hard")}
                  disabled={deleting !== null}
                  className="w-full justify-start h-auto py-3 bg-red-50 hover:bg-red-100 text-red-900 border border-red-200"
                  variant="outline"
                >
                  {deleting === "hard" ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2 shrink-0" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2 shrink-0" />
                  )}
                  <div className="text-left">
                    <div className="font-semibold">Supprimer definitivement</div>
                    <div className="text-xs text-red-700 font-normal">Impossible si des bulletins existent</div>
                  </div>
                </Button>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting !== null}>Annuler</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
