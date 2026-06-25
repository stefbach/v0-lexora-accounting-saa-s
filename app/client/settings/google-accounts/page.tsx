"use client"

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertCircle, Calendar, Link2, Trash2, Star, Loader2, Mail } from 'lucide-react'
import { PageHelp } from '@/components/help/PageHelp'
import { t, getLocale } from '@/lib/i18n'

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
  const locale = getLocale()
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
      else setBanner({ kind: 'error', msg: j.error || t('acct.google.load_error', locale) })
    } catch (e: any) {
      setBanner({ kind: 'error', msg: e?.message || t('acct.google.network_error', locale) })
    } finally {
      setLoading(false)
    }
  }, [locale])

  useEffect(() => {
    // Lecture des query params (callback OAuth)
    const u = new URL(window.location.href)
    const g = u.searchParams.get('google')
    if (g === 'connected') setBanner({ kind: 'success', msg: t('acct.google.banner_connected', locale) })
    if (g === 'error') {
      const reason = u.searchParams.get('reason') || t('acct.google.banner_error_unknown', locale)
      setBanner({ kind: 'error', msg: `${t('acct.google.banner_error_prefix', locale)}${reason}` })
    }
    load()
  }, [load, locale])

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
      if (!r.ok) throw new Error(j.error || t('acct.google.generic_error', locale))
      await load()
    } catch (e: any) {
      setBanner({ kind: 'error', msg: e?.message || t('acct.google.generic_error', locale) })
    } finally {
      setBusyId(null)
    }
  }

  async function disconnect(id: string) {
    if (!confirm(t('acct.google.disconnect_confirm', locale))) return
    setBusyId(id)
    try {
      const r = await fetch('/api/google-accounts/disconnect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || t('acct.google.generic_error', locale))
      await load()
    } catch (e: any) {
      setBanner({ kind: 'error', msg: e?.message || t('acct.google.generic_error', locale) })
    } finally {
      setBusyId(null)
    }
  }

  async function testEmail(acc: Account) {
    setBusyId(acc.id)
    setBanner(null)
    try {
      const r = await fetch('/api/auth/google/test-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_email: acc.account_email }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || t('acct.google.test_fail', locale))
      setBanner({ kind: 'success', msg: j.message || `Email de test envoyé à ${acc.account_email}.` })
    } catch (e: any) {
      setBanner({ kind: 'error', msg: e?.message || t('acct.google.test_error', locale) })
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
            <h1 className="text-2xl font-semibold">{t('acct.google.page_title', locale)}</h1>
            <p className="text-sm text-muted-foreground">
              {t('acct.google.page_desc_pre', locale)}<strong>{t('acct.google.page_desc_calendar', locale)}</strong>{t('acct.google.page_desc_mid', locale)}
              <strong>{t('acct.google.page_desc_email', locale)}</strong>{t('acct.google.page_desc_post', locale)}
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
          <CardTitle className="text-base">{t('acct.google.my_accounts', locale)}</CardTitle>
          <Button onClick={connect} size="sm">
            <Link2 className="h-4 w-4 mr-2" /> {t('acct.google.connect_btn', locale)}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> {t('acct.google.loading', locale)}
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>{t('acct.google.empty_title', locale)}</p>
              <p className="text-xs mt-1">{t('acct.google.empty_hint', locale)} <strong>{t('acct.google.empty_hint_email', locale)}</strong> {t('acct.google.empty_hint_post', locale)}</p>
            </div>
          ) : (
            <ul className="divide-y">
              {accounts.map(acc => (
                <li key={acc.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{acc.account_email}</span>
                      {acc.is_default_for_calendar && (
                        <Badge variant="default" className="text-xs"><Star className="h-3 w-3 mr-1" /> {t('acct.google.badge_default', locale)}</Badge>
                      )}
                      {hasCalendar(acc) && (
                        <Badge variant="secondary" className="text-xs"><Calendar className="h-3 w-3 mr-1" /> {t('acct.google.badge_agenda', locale)}</Badge>
                      )}
                      {hasGmail(acc) && (
                        <Badge variant="secondary" className="text-xs"><Mail className="h-3 w-3 mr-1" /> {t('acct.google.badge_email', locale)}</Badge>
                      )}
                      {acc.last_error && (
                        <Badge variant="destructive" className="text-xs">{t('acct.google.badge_error', locale)}</Badge>
                      )}
                    </div>
                    {acc.label && <div className="text-xs text-muted-foreground">{acc.label}</div>}
                    {!hasGmail(acc) && (
                      <div className="text-xs text-amber-600 mt-1">
                        {t('acct.google.no_gmail_hint', locale)}
                      </div>
                    )}
                    {acc.last_error && (
                      <div className="text-xs text-red-600 mt-1">{acc.last_error}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {hasGmail(acc) && (
                      <Button size="sm" variant="outline" onClick={() => testEmail(acc)} disabled={busyId === acc.id}>
                        <Mail className="h-4 w-4 mr-1" /> {busyId === acc.id ? t('acct.google.test_sending', locale) : t('acct.google.test_btn', locale)}
                      </Button>
                    )}
                    {!hasGmail(acc) && (
                      <Button size="sm" variant="outline" onClick={connect}>
                        <Mail className="h-4 w-4 mr-1" /> {t('acct.google.reconnect_btn', locale)}
                      </Button>
                    )}
                    {!acc.is_default_for_calendar && (
                      <Button size="sm" variant="outline" onClick={() => setDefault(acc.id)} disabled={busyId === acc.id}>
                        <Star className="h-4 w-4 mr-1" /> {t('acct.google.set_default_btn', locale)}
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => disconnect(acc.id)} disabled={busyId === acc.id}>
                      <Trash2 className="h-4 w-4 mr-1" /> {t('acct.google.disconnect_btn', locale)}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 text-xs text-muted-foreground space-y-1">
        <p><strong>{t('acct.google.security_title', locale)}</strong> {t('acct.google.security_desc', locale)}</p>
        <p><strong>{t('acct.google.scopes_title', locale)}</strong> {t('acct.google.scopes_desc', locale)}</p>
        <p><strong>{t('acct.google.email_title', locale)}</strong> {t('acct.google.email_desc', locale)}</p>
      </div>
    </div>
  )
}
