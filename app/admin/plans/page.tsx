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
import { Button } from "@/components/ui/button"

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

const MODULES: Array<{ key: string; label: string; desc: string }> = [
  // Modules listés sur /tarifs (visibles côté prospect)
  { key: 'documents',        label: 'OCR & Documents IA',     desc: 'Upload, classification, OCR IA, lecture factures/relevés.' },
  { key: 'comptabilite',     label: 'Comptabilité Automatisée', desc: 'Grand Livre, Balance, Bilan & P&L, rapprochement bancaire.' },
  { key: 'facturation',      label: 'Facturation MRA Agréée', desc: 'Factures conformes MRA (IRN + QR), devis, avoirs, relances.' },
  { key: 'rh',               label: 'RH & Paie Maurice',      desc: 'Bulletins (CSG/NSF/PAYE), pointeuse, congés WRA 2019.' },
  { key: 'fiscal',           label: 'Fiscal MRA',             desc: 'TVA, PAYE, CSG, TDS, IT Form, ROC, e-MRA.' },
  { key: 'alertes_ia',       label: 'Alertes IA & Pilotage',  desc: 'Agent IA échéances fiscales, prévisionnel, recommandations.' },
  { key: 'tibok',            label: 'TIBOK Corporate (Santé)', desc: 'Bilan santé annuel, téléconsultation 24/7, bien-être.' },
  { key: 'telegram',         label: 'Chief of Staff IA Telegram', desc: 'Assistant IA Telegram — agenda, RDV, emails, langage naturel.' },
  // Sous-modules avancés (internes, non listés sur /tarifs)
  { key: 'juridique',        label: 'Juridique (avancé)',     desc: 'Contrats, AGM, conformité.' },
  { key: 'etats_financiers', label: 'États financiers (avancé)', desc: 'IFRS 9/16, échéances détaillées.' },
  { key: 'employe_portal',   label: 'Portail employé',        desc: 'Self-service salarié (bulletins, congés, frais).' },
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
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">Plans packs</p>
          <p className="text-xl font-bold" style={{ color: '#0B0F2E' }}>{stats.packs_actifs} <span className="text-sm text-gray-400 font-normal">/ 12</span></p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">Add-ons</p>
          <p className="text-xl font-bold" style={{ color: '#0B0F2E' }}>{stats.addons_actifs}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">Cabinets comptables</p>
          <p className="text-xl font-bold" style={{ color: '#0B0F2E' }}>{stats.cabinets_actifs}</p>
          <p className="text-[10px] text-amber-600 mt-0.5">Tarif négocié — non affiché</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">Total catalogue</p>
          <p className="text-xl font-bold" style={{ color: '#0B0F2E' }}>{stats.total}</p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 mb-4">
        <label className="inline-flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Afficher les inactifs
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-6">
          <PackGrid title="Comptabilité + Facturation" subtitle="Pour la gestion comptable et la facturation MRA agréée"
                    icon={Briefcase} color="#2563eb"
                    plans={grid.byPack.compta} onEdit={setEdit} onToggle={toggleActif} onDelete={del} deletingId={deletingId} />

          <PackGrid title="RH & Paie + TIBOK" subtitle="Pour la gestion des salariés (bulletins, congés, santé)"
                    icon={Briefcase} color="#16a34a"
                    plans={grid.byPack.paie} onEdit={setEdit} onToggle={toggleActif} onDelete={del} deletingId={deletingId} />

          <PackGrid title="Pack Complet ERP" subtitle="Compta + Facturation + RH + Paie + TIBOK + Juridique"
                    icon={Briefcase} color="#D4AF37"
                    plans={grid.byPack.bundle} onEdit={setEdit} onToggle={toggleActif} onDelete={del} deletingId={deletingId} />

          <AddonsSection plans={grid.addons} onEdit={setEdit} onToggle={toggleActif} onDelete={del} deletingId={deletingId} />

          <CabinetsSection plans={grid.cabinets} onEdit={setEdit} onToggle={toggleActif} onDelete={del} deletingId={deletingId} />

          {grid.legacy.length > 0 && (
            <GroupSection title="Plans non classés (legacy)" subtitle="Anciens plans à migrer ou supprimer" icon={UserCog}>
              <PlanTable plans={grid.legacy} onEdit={setEdit} onToggle={toggleActif} onDelete={del} deletingId={deletingId} />
            </GroupSection>
          )}
        </div>
      )}

      {edit && (
        <EditDialog plan={edit} setPlan={setEdit} onSave={savePlan} saving={saving} />
      )}
    </div>
  )
}

const TAILLE_LABELS: Record<string, { label: string; sub: string }> = {
  solo:   { label: 'Solo',                  sub: '1–3 personnes' },
  petite: { label: 'Petite entreprise',     sub: '4–15 personnes' },
  pme:    { label: 'PME',                   sub: '16–50 personnes' },
  grande: { label: 'Grande entreprise',     sub: '50+ personnes' },
}
const TAILLES_ORDER = ['solo', 'petite', 'pme', 'grande']

function PackGrid({ title, subtitle, icon: Icon, color, plans, onEdit, onToggle, onDelete, deletingId }: {
  title: string; subtitle: string; icon: any; color: string
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
        {TAILLES_ORDER.map(t => {
          const p = plans[t]
          const meta = TAILLE_LABELS[t]
          if (!p) return (
            <div key={t} className="bg-gray-50/60 border border-dashed rounded-xl p-4 text-center">
              <p className="text-xs uppercase tracking-wider text-gray-400">{meta.label}</p>
              <p className="text-xs text-gray-500 mt-1">{meta.sub}</p>
              <p className="text-xs text-gray-400 mt-3 italic">Aucun plan configuré</p>
            </div>
          )
          return <PackCard key={p.id} plan={p} sizeMeta={meta} accentColor={color}
                           onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} deletingId={deletingId} />
        })}
      </div>
    </section>
  )
}

function PackCard({ plan, sizeMeta, accentColor, onEdit, onToggle, onDelete, deletingId }: {
  plan: Plan; sizeMeta: { label: string; sub: string }; accentColor: string
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
        {plan.populaire && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800"><Star className="h-2.5 w-2.5" />POPULAIRE</span>}
      </div>
      <p className="font-semibold text-sm mb-2" style={{ color: '#0B0F2E' }}>{plan.nom}</p>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-2xl font-bold" style={{ color: '#0B0F2E' }}>{fmt(plan.prix_mensuel_mur)}</span>
        <span className="text-xs text-gray-500">MUR/mois</span>
      </div>
      {plan.prix_annuel_mur && (
        <p className="text-[11px] text-gray-500 mb-2">
          {fmt(plan.prix_annuel_mur)} MUR/an
          {economie > 0 && <span className="ml-1 text-green-700 font-semibold">(−{fmt(economie)})</span>}
        </p>
      )}
      <div className="flex flex-wrap gap-1 mb-3 min-h-[40px]">
        {modulesActifs.length === 0 ? <span className="text-xs text-gray-400">Aucun module</span> :
          modulesActifs.slice(0, 6).map(k => {
            const m = MODULES.find(x => x.key === k); if (!m) return null
            return <span key={k} className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-800">{m.label.split(' ')[0]}</span>
          })}
        {modulesActifs.length > 6 && <span className="text-[10px] text-gray-400">+{modulesActifs.length - 6}</span>}
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" onClick={() => onEdit(plan)} className="flex-1 h-7 text-xs">
          <Edit2 className="w-3 h-3 mr-1" /> Éditer
        </Button>
        <button onClick={() => onToggle(plan)} className="h-7 px-2 rounded hover:bg-gray-100" title={plan.actif ? 'Désactiver' : 'Activer'}>
          {plan.actif ? <PowerOff className="h-3.5 w-3.5 text-amber-600" /> : <Power className="h-3.5 w-3.5 text-green-600" />}
        </button>
        <button onClick={() => onDelete(plan)} disabled={deletingId === plan.id} className="h-7 px-2 rounded hover:bg-gray-100" title="Supprimer">
          {deletingId === plan.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-red-600" />}
        </button>
      </div>
    </div>
  )
}

function AddonsSection({ plans, onEdit, onToggle, onDelete, deletingId }: {
  plans: Plan[]
  onEdit: (p: Plan) => void; onToggle: (p: Plan) => void; onDelete: (p: Plan) => void; deletingId: string | null
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <div className="h-9 w-9 rounded-lg bg-purple-50 flex items-center justify-center">
          <Star className="h-5 w-5 text-purple-700" />
        </div>
        <div>
          <h2 className="font-bold text-base" style={{ color: '#0B0F2E' }}>Add-ons</h2>
          <p className="text-xs text-gray-500">Options à ajouter à n'importe quel pack (Telegram, TIBOK, etc.)</p>
        </div>
      </div>
      {plans.length === 0 ? (
        <Empty text="Aucun add-on configuré." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {plans.map(p => (
            <div key={p.id} className={`bg-white border rounded-xl p-4 ${!p.actif ? 'opacity-50' : ''}`}>
              <p className="text-[10px] uppercase tracking-wider font-bold text-purple-700">Add-on</p>
              <p className="font-semibold text-sm mt-1" style={{ color: '#0B0F2E' }}>{p.nom}</p>
              {p.description && <p className="text-[11px] text-gray-500 mt-0.5">{p.description}</p>}
              <p className="mt-2"><span className="text-xl font-bold">{fmt(p.prix_mensuel_mur)}</span> <span className="text-xs text-gray-500">MUR/mois</span></p>
              {p.prix_annuel_mur && <p className="text-[11px] text-gray-500">{fmt(p.prix_annuel_mur)} MUR/an</p>}
              <div className="flex items-center gap-1 mt-3">
                <Button size="sm" variant="outline" onClick={() => onEdit(p)} className="flex-1 h-7 text-xs"><Edit2 className="w-3 h-3 mr-1" /> Éditer</Button>
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

function CabinetsSection({ plans, onEdit, onToggle, onDelete, deletingId }: {
  plans: Plan[]
  onEdit: (p: Plan) => void; onToggle: (p: Plan) => void; onDelete: (p: Plan) => void; deletingId: string | null
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center">
          <UserCog className="h-5 w-5 text-amber-700" />
        </div>
        <div>
          <h2 className="font-bold text-base" style={{ color: '#0B0F2E' }}>Cabinets comptables</h2>
          <p className="text-xs text-gray-500">Plans pour cabinets — tarif négocié au cas par cas, non affiché côté prospect</p>
        </div>
      </div>
      {plans.length === 0 ? (
        <Empty text="Aucun plan cabinet." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {plans.map(p => (
            <div key={p.id} className={`bg-white border rounded-xl p-4 ${!p.actif ? 'opacity-50' : ''}`}>
              <p className="text-[10px] uppercase tracking-wider font-bold text-amber-700">Cabinet</p>
              <p className="font-semibold text-sm mt-1" style={{ color: '#0B0F2E' }}>{p.nom}</p>
              {p.description && <p className="text-[11px] text-gray-500 mt-0.5">{p.description}</p>}
              <p className="text-xs italic text-gray-400 mt-2">Tarif sur devis</p>
              <div className="flex items-center gap-1 mt-3">
                <Button size="sm" variant="outline" onClick={() => onEdit(p)} className="flex-1 h-7 text-xs"><Edit2 className="w-3 h-3 mr-1" /> Éditer</Button>
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
