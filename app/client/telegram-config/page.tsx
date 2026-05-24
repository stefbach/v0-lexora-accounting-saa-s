"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Loader2, MessageCircle, Copy, Check, Trash2, AlertCircle } from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale } from "@/lib/i18n"

export default function TelegramConfigPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [linked, setLinked] = useState<any>(null)
  const [code, setCode] = useState<string | null>(null)
  const [deepLink, setDeepLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cfg, setCfg] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  const loadLink = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/telegram/enroll')
      const j = await r.json()
      setLinked(j.telegram || null)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }

  const loadCfg = async () => {
    if (!societeId) return
    const r = await fetch(`/api/comptable/mes-societes?id=${societeId}`, { cache: 'no-store' }).catch(() => null)
    // For alerts config we use direct supabase via a simple endpoint, but to keep
    // this page self-contained we use a generic societe-scoped fetch. Easiest:
    // expose telegram_alerts_config via supabase select using anon (RLS enforces).
    try {
      const res = await fetch(`/api/client/telegram-alerts-config?societe_id=${societeId}`)
      if (res.ok) setCfg(await res.json())
    } catch { /* noop */ }
  }

  useEffect(() => { loadLink(); loadCfg() }, [societeId])

  const generateCode = async () => {
    setGenerating(true); setError(null)
    try {
      const r = await fetch('/api/telegram/enroll', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erreur')
      setCode(j.code)
      setDeepLink(j.deep_link)
    } catch (e: any) { setError(e.message) } finally { setGenerating(false) }
  }

  const unlink = async () => {
    if (!confirm('Délier ton compte Telegram de Lexora ?')) return
    await fetch('/api/telegram/enroll', { method: 'DELETE' })
    setLinked(null); setCode(null); setDeepLink(null)
  }

  const copy = (txt: string) => {
    navigator.clipboard.writeText(txt)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const saveCfg = async (next: any) => {
    if (!societeId) return
    setSaving(true)
    try {
      await fetch(`/api/client/telegram-alerts-config?societe_id=${societeId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      setCfg(next)
    } catch { /* noop */ } finally { setSaving(false) }
  }

  if (loading) return <div className="p-8"><Loader2 className="animate-spin h-5 w-5 text-slate-500" /></div>

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><MessageCircle className="h-6 w-6 text-sky-500" /> Telegram Bot</h1>
        <p className="text-sm text-slate-500">Connecte ton compte Telegram à Lexora pour piloter par messagerie : OCR, factures, congés, paie, alertes MRA…</p>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2"><AlertCircle className="h-4 w-4 mt-0.5" />{error}</div>}

      {/* ── État de liaison ── */}
      <Card>
        <CardHeader><CardTitle className="text-base">Statut de liaison</CardTitle></CardHeader>
        <CardContent>
          {linked ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">✓ Lié</Badge>
                <span className="text-sm">@{linked.telegram_username || linked.telegram_firstname || 'utilisateur'}</span>
              </div>
              <div className="text-xs text-slate-500">
                Langue : {linked.language_code === 'en' ? 'English' : 'Français'}
                {linked.last_seen_at && ` · Vu : ${new Date(linked.last_seen_at).toLocaleString('fr-FR')}`}
              </div>
              <Button onClick={unlink} variant="outline" size="sm" className="text-red-700 border-red-300">
                <Trash2 className="h-4 w-4 mr-2" />Délier mon compte
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Ton compte Lexora n'est pas encore lié à Telegram.</p>
              {!code ? (
                <Button onClick={generateCode} disabled={generating} className="bg-sky-500 hover:bg-sky-600 text-white">
                  {generating ? <><Loader2 className="animate-spin h-4 w-4 mr-2" />Génération…</> : 'Générer un code de liaison'}
                </Button>
              ) : (
                <div className="rounded border border-sky-200 bg-sky-50 p-4 space-y-3">
                  <div>
                    <Label className="text-xs">Ton code (valable 15 min)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-2xl font-mono font-bold tracking-widest bg-white px-3 py-1.5 rounded border">{code}</code>
                      <Button onClick={() => copy(code!)} size="sm" variant="outline">
                        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <ol className="text-sm text-slate-700 list-decimal pl-5 space-y-1">
                    <li>Ouvre Telegram et cherche le bot <strong>@{process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'LexoraBot'}</strong></li>
                    <li>Tape : <code className="bg-white px-1.5 py-0.5 rounded">/start {code}</code></li>
                    <li>Le bot confirme la liaison</li>
                  </ol>
                  {deepLink && (
                    <a href={deepLink} target="_blank" rel="noopener noreferrer"
                       className="inline-block text-sm text-sky-700 hover:underline">→ Ouvrir Telegram directement</a>
                  )}
                  <Button onClick={loadLink} size="sm" variant="ghost">J'ai lié mon compte, rafraîchir</Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Configuration des alertes par société ── */}
      {linked && cfg && (
        <Card>
          <CardHeader><CardTitle className="text-base">Alertes proactives — société active</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <SwitchRow label="Échéances MRA" desc="Alerte J-N avant chaque échéance fiscale"
              checked={cfg.enable_mra_deadlines}
              onChange={v => saveCfg({ ...cfg, enable_mra_deadlines: v })}>
              {cfg.enable_mra_deadlines && (
                <div className="flex items-center gap-2 mt-2">
                  <Label className="text-xs">Anticipation (jours)</Label>
                  <Input type="number" value={cfg.mra_deadline_advance_days || 7}
                    onChange={e => saveCfg({ ...cfg, mra_deadline_advance_days: Number(e.target.value) || 7 })}
                    className="w-20 h-7 text-sm" />
                </div>
              )}
            </SwitchRow>

            <SwitchRow label="Demandes de congé" desc="Notifier les managers à l'arrivée d'une demande"
              checked={cfg.enable_leave_requests}
              onChange={v => saveCfg({ ...cfg, enable_leave_requests: v })} />

            <SwitchRow label="Validations de congé" desc="Notifier l'employé après validation/refus"
              checked={cfg.enable_leave_approvals}
              onChange={v => saveCfg({ ...cfg, enable_leave_approvals: v })} />

            <SwitchRow label="Solde bancaire faible" desc="Alerte si solde < seuil"
              checked={cfg.enable_low_balance}
              onChange={v => saveCfg({ ...cfg, enable_low_balance: v })}>
              {cfg.enable_low_balance && (
                <div className="flex items-center gap-2 mt-2">
                  <Label className="text-xs">Seuil (MUR)</Label>
                  <Input type="number" value={cfg.low_balance_threshold_mur || 50000}
                    onChange={e => saveCfg({ ...cfg, low_balance_threshold_mur: Number(e.target.value) || 0 })}
                    className="w-32 h-7 text-sm" />
                </div>
              )}
            </SwitchRow>

            <SwitchRow label="Factures en retard" desc="Alerte sur les factures clients impayées au-delà de N jours"
              checked={cfg.enable_invoice_overdue}
              onChange={v => saveCfg({ ...cfg, enable_invoice_overdue: v })}>
              {cfg.enable_invoice_overdue && (
                <div className="flex items-center gap-2 mt-2">
                  <Label className="text-xs">Au-delà de</Label>
                  <Input type="number" value={cfg.invoice_overdue_days || 30}
                    onChange={e => saveCfg({ ...cfg, invoice_overdue_days: Number(e.target.value) || 30 })}
                    className="w-20 h-7 text-sm" />
                  <span className="text-xs text-slate-500">jours</span>
                </div>
              )}
            </SwitchRow>

            <SwitchRow label="Daily digest" desc="Résumé quotidien à 08h00 — KPIs + alertes du jour"
              checked={cfg.enable_daily_digest}
              onChange={v => saveCfg({ ...cfg, enable_daily_digest: v })} />

            <SwitchRow label="KPIs hebdomadaires" desc="Résumé hebdo le lundi matin"
              checked={cfg.enable_weekly_kpis}
              onChange={v => saveCfg({ ...cfg, enable_weekly_kpis: v })} />

            {saving && <div className="text-xs text-slate-400">Enregistrement…</div>}
          </CardContent>
        </Card>
      )}

      {/* ── Aide ── */}
      <Card>
        <CardHeader><CardTitle className="text-base">Que puis-je faire avec le bot ?</CardTitle></CardHeader>
        <CardContent className="text-sm text-slate-700 space-y-2">
          <p><strong>📑 Documents</strong> — envoie une photo ou un PDF au bot, il est ingéré dans Lexora (OCR)</p>
          <p><strong>🧾 Factures</strong> — "facture ACME 50 000 MUR services janvier" → génère + envoie le PDF</p>
          <p><strong>🌴 Congés</strong> — employé : "3 jours du 5 au 7 mai" ; manager : boutons Approuver/Refuser</p>
          <p><strong>💼 Paie</strong> — OT/primes, validation, exports MRA (PAYE/CSG/NSF/IT3)</p>
          <p><strong>📅 Échéances MRA</strong> — alertes automatiques avant chaque échéance</p>
          <p><strong>📊 KPIs</strong> — "kpis du mois", "trésorerie", "alertes"</p>
        </CardContent>
      </Card>
    </div>
  )
}

function SwitchRow({ label, desc, checked, onChange, children }:
  { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className="border-b pb-3 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-sm">{label}</div>
          {desc && <div className="text-xs text-slate-500">{desc}</div>}
        </div>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
      {children}
    </div>
  )
}
