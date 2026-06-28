"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Mail, Plus, Trash2, Star, StarOff, Send, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { PageHelp } from "@/components/help/PageHelp"
import { t, getLocale } from "@/lib/i18n"

type EmailAccount = {
  id: string
  user_id: string | null
  label: string
  from_email: string
  from_name: string | null
  provider: 'smtp' | 'resend' | 'gmail_oauth'
  smtp_host: string | null
  smtp_port: number | null
  smtp_user: string | null
  has_smtp_password: boolean
  has_resend_key: boolean
  resend_domain: string | null
  is_default_for_user: boolean
  is_default_for_societe: boolean
  active: boolean
  last_test_at: string | null
  last_test_status: 'success' | 'failed' | null
  last_test_error: string | null
}

export default function EmailAccountsPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [provider, setProvider] = useState<'smtp' | 'resend'>('smtp')
  const [personal, setPersonal] = useState(false)
  const [label, setLabel] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [fromName, setFromName] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com')
  const [smtpPort, setSmtpPort] = useState(587)
  const [smtpSecure, setSmtpSecure] = useState(true)
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [resendKey, setResendKey] = useState('')
  const [resendDomain, setResendDomain] = useState('')
  const [isDefault, setIsDefault] = useState(false)

  const load = async () => {
    if (!societeId) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/client/email-accounts?societe_id=${societeId}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || t('acct.email.generic_error', locale))
      setAccounts(j.accounts || [])
    } catch (e: any) { setError(e?.message || t('acct.email.generic_error', locale)) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId])

  const resetForm = () => {
    setProvider('smtp'); setPersonal(false); setLabel(''); setFromEmail(''); setFromName('')
    setReplyTo(''); setSmtpHost('smtp.gmail.com'); setSmtpPort(587); setSmtpSecure(true)
    setSmtpUser(''); setSmtpPassword(''); setResendKey(''); setResendDomain('')
    setIsDefault(false); setShowPwd(false)
  }

  const createAccount = async () => {
    setSaving(true); setError(null); setSuccess(null)
    try {
      const body: any = {
        personal, label, from_email: fromEmail, from_name: fromName || null,
        reply_to: replyTo || null, provider,
        is_default_for_user: personal && isDefault,
        is_default_for_societe: !personal && isDefault,
        active: true,
      }
      if (provider === 'smtp') {
        Object.assign(body, {
          smtp_host: smtpHost, smtp_port: smtpPort, smtp_secure: smtpSecure,
          smtp_user: smtpUser, smtp_password: smtpPassword,
        })
      } else {
        Object.assign(body, {
          resend_api_key: resendKey, resend_domain: resendDomain,
        })
      }
      const r = await fetch(`/api/client/email-accounts?societe_id=${societeId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || t('acct.email.generic_error', locale))
      setSuccess(`${t('acct.email.created_success_pre', locale)} "${label}" ${t('acct.email.created_success_post', locale)}`)
      setShowForm(false); resetForm(); await load()
    } catch (e: any) { setError(e?.message || t('acct.email.generic_error', locale)) } finally { setSaving(false) }
  }

  const testAccount = async (id: string) => {
    setTestingId(id); setError(null); setSuccess(null)
    try {
      const r = await fetch(`/api/client/email-accounts/test?id=${id}`, { method: 'POST' })
      const j = await r.json()
      // Domaine Resend non vérifié : surface l'avertissement même si l'API a répondu.
      const ds = j.domain_status
      if (ds?.checked && !ds.verified) {
        throw new Error(ds.message || t('acct.email.domain_unverified', locale))
      }
      if (!r.ok) throw new Error(j.error || t('acct.email.test_failed', locale))
      setSuccess(t('acct.email.test_success', locale))
      await load()
    } catch (e: any) { setError(e?.message || t('acct.email.generic_error', locale)) } finally { setTestingId(null) }
  }

  const toggleDefault = async (acc: EmailAccount) => {
    const wasDefault = acc.is_default_for_user || acc.is_default_for_societe
    const patch = acc.user_id
      ? { is_default_for_user: !wasDefault }
      : { is_default_for_societe: !wasDefault }
    setError(null)
    try {
      const r = await fetch(`/api/client/email-accounts?id=${acc.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || t('acct.email.generic_error', locale))
      await load()
    } catch (e: any) { setError(e?.message || t('acct.email.generic_error', locale)) }
  }

  const deleteAccount = async (acc: EmailAccount) => {
    if (!confirm(`${t('acct.email.delete_confirm_pre', locale)} "${acc.label}" ${t('acct.email.delete_confirm_post', locale)}`)) return
    setError(null)
    try {
      const r = await fetch(`/api/client/email-accounts?id=${acc.id}`, { method: 'DELETE' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || t('acct.email.generic_error', locale))
      await load()
    } catch (e: any) { setError(e?.message || t('acct.email.generic_error', locale)) }
  }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('acct.email.no_societe', locale)}</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin h-5 w-5" /> {t('acct.email.loading', locale)}</div>

  const societeAccounts = accounts.filter(a => !a.user_id)
  const personalAccounts = accounts.filter(a => a.user_id)

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Mail className="h-6 w-6 text-blue-600" /> {t('acct.email.page_title', locale)}</h1>
        <p className="text-sm text-slate-500">{t('acct.email.page_desc', locale)}</p>
        </div>
        <PageHelp />
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2"><AlertCircle className="h-4 w-4 mt-0.5" />{error}</div>}
      {success && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5" />{success}</div>}

      <div className="flex justify-between items-center">
        <div className="text-sm text-slate-600">{accounts.length} {t('acct.email.count', locale)}</div>
        <Button onClick={() => { resetForm(); setShowForm(s => !s) }} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="h-4 w-4 mr-1" /> {showForm ? t('acct.email.cancel', locale) : t('acct.email.add_btn', locale)}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('acct.email.new_account_title', locale)}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">{t('acct.email.provider_label', locale)}</label>
                <select value={provider} onChange={e => setProvider(e.target.value as 'smtp' | 'resend')} className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5">
                  <option value="smtp">SMTP (Gmail App Password, OVH, etc.)</option>
                  <option value="resend">Resend ({locale === 'en' ? 'verified domain' : 'domaine vérifié'})</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">{t('acct.email.type_label', locale)}</label>
                <select value={personal ? 'personnel' : 'societe'} onChange={e => setPersonal(e.target.value === 'personnel')} className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5">
                  <option value="societe">{t('acct.email.type_societe', locale)}</option>
                  <option value="personnel">{t('acct.email.type_personal', locale)}</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">{t('acct.email.label_field', locale)}</label>
                <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="ex: Cabinet ACME" className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">{t('acct.email.from_email_field', locale)}</label>
                <input type="email" value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="contact@acme.io" className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">{t('acct.email.from_name_field', locale)}</label>
                <input type="text" value={fromName} onChange={e => setFromName(e.target.value)} placeholder={t('acct.email.from_name_ph', locale)} className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">{t('acct.email.reply_to_field', locale)}</label>
                <input type="email" value={replyTo} onChange={e => setReplyTo(e.target.value)} className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
              </div>
            </div>

            {provider === 'smtp' ? (
              <div className="space-y-3 border-t pt-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-slate-600">{t('acct.email.smtp_host_field', locale)}</label>
                    <input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">{t('acct.email.smtp_port_field', locale)}</label>
                    <input type="number" value={smtpPort} onChange={e => setSmtpPort(Number(e.target.value))} className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">{t('acct.email.smtp_user_field', locale)}</label>
                  <input type="text" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} placeholder="contact@acme.io" className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">{t('acct.email.smtp_password_field', locale)}</label>
                  <div className="mt-1 flex gap-2">
                    <input type={showPwd ? 'text' : 'password'} value={smtpPassword} onChange={e => setSmtpPassword(e.target.value)} className="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5" />
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowPwd(s => !s)}>
                      {showPwd ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {t('acct.email.smtp_gmail_hint_pre', locale)} <a href="https://myaccount.google.com/apppasswords" target="_blank" className="text-blue-600 underline">myaccount.google.com/apppasswords</a> {t('acct.email.smtp_gmail_hint_post', locale)}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={smtpSecure} onChange={e => setSmtpSecure(e.target.checked)} />
                  <span>{t('acct.email.smtp_secure_label', locale)}</span>
                </label>
              </div>
            ) : (
              <div className="space-y-3 border-t pt-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">{t('acct.email.resend_key_field', locale)}</label>
                  <div className="mt-1 flex gap-2">
                    <input type={showPwd ? 'text' : 'password'} value={resendKey} onChange={e => setResendKey(e.target.value)} placeholder="re_xxxxxxxx" className="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5 font-mono" />
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowPwd(s => !s)}>
                      {showPwd ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">{t('acct.email.resend_domain_field', locale)}</label>
                  <input type="text" value={resendDomain} onChange={e => setResendDomain(e.target.value)} placeholder="acme.io" className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
                  <div className="text-xs text-slate-500 mt-1">{t('acct.email.resend_domain_hint_pre', locale)} <a href="https://resend.com/domains" target="_blank" className="text-blue-600 underline">resend.com/domains</a>{t('acct.email.resend_domain_hint_post', locale)}</div>
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm border-t pt-3">
              <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} />
              <span>{personal ? t('acct.email.set_default_label_me', locale) : t('acct.email.set_default_label_societe', locale)}</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => { setShowForm(false); resetForm() }} variant="outline">{t('acct.email.cancel', locale)}</Button>
              <Button onClick={createAccount} disabled={saving || !label || !fromEmail} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {t('acct.email.create_btn', locale)}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Company accounts */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('acct.email.societe_accounts_title', locale)} ({societeAccounts.length})</CardTitle></CardHeader>
        <CardContent>
          {societeAccounts.length === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">{t('acct.email.societe_empty', locale)}</div>
          ) : (
            <div className="space-y-2">
              {societeAccounts.map(acc => (
                <div key={acc.id} className="flex items-start justify-between border rounded p-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{acc.label}</div>
                      <Badge className={acc.provider === 'smtp' ? 'bg-blue-100 text-blue-700 border-blue-300 text-xs' : 'bg-purple-100 text-purple-700 border-purple-300 text-xs'}>{acc.provider}</Badge>
                      {acc.is_default_for_societe && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-xs">{t('acct.email.badge_default_societe', locale)}</Badge>}
                      {!acc.active && <Badge className="bg-slate-100 text-slate-600 border-slate-300 text-xs">{t('acct.email.badge_inactive', locale)}</Badge>}
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      {acc.from_name ? `${acc.from_name} <${acc.from_email}>` : acc.from_email}
                    </div>
                    {acc.provider === 'smtp' && <div className="text-[10px] text-slate-500 mt-0.5">SMTP {acc.smtp_host}:{acc.smtp_port}</div>}
                    {acc.provider === 'resend' && <div className="text-[10px] text-slate-500 mt-0.5">Resend · {locale === 'en' ? 'domain' : 'domaine'} {acc.resend_domain}</div>}
                    {acc.last_test_at && (
                      <div className={`text-[10px] mt-1 ${acc.last_test_status === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {t('acct.email.last_test', locale)} {new Date(acc.last_test_at).toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR')} · {acc.last_test_status}
                        {acc.last_test_error && ` : ${acc.last_test_error.slice(0, 80)}`}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => testAccount(acc.id)} disabled={testingId === acc.id} variant="outline" size="sm">
                      {testingId === acc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 mr-1" />} {t('acct.email.test_btn', locale)}
                    </Button>
                    <Button onClick={() => toggleDefault(acc)} variant="outline" size="sm">
                      {acc.is_default_for_societe ? <StarOff className="h-3 w-3" /> : <Star className="h-3 w-3" />}
                    </Button>
                    <Button onClick={() => deleteAccount(acc)} variant="outline" size="sm" className="text-red-700 border-red-200 hover:bg-red-50">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Personal accounts */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('acct.email.personal_accounts_title', locale)} ({personalAccounts.length})</CardTitle></CardHeader>
        <CardContent>
          {personalAccounts.length === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">{t('acct.email.personal_empty', locale)}</div>
          ) : (
            <div className="space-y-2">
              {personalAccounts.map(acc => (
                <div key={acc.id} className="flex items-start justify-between border rounded p-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{acc.label}</div>
                      <Badge className={acc.provider === 'smtp' ? 'bg-blue-100 text-blue-700 border-blue-300 text-xs' : 'bg-purple-100 text-purple-700 border-purple-300 text-xs'}>{acc.provider}</Badge>
                      {acc.is_default_for_user && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-xs">{t('acct.email.badge_default_user', locale)}</Badge>}
                      {!acc.active && <Badge className="bg-slate-100 text-slate-600 border-slate-300 text-xs">{t('acct.email.badge_inactive', locale)}</Badge>}
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      {acc.from_name ? `${acc.from_name} <${acc.from_email}>` : acc.from_email}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => testAccount(acc.id)} disabled={testingId === acc.id} variant="outline" size="sm">
                      {testingId === acc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 mr-1" />} {t('acct.email.test_btn', locale)}
                    </Button>
                    <Button onClick={() => toggleDefault(acc)} variant="outline" size="sm">
                      {acc.is_default_for_user ? <StarOff className="h-3 w-3" /> : <Star className="h-3 w-3" />}
                    </Button>
                    <Button onClick={() => deleteAccount(acc)} variant="outline" size="sm" className="text-red-700 border-red-200 hover:bg-red-50">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-slate-500 flex items-start gap-2 p-3 rounded bg-slate-50 border border-slate-200">
        <Mail className="h-4 w-4 mt-0.5" />
        <div>
          <strong>{t('acct.email.routing_title', locale)}</strong> {t('acct.email.routing_desc', locale)}
        </div>
      </div>
    </div>
  )
}
