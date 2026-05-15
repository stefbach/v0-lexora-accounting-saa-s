"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Mail, Plus, Trash2, Star, StarOff, Send, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

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
      if (!r.ok) throw new Error(j.error || 'Erreur')
      setAccounts(j.accounts || [])
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
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
      if (!r.ok) throw new Error(j.error || 'Erreur')
      setSuccess(`Compte "${label}" créé. Lance un test pour valider.`)
      setShowForm(false); resetForm(); await load()
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setSaving(false) }
  }

  const testAccount = async (id: string) => {
    setTestingId(id); setError(null); setSuccess(null)
    try {
      const r = await fetch(`/api/client/email-accounts/test?id=${id}`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Test échoué')
      setSuccess('Email de test envoyé. Vérifie ta boîte.')
      await load()
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setTestingId(null) }
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
      if (!r.ok) throw new Error(j.error || 'Erreur')
      await load()
    } catch (e: any) { setError(e?.message || 'Erreur') }
  }

  const deleteAccount = async (acc: EmailAccount) => {
    if (!confirm(`Supprimer le compte "${acc.label}" ? Les envois futurs basculeront sur un autre compte (ou fallback Resend).`)) return
    setError(null)
    try {
      const r = await fetch(`/api/client/email-accounts?id=${acc.id}`, { method: 'DELETE' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erreur')
      await load()
    } catch (e: any) { setError(e?.message || 'Erreur') }
  }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin h-5 w-5" /> Chargement…</div>

  const societeAccounts = accounts.filter(a => !a.user_id)
  const personalAccounts = accounts.filter(a => a.user_id)

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Mail className="h-6 w-6 text-blue-600" /> Comptes Email</h1>
        <p className="text-sm text-slate-500">
          Configure plusieurs comptes email pour l'envoi sortant (relances, rapports, notifications).
          Chaque société peut avoir N comptes partagés ; chaque utilisateur peut avoir ses propres comptes perso.
          Secrets stockés chiffrés <b>AES-256-GCM</b>.
        </p>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2"><AlertCircle className="h-4 w-4 mt-0.5" />{error}</div>}
      {success && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5" />{success}</div>}

      <div className="flex justify-between items-center">
        <div className="text-sm text-slate-600">{accounts.length} compte(s) configuré(s)</div>
        <Button onClick={() => { resetForm(); setShowForm(s => !s) }} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="h-4 w-4 mr-1" /> {showForm ? 'Annuler' : 'Ajouter un compte'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">Nouveau compte email</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Provider</label>
                <select value={provider} onChange={e => setProvider(e.target.value as any)} className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5">
                  <option value="smtp">SMTP (Gmail App Password, OVH, etc.)</option>
                  <option value="resend">Resend (domaine vérifié)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Type</label>
                <select value={personal ? 'personnel' : 'societe'} onChange={e => setPersonal(e.target.value === 'personnel')} className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5">
                  <option value="societe">Société (partagé par tous)</option>
                  <option value="personnel">Personnel (juste moi)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Label *</label>
                <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="ex: Cabinet ACME" className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">From email *</label>
                <input type="email" value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="contact@acme.io" className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">From name</label>
                <input type="text" value={fromName} onChange={e => setFromName(e.target.value)} placeholder="ACME Comptabilité" className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Reply-To (optionnel)</label>
                <input type="email" value={replyTo} onChange={e => setReplyTo(e.target.value)} className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
              </div>
            </div>

            {provider === 'smtp' ? (
              <div className="space-y-3 border-t pt-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-slate-600">SMTP host *</label>
                    <input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Port *</label>
                    <input type="number" value={smtpPort} onChange={e => setSmtpPort(Number(e.target.value))} className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">User (souvent l'email) *</label>
                  <input type="text" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} placeholder="contact@acme.io" className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Password (App Password pour Gmail) *</label>
                  <div className="mt-1 flex gap-2">
                    <input type={showPwd ? 'text' : 'password'} value={smtpPassword} onChange={e => setSmtpPassword(e.target.value)} className="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5" />
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowPwd(s => !s)}>
                      {showPwd ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Gmail : génère un App Password sur <a href="https://myaccount.google.com/apppasswords" target="_blank" className="text-blue-600 underline">myaccount.google.com/apppasswords</a> (nécessite 2FA actif).
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={smtpSecure} onChange={e => setSmtpSecure(e.target.checked)} />
                  <span>Connexion sécurisée (TLS/SSL) — recommandé port 465 ou 587 avec STARTTLS</span>
                </label>
              </div>
            ) : (
              <div className="space-y-3 border-t pt-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Resend API key *</label>
                  <div className="mt-1 flex gap-2">
                    <input type={showPwd ? 'text' : 'password'} value={resendKey} onChange={e => setResendKey(e.target.value)} placeholder="re_xxxxxxxx" className="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5 font-mono" />
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowPwd(s => !s)}>
                      {showPwd ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Domaine vérifié *</label>
                  <input type="text" value={resendDomain} onChange={e => setResendDomain(e.target.value)} placeholder="acme.io" className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
                  <div className="text-xs text-slate-500 mt-1">Le from_email doit utiliser ce domaine. Vérifie-le sur <a href="https://resend.com/domains" target="_blank" className="text-blue-600 underline">resend.com/domains</a>.</div>
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm border-t pt-3">
              <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} />
              <span>Définir comme défaut {personal ? '(pour moi)' : '(pour la société)'}</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => { setShowForm(false); resetForm() }} variant="outline">Annuler</Button>
              <Button onClick={createAccount} disabled={saving || !label || !fromEmail} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Créer et chiffrer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comptes société */}
      <Card>
        <CardHeader><CardTitle className="text-base">Comptes société ({societeAccounts.length})</CardTitle></CardHeader>
        <CardContent>
          {societeAccounts.length === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">Aucun compte société. Le fallback Resend par défaut (Lexora) est utilisé en attendant.</div>
          ) : (
            <div className="space-y-2">
              {societeAccounts.map(acc => (
                <div key={acc.id} className="flex items-start justify-between border rounded p-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{acc.label}</div>
                      <Badge className={acc.provider === 'smtp' ? 'bg-blue-100 text-blue-700 border-blue-300 text-xs' : 'bg-purple-100 text-purple-700 border-purple-300 text-xs'}>{acc.provider}</Badge>
                      {acc.is_default_for_societe && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-xs">Défaut société</Badge>}
                      {!acc.active && <Badge className="bg-slate-100 text-slate-600 border-slate-300 text-xs">Inactif</Badge>}
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      {acc.from_name ? `${acc.from_name} <${acc.from_email}>` : acc.from_email}
                    </div>
                    {acc.provider === 'smtp' && <div className="text-[10px] text-slate-500 mt-0.5">SMTP {acc.smtp_host}:{acc.smtp_port}</div>}
                    {acc.provider === 'resend' && <div className="text-[10px] text-slate-500 mt-0.5">Resend · domaine {acc.resend_domain}</div>}
                    {acc.last_test_at && (
                      <div className={`text-[10px] mt-1 ${acc.last_test_status === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                        Dernier test {new Date(acc.last_test_at).toLocaleString('fr-FR')} · {acc.last_test_status}
                        {acc.last_test_error && ` : ${acc.last_test_error.slice(0, 80)}`}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => testAccount(acc.id)} disabled={testingId === acc.id} variant="outline" size="sm">
                      {testingId === acc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 mr-1" />} Test
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

      {/* Comptes personnels */}
      <Card>
        <CardHeader><CardTitle className="text-base">Mes comptes personnels ({personalAccounts.length})</CardTitle></CardHeader>
        <CardContent>
          {personalAccounts.length === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">Aucun compte personnel.</div>
          ) : (
            <div className="space-y-2">
              {personalAccounts.map(acc => (
                <div key={acc.id} className="flex items-start justify-between border rounded p-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{acc.label}</div>
                      <Badge className={acc.provider === 'smtp' ? 'bg-blue-100 text-blue-700 border-blue-300 text-xs' : 'bg-purple-100 text-purple-700 border-purple-300 text-xs'}>{acc.provider}</Badge>
                      {acc.is_default_for_user && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-xs">Mon défaut</Badge>}
                      {!acc.active && <Badge className="bg-slate-100 text-slate-600 border-slate-300 text-xs">Inactif</Badge>}
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      {acc.from_name ? `${acc.from_name} <${acc.from_email}>` : acc.from_email}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => testAccount(acc.id)} disabled={testingId === acc.id} variant="outline" size="sm">
                      {testingId === acc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 mr-1" />} Test
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
          <strong>Comment sont sélectionnés les comptes :</strong> quand l'agent Telegram envoie un email, il choisit le compte dans cet ordre :
          1. compte précisé par l'utilisateur (account_id) → 2. <em>mon défaut personnel</em> → 3. <em>défaut société</em> → 4. fallback Resend Lexora.
          L'agent peut aussi te proposer un choix via Telegram (commande "envoie depuis quel email ?").
        </div>
      </div>
    </div>
  )
}
