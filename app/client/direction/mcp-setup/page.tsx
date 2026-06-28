"use client"

/**
 * Setup MCP — gestion des clés API + commande d'installation.
 *
 * Flow utilisateur :
 *   1. Génère une clé API (POST /api/client/user-api-keys, label libre)
 *   2. Copie le token (affiché UNE seule fois)
 *   3. Lance la commande d'install adaptée à son OS (Mac/Linux/Windows)
 *   4. Colle URL + clé quand le script demande
 *
 * Sécurité : la clé est hashée en DB. La page liste les clés actives
 * (prefix uniquement). Possibilité de révoquer instantanément.
 */

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import {
  Copy, Check, AlertCircle, Terminal, Apple, Monitor, Sparkles,
  Plus, Trash2, Key, Loader2, AlertTriangle,
} from "lucide-react"
import { t, getLocale } from "@/lib/i18n"

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  last_used_at: string | null
  created_at: string
}

export default function McpSetupPage() {
  const locale = getLocale()
  const [origin, setOrigin] = useState<string>("")
  const [copied, setCopied] = useState<string | null>(null)

  // Clés API
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loadingKeys, setLoadingKeys] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [generating, setGenerating] = useState(false)
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setOrigin(window.location.origin) }, [])

  const loadKeys = useCallback(async () => {
    setLoadingKeys(true)
    try {
      const res = await fetch('/api/client/user-api-keys')
      const data = await res.json()
      if (res.ok) setKeys(data.keys || [])
    } finally {
      setLoadingKeys(false)
    }
  }, [])

  useEffect(() => { loadKeys() }, [loadKeys])

  const copy = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const createKey = async () => {
    if (!newKeyName.trim() || generating) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/client/user-api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('scp.mcp_create_error', locale))
      setFreshToken(data.token)
      setNewKeyName("")
      await loadKeys()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('scp.mcp_unknown_error', locale))
    } finally {
      setGenerating(false)
    }
  }

  const revokeKey = async (id: string) => {
    if (!confirm(t('scp.mcp_revoke_confirm', locale))) return
    try {
      const res = await fetch(`/api/client/user-api-keys/${id}`, { method: 'DELETE' })
      if (res.ok) await loadKeys()
    } catch {
      // silencieux — l'utilisateur peut réessayer
    }
  }

  const cmdBash = `curl -fsSL ${origin}/install-mcp.sh | bash`
  const cmdPwsh = `iwr -useb ${origin}/install-mcp.ps1 | iex`

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-50 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-3 text-white shadow-md">
              <Sparkles className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-violet-900">{t('scp.mcp_title', locale)}</h1>
              <p className="text-sm text-violet-700/80 mt-0.5">{t('scp.mcp_subtitle', locale)}</p>
            </div>
          </div>
        </div>

        {/* ── Étape 1 : Générer une clé API ──────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Badge className="bg-violet-600">1</Badge>
              <Key className="w-4 h-4" />
              {t('scp.mcp_gen_key', locale)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-600">{t('scp.mcp_key_desc', locale)}</p>

            {/* Affichage du token fraîchement créé */}
            {freshToken && (
              <div className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  {t('scp.mcp_copy_now', locale)}
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white border px-2 py-1.5 rounded font-mono break-all">
                    {freshToken}
                  </code>
                  <Button
                    size="sm"
                    onClick={() => copy('fresh', freshToken)}
                    className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                  >
                    {copied === 'fresh' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied === 'fresh' ? ' ' + t('scp.mcp_copied', locale) : ' ' + t('scp.mcp_copy', locale)}
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => setFreshToken(null)}
                  className="text-xs text-amber-800 underline"
                >
                  {t('scp.mcp_copied_hide', locale)}
                </button>
              </div>
            )}

            {/* Form création */}
            {!freshToken && (
              <div className="flex gap-2">
                <Input
                  placeholder={t('scp.mcp_key_name_ph', locale)}
                  value={newKeyName}
                  onChange={e => setNewKeyName(e.target.value)}
                  disabled={generating}
                  maxLength={80}
                />
                <Button
                  onClick={createKey}
                  disabled={!newKeyName.trim() || generating}
                  className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                  {t('cui.create', locale)}
                </Button>
              </div>
            )}

            {error && (
              <div className="text-xs text-red-700 bg-red-50 px-3 py-2 rounded">{error}</div>
            )}

            {/* Liste des clés actives */}
            <div className="mt-4">
              <h3 className="text-xs font-semibold text-gray-600 mb-2">{t('scp.mcp_active_keys', locale)}</h3>
              {loadingKeys ? (
                <p className="text-xs text-gray-400 italic">{t('cui.loading', locale)}</p>
              ) : keys.length === 0 ? (
                <p className="text-xs text-gray-500 italic">{t('scp.mcp_no_keys', locale)}</p>
              ) : (
                <div className="space-y-1.5">
                  {keys.map(k => (
                    <div key={k.id} className="flex items-center gap-2 border border-gray-200 rounded-md p-2 text-xs">
                      <Key className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{k.name}</div>
                        <div className="text-gray-500 font-mono">{k.key_prefix}…</div>
                      </div>
                      <div className="text-gray-400 shrink-0">
                        {k.last_used_at
                          ? `${t('scp.mcp_used_on', locale)} ${new Date(k.last_used_at).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR')}`
                          : t('scp.mcp_never_used', locale)}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => revokeKey(k.id)}
                        className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Étape 2 : Pré-requis OS ───────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Badge className="bg-violet-600">2</Badge>
              <AlertCircle className="w-4 h-4 text-amber-600" />
              {t('scp.mcp_prereqs', locale)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2">
              <Badge variant="outline" className="shrink-0">•</Badge>
              <div>
                <b>{t('scp.mcp_claude_installed', locale)}</b>{" "}
                <a className="text-blue-600 underline" href="https://claude.ai/download" target="_blank" rel="noreferrer">
                  {t('scp.mcp_download', locale)}
                </a>
              </div>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="shrink-0">•</Badge>
              <div>
                <b>Node.js v18+.</b>{" "}
                <a className="text-blue-600 underline" href="https://nodejs.org/" target="_blank" rel="noreferrer">
                  {t('scp.mcp_download_node', locale)}
                </a>
                {" "}(Mac : <code className="bg-gray-100 px-1 rounded">brew install node</code>)
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Étape 3 : Commande Mac/Linux ──────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Badge className="bg-violet-600">3</Badge>
              <Apple className="w-4 h-4" />
              {t('scp.mcp_mac_linux', locale)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-600">{t('scp.mcp_mac_hint', locale)}</p>
            <CodeBlock
              code={cmdBash}
              copied={copied === "bash"}
              onCopy={() => copy("bash", cmdBash)}
            />
          </CardContent>
        </Card>

        {/* ── Étape 4 : Commande Windows ───────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Badge className="bg-violet-600">4</Badge>
              <Monitor className="w-4 h-4" />
              {t('scp.mcp_windows', locale)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-600">{t('scp.mcp_win_hint', locale)}</p>
            <CodeBlock
              code={cmdPwsh}
              copied={copied === "pwsh"}
              onCopy={() => copy("pwsh", cmdPwsh)}
            />
            <p className="text-xs text-gray-500">
              {t('scp.mcp_pwsh_fallback', locale)}
              <code className="block mt-1 bg-gray-100 px-2 py-1 rounded text-[11px]">
                powershell -ExecutionPolicy Bypass -Command "{cmdPwsh}"
              </code>
            </p>
          </CardContent>
        </Card>

        {/* ── Étape 5 : Test ───────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Badge className="bg-violet-600">5</Badge>
              Test
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ol className="list-decimal list-inside space-y-1.5">
              <li>{t('scp.mcp_step_quit', locale)}</li>
              <li>{t('scp.mcp_step_relaunch', locale)}</li>
              <li>
                {t('scp.mcp_step_type', locale)}{" "}
                <span className="inline-block bg-violet-100 text-violet-900 px-2 py-0.5 rounded font-mono text-xs">
                  {t('scp.mcp_example_query', locale)}
                </span>
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </ClientPageShell>
  )
}

function CodeBlock({ code, copied, onCopy }: { code: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="relative">
      <pre className="bg-slate-900 text-slate-100 text-xs p-3 pr-20 rounded-md overflow-x-auto font-mono">
        <Terminal className="w-3.5 h-3.5 inline mr-2 text-slate-400" />
        {code}
      </pre>
      <Button
        variant="outline"
        size="sm"
        onClick={onCopy}
        className="absolute top-2 right-2 h-7"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
      </Button>
    </div>
  )
}
