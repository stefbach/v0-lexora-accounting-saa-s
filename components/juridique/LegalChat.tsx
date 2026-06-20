"use client"
/**
 * LegalChat — composant de conversation du Département Juridique.
 * Rendu professionnel (markdown soigné) + analyse multi-documents via storage
 * (upload → bucket → analyse native PDF/image) + sources RAG citées.
 * Mutualisé entre « Conseil juridique » et « Conseil RH & Social ».
 */
import React, { useCallback, useEffect, useRef, useState } from "react"
import { Send, Loader2, Scale, User, Paperclip, UploadCloud, FileText, X, Check } from "lucide-react"
import { useJuridiqueSociete } from "./JuridiqueSocieteProvider"
import { renderLegalMarkdown } from "./renderLegalMarkdown"
import type { DomaineJuridique } from "@/lib/juridique/referentielMauricien"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Source { ref: string; source: string; reference: string; titre: string; url?: string; maj: string }
interface Msg { role: "user" | "assistant"; content: string; sources?: Source[]; docs?: string[] }
interface Doc { name: string; path: string; size: number | null; created_at?: string }

const ANALYZABLE = /\.(pdf|png|jpe?g|webp)$/i
function cleanName(name: string) { return name.replace(/^\d+_/, "") }

export function LegalChat({
  icon, title, subtitle, suggestions, domaines, contextLabel, placeholder,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  suggestions: string[]
  domaines?: DomaineJuridique[]
  contextLabel?: string
  placeholder?: string
}) {
  const { societe } = useJuridiqueSociete()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [docs, setDocs] = useState<Doc[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showDocs, setShowDocs] = useState(false)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, loading])

  const loadDocs = useCallback(async () => {
    if (!societe?.id) return
    const res = await fetch(`/api/juridique/documents?societe_id=${societe.id}`)
    const data = await res.json()
    setDocs((data.files || []).filter((f: Doc) => ANALYZABLE.test(f.name)))
  }, [societe?.id])

  useEffect(() => { loadDocs() }, [loadDocs])

  async function upload(files: FileList | null) {
    if (!files || !societe?.id) return
    setUploading(true)
    try {
      const newPaths: string[] = []
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("societe_id", societe.id)
        const res = await fetch("/api/juridique/documents", { method: "POST", body: fd })
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.path) newPaths.push(data.path)
        else alert(`Échec « ${file.name} » : ${data.error || res.status}`)
      }
      await loadDocs()
      // sélectionne automatiquement les nouveaux documents
      setSelected((prev) => { const n = new Set(prev); newPaths.forEach((p) => n.add(p)); return n })
    } finally { setUploading(false); if (inputRef.current) inputRef.current.value = "" }
  }

  function toggle(path: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(path) ? n.delete(path) : n.add(path); return n })
  }

  async function send(text: string) {
    const q = text.trim()
    if (!q || loading) return
    const selPaths = Array.from(selected)
    const selNames = docs.filter((d) => selected.has(d.path)).map((d) => cleanName(d.name))
    const next: Msg[] = [...messages, { role: "user", content: q, docs: selNames }]
    setMessages(next)
    setInput("")
    setLoading(true)
    try {
      const res = await fetch("/api/juridique/contentieux", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "question",
          question: q,
          contexte: [
            contextLabel || "",
            societe ? `Société cliente : ${societe.nom}${societe.brn ? ` (BRN ${societe.brn})` : ""}` : "",
          ].filter(Boolean).join(" · ") || undefined,
          domaines,
          historique: messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
          societe_id: societe?.id,
          document_paths: selPaths,
        }),
      })
      const data = await res.json()
      setMessages([...next, { role: "assistant", content: data.reponse || data.error || "Aucune réponse.", sources: data.sources || [], docs: data.documents_analyses || [] }])
    } catch {
      setMessages([...next, { role: "assistant", content: "Erreur de connexion. Réessayez." }])
    } finally { setLoading(false) }
  }

  const selectedCount = selected.size

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm flex flex-col" style={{ height: "calc(100vh - 220px)", minHeight: 460 }}>
      {/* En-tête compact */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg p-1.5" style={{ background: NAVY }}>{icon}</div>
          <div>
            <p className="font-bold text-sm" style={{ color: NAVY }}>{title}</p>
            {subtitle ? <p className="text-[11px] text-gray-400 leading-tight">{subtitle}</p> : null}
          </div>
        </div>
        <button
          onClick={() => setShowDocs((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
          style={{ borderColor: selectedCount ? GOLD : "#e5e7eb", color: selectedCount ? "#8a6d15" : "#6b7280", background: selectedCount ? "rgba(212,175,55,0.10)" : "white" }}
        >
          <Paperclip className="w-3.5 h-3.5" />
          {selectedCount ? `${selectedCount} doc${selectedCount > 1 ? "s" : ""} à analyser` : "Documents"}
        </button>
      </div>

      {/* Panneau documents */}
      {showDocs && (
        <div className="border-b border-gray-100 bg-gray-50 px-5 py-3 max-h-56 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-600">Pièces à analyser ({docs.length})</p>
            <button
              onClick={() => inputRef.current?.click()} disabled={uploading || !societe}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-white disabled:opacity-40"
              style={{ background: NAVY }}
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />} Importer
            </button>
            <input ref={inputRef} type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => upload(e.target.files)} />
          </div>
          {docs.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">Aucune pièce analysable. Importez des PDF ou images.</p>
          ) : (
            <ul className="space-y-1">
              {docs.map((d) => {
                const on = selected.has(d.path)
                return (
                  <li key={d.path}>
                    <button onClick={() => toggle(d.path)} className="w-full flex items-center gap-2 text-left rounded-lg px-2 py-1.5 hover:bg-white">
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

      {/* Fil de discussion */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div className="rounded-2xl p-3 mb-4" style={{ background: "rgba(212,175,55,0.12)" }}>
              <Scale className="w-7 h-7" style={{ color: GOLD }} />
            </div>
            <p className="font-bold" style={{ color: NAVY }}>Comment puis-je vous aider ?</p>
            <p className="text-xs text-gray-500 mt-1 mb-5 max-w-md">
              Posez votre question ou joignez des documents à analyser. Tout avis est un projet à valider par un homme de loi.
            </p>
            <div className="grid sm:grid-cols-2 gap-2 w-full max-w-2xl">
              {suggestions.map((s) => (
                <button key={s} onClick={() => send(s)} className="text-left text-xs rounded-xl border border-gray-200 px-3 py-2.5 hover:border-[#D4AF37]/50 hover:bg-gray-50 transition-colors text-gray-700">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <div className="rounded-lg p-1.5 h-7 w-7 flex-shrink-0" style={{ background: NAVY }}>
                  <Scale className="w-4 h-4" style={{ color: GOLD }} />
                </div>
              )}
              <div className="max-w-[85%]">
                {m.role === "assistant" ? (
                  <div className="rounded-2xl px-4 py-3 text-sm bg-gray-50 text-gray-800 border border-gray-100" dangerouslySetInnerHTML={{ __html: renderLegalMarkdown(m.content) }} />
                ) : (
                  <div className="rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed text-white" style={{ background: NAVY }}>{m.content}</div>
                )}
                {m.role === "user" && m.docs && m.docs.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 justify-end">
                    {m.docs.map((d) => (
                      <span key={d} className="inline-flex items-center gap-1 text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full"><FileText className="w-3 h-3" />{d}</span>
                    ))}
                  </div>
                )}
                {m.role === "assistant" && m.docs && m.docs.length > 0 && (
                  <p className="mt-1.5 text-[11px] text-gray-400">Documents analysés : {m.docs.join(", ")}</p>
                )}
                {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                  <div className="mt-2 rounded-xl border border-gray-100 bg-white px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Sources verrouillées (RAG)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {m.sources.map((s) => (
                        <span key={s.ref} title={`${s.titre} · revu ${s.maj}`} className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-gray-200 text-gray-700">
                          <span style={{ color: GOLD }}>{s.ref}</span> {s.source} {s.reference}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {m.role === "user" && (
                <div className="rounded-lg p-1.5 h-7 w-7 flex-shrink-0 bg-gray-200"><User className="w-4 h-4 text-gray-600" /></div>
              )}
            </div>
          ))
        )}
        {loading && (
          <div className="flex gap-3">
            <div className="rounded-lg p-1.5 h-7 w-7" style={{ background: NAVY }}><Scale className="w-4 h-4" style={{ color: GOLD }} /></div>
            <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> {selectedCount ? "Analyse des documents en cours…" : "Analyse en cours…"}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Saisie */}
      <div className="border-t border-gray-100 p-3">
        {selectedCount > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {docs.filter((d) => selected.has(d.path)).map((d) => (
              <span key={d.path} className="inline-flex items-center gap-1 text-[11px] bg-[#D4AF37]/12 text-[#8a6d15] px-2 py-0.5 rounded-full">
                <FileText className="w-3 h-3" />{cleanName(d.name)}
                <button onClick={() => toggle(d.path)} aria-label="Retirer"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <button onClick={() => setShowDocs((v) => !v)} className="rounded-xl p-2.5 border border-gray-200 text-gray-500 hover:text-[#0B0F2E]" aria-label="Joindre des documents">
            <Paperclip className="w-4 h-4" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input) } }}
            placeholder={placeholder || "Décrivez votre question…"}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#D4AF37] max-h-32"
          />
          <button onClick={() => send(input)} disabled={loading || !input.trim()} className="rounded-xl px-4 py-2.5 text-white disabled:opacity-40 transition-opacity" style={{ background: NAVY }} aria-label="Envoyer">
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-2 text-center">
          Projet de travail — ne remplace pas la consultation d'un avocat / attorney inscrit au barreau mauricien.
        </p>
      </div>
    </div>
  )
}
