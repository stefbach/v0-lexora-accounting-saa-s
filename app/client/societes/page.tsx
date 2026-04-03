"use client"
import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Building2, Plus, FileText, Users, BookOpen, Edit } from "lucide-react"

interface Societe {
  id: string; nom: string; brn: string; ern: string
  numero_tva_mra: string; secteur_activite: string
  adresse: string; telephone: string; email: string; statut_tva: boolean
}

const SECTEURS = ['Technologies de l\'information','Santé','Commerce','Finance','Immobilier','Tourisme','Transport','Agriculture','Éducation','Autre']

const EMPTY = { nom:'', brn:'', ern:'', numero_tva_mra:'', secteur_activite:'', adresse:'', telephone:'', email:'', statut_tva: false }

export default function SocietesPage() {
  const [societes, setSocietes] = useState<Societe[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState<string|null>(null)

  const load = async () => {
    setLoading(true)
    const d = await fetch('/api/client/societes').then(r=>r.json())
    setSocietes(d.societes || [])
    setLoading(false)
  }
  useEffect(()=>{ load() },[])

  const save = async () => {
    if (!form.nom) return
    setSaving(true)
    const method = editId ? 'PATCH' : 'POST'
    const url = editId ? `/api/client/societes?id=${editId}` : '/api/client/societes'
    let d: any
    try {
      const res = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) })
      d = await res.json()
    } catch (e) {
      setSaving(false)
      alert('Erreur réseau : ' + (e instanceof Error ? e.message : String(e)))
      return
    }
    setSaving(false)
    if (d.error) { alert('Erreur : ' + d.error); return }
    setOpen(false); setForm(EMPTY); setEditId(null); load()
  }

  const openEdit = (s: Societe) => {
    setForm({ nom:s.nom, brn:s.brn||'', ern:s.ern||'', numero_tva_mra:s.numero_tva_mra||'', secteur_activite:s.secteur_activite||'', adresse:s.adresse||'', telephone:s.telephone||'', email:s.email||'', statut_tva:s.statut_tva||false })
    setEditId(s.id); setOpen(true)
  }

  const F = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f=>({...f,[k]:e.target.value}))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]">Mes Sociétés</h1>
          <p className="text-sm text-gray-500">{societes.length} société{societes.length!==1?'s':''}</p>
        </div>
        <Dialog open={open} onOpenChange={o=>{ setOpen(o); if(!o){setForm(EMPTY);setEditId(null)} }}>
          <DialogTrigger asChild>
            <Button className="bg-[#0B0F2E]"><Plus className="w-4 h-4 mr-2"/>Nouvelle société</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editId?'Modifier':'Créer'} une société</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div><Label>Nom de la société <span className="text-red-500">*</span></Label><Input value={form.nom} onChange={F('nom')} placeholder="Digital Data Solutions Ltd"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>BRN</Label><Input value={form.brn} onChange={F('brn')} placeholder="C20173522"/></div>
                <div><Label>ERN (MRA)</Label><Input value={form.ern} onChange={F('ern')} placeholder="ERN-xxx"/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>N° TVA MRA</Label><Input value={form.numero_tva_mra} onChange={F('numero_tva_mra')} placeholder="27816949"/></div>
                <div>
                  <Label>TVA assujetti</Label>
                  <Select value={form.statut_tva?'oui':'non'} onValueChange={v=>setForm(f=>({...f,statut_tva:v==='oui'}))}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent><SelectItem value="oui">Oui</SelectItem><SelectItem value="non">Non</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Secteur d'activité</Label>
                <Select value={form.secteur_activite} onValueChange={v=>setForm(f=>({...f,secteur_activite:v}))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner"/></SelectTrigger>
                  <SelectContent>{SECTEURS.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Adresse</Label><Input value={form.adresse} onChange={F('adresse')} placeholder="Port Louis, Maurice"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Téléphone</Label><Input value={form.telephone} onChange={F('telephone')} placeholder="+230 xxx xxxx"/></div>
                <div><Label>Email</Label><Input value={form.email} onChange={F('email')} placeholder="contact@société.mu"/></div>
              </div>
              <Button onClick={save} disabled={saving||!form.nom} className="w-full bg-[#0B0F2E]">
                {saving?'Enregistrement...':editId?'Modifier':'Créer la société'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Chargement...</div>
      ) : societes.length === 0 ? (
        <Card className="border-2 border-dashed border-[#D4AF37]/40 bg-[#D4AF37]/5">
          <CardContent className="p-10 text-center space-y-4">
            <Building2 className="w-12 h-12 mx-auto text-[#D4AF37]"/>
            <div>
              <p className="text-lg font-bold text-[#0B0F2E]">Aucune société</p>
              <p className="text-sm text-gray-500 mt-1">Créez votre première société pour commencer.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {societes.map(s=>(
            <Card key={s.id} className="border-l-4 border-l-[#0B0F2E] hover:shadow-md transition-shadow">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-[#0B0F2E]">{s.nom}</p>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {s.brn && <span className="text-xs text-gray-400">BRN: {s.brn}</span>}
                      {s.ern && <span className="text-xs text-gray-400">ERN: {s.ern}</span>}
                      {s.statut_tva && <Badge className="bg-green-100 text-green-700 text-xs">TVA</Badge>}
                    </div>
                    {s.secteur_activite && <p className="text-xs text-gray-500 mt-1">{s.secteur_activite}</p>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={()=>openEdit(s)}><Edit className="w-4 h-4"/></Button>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <a href={`/client/documents?societe_id=${s.id}`} className="flex flex-col items-center p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-xs text-gray-600 gap-1">
                    <FileText className="w-4 h-4"/><span>Documents</span>
                  </a>
                  <a href={`/rh/employes?societe_id=${s.id}`} className="flex flex-col items-center p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-xs text-gray-600 gap-1">
                    <Users className="w-4 h-4"/><span>Employés</span>
                  </a>
                  <a href={`/client/mes-comptes?societe_id=${s.id}`} className="flex flex-col items-center p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-xs text-gray-600 gap-1">
                    <BookOpen className="w-4 h-4"/><span>Grand Livre</span>
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
