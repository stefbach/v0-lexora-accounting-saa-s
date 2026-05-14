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
import { t, getLocale, type Locale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function getContractTypes(locale: Locale) {
  return [
    { id: 'CDI', label: t('pub.contrats.ct.cdi', locale), law: 'WRA 2019 s.11' },
    { id: 'CDD', label: t('pub.contrats.ct.cdd', locale), law: 'WRA 2019 s.12' },
    { id: 'CDD_partiel', label: t('pub.contrats.ct.cdd_partiel', locale), law: 'WRA 2019 s.35' },
    { id: 'prestataire', label: t('pub.contrats.ct.prestataire', locale), law: 'Contract Act' },
    { id: 'client_saas', label: t('pub.contrats.ct.client_saas', locale), law: 'ICT Act' },
    { id: 'client_service', label: t('pub.contrats.ct.client_service', locale), law: 'Contract Act' },
    { id: 'nda', label: t('pub.contrats.ct.nda', locale), law: 'DPA 2017' },
  ]
}

function getLanguages(locale: Locale) {
  return [
    { id: 'fr', label: t('pub.contrats.lang.fr', locale) },
    { id: 'en', label: t('pub.contrats.lang.en', locale) },
    { id: 'fr_en', label: t('pub.contrats.lang.fr_en', locale) },
  ]
}

function getJurisdictions(locale: Locale) {
  return [
    { id: 'mu', label: t('pub.contrats.juris.mu', locale), flag: '🇲🇺' },
    { id: 'mu_fr', label: t('pub.contrats.juris.mu_fr', locale), flag: '🇫🇷' },
    { id: 'cv', label: t('pub.contrats.juris.cv', locale), flag: '🇨🇻' },
  ]
}

function getClauses(locale: Locale) {
  return {
    required: [
      { id: 'c1', label: t('pub.contrats.cl.c1', locale), ref: 'WRA s.11' },
      { id: 'c2', label: t('pub.contrats.cl.c2', locale), ref: 'WRA s.12' },
      { id: 'c3', label: t('pub.contrats.cl.c3', locale), ref: 'WRA s.24' },
      { id: 'c4', label: t('pub.contrats.cl.c4', locale), ref: 'WRA s.36' },
      { id: 'c5', label: t('pub.contrats.cl.c5', locale), ref: 'WRA s.47' },
      { id: 'c6', label: t('pub.contrats.cl.c6', locale), ref: 'WRA s.49' },
      { id: 'c7', label: t('pub.contrats.cl.c7', locale), ref: 'CSG Act' },
      { id: 'c8', label: t('pub.contrats.cl.c8', locale), ref: 'ITA 1995' },
      { id: 'c9', label: t('pub.contrats.cl.c9', locale), ref: 'WRA s.38-40' },
    ],
    recommended: [
      { id: 'r1', label: t('pub.contrats.cl.r1', locale), ref: 'DPA 2017' },
      { id: 'r2', label: t('pub.contrats.cl.r2', locale), ref: 'Copyright Act' },
      { id: 'r3', label: t('pub.contrats.cl.r3', locale), ref: 'ICT Act' },
      { id: 'r4', label: t('pub.contrats.cl.r4', locale), ref: 'Contract Act' },
      { id: 'r5', label: t('pub.contrats.cl.r5', locale), ref: 'WRA s.50' },
      { id: 'r6', label: t('pub.contrats.cl.r6', locale), ref: 'Courts Act' },
    ],
    optional: [
      { id: 'o1', label: t('pub.contrats.cl.o1', locale) },
      { id: 'o2', label: t('pub.contrats.cl.o2', locale) },
      { id: 'o3', label: t('pub.contrats.cl.o3', locale) },
      { id: 'o4', label: t('pub.contrats.cl.o4', locale) },
      { id: 'o5', label: t('pub.contrats.cl.o5', locale) },
      { id: 'o6', label: t('pub.contrats.cl.o6', locale) },
    ],
  }
}

function getSteps(locale: Locale) {
  return [
    { id: 'type' as const, label: t('pub.contrats.step.type', locale), icon: FileText },
    { id: 'parties' as const, label: t('pub.contrats.step.parties', locale), icon: Users },
    { id: 'conditions' as const, label: t('pub.contrats.step.conditions', locale), icon: Settings },
    { id: 'clauses' as const, label: t('pub.contrats.step.clauses', locale), icon: List },
    { id: 'preview' as const, label: t('pub.contrats.step.preview', locale), icon: Eye },
  ]
}

type StepId = 'type' | 'parties' | 'conditions' | 'clauses' | 'preview'

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
  const locale = getLocale()
  const CONTRACT_TYPES = getContractTypes(locale)
  const LANGUAGES = getLanguages(locale)
  const JURISDICTIONS = getJurisdictions(locale)
  const CLAUSES = getClauses(locale)
  const STEPS = getSteps(locale)

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
        setError(data.error || t('pub.contrats.error_generation', locale))
        return
      }
      setResult(data.text || "")
    } catch (e: any) {
      setError(t('pub.contrats.error_network', locale) + (e.message || ""))
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
      if (!res.ok) { alert(data.error || t('pub.contrats.error_save', locale)); return }
      if (data.contract_id) {
        setSavedContractId(data.contract_id)
        alert(t('pub.contrats.saved_success', locale))
      }
    } catch (e: any) {
      alert(t('pub.contrats.error_prefix', locale) + " " + (e.message || ""))
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result)
      alert(t('pub.contrats.copied_clipboard', locale))
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
            <h1 className="text-xl font-bold" style={{ color: NAVY }}>{t('pub.contrats.title', locale)}</h1>
            <p className="text-xs text-gray-500">{t('pub.contrats.subtitle', locale)}</p>
          </div>
          <Badge className="gap-1.5" style={{ backgroundColor: NAVY, color: GOLD }}>
            <Shield className="w-3 h-3" />
            {CONTRACT_TYPES.find(ct => ct.id === form.contractType)?.label}
          </Badge>
        </div>

        {/* Societe selector */}
        {societes.length > 1 && (
          <Card className="mb-4">
            <CardContent className="p-3 flex items-center gap-3">
              <Label className="text-sm text-gray-500 shrink-0">{t('pub.contrats.client_company', locale)}</Label>
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
                    <FileText className="w-4 h-4" /> {t('pub.contrats.contract_type', locale)}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {CONTRACT_TYPES.map(ct => (
                      <button key={ct.id} onClick={() => update('contractType', ct.id)}
                        className={`text-left p-3 rounded-xl border text-sm transition-all ${
                          form.contractType === ct.id ? "border-transparent" : "border-gray-200 hover:border-gray-400"
                        }`}
                        style={form.contractType === ct.id ? { backgroundColor: NAVY, color: GOLD } : {}}
                      >
                        <div className="font-medium leading-tight">{ct.label}</div>
                        <div className={`text-xs mt-0.5 ${form.contractType === ct.id ? "opacity-70" : "text-gray-400"}`}>{ct.law}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: NAVY }}>
                    <Globe className="w-4 h-4" /> {t('pub.contrats.language', locale)}
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
                    <Scale className="w-4 h-4" /> {t('pub.contrats.jurisdiction', locale)}
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
                    <Users className="w-4 h-4" /> {t('pub.contrats.employer_provider', locale)}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><Label className="text-xs">{t('pub.contrats.legal_name', locale)}</Label><Input value={form.empName} onChange={e => update('empName', e.target.value)} placeholder={t('pub.contrats.ph.legal_name', locale)} /></div>
                    <div><Label className="text-xs">{t('pub.contrats.brn', locale)}</Label><Input value={form.empBrn} onChange={e => update('empBrn', e.target.value)} placeholder={t('pub.contrats.ph.brn', locale)} /></div>
                    <div className="md:col-span-2"><Label className="text-xs">{t('pub.contrats.registered_address', locale)}</Label><Input value={form.empAddr} onChange={e => update('empAddr', e.target.value)} placeholder={t('pub.contrats.ph.address_full', locale)} /></div>
                    <div><Label className="text-xs">{t('pub.contrats.legal_rep', locale)}</Label><Input value={form.empRep} onChange={e => update('empRep', e.target.value)} placeholder={t('pub.contrats.ph.firstlast', locale)} /></div>
                    <div><Label className="text-xs">{t('pub.contrats.title_role', locale)}</Label><Input value={form.empTitle} onChange={e => update('empTitle', e.target.value)} placeholder={t('pub.contrats.ph.role_examples', locale)} /></div>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: NAVY }}>
                    <Users className="w-4 h-4" /> {t('pub.contrats.employee_party', locale)}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><Label className="text-xs">{t('pub.contrats.full_name', locale)}</Label><Input value={form.eeName} onChange={e => update('eeName', e.target.value)} placeholder={t('pub.contrats.ph.firstlast', locale)} /></div>
                    <div><Label className="text-xs">{t('pub.contrats.nic_passport', locale)}</Label><Input value={form.eeNic} onChange={e => update('eeNic', e.target.value)} placeholder={t('pub.contrats.ph.nic_id', locale)} /></div>
                    <div className="md:col-span-2"><Label className="text-xs">{t('pub.contrats.residential_address', locale)}</Label><Input value={form.eeAddr} onChange={e => update('eeAddr', e.target.value)} placeholder={t('pub.contrats.ph.full_address', locale)} /></div>
                    <div><Label className="text-xs">{t('pub.contrats.email', locale)}</Label><Input type="email" value={form.eeEmail} onChange={e => update('eeEmail', e.target.value)} placeholder={t('pub.contrats.ph.email', locale)} /></div>
                    <div><Label className="text-xs">{t('pub.contrats.phone', locale)}</Label><Input value={form.eePhone} onChange={e => update('eePhone', e.target.value)} placeholder={t('pub.contrats.ph.phone', locale)} /></div>
                  </div>
                </div>
              </>
            )}

            {/* STEP 3: CONDITIONS */}
            {step === 'conditions' && (
              <>
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: NAVY }}>
                    <Settings className="w-4 h-4" /> {t('pub.contrats.job_compensation', locale)}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><Label className="text-xs">{t('pub.contrats.job_title', locale)}</Label><Input value={form.jobTitle} onChange={e => update('jobTitle', e.target.value)} placeholder={t('pub.contrats.ph.job_title', locale)} /></div>
                    <div><Label className="text-xs">{t('pub.contrats.department', locale)}</Label><Input value={form.jobDept} onChange={e => update('jobDept', e.target.value)} placeholder={t('pub.contrats.ph.department', locale)} /></div>
                    <div><Label className="text-xs">{t('pub.contrats.start_date', locale)}</Label><Input type="date" value={form.startDate} onChange={e => update('startDate', e.target.value)} /></div>
                    <div><Label className="text-xs">{t('pub.contrats.end_date', locale)}</Label><Input type="date" value={form.endDate} onChange={e => update('endDate', e.target.value)} /></div>
                    <div><Label className="text-xs">{t('pub.contrats.monthly_salary', locale)}</Label><Input value={form.salary} onChange={e => update('salary', e.target.value)} placeholder={t('pub.contrats.ph.salary', locale)} /></div>
                    <div>
                      <Label className="text-xs">{t('pub.contrats.pay_frequency', locale)}</Label>
                      <Select value={form.payFrequency} onValueChange={v => update('payFrequency', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Mensuel">{t('pub.contrats.freq.monthly', locale)}</SelectItem>
                          <SelectItem value="Bi-mensuel">{t('pub.contrats.freq.bimonthly', locale)}</SelectItem>
                          <SelectItem value="Hebdomadaire">{t('pub.contrats.freq.weekly', locale)}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">{t('pub.contrats.probation', locale)}</Label>
                      <Select value={form.probation} onValueChange={v => update('probation', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="3 mois">{t('pub.contrats.probation.3m', locale)}</SelectItem>
                          <SelectItem value="6 mois">{t('pub.contrats.probation.6m', locale)}</SelectItem>
                          <SelectItem value="1 an">{t('pub.contrats.probation.1y', locale)}</SelectItem>
                          <SelectItem value="Aucune">{t('pub.contrats.probation.none', locale)}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">{t('pub.contrats.notice_period', locale)}</Label>
                      <Select value={form.noticePeriod} onValueChange={v => update('noticePeriod', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1 mois">{t('pub.contrats.notice.1m', locale)}</SelectItem>
                          <SelectItem value="2 mois">{t('pub.contrats.notice.2m', locale)}</SelectItem>
                          <SelectItem value="3 mois">{t('pub.contrats.notice.3m', locale)}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: NAVY }}>
                    <Settings className="w-4 h-4" /> {t('pub.contrats.working_conditions', locale)}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><Label className="text-xs">{t('pub.contrats.weekly_hours', locale)}</Label><Input type="number" value={form.weeklyHours} onChange={e => update('weeklyHours', e.target.value)} placeholder="45" /></div>
                    <div><Label className="text-xs">{t('pub.contrats.work_location', locale)}</Label><Input value={form.workLocation} onChange={e => update('workLocation', e.target.value)} placeholder={t('pub.contrats.ph.work_location', locale)} /></div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">{t('pub.contrats.annual_leave', locale)}</Label>
                      <Select value={form.annualLeave} onValueChange={v => update('annualLeave', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="20 jours (légal minimum WRA 2019)">{t('pub.contrats.leave.20', locale)}</SelectItem>
                          <SelectItem value="22 jours">{t('pub.contrats.leave.22', locale)}</SelectItem>
                          <SelectItem value="25 jours">{t('pub.contrats.leave.25', locale)}</SelectItem>
                          <SelectItem value="30 jours">{t('pub.contrats.leave.30', locale)}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <Label className="text-xs font-semibold">{t('pub.contrats.benefits', locale)}</Label>
                  <Textarea
                    className="mt-1.5 min-h-[80px]"
                    value={form.benefits}
                    onChange={e => update('benefits', e.target.value)}
                    placeholder={t('pub.contrats.ph.benefits', locale)}
                  />
                </div>
              </>
            )}

            {/* STEP 4: CLAUSES */}
            {step === 'clauses' && (
              <>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{t('pub.contrats.clauses_locked_info', locale)}</span>
                </div>

                {/* Required */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('pub.contrats.clauses_mandatory', locale)}</span>
                    <Badge className="bg-blue-100 text-blue-700 text-[9px]">{t('pub.contrats.badge_wra', locale)}</Badge>
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
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('pub.contrats.clauses_recommended', locale)}</span>
                    <Badge className="bg-green-100 text-green-700 text-[9px]">{t('pub.contrats.badge_recommended', locale)}</Badge>
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
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('pub.contrats.clauses_optional', locale)}</span>
                    <Badge className="bg-gray-100 text-gray-600 text-[9px]">{t('pub.contrats.badge_optional', locale)}</Badge>
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
                  <Label className="text-xs font-semibold">{t('pub.contrats.custom_clause', locale)}</Label>
                  <Textarea
                    className="mt-1.5 min-h-[70px]"
                    value={form.customClause}
                    onChange={e => update('customClause', e.target.value)}
                    placeholder={t('pub.contrats.ph.custom_clause', locale)}
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
                      <><Loader2 className="w-4 h-4 animate-spin" /> {t('pub.contrats.generating', locale)}</>
                    ) : result ? (
                      <><CheckCircle className="w-4 h-4 text-green-500" /> {t('pub.contrats.generated', locale)}</>
                    ) : error ? (
                      <><AlertCircle className="w-4 h-4 text-red-500" /> {t('pub.contrats.error', locale)}</>
                    ) : (
                      <><FileText className="w-4 h-4" /> {t('pub.contrats.ready_to_generate', locale)}</>
                    )}
                  </div>
                  {result && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleCopy}>
                        <Copy className="w-3 h-3 mr-1" /> {t('pub.contrats.copy', locale)}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleDownload}>
                        <Download className="w-3 h-3 mr-1" /> {t('pub.contrats.download', locale)}
                      </Button>
                      <Button size="sm" onClick={handleSave} disabled={saving || !societeId} style={{ backgroundColor: NAVY, color: GOLD }}>
                        {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                        {t('pub.contrats.save', locale)}
                      </Button>
                    </div>
                  )}
                </div>

                {!result && !loading && !error && (
                  <div className="text-center py-16 text-gray-400">
                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">{t('pub.contrats.complete_then_click', locale)}</p>
                  </div>
                )}

                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <strong>{t('pub.contrats.error_prefix', locale)}</strong> {error}
                  </div>
                )}

                {savedContractId && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    {t('pub.contrats.saved_with_id', locale)} <code className="font-mono text-xs">{savedContractId.slice(0, 8)}</code>
                  </div>
                )}

                {(loading || result) && (
                  <pre className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs leading-relaxed whitespace-pre-wrap overflow-y-auto max-h-[600px] font-mono text-gray-800">
                    {loading && !result ? t('pub.contrats.generating_placeholder', locale) : result}
                  </pre>
                )}
              </>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-4 border-t">
              <Button variant="ghost" onClick={() => setStep(STEPS[Math.max(0, currentIdx - 1)].id)} disabled={currentIdx === 0}>
                <ChevronLeft className="w-4 h-4 mr-1" /> {t('pub.contrats.back', locale)}
              </Button>
              {step === 'clauses' ? (
                <Button onClick={handleGenerate} disabled={loading} style={{ backgroundColor: NAVY, color: GOLD }}>
                  {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
                  {t('pub.contrats.generate_contract', locale)}
                </Button>
              ) : step !== 'preview' ? (
                <Button onClick={() => setStep(STEPS[currentIdx + 1].id)} style={{ backgroundColor: NAVY, color: GOLD }}>
                  {t('pub.contrats.next', locale)} <ChevronRight className="w-4 h-4 ml-1" />
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
