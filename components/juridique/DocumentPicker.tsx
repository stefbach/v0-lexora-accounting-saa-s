"use client"
/**
 * DocumentPicker — sélecteur de pièces à analyser (upload + multisélection).
 * Utilisé par le Contentieux pour joindre des documents (réclamation adverse,
 * contrat, mise en demeure reçue…) aux analyses et à la rédaction d'actes.
 */
import React, { useCallback, useEffect, useRef, useState } from "react"
import { UploadCloud, Loader2, FileText, Check, Paperclip } from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
const ANALYZABLE = /\.(pdf|png|jpe?g|webp)$/i
function cleanName(name: string) { return name.replace(/^\d+_/, "") }

interface Doc { name: string; path: string }

export function DocumentPicker({
  societeId,
  selected,
  onChange,
}: {
  societeId?: string
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [uploading, setUploading] = useState(false)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!societeId) return
    const res = await fetch(`/api/juridique/documents?societe_id=${societeId}`)
    const data = await res.json()
    setDocs((data.files || []).filter((f: Doc) => ANALYZABLE.test(f.name)))
  }, [societeId])

  useEffect(() => { load() }, [load])

  async function upload(files: FileList | null) {
    if (!files || !societeId) return
    setUploading(true)
    try {
      const added: string[] = []
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("societe_id", societeId)
        const res = await fetch("/api/juridique/documents", { method: "POST", body: fd })
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.path) added.push(data.path)
        else alert(`Échec « ${file.name} » : ${data.error || res.status}`)
      }
      await load()
      const n = new Set(selected); added.forEach((p) => n.add(p)); onChange(n)
    } finally { setUploading(false); if (inputRef.current) inputRef.current.value = "" }
  }

  function toggle(path: string) {
    const n = new Set(selected); n.has(path) ? n.delete(path) : n.add(path); onChange(n)
  }

  return (
    <div className="rounded-xl border border-gray-200">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm"
      >
        <span className="flex items-center gap-2 font-medium" style={{ color: NAVY }}>
          <Paperclip className="w-4 h-4" style={{ color: GOLD }} />
          Documents à analyser
          {selected.size > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(212,175,55,0.16)", color: "#8a6d15" }}>
              {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
            </span>
          )}
        </span>
        <span className="text-xs text-gray-400">{open ? "Masquer" : "Afficher"}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-gray-100 pt-2">
          <button
            onClick={() => inputRef.current?.click()} disabled={uploading || !societeId}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40 mb-2"
            style={{ background: NAVY }}
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />} Importer des pièces
          </button>
          <input ref={inputRef} type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => upload(e.target.files)} />
          {docs.length === 0 ? (
            <p className="text-xs text-gray-400 py-1">Aucune pièce analysable (PDF/images). Importez la réclamation adverse, le contrat, etc.</p>
          ) : (
            <ul className="space-y-1 max-h-44 overflow-y-auto">
              {docs.map((d) => {
                const on = selected.has(d.path)
                return (
                  <li key={d.path}>
                    <button onClick={() => toggle(d.path)} className="w-full flex items-center gap-2 text-left rounded-lg px-2 py-1.5 hover:bg-gray-50">
                      <span className={`w-4 h-4 rounded flex items-center justify-center border ${on ? "text-white" : "border-gray-300"}`} style={on ? { background: GOLD, borderColor: GOLD } : undefined}>
                        {on && <Check className="w-3 h-3" />}
                      </span>
                      <FileText className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs text-gray-700 truncate flex-1">{cleanName(d.name)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
