"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Loader2, ArrowLeft, Save, ShieldOff, ExternalLink, Mail, Phone, Linkedin as LinkedinIcon } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { StatusBadge } from "@/components/crm/StatusBadge"
import { SourceBadge } from "@/components/crm/SourceBadge"
import { ActivityTimeline } from "@/components/crm/ActivityTimeline"
import { AddActivityDialog } from "@/components/crm/AddActivityDialog"
import { EnrichButton } from "@/components/crm/EnrichButton"
import type { CrmContact, CrmCompany, CrmActivity } from "@/lib/crm/types"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

const panelStyle: React.CSSProperties = {
  border: "1px solid #D8DFED",
  borderRadius: 18,
  background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(15,23,42,0.16)",
}

type ContactWithCompany = CrmContact & { crm_companies?: Pick<CrmCompany, "id" | "nom"> | null }

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const id = params.id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [contact, setContact] = useState<ContactWithCompany | null>(null)
  const [activities, setActivities] = useState<CrmActivity[]>([])
  const [optOutReason, setOptOutReason] = useState("")

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/crm/contacts/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Erreur chargement")
      setContact(json.data)
      setActivities(json.activities || [])
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [id, toast])

  useEffect(() => { load() }, [load])

  const update = async (patch: Partial<CrmContact>) => {
    if (!contact) return
    setSaving(true)
    try {
      const res = await fetch(`/api/crm/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Erreur MAJ")
      setContact({ ...(json.data || contact), crm_companies: contact.crm_companies })
      toast({ title: "Enregistre" })
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const doOptOut = async () => {
    if (!contact) return
    try {
      const res = await fetch(`/api/crm/contacts/${contact.id}/opt-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raison: optOutReason || "Demande du contact" }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Erreur opt-out")
      toast({ title: "Contact marque opt-out" })
      setOptOutReason("")
      load()
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} /></div>
  }

  if (!contact) {
    return <div className="p-8"><p>Contact introuvable.</p></div>
  }

  const fullName = [contact.prenom, contact.nom].filter(Boolean).join(" ") || "Sans nom"

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Retour
        </Button>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold" style={{ color: NAVY }}>{fullName}</h1>
            {contact.titre && <p className="text-sm text-muted-foreground mt-1">{contact.titre}</p>}
            {contact.crm_companies && (
              <Link href={`/crm/prospects/${contact.crm_companies.id}`} className="text-sm hover:underline" style={{ color: GOLD }}>
                {contact.crm_companies.nom}
              </Link>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <StatusBadge status={contact.statut} />
              <SourceBadge source={contact.source} />
              {contact.decision_maker && <span className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-amber-100 text-amber-800">Decideur</span>}
              {contact.opt_out && <span className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-stone-200 text-stone-700">Opt-out</span>}
              {contact.email_verified && <span className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-emerald-100 text-emerald-800">Email verifie</span>}
            </div>
            <div className="flex flex-wrap gap-3 mt-3 text-sm text-muted-foreground">
              {contact.email && (<a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 hover:text-gray-900"><Mail className="h-3 w-3" />{contact.email}</a>)}
              {contact.telephone && (<a href={`tel:${contact.telephone}`} className="inline-flex items-center gap-1 hover:text-gray-900"><Phone className="h-3 w-3" />{contact.telephone}</a>)}
              {contact.linkedin_url && (<a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-gray-900"><LinkedinIcon className="h-3 w-3" />LinkedIn</a>)}
            </div>
          </div>
          <div className="flex gap-2">
            {!contact.opt_out && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="text-red-700 border-red-200 hover:bg-red-50">
                    <ShieldOff className="h-4 w-4 mr-1" /> Marquer opt-out
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmer l'opt-out</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action ajoute le contact au registre des opt-outs (DPA Maurice 2017). Il ne sera plus contacte commercialement.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div>
                    <Label htmlFor="raison">Raison</Label>
                    <Input id="raison" value={optOutReason} onChange={(e) => setOptOutReason(e.target.value)} placeholder="ex: Demande email du contact" />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={doOptOut} className="bg-red-600 hover:bg-red-700">Confirmer</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="profil">
        <TabsList>
          <TabsTrigger value="profil">Profil</TabsTrigger>
          <TabsTrigger value="strategie">Strategie IA</TabsTrigger>
          <TabsTrigger value="activites">Activites ({activities.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="profil">
          <Card style={panelStyle}>
            <CardHeader><CardTitle className="text-base">Informations contact</CardTitle></CardHeader>
            <CardContent>
              <ContactEditor contact={contact} onSave={update} saving={saving} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="strategie">
          <Card style={panelStyle}>
            <CardContent className="p-6">
              <EnrichButton
                kind="contact"
                targetId={contact.id}
                initialEnrichment={contact.enrichment}
                initialStrategy={contact.strategy}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activites">
          <Card style={panelStyle}>
            <CardContent className="p-6">
              <ActivityTimeline activities={activities} />
              <div className="mt-4">
                <AddActivityDialog contactId={contact.id} companyId={contact.company_id || undefined} onSuccess={load} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ContactEditor({ contact, onSave, saving }: { contact: CrmContact; onSave: (p: Partial<CrmContact>) => void; saving: boolean }) {
  const [form, setForm] = useState({
    prenom: contact.prenom || "",
    nom: contact.nom || "",
    titre: contact.titre || "",
    seniorite: contact.seniorite || "",
    email: contact.email || "",
    telephone: contact.telephone || "",
    whatsapp: contact.whatsapp || "",
    linkedin_url: contact.linkedin_url || "",
    langue_preferee: contact.langue_preferee || "",
    canal_prefere: contact.canal_prefere || "",
    notes: contact.notes || "",
    decision_maker: contact.decision_maker,
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSave = () => {
    const patch: Partial<CrmContact> = {
      decision_maker: form.decision_maker,
    }
    for (const k of ["prenom", "nom", "titre", "seniorite", "email", "telephone", "whatsapp", "linkedin_url", "langue_preferee", "canal_prefere", "notes"] as const) {
      ;(patch as any)[k] = form[k] || null
    }
    onSave(patch)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div><Label>Prenom</Label><Input value={form.prenom} onChange={set("prenom")} /></div>
      <div><Label>Nom</Label><Input value={form.nom} onChange={set("nom")} /></div>
      <div className="md:col-span-2"><Label>Titre</Label><Input value={form.titre} onChange={set("titre")} /></div>
      <div><Label>Seniorite</Label><Input value={form.seniorite} onChange={set("seniorite")} /></div>
      <div><Label>Email</Label><Input type="email" value={form.email} onChange={set("email")} /></div>
      <div><Label>Telephone</Label><Input value={form.telephone} onChange={set("telephone")} /></div>
      <div><Label>WhatsApp</Label><Input value={form.whatsapp} onChange={set("whatsapp")} /></div>
      <div className="md:col-span-2 flex gap-2 items-end"><div className="flex-1"><Label>LinkedIn URL</Label><Input value={form.linkedin_url} onChange={set("linkedin_url")} /></div>{form.linkedin_url && (<Button type="button" variant="outline" size="icon" asChild><a href={form.linkedin_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>)}</div>
      <div><Label>Langue preferee</Label><Input value={form.langue_preferee} onChange={set("langue_preferee")} placeholder="fr / en" /></div>
      <div><Label>Canal prefere</Label><Input value={form.canal_prefere} onChange={set("canal_prefere")} placeholder="email / linkedin / whatsapp" /></div>
      <div className="md:col-span-2 flex items-center gap-2 pt-2">
        <Checkbox
          id="decision_maker"
          checked={form.decision_maker}
          onCheckedChange={(v) => setForm({ ...form, decision_maker: Boolean(v) })}
        />
        <Label htmlFor="decision_maker" className="cursor-pointer">Decideur</Label>
      </div>
      <div className="md:col-span-2"><Label>Notes</Label><Textarea rows={3} value={form.notes} onChange={set("notes")} /></div>
      <div className="md:col-span-2 flex justify-end">
        <Button onClick={handleSave} disabled={saving} style={{ backgroundColor: "#D4AF37", color: "#0B0F2E" }}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Enregistrer
        </Button>
      </div>
    </div>
  )
}
