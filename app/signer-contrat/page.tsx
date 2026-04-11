"use client"
import { useState, useEffect } from "react"
import { CheckCircle, XCircle, FileText, Loader2, AlertTriangle } from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

type StatutPage = "chargement" | "pret" | "signe" | "deja_signe" | "erreur"

interface ContratInfo {
  id: string
  type_contrat: string
  date_debut: string
  statut: string
  employe: { prenom: string; nom: string; poste: string }
  societe: { nom: string }
}

const MOIS_FR = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"]

function formatDate(d: string): string {
  const dt = new Date(d + "T12:00:00")
  return `${dt.getDate()} ${MOIS_FR[dt.getMonth()]} ${dt.getFullYear()}`
}

export default function SignerContratPage() {
  const [statut, setStatut] = useState<StatutPage>("chargement")
  const [contrat, setContrat] = useState<ContratInfo | null>(null)
  const [erreur, setErreur] = useState("")
  const [signing, setSigning] = useState(false)
  const [checked, setChecked] = useState(false)

  const [token, setToken] = useState<string | null>(null)
  const [contractId, setContractId] = useState<string | null>(null)

  // Lire params côté client
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get("token")
    const id = params.get("id")
    setToken(t)
    setContractId(id)

    if (!t || !id) {
      setErreur("Lien invalide. Paramètres manquants.")
      setStatut("erreur")
      return
    }

    // Vérifier le token
    fetch(`/api/rh/contrats/${id}/signer?token=${t}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          if (data.error.includes("déjà signé")) {
            setStatut("deja_signe")
          } else {
            setErreur(data.error)
            setStatut("erreur")
          }
        } else {
          setContrat(data.contrat)
          setStatut("pret")
        }
      })
      .catch(() => {
        setErreur("Impossible de vérifier le contrat. Réessayez.")
        setStatut("erreur")
      })
  }, [])

  async function handleSign() {
    if (!checked || !token || !contractId) return
    setSigning(true)
    try {
      const res = await fetch(`/api/rh/contrats/${contractId}/signer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signer", token }),
      })
      const data = await res.json()
      if (data.error) {
        setErreur(data.error)
        setStatut("erreur")
      } else {
        setStatut("signe")
      }
    } catch {
      setErreur("Erreur réseau. Réessayez.")
    } finally {
      setSigning(false)
    }
  }

  // ── Chargement ──
  if (statut === "chargement") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f5f5f0" }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin" size={36} style={{ color: NAVY }} />
          <p style={{ color: NAVY, fontFamily: "serif" }}>Vérification du contrat…</p>
        </div>
      </div>
    )
  }

  // ── Déjà signé ──
  if (statut === "deja_signe") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f5f5f0" }}>
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <CheckCircle size={56} className="mx-auto mb-4" style={{ color: "#22c55e" }} />
          <h1 className="text-2xl font-bold mb-2" style={{ color: NAVY }}>Contrat déjà signé</h1>
          <p className="text-gray-500">Ce contrat a déjà été signé. Aucune action supplémentaire n'est requise.</p>
        </div>
      </div>
    )
  }

  // ── Erreur ──
  if (statut === "erreur") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f5f5f0" }}>
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <XCircle size={56} className="mx-auto mb-4" style={{ color: "#ef4444" }} />
          <h1 className="text-2xl font-bold mb-2" style={{ color: NAVY }}>Lien invalide</h1>
          <p className="text-gray-500">{erreur}</p>
          <p className="text-sm text-gray-400 mt-4">Si vous pensez qu'il s'agit d'une erreur, contactez votre responsable RH.</p>
        </div>
      </div>
    )
  }

  // ── Signé avec succès ──
  if (statut === "signe") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f5f5f0" }}>
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <CheckCircle size={64} className="mx-auto mb-4" style={{ color: "#22c55e" }} />
          <h1 className="text-2xl font-bold mb-2" style={{ color: NAVY }}>Contrat signé !</h1>
          <p className="text-gray-600 mb-2">
            Votre signature électronique a été enregistrée avec succès.
          </p>
          <p className="text-sm text-gray-400">
            La date, l'heure et votre adresse IP ont été enregistrées à titre de preuve. Un exemplaire vous sera transmis par email.
          </p>
          <div className="mt-6 p-3 rounded-lg text-xs text-gray-500" style={{ backgroundColor: "#f9f9f7", border: "1px solid #e0e0d8" }}>
            ✅ Signature conforme — Valeur juridique selon le droit mauricien (Electronic Transactions Act 2000)
          </div>
        </div>
      </div>
    )
  }

  // ── Prêt à signer ──
  const emp = contrat?.employe
  const soc = contrat?.societe

  return (
    <div className="min-h-screen py-12 px-4" style={{ backgroundColor: "#f5f5f0" }}>
      <div className="max-w-2xl mx-auto">

        {/* En-tête */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4" style={{ backgroundColor: NAVY }}>
            <FileText size={28} color="white" />
          </div>
          <h1 className="text-3xl font-bold" style={{ color: NAVY, fontFamily: "serif" }}>
            Signature de contrat
          </h1>
          <p className="text-gray-500 mt-1">Lexora RH · {soc?.nom}</p>
        </div>

        {/* Carte contrat */}
        <div className="bg-white rounded-2xl shadow-md p-8 mb-6">
          <h2 className="text-lg font-bold mb-5" style={{ color: NAVY }}>Détails du contrat</h2>

          <div className="space-y-3 text-sm">
            <Row label="Employé(e)" value={`${emp?.prenom} ${emp?.nom}`} />
            <Row label="Poste" value={emp?.poste || "—"} />
            <Row label="Employeur" value={soc?.nom || "—"} />
            <Row label="Type de contrat" value={contrat?.type_contrat || "—"} />
            <Row label="Date de début" value={contrat?.date_debut ? formatDate(contrat.date_debut) : "—"} />
          </div>

          <div className="mt-6 p-4 rounded-lg text-sm text-gray-600" style={{ backgroundColor: "#fafaf7", border: "1px solid #e8e8e0" }}>
            <AlertTriangle size={16} className="inline mr-2 text-amber-500" />
            En signant ce document, vous acceptez les termes et conditions du contrat tel qu'il vous a été communiqué.
            Cette signature électronique a la même valeur juridique qu'une signature manuscrite conformément à l'
            <strong> Electronic Transactions Act 2000 </strong> de la République de Maurice.
          </div>
        </div>

        {/* Télécharger avant signature */}
        <div className="bg-white rounded-2xl shadow-md p-6 mb-6">
          <p className="text-sm font-semibold mb-3" style={{ color: NAVY }}>📄 Consulter le contrat complet</p>
          <a
            href={`/api/rh/contrats/${contractId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-80"
            style={{ backgroundColor: NAVY }}
          >
            <FileText size={16} />
            Télécharger le PDF
          </a>
        </div>

        {/* Checkbox + bouton signature */}
        <div className="bg-white rounded-2xl shadow-md p-8">
          <label className="flex items-start gap-3 cursor-pointer mb-6">
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 cursor-pointer"
              style={{ accentColor: NAVY }}
            />
            <span className="text-sm text-gray-700">
              J'ai lu et compris le contrat dans son intégralité. Je consens à le signer électroniquement et confirme que les informations sont correctes.
            </span>
          </label>

          <button
            onClick={handleSign}
            disabled={!checked || signing}
            className="w-full py-3 rounded-xl text-white font-semibold text-base transition-all"
            style={{
              backgroundColor: checked ? GOLD : "#ccc",
              cursor: checked ? "pointer" : "not-allowed",
              color: checked ? NAVY : "#fff",
            }}
          >
            {signing ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={18} className="animate-spin" />
                Signature en cours…
              </span>
            ) : "✍️ Signer le contrat"}
          </button>

          <p className="text-xs text-center text-gray-400 mt-3">
            Votre adresse IP et l'horodatage seront enregistrés à titre de preuve.
          </p>
        </div>

      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-40 font-semibold text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-800">{value}</span>
    </div>
  )
}
