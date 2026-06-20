"use client"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { FolderOpen, UploadCloud, Loader2, FileText, Trash2, ExternalLink, Building2 } from "lucide-react"
import { JuridiqueHeader } from "@/components/juridique/JuridiqueHeader"
import { useJuridiqueSociete } from "@/components/juridique/JuridiqueSocieteProvider"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Doc { name: string; path: string; size: number | null; created_at?: string; url: string | null }

function humanSize(n: number | null): string {
  if (!n) return ""
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`
  return `${(n / 1024 / 1024).toFixed(1)} Mo`
}
function cleanName(name: string): string {
  return name.replace(/^\d+_/, "")
}

export default function DocumentsPage() {
  const { societe, loading: socLoading } = useJuridiqueSociete()
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!societe?.id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/juridique/documents?societe_id=${societe.id}`)
      const data = await res.json()
      setDocs(data.files || [])
    } finally { setLoading(false) }
  }, [societe?.id])

  useEffect(() => { load() }, [load])

  async function upload(files: FileList | null) {
    if (!files || !societe?.id) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("societe_id", societe.id)
        const res = await fetch("/api/juridique/documents", { method: "POST", body: fd })
        if (!res.ok) {
          const e = await res.json().catch(() => ({}))
          alert(`Échec « ${file.name} » : ${e.error || res.status}`)
        }
      }
      await load()
    } finally { setUploading(false); if (inputRef.current) inputRef.current.value = "" }
  }

  async function remove(path: string) {
    if (!societe?.id || !confirm("Supprimer cette pièce ?")) return
    await fetch(`/api/juridique/documents?path=${encodeURIComponent(path)}&societe_id=${societe.id}`, { method: "DELETE" })
    await load()
  }

  return (
    <div className="space-y-5">
      <JuridiqueHeader
        icon={<FolderOpen className="w-6 h-6" style={{ color: GOLD }} />}
        title="Coffre-fort documentaire"
        subtitle="Importez et classez contrats, actes, registres, jugements et correspondances. Rangement par société, accès sécurisé."
      />

      {!societe && !socLoading ? (
        <div className="rounded-2xl bg-white border border-gray-100 p-8 text-center text-sm text-gray-500">
          <Building2 className="w-6 h-6 mx-auto mb-2 text-gray-300" />
          Sélectionnez une société pour accéder à ses pièces.
        </div>
      ) : (
        <>
          {/* Zone d'upload */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files) }}
            onClick={() => inputRef.current?.click()}
            className={`rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${drag ? "border-[#D4AF37] bg-[#D4AF37]/5" : "border-gray-200 bg-white hover:border-gray-300"}`}
          >
            <input ref={inputRef} type="file" multiple className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              onChange={(e) => upload(e.target.files)} />
            {uploading ? (
              <div className="flex flex-col items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: GOLD }} /> Téléversement…
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-2xl p-3" style={{ background: "rgba(212,175,55,0.12)" }}>
                  <UploadCloud className="w-6 h-6" style={{ color: GOLD }} />
                </div>
                <p className="text-sm font-semibold" style={{ color: NAVY }}>Glissez vos documents ici, ou cliquez</p>
                <p className="text-xs text-gray-400">PDF, images, Word — 20 Mo max par fichier</p>
              </div>
            )}
          </div>

          {/* Liste */}
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="font-bold text-sm" style={{ color: NAVY }}>Pièces ({docs.length})</p>
              {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            </div>
            {docs.length === 0 && !loading ? (
              <p className="px-5 py-8 text-center text-sm text-gray-400">Aucune pièce pour l'instant.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {docs.map((d) => (
                  <li key={d.path} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50">
                    <div className="rounded-lg p-2" style={{ background: "rgba(11,15,46,0.05)" }}>
                      <FileText className="w-4 h-4" style={{ color: NAVY }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{cleanName(d.name)}</p>
                      <p className="text-[11px] text-gray-400">{humanSize(d.size)}{d.created_at ? ` · ${new Date(d.created_at).toLocaleDateString("fr-FR")}` : ""}</p>
                    </div>
                    {d.url && (
                      <a href={d.url} target="_blank" rel="noreferrer" className="p-2 text-gray-400 hover:text-[#0B0F2E]" aria-label="Ouvrir">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    <button onClick={() => remove(d.path)} className="p-2 text-gray-400 hover:text-red-600" aria-label="Supprimer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
