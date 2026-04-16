"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

interface Comptable {
  id: string
  full_name: string
  email: string
  role: string
}

interface Societe {
  id: string
  nom: string
  brn: string
}

interface Assignation {
  assignation_id: string
  comptable_id: string
  comptable_nom: string
  comptable_email: string
  societe_id: string
  societe_nom: string
  brn: string
  type_acces: string
  date_assignation: string
  nb_dossiers_en_cours: number
  docs_en_attente: number
}

export default function AdminComptablesPage() {
  const [comptables, setComptables] = useState<Comptable[]>([])
  const [societes, setSocietes] = useState<Societe[]>([])
  const [assignations, setAssignations] = useState<Assignation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedComptable, setSelectedComptable] = useState("")
  const [selectedSociete, setSelectedSociete] = useState("")
  const [typeAcces, setTypeAcces] = useState("comptable")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    const [cp, soc, asgn] = await Promise.all([
      fetch("/api/admin/users").then(r => r.json()),
      fetch("/api/comptable/societes").then(r => r.json()),
      fetch("/api/admin/comptables/assignations").then(r => r.json())
    ])
    setComptables((cp.users || []).filter((u: Comptable) => ['comptable','comptable_dedie'].includes(u.role)))
    setSocietes(soc.societes || [])
    setAssignations(asgn.assignations || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const assigner = async () => {
    if (!selectedComptable || !selectedSociete) return
    setSaving(true)
    await fetch("/api/admin/comptables/assignations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comptable_id: selectedComptable, societe_id: selectedSociete, type_acces: typeAcces, notes })
    })
    setOpen(false)
    setSelectedComptable("")
    setSelectedSociete("")
    setNotes("")
    setSaving(false)
    load()
  }

  const retirer = async (comptable_id: string, societe_id: string) => {
    await fetch("/api/admin/comptables/assignations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comptable_id, societe_id })
    })
    load()
  }

  const badgeAcces = (type: string) => {
    if (type === 'comptable_dedie') return <Badge className="bg-purple-100 text-purple-800">Dédié</Badge>
    if (type === 'lecture') return <Badge variant="outline">Lecture</Badge>
    return <Badge className="bg-blue-100 text-blue-800">Comptable</Badge>
  }

  // Stats globales
  const nbComptablesActifs = new Set(assignations.map(a => a.comptable_id)).size
  const nbSocietesAvecComptable = new Set(assignations.map(a => a.societe_id)).size
  const nbSocietésSansComptable = societes.length - nbSocietesAvecComptable
  const totalDocsEnAttente = assignations.reduce((s, a) => s + (a.docs_en_attente || 0), 0)

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]">Gestion des Comptables</h1>
          <p className="text-sm text-gray-500">Assignation comptable ↔ sociétés</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#0B0F2E]">+ Assigner un comptable</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assigner un comptable à une société</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Comptable</Label>
                <Select value={selectedComptable} onValueChange={setSelectedComptable}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner un comptable" /></SelectTrigger>
                  <SelectContent>
                    {comptables.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.full_name} — {c.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Société</Label>
                <Select value={selectedSociete} onValueChange={setSelectedSociete}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner une société" /></SelectTrigger>
                  <SelectContent>
                    {societes.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.nom} {s.brn ? `— ${s.brn}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type d'accès</Label>
                <Select value={typeAcces} onValueChange={setTypeAcces}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comptable">Comptable — accès complet</SelectItem>
                    <SelectItem value="comptable_dedie">Comptable dédié — société unique</SelectItem>
                    <SelectItem value="lecture">Lecture seule</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes (optionnel)</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: responsable TVA uniquement" />
              </div>
              <Button onClick={assigner} disabled={saving || !selectedComptable || !selectedSociete} className="w-full bg-[#0B0F2E]">
                {saving ? "Enregistrement..." : "Confirmer l'assignation"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Comptables actifs", value: nbComptablesActifs, color: "text-blue-600" },
          { label: "Sociétés avec comptable", value: nbSocietesAvecComptable, color: "text-green-600" },
          { label: "Sociétés sans comptable", value: nbSocietésSansComptable, color: nbSocietésSansComptable > 0 ? "text-red-600" : "text-green-600" },
          { label: "Docs en attente total", value: totalDocsEnAttente, color: totalDocsEnAttente > 0 ? "text-orange-600" : "text-green-600" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Par comptable */}
      {loading ? (
        <div className="text-center text-gray-400 py-8">Chargement...</div>
      ) : comptables.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-gray-400">Aucun comptable enregistré. Invitez des comptables via Admin → Utilisateurs.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {comptables.map(c => {
            const mesAssignations = assignations.filter(a => a.comptable_id === c.id)
            return (
              <Card key={c.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>
                      👤 {c.full_name}
                      <span className="text-sm font-normal text-gray-500 ml-2">{c.email}</span>
                    </span>
                    <Badge variant="outline">{mesAssignations.length} société{mesAssignations.length !== 1 ? 's' : ''}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {mesAssignations.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Aucune société assignée</p>
                  ) : (
                    <div className="space-y-2">
                      {mesAssignations.map(a => (
                        <div key={a.assignation_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            {badgeAcces(a.type_acces)}
                            <span className="font-medium text-sm">{a.societe_nom}</span>
                            {a.brn && <span className="text-xs text-gray-400">{a.brn}</span>}
                            {a.docs_en_attente > 0 && (
                              <Badge className="bg-orange-100 text-orange-700 text-xs">{a.docs_en_attente} doc{a.docs_en_attente > 1 ? 's' : ''} en attente</Badge>
                            )}
                          </div>
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700"
                            onClick={() => retirer(a.comptable_id, a.societe_id)}>
                            Retirer
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
    </ClientPageShell>
  )
}
