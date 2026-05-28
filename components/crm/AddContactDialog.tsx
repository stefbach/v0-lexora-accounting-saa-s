"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, UserPlus } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface Props {
  companyId: string
  onSuccess?: () => void
}

export function AddContactDialog({ companyId, onSuccess }: Props) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    prenom: "",
    nom: "",
    titre: "",
    email: "",
    telephone: "",
    linkedin_url: "",
    decision_maker: false,
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload: Record<string, unknown> = {
        company_id: companyId,
        source: "manuel",
        decision_maker: form.decision_maker,
      }
      for (const [k, v] of Object.entries(form)) {
        if (k === "decision_maker") continue
        if (v && String(v).trim() !== "") payload[k] = v
      }
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Erreur creation contact")
      toast({ title: "Contact ajoute" })
      setOpen(false)
      setForm({ prenom: "", nom: "", titre: "", email: "", telephone: "", linkedin_url: "", decision_maker: false })
      onSuccess?.()
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || String(err), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="h-4 w-4 mr-1" /> Ajouter contact
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau contact</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="prenom">Prenom</Label>
              <Input id="prenom" value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="nom">Nom</Label>
              <Input id="nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="titre">Titre / Poste</Label>
              <Input id="titre" value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="telephone">Telephone</Label>
              <Input id="telephone" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="linkedin_url">LinkedIn URL</Label>
              <Input id="linkedin_url" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <Checkbox
                id="decision_maker"
                checked={form.decision_maker}
                onCheckedChange={(v) => setForm({ ...form, decision_maker: Boolean(v) })}
              />
              <Label htmlFor="decision_maker" className="cursor-pointer">Decideur</Label>
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
