"use client"

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertCircle, Calendar, Link2, Trash2, Star, Loader2, Mail } from 'lucide-react'
import { PageHelp } from '@/components/help/PageHelp'

type Account = {
  id: string
  account_email: string
  label: string | null
  scopes: string[]
  is_default_for_calendar: boolean
  active: boolean
  last_synced_at: string | null
  last_error: string | null
  created_at: string
}

export default function GoogleAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/google-accounts/list')
      const j = await r.json()
      if (r.ok) setAccounts(j.accounts || [])
      else setBanner({ kind: 'error', msg: j.error || 'Erreur de chargement' })
    } catch (e: any) {
      setBanner({ kind: 'error', msg: e?.message || 'Erreur réseau' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Lecture des query params (callback OAuth)
    const u = new URL(window.location.href)
    const g = u.searchParams.get('google')
    if (g === 'connected') setBanner({ kind: 'success', msg: 'Compte Google connecté avec succès' })
    if (g === 'error') {
      const reason = u.searchParams.get('reason') || 'Erreur inconnue'
      setBanner({ kind: 'error', msg: `Connexion échouée : ${reason}` })
    }
    load()
  }, [load])

  function connect() {
    window.location.href = '/api/auth/google/init?return_to=/client/settings/google-accounts?google=connected'
  }

  const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send'
  function hasCalendar(acc: Account) {
    return (acc.scopes || []).some(s => s.includes('/auth/calendar'))
  }
  function hasGmail(acc: Account) {
    return (acc.scopes || []).includes(GMAIL_SCOPE)
  }

  async function setDefault(id: string) {
    setBusyId(id)
    try {
      const r = await fetch('/api/google-accounts/set-default', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erreur')
      await load()
    } catch (e: any) {
      setBanner({ kind: 'error', msg: e?.message || 'Erreur' })
    } finally {
      setBusyId(null)
    }
  }

  async function disconnect(id: string) {
    if (!confirm('Déconnecter ce compte Google ? L\'accès sera révoqué et tu devras refaire le consent screen pour le reconnecter.')) return
    setBusyId(id)
    try {
      const r = await fetch('/api/google-accounts/disconnect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erreur')
      await load()
    } catch (e: any) {
      setBanner({ kind: 'error', msg: e?.message || 'Erreur' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Calendar className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-semibold">Comptes Google connectés</h1>
            <p className="text-sm text-muted-foreground">
              Une seule connexion Google active l'<strong>agenda</strong> (créer / modifier / lister tes rendez-vous, lien Meet auto)
              <strong> et l'adresse email</strong> (envoi d'emails sortants depuis ton Gmail via Lexora et l'agent Telegram).
            </p>
          </div>
        </div>
        <PageHelp />
      </div>

      {banner && (
        <div className={`mb-4 rounded-lg border p-3 flex items-start gap-2 ${banner.kind === 'success' ? 'bg-green-50 border-green-200 text-green-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
          {banner.kind === 'success' ? <CheckCircle2 className="h-5 w-5 mt-0.5" /> : <AlertCircle className="h-5 w-5 mt-0.5" />}
          <div className="text-sm">{banner.msg}</div>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Mes comptes</CardTitle>
          <Button onClick={connect} size="sm">
            <Link2 className="h-4 w-4 mr-2" /> Connecter un compte Google (Agenda + Email)
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Chargement…
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Aucun compte Google connecté.</p>
              <p className="text-xs mt-1">Connecte ton premier compte pour activer la gestion d'agenda <strong>et l'envoi d'emails</strong> via Lexora et Telegram.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {accounts.map(acc => (
                <li key={acc.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{acc.account_email}</span>
                      {acc.is_default_for_calendar && (
                        <Badge variant="default" className="text-xs"><Star className="h-3 w-3 mr-1" /> Défaut</Badge>
                      )}
                      {hasCalendar(acc) && (
                        <Badge variant="secondary" className="text-xs"><Calendar className="h-3 w-3 mr-1" /> Agenda</Badge>
                      )}
                      {hasGmail(acc) && (
                        <Badge variant="secondary" className="text-xs"><Mail className="h-3 w-3 mr-1" /> Email</Badge>
                      )}
                      {acc.last_error && (
                        <Badge variant="destructive" className="text-xs">Erreur</Badge>
                      )}
                    </div>
                    {acc.label && <div className="text-xs text-muted-foreground">{acc.label}</div>}
                    {!hasGmail(acc) && (
                      <div className="text-xs text-amber-600 mt-1">
                        Email non activé sur ce compte — clique « Reconnecter » pour autoriser l'envoi d'emails Gmail.
                      </div>
                    )}
                    {acc.last_error && (
                      <div className="text-xs text-red-600 mt-1">{acc.last_error}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!hasGmail(acc) && (
                      <Button size="sm" variant="outline" onClick={connect}>
                        <Mail className="h-4 w-4 mr-1" /> Reconnecter (+ Email)
                      </Button>
                    )}
                    {!acc.is_default_for_calendar && (
                      <Button size="sm" variant="outline" onClick={() => setDefault(acc.id)} disabled={busyId === acc.id}>
                        <Star className="h-4 w-4 mr-1" /> Définir par défaut
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => disconnect(acc.id)} disabled={busyId === acc.id}>
                      <Trash2 className="h-4 w-4 mr-1" /> Déconnecter
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 text-xs text-muted-foreground space-y-1">
        <p><strong>Sécurité.</strong> Tokens chiffrés AES-256-GCM avant insertion en base. Révoque ici à tout moment — l'accès Google est révoqué côté Google et la ligne supprimée.</p>
        <p><strong>Scopes.</strong> Lecture/écriture Calendar + envoi Gmail (<code>gmail.send</code> — Lexora peut envoyer des emails depuis ton adresse mais ne lit PAS ta boîte de réception) + lecture profile/email.</p>
        <p><strong>Email.</strong> Une fois connecté, ton adresse Gmail apparaît automatiquement comme compte d'envoi dans Paramètres → Emails et devient ton compte par défaut si tu n'en avais pas.</p>
      </div>
    </div>
  )
}
