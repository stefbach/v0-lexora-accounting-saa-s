"use client"
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Loader2, Download, Clock, CreditCard, Umbrella, Zap, AlertOctagon,
  ShieldCheck, FileSpreadsheet, FileText, AlertTriangle,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale, type Locale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

type RegistreType = 'hours' | 'salary' | 'leave' | 'overtime' | 'absence'
type FormatType = 'xlsx' | 'pdf'

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

export default function ExportsLegauxPage() {
  const locale: Locale = getLocale()
  const REGISTRES: Array<{
    type: RegistreType
    title: string
    subtitle: string
    icon: any
    color: string
    needsMois: boolean
  }> = [
    { type: 'hours',    title: 'Hours Register',    subtitle: t('rha.b.exleg.hours_subtitle', locale), icon: Clock,         color: '#2563eb', needsMois: true  },
    { type: 'salary',   title: 'Salary Register',   subtitle: t('rha.b.exleg.salary_subtitle', locale), icon: CreditCard,    color: '#059669', needsMois: true  },
    { type: 'leave',    title: 'Leave Register',    subtitle: t('rha.b.exleg.leave_subtitle', locale), icon: Umbrella,      color: '#7c3aed', needsMois: false },
    { type: 'overtime', title: 'Overtime Register', subtitle: t('rha.b.exleg.overtime_subtitle', locale), icon: Zap,           color: '#ea580c', needsMois: true  },
    { type: 'absence',  title: 'Absence Register',  subtitle: t('rha.b.exleg.absence_subtitle', locale), icon: AlertOctagon,  color: '#dc2626', needsMois: false },
  ]
  const [societes, setSocietes] = useState<Array<{ id: string; nom: string }>>([])
  const [societeId, setSocieteId] = useState<string>("")
  const [annee, setAnnee] = useState<number>(new Date().getFullYear())
  const [mois, setMois] = useState<string>("") // "" = toute l'année
  const [format, setFormat] = useState<FormatType>("xlsx")
  const [downloading, setDownloading] = useState<RegistreType | null>(null)
  const [loadingPermissions, setLoadingPermissions] = useState(true)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [roleMsg, setRoleMsg] = useState<string | null>(null)

  // G6 — Les exports S.116 sont réservés admin / rh (pas de rôle 'super_admin'
  // ni 'rh_manager' en DB — hotfix après constat terrain).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          if (!cancelled) { setAuthorized(false); setRoleMsg(t('rha.b.exleg.not_auth', locale)) }
          return
        }
        const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle<{ role: string | null }>()
        const role = prof?.role || ''
        const ok = ['admin', 'rh'].includes(role)
        if (cancelled) return
        setAuthorized(ok)
        if (!ok) {
          setRoleMsg(t('rha.b.exleg.access_role', locale).replace('{role}', role || (locale === 'fr' ? 'inconnu' : 'unknown')))
          return
        }
        // Authorized : charger la liste des sociétés.
        const res = await fetch('/api/comptable/societes')
        const d = res.ok ? await res.json() : { societes: [] }
        if (cancelled) return
        setSocietes(d?.societes || [])
        if (d?.societes?.length > 0) setSocieteId((prev) => prev || d.societes[0].id)
      } catch {
        if (!cancelled) { setAuthorized(false); setRoleMsg(t('rha.b.exleg.load_err', locale)) }
      } finally {
        if (!cancelled) setLoadingPermissions(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const anneesDisponibles = useMemo(() => {
    const y = new Date().getFullYear()
    return [y - 2, y - 1, y, y + 1]
  }, [])

  const download = async (type: RegistreType) => {
    if (!societeId || !annee) return
    setDownloading(type)
    try {
      const p = new URLSearchParams({
        societe_id: societeId,
        annee: String(annee),
        format,
      })
      const needsMois = REGISTRES.find(r => r.type === type)?.needsMois
      if (needsMois && mois) p.set('mois', mois)
      const res = await fetch(`/api/rh/exports/registre/${type}?${p.toString()}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`${t('rha.b.exleg.dl_err', locale)} : ${err?.error || `HTTP ${res.status}`}`)
        return
      }
      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition') || ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match ? match[1] : `registre_${type}_${annee}.${format}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert(`${t('rha.b.exleg.net_err', locale)} : ${e?.message || (locale === 'fr' ? 'inconnue' : 'unknown')}`)
    } finally {
      setDownloading(null)
    }
  }

  if (loadingPermissions) {
    return (
      <ClientPageShell hideHero disableParticles>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
        </div>
      </ClientPageShell>
    )
  }

  if (authorized === false) {
    return (
      <ClientPageShell hideHero disableParticles>
        <Card className="max-w-lg mx-auto mt-12 border-red-300 bg-red-50">
          <CardContent className="p-6 flex items-start gap-3">
            <ShieldCheck className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">{t('rha.b.exleg.access_denied', locale)}</p>
              <p className="text-sm text-red-800 mt-1">
                {roleMsg || t('rha.b.exleg.access_msg', locale)}
              </p>
              <p className="text-xs text-red-700 mt-2">
                {t('rha.b.exleg.access_hint', locale)}
              </p>
            </div>
          </CardContent>
        </Card>
      </ClientPageShell>
    )
  }

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-[1200px] mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2" style={{ color: NAVY }}>
            <ShieldCheck className="h-7 w-7" style={{ color: GOLD }} />
            {t('rha.b.exleg.title', locale)}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('rha.b.exleg.subtitle', locale)}
          </p>
        </div>

        {/* Filtres */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base" style={{ color: NAVY }}>{t('rha.b.exleg.params', locale)}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-sm">{t('rha.b.exleg.societe', locale)}</Label>
              <Select value={societeId} onValueChange={setSocieteId}>
                <SelectTrigger><SelectValue placeholder={t('rha.b.exleg.choose_societe', locale)} /></SelectTrigger>
                <SelectContent>
                  {societes.map(s => (<SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">{t('rha.b.exleg.year', locale)}</Label>
              <Select value={String(annee)} onValueChange={v => setAnnee(parseInt(v, 10))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anneesDisponibles.map(y => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">{t('rha.b.exleg.month_opt', locale)}</Label>
              <Select value={mois || "all"} onValueChange={v => setMois(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('rha.b.exleg.whole_year', locale)}</SelectItem>
                  {MOIS_FR.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>
                      {String(i + 1).padStart(2, '0')} — {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">{t('rha.b.exleg.format', locale)}</Label>
              <div className="flex gap-1 mt-1.5">
                <Button
                  size="sm" variant={format === 'xlsx' ? 'default' : 'outline'}
                  onClick={() => setFormat('xlsx')} className="flex-1"
                  style={format === 'xlsx' ? { backgroundColor: NAVY } : {}}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Excel
                </Button>
                <Button
                  size="sm" variant={format === 'pdf' ? 'default' : 'outline'}
                  onClick={() => setFormat('pdf')} className="flex-1"
                  style={format === 'pdf' ? { backgroundColor: NAVY } : {}}
                >
                  <FileText className="h-3.5 w-3.5 mr-1" /> PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 5 cartes de registre */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {REGISTRES.map(r => {
            const Icon = r.icon
            const isDownloading = downloading === r.type
            return (
              <Card key={r.type} className="border-2" style={{ borderColor: r.color + '30' }}>
                <CardContent className="p-5 flex flex-col h-full">
                  <div className="flex items-start gap-3 mb-2">
                    <div className="rounded-lg p-2.5 flex-shrink-0" style={{ backgroundColor: r.color + '15' }}>
                      <Icon className="h-5 w-5" style={{ color: r.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm leading-tight" style={{ color: NAVY }}>{r.title}</h3>
                      <p className="text-[11px] text-gray-500 mt-0.5">{r.subtitle}</p>
                    </div>
                  </div>
                  <div className="mt-auto pt-3">
                    <Button
                      size="sm" className="w-full text-white" disabled={!societeId || isDownloading}
                      onClick={() => download(r.type)}
                      style={{ backgroundColor: r.color }}
                    >
                      {isDownloading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {t('rha.b.exleg.download', locale)} .{format}
                    </Button>
                    {r.needsMois === false && mois && (
                      <p className="text-[10px] text-gray-400 mt-1 italic text-center">
                        {t('rha.b.exleg.month_ignored', locale)}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Bandeau S.116 */}
        <Card className="border-2 border-amber-300 bg-amber-50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 space-y-1">
              <p className="font-semibold">
                {t('rha.b.exleg.banner_title', locale)}
              </p>
              <p>
                {t('rha.b.exleg.banner_body', locale)}
              </p>
              <p className="text-xs text-amber-700 italic">
                {t('rha.b.exleg.banner_note', locale)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ClientPageShell>
  )
}
