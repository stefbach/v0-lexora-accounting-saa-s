"use client"

/**
 * /admin/services — Attribution d'un abonnement (plan + add-ons) à une société.
 *
 * Source de vérité unique : la table `plans` (catalogue /tarifs).
 * Plus de double-table service_plans/plans : on lit les 12 packs +
 * 2 add-ons + 3 cabinets et on assigne directement.
 *
 * Workflow :
 *   1) Sélection d'une société dans la liste
 *   2) Modal d'abonnement :
 *      - choix du Plan (parmi les packs visibles)
 *      - périodicité Mensuelle / Annuelle
 *      - cases Add-ons (Telegram, TIBOK seul)
 *      - prix mensuel + prix période calculés en temps réel
 *      - modules effectifs (merge plan + add-ons) affichés
 *   3) Save → PUT /api/admin/societes/[id]/subscription
 *      → met à jour plan_id, addons_actifs, periodicite,
 *        prix_mensuel_effectif, prix_periode_effectif, modules_actifs
 */

import { useEffect, useState, useCallback, useMemo } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Loader2, CheckCircle2, AlertCircle, Settings, Search,
  Briefcase, Star, Building2,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

interface Plan {
  id: string
  code: string
  nom: string
  description: string | null
  type_cible: 'dirigeant' | 'comptable'
  prix_mensuel_mur: number
  prix_annuel_mur: number | null
  modules_inclus: Record<string, boolean>
  populaire: boolean
  actif: boolean
  pack: 'compta' | 'paie' | 'bundle' | 'addon' | 'cabinet' | 'legacy' | null
  taille_entreprise: 'solo' | 'petite' | 'pme' | 'grande' | null
  is_addon: boolean
  prix_visible: boolean
}

interface Societe {
  id: string
  nom: string
  brn: string | null
  plan_id: string | null
  addons_actifs: string[] | null
  periodicite: string | null
  prix_mensuel_effectif: number | null
  prix_periode_effectif: number | null
}

interface Subscription {
  plan_id: string | null
  plan: Plan | null
  addon_codes: string[]
  addons: Plan[]
  periodicite: 'mensuelle' | 'annuelle'
  prix_mensuel_effectif: number | null
  prix_periode_effectif: number | null
  modules_actifs: Record<string, boolean> | null
}

const MODULE_LABELS: Record<string, string> = {
  documents: 'OCR & Documents IA',
  comptabilite: 'Comptabilité Automatisée',
  facturation: 'Facturation MRA',
  rh: 'RH & Paie Maurice',
  fiscal: 'Fiscal MRA',
  alertes_ia: 'Alertes IA & Pilotage',
  tibok: 'TIBOK Corporate',
  telegram: 'Chief of Staff IA Telegram',
  juridique: 'Juridique',
  etats_financiers: 'États financiers',
  employe_portal: 'Portail employé',
}

const PACK_LABELS: Record<string, string> = {
  compta: 'Comptabilité + Facturation',
  paie: 'RH & Paie + TIBOK',
  bundle: 'Pack Complet ERP',
  cabinet: 'Cabinet comptable',
  addon: 'Add-on',
  legacy: 'Legacy',
  autres: 'Plans disponibles',
}
const TAILLE_LABELS: Record<string, string> = {
  solo: 'Solo (1–3)',
  petite: 'Petite (4–15)',
  pme: 'PME (16–50)',
  grande: 'Grande (50+)',
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

export default function AdminServicesPage() {
  const [societes, setSocietes] = useState<Societe[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [editing, setEditing] = useState<Societe | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, pRes] = await Promise.all([
        fetch('/api/admin/societes', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/admin/plans', { cache: 'no-store' }).then(r => r.json()),
      ])
      setSocietes((sRes.societes || sRes.data || []) as Societe[])
      setPlans((pRes.plans || []).filter((p: Plan) => p.actif))
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || 'Erreur' })
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(null), 4000); return () => clearTimeout(t) } }, [msg])

  const filtered = useMemo(() => {
    if (!search) return societes
    const q = search.toLowerCase()
    return societes.filter(s => s.nom.toLowerCase().includes(q) || (s.brn || '').toLowerCase().includes(q))
  }, [societes, search])

  const planMap = useMemo(() => {
    const m = new Map<string, Plan>()
    plans.forEach(p => m.set(p.id, p))
    return m
  }, [plans])

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-5 max-w-7xl mx-auto p-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B0F2E]">Abonnements clients</h1>
        <p className="text-sm text-gray-500 mt-1">
          Attribue à chaque société un plan du catalogue <Link href="/admin/plans" className="underline text-blue-700">/admin/plans</Link>{' '}
          + add-ons optionnels. Le prix mensuel/annuel et les modules actifs sont automatiquement calculés et appliqués.
        </p>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${msg.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {msg.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input value={search} onChange={e => setSearch(e.target.value)}
               placeholder="Rechercher une société (nom ou BRN)…"
               className="pl-9 h-10" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-gray-500">Aucune société.</CardContent></Card>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-2 font-semibold text-gray-600">Société</th>
                <th className="px-4 py-2 font-semibold text-gray-600">Plan actuel</th>
                <th className="px-4 py-2 font-semibold text-gray-600">Add-ons</th>
                <th className="px-4 py-2 font-semibold text-gray-600">Périodicité</th>
                <th className="px-4 py-2 font-semibold text-gray-600 text-right">Prix mensuel</th>
                <th className="px-4 py-2 font-semibold text-gray-600 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const plan = s.plan_id ? planMap.get(s.plan_id) : null
                const addons = Array.isArray(s.addons_actifs) ? s.addons_actifs : []
                return (
                  <tr key={s.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium">{s.nom}</p>
                      {s.brn && <p className="text-xs text-gray-500 font-mono">BRN {s.brn}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {plan ? (
                        <div className="flex items-center gap-1.5">
                          <Badge className="bg-blue-50 text-blue-800 text-[10px]">
                            {plan.pack ? PACK_LABELS[plan.pack] : '—'}
                            {plan.taille_entreprise && ` · ${TAILLE_LABELS[plan.taille_entreprise].split(' ')[0]}`}
                          </Badge>
                          <span className="text-sm font-medium">{plan.nom}</span>
                        </div>
                      ) : <span className="text-xs text-amber-700">Pas d'abonnement</span>}
                    </td>
                    <td className="px-4 py-3">
                      {addons.length === 0 ? <span className="text-xs text-gray-400">—</span> :
                        <div className="flex gap-1 flex-wrap">
                          {addons.map((c: string) => (
                            <Badge key={c} className="bg-purple-50 text-purple-800 text-[10px]">+{c.replace(/^addon_/, '')}</Badge>
                          ))}
                        </div>}
                    </td>
                    <td className="px-4 py-3 text-xs">{s.periodicite || 'mensuelle'}</td>
                    <td className="px-4 py-3 text-right font-bold">
                      {s.prix_mensuel_effectif != null ? `${fmt(s.prix_mensuel_effectif)} MUR` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditing(s)} className="h-8 text-xs">
                        <Settings className="w-3.5 h-3.5 mr-1" /> Configurer
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <SubscriptionDialog societe={editing} plans={plans} onClose={() => setEditing(null)}
                            onSaved={() => { setEditing(null); fetchAll(); setMsg({ type: 'success', text: 'Abonnement mis à jour.' }) }} />
      )}
    </div>
    </ClientPageShell>
  )
}

function SubscriptionDialog({ societe, plans, onClose, onSaved }: {
  societe: Societe; plans: Plan[]; onClose: () => void; onSaved: () => void
}) {
  const [planId, setPlanId] = useState<string | null>(societe.plan_id)
  const [addons, setAddons] = useState<string[]>(Array.isArray(societe.addons_actifs) ? societe.addons_actifs : [])
  const [periodicite, setPeriodicite] = useState<'mensuelle' | 'annuelle'>(societe.periodicite === 'annuelle' ? 'annuelle' : 'mensuelle')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fallback : si les colonnes pack/is_addon n'existent pas (mig 283 pas
  // appliquée), on affiche tous les plans actifs comme « Autres plans »
  // pour ne pas bloquer l'attribution.
  const hasPackData = plans.some(p => p.pack)
  const packPlans = hasPackData
    ? plans.filter(p => !p.is_addon && p.pack && ['compta', 'paie', 'bundle', 'cabinet'].includes(p.pack))
    : plans.filter(p => !p.is_addon)
  const addonPlans = plans.filter(p => p.is_addon || (p.code || '').startsWith('addon_'))

  const selectedPlan = plans.find(p => p.id === planId) || null
  const selectedAddons = plans.filter(p => addons.includes(p.code))

  // Calcul local en temps réel
  const prixMensuel = (selectedPlan?.prix_mensuel_mur || 0) + selectedAddons.reduce((s, a) => s + (a.prix_mensuel_mur || 0), 0)
  const prixPeriode = periodicite === 'annuelle'
    ? ((selectedPlan?.prix_annuel_mur ?? (selectedPlan?.prix_mensuel_mur || 0) * 12) +
       selectedAddons.reduce((s, a) => s + (a.prix_annuel_mur ?? (a.prix_mensuel_mur || 0) * 12), 0))
    : prixMensuel
  const modulesActifs: Record<string, boolean> = {}
  if (selectedPlan?.modules_inclus) Object.assign(modulesActifs, selectedPlan.modules_inclus)
  for (const a of selectedAddons) {
    for (const [k, v] of Object.entries(a.modules_inclus || {})) {
      if (v) modulesActifs[k] = true
    }
  }
  const activeModuleKeys = Object.entries(modulesActifs).filter(([, v]) => v).map(([k]) => k)

  const toggleAddon = (code: string) => {
    setAddons(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
  }

  const save = async () => {
    if (!planId) { setError('Choisis un plan'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/admin/societes/${societe.id}/subscription`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId, addon_codes: addons, periodicite }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Erreur')
      onSaved()
    } catch (e: any) {
      setError(e?.message || 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  // Groupage des plans par pack pour l'UI (avec fallback "autres" si pas
  // de pack défini).
  const byPack: Record<string, Plan[]> = { compta: [], paie: [], bundle: [], cabinet: [], autres: [] }
  for (const p of packPlans) {
    const key = p.pack && ['compta', 'paie', 'bundle', 'cabinet'].includes(p.pack) ? p.pack : 'autres'
    byPack[key].push(p)
  }
  Object.values(byPack).forEach(arr => arr.sort((a, b) => {
    const order: Record<string, number> = { solo: 1, petite: 2, pme: 3, grande: 4, null: 5 }
    return (order[a.taille_entreprise || 'null'] || 99) - (order[b.taille_entreprise || 'null'] || 99)
  }))

  return (
    <Dialog open={true} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" /> {societe.nom} — Abonnement
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-4">
          {/* Périodicité */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">Périodicité de facturation</p>
            <div className="inline-flex rounded-lg border p-1 bg-gray-50">
              {(['mensuelle', 'annuelle'] as const).map(p => (
                <button key={p} onClick={() => setPeriodicite(p)}
                        className={`px-4 py-1.5 rounded text-sm ${periodicite === p ? 'bg-white shadow font-semibold' : 'text-gray-600'}`}>
                  {p === 'mensuelle' ? 'Mensuelle' : 'Annuelle (économie 17%)'}
                </button>
              ))}
            </div>
          </div>

          {/* Plans par pack */}
          {(['compta', 'paie', 'bundle', 'cabinet', 'autres'] as const).map(pack => byPack[pack].length > 0 && (
            <div key={pack}>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">{PACK_LABELS[pack]}</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                {byPack[pack].map(p => {
                  const selected = planId === p.id
                  const prix = periodicite === 'annuelle' ? (p.prix_annuel_mur ?? p.prix_mensuel_mur * 12) : p.prix_mensuel_mur
                  return (
                    <button key={p.id} onClick={() => setPlanId(p.id)}
                            className={`text-left p-3 rounded-lg border-2 transition-colors ${selected ? 'border-[#D4AF37] bg-amber-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
                          {p.taille_entreprise ? TAILLE_LABELS[p.taille_entreprise] : p.pack}
                        </p>
                        {p.populaire && <Star className="w-3 h-3 text-amber-600 fill-amber-400" />}
                      </div>
                      <p className="font-semibold text-sm mt-1" style={{ color: '#0B0F2E' }}>{p.nom}</p>
                      {p.prix_visible !== false ? (
                        <p className="mt-1 text-sm font-bold">
                          {fmt(prix)} <span className="text-[10px] text-gray-500 font-normal">MUR/{periodicite === 'annuelle' ? 'an' : 'mois'}</span>
                        </p>
                      ) : (
                        <p className="mt-1 text-xs italic text-gray-500">Tarif sur devis</p>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Add-ons */}
          {addonPlans.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">Add-ons</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {addonPlans.map(a => {
                  const checked = addons.includes(a.code)
                  const prix = periodicite === 'annuelle' ? (a.prix_annuel_mur ?? a.prix_mensuel_mur * 12) : a.prix_mensuel_mur
                  return (
                    <label key={a.id} className={`flex items-start gap-2 p-3 rounded-lg border-2 cursor-pointer ${checked ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleAddon(a.code)} className="mt-0.5" />
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{a.nom}</p>
                        {a.description && <p className="text-[11px] text-gray-500 mt-0.5">{a.description}</p>}
                        <p className="text-xs font-bold mt-1">+{fmt(prix)} MUR/{periodicite === 'annuelle' ? 'an' : 'mois'}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Résumé */}
          {selectedPlan && (
            <div className="p-4 bg-[#0B0F2E] text-white rounded-lg">
              <p className="text-xs uppercase tracking-wider text-amber-400 font-bold mb-2">Résumé de l'abonnement</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <p className="text-[10px] uppercase text-white/60">Prix mensuel</p>
                  <p className="text-2xl font-bold text-amber-300">{fmt(prixMensuel)} <span className="text-xs text-white/60">MUR/mois</span></p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-white/60">Facturé en {periodicite}</p>
                  <p className="text-2xl font-bold text-amber-300">{fmt(prixPeriode)} <span className="text-xs text-white/60">MUR/{periodicite === 'annuelle' ? 'an' : 'mois'}</span></p>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase text-white/60 mb-1">Modules actifs ({activeModuleKeys.length})</p>
                <div className="flex flex-wrap gap-1">
                  {activeModuleKeys.length === 0 ? <span className="text-xs text-white/40">Aucun</span> :
                    activeModuleKeys.map(k => (
                      <span key={k} className="inline-block px-2 py-0.5 rounded text-[10px] bg-white/10 border border-white/20">
                        {MODULE_LABELS[k] || k}
                      </span>
                    ))}
                </div>
              </div>
            </div>
          )}

          {error && <div className="p-2 bg-red-50 text-red-800 text-sm rounded">{error}</div>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={saving || !planId} className="bg-[#D4AF37] hover:bg-[#C9A630] text-[#0B0F2E]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Appliquer l'abonnement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
