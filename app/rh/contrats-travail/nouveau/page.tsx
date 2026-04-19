"use client"

/**
 * RH — Création d'un nouveau contrat de travail
 *
 * Réutilise :
 *   - POST /api/rh/contrats                (création)
 *   - POST /api/rh/contrats/[id]/signer    (génération token + envoi WhatsApp)
 *   - lib/rh/contratsTemplates             (templates WRA 2019)
 *
 * Multi-tenant : la société est déduite de l'employé sélectionné côté API,
 * mais on force aussi une sélection explicite côté UI pour filtrer la liste
 * employés.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, ArrowLeft, Save, Send, Briefcase, Calendar, Banknote, MapPin, ScrollText } from "lucide-react"
import { toast } from "sonner"
import { TEMPLATES, getTemplate, remplirTemplate, type ParamsContrat } from "@/lib/rh/contratsTemplates"

// ── Types ───────────────────────────────────────────────────────────────────
type Societe = { id: string; nom: string; brn?: string | null; adresse?: string | null; heures_semaine?: number | null; contact_principal_nom?: string | null }
type Employe = {
  id: string
  prenom: string | null
  nom: string | null
  poste?: string | null
  email?: string | null
  salaire_base?: number | null
  date_arrivee?: string | null
  nic?: string | null
  date_naissance?: string | null
  societe_id?: string | null
}

// Types de contrats UI (mappés vers ENUM DB + clé template)
type UIType = "CDI" | "CDD" | "Temps_partiel" | "Consultant" | "Stage" | "Saisonnier"

const UI_TYPES: { value: UIType; label: string; helper: string; templateKey: string; defaultEssai: number }[] = [
  { value: "CDI",          label: "CDI — Durée indéterminée",    helper: "Standard WRA 2019, période d'essai 90 j par défaut",      templateKey: "cdi",       defaultEssai: 90 },
  { value: "CDD",          label: "CDD — Durée déterminée",      helper: "Date de fin + motif obligatoires (WRA Art. 7/17)",         templateKey: "cdd",       defaultEssai: 30 },
  { value: "Saisonnier",   label: "Intérim / Saisonnier",        helper: "Mission courte durée, motif requis",                       templateKey: "cdd",       defaultEssai: 14 },
  { value: "Consultant",   label: "Prestation / Freelance",      helper: "Contrat d'indépendant, pas de lien de subordination",      templateKey: "consultant",defaultEssai: 0  },
  { value: "Stage",        label: "Stage",                        helper: "Convention de stage, durée limitée",                       templateKey: "cdd",       defaultEssai: 14 },
  { value: "Temps_partiel",label: "Temps partiel",                helper: "CDI ou CDD à temps partiel (WRA s.30)",                    templateKey: "cdi",       defaultEssai: 90 },
]

const SECTEURS: { value: string; label: string }[] = [
  { value: "general",  label: "Général" },
  { value: "sante",    label: "Santé / Médical" },
  { value: "bpo_it",   label: "BPO / IT" },
  { value: "tourisme", label: "Tourisme" },
  { value: "construction", label: "Construction" },
  { value: "epz",      label: "EPZ / Manufacture" },
  { value: "direction",label: "Direction" },
]

const MOTIFS_CDD: string[] = [
  "Remplacement salarié absent",
  "Accroissement temporaire d'activité",
  "Emploi saisonnier",
  "Mission spécifique / projet",
  "Contrat de formation",
]

const PERIODICITES: { value: string; label: string }[] = [
  { value: "mensuel", label: "Mensuel" },
  { value: "hebdo",   label: "Hebdomadaire" },
  { value: "horaire", label: "Horaire" },
]

// ── Utilitaires formulaire ──────────────────────────────────────────────────
const inputCls = "h-11 rounded-xl"
const triggerCls = "h-11 rounded-xl"

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs font-medium text-gray-600 mb-1 block">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  )
}

function Section({ icon, title, color, children }: { icon: React.ReactNode; title: string; color: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-2xl shadow-sm border-l-4 overflow-hidden" style={{ borderLeftColor: color }}>
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[#0B0F2E]" style={{ fontFamily: "Poppins, sans-serif" }}>
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {children}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function NouveauContratPage() {
  const router = useRouter()

  const [societes, setSocietes] = useState<Societe[]>([])
  const [societeId, setSocieteId] = useState<string>("")
  const [employes, setEmployes] = useState<Employe[]>([])

  const [form, setForm] = useState({
    employe_id: "",
    type_contrat: "CDI" as UIType,
    secteur: "general",
    date_debut: "",
    date_fin: "",
    periode_essai_jours: "90",
    salaire_brut: "",
    devise: "MUR",
    periodicite: "mensuel",
    heures_semaine: "45",
    lieu_travail: "",
    poste: "",
    motif_cdd: "",
    clauses_speciales: "",
  })
  const [saving, setSaving] = useState(false)

  // ── 1. Sociétés ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/comptable/societes")
      .then(r => r.json())
      .then((d: { societes?: Societe[] }) => {
        const list = d.societes ?? []
        setSocietes(list)
        if (list.length === 1) setSocieteId(list[0].id)
      })
      .catch(() => { /* ignore */ })
  }, [])

  // ── 2. Employés (par société) ──────────────────────────────────────────
  useEffect(() => {
    if (!societeId) { setEmployes([]); return }
    fetch(`/api/rh/employes?societe_id=${societeId}`)
      .then(r => r.json())
      .then((d: { employes?: Employe[] }) => setEmployes(d.employes ?? []))
      .catch(() => setEmployes([]))
    setForm(f => ({ ...f, employe_id: "" }))
  }, [societeId])

  // ── 3. Ajustements auto selon le type de contrat ───────────────────────
  const typeInfo = useMemo(() => UI_TYPES.find(t => t.value === form.type_contrat) ?? UI_TYPES[0], [form.type_contrat])
  useEffect(() => {
    // Remet la période d'essai par défaut selon le type
    setForm(f => ({ ...f, periode_essai_jours: String(typeInfo.defaultEssai) }))
  }, [typeInfo])

  // ── 4. Préremplissage depuis fiche employé ─────────────────────────────
  useEffect(() => {
    const emp = employes.find(e => e.id === form.employe_id)
    if (!emp) return
    setForm(f => ({
      ...f,
      salaire_brut:  f.salaire_brut  || (emp.salaire_base != null ? String(emp.salaire_base) : ""),
      poste:         f.poste         || emp.poste || "",
      date_debut:    f.date_debut    || (emp.date_arrivee ? String(emp.date_arrivee).slice(0, 10) : ""),
    }))
  }, [form.employe_id, employes])

  // ── 5. Préremplissage horaires depuis la société ───────────────────────
  useEffect(() => {
    const soc = societes.find(s => s.id === societeId)
    if (!soc) return
    if (soc.heures_semaine != null) {
      setForm(f => ({ ...f, heures_semaine: String(soc.heures_semaine) }))
    }
  }, [societeId, societes])

  // ── 6. Validation ──────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!societeId) return "Société requise"
    if (!form.employe_id) return "Employé requis"
    if (!form.date_debut) return "Date de début requise"
    if ((form.type_contrat === "CDD" || form.type_contrat === "Stage" || form.type_contrat === "Saisonnier") && !form.date_fin) {
      return `Date de fin requise pour un contrat ${form.type_contrat}`
    }
    if (form.type_contrat === "CDD" && !form.motif_cdd) {
      return "Motif du CDD obligatoire (WRA Art. 7)"
    }
    if (Number(form.periode_essai_jours) > 180) return "Période d'essai max 180 jours (WRA Art. 35)"
    if (!form.salaire_brut || Number(form.salaire_brut) <= 0) return "Salaire brut requis"
    return null
  }

  // ── 7. Construction du HTML (template) ─────────────────────────────────
  const buildHtml = useCallback((): string => {
    const emp = employes.find(e => e.id === form.employe_id)
    const soc = societes.find(s => s.id === societeId)
    if (!emp || !soc) return ""
    const params: ParamsContrat = {
      societe_nom:  soc.nom,
      societe_brn:  soc.brn ?? "—",
      societe_adresse: soc.adresse ?? "—",
      employe_nom:  emp.nom ?? "",
      employe_prenom: emp.prenom ?? "",
      employe_nic:  emp.nic ?? "—",
      employe_dob:  emp.date_naissance ?? "—",
      poste:        form.poste || emp.poste || "—",
      salaire_base: Number(form.salaire_brut) || 0,
      date_debut:   form.date_debut,
      date_fin:     form.date_fin || undefined,
      periode_essai: Number(form.periode_essai_jours) || 0,
      lieu_travail: form.lieu_travail || "—",
      heures_semaine: Number(form.heures_semaine) || 45,
      motif_cdd:    form.motif_cdd || undefined,
      clauses_speciales: form.clauses_speciales ? form.clauses_speciales.split("\n").filter(Boolean) : undefined,
      signataire_nom_complet: soc.contact_principal_nom ?? undefined,
    }
    const key = `${typeInfo.templateKey}_${form.secteur}`
    const tpl = TEMPLATES[key] ? TEMPLATES[key] : getTemplate(typeInfo.templateKey, form.secteur)
    let html = remplirTemplate(tpl, params)
    // Ajout éventuel de clauses spéciales en fin de contrat
    if (form.clauses_speciales.trim()) {
      const clauseBlock =
        `<h3 style="border-top:1px solid #ccc; padding-top:15px; margin-top:20px;">CLAUSES SPÉCIALES</h3>` +
        `<p style="white-space:pre-line;">${form.clauses_speciales.replace(/</g, "&lt;")}</p>`
      html = html.replace(/<div style="margin-top: 50px; display: flex;/, clauseBlock + '<div style="margin-top: 50px; display: flex;')
    }
    return html
  }, [employes, form, societeId, societes, typeInfo])

  // ── 8. Enregistrement ──────────────────────────────────────────────────
  const handleSave = async (sendForSignature: boolean) => {
    const err = validate()
    if (err) { toast.error(err); return }

    setSaving(true)
    try {
      const html_content = buildHtml()
      const res = await fetch("/api/rh/contrats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employe_id:   form.employe_id,
          type_contrat: form.type_contrat,
          secteur:      form.secteur,
          date_debut:   form.date_debut,
          date_fin:     form.date_fin || null,
          salaire_brut: Number(form.salaire_brut),
          poste:        form.poste,
          html_content,
          notes:        form.clauses_speciales || null,
          motif_cdd:    form.motif_cdd || null,
          periode_essai_jours: Number(form.periode_essai_jours) || 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)

      const newId = data?.contrat?.id as string | undefined
      if (!newId) throw new Error("Contrat créé mais ID manquant")

      if (sendForSignature) {
        // Génère le token + envoie WhatsApp si téléphone employé disponible
        const sig = await fetch(`/api/rh/contrats/${newId}/signer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "generer_token" }),
        })
        const sigData = await sig.json()
        if (!sig.ok) {
          toast.error(`Contrat créé, mais envoi signature échoué : ${sigData?.error || sig.status}`)
        } else if (sigData.whatsapp_envoye) {
          toast.success("Contrat créé et envoyé par WhatsApp")
        } else {
          toast.success("Contrat créé. Lien de signature prêt dans le détail.")
        }
      } else {
        toast.success("Brouillon enregistré")
      }

      router.push(`/rh/contrats-travail/${newId}`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement")
    } finally {
      setSaving(false)
    }
  }

  const needDateFin = form.type_contrat !== "CDI" && form.type_contrat !== "Temps_partiel" && form.type_contrat !== "Consultant"
  const needMotifCdd = form.type_contrat === "CDD"

  return (
    <ClientPageShell
      breadcrumbs={[
        { label: "RH", href: "/rh" },
        { label: "Contrats Travail", href: "/rh/contrats-travail" },
        { label: "Nouveau" },
      ]}
      kicker="Ressources humaines"
      title="Nouveau contrat de travail"
      subtitle="Sélectionnez l'employé, choisissez le type de contrat et ses conditions. Le HTML est pré-généré depuis nos templates WRA 2019."
      actions={
        <Link href="/rh/contrats-travail">
          <Button variant="outline" className="rounded-xl">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Retour
          </Button>
        </Link>
      }
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-10 relative z-10 space-y-4">

        {/* ── Section 1 : Parties ────────────────────────────────────────── */}
        <Section icon={<Briefcase className="h-4 w-4" />} title="Parties au contrat" color="#4191FF">
          <FormField label="Société" required>
            <Select value={societeId} onValueChange={setSocieteId}>
              <SelectTrigger className={triggerCls}><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
              <SelectContent>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Employé" required>
            <Select
              value={form.employe_id}
              onValueChange={(v) => setForm(f => ({ ...f, employe_id: v }))}
              disabled={!societeId || employes.length === 0}
            >
              <SelectTrigger className={triggerCls}>
                <SelectValue placeholder={societeId ? "Sélectionner un employé…" : "Choisissez d'abord une société"} />
              </SelectTrigger>
              <SelectContent>
                {employes.map(e => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.prenom} {e.nom} {e.poste ? `— ${e.poste}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </Section>

        {/* ── Section 2 : Type & durée ───────────────────────────────────── */}
        <Section icon={<Calendar className="h-4 w-4" />} title="Type de contrat & durée" color="#10B981">
          <FormField label="Type" required>
            <Select
              value={form.type_contrat}
              onValueChange={(v) => setForm(f => ({ ...f, type_contrat: v as UIType }))}
            >
              <SelectTrigger className={triggerCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                {UI_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-gray-500 mt-1">{typeInfo.helper}</p>
          </FormField>
          <FormField label="Secteur">
            <Select value={form.secteur} onValueChange={(v) => setForm(f => ({ ...f, secteur: v }))}>
              <SelectTrigger className={triggerCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                {SECTEURS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Date de début" required>
            <Input
              type="date"
              value={form.date_debut}
              onChange={(e) => setForm(f => ({ ...f, date_debut: e.target.value }))}
              className={inputCls}
            />
          </FormField>
          <FormField label={needDateFin ? "Date de fin" : "Date de fin (optionnelle)"} required={needDateFin}>
            <Input
              type="date"
              value={form.date_fin}
              onChange={(e) => setForm(f => ({ ...f, date_fin: e.target.value }))}
              className={inputCls}
              disabled={form.type_contrat === "CDI"}
            />
          </FormField>
          <FormField label="Période d'essai (jours)">
            <Input
              type="number"
              min={0}
              max={180}
              value={form.periode_essai_jours}
              onChange={(e) => setForm(f => ({ ...f, periode_essai_jours: e.target.value }))}
              className={inputCls}
            />
            <p className="text-[11px] text-gray-500 mt-1">Max 180 j (WRA Art. 35). CDI : 90 j standard.</p>
          </FormField>
          {needMotifCdd && (
            <FormField label="Motif du CDD" required>
              <Select value={form.motif_cdd} onValueChange={(v) => setForm(f => ({ ...f, motif_cdd: v }))}>
                <SelectTrigger className={triggerCls}><SelectValue placeholder="Sélectionner un motif légal…" /></SelectTrigger>
                <SelectContent>
                  {MOTIFS_CDD.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          )}
        </Section>

        {/* ── Section 3 : Rémunération ───────────────────────────────────── */}
        <Section icon={<Banknote className="h-4 w-4" />} title="Rémunération" color="#F59E0B">
          <FormField label="Salaire brut" required>
            <Input
              type="number"
              step="0.01"
              value={form.salaire_brut}
              onChange={(e) => setForm(f => ({ ...f, salaire_brut: e.target.value }))}
              className={inputCls}
            />
          </FormField>
          <FormField label="Devise">
            <Select value={form.devise} onValueChange={(v) => setForm(f => ({ ...f, devise: v }))}>
              <SelectTrigger className={triggerCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MUR">MUR — Roupie Maurice</SelectItem>
                <SelectItem value="EUR">EUR — Euro</SelectItem>
                <SelectItem value="USD">USD — Dollar US</SelectItem>
                <SelectItem value="GBP">GBP — Livre Sterling</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Périodicité">
            <Select value={form.periodicite} onValueChange={(v) => setForm(f => ({ ...f, periodicite: v }))}>
              <SelectTrigger className={triggerCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODICITES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Heures / semaine">
            <Input
              type="number"
              min={0}
              max={90}
              value={form.heures_semaine}
              onChange={(e) => setForm(f => ({ ...f, heures_semaine: e.target.value }))}
              className={inputCls}
            />
            <p className="text-[11px] text-gray-500 mt-1">Standard Maurice : 45 h / semaine (WRA s.23)</p>
          </FormField>
        </Section>

        {/* ── Section 4 : Poste & lieu ───────────────────────────────────── */}
        <Section icon={<MapPin className="h-4 w-4" />} title="Poste & lieu de travail" color="#8B5CF6">
          <FormField label="Fonction / poste" required>
            <Input
              value={form.poste}
              onChange={(e) => setForm(f => ({ ...f, poste: e.target.value }))}
              className={inputCls}
              placeholder="Ex : Comptable senior"
            />
          </FormField>
          <FormField label="Lieu de travail">
            <Input
              value={form.lieu_travail}
              onChange={(e) => setForm(f => ({ ...f, lieu_travail: e.target.value }))}
              className={inputCls}
              placeholder="Ex : Ebene Cybercity"
            />
          </FormField>
        </Section>

        {/* ── Section 5 : Clauses spéciales ──────────────────────────────── */}
        <Section icon={<ScrollText className="h-4 w-4" />} title="Clauses spéciales" color="#EC4899">
          <div className="sm:col-span-2">
            <Label className="text-xs font-medium text-gray-600 mb-1 block">Texte libre — ajouté en fin de contrat</Label>
            <Textarea
              value={form.clauses_speciales}
              onChange={(e) => setForm(f => ({ ...f, clauses_speciales: e.target.value }))}
              rows={5}
              className="rounded-xl"
              placeholder="Ex : Non-concurrence 12 mois, mobilité, bonus sur objectifs…"
            />
          </div>
        </Section>

        {/* ── Actions ────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 justify-end pt-4">
          <Button
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={saving}
            className="rounded-xl"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
            Enregistrer en brouillon
          </Button>
          <Button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="bg-[#0B0F2E] hover:bg-[#1a1f4a] text-white rounded-xl"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
            Créer et envoyer pour signature
          </Button>
        </div>
      </div>
    </ClientPageShell>
  )
}
