"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useSearchParams } from "next/navigation"

interface Membre { id: string; full_name: string; email: string; role: string; societe_id?: string }
interface Societe { id: string; nom: string }

const ROLES_CREABLES = [
  { value: 'rh', label: 'RH', desc: 'Employés, Pointage, Paie, Congés', color: 'bg-orange-100 text-orange-800' },
  { value: 'juridique', label: 'Juridique', desc: 'Contrats, Documents légaux', color: 'bg-purple-100 text-purple-800' },
  { value: 'employe', label: 'Employé', desc: 'Portail salarié uniquement', color: 'bg-gray-100 text-gray-700' },
]

function genPassword() {
  return Math.random().toString(36).slice(2, 8).toUpperCase() + Math.random().toString(36).slice(2, 8)
}

function RoleBadge({ role }: { role: string }) {
  const r = ROLES_CREABLES.find(r => r.value === role)
  return <Badge className={`text-xs ${r?.color || 'bg-gray-100 text-gray-600'}`}>{r?.label || role}</Badge>
}

export default function MonEquipePage() {
  const searchParams = useSearchParams()
  const societeIdParam = searchParams.get('societe_id')
  const [membres, setMembres] = useState<Membre[]>([])
  const [societes, setSocietes] = useState<Societe[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastCreds, setLastCreds] = useState<{ email: string; password: string } | null>(null)
  const [form, setForm] = useState({ prenom: '', nom: '', email: '', role: 'rh', societe_id: societeIdParam || '', password: genPassword() })

  const load = async () => {
    setLoading(true)
    const [u, s] = await Promise.all([
      fetch('/api/admin/users').then(r => r.json()),
      fetch('/api/client/societes').then(r => r.json()),
    ])
    const roles = ['rh', 'juridique', 'employe']
    setMembres((u.users || []).filter((m: Membre) => roles.includes(m.role)))
    setSocietes(s.societes || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const creer = async () => {
    if (!form.prenom || !form.nom || !form.email || !form.role || !form.societe_id) return
    setSaving(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email,
        password: form.password,
        full_name: `${form.prenom} ${form.nom}`,
        role: form.role,
        societe_id: form.societe_id
      })
    })
    const data = await res.json()
    setSaving(false)
    if (data.error) { alert(data.error); return }
    setLastCreds({ email: form.email, password: form.password })
    setOpen(false)
    setForm({ prenom: '', nom: '', email: '', role: 'rh', societe_id: societeIdParam || '', password: genPassword() })
    load()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Mon Équipe</h1>
          <p className="text-sm text-gray-500">Gérer les accès RH, Juridique et Employés de vos sociétés</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#1E2A4A]">+ Ajouter un membre</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Créer un accès</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Prénom</Label><Input value={form.prenom} onChange={e => setForm(f => ({...f, prenom: e.target.value}))} /></div>
                <div><Label>Nom</Label><Input value={form.nom} onChange={e => setForm(f => ({...f, nom: e.target.value}))} /></div>
              </div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} /></div>
              <div>
                <Label>Rôle</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({...f, role: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES_CREABLES.map(r => (
                      <SelectItem key={r.value} value={r.value}>
                        <div><span className="font-medium">{r.label}</span> — <span className="text-xs text-gray-500">{r.desc}</span></div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Société <span className="text-red-500">*</span></Label>
                <Select value={form.societe_id} onValueChange={v => setForm(f => ({...f, societe_id: v}))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner une société" /></SelectTrigger>
                  <SelectContent>
                    {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Mot de passe</Label>
                <div className="flex gap-2">
                  <Input value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} className="font-mono" />
                  <Button variant="outline" size="sm" onClick={() => setForm(f => ({...f, password: genPassword()}))}>↺</Button>
                </div>
                <p className="text-xs text-orange-600 mt-1">⚠️ Notez ce mot de passe avant de confirmer</p>
              </div>
              <Button onClick={creer} disabled={saving || !form.prenom || !form.nom || !form.email || !form.societe_id} className="w-full bg-[#1E2A4A]">
                {saving ? 'Création...' : 'Créer le compte'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Credentials affichés après création */}
      {lastCreds && (
        <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
          <p className="font-semibold text-yellow-800">✅ Compte créé — communiquez ces identifiants :</p>
          <p className="text-sm mt-2">Email : <span className="font-mono font-bold">{lastCreds.email}</span></p>
          <p className="text-sm">Mot de passe : <span className="font-mono font-bold text-lg">{lastCreds.password}</span></p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setLastCreds(null)}>✕ Fermer</Button>
        </div>
      )}

      {/* Explication des rôles */}
      <div className="grid grid-cols-3 gap-3">
        {ROLES_CREABLES.map(r => (
          <Card key={r.value} className="border-l-4" style={{borderLeftColor: r.value === 'rh' ? '#f97316' : r.value === 'juridique' ? '#a855f7' : '#9ca3af'}}>
            <CardContent className="p-4">
              <Badge className={`${r.color} mb-2`}>{r.label}</Badge>
              <p className="text-xs text-gray-500">{r.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Liste membres */}
      {loading ? (
        <div className="text-center text-gray-400 py-8">Chargement...</div>
      ) : membres.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-gray-400">
          <p className="text-4xl mb-3">👥</p>
          <p className="font-medium">Aucun membre d'équipe</p>
          <p className="text-sm mt-1">Créez des accès RH, Juridique ou Employé pour votre société.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {membres.map(m => (
            <Card key={m.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#1E2A4A] flex items-center justify-center text-white font-bold text-sm">
                    {(m.full_name || m.email).slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{m.full_name || '—'}</p>
                    <p className="text-xs text-gray-400">{m.email}</p>
                  </div>
                  <RoleBadge role={m.role} />
                </div>
                <div className="text-xs text-gray-400">
                  {societes.find(s => s.id === m.societe_id)?.nom || '—'}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
