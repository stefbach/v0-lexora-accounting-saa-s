"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Loader2, Plus, Trash2, Edit2, Eye, EyeOff, Megaphone, AlertTriangle, PartyPopper, Clock, Info } from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
const BLUE = "#4191FF"

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Info; color: string; bg: string }> = {
  info: { label: "Information", icon: Info, color: "#059669", bg: "#05966915" },
  urgent: { label: "Urgent", icon: AlertTriangle, color: "#dc2626", bg: "#dc262615" },
  rh: { label: "RH", icon: Megaphone, color: BLUE, bg: `${BLUE}15` },
  celebration: { label: "Célébration", icon: PartyPopper, color: GOLD, bg: `${GOLD}15` },
  rappel: { label: "Rappel", icon: Clock, color: "#ea580c", bg: "#ea580c15" },
}

export default function AnnoncesPage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [annonces, setAnnonces] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ titre: "", contenu: "", type: "info", priorite: "0", date_debut: new Date().toISOString().split("T")[0], date_fin: "" })

  useEffect(() => {
    Promise.all([
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values()) as any[]
      setSocietes(unique)
      if (unique.length > 0) setSociete(unique[0].id)
    })
  }, [])

  const load = useCallback(async () => {
    if (!societe) return
    setLoading(true)
    try {
      const res = await fetch(`/api/rh/annonces?societe_id=${societe}&all=1`).then(r => r.json())
      setAnnonces(res.annonces || [])
    } catch {}
    setLoading(false)
  }, [societe])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!form.titre.trim() || !form.contenu.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/rh/annonces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          societe_id: societe,
          titre: form.titre,
          contenu: form.contenu,
          type: form.type,
          priorite: parseInt(form.priorite),
          date_debut: form.date_debut,
          date_fin: form.date_fin || null,
        }),
      })
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return }
      setDialogOpen(false)
      setEditingId(null)
      setForm({ titre: "", contenu: "", type: "info", priorite: "0", date_debut: new Date().toISOString().split("T")[0], date_fin: "" })
      load()
    } catch {}
    setSaving(false)
  }

  const togglePublish = async (id: string, publie: boolean) => {
    await fetch("/api/rh/annonces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", id, publie }),
    })
    load()
  }

  const deleteAnnonce = async (id: string) => {
    if (!confirm("Supprimer cette annonce ?")) return
    await fetch("/api/rh/annonces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    })
    load()
  }

  const openEdit = (a: any) => {
    setEditingId(a.id)
    setForm({
      titre: a.titre, contenu: a.contenu, type: a.type || "info",
      priorite: String(a.priorite || 0),
      date_debut: a.date_debut || new Date().toISOString().split("T")[0],
      date_fin: a.date_fin || "",
    })
    setDialogOpen(true)
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Annonces & Communications</h1>
          <p className="text-sm text-gray-500">Publiez des annonces visibles par tous les employés</p>
        </div>
        <div className="flex gap-3 items-center">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Société" /></SelectTrigger>
            <SelectContent>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => { setEditingId(null); setForm({ titre: "", contenu: "", type: "info", priorite: "0", date_debut: new Date().toISOString().split("T")[0], date_fin: "" }); setDialogOpen(true) }}
            style={{ backgroundColor: GOLD, color: NAVY }} className="font-semibold">
            <Plus className="h-4 w-4 mr-2" /> Nouvelle annonce
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : annonces.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-12 text-center">
            <Megaphone className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-400 font-medium">Aucune annonce</p>
            <p className="text-xs text-gray-300 mt-1">Créez votre première annonce pour communiquer avec les employés</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {annonces.map(a => {
            const tc = TYPE_CONFIG[a.type] || TYPE_CONFIG.info
            const Icon = tc.icon
            const isExpired = a.date_fin && a.date_fin < new Date().toISOString().split("T")[0]
            return (
              <Card key={a.id} className={`rounded-2xl transition-all ${!a.publie || isExpired ? "opacity-50" : ""}`} style={{ borderLeft: `4px solid ${tc.color}` }}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: tc.bg }}>
                      <Icon className="h-5 w-5" style={{ color: tc.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold" style={{ color: NAVY }}>{a.titre}</h3>
                        <Badge className="text-[10px]" style={{ backgroundColor: tc.bg, color: tc.color }}>{tc.label}</Badge>
                        {a.priorite >= 2 && <Badge className="bg-red-100 text-red-700 text-[10px]">Urgent</Badge>}
                        {!a.publie && <Badge className="bg-gray-100 text-gray-500 text-[10px]">Brouillon</Badge>}
                        {isExpired && <Badge className="bg-orange-100 text-orange-600 text-[10px]">Expiré</Badge>}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{a.contenu}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        <span>Publié le {new Date(a.created_at).toLocaleDateString("fr-FR")}</span>
                        {a.date_fin && <span>Expire le {new Date(a.date_fin).toLocaleDateString("fr-FR")}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => togglePublish(a.id, !a.publie)} title={a.publie ? "Dépublier" : "Publier"}>
                        {a.publie ? <Eye className="h-4 w-4 text-green-600" /> : <EyeOff className="h-4 w-4 text-gray-400" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}>
                        <Edit2 className="h-4 w-4 text-gray-400" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteAnnonce(a.id)}>
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ color: NAVY }}>{editingId ? "Modifier l'annonce" : "Nouvelle annonce"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-xs text-gray-500">Titre *</Label>
              <Input value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} placeholder="Ex: Réunion d'équipe vendredi" className="h-11" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Message *</Label>
              <Textarea value={form.contenu} onChange={e => setForm(f => ({ ...f, contenu: e.target.value }))} placeholder="Détails de l'annonce..." rows={4} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500">Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-500">Priorité</Label>
                <Select value={form.priorite} onValueChange={v => setForm(f => ({ ...f, priorite: v }))}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Normale</SelectItem>
                    <SelectItem value="1">Importante</SelectItem>
                    <SelectItem value="2">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500">Date début</Label>
                <Input type="date" value={form.date_debut} onChange={e => setForm(f => ({ ...f, date_debut: e.target.value }))} className="h-11" />
              </div>
              <div>
                <Label className="text-xs text-gray-500">Date expiration (optionnel)</Label>
                <Input type="date" value={form.date_fin} onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))} className="h-11" />
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving || !form.titre.trim() || !form.contenu.trim()} className="w-full h-11" style={{ backgroundColor: GOLD, color: NAVY }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingId ? "Mettre à jour" : "Publier l'annonce"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
