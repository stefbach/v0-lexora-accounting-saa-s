"use client"
import React, { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, BookUser, Loader2, Building2, Download, Plus, X, Trash2 } from "lucide-react"
import { useJuridiqueSociete } from "@/components/juridique/JuridiqueSocieteProvider"
import { SocieteDocuments } from "@/components/juridique/SocieteDocuments"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Associe { nom: string; type_personne?: string | null; nationalite?: string | null; nb_actions?: number | null; pourcentage?: number | null; valeur_nominale?: number | null }
interface Admin { nom: string; type?: string | null; nationalite?: string | null; nic?: string | null; date_nomination?: string | null }
interface Bo { nom: string; nationalite?: string | null; pays_residence?: string | null; pct_detention?: number | null; nature_controle?: string | null; is_pep?: boolean | null }
interface SocieteData { nom?: string; brn?: string; registered_office?: string; adresse?: string }
interface ManualEntry { id: string; data: Record<string, string> }
type RegKey = 'associes' | 'administrateurs' | 'beneficiaires'
type Col = { key: string; label: string; width: number }

const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('fr-FR') : '—'
const fmtNum = (n?: number | null) => n == null ? '—' : new Intl.NumberFormat('fr-FR').format(n)

const COLUMNS: Record<RegKey, Col[]> = {
  associes: [{ key: 'nom', label: 'Nom', width: 28 }, { key: 'type', label: 'Type', width: 14 }, { key: 'nat', label: 'Nationalité', width: 16 }, { key: 'actions', label: 'Actions', width: 12 }, { key: 'pct', label: '%', width: 10 }, { key: 'vn', label: 'Val. nom.', width: 20 }],
  administrateurs: [{ key: 'nom', label: 'Nom', width: 30 }, { key: 'type', label: 'Fonction', width: 20 }, { key: 'nat', label: 'Nationalité', width: 18 }, { key: 'nic', label: 'NIC', width: 17 }, { key: 'dn', label: 'Nomination', width: 15 }],
  beneficiaires: [{ key: 'nom', label: 'Nom', width: 26 }, { key: 'nat', label: 'Nationalité', width: 16 }, { key: 'res', label: 'Résidence', width: 16 }, { key: 'pct', label: 'Détention', width: 12 }, { key: 'ctrl', label: 'Nature du contrôle', width: 22 }, { key: 'pep', label: 'PEP', width: 8 }],
}
const TITRES: Record<RegKey, string> = {
  associes: 'Registre des associés / actionnaires',
  administrateurs: 'Registre des administrateurs',
  beneficiaires: 'Registre des bénéficiaires effectifs',
}

export default function RegistresPage() {
  const { societe } = useJuridiqueSociete()
  const [data, setData] = useState<SocieteData | null>(null)
  const [associes, setAssocies] = useState<Associe[]>([])
  const [admins, setAdmins] = useState<Admin[]>([])
  const [bo, setBo] = useState<Bo[]>([])
  const [manual, setManual] = useState<Record<RegKey, ManualEntry[]>>({ associes: [], administrateurs: [], beneficiaires: [] })
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<RegKey>('associes')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!societe?.id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/juridique/societe/data?societe_id=${societe.id}`)
      const d = await res.json().catch(() => ({}))
      if (res.ok) { setData(d.societe); setAssocies(d.associes || []); setAdmins(d.administrateurs || []); setBo(d.beneficiaires || []) }
    } finally { setLoading(false) }
  }, [societe?.id])

  const loadManual = useCallback(async () => {
    if (!societe?.id) return
    const keys: RegKey[] = ['associes', 'administrateurs', 'beneficiaires']
    const res = await Promise.all(keys.map((k) => fetch(`/api/juridique/societe/registre?societe_id=${societe.id}&registre=${k}`).then((r) => r.json()).catch(() => ({ entries: [] }))))
    setManual({ associes: res[0].entries || [], administrateurs: res[1].entries || [], beneficiaires: res[2].entries || [] })
  }, [societe?.id])

  useEffect(() => { load(); loadManual() }, [load, loadManual])

  // Lignes issues des données source (lecture seule).
  const autoRows = useCallback((key: RegKey): Record<string, string>[] => {
    if (key === 'associes') return associes.map((a) => ({ nom: a.nom, type: a.type_personne || '—', nat: a.nationalite || '—', actions: fmtNum(a.nb_actions), pct: a.pourcentage != null ? `${a.pourcentage}%` : '—', vn: fmtNum(a.valeur_nominale) }))
    if (key === 'administrateurs') return admins.map((a) => ({ nom: a.nom, type: a.type || '—', nat: a.nationalite || '—', nic: a.nic || '—', dn: fmtDate(a.date_nomination) }))
    return bo.map((b) => ({ nom: b.nom, nat: b.nationalite || '—', res: b.pays_residence || '—', pct: b.pct_detention != null ? `${b.pct_detention}%` : '—', ctrl: b.nature_controle || '—', pep: b.is_pep ? 'Oui' : 'Non' }))
  }, [associes, admins, bo])

  const totalCount = (key: RegKey) => autoRows(key).length + manual[key].length

  async function addEntry() {
    if (!societe?.id) return
    setSaving(true)
    try {
      const res = await fetch("/api/juridique/societe/registre", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societe.id, registre: tab, data: addForm }),
      })
      if (res.ok) { setAddForm({}); setShowAdd(false); await loadManual() }
      else { const e = await res.json().catch(() => ({})); alert(e.error || "Échec de l'ajout") }
    } finally { setSaving(false) }
  }

  async function deleteEntry(id: string) {
    if (!confirm("Supprimer cette inscription ?")) return
    const res = await fetch(`/api/juridique/societe/registre?id=${id}`, { method: "DELETE" })
    if (res.ok) await loadManual()
    else { const e = await res.json().catch(() => ({})); alert(e.error || "Échec de la suppression") }
  }

  async function downloadPdf() {
    if (!data) return
    setPdfLoading(true)
    try {
      const cols = COLUMNS[tab]
      const rows = [...autoRows(tab), ...manual[tab].map((m) => m.data)]
      const res = await fetch("/api/juridique/societe/registre/pdf", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe: { nom: data.nom, brn: data.brn, adresse: data.registered_office || data.adresse }, titre: TITRES[tab], sousTitre: data.nom, columns: cols, rows }),
      })
      if (!res.ok) { alert("Erreur PDF"); return }
      const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${tab}_${(data.nom || 'societe').replace(/\s/g, '_')}.pdf`; a.click(); URL.revokeObjectURL(url)
    } finally { setPdfLoading(false) }
  }

  const cols = COLUMNS[tab]
  const auto = autoRows(tab)
  const inputCls = "w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#D4AF37]"

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/juridique/societe" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#0B0F2E]"><ArrowLeft className="w-4 h-4" /> Vie de la société</Link>
        <div className="h-4 w-px bg-gray-200" /><BookUser className="w-5 h-5" style={{ color: NAVY }} />
        <h1 className="text-lg font-bold" style={{ color: NAVY }}>Registres légaux</h1>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>

      {!societe ? (
        <div className="rounded-2xl bg-white border border-gray-100 p-8 text-center text-sm text-gray-500"><Building2 className="w-6 h-6 mx-auto mb-2 text-gray-300" /> Sélectionnez une société.</div>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap">
            {(['associes', 'administrateurs', 'beneficiaires'] as RegKey[]).map((k) => (
              <button key={k} onClick={() => { setTab(k); setShowAdd(false); setAddForm({}) }} className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-all ${tab === k ? "border-transparent text-[#0B0F2E]" : "border-gray-200 text-gray-500 hover:border-gray-300"}`} style={tab === k ? { background: "rgba(212,175,55,0.16)" } : {}}>
                {k === 'associes' ? 'Associés / Actionnaires' : k === 'administrateurs' ? 'Administrateurs' : 'Bénéficiaires effectifs'} <span className="ml-1 text-xs opacity-60">({totalCount(k)})</span>
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
              <p className="font-bold text-sm" style={{ color: NAVY }}>{TITRES[tab]}</p>
              <div className="flex gap-1.5">
                <button onClick={() => setShowAdd((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-[#D4AF37]">
                  {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />} {showAdd ? "Annuler" : "Ajouter une inscription"}
                </button>
                <button onClick={downloadPdf} disabled={pdfLoading} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: NAVY }}>
                  {pdfLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} PDF certifié
                </button>
              </div>
            </div>

            {showAdd && (
              <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {cols.map((c) => (
                    <div key={c.key}>
                      <label className="text-[11px] font-semibold text-gray-500">{c.label}</label>
                      <input value={addForm[c.key] || ""} onChange={(e) => setAddForm((f) => ({ ...f, [c.key]: e.target.value }))} className={inputCls} />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-3">
                  <button onClick={addEntry} disabled={saving || !addForm[cols[0].key]?.trim()} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: NAVY }}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Enregistrer l'inscription
                  </button>
                </div>
              </div>
            )}

            {auto.length === 0 && manual[tab].length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-gray-400">Aucune inscription. Ajoutez-en une, ou renseignez les associés/administrateurs dans la fiche société.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left" style={{ background: "rgba(11,15,46,0.04)" }}>
                      {cols.map((c) => <th key={c.key} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{c.label}</th>)}
                      <th className="px-3 py-2.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {auto.map((row, i) => (
                      <tr key={`a${i}`} className="border-t border-gray-50">
                        {cols.map((c) => <td key={c.key} className="px-4 py-2.5 text-gray-700">{row[c.key] || '—'}</td>)}
                        <td className="px-3 py-2.5 text-[10px] text-gray-300">auto</td>
                      </tr>
                    ))}
                    {manual[tab].map((m) => (
                      <tr key={m.id} className="border-t border-gray-50 bg-amber-50/30">
                        {cols.map((c) => <td key={c.key} className="px-4 py-2.5 text-gray-700">{m.data[c.key] || '—'}</td>)}
                        <td className="px-3 py-2.5"><button onClick={() => deleteEntry(m.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-[11px] text-gray-400">Registres tenus conformément au Companies Act 2001. Les lignes « auto » proviennent des fiches société de Lexora ; les inscriptions ajoutées ici sont conservées et incluses dans le PDF.</p>

          <SocieteDocuments
            societeId={societe.id}
            categorie="registre"
            title="Documents associés aux registres"
            hint="Joignez les pièces justificatives : certificats d'actions, statuts, déclarations UBO, extraits ROC…"
          />
        </>
      )}
    </div>
  )
}
