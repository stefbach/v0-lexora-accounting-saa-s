"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Plus } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

const TYPES = [
  { value: "note", label: "Note" },
  { value: "email_sent", label: "Email envoye" },
  { value: "email_received", label: "Email recu" },
  { value: "call_outbound", label: "Appel sortant" },
  { value: "call_inbound", label: "Appel entrant" },
  { value: "meeting", label: "Reunion" },
  { value: "linkedin_dm", label: "LinkedIn DM" },
  { value: "whatsapp_msg", label: "WhatsApp" },
  { value: "outreach_trigger", label: "Outreach declenche" },
] as const

interface Props {
  companyId?: string
  contactId?: string
  onSuccess?: () => void
  trigger?: React.ReactNode
}

export function AddActivityDialog({ companyId, contactId, onSuccess, trigger }: Props) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [type, setType] = useState<string>("note")
  const [sujet, setSujet] = useState("")
  const [contenu, setContenu] = useState("")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId && !contactId) {
      toast({ title: "Cible manquante", variant: "destructive" })
      return
    }
    setLoading(true)
    try {
      const payload: Record<string, unknown> = { type }
      if (companyId) payload.company_id = companyId
      if (contactId) payload.contact_id = contactId
      if (sujet.trim()) payload.sujet = sujet
      if (contenu.trim()) payload.contenu = contenu
      const res = await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Erreur creation activite")
      toast({ title: "Activite enregistree" })
      setOpen(false)
      setType("note")
      setSujet("")
      setContenu("")
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
        {trigger || (
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" /> Ajouter activite
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle activite</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="type">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="sujet">Sujet</Label>
            <Input id="sujet" value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder="ex: Premier contact email" />
          </div>
          <div>
            <Label htmlFor="contenu">Contenu</Label>
            <Textarea id="contenu" rows={5} value={contenu} onChange={(e) => setContenu(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit" disabled={loading} style={{ backgroundColor: "#D4AF37", color: "#0B0F2E" }}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
