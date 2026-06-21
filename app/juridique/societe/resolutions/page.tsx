"use client"
import React, { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Gavel, Loader2, Building2, Users, Download, Save, CheckCircle, AlertCircle, Scale, FileSignature, Copy } from "lucide-react"
import { useJuridiqueSociete } from "@/components/juridique/JuridiqueSocieteProvider"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Admin { nom: string; type?: string | null }
interface Source { ref: string; source: string; reference: string; titre: string; maj: string }
interface SocieteData { nom?: string; brn?: string; registered_office?: string; adresse?: string; capital_social?: number | null; devise_principale?: string }

function StructuredDoc({ text }: { text: string }) {
  const clean = (text || '').replace(/\r/g, '').replace(/^[═━─*]{3,}$/gm, '')
  const out: React.ReactNode[] = []
  let para: string[] = []
  const bold = (t: string, k: string) => t.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p, i) => /^\*\*[^*]+\*\*$/.test(p) ? <strong key={`${k}-${i}`} style={{ color: NAVY }}>{p.slice(2, -2)}</strong> : <React.Fragment key={`${k}-${i}`}>{p.replace(/\*/g, '')}</React.Fragment>)
  const flush = () => { if (para.length) { const j = para.join(' ').trim(); if (j) out.push(<p key={`p${out.length}`} className="text-[13px] leading-relaxed text-gray-700 text-justify mb-2">{bold(j, `p${out.length}`)}</p>); para = [] } }
  const isH = (l: string) => { const x = l.replace(/\*/g, '').trim(); return /^#{1,4}\s/.test(l) || (/r[ée]solution/i.test(x) && x.length < 60) || /^(ordre du jour|bureau|quorum|cl[ôo]ture|sources|le conseil)/i.test(x) || (x.length > 0 && x.length < 64 && x === x.toUpperCase() && /[A-ZÉÈÀ]/.test(x) && !/[.;]$/.test(x)) }
  for (const raw of clean.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) { flush(); continue }
    if (isH(line)) { flush(); out.push(<h3 key={`h${out.length}`} className="text-[13px] font-bold mt-4 mb-1.5 pb-1 border-b" style={{ color: NAVY, borderColor: "rgba(212,175,55,0.4)" }}>{line.replace(/^#{1,4}\s/, '').replace(/\*/g, '').trim()}</h3>); continue }
    const b = line.match(/^[-•]\s+(.+)$/) || line.match(/^(\d+(?:\.\d+)?)[).]\s+(.+)$/)
    if (b) { flush(); const c = b.length === 3 ? b[2] : b[1]; const m = b.length === 3 ? `${b[1]}.` : '•'; out.push(<div key={`li${out.length}`} className="flex gap-2 text-[13px] text-gray-700 mb-1 pl-1"><span style={{ color: GOLD }} className="font-semibold shrink-0">{m}</span><span className="flex-1">{bold(c, `li${out.length}`)}</span></div>); continue }
    para.push(line)
  }
  flush()
  return <div>{out}</div>
}

function fmtMUR(n?: number | null, dev = 'MUR') { return n == null ? '' : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n)} ${dev}` }

export default function ResolutionsPage() {
  const { societe } = useJuridiqueSociete()
  const [data, setData] = useState<SocieteData | null>(null)
  const [admins, setAdmins] = useState<Admin[]>([])
  const [date, setDate] = useState("")
  const [lieu, setLieu] = useState("")
  const [heure, setHeure] = useState("10:00")
  const [president, setPresident] = useState("")
  const [secretaire, setSecretaire] = useState("")
  const [ordre, setOrdre] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState("")
  const [sources, setSources] = useState<Source[]>([])
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!societe?.id) return
    const res = await fetch(`/api/juridique/societe/data?societe_id=${societe.id}`)
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      setData(d.societe); setAdmins(d.administrateurs || [])
      setLieu(d.societe?.registered_office || d.societe?.adresse || "Port-Louis")
      if (d.administrateurs?.[0]?.nom) setPresident(d.administrateurs[0].nom)
    }
  }, [societe?.id])
  useEffect(() => { load() }, [load])

  function body(extra: Record<string, unknown> = {}) {
    return { societe_id: societe?.id, type: 'ca', societe_nom: data?.nom || societe?.nom, date, lieu, heure, president, secretaire, ordre_du_jour: ordre, administrateurs: admins, capital: data?.capital_social != null ? fmtMUR(data.capital_social, data?.devise_principale) : undefined, ...extra }
  }
  const readJson = async (r: Response) => { if ((r.headers.get("content-type") || "").includes("json")) return r.json(); throw new Error("Réponse serveur inattendue.") }

  async function generate() {
    if (!societe?.id) return
    setLoading(true); setError(null); setResult(""); setSources([]); setSaved(false)
    try {
      const r = await fetch("/api/juridique/societe/pv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body()) })
      const d = await readJson(r); if (!r.ok) { setError(d.error || "Erreur"); return }
      setResult(d.text || ""); setSources(d.sources || [])
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }
  async function save() {
    setSaving(true)
    try { const r = await fetch("/api/juridique/societe/pv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body({ save_to_db: true })) }); const d = await readJson(r); if (!r.ok) { alert(d.error); return } setSaved(true) }
    catch (e: any) { alert(e.message) } finally { setSaving(false) }
  }
  async function pdf() {
    setPdfLoading(true)
    try {
      const r = await fetch("/api/juridique/societe/pv/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ societe: { nom: data?.nom || societe?.nom, brn: data?.brn, adresse: data?.registered_office || data?.adresse, capital: data?.capital_social != null ? fmtMUR(data.capital_social, data?.devise_principale) : undefined }, titre: "Procès-verbal de réunion du Conseil d'administration", sousTitre: data?.nom || societe?.nom, date, lieu, heure, president, secretaire, corps: result, sources }) })
      if (!r.ok) { const d = await readJson(r).catch(() => ({})); alert(d.error || "Erreur PDF"); return }
      const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `pv_conseil_${(data?.nom || 'societe').replace(/\s/g, '_')}.pdf`; a.click(); URL.revokeObjectURL(url)
    } catch (e: any) { alert("Erreur PDF " + (e.message || "")) } finally { setPdfLoading(false) }
  }

  const input = "mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]"

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/juridique/societe" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#0B0F2E]"><ArrowLeft className="w-4 h-4" /> Vie de la société</Link>
        <div className="h-4 w-px bg-gray-200" /><Gavel className="w-5 h-5" style={{ color: NAVY }} />
        <h1 className="text-lg font-bold" style={{ color: NAVY }}>Résolutions du conseil</h1>
      </div>
      {!societe ? (
        <div className="rounded-2xl bg-white border border-gray-100 p-8 text-center text-sm text-gray-500"><Building2 className="w-6 h-6 mx-auto mb-2 text-gray-300" /> Sélectionnez une société.</div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5 items-start">
          <div className="space-y-4">
            <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-semibold text-gray-600">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} /></div>
                <div><label className="text-xs font-semibold text-gray-600">Heure</label><input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} className={input} /></div>
                <div className="col-span-2"><label className="text-xs font-semibold text-gray-600">Lieu</label><input value={lieu} onChange={(e) => setLieu(e.target.value)} className={input} /></div>
                <div><label className="text-xs font-semibold text-gray-600">Président</label><input value={president} onChange={(e) => setPresident(e.target.value)} className={input} /></div>
                <div><label className="text-xs font-semibold text-gray-600">Secrétaire</label><input value={secretaire} onChange={(e) => setSecretaire(e.target.value)} className={input} /></div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Décisions / ordre du jour</label>
                <div className="flex flex-wrap gap-1.5 my-2">
                  {[
                    "Nomination d'un nouvel administrateur",
                    "Révocation d'un dirigeant",
                    "Distribution d'un dividende",
                    "Ouverture d'un compte bancaire",
                    "Changement de siège social",
                    "Approbation d'une convention réglementée",
                    "Octroi de pouvoirs / signature autorisée",
                  ].map((d) => (
                    <button key={d} type="button" onClick={() => setOrdre((o) => (o ? `${o}\n${d}` : d))}
                      className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-[#D4AF37] hover:text-[#8a6d15] transition-colors">
                      + {d}
                    </button>
                  ))}
                </div>
                <textarea value={ordre} onChange={(e) => setOrdre(e.target.value)} rows={5} className={`${input} resize-y`} placeholder="Ex. Nomination de M. X comme directeur, Distribution d'un dividende de MUR…, Ouverture d'un compte bancaire auprès de…, Approbation d'une convention réglementée…" />
              </div>
            </div>
            <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5 mb-2"><Users className="w-3.5 h-3.5" /> Administrateurs ({admins.length})</p>
              {admins.length === 0 ? <p className="text-xs text-gray-400">Aucun administrateur enregistré.</p> : (
                <div className="flex flex-wrap gap-1.5">{admins.map((a, i) => <span key={i} className="text-[11px] px-2 py-1 rounded-full text-gray-600" style={{ background: "rgba(11,15,46,0.05)" }}>{a.nom}{a.type ? ` · ${a.type}` : ''}</span>)}</div>
              )}
            </div>
            <button onClick={generate} disabled={loading} className="w-full h-11 rounded-xl font-semibold inline-flex items-center justify-center disabled:opacity-50" style={{ background: NAVY, color: GOLD }}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Rédaction…</> : <><FileSignature className="w-4 h-4 mr-2" /> Générer le PV de conseil</>}
            </button>
          </div>
          <div className="lg:sticky lg:top-4">
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm min-h-[400px]">
              <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-gray-100 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin text-gray-400" /> <span className="text-gray-500">Génération…</span></> : result ? <><CheckCircle className="w-4 h-4 text-green-500" /> <span className="text-gray-600 font-medium">Procès-verbal</span></> : error ? <><AlertCircle className="w-4 h-4 text-red-500" /> <span className="text-red-600">Erreur</span></> : <><Gavel className="w-4 h-4 text-gray-300" /> <span className="text-gray-400">Aperçu</span></>}
                </div>
                {result && (<div className="flex gap-1.5 flex-wrap">
                  <button onClick={() => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 1500) }} className="inline-flex items-center text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600">{copied ? <CheckCircle className="w-3.5 h-3.5 mr-1 text-green-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}{copied ? "Copié" : "Copier"}</button>
                  <button onClick={pdf} disabled={pdfLoading} className="inline-flex items-center text-xs px-2.5 py-1.5 rounded-lg font-semibold" style={{ background: GOLD, color: NAVY }}>{pdfLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}PDF</button>
                  <button onClick={save} disabled={saving} className="inline-flex items-center text-xs px-2.5 py-1.5 rounded-lg font-semibold" style={{ background: NAVY, color: GOLD }}>{saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}Sauver</button>
                </div>)}
              </div>
              <div className="p-5">
                {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-3"><strong>Erreur :</strong> {error}</div>}
                {saved && <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 flex items-center gap-2 mb-3"><CheckCircle className="w-4 h-4" /> PV enregistré.</div>}
                {!result && !loading && !error && <div className="text-center py-20 text-gray-400"><Gavel className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="text-sm">Saisissez les décisions puis générez le PV.</p></div>}
                {loading && !result && <div className="space-y-2 animate-pulse">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-3 rounded bg-gray-100" style={{ width: `${65 + (i % 4) * 9}%` }} />)}</div>}
                {result && (<div className="max-h-[68vh] overflow-y-auto pr-1"><StructuredDoc text={result} />
                  {sources.length > 0 && (<div className="mt-5 pt-3 border-t border-gray-100"><p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5"><Scale className="w-3.5 h-3.5" style={{ color: GOLD }} /> Sources juridiques citées</p><ul className="space-y-1">{sources.map((src) => <li key={src.ref} className="text-[11px] text-gray-500"><span className="font-mono text-gray-400">[{src.ref}]</span> <span className="font-medium" style={{ color: NAVY }}>{src.source} {src.reference}</span> — {src.titre}</li>)}</ul></div>)}
                </div>)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
