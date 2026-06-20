"use client"
import React, { useRef, useState, useEffect } from "react"
import { MessageSquareText, Send, Loader2, Scale, User } from "lucide-react"
import { JuridiqueHeader } from "@/components/juridique/JuridiqueHeader"
import { useJuridiqueSociete } from "@/components/juridique/JuridiqueSocieteProvider"
import { DEPARTEMENTS } from "@/lib/juridique/departements"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Source { ref: string; source: string; reference: string; titre: string; url?: string; maj: string }
interface Msg { role: "user" | "assistant"; content: string; sources?: Source[] }

const SUGGESTIONS = [
  "Un client ne paie pas une facture de 350 000 MUR depuis 4 mois. Quelles sont mes options ?",
  "Quel délai de prescription pour une créance commerciale à Maurice ?",
  "Comment contester une cotisation MRA jugée excessive ?",
  "Un salarié conteste son licenciement. Quelle juridiction et quels risques ?",
]

export default function ConseilPage() {
  const { societe } = useJuridiqueSociete()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [dep, setDep] = useState<(typeof DEPARTEMENTS)[number] | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, loading])

  // Lecture client-safe du département ciblé (?dep=) sans contrainte Suspense.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("dep")
    if (id) setDep(DEPARTEMENTS.find((d) => d.id === id) || null)
  }, [])

  async function send(text: string) {
    const q = text.trim()
    if (!q || loading) return
    const next = [...messages, { role: "user" as const, content: q }]
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
            dep ? `Département : ${dep.nom} (${dep.lois.join(", ")})` : "",
            societe ? `Société cliente : ${societe.nom}${societe.brn ? ` (BRN ${societe.brn})` : ""}` : "",
          ].filter(Boolean).join(" · ") || undefined,
          domaines: dep?.domaines,
          historique: messages.slice(-10),
          societe_id: societe?.id,
        }),
      })
      const data = await res.json()
      setMessages([...next, { role: "assistant", content: data.reponse || data.error || "Aucune réponse.", sources: data.sources || [] }])
    } catch {
      setMessages([...next, { role: "assistant", content: "Erreur de connexion. Réessayez." }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <JuridiqueHeader
        icon={<MessageSquareText className="w-6 h-6" style={{ color: GOLD }} />}
        title="Conseil juridique"
        subtitle="Interrogez l'avocat-conseil IA sur le droit mauricien. Réponses structurées (fondement légal · stratégie · risques · étapes) avec références citées."
      />

      {dep && (
        <div className="flex items-center gap-2 -mt-1 text-xs">
          <span className="font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(212,175,55,0.16)", color: "#8a6d15" }}>
            Département : {dep.nom}
          </span>
          <span className="text-gray-400">{dep.lois.join(" · ")}</span>
        </div>
      )}

      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm flex flex-col" style={{ height: "calc(100vh - 280px)", minHeight: 420 }}>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="rounded-2xl p-3 mb-4" style={{ background: "rgba(212,175,55,0.12)" }}>
                <Scale className="w-7 h-7" style={{ color: GOLD }} />
              </div>
              <p className="font-bold" style={{ color: NAVY }}>Comment puis-je vous aider ?</p>
              <p className="text-xs text-gray-500 mt-1 mb-5 max-w-md">
                Décrivez votre situation. Tout avis est un projet de travail à valider par un avocat inscrit.
              </p>
              <div className="grid sm:grid-cols-2 gap-2 w-full max-w-2xl">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-xs rounded-xl border border-gray-200 px-3 py-2.5 hover:border-[#D4AF37]/50 hover:bg-gray-50 transition-colors text-gray-700"
                  >
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
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                      m.role === "user" ? "text-white" : "bg-gray-50 text-gray-800 border border-gray-100"
                    }`}
                    style={m.role === "user" ? { background: NAVY } : undefined}
                  >
                    {m.content}
                  </div>
                  {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                    <div className="mt-2 rounded-xl border border-gray-100 bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Sources verrouillées (RAG)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {m.sources.map((s) => (
                          <span key={s.ref} title={`${s.titre} · revu ${s.maj}`}
                            className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-gray-200 text-gray-700">
                            <span style={{ color: GOLD }}>{s.ref}</span> {s.source} {s.reference}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {m.role === "user" && (
                  <div className="rounded-lg p-1.5 h-7 w-7 flex-shrink-0 bg-gray-200">
                    <User className="w-4 h-4 text-gray-600" />
                  </div>
                )}
              </div>
            ))
          )}
          {loading && (
            <div className="flex gap-3">
              <div className="rounded-lg p-1.5 h-7 w-7" style={{ background: NAVY }}>
                <Scale className="w-4 h-4" style={{ color: GOLD }} />
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Analyse en cours…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-gray-100 p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input) } }}
              placeholder="Décrivez votre question juridique…"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#D4AF37] max-h-32"
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="rounded-xl px-4 py-2.5 text-white disabled:opacity-40 transition-opacity"
              style={{ background: NAVY }}
              aria-label="Envoyer"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-2 text-center">
            Projet de travail — ne remplace pas la consultation d'un avocat / attorney inscrit au barreau mauricien.
          </p>
        </div>
      </div>
    </div>
  )
}
