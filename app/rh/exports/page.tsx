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

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

type RegistreType = 'hours' | 'salary' | 'leave' | 'overtime' | 'absence'
type FormatType = 'xlsx' | 'pdf'

const REGISTRES: Array<{
  type: RegistreType
  title: string
  subtitle: string
  icon: any
  color: string
  needsMois: boolean
}> = [
  { type: 'hours',    title: 'Hours Register',    subtitle: 'Heures travaillées, normales, supplémentaires', icon: Clock,         color: '#2563eb', needsMois: true  },
  { type: 'salary',   title: 'Salary Register',   subtitle: 'Salaires bruts, nets, déductions détaillées',    icon: CreditCard,    color: '#059669', needsMois: true  },
  { type: 'leave',    title: 'Leave Register',    subtitle: 'Soldes et prises AL, SL, VL, FML par cycle',     icon: Umbrella,      color: '#7c3aed', needsMois: false },
  { type: 'overtime', title: 'Overtime Register', subtitle: 'Heures OT tranches 1.5× et 2× (WRA S.20)',        icon: Zap,           color: '#ea580c', needsMois: true  },
  { type: 'absence',  title: 'Absence Register',  subtitle: 'Absences justifiées et non justifiées',           icon: AlertOctagon,  color: '#dc2626', needsMois: false },
]

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

export default function ExportsLegauxPage() {
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
          if (!cancelled) { setAuthorized(false); setRoleMsg('Non authentifié.') }
          return
        }
        const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
        const role = (prof as any)?.role || ''
        const ok = ['admin', 'rh'].includes(role)
        if (cancelled) return
        setAuthorized(ok)
        if (!ok) {
          setRoleMsg(`Accès réservé aux RH et administrateurs (rôle courant : ${role || 'inconnu'}).`)
          return
        }
        // Authorized : charger la liste des sociétés.
        const res = await fetch('/api/comptable/societes')
        const d = res.ok ? await res.json() : { societes: [] }
        if (cancelled) return
        setSocietes(d?.societes || [])
        if (d?.societes?.length > 0) setSocieteId((prev) => prev || d.societes[0].id)
      } catch {
        if (!cancelled) { setAuthorized(false); setRoleMsg('Erreur de chargement.') }
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
        alert(`Erreur : ${err?.error || `HTTP ${res.status}`}`)
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
      alert(`Erreur réseau : ${e?.message || 'inconnue'}`)
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
              <p className="font-semibold text-red-900">Accès refusé</p>
              <p className="text-sm text-red-800 mt-1">
                {roleMsg || 'Cette page est réservée aux RH Manager et administrateurs.'}
              </p>
              <p className="text-xs text-red-700 mt-2">
                Les exports légaux S.116 contiennent des données sensibles et ne sont
                accessibles qu&apos;aux responsables RH et administrateurs.
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
            Exports légaux — Workers&apos; Rights Act S.116
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            5 registres obligatoires à produire sur demande du Labour Inspector. Conservation 5 ans minimum.
          </p>
        </div>

        {/* Filtres */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base" style={{ color: NAVY }}>Paramètres d&apos;export</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-sm">Société</Label>
              <Select value={societeId} onValueChange={setSocieteId}>
                <SelectTrigger><SelectValue placeholder="Choisir une société" /></SelectTrigger>
                <SelectContent>
                  {societes.map(s => (<SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Année</Label>
              <Select value={String(annee)} onValueChange={v => setAnnee(parseInt(v, 10))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anneesDisponibles.map(y => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Mois (optionnel)</Label>
              <Select value={mois || "all"} onValueChange={v => setMois(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toute l&apos;année</SelectItem>
                  {MOIS_FR.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>
                      {String(i + 1).padStart(2, '0')} — {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Format</Label>
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
                      Télécharger .{format}
                    </Button>
                    {r.needsMois === false && mois && (
                      <p className="text-[10px] text-gray-400 mt-1 italic text-center">
                        (filtre mois ignoré pour ce registre — toujours annuel)
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
                Registres obligatoires — Workers&apos; Rights Act 2019 S.116
              </p>
              <p>
                L&apos;employeur doit conserver ces registres pendant au moins{" "}
                <span className="font-semibold">5 années</span> et les rendre disponibles sur demande
                du Labour Inspector. Les valeurs sont calculées en temps réel sur les tables
                de production (bulletins, pointages, congés).
              </p>
              <p className="text-xs text-amber-700 italic">
                Note : si aucune donnée n&apos;apparaît pour une période, c&apos;est qu&apos;aucun
                bulletin / pointage n&apos;a été enregistré. Cela ne signifie pas que le registre
                est « vide » au sens légal — il faut alors générer un fichier nul à archiver.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ClientPageShell>
  )
}
