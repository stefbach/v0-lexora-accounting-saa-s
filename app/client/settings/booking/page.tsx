"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Loader2, Save, Calendar, ExternalLink, CheckCircle2, Activity } from 'lucide-react'
import { t, getLocale } from '@/lib/i18n'

type Settings = any

const DAYS = [
  { key: 'mon', label: 'Lun' }, { key: 'tue', label: 'Mar' }, { key: 'wed', label: 'Mer' },
  { key: 'thu', label: 'Jeu' }, { key: 'fri', label: 'Ven' }, { key: 'sat', label: 'Sam' },
  { key: 'sun', label: 'Dim' },
]

export default function BookingSettingsPage() {
  const locale = getLocale()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [googleAccounts, setGoogleAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  const [diag, setDiag] = useState<any>(null)
  const [diagLoading, setDiagLoading] = useState(false)

  async function runDiag() {
    setDiagLoading(true); setDiag(null)
    try {
      const r = await fetch('/api/rdv/diag')
      const j = await r.json()
      setDiag(j)
    } catch (e: any) {
      setDiag({ error: e?.message || 'Erreur' })
    } finally { setDiagLoading(false) }
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/rdv/settings?admin=1').then(r => r.json()),
      fetch('/api/google-accounts/list').then(r => r.json()),
    ]).then(([s, g]) => {
      setSettings(s?.settings || defaultSettings())
      setGoogleAccounts(g?.accounts || [])
    }).finally(() => setLoading(false))
  }, [])

  function defaultSettings(): Settings {
    return {
      slug: 'rdv', page_title: 'Prendre rendez-vous avec Lexora',
      page_subtitle: 'Choisis un créneau pour une démo personnalisée',
      page_intro: null,
      duration_minutes: 30, slot_interval_minutes: 30,
      buffer_before_minutes: 0, buffer_after_minutes: 0,
      min_notice_hours: 4, max_advance_days: 30,
      working_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      working_hours_start: '09:00', working_hours_end: '17:00',
      lunch_break_start: '12:00', lunch_break_end: '13:00',
      timezone: 'Indian/Mauritius',
      location_online_enabled: true, location_in_person_enabled: false,
      in_person_address: '',
      event_title_template: 'Démo Lexora — {prospect_name}',
      event_description_template: 'Démo Lexora demandée par {prospect_name} ({prospect_email}).\nSociété : {prospect_company}\n\nMessage :\n{notes}',
      notify_via_email: true, notify_via_telegram: true,
      notify_email: '',
      active: true,
    }
  }

  function update(patch: Partial<Settings>) { setSettings((prev: any) => ({ ...prev, ...patch })) }
  function toggleDay(key: string) {
    const cur: string[] = settings?.working_days || []
    update({ working_days: cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key] })
  }

  async function save() {
    if (!settings?.google_account_email) {
      setBanner({ kind: 'error', msg: 'Choisis un compte Google connecté avant d\'enregistrer' })
      return
    }
    setSaving(true); setBanner(null)
    try {
      const r = await fetch('/api/rdv/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'Erreur')
      setBanner({ kind: 'success', msg: 'Paramètres enregistrés ✓' })
      if (j.settings) setSettings(j.settings)
    } catch (e: any) {
      setBanner({ kind: 'error', msg: e?.message || 'Erreur' })
    } finally { setSaving(false) }
  }

  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> {t('cui.loading', locale)}</div>
  if (!settings) return null

  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/rdv${settings.slug && settings.slug !== 'rdv' ? `?slug=${settings.slug}` : ''}`
    : '/rdv'

  return (
    <div className="container mx-auto py-6 max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Calendar className="h-6 w-6" /> {t('scp.booking_title', locale)}</h1>
          <p className="text-sm text-muted-foreground">Configure ta page publique de prise de RDV connectée à Google Calendar.</p>
        </div>
        <a href={publicUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
          Voir la page <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {banner && (
        <div className={`rounded-lg border p-3 flex items-center gap-2 ${banner.kind === 'success' ? 'bg-green-50 border-green-200 text-green-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
          {banner.kind === 'success' && <CheckCircle2 className="h-5 w-5" />}
          <div className="text-sm">{banner.msg}</div>
        </div>
      )}

      {/* Compte Google */}
      <Card>
        <CardHeader><CardTitle className="text-base">Compte Google (agenda)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {googleAccounts.length === 0 ? (
            <p className="text-sm text-amber-600">{t('scp.no_google_account', locale)} Connecte-en un sur <a href="/client/settings/google-accounts" className="underline">Paramètres → Comptes Google</a>.</p>
          ) : (
            <div>
              <Label>Compte à utiliser</Label>
              <select
                className="w-full mt-1 rounded border px-3 py-2 text-sm"
                value={settings.google_account_email || ''}
                onChange={e => update({ google_account_email: e.target.value })}
              >
                <option value="">— Choisir —</option>
                {googleAccounts.map((a: any) => (
                  <option key={a.id} value={a.account_email}>{a.account_email}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">Les créneaux seront calculés en croisant les events de cet agenda.</p>
            </div>
          )}
          <div>
            <Label>Calendrier (id)</Label>
            <Input value={settings.calendar_id || 'primary'} onChange={e => update({ calendar_id: e.target.value })} placeholder="primary" />
          </div>
        </CardContent>
      </Card>

      {/* Diagnostic agenda */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Diagnostic connexion agenda</CardTitle>
          <Button size="sm" variant="outline" onClick={runDiag} disabled={diagLoading}>
            {diagLoading ? (<><Loader2 className="animate-spin h-3 w-3 mr-1" /> Test…</>) : 'Tester la connexion'}
          </Button>
        </CardHeader>
        <CardContent>
          {!diag && (
            <p className="text-xs text-muted-foreground">Vérifie en un clic que Lexora lit bien ton agenda Google (busy times des 7 prochains jours).</p>
          )}
          {diag && (
            <div className="space-y-2 text-sm">
              {diag.error && <div className="text-red-600">❌ {diag.error}</div>}
              {diag.message && <div className="text-amber-700">⚠️ {diag.message}</div>}
              {diag.google_account && (
                <div>
                  <span className="text-slate-500">Compte Google :</span> <span className="font-mono">{diag.google_account}</span>
                  {diag.has_calendar_scope === false && <span className="ml-2 text-red-600 text-xs">⚠️ Scope calendar absent</span>}
                </div>
              )}
              {diag.calendar_id_configured && (
                <div><span className="text-slate-500">Calendar id configuré :</span> <span className="font-mono">{diag.calendar_id_configured}</span></div>
              )}
              {diag.available_calendars && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-blue-600">{diag.available_calendars.length} calendrier(s) Google visible(s)</summary>
                  <ul className="mt-2 ml-4 space-y-0.5">
                    {diag.available_calendars.map((c: any) => (
                      <li key={c.id} className="font-mono">
                        {c.primary ? '⭐ ' : '• '}{c.id} <span className="text-slate-500">— {c.summary} ({c.accessRole})</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {diag.freebusy && (
                <div className={`p-2 rounded ${diag.freebusy.errors ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                  {diag.freebusy.errors ? (
                    <div className="text-red-700">❌ Google refuse l'accès : <code className="text-xs">{JSON.stringify(diag.freebusy.errors)}</code></div>
                  ) : (
                    <div className="text-emerald-700">
                      ✅ Lecture freeBusy OK — <strong>{diag.freebusy.busy_count}</strong> plage(s) occupée(s) trouvée(s) sur les 7 prochains jours.
                      {diag.freebusy.busy_first_10?.length > 0 && (
                        <details className="text-xs mt-1">
                          <summary className="cursor-pointer">Voir les plages</summary>
                          <ul className="mt-1 ml-4">
                            {diag.freebusy.busy_first_10.map((b: any, i: number) => (
                              <li key={i} className="font-mono">{new Date(b.start).toLocaleString('fr-FR')} → {new Date(b.end).toLocaleString('fr-FR')}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              )}
              {diag.freebusy_error && <div className="text-red-600">❌ freeBusy : {diag.freebusy_error}</div>}
              {diag.calendar_list_error && <div className="text-red-600">❌ Liste calendriers : {diag.calendar_list_error}</div>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Page publique */}
      <Card>
        <CardHeader><CardTitle className="text-base">Page publique</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Slug URL</Label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">{typeof window !== 'undefined' ? window.location.origin : ''}/rdv</span>
              <Input value={settings.slug || 'rdv'} onChange={e => update({ slug: e.target.value })} className="w-32" placeholder="rdv" />
            </div>
          </div>
          <div><Label>Titre</Label><Input value={settings.page_title || ''} onChange={e => update({ page_title: e.target.value })} /></div>
          <div><Label>Sous-titre</Label><Input value={settings.page_subtitle || ''} onChange={e => update({ page_subtitle: e.target.value })} /></div>
          <div><Label>Intro (optionnel)</Label><Textarea rows={3} value={settings.page_intro || ''} onChange={e => update({ page_intro: e.target.value })} /></div>
        </CardContent>
      </Card>

      {/* Durée et créneaux */}
      <Card>
        <CardHeader><CardTitle className="text-base">Durée & créneaux</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Durée RDV (minutes)</Label>
              <select className="w-full mt-1 rounded border px-3 py-2 text-sm" value={settings.duration_minutes} onChange={e => update({ duration_minutes: Number(e.target.value) })}>
                {[15, 30, 45, 60, 90].map(m => <option key={m} value={m}>{m} min</option>)}
              </select>
            </div>
            <div>
              <Label>Pas entre créneaux</Label>
              <select className="w-full mt-1 rounded border px-3 py-2 text-sm" value={settings.slot_interval_minutes} onChange={e => update({ slot_interval_minutes: Number(e.target.value) })}>
                {[15, 30, 60].map(m => <option key={m} value={m}>{m} min</option>)}
              </select>
            </div>
            <div>
              <Label>Délai min avant RDV (h)</Label>
              <Input type="number" value={settings.min_notice_hours} onChange={e => update({ min_notice_hours: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Ouverture sur N jours</Label>
              <Input type="number" value={settings.max_advance_days} onChange={e => update({ max_advance_days: Number(e.target.value) })} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Disponibilité */}
      <Card>
        <CardHeader><CardTitle className="text-base">Disponibilité</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Jours ouvrés</Label>
            <div className="flex gap-2 mt-1">
              {DAYS.map(d => {
                const active = (settings.working_days || []).includes(d.key)
                return (
                  <button
                    key={d.key} onClick={() => toggleDay(d.key)}
                    className={`px-3 py-1.5 rounded border text-sm ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'}`}
                  >{d.label}</button>
                )
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Heure de début</Label><Input type="time" value={settings.working_hours_start} onChange={e => update({ working_hours_start: e.target.value })} /></div>
            <div><Label>Heure de fin</Label><Input type="time" value={settings.working_hours_end} onChange={e => update({ working_hours_end: e.target.value })} /></div>
            <div><Label>Pause déjeuner (début)</Label><Input type="time" value={settings.lunch_break_start || ''} onChange={e => update({ lunch_break_start: e.target.value })} /></div>
            <div><Label>Pause déjeuner (fin)</Label><Input type="time" value={settings.lunch_break_end || ''} onChange={e => update({ lunch_break_end: e.target.value })} /></div>
          </div>
        </CardContent>
      </Card>

      {/* Lieu */}
      <Card>
        <CardHeader><CardTitle className="text-base">Lieu du RDV</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div><Label>En ligne (Google Meet auto)</Label></div>
            <Switch checked={settings.location_online_enabled} onCheckedChange={(v: boolean) => update({ location_online_enabled: v })} />
          </div>
          <div className="flex items-center justify-between">
            <div><Label>Présentiel</Label></div>
            <Switch checked={settings.location_in_person_enabled} onCheckedChange={(v: boolean) => update({ location_in_person_enabled: v })} />
          </div>
          {settings.location_in_person_enabled && (
            <div><Label>Adresse présentiel</Label><Input value={settings.in_person_address || ''} onChange={e => update({ in_person_address: e.target.value })} placeholder="Ex : 12 rue X, Port-Louis" /></div>
          )}
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader><CardTitle className="text-base">Notifications à chaque RDV pris</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Email à toi</Label>
            <Switch checked={settings.notify_via_email} onCheckedChange={(v: boolean) => update({ notify_via_email: v })} />
          </div>
          <div>
            <Label>Adresse de notification</Label>
            <Input value={settings.notify_email || ''} onChange={e => update({ notify_email: e.target.value })} placeholder="ton.email@example.com" />
          </div>
          <div className="flex items-center justify-between">
            <Label>Telegram</Label>
            <Switch checked={settings.notify_via_telegram} onCheckedChange={(v: boolean) => update({ notify_via_telegram: v })} />
          </div>
        </CardContent>
      </Card>

      {/* Action */}
      <div className="flex items-center justify-between sticky bottom-4 bg-white/95 backdrop-blur rounded-lg border shadow-lg p-4">
        <div className="flex items-center gap-2">
          <Label>Page active</Label>
          <Switch checked={settings.active} onCheckedChange={(v: boolean) => update({ active: v })} />
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? (<><Loader2 className="animate-spin h-4 w-4 mr-2" /> Enregistrement…</>) : (<><Save className="h-4 w-4 mr-2" /> Enregistrer</>)}
        </Button>
      </div>
    </div>
  )
}
