"use client"

/**
 * /inscription — Workflow d'inscription publique en wizard 3 étapes
 *
 * Sprint 3 du workflow d'inscription :
 *  1. Profil : dirigeant ou comptable
 *  2. Infos : compte + société (ou cabinet)
 *  3. Plan : choix tarif + CGU/CGV
 *
 * Submit → POST /api/inscription → email confirmation + notif admin
 *          → page de succès
 *
 * NB : l'ancienne version (882 lignes, FormSubmit) est remplacée par
 * ce wizard fonctionnel branché sur l'API.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Sparkles, Briefcase, Building2, Loader2, CheckCircle2,
  ArrowRight, ArrowLeft, Star, Check, Mail, AlertTriangle,
} from "lucide-react"
import { LexoraLogo } from "@/components/LexoraLogo"
import { t, getLocale } from "@/lib/i18n"

interface Plan {
  id: string
  code: string
  nom: string
  description: string | null
  type_cible: 'dirigeant' | 'comptable' | 'tous'
  prix_mensuel_mur: number
  prix_annuel_mur: number | null
  modules_inclus: Record<string, boolean>
  limites: Record<string, any>
  populaire: boolean
}

type Etape = 'profil' | 'infos' | 'plan' | 'success'
type TypeDemandeur = 'dirigeant' | 'comptable'

const MODULES_LABEL_KEYS: Record<string, string> = {
  comptabilite: "samsc.insc_mod_compta",
  facturation: "samsc.insc_mod_facturation",
  rh: "samsc.insc_mod_rh",
  fiscal: "samsc.insc_mod_fiscal",
  etats_financiers: "samsc.insc_mod_etats",
  juridique: "samsc.insc_mod_juridique",
  documents: "samsc.insc_mod_documents",
  telegram: "samsc.insc_mod_telegram",
  employe_portal: "samsc.insc_mod_portal",
}

export default function InscriptionPage() {
  const locale = getLocale()
  const [etape, setEtape] = useState<Etape>('profil')
  const [type, setType] = useState<TypeDemandeur>('dirigeant')
  const [plans, setPlans] = useState<Plan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)

  // Infos compte
  const [prenom, setPrenom] = useState("")
  const [nom, setNom] = useState("")
  const [email, setEmail] = useState("")
  const [telephone, setTelephone] = useState("")
  const [poste, setPoste] = useState("")

  // Société (dirigeant)
  const [societeNom, setSocieteNom] = useState("")
  const [societeBrn, setSocieteBrn] = useState("")
  const [societeVat, setSocieteVat] = useState("")
  const [societeSecteur, setSocieteSecteur] = useState("")
  const [societeAdresse, setSocieteAdresse] = useState("")
  const [societeVille, setSocieteVille] = useState("")

  // Cabinet (comptable)
  const [cabinetNom, setCabinetNom] = useState("")
  const [cabinetBrn, setCabinetBrn] = useState("")
  const [cabinetClients, setCabinetClients] = useState("")

  // Plan + CGU
  const [planId, setPlanId] = useState<string>("")
  const [periodicite, setPeriodicite] = useState<'mensuelle' | 'annuelle'>('mensuelle')
  const [acceptCgu, setAcceptCgu] = useState(false)
  const [acceptCgv, setAcceptCgv] = useState(false)
  const [acceptMarketing, setAcceptMarketing] = useState(false)
  const [message, setMessage] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/plans?type=${type}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => setPlans(j.plans || []))
      .catch(() => {})
      .finally(() => setLoadingPlans(false))
  }, [type])

  function validInfos() {
    if (!prenom.trim() || !nom.trim() || !email.trim()) return false
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return false
    if (type === 'dirigeant' && !societeNom.trim()) return false
    if (type === 'comptable' && !cabinetNom.trim()) return false
    return true
  }

  async function submit() {
    if (!acceptCgu || !acceptCgv) {
      setError(t('samsc.insc_err_cgu', locale))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const r = await fetch('/api/inscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type_demandeur: type,
          prenom: prenom.trim(),
          nom: nom.trim(),
          email: email.trim().toLowerCase(),
          telephone: telephone.trim() || null,
          poste: poste.trim() || null,
          societe_data: type === 'dirigeant' ? {
            nom: societeNom.trim(),
            brn: societeBrn.trim() || null,
            vat_number: societeVat.trim() || null,
            secteur_activite: societeSecteur.trim() || null,
            adresse: societeAdresse.trim() || null,
            ville: societeVille.trim() || null,
          } : null,
          cabinet_data: type === 'comptable' ? {
            nom_cabinet: cabinetNom.trim(),
            brn: cabinetBrn.trim() || null,
            nombre_clients_envisage: cabinetClients ? Number(cabinetClients) : null,
          } : null,
          plan_id: planId || null,
          periodicite,
          accept_cgu: acceptCgu,
          accept_cgv: acceptCgv,
          accept_marketing: acceptMarketing,
          message: message.trim() || null,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setEtape('success')
    } catch (e: any) {
      setError(e?.message || t('samsc.insc_err_submit', locale))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B0F2E] via-[#1a2659] to-[#0B0F2E] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-white/80 hover:text-white">
            <LexoraLogo size="lg" />
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold text-white mt-6">
            {etape === 'success' ? t('samsc.insc_success_title', locale) : t('samsc.insc_create_account', locale)}
          </h1>
          {etape !== 'success' && (
            <p className="text-white/70 mt-2 text-sm">
              {t('samsc.insc_lead', locale)}
            </p>
          )}
        </div>

        {/* Progress bar (sauf success) */}
        {etape !== 'success' && (
          <div className="flex items-center justify-center gap-2 mb-6">
            <StepDot active={etape === 'profil'} done={etape !== 'profil'} label={t('samsc.insc_step_profil', locale)} />
            <div className="w-12 h-px bg-white/30" />
            <StepDot active={etape === 'infos'} done={etape === 'plan'} label={t('samsc.insc_step_infos', locale)} />
            <div className="w-12 h-px bg-white/30" />
            <StepDot active={etape === 'plan'} done={false} label={t('samsc.insc_step_plan', locale)} />
          </div>
        )}

        {/* Carte principale */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}

          {/* ─── ÉTAPE 1 : PROFIL ────────────────────────────────────── */}
          {etape === 'profil' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-[#0B0F2E]">{t('samsc.insc_profil_q', locale)}</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <ProfileCard
                  active={type === 'dirigeant'}
                  onClick={() => setType('dirigeant')}
                  icon={<Building2 className="h-7 w-7" />}
                  title={t('samsc.insc_dirigeant_title', locale)}
                  desc={t('samsc.insc_dirigeant_desc', locale)}
                />
                <ProfileCard
                  active={type === 'comptable'}
                  onClick={() => setType('comptable')}
                  icon={<Briefcase className="h-7 w-7" />}
                  title={t('samsc.insc_cabinet_title', locale)}
                  desc={t('samsc.insc_cabinet_desc', locale)}
                />
              </div>
              <div className="flex justify-end pt-4">
                <button
                  onClick={() => setEtape('infos')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B0F2E] text-white rounded-lg font-medium hover:bg-[#1a2659] transition-colors"
                >
                  {t('samsc.insc_continue', locale)} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ─── ÉTAPE 2 : INFOS ─────────────────────────────────────── */}
          {etape === 'infos' && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-[#0B0F2E]">{t('samsc.insc_your_infos', locale)}</h2>

              <Section title={t('samsc.insc_your_account', locale)}>
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label={t('samsc.insc_f_prenom', locale)} value={prenom} onChange={setPrenom} />
                  <Field label={t('samsc.insc_f_nom', locale)} value={nom} onChange={setNom} />
                  <Field label={t('samsc.insc_f_email', locale)} type="email" value={email} onChange={setEmail} />
                  <Field label={t('samsc.insc_f_telephone', locale)} type="tel" value={telephone} onChange={setTelephone} />
                  {type === 'dirigeant' && (
                    <Field label={t('samsc.insc_f_fonction', locale)} value={poste} onChange={setPoste} />
                  )}
                </div>
              </Section>

              {type === 'dirigeant' ? (
                <Section title={t('samsc.insc_your_societe', locale)}>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Field label={t('samsc.insc_f_societe_nom', locale)} value={societeNom} onChange={setSocieteNom} />
                    <Field label={t('samsc.insc_f_brn', locale)} value={societeBrn} onChange={setSocieteBrn} />
                    <Field label={t('samsc.insc_f_vat', locale)} value={societeVat} onChange={setSocieteVat} />
                    <Field label={t('samsc.insc_f_secteur', locale)} value={societeSecteur} onChange={setSocieteSecteur} />
                    <Field label={t('samsc.insc_f_adresse', locale)} value={societeAdresse} onChange={setSocieteAdresse} />
                    <Field label={t('samsc.insc_f_ville', locale)} value={societeVille} onChange={setSocieteVille} />
                  </div>
                </Section>
              ) : (
                <Section title={t('samsc.insc_your_cabinet', locale)}>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Field label={t('samsc.insc_f_cabinet_nom', locale)} value={cabinetNom} onChange={setCabinetNom} />
                    <Field label={t('samsc.insc_f_brn', locale)} value={cabinetBrn} onChange={setCabinetBrn} />
                    <Field label={t('samsc.insc_f_cabinet_clients', locale)} type="number" value={cabinetClients} onChange={setCabinetClients} />
                  </div>
                </Section>
              )}

              <Section title={t('samsc.insc_message_opt', locale)}>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B0F2E]"
                  placeholder={t('samsc.insc_ph_message', locale)}
                />
              </Section>

              <div className="flex items-center justify-between pt-4">
                <button
                  onClick={() => setEtape('profil')}
                  className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-[#0B0F2E]"
                >
                  <ArrowLeft className="h-4 w-4" /> {t('samsc.insc_back', locale)}
                </button>
                <button
                  onClick={() => setEtape('plan')}
                  disabled={!validInfos()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B0F2E] text-white rounded-lg font-medium hover:bg-[#1a2659] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('samsc.insc_continue', locale)} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ─── ÉTAPE 3 : PLAN ──────────────────────────────────────── */}
          {etape === 'plan' && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-[#0B0F2E]">{t('samsc.insc_choose_plan', locale)}</h2>

              {/* Toggle mensuel / annuel */}
              <div className="flex items-center justify-center gap-1 bg-gray-100 p-1 rounded-lg w-fit mx-auto text-sm">
                <button
                  onClick={() => setPeriodicite('mensuelle')}
                  className={`px-4 py-1.5 rounded ${periodicite === 'mensuelle' ? 'bg-white shadow font-semibold' : 'text-gray-600'}`}
                >
                  {t('samsc.insc_monthly', locale)}
                </button>
                <button
                  onClick={() => setPeriodicite('annuelle')}
                  className={`px-4 py-1.5 rounded ${periodicite === 'annuelle' ? 'bg-white shadow font-semibold' : 'text-gray-600'}`}
                >
                  {t('samsc.insc_yearly', locale)} <span className="text-[10px] text-emerald-600 font-bold ml-1">-10%</span>
                </button>
              </div>

              {loadingPlans ? (
                <div className="py-8 text-center">
                  <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
                </div>
              ) : plans.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">
                  {t('samsc.insc_no_plan', locale)}
                </p>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {plans.map(p => (
                    <PlanCard
                      key={p.id}
                      plan={p}
                      periodicite={periodicite}
                      active={planId === p.id}
                      locale={locale}
                      onClick={() => setPlanId(p.id === planId ? "" : p.id)}
                    />
                  ))}
                </div>
              )}

              {/* CGU/CGV */}
              <div className="space-y-2 border-t pt-5">
                <label className="flex items-start gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={acceptCgu} onChange={e => setAcceptCgu(e.target.checked)} className="mt-0.5" />
                  <span>
                    {t('samsc.insc_accept_cgu', locale)} <Link href="/cgu" target="_blank" className="text-[#0B0F2E] underline">{t('samsc.insc_cgu_link', locale)}</Link> *
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={acceptCgv} onChange={e => setAcceptCgv(e.target.checked)} className="mt-0.5" />
                  <span>
                    {t('samsc.insc_accept_cgv', locale)} <Link href="/cgv" target="_blank" className="text-[#0B0F2E] underline">{t('samsc.insc_cgv_link', locale)}</Link> *
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer text-sm text-gray-600">
                  <input type="checkbox" checked={acceptMarketing} onChange={e => setAcceptMarketing(e.target.checked)} className="mt-0.5" />
                  <span>{t('samsc.insc_accept_marketing', locale)}</span>
                </label>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setEtape('infos')}
                  className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-[#0B0F2E]"
                >
                  <ArrowLeft className="h-4 w-4" /> {t('samsc.insc_back', locale)}
                </button>
                <button
                  onClick={submit}
                  disabled={submitting || !acceptCgu || !acceptCgv}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#0B0F2E] to-[#1a2659] text-white rounded-lg font-medium hover:opacity-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {t('samsc.insc_send_request', locale)}
                </button>
              </div>
            </div>
          )}

          {/* ─── SUCCESS ─────────────────────────────────────────────── */}
          {etape === 'success' && (
            <div className="text-center py-6 space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-[#0B0F2E]">
                {t('samsc.insc_success_sent', locale)}
              </h2>
              <p className="text-gray-600 max-w-md mx-auto">
                {t('samsc.insc_success_email', locale).split('{email}')[0]}<strong>{email}</strong>{t('samsc.insc_success_email', locale).split('{email}')[1]}
              </p>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                {t('samsc.insc_success_team', locale)}
              </p>
              <div className="pt-4 flex gap-3 justify-center">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                >
                  {t('samsc.insc_back_home', locale)}
                </Link>
                <a
                  href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'sbach@digital-data-solutions.net'}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B0F2E] text-white rounded-lg text-sm hover:bg-[#1a2659]"
                >
                  <Mail className="h-3.5 w-3.5" /> {t('samsc.insc_contact_us', locale)}
                </a>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-white/50 text-xs mt-6">
          {t('samsc.insc_privacy_note', locale)} <Link href="/protection-donnees" className="underline hover:text-white/80">{t('samsc.insc_privacy_link', locale)}</Link>.
        </p>
      </div>
    </div>
  )
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
        done ? 'bg-emerald-500 text-white' : active ? 'bg-[#D4AF37] text-[#0B0F2E]' : 'bg-white/20 text-white/60'
      }`}>
        {done ? <Check className="h-4 w-4" /> : (label[0])}
      </div>
      <span className={`text-[10px] font-medium ${active ? 'text-white' : 'text-white/60'}`}>{label}</span>
    </div>
  )
}

function ProfileCard({ active, onClick, icon, title, desc }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-5 rounded-xl border-2 transition-all ${
        active
          ? 'border-[#D4AF37] bg-[#D4AF37]/5 shadow-lg'
          : 'border-gray-200 hover:border-[#0B0F2E]/30'
      }`}
    >
      <div className={`mb-3 ${active ? 'text-[#D4AF37]' : 'text-[#0B0F2E]'}`}>{icon}</div>
      <h3 className="font-bold text-[#0B0F2E] mb-1">{title}</h3>
      <p className="text-xs text-gray-600">{desc}</p>
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-[#0B0F2E] mb-2.5">{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600 block mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B0F2E]"
      />
    </label>
  )
}

function PlanCard({ plan, periodicite, active, locale, onClick }: {
  plan: Plan; periodicite: 'mensuelle' | 'annuelle'; active: boolean; locale: ReturnType<typeof getLocale>; onClick: () => void
}) {
  const prix = periodicite === 'annuelle' ? plan.prix_annuel_mur : plan.prix_mensuel_mur
  const suffix = periodicite === 'annuelle' ? '/an' : '/mois'
  // Mise en avant : Telegram (Chief of Staff IA) en premier s'il est inclus.
  const modulesActifs = Object.entries(plan.modules_inclus || {})
    .filter(([, v]) => v)
    .sort(([a], [b]) => (a === 'telegram' ? -1 : b === 'telegram' ? 1 : 0))
    .slice(0, 6)

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative text-left p-4 rounded-xl border-2 transition-all ${
        active
          ? 'border-[#D4AF37] bg-[#D4AF37]/5 shadow-lg'
          : 'border-gray-200 hover:border-[#0B0F2E]/30'
      }`}
    >
      {plan.populaire && (
        <span className="absolute -top-2 left-4 inline-flex items-center gap-1 bg-[#D4AF37] text-[#0B0F2E] text-[10px] font-bold px-2 py-0.5 rounded">
          <Star className="h-2.5 w-2.5" /> {t('samsc.insc_recommended', locale)}
        </span>
      )}
      <h3 className="font-bold text-[#0B0F2E]">{plan.nom}</h3>
      {plan.description && (
        <p className="text-[11px] text-gray-500 mt-0.5">{plan.description}</p>
      )}
      <p className="mt-3">
        <span className="text-2xl font-black text-[#0B0F2E]">{prix?.toLocaleString('fr-FR') || t('samsc.insc_price_none', locale)}</span>
        <span className="text-xs text-gray-500 ml-1">MUR{suffix}</span>
      </p>
      <ul className="mt-3 space-y-1 text-[11px]">
        {modulesActifs.map(([key]) => (
          <li key={key} className="flex items-center gap-1.5">
            <Check className="h-3 w-3 text-emerald-600 flex-shrink-0" />
            <span>{MODULES_LABEL_KEYS[key] ? t(MODULES_LABEL_KEYS[key], locale) : key}</span>
          </li>
        ))}
      </ul>
    </button>
  )
}
