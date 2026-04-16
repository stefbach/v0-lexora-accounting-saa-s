"use client"

import React, { useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  FileText, Users, Settings, List, Eye, ChevronRight, ChevronLeft,
  Download, Copy, CheckCircle, Lock, AlertCircle, Loader2,
  Shield, Scale, Globe, Save, Trash2, FileSignature
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

const CONTRACT_TYPES = [
  { id: 'CDI', label: 'Travail — CDI', law: 'WRA 2019 s.11' },
  { id: 'CDD', label: 'Travail — CDD', law: 'WRA 2019 s.12' },
  { id: 'CDD_partiel', label: 'Travail — Temps partiel', law: 'WRA 2019 s.35' },
  { id: 'prestataire', label: 'Prestataire / Consultant', law: 'Contract Act' },
  { id: 'client_saas', label: 'Client SaaS / Abonnement', law: 'ICT Act' },
  { id: 'client_service', label: 'Client — Prestation services', law: 'Contract Act' },
  { id: 'nda', label: 'NDA / Confidentialité', law: 'DPA 2017' },
]

const LANGUAGES = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'English' },
  { id: 'fr_en', label: 'Bilingue FR/EN' },
]

const JURISDICTIONS = [
  { id: 'mu', label: 'Maurice — droit mauricien', flag: '🇲🇺' },
  { id: 'mu_fr', label: 'Maurice — droit français applicable', flag: '🇫🇷' },
  { id: 'cv', label: 'Cabo Verde', flag: '🇨🇻' },
]

const CLAUSES = {
  required: [
    { id: 'c1', label: 'Identification complète des parties', ref: 'WRA s.11' },
    { id: 'c2', label: 'Durée et type de contrat', ref: 'WRA s.12' },
    { id: 'c3', label: 'Rémunération et modalités de paiement', ref: 'WRA s.24' },
    { id: 'c4', label: 'Heures de travail (45h/semaine max)', ref: 'WRA s.36' },
    { id: 'c5', label: 'Congés annuels (20 jours min)', ref: 'WRA s.47' },
    { id: 'c6', label: 'Congés maladie (15 jours/an)', ref: 'WRA s.49' },
    { id: 'c7', label: 'Cotisations sociales CSG / NSF', ref: 'CSG Act' },
    { id: 'c8', label: 'Retenue PAYE à la source', ref: 'ITA 1995' },
    { id: 'c9', label: 'Conditions de rupture et préavis', ref: 'WRA s.38-40' },
  ],
  recommended: [
    { id: 'r1', label: 'Confidentialité et secrets commerciaux', ref: 'DPA 2017' },
    { id: 'r2', label: 'Propriété intellectuelle', ref: 'Copyright Act' },
    { id: 'r3', label: 'Politique IT et usage des ressources', ref: 'ICT Act' },
    { id: 'r4', label: 'Non-sollicitation (12 mois)', ref: 'Contract Act' },
    { id: 'r5', label: 'End of Year Bonus (13ème mois)', ref: 'WRA s.50' },
    { id: 'r6', label: 'Loi applicable & juridiction', ref: 'Courts Act' },
  ],
  optional: [
    { id: 'o1', label: 'Clause de télétravail' },
    { id: 'o2', label: 'Non-concurrence (délimitée)' },
    { id: 'o3', label: 'Mobilité interne/régionale' },
    { id: 'o4', label: 'Exclusivité partielle' },
    { id: 'o5', label: 'Protection données personnelles (GDPR)' },
    { id: 'o6', label: 'Prime de performance et KPIs' },
  ],
}

const STEPS = [
  { id: 'type', label: 'Type', icon: FileText },
  { id: 'parties', label: 'Parties', icon: Users },
  { id: 'conditions', label: 'Conditions', icon: Settings },
  { id: 'clauses', label: 'Clauses', icon: List },
  { id: 'preview', label: 'Aperçu', icon: Eye },
] as const

type StepId = typeof STEPS[number]['id']

interface ContractForm {
  contractType: string
  language: string
  jurisdiction: string
  empName: string
  empBrn: string
  empAddr: string
  empRep: string
  empTitle: string
  eeName: string
  eeNic: string
  eeAddr: string
  eeEmail: string
  eePhone: string
  jobTitle: string
  jobDept: string
  startDate: string
  endDate: string
  salary: string
  payFrequency: string
  probation: string
  noticePeriod: string
  weeklyHours: string
  workLocation: string
  annualLeave: string
  benefits: string
  clausesRecommended: Record<string, boolean>
  clausesOptional: Record<string, boolean>
  customClause: string
}

export default function ContratsPage() {
  const [step, setStep] = useState<StepId>('type')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState('')
  const [societes, setSocietes] = useState<any[]>([])
  const [societeId, setSocieteId] = useState<string>("")
  const [savedContractId, setSavedContractId] = useState<string | null>(null)

  const [form, setForm] = useState<ContractForm>({
    contractType: 'CDI', language: 'fr', jurisdiction: 'mu',
    empName: '', empBrn: '', empAddr: '', empRep: '', empTitle: '',
    eeName: '', eeNic: '', eeAddr: '', eeEmail: '', eePhone: '',
    jobTitle: '', jobDept: '', startDate: '', endDate: '',
    salary: '', payFrequency: 'Mensuel', probation: '3 mois',
    noticePeriod: '1 mois', weeklyHours: '45', workLocation: '',
    annualLeave: '20 jours (légal minimum WRA 2019)', benefits: '',
    clausesRecommended: Object.fromEntries(CLAUSES.recommended.map(c => [c.id, true])),
    clausesOptional: Object.fromEntries(CLAUSES.optional.map(c => [c.id, false])),
    customClause: '',
  })

  const update = useCallback(<K extends keyof ContractForm>(field: K, value: ContractForm[K]) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }, [])

  // Load societes for save destination
  React.useEffect(() => {
    Promise.all([
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
      setSocietes(unique)
      if (unique.length > 0) {
        const first: any = unique[0]
        setSocieteId(first.id)
        // Pre-fill employer
        setForm(f => ({
          ...f,
          empName: first.nom || '',
          empBrn: first.brn || '',
          empAddr: first.adresse || '',
        }))
      }
    })
  }, [])

  const currentIdx = STEPS.findIndex(s => s.id === step)

  const handleGenerate = async () => {
    setStep('preview')
    setLoading(true)
    setError(null)
    setResult('')
    setSavedContractId(null)
    try {
      const body = {
        form: {
          ...form,
          clausesRecommended: Object.entries(form.clausesRecommended).filter(([, v]) => v).map(([k]) => {
            const c = CLAUSES.recommended.find(c => c.id === k)
            return c ? `${c.label}${c.ref ? ` (${c.ref})` : ''}` : k
          }),
          clausesOptional: Object.entries(form.clausesOptional).filter(([, v]) => v).map(([k]) => {
            const c = CLAUSES.optional.find(c => c.id === k)
            return c?.label || k
          }),
        },
      }
      const res = await fetch("/api/generate-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Erreur de génération")
        return
      }
      setResult(data.text || "")
    } catch (e: any) {
      setError("Erreur réseau : " + (e.message || ""))
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!result || !societeId) return
    setSaving(true)
    try {
      const body = {
        form: {
          ...form,
          clausesRecommended: Object.entries(form.clausesRecommended).filter(([, v]) => v).map(([k]) => k),
          clausesOptional: Object.entries(form.clausesOptional).filter(([, v]) => v).map(([k]) => k),
        },
        save_to_db: true,
        societe_id: societeId,
      }
      // Re-submit with save flag to persist the contract
      const res = await fetch("/api/generate-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || "Erreur sauvegarde"); return }
      if (data.contract_id) {
        setSavedContractId(data.contract_id)
        alert("Contrat sauvegardé avec succès")
      }
    } catch (e: any) {
      alert("Erreur : " + (e.message || ""))
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result)
      alert("Copié dans le presse-papier")
    }
  }

  const handleDownload = () => {
    if (!result) return
    const blob = new Blob([result], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contrat_${form.contractType}_${form.eeName.replace(/\s/g, '_') || 'draft'}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: NAVY }}>
            <FileSignature className="w-5 h-5" style={{ color: GOLD }} />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold" style={{ color: NAVY }}>Générateur de contrats</h1>
            <p className="text-xs text-gray-500">Droit mauricien · WRA 2019 · Income Tax Act · DPA 2017</p>
          </div>
          <Badge className="gap-1.5" style={{ backgroundColor: NAVY, color: GOLD }}>
            <Shield className="w-3 h-3" />
            {CONTRACT_TYPES.find(t => t.id === form.contractType)?.label}
          </Badge>
        </div>

        {/* Societe selector */}
        {societes.length > 1 && (
          <Card className="mb-4">
            <CardContent className="p-3 flex items-center gap-3">
              <Label className="text-sm text-gray-500 shrink-0">Société cliente :</Label>
              <Select value={societeId} onValueChange={setSocieteId}>
                <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {societes.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Step indicator */}
        <div className="flex items-center gap-0 mb-6">
          {STEPS.map((s, idx) => {
            const Icon = s.icon
            const done = idx < currentIdx
            const active = idx === currentIdx
            return (
              <div key={s.id} className="flex items-center">
                <button
                  onClick={() => setStep(s.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    active ? "text-white" : done ? "bg-green-50 text-green-700" : "text-gray-400 hover:text-gray-600"
                  }`}
                  style={active ? { backgroundColor: NAVY, color: GOLD } : {}}
                >
                  {done ? <CheckCircle className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={`w-6 h-px mx-1 ${idx < currentIdx ? "bg-green-300" : "bg-gray-200"}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Content */}
        <Card>
          <CardContent className="p-6 space-y-5">
            {/* STEP 1: TYPE */}
            {step === 'type' && (
              <>
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: NAVY }}>
                    <FileText className="w-4 h-4" /> Type de contrat
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {CONTRACT_TYPES.map(t => (
                      <button key={t.id} onClick={() => update('contractType', t.id)}
                        className={`text-left p-3 rounded-xl border text-sm transition-all ${
                          form.contractType === t.id ? "border-transparent" : "border-gray-200 hover:border-gray-400"
                        }`}
                        style={form.contractType === t.id ? { backgroundColor: NAVY, color: GOLD } : {}}
                      >
                        <div className="font-medium leading-tight">{t.label}</div>
                        <div className={`text-xs mt-0.5 ${form.contractType === t.id ? "opacity-70" : "text-gray-400"}`}>{t.law}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: NAVY }}>
                    <Globe className="w-4 h-4" /> Langue
                  </h3>
                  <div className="flex gap-2 flex-wrap">
                    {LANGUAGES.map(l => (
                      <button key={l.id} onClick={() => update('language', l.id)}
                        className={`px-4 py-2 rounded-full text-sm border transition-all ${
                          form.language === l.id ? "border-transparent font-medium" : "border-gray-200 hover:border-gray-400"
                        }`}
                        style={form.language === l.id ? { backgroundColor: NAVY, color: GOLD } : {}}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: NAVY }}>
                    <Scale className="w-4 h-4" /> Juridiction
                  </h3>
                  <div className="flex gap-2 flex-wrap">
                    {JURISDICTIONS.map(j => (
                      <button key={j.id} onClick={() => update('jurisdiction', j.id)}
                        className={`px-4 py-2 rounded-full text-sm border transition-all flex items-center gap-2 ${
                          form.jurisdiction === j.id ? "border-transparent font-medium" : "border-gray-200 hover:border-gray-400"
                        }`}
                        style={form.jurisdiction === j.id ? { backgroundColor: NAVY, color: GOLD } : {}}
                      >
                        <span>{j.flag}</span> {j.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* STEP 2: PARTIES */}
            {step === 'parties' && (
              <>
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: NAVY }}>
                    <Users className="w-4 h-4" /> Employeur / Prestataire
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><Label className="text-xs">Raison sociale</Label><Input value={form.empName} onChange={e => update('empName', e.target.value)} placeholder="Digital Data Solutions Ltd" /></div>
                    <div><Label className="text-xs">N° BRN</Label><Input value={form.empBrn} onChange={e => update('empBrn', e.target.value)} placeholder="C07123456" /></div>
                    <div className="md:col-span-2"><Label className="text-xs">Adresse enregistrée</Label><Input value={form.empAddr} onChange={e => update('empAddr', e.target.value)} placeholder="Flic en Flac, Rivière Noire, Mauritius" /></div>
                    <div><Label className="text-xs">Représentant légal</Label><Input value={form.empRep} onChange={e => update('empRep', e.target.value)} placeholder="Prénom Nom" /></div>
                    <div><Label className="text-xs">Titre / Fonction</Label><Input value={form.empTitle} onChange={e => update('empTitle', e.target.value)} placeholder="CEO, DRH..." /></div>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: NAVY }}>
                    <Users className="w-4 h-4" /> Employé / Cocontractant
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><Label className="text-xs">Nom complet</Label><Input value={form.eeName} onChange={e => update('eeName', e.target.value)} placeholder="Prénom Nom" /></div>
                    <div><Label className="text-xs">NIC / Passeport</Label><Input value={form.eeNic} onChange={e => update('eeNic', e.target.value)} placeholder="N° identité" /></div>
                    <div className="md:col-span-2"><Label className="text-xs">Adresse résidentielle</Label><Input value={form.eeAddr} onChange={e => update('eeAddr', e.target.value)} placeholder="Adresse complète" /></div>
                    <div><Label className="text-xs">Email</Label><Input type="email" value={form.eeEmail} onChange={e => update('eeEmail', e.target.value)} placeholder="email@domain.com" /></div>
                    <div><Label className="text-xs">Téléphone</Label><Input value={form.eePhone} onChange={e => update('eePhone', e.target.value)} placeholder="+230 5xxx xxxx" /></div>
                  </div>
                </div>
              </>
            )}

            {/* STEP 3: CONDITIONS */}
            {step === 'conditions' && (
              <>
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: NAVY }}>
                    <Settings className="w-4 h-4" /> Poste & Rémunération
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><Label className="text-xs">Intitulé du poste</Label><Input value={form.jobTitle} onChange={e => update('jobTitle', e.target.value)} placeholder="Chargé(e) de clientèle" /></div>
                    <div><Label className="text-xs">Département</Label><Input value={form.jobDept} onChange={e => update('jobDept', e.target.value)} placeholder="Operations, Tech..." /></div>
                    <div><Label className="text-xs">Date de début</Label><Input type="date" value={form.startDate} onChange={e => update('startDate', e.target.value)} /></div>
                    <div><Label className="text-xs">Date de fin (CDD uniquement)</Label><Input type="date" value={form.endDate} onChange={e => update('endDate', e.target.value)} /></div>
                    <div><Label className="text-xs">Salaire mensuel brut (MUR)</Label><Input value={form.salary} onChange={e => update('salary', e.target.value)} placeholder="35 000" /></div>
                    <div>
                      <Label className="text-xs">Fréquence de paiement</Label>
                      <Select value={form.payFrequency} onValueChange={v => update('payFrequency', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Mensuel">Mensuel</SelectItem>
                          <SelectItem value="Bi-mensuel">Bi-mensuel</SelectItem>
                          <SelectItem value="Hebdomadaire">Hebdomadaire</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Période d&apos;essai</Label>
                      <Select value={form.probation} onValueChange={v => update('probation', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="3 mois">3 mois</SelectItem>
                          <SelectItem value="6 mois">6 mois</SelectItem>
                          <SelectItem value="1 an">1 an</SelectItem>
                          <SelectItem value="Aucune">Aucune</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Préavis de rupture</Label>
                      <Select value={form.noticePeriod} onValueChange={v => update('noticePeriod', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1 mois">1 mois</SelectItem>
                          <SelectItem value="2 mois">2 mois</SelectItem>
                          <SelectItem value="3 mois">3 mois</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: NAVY }}>
                    <Settings className="w-4 h-4" /> Conditions de travail
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><Label className="text-xs">Heures / semaine</Label><Input type="number" value={form.weeklyHours} onChange={e => update('weeklyHours', e.target.value)} placeholder="45" /></div>
                    <div><Label className="text-xs">Lieu de travail</Label><Input value={form.workLocation} onChange={e => update('workLocation', e.target.value)} placeholder="Flic en Flac / Télétravail" /></div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">Congés annuels</Label>
                      <Select value={form.annualLeave} onValueChange={v => update('annualLeave', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="20 jours (légal minimum WRA 2019)">20 jours (légal minimum WRA 2019)</SelectItem>
                          <SelectItem value="22 jours">22 jours</SelectItem>
                          <SelectItem value="25 jours">25 jours</SelectItem>
                          <SelectItem value="30 jours">30 jours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <Label className="text-xs font-semibold">Avantages complémentaires</Label>
                  <Textarea
                    className="mt-1.5 min-h-[80px]"
                    value={form.benefits}
                    onChange={e => update('benefits', e.target.value)}
                    placeholder="Transport Rs 2 000/mois, assurance TIBOK incluse, 13ème mois prorata..."
                  />
                </div>
              </>
            )}

            {/* STEP 4: CLAUSES */}
            {step === 'clauses' && (
              <>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Les clauses <strong>obligatoires</strong> sont verrouillées (conformité WRA 2019, Income Tax Act, CSG Act). Les autres sont modifiables.</span>
                </div>

                {/* Required */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Clauses obligatoires</span>
                    <Badge className="bg-blue-100 text-blue-700 text-[9px]">WRA 2019</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {CLAUSES.required.map(c => (
                      <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm">
                        <Lock className="w-3 h-3 text-gray-400 shrink-0" />
                        <span className="flex-1 text-gray-700">{c.label}</span>
                        <span className="text-xs text-gray-400 font-mono shrink-0">{c.ref}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommended */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Clauses recommandées</span>
                    <Badge className="bg-green-100 text-green-700 text-[9px]">Recommandé</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {CLAUSES.recommended.map(c => (
                      <label key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-200 text-sm cursor-pointer hover:bg-gray-50">
                        <Checkbox
                          checked={form.clausesRecommended[c.id]}
                          onCheckedChange={(v) => setForm(f => ({ ...f, clausesRecommended: { ...f.clausesRecommended, [c.id]: !!v } }))}
                        />
                        <span className="flex-1 text-gray-700">{c.label}</span>
                        {c.ref && <span className="text-xs text-gray-400 font-mono shrink-0">{c.ref}</span>}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Optional */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Clauses optionnelles</span>
                    <Badge className="bg-gray-100 text-gray-600 text-[9px]">Optionnel</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {CLAUSES.optional.map(c => (
                      <label key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-200 text-sm cursor-pointer hover:bg-gray-50">
                        <Checkbox
                          checked={form.clausesOptional[c.id]}
                          onCheckedChange={(v) => setForm(f => ({ ...f, clausesOptional: { ...f.clausesOptional, [c.id]: !!v } }))}
                        />
                        <span className="flex-1 text-gray-700">{c.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold">Clause personnalisée</Label>
                  <Textarea
                    className="mt-1.5 min-h-[70px]"
                    value={form.customClause}
                    onChange={e => update('customClause', e.target.value)}
                    placeholder="Rédigez ici une clause spécifique (mobilité, exclusivité, équipement, astreinte...)"
                  />
                </div>
              </>
            )}

            {/* STEP 5: PREVIEW */}
            {step === 'preview' && (
              <>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    {loading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Génération en cours…</>
                    ) : result ? (
                      <><CheckCircle className="w-4 h-4 text-green-500" /> Contrat généré</>
                    ) : error ? (
                      <><AlertCircle className="w-4 h-4 text-red-500" /> Erreur</>
                    ) : (
                      <><FileText className="w-4 h-4" /> Prêt à générer</>
                    )}
                  </div>
                  {result && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleCopy}>
                        <Copy className="w-3 h-3 mr-1" /> Copier
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleDownload}>
                        <Download className="w-3 h-3 mr-1" /> Télécharger
                      </Button>
                      <Button size="sm" onClick={handleSave} disabled={saving || !societeId} style={{ backgroundColor: NAVY, color: GOLD }}>
                        {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                        Sauvegarder
                      </Button>
                    </div>
                  )}
                </div>

                {!result && !loading && !error && (
                  <div className="text-center py-16 text-gray-400">
                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Complétez les étapes et cliquez sur &quot;Générer le contrat&quot;</p>
                  </div>
                )}

                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <strong>Erreur :</strong> {error}
                  </div>
                )}

                {savedContractId && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Contrat sauvegardé avec l&apos;ID : <code className="font-mono text-xs">{savedContractId.slice(0, 8)}</code>
                  </div>
                )}

                {(loading || result) && (
                  <pre className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs leading-relaxed whitespace-pre-wrap overflow-y-auto max-h-[600px] font-mono text-gray-800">
                    {loading && !result ? "…génération en cours…" : result}
                  </pre>
                )}
              </>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-4 border-t">
              <Button variant="ghost" onClick={() => setStep(STEPS[Math.max(0, currentIdx - 1)].id)} disabled={currentIdx === 0}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Retour
              </Button>
              {step === 'clauses' ? (
                <Button onClick={handleGenerate} disabled={loading} style={{ backgroundColor: NAVY, color: GOLD }}>
                  {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
                  Générer le contrat
                </Button>
              ) : step !== 'preview' ? (
                <Button onClick={() => setStep(STEPS[currentIdx + 1].id)} style={{ backgroundColor: NAVY, color: GOLD }}>
                  Suivant <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </ClientPageShell>
  )
}
