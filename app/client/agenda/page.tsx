"use client"
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Loader2, CalendarDays, Plus, RefreshCw, Video, MapPin, Users, Trash2, X, AlertCircle, CheckCircle2, Mail,
} from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

type CalEvent = {
  id: string; title: string; description: string; location: string
  start: string | null; end: string | null; allDay: boolean
  participants: Array<{ name?: string; email?: string; status?: string }>
  conferenceUrl: string | null; status: string
}
type Calendar = { id: string; name: string; isPrimary: boolean; readOnly: boolean }

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : '')
const dayKey = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Sans date')

export default function AgendaPage() {
  const { societeId } = useSocieteActive()
  const [events, setEvents] = useState<CalEvent[]>([])
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [calendarId, setCalendarId] = useState('')
  const [noAccount, setNoAccount] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const sp = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(extra)
    if (societeId) p.set('societe_id', societeId)
    return p.toString()
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/nylas/calendar/events?${sp()}`)
      const d = await res.json()
      if (res.status === 404) { setNoAccount(true); return }
      if (!res.ok) throw new Error(d.error || 'Erreur agenda')
      setCalendars(d.calendars || []); setCalendarId(d.calendarId || '')
      setEvents((d.events || []).filter((e: CalEvent) => e.status !== 'cancelled'))
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur') }
    finally { setLoading(false) }
  }, [societeId])

  useEffect(() => { load() }, [load])

  const remove = async (ev: CalEvent) => {
    if (!confirm(`Supprimer « ${ev.title} » ?`)) return
    setError(null)
    try {
      const res = await fetch(`/api/nylas/calendar/events/${encodeURIComponent(ev.id)}?${sp({ calendar_id: calendarId })}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Échec suppression')
      setEvents((prev) => prev.filter((x) => x.id !== ev.id))
    } catch (e) { setError(e instanceof Error ? e.message : 'Échec suppression') }
  }

  if (noAccount) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Agenda</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Aucune boîte connectée. Connecte une boîte (avec calendrier) pour gérer ton agenda et créer des visios Meet/Zoom.</p>
            <Link href="/client/email-accounts"><Button><Mail className="h-4 w-4 mr-2" /> Connecter une boîte</Button></Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Groupe par jour
  const groups: Record<string, CalEvent[]> = {}
  for (const e of [...events].sort((a, b) => (a.start || '').localeCompare(b.start || ''))) {
    const k = dayKey(e.start); (groups[k] ||= []).push(e)
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Agenda</h1>
        <div className="flex items-center gap-2">
          {calendars.length > 1 && (
            <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)} className="text-sm border rounded-md px-2 py-1.5 bg-background max-w-[200px]">
              {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</Button>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> Nouvel événement</Button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3"><AlertCircle className="h-4 w-4" /> {error}</div>}
      {success && <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3"><CheckCircle2 className="h-4 w-4" /> {success}</div>}

      {loading && events.length === 0 ? (
        <div className="p-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
      ) : Object.keys(groups).length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Aucun événement sur la période (7 derniers jours → 30 prochains).</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(groups).map(([day, evs]) => (
            <div key={day}>
              <div className="text-sm font-medium capitalize text-muted-foreground mb-1.5">{day}</div>
              <Card><CardContent className="p-0 divide-y">
                {evs.map((ev) => (
                  <div key={ev.id} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{ev.title}</div>
                      <div className="text-xs text-muted-foreground">{ev.allDay ? 'Toute la journée' : `${fmt(ev.start)} → ${ev.end ? new Date(ev.end).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}`}</div>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {ev.location && <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {ev.location}</span>}
                        {ev.participants.length > 0 && <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Users className="h-3 w-3" /> {ev.participants.length}</span>}
                        {ev.conferenceUrl && <a href={ev.conferenceUrl} target="_blank" rel="noopener noreferrer"><Badge className="text-[10px] gap-1 bg-blue-600"><Video className="h-3 w-3" /> Rejoindre</Badge></a>}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="text-red-600 shrink-0" onClick={() => remove(ev)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
              </CardContent></Card>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateEventModal
          societeId={societeId} calendarId={calendarId}
          onClose={() => setShowCreate(false)}
          onCreated={(ev) => { setEvents((prev) => [...prev, ev]); setShowCreate(false); setSuccess(`Événement « ${ev.title} » créé${ev.conferenceUrl ? ' avec visio' : ''}.`) }}
        />
      )}
    </div>
  )
}

function CreateEventModal({ societeId, calendarId, onClose, onCreated }: { societeId: string | null; calendarId: string; onClose: () => void; onCreated: (ev: CalEvent) => void }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [duration, setDuration] = useState(60)
  const [location, setLocation] = useState('')
  const [participants, setParticipants] = useState('')
  const [conferencing, setConferencing] = useState<'' | 'meet' | 'zoom'>('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    if (!title.trim() || !date) { setErr('Titre et date requis'); return }
    setSaving(true); setErr(null)
    try {
      const start = Math.floor(new Date(`${date}T${startTime}:00`).getTime() / 1000)
      const end = start + duration * 60
      const res = await fetch('/api/nylas/calendar/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          societe_id: societeId || null, calendar_id: calendarId || undefined,
          title, description, location, start, end,
          participants: participants.split(',').map((p) => p.trim()).filter(Boolean),
          conferencing: conferencing || null,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erreur création')
      onCreated(d.event)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Erreur') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Nouvel événement</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{err}</div>}
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" className="w-full text-sm border rounded-md p-2 bg-background" />
          <div className="grid grid-cols-3 gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="text-sm border rounded-md p-2 bg-background" />
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="text-sm border rounded-md p-2 bg-background" />
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="text-sm border rounded-md p-2 bg-background">
              <option value={30}>30 min</option><option value={60}>1 h</option><option value={90}>1 h 30</option><option value={120}>2 h</option>
            </select>
          </div>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lieu (optionnel)" className="w-full text-sm border rounded-md p-2 bg-background" />
          <input value={participants} onChange={(e) => setParticipants(e.target.value)} placeholder="Participants (emails, séparés par des virgules)" className="w-full text-sm border rounded-md p-2 bg-background" />
          <div>
            <label className="text-sm font-medium flex items-center gap-1.5"><Video className="h-4 w-4" /> Visioconférence</label>
            <div className="flex gap-2 mt-1">
              {([['', 'Aucune'], ['meet', 'Google Meet'], ['zoom', 'Zoom']] as const).map(([v, label]) => (
                <button key={v} onClick={() => setConferencing(v)} className={`text-sm px-3 py-1.5 rounded-md border ${conferencing === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{label}</button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Le lien est généré automatiquement et ajouté à l'invitation. (Zoom nécessite un connecteur Zoom dans Nylas.)</p>
          </div>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optionnel)" className="w-full text-sm border rounded-md p-2 bg-background min-h-[70px]" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />} Créer</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
