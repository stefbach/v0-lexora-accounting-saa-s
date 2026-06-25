"use client"
import React, { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Landmark, Loader2, Building2, Users, Download, Save, CheckCircle, AlertCircle, Scale, FileSignature, Copy } from "lucide-react"
import { useJuridiqueSociete } from "@/components/juridique/JuridiqueSocieteProvider"
import { RefineChat } from "@/components/juridique/RefineChat"
import { t, getLocale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Associe { nom: string; pourcentage?: number | null; nb_actions?: number | null }
interface Admin { nom: string; type?: string | null }
interface SocieteData {
  nom?: string; brn?: string; registered_office?: string; adresse?: string; capital_social?: number | null
  devise_principale?: string; date_fin_exercice?: string; nb_actions_total?: number | null
}
interface Source { ref: string; source: string; reference: string; titre: string; maj: string }

function StructuredDoc({ text }: { text: string }) {
  const clean = (text || '').replace(/\r/g, '').replace(/^[═━─*]{3,}$/gm, '')
  const lines = clean.split('\n')
  const out: React.ReactNode[] = []
  let para: string[] = []
  const bold = (t: string, k: string) => t.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p, i) => /^\*\*[^*]+\*\*$/.test(p) ? <strong key={`${k}-${i}`} style={{ color: NAVY }}>{p.slice(2, -2)}</strong> : <React.Fragment key={`${k}-${i}`}>{p.replace(/\*/g, '')}</React.Fragment>)
  const flush = () => { if (para.length) { const j = para.join(' ').trim(); if (j) out.push(<p key={`p${out.length}`} className="text-[13px] leading-relaxed text-gray-700 text-justify mb-2">{bold(j, `p${out.length}`)}</p>); para = [] } }
  const isH = (l: string) => { const s = l.replace(/\*/g, '').trim(); return /^#{1,4}\s/.test(l) || /r[ée]solution/i.test(s) && s.length < 60 || /^(ordre du jour|bureau|quorum|cl[ôo]ture|sources|l'an\b|le\b.*\bs'est r[ée]unie)/i.test(s) || (s.length > 0 && s.length < 64 && s === s.toUpperCase() && /[A-ZÉÈÀ]/.test(s) && !/[.;]$/.test(s)) }
  for (const raw of lines) {
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

function fmtMUR(n?: number | null, dev = 'MUR') {
  if (n == null) return ''
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n)} ${dev}`
}

export default function AssembleesPage() {
  const locale = getLocale()
  const { societe } = useJuridiqueSociete()
  const [data, setData] = useState<SocieteData | null>(null)
  const [associes, setAssocies] = useState<Associe[]>([])
  const [admins, setAdmins] = useState<Admin[]>([])
  const [loadingData, setLoadingData] = useState(false)

  const [type, setType] = useState<'ago' | 'age'>('ago')
  const [date, setDate] = useState("")
  const [lieu, setLieu] = useState("")
  const [heure, setHeure] = useState("10:00")
  const [exercice, setExercice] = useState("")
  const [president, setPresident] = useState("")
  const [secretaire, setSecretaire] = useState("")
  const [resultat, setResultat] = useState("")
  const [dividendes, setDividendes] = useState("")
  const [affectation, setAffectation] = useState(t('jurs.ag.affectationDefault', locale))
  const [ordre, setOrdre] = useState("")

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState("")
  const [sources, setSources] = useState<Source[]>([])
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const loadData = useCallback(async () => {
    if (!societe?.id) return
    setLoadingData(true)
    try {
      const res = await fetch(`/api/juridique/societe/data?societe_id=${societe.id}`)
      const d = await res.json()
      if (res.ok) {
        setData(d.societe)
        setAssocies(d.associes || [])
        setAdmins(d.administrateurs || [])
        setLieu(d.societe?.registered_office || d.societe?.adresse || "Port-Louis")
        if (d.societe?.date_fin_exercice) setExercice(`${t('jurs.ag.closPrefix', locale)} ${new Date(d.societe.date_fin_exercice).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR')}`)
        if (d.administrateurs?.[0]?.nom) setPresident(d.administrateurs[0].nom)
        if (d.financials?.disponible) setResultat(fmtMUR(d.financials.resultat, d.societe?.devise_principale || 'MUR'))
      }
    } finally { setLoadingData(false) }
  }, [societe?.id])

  useEffect(() => { loadData() }, [loadData])

  function buildBody(extra: Record<string, unknown> = {}) {
    return {
      societe_id: societe?.id, type, societe_nom: data?.nom || societe?.nom,
      date, lieu, heure, exercice, president, secretaire,
      resultat, dividendes, affectation, ordre_du_jour: ordre,
      associes, administrateurs: admins,
      capital: data?.capital_social != null ? fmtMUR(data.capital_social, data?.devise_principale || 'MUR') : undefined,
      ...extra,
    }
  }

  const readJsonSafe = async (res: Response) => {
    const ct = res.headers.get("content-type") || ""
    if (ct.includes("application/json")) return res.json()
    throw new Error(t('jurs.ag.serverError', locale))
  }

  async function generate() {
    if (!societe?.id) return
    setLoading(true); setError(null); setResult(""); setSources([]); setSaved(false)
    try {
      const res = await fetch("/api/juridique/societe/pv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildBody()) })
      const d = await readJsonSafe(res)
      if (!res.ok) { setError(d.error || t('jurs.ag.genError', locale)); return }
      setResult(d.text || ""); setSources(Array.isArray(d.sources) ? d.sources : [])
    } catch (e: any) { setError(e.message || t('jurs.ag.netError', locale)) } finally { setLoading(false) }
  }

  async function save() {
    if (!result || !societe?.id) return
    setSaving(true)
    try {
      const res = await fetch("/api/juridique/societe/pv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildBody({ save_to_db: true })) })
      const d = await readJsonSafe(res)
      if (!res.ok) { alert(d.error || t('jurs.error', locale)); return }
      setSaved(true)
    } catch (e: any) { alert(e.message) } finally { setSaving(false) }
  }

  async function downloadPdf() {
    if (!result) return
    setPdfLoading(true)
    try {
      const res = await fetch("/api/juridique/societe/pv/pdf", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe: { nom: data?.nom || societe?.nom, brn: data?.brn, adresse: data?.registered_office || data?.adresse, capital: data?.capital_social != null ? fmtMUR(data.capital_social, data?.devise_principale || 'MUR') : undefined },
          titre: type === 'ago' ? t('jurs.ag.pdfTitleAgo', locale) : t('jurs.ag.pdfTitleAge', locale),
          sousTitre: data?.nom || societe?.nom, date, lieu, heure, exercice, president, secretaire,
          corps: result, sources,
        }),
      })
      if (!res.ok) { const d = await readJsonSafe(res).catch(() => ({})); alert(d.error || t('jurs.ag.pdfError', locale)); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `pv_${type}_${(data?.nom || 'societe').replace(/\s/g, '_')}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { alert(t('jurs.ag.pdfError', locale) + " " + (e.message || "")) } finally { setPdfLoading(false) }
  }

  const input = "mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]"

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/juridique/societe" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#0B0F2E]"><ArrowLeft className="w-4 h-4" /> {t('jurs.back', locale)}</Link>
        <div className="h-4 w-px bg-gray-200" />
        <Landmark className="w-5 h-5" style={{ color: NAVY }} />
        <h1 className="text-lg font-bold" style={{ color: NAVY }}>{t('jurs.ag.title', locale)}</h1>
        {loadingData && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>

      {!societe ? (
        <div className="rounded-2xl bg-white border border-gray-100 p-8 text-center text-sm text-gray-500">
          <Building2 className="w-6 h-6 mx-auto mb-2 text-gray-300" /> {t('jurs.selectSociete', locale)}
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5 items-start">
          {/* Formulaire */}
          <div className="space-y-4">
            <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-4">
              <div className="flex gap-2">
                {([['ago', t('jurs.ag.tab.ago', locale)], ['age', t('jurs.ag.tab.age', locale)]] as const).map(([id, lbl]) => (
                  <button key={id} onClick={() => setType(id)} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${type === id ? "border-transparent text-[#0B0F2E]" : "border-gray-200 text-gray-500 hover:border-gray-300"}`} style={type === id ? { background: "rgba(212,175,55,0.16)" } : {}}>{lbl}</button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-semibold text-gray-600">{t('jurs.ag.date', locale)}</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} /></div>
                <div><label className="text-xs font-semibold text-gray-600">{t('jurs.ag.heure', locale)}</label><input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} className={input} /></div>
                <div className="col-span-2"><label className="text-xs font-semibold text-gray-600">{t('jurs.ag.lieu', locale)}</label><input value={lieu} onChange={(e) => setLieu(e.target.value)} className={input} /></div>
                <div className="col-span-2"><label className="text-xs font-semibold text-gray-600">{t('jurs.ag.exercice', locale)}</label><input value={exercice} onChange={(e) => setExercice(e.target.value)} placeholder={t('jurs.ag.exercicePlaceholder', locale)} className={input} /></div>
                <div><label className="text-xs font-semibold text-gray-600">{t('jurs.ag.president', locale)}</label><input value={president} onChange={(e) => setPresident(e.target.value)} className={input} /></div>
                <div><label className="text-xs font-semibold text-gray-600">{t('jurs.ag.secretaire', locale)}</label><input value={secretaire} onChange={(e) => setSecretaire(e.target.value)} className={input} /></div>
              </div>

              {type === 'ago' && (
                <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                  <div className="col-span-2 flex items-center gap-1.5 text-[11px] text-gray-400"><Scale className="w-3 h-3" /> {t('jurs.ag.figuresHint', locale)}</div>
                  <div><label className="text-xs font-semibold text-gray-600">{t('jurs.ag.resultat', locale)}</label><input value={resultat} onChange={(e) => setResultat(e.target.value)} className={input} /></div>
                  <div><label className="text-xs font-semibold text-gray-600">{t('jurs.ag.dividendes', locale)}</label><input value={dividendes} onChange={(e) => setDividendes(e.target.value)} placeholder={t('jurs.ag.dividendesPlaceholder', locale)} className={input} /></div>
                  <div className="col-span-2"><label className="text-xs font-semibold text-gray-600">{t('jurs.ag.affectation', locale)}</label><input value={affectation} onChange={(e) => setAffectation(e.target.value)} className={input} /></div>
                </div>
              )}

              <div className="pt-3 border-t">
                <label className="text-xs font-semibold text-gray-600">{type === 'ago' ? t('jurs.ag.ordreLabelAgo', locale) : t('jurs.ag.ordreLabelAge', locale)}</label>
                {type === 'age' && (
                  <div className="flex flex-wrap gap-1.5 my-2">
                    {[
                      t('jurs.ag.opt.augmentationCapital', locale),
                      t('jurs.ag.opt.reductionCapital', locale),
                      t('jurs.ag.opt.modifObjet', locale),
                      t('jurs.ag.opt.transfertSiege', locale),
                      t('jurs.ag.opt.changementDenomination', locale),
                      t('jurs.ag.opt.modifStatuts', locale),
                      t('jurs.ag.opt.dissolution', locale),
                    ].map((d) => (
                      <button key={d} type="button" onClick={() => setOrdre((o) => (o ? `${o}\n${d}` : d))}
                        className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-[#D4AF37] hover:text-[#8a6d15] transition-colors">
                        + {d}
                      </button>
                    ))}
                  </div>
                )}
                <textarea value={ordre} onChange={(e) => setOrdre(e.target.value)} rows={type === 'age' ? 5 : 3} className={`${input} resize-y`} placeholder={type === 'ago' ? t('jurs.ag.ordrePlaceholderAgo', locale) : t('jurs.ag.ordrePlaceholderAge', locale)} />
              </div>
            </div>

            {/* Données récupérées */}
            <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {t('jurs.ag.parties', locale).replace('{assoc}', String(associes.length)).replace('{admins}', String(admins.length))}</p>
              {associes.length === 0 && admins.length === 0 ? (
                <p className="text-xs text-gray-400">{t('jurs.ag.noParties', locale)}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {associes.map((a, i) => <span key={`a${i}`} className="text-[11px] px-2 py-1 rounded-full bg-gray-50 border border-gray-100 text-gray-600">{a.nom}{a.pourcentage != null ? ` · ${a.pourcentage}%` : ''}</span>)}
                  {admins.map((a, i) => <span key={`d${i}`} className="text-[11px] px-2 py-1 rounded-full text-gray-600" style={{ background: "rgba(11,15,46,0.05)" }}>{a.nom}{a.type ? ` · ${a.type}` : ''}</span>)}
                </div>
              )}
            </div>

            <button onClick={generate} disabled={loading} className="w-full h-11 rounded-xl font-semibold inline-flex items-center justify-center disabled:opacity-50" style={{ background: NAVY, color: GOLD }}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('jurs.ag.generating', locale)}</> : <><FileSignature className="w-4 h-4 mr-2" /> {t('jurs.ag.generate', locale)}</>}
            </button>
          </div>

          {/* Aperçu */}
          <div className="lg:sticky lg:top-4">
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm min-h-[400px]">
              <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-gray-100 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin text-gray-400" /> <span className="text-gray-500">{t('jurs.generating', locale)}</span></>
                    : result ? <><CheckCircle className="w-4 h-4 text-green-500" /> <span className="text-gray-600 font-medium">{t('jurs.ag.pvLabel', locale)}</span></>
                    : error ? <><AlertCircle className="w-4 h-4 text-red-500" /> <span className="text-red-600">{t('jurs.error', locale)}</span></>
                    : <><Landmark className="w-4 h-4 text-gray-300" /> <span className="text-gray-400">{t('jurs.preview', locale)}</span></>}
                </div>
                {result && (
                  <div className="flex gap-1.5 flex-wrap">
                    <button onClick={() => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 1500) }} className="inline-flex items-center text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600">{copied ? <CheckCircle className="w-3.5 h-3.5 mr-1 text-green-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}{copied ? t('jurs.copied', locale) : t('jurs.copy', locale)}</button>
                    <button onClick={downloadPdf} disabled={pdfLoading} className="inline-flex items-center text-xs px-2.5 py-1.5 rounded-lg font-semibold" style={{ background: GOLD, color: NAVY }}>{pdfLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}PDF</button>
                    <button onClick={save} disabled={saving} className="inline-flex items-center text-xs px-2.5 py-1.5 rounded-lg font-semibold" style={{ background: NAVY, color: GOLD }}>{saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}{t('jurs.save', locale)}</button>
                  </div>
                )}
              </div>
              <div className="p-5">
                {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-3"><strong>{t('jurs.errorLabel', locale)}</strong> {error}</div>}
                {saved && <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 flex items-center gap-2 mb-3"><CheckCircle className="w-4 h-4" /> {t('jurs.ag.saved', locale)}</div>}
                {!result && !loading && !error && <div className="text-center py-20 text-gray-400"><Landmark className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="text-sm">{t('jurs.ag.previewEmpty', locale)}</p></div>}
                {loading && !result && <div className="space-y-2 animate-pulse">{Array.from({ length: 9 }).map((_, i) => <div key={i} className="h-3 rounded bg-gray-100" style={{ width: `${65 + (i % 4) * 9}%` }} />)}</div>}
                {result && (
                  <div className="max-h-[68vh] overflow-y-auto pr-1">
                    <StructuredDoc text={result} />
                    {sources.length > 0 && (
                      <div className="mt-5 pt-3 border-t border-gray-100">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5"><Scale className="w-3.5 h-3.5" style={{ color: GOLD }} /> {t('jurs.sourcesTitle', locale)}</p>
                        <ul className="space-y-1">
                          {sources.map((src) => <li key={src.ref} className="text-[11px] text-gray-500"><span className="font-mono text-gray-400">[{src.ref}]</span> <span className="font-medium" style={{ color: NAVY }}>{src.source} {src.reference}</span> — {src.titre} <span className="text-gray-400">({src.maj})</span></li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4">
              <RefineChat text={result} domaines={['societes', 'commercial']} onUpdate={(tx, s) => { setResult(tx); if (s.length) setSources(s); setSaved(false) }} placeholder={t('jurs.ag.refinePlaceholder', locale)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
