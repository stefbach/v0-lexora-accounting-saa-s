"use client"
import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Search, Plus, Loader2, Users, Upload, Download, FileSpreadsheet, Pencil, ExternalLink, UserPlus, Key, User, Briefcase, Banknote, Building2, Trash2, AlertTriangle, Eye, EyeOff, Mail, CheckCircle2, XCircle } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { BANQUES_MAURITIUS } from "@/lib/rh/banques-mauritius"
import { toast } from "sonner"

/* ── Section card for grouped form fields ── */
function FormSection({ icon, title, color, children }: { icon: React.ReactNode; title: string; color: string; children: React.ReactNode }) {
  return (
    <Card className={`rounded-2xl shadow-sm border-l-4 overflow-hidden`} style={{ borderLeftColor: color }}>
      <CardHeader className="pb-3 pt-4 px-4 sm:px-5">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[#0B0F2E]" style={{ fontFamily: "Poppins, sans-serif" }}>
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 sm:px-5 pb-4 pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {children}
        </div>
      </CardContent>
    </Card>
  )
}

/* ── Styled form field ── */
function FormField({ label, required, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs font-medium text-gray-600 mb-1 block">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  )
}

const inputClass = "h-11 rounded-xl"
const selectTriggerClass = "h-11 rounded-xl"

// ── Composant formulaire creation (state isole = pas de re-render parent) ──
function CreateEmployeForm({ societes, onCreated, onClose }: { societes: any[]; onCreated: () => void; onClose: () => void }) {
  const [form, setForm] = useState({ societe_id:"",nom:"",prenom:"",poste:"",email:"",telephone:"",salaire_base:"",transport_allowance:"0",petrol_allowance:"0",date_arrivee:"",role:"salarie",csg_categorie:"A",bank_account:"",bank_name:"",nic:"",tan:"",iban:"",genre:"",date_naissance:"",departement:"",type_contrat:"CDI",devise_salaire:"MUR" })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const u = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.societe_id) errs.societe_id = "Societe requise"
    if (!form.nom) errs.nom = "Nom requis"
    if (!form.prenom) errs.prenom = "Prenom requis"
    if (!form.salaire_base) errs.salaire_base = "Salaire requis"
    if (!form.date_arrivee) errs.date_arrivee = "Date requise"
    // Sprint 2 — validation email + téléphone (Maurice). Champs optionnels :
    // on ne valide QUE s'ils sont renseignés.
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = "Format email invalide (ex: jean@example.com)"
    }
    if (form.telephone) {
      // Mauritius : +230 suivi de 7 ou 8 chiffres, espaces tolérés.
      // Accepte aussi format local (5XXX XXXX, 8 chiffres sans préfixe).
      const cleaned = form.telephone.replace(/\s+/g, '')
      const okMu = /^\+230\d{7,8}$/.test(cleaned) || /^\d{7,8}$/.test(cleaned)
      if (!okMu) errs.telephone = "Format invalide. Attendu : +230 XXXX XXXX ou XXXX XXXX"
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleCreate = async () => {
    if (!validate()) return
    setSaving(true); setErrors({})
    try {
      const res = await fetch("/api/rh/employes", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ ...form, salaire_base: parseFloat(form.salaire_base), transport_allowance: parseFloat(form.transport_allowance)||0, petrol_allowance: parseFloat(form.petrol_allowance)||0 }) })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      // Sprint 4 TÂCHE 6 — feedback selon contrat_status renvoyé par l'API
      const body = await res.json().catch(() => ({}))
      const status = body?.contrat_status as string | undefined
      if (status === 'created') {
        toast.success(`Employé créé. 📄 Contrat brouillon généré — voir /rh/juridique`, { duration: 5000 })
      } else if (status === 'no_template') {
        toast.warning(`Employé créé. ⚠️ Aucun template disponible — créer le contrat manuellement via /rh/juridique`, { duration: 6000 })
      } else if (status === 'failed') {
        toast.warning(`Employé créé. ⚠️ Génération contrat échouée — à créer manuellement`, { duration: 6000 })
      } else {
        toast.success('Employé créé.')
      }
      onClose(); onCreated()
    } catch (e: unknown) { setErrors({ _global: e instanceof Error ? e.message : "Erreur" }) }
    finally { setSaving(false) }
  }

  const fieldErr = (k: string) => errors[k] ? <p className="text-xs text-red-500 mt-0.5">{errors[k]}</p> : null

  return (
    <div className="space-y-4 py-2">
      {errors._global && <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-xl">{errors._global}</div>}

      {/* Societe & Role */}
      <FormSection icon={<Building2 className="w-4 h-4 text-[#4191FF]" />} title="Organisation" color="#4191FF">
        <FormField label="Societe" required>
          <Select value={form.societe_id} onValueChange={v=>u("societe_id",v)}><SelectTrigger className={selectTriggerClass}><SelectValue placeholder="Choisir la societe..."/></SelectTrigger><SelectContent>{societes.map(s=><SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent></Select>
          {fieldErr("societe_id")}
        </FormField>
        <FormField label="Role">
          <Select value={form.role} onValueChange={v=>u("role",v)}><SelectTrigger className={selectTriggerClass}><SelectValue/></SelectTrigger><SelectContent>{["salarie","manager","rh","admin","direction"].map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
        </FormField>
      </FormSection>

      {/* Identite */}
      <FormSection icon={<User className="w-4 h-4 text-[#4191FF]" />} title="Identite" color="#4191FF">
        <FormField label="Nom" required>
          <Input className={inputClass} value={form.nom} onChange={e=>u("nom",e.target.value)} placeholder="DUPONT"/>
          {fieldErr("nom")}
        </FormField>
        <FormField label="Prenom" required>
          <Input className={inputClass} value={form.prenom} onChange={e=>u("prenom",e.target.value)} placeholder="Jean"/>
          {fieldErr("prenom")}
        </FormField>
        <FormField label="Email">
          <Input className={inputClass} type="email" value={form.email} onChange={e=>u("email",e.target.value)} placeholder="jean@example.com"/>
          {fieldErr("email")}
        </FormField>
        <FormField label="Telephone">
          <Input className={inputClass} value={form.telephone} onChange={e=>u("telephone",e.target.value)} placeholder="+230 5123 4567"/>
          {fieldErr("telephone")}
        </FormField>
        <FormField label="Genre">
          <Select value={form.genre} onValueChange={v=>u("genre",v)}><SelectTrigger className={selectTriggerClass}><SelectValue placeholder="Choisir..."/></SelectTrigger><SelectContent><SelectItem value="M">Masculin</SelectItem><SelectItem value="F">Feminin</SelectItem></SelectContent></Select>
        </FormField>
        <FormField label="Date de naissance">
          <Input className={inputClass} type="date" value={form.date_naissance} onChange={e=>u("date_naissance",e.target.value)}/>
        </FormField>
        <FormField label="NIC">
          <Input className={inputClass} value={form.nic} onChange={e=>u("nic",e.target.value)} placeholder="A1234567890123"/>
        </FormField>
        <FormField label="TAN">
          <Input className={inputClass} value={form.tan} onChange={e=>u("tan",e.target.value)} placeholder="A123456789"/>
        </FormField>
      </FormSection>

      {/* Emploi */}
      <FormSection icon={<Briefcase className="w-4 h-4 text-[#D4AF37]" />} title="Emploi" color="#D4AF37">
        <FormField label="Poste">
          <Input className={inputClass} value={form.poste} onChange={e=>u("poste",e.target.value)} placeholder="Comptable"/>
        </FormField>
        <FormField label="Departement">
          <Input className={inputClass} value={form.departement} onChange={e=>u("departement",e.target.value)} placeholder="Finance"/>
        </FormField>
        <FormField label="Date d'arrivee" required>
          <Input className={inputClass} type="date" value={form.date_arrivee} onChange={e=>u("date_arrivee",e.target.value)}/>
          {fieldErr("date_arrivee")}
        </FormField>
        <FormField label="Type de contrat">
          <Select value={form.type_contrat} onValueChange={v=>u("type_contrat",v)}><SelectTrigger className={selectTriggerClass}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="CDI">CDI</SelectItem><SelectItem value="CDD">CDD</SelectItem><SelectItem value="Interim">Interim</SelectItem></SelectContent></Select>
        </FormField>
        <FormField label="Categorie CSG">
          <Select value={form.csg_categorie} onValueChange={v=>u("csg_categorie",v)}><SelectTrigger className={selectTriggerClass}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="A">A</SelectItem><SelectItem value="B">B</SelectItem></SelectContent></Select>
        </FormField>
      </FormSection>

      {/* Salaire */}
      <FormSection icon={<Banknote className="w-4 h-4 text-green-600" />} title="Salaire" color="#22c55e">
        <FormField label="Salaire de base" required>
          <Input className={inputClass} type="number" value={form.salaire_base} onChange={e=>u("salaire_base",e.target.value)} placeholder="35 000"/>
          {fieldErr("salaire_base")}
        </FormField>
        <FormField label="Devise">
          <Select value={form.devise_salaire} onValueChange={v=>u("devise_salaire",v)}><SelectTrigger className={selectTriggerClass}><SelectValue/></SelectTrigger><SelectContent>{["MUR","EUR","USD","GBP"].map(d=><SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select>
        </FormField>
        <FormField label="Transport">
          <Input className={inputClass} type="number" value={form.transport_allowance} onChange={e=>u("transport_allowance",e.target.value)} placeholder="0"/>
        </FormField>
        <FormField label="Petrol">
          <Input className={inputClass} type="number" value={form.petrol_allowance} onChange={e=>u("petrol_allowance",e.target.value)} placeholder="0"/>
        </FormField>
      </FormSection>

      {/* Banque */}
      <FormSection icon={<Building2 className="w-4 h-4 text-purple-600" />} title="Banque" color="#9333ea">
        <FormField label="Banque">
          <Select value={form.bank_name} onValueChange={v=>u("bank_name",v)}><SelectTrigger className={selectTriggerClass}><SelectValue placeholder="Choisir..."/></SelectTrigger><SelectContent>{BANQUES_MAURITIUS.map(b=><SelectItem key={b.code} value={b.code}>{b.nom}</SelectItem>)}</SelectContent></Select>
        </FormField>
        <FormField label="N. compte">
          <Input className={inputClass} value={form.bank_account} onChange={e=>u("bank_account",e.target.value)} placeholder="000012345678"/>
        </FormField>
        <FormField label="IBAN" className="sm:col-span-2">
          <Input className={inputClass} value={form.iban} onChange={e=>u("iban",e.target.value)} placeholder="MU17BOMM..."/>
        </FormField>
      </FormSection>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        <Button variant="outline" onClick={onClose} className="sm:flex-1 h-11 rounded-xl">Annuler</Button>
        <Button onClick={handleCreate} disabled={saving} className="sm:flex-[2] h-11 rounded-xl bg-[#D4AF37] hover:bg-[#c9a432] text-white font-semibold shadow-md" style={{ fontFamily: "Poppins, sans-serif" }}>
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-2"/>}
          Creer l'employe
        </Button>
      </div>
    </div>
  )
}

// ── Composant formulaire édition (state isolé) ──
// Sprint 7 FIX 1 — sections claires (Identité / Rémunération / Contrat /
// Administratif / Bancaire) + nouveaux champs editable : working_days,
// exclure_mra. Principe : tout ce qui est modifiable en DB est accessible
// depuis la fiche. Le salaire est mis en avant dans une carte dédiée.
const WORKING_DAYS_DEFAULT = { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false }
const DAY_LABELS: Record<string, string> = {
  mon: "Lun", tue: "Mar", wed: "Mer", thu: "Jeu", fri: "Ven", sat: "Sam", sun: "Dim",
}

function EditEmployeForm({ emp, onSaved, onClose }: { emp: any; onSaved: () => void; onClose: () => void }) {
  const [e, setE] = useState({
    ...emp,
    // Normalisation working_days (peut être JSONB depuis la DB ou undefined)
    working_days: emp.working_days && typeof emp.working_days === "object"
      ? { ...WORKING_DAYS_DEFAULT, ...emp.working_days }
      : WORKING_DAYS_DEFAULT,
  })
  const [saving, setSaving] = useState(false)
  const u = (k: string, v: any) => setE((p: any) => ({ ...p, [k]: v }))
  const toggleDay = (day: string) =>
    setE((p: any) => ({ ...p, working_days: { ...p.working_days, [day]: !p.working_days?.[day] } }))

  const handleSave = async () => {
    // Sprint 5 FIX 2 — protection salaire : empêcher d'envoyer 0 par erreur
    // si l'utilisateur efface le champ puis save. Avant : parseFloat('') || 0
    // écrasait silencieusement le salaire à 0 en DB.
    const salaireSaisi = parseFloat(e.salaire_base)
    if (!Number.isFinite(salaireSaisi) || salaireSaisi <= 0) {
      toast.error("Salaire invalide — renseignez un montant > 0")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/rh/employes/${e.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: e.nom, prenom: e.prenom, poste: e.poste, email: e.email, telephone: e.telephone,
          salaire_base: salaireSaisi,
          transport_allowance: parseFloat(e.transport_allowance) || 0,
          petrol_allowance: parseFloat(e.petrol_allowance) || 0,
          // Sprint 11 BUG 9B — Compensations & Allowances (mig 040 + 117)
          phone_allowance: parseFloat(e.phone_allowance) || 0,
          daily_bus_fare: parseFloat(e.daily_bus_fare) || 0,
          prime_fixe_1: parseFloat(e.prime_fixe_1) || 0,
          prime_fixe_1_libelle: (e.prime_fixe_1_libelle || "").toString().trim(),
          prime_fixe_2: parseFloat(e.prime_fixe_2) || 0,
          prime_fixe_2_libelle: (e.prime_fixe_2_libelle || "").toString().trim(),
          prime_fixe_3: parseFloat(e.prime_fixe_3) || 0,
          prime_fixe_3_libelle: (e.prime_fixe_3_libelle || "").toString().trim(),
          date_arrivee: e.date_arrivee, date_depart: e.date_depart || null,
          role: e.role, csg_categorie: e.csg_categorie, bank_name: e.bank_name, bank_account: e.bank_account,
          nic_number: e.nic_number, tan_number: e.tan_number, iban: e.iban, devise_salaire: e.devise_salaire,
          // Sprint 7 FIX 1 — nouveaux champs editable
          working_days: e.working_days,
          exclure_mra: !!e.exclure_mra,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`)
      // Sprint 9 BUG 2 — toast contextualisé selon les bulletins propagés.
      // L'API renvoie bulletins_updated / bulletins_locked du mois courant.
      if (data.salaire_changed) {
        const updated = Number(data.bulletins_updated) || 0
        const locked = Number(data.bulletins_locked) || 0
        if (updated > 0 && locked > 0) {
          toast.success(`Salaire mis à jour ✅ ${updated} bulletin(s) du mois recalculé(s) — ${locked} verrouillé(s) inchangé(s).`, { duration: 6000 })
        } else if (updated > 0) {
          toast.success(`Salaire mis à jour ✅ ${updated} bulletin(s) non verrouillé(s) du mois recalculé(s).`, { duration: 6000 })
        } else if (locked > 0) {
          toast.success(`Salaire mis à jour ✅ ${locked} bulletin(s) verrouillé(s) du mois inchangé(s) (audit historique).`, { duration: 6000 })
        } else {
          toast.success("Salaire mis à jour ✅ (aucun bulletin du mois en cours)")
        }
      } else {
        toast.success("Fiche employé mise à jour ✅")
      }
      onClose(); onSaved()
    } catch (err: any) { toast.error(err.message || "Erreur") }
    finally { setSaving(false) }
  }

  const SectionHeader = ({ children }: { children: React.ReactNode }) => (
    <div className="col-span-2 text-xs font-bold uppercase tracking-wide text-[#0B0F2E] mt-2 pb-1 border-b border-gray-200">
      {children}
    </div>
  )

  return (
    <div className="grid grid-cols-2 gap-3 py-2">
      {/* ── Identité ── */}
      <SectionHeader>Identité</SectionHeader>
      <div><Label>Nom *</Label><Input value={e.nom||""} onChange={ev=>u("nom",ev.target.value)}/></div>
      <div><Label>Prénom *</Label><Input value={e.prenom||""} onChange={ev=>u("prenom",ev.target.value)}/></div>
      <div><Label>Email</Label><Input type="email" value={e.email||""} onChange={ev=>u("email",ev.target.value)}/></div>
      <div><Label>Téléphone</Label><Input value={e.telephone||""} onChange={ev=>u("telephone",ev.target.value)}/></div>
      <div><Label>NIC</Label><Input value={e.nic_number||""} onChange={ev=>u("nic_number",ev.target.value)}/></div>
      <div><Label>TAN</Label><Input value={e.tan_number||""} onChange={ev=>u("tan_number",ev.target.value)}/></div>

      {/* ── Contrat / Poste ── */}
      <SectionHeader>Contrat & Poste</SectionHeader>
      <div><Label>Poste</Label><Input value={e.poste||""} onChange={ev=>u("poste",ev.target.value)}/></div>
      <div><Label>Rôle</Label><Select value={e.role||"salarie"} onValueChange={v=>u("role",v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["salarie","manager","rh","admin","direction"].map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Date arrivée</Label><Input type="date" value={e.date_arrivee?.split("T")[0]||""} onChange={ev=>u("date_arrivee",ev.target.value)}/></div>
      <div><Label>Date départ</Label><Input type="date" value={e.date_depart?.split("T")[0]||""} onChange={ev=>u("date_depart",ev.target.value)}/></div>
      <div className="col-span-2">
        <Label>Jours travaillés <span className="text-xs text-gray-400 font-normal">(pour calcul pointage / congés)</span></Label>
        <div className="flex gap-1 mt-1 flex-wrap">
          {Object.keys(DAY_LABELS).map(day => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                e.working_days?.[day]
                  ? "bg-[#0B0F2E] text-white border-[#0B0F2E]"
                  : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
              }`}
            >
              {DAY_LABELS[day]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Rémunération (FIX 1 — mise en avant) ── */}
      <SectionHeader>💰 Rémunération</SectionHeader>
      <div className="col-span-2 rounded-lg bg-amber-50/50 border border-amber-200 p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="font-semibold text-[#0B0F2E]">Salaire de base *</Label>
            <Input
              type="number"
              value={e.salaire_base||""}
              onChange={ev=>u("salaire_base",ev.target.value)}
              className="font-mono text-base h-11 border-amber-300 focus:border-amber-500"
              placeholder="Ex: 60000"
            />
            <p className="text-xs text-gray-500 mt-1">
              Actuel : <span className="font-mono">{Number(emp.salaire_base || 0).toLocaleString("fr-FR")} {emp.devise_salaire || "MUR"}</span>
              {Number(e.salaire_base) !== Number(emp.salaire_base) && (
                <span className="text-amber-700 ml-2">→ <span className="font-mono">{Number(e.salaire_base || 0).toLocaleString("fr-FR")} {e.devise_salaire || "MUR"}</span> (modifié)</span>
              )}
            </p>
          </div>
          <div>
            <Label>Devise</Label>
            <Select value={e.devise_salaire||"MUR"} onValueChange={v=>u("devise_salaire",v)}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>{["MUR","EUR","USD","GBP"].map(d=><SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Compensations & Allowances (Sprint 11 BUG 9B) ── */}
      <SectionHeader>🧾 Compensations & Allowances</SectionHeader>
      <div className="col-span-2 rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-3">
        <p className="text-xs text-gray-500 -mt-1">
          Montants mensuels inclus dans le salaire brut et repris sur le bulletin de paie.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Transport</Label>
            <Input type="number" min="0" step="0.01" value={e.transport_allowance??""}
              onChange={ev=>u("transport_allowance",ev.target.value)} placeholder="0"/>
          </div>
          <div>
            <Label>Essence / Carburant</Label>
            <Input type="number" min="0" step="0.01" value={e.petrol_allowance??""}
              onChange={ev=>u("petrol_allowance",ev.target.value)} placeholder="0"/>
          </div>
          <div>
            <Label>Téléphone</Label>
            <Input type="number" min="0" step="0.01" value={e.phone_allowance??""}
              onChange={ev=>u("phone_allowance",ev.target.value)} placeholder="0"/>
          </div>
          <div>
            <Label>Bus quotidien <span className="text-xs text-gray-400 font-normal">(par jour)</span></Label>
            <Input type="number" min="0" step="0.01" value={e.daily_bus_fare??""}
              onChange={ev=>u("daily_bus_fare",ev.target.value)} placeholder="0"/>
          </div>
        </div>

        {/* Primes personnalisées — libellé libre + montant (mig 117) */}
        <div className="pt-2 border-t border-slate-200">
          <p className="text-xs font-semibold text-[#0B0F2E] mb-2">Primes personnalisées</p>
          <div className="space-y-2">
            {[1,2,3].map(n => {
              const libKey = `prime_fixe_${n}_libelle`
              const montantKey = `prime_fixe_${n}`
              return (
                <div key={n} className="grid grid-cols-[1fr_140px] gap-2">
                  <Input
                    value={(e as any)[libKey]||""}
                    onChange={ev=>u(libKey,ev.target.value)}
                    placeholder={`Libellé prime ${n} (ex: Electricity, Loyer...)`}
                  />
                  <Input
                    type="number" min="0" step="0.01"
                    value={(e as any)[montantKey]??""}
                    onChange={ev=>u(montantKey,ev.target.value)}
                    placeholder="Montant MUR"
                    className="font-mono"
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Fiscal & Bancaire ── */}
      <SectionHeader>Fiscal & Bancaire</SectionHeader>
      <div><Label>Catégorie CSG</Label><Select value={e.csg_categorie||"A"} onValueChange={v=>u("csg_categorie",v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="A">A</SelectItem><SelectItem value="B">B</SelectItem></SelectContent></Select></div>
      <div className="flex items-center gap-2 pt-5">
        <input
          id="exclure_mra"
          type="checkbox"
          checked={!!e.exclure_mra}
          onChange={ev => u("exclure_mra", ev.target.checked)}
          className="h-4 w-4"
        />
        <Label htmlFor="exclure_mra" className="cursor-pointer">
          Exclure des déclarations MRA
          <span className="block text-xs text-gray-500 font-normal">Ne figure pas dans CSG/NSF/PAYE Return</span>
        </Label>
      </div>
      <div><Label>Banque</Label><Select value={e.bank_name||""} onValueChange={v=>u("bank_name",v)}><SelectTrigger><SelectValue placeholder="Choisir..."/></SelectTrigger><SelectContent>{BANQUES_MAURITIUS.map(b=><SelectItem key={b.code} value={b.code}>{b.nom}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>N° compte</Label><Input value={e.bank_account||""} onChange={ev=>u("bank_account",ev.target.value)}/></div>
      <div className="col-span-2"><Label>IBAN</Label><Input value={e.iban||""} onChange={ev=>u("iban",ev.target.value)}/></div>

      <DialogFooter className="col-span-2 pt-4">
        <Button variant="outline" onClick={onClose}>Annuler</Button>
        <Button onClick={handleSave} disabled={saving} className="bg-[#0B0F2E] text-white">
          {saving&&<Loader2 className="w-4 h-4 animate-spin mr-2"/>}Enregistrer
        </Button>
      </DialogFooter>
    </div>
  )
}

function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n) }

// Sprint 10 BUG 3 — calcule le total brut théorique d'un employé :
// salaire_base + toutes les allowances/primes récurrentes. Utilisé dans
// les listes pour afficher à la fois "Base" et "Brut" quand il y a un
// écart, clarifiant pourquoi les bulletins montrent un montant différent
// du salaire_base.
function computeTotalBrut(emp: any): number {
  const base = Number(emp?.salaire_base) || 0
  const transport = Number(emp?.transport_allowance) || 0
  const petrol = Number(emp?.petrol_allowance) || 0
  const primeFixe1 = Number(emp?.prime_fixe_1) || 0
  const primeFixe2 = Number(emp?.prime_fixe_2) || 0
  const primeFixe3 = Number(emp?.prime_fixe_3) || 0
  return base + transport + petrol + primeFixe1 + primeFixe2 + primeFixe3
}

export default function EmployesPage() {
  const router = useRouter()
  const [employes, setEmployes] = useState<any[]>([])
  const [societes, setSocietes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterSociete, setFilterSociete] = useState("all")
  const [filterStatut, setFilterStatut] = useState("presents")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File|null>(null)
  const [importSociete, setImportSociete] = useState("")
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{imported:number,errors:{row:number,message:string}[],total_rows:number}|null>(null)
  const [importError, setImportError] = useState<string|null>(null)

  // Create user access
  const [accessOpen, setAccessOpen] = useState(false)
  const [accessEmp, setAccessEmp] = useState<any>(null)
  const [accessRole, setAccessRole] = useState("employe")
  const [accessPassword, setAccessPassword] = useState("")
  const [accessSaving, setAccessSaving] = useState(false)
  const [accessResult, setAccessResult] = useState<{email:string;password:string}|null>(null)
  // Sprint 12 FEATURE 1 — toggle visibilité mot de passe
  const [accessPasswordVisible, setAccessPasswordVisible] = useState(true)

  // Sprint 12 FEATURE 3 — création comptes en masse
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [bulkDefaultPwd, setBulkDefaultPwd] = useState("")
  const [bulkPerEmpPwd, setBulkPerEmpPwd] = useState<Record<string, string>>({})
  const [bulkUsePerEmp, setBulkUsePerEmp] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkResults, setBulkResults] = useState<{employe_id:string;status:string;error?:string;email?:string}[]|null>(null)

  const genPwd = () => { const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; let p = ""; for (let i = 0; i < 10; i++) p += c[Math.floor(Math.random() * c.length)]; return p }

  const openAccess = (emp: any) => {
    setAccessEmp(emp)
    setAccessRole(emp.role_rh || emp.role || "employe")
    setAccessPassword(genPwd())
    setAccessResult(null)
    setAccessOpen(true)
  }

  const handleCreateAccess = async () => {
    if (!accessEmp || !accessEmp.email) { alert("L'employé doit avoir un email"); return }
    setAccessSaving(true)
    try {
      // Sprint 12 FEATURE 1 — pour le rôle "employe" on utilise l'endpoint
      // dédié qui lie correctement employes.auth_user_id + profiles.employe_id.
      // Pour les autres rôles (admin/comptable/...) on garde le flux legacy
      // qui crée des dossiers / user_societes selon le rôle.
      if (accessRole === "employe") {
        const res = await fetch("/api/admin/create-user-employee", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employe_id: accessEmp.id,
            password: accessPassword,
          }),
        })
        const data = await res.json()
        if (!res.ok || data.error) {
          alert("Erreur: " + (data.error || `HTTP ${res.status}`))
        } else {
          setAccessResult({ email: data.result?.email || accessEmp.email, password: accessPassword })
          load()
        }
      } else {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: accessEmp.email,
            password: accessPassword,
            full_name: `${accessEmp.prenom} ${accessEmp.nom}`,
            role: accessRole,
            societe_id: accessEmp.societe_id,
            phone: accessEmp.telephone || null,
          }),
        })
        const data = await res.json()
        if (data.error) { alert("Erreur: " + data.error) }
        else { setAccessResult({ email: accessEmp.email, password: accessPassword }); load() }
      }
    } catch { alert("Erreur réseau") }
    setAccessSaving(false)
  }

  // Sprint 12 FEATURE 3 — ouverture du dialog bulk + init sélection par défaut
  const openBulkCreate = () => {
    const withoutAccount = employes.filter(e => !e.auth_user_id && !e.date_depart)
    setBulkSelected(new Set(withoutAccount.map(e => e.id)))
    setBulkDefaultPwd(genPwd())
    setBulkPerEmpPwd({})
    setBulkUsePerEmp(false)
    setBulkResults(null)
    setBulkOpen(true)
  }

  const handleBulkCreate = async () => {
    const selected = employes.filter(e => bulkSelected.has(e.id))
    if (selected.length === 0) { alert("Aucun employé sélectionné"); return }
    setBulkSaving(true)
    try {
      const res = await fetch("/api/admin/create-user-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bulk: true,
          default_password: bulkUsePerEmp ? undefined : bulkDefaultPwd,
          employes: selected.map(e => ({
            employe_id: e.id,
            password: bulkUsePerEmp ? (bulkPerEmpPwd[e.id] || bulkDefaultPwd) : bulkDefaultPwd,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) { alert("Erreur: " + (data.error || `HTTP ${res.status}`)); return }
      setBulkResults(data.results || [])
      load()
    } catch { alert("Erreur réseau") }
    finally { setBulkSaving(false) }
  }

  const [editOpen, setEditOpen] = useState(false)
  const [editEmp, setEditEmp] = useState<any>(null)

  const openEdit = (emp: any) => {
    setEditEmp({ ...emp })
    setEditOpen(true)
  }

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteEmp, setDeleteEmp] = useState<any>(null)
  const [deleting, setDeleting] = useState<"soft" | "hard" | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const openDelete = (emp: any) => {
    setDeleteEmp(emp)
    setDeleteError(null)
    setDeleting(null)
    setDeleteOpen(true)
  }

  const handleDelete = async (mode: "soft" | "hard") => {
    if (!deleteEmp) return
    setDeleting(mode)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/rh/employes/${deleteEmp.id}?mode=${mode}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de la suppression")
      }
      setDeleteOpen(false)
      setDeleteEmp(null)
      load()
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : "Erreur")
    } finally {
      setDeleting(null)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterSociete !== "all") params.set("societe_id", filterSociete)
      if (filterStatut !== "tous") params.set("statut", filterStatut)
      const [empRes, socRes] = await Promise.all([fetch(`/api/rh/employes?${params}`), fetch("/api/comptable/societes")])
      setEmployes((await empRes.json()).employes || [])
      setSocietes((await socRes.json()).societes || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [filterSociete, filterStatut])

  useEffect(() => { load() }, [load])

  const handleImport = async () => {
    if (!importFile || !importSociete) { setImportError("Fichier et société requis"); return }
    setImporting(true); setImportError(null); setImportResult(null)
    try {
      const fd = new FormData()
      fd.append("file", importFile)
      fd.append("societe_id", importSociete)
      const res = await fetch("/api/rh/employes/import", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setImportResult(data)
      if (data.imported > 0) load()
    } catch (e: unknown) { setImportError(e instanceof Error ? e.message : "Erreur import") }
    finally { setImporting(false) }
  }

  const downloadTemplate = () => {
    const csv = "nom;prenom;email;poste;salaire_base;devise_salaire;date_arrivee;nic;bank_name;bank_account;telephone;role\nDUPONT;Jean;jean@example.com;Comptable;35000;MUR;2024-01-15;A1234567890123;MCB;000012345678;+230 5123 4567;salarie"
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = "modele_employes.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = employes.filter(e => !search || `${e.nom} ${e.prenom} ${e.poste||""} ${e.departement||""}`.toLowerCase().includes(search.toLowerCase()))

  const getInitials = (e: any) => `${(e.prenom||"")[0]||""}${(e.nom||"")[0]||""}`.toUpperCase()
  const getStatusBadge = (e: any) => {
    if (e.date_depart) return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs font-medium">Sorti</Badge>
    if (e.statut === "essai" || e.type_contrat === "CDD") return <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs font-medium">Periode essai</Badge>
    return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs font-medium">Actif</Badge>
  }

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]" style={{ fontFamily: "Poppins, sans-serif" }}>Employes</h1>
          <p className="text-sm text-gray-500">{employes.length} employe(s) {filterStatut === "sortis" ? "sorti(s)" : filterStatut === "tous" ? "au total" : "actif(s)"}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
        <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if(!v){ setImportFile(null); setImportResult(null); setImportError(null) } }}>
          <DialogTrigger asChild><Button variant="outline" className="border-[#0B0F2E] text-[#0B0F2E] rounded-xl h-10"><Upload className="w-4 h-4 mr-2"/>Importer CSV</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5"/>Importer des employés</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              {importError && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{importError}</p>}
              {importResult && (
                <div className="space-y-2">
                  <p className="text-sm text-green-700 bg-green-50 p-2 rounded">{importResult.imported} employé(s) importé(s) sur {importResult.total_rows} ligne(s)</p>
                  {importResult.errors.length > 0 && (
                    <div className="bg-yellow-50 p-2 rounded max-h-32 overflow-y-auto">
                      <p className="text-sm font-medium text-yellow-800 mb-1">Erreurs ({importResult.errors.length}):</p>
                      {importResult.errors.map((err, i) => <p key={i} className="text-xs text-yellow-700">Ligne {err.row}: {err.message}</p>)}
                    </div>
                  )}
                </div>
              )}
              <div>
                <Label>Société *</Label>
                <Select value={importSociete} onValueChange={setImportSociete}>
                  <SelectTrigger><SelectValue placeholder="Choisir la société..."/></SelectTrigger>
                  <SelectContent>{societes.map(s=><SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fichier CSV ou Excel *</Label>
                <Input type="file" accept=".csv,.xlsx,.xls" onChange={e => setImportFile(e.target.files?.[0] || null)} className="mt-1"/>
                <p className="text-xs text-gray-500 mt-1">Colonnes: nom, prenom, email, poste, salaire_base, devise_salaire, date_arrivee, nic, bank_name, bank_account</p>
              </div>
              <Button variant="ghost" size="sm" onClick={downloadTemplate} className="text-[#0B0F2E]"><Download className="w-4 h-4 mr-2"/>Télécharger modèle CSV</Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={()=>setImportOpen(false)}>Fermer</Button>
              <Button onClick={handleImport} disabled={importing || !importFile || !importSociete} className="bg-[#0B0F2E] text-white">{importing&&<Loader2 className="w-4 h-4 animate-spin mr-2"/>}Importer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button className="bg-[#D4AF37] hover:bg-[#c9a432] text-white rounded-xl h-10 shadow-sm font-semibold"><Plus className="w-4 h-4 mr-2"/>Nouvel employe</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" onOpenAutoFocus={e => e.preventDefault()}>
            <DialogHeader><DialogTitle className="text-[#0B0F2E] text-lg font-bold flex items-center gap-2" style={{ fontFamily: "Poppins, sans-serif" }}><UserPlus className="w-5 h-5"/>Nouvel employe</DialogTitle></DialogHeader>
            <CreateEmployeForm societes={societes} onCreated={load} onClose={() => setDialogOpen(false)} />
          </DialogContent>
        </Dialog>
        {/* Sprint 12 FEATURE 3 — créer comptes en masse */}
        {(() => {
          const missing = employes.filter(e => !e.auth_user_id && !e.date_depart).length
          if (missing === 0) return null
          return (
            <Button
              variant="outline"
              className="border-purple-300 text-purple-700 hover:bg-purple-50 rounded-xl h-10"
              onClick={openBulkCreate}
              title={`${missing} employé(s) sans compte`}
            >
              <Mail className="w-4 h-4 mr-2" />
              Créer {missing} compte(s) manquant(s)
            </Button>
          )
        })()}
        </div>
      </div>

      {/* Search and filters */}
      <Card className="rounded-2xl shadow-sm"><CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
          <Input className="pl-9 h-11 rounded-xl" placeholder="Rechercher par nom, poste, departement..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div className="flex gap-2">
          <Select value={filterStatut} onValueChange={setFilterStatut}><SelectTrigger className="w-36 h-11 rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="presents">Presents</SelectItem><SelectItem value="sortis">Sortis</SelectItem><SelectItem value="tous">Tous</SelectItem></SelectContent></Select>
          <Select value={filterSociete} onValueChange={setFilterSociete}><SelectTrigger className="w-44 h-11 rounded-xl"><SelectValue placeholder="Toutes societes"/></SelectTrigger><SelectContent><SelectItem value="all">Toutes</SelectItem>{societes.map(s=><SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent></Select>
        </div>
      </CardContent></Card>

      {/* Employee list */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-[#0B0F2E] flex items-center gap-2 text-base" style={{ fontFamily: "Poppins, sans-serif" }}>
            <Users className="w-4 h-4"/>Employes ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#0B0F2E]"/></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-40"/>
              <p>Aucun employe trouve</p>
            </div>
          ) : (
            <>
              {/* Mobile: Card view */}
              <div className="sm:hidden divide-y">
                {filtered.map(e => (
                  <div key={e.id} className="p-4 hover:bg-gray-50/50 active:bg-gray-100 cursor-pointer transition-colors" onClick={() => router.push(`/rh/employes/${e.id}`)}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#0B0F2E] text-white flex items-center justify-center text-sm font-semibold shrink-0">
                        {getInitials(e)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-[#0B0F2E] truncate">{e.prenom} {e.nom}</p>
                          {getStatusBadge(e)}
                        </div>
                        <p className="text-sm text-gray-500 truncate">{e.poste || "—"}{e.departement ? ` · ${e.departement}` : ""}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className="text-xs text-gray-400 font-mono">{e.code || "—"}</span>
                          <span className="text-xs text-gray-300">|</span>
                          <span className="text-sm font-medium text-[#0B0F2E]" title="Salaire de base (hors allowances/primes)">{fmt(e.salaire_base)}</span>
                          {/* Sprint 10 BUG 3 — afficher "Brut: X" uniquement si différent du base */}
                          {(() => {
                            const brut = computeTotalBrut(e)
                            return brut !== Number(e.salaire_base) ? (
                              <span
                                className="text-xs text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded"
                                title="Total brut mensuel = base + transport + petrol + primes fixes"
                              >
                                Brut : {fmt(brut)}
                              </span>
                            ) : null
                          })()}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(ev)=>{ev.stopPropagation();openEdit(e)}} title="Modifier"><Pencil className="w-4 h-4 text-[#D4AF37]"/></Button>
                        {/* Sprint 12 FEATURE 1+4 — bouton conditionnel compte Lexora */}
                        {!e.auth_user_id ? (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(ev)=>{ev.stopPropagation();openAccess(e)}} title="Créer le compte Lexora"><Key className="w-4 h-4 text-purple-600"/></Button>
                        ) : (
                          <span title="Compte Lexora actif" className="h-8 w-8 inline-flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-green-600"/></span>
                        )}
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(ev)=>{ev.stopPropagation();openDelete(e)}} title="Supprimer"><Trash2 className="w-4 h-4 text-red-600"/></Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: Table view */}
              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/60">
                      <TableHead className="pl-5 w-[280px]">Employe</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Poste</TableHead>
                      <TableHead>Departement</TableHead>
                      <TableHead className="text-right">Salaire</TableHead>
                      <TableHead className="text-right pr-5">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(e=>(
                      <TableRow key={e.id} className="hover:bg-gray-50/50 cursor-pointer group transition-colors" onClick={()=>router.push(`/rh/employes/${e.id}`)}>
                        <TableCell className="pl-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#0B0F2E] text-white flex items-center justify-center text-xs font-semibold shrink-0">
                              {getInitials(e)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-[#0B0F2E] text-sm truncate">{e.prenom} {e.nom}</p>
                              <p className="text-xs text-gray-400">{e.email || "—"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(e)}</TableCell>
                        <TableCell className="text-sm text-gray-600">{e.poste||"—"}</TableCell>
                        <TableCell className="text-sm text-gray-500">{e.departement||"—"}</TableCell>
                        <TableCell className="text-right text-sm">
                          {/* Sprint 10 BUG 3 — Base + Brut (si différent) */}
                          <div className="flex flex-col items-end leading-tight">
                            <span className="font-medium text-[#0B0F2E]" title="Salaire de base (hors allowances)">{fmt(e.salaire_base)}</span>
                            {(() => {
                              const brut = computeTotalBrut(e)
                              return brut !== Number(e.salaire_base) ? (
                                <span className="text-[10px] text-emerald-700" title="Total brut mensuel = base + transport + petrol + primes fixes">
                                  Brut : {fmt(brut)}
                                </span>
                              ) : null
                            })()}
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-5">
                          <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(ev)=>{ev.stopPropagation();router.push(`/rh/employes/${e.id}`)}} title="Voir fiche"><ExternalLink className="w-4 h-4 text-[#0B0F2E]"/></Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(ev)=>{ev.stopPropagation();openEdit(e)}} title="Modifier"><Pencil className="w-4 h-4 text-[#D4AF37]"/></Button>
                            {/* Sprint 12 FEATURE 1+4 — bouton conditionnel compte Lexora */}
                            {!e.auth_user_id ? (
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(ev)=>{ev.stopPropagation();openAccess(e)}} title="Créer le compte Lexora"><Key className="w-4 h-4 text-purple-600"/></Button>
                            ) : null}
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(ev)=>{ev.stopPropagation();openDelete(e)}} title="Supprimer"><Trash2 className="w-4 h-4 text-red-600"/></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog edition employe */}
      <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) setEditEmp(null) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" onOpenAutoFocus={e => e.preventDefault()}>
          <DialogHeader><DialogTitle className="text-[#0B0F2E] text-lg font-bold flex items-center gap-2" style={{ fontFamily: "Poppins, sans-serif" }}><Pencil className="w-5 h-5 text-[#D4AF37]"/>Modifier — {editEmp?.prenom} {editEmp?.nom}</DialogTitle></DialogHeader>
          {editEmp && <EditEmployeForm emp={editEmp} onSaved={load} onClose={() => { setEditOpen(false); setEditEmp(null) }} />}
        </DialogContent>
      </Dialog>

      {/* Dialog création accès utilisateur */}
      <Dialog open={accessOpen} onOpenChange={o => { setAccessOpen(o); if (!o) { setAccessEmp(null); setAccessResult(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#0B0F2E]">
              <Key className="w-5 h-5 text-purple-600" />
              Créer un accès utilisateur
            </DialogTitle>
          </DialogHeader>
          {accessEmp && !accessResult && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium">{accessEmp.prenom} {accessEmp.nom}</p>
                <p className="text-sm text-gray-500">{accessEmp.poste || "—"} • {accessEmp.email || "Pas d'email"}</p>
              </div>
              {!accessEmp.email && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  Cet employé n'a pas d'email. Modifiez sa fiche pour ajouter un email avant de créer un accès.
                </div>
              )}
              <div>
                <Label>Rôle / Fonction</Label>
                <Select value={accessRole} onValueChange={setAccessRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employe">Employé (portail salarié)</SelectItem>
                    <SelectItem value="manager">Manager (supervision équipe)</SelectItem>
                    <SelectItem value="rh">RH (gestion complète)</SelectItem>
                    <SelectItem value="rh_manager">RH Manager</SelectItem>
                    <SelectItem value="comptable">Comptable</SelectItem>
                    <SelectItem value="direction">Direction</SelectItem>
                    <SelectItem value="client_admin">Administrateur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Mot de passe</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={accessPasswordVisible ? "text" : "password"}
                      value={accessPassword}
                      onChange={e => setAccessPassword(e.target.value)}
                      className="font-mono pr-10"
                      placeholder="Mot de passe..."
                    />
                    <button
                      type="button"
                      onClick={() => setAccessPasswordVisible(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      title={accessPasswordVisible ? "Masquer" : "Afficher"}
                    >
                      {accessPasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setAccessPassword(genPwd())} title="Générer automatiquement">
                    Générer
                  </Button>
                </div>
                <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    <span className="font-semibold">Important :</span> communiquez ce mot de passe à l'employé
                    par un canal sécurisé (en main propre, SMS). Il ne sera plus visible après confirmation.
                  </p>
                </div>
              </div>
              <Button
                onClick={handleCreateAccess}
                disabled={accessSaving || !accessEmp.email || !accessPassword || accessPassword.length < 6}
                className="w-full bg-[#0B0F2E] text-white"
              >
                {accessSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Key className="w-4 h-4 mr-2" />}
                {accessRole === "employe" ? "Créer le compte Lexora" : "Créer le compte"}
              </Button>
            </div>
          )}
          {accessResult && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="font-semibold text-green-800 mb-2">Compte créé avec succès</p>
                <div className="space-y-1">
                  <p className="text-sm">Email : <span className="font-mono font-bold">{accessResult.email}</span></p>
                  <p className="text-sm">Mot de passe : <span className="font-mono font-bold text-lg">{accessResult.password}</span></p>
                  <p className="text-sm">Rôle : <span className="font-semibold">{accessRole}</span></p>
                </div>
              </div>
              <p className="text-xs text-gray-500">Communiquez ces identifiants à l'employé de manière sécurisée.</p>
              <Button variant="outline" className="w-full" onClick={() => { setAccessOpen(false); setAccessResult(null) }}>Fermer</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sprint 12 FEATURE 3 — Dialog création comptes en masse */}
      <Dialog open={bulkOpen} onOpenChange={o => { setBulkOpen(o); if (!o) setBulkResults(null) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#0B0F2E]">
              <Mail className="w-5 h-5 text-purple-600" />
              Créer les comptes Lexora manquants
            </DialogTitle>
          </DialogHeader>

          {!bulkResults && (
            <div className="space-y-4 pt-2">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-900">
                Sélectionnez les employés à créer en lot. Seuls les employés avec un email,
                sans compte actif, et en poste apparaissent ci-dessous.
              </div>

              {/* Mode mot de passe */}
              <div className="space-y-2 border rounded-lg p-3">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={!bulkUsePerEmp}
                      onChange={() => setBulkUsePerEmp(false)}
                    />
                    <span>Mot de passe par défaut (commun à tous)</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={bulkUsePerEmp}
                      onChange={() => setBulkUsePerEmp(true)}
                    />
                    <span>Un mot de passe par employé</span>
                  </label>
                </div>
                {!bulkUsePerEmp && (
                  <div className="flex gap-2">
                    <Input
                      value={bulkDefaultPwd}
                      onChange={(ev) => setBulkDefaultPwd(ev.target.value)}
                      className="font-mono"
                      placeholder="Lexora2026!"
                    />
                    <Button variant="outline" size="sm" onClick={() => setBulkDefaultPwd(genPwd())}>Générer</Button>
                  </div>
                )}
                <p className="text-[11px] text-amber-700 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Notez le(s) mot(s) de passe avant de lancer — ils ne seront plus affichés après.
                </p>
              </div>

              {/* Liste des employés éligibles */}
              {(() => {
                const eligibles = employes.filter(e => !e.auth_user_id && !e.date_depart)
                if (eligibles.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-500">
                      <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500" />
                      Tous les employés actifs ont déjà un compte Lexora.
                    </div>
                  )
                }
                const allSelected = eligibles.every(e => bulkSelected.has(e.id))
                return (
                  <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                    <div className="sticky top-0 bg-gray-50 border-b px-3 py-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(ev) => {
                          if (ev.target.checked) {
                            setBulkSelected(new Set(eligibles.map(e => e.id)))
                          } else {
                            setBulkSelected(new Set())
                          }
                        }}
                      />
                      <span className="text-sm font-medium">
                        {bulkSelected.size} / {eligibles.length} sélectionné(s)
                      </span>
                    </div>
                    {eligibles.map(e => {
                      const hasEmail = !!e.email
                      const checked = bulkSelected.has(e.id)
                      return (
                        <div key={e.id} className={`flex items-center gap-2 px-3 py-2 border-b last:border-0 ${!hasEmail ? "bg-red-50/40" : ""}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!hasEmail}
                            onChange={(ev) => {
                              setBulkSelected(prev => {
                                const next = new Set(prev)
                                if (ev.target.checked) next.add(e.id)
                                else next.delete(e.id)
                                return next
                              })
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{e.prenom} {e.nom}</p>
                            <p className="text-xs text-gray-500 truncate">
                              {hasEmail ? e.email : <span className="text-red-600">Email manquant — renseignez avant création</span>}
                            </p>
                          </div>
                          {bulkUsePerEmp && hasEmail && checked && (
                            <Input
                              className="font-mono w-40 h-8 text-sm"
                              placeholder="Mot de passe"
                              value={bulkPerEmpPwd[e.id] ?? ""}
                              onChange={(ev) => setBulkPerEmpPwd(p => ({ ...p, [e.id]: ev.target.value }))}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setBulkOpen(false)}>Annuler</Button>
                <Button
                  onClick={handleBulkCreate}
                  disabled={
                    bulkSaving ||
                    bulkSelected.size === 0 ||
                    (!bulkUsePerEmp && (!bulkDefaultPwd || bulkDefaultPwd.length < 6))
                  }
                  className="flex-1 bg-[#0B0F2E] text-white"
                >
                  {bulkSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Key className="w-4 h-4 mr-2" />}
                  Créer les comptes sélectionnés
                </Button>
              </div>
            </div>
          )}

          {bulkResults && (
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 bg-green-50 border border-green-200 rounded">
                  <p className="text-2xl font-bold text-green-700">{bulkResults.filter(r => r.status === "created").length}</p>
                  <p className="text-xs text-green-700">Créés</p>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-2xl font-bold text-blue-700">{bulkResults.filter(r => r.status === "already_linked").length}</p>
                  <p className="text-xs text-blue-700">Déjà liés</p>
                </div>
                <div className="p-3 bg-red-50 border border-red-200 rounded">
                  <p className="text-2xl font-bold text-red-700">{bulkResults.filter(r => r.status === "error").length}</p>
                  <p className="text-xs text-red-700">Erreurs</p>
                </div>
              </div>
              <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                {bulkResults.map((r, i) => {
                  const emp = employes.find(e => e.id === r.employe_id)
                  return (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 border-b last:border-0">
                      {r.status === "created" && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                      {r.status === "already_linked" && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />}
                      {r.status === "error" && <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {emp ? `${emp.prenom} ${emp.nom}` : r.employe_id}
                        </p>
                        {r.status === "error" && (
                          <p className="text-xs text-red-700 truncate">{r.error}</p>
                        )}
                        {r.status === "already_linked" && (
                          <p className="text-xs text-blue-700">Compte déjà existant</p>
                        )}
                        {r.status === "created" && r.email && (
                          <p className="text-xs text-green-700 truncate">✅ {r.email}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <Button className="w-full bg-[#0B0F2E] text-white" onClick={() => setBulkOpen(false)}>
                Fermer
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog suppression employe */}
      <Dialog open={deleteOpen} onOpenChange={o => { setDeleteOpen(o); if (!o) { setDeleteEmp(null); setDeleteError(null); setDeleting(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#0B0F2E]">
              <Trash2 className="w-5 h-5 text-red-600" />
              Supprimer l'employe
            </DialogTitle>
          </DialogHeader>
          {deleteEmp && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium">{deleteEmp.prenom} {deleteEmp.nom}</p>
                <p className="text-sm text-gray-500">{deleteEmp.poste || "—"}{deleteEmp.email ? ` • ${deleteEmp.email}` : ""}</p>
              </div>

              {deleteError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2 text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{deleteError}</span>
                </div>
              )}

              <p className="text-sm text-gray-600">Choisissez le type de suppression :</p>

              <div className="space-y-2">
                <Button
                  onClick={() => handleDelete("soft")}
                  disabled={deleting !== null}
                  className="w-full justify-start h-auto py-3 bg-orange-50 hover:bg-orange-100 text-orange-900 border border-orange-200"
                  variant="outline"
                >
                  {deleting === "soft" ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2 shrink-0" />
                  ) : (
                    <UserPlus className="w-4 h-4 mr-2 shrink-0 rotate-180" />
                  )}
                  <div className="text-left">
                    <div className="font-semibold">Marquer comme sorti</div>
                    <div className="text-xs text-orange-700 font-normal">Conserve l'historique et les bulletins</div>
                  </div>
                </Button>

                <Button
                  onClick={() => handleDelete("hard")}
                  disabled={deleting !== null}
                  className="w-full justify-start h-auto py-3 bg-red-50 hover:bg-red-100 text-red-900 border border-red-200"
                  variant="outline"
                >
                  {deleting === "hard" ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2 shrink-0" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2 shrink-0" />
                  )}
                  <div className="text-left">
                    <div className="font-semibold">Supprimer definitivement</div>
                    <div className="text-xs text-red-700 font-normal">Impossible si des bulletins existent</div>
                  </div>
                </Button>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting !== null}>Annuler</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </ClientPageShell>
  )
}
