"use client"

/**
 * /admin/plans — CRUD des plans tarifaires utilisés par /inscription.
 *
 * Structure :
 *   1) En-tête avec deux KPIs (nb plans dirigeant, nb plans comptable)
 *   2) Filtres : type_cible (tous / dirigeant / comptable), actif/inactif
 *   3) Table groupée par type, ordonnée par `ordre`
 *   4) Dialog plein : édition de tous les champs (code, nom, description,
 *      tarifs mensuel/annuel, 9 modules toggleables, populaire, ordre, actif)
 *
 * Distinction avec /admin/services :
 *   - /admin/plans  → catalogue commercial (ce que voient les prospects)
 *   - /admin/services → assignation d'un plan à une société existante
 */

import { useEffect, useState, useCallback, useMemo } from "react"
import { Loader2, Plus, Edit2, Trash2, Star, Check, AlertCircle, CheckCircle2, Power, PowerOff, Briefcase, UserCog, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { t, getLocale } from "@/lib/i18n"

type TypeCible = 'dirigeant' | 'comptable'
type Pack = 'compta' | 'paie' | 'bundle' | 'addon' | 'cabinet' | 'legacy' | null
type Taille = 'solo' | 'petite' | 'pme' | 'grande' | null

interface Plan {
  id: string
  code: string
  nom: string
  description: string | null
  type_cible: TypeCible
  prix_mensuel_mur: number
  prix_annuel_mur: number | null
  modules_inclus: Record<string, boolean>
  populaire: boolean
  ordre: number
  actif: boolean
  pack?: Pack
  taille_entreprise?: Taille
  is_addon?: boolean
  prix_visible?: boolean
  created_at: string
  updated_at: string | null
}

const MODULE_KEYS = [
  // Modules listés sur /tarifs (visibles côté prospect)
  'documents', 'comptabilite', 'facturation', 'rh', 'fiscal', 'alertes_ia', 'tibok', 'telegram',
  // Sous-modules avancés (internes, non listés sur /tarifs)
  'juridique', 'etats_financiers', 'employe_portal',
] as const
function moduleLabel(key: string, locale: any): string {
  const k = `adm2.plans.mod_${key}`
  const v = t(k, locale)
  return v === k ? key : v
}
function moduleDesc(key: string, locale: any): string {
  const k = `adm2.plans.mod_${key}_desc`
  const v = t(k, locale)
  return v === k ? '' : v
}

const EMPTY_PLAN = (): Plan => ({
  id: '', code: '', nom: '', description: '',
  type_cible: 'dirigeant',
  prix_mensuel_mur: 0, prix_annuel_mur: 0,
  modules_inclus: Object.fromEntries(MODULE_KEYS.map(k => [k, false])),
  populaire: false, ordre: 100, actif: true,
  created_at: '', updated_at: null,
})

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

export default function AdminPlansPage() {
  const locale = getLocale()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | TypeCible>('all')
  const [showInactive, setShowInactive] = useState(true)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [edit, setEdit] = useState<Plan | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/plans', { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || t('adm2.plans.err_generic', locale))
      setPlans(j.plans || [])
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || t('adm2.plans.err_generic', locale) })
    } finally {
      setLoading(false)
    }
  }, [locale])
  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { if (msg) { const timer = setTimeout(() => setMsg(null), 4000); return () => clearTimeout(timer) } }, [msg])

  const visible = useMemo(() => plans.filter(p => showInactive || p.actif), [plans, showInactive])

  // Groupage par pack et par taille pour la vue grille.
  const grid = useMemo(() => {
    const byPack: Record<string, Record<string, Plan>> = { compta: {}, paie: {}, bundle: {} }
    const addons: Plan[] = []
    const cabinets: Plan[] = []
    const legacy: Plan[] = []
    for (const p of visible) {
      if (p.is_addon || p.pack === 'addon') { addons.push(p); continue }
      if (p.pack === 'cabinet') { cabinets.push(p); continue }
      if (p.pack && p.taille_entreprise && byPack[p.pack]) {
        byPack[p.pack][p.taille_entreprise] = p
        continue
      }
      legacy.push(p)
    }
    return { byPack, addons, cabinets, legacy }
  }, [visible])

  const stats = useMemo(() => ({
    packs_actifs: ['compta', 'paie', 'bundle']
      .map(p => Object.values(grid.byPack[p] || {}).filter(x => x?.actif).length)
      .reduce((s, n) => s + n, 0),
    addons_actifs: grid.addons.filter(p => p.actif).length,
    cabinets_actifs: grid.cabinets.filter(p => p.actif).length,
    total: plans.length,
  }), [grid, plans])

  const savePlan = async () => {
    if (!edit) return
    if (!edit.nom.trim()) { setMsg({ type: 'error', text: t('adm2.plans.name_required', locale) }); return }
    setSaving(true)
    try {
      const isNew = !edit.id
      const res = await fetch(isNew ? '/api/admin/plans' : `/api/admin/plans/${edit.id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edit),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || t('adm2.plans.err_generic', locale))
      setMsg({ type: 'success', text: isNew ? t('adm2.plans.created', locale) : t('adm2.plans.updated', locale) })
      setEdit(null); fetchAll()
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || t('adm2.plans.err_generic', locale) })
    } finally {
      setSaving(false)
    }
  }

  const toggleActif = async (p: Plan) => {
    const res = await fetch(`/api/admin/plans/${p.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actif: !p.actif }),
    })
    if (res.ok) { fetchAll(); setMsg({ type: 'success', text: p.actif ? t('adm2.plans.deactivated', locale) : t('adm2.plans.activated', locale) }) }
    else { const j = await res.json(); setMsg({ type: 'error', text: j.error }) }
  }

  const del = async (p: Plan) => {
    if (!confirm(t('adm2.plans.confirm_delete', locale).replace('{name}', p.nom))) return
    setDeletingId(p.id)
    try {
      const res = await fetch(`/api/admin/plans/${p.id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || t('adm2.plans.err_generic', locale))
      setMsg({ type: 'success', text: t('adm2.plans.deleted', locale) }); fetchAll()
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || t('adm2.plans.err_generic', locale) })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0B0F2E' }}>{t('adm2.plans.title', locale)}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('adm2.plans.subtitle_1', locale)} <code className="bg-gray-100 px-1 rounded text-xs">/inscription</code>.
            {t('adm2.plans.subtitle_2', locale)} <a href="/admin/services" className="underline text-blue-700">{t('adm2.plans.services_link', locale)}</a>.
          </p>
        </div>
        <button onClick={() => setEdit(EMPTY_PLAN())}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white" style={{ backgroundColor: '#D4AF37', color: '#0B0F2E' }}>
          <Plus className="h-4 w-4" /> {t('adm2.plans.new_plan', locale)}
        </button>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${msg.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {msg.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">{t('adm2.plans.kpi_packs', locale)}</p>
          <p className="text-xl font-bold" style={{ color: '#0B0F2E' }}>{stats.packs_actifs} <span className="text-sm text-gray-400 font-normal">/ 12</span></p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">{t('adm2.plans.kpi_addons', locale)}</p>
          <p className="text-xl font-bold" style={{ color: '#0B0F2E' }}>{stats.addons_actifs}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">{t('adm2.plans.kpi_cabinets', locale)}</p>
          <p className="text-xl font-bold" style={{ color: '#0B0F2E' }}>{stats.cabinets_actifs}</p>
          <p className="text-[10px] text-amber-600 mt-0.5">{t('adm2.plans.kpi_cabinets_note', locale)}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">{t('adm2.plans.kpi_total', locale)}</p>
          <p className="text-xl font-bold" style={{ color: '#0B0F2E' }}>{stats.total}</p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 mb-4">
        <label className="inline-flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          {t('adm2.plans.show_inactive', locale)}
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-6">
          <PackGrid title={t('adm2.plans.pack_compta_title', locale)} subtitle={t('adm2.plans.pack_compta_sub', locale)}
                    icon={Briefcase} color="#2563eb" locale={locale}
                    plans={grid.byPack.compta} onEdit={setEdit} onToggle={toggleActif} onDelete={del} deletingId={deletingId} />

          <PackGrid title={t('adm2.plans.pack_paie_title', locale)} subtitle={t('adm2.plans.pack_paie_sub', locale)}
                    icon={Briefcase} color="#16a34a" locale={locale}
                    plans={grid.byPack.paie} onEdit={setEdit} onToggle={toggleActif} onDelete={del} deletingId={deletingId} />

          <PackGrid title={t('adm2.plans.pack_bundle_title', locale)} subtitle={t('adm2.plans.pack_bundle_sub', locale)}
                    icon={Briefcase} color="#D4AF37" locale={locale}
                    plans={grid.byPack.bundle} onEdit={setEdit} onToggle={toggleActif} onDelete={del} deletingId={deletingId} />

          <AddonsSection plans={grid.addons} locale={locale} onEdit={setEdit} onToggle={toggleActif} onDelete={del} deletingId={deletingId} />

          <CabinetsSection plans={grid.cabinets} locale={locale} onEdit={setEdit} onToggle={toggleActif} onDelete={del} deletingId={deletingId} />

          {grid.legacy.length > 0 && (
            <GroupSection title={t('adm2.plans.legacy_title', locale)} subtitle={t('adm2.plans.legacy_sub', locale)} icon={UserCog}>
              <PlanTable plans={grid.legacy} locale={locale} onEdit={setEdit} onToggle={toggleActif} onDelete={del} deletingId={deletingId} />
            </GroupSection>
          )}
        </div>
      )}

      {edit && (
        <EditDialog plan={edit} setPlan={setEdit} onSave={savePlan} saving={saving} locale={locale} />
      )}
    </div>
  )
}

function tailleMeta(key: string, locale: any): { label: string; sub: string } {
  return { label: t(`adm2.plans.size_${key}`, locale), sub: t(`adm2.plans.size_${key}_sub`, locale) }
}
const TAILLES_ORDER = ['solo', 'petite', 'pme', 'grande']

function PackGrid({ title, subtitle, icon: Icon, color, locale, plans, onEdit, onToggle, onDelete, deletingId }: {
  title: string; subtitle: string; icon: any; color: string; locale: any
  plans: Record<string, Plan>
  onEdit: (p: Plan) => void; onToggle: (p: Plan) => void; onDelete: (p: Plan) => void; deletingId: string | null
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        <div>
          <h2 className="font-bold text-base" style={{ color: '#0B0F2E' }}>{title}</h2>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {TAILLES_ORDER.map(size => {
          const p = plans[size]
          const meta = tailleMeta(size, locale)
          if (!p) return (
            <div key={size} className="bg-gray-50/60 border border-dashed rounded-xl p-4 text-center">
              <p className="text-xs uppercase tracking-wider text-gray-400">{meta.label}</p>
              <p className="text-xs text-gray-500 mt-1">{meta.sub}</p>
              <p className="text-xs text-gray-400 mt-3 italic">{t('adm2.plans.no_plan_configured', locale)}</p>
            </div>
          )
          return <PackCard key={p.id} plan={p} sizeMeta={meta} accentColor={color} locale={locale}
                           onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} deletingId={deletingId} />
        })}
      </div>
    </section>
  )
}

function PackCard({ plan, sizeMeta, accentColor, locale, onEdit, onToggle, onDelete, deletingId }: {
  plan: Plan; sizeMeta: { label: string; sub: string }; accentColor: string; locale: any
  onEdit: (p: Plan) => void; onToggle: (p: Plan) => void; onDelete: (p: Plan) => void; deletingId: string | null
}) {
  const modulesActifs = Object.entries(plan.modules_inclus || {}).filter(([, v]) => v).map(([k]) => k)
  const economie = plan.prix_annuel_mur && plan.prix_mensuel_mur
    ? Math.max(0, plan.prix_mensuel_mur * 12 - plan.prix_annuel_mur) : 0

  return (
    <div className={`bg-white border-2 rounded-xl p-4 ${!plan.actif ? 'opacity-50' : ''}`}
         style={{ borderColor: plan.populaire ? accentColor : '#E5E7EB' }}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: accentColor }}>{sizeMeta.label}</p>
          <p className="text-[10px] text-gray-500">{sizeMeta.sub}</p>
        </div>
        {plan.populaire && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800"><Star className="h-2.5 w-2.5" />{t('adm2.plans.popular', locale)}</span>}
      </div>
      <p className="font-semibold text-sm mb-2" style={{ color: '#0B0F2E' }}>{plan.nom}</p>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-2xl font-bold" style={{ color: '#0B0F2E' }}>{fmt(plan.prix_mensuel_mur)}</span>
        <span className="text-xs text-gray-500">{t('adm2.plans.per_month', locale)}</span>
      </div>
      {plan.prix_annuel_mur && (
        <p className="text-[11px] text-gray-500 mb-2">
          {fmt(plan.prix_annuel_mur)} {t('adm2.plans.per_year', locale)}
          {economie > 0 && <span className="ml-1 text-green-700 font-semibold">(−{fmt(economie)})</span>}
        </p>
      )}
      <div className="flex flex-wrap gap-1 mb-3 min-h-[40px]">
        {modulesActifs.length === 0 ? <span className="text-xs text-gray-400">{t('adm2.plans.no_module', locale)}</span> :
          modulesActifs.slice(0, 6).map(k => {
            if (!MODULE_KEYS.includes(k as any)) return null
            return <span key={k} className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-800">{moduleLabel(k, locale).split(' ')[0]}</span>
          })}
        {modulesActifs.length > 6 && <span className="text-[10px] text-gray-400">+{modulesActifs.length - 6}</span>}
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" onClick={() => onEdit(plan)} className="flex-1 h-7 text-xs">
          <Edit2 className="w-3 h-3 mr-1" /> {t('adm2.plans.edit', locale)}
        </Button>
        <button onClick={() => onToggle(plan)} className="h-7 px-2 rounded hover:bg-gray-100" title={plan.actif ? t('adm2.plans.deactivate', locale) : t('adm2.plans.activate', locale)}>
          {plan.actif ? <PowerOff className="h-3.5 w-3.5 text-amber-600" /> : <Power className="h-3.5 w-3.5 text-green-600" />}
        </button>
        <button onClick={() => onDelete(plan)} disabled={deletingId === plan.id} className="h-7 px-2 rounded hover:bg-gray-100" title={t('adm2.plans.delete', locale)}>
          {deletingId === plan.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-red-600" />}
        </button>
      </div>
    </div>
  )
}

function AddonsSection({ plans, locale, onEdit, onToggle, onDelete, deletingId }: {
  plans: Plan[]; locale: any
  onEdit: (p: Plan) => void; onToggle: (p: Plan) => void; onDelete: (p: Plan) => void; deletingId: string | null
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <div className="h-9 w-9 rounded-lg bg-purple-50 flex items-center justify-center">
          <Star className="h-5 w-5 text-purple-700" />
        </div>
        <div>
          <h2 className="font-bold text-base" style={{ color: '#0B0F2E' }}>{t('adm2.plans.addons_title', locale)}</h2>
          <p className="text-xs text-gray-500">{t('adm2.plans.addons_sub', locale)}</p>
        </div>
      </div>
      {plans.length === 0 ? (
        <Empty text={t('adm2.plans.no_addon', locale)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {plans.map(p => (
            <div key={p.id} className={`bg-white border rounded-xl p-4 ${!p.actif ? 'opacity-50' : ''}`}>
              <p className="text-[10px] uppercase tracking-wider font-bold text-purple-700">{t('adm2.plans.addon', locale)}</p>
              <p className="font-semibold text-sm mt-1" style={{ color: '#0B0F2E' }}>{p.nom}</p>
              {p.description && <p className="text-[11px] text-gray-500 mt-0.5">{p.description}</p>}
              <p className="mt-2"><span className="text-xl font-bold">{fmt(p.prix_mensuel_mur)}</span> <span className="text-xs text-gray-500">{t('adm2.plans.per_month', locale)}</span></p>
              {p.prix_annuel_mur && <p className="text-[11px] text-gray-500">{fmt(p.prix_annuel_mur)} {t('adm2.plans.per_year', locale)}</p>}
              <div className="flex items-center gap-1 mt-3">
                <Button size="sm" variant="outline" onClick={() => onEdit(p)} className="flex-1 h-7 text-xs"><Edit2 className="w-3 h-3 mr-1" /> {t('adm2.plans.edit', locale)}</Button>
                <button onClick={() => onToggle(p)} className="h-7 px-2 rounded hover:bg-gray-100">
                  {p.actif ? <PowerOff className="h-3.5 w-3.5 text-amber-600" /> : <Power className="h-3.5 w-3.5 text-green-600" />}
                </button>
                <button onClick={() => onDelete(p)} disabled={deletingId === p.id} className="h-7 px-2 rounded hover:bg-gray-100">
                  {deletingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-red-600" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function CabinetsSection({ plans, locale, onEdit, onToggle, onDelete, deletingId }: {
  plans: Plan[]; locale: any
  onEdit: (p: Plan) => void; onToggle: (p: Plan) => void; onDelete: (p: Plan) => void; deletingId: string | null
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center">
          <UserCog className="h-5 w-5 text-amber-700" />
        </div>
        <div>
          <h2 className="font-bold text-base" style={{ color: '#0B0F2E' }}>{t('adm2.plans.cabinets_title', locale)}</h2>
          <p className="text-xs text-gray-500">{t('adm2.plans.cabinets_sub', locale)}</p>
        </div>
      </div>
      {plans.length === 0 ? (
        <Empty text={t('adm2.plans.no_cabinet', locale)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {plans.map(p => (
            <div key={p.id} className={`bg-white border rounded-xl p-4 ${!p.actif ? 'opacity-50' : ''}`}>
              <p className="text-[10px] uppercase tracking-wider font-bold text-amber-700">{t('adm2.plans.cabinet', locale)}</p>
              <p className="font-semibold text-sm mt-1" style={{ color: '#0B0F2E' }}>{p.nom}</p>
              {p.description && <p className="text-[11px] text-gray-500 mt-0.5">{p.description}</p>}
              <p className="text-xs italic text-gray-400 mt-2">{t('adm2.plans.quote_price', locale)}</p>
              <div className="flex items-center gap-1 mt-3">
                <Button size="sm" variant="outline" onClick={() => onEdit(p)} className="flex-1 h-7 text-xs"><Edit2 className="w-3 h-3 mr-1" /> {t('adm2.plans.edit', locale)}</Button>
                <button onClick={() => onToggle(p)} className="h-7 px-2 rounded hover:bg-gray-100">
                  {p.actif ? <PowerOff className="h-3.5 w-3.5 text-amber-600" /> : <Power className="h-3.5 w-3.5 text-green-600" />}
                </button>
                <button onClick={() => onDelete(p)} disabled={deletingId === p.id} className="h-7 px-2 rounded hover:bg-gray-100">
                  {deletingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-red-600" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function GroupSection({ title, subtitle, icon: Icon, children }: any) {
  return (
    <section className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        <Icon className="h-5 w-5 text-gray-500" />
        <div>
          <h2 className="font-bold" style={{ color: '#0B0F2E' }}>{title}</h2>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="bg-white border border-dashed rounded-lg p-8 text-center text-sm text-gray-500">{text}</div>
}

function PlanTable({ plans, locale, onEdit, onToggle, onDelete, deletingId }: {
  plans: Plan[]; locale: any; onEdit: (p: Plan) => void; onToggle: (p: Plan) => void; onDelete: (p: Plan) => void; deletingId: string | null
}) {
  return (
    <div className="bg-white border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="px-4 py-2 font-semibold text-gray-600 w-10">{t('adm2.plans.col_num', locale)}</th>
            <th className="px-4 py-2 font-semibold text-gray-600">{t('adm2.plans.col_plan', locale)}</th>
            <th className="px-4 py-2 font-semibold text-gray-600 text-right">{t('adm2.plans.col_monthly', locale)}</th>
            <th className="px-4 py-2 font-semibold text-gray-600 text-right">{t('adm2.plans.col_annual', locale)}</th>
            <th className="px-4 py-2 font-semibold text-gray-600 text-right">{t('adm2.plans.col_saving', locale)}</th>
            <th className="px-4 py-2 font-semibold text-gray-600">{t('adm2.plans.col_modules', locale)}</th>
            <th className="px-4 py-2 font-semibold text-gray-600">{t('adm2.plans.col_state', locale)}</th>
            <th className="px-4 py-2 font-semibold text-gray-600 text-right">{t('adm2.plans.col_actions', locale)}</th>
          </tr>
        </thead>
        <tbody>
          {plans.map(p => {
            const modulesActifs = Object.entries(p.modules_inclus || {}).filter(([, v]) => v).map(([k]) => k)
            const economie = p.prix_annuel_mur && p.prix_mensuel_mur
              ? Math.max(0, p.prix_mensuel_mur * 12 - p.prix_annuel_mur) : null
            return (
              <tr key={p.id} className={`border-t ${!p.actif ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 text-gray-500 text-xs">{p.ordre}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {p.populaire && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800"><Star className="h-2.5 w-2.5" />{t('adm2.plans.popular', locale)}</span>}
                    <span className="font-semibold" style={{ color: '#0B0F2E' }}>{p.nom}</span>
                  </div>
                  <div className="text-xs text-gray-500 font-mono">{p.code}</div>
                  {p.description && <div className="text-xs text-gray-500 mt-0.5">{p.description}</div>}
                </td>
                <td className="px-4 py-3 text-right font-bold">{fmt(p.prix_mensuel_mur)} <span className="text-xs text-gray-400 font-normal">MUR</span></td>
                <td className="px-4 py-3 text-right">{p.prix_annuel_mur ? <><strong>{fmt(p.prix_annuel_mur)}</strong> <span className="text-xs text-gray-400">MUR</span></> : '—'}</td>
                <td className="px-4 py-3 text-right">{economie != null && economie > 0 ? <span className="text-xs text-green-700 font-semibold">−{fmt(economie)}</span> : <span className="text-xs text-gray-400">—</span>}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1 max-w-md">
                    {modulesActifs.length === 0 ? <span className="text-xs text-gray-400">{t('adm2.plans.none', locale)}</span> :
                      modulesActifs.map(k => {
                        if (!MODULE_KEYS.includes(k as any)) return null
                        return <span key={k} className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-800">{moduleLabel(k, locale)}</span>
                      })}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${p.actif ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {p.actif ? t('adm2.plans.active', locale) : t('adm2.plans.inactive', locale)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button onClick={() => onEdit(p)} className="p-1.5 rounded hover:bg-gray-100" title={t('adm2.plans.edit', locale)}><Edit2 className="h-4 w-4 text-blue-700" /></button>
                    <button onClick={() => onToggle(p)} className="p-1.5 rounded hover:bg-gray-100" title={p.actif ? t('adm2.plans.deactivate', locale) : t('adm2.plans.activate', locale)}>
                      {p.actif ? <PowerOff className="h-4 w-4 text-amber-600" /> : <Power className="h-4 w-4 text-green-600" />}
                    </button>
                    <button onClick={() => onDelete(p)} disabled={deletingId === p.id} className="p-1.5 rounded hover:bg-gray-100" title={t('adm2.plans.delete', locale)}>
                      {deletingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-red-600" />}
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function EditDialog({ plan, setPlan, onSave, saving, locale }: { plan: Plan; setPlan: (p: Plan | null) => void; onSave: () => void; saving: boolean; locale: any }) {
  const isNew = !plan.id
  const economie = plan.prix_annuel_mur && plan.prix_mensuel_mur
    ? Math.max(0, plan.prix_mensuel_mur * 12 - plan.prix_annuel_mur) : 0
  const economiePct = plan.prix_mensuel_mur > 0 && economie > 0
    ? Math.round(economie / (plan.prix_mensuel_mur * 12) * 100) : 0

  const update = (patch: Partial<Plan>) => setPlan({ ...plan, ...patch })
  const setModule = (key: string, value: boolean) => setPlan({ ...plan, modules_inclus: { ...plan.modules_inclus, [key]: value } })

  return (
    <Dialog open={true} onOpenChange={o => { if (!o) setPlan(null) }}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0 bg-white">
          <h2 className="text-xl font-bold" style={{ color: '#0B0F2E' }}>{isNew ? t('adm2.plans.dialog_new', locale) : t('adm2.plans.dialog_edit', locale).replace('{name}', plan.nom)}</h2>
          <button onClick={() => setPlan(null)} className="text-gray-400 hover:text-gray-700"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Profil */}
          <Section title={t('adm2.plans.section_target', locale)}>
            <div className="grid grid-cols-2 gap-3">
              {(['dirigeant', 'comptable'] as const).map(tc => (
                <button key={tc} onClick={() => update({ type_cible: tc })}
                        className={`p-4 rounded-lg border-2 text-left ${plan.type_cible === tc ? 'border-[#D4AF37] bg-amber-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-center gap-2">
                    {tc === 'dirigeant' ? <Briefcase className="h-4 w-4" /> : <UserCog className="h-4 w-4" />}
                    <span className="font-semibold">{tc === 'dirigeant' ? t('adm2.plans.target_dirigeant', locale) : t('adm2.plans.target_cabinet', locale)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{tc === 'dirigeant' ? t('adm2.plans.target_dirigeant_desc', locale) : t('adm2.plans.target_cabinet_desc', locale)}</p>
                </button>
              ))}
            </div>
          </Section>

          {/* Identité */}
          <Section title={t('adm2.plans.section_identity', locale)}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('adm2.plans.field_name', locale)}     value={plan.nom}            onChange={v => update({ nom: v })} placeholder={t('adm2.plans.field_name_ph', locale)} />
              <Field label={t('adm2.plans.field_code', locale)} value={plan.code}         onChange={v => update({ code: v })} placeholder={t('adm2.plans.field_code_ph', locale)} />
              <Field label={t('adm2.plans.field_desc', locale)} value={plan.description || ''} onChange={v => update({ description: v })} className="col-span-2" />
              <Field label={t('adm2.plans.field_order', locale)} type="number" value={String(plan.ordre)} onChange={v => update({ ordre: Number(v) || 0 })} />
              <div className="flex items-center gap-4 pt-6">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={plan.populaire} onChange={e => update({ populaire: e.target.checked })} />
                  <span className="text-sm">{t('adm2.plans.badge_popular', locale)}</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={plan.actif} onChange={e => update({ actif: e.target.checked })} />
                  <span className="text-sm">{t('adm2.plans.plan_active', locale)}</span>
                </label>
              </div>
            </div>
          </Section>

          {/* Tarifs */}
          <Section title={t('adm2.plans.section_prices', locale)}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('adm2.plans.field_monthly', locale)} type="number" value={String(plan.prix_mensuel_mur)} onChange={v => update({ prix_mensuel_mur: Number(v) || 0 })} />
              <Field label={t('adm2.plans.field_annual', locale)}  type="number" value={String(plan.prix_annuel_mur ?? '')} onChange={v => update({ prix_annuel_mur: v ? Number(v) : null })} />
            </div>
            {economie > 0 && (
              <div className="mt-2 inline-flex items-center gap-2 text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
                <Check className="h-3.5 w-3.5" />
                {t('adm2.plans.annual_saving', locale).replace('{amount}', fmt(economie)).replace('{pct}', String(economiePct))}
              </div>
            )}
            {plan.prix_annuel_mur != null && plan.prix_annuel_mur > plan.prix_mensuel_mur * 12 && (
              <div className="mt-2 inline-flex items-center gap-2 text-xs text-red-700 bg-red-50 px-2 py-1 rounded">
                <AlertCircle className="h-3.5 w-3.5" />
                {t('adm2.plans.annual_anomaly', locale)}
              </div>
            )}
          </Section>

          {/* Modules */}
          <Section title={t('adm2.plans.section_modules', locale)} subtitle={t('adm2.plans.section_modules_sub', locale)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {MODULE_KEYS.map(mk => {
                const checked = !!plan.modules_inclus?.[mk]
                return (
                  <label key={mk} className={`flex items-start gap-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${checked ? 'border-[#D4AF37] bg-amber-50' : 'border-gray-200'}`}>
                    <input type="checkbox" checked={checked} onChange={e => setModule(mk, e.target.checked)} className="mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: '#0B0F2E' }}>{moduleLabel(mk, locale)}</p>
                      <p className="text-xs text-gray-500">{moduleDesc(mk, locale)}</p>
                    </div>
                  </label>
                )
              })}
            </div>
          </Section>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2 flex-shrink-0 bg-white">
          <button onClick={() => setPlan(null)} className="px-4 py-2 rounded-lg border text-sm">{t('adm2.plans.cancel', locale)}</button>
          <button onClick={onSave} disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2" style={{ backgroundColor: '#D4AF37', color: '#0B0F2E' }}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isNew ? t('adm2.plans.create', locale) : t('adm2.plans.save', locale)}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-bold text-sm uppercase tracking-wider text-gray-600 mb-2">{title}</h3>
      {subtitle && <p className="text-xs text-gray-500 mb-3">{subtitle}</p>}
      {children}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder = '', className = '' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
             className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]" />
    </label>
  )
}
