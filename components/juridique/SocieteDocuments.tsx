"use client"
/**
 * SocieteDocuments — panneau d'association de documents à une société,
 * filtré par catégorie (ex. registres légaux, justificatifs d'obligations).
 * Upload → bucket documents (table juridique_pieces) + liste + suppression.
 */
import React, { useCallback, useEffect, useRef, useState } from "react"
import { UploadCloud, Loader2, FileText, ExternalLink, Trash2, FolderOpen } from "lucide-react"
import { t, getLocale } from "@/lib/i18n"

const NAVY = "#0B0F2E"

interface Doc { id?: string; name: string; path: string; url?: string | null; categorie?: string; created_at?: string }

export function SocieteDocuments({
  societeId, categorie, title, hint,
}: {
  societeId?: string
  categorie: string
  title?: string
  hint?: string
}) {
  const locale = getLocale()
  const resolvedTitle = title ?? t('scjur.societedocs.default_title', locale)
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/juridique/documents?societe_id=${societeId}`)
      const data = await res.json().catch(() => ({}))
      const all: Doc[] = data.files || []
      setDocs(all.filter((f) => (f.categorie || "") === categorie))
    } finally { setLoading(false) }
  }, [societeId, categorie])

  useEffect(() => { load() }, [load])

  async function upload(files: FileList | null) {
    if (!files || !societeId) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("societe_id", societeId)
        fd.append("categorie", categorie)
        const res = await fetch("/api/juridique/documents", { method: "POST", body: fd })
        if (!res.ok) { const e = await res.json().catch(() => ({})); alert(t('scjur.societedocs.upload_fail', locale).replace('{name}', file.name).replace('{err}', String(e.error || res.status))) }
      }
      await load()
    } finally { setUploading(false); if (inputRef.current) inputRef.current.value = "" }
  }

  async function remove(path: string) {
    if (!societeId || !confirm(t('scjur.societedocs.confirm_delete', locale))) return
    const res = await fetch(`/api/juridique/documents?path=${encodeURIComponent(path)}&societe_id=${societeId}`, { method: "DELETE" })
    if (res.ok) await load()
    else { const e = await res.json().catch(() => ({})); alert(e.error || t('scjur.societedocs.delete_fail', locale)) }
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="font-bold text-sm flex items-center gap-2" style={{ color: NAVY }}>
          <FolderOpen className="w-4 h-4" style={{ color: "#D4AF37" }} /> {resolvedTitle} ({docs.length})
        </p>
        <button onClick={() => inputRef.current?.click()} disabled={uploading || !societeId}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: NAVY }}>
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />} {t('scjur.societedocs.associate_doc', locale)}
        </button>
        <input ref={inputRef} type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={(e) => upload(e.target.files)} />
      </div>
      {hint && <p className="px-5 pt-2.5 text-[11px] text-gray-400">{hint}</p>}
      {loading ? (
        <p className="px-5 py-6 text-center text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline" /></p>
      ) : docs.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-gray-400">{t('scjur.societedocs.empty', locale)}</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {docs.map((d) => (
            <li key={d.path} className="px-5 py-2.5 flex items-center gap-3">
              <FileText className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="flex-1 text-sm text-gray-700 truncate">{d.name.replace(/^\d+_/, "")}</span>
              {d.created_at && <span className="text-[11px] text-gray-400 shrink-0">{new Date(d.created_at).toLocaleDateString("fr-FR")}</span>}
              {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="p-1.5 text-gray-400 hover:text-[#0B0F2E]"><ExternalLink className="w-4 h-4" /></a>}
              <button onClick={() => remove(d.path)} className="p-1.5 text-gray-300 hover:text-red-500" aria-label={t('scjur.societedocs.delete', locale)}><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
