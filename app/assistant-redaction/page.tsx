"use client"
import React, { useEffect, useState } from "react"
import { Mail, FileText, Loader2, Copy, CheckCircle, Download, Sparkles, AlertCircle, Wand2, Scale } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { RefineChat } from "@/components/juridique/RefineChat"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Source { ref: string; source: string; reference: string; titre: string; maj: string }

const DOMAINES = [
  { id: 'general', label: 'Général' },
  { id: 'juridique', label: 'Juridique' },
  { id: 'rh', label: 'RH & social' },
  { id: 'fiscal', label: 'Fiscal & compta' },
  { id: 'commercial', label: 'Commercial' },
  { id: 'recouvrement', label: 'Recouvrement' },
]
const TONS = ['Professionnel & courtois', 'Cordial', 'Ferme', 'Commercial', 'Diplomate', 'Direct']
const LONGUEURS = [{ id: 'court', label: 'Court' }, { id: 'moyen', label: 'Moyen' }, { id: 'détaillé', label: 'Détaillé' }]
const LANGUES = [{ id: 'fr', label: 'Français' }, { id: 'en', label: 'English' }, { id: 'fr_en', label: 'Bilingue' }]

const EXEMPLES = [
  "Relancer un client qui n'a pas payé une facture de 85 000 MUR depuis 2 mois, rester ferme mais courtois",
  "Répondre à un candidat pour décliner sa candidature poliment",
  "Demander un délai de paiement à un fournisseur pour 3 semaines",
  "Convoquer un salarié à un entretien disciplinaire suite à des retards répétés",
]

export default function AssistantRedactionPage() {
  const [mode, setMode] = useState<'email' | 'courrier'>('email')
  const [brief, setBrief] = useState("")
  const [domaine, setDomaine] = useState('general')
  const [ton, setTon] = useState(TONS[0])
  const [longueur, setLongueur] = useState('moyen')
  const [langue, setLangue] = useState('fr')
  const [objet, setObjet] = useState("")
  const [expNom, setExpNom] = useState("")
  const [expContact, setExpContact] = useState("")
  const [destNom, setDestNom] = useState("")
  const [destAddr, setDestAddr] = useState("")
  const [signataire, setSignataire] = useState("")

  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState("")
  const [sources, setSources] = useState<Source[]>([])
  const [copied, setCopied] = useState(false)

  // Préremplit l'expéditeur avec la première société accessible.
  useEffect(() => {
    Promise.all([
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const s = (d1.societes || [])[0] || (d2.societes || [])[0]
      if (s) { setExpNom(s.nom || ""); setExpContact(s.email || "") }
    })
  }, [])

  const readJson = async (r: Response) => { if ((r.headers.get("content-type") || "").includes("json")) return r.json(); throw new Error("Réponse serveur inattendue.") }

  async function generate() {
    if (!brief.trim()) return
    setLoading(true); setError(null); setResult(""); setSources([])
    try {
      const res = await fetch("/api/redaction", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, brief, ton, longueur, langue, objet, domaine, expediteur: { nom: expNom, contact: expContact }, destinataire: { nom: destNom } }),
      })
      const d = await readJson(res)
      if (!res.ok) { setError(d.error || "Erreur de génération"); return }
      setResult(d.text || ""); setSources(Array.isArray(d.sources) ? d.sources : [])
    } catch (e: any) { setError(e.message || "Erreur réseau") } finally { setLoading(false) }
  }

  // Conversion markdown léger → rendu/collage. Le **gras** devient du vrai
  // gras (HTML), et le texte brut copié ne contient plus d'astérisques.
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const toBoldHtml = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>")
  const previewHtml = (t: string) => toBoldHtml(t) // les retours à la ligne sont gérés par white-space: pre-wrap
  const toPlain = (t: string) => t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*\n]+)\*/g, "$1")

  async function copy() {
    if (!result) return
    const plain = toPlain(result)
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;white-space:pre-wrap">${toBoldHtml(result).replace(/\n/g, "<br>")}</div>`
    try {
      if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        })])
      } else {
        await navigator.clipboard.writeText(plain)
      }
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    } catch {
      try { await navigator.clipboard.writeText(plain); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* noop */ }
    }
  }

  async function downloadPdf() {
    if (!result) return
    setPdfLoading(true)
    try {
      const res = await fetch("/api/redaction/pdf", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expediteur: { nom: expNom, contact: expContact }, destinataire: { nom: destNom, adresse: destAddr }, objet, corps: result, signataire: signataire || expNom }),
      })
      if (!res.ok) { const d = await readJson(res).catch(() => ({})); alert(d.error || "Erreur PDF"); return }
      const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `courrier_${(objet || destNom || 'lexora').replace(/\s/g, '_').slice(0, 30)}.pdf`; a.click(); URL.revokeObjectURL(url)
    } catch (e: any) { alert("Erreur PDF " + (e.message || "")) } finally { setPdfLoading(false) }
  }

  const field = "mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37] bg-white"
  const chip = (active: boolean) => `px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${active ? "border-transparent text-[#0B0F2E]" : "border-gray-200 text-gray-500 hover:border-gray-300"}`

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto">
          {/* En-tête */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: NAVY }}>
              <Wand2 className="w-5 h-5" style={{ color: GOLD }} />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: NAVY }}>Assistant de rédaction</h1>
              <p className="text-xs text-gray-500">Écrivez en vrac, obtenez un email ou un courrier professionnel — prêt à copier-coller ou à exporter en PDF.</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-5 items-start">
            {/* Colonne saisie */}
            <div className="space-y-4">
              <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-4">
                {/* Mode */}
                <div className="flex gap-2">
                  {([['email', 'Email', Mail], ['courrier', 'Courrier (PDF)', FileText]] as const).map(([id, lbl, Icon]) => (
                    <button key={id} onClick={() => setMode(id)} className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${mode === id ? "border-transparent text-[#0B0F2E]" : "border-gray-200 text-gray-500 hover:border-gray-300"}`} style={mode === id ? { background: "rgba(212,175,55,0.16)" } : {}}>
                      <Icon className="w-4 h-4" /> {lbl}
                    </button>
                  ))}
                </div>

                {/* Brief en vrac */}
                <div>
                  <label className="text-xs font-semibold text-gray-600">Votre demande (écrivez en vrac)</label>
                  <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={5} className={`${field} resize-y`} placeholder="Ex. relancer le client Acme qui n'a pas payé la facture 1234 de 85 000 MUR depuis 2 mois, rester poli mais ferme, proposer un échéancier…" />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {EXEMPLES.map((ex) => (
                      <button key={ex} onClick={() => setBrief(ex)} className="text-[11px] px-2 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-[#D4AF37] hover:text-[#8a6d15] text-left">{ex.length > 52 ? ex.slice(0, 52) + '…' : ex}</button>
                    ))}
                  </div>
                </div>

                {/* Compétence / domaine */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5"><Scale className="w-3 h-3" /> Compétence mobilisée (sources du SaaS)</label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {DOMAINES.map((d) => <button key={d.id} onClick={() => setDomaine(d.id)} className={chip(domaine === d.id)} style={domaine === d.id ? { background: "rgba(212,175,55,0.16)" } : {}}>{d.label}</button>)}
                  </div>
                </div>

                {/* Ton / longueur / langue */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600">Ton</label>
                    <select value={ton} onChange={(e) => setTon(e.target.value)} className={field}>{TONS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600">Longueur</label>
                    <select value={longueur} onChange={(e) => setLongueur(e.target.value)} className={field}>{LONGUEURS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600">Langue</label>
                    <select value={langue} onChange={(e) => setLangue(e.target.value)} className={field}>{LANGUES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600">Objet (optionnel)</label>
                  <input value={objet} onChange={(e) => setObjet(e.target.value)} className={field} placeholder="Laisser vide pour le déduire automatiquement" />
                </div>

                {/* Champs courrier */}
                {mode === 'courrier' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t">
                    <div><label className="text-xs font-semibold text-gray-600">Expéditeur</label><input value={expNom} onChange={(e) => setExpNom(e.target.value)} className={field} /></div>
                    <div><label className="text-xs font-semibold text-gray-600">Coordonnées expéditeur</label><input value={expContact} onChange={(e) => setExpContact(e.target.value)} className={field} placeholder="email · tél · adresse" /></div>
                    <div><label className="text-xs font-semibold text-gray-600">Destinataire</label><input value={destNom} onChange={(e) => setDestNom(e.target.value)} className={field} /></div>
                    <div><label className="text-xs font-semibold text-gray-600">Adresse destinataire</label><input value={destAddr} onChange={(e) => setDestAddr(e.target.value)} className={field} /></div>
                    <div className="sm:col-span-2"><label className="text-xs font-semibold text-gray-600">Signataire</label><input value={signataire} onChange={(e) => setSignataire(e.target.value)} className={field} placeholder="Nom, qualité (défaut : expéditeur)" /></div>
                  </div>
                )}
              </div>

              <button onClick={generate} disabled={loading || !brief.trim()} className="w-full h-11 rounded-xl font-semibold inline-flex items-center justify-center disabled:opacity-50" style={{ background: NAVY, color: GOLD }}>
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Rédaction…</> : <><Sparkles className="w-4 h-4 mr-2" /> Générer {mode === 'email' ? "l'email" : "le courrier"}</>}
              </button>

              <RefineChat
                text={result}
                endpoint="/api/redaction/refine"
                extraPayload={{ mode, langue }}
                onUpdate={(t) => setResult(t)}
                title="Affiner le texte"
                placeholder="Ex. Rends-le plus court · Plus ferme · Ajoute une échéance au 30 du mois · Traduis en anglais…"
              />
            </div>

            {/* Colonne résultat */}
            <div className="lg:sticky lg:top-4">
              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm min-h-[400px]">
                <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-gray-100 flex-wrap">
                  <div className="flex items-center gap-2 text-sm">
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin text-gray-400" /> <span className="text-gray-500">Génération…</span></>
                      : result ? <><CheckCircle className="w-4 h-4 text-green-500" /> <span className="text-gray-600 font-medium">{mode === 'email' ? 'Email' : 'Courrier'} prêt</span></>
                      : error ? <><AlertCircle className="w-4 h-4 text-red-500" /> <span className="text-red-600">Erreur</span></>
                      : <><Mail className="w-4 h-4 text-gray-300" /> <span className="text-gray-400">Aperçu</span></>}
                  </div>
                  {result && (
                    <div className="flex gap-1.5 flex-wrap">
                      <button onClick={copy} className="inline-flex items-center text-xs px-2.5 py-1.5 rounded-lg font-semibold" style={{ background: GOLD, color: NAVY }}>{copied ? <CheckCircle className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}{copied ? "Copié" : "Copier"}</button>
                      {mode === 'courrier' && <button onClick={downloadPdf} disabled={pdfLoading} className="inline-flex items-center text-xs px-2.5 py-1.5 rounded-lg font-semibold" style={{ background: NAVY, color: GOLD }}>{pdfLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}PDF</button>}
                    </div>
                  )}
                </div>
                <div className="p-5">
                  {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-3"><strong>Erreur :</strong> {error}</div>}
                  {!result && !loading && !error && <div className="text-center py-20 text-gray-400"><Wand2 className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="text-sm">Décrivez votre demande puis cliquez sur « Générer ».</p></div>}
                  {loading && !result && <div className="space-y-2 animate-pulse">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-3 rounded bg-gray-100" style={{ width: `${70 + (i % 3) * 10}%` }} />)}</div>}
                  {result && (
                    <>
                      <div className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-gray-800 max-h-[60vh] overflow-y-auto" dangerouslySetInnerHTML={{ __html: previewHtml(result) }} />
                      {sources.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-gray-100">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5"><Scale className="w-3.5 h-3.5" style={{ color: GOLD }} /> Sources mobilisées</p>
                          <ul className="space-y-1">{sources.map((s) => <li key={s.ref} className="text-[11px] text-gray-500"><span className="font-mono text-gray-400">[{s.ref}]</span> <span className="font-medium" style={{ color: NAVY }}>{s.source} {s.reference}</span> — {s.titre}</li>)}</ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-gray-400 text-center mt-3">Brouillon généré par IA — relisez avant envoi.</p>
            </div>
          </div>
        </div>
      </div>
    </ClientPageShell>
  )
}
