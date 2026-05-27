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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, ArrowLeft, Save, ExternalLink, UserCircle } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { StatusBadge, STATUS_OPTIONS } from "@/components/crm/StatusBadge"
import { SourceBadge } from "@/components/crm/SourceBadge"
import { ActivityTimeline } from "@/components/crm/ActivityTimeline"
import { AddContactDialog } from "@/components/crm/AddContactDialog"
import { AddActivityDialog } from "@/components/crm/AddActivityDialog"
import { EnrichButton } from "@/components/crm/EnrichButton"
import type { CrmCompany, CrmContact, CrmActivity, CrmProspectStatus } from "@/lib/crm/types"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

const panelStyle: React.CSSProperties = {
  border: "1px solid #D8DFED",
  borderRadius: 18,
  background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(15,23,42,0.16)",
}

export default function ProspectDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const id = params.id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [company, setCompany] = useState<CrmCompany | null>(null)
  const [contacts, setContacts] = useState<CrmContact[]>([])
  const [activities, setActivities] = useState<CrmActivity[]>([])

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/crm/companies/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Erreur chargement")
      setCompany(json.data)
      setContacts(json.contacts || [])
      setActivities(json.activities || [])
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [id, toast])

  useEffect(() => { load() }, [load])

  const update = async (patch: Partial<CrmCompany>) => {
    if (!company) return
    setSaving(true)
    try {
      const res = await fetch(`/api/crm/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Erreur MAJ")
      setCompany(json.data || { ...company, ...patch })
      toast({ title: "Enregistre" })
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} /></div>
  }

  if (!company) {
    return <div className="p-8"><p>Prospect introuvable.</p></div>
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/crm/prospects")} className="mb-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Retour
        </Button>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold" style={{ color: NAVY }}>{company.nom}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <StatusBadge status={company.statut} />
              <SourceBadge source={company.source} />
              {company.brn && <span className="text-xs text-muted-foreground">BRN: {company.brn}</span>}
              {company.score != null && <span className="text-xs font-bold" style={{ color: GOLD }}>Score: {company.score}/100</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={company.statut} onValueChange={(v) => update({ statut: v as CrmProspectStatus })}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Label htmlFor="score" className="text-xs">Score</Label>
              <Input
                id="score"
                type="number"
                min={0}
                max={100}
                defaultValue={company.score ?? 0}
                className="w-20"
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (!isNaN(v) && v !== (company.score ?? 0)) update({ score: v })
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="profil">
        <TabsList>
          <TabsTrigger value="profil">Profil</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({contacts.length})</TabsTrigger>
          <TabsTrigger value="strategie">Strategie IA</TabsTrigger>
          <TabsTrigger value="activites">Activites ({activities.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="profil" className="space-y-4">
          <Card style={panelStyle}>
            <CardHeader><CardTitle className="text-base">Informations societe</CardTitle></CardHeader>
            <CardContent>
              <ProfileEditor company={company} onSave={update} saving={saving} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts" className="space-y-4">
          <div className="flex justify-end">
            <AddContactDialog companyId={company.id} onSuccess={load} />
          </div>
          {contacts.length === 0 ? (
            <Card style={panelStyle}><CardContent className="py-12 text-center text-sm text-muted-foreground">Aucun contact pour cette societe.</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {contacts.map((c) => (
                <Link key={c.id} href={`/crm/contacts/${c.id}`}>
                  <Card style={panelStyle} className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                          <UserCircle className="h-6 w-6 text-gray-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm" style={{ color: NAVY }}>
                            {[c.prenom, c.nom].filter(Boolean).join(" ") || "Sans nom"}
                          </div>
                          {c.titre && <div className="text-xs text-muted-foreground">{c.titre}</div>}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {c.decision_maker && <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Decideur</span>}
                            {c.opt_out && <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-stone-200 text-stone-700">Opt-out</span>}
                          </div>
                          {c.email && <div className="text-xs text-muted-foreground mt-1 truncate">{c.email}</div>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="strategie">
          <Card style={panelStyle}>
            <CardContent className="p-6">
              <EnrichButton
                kind="company"
                targetId={company.id}
                initialEnrichment={company.enrichment}
                initialStrategy={company.strategy}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activites">
          <Card style={panelStyle}>
            <CardContent className="p-6">
              <ActivityTimeline
                activities={activities}
                onAddActivity={undefined}
              />
              <div className="mt-4">
                <AddActivityDialog companyId={company.id} onSuccess={load} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ProfileEditor({ company, onSave, saving }: { company: CrmCompany; onSave: (p: Partial<CrmCompany>) => void; saving: boolean }) {
  const [form, setForm] = useState({
    nom: company.nom || "",
    brn: company.brn || "",
    site_web: company.site_web || "",
    activite: company.activite || "",
    industrie: company.industrie || "",
    taille_effectif: company.taille_effectif || "",
    telephone: company.telephone || "",
    email_principal: company.email_principal || "",
    linkedin_url: company.linkedin_url || "",
    ville: company.ville || "",
    region: company.region || "",
    adresse: company.adresse || "",
    description: company.description || "",
    notes: company.notes || "",
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSave = () => {
    const patch: Partial<CrmCompany> = {}
    for (const [k, v] of Object.entries(form)) {
      ;(patch as any)[k] = v || null
    }
    onSave(patch)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="md:col-span-2"><Label>Nom *</Label><Input value={form.nom} onChange={set("nom")} /></div>
      <div><Label>BRN</Label><Input value={form.brn} onChange={set("brn")} /></div>
      <div><Label>Site web</Label><div className="flex gap-2"><Input value={form.site_web} onChange={set("site_web")} />{form.site_web && (<Button type="button" variant="outline" size="icon" asChild><a href={form.site_web} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>)}</div></div>
      <div><Label>Industrie</Label><Input value={form.industrie} onChange={set("industrie")} /></div>
      <div><Label>Activite</Label><Input value={form.activite} onChange={set("activite")} /></div>
      <div><Label>Effectif</Label><Input value={form.taille_effectif} onChange={set("taille_effectif")} /></div>
      <div><Label>LinkedIn</Label><Input value={form.linkedin_url} onChange={set("linkedin_url")} /></div>
      <div><Label>Telephone</Label><Input value={form.telephone} onChange={set("telephone")} /></div>
      <div><Label>Email principal</Label><Input type="email" value={form.email_principal} onChange={set("email_principal")} /></div>
      <div><Label>Ville</Label><Input value={form.ville} onChange={set("ville")} /></div>
      <div><Label>Region</Label><Input value={form.region} onChange={set("region")} /></div>
      <div className="md:col-span-2"><Label>Adresse</Label><Input value={form.adresse} onChange={set("adresse")} /></div>
      <div className="md:col-span-2"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={set("description")} /></div>
      <div className="md:col-span-2"><Label>Notes internes</Label><Textarea rows={3} value={form.notes} onChange={set("notes")} /></div>
      <div className="md:col-span-2 flex justify-end">
        <Button onClick={handleSave} disabled={saving} style={{ backgroundColor: "#D4AF37", color: "#0B0F2E" }}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Enregistrer
        </Button>
      </div>
    </div>
  )
}
