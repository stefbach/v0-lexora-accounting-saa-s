"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, ShieldOff } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

const NAVY = "#0B0F2E"

const panelStyle: React.CSSProperties = {
  border: "1px solid #D8DFED",
  borderRadius: 18,
  background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(15,23,42,0.16)",
}

interface OptOut {
  id: string
  email?: string | null
  telephone?: string | null
  linkedin_url?: string | null
  raison?: string | null
  created_at: string
}

export default function OptOutsPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<OptOut[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ email: "", telephone: "", linkedin_url: "", raison: "" })

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/crm/opt-outs")
      const json = await res.json()
      setItems(json.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.email && !form.telephone && !form.linkedin_url) {
      toast({ title: "Au moins un identifiant requis", description: "Email, telephone ou LinkedIn", variant: "destructive" })
      return
    }
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(form)) {
        if (v && String(v).trim() !== "") payload[k] = v
      }
      const res = await fetch("/api/crm/opt-outs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Erreur")
      toast({ title: "Opt-out enregistre" })
      setForm({ email: "", telephone: "", linkedin_url: "", raison: "" })
      load()
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2" style={{ color: NAVY }}>
          <ShieldOff className="h-7 w-7" /> Registre des opt-outs
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Conformite DPA Maurice 2017 — {items.length} entree(s)</p>
      </div>

      <Card style={panelStyle}>
        <CardHeader><CardTitle className="text-base">Ajouter manuellement</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="telephone">Telephone</Label>
              <Input id="telephone" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="linkedin_url">LinkedIn URL</Label>
              <Input id="linkedin_url" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="raison">Raison</Label>
              <Input id="raison" value={form.raison} onChange={(e) => setForm({ ...form, raison: e.target.value })} placeholder="ex: Demande email du contact" />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={submitting} style={{ backgroundColor: "#D4AF37", color: "#0B0F2E" }}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Ajouter
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card style={panelStyle} className="overflow-hidden">
        <CardHeader><CardTitle className="text-base">Liste des opt-outs</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Aucun opt-out enregistre.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Telephone</TableHead>
                  <TableHead>LinkedIn</TableHead>
                  <TableHead>Raison</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-sm">{o.email || "-"}</TableCell>
                    <TableCell className="text-sm">{o.telephone || "-"}</TableCell>
                    <TableCell className="text-sm truncate max-w-[200px]">{o.linkedin_url || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{o.raison || "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString("fr-FR")}</TableCell>
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
