"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  ArrowLeft, Save, Sparkles, Loader2, CheckCircle2, FileSignature,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { ClientPanel } from "@/components/client/ClientKit"

const FONT = "'Poppins', sans-serif"

interface ClientProfile {
  id: string
  full_name: string | null
  email: string | null
}
interface Societe { id: string; nom: string }

const TEMPLATES = [
  { id: "cdi_prestataire",  label: "CDI prestataire",   type: "cdi_prestataire",   desc: "Contrat prestataire à durée indéterminée" },
  { id: "saas_abonnement",  label: "SaaS abonnement",   type: "saas_abonnement",   desc: "Abonnement récurrent à un logiciel SaaS" },
  { id: "maintenance",      label: "Maintenance",       type: "maintenance",       desc: "Contrat de maintenance technique" },
  { id: "nda",              label: "NDA",               type: "nda",               desc: "Accord de confidentialité" },
  { id: "consulting",       label: "Consulting",        type: "consulting",        desc: "Mission de conseil ponctuelle" },
  { id: "lettre_mission",   label: "Lettre de mission", type: "lettre_mission",    desc: "Mission comptable récurrente" },
  { id: "autre",            label: "Autre",             type: "autre",             desc: "Contrat sur mesure" },
] as const

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

interface FormState {
  titre: string
  type_contrat: string
  client_id: string
  societe_id: string
  date_debut: string
  date_fin: string
  montant: string
  devise: string
  frequence_facturation: string
  description: string
}

const EMPTY: FormState = {
  titre: "",
  type_contrat: "lettre_mission",
  client_id: "",
  societe_id: "",
  date_debut: "",
  date_fin: "",
  montant: "",
  devise: "MUR",
  frequence_facturation: "ponctuel",
  description: "",
}

export default function NouveauContratPage() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [clients, setClients] = useState<ClientProfile[]>([])
  const [societes, setSocietes] = useState<Societe[]>([])
  const [loadingRefs, setLoadingRefs] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const [cRes, sRes] = await Promise.all([
          fetch("/api/comptable/clients").catch(() => null),
          fetch("/api/client/societes").catch(() => null),
        ])
        if (cRes && cRes.ok) {
          const j = (await cRes.json()) as { clients?: ClientProfile[] }
          setClients(j.clients || [])
        }
        if (sRes && sRes.ok) {
          const j = (await sRes.json()) as { societes?: Societe[] }
          setSocietes(j.societes || [])
        }
      } catch {
        // ignore — champs restent vides, les selects afficheront "aucune option"
      } finally {
        setLoadingRefs(false)
      }
    })()
  }, [])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const applyTemplate = (id: string) => {
    const t = TEMPLATES.find(t => t.id === id)
    if (!t) return
    setForm(f => ({
      ...f,
      type_contrat: t.type,
      titre: f.titre || t.label,
      frequence_facturation: t.id === "saas_abonnement" ? "mensuel"
        : t.id === "maintenance" ? "mensuel"
        : t.id === "cdi_prestataire" ? "mensuel"
        : f.frequence_facturation,
    }))
  }

  const save = async (finaliser: boolean) => {
    if (!form.titre.trim()) {
      setError("Le titre est requis")
      return
    }
    setError(null)
    setSaving(true)
    try {
      // 1. Création via POST (gère la logique IA + insertion)
      const createRes = await fetch("/api/contrats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre: form.titre.trim(),
          type_contrat: form.type_contrat,
          client_id: form.client_id || undefined,
          societe_id: form.societe_id || undefined,
        }),
      })
      const createJson = (await createRes.json()) as {
        data?: { id: string }; error?: string
      }
      if (!createRes.ok || !createJson.data?.id) {
        throw new Error(createJson.error || "Erreur création")
      }

      const id = createJson.data.id

      // 2. PATCH pour enrichir avec les autres champs + statut final
      const patchBody: Record<string, unknown> = {
        id,
        date_debut: form.date_debut || null,
        date_fin: form.date_fin || null,
        montant: form.montant ? Number(form.montant) : null,
        devise: form.devise,
        frequence_facturation: form.frequence_facturation,
        description: form.description || null,
        statut: finaliser ? "a_valider" : "brouillon",
      }
      const patchRes = await fetch("/api/contrats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      })
      if (!patchRes.ok) {
        const j = (await patchRes.json()) as { error?: string }
        throw new Error(j.error || "Erreur mise à jour")
      }

      router.push(`/client/contrats-clients/${id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ClientPageShell
      breadcrumbs={[
        { label: "Espace client",    href: "/client" },
        { label: "Contrats Clients", href: "/client/contrats-clients" },
        { label: "Nouveau contrat" },
      ]}
      kicker="Création"
      title="Nouveau contrat client"
      subtitle="Choisissez un modèle, renseignez les paramètres clés, puis enregistrez en brouillon ou finalisez."
      actions={
        <Button variant="outline" onClick={() => router.push("/client/contrats-clients")}>
          <ArrowLeft className="w-4 h-4 mr-2" />Retour
        </Button>
      }
    >
      <div style={{ display: "grid", gap: "22px", gridTemplateColumns: "minmax(0,1fr)" }}>
        {/* Templates */}
        <ClientPanel>
          <div className="mb-4">
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: "#0B0F2E" }}>
              1. Choisissez un modèle
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Les modèles pré-remplissent type et fréquence. Vous pouvez les ajuster ensuite.
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gap: "12px",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            }}
          >
            {TEMPLATES.map(t => {
              const active = form.type_contrat === t.type
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t.id)}
                  style={{
                    textAlign: "left",
                    padding: "14px",
                    borderRadius: "12px",
                    border: active ? "2px solid #D4AF37" : "1px solid #D8DFED",
                    backgroundColor: active ? "#FFFBEA" : "#FFFFFF",
                    cursor: "pointer",
                    transition: "all 0.18s",
                    fontFamily: FONT,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <FileSignature size={16} color={active ? "#A88925" : "#4191FF"} />
                    <div style={{ fontWeight: 700, color: "#0B0F2E", fontSize: 14 }}>
                      {t.label}
                    </div>
                    {active && <CheckCircle2 size={14} color="#2ECC8A" style={{ marginLeft: "auto" }} />}
                  </div>
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 6 }}>{t.desc}</div>
                </button>
              )
            })}
          </div>
        </ClientPanel>

        {/* Formulaire */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: "#0B0F2E" }}>
              2. Informations du contrat
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Titre <span className="text-red-500">*</span></Label>
                <Input
                  value={form.titre}
                  onChange={e => set("titre", e.target.value)}
                  placeholder="Ex. Convention d'honoraires — ACME Ltd"
                />
              </div>

              <div>
                <Label>Type de contrat</Label>
                <Select value={form.type_contrat} onValueChange={v => set("type_contrat", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Client</Label>
                <Select
                  value={form.client_id || "none"}
                  onValueChange={v => set("client_id", v === "none" ? "" : v)}
                  disabled={loadingRefs}
                >
                  <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Aucun —</SelectItem>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name || c.email || c.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Société</Label>
                <Select
                  value={form.societe_id || "none"}
                  onValueChange={v => set("societe_id", v === "none" ? "" : v)}
                  disabled={loadingRefs}
                >
                  <SelectTrigger><SelectValue placeholder="Aucune" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Aucune —</SelectItem>
                    {societes.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Date de début</Label>
                <Input
                  type="date"
                  value={form.date_debut}
                  onChange={e => set("date_debut", e.target.value)}
                />
              </div>

              <div>
                <Label>Date de fin</Label>
                <Input
                  type="date"
                  value={form.date_fin}
                  onChange={e => set("date_fin", e.target.value)}
                />
              </div>

              <div>
                <Label>Montant</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.montant}
                  onChange={e => set("montant", e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div>
                <Label>Devise</Label>
                <Select value={form.devise} onValueChange={v => set("devise", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEVISES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label>Fréquence de facturation</Label>
                <Select
                  value={form.frequence_facturation}
                  onValueChange={v => set("frequence_facturation", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCES.map(f => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label>Description</Label>
                <Textarea
                  rows={4}
                  value={form.description}
                  onChange={e => set("description", e.target.value)}
                  placeholder="Objet, périmètre, livrables…"
                />
              </div>
            </div>

            {error && (
              <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-3">
                {error}
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => alert("Génération assistée par IA — à venir dans une prochaine itération.")}
              >
                <Sparkles className="w-4 h-4 mr-2" />Générer avec IA
              </Button>
              <div className="flex-1" />
              <Button
                variant="outline"
                onClick={() => save(false)}
                disabled={saving || !form.titre.trim()}
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Enregistrer brouillon
              </Button>
              <Button
                onClick={() => save(true)}
                disabled={saving || !form.titre.trim()}
                style={{
                  background: "linear-gradient(135deg, #4191FF 0%, #D4AF37 100%)",
                  color: "#0B0F2E",
                  fontWeight: 700,
                  fontFamily: FONT,
                  border: "none",
                }}
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Finaliser
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ClientPageShell>
  )
}
