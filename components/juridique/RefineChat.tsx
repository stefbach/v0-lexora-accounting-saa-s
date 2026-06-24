"use client"
/**
 * RefineChat — chatbot d'amélioration d'un acte généré (PV, résolution,
 * statuts, courrier…). L'utilisateur décrit en langage naturel les
 * modifications ; l'acte est régénéré complet et reste sourcé.
 * Toujours visible (désactivé tant qu'aucun acte n'est généré).
 */
import React, { useState } from "react"
import { Settings, Send, Loader2, CheckCircle } from "lucide-react"
import type { DomaineJuridique } from "@/lib/juridique/referentielMauricien"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Source { ref: string; source: string; reference: string; titre: string; maj: string }

export function RefineChat({
  text, domaines, onUpdate, placeholder, title = "Améliorer / personnaliser le document",
  endpoint = "/api/juridique/societe/refine", extraPayload,
}: {
  text: string
  domaines?: DomaineJuridique[]
  onUpdate: (newText: string, sources: Source[]) => void
  placeholder?: string
  title?: string
  endpoint?: string
  extraPayload?: Record<string, unknown>
}) {
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])

  async function apply() {
    const instruction = input.trim()
    if (!instruction || !text || busy) return
    setBusy(true)
    try {
      const res = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_text: text, instruction, domaines, ...extraPayload }),
      })
      const ct = res.headers.get("content-type") || ""
      const data = ct.includes("json") ? await res.json() : null
      if (!res.ok || !data) { alert((data && data.error) || "Échec de la modification"); return }
      onUpdate(data.text || text, Array.isArray(data.sources) ? data.sources : [])
      setLog((l) => [...l, instruction])
      setInput("")
    } catch (e: any) {
      alert(e.message || "Erreur réseau")
    } finally { setBusy(false) }
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
      <p className="text-sm font-semibold flex items-center gap-2 mb-1" style={{ color: NAVY }}>
        <Settings className="w-4 h-4" style={{ color: GOLD }} /> {title}
      </p>
      <p className="text-xs text-gray-500 mb-3">Décrivez en langage naturel ce qu'il faut ajouter, retirer ou reformuler. Le document est régénéré complet et reste sourcé.</p>
      {log.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {log.map((r, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3 text-green-500" />{r.length > 44 ? r.slice(0, 44) + '…' : r}</span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); apply() } }}
          rows={1}
          disabled={!text}
          placeholder={text ? (placeholder || "Ex. Ajoute une résolution sur… · Précise les pouvoirs de… · Reformule le paragraphe…") : "Générez d'abord le document, puis améliorez-le ici…"}
          className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#D4AF37] max-h-28 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button onClick={apply} disabled={busy || !text || !input.trim()} className="rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40 inline-flex items-center" style={{ background: NAVY, color: GOLD }}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
