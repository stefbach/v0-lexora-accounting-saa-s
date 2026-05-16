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
import { Loader2, Plus, Edit2, Trash2, Star, Check, AlertCircle, CheckCircle2, Power, PowerOff, Briefcase, UserCog } from "lucide-react"

type TypeCible = 'dirigeant' | 'comptable'

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
  created_at: string
  updated_at: string | null
}

const MODULES: Array<{ key: string; label: string; desc: string }> = [
  { key: 'comptabilite',     label: 'Comptabilité',       desc: 'Grand Livre, balance, bilan, rapprochement.' },
  { key: 'facturation',      label: 'Facturation',        desc: 'Factures MRA, devis, relances clients.' },
  { key: 'documents',        label: 'Documents & OCR',    desc: 'Upload, classification, OCR IA.' },
  { key: 'rh',               label: 'RH & Paie',          desc: 'Bulletins, congés, pointage.' },
  { key: 'fiscal',           label: 'Fiscal MRA',         desc: 'TVA, PAYE, CSG, IT Form, ROC.' },
  { key: 'etats_financiers', label: 'États financiers',   desc: 'Bilan, P&L, IFRS 9/16, échéances.' },
  { key: 'juridique',        label: 'Juridique',          desc: 'Contrats, AGM, conformité.' },
  { key: 'employe_portal',   label: 'Portail employé',    desc: 'Self-service salarié (bulletins, congés).' },
  { key: 'telegram',         label: 'Assistant IA Telegram', desc: 'Chief of Staff IA — agenda, RDV, emails.' },
]

const EMPTY_PLAN = (): Plan => ({
  id: '', code: '', nom: '', description: '',
  type_cible: 'dirigeant',
  prix_mensuel_mur: 0, prix_annuel_mur: 0,
  modules_inclus: Object.fromEntries(MODULES.map(m => [m.key, false])),
  populaire: false, ordre: 100, actif: true,
  created_at: '', updated_at: null,
})

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

export default function AdminPlansPage() {
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
      if (!res.ok) throw new Error(j.error || 'Erreur')
      setPlans(j.plans || [])
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || 'Erreur' })
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(null), 4000); return () => clearTimeout(t) } }, [msg])

  const filtered = useMemo(() => {
    return plans
      .filter(p => filter === 'all' || p.type_cible === filter)
      .filter(p => showInactive || p.actif)
  }, [plans, filter, showInactive])

  const grouped = useMemo(() => {
    const g: Record<TypeCible, Plan[]> = { dirigeant: [], comptable: [] }
    for (const p of filtered) g[p.type_cible].push(p)
    return g
  }, [filtered])

  const stats = useMemo(() => ({
    dirigeant_total: plans.filter(p => p.type_cible === 'dirigeant').length,
    dirigeant_actif: plans.filter(p => p.type_cible === 'dirigeant' && p.actif).length,
    comptable_total: plans.filter(p => p.type_cible === 'comptable').length,
    comptable_actif: plans.filter(p => p.type_cible === 'comptable' && p.actif).length,
  }), [plans])

  const savePlan = async () => {
    if (!edit) return
    if (!edit.nom.trim()) { setMsg({ type: 'error', text: 'Le nom est obligatoire' }); return }
    setSaving(true)
    try {
      const isNew = !edit.id
      const res = await fetch(isNew ? '/api/admin/plans' : `/api/admin/plans/${edit.id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edit),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Erreur')
      setMsg({ type: 'success', text: isNew ? 'Plan créé.' : 'Plan mis à jour.' })
      setEdit(null); fetchAll()
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || 'Erreur' })
    } finally {
      setSaving(false)
    }
  }

  const toggleActif = async (p: Plan) => {
    const res = await fetch(`/api/admin/plans/${p.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actif: !p.actif }),
    })
    if (res.ok) { fetchAll(); setMsg({ type: 'success', text: p.actif ? 'Plan désactivé.' : 'Plan activé.' }) }
    else { const j = await res.json(); setMsg({ type: 'error', text: j.error }) }
  }

  const del = async (p: Plan) => {
    if (!confirm(`Supprimer le plan "${p.nom}" ?`)) return
    setDeletingId(p.id)
    try {
      const res = await fetch(`/api/admin/plans/${p.id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Erreur')
      setMsg({ type: 'success', text: 'Plan supprimé.' }); fetchAll()
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || 'Erreur' })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0B0F2E' }}>Plans tarifaires</h1>
          <p className="text-sm text-gray-500 mt-1">
            Catalogue commercial visible sur <code className="bg-gray-100 px-1 rounded text-xs">/inscription</code>.
            Pour assigner un plan à une société existante, voir <a href="/admin/services" className="underline text-blue-700">Services & Plans</a>.
          </p>
        </div>
        <button onClick={() => setEdit(EMPTY_PLAN())}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white" style={{ backgroundColor: '#D4AF37', color: '#0B0F2E' }}>
          <Plus className="h-4 w-4" /> Nouveau plan
        </button>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${msg.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {msg.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white border rounded-xl p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center"><Briefcase className="h-6 w-6 text-blue-700" /></div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Plans Dirigeants</p>
            <p className="text-xl font-bold" style={{ color: '#0B0F2E' }}>{stats.dirigeant_actif} <span className="text-sm text-gray-400 font-normal">/ {stats.dirigeant_total}</span></p>
          </div>
        </div>
        <div className="bg-white border rounded-xl p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center"><UserCog className="h-6 w-6 text-amber-700" /></div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Plans Cabinets comptables</p>
            <p className="text-xl font-bold" style={{ color: '#0B0F2E' }}>{stats.comptable_actif} <span className="text-sm text-gray-400 font-normal">/ {stats.comptable_total}</span></p>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {([
          { key: 'all', label: 'Tous' },
          { key: 'dirigeant', label: 'Dirigeants' },
          { key: 'comptable', label: 'Cabinets' },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFilter(f.key as any)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${filter === f.key ? 'bg-[#0B0F2E] text-white border-[#0B0F2E]' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
            {f.label}
          </button>
        ))}
        <label className="ml-3 inline-flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Afficher les inactifs
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : (
        <>
          {(filter === 'all' || filter === 'dirigeant') && (
            <GroupSection title="Dirigeants" subtitle="Plans pour les entreprises (clients finaux)" icon={Briefcase}>
              {grouped.dirigeant.length === 0 ? (
                <Empty text="Aucun plan dirigeant." />
              ) : (
                <PlanTable plans={grouped.dirigeant} onEdit={setEdit} onToggle={toggleActif} onDelete={del} deletingId={deletingId} />
              )}
            </GroupSection>
          )}
          {(filter === 'all' || filter === 'comptable') && (
            <GroupSection title="Cabinets comptables" subtitle="Plans pour comptables indépendants ou cabinets" icon={UserCog}>
              {grouped.comptable.length === 0 ? (
                <Empty text="Aucun plan comptable." />
              ) : (
                <PlanTable plans={grouped.comptable} onEdit={setEdit} onToggle={toggleActif} onDelete={del} deletingId={deletingId} />
              )}
            </GroupSection>
          )}
        </>
      )}

      {edit && (
        <EditDialog plan={edit} setPlan={setEdit} onSave={savePlan} saving={saving} />
      )}
    </div>
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

function PlanTable({ plans, onEdit, onToggle, onDelete, deletingId }: {
  plans: Plan[]; onEdit: (p: Plan) => void; onToggle: (p: Plan) => void; onDelete: (p: Plan) => void; deletingId: string | null
}) {
  return (
    <div className="bg-white border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="px-4 py-2 font-semibold text-gray-600 w-10">#</th>
            <th className="px-4 py-2 font-semibold text-gray-600">Plan</th>
            <th className="px-4 py-2 font-semibold text-gray-600 text-right">Mensuel</th>
            <th className="px-4 py-2 font-semibold text-gray-600 text-right">Annuel</th>
            <th className="px-4 py-2 font-semibold text-gray-600 text-right">Économie</th>
            <th className="px-4 py-2 font-semibold text-gray-600">Modules</th>
            <th className="px-4 py-2 font-semibold text-gray-600">État</th>
            <th className="px-4 py-2 font-semibold text-gray-600 text-right">Actions</th>
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
                    {p.populaire && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800"><Star className="h-2.5 w-2.5" />POPULAIRE</span>}
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
                    {modulesActifs.length === 0 ? <span className="text-xs text-gray-400">Aucun</span> :
                      modulesActifs.map(k => {
                        const m = MODULES.find(x => x.key === k); if (!m) return null
                        return <span key={k} className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-800">{m.label}</span>
                      })}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${p.actif ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {p.actif ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button onClick={() => onEdit(p)} className="p-1.5 rounded hover:bg-gray-100" title="Éditer"><Edit2 className="h-4 w-4 text-blue-700" /></button>
                    <button onClick={() => onToggle(p)} className="p-1.5 rounded hover:bg-gray-100" title={p.actif ? 'Désactiver' : 'Activer'}>
                      {p.actif ? <PowerOff className="h-4 w-4 text-amber-600" /> : <Power className="h-4 w-4 text-green-600" />}
                    </button>
                    <button onClick={() => onDelete(p)} disabled={deletingId === p.id} className="p-1.5 rounded hover:bg-gray-100" title="Supprimer">
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

function EditDialog({ plan, setPlan, onSave, saving }: { plan: Plan; setPlan: (p: Plan | null) => void; onSave: () => void; saving: boolean }) {
  const isNew = !plan.id
  const economie = plan.prix_annuel_mur && plan.prix_mensuel_mur
    ? Math.max(0, plan.prix_mensuel_mur * 12 - plan.prix_annuel_mur) : 0
  const economiePct = plan.prix_mensuel_mur > 0 && economie > 0
    ? Math.round(economie / (plan.prix_mensuel_mur * 12) * 100) : 0

  const update = (patch: Partial<Plan>) => setPlan({ ...plan, ...patch })
  const setModule = (key: string, value: boolean) => setPlan({ ...plan, modules_inclus: { ...plan.modules_inclus, [key]: value } })

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setPlan(null)}>
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold" style={{ color: '#0B0F2E' }}>{isNew ? 'Nouveau plan' : `Éditer ${plan.nom}`}</h2>
          <button onClick={() => setPlan(null)} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>

        <div className="p-6 space-y-6">
          {/* Profil */}
          <Section title="Profil cible">
            <div className="grid grid-cols-2 gap-3">
              {(['dirigeant', 'comptable'] as const).map(t => (
                <button key={t} onClick={() => update({ type_cible: t })}
                        className={`p-4 rounded-lg border-2 text-left ${plan.type_cible === t ? 'border-[#D4AF37] bg-amber-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-center gap-2">
                    {t === 'dirigeant' ? <Briefcase className="h-4 w-4" /> : <UserCog className="h-4 w-4" />}
                    <span className="font-semibold capitalize">{t === 'dirigeant' ? 'Dirigeant' : 'Cabinet comptable'}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{t === 'dirigeant' ? 'Plan visible côté entreprise sur /inscription.' : 'Plan visible côté cabinet comptable.'}</p>
                </button>
              ))}
            </div>
          </Section>

          {/* Identité */}
          <Section title="Identité du plan">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nom *"     value={plan.nom}            onChange={v => update({ nom: v })} placeholder="Pro, Premium, Cabinet Solo…" />
              <Field label="Code (slug)" value={plan.code}         onChange={v => update({ code: v })} placeholder="auto depuis le nom" />
              <Field label="Description (1 ligne)" value={plan.description || ''} onChange={v => update({ description: v })} className="col-span-2" />
              <Field label="Ordre d'affichage" type="number" value={String(plan.ordre)} onChange={v => update({ ordre: Number(v) || 0 })} />
              <div className="flex items-center gap-4 pt-6">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={plan.populaire} onChange={e => update({ populaire: e.target.checked })} />
                  <span className="text-sm">Badge « Populaire »</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={plan.actif} onChange={e => update({ actif: e.target.checked })} />
                  <span className="text-sm">Plan actif</span>
                </label>
              </div>
            </div>
          </Section>

          {/* Tarifs */}
          <Section title="Tarifs (MUR)">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prix mensuel" type="number" value={String(plan.prix_mensuel_mur)} onChange={v => update({ prix_mensuel_mur: Number(v) || 0 })} />
              <Field label="Prix annuel"  type="number" value={String(plan.prix_annuel_mur ?? '')} onChange={v => update({ prix_annuel_mur: v ? Number(v) : null })} />
            </div>
            {economie > 0 && (
              <div className="mt-2 inline-flex items-center gap-2 text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
                <Check className="h-3.5 w-3.5" />
                Économie annuelle : {fmt(economie)} MUR ({economiePct}% sur 12 mois)
              </div>
            )}
            {plan.prix_annuel_mur != null && plan.prix_annuel_mur > plan.prix_mensuel_mur * 12 && (
              <div className="mt-2 inline-flex items-center gap-2 text-xs text-red-700 bg-red-50 px-2 py-1 rounded">
                <AlertCircle className="h-3.5 w-3.5" />
                Le prix annuel est supérieur à 12× le mensuel — anomalie probable.
              </div>
            )}
          </Section>

          {/* Modules */}
          <Section title="Modules inclus" subtitle="9 modules disponibles — sélectionne ce qui est inclus dans ce plan.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {MODULES.map(m => {
                const checked = !!plan.modules_inclus?.[m.key]
                return (
                  <label key={m.key} className={`flex items-start gap-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${checked ? 'border-[#D4AF37] bg-amber-50' : 'border-gray-200'}`}>
                    <input type="checkbox" checked={checked} onChange={e => setModule(m.key, e.target.checked)} className="mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: '#0B0F2E' }}>{m.label}</p>
                      <p className="text-xs text-gray-500">{m.desc}</p>
                    </div>
                  </label>
                )
              })}
            </div>
          </Section>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={() => setPlan(null)} className="px-4 py-2 rounded-lg border text-sm">Annuler</button>
          <button onClick={onSave} disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2" style={{ backgroundColor: '#D4AF37', color: '#0B0F2E' }}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isNew ? 'Créer' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
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
