"use client"
import { useEffect, useState, useMemo, useRef } from 'react'
import Script from 'next/script'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Calendar, Video, MapPin, CheckCircle2, ChevronLeft, Loader2 } from 'lucide-react'
import { t, getLocale } from '@/lib/i18n'

type PublicSettings = {
  slug: string
  page_title: string
  page_subtitle: string | null
  page_intro: string | null
  duration_minutes: number
  min_notice_hours: number
  max_advance_days: number
  location_online_enabled: boolean
  location_in_person_enabled: boolean
  in_person_address: string | null
  timezone: string
  active: boolean
}

type Slot = { start_iso: string; end_iso: string; label: string }

const NAVY = '#0B0F2E'
const GOLD = '#D4AF37'

function toLocalDateStr(d: Date): string {
  // Maurice UTC+4
  const localMs = d.getTime() + 4 * 3600_000
  const x = new Date(localMs)
  const y = x.getUTCFullYear()
  const m = String(x.getUTCMonth() + 1).padStart(2, '0')
  const day = String(x.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function nextNDays(n: number): string[] {
  const out: string[] = []
  const today = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(today.getTime() + i * 86_400_000)
    out.push(toLocalDateStr(d))
  }
  return out
}

const DAY_KEYS = ['samsc.rdv_day_dim', 'samsc.rdv_day_lun', 'samsc.rdv_day_mar', 'samsc.rdv_day_mer', 'samsc.rdv_day_jeu', 'samsc.rdv_day_ven', 'samsc.rdv_day_sam']
const MONTH_KEYS = ['samsc.rdv_month_jan', 'samsc.rdv_month_feb', 'samsc.rdv_month_mar', 'samsc.rdv_month_apr', 'samsc.rdv_month_may', 'samsc.rdv_month_jun', 'samsc.rdv_month_jul', 'samsc.rdv_month_aug', 'samsc.rdv_month_sep', 'samsc.rdv_month_oct', 'samsc.rdv_month_nov', 'samsc.rdv_month_dec']

function formatDateBadge(dateStr: string, locale: ReturnType<typeof getLocale>): { day: number; month: string; weekday: string } {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0))
  return {
    day: d,
    month: t(MONTH_KEYS[m - 1], locale),
    weekday: t(DAY_KEYS[date.getUTCDay()], locale),
  }
}

export default function RdvPage() {
  const locale = getLocale()
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [locationType, setLocationType] = useState<'online' | 'in_person'>('online')

  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<{ meet_url: string | null } | null>(null)
  const [googleClientId, setGoogleClientId] = useState<string | null>(null)
  const [signedInWithGoogle, setSignedInWithGoogle] = useState<{ email: string; name: string | null; picture: string | null } | null>(null)
  const googleBtnRef = useRef<HTMLDivElement | null>(null)
  const [gisReady, setGisReady] = useState(false)

  useEffect(() => {
    fetch('/api/rdv/settings').then(r => r.json()).then(j => {
      if (j?.settings) {
        setSettings(j.settings)
        if (j.settings.location_online_enabled) setLocationType('online')
        else if (j.settings.location_in_person_enabled) setLocationType('in_person')
      } else setError(j?.error || t('samsc.rdv_page_not_found', locale))
    }).catch(() => setError(t('samsc.rdv_load_error', locale))).finally(() => setLoading(false))

    // Récupère le client_id Google pour Sign in with Google (auto-fill)
    fetch('/api/rdv/google-config').then(r => r.json()).then(j => {
      if (j?.google_client_id) setGoogleClientId(j.google_client_id)
    }).catch(() => {})
  }, [])

  // Initialise le bouton Google Sign-In quand on arrive à l'étape 3
  useEffect(() => {
    if (step !== 3 || !googleClientId || !gisReady || signedInWithGoogle) return
    const g = (window as any).google
    if (!g?.accounts?.id) return
    try {
      g.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (resp: any) => {
          if (!resp?.credential) return
          try {
            const r = await fetch('/api/rdv/google-signin', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential: resp.credential }),
            })
            const j = await r.json()
            if (r.ok && j?.email) {
              setSignedInWithGoogle({ email: j.email, name: j.name || null, picture: j.picture || null })
              setForm(prev => ({ ...prev, name: j.name || prev.name, email: j.email }))
            }
          } catch { /* noop */ }
        },
        auto_select: false,
        ux_mode: 'popup',
      })
      if (googleBtnRef.current) {
        googleBtnRef.current.innerHTML = ''
        g.accounts.id.renderButton(googleBtnRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: 320,
        })
      }
    } catch { /* noop */ }
  }, [step, googleClientId, gisReady, signedInWithGoogle])

  // Dates disponibles : N prochains jours
  const dates = useMemo(() => {
    if (!settings) return []
    return nextNDays(settings.max_advance_days)
  }, [settings])

  // Charge les créneaux quand la date change
  useEffect(() => {
    if (!selectedDate || !settings) return
    setSlotsLoading(true)
    setSlots([])
    setSelectedSlot(null)
    fetch(`/api/rdv/slots?slug=${settings.slug}&date=${selectedDate}`)
      .then(r => r.json())
      .then(j => setSlots(j?.slots || []))
      .finally(() => setSlotsLoading(false))
  }, [selectedDate, settings])

  async function submit() {
    if (!settings || !selectedSlot) return
    setSubmitting(true)
    setError(null)
    try {
      const r = await fetch('/api/rdv/book', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: settings.slug,
          start_iso: selectedSlot.start_iso,
          end_iso: selectedSlot.end_iso,
          location_type: locationType,
          prospect_name: form.name,
          prospect_email: form.email,
          prospect_phone: form.phone || undefined,
          prospect_company: form.company || undefined,
          notes: form.notes || undefined,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || t('samsc.rdv_generic_error', locale))
      setSuccess({ meet_url: j.meet_url || null })
      setStep(4)
    } catch (e: any) {
      setError(e?.message || t('samsc.rdv_generic_error', locale))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: NAVY }}><Loader2 className="animate-spin h-8 w-8 text-white" /></div>
  if (error && !settings) return <div className="min-h-screen flex items-center justify-center text-white p-8" style={{ background: NAVY }}>{error}</div>
  if (!settings) return null

  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(180deg, ${NAVY} 0%, #1a1f4a 100%)` }}>
      {/* Google Identity Services (Sign in with Google) */}
      {googleClientId && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={() => setGisReady(true)}
        />
      )}
      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-5" style={{ fontFamily: "'Poppins','Helvetica Neue',Arial,sans-serif", letterSpacing: '4px', fontWeight: 800, fontSize: '24px' }}>
            <span style={{ color: '#E8EAFC' }}>LE</span>
            <span style={{ color: GOLD }}>X</span>
            <span style={{ color: '#E8EAFC' }}>ORA</span>
          </div>
          <div className="mb-6 mx-auto" style={{ width: 48, height: 2, background: `linear-gradient(90deg, ${GOLD} 0%, transparent 100%)` }} />
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">{settings.page_title}</h1>
          {settings.page_subtitle && <p className="text-base text-white/70 max-w-2xl mx-auto">{settings.page_subtitle}</p>}
          {settings.page_intro && (
            <p className="mt-5 text-sm text-white/60 max-w-2xl mx-auto whitespace-pre-line leading-relaxed">{settings.page_intro}</p>
          )}
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map(n => (
            <div key={n} className={`h-1 w-12 rounded-full transition-all ${step >= n ? '' : 'opacity-30'}`} style={{ background: GOLD }} />
          ))}
        </div>

        {/* Step 1 : Date */}
        {step === 1 && (
          <Card className="bg-white/95 backdrop-blur">
            <CardContent className="p-6 md:p-8">
              <h2 className="text-xl font-semibold mb-1" style={{ color: NAVY }}>{t('samsc.rdv_choose_date', locale)}</h2>
              <p className="text-sm text-slate-500 mb-6">{t('samsc.rdv_demo_duration', locale).split('{min}')[0]}<strong>{settings.duration_minutes}</strong>{t('samsc.rdv_demo_duration', locale).split('{min}')[1]}</p>
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2">
                {dates.map(d => {
                  const b = formatDateBadge(d, locale)
                  const isSelected = selectedDate === d
                  return (
                    <button
                      key={d}
                      onClick={() => { setSelectedDate(d); setStep(2) }}
                      className={`p-3 rounded-lg border-2 transition-all text-center ${isSelected ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-400 bg-white'}`}
                    >
                      <div className="text-xs text-slate-500 uppercase">{b.weekday}</div>
                      <div className="text-2xl font-bold" style={{ color: NAVY }}>{b.day}</div>
                      <div className="text-xs text-slate-500">{b.month}</div>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2 : Créneau */}
        {step === 2 && selectedDate && (
          <Card className="bg-white/95 backdrop-blur">
            <CardContent className="p-6 md:p-8">
              <button onClick={() => setStep(1)} className="text-sm text-slate-500 hover:text-slate-700 mb-4 inline-flex items-center gap-1">
                <ChevronLeft className="h-4 w-4" /> {t('samsc.rdv_change_date', locale)}
              </button>
              <h2 className="text-xl font-semibold mb-1" style={{ color: NAVY }}>{t('samsc.rdv_choose_slot', locale)}</h2>
              <p className="text-sm text-slate-500 mb-6">{formatDateBadge(selectedDate, locale).weekday} {formatDateBadge(selectedDate, locale).day} {formatDateBadge(selectedDate, locale).month}</p>
              {slotsLoading ? (
                <div className="flex items-center justify-center py-8 text-slate-500"><Loader2 className="animate-spin h-5 w-5 mr-2" /> {t('samsc.rdv_loading', locale)}</div>
              ) : slots.length === 0 ? (
                <p className="text-center py-8 text-slate-500">{t('samsc.rdv_no_slot', locale)}</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {slots.map(s => (
                    <button
                      key={s.start_iso}
                      onClick={() => { setSelectedSlot(s); setStep(3) }}
                      className="p-3 rounded-lg border-2 border-slate-200 hover:border-amber-400 hover:bg-amber-50 transition-all font-medium" style={{ color: NAVY }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3 : Form prospect */}
        {step === 3 && selectedSlot && (
          <Card className="bg-white/95 backdrop-blur">
            <CardContent className="p-6 md:p-8">
              <button onClick={() => setStep(2)} className="text-sm text-slate-500 hover:text-slate-700 mb-4 inline-flex items-center gap-1">
                <ChevronLeft className="h-4 w-4" /> {t('samsc.rdv_change_slot', locale)}
              </button>
              <h2 className="text-xl font-semibold mb-1" style={{ color: NAVY }}>{t('samsc.rdv_your_details', locale)}</h2>
              <p className="text-sm text-slate-500 mb-6">
                {formatDateBadge(selectedDate!, locale).weekday} {formatDateBadge(selectedDate!, locale).day} {formatDateBadge(selectedDate!, locale).month} · {selectedSlot.label}
              </p>

              {/* Choix lieu si les deux sont activés */}
              {settings.location_online_enabled && settings.location_in_person_enabled && (
                <div className="mb-6">
                  <label className="text-sm font-medium block mb-2" style={{ color: NAVY }}>{t('samsc.rdv_format', locale)}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setLocationType('online')}
                      className={`p-3 rounded-lg border-2 flex items-center justify-center gap-2 ${locationType === 'online' ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}
                    >
                      <Video className="h-4 w-4" /> {t('samsc.rdv_online_meet', locale)}
                    </button>
                    <button
                      onClick={() => setLocationType('in_person')}
                      className={`p-3 rounded-lg border-2 flex items-center justify-center gap-2 ${locationType === 'in_person' ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}
                    >
                      <MapPin className="h-4 w-4" /> {t('samsc.rdv_in_person', locale)}
                    </button>
                  </div>
                  {locationType === 'in_person' && settings.in_person_address && (
                    <p className="text-xs text-slate-500 mt-2">{t('samsc.rdv_place', locale).replace('{addr}', settings.in_person_address)}</p>
                  )}
                </div>
              )}

              {/* Sign in with Google — pré-remplit nom + email */}
              {googleClientId && !signedInWithGoogle && (
                <div className="mb-5 p-4 rounded-lg border border-slate-200 bg-slate-50 flex flex-col items-center">
                  <p className="text-xs text-slate-500 mb-2">{t('samsc.rdv_google_hint', locale)}</p>
                  <div ref={googleBtnRef} />
                </div>
              )}
              {signedInWithGoogle && (
                <div className="mb-5 p-3 rounded-lg border border-emerald-200 bg-emerald-50 flex items-center gap-3">
                  {signedInWithGoogle.picture && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={signedInWithGoogle.picture} alt="" className="h-9 w-9 rounded-full" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-emerald-900 truncate">{signedInWithGoogle.name || signedInWithGoogle.email}</div>
                    <div className="text-xs text-emerald-700 truncate">{signedInWithGoogle.email}</div>
                  </div>
                  <button onClick={() => { setSignedInWithGoogle(null); setForm(p => ({ ...p, name: '', email: '' })) }} className="text-xs text-slate-500 hover:text-slate-700">{t('samsc.rdv_change', locale)}</button>
                </div>
              )}

              <div className="space-y-3">
                <Input placeholder={t('samsc.rdv_ph_name', locale)} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                <Input placeholder={t('samsc.rdv_ph_email', locale)} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                <Input placeholder={t('samsc.rdv_ph_company', locale)} value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
                <Input placeholder={t('samsc.rdv_ph_phone', locale)} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                <Textarea placeholder={t('samsc.rdv_ph_notes', locale)} rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>

              {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

              <Button
                onClick={submit}
                disabled={submitting || !form.name || !form.email}
                className="w-full mt-6 text-white"
                style={{ backgroundColor: NAVY }}
              >
                {submitting ? (<><Loader2 className="animate-spin h-4 w-4 mr-2" /> {t('samsc.rdv_sending', locale)}</>) : t('samsc.rdv_confirm', locale)}
              </Button>
              <p className="text-xs text-slate-400 mt-3 text-center">
                {t('samsc.rdv_invite_note', locale).replace('{detail}', locationType === 'online' ? t('samsc.rdv_invite_meet', locale) : t('samsc.rdv_invite_place', locale))}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Step 4 : Confirmation */}
        {step === 4 && selectedSlot && (
          <Card className="bg-white/95 backdrop-blur">
            <CardContent className="p-8 text-center">
              <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-emerald-500" />
              <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY }}>{t('samsc.rdv_confirmed', locale)}</h2>
              <p className="text-slate-600 mb-1">
                {formatDateBadge(selectedDate!, locale).weekday} {formatDateBadge(selectedDate!, locale).day} {formatDateBadge(selectedDate!, locale).month} · <strong>{selectedSlot.label}</strong>
              </p>
              <p className="text-sm text-slate-500 mb-6">
                {t('samsc.rdv_invite_sent', locale).split('{email}')[0]}<strong>{form.email}</strong>{t('samsc.rdv_invite_sent', locale).split('{email}')[1]}
              </p>
              {success?.meet_url && (
                <a href={success.meet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-white font-medium" style={{ background: NAVY }}>
                  <Video className="h-4 w-4" /> {t('samsc.rdv_open_meet', locale)}
                </a>
              )}
              <p className="text-xs text-slate-400 mt-6">{t('samsc.rdv_see_soon', locale)}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
