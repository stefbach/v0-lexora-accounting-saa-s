"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Plus, CheckCircle, XCircle, Calendar } from "lucide-react"

const TYPE_LABELS: Record<string,string> = { AL:"Congé annuel",SL:"Congé maladie",UL:"Congé urgent",MAT:"Maternité",PAT:"Paternité",CAR:"Soins famille",ABS:"Absence" }
const STATUT_COLORS: Record<string,string> = { en_attente:"bg-yellow-100 text-yellow-800", approuve:"bg-green-100 text-green-800", refuse:"bg-red-100 text-red-800", annule:"bg-gray-100 text-gray-600" }

export default function CongesPage() {
  const [conges, setConges] = useState<any[]>([])
  const [employes, setEmployes] = useState<any[]>([])
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [filterStatut, setFilterStatut] = useState("all")
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ employe_id:"",type_conge:"AL",date_debut:"",date_fin:"",motif:"" })
  const [error, setError] = useState<string|null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (societe !== "all") params.set("societe_id", societe)
      if (filterStatut !== "all") params.set("statut", filterStatut)
      const [congesRes, socRes] = await Promise.all([fetch(`/api/rh/conges?${params}`), fetch("/api/comptable/societes")])
      setConges((await congesRes.json()).conges||[])
      setSocietes((await socRes.json()).societes||[])
    } catch(e){console.error(e)} finally{setLoading(false)}
  }, [societe, filterStatut])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (societe !== "all") fetch(`/api/rh/employes?societe_id=${societe}`).then(r=>r.json()).then(d=>setEmployes(d.employes||[]))
  }, [societe])

  const handleCreate = async () => {
    if (!form.employe_id||!form.date_debut||!form.date_fin) { setError("Champs requis manquants"); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch("/api/rh/conges", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(form) })
      if (!res.ok) { const d=await res.json(); throw new Error(d.error) }
      setDialogOpen(false); load()
    } catch(e:unknown) { setError(e instanceof Error ? e.message:"Erreur") }
    finally { setSaving(false) }
  }

  const updateStatut = async (id: string, action: string) => {
    await fetch(`/api/rh/conges/${id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ action }) })
    load()
  }

  const enAttente = conges.filter(c=>c.statut==="en_attente").length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-[#1E2A4A]">Congés</h1><p className="text-sm text-gray-500">{enAttente} demande(s) en attente</p></div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button className="bg-[#1E2A4A] text-white"><Plus className="w-4 h-4 mr-2"/>Nouvelle demande</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Demande de congé</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div><Label>Employé *</Label><Select value={form.employe_id} onValueChange={v=>setForm(f=>({...f,employe_id:v}))}><SelectTrigger><SelectValue placeholder="Choisir..."/></SelectTrigger><SelectContent>{employes.map(e=><SelectItem key={e.id} value={e.id}>{e.prenom} {e.nom}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Type *</Label><Select value={form.type_conge} onValueChange={v=>setForm(f=>({...f,type_conge:v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{Object.entries(TYPE_LABELS).map(([k,v])=><SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Début *</Label><Input type="date" value={form.date_debut} onChange={e=>setForm(f=>({...f,date_debut:e.target.value}))}/></div>
                <div><Label>Fin *</Label><Input type="date" value={form.date_fin} onChange={e=>setForm(f=>({...f,date_fin:e.target.value}))}/></div>
              </div>
              <div><Label>Motif</Label><Input value={form.motif} onChange={e=>setForm(f=>({...f,motif:e.target.value}))}/></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={()=>setDialogOpen(false)}>Annuler</Button><Button onClick={handleCreate} disabled={saving} className="bg-[#1E2A4A] text-white">{saving&&<Loader2 className="w-4 h-4 animate-spin mr-2"/>}Soumettre</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card><CardContent className="p-4 flex gap-3">
        <Select value={societe} onValueChange={setSociete}><SelectTrigger className="w-48"><SelectValue placeholder="Toutes sociétés"/></SelectTrigger><SelectContent><SelectItem value="all">Toutes</SelectItem>{societes.map(s=><SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent></Select>
        <Select value={filterStatut} onValueChange={setFilterStatut}><SelectTrigger className="w-40"><SelectValue placeholder="Tous statuts"/></SelectTrigger><SelectContent><SelectItem value="all">Tous</SelectItem><SelectItem value="en_attente">En attente</SelectItem><SelectItem value="approuve">Approuvé</SelectItem><SelectItem value="refuse">Refusé</SelectItem></SelectContent></Select>
      </CardContent></Card>

      <Card>
        <CardHeader><CardTitle className="text-[#1E2A4A] flex items-center gap-2"><Calendar className="w-4 h-4"/>Demandes ({conges.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin"/></div> : conges.length===0 ? <div className="text-center py-12 text-gray-500">Aucune demande</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Employé</TableHead><TableHead>Type</TableHead><TableHead>Dates</TableHead><TableHead>Jours</TableHead><TableHead>Statut</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {conges.map(c=>(
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.employe?.prenom} {c.employe?.nom}</TableCell>
                    <TableCell className="text-sm">{TYPE_LABELS[c.type_conge]||c.type_conge}</TableCell>
                    <TableCell className="text-sm">{new Date(c.date_debut).toLocaleDateString("fr-FR")} → {new Date(c.date_fin).toLocaleDateString("fr-FR")}</TableCell>
                    <TableCell><span className="font-semibold">{c.nb_jours}j</span></TableCell>
                    <TableCell><span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUT_COLORS[c.statut]||""}`}>{c.statut.replace("_"," ")}</span></TableCell>
                    <TableCell>
                      {c.statut==="en_attente" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="text-green-600 hover:text-green-700 h-7" onClick={()=>updateStatut(c.id,"approuver")}><CheckCircle className="w-4 h-4"/></Button>
                          <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 h-7" onClick={()=>updateStatut(c.id,"refuser")}><XCircle className="w-4 h-4"/></Button>
                        </div>
                      )}
                    </TableCell>
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
