"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Search, Plus, Loader2, Users, Upload, Download, FileSpreadsheet, Pencil } from "lucide-react"
import { BANQUES_MAURITIUS } from "@/lib/rh/banques-mauritius"

function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n) }

export default function EmployesPage() {
  const [employes, setEmployes] = useState<any[]>([])
  const [societes, setSocietes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterSociete, setFilterSociete] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [form, setForm] = useState({ societe_id:"",nom:"",prenom:"",poste:"",email:"",telephone:"",salaire_base:"",transport_allowance:"0",petrol_allowance:"0",date_arrivee:"",role:"salarie",csg_categorie:"A",bank_account:"",bank_name:"",nic:"",tan:"",iban:"" })
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File|null>(null)
  const [importSociete, setImportSociete] = useState("")
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{imported:number,errors:{row:number,message:string}[],total_rows:number}|null>(null)
  const [importError, setImportError] = useState<string|null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editEmp, setEditEmp] = useState<any>(null)
  const [editSaving, setEditSaving] = useState(false)

  const openEdit = (emp: any) => {
    setEditEmp({ ...emp })
    setEditOpen(true)
  }

  const handleEdit = async () => {
    if (!editEmp) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/rh/employes/${editEmp.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: editEmp.nom, prenom: editEmp.prenom, poste: editEmp.poste,
          email: editEmp.email, telephone: editEmp.telephone,
          salaire_base: parseFloat(editEmp.salaire_base) || 0,
          transport_allowance: parseFloat(editEmp.transport_allowance) || 0,
          petrol_allowance: parseFloat(editEmp.petrol_allowance) || 0,
          date_arrivee: editEmp.date_arrivee, date_depart: editEmp.date_depart || null,
          role: editEmp.role, csg_categorie: editEmp.csg_categorie,
          bank_account: editEmp.bank_account, bank_name: editEmp.bank_name,
          nic_number: editEmp.nic_number, tan_number: editEmp.tan_number,
          iban: editEmp.iban, devise_salaire: editEmp.devise_salaire,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setEditOpen(false); setEditEmp(null); load()
    } catch (e: any) { alert(e.message || "Erreur") }
    finally { setEditSaving(false) }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterSociete !== "all") params.set("societe_id", filterSociete)
      if (search) params.set("search", search)
      const [empRes, socRes] = await Promise.all([fetch(`/api/rh/employes?${params}`), fetch("/api/comptable/societes")])
      setEmployes((await empRes.json()).employes || [])
      setSocietes((await socRes.json()).societes || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [filterSociete, search])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!form.societe_id || !form.nom || !form.prenom || !form.salaire_base || !form.date_arrivee) { setError("Champs requis manquants"); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch("/api/rh/employes", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ ...form, salaire_base: parseFloat(form.salaire_base), transport_allowance: parseFloat(form.transport_allowance)||0, petrol_allowance: parseFloat(form.petrol_allowance)||0 }) })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setDialogOpen(false); load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur") }
    finally { setSaving(false) }
  }

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
        <div><h1 className="text-2xl font-bold text-[#1E2A4A]">Employés</h1><p className="text-sm text-gray-500">{employes.length} employé(s) actif(s)</p></div>
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
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Nouvel employé</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-2 max-h-[60vh] overflow-y-auto pr-2">
              {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
              <div><Label>Société *</Label><Select value={form.societe_id} onValueChange={v=>setForm(f=>({...f,societe_id:v}))}><SelectTrigger><SelectValue placeholder="Choisir..."/></SelectTrigger><SelectContent>{societes.map(s=><SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Rôle</Label><Select value={form.role} onValueChange={v=>setForm(f=>({...f,role:v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["salarie","manager","rh","admin","direction"].map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Nom *</Label><Input value={form.nom} onChange={e=>setForm(f=>({...f,nom:e.target.value}))} placeholder="BACH"/></div>
              <div><Label>Prénom *</Label><Input value={form.prenom} onChange={e=>setForm(f=>({...f,prenom:e.target.value}))} placeholder="Stéphane"/></div>
              <div><Label>Poste</Label><Input value={form.poste} onChange={e=>setForm(f=>({...f,poste:e.target.value}))} placeholder="Médecin directeur"/></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
              <div><Label>Téléphone</Label><Input value={form.telephone} onChange={e=>setForm(f=>({...f,telephone:e.target.value}))}/></div>
              <div><Label>Date d'arrivée *</Label><Input type="date" value={form.date_arrivee} onChange={e=>setForm(f=>({...f,date_arrivee:e.target.value}))}/></div>
              <div><Label>Salaire de base MUR *</Label><Input type="number" value={form.salaire_base} onChange={e=>setForm(f=>({...f,salaire_base:e.target.value}))}/></div>
              <div><Label>Transport allowance</Label><Input type="number" value={form.transport_allowance} onChange={e=>setForm(f=>({...f,transport_allowance:e.target.value}))}/></div>
              <div><Label>Petrol allowance</Label><Input type="number" value={form.petrol_allowance} onChange={e=>setForm(f=>({...f,petrol_allowance:e.target.value}))}/></div>
              <div><Label>NIC (National ID Card)</Label><Input value={form.nic} onChange={e=>setForm(f=>({...f,nic:e.target.value}))} placeholder="Ex: A1234567890123"/></div>
              <div><Label>TAN (Tax Account Number)</Label><Input value={form.tan} onChange={e=>setForm(f=>({...f,tan:e.target.value}))} placeholder="A123456789"/></div>
              <div><Label>Banque</Label><Select value={form.bank_name} onValueChange={v=>setForm(f=>({...f,bank_name:v}))}><SelectTrigger><SelectValue placeholder="Choisir banque..."/></SelectTrigger><SelectContent>{BANQUES_MAURITIUS.map(b=><SelectItem key={b.code} value={b.code}>{b.nom}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>N° compte bancaire</Label><Input value={form.bank_account} onChange={e=>setForm(f=>({...f,bank_account:e.target.value}))} placeholder="Ex: 000012345678"/></div>
              <div><Label>IBAN (optionnel)</Label><Input value={form.iban} onChange={e=>setForm(f=>({...f,iban:e.target.value}))} placeholder="MU17BOMM0101101030300200000MUR"/></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={()=>setDialogOpen(false)}>Annuler</Button>
              <Button onClick={handleCreate} disabled={saving} className="bg-[#1E2A4A] text-white">{saving&&<Loader2 className="w-4 h-4 animate-spin mr-2"/>}Créer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card><CardContent className="p-4 flex gap-3">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/><Input className="pl-9" placeholder="Rechercher..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <Select value={filterSociete} onValueChange={setFilterSociete}><SelectTrigger className="w-48"><SelectValue placeholder="Toutes sociétés"/></SelectTrigger><SelectContent><SelectItem value="all">Toutes</SelectItem>{societes.map(s=><SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent></Select>
      </CardContent></Card>

      <Card>
        <CardHeader><CardTitle className="text-[#1E2A4A] flex items-center gap-2"><Users className="w-4 h-4"/>Employés ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#1E2A4A]"/></div> : filtered.length===0 ? <div className="text-center py-12 text-gray-500">Aucun employé</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Nom</TableHead><TableHead>Poste</TableHead><TableHead>Email</TableHead><TableHead className="text-right">Salaire base</TableHead><TableHead>Banque</TableHead><TableHead>NIC</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {filtered.map(e=>(
                  <TableRow key={e.id} className="hover:bg-gray-50">
                    <TableCell className="font-mono text-xs">{e.code||"—"}</TableCell>
                    <TableCell className="font-medium">{e.prenom} {e.nom}</TableCell>
                    <TableCell className="text-sm text-gray-600">{e.poste||"—"}</TableCell>
                    <TableCell className="text-sm text-gray-500">{e.email||"—"}</TableCell>
                    <TableCell className="text-right">{fmt(e.salaire_base)}</TableCell>
                    <TableCell className="text-sm text-gray-500">{e.bank_name||"—"}</TableCell>
                    <TableCell className="text-xs text-gray-500">{e.nic_number||"—"}</TableCell>
                    <TableCell><Button variant="ghost" size="sm" onClick={()=>openEdit(e)}><Pencil className="w-4 h-4 text-[#C9A84C]"/></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog édition employé */}
      <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) setEditEmp(null) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Modifier l{"'"}employé — {editEmp?.prenom} {editEmp?.nom}</DialogTitle></DialogHeader>
          {editEmp && (
            <div className="grid grid-cols-2 gap-3 py-2">
              <div><Label>Nom *</Label><Input value={editEmp.nom||""} onChange={e=>setEditEmp({...editEmp,nom:e.target.value})}/></div>
              <div><Label>Prénom *</Label><Input value={editEmp.prenom||""} onChange={e=>setEditEmp({...editEmp,prenom:e.target.value})}/></div>
              <div><Label>Poste</Label><Input value={editEmp.poste||""} onChange={e=>setEditEmp({...editEmp,poste:e.target.value})}/></div>
              <div><Label>Email</Label><Input type="email" value={editEmp.email||""} onChange={e=>setEditEmp({...editEmp,email:e.target.value})}/></div>
              <div><Label>Téléphone</Label><Input value={editEmp.telephone||""} onChange={e=>setEditEmp({...editEmp,telephone:e.target.value})}/></div>
              <div><Label>Rôle</Label><Select value={editEmp.role||"salarie"} onValueChange={v=>setEditEmp({...editEmp,role:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["salarie","manager","rh","admin","direction"].map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Salaire de base *</Label><Input type="number" value={editEmp.salaire_base||""} onChange={e=>setEditEmp({...editEmp,salaire_base:e.target.value})}/></div>
              <div><Label>Devise</Label><Select value={editEmp.devise_salaire||"MUR"} onValueChange={v=>setEditEmp({...editEmp,devise_salaire:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["MUR","EUR","USD","GBP"].map(d=><SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Transport Allowance</Label><Input type="number" value={editEmp.transport_allowance||""} onChange={e=>setEditEmp({...editEmp,transport_allowance:e.target.value})}/></div>
              <div><Label>Petrol Allowance</Label><Input type="number" value={editEmp.petrol_allowance||""} onChange={e=>setEditEmp({...editEmp,petrol_allowance:e.target.value})}/></div>
              <div><Label>Date arrivée</Label><Input type="date" value={editEmp.date_arrivee?.split("T")[0]||""} onChange={e=>setEditEmp({...editEmp,date_arrivee:e.target.value})}/></div>
              <div><Label>Date départ</Label><Input type="date" value={editEmp.date_depart?.split("T")[0]||""} onChange={e=>setEditEmp({...editEmp,date_depart:e.target.value})}/></div>
              <div><Label>NIC</Label><Input value={editEmp.nic_number||""} onChange={e=>setEditEmp({...editEmp,nic_number:e.target.value})} placeholder="A1234567890123"/></div>
              <div><Label>TAN</Label><Input value={editEmp.tan_number||""} onChange={e=>setEditEmp({...editEmp,tan_number:e.target.value})} placeholder="A123456789"/></div>
              <div><Label>Catégorie CSG</Label><Select value={editEmp.csg_categorie||"A"} onValueChange={v=>setEditEmp({...editEmp,csg_categorie:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="A">A</SelectItem><SelectItem value="B">B</SelectItem></SelectContent></Select></div>
              <div><Label>Banque</Label><Select value={editEmp.bank_name||""} onValueChange={v=>setEditEmp({...editEmp,bank_name:v})}><SelectTrigger><SelectValue placeholder="Choisir..."/></SelectTrigger><SelectContent>{BANQUES_MAURITIUS.map(b=><SelectItem key={b.code} value={b.code}>{b.nom}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>N° compte bancaire</Label><Input value={editEmp.bank_account||""} onChange={e=>setEditEmp({...editEmp,bank_account:e.target.value})}/></div>
              <div><Label>IBAN</Label><Input value={editEmp.iban||""} onChange={e=>setEditEmp({...editEmp,iban:e.target.value})}/></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={()=>setEditOpen(false)}>Annuler</Button>
            <Button onClick={handleEdit} disabled={editSaving} className="bg-[#1E2A4A] text-white">{editSaving&&<Loader2 className="w-4 h-4 animate-spin mr-2"/>}Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
