"use client"
import React, { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Loader2, FileText, UploadCloud, ExternalLink, Scale, MessageSquareText } from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

const STATUTS = ["ouvert", "en_cours", "clos", "gagne", "perdu", "transige"]
const STATUT_LABEL: Record<string, string> = { ouvert: "Ouvert", en_cours: "En cours", clos: "Clos", gagne: "Gagné", perdu: "Perdu", transige: "Transigé" }
const TYPE_LABEL: Record<string, string> = { conseil: "Conseil", conseil_rh: "Conseil RH", qualification: "Qualification", evaluation: "Évaluation", acte: "Acte" }

interface Dossier { id: string; societe_id: string; intitule: string; reference?: string; type_contentieux?: string; partie_adverse?: string; notre_role?: string; montant_en_jeu?: number; devise?: string; juridiction?: string; statut: string; urgence?: string; resume?: string }
interface Piece { id: string; nom: string; storage_path: string; categorie?: string; created_at: string; url?: string | null }
interface Consultation { id: string; type: string; titre?: string; created_at: string }

export default function DossierDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id as string
  const [dossier, setDossier] = useState<Dossier | null>(null)
  const [pieces, setPieces] = useState<Piece[]>([])
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/juridique/dossiers/${id}`)
      const data = await res.json()
      setDossier(data.dossier || null)
      setPieces(data.pieces || [])
      setConsultations(data.consultations || [])
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  async function setStatut(statut: string) {
    if (!dossier) return
    setDossier({ ...dossier, statut })
    await fetch(`/api/juridique/dossiers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statut }) })
  }

  async function upload(files: FileList | null) {
    if (!files || !dossier) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("societe_id", dossier.societe_id)
        fd.append("dossier_id", dossier.id)
        await fetch("/api/juridique/documents", { method: "POST", body: fd })
      }
      await load()
    } finally { setUploading(false); if (inputRef.current) inputRef.current.value = "" }
  }

  if (loading) return <div className="flex items-center gap-2 text-gray-500 text-sm py-10"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</div>
  if (!dossier) return <div className="text-sm text-gray-500 py-10">Dossier introuvable. <Link href="/juridique/dossiers" className="text-[#0B0F2E] underline">Retour</Link></div>

  return (
    <div className="space-y-5">
      <Link href="/juridique/dossiers" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#0B0F2E]"><ArrowLeft className="w-4 h-4" /> Dossiers</Link>

      <div className="rounded-2xl px-6 py-5 text-white shadow-sm" style={{ background: "radial-gradient(ellipse 120% 80% at 0% 0%, rgba(65,145,255,0.18) 0%, transparent 60%), radial-gradient(ellipse 120% 80% at 100% 100%, rgba(212,175,55,0.16) 0%, transparent 60%), #0B0F2E", border: "1px solid rgba(212,175,55,0.20)" }}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">{dossier.intitule}</h1>
            <p className="text-sm text-white/70 mt-0.5">{[dossier.type_contentieux, dossier.partie_adverse].filter(Boolean).join(" · ") || "—"}</p>
          </div>
          <select value={dossier.statut} onChange={(e) => setStatut(e.target.value)} className="rounded-lg px-3 py-1.5 text-sm bg-white/95 text-[#0B0F2E] font-semibold">
            {STATUTS.map((s) => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
          </select>
        </div>
      </div>

      {/* Infos */}
      <div className="grid sm:grid-cols-3 gap-3">
        <Info label="Notre rôle" value={dossier.notre_role} />
        <Info label="Montant en jeu" value={dossier.montant_en_jeu ? `${dossier.montant_en_jeu.toLocaleString("fr-FR")} ${dossier.devise || "MUR"}` : undefined} />
        <Info label="Juridiction" value={dossier.juridiction} />
      </div>
      {dossier.resume ? <div className="rounded-2xl bg-white border border-gray-100 p-4 text-sm text-gray-700 shadow-sm">{dossier.resume}</div> : null}

      {/* Pièces */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="font-bold text-sm" style={{ color: NAVY }}>Pièces ({pieces.length})</p>
          <button onClick={() => inputRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: NAVY }}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />} Ajouter
          </button>
          <input ref={inputRef} type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={(e) => upload(e.target.files)} />
        </div>
        {pieces.length === 0 ? <p className="px-5 py-6 text-center text-sm text-gray-400">Aucune pièce.</p> : (
          <ul className="divide-y divide-gray-50">
            {pieces.map((p) => (
              <li key={p.id} className="px-5 py-2.5 flex items-center gap-3">
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="flex-1 text-sm text-gray-700 truncate">{p.nom}</span>
                {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="p-1.5 text-gray-400 hover:text-[#0B0F2E]"><ExternalLink className="w-4 h-4" /></a>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Consultations / actes */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Scale className="w-4 h-4" style={{ color: GOLD }} />
          <p className="font-bold text-sm" style={{ color: NAVY }}>Consultations & actes ({consultations.length})</p>
        </div>
        {consultations.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-gray-400">
            Aucune consultation enregistrée.
            <div className="mt-2 flex justify-center gap-2">
              <Link href="/juridique/conseil" className="inline-flex items-center gap-1 text-xs text-[#0B0F2E] underline"><MessageSquareText className="w-3.5 h-3.5" /> Conseil</Link>
              <Link href="/juridique/contentieux" className="inline-flex items-center gap-1 text-xs text-[#0B0F2E] underline"><Scale className="w-3.5 h-3.5" /> Contentieux</Link>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {consultations.map((c) => (
              <li key={c.id} className="px-5 py-2.5 flex items-center gap-3">
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{TYPE_LABEL[c.type] || c.type}</span>
                <span className="flex-1 text-sm text-gray-700 truncate">{c.titre || "—"}</span>
                <span className="text-[11px] text-gray-400">{new Date(c.created_at).toLocaleDateString("fr-FR")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-xl bg-white border border-gray-100 px-4 py-3 shadow-sm">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800 capitalize">{value || "—"}</p>
    </div>
  )
}
