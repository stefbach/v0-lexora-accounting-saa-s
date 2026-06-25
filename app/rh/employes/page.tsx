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
import { EmptyState } from "@/components/ui/empty-state"
import { BANQUES_MAURITIUS } from "@/lib/rh/banques-mauritius"
import { toast } from "sonner"
import { notifySuccess, notifyError } from "@/lib/utils/toast"
import { t, getLocale } from "@/lib/i18n"

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

// Générateur de mot de passe partagé entre CreateEmployeForm et le flux
// bulk/access de EmployesPage. 10 chars alphanum sans caractères ambigus.
function genPwd() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  let p = ""
  for (let i = 0; i < 10; i++) p += c[Math.floor(Math.random() * c.length)]
  return p
}

// ── Composant formulaire creation (state isole = pas de re-render parent) ──
function CreateEmployeForm({ societes, onCreated, onClose }: { societes: any[]; onCreated: () => void; onClose: () => void }) {
  const [form, setForm] = useState({ societe_id:"",nom:"",prenom:"",poste:"",email:"",telephone:"",salaire_base:"",transport_allowance:"0",petrol_allowance:"0",phone_allowance:"0",daily_bus_fare:"0",date_arrivee:"",role_rh:"salarie",csg_categorie:"A",bank_account:"",bank_name:"",nic:"",tan:"",iban:"",genre:"",date_naissance:"",departement:"",type_contrat:"CDI",devise_salaire:"MUR" })
  // Primes fixes personnalisées (libellé + montant), capées à 3 (mig 117).
  // Mappées au submit vers prime_fixe_1/2/3 + prime_fixe_*_libelle.
  const [primesFixes, setPrimesFixes] = useState<{ libelle: string; montant: string }[]>([])
  const MAX_PRIMES_FIXES = 3
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const locale = getLocale()
  const u = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const addPrimeFixe = () => {
    if (primesFixes.length >= MAX_PRIMES_FIXES) return
    setPrimesFixes(p => [...p, { libelle: "", montant: "" }])
  }
  const removePrimeFixe = (i: number) =>
    setPrimesFixes(p => p.filter((_, idx) => idx !== i))
  const updatePrimeFixe = (i: number, k: "libelle" | "montant", v: string) =>
    setPrimesFixes(p => p.map((row, idx) => idx === i ? { ...row, [k]: v } : row))

  // Section "Accès Lexora" — création optionnelle du compte auth en
  // même temps que la fiche employé. Si toggle ON, un second POST vers
  // /api/rh/employes/[id]/create-account est enchaîné après la création
  // réussie de l'employé. La case s'auto-coche dès qu'un email est
  // saisi (décision produit "auto-creation au create d'un employé :
  // case cochée par défaut si email rempli"), sauf si l'admin a
  // explicitement décoché — on respecte son choix une fois touché.
  const [createAccess, setCreateAccess] = useState(false)
  const [createAccessTouched, setCreateAccessTouched] = useState(false)
  const [accessPwd, setAccessPwd] = useState(() => genPwd())
  const [pwdVisible, setPwdVisible] = useState(true)

  // Auto-coche createAccess dès qu'un email est saisi (sauf si admin
  // a explicitement touché le toggle).
  useEffect(() => {
    if (createAccessTouched) return
    if (form.email && !createAccess) setCreateAccess(true)
    if (!form.email && createAccess) setCreateAccess(false)
  }, [form.email, createAccess, createAccessTouched])

  // Manager (role RH) = encadrant — souvent enregistré sans salaire ni date
  // d'arrivée Lexora (ex. dirigeant de société rattaché pour validation
  // congés/notes de frais sans être payé via la paie). On lève donc le
  // required côté formulaire pour ce rôle uniquement.
  const isManagerRole = form.role_rh === 'manager'
  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.societe_id) errs.societe_id = t('rhe.err.societe_requise', locale)
    if (!form.nom) errs.nom = t('rhe.err.nom_requis', locale)
    if (!form.prenom) errs.prenom = t('rhe.err.prenom_requis', locale)
    if (!form.salaire_base && !isManagerRole) errs.salaire_base = t('rhe.err.salaire_requis', locale)
    if (!form.date_arrivee && !isManagerRole) errs.date_arrivee = t('rhe.err.date_requise', locale)
    // Sprint 2 — validation email + téléphone (Maurice). Champs optionnels :
    // on ne valide QUE s'ils sont renseignés.
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = t('rhe.err.email_invalide', locale)
    }
    if (form.telephone) {
      // Mauritius : +230 suivi de 7 ou 8 chiffres, espaces tolérés.
      // Accepte aussi format local (5XXX XXXX, 8 chiffres sans préfixe).
      const cleaned = form.telephone.replace(/\s+/g, '')
      const okMu = /^\+230\d{7,8}$/.test(cleaned) || /^\d{7,8}$/.test(cleaned)
      if (!okMu) errs.telephone = t('rhe.err.telephone_invalide', locale)
    }
    // Validation compte Lexora : si toggle ON → email + password ≥ 8 chars
    // (aligné avec /api/rh/employes/[id]/create-account côté serveur).
    if (createAccess) {
      if (!form.email) errs.email = errs.email || t('rhe.err.email_requis_compte', locale)
      if (!accessPwd || accessPwd.length < 8) errs._access = t('rhe.err.pwd_min8', locale)
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleCreate = async () => {
    if (!validate()) return
    setSaving(true); setErrors({})
    try {
      // Map primesFixes[0..2] vers prime_fixe_1/2/3 + libellé. Les slots non
      // remplis sont envoyés à 0 / "" pour rester explicites côté DB.
      const primesPayload: Record<string, unknown> = {}
      for (let i = 0; i < MAX_PRIMES_FIXES; i++) {
        const row = primesFixes[i]
        const n = i + 1
        const m = row ? parseFloat(row.montant) || 0 : 0
        primesPayload[`prime_fixe_${n}`] = m
        primesPayload[`prime_fixe_${n}_libelle`] = row ? (row.libelle || "").trim() : ""
      }
      // Pour un manager sans salaire/date renseignés, on envoie 0 / null
      // explicites (l'API tolère ces valeurs pour role_rh='manager').
      // Postgres refuse les chaînes vides "" pour les colonnes DATE
      // (« invalid input syntax for type date: "" ») — on normalise tous
      // les champs date du form en null si vides.
      const salaireParsed = parseFloat(form.salaire_base)
      const payload: Record<string, unknown> = {
        ...form,
        salaire_base: Number.isFinite(salaireParsed) ? salaireParsed : 0,
        date_arrivee: form.date_arrivee || null,
        date_naissance: form.date_naissance || null,
        transport_allowance: parseFloat(form.transport_allowance) || 0,
        petrol_allowance: parseFloat(form.petrol_allowance) || 0,
        phone_allowance: parseFloat(form.phone_allowance) || 0,
        daily_bus_fare: parseFloat(form.daily_bus_fare) || 0,
        ...primesPayload,
      }
      // Filet de sécurité générique : tout champ string vide → null pour
      // éviter qu'une autre colonne DATE/UUID/numérique côté DB reçoive ""
      // (tolérable pour TEXT mais pas pour les autres types).
      for (const k of Object.keys(payload)) {
        if (payload[k] === "") payload[k] = null
      }
      const res = await fetch("/api/rh/employes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      // 401 = session expirée côté navigateur (le middleware bloque les
      // requêtes /api/* sans user). On redirige vers /auth/login pour que
      // l'admin se reconnecte plutôt que d'afficher un message générique.
      if (res.status === 401) {
        notifyError(t('rhe.toast.creer_employe', locale), t('rhe.toast.session_expiree', locale))
        const next = typeof window !== "undefined" ? window.location.pathname : "/rh/employes"
        window.location.href = `/auth/login?next=${encodeURIComponent(next)}`
        return
      }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      // Sprint 4 TÂCHE 6 — feedback selon contrat_status renvoyé par l'API
      const body = await res.json().catch(() => ({}))
      const status = body?.contrat_status as string | undefined
      const employeId = body?.employe?.id as string | undefined

      // Base toast selon contrat_status (fiche employé)
      if (status === 'created') {
        toast.success(t('rhe.toast.cree_contrat_ok', locale), { duration: 5000 })
      } else if (status === 'no_template') {
        toast.warning(t('rhe.toast.cree_no_template', locale), { duration: 6000 })
      } else if (status === 'failed') {
        toast.warning(t('rhe.toast.cree_contrat_failed', locale), { duration: 6000 })
      } else if (!createAccess) {
        notifySuccess(t('rhe.toast.cree_compte_later', locale))
      }

      // Création optionnelle du compte Lexora — enchaînée après la fiche
      // pour avoir l'employe_id en DB. Un échec du compte n'annule PAS
      // la fiche employé (déjà créée) — on notifie en warning et l'admin
      // peut recréer le compte plus tard via le bouton "Créer le compte Lexora".
      if (createAccess && employeId) {
        try {
          // Endpoint qui crée le compte Auth + profile + lie
          // employes.auth_user_id ET envoie l'email Gmail SMTP avec
          // les credentials.
          const accessRes = await fetch(`/api/rh/employes/${employeId}/create-account`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: accessPwd }),
          })
          const accessData = await accessRes.json().catch(() => ({}))
          if (!accessRes.ok || accessData.error) {
            toast.warning(t('rhe.toast.compte_non_cree', locale).replace('{err}', String(accessData.error || `HTTP ${accessRes.status}`)), { duration: 8000 })
          } else if (accessData.email_sent === false) {
            toast.warning(t('rhe.toast.email_non_envoye', locale).replace('{err}', String(accessData.email_error || t('rhe.toast.erreur_smtp', locale))).replace('{email}', String(form.email)), { duration: 10000 })
          } else {
            toast.success(t('rhe.toast.cree_compte_ok', locale).replace('{email}', String(form.email)), { duration: 6000 })
          }
        } catch (e: any) {
          toast.warning(t('rhe.toast.compte_non_cree_reseau', locale).replace('{err}', String(e?.message || t('rhe.toast.erreur_reseau', locale))), { duration: 8000 })
        }
      }

      onClose(); onCreated()
    } catch (e: unknown) { setErrors({ _global: e instanceof Error ? e.message : t('rhe.err.generique', locale) }) }
    finally { setSaving(false) }
  }

  const fieldErr = (k: string) => errors[k] ? <p className="text-xs text-red-500 mt-0.5">{errors[k]}</p> : null

  return (
    <div className="space-y-4 py-2">
      {errors._global && <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-xl">{errors._global}</div>}

      {/* Societe & Role */}
      <FormSection icon={<Building2 className="w-4 h-4 text-[#4191FF]" />} title={t('rhe.create.section_organisation', locale)} color="#4191FF">
        <FormField label={t('rhe.create.field_societe', locale)} required>
          <Select value={form.societe_id} onValueChange={v=>u("societe_id",v)}><SelectTrigger className={selectTriggerClass}><SelectValue placeholder={t('rhe.create.ph_choisir_societe', locale)}/></SelectTrigger><SelectContent>{societes.map(s=><SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent></Select>
          {fieldErr("societe_id")}
        </FormField>
        <FormField label={t('rhe.create.field_role', locale)}>
          {/* Champ RH (employes.role_rh). À ne pas confondre avec le rôle
              Lexora qui vit dans profiles.role et est câblé séparément
              via le toggle "Accès Lexora" plus bas. */}
          <Select value={form.role_rh} onValueChange={v=>u("role_rh",v)}><SelectTrigger className={selectTriggerClass}><SelectValue/></SelectTrigger><SelectContent>{["salarie","manager","rh","admin","direction"].map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
        </FormField>
      </FormSection>

      {/* Identite */}
      <FormSection icon={<User className="w-4 h-4 text-[#4191FF]" />} title={t('rhe.create.section_identite', locale)} color="#4191FF">
        <FormField label={t('rhe.create.field_nom', locale)} required>
          <Input className={inputClass} value={form.nom} onChange={e=>u("nom",e.target.value)} placeholder="DUPONT"/>
          {fieldErr("nom")}
        </FormField>
        <FormField label={t('rhe.create.field_prenom', locale)} required>
          <Input className={inputClass} value={form.prenom} onChange={e=>u("prenom",e.target.value)} placeholder="Jean"/>
          {fieldErr("prenom")}
        </FormField>
        <FormField label={t('rhe.create.field_email', locale)}>
          <Input className={inputClass} type="email" value={form.email} onChange={e=>u("email",e.target.value)} placeholder="jean@example.com"/>
          {fieldErr("email")}
        </FormField>
        <FormField label={t('rhe.create.field_telephone', locale)}>
          <Input className={inputClass} value={form.telephone} onChange={e=>u("telephone",e.target.value)} placeholder="+230 5123 4567"/>
          {fieldErr("telephone")}
        </FormField>
        <FormField label={t('rhe.create.field_genre', locale)}>
          <Select value={form.genre} onValueChange={v=>u("genre",v)}><SelectTrigger className={selectTriggerClass}><SelectValue placeholder={t('rhe.create.ph_choisir', locale)}/></SelectTrigger><SelectContent><SelectItem value="M">{t('rhe.create.genre_m', locale)}</SelectItem><SelectItem value="F">{t('rhe.create.genre_f', locale)}</SelectItem></SelectContent></Select>
        </FormField>
        <FormField label={t('rhe.create.field_date_naissance', locale)}>
          <Input className={inputClass} type="date" value={form.date_naissance} onChange={e=>u("date_naissance",e.target.value)}/>
        </FormField>
        <FormField label={t('rhe.create.field_nic', locale)}>
          <Input className={inputClass} value={form.nic} onChange={e=>u("nic",e.target.value)} placeholder="A1234567890123"/>
        </FormField>
        <FormField label={t('rhe.create.field_tan', locale)}>
          <Input className={inputClass} value={form.tan} onChange={e=>u("tan",e.target.value)} placeholder="A123456789"/>
        </FormField>
      </FormSection>

      {/* Emploi */}
      <FormSection icon={<Briefcase className="w-4 h-4 text-[#D4AF37]" />} title={t('rhe.create.section_emploi', locale)} color="#D4AF37">
        <FormField label={t('rhe.create.field_poste', locale)}>
          <Input className={inputClass} value={form.poste} onChange={e=>u("poste",e.target.value)} placeholder="Comptable"/>
        </FormField>
        <FormField label={t('rhe.create.field_departement', locale)}>
          <Input className={inputClass} value={form.departement} onChange={e=>u("departement",e.target.value)} placeholder="Finance"/>
        </FormField>
        <FormField label={t('rhe.create.field_date_arrivee', locale)} required={!isManagerRole}>
          <Input className={inputClass} type="date" value={form.date_arrivee} onChange={e=>u("date_arrivee",e.target.value)}/>
          {fieldErr("date_arrivee")}
        </FormField>
        <FormField label={t('rhe.create.field_type_contrat', locale)}>
          <Select value={form.type_contrat} onValueChange={v=>u("type_contrat",v)}><SelectTrigger className={selectTriggerClass}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="CDI">CDI</SelectItem><SelectItem value="CDD">CDD</SelectItem><SelectItem value="Interim">Interim</SelectItem></SelectContent></Select>
        </FormField>
        <FormField label={t('rhe.create.field_csg', locale)}>
          <Select value={form.csg_categorie} onValueChange={v=>u("csg_categorie",v)}><SelectTrigger className={selectTriggerClass}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="A">A</SelectItem><SelectItem value="B">B</SelectItem></SelectContent></Select>
        </FormField>
      </FormSection>

      {/* Rémunération — salaire de base */}
      <FormSection icon={<Banknote className="w-4 h-4 text-green-600" />} title={t('rhe.create.section_remuneration', locale)} color="#22c55e">
        <FormField label={t('rhe.create.field_salaire_base', locale)} required={!isManagerRole}>
          <Input className={inputClass} type="number" value={form.salaire_base} onChange={e=>u("salaire_base",e.target.value)} placeholder={isManagerRole ? t('rhe.create.ph_salaire_manager', locale) : "35 000"}/>
          {fieldErr("salaire_base")}
          {form.salaire_base && parseFloat(form.salaire_base) > 0 && parseFloat(form.salaire_base) < 16500 && (
            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {t('rhe.create.salaire_sous_minimum', locale)}
            </p>
          )}
        </FormField>
        <FormField label={t('rhe.create.field_devise', locale)}>
          <Select value={form.devise_salaire} onValueChange={v=>u("devise_salaire",v)}><SelectTrigger className={selectTriggerClass}><SelectValue/></SelectTrigger><SelectContent>{["MUR","EUR","USD","GBP"].map(d=><SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select>
        </FormField>
      </FormSection>

      {/* Compensations & Allowances — fixes + primes personnalisées */}
      <FormSection icon={<Banknote className="w-4 h-4 text-emerald-600" />} title={t('rhe.create.section_compensations', locale)} color="#10b981">
        <FormField label={t('rhe.create.field_transport', locale)}>
          <Input className={inputClass} type="number" min="0" step="0.01" value={form.transport_allowance} onChange={e=>u("transport_allowance",e.target.value)} placeholder="0"/>
        </FormField>
        <FormField label={t('rhe.create.field_essence', locale)}>
          <Input className={inputClass} type="number" min="0" step="0.01" value={form.petrol_allowance} onChange={e=>u("petrol_allowance",e.target.value)} placeholder="0"/>
        </FormField>
        <FormField label={t('rhe.create.field_telephone_allowance', locale)}>
          <Input className={inputClass} type="number" min="0" step="0.01" value={form.phone_allowance} onChange={e=>u("phone_allowance",e.target.value)} placeholder="0"/>
        </FormField>
        <FormField label={t('rhe.create.field_bus_quotidien', locale)}>
          <Input className={inputClass} type="number" min="0" step="0.01" value={form.daily_bus_fare} onChange={e=>u("daily_bus_fare",e.target.value)} placeholder="0"/>
        </FormField>

        {/* Primes fixes personnalisées (dynamiques, max 3) */}
        <div className="sm:col-span-2 space-y-2 pt-1 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium text-gray-600">
              {t('rhe.create.primes_label', locale)}
              <span className="ml-1 text-gray-400 font-normal">{t('rhe.create.primes_hint', locale)}</span>
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={primesFixes.length >= MAX_PRIMES_FIXES}
              onClick={addPrimeFixe}
              title={primesFixes.length >= MAX_PRIMES_FIXES ? t('rhe.create.primes_max', locale) : t('rhe.create.ajouter', locale)}
            >
              <Plus className="w-3 h-3 mr-1" />
              {t('rhe.create.ajouter_compensation', locale)}
            </Button>
          </div>
          {primesFixes.length === 0 && (
            <p className="text-[11px] text-gray-400 italic">
              {t('rhe.create.primes_empty', locale)}
            </p>
          )}
          {primesFixes.length >= MAX_PRIMES_FIXES && (
            <p className="text-[11px] text-amber-600">
              {t('rhe.create.primes_max_atteint', locale)}
            </p>
          )}
          {primesFixes.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_140px_auto] gap-2 items-center">
              <Input
                className={inputClass}
                value={row.libelle}
                onChange={e => updatePrimeFixe(i, "libelle", e.target.value)}
                placeholder={t('rhe.create.prime_libelle_ph', locale).replace('{n}', String(i + 1))}
              />
              <Input
                className={`${inputClass} font-mono`}
                type="number" min="0" step="0.01"
                value={row.montant}
                onChange={e => updatePrimeFixe(i, "montant", e.target.value)}
                placeholder={t('rhe.create.montant_mur', locale)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => removePrimeFixe(i)}
                title={t('rhe.create.supprimer', locale)}
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>

        {/* Résumé brut estimé en temps réel */}
        {(() => {
          const base = parseFloat(form.salaire_base) || 0
          const transport = parseFloat(form.transport_allowance) || 0
          const petrol = parseFloat(form.petrol_allowance) || 0
          const phone = parseFloat(form.phone_allowance) || 0
          // daily_bus_fare est par jour → exclu du brut mensuel estimé pour
          // éviter une projection trompeuse (dépend du nb de jours travaillés)
          const primes = primesFixes.reduce((s, r) => s + (parseFloat(r.montant) || 0), 0)
          const total = base + transport + petrol + phone + primes
          const lines: { label: string; value: number; sign?: "plus" }[] = []
          if (base > 0) lines.push({ label: t('rhe.create.line_salaire_base', locale), value: base })
          if (transport > 0) lines.push({ label: t('rhe.create.line_transport', locale), value: transport, sign: "plus" })
          if (petrol > 0) lines.push({ label: t('rhe.create.line_essence', locale), value: petrol, sign: "plus" })
          if (phone > 0) lines.push({ label: t('rhe.create.line_telephone', locale), value: phone, sign: "plus" })
          for (const r of primesFixes) {
            const m = parseFloat(r.montant) || 0
            if (m > 0) lines.push({ label: r.libelle.trim() || t('rhe.create.line_prime_perso', locale), value: m, sign: "plus" })
          }
          if (base <= 0) return null
          return (
            <div className="sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 mt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800 mb-2">
                {t('rhe.create.brut_estime', locale)}
              </p>
              <div className="space-y-1">
                {lines.map((l, i) => (
                  <div key={i} className="flex justify-between text-sm font-mono">
                    <span className="text-gray-700">
                      {l.sign === "plus" ? "+ " : ""}{l.label}
                    </span>
                    <span className="text-gray-900">{l.value.toLocaleString("fr-FR")} {form.devise_salaire}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-mono font-bold pt-1 border-t border-emerald-200">
                  <span className="text-emerald-900">{t('rhe.create.total_brut_estime', locale)}</span>
                  <span className="text-emerald-900">{total.toLocaleString("fr-FR")} {form.devise_salaire}</span>
                </div>
              </div>
              {parseFloat(form.daily_bus_fare) > 0 && (
                <p className="text-[10px] text-gray-500 italic mt-2">
                  {t('rhe.create.bus_note', locale).replace('{n}', String(form.daily_bus_fare))}
                </p>
              )}
            </div>
          )
        })()}
      </FormSection>

      {/* Banque */}
      <FormSection icon={<Building2 className="w-4 h-4 text-purple-600" />} title={t('rhe.create.section_banque', locale)} color="#9333ea">
        <FormField label={t('rhe.create.field_banque', locale)}>
          <Select value={form.bank_name} onValueChange={v=>u("bank_name",v)}><SelectTrigger className={selectTriggerClass}><SelectValue placeholder={t('rhe.create.ph_choisir', locale)}/></SelectTrigger><SelectContent>{BANQUES_MAURITIUS.map(b=><SelectItem key={b.code} value={b.code}>{b.nom}</SelectItem>)}</SelectContent></Select>
        </FormField>
        <FormField label={t('rhe.create.field_n_compte', locale)}>
          <Input className={inputClass} value={form.bank_account} onChange={e=>u("bank_account",e.target.value)} placeholder="000012345678"/>
        </FormField>
        <FormField label={t('rhe.create.field_iban', locale)} className="sm:col-span-2">
          <Input className={inputClass} value={form.iban} onChange={e=>u("iban",e.target.value)} placeholder="MU17BOMM..."/>
        </FormField>
      </FormSection>

      {/* Accès Lexora — création optionnelle du compte auth */}
      <FormSection icon={<Key className="w-4 h-4 text-purple-600" />} title={t('rhe.create.section_acces', locale)} color="#9333EA">
        <div className="sm:col-span-2 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 w-4 h-4 accent-purple-600 shrink-0"
              checked={createAccess}
              onChange={e => { setCreateAccessTouched(true); setCreateAccess(e.target.checked) }}
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-[#0B0F2E]">
                {t('rhe.create.acces_toggle', locale)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('rhe.create.acces_toggle_desc', locale)}
              </p>
            </div>
          </label>

          {createAccess && (
            <div className="space-y-3 pl-7">
              <div>
                <Label className="text-xs font-medium text-gray-600 mb-1 block">{t('rhe.create.email_connexion', locale)}</Label>
                <Input
                  className={`${inputClass} bg-gray-50`}
                  value={form.email}
                  readOnly
                  placeholder={t('rhe.create.email_connexion_ph', locale)}
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  {t('rhe.create.email_connexion_hint', locale)}
                </p>
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-600 mb-1 block">{t('rhe.create.mot_de_passe', locale)}</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={pwdVisible ? "text" : "password"}
                      value={accessPwd}
                      onChange={e => setAccessPwd(e.target.value)}
                      className={`${inputClass} font-mono pr-10`}
                      placeholder={t('rhe.create.mot_de_passe_ph', locale)}
                    />
                    <button
                      type="button"
                      onClick={() => setPwdVisible(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      title={pwdVisible ? t('rhe.create.masquer', locale) : t('rhe.create.afficher', locale)}
                    >
                      {pwdVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setAccessPwd(genPwd())}>
                    {t('rhe.create.generer', locale)}
                  </Button>
                </div>
                {errors._access && <p className="text-xs text-red-500 mt-1">{errors._access}</p>}
              </div>
              <div className="flex items-start gap-2 p-2 rounded bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">{t('rhe.create.important', locale)}</span> {t('rhe.create.pwd_warning', locale)}
                </p>
              </div>
            </div>
          )}
        </div>
      </FormSection>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        <Button variant="outline" onClick={onClose} className="sm:flex-1 h-11 rounded-xl">{t('rhe.create.annuler', locale)}</Button>
        <Button onClick={handleCreate} disabled={saving} className="sm:flex-[2] h-11 rounded-xl bg-[#D4AF37] hover:bg-[#c9a432] text-white font-semibold shadow-md" style={{ fontFamily: "Poppins, sans-serif" }}>
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-2"/>}
          {t('rhe.create.creer_employe', locale)}
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

function EditEmployeForm({ emp, onSaved, onClose }: { emp: any; onSaved: () => void; onClose: () => void }) {
  const [e, setE] = useState({
    ...emp,
    // Normalisation working_days (peut être JSONB depuis la DB ou undefined)
    working_days: emp.working_days && typeof emp.working_days === "object"
      ? { ...WORKING_DAYS_DEFAULT, ...emp.working_days }
      : WORKING_DAYS_DEFAULT,
  })
  const [saving, setSaving] = useState(false)
  const locale = getLocale()
  const DAY_LABELS_I18N: Record<string, string> = {
    mon: t('rhe.edit.day_mon', locale), tue: t('rhe.edit.day_tue', locale), wed: t('rhe.edit.day_wed', locale),
    thu: t('rhe.edit.day_thu', locale), fri: t('rhe.edit.day_fri', locale), sat: t('rhe.edit.day_sat', locale), sun: t('rhe.edit.day_sun', locale),
  }
  const u = (k: string, v: any) => setE((p: any) => ({ ...p, [k]: v }))
  const toggleDay = (day: string) =>
    setE((p: any) => ({ ...p, working_days: { ...p.working_days, [day]: !p.working_days?.[day] } }))

  const handleSave = async () => {
    // Sprint 5 FIX 2 — protection salaire : empêcher d'envoyer 0 par erreur
    // si l'utilisateur efface le champ puis save. Avant : parseFloat('') || 0
    // écrasait silencieusement le salaire à 0 en DB.
    const salaireSaisi = parseFloat(e.salaire_base)
    if (!Number.isFinite(salaireSaisi) || salaireSaisi <= 0) {
      notifyError(t('rhe.edit.toast_modif_salaire', locale), t('rhe.edit.toast_montant_positif', locale))
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
          // role_rh = rôle RH (salarie/manager/...). À ne pas confondre avec
          // profiles.role qui porte le rôle Lexora (employe/client_admin/…).
          role_rh: e.role_rh || e.role, csg_categorie: e.csg_categorie, bank_name: e.bank_name, bank_account: e.bank_account,
          nic_number: e.nic_number, tan_number: e.tan_number, iban: e.iban, devise_salaire: e.devise_salaire,
          // Sprint 7 FIX 1 — nouveaux champs editable
          working_days: e.working_days,
          exclure_mra: !!e.exclure_mra,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || t('rhe.edit.erreur_http', locale).replace('{n}', String(res.status)))
      // Sprint 9 BUG 2 — toast contextualisé selon les bulletins propagés.
      // L'API renvoie bulletins_updated / bulletins_locked du mois courant.
      if (data.salaire_changed) {
        const updated = Number(data.bulletins_updated) || 0
        const locked = Number(data.bulletins_locked) || 0
        if (updated > 0 && locked > 0) {
          toast.success(t('rhe.edit.toast_sal_both', locale).replace('{u}', String(updated)).replace('{l}', String(locked)), { duration: 6000 })
        } else if (updated > 0) {
          toast.success(t('rhe.edit.toast_sal_updated', locale).replace('{u}', String(updated)), { duration: 6000 })
        } else if (locked > 0) {
          toast.success(t('rhe.edit.toast_sal_locked', locale).replace('{l}', String(locked)), { duration: 6000 })
        } else {
          notifySuccess(t('rhe.edit.toast_sal_none', locale))
        }
      } else {
        notifySuccess(t('rhe.edit.toast_fiche_ok', locale))
      }
      onClose(); onSaved()
    } catch (err: unknown) { notifyError(t('rhe.edit.toast_modif_employe', locale), err) }
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
      <SectionHeader>{t('rhe.edit.section_identite', locale)}</SectionHeader>
      <div><Label>{t('rhe.edit.field_nom', locale)}</Label><Input value={e.nom||""} onChange={ev=>u("nom",ev.target.value)}/></div>
      <div><Label>{t('rhe.edit.field_prenom', locale)}</Label><Input value={e.prenom||""} onChange={ev=>u("prenom",ev.target.value)}/></div>
      <div><Label>{t('rhe.edit.field_email', locale)}</Label><Input type="email" value={e.email||""} onChange={ev=>u("email",ev.target.value)}/></div>
      <div><Label>{t('rhe.edit.field_telephone', locale)}</Label><Input value={e.telephone||""} onChange={ev=>u("telephone",ev.target.value)}/></div>
      <div><Label>{t('rhe.edit.field_nic', locale)}</Label><Input value={e.nic_number||""} onChange={ev=>u("nic_number",ev.target.value)}/></div>
      <div><Label>{t('rhe.edit.field_tan', locale)}</Label><Input value={e.tan_number||""} onChange={ev=>u("tan_number",ev.target.value)}/></div>

      {/* ── Contrat / Poste ── */}
      <SectionHeader>{t('rhe.edit.section_contrat', locale)}</SectionHeader>
      <div><Label>{t('rhe.edit.field_poste', locale)}</Label><Input value={e.poste||""} onChange={ev=>u("poste",ev.target.value)}/></div>
      <div><Label>{t('rhe.edit.field_role', locale)}</Label><Select value={e.role_rh||e.role||"salarie"} onValueChange={v=>u("role_rh",v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["salarie","manager","rh","admin","direction"].map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>{t('rhe.edit.field_date_arrivee', locale)}</Label><Input type="date" value={e.date_arrivee?.split("T")[0]||""} onChange={ev=>u("date_arrivee",ev.target.value)}/></div>
      <div><Label>{t('rhe.edit.field_date_depart', locale)}</Label><Input type="date" value={e.date_depart?.split("T")[0]||""} onChange={ev=>u("date_depart",ev.target.value)}/></div>
      <div className="col-span-2">
        <Label>{t('rhe.edit.field_jours_travailles', locale)} <span className="text-xs text-gray-400 font-normal">{t('rhe.edit.jours_hint', locale)}</span></Label>
        <div className="flex gap-1 mt-1 flex-wrap">
          {Object.keys(DAY_LABELS_I18N).map(day => (
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
              {DAY_LABELS_I18N[day]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Rémunération (FIX 1 — mise en avant) ── */}
      <SectionHeader>{t('rhe.edit.section_remuneration', locale)}</SectionHeader>
      <div className="col-span-2 rounded-lg bg-amber-50/50 border border-amber-200 p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="font-semibold text-[#0B0F2E]">{t('rhe.edit.field_salaire_base', locale)}</Label>
            <Input
              type="number"
              value={e.salaire_base||""}
              onChange={ev=>u("salaire_base",ev.target.value)}
              className="font-mono text-base h-11 border-amber-300 focus:border-amber-500"
              placeholder="Ex: 60000"
            />
            <p className="text-xs text-gray-500 mt-1">
              {t('rhe.edit.actuel', locale)} <span className="font-mono">{Number(emp.salaire_base || 0).toLocaleString("fr-FR")} {emp.devise_salaire || "MUR"}</span>
              {Number(e.salaire_base) !== Number(emp.salaire_base) && (
                <span className="text-amber-700 ml-2">→ <span className="font-mono">{Number(e.salaire_base || 0).toLocaleString("fr-FR")} {e.devise_salaire || "MUR"}</span> {t('rhe.edit.modifie', locale)}</span>
              )}
            </p>
          </div>
          <div>
            <Label>{t('rhe.edit.field_devise', locale)}</Label>
            <Select value={e.devise_salaire||"MUR"} onValueChange={v=>u("devise_salaire",v)}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>{["MUR","EUR","USD","GBP"].map(d=><SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Compensations & Allowances (Sprint 11 BUG 9B) ── */}
      <SectionHeader>{t('rhe.edit.section_compensations', locale)}</SectionHeader>
      <div className="col-span-2 rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-3">
        <p className="text-xs text-gray-500 -mt-1">
          {t('rhe.edit.compensations_desc', locale)}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t('rhe.edit.field_transport', locale)}</Label>
            <Input type="number" min="0" step="0.01" value={e.transport_allowance??""}
              onChange={ev=>u("transport_allowance",ev.target.value)} placeholder="0"/>
          </div>
          <div>
            <Label>{t('rhe.edit.field_essence', locale)}</Label>
            <Input type="number" min="0" step="0.01" value={e.petrol_allowance??""}
              onChange={ev=>u("petrol_allowance",ev.target.value)} placeholder="0"/>
          </div>
          <div>
            <Label>{t('rhe.edit.field_telephone_allowance', locale)}</Label>
            <Input type="number" min="0" step="0.01" value={e.phone_allowance??""}
              onChange={ev=>u("phone_allowance",ev.target.value)} placeholder="0"/>
          </div>
          <div>
            <Label>{t('rhe.edit.field_bus_quotidien', locale)} <span className="text-xs text-gray-400 font-normal">{t('rhe.edit.par_jour', locale)}</span></Label>
            <Input type="number" min="0" step="0.01" value={e.daily_bus_fare??""}
              onChange={ev=>u("daily_bus_fare",ev.target.value)} placeholder="0"/>
          </div>
        </div>

        {/* Primes personnalisées — libellé libre + montant (mig 117) */}
        <div className="pt-2 border-t border-slate-200">
          <p className="text-xs font-semibold text-[#0B0F2E] mb-2">{t('rhe.edit.primes_perso', locale)}</p>
          <div className="space-y-2">
            {[1,2,3].map(n => {
              const libKey = `prime_fixe_${n}_libelle`
              const montantKey = `prime_fixe_${n}`
              return (
                <div key={n} className="grid grid-cols-[1fr_140px] gap-2">
                  <Input
                    value={(e as unknown as Record<string, string | number | null>)[libKey]||""}
                    onChange={ev=>u(libKey,ev.target.value)}
                    placeholder={t('rhe.edit.prime_libelle_ph', locale).replace('{n}', String(n))}
                  />
                  <Input
                    type="number" min="0" step="0.01"
                    value={(e as unknown as Record<string, string | number | null>)[montantKey]??""}
                    onChange={ev=>u(montantKey,ev.target.value)}
                    placeholder={t('rhe.edit.montant_mur', locale)}
                    className="font-mono"
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Fiscal & Bancaire ── */}
      <SectionHeader>{t('rhe.edit.section_fiscal', locale)}</SectionHeader>
      <div><Label>{t('rhe.edit.field_csg', locale)}</Label><Select value={e.csg_categorie||"A"} onValueChange={v=>u("csg_categorie",v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="A">A</SelectItem><SelectItem value="B">B</SelectItem></SelectContent></Select></div>
      <div className="flex items-center gap-2 pt-5">
        <input
          id="exclure_mra"
          type="checkbox"
          checked={!!e.exclure_mra}
          onChange={ev => u("exclure_mra", ev.target.checked)}
          className="h-4 w-4"
        />
        <Label htmlFor="exclure_mra" className="cursor-pointer">
          {t('rhe.edit.exclure_mra', locale)}
          <span className="block text-xs text-gray-500 font-normal">{t('rhe.edit.exclure_mra_desc', locale)}</span>
        </Label>
      </div>
      <div><Label>{t('rhe.edit.field_banque', locale)}</Label><Select value={e.bank_name||""} onValueChange={v=>u("bank_name",v)}><SelectTrigger><SelectValue placeholder={t('rhe.edit.choisir', locale)}/></SelectTrigger><SelectContent>{BANQUES_MAURITIUS.map(b=><SelectItem key={b.code} value={b.code}>{b.nom}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>{t('rhe.edit.field_n_compte', locale)}</Label><Input value={e.bank_account||""} onChange={ev=>u("bank_account",ev.target.value)}/></div>
      <div className="col-span-2"><Label>{t('rhe.edit.field_iban', locale)}</Label><Input value={e.iban||""} onChange={ev=>u("iban",ev.target.value)}/></div>

      <DialogFooter className="col-span-2 pt-4">
        <Button variant="outline" onClick={onClose}>{t('rhe.edit.annuler', locale)}</Button>
        <Button onClick={handleSave} disabled={saving} className="bg-[#0B0F2E] text-white">
          {saving&&<Loader2 className="w-4 h-4 animate-spin mr-2"/>}{t('rhe.edit.enregistrer', locale)}
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
  const locale = getLocale()
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

  // genPwd déplacé au scope module (réutilisé dans CreateEmployeForm)

  const openAccess = (emp: any) => {
    setAccessEmp(emp)
    setAccessRole(emp.role_rh || emp.role || "employe")
    setAccessPassword(genPwd())
    setAccessResult(null)
    setAccessOpen(true)
  }

  const handleCreateAccess = async () => {
    if (!accessEmp || !accessEmp.email) { alert(t('rhe.page.alert_email_requis', locale)); return }
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
          alert(t('rhe.page.alert_erreur', locale) + (data.error || `HTTP ${res.status}`))
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
        if (data.error) { alert(t('rhe.page.alert_erreur', locale) + data.error) }
        else { setAccessResult({ email: accessEmp.email, password: accessPassword }); load() }
      }
    } catch { alert(t('rhe.page.alert_erreur_reseau', locale)) }
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
    if (selected.length === 0) { alert(t('rhe.page.alert_aucun_selection', locale)); return }
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
      if (!res.ok) { alert(t('rhe.page.alert_erreur', locale) + (data.error || `HTTP ${res.status}`)); return }
      setBulkResults(data.results || [])
      load()
    } catch { alert(t('rhe.page.alert_erreur_reseau', locale)) }
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
        throw new Error(data.error || t('rhe.page.erreur_suppression', locale))
      }
      setDeleteOpen(false)
      setDeleteEmp(null)
      load()
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : t('rhe.page.erreur_generique', locale))
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
    if (!importFile || !importSociete) { setImportError(t('rhe.page.import_fichier_requis', locale)); return }
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
    } catch (e: unknown) { setImportError(e instanceof Error ? e.message : t('rhe.page.erreur_import', locale)) }
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
    if (e.date_depart) return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs font-medium">{t('rhe.page.badge_sorti', locale)}</Badge>
    if (e.statut === "essai" || e.type_contrat === "CDD") return <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs font-medium">{t('rhe.page.badge_essai', locale)}</Badge>
    return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs font-medium">{t('rhe.page.badge_actif', locale)}</Badge>
  }

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]" style={{ fontFamily: "Poppins, sans-serif" }}>{t('rha.a.emp.title', locale)}</h1>
          <p className="text-sm text-gray-500">{employes.length} {t('rha.a.emp.suffix_employes', locale)} {filterStatut === "sortis" ? t('rha.a.emp.subtitle_sortis', locale) : filterStatut === "tous" ? t('rha.a.emp.subtitle_total', locale) : t('rha.a.emp.subtitle_active', locale)}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
        <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if(!v){ setImportFile(null); setImportResult(null); setImportError(null) } }}>
          <DialogTrigger asChild><Button variant="outline" className="border-[#0B0F2E] text-[#0B0F2E] rounded-xl h-10"><Upload className="w-4 h-4 mr-2"/>{t('rha.a.emp.import_csv', locale)}</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5"/>{t('rha.a.emp.import_title', locale)}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              {importError && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{importError}</p>}
              {importResult && (
                <div className="space-y-2">
                  <p className="text-sm text-green-700 bg-green-50 p-2 rounded">{importResult.imported} {t('rha.a.emp.import_imported', locale)} {importResult.total_rows} {t('rha.a.emp.import_lignes', locale)}</p>
                  {importResult.errors.length > 0 && (
                    <div className="bg-yellow-50 p-2 rounded max-h-32 overflow-y-auto">
                      <p className="text-sm font-medium text-yellow-800 mb-1">{t('rha.a.emp.import_errors', locale)} ({importResult.errors.length}):</p>
                      {importResult.errors.map((err, i) => <p key={i} className="text-xs text-yellow-700">{t('rha.a.emp.import_line', locale)} {err.row}: {err.message}</p>)}
                    </div>
                  )}
                </div>
              )}
              <div>
                <Label>{t('rha.a.common.societe', locale)} *</Label>
                <Select value={importSociete} onValueChange={setImportSociete}>
                  <SelectTrigger><SelectValue placeholder={t('rha.a.emp.choose_societe', locale)}/></SelectTrigger>
                  <SelectContent>{societes.map(s=><SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('rha.a.emp.csv_file', locale)}</Label>
                <Input type="file" accept=".csv,.xlsx,.xls" onChange={e => setImportFile(e.target.files?.[0] || null)} className="mt-1"/>
                <p className="text-xs text-gray-500 mt-1">{t('rha.a.emp.csv_columns', locale)}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={downloadTemplate} className="text-[#0B0F2E]"><Download className="w-4 h-4 mr-2"/>{t('rha.a.emp.dl_template', locale)}</Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={()=>setImportOpen(false)}>{t('rha.a.emp.fermer', locale)}</Button>
              <Button onClick={handleImport} disabled={importing || !importFile || !importSociete} className="bg-[#0B0F2E] text-white">{importing&&<Loader2 className="w-4 h-4 animate-spin mr-2"/>}{t('rha.a.emp.btn_importer', locale)}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button className="bg-[#D4AF37] hover:bg-[#c9a432] text-white rounded-xl h-10 shadow-sm font-semibold"><Plus className="w-4 h-4 mr-2"/>{t('rha.a.emp.new', locale)}</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" onOpenAutoFocus={e => e.preventDefault()}>
            <DialogHeader><DialogTitle className="text-[#0B0F2E] text-lg font-bold flex items-center gap-2" style={{ fontFamily: "Poppins, sans-serif" }}><UserPlus className="w-5 h-5"/>{t('rha.a.emp.new_dialog_title', locale)}</DialogTitle></DialogHeader>
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
              title={`${missing} ${t('rha.a.emp.bulk_missing_title', locale)}`}
            >
              <Mail className="w-4 h-4 mr-2" />
              {t('rha.a.emp.bulk_create', locale).replace('{n}', String(missing))}
            </Button>
          )
        })()}
        </div>
      </div>

      {/* Search and filters */}
      <Card className="rounded-2xl shadow-sm"><CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
          <Input className="pl-9 h-11 rounded-xl" placeholder={t('rha.a.emp.search_ph', locale)} value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div className="flex gap-2">
          <Select value={filterStatut} onValueChange={setFilterStatut}><SelectTrigger className="w-36 h-11 rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="presents">{t('rha.a.emp.f_presents', locale)}</SelectItem><SelectItem value="sortis">{t('rha.a.emp.f_sortis', locale)}</SelectItem><SelectItem value="tous">{t('rha.a.emp.f_tous', locale)}</SelectItem></SelectContent></Select>
          <Select value={filterSociete} onValueChange={setFilterSociete}><SelectTrigger className="w-44 h-11 rounded-xl"><SelectValue placeholder={t('rha.a.emp.toutes_societes', locale)}/></SelectTrigger><SelectContent><SelectItem value="all">{t('rha.a.emp.toutes', locale)}</SelectItem>{societes.map(s=><SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent></Select>
        </div>
      </CardContent></Card>

      {/* Employee list */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-[#0B0F2E] flex items-center gap-2 text-base" style={{ fontFamily: "Poppins, sans-serif" }}>
            <Users className="w-4 h-4"/>{t('rha.a.emp.list_title', locale)} ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#0B0F2E]"/></div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t('rha.a.emp.list_empty', locale)}
            />
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
                          <span className="text-sm font-medium text-[#0B0F2E]" title={t('rhe.page.tip_salaire_base', locale)}>{fmt(e.salaire_base)}</span>
                          {/* Sprint 10 BUG 3 — afficher "Brut: X" uniquement si différent du base */}
                          {(() => {
                            const brut = computeTotalBrut(e)
                            return brut !== Number(e.salaire_base) ? (
                              <span
                                className="text-xs text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded"
                                title={t('rhe.page.tip_brut', locale)}
                              >
                                {t('rhe.page.brut', locale)} {fmt(brut)}
                              </span>
                            ) : null
                          })()}
                          {/* Sprint 12 FEATURE 4 — badge compte Lexora */}
                          {e.auth_user_id ? (
                            <span className="text-[10px] text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> {t('rhe.page.compte_lexora', locale)}
                            </span>
                          ) : !e.date_depart ? (
                            <span className="text-[10px] text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                              <XCircle className="w-3 h-3" /> {t('rhe.page.pas_de_compte', locale)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {/* Sprint 12 FEATURE 1+4 — bouton conditionnel compte Lexora */}
                        {!e.auth_user_id ? (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(ev)=>{ev.stopPropagation();openAccess(e)}} title={t('rhe.page.tip_creer_compte', locale)}><Key className="w-4 h-4 text-purple-600"/></Button>
                        ) : (
                          <span title={t('rhe.page.tip_compte_actif', locale)} className="h-8 w-8 inline-flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-green-600"/></span>
                        )}
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(ev)=>{ev.stopPropagation();openDelete(e)}} title={t('rhe.page.tip_supprimer', locale)}><Trash2 className="w-4 h-4 text-red-600"/></Button>
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
                      <TableHead className="pl-5 w-[280px]">{t('rha.a.common.employe', locale)}</TableHead>
                      <TableHead>{t('rha.a.common.statut', locale)}</TableHead>
                      <TableHead>{t('rha.a.common.poste', locale)}</TableHead>
                      <TableHead>{t('rha.a.common.departement', locale)}</TableHead>
                      <TableHead className="text-right">{t('rha.a.emp.col_salaire', locale)}</TableHead>
                      {/* Sprint 12 FEATURE 4 — statut compte Lexora */}
                      <TableHead className="text-center">{t('rha.a.emp.col_compte', locale)}</TableHead>
                      <TableHead className="text-right pr-5">{t('rha.a.emp.col_actions', locale)}</TableHead>
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
                            <span className="font-medium text-[#0B0F2E]" title={t('rhe.page.tip_salaire_base2', locale)}>{fmt(e.salaire_base)}</span>
                            {(() => {
                              const brut = computeTotalBrut(e)
                              return brut !== Number(e.salaire_base) ? (
                                <span className="text-[10px] text-emerald-700" title={t('rhe.page.tip_brut', locale)}>
                                  {t('rhe.page.brut', locale)} {fmt(brut)}
                                </span>
                              ) : null
                            })()}
                          </div>
                        </TableCell>
                        {/* Sprint 12 FEATURE 4 — statut compte Lexora */}
                        <TableCell className="text-center">
                          {e.auth_user_id ? (
                            <Badge className="bg-green-100 text-green-700 border-green-200 text-[11px] font-medium gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              {t('rhe.page.badge_actif', locale)}
                            </Badge>
                          ) : !e.date_depart ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] border-purple-300 text-purple-700 hover:bg-purple-50"
                              onClick={(ev) => { ev.stopPropagation(); openAccess(e) }}
                            >
                              <Key className="w-3 h-3 mr-1" />
                              {t('rhe.page.creer', locale)}
                            </Button>
                          ) : (
                            <span className="text-[11px] text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right pr-5">
                          <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(ev)=>{ev.stopPropagation();router.push(`/rh/employes/${e.id}`)}} title={t('rhe.page.tip_voir_fiche', locale)}><ExternalLink className="w-4 h-4 text-[#0B0F2E]"/></Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(ev)=>{ev.stopPropagation();openDelete(e)}} title={t('rhe.page.tip_supprimer', locale)}><Trash2 className="w-4 h-4 text-red-600"/></Button>
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
          <DialogHeader><DialogTitle className="text-[#0B0F2E] text-lg font-bold flex items-center gap-2" style={{ fontFamily: "Poppins, sans-serif" }}><Pencil className="w-5 h-5 text-[#D4AF37]"/>{t('rhe.page.edit_dialog_prefix', locale)} {editEmp?.prenom} {editEmp?.nom}</DialogTitle></DialogHeader>
          {editEmp && <EditEmployeForm emp={editEmp} onSaved={load} onClose={() => { setEditOpen(false); setEditEmp(null) }} />}
        </DialogContent>
      </Dialog>

      {/* Dialog création accès utilisateur */}
      <Dialog open={accessOpen} onOpenChange={o => { setAccessOpen(o); if (!o) { setAccessEmp(null); setAccessResult(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#0B0F2E]">
              <Key className="w-5 h-5 text-purple-600" />
              {t('rhe.page.access_dialog_title', locale)}
            </DialogTitle>
          </DialogHeader>
          {accessEmp && !accessResult && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium">{accessEmp.prenom} {accessEmp.nom}</p>
                <p className="text-sm text-gray-500">{accessEmp.poste || "—"} • {accessEmp.email || t('rhe.page.pas_email', locale)}</p>
              </div>
              {!accessEmp.email && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {t('rhe.page.no_email_warning', locale)}
                </div>
              )}
              <div>
                <Label>{t('rhe.page.role_fonction', locale)}</Label>
                <Select value={accessRole} onValueChange={setAccessRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employe">{t('rhe.page.role_employe', locale)}</SelectItem>
                    <SelectItem value="manager">{t('rhe.page.role_manager', locale)}</SelectItem>
                    <SelectItem value="rh">{t('rhe.page.role_rh', locale)}</SelectItem>
                    <SelectItem value="rh_manager">{t('rhe.page.role_rh_manager', locale)}</SelectItem>
                    <SelectItem value="comptable">{t('rhe.page.role_comptable', locale)}</SelectItem>
                    <SelectItem value="direction">{t('rhe.page.role_direction', locale)}</SelectItem>
                    <SelectItem value="client_admin">{t('rhe.page.role_admin', locale)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('rhe.page.mot_de_passe', locale)}</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={accessPasswordVisible ? "text" : "password"}
                      value={accessPassword}
                      onChange={e => setAccessPassword(e.target.value)}
                      className="font-mono pr-10"
                      placeholder={t('rhe.page.mot_de_passe_ph', locale)}
                    />
                    <button
                      type="button"
                      onClick={() => setAccessPasswordVisible(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      title={accessPasswordVisible ? t('rhe.page.masquer', locale) : t('rhe.page.afficher', locale)}
                    >
                      {accessPasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setAccessPassword(genPwd())} title={t('rhe.page.generer_auto', locale)}>
                    {t('rhe.page.generer', locale)}
                  </Button>
                </div>
                <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    <span className="font-semibold">{t('rhe.page.important', locale)}</span> {t('rhe.page.pwd_warning2', locale)}
                  </p>
                </div>
              </div>
              <Button
                onClick={handleCreateAccess}
                disabled={accessSaving || !accessEmp.email || !accessPassword || accessPassword.length < 6}
                className="w-full bg-[#0B0F2E] text-white"
              >
                {accessSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Key className="w-4 h-4 mr-2" />}
                {accessRole === "employe" ? t('rhe.page.creer_compte_lexora', locale) : t('rhe.page.creer_compte', locale)}
              </Button>
            </div>
          )}
          {accessResult && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="font-semibold text-green-800 mb-2">{t('rhe.page.compte_cree_succes', locale)}</p>
                <div className="space-y-1">
                  <p className="text-sm">{t('rhe.page.label_email', locale)} <span className="font-mono font-bold">{accessResult.email}</span></p>
                  <p className="text-sm">{t('rhe.page.label_mdp', locale)} <span className="font-mono font-bold text-lg">{accessResult.password}</span></p>
                  <p className="text-sm">{t('rhe.page.label_role', locale)} <span className="font-semibold">{accessRole}</span></p>
                </div>
              </div>
              <p className="text-xs text-gray-500">{t('rhe.page.communiquez_ids', locale)}</p>
              <Button variant="outline" className="w-full" onClick={() => { setAccessOpen(false); setAccessResult(null) }}>{t('rhe.page.fermer', locale)}</Button>
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
              {t('rhe.page.bulk_dialog_title', locale)}
            </DialogTitle>
          </DialogHeader>

          {!bulkResults && (
            <div className="space-y-4 pt-2">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-900">
                {t('rhe.page.bulk_intro', locale)}
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
                    <span>{t('rhe.page.bulk_mode_commun', locale)}</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={bulkUsePerEmp}
                      onChange={() => setBulkUsePerEmp(true)}
                    />
                    <span>{t('rhe.page.bulk_mode_per_emp', locale)}</span>
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
                    <Button variant="outline" size="sm" onClick={() => setBulkDefaultPwd(genPwd())}>{t('rhe.page.generer', locale)}</Button>
                  </div>
                )}
                <p className="text-[11px] text-amber-700 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {t('rhe.page.bulk_note_pwd', locale)}
                </p>
              </div>

              {/* Liste des employés éligibles */}
              {(() => {
                const eligibles = employes.filter(e => !e.auth_user_id && !e.date_depart)
                if (eligibles.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-500">
                      <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500" />
                      {t('rhe.page.bulk_all_have', locale)}
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
                        {bulkSelected.size} / {eligibles.length} {t('rhe.page.selectionnes', locale)}
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
                              {hasEmail ? e.email : <span className="text-red-600">{t('rhe.page.email_manquant', locale)}</span>}
                            </p>
                          </div>
                          {bulkUsePerEmp && hasEmail && checked && (
                            <Input
                              className="font-mono w-40 h-8 text-sm"
                              placeholder={t('rhe.page.mot_de_passe_col', locale)}
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
                <Button variant="outline" className="flex-1" onClick={() => setBulkOpen(false)}>{t('rhe.page.annuler', locale)}</Button>
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
                  {t('rhe.page.bulk_creer_selection', locale)}
                </Button>
              </div>
            </div>
          )}

          {bulkResults && (
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 bg-green-50 border border-green-200 rounded">
                  <p className="text-2xl font-bold text-green-700">{bulkResults.filter(r => r.status === "created").length}</p>
                  <p className="text-xs text-green-700">{t('rhe.page.bulk_crees', locale)}</p>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-2xl font-bold text-blue-700">{bulkResults.filter(r => r.status === "already_linked").length}</p>
                  <p className="text-xs text-blue-700">{t('rhe.page.bulk_deja_lies', locale)}</p>
                </div>
                <div className="p-3 bg-red-50 border border-red-200 rounded">
                  <p className="text-2xl font-bold text-red-700">{bulkResults.filter(r => r.status === "error").length}</p>
                  <p className="text-xs text-red-700">{t('rhe.page.bulk_erreurs', locale)}</p>
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
                          <p className="text-xs text-blue-700">{t('rhe.page.bulk_compte_existant', locale)}</p>
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
                {t('rhe.page.fermer', locale)}
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
              {t('rhe.page.delete_dialog_title', locale)}
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

              <p className="text-sm text-gray-600">{t('rhe.page.delete_choose', locale)}</p>

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
                    <div className="font-semibold">{t('rhe.page.delete_soft_title', locale)}</div>
                    <div className="text-xs text-orange-700 font-normal">{t('rhe.page.delete_soft_desc', locale)}</div>
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
                    <div className="font-semibold">{t('rhe.page.delete_hard_title', locale)}</div>
                    <div className="text-xs text-red-700 font-normal">{t('rhe.page.delete_hard_desc', locale)}</div>
                  </div>
                </Button>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting !== null}>{t('rhe.page.annuler', locale)}</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </ClientPageShell>
  )
}
