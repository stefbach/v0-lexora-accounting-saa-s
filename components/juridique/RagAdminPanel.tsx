"use client"
/**
 * RagAdminPanel — déclenchement de l'ingestion RAG (admin uniquement).
 * Visible pour admin/super_admin ; les routes vérifient le rôle côté serveur.
 */
import React, { useState } from "react"
import { Database, Loader2, BookOpen, CheckCircle2, Gavel } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"
import { SOURCES_LOIS } from "@/lib/juridique/rag/sources-officielles"
import { LISTINGS_JURISPRUDENCE } from "@/lib/juridique/rag/sources-jurisprudence"
import { t, getLocale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

export function RagAdminPanel() {
  const locale = getLocale()
  const { profile } = useProfile()
  const [busy, setBusy] = useState<string>("")
  const [msg, setMsg] = useState<string>("")

  if (!profile || !["admin", "super_admin"].includes(profile.role)) return null

  async function run(label: string, url: string, body?: unknown) {
    setBusy(label); setMsg("")
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      const data = await res.json()
      setMsg(res.ok ? `✅ ${label} : ${JSON.stringify(data.rapport || data).slice(0, 300)}` : `⚠️ ${data.error || res.status}`)
    } catch {
      setMsg(`⚠️ ${t('scjur.ragadmin.network_error', locale)}`)
    } finally { setBusy("") }
  }

  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Database className="w-4 h-4" style={{ color: GOLD }} />
        <p className="font-bold text-sm" style={{ color: NAVY }}>{t('scjur.ragadmin.title', locale)}</p>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        {t('scjur.ragadmin.help_pre', locale)}<code className="bg-gray-100 px-1 rounded">VOYAGE_API_KEY</code>{t('scjur.ragadmin.help_post', locale)}
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => run(t('scjur.ragadmin.base_corpus', locale), "/api/juridique/rag/ingest")} disabled={!!busy}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white disabled:opacity-40" style={{ background: NAVY }}>
          {busy === t('scjur.ragadmin.base_corpus', locale) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} {t('scjur.ragadmin.base_corpus', locale)}
        </button>
        {SOURCES_LOIS.map((s) => (
          <button key={s.key} onClick={() => run(s.source, "/api/juridique/rag/ingest-loi", { key: s.key })} disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: "rgba(212,175,55,0.16)", color: "#8a6d15" }}>
            {busy === s.source ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />} {s.source}
          </button>
        ))}
        <button onClick={() => run(t('scjur.ragadmin.all_laws', locale), "/api/juridique/rag/ingest-loi", { key: "all" })} disabled={!!busy}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white disabled:opacity-40" style={{ background: NAVY }}>
          {busy === t('scjur.ragadmin.all_laws', locale) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />} {t('scjur.ragadmin.all_laws', locale)}
        </button>
      </div>

      {/* ── Jurisprudence mauricienne (Cour suprême / Industrial / Intermediate) ── */}
      <p className="text-xs text-gray-500 mt-4 mb-2">
        {t('scjur.ragadmin.case_law_help_pre', locale)}<code className="bg-gray-100 px-1 rounded">supremecourt.govmu.org</code>{t('scjur.ragadmin.case_law_help_post', locale)}
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => run(t('scjur.ragadmin.reference_rulings', locale), "/api/juridique/rag/crawl-jurisprudence", { arrets: true })} disabled={!!busy}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white disabled:opacity-40" style={{ background: NAVY }}>
          {busy === t('scjur.ragadmin.reference_rulings', locale) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gavel className="w-3.5 h-3.5" />} {t('scjur.ragadmin.reference_rulings', locale)}
        </button>
        {LISTINGS_JURISPRUDENCE.map((l) => (
          <button key={l.key} onClick={() => run(l.key, "/api/juridique/rag/crawl-jurisprudence", { listingKey: l.key })} disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: "rgba(212,175,55,0.16)", color: "#8a6d15" }}>
            {busy === l.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gavel className="w-3.5 h-3.5" />} {l.titre.split(" — ")[0].split(" (")[0]}
          </button>
        ))}
      </div>

      {msg && <p className="text-[11px] text-gray-600 mt-3 break-words">{msg}</p>}
    </div>
  )
}
