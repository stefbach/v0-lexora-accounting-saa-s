"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Building2, Eye, EyeOff, AlertCircle, CheckCircle2, Save, Play, Plus, KeyRound } from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { PageHelp } from "@/components/help/PageHelp"
import { t, getLocale } from "@/lib/i18n"

type Compte = {
  id: string
  banque: string | null
  numero_compte: string | null
  intitule: string | null
  devise: string | null
  solde_actuel: number | null
  actif: boolean
  scraping: {
    configured: boolean
    has_username?: boolean
    has_password?: boolean
    has_pin?: boolean
    notes?: string | null
    active?: boolean
    last_scrape_at?: string | null
    last_scrape_status?: string | null
    last_scrape_error?: string | null
    last_balance_mur?: number | null
  }
}

export default function BankCredentialsPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [comptes, setComptes] = useState<Compte[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [scrapingNow, setScrapingNow] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newAccount, setNewAccount] = useState({ banque: 'MCB', nom_compte: '', numero_compte: '', iban: '', swift: '', devise: 'MUR', compte_principal: false })

  // Form state per compte
  const [usernames, setUsernames] = useState<Record<string, string>>({})
  const [passwords, setPasswords] = useState<Record<string, string>>({})
  const [pins, setPins] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [actives, setActives] = useState<Record<string, boolean>>({})
  const [showPwd, setShowPwd] = useState<Record<string, boolean>>({})

  const load = async () => {
    if (!societeId) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/client/direction/bank-credentials?societe_id=${societeId}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erreur')
      setComptes(j.comptes || [])
      const act: Record<string, boolean> = {}
      const nt: Record<string, string> = {}
      for (const c of (j.comptes || []) as Compte[]) {
        act[c.id] = c.scraping?.active ?? true
        nt[c.id] = c.scraping?.notes || ''
      }
      setActives(act); setNotes(nt)
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId])

  const save = async (compteId: string) => {
    setError(null); setSuccess(null)
    try {
      const body: any = {
        notes: notes[compteId] ?? '',
        active: actives[compteId] ?? true,
      }
      if (usernames[compteId]) body.username = usernames[compteId]
      if (passwords[compteId]) body.password = passwords[compteId]
      if (pins[compteId]) body.secondary_pin = pins[compteId]

      const r = await fetch(`/api/client/direction/bank-credentials?compte_id=${compteId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erreur')
      setSuccess('Credentials enregistrées et chiffrées.')
      setUsernames(p => ({ ...p, [compteId]: '' }))
      setPasswords(p => ({ ...p, [compteId]: '' }))
      setPins(p => ({ ...p, [compteId]: '' }))
      setEditing(null)
      await load()
    } catch (e: any) { setError(e?.message || 'Erreur') }
  }

  const createAccount = async () => {
    if (!societeId) return
    setError(null); setSuccess(null)
    if (!newAccount.banque.trim()) { setError('Banque requise'); return }
    try {
      const r = await fetch(`/api/client/comptes-bancaires`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: societeId, ...newAccount }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erreur')
      // Récupère l'id du compte créé pour ouvrir directement le formulaire d'accès
      const newId: string | undefined =
        j?.compte?.id || j?.compte_bancaire?.id || j?.id || j?.data?.id
      setSuccess('Compte bancaire créé — saisis maintenant le login et le mot de passe ci-dessous.')
      setCreating(false)
      setNewAccount({ banque: 'MCB', nom_compte: '', numero_compte: '', iban: '', swift: '', devise: 'MUR', compte_principal: false })
      await load()
      // Ouvre d'emblée la saisie login/mot de passe du nouveau compte
      if (newId) setEditing(newId)
    } catch (e: any) { setError(e?.message || 'Erreur') }
  }

  const scrapeNow = async (compteId: string) => {
    setScrapingNow(compteId); setError(null); setSuccess(null)
    try {
      const r = await fetch(`/api/client/direction/bank-credentials/scrape?compte_id=${compteId}`, {
        method: 'POST',
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erreur')
      if (j.status === 'manual_needed') {
        setError(`Robot pas encore activé : ${j.error || 'Playwright non installé'}`)
      } else if (j.status === 'success') {
        setSuccess(`Scrape OK — solde ${j.balance_mur || '?'} ${j.balance_devise || 'MUR'}, ${j.nb_transactions || 0} tx`)
      } else {
        setError(`Scrape ${j.status} : ${j.error || 'inconnu'}`)
      }
      await load()
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setScrapingNow(null) }
  }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('cui.no_societe', locale)}</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin h-5 w-5" /> {t('cui.loading', locale)}</div>

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6 text-blue-600" /> Accès Bancaires (Scraping)</h1>
          <p className="text-sm text-slate-500">
            Configure les identifiants Internet Banking pour scrape quotidien automatique
            des soldes et transactions. Secrets stockés chiffrés <b>AES-256-GCM</b>.
            Banques supportées : MCB, SBM, ABC, MauBank, MyT Money, AfrAsia, Bank One.
          </p>
          <p className="mt-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2 flex items-start gap-2">
            <KeyRound className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              <b>Où saisir le login et le mot de passe ?</b> Ajoute un compte bancaire ci-dessus,
              puis sur sa carte clique <b>« Configurer l'accès (login / mot de passe) »</b> pour
              saisir l'identifiant et le mot de passe Internet Banking.
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setCreating(v => !v)} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-1" /> {t('scp.add_bank_account', locale)}
          </Button>
          <PageHelp />
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2"><AlertCircle className="h-4 w-4 mt-0.5" />{error}</div>}
      {success && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5" />{success}</div>}

      {creating && (
        <Card>
          <CardHeader><CardTitle className="text-base">Nouveau compte bancaire</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Banque <span className="text-red-500">*</span></label>
                <select
                  value={newAccount.banque}
                  onChange={e => setNewAccount(s => ({ ...s, banque: e.target.value }))}
                  className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5"
                >
                  <option>MCB</option>
                  <option>SBM</option>
                  <option>ABC Banking</option>
                  <option>MauBank</option>
                  <option>MyT Money</option>
                  <option>AfrAsia</option>
                  <option>Bank One</option>
                  <option>Standard Chartered</option>
                  <option>HSBC</option>
                  <option>Barclays</option>
                  <option>Autre</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Nom du compte (libellé)</label>
                <input
                  type="text"
                  value={newAccount.nom_compte}
                  onChange={e => setNewAccount(s => ({ ...s, nom_compte: e.target.value }))}
                  placeholder="ex: Compte courant principal"
                  className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Numéro de compte</label>
                <input
                  type="text"
                  value={newAccount.numero_compte}
                  onChange={e => setNewAccount(s => ({ ...s, numero_compte: e.target.value }))}
                  placeholder="ex: 000123456789"
                  className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Devise</label>
                <select
                  value={newAccount.devise}
                  onChange={e => setNewAccount(s => ({ ...s, devise: e.target.value }))}
                  className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5"
                >
                  <option>MUR</option>
                  <option>EUR</option>
                  <option>USD</option>
                  <option>GBP</option>
                  <option>ZAR</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">IBAN</label>
                <input
                  type="text"
                  value={newAccount.iban}
                  onChange={e => setNewAccount(s => ({ ...s, iban: e.target.value }))}
                  placeholder="MU17BOMM0101101030300200000MUR"
                  className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">SWIFT / BIC</label>
                <input
                  type="text"
                  value={newAccount.swift}
                  onChange={e => setNewAccount(s => ({ ...s, swift: e.target.value }))}
                  placeholder="MCBLMUMU"
                  className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newAccount.compte_principal}
                onChange={e => setNewAccount(s => ({ ...s, compte_principal: e.target.checked }))}
              />
              <span>Marquer comme compte principal</span>
            </label>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setCreating(false)} variant="outline">Annuler</Button>
              <Button onClick={createAccount} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Save className="h-4 w-4 mr-1" /> {t('scp.create_account', locale)}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {comptes.length === 0 && !creating ? (
        <Card><CardContent className="py-8 text-center text-slate-500">
          {t('scp.no_bank_account', locale)} Clique sur <b>Ajouter un compte bancaire</b> ci-dessus pour en créer un,
          puis sur sa carte clique <b>« Configurer l'accès »</b> pour saisir le login et le mot de passe Internet Banking.
        </CardContent></Card>
      ) : comptes.map(cb => (
        <Card key={cb.id}>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>
                {cb.banque || 'Banque ?'} · {cb.numero_compte || cb.intitule || cb.id}
                {cb.devise && <span className="text-xs text-slate-500 ml-2">({cb.devise})</span>}
              </span>
              <div className="flex gap-2">
                {cb.scraping?.configured ? (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-xs">Configuré</Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">Non configuré</Badge>
                )}
                {cb.scraping?.last_scrape_status === 'success' && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-xs">Dernier scrape OK</Badge>
                )}
                {cb.scraping?.last_scrape_status === 'failed' && (
                  <Badge className="bg-red-100 text-red-700 border-red-300 text-xs">Échec</Badge>
                )}
                {cb.scraping?.last_scrape_status === 'manual_needed' && (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">Manuel</Badge>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-slate-500">Solde officiel</div>
                <div className="font-mono">{cb.solde_actuel?.toLocaleString('fr-FR') || '—'} {cb.devise || 'MUR'}</div>
              </div>
              <div>
                <div className="text-slate-500">Solde scrapé</div>
                <div className="font-mono">{cb.scraping?.last_balance_mur?.toLocaleString('fr-FR') || '—'} MUR</div>
              </div>
              <div>
                <div className="text-slate-500">Dernier scrape</div>
                <div>{cb.scraping?.last_scrape_at ? new Date(cb.scraping.last_scrape_at).toLocaleString('fr-FR') : '—'}</div>
                {cb.scraping?.last_scrape_error && <div className="text-red-600 text-[10px] mt-1">{cb.scraping.last_scrape_error.slice(0, 100)}</div>}
              </div>
            </div>

            {editing === cb.id ? (
              <div className="space-y-3 border-t pt-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    Username Internet Banking
                    {cb.scraping?.has_username && <span className="text-emerald-600 ml-2">(déjà configuré — laisse vide pour ne pas changer)</span>}
                  </label>
                  <input
                    type="text"
                    value={usernames[cb.id] || ''}
                    onChange={e => setUsernames(p => ({ ...p, [cb.id]: e.target.value }))}
                    className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    Password
                    {cb.scraping?.has_password && <span className="text-emerald-600 ml-2">(déjà configuré)</span>}
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type={showPwd[cb.id] ? 'text' : 'password'}
                      value={passwords[cb.id] || ''}
                      onChange={e => setPasswords(p => ({ ...p, [cb.id]: e.target.value }))}
                      className="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowPwd(p => ({ ...p, [cb.id]: !p[cb.id] }))}>
                      {showPwd[cb.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    PIN secondaire (optionnel — certains comptes business)
                    {cb.scraping?.has_pin && <span className="text-emerald-600 ml-2">(configuré)</span>}
                  </label>
                  <input
                    type={showPwd[cb.id] ? 'text' : 'password'}
                    value={pins[cb.id] || ''}
                    onChange={e => setPins(p => ({ ...p, [cb.id]: e.target.value }))}
                    className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Notes</label>
                  <textarea
                    value={notes[cb.id] || ''}
                    onChange={e => setNotes(p => ({ ...p, [cb.id]: e.target.value }))}
                    rows={2}
                    className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5"
                    placeholder="ex: PIN change tous les 90j. Compte joint avec X."
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={actives[cb.id] ?? true}
                    onChange={e => setActives(p => ({ ...p, [cb.id]: e.target.checked }))}
                  />
                  <span>Scraping automatique activé</span>
                </label>
                <div className="flex justify-end gap-2">
                  <Button onClick={() => setEditing(null)} variant="outline">Annuler</Button>
                  <Button onClick={() => save(cb.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Save className="h-4 w-4 mr-1" /> Enregistrer (chiffré)
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 pt-2 border-t">
                {!cb.scraping?.configured && (
                  <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1.5 flex items-center gap-1.5">
                    <KeyRound className="h-3 w-3 shrink-0" />
                    Accès non configuré — cliquez <b>« Configurer l'accès »</b> pour saisir le login et le mot de passe Internet Banking.
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={() => scrapeNow(cb.id)}
                    disabled={!cb.scraping?.configured || scrapingNow === cb.id}
                    variant="outline" size="sm">
                    {scrapingNow === cb.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                    Scraper maintenant
                  </Button>
                  <Button
                    onClick={() => setEditing(cb.id)}
                    size="sm"
                    className={cb.scraping?.configured
                      ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
                      : "bg-blue-600 hover:bg-blue-700 text-white"}>
                    <KeyRound className="h-3 w-3 mr-1" />
                    {cb.scraping?.configured ? "Modifier l'accès" : "Configurer l'accès (login / mot de passe)"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <div className="text-xs text-slate-500 flex items-start gap-2 p-3 rounded bg-amber-50 border border-amber-200">
        <AlertCircle className="h-4 w-4 mt-0.5 text-amber-700" />
        <div>
          <strong>Sécurité :</strong> les credentials sont chiffrés AES-256-GCM avec env <code>CRYPT_KEY</code>.
          Le robot Playwright tourne sur Vercel en isolé pour chaque scrape, sans laisser les credentials en mémoire après usage.
          Si ta banque a un 2FA / OTP / CAPTCHA → le scrape échouera et tu seras notifié via Telegram pour intervenir manuellement.
          Le robot Playwright n'est pas encore activé (stub) — tu peux configurer les credentials dès maintenant, ils seront utilisés
          quand on déploiera le robot.
        </div>
      </div>
    </div>
  )
}
