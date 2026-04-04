"use client"
import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import {
  Loader2, Save, Building2, Phone, Banknote, Settings,
  MapPin, CheckCircle, AlertCircle, FileText, Scale,
  Shield, Download, ChevronDown, ChevronUp, Eye,
} from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

// ── Fluid input: defaultValue + onBlur, never re-renders on every keystroke ──
function Field({
  label, name, defaultValue, type = "text", placeholder, step, required,
  onChange,
}: {
  label: string
  name: string
  defaultValue?: string | number | null
  type?: string
  placeholder?: string
  step?: string
  required?: boolean
  onChange: (name: string, value: string | number) => void
}) {
  return (
    <div>
      <Label className="text-xs text-gray-600 mb-1 block">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <Input
        key={String(defaultValue ?? "")}
        type={type}
        step={step}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        onBlur={e => {
          const raw = e.target.value
          const val = type === "number" ? (raw === "" ? "" : Number(raw)) : raw
          onChange(name, val as string | number)
        }}
        className="h-9 text-sm"
      />
    </div>
  )
}

type Tab = "details" | "contact" | "bank" | "rh" | "fiscal" | "audit"

interface TabBtnProps { id: Tab; label: string; icon: React.ReactNode; active: boolean; onClick: () => void }
function TabBtn({ id, label, icon, active, onClick }: TabBtnProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap
        ${active ? "text-white" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}
      style={active ? { backgroundColor: NAVY } : {}}
    >
      {icon}{label}
    </button>
  )
}

// ── DETAILS TAB ────────────────────────────────────────────────────────────────
function DetailsTab({ data, onSave }: { data: any; onSave: (d: any) => void }) {
  const f = useRef({ ...data })
  const u = (k: string, v: any) => { f.current[k] = v }
  const [tva, setTva] = useState<boolean>(!!data.statut_tva)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Field label="Nom de la société" name="nom" defaultValue={data.nom} required onChange={u} />
          <Field label="Nom court" name="short_name" defaultValue={data.short_name} placeholder="Ex: DDS" onChange={u} />
          <Field label="ERN (Employer Registration Number)" name="ern" defaultValue={data.ern} placeholder="Ex: 02276097" onChange={u} />
          <Field label="NPF No." name="npf_number" defaultValue={data.npf_number} placeholder="Ex: 02276097" onChange={u} />
          <Field label="Date d'incorporation" name="date_incorporation" type="date" defaultValue={data.date_incorporation} onChange={u} />
        </div>
        <div className="space-y-4">
          <Field label="BRN (Business Registration Number)" name="brn" defaultValue={data.brn} placeholder="Ex: C20173522" onChange={u} />
          <Field label="PAYE Number (MRA)" name="paye_number" defaultValue={data.paye_number} placeholder="Ex: P1234567" onChange={u} />
          <Field label="CSG Number" name="csg_number" defaultValue={data.csg_number} placeholder="Ex: CSG123456" onChange={u} />
          <Field label="NSF Number" name="nsf_number" defaultValue={data.nsf_number} placeholder="Ex: NSF789012" onChange={u} />
          <Field label="Numéro TVA MRA" name="numero_tva_mra" defaultValue={data.numero_tva_mra} onChange={u} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Field label="Nature of Business" name="nature_business" defaultValue={data.nature_business} placeholder="Ex: BPO, Télémedecine" onChange={u} />
          <Field label="Secteur d'activité" name="secteur_activite" defaultValue={data.secteur_activite} onChange={u} />
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border mt-5">
            <Switch
              checked={tva}
              onCheckedChange={v => { setTva(v); u("statut_tva", v) }}
            />
            <Label className="cursor-pointer">Assujetti à la TVA</Label>
          </div>
        </div>
      </div>

      <Button
        onClick={() => onSave({ ...f.current, statut_tva: tva })}
        style={{ backgroundColor: NAVY }}
        className="text-white hover:opacity-90"
      >
        <Save className="h-4 w-4 mr-2" /> Enregistrer les détails
      </Button>
    </div>
  )
}

// ── CONTACT TAB ────────────────────────────────────────────────────────────────
function ContactTab({ data, onSave }: { data: any; onSave: (d: any) => void }) {
  const f = useRef({ ...data })
  const u = (k: string, v: any) => { f.current[k] = v }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">Personne de contact</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nom" name="contact_name" defaultValue={data.contact_name} placeholder="Stephane Bach" onChange={u} />
          <Field label="Fonction" name="contact_position" defaultValue={data.contact_position} placeholder="CEO" onChange={u} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">Coordonnées</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Adresse" name="adresse" defaultValue={data.adresse} placeholder="Bourdet Road" onChange={u} />
          <Field label="Téléphone" name="telephone" defaultValue={data.telephone} placeholder="52503644" onChange={u} />
          <Field label="Adresse (ligne 2)" name="adresse2" defaultValue={data.adresse2} onChange={u} />
          <Field label="Fax" name="fax" defaultValue={data.fax} onChange={u} />
          <Field label="Ville" name="ville" defaultValue={data.ville} placeholder="Grand Baie" onChange={u} />
          <Field label="Email" name="email" type="email" defaultValue={data.email} onChange={u} />
          <Field label="Email DCO (Data Controller)" name="email_dco" type="email" defaultValue={data.email_dco} onChange={u} />
          <Field label="Site web" name="website" defaultValue={data.website} placeholder="https://www.example.mu" onChange={u} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Localisation GPS (pour pointage)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Latitude" name="latitude" type="number" step="any" defaultValue={data.latitude} onChange={u} />
          <Field label="Longitude" name="longitude" type="number" step="any" defaultValue={data.longitude} onChange={u} />
          <Field label="Rayon pointage (mètres)" name="distance_pointage" type="number" defaultValue={data.distance_pointage ?? 50} onChange={u} />
        </CardContent>
      </Card>

      <Button onClick={() => onSave(f.current)} style={{ backgroundColor: NAVY }} className="text-white hover:opacity-90">
        <Save className="h-4 w-4 mr-2" /> Enregistrer les coordonnées
      </Button>
    </div>
  )
}

// ── BANKING TAB ────────────────────────────────────────────────────────────────
function BankTab({ data, onSave }: { data: any; onSave: (d: any) => void }) {
  const f = useRef({ ...data })
  const u = (k: string, v: any) => { f.current[k] = v }
  const [bankAccounts, setBankAccounts] = useState<any[]>([])
  const [devises, setDevises] = useState<string[]>(
    data.devises_actives
      ? (typeof data.devises_actives === "string" ? JSON.parse(data.devises_actives) : data.devises_actives)
      : ["MUR", "EUR", "USD"]
  )
  const ALL_DEVISES = ["MUR", "EUR", "USD", "GBP", "JPY", "ZAR", "INR", "MGA", "SCR", "NZD", "CHF", "AUD", "CAD", "SGD"]

  useEffect(() => {
    if (data.id) {
      fetch(`/api/comptable/banque?societe_id=${data.id}`)
        .then(r => r.json())
        .then(d => setBankAccounts(d.comptes || []))
        .catch(() => {})
    }
  }, [data.id])

  const toggleDevise = (d: string, checked: boolean) => {
    const next = checked ? [...devises, d] : devises.filter(x => x !== d)
    setDevises(next)
    f.current.devises_actives = next
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">Coordonnées bancaires principales</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Nom de la banque" name="bank_name" defaultValue={data.bank_name} placeholder="MCB, SBM, ABC…" onChange={u} />
          <Field label="Numéro de compte" name="bank_account_number" defaultValue={data.bank_account_number} placeholder="000000000000" onChange={u} />
          <Field label="IBAN" name="iban" defaultValue={data.iban} placeholder="MU12MCBL0100…" onChange={u} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">Comptes bancaires (relevés importés)</CardTitle>
        </CardHeader>
        <CardContent>
          {bankAccounts.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">
              Aucun compte bancaire. Les comptes sont créés automatiquement lors de l'import d'un relevé.
            </p>
          ) : (
            <div className="space-y-3">
              {bankAccounts.map((b: any) => (
                <div key={b.id} className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <Badge style={{ backgroundColor: NAVY }} className="text-white">{b.banque}</Badge>
                    <Badge variant="outline">{b.devise}</Badge>
                  </div>
                  <div className="mt-2 text-sm space-y-1">
                    <p><span className="text-gray-500">Compte:</span> {b.numero_compte || "—"}</p>
                    <p><span className="text-gray-500">IBAN:</span> {b.iban || "—"}</p>
                    {b.solde_actuel != null && (
                      <p>
                        <span className="text-gray-500">Solde:</span>{" "}
                        <span className="font-mono font-medium">
                          {Number(b.solde_actuel).toLocaleString("fr-FR")} {b.devise}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">Devises activées</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {ALL_DEVISES.map(d => (
              <label key={d} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 border">
                <input
                  type="checkbox"
                  checked={devises.includes(d)}
                  onChange={e => toggleDevise(d, e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium">{d}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => onSave(f.current)} style={{ backgroundColor: NAVY }} className="text-white hover:opacity-90">
        <Save className="h-4 w-4 mr-2" /> Enregistrer les données bancaires
      </Button>
    </div>
  )
}

// ── RH PARAMETERS TAB ─────────────────────────────────────────────────────────
function RhTab({ data, onSave }: { data: any; onSave: (d: any) => void }) {
  const f = useRef({ ...data })
  const u = (k: string, v: any) => { f.current[k] = v }
  const uSelect = (k: string) => (v: string) => { f.current[k] = v }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Temps de travail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Heures par semaine" name="heures_semaine" type="number" step="0.5" defaultValue={data.heures_semaine ?? 45} onChange={u} />
            <Field label="Jours travaillés / semaine" name="jours_travail_semaine" type="number" defaultValue={data.jours_travail_semaine ?? 5} onChange={u} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Politique de congés</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Congés annuels (jours / an)" name="conges_annuels_jours" type="number" defaultValue={data.conges_annuels_jours ?? 20} onChange={u} />
            <Field label="Congés maladie (jours / an)" name="conges_maladie_jours" type="number" defaultValue={data.conges_maladie_jours ?? 15} onChange={u} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Heures supplémentaires</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Taux normal (× salaire horaire)" name="ot_taux_normal" type="number" step="0.1" defaultValue={data.ot_taux_normal ?? 1.5} onChange={u} />
            <Field label="Taux majoré (jours fériés / nuit)" name="ot_taux_majore" type="number" step="0.1" defaultValue={data.ot_taux_majore ?? 2.0} onChange={u} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Paie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Jour de clôture du mois</Label>
              <Select defaultValue={String(data.period_closing_day ?? 24)} onValueChange={uSelect("period_closing_day")}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                    <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Jour de paiement</Label>
              <Select defaultValue={String(data.pay_day ?? 28)} onValueChange={uSelect("pay_day")}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Calcul du salaire</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Fréquence</Label>
              <Select defaultValue={data.salary_frequency ?? "monthly"} onValueChange={uSelect("salary_frequency")}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensuel</SelectItem>
                  <SelectItem value="fortnightly">Bimensuel</SelectItem>
                  <SelectItem value="weekly">Hebdomadaire</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">EOY Bonus (13ème mois)</Label>
              <Select defaultValue={data.eoy_bonus_mode ?? "separated"} onValueChange={uSelect("eoy_bonus_mode")}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="separated">Bulletin séparé</SelectItem>
                  <SelectItem value="included">Inclus dans le bulletin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Bulletin de paie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Template</Label>
              <Select defaultValue={data.payslip_template ?? "basic"} onValueChange={uSelect("payslip_template")}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="detailed">Détaillé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Langue d'impression</Label>
              <Select defaultValue={data.payslip_language ?? "fr"} onValueChange={uSelect("payslip_language")}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Déclaration MRA</Label>
              <Select defaultValue={data.declaration_type ?? "MRA_PACO"} onValueChange={uSelect("declaration_type")}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MRA_PACO">MRA (PACO)</SelectItem>
                  <SelectItem value="MRA_DIRECT">MRA Direct</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      <Button onClick={() => onSave(f.current)} style={{ backgroundColor: NAVY }} className="text-white hover:opacity-90">
        <Save className="h-4 w-4 mr-2" /> Enregistrer les paramètres RH
      </Button>
    </div>
  )
}

// ── FISCAL PARAMETERS TAB ──────────────────────────────────────────────────────
function FiscalTab({
  data, params, year, onSave,
}: {
  data: any
  params: any
  year: number
  onSave: (societeData: any, paramsData: any) => void
}) {
  const fSociete = useRef({ ...data })
  const fParams = useRef({ annee: year, ...(params ?? {}) })
  const uS = (k: string, v: any) => { fSociete.current[k] = v }
  const uP = (k: string, v: any) => { fParams.current[k] = v }

  const p = params ?? {}

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: `${NAVY}10` }}>
        <Scale className="h-4 w-4" style={{ color: NAVY }} />
        <span className="text-sm font-medium" style={{ color: NAVY }}>
          Paramètres fiscaux — Exercice {year} (Finance Act Mauritius)
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CSG */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">CSG — Contribution Sociale Généralisée</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Seuil taux réduit (MUR / mois)" name="csg_seuil_taux_reduit" type="number" defaultValue={p.csg_seuil_taux_reduit ?? 50000} onChange={uP} />
            <Separator />
            <p className="text-xs font-medium text-gray-500 uppercase">Salarié</p>
            <Field label="Taux réduit salarié (%)" name="csg_salarie_taux_reduit" type="number" step="0.01" defaultValue={p.csg_salarie_taux_reduit ?? 1.5} onChange={uP} />
            <Field label="Taux plein salarié (%)" name="csg_salarie_taux_plein" type="number" step="0.01" defaultValue={p.csg_salarie_taux_plein ?? 3} onChange={uP} />
            <Separator />
            <p className="text-xs font-medium text-gray-500 uppercase">Patronal</p>
            <Field label="Taux patronal (%)" name="csg_patronal" type="number" step="0.01" defaultValue={p.csg_patronal ?? 6} onChange={uP} />
            <Field label="Taux patronal réduit (%)" name="csg_patronal_taux_reduit" type="number" step="0.01" defaultValue={p.csg_patronal_taux_reduit ?? 3} onChange={uP} />
          </CardContent>
        </Card>

        {/* NSF */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">NSF — National Savings Fund</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Taux salarié NSF (%)" name="nsf_salarie" type="number" step="0.01" defaultValue={p.nsf_salarie ?? 1} onChange={uP} />
            <Field label="Taux patronal NSF (%)" name="nsf_patronal" type="number" step="0.01" defaultValue={p.nsf_patronal ?? 2.5} onChange={uP} />
          </CardContent>
        </Card>

        {/* PAYE */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">PAYE — Income Tax</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Seuil d'exonération (MUR / an)" name="paye_seuil_exoneration" type="number" defaultValue={p.paye_seuil_exoneration ?? 390000} onChange={uP} />
            <Field label="Taux 1 (%)" name="paye_taux_1" type="number" step="0.1" defaultValue={p.paye_taux_1 ?? 15} onChange={uP} />
            <Field label="Seuil taux 2 (MUR / an)" name="paye_seuil_taux_2" type="number" defaultValue={p.paye_seuil_taux_2 ?? 650000} onChange={uP} />
            <Field label="Taux 2 (%)" name="paye_taux_2" type="number" step="0.1" defaultValue={p.paye_taux_2 ?? 20} onChange={uP} />
          </CardContent>
        </Card>

        {/* Training Levy & PRGF */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Training Levy & PRGF</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Training Levy (%)" name="training_levy" type="number" step="0.01" defaultValue={p.training_levy ?? 1} onChange={uP} />
            <Separator />
            <p className="text-xs font-medium text-gray-500 uppercase">PRGF — Portable Retirement Gratuity Fund</p>
            <Field label="PRGF patronal par jour (MUR)" name="prgf_patronal_par_jour" type="number" step="0.01" defaultValue={p.prgf_patronal_par_jour ?? 2} onChange={uP} />
            <Field label="PRGF taux émoluments (%)" name="prgf_taux_emoluments" type="number" step="0.01" defaultValue={p.prgf_taux_emoluments ?? 0} onChange={uP} />
          </CardContent>
        </Card>

        {/* Salaire minimum */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Salaire minimum & compensation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Salaire minimum légal (MUR)" name="salaire_minimum" type="number" defaultValue={p.salaire_minimum ?? 16500} onChange={uP} />
            <Field label="Salaire minimum national (MUR)" name="salaire_minimum_national" type="number" defaultValue={p.salaire_minimum_national ?? 16500} onChange={uP} />
            <Field label="Salary compensation (MUR)" name="salary_compensation" type="number" defaultValue={p.salary_compensation ?? 1000} onChange={uP} />
            <Field label="Seuil compensation (MUR)" name="salary_compensation_seuil" type="number" defaultValue={p.salary_compensation_seuil ?? 50000} onChange={uP} />
          </CardContent>
        </Card>

        {/* Congés légaux */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Congés légaux</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Congés annuels — moins de 5 ans (jours)" name="conges_annuels_moins_5ans" type="number" defaultValue={p.conges_annuels_moins_5ans ?? 15} onChange={uP} />
            <Field label="Congés annuels — plus de 5 ans (jours)" name="conges_annuels_plus_5ans" type="number" defaultValue={p.conges_annuels_plus_5ans ?? 20} onChange={uP} />
            <Field label="Congés maladie (jours / an)" name="conges_maladie_annuels" type="number" defaultValue={p.conges_maladie_annuels ?? 15} onChange={uP} />
            <Field label="Congés maternité (semaines)" name="conges_maternite_semaines" type="number" defaultValue={p.conges_maternite_semaines ?? 16} onChange={uP} />
            <Field label="Congés paternité (semaines)" name="conges_paternite_semaines" type="number" defaultValue={p.conges_paternite_semaines ?? 4} onChange={uP} />
          </CardContent>
        </Card>
      </div>

      <Button
        onClick={() => onSave(fSociete.current, fParams.current)}
        style={{ backgroundColor: NAVY }}
        className="text-white hover:opacity-90"
      >
        <Save className="h-4 w-4 mr-2" /> Enregistrer les paramètres fiscaux
      </Button>
    </div>
  )
}

// ── AUDIT TRAIL TAB ───────────────────────────────────────────────────────────
const ACTION_COLORS: Record<string, { bg: string; text: string }> = {
  CREATE: { bg: "bg-green-100", text: "text-green-700" },
  UPDATE: { bg: "bg-blue-100", text: "text-blue-700" },
  DELETE: { bg: "bg-red-100", text: "text-red-700" },
  VIEW: { bg: "bg-gray-100", text: "text-gray-700" },
  EXPORT: { bg: "bg-purple-100", text: "text-purple-700" },
  SEND: { bg: "bg-orange-100", text: "text-orange-700" },
}

const ACTION_OPTIONS = ["CREATE", "UPDATE", "DELETE", "VIEW", "EXPORT", "SEND"]
const ENTITE_OPTIONS = ["employe", "bulletin_paie", "conge", "document", "societe", "planning", "prime", "contrat"]

function AuditTab({ societeId }: { societeId: string }) {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [filterAction, setFilterAction] = useState("")
  const [filterEntite, setFilterEntite] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ societe_id: societeId, page: String(page) })
      if (filterAction) params.set("action", filterAction)
      if (filterEntite) params.set("entite", filterEntite)
      if (dateFrom) params.set("date_from", dateFrom)
      if (dateTo) params.set("date_to", dateTo)
      const res = await fetch(`/api/rh/audit?${params}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setLogs(data.logs || [])
      setTotalPages(data.totalPages || 1)
      setTotal(data.total || 0)
    } catch (e) {
      console.error("[audit] fetch failed:", e)
      setLogs([])
    }
    setLoading(false)
  }

  useEffect(() => { loadLogs() }, [societeId, page, filterAction, filterEntite, dateFrom, dateTo])

  const handleExportCSV = () => {
    toast.success("Export CSV en cours de développement", {
      description: "Cette fonctionnalité sera disponible prochainement.",
    })
  }

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleString("fr-FR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    } catch { return d }
  }

  const renderDiff = (avant: any, apres: any) => {
    if (!avant && !apres) return <p className="text-gray-400 text-xs italic">Aucun détail disponible</p>
    const allKeys = [...new Set([...Object.keys(avant || {}), ...Object.keys(apres || {})])]
    const changedKeys = allKeys.filter(k => JSON.stringify(avant?.[k]) !== JSON.stringify(apres?.[k]))
    if (changedKeys.length === 0 && avant && apres) {
      return <p className="text-gray-400 text-xs italic">Aucune modification détectée</p>
    }
    return (
      <div className="space-y-1.5 text-xs">
        {avant && !apres && (
          <div className="p-2 bg-red-50 rounded border border-red-100">
            <p className="font-medium text-red-600 mb-1">Valeurs supprimées :</p>
            <pre className="whitespace-pre-wrap text-red-700 font-mono text-[11px]">
              {JSON.stringify(avant, null, 2)}
            </pre>
          </div>
        )}
        {!avant && apres && (
          <div className="p-2 bg-green-50 rounded border border-green-100">
            <p className="font-medium text-green-600 mb-1">Valeurs créées :</p>
            <pre className="whitespace-pre-wrap text-green-700 font-mono text-[11px]">
              {JSON.stringify(apres, null, 2)}
            </pre>
          </div>
        )}
        {avant && apres && changedKeys.map(k => (
          <div key={k} className="flex items-start gap-2">
            <span className="font-medium text-gray-600 min-w-[120px]">{k}</span>
            <span className="text-red-500 line-through">{JSON.stringify(avant[k])}</span>
            <span className="text-gray-400">→</span>
            <span className="text-green-600">{JSON.stringify(apres[k])}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Action</Label>
              <Select value={filterAction} onValueChange={v => { setFilterAction(v === "all" ? "" : v); setPage(1) }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Toutes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {ACTION_OPTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Entité</Label>
              <Select value={filterEntite} onValueChange={v => { setFilterEntite(v === "all" ? "" : v); setPage(1) }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Toutes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {ENTITE_OPTIONS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Du</Label>
              <Input type="date" className="h-9 text-sm" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Au</Label>
              <Input type="date" className="h-9 text-sm" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} />
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="h-9 text-sm w-full" onClick={handleExportCSV}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results info */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{total} entrée{total !== 1 ? "s" : ""} trouvée{total !== 1 ? "s" : ""}</span>
        {totalPages > 1 && <span>Page {page} / {totalPages}</span>}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: NAVY }} />
              <span className="ml-2 text-gray-500 text-sm">Chargement…</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              Aucune entrée dans le journal d'audit
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase">Date</th>
                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase">Utilisateur</th>
                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase">Action</th>
                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase">Entité</th>
                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase">Détails</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log: any) => {
                    const colors = ACTION_COLORS[log.action] || ACTION_COLORS.VIEW
                    const isExpanded = expandedId === log.id
                    return (
                      <>
                        <tr key={log.id} className="border-b hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(log.created_at)}</td>
                          <td className="px-4 py-3 text-gray-700">{log.utilisateur_nom}</td>
                          <td className="px-4 py-3">
                            <Badge className={`${colors.bg} ${colors.text} border-0 font-medium text-xs`}>
                              {log.action}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{log.entite}</td>
                          <td className="px-4 py-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => setExpandedId(isExpanded ? null : log.id)}
                            >
                              <Eye className="h-3 w-3" />
                              Voir détails
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </Button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${log.id}-details`} className="border-b">
                            <td colSpan={5} className="px-4 py-3 bg-gray-50">
                              {renderDiff(log.valeur_avant, log.valeur_apres)}
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            Précédent
          </Button>
          <span className="text-sm text-gray-500">
            Page {page} sur {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Suivant
          </Button>
        </div>
      )}
    </div>
  )
}

// ── MAIN PAGE ──────────────────────────────────────────────────────────────────
export default function SocieteSettingsPage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societeId, setSocieteId] = useState("")
  const [societe, setSociete] = useState<any>(null)
  const [paramsPaie, setParamsPaie] = useState<any>(null)
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "ok" | "err">("idle")
  const [saveMsg, setSaveMsg] = useState("")
  const [tab, setTab] = useState<Tab>("details")

  const loadData = async (sid?: string) => {
    setLoading(true)
    try {
      const url = sid
        ? `/api/rh/societe?societe_id=${sid}`
        : "/api/rh/societe"
      const res = await fetch(url)
      const data = await res.json()
      if (data.error) {
        console.error("[rh/societe] load error:", data.error)
        setSocietes([])
        setLoading(false)
        return
      }
      const list: any[] = data.societes || []
      setSocietes(list)
      if (data.societe) {
        setSociete(data.societe)
        setSocieteId(data.societe.id)
      } else if (list.length > 0 && !sid) {
        setSociete(list[0])
        setSocieteId(list[0].id)
      }
      if (data.params_paie) setParamsPaie(data.params_paie)
      if (data.current_year) setCurrentYear(data.current_year)
    } catch (e) {
      console.error("[rh/societe] fetch failed:", e)
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const handleSocieteChange = (id: string) => {
    setSocieteId(id)
    setSociete(null)
    setParamsPaie(null)
    loadData(id)
  }

  const flash = (ok: boolean, msg: string) => {
    setSaveStatus(ok ? "ok" : "err")
    setSaveMsg(msg)
    setTimeout(() => setSaveStatus("idle"), 4000)
  }

  // Save societe fields only (details / contact / bank / rh tabs)
  const handleSave = async (data: any) => {
    setSaving(true)
    try {
      const res = await fetch("/api/rh/societe", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: societeId, ...data }),
      })
      const result = await res.json()
      if (result.error) flash(false, result.error)
      else {
        if (result.societe) setSociete(result.societe)
        flash(true, "Paramètres enregistrés")
      }
    } catch { flash(false, "Erreur réseau") }
    setSaving(false)
  }

  // Save societe fields + params_paie (fiscal tab)
  const handleFiscalSave = async (societeData: any, paramsData: any) => {
    setSaving(true)
    try {
      const res = await fetch("/api/rh/societe", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: societeId,
          ...societeData,
          params_paie: paramsData,
        }),
      })
      const result = await res.json()
      if (result.error) flash(false, result.error)
      else {
        if (result.societe) setSociete(result.societe)
        if (result.params_paie) setParamsPaie(result.params_paie)
        flash(true, "Paramètres fiscaux enregistrés")
      }
    } catch { flash(false, "Erreur réseau") }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: NAVY }} />
        <span className="ml-3 text-gray-500">Chargement…</span>
      </div>
    )
  }

  if (!societe) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="h-10 w-10 text-orange-400" />
        <p className="text-gray-600 text-center">
          Aucune société trouvée. Veuillez vérifier votre accès ou créer une société.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            Fiche Société
          </h1>
          <p className="text-gray-500 text-sm">Configuration complète de votre entreprise</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {saveStatus === "ok" && (
            <Badge className="bg-green-100 text-green-700 border border-green-200">
              <CheckCircle className="h-3 w-3 mr-1" /> {saveMsg}
            </Badge>
          )}
          {saveStatus === "err" && (
            <Badge className="bg-red-100 text-red-700 border border-red-200">
              <AlertCircle className="h-3 w-3 mr-1" /> {saveMsg}
            </Badge>
          )}
          {saving && <Loader2 className="h-4 w-4 animate-spin" style={{ color: NAVY }} />}

          {/* Selector always visible */}
          <Select value={societeId} onValueChange={handleSocieteChange}>
            <SelectTrigger className="w-[220px]">
              <Building2 className="h-4 w-4 mr-2 opacity-60" />
              <SelectValue placeholder="Choisir une société" />
            </SelectTrigger>
            <SelectContent>
              {societes.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b gap-0.5 overflow-x-auto">
        <TabBtn id="details" label="Identité" icon={<Building2 className="h-3.5 w-3.5" />} active={tab === "details"} onClick={() => setTab("details")} />
        <TabBtn id="contact" label="Contact" icon={<Phone className="h-3.5 w-3.5" />} active={tab === "contact"} onClick={() => setTab("contact")} />
        <TabBtn id="bank" label="Banque" icon={<Banknote className="h-3.5 w-3.5" />} active={tab === "bank"} onClick={() => setTab("bank")} />
        <TabBtn id="rh" label="RH / Paie" icon={<Settings className="h-3.5 w-3.5" />} active={tab === "rh"} onClick={() => setTab("rh")} />
        <TabBtn id="fiscal" label="Fiscal" icon={<Scale className="h-3.5 w-3.5" />} active={tab === "fiscal"} onClick={() => setTab("fiscal")} />
        <TabBtn id="audit" label="Journal d'audit" icon={<Shield className="h-3.5 w-3.5" />} active={tab === "audit"} onClick={() => setTab("audit")} />
      </div>

      {/* Tab content — key forces full re-mount when société changes */}
      <div>
        {tab === "details" && (
          <DetailsTab key={`details-${societeId}`} data={societe} onSave={handleSave} />
        )}
        {tab === "contact" && (
          <ContactTab key={`contact-${societeId}`} data={societe} onSave={handleSave} />
        )}
        {tab === "bank" && (
          <BankTab key={`bank-${societeId}`} data={societe} onSave={handleSave} />
        )}
        {tab === "rh" && (
          <RhTab key={`rh-${societeId}`} data={societe} onSave={handleSave} />
        )}
        {tab === "fiscal" && (
          <FiscalTab
            key={`fiscal-${societeId}`}
            data={societe}
            params={paramsPaie}
            year={currentYear}
            onSave={handleFiscalSave}
          />
        )}
      </div>
    </div>
  )
}
