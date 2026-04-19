"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  ArrowLeft, Save, Trash2, Loader2, CheckCircle2, Pencil, X, History, FileText,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { ClientPanel } from "@/components/client/ClientKit"

const FONT = "'Poppins', sans-serif"

type Statut =
  | "brouillon" | "a_valider" | "en_revision" | "valide" | "actif"
  | "envoye" | "signe" | "termine" | "archive" | "resilie" | "annule"

interface Contrat {
  id: string
  reference: string | null
  titre: string
  type_contrat: string
  statut: Statut
  date_debut: string | null
  date_fin: string | null
  montant: number | null
  montant_total: number | null
  devise: string | null
  frequence_facturation: string | null
  action_renouvellement: string | null
  description: string | null
  notes_internes: string | null
  societe_id: string | null
  client_id: string | null
  created_at: string
  updated_at: string | null
  client?: { id: string; full_name: string | null; email: string | null } | null
  societe?: { id: string; nom: string | null } | null
  conversation_ia?: unknown[] | null
}

const STATUT_META: Record<string, { label: string; color: string }> = {
  brouillon:   { label: "Brouillon",   color: "bg-gray-100 text-gray-700 border-gray-300" },
  a_valider:   { label: "À valider",   color: "bg-amber-100 text-amber-800 border-amber-300" },
  en_revision: { label: "En révision", color: "bg-amber-100 text-amber-800 border-amber-300" },
  valide:      { label: "Validé",      color: "bg-blue-100 text-blue-800 border-blue-300" },
  actif:       { label: "Actif",       color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  envoye:      { label: "Envoyé",      color: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  signe:       { label: "Signé",       color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  termine:     { label: "Terminé",     color: "bg-slate-100 text-slate-700 border-slate-300" },
  archive:     { label: "Archivé",     color: "bg-slate-100 text-slate-700 border-slate-300" },
  resilie:     { label: "Résilié",     color: "bg-rose-100 text-rose-800 border-rose-300" },
  annule:      { label: "Annulé",      color: "bg-rose-100 text-rose-800 border-rose-300" },
}

const TYPES = [
  { value: "lettre_mission",        label: "Lettre de mission" },
  { value: "convention_honoraires", label: "Convention d'honoraires" },
  { value: "prestation_service",    label: "Prestation de service" },
  { value: "nda",                   label: "NDA / Confidentialité" },
  { value: "mandat",                label: "Mandat" },
  { value: "cdi_prestataire",       label: "CDI prestataire" },
  { value: "saas_abonnement",       label: "SaaS abonnement" },
  { value: "maintenance",           label: "Maintenance" },
  { value: "consulting",            label: "Consulting" },
  { value: "autre",                 label: "Autre" },
]
const FREQUENCES = [
  { value: "ponctuel",    label: "Ponctuel" },
  { value: "mensuel",     label: "Mensuel" },
  { value: "trimestriel", label: "Trimestriel" },
  { value: "annuel",      label: "Annuel" },
]
const DEVISES = ["MUR", "EUR", "USD", "GBP"]

const NEXT_STATUT: Record<string, { value: Statut; label: string }[]> = {
  brouillon:   [{ value: "a_valider", label: "Envoyer pour validation" }, { value: "actif", label: "Activer" }],
  a_valider:   [{ value: "actif", label: "Activer" }, { value: "brouillon", label: "Repasser en brouillon" }],
  actif:       [{ value: "termine", label: "Clôturer" }, { value: "resilie", label: "Résilier" }],
  signe:       [{ value: "actif", label: "Activer" }, { value: "termine", label: "Clôturer" }],
  termine:     [{ value: "archive", label: "Archiver" }],
  resilie:     [],
  archive:     [],
  valide:      [{ value: "actif", label: "Activer" }],
  envoye:      [{ value: "signe", label: "Marquer signé" }],
  en_revision: [{ value: "valide", label: "Valider" }],
  annule:      [],
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  try { return new Date(iso).toLocaleDateString("fr-FR") } catch { return iso }
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—"
  try { return new Date(iso).toLocaleString("fr-FR") } catch { return iso }
}
function fmtMontant(m: number | null, devise: string | null): string {
  if (m === null || m === undefined) return "—"
  return `${Number(m).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${devise || "MUR"}`
}

type EditState = {
  titre: string
  type_contrat: string
  date_debut: string
  date_fin: string
  montant: string
  devise: string
  frequence_facturation: string
  description: string
  action_renouvellement: string
}

export default function ContratDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [contrat, setContrat] = useState<Contrat | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [changingStatut, setChangingStatut] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      // Pas d'endpoint GET /:id — on charge via la liste filtrée sur l'id
      const res = await fetch(`/api/contrats?limit=1`)
      if (!res.ok) throw new Error("Erreur de chargement")
      // Fallback : on charge une page plus large et on filtre
      const allRes = await fetch(`/api/contrats?limit=500`)
      const j = (await allRes.json()) as { data?: Contrat[] }
      const found = (j.data || []).find(c => c.id === id)
      if (!found) throw new Error("Contrat introuvable")
      setContrat(found)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const startEdit = () => {
    if (!contrat) return
    setEdit({
      titre: contrat.titre,
      type_contrat: contrat.type_contrat,
      date_debut: contrat.date_debut || "",
      date_fin: contrat.date_fin || "",
      montant: contrat.montant !== null && contrat.montant !== undefined
        ? String(contrat.montant)
        : contrat.montant_total !== null && contrat.montant_total !== undefined
          ? String(contrat.montant_total)
          : "",
      devise: contrat.devise || "MUR",
      frequence_facturation: contrat.frequence_facturation || "ponctuel",
      description: contrat.description || "",
      action_renouvellement: contrat.action_renouvellement || "aucun",
    })
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setEdit(null)
  }

  const saveEdit = async () => {
    if (!contrat || !edit) return
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        id: contrat.id,
        titre: edit.titre,
        type_contrat: edit.type_contrat,
        date_debut: edit.date_debut || null,
        date_fin: edit.date_fin || null,
        montant: edit.montant ? Number(edit.montant) : null,
        devise: edit.devise,
        frequence_facturation: edit.frequence_facturation,
        description: edit.description || null,
        action_renouvellement: edit.action_renouvellement,
      }
      const res = await fetch("/api/contrats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const j = (await res.json()) as { data?: Contrat; error?: string }
      if (!res.ok) throw new Error(j.error || "Erreur de sauvegarde")
      if (j.data) setContrat(j.data)
      setEditing(false)
      setEdit(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setSaving(false)
    }
  }

  const changeStatut = async (next: Statut) => {
    if (!contrat) return
    setChangingStatut(true)
    setError(null)
    try {
      const res = await fetch("/api/contrats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contrat.id, statut: next }),
      })
      const j = (await res.json()) as { data?: Contrat; error?: string }
      if (!res.ok) throw new Error(j.error || "Erreur changement de statut")
      if (j.data) setContrat(j.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setChangingStatut(false)
    }
  }

  const doDelete = async () => {
    if (!contrat) return
    setDeleting(true)
    try {
      const force = contrat.statut === "brouillon" ? "&force=1" : ""
      const res = await fetch(`/api/contrats?id=${contrat.id}${force}`, { method: "DELETE" })
      const j = (await res.json()) as { error?: string; hard?: boolean }
      if (!res.ok) throw new Error(j.error || "Erreur suppression")
      router.push("/client/contrats-clients")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue")
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <ClientPageShell title="Contrat" breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Contrats Clients", href: "/client/contrats-clients" }, { label: "Détail" }]}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin" style={{ color: "#D4AF37" }} />
        </div>
      </ClientPageShell>
    )
  }

  if (error || !contrat) {
    return (
      <ClientPageShell title="Contrat" breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Contrats Clients", href: "/client/contrats-clients" }, { label: "Détail" }]}>
        <Card>
          <CardContent className="p-6 text-rose-700">
            {error || "Contrat introuvable."}
            <div className="mt-3">
              <Button variant="outline" onClick={() => router.push("/client/contrats-clients")}>
                <ArrowLeft className="w-4 h-4 mr-2" />Retour à la liste
              </Button>
            </div>
          </CardContent>
        </Card>
      </ClientPageShell>
    )
  }

  const meta = STATUT_META[contrat.statut] || STATUT_META.brouillon
  const nexts = NEXT_STATUT[contrat.statut] || []
  const montant = contrat.montant ?? contrat.montant_total

  return (
    <ClientPageShell
      breadcrumbs={[
        { label: "Espace client",    href: "/client" },
        { label: "Contrats Clients", href: "/client/contrats-clients" },
        { label: contrat.reference || contrat.titre },
      ]}
      kicker={contrat.reference || "Contrat"}
      title={contrat.titre}
      subtitle={
        <span>
          <Badge variant="outline" className={meta.color}>{meta.label}</Badge>
          <span className="ml-2 text-slate-500 text-sm">
            Créé le {fmtDateTime(contrat.created_at)}
          </span>
        </span>
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => router.push("/client/contrats-clients")}>
            <ArrowLeft className="w-4 h-4 mr-2" />Retour
          </Button>
          {!editing && (
            <Button onClick={startEdit}>
              <Pencil className="w-4 h-4 mr-2" />Modifier
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-rose-700 border-rose-300 hover:bg-rose-50">
                <Trash2 className="w-4 h-4 mr-2" />Supprimer
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer ce contrat ?</AlertDialogTitle>
                <AlertDialogDescription>
                  {contrat.statut === "brouillon"
                    ? "Ce contrat est en brouillon : il sera supprimé définitivement."
                    : "Ce contrat sera marqué comme résilié (soft delete)."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={doDelete} disabled={deleting}>
                  {deleting ? "Suppression..." : "Confirmer"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      }
    >
      <div style={{ display: "grid", gap: "22px", gridTemplateColumns: "minmax(0,1fr)" }}>
        {/* Informations */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: "#0B0F2E" }}>
                Informations
              </div>
              {editing && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
                    <X className="w-4 h-4 mr-2" />Annuler
                  </Button>
                  <Button size="sm" onClick={saveEdit} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Enregistrer
                  </Button>
                </div>
              )}
            </div>

            {editing && edit ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label>Titre</Label>
                  <Input
                    value={edit.titre}
                    onChange={e => setEdit({ ...edit, titre: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={edit.type_contrat} onValueChange={v => setEdit({ ...edit, type_contrat: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Renouvellement</Label>
                  <Select
                    value={edit.action_renouvellement}
                    onValueChange={v => setEdit({ ...edit, action_renouvellement: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aucun">Aucun</SelectItem>
                      <SelectItem value="tacite">Tacite</SelectItem>
                      <SelectItem value="manuel">Manuel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Date de début</Label>
                  <Input type="date" value={edit.date_debut} onChange={e => setEdit({ ...edit, date_debut: e.target.value })} />
                </div>
                <div>
                  <Label>Date de fin</Label>
                  <Input type="date" value={edit.date_fin} onChange={e => setEdit({ ...edit, date_fin: e.target.value })} />
                </div>
                <div>
                  <Label>Montant</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={edit.montant}
                    onChange={e => setEdit({ ...edit, montant: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Devise</Label>
                  <Select value={edit.devise} onValueChange={v => setEdit({ ...edit, devise: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEVISES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label>Fréquence de facturation</Label>
                  <Select
                    value={edit.frequence_facturation}
                    onValueChange={v => setEdit({ ...edit, frequence_facturation: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FREQUENCES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label>Description</Label>
                  <Textarea rows={4} value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <Info label="Référence"       value={contrat.reference || "—"} />
                <Info label="Type"            value={TYPES.find(t => t.value === contrat.type_contrat)?.label || contrat.type_contrat} />
                <Info label="Client"          value={contrat.client?.full_name || "—"} />
                <Info label="Société"         value={contrat.societe?.nom || "—"} />
                <Info label="Date de début"   value={fmtDate(contrat.date_debut)} />
                <Info label="Date de fin"     value={fmtDate(contrat.date_fin)} />
                <Info label="Montant"         value={fmtMontant(montant, contrat.devise)} />
                <Info label="Fréquence"       value={contrat.frequence_facturation || "ponctuel"} />
                <Info label="Renouvellement"  value={contrat.action_renouvellement || "aucun"} />
                <Info label="Dernière MAJ"    value={fmtDateTime(contrat.updated_at)} />
                {contrat.description && (
                  <div className="md:col-span-2">
                    <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Description</div>
                    <div className="text-slate-800 whitespace-pre-wrap">{contrat.description}</div>
                  </div>
                )}
              </div>
            )}

            {error && !editing && (
              <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-3">
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions statut */}
        {!editing && (
          <ClientPanel>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: "#0B0F2E", marginBottom: 12 }}>
              Changer le statut
            </div>
            {nexts.length === 0 ? (
              <div className="text-sm text-slate-500">
                Aucune transition disponible depuis le statut <strong>{meta.label}</strong>.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {nexts.map(n => (
                  <Button
                    key={n.value}
                    variant="outline"
                    size="sm"
                    onClick={() => changeStatut(n.value)}
                    disabled={changingStatut}
                  >
                    {changingStatut ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    {n.label}
                  </Button>
                ))}
              </div>
            )}
          </ClientPanel>
        )}

        {/* Historique / conversation IA (stub) */}
        <ClientPanel>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: "#0B0F2E", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <History size={16} color="#4191FF" />
            Historique
          </div>
          <div className="text-sm text-slate-600 space-y-1">
            <div>Créé le {fmtDateTime(contrat.created_at)}</div>
            {contrat.updated_at && contrat.updated_at !== contrat.created_at && (
              <div>Dernière modification : {fmtDateTime(contrat.updated_at)}</div>
            )}
            {Array.isArray(contrat.conversation_ia) && contrat.conversation_ia.length > 0 && (
              <div className="text-slate-500">
                {contrat.conversation_ia.length} échange{contrat.conversation_ia.length > 1 ? "s" : ""} IA enregistré{contrat.conversation_ia.length > 1 ? "s" : ""}
              </div>
            )}
          </div>
        </ClientPanel>

        {/* Factures liées */}
        {contrat.client_id && (
          <ClientPanel>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: "#0B0F2E", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <FileText size={16} color="#2ECC8A" />
              Factures liées
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/client/factures`)}
            >
              Voir les factures du client
            </Button>
          </ClientPanel>
        )}
      </div>
    </ClientPageShell>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-slate-800 mt-0.5">{value}</div>
    </div>
  )
}
