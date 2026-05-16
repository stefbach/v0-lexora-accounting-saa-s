"use client"

/**
 * /admin/lexora-billing/parametres — config DDS Ltd (singleton lexora_settings).
 * Renseigne BRN, VAT, adresse, banque (IBAN/BIC/banque/compte MUR), comptes
 * compta par défaut, calendrier de relance, et lien vers la société DDS
 * Lexora (societe_id + dossier_id) pour l'intégration comptable.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Save, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react"

interface Settings {
  raison_sociale: string
  brn: string | null
  vat_number: string | null
  capital_mur: number | null
  adresse: string | null
  ville: string | null
  pays: string | null
  telephone: string | null
  email: string | null
  website: string | null
  banque_nom: string | null
  iban: string | null
  swift_bic: string | null
  numero_compte: string | null
  societe_id: string | null
  dossier_id: string | null
  tva_rate_default: number
  payment_terms_days: number
  compte_client: string
  compte_produit: string
  compte_tva: string
  journal_vente: string
  invoice_prefix: string
  dunning_schedule: number[]
  dunning_channels: string[]
}

export default function LexoraBillingSettingsPage() {
  const [s, setS] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/lexora-billing/settings', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { setS(j.settings); setLoading(false) })
  }, [])

  const set = (patch: Partial<Settings>) => setS(prev => prev ? { ...prev, ...patch } : prev)

  const save = async () => {
    if (!s) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/lexora-billing/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Erreur')
      setMsg({ type: 'success', text: 'Paramètres enregistrés.' })
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || 'Erreur' })
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
  if (!s) return <div className="p-6">Pas de config trouvée.</div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/lexora-billing" className="text-gray-400 hover:text-gray-700"><ArrowLeft className="h-5 w-5" /></Link>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#0B0F2E' }}>Paramètres émetteur (DDS)</h1>
            <p className="text-sm text-gray-500 mt-1">Ces informations apparaissent en entête des factures et alimentent le footer bancaire.</p>
          </div>
        </div>
        <button onClick={save} disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#0B0F2E' }}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
        </button>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${msg.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {msg.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      <Section title="Identité légale">
        <Grid>
          <Field label="Raison sociale"  value={s.raison_sociale} onChange={v => set({ raison_sociale: v })} />
          <Field label="BRN"             value={s.brn || ''}      onChange={v => set({ brn: v })} />
          <Field label="VAT Number"      value={s.vat_number || ''} onChange={v => set({ vat_number: v })} />
          <Field label="Capital (MUR)"   type="number" value={String(s.capital_mur ?? '')} onChange={v => set({ capital_mur: v ? Number(v) : null })} />
          <Field label="Adresse"         value={s.adresse || ''}  onChange={v => set({ adresse: v })} className="md:col-span-2" />
          <Field label="Ville"           value={s.ville || ''}    onChange={v => set({ ville: v })} />
          <Field label="Pays"            value={s.pays || ''}     onChange={v => set({ pays: v })} />
          <Field label="Téléphone"       value={s.telephone || ''} onChange={v => set({ telephone: v })} />
          <Field label="Email"           value={s.email || ''}    onChange={v => set({ email: v })} />
          <Field label="Site web"        value={s.website || ''}  onChange={v => set({ website: v })} />
        </Grid>
      </Section>

      <Section title="Coordonnées bancaires (MUR)">
        <Grid>
          <Field label="Nom de la banque"  value={s.banque_nom || ''}    onChange={v => set({ banque_nom: v })} />
          <Field label="Numéro de compte"  value={s.numero_compte || ''} onChange={v => set({ numero_compte: v })} />
          <Field label="IBAN"              value={s.iban || ''}          onChange={v => set({ iban: v })} className="md:col-span-2" />
          <Field label="SWIFT / BIC"       value={s.swift_bic || ''}     onChange={v => set({ swift_bic: v })} />
        </Grid>
      </Section>

      <Section title="Intégration comptable">
        <Grid>
          <Field label="Société DDS dans Lexora (societe_id)" value={s.societe_id || ''} onChange={v => set({ societe_id: v })} />
          <Field label="Dossier comptable DDS (dossier_id)"    value={s.dossier_id || ''} onChange={v => set({ dossier_id: v })} />
          <Field label="Compte client (411…)"  value={s.compte_client}  onChange={v => set({ compte_client: v })} />
          <Field label="Compte produit (706…)" value={s.compte_produit} onChange={v => set({ compte_produit: v })} />
          <Field label="Compte TVA (4457)"     value={s.compte_tva}     onChange={v => set({ compte_tva: v })} />
          <Field label="Journal de vente"      value={s.journal_vente}  onChange={v => set({ journal_vente: v })} />
        </Grid>
        <p className="text-xs text-gray-500 mt-3">
          Sans `dossier_id` renseigné, les factures sont émises mais aucune écriture comptable n'est créée.
        </p>
      </Section>

      <Section title="Facturation">
        <Grid>
          <Field label="Préfixe numéro"           value={s.invoice_prefix}                onChange={v => set({ invoice_prefix: v })} />
          <Field label="Taux TVA par défaut (%)"  type="number" value={String(s.tva_rate_default)} onChange={v => set({ tva_rate_default: Number(v) || 0 })} />
          <Field label="Délai paiement (jours)"   type="number" value={String(s.payment_terms_days)} onChange={v => set({ payment_terms_days: Number(v) || 30 })} />
        </Grid>
      </Section>

      <Section title="Calendrier de relance">
        <Field label="Étapes (en jours après échéance, séparés par des virgules)"
               value={(s.dunning_schedule || []).join(',')}
               onChange={v => set({ dunning_schedule: v.split(',').map(x => Number(x.trim())).filter(n => Number.isFinite(n)) })} />
        <Field label="Canaux par défaut (email, telegram, sms, whatsapp)"
               value={(s.dunning_channels || []).join(',')}
               onChange={v => set({ dunning_channels: v.split(',').map(x => x.trim()).filter(Boolean) })} className="mt-3" />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-xl p-5 mb-4">
      <h2 className="font-bold text-sm uppercase tracking-wider text-gray-500 mb-4">{title}</h2>
      {children}
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
}

function Field({ label, value, onChange, type = 'text', className = '' }: { label: string; value: string; onChange: (v: string) => void; type?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
             className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0B0F2E]" />
    </label>
  )
}
