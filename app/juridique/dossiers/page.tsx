"use client"
import React, { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { FolderKanban, Plus, Loader2, Building2, ChevronRight, X } from "lucide-react"
import { JuridiqueHeader } from "@/components/juridique/JuridiqueHeader"
import { useJuridiqueSociete } from "@/components/juridique/JuridiqueSocieteProvider"
import { SocieteDocuments } from "@/components/juridique/SocieteDocuments"
import { t, getLocale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Dossier {
  id: string; intitule: string; reference?: string; type_contentieux?: string
  partie_adverse?: string; statut: string; urgence?: string; montant_en_jeu?: number
  devise?: string; created_at: string
}

const STATUT_STYLE: Record<string, { bg: string; c: string }> = {
  ouvert: { bg: "#EEF2FF", c: "#3730A3" },
  en_cours: { bg: "#FEF9C3", c: "#854D0E" },
  clos: { bg: "#F3F4F6", c: "#374151" },
  gagne: { bg: "#ECFDF5", c: "#047857" },
  perdu: { bg: "#FEE2E2", c: "#B91C1C" },
  transige: { bg: "#E0F2FE", c: "#0369A1" },
}

export default function DossiersPage() {
  const locale = getLocale()
  const { societe } = useJuridiqueSociete()
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ intitule: "", partie_adverse: "", type_contentieux: "", montant_en_jeu: "", notre_role: "demandeur" })

  const load = useCallback(async () => {
    if (!societe?.id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/juridique/dossiers?societe_id=${societe.id}`)
      const data = await res.json()
      setDossiers(data.dossiers || [])
    } finally { setLoading(false) }
  }, [societe?.id])

  useEffect(() => { load() }, [load])

  async function create() {
    if (!form.intitule.trim() || !societe?.id) return
    setSaving(true)
    try {
      const res = await fetch("/api/juridique/dossiers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societe.id,
          intitule: form.intitule,
          partie_adverse: form.partie_adverse || null,
          type_contentieux: form.type_contentieux || null,
          notre_role: form.notre_role,
          montant_en_jeu: form.montant_en_jeu ? Number(form.montant_en_jeu) : null,
        }),
      })
      if (res.ok) {
        setForm({ intitule: "", partie_adverse: "", type_contentieux: "", montant_en_jeu: "", notre_role: "demandeur" })
        setShowForm(false)
        await load()
      } else {
        const e = await res.json().catch(() => ({}))
        alert(e.error || t("jurd.dossiers.createFail", locale))
      }
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <JuridiqueHeader
        icon={<FolderKanban className="w-6 h-6" style={{ color: GOLD }} />}
        title={t("jurd.dossiers.title", locale)}
        subtitle={t("jurd.dossiers.subtitle", locale)}
      />

      {!societe ? (
        <div className="rounded-2xl bg-white border border-gray-100 p-8 text-center text-sm text-gray-500">
          <Building2 className="w-6 h-6 mx-auto mb-2 text-gray-300" /> {t("jurd.dossiers.selectSociete", locale)}
        </div>
      ) : (
        <>
          <div className="flex justify-end">
            <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white" style={{ background: NAVY }}>
              {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {showForm ? t("jurd.dossiers.cancel", locale) : t("jurd.dossiers.new", locale)}
            </button>
          </div>

          {showForm && (
            <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-gray-600">{t("jurd.dossiers.intitule", locale)}</label>
                  <input value={form.intitule} onChange={(e) => setForm({ ...form, intitule: e.target.value })} placeholder={t("jurd.dossiers.intitulePlaceholder", locale)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">{t("jurd.dossiers.partieAdverse", locale)}</label>
                  <input value={form.partie_adverse} onChange={(e) => setForm({ ...form, partie_adverse: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">{t("jurd.dossiers.type", locale)}</label>
                  <input value={form.type_contentieux} onChange={(e) => setForm({ ...form, type_contentieux: e.target.value })} placeholder={t("jurd.dossiers.typePlaceholder", locale)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">{t("jurd.dossiers.montant", locale)}</label>
                  <input value={form.montant_en_jeu} onChange={(e) => setForm({ ...form, montant_en_jeu: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal"
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">{t("jurd.dossiers.notreRole", locale)}</label>
                  <select value={form.notre_role} onChange={(e) => setForm({ ...form, notre_role: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#D4AF37]">
                    <option value="demandeur">{t("jurd.dossiers.demandeur", locale)}</option>
                    <option value="defendeur">{t("jurd.dossiers.defendeur", locale)}</option>
                  </select>
                </div>
              </div>
              <button onClick={create} disabled={saving || !form.intitule.trim()} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: NAVY }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {t("jurd.dossiers.create", locale)}
              </button>
            </div>
          )}

          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="font-bold text-sm" style={{ color: NAVY }}>{t("jurd.dossiers.count", locale)} ({dossiers.length})</p>
              {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            </div>
            {dossiers.length === 0 && !loading ? (
              <p className="px-5 py-8 text-center text-sm text-gray-400">{t("jurd.dossiers.empty", locale)}</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {dossiers.map((d) => {
                  const st = STATUT_STYLE[d.statut] || STATUT_STYLE.ouvert
                  return (
                    <li key={d.id}>
                      <Link href={`/juridique/dossiers/${d.id}`} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{d.intitule}</p>
                          <p className="text-[11px] text-gray-400">
                            {[d.type_contentieux, d.partie_adverse, d.montant_en_jeu ? `${d.montant_en_jeu.toLocaleString("fr-FR")} ${d.devise || "MUR"}` : null].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: st.bg, color: st.c }}>{t(`jurd.statut.${d.statut}`, locale)}</span>
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <p className="text-xs text-gray-400 px-1">
            {t("jurd.dossiers.tip", locale)}
          </p>
          <SocieteDocuments
            societeId={societe.id}
            categorie="dossier"
            title={t("jurd.dossiers.docsTitle", locale)}
            hint={t("jurd.dossiers.docsHint", locale)}
          />
        </>
      )}
    </div>
  )
}
