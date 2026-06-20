"use client"
import React, { useState } from "react"
import { Gavel, Loader2, Scale, FileDown, Sparkles, AlertTriangle, CheckCircle2, Building2 } from "lucide-react"
import { JuridiqueHeader } from "@/components/juridique/JuridiqueHeader"
import { useJuridiqueSociete } from "@/components/juridique/JuridiqueSocieteProvider"
import { DocumentPicker } from "@/components/juridique/DocumentPicker"
import { TYPES_CONTENTIEUX } from "@/lib/juridique/referentielMauricien"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

type Urgence = "faible" | "moyenne" | "haute" | "critique"
interface Source { ref: string; source: string; reference: string; titre: string; url?: string; maj: string }
interface Qualification {
  type_contentieux: string; fondement_legal: string[]; juridiction_competente: string
  prescription: string; urgence: Urgence; resume: string; pieces_a_reunir: string[]; sources?: Source[]
}
interface Evaluation {
  chances_succes: string; analyse: string; arguments_pour: string[]; arguments_adverses: string[]
  strategie_recommandee: string; etapes_procedure: Array<{ etape: string; delai: string; juridiction?: string }>
  estimation_couts: string; risques: string[]; base_legale: string[]; sources?: Source[]
}

const ACTES_GROUPES: { groupe: string; actes: { id: string; label: string }[] }[] = [
  {
    groupe: "Demande / attaque",
    actes: [
      { id: "mise_en_demeure", label: "Mise en demeure" },
      { id: "sommation", label: "Sommation de payer" },
      { id: "lettre_avocat", label: "Lettre officielle" },
      { id: "statement_of_claim", label: "Statement of Claim" },
    ],
  },
  {
    groupe: "Défense / réponse",
    actes: [
      { id: "reponse_mise_en_demeure", label: "Réponse à mise en demeure" },
      { id: "courrier_defense", label: "Courrier en défense" },
      { id: "conclusions_defense", label: "Conclusions en défense" },
      { id: "contestation_creance", label: "Contestation de créance" },
    ],
  },
  {
    groupe: "Amiable",
    actes: [
      { id: "lettre_negociation", label: "Lettre de négociation amiable" },
      { id: "protocole_accord", label: "Protocole d'accord" },
    ],
  },
]

const URGENCE_STYLE: Record<Urgence, { bg: string; color: string; label: string }> = {
  faible: { bg: "#ECFDF5", color: "#047857", label: "Urgence faible" },
  moyenne: { bg: "#FEF9C3", color: "#854D0E", label: "Urgence moyenne" },
  haute: { bg: "#FFEDD5", color: "#9A3412", label: "Urgence haute" },
  critique: { bg: "#FEE2E2", color: "#B91C1C", label: "🔴 Urgence critique" },
}

export default function ContentieuxPage() {
  const { societe } = useJuridiqueSociete()
  const [description, setDescription] = useState("")
  const [adverse, setAdverse] = useState("")
  const [montant, setMontant] = useState("")
  const [role, setRole] = useState<"demandeur" | "defendeur">("demandeur")
  const [loading, setLoading] = useState<"" | "qualifier" | "evaluer" | "acte">("")
  const [qualif, setQualif] = useState<Qualification | null>(null)
  const [evalRes, setEvalRes] = useState<Evaluation | null>(null)
  const [acteType, setActeType] = useState("mise_en_demeure")
  const [acte, setActe] = useState<{ titre: string; corps: string; sources?: Source[] } | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())

  const docPaths = () => Array.from(selectedDocs)

  const faits = () => ({
    description, partie_adverse: adverse || undefined,
    montant_en_jeu: montant ? Number(montant) : undefined, devise: "MUR",
    notre_role: role,
  })

  async function run(action: "qualifier" | "evaluer") {
    if (!description.trim()) return
    setLoading(action)
    try {
      const res = await fetch("/api/juridique/contentieux", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, faits: faits(), societe_id: societe?.id, document_paths: docPaths() }),
      })
      const data = await res.json()
      if (action === "qualifier") setQualif(data.qualification || null)
      else setEvalRes(data.evaluation || null)
    } finally { setLoading("") }
  }

  async function genererActe() {
    if (!description.trim() || !adverse.trim()) { alert("Renseignez la description et la partie adverse."); return }
    setLoading("acte"); setActe(null)
    try {
      const res = await fetch("/api/juridique/contentieux", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generer_acte", societe_id: societe?.id, document_paths: docPaths(),
          params: {
            type_acte: acteType,
            societe: { nom: societe?.nom || "", brn: societe?.brn || undefined, adresse: societe?.adresse || undefined },
            partie_adverse: { nom: adverse },
            objet: qualif?.resume || description.slice(0, 120),
            montant: montant ? Number(montant) : undefined, devise: "MUR",
            faits: description, delai_jours: 14,
            fondement_legal: qualif?.fondement_legal,
          },
        }),
      })
      const data = await res.json()
      setActe(data.acte || null)
    } finally { setLoading("") }
  }

  async function downloadPdf() {
    if (!acte) return
    setPdfLoading(true)
    try {
      const res = await fetch("/api/juridique/contentieux/pdf", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre: acte.titre, corps: acte.corps, sources: acte.sources,
          objet: qualif?.resume || description.slice(0, 120),
          montant: montant ? Number(montant) : undefined, devise: "MUR",
          emetteur: { nom: societe?.nom || "Société", brn: societe?.brn || undefined, adresse: societe?.adresse || undefined },
          destinataire: { nom: adverse },
        }),
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank")
    } finally { setPdfLoading(false) }
  }

  return (
    <div className="space-y-5">
      <JuridiqueHeader
        icon={<Gavel className="w-6 h-6" style={{ color: GOLD }} />}
        title="Contentieux"
        subtitle="Outil clé en main : importez les pièces, qualifiez le litige, évaluez vos chances, puis rédigez vos courriers — en demande (mise en demeure, sommation) comme en défense (réponse, contestation) — ancrés sur le RAG mauricien, avec le PDF final."
      />

      {/* Saisie du litige */}
      <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-4">
        <div>
          <label className="text-xs font-semibold text-gray-600">Description des faits *</label>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
            placeholder="Décrivez le litige : nature, montants, dates, échanges déjà eus…"
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#D4AF37]"
          />
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-600">Partie adverse</label>
            <input value={adverse} onChange={(e) => setAdverse(e.target.value)} placeholder="Nom / société"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Montant en jeu (MUR)</label>
            <input value={montant} onChange={(e) => setMontant(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="350000" inputMode="decimal"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Notre rôle</label>
            <select value={role} onChange={(e) => setRole(e.target.value as "demandeur" | "defendeur")}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#D4AF37]">
              <option value="demandeur">Demandeur (nous réclamons)</option>
              <option value="defendeur">Défendeur (nous sommes attaqués)</option>
            </select>
          </div>
        </div>
        <DocumentPicker societeId={societe?.id} selected={selectedDocs} onChange={setSelectedDocs} />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => run("qualifier")} disabled={!!loading || !description.trim()}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: NAVY }}>
            {loading === "qualifier" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />} Qualifier le litige
          </button>
          <button onClick={() => run("evaluer")} disabled={!!loading || !description.trim()}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40" style={{ background: "rgba(212,175,55,0.16)", color: "#8a6d15" }}>
            {loading === "evaluer" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Évaluer mes chances
          </button>
        </div>
      </div>

      {/* Qualification */}
      {qualif && (
        <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm" style={{ color: NAVY }}>Qualification juridique</p>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: URGENCE_STYLE[qualif.urgence]?.bg, color: URGENCE_STYLE[qualif.urgence]?.color }}>
              {URGENCE_STYLE[qualif.urgence]?.label}
            </span>
          </div>
          <p className="text-sm text-gray-700">{qualif.resume}</p>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <Info label="Type" value={TYPES_CONTENTIEUX.find((t) => t.id === qualif.type_contentieux)?.label || qualif.type_contentieux} />
            <Info label="Juridiction compétente" value={qualif.juridiction_competente} />
            <Info label="Prescription" value={qualif.prescription} />
            <Info label="Fondement légal" value={qualif.fondement_legal?.join(" · ")} />
          </div>
          {qualif.pieces_a_reunir?.length ? (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1">Pièces à réunir</p>
              <ul className="text-sm text-gray-700 list-disc pl-5 space-y-0.5">
                {qualif.pieces_a_reunir.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          ) : null}
          <SourcesBlock sources={qualif.sources} />
        </div>
      )}

      {/* Évaluation */}
      {evalRes && (
        <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <p className="font-bold text-sm" style={{ color: NAVY }}>Évaluation stratégique</p>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize" style={{ background: "rgba(11,15,46,0.06)", color: NAVY }}>
              Chances : {evalRes.chances_succes}
            </span>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{evalRes.analyse}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <ListCard icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} title="Arguments pour nous" items={evalRes.arguments_pour} />
            <ListCard icon={<AlertTriangle className="w-4 h-4 text-amber-600" />} title="Arguments adverses probables" items={evalRes.arguments_adverses} />
          </div>
          <div className="rounded-xl p-3" style={{ background: "rgba(212,175,55,0.10)" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: "#8a6d15" }}>Stratégie recommandée</p>
            <p className="text-sm text-gray-800">{evalRes.strategie_recommandee}</p>
          </div>
          {evalRes.etapes_procedure?.length ? (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">Étapes de procédure</p>
              <div className="space-y-1.5">
                {evalRes.etapes_procedure.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full text-[11px] font-bold text-white flex items-center justify-center" style={{ background: NAVY }}>{i + 1}</span>
                    <span className="font-medium text-gray-800">{e.etape}</span>
                    <span className="text-gray-400 text-xs">· {e.delai}{e.juridiction && e.juridiction !== "—" ? ` · ${e.juridiction}` : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <p className="text-xs text-gray-500">Coûts estimés : {evalRes.estimation_couts}</p>
          <SourcesBlock sources={evalRes.sources} />
        </div>
      )}

      {/* Générateur d'acte */}
      <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-3">
        <p className="font-bold text-sm" style={{ color: NAVY }}>Générer un acte</p>
        <p className="text-xs text-gray-500">Demande, défense ou amiable — les pièces sélectionnées ci-dessus et le RAG mauricien alimentent la rédaction.</p>
        {!societe && <p className="text-xs text-amber-700 flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> Sélectionnez une société pour l'en-tête de l'acte.</p>}
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs font-semibold text-gray-600">Type d'acte</label>
            <select value={acteType} onChange={(e) => setActeType(e.target.value)}
              className="mt-1 rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#D4AF37]">
              {ACTES_GROUPES.map((g) => (
                <optgroup key={g.groupe} label={g.groupe}>
                  {g.actes.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <button onClick={genererActe} disabled={!!loading || !description.trim() || !adverse.trim()}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: NAVY }}>
            {loading === "acte" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gavel className="w-4 h-4" />} Rédiger
          </button>
        </div>
        {acte && (
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800 whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed">
              {acte.corps}
            </div>
            <SourcesBlock sources={acte.sources} />
            <button onClick={downloadPdf} disabled={pdfLoading}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40" style={{ background: "rgba(212,175,55,0.16)", color: "#8a6d15" }}>
              {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Télécharger en PDF professionnel
            </button>
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400 text-center">
        Projets de travail générés par IA — à faire valider et signer par un avocat / attorney inscrit avant tout envoi ou dépôt.
      </p>
    </div>
  )
}

function SourcesBlock({ sources }: { sources?: Source[] }) {
  if (!sources || sources.length === 0) return null
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Sources verrouillées (RAG)</p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((s) => (
          <span key={s.ref} title={`${s.titre} · revu ${s.maj}`} className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-gray-200 text-gray-700">
            <span style={{ color: GOLD }}>{s.ref}</span> {s.source} {s.reference}
          </span>
        ))}
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2 border border-gray-100">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value || "—"}</p>
    </div>
  )
}

function ListCard({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-gray-100 p-3">
      <p className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1.5">{icon} {title}</p>
      <ul className="text-sm text-gray-700 space-y-1">
        {(items || []).map((it, i) => <li key={i} className="flex gap-1.5"><span className="text-gray-300">•</span>{it}</li>)}
        {(!items || items.length === 0) && <li className="text-gray-400 text-xs">—</li>}
      </ul>
    </div>
  )
}
