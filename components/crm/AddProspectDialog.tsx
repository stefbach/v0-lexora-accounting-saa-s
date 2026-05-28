"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Plus } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface Props {
  onCreated?: (id: string) => void
  triggerLabel?: string
}

export function AddProspectDialog({ onCreated, triggerLabel = "+ Ajouter" }: Props) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    nom: "",
    brn: "",
    activite: "",
    industrie: "",
    taille_effectif: "",
    site_web: "",
    telephone: "",
    email_principal: "",
    ville: "",
    region: "",
    notes: "",
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nom.trim()) {
      toast({ title: "Nom requis", variant: "destructive" })
      return
    }
    setLoading(true)
    try {
      const payload: Record<string, unknown> = { source: "manuel" }
      for (const [k, v] of Object.entries(form)) {
        if (v && String(v).trim() !== "") payload[k] = v
      }
      const res = await fetch("/api/crm/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Erreur creation")
      toast({ title: "Prospect cree", description: form.nom })
      setOpen(false)
      setForm({ nom: "", brn: "", activite: "", industrie: "", taille_effectif: "", site_web: "", telephone: "", email_principal: "", ville: "", region: "", notes: "" })
      onCreated?.(json?.data?.id)
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || String(err), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button style={{ backgroundColor: "#0B0F2E", color: "#fff" }}>
          <Plus className="h-4 w-4 mr-1" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouveau prospect</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label htmlFor="nom">Nom de la societe *</Label>
              <Input id="nom" value={form.nom} onChange={set("nom")} required />
            </div>
            <div>
              <Label htmlFor="brn">BRN</Label>
              <Input id="brn" value={form.brn} onChange={set("brn")} />
            </div>
            <div>
              <Label htmlFor="industrie">Industrie</Label>
              <Input id="industrie" value={form.industrie} onChange={set("industrie")} />
            </div>
            <div>
              <Label htmlFor="activite">Activite</Label>
              <Input id="activite" value={form.activite} onChange={set("activite")} />
            </div>
            <div>
              <Label htmlFor="taille_effectif">Effectif</Label>
              <Input id="taille_effectif" placeholder="ex: 11-50" value={form.taille_effectif} onChange={set("taille_effectif")} />
            </div>
            <div>
              <Label htmlFor="site_web">Site web</Label>
              <Input id="site_web" type="url" value={form.site_web} onChange={set("site_web")} />
            </div>
            <div>
              <Label htmlFor="telephone">Telephone</Label>
              <Input id="telephone" value={form.telephone} onChange={set("telephone")} />
            </div>
            <div>
              <Label htmlFor="email_principal">Email principal</Label>
              <Input id="email_principal" type="email" value={form.email_principal} onChange={set("email_principal")} />
            </div>
            <div>
              <Label htmlFor="ville">Ville</Label>
              <Input id="ville" value={form.ville} onChange={set("ville")} />
            </div>
            <div>
              <Label htmlFor="region">Region</Label>
              <Input id="region" value={form.region} onChange={set("region")} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={3} value={form.notes} onChange={set("notes")} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit" disabled={loading} style={{ backgroundColor: "#D4AF37", color: "#0B0F2E" }}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Creer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
