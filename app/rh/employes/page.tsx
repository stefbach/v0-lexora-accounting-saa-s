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
import { Search, Plus, Loader2, Users } from "lucide-react"

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
  const [form, setForm] = useState({ societe_id:"",nom:"",prenom:"",poste:"",email:"",telephone:"",salaire_base:"",transport_allowance:"0",petrol_allowance:"0",date_arrivee:"",role:"salarie",csg_categorie:"A",bank_account:"",bank_name:"" })

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

  const filtered = employes.filter(e => !search || `${e.nom} ${e.prenom} ${e.poste||""}`.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-[#1E2A4A]">Employés</h1><p className="text-sm text-gray-500">{employes.length} employé(s) actif(s)</p></div>
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
              <div><Label>Banque</Label><Input value={form.bank_name} onChange={e=>setForm(f=>({...f,bank_name:e.target.value}))} placeholder="MCB"/></div>
              <div><Label>N° compte bancaire</Label><Input value={form.bank_account} onChange={e=>setForm(f=>({...f,bank_account:e.target.value}))}/></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={()=>setDialogOpen(false)}>Annuler</Button>
              <Button onClick={handleCreate} disabled={saving} className="bg-[#1E2A4A] text-white">{saving&&<Loader2 className="w-4 h-4 animate-spin mr-2"/>}Créer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
              <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Nom</TableHead><TableHead>Poste</TableHead><TableHead>Rôle</TableHead><TableHead className="text-right">Salaire base</TableHead><TableHead>Banque</TableHead></TableRow></TableHeader>
              <TableBody>
                {filtered.map(e=>(
                  <TableRow key={e.id} className="cursor-pointer hover:bg-gray-50">
                    <TableCell className="font-mono text-xs">{e.code||"—"}</TableCell>
                    <TableCell className="font-medium">{e.prenom} {e.nom}</TableCell>
                    <TableCell className="text-sm text-gray-600">{e.poste||"—"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{e.role}</Badge></TableCell>
                    <TableCell className="text-right">{fmt(e.salaire_base)}</TableCell>
                    <TableCell className="text-sm text-gray-500">{e.bank_name||"—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
