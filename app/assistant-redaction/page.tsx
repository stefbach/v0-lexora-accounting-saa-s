"use client"
import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Mail, FileText, Loader2, Copy, CheckCircle, Download, Sparkles, AlertCircle, Wand2, Scale, ArrowLeft } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { RefineChat } from "@/components/juridique/RefineChat"
import { t, getLocale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Source { ref: string; source: string; reference: string; titre: string; maj: string }

type Loc = ReturnType<typeof getLocale>

const DOMAINES = (locale: Loc) => [
  { id: 'general', label: t('samsc.red_dom_general', locale) },
  { id: 'juridique', label: t('samsc.red_dom_juridique', locale) },
  { id: 'rh', label: t('samsc.red_dom_rh', locale) },
  { id: 'fiscal', label: t('samsc.red_dom_fiscal', locale) },
  { id: 'commercial', label: t('samsc.red_dom_commercial', locale) },
  { id: 'recouvrement', label: t('samsc.red_dom_recouvrement', locale) },
]
// Valeurs de ton : libellé = valeur stockée/envoyée à l'API.
const TON_KEYS = ['samsc.red_ton_pro', 'samsc.red_ton_cordial', 'samsc.red_ton_ferme', 'samsc.red_ton_commercial', 'samsc.red_ton_diplomate', 'samsc.red_ton_direct']
const TONS = (locale: Loc) => TON_KEYS.map((k) => t(k, locale))
const LONGUEURS = (locale: Loc) => [
  { id: 'court', label: t('samsc.red_len_court', locale) },
  { id: 'moyen', label: t('samsc.red_len_moyen', locale) },
  { id: 'détaillé', label: t('samsc.red_len_detaille', locale) },
]
const LANGUES = (locale: Loc) => [
  { id: 'fr', label: t('samsc.red_lang_fr', locale) },
  { id: 'en', label: t('samsc.red_lang_en', locale) },
  { id: 'fr_en', label: t('samsc.red_lang_bilingue', locale) },
]

const EXEMPLES = (locale: Loc) => [
  t('samsc.red_ex_relance', locale),
  t('samsc.red_ex_candidat', locale),
  t('samsc.red_ex_delai', locale),
  t('samsc.red_ex_convoc', locale),
]

export default function AssistantRedactionPage() {
  const router = useRouter()
  const locale = getLocale()
  const domaines = DOMAINES(locale)
  const tons = TONS(locale)
  const longueurs = LONGUEURS(locale)
  const langues = LANGUES(locale)
  const exemples = EXEMPLES(locale)
  const [mode, setMode] = useState<'email' | 'courrier'>('email')
  const [brief, setBrief] = useState("")
  const [domaine, setDomaine] = useState('general')
  const [ton, setTon] = useState(tons[0])
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

  const readJson = async (r: Response) => { if ((r.headers.get("content-type") || "").includes("json")) return r.json(); throw new Error(t('samsc.red_err_server', locale)) }

  async function generate() {
    if (!brief.trim()) return
    setLoading(true); setError(null); setResult(""); setSources([])
    try {
      const res = await fetch("/api/redaction", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, brief, ton, longueur, langue, objet, domaine, expediteur: { nom: expNom, contact: expContact }, destinataire: { nom: destNom } }),
      })
      const d = await readJson(res)
      if (!res.ok) { setError(d.error || t('samsc.red_err_gen', locale)); return }
      setResult(d.text || ""); setSources(Array.isArray(d.sources) ? d.sources : [])
    } catch (e: any) { setError(e.message || t('samsc.red_err_network', locale)) } finally { setLoading(false) }
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
      if (!res.ok) { const d = await readJson(res).catch(() => ({})); alert(d.error || t('samsc.red_err_pdf', locale)); return }
      const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `courrier_${(objet || destNom || 'lexora').replace(/\s/g, '_').slice(0, 30)}.pdf`; a.click(); URL.revokeObjectURL(url)
    } catch (e: any) { alert(t('samsc.red_err_pdf_prefix', locale) + (e.message || "")) } finally { setPdfLoading(false) }
  }

  const field = "mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37] bg-white"
  const chip = (active: boolean) => `px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${active ? "border-transparent text-[#0B0F2E]" : "border-gray-200 text-gray-500 hover:border-gray-300"}`

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto">
          {/* En-tête */}
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={() => router.back()}
              aria-label={t('samsc.red_back', locale)}
              title={t('samsc.red_back', locale)}
              className="w-11 h-11 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-[#0B0F2E] transition-all shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: NAVY }}>
              <Wand2 className="w-5 h-5" style={{ color: GOLD }} />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: NAVY }}>{t('samsc.red_title', locale)}</h1>
              <p className="text-xs text-gray-500">{t('samsc.red_subtitle', locale)}</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-5 items-start">
            {/* Colonne saisie */}
            <div className="space-y-4">
              <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-4">
                {/* Mode */}
                <div className="flex gap-2">
                  {([['email', t('samsc.red_mode_email', locale), Mail], ['courrier', t('samsc.red_mode_courrier', locale), FileText]] as const).map(([id, lbl, Icon]) => (
                    <button key={id} onClick={() => setMode(id)} className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${mode === id ? "border-transparent text-[#0B0F2E]" : "border-gray-200 text-gray-500 hover:border-gray-300"}`} style={mode === id ? { background: "rgba(212,175,55,0.16)" } : {}}>
                      <Icon className="w-4 h-4" /> {lbl}
                    </button>
                  ))}
                </div>

                {/* Brief en vrac */}
                <div>
                  <label className="text-xs font-semibold text-gray-600">{t('samsc.red_brief_label', locale)}</label>
                  <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={5} className={`${field} resize-y`} placeholder={t('samsc.red_brief_ph', locale)} />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {exemples.map((ex) => (
                      <button key={ex} onClick={() => setBrief(ex)} className="text-[11px] px-2 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-[#D4AF37] hover:text-[#8a6d15] text-left">{ex.length > 52 ? ex.slice(0, 52) + '…' : ex}</button>
                    ))}
                  </div>
                </div>

                {/* Compétence / domaine */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5"><Scale className="w-3 h-3" /> {t('samsc.red_competence', locale)}</label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {domaines.map((d) => <button key={d.id} onClick={() => setDomaine(d.id)} className={chip(domaine === d.id)} style={domaine === d.id ? { background: "rgba(212,175,55,0.16)" } : {}}>{d.label}</button>)}
                  </div>
                </div>

                {/* Ton / longueur / langue */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600">{t('samsc.red_ton_label', locale)}</label>
                    <select value={ton} onChange={(e) => setTon(e.target.value)} className={field}>{tons.map((tn) => <option key={tn} value={tn}>{tn}</option>)}</select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600">{t('samsc.red_len_label', locale)}</label>
                    <select value={longueur} onChange={(e) => setLongueur(e.target.value)} className={field}>{longueurs.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600">{t('samsc.red_lang_label', locale)}</label>
                    <select value={langue} onChange={(e) => setLangue(e.target.value)} className={field}>{langues.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600">{t('samsc.red_objet_label', locale)}</label>
                  <input value={objet} onChange={(e) => setObjet(e.target.value)} className={field} placeholder={t('samsc.red_objet_ph', locale)} />
                </div>

                {/* Champs courrier */}
                {mode === 'courrier' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t">
                    <div><label className="text-xs font-semibold text-gray-600">{t('samsc.red_exp_label', locale)}</label><input value={expNom} onChange={(e) => setExpNom(e.target.value)} className={field} /></div>
                    <div><label className="text-xs font-semibold text-gray-600">{t('samsc.red_exp_contact_label', locale)}</label><input value={expContact} onChange={(e) => setExpContact(e.target.value)} className={field} placeholder={t('samsc.red_exp_contact_ph', locale)} /></div>
                    <div><label className="text-xs font-semibold text-gray-600">{t('samsc.red_dest_label', locale)}</label><input value={destNom} onChange={(e) => setDestNom(e.target.value)} className={field} /></div>
                    <div><label className="text-xs font-semibold text-gray-600">{t('samsc.red_dest_addr_label', locale)}</label><input value={destAddr} onChange={(e) => setDestAddr(e.target.value)} className={field} /></div>
                    <div className="sm:col-span-2"><label className="text-xs font-semibold text-gray-600">{t('samsc.red_signataire_label', locale)}</label><input value={signataire} onChange={(e) => setSignataire(e.target.value)} className={field} placeholder={t('samsc.red_signataire_ph', locale)} /></div>
                  </div>
                )}
              </div>

              <button onClick={generate} disabled={loading || !brief.trim()} className="w-full h-11 rounded-xl font-semibold inline-flex items-center justify-center disabled:opacity-50" style={{ background: NAVY, color: GOLD }}>
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('samsc.red_writing', locale)}</> : <><Sparkles className="w-4 h-4 mr-2" /> {t('samsc.red_generate', locale).replace('{what}', mode === 'email' ? t('samsc.red_the_email', locale) : t('samsc.red_the_courrier', locale))}</>}
              </button>

              <RefineChat
                text={result}
                endpoint="/api/redaction/refine"
                extraPayload={{ mode, langue }}
                onUpdate={(t) => setResult(t)}
                title={t('samsc.red_refine_title', locale)}
                placeholder={t('samsc.red_refine_ph', locale)}
              />
            </div>

            {/* Colonne résultat */}
            <div className="lg:sticky lg:top-4">
              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm min-h-[400px]">
                <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-gray-100 flex-wrap">
                  <div className="flex items-center gap-2 text-sm">
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin text-gray-400" /> <span className="text-gray-500">{t('samsc.red_generating', locale)}</span></>
                      : result ? <><CheckCircle className="w-4 h-4 text-green-500" /> <span className="text-gray-600 font-medium">{mode === 'email' ? t('samsc.red_email_ready', locale) : t('samsc.red_courrier_ready', locale)}</span></>
                      : error ? <><AlertCircle className="w-4 h-4 text-red-500" /> <span className="text-red-600">{t('samsc.red_status_error', locale)}</span></>
                      : <><Mail className="w-4 h-4 text-gray-300" /> <span className="text-gray-400">{t('samsc.red_preview', locale)}</span></>}
                  </div>
                  {result && (
                    <div className="flex gap-1.5 flex-wrap">
                      <button onClick={copy} className="inline-flex items-center text-xs px-2.5 py-1.5 rounded-lg font-semibold" style={{ background: GOLD, color: NAVY }}>{copied ? <CheckCircle className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}{copied ? t('samsc.red_copied', locale) : t('samsc.red_copy', locale)}</button>
                      {mode === 'courrier' && <button onClick={downloadPdf} disabled={pdfLoading} className="inline-flex items-center text-xs px-2.5 py-1.5 rounded-lg font-semibold" style={{ background: NAVY, color: GOLD }}>{pdfLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}PDF</button>}
                    </div>
                  )}
                </div>
                <div className="p-5">
                  {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-3"><strong>{t('samsc.red_error_prefix', locale)}</strong> {error}</div>}
                  {!result && !loading && !error && <div className="text-center py-20 text-gray-400"><Wand2 className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="text-sm">{t('samsc.red_empty_hint', locale)}</p></div>}
                  {loading && !result && <div className="space-y-2 animate-pulse">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-3 rounded bg-gray-100" style={{ width: `${70 + (i % 3) * 10}%` }} />)}</div>}
                  {result && (
                    <>
                      <div className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-gray-800 max-h-[60vh] overflow-y-auto" dangerouslySetInnerHTML={{ __html: previewHtml(result) }} />
                      {sources.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-gray-100">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5"><Scale className="w-3.5 h-3.5" style={{ color: GOLD }} /> {t('samsc.red_sources', locale)}</p>
                          <ul className="space-y-1">{sources.map((s) => <li key={s.ref} className="text-[11px] text-gray-500"><span className="font-mono text-gray-400">[{s.ref}]</span> <span className="font-medium" style={{ color: NAVY }}>{s.source} {s.reference}</span> — {s.titre}</li>)}</ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-gray-400 text-center mt-3">{t('samsc.red_ai_disclaimer', locale)}</p>
            </div>
          </div>
        </div>
      </div>
    </ClientPageShell>
  )
}
