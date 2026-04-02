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
import { Search, Plus, Loader2, Users, Upload, Download, FileSpreadsheet, Pencil, ExternalLink, UserPlus, Key } from "lucide-react"
import { BANQUES_MAURITIUS } from "@/lib/rh/banques-mauritius"

// ── Composant formulaire création (state isolé = pas de re-render parent) ──
function CreateEmployeForm({ societes, onCreated, onClose }: { societes: any[]; onCreated: () => void; onClose: () => void }) {
  const [form, setForm] = useState({ societe_id:"",nom:"",prenom:"",poste:"",email:"",telephone:"",salaire_base:"",transport_allowance:"0",petrol_allowance:"0",date_arrivee:"",role:"salarie",csg_categorie:"A",bank_account:"",bank_name:"",nic:"",tan:"",iban:"" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const u = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleCreate = async () => {
    if (!form.societe_id || !form.nom || !form.prenom || !form.salaire_base || !form.date_arrivee) { setError("Champs requis manquants"); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch("/api/rh/employes", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ ...form, salaire_base: parseFloat(form.salaire_base), transport_allowance: parseFloat(form.transport_allowance)||0, petrol_allowance: parseFloat(form.petrol_allowance)||0 }) })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      onClose(); onCreated()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur") }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-3 py-2">
      {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Société *</Label><Select value={form.societe_id} onValueChange={v=>u("societe_id",v)}><SelectTrigger><SelectValue placeholder="Choisir..."/></SelectTrigger><SelectContent>{societes.map(s=><SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Rôle</Label><Select value={form.role} onValueChange={v=>u("role",v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["salarie","manager","rh","admin","direction"].map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Nom *</Label><Input value={form.nom} onChange={e=>u("nom",e.target.value)} placeholder="DUPONT"/></div>
        <div><Label>Prénom *</Label><Input value={form.prenom} onChange={e=>u("prenom",e.target.value)} placeholder="Jean"/></div>
        <div><Label>Poste</Label><Input value={form.poste} onChange={e=>u("poste",e.target.value)} placeholder="Comptable"/></div>
        <div><Label>Email</Label><Input type="email" value={form.email} onChange={e=>u("email",e.target.value)} placeholder="jean@example.com"/></div>
        <div><Label>Téléphone</Label><Input value={form.telephone} onChange={e=>u("telephone",e.target.value)} placeholder="+230 5123 4567"/></div>
        <div><Label>Salaire base *</Label><Input type="number" value={form.salaire_base} onChange={e=>u("salaire_base",e.target.value)} placeholder="35000"/></div>
        <div><Label>Transport</Label><Input type="number" value={form.transport_allowance} onChange={e=>u("transport_allowance",e.target.value)}/></div>
        <div><Label>Petrol</Label><Input type="number" value={form.petrol_allowance} onChange={e=>u("petrol_allowance",e.target.value)}/></div>
        <div><Label>Date arrivée *</Label><Input type="date" value={form.date_arrivee} onChange={e=>u("date_arrivee",e.target.value)}/></div>
        <div><Label>Catégorie CSG</Label><Select value={form.csg_categorie} onValueChange={v=>u("csg_categorie",v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="A">A</SelectItem><SelectItem value="B">B</SelectItem></SelectContent></Select></div>
        <div><Label>NIC</Label><Input value={form.nic} onChange={e=>u("nic",e.target.value)} placeholder="A1234567890123"/></div>
        <div><Label>TAN</Label><Input value={form.tan} onChange={e=>u("tan",e.target.value)} placeholder="A123456789"/></div>
        <div><Label>Banque</Label><Select value={form.bank_name} onValueChange={v=>u("bank_name",v)}><SelectTrigger><SelectValue placeholder="Choisir..."/></SelectTrigger><SelectContent>{BANQUES_MAURITIUS.map(b=><SelectItem key={b.code} value={b.code}>{b.nom}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>N° compte</Label><Input value={form.bank_account} onChange={e=>u("bank_account",e.target.value)} placeholder="000012345678"/></div>
        <div><Label>IBAN</Label><Input value={form.iban} onChange={e=>u("iban",e.target.value)} placeholder="MU17BOMM..."/></div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Annuler</Button>
        <Button onClick={handleCreate} disabled={saving} className="bg-[#1E2A4A] text-white">{saving&&<Loader2 className="w-4 h-4 animate-spin mr-2"/>}Créer</Button>
      </DialogFooter>
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
        <Button onClick={handleSave} disabled={saving} className="bg-[#1E2A4A] text-white">{saving&&<Loader2 className="w-4 h-4 animate-spin mr-2"/>}Enregistrer</Button>
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

  const filtered = employes.filter(e => !search || `${e.nom} ${e.prenom} ${e.poste||""}`.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-[#1E2A4A]">Employés</h1><p className="text-sm text-gray-500">{employes.length} employé(s) {filterStatut === "sortis" ? "sorti(s)" : filterStatut === "tous" ? "au total" : "actif(s)"}</p></div>
        <div className="flex gap-2">
        <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if(!v){ setImportFile(null); setImportResult(null); setImportError(null) } }}>
          <DialogTrigger asChild><Button variant="outline" className="border-[#1E2A4A] text-[#1E2A4A]"><Upload className="w-4 h-4 mr-2"/>Importer CSV</Button></DialogTrigger>
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
              <Button variant="ghost" size="sm" onClick={downloadTemplate} className="text-[#1E2A4A]"><Download className="w-4 h-4 mr-2"/>Télécharger modèle CSV</Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={()=>setImportOpen(false)}>Fermer</Button>
              <Button onClick={handleImport} disabled={importing || !importFile || !importSociete} className="bg-[#1E2A4A] text-white">{importing&&<Loader2 className="w-4 h-4 animate-spin mr-2"/>}Importer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button className="bg-[#1E2A4A] text-white"><Plus className="w-4 h-4 mr-2"/>Nouvel employé</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" onOpenAutoFocus={e => e.preventDefault()}>
            <DialogHeader><DialogTitle>Nouvel employé</DialogTitle></DialogHeader>
            <CreateEmployeForm societes={societes} onCreated={load} onClose={() => setDialogOpen(false)} />
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card><CardContent className="p-4 flex gap-3">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/><Input className="pl-9" placeholder="Rechercher..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <Select value={filterStatut} onValueChange={setFilterStatut}><SelectTrigger className="w-40"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="presents">Présents</SelectItem><SelectItem value="sortis">Sortis</SelectItem><SelectItem value="tous">Tous</SelectItem></SelectContent></Select>
        <Select value={filterSociete} onValueChange={setFilterSociete}><SelectTrigger className="w-48"><SelectValue placeholder="Toutes sociétés"/></SelectTrigger><SelectContent><SelectItem value="all">Toutes</SelectItem>{societes.map(s=><SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent></Select>
      </CardContent></Card>

      <Card>
        <CardHeader><CardTitle className="text-[#1E2A4A] flex items-center gap-2"><Users className="w-4 h-4"/>Employés ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#1E2A4A]"/></div> : filtered.length===0 ? <div className="text-center py-12 text-gray-500">Aucun employé</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Nom</TableHead><TableHead>Statut</TableHead><TableHead>Poste</TableHead><TableHead>Email</TableHead><TableHead className="text-right">Salaire base</TableHead><TableHead>Banque</TableHead><TableHead>NIC</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {filtered.map(e=>(
                  <TableRow key={e.id} className="hover:bg-gray-50 cursor-pointer" onClick={()=>router.push(`/rh/employes/${e.id}`)}>
                    <TableCell className="font-mono text-xs">{e.code||"—"}</TableCell>
                    <TableCell className="font-medium">{e.prenom} {e.nom}</TableCell>
                    <TableCell>{e.date_depart ? <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">Sorti le {new Date(e.date_depart.split("T")[0] + "T00:00:00").toLocaleDateString("fr-FR", {day:"2-digit",month:"2-digit",year:"numeric"})}</Badge> : <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Actif</Badge>}</TableCell>
                    <TableCell className="text-sm text-gray-600">{e.poste||"—"}</TableCell>
                    <TableCell className="text-sm text-gray-500">{e.email||"—"}</TableCell>
                    <TableCell className="text-right">{fmt(e.salaire_base)}</TableCell>
                    <TableCell className="text-sm text-gray-500">{e.bank_name||"—"}</TableCell>
                    <TableCell className="text-xs text-gray-500">{e.nic_number||"—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={(ev)=>{ev.stopPropagation();router.push(`/rh/employes/${e.id}`)}} title="Voir fiche"><ExternalLink className="w-4 h-4 text-[#1E2A4A]"/></Button>
                        <Button variant="ghost" size="sm" onClick={(ev)=>{ev.stopPropagation();openEdit(e)}} title="Modifier"><Pencil className="w-4 h-4 text-[#C9A84C]"/></Button>
                        <Button variant="ghost" size="sm" onClick={(ev)=>{ev.stopPropagation();openAccess(e)}} title="Créer accès utilisateur"><Key className="w-4 h-4 text-purple-600"/></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog édition employé */}
      <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) setEditEmp(null) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" onOpenAutoFocus={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>Modifier — {editEmp?.prenom} {editEmp?.nom}</DialogTitle></DialogHeader>
          {editEmp && <EditEmployeForm emp={editEmp} onSaved={load} onClose={() => { setEditOpen(false); setEditEmp(null) }} />}
        </DialogContent>
      </Dialog>

      {/* Dialog création accès utilisateur */}
      <Dialog open={accessOpen} onOpenChange={o => { setAccessOpen(o); if (!o) { setAccessEmp(null); setAccessResult(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#1E2A4A]">
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
                className="w-full bg-[#1E2A4A] text-white">
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
    </div>
  )
}
