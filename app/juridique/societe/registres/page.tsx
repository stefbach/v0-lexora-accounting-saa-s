"use client"
import React, { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, BookUser, Loader2, Building2, Download } from "lucide-react"
import { useJuridiqueSociete } from "@/components/juridique/JuridiqueSocieteProvider"
import { SocieteDocuments } from "@/components/juridique/SocieteDocuments"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Associe { nom: string; type_personne?: string | null; nationalite?: string | null; nb_actions?: number | null; pourcentage?: number | null; valeur_nominale?: number | null }
interface Admin { nom: string; type?: string | null; nationalite?: string | null; nic?: string | null; date_nomination?: string | null }
interface Bo { nom: string; nationalite?: string | null; pays_residence?: string | null; pct_detention?: number | null; nature_controle?: string | null; is_pep?: boolean | null; effective_from?: string | null }
interface SocieteData { nom?: string; brn?: string; registered_office?: string; adresse?: string }

type RegKey = 'associes' | 'administrateurs' | 'beneficiaires'

const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('fr-FR') : '—'
const fmtNum = (n?: number | null) => n == null ? '—' : new Intl.NumberFormat('fr-FR').format(n)

export default function RegistresPage() {
  const { societe } = useJuridiqueSociete()
  const [data, setData] = useState<SocieteData | null>(null)
  const [associes, setAssocies] = useState<Associe[]>([])
  const [admins, setAdmins] = useState<Admin[]>([])
  const [bo, setBo] = useState<Bo[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<RegKey>('associes')
  const [pdfLoading, setPdfLoading] = useState(false)

  const load = useCallback(async () => {
    if (!societe?.id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/juridique/societe/data?societe_id=${societe.id}`)
      const d = await res.json().catch(() => ({}))
      if (res.ok) { setData(d.societe); setAssocies(d.associes || []); setAdmins(d.administrateurs || []); setBo(d.beneficiaires || []) }
    } finally { setLoading(false) }
  }, [societe?.id])
  useEffect(() => { load() }, [load])

  const TABS: { key: RegKey; label: string; count: number }[] = [
    { key: 'associes', label: 'Associés / Actionnaires', count: associes.length },
    { key: 'administrateurs', label: 'Administrateurs', count: admins.length },
    { key: 'beneficiaires', label: 'Bénéficiaires effectifs', count: bo.length },
  ]

  function registreSpec(key: RegKey) {
    if (key === 'associes') return {
      titre: 'Registre des associés / actionnaires',
      columns: [{ key: 'nom', label: 'Nom', width: 28 }, { key: 'type', label: 'Type', width: 14 }, { key: 'nat', label: 'Nationalité', width: 16 }, { key: 'actions', label: 'Actions', width: 12 }, { key: 'pct', label: '%', width: 10 }, { key: 'vn', label: 'Val. nom.', width: 20 }],
      rows: associes.map((a) => ({ nom: a.nom, type: a.type_personne || '—', nat: a.nationalite || '—', actions: fmtNum(a.nb_actions), pct: a.pourcentage != null ? `${a.pourcentage}%` : '—', vn: fmtNum(a.valeur_nominale) })),
    }
    if (key === 'administrateurs') return {
      titre: 'Registre des administrateurs',
      columns: [{ key: 'nom', label: 'Nom', width: 30 }, { key: 'type', label: 'Fonction', width: 20 }, { key: 'nat', label: 'Nationalité', width: 18 }, { key: 'nic', label: 'NIC', width: 17 }, { key: 'dn', label: 'Nomination', width: 15 }],
      rows: admins.map((a) => ({ nom: a.nom, type: a.type || '—', nat: a.nationalite || '—', nic: a.nic || '—', dn: fmtDate(a.date_nomination) })),
    }
    return {
      titre: 'Registre des bénéficiaires effectifs',
      columns: [{ key: 'nom', label: 'Nom', width: 26 }, { key: 'nat', label: 'Nationalité', width: 16 }, { key: 'res', label: 'Résidence', width: 16 }, { key: 'pct', label: 'Détention', width: 12 }, { key: 'ctrl', label: 'Nature du contrôle', width: 22 }, { key: 'pep', label: 'PEP', width: 8 }],
      rows: bo.map((b) => ({ nom: b.nom, nat: b.nationalite || '—', res: b.pays_residence || '—', pct: b.pct_detention != null ? `${b.pct_detention}%` : '—', ctrl: b.nature_controle || '—', pep: b.is_pep ? 'Oui' : 'Non' })),
    }
  }

  async function downloadPdf() {
    if (!data) return
    setPdfLoading(true)
    try {
      const spec = registreSpec(tab)
      const res = await fetch("/api/juridique/societe/registre/pdf", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe: { nom: data.nom, brn: data.brn, adresse: data.registered_office || data.adresse }, titre: spec.titre, sousTitre: data.nom, columns: spec.columns, rows: spec.rows }),
      })
      if (!res.ok) { alert("Erreur PDF"); return }
      const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${tab}_${(data.nom || 'societe').replace(/\s/g, '_')}.pdf`; a.click(); URL.revokeObjectURL(url)
    } finally { setPdfLoading(false) }
  }

  const spec = registreSpec(tab)

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
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-all ${tab === t.key ? "border-transparent text-[#0B0F2E]" : "border-gray-200 text-gray-500 hover:border-gray-300"}`} style={tab === t.key ? { background: "rgba(212,175,55,0.16)" } : {}}>
                {t.label} <span className="ml-1 text-xs opacity-60">({t.count})</span>
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="font-bold text-sm" style={{ color: NAVY }}>{spec.titre}</p>
              <button onClick={downloadPdf} disabled={pdfLoading || spec.rows.length === 0} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: NAVY }}>
                {pdfLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} PDF certifié
              </button>
            </div>
            {spec.rows.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-gray-400">Aucune inscription enregistrée pour ce registre.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left" style={{ background: "rgba(11,15,46,0.04)" }}>
                      {spec.columns.map((c) => <th key={c.key} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{c.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {spec.rows.map((row, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        {spec.columns.map((c) => <td key={c.key} className="px-4 py-2.5 text-gray-700">{(row as Record<string, string>)[c.key] || '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-[11px] text-gray-400">Registres tenus conformément au Companies Act 2001. Les données proviennent des fiches société de Lexora — mettez-les à jour dans le module concerné si nécessaire.</p>

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
