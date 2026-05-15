"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, KeyRound, Eye, EyeOff, AlertCircle, CheckCircle2, Save } from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { PageHelp } from "@/components/help/PageHelp"

export default function MraCredentialsPage() {
  const { societeId } = useSocieteActive()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [tan, setTan] = useState('')
  const [notes, setNotes] = useState('')
  const [active, setActive] = useState(true)
  const [showPwd, setShowPwd] = useState(false)
  const [showTan, setShowTan] = useState(false)

  const load = async () => {
    if (!societeId) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/client/direction/mra-credentials?societe_id=${societeId}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erreur')
      setData(j)
      setUsername(j.mra_username || '')
      setNotes(j.notes || '')
      setActive(j.active ?? true)
      setPassword('')   // jamais récupéré en clair
      setTan('')
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId])

  const save = async () => {
    setSaving(true); setError(null); setSuccess(null)
    try {
      const payload: any = {
        mra_username: username,
        notes,
        active,
      }
      if (password) payload.mra_password = password   // omis si laissé vide → garde l'ancien
      if (tan) payload.mra_tan = tan
      const r = await fetch(`/api/client/direction/mra-credentials?societe_id=${societeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erreur')
      setSuccess('Credentials MRA enregistrées et chiffrées.')
      setPassword(''); setTan('')
      await load()
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setSaving(false) }
  }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin h-5 w-5" /> Chargement…</div>

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><KeyRound className="h-6 w-6 text-red-600" /> Credentials MRA</h1>
          <p className="text-sm text-slate-500">
            Identifiants du portail MRA utilisés par le bot Telegram pour soumettre automatiquement
            les déclarations (PAYE, CSG/NSF, TDS, VAT). Stockés <b>chiffrés AES-256-GCM</b> côté serveur,
            jamais lus en clair dans l'UI.
          </p>
        </div>
        <PageHelp />
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2"><AlertCircle className="h-4 w-4 mt-0.5" />{error}</div>}
      {success && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5" />{success}</div>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Configuration accès MRA</span>
            {data?.configured && (
              <Badge className={active ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-slate-100 text-slate-600 border-slate-300"}>
                {active ? 'Actif' : 'Désactivé'}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-slate-500 mb-1">Statut</div>
              <div>
                {data?.configured
                  ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-xs">Configurée</Badge>
                  : <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">Non configurée</Badge>}
              </div>
            </div>
            <div>
              <div className="text-slate-500 mb-1">Dernière soumission</div>
              <div>{data?.last_submitted_at ? new Date(data.last_submitted_at).toLocaleString('fr-FR') : '—'}</div>
              {data?.last_submit_status && (
                <Badge className={
                  data.last_submit_status === 'success' ? 'bg-emerald-100 text-emerald-700 border-emerald-300 text-[10px]' :
                  data.last_submit_status === 'failed' ? 'bg-red-100 text-red-700 border-red-300 text-[10px]' :
                  'bg-amber-100 text-amber-700 border-amber-300 text-[10px]'
                }>{data.last_submit_status}</Badge>
              )}
              {data?.last_submit_error && <div className="text-red-600 mt-1">{data.last_submit_error}</div>}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Username MRA</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ex: ACME12345"
              className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">
              Mot de passe MRA
              {data?.has_password && <span className="text-emerald-600 ml-2">(déjà configuré — laisse vide pour ne pas changer)</span>}
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={data?.has_password ? '••••••••' : 'Mot de passe portail MRA'}
                className="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setShowPwd(s => !s)}>
                {showPwd ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">
              TAN (Tax Account Number) {data?.has_tan && <span className="text-emerald-600 ml-2">(configuré)</span>}
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type={showTan ? 'text' : 'password'}
                value={tan}
                onChange={(e) => setTan(e.target.value)}
                placeholder={data?.has_tan ? '••••••' : 'TAN si différent du username'}
                className="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5 font-mono"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setShowTan(s => !s)}>
                {showTan ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full text-sm border border-slate-300 rounded px-2 py-1.5"
              placeholder="ex: TAN partagé avec ROC. 2FA OTP activé côté MRA → soumission manuelle."
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>Soumission automatique active</span>
          </label>

          <div className="flex justify-end pt-2">
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Enregistrer (chiffré AES-256-GCM)
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-slate-500 flex items-start gap-2 p-3 rounded bg-amber-50 border border-amber-200">
        <AlertCircle className="h-4 w-4 mt-0.5 text-amber-700" />
        <div>
          <strong>Sécurité :</strong> les secrets sont chiffrés AES-256-GCM avec une clé d'application stockée hors DB
          (env <code>CRYPT_KEY</code>). Personne — pas même un admin Lexora — ne peut les lire en clair depuis l'UI.
          Seul le bot Telegram les déchiffre en mémoire pour le temps de la soumission MRA, puis les jette.
          Si MRA active un 2FA OTP sur ton compte, mets une note ici et le bot enverra les fichiers en PJ Telegram
          pour soumission manuelle au lieu de tenter la connexion auto.
        </div>
      </div>
    </div>
  )
}
