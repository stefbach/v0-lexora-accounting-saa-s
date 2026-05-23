"use client"

/**
 * Page Setup MCP — guide l'utilisateur pour connecter sa Lexora à Claude
 * Desktop en un copier-coller.
 *
 * Pédagogie :
 *  - Détecte automatiquement l'UUID utilisateur (depuis la session Supabase)
 *  - Détecte l'URL Lexora (window.location.origin)
 *  - Affiche les 2 commandes (Mac/Linux + Windows) prêtes à coller
 *  - Boutons "Copier" inline
 *  - Explique où récupérer le INTERNAL_API_TOKEN (admin Vercel) car c'est
 *    le seul morceau que l'utilisateur ne peut pas auto-détecter
 */

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { createClient } from "@/lib/supabase/client"
import { Copy, Check, AlertCircle, Terminal, Apple, Monitor, Sparkles } from "lucide-react"

export default function McpSetupPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [origin, setOrigin] = useState<string>("")
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    setOrigin(window.location.origin)
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        setUserEmail(user.email || null)
      }
    })()
  }, [])

  const copy = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
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
              <h1 className="text-2xl font-bold text-violet-900">Connecter Lexora à Claude Desktop</h1>
              <p className="text-sm text-violet-700/80 mt-0.5">
                Une commande, une question, c'est fini. Claude peut ensuite piloter ta compta.
              </p>
            </div>
          </div>
        </div>

        {/* Pré-requis */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              Avant de commencer — 3 choses à savoir
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex gap-2">
              <Badge variant="outline" className="shrink-0">1</Badge>
              <div>
                <b>Claude Desktop doit être installé</b> sur ton ordinateur.{" "}
                <a className="text-blue-600 underline" href="https://claude.ai/download" target="_blank" rel="noreferrer">
                  Télécharger
                </a>
              </div>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="shrink-0">2</Badge>
              <div>
                <b>Node.js v18+ doit être installé.</b>{" "}
                <a className="text-blue-600 underline" href="https://nodejs.org/" target="_blank" rel="noreferrer">
                  Télécharger Node.js
                </a>
                . Sur Mac, tu peux aussi installer via <code className="bg-gray-100 px-1 rounded">brew install node</code>.
              </div>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="shrink-0">3</Badge>
              <div>
                <b>Récupère le token interne Lexora.</b>
                Ton admin Lexora doit te donner la valeur de la variable{" "}
                <code className="bg-gray-100 px-1 rounded">INTERNAL_API_TOKEN</code> configurée dans Vercel
                (Settings → Environment Variables). Sans ça, le MCP ne peut pas s'authentifier.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ta config auto-détectée */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ta configuration auto-détectée</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Field
              label="URL Lexora"
              value={origin}
              copied={copied === "url"}
              onCopy={() => copy("url", origin)}
            />
            <Field
              label="Ton UUID utilisateur"
              value={userId || "(chargement…)"}
              copied={copied === "uid"}
              onCopy={() => userId && copy("uid", userId)}
              disabled={!userId}
            />
            <Field
              label="Ton email"
              value={userEmail || "(non disponible)"}
              copied={false}
              onCopy={() => {}}
              disabled
            />
          </CardContent>
        </Card>

        {/* Instructions Mac/Linux */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Apple className="w-4 h-4" />
              Mac ou Linux — Une commande
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-600">
              Ouvre le <b>Terminal</b> (Spotlight → "Terminal" sur Mac), colle la commande, presse Entrée.
              Le script te demandera 3-4 informations puis configurera Claude Desktop automatiquement.
            </p>
            <CodeBlock
              code={cmdBash}
              copied={copied === "bash"}
              onCopy={() => copy("bash", cmdBash)}
            />
            <p className="text-xs text-gray-500">
              Le script va : cloner Lexora dans <code>~/.lexora-mcp</code>, compiler le MCP, modifier ta config Claude Desktop.
              Sans risque pour le reste.
            </p>
          </CardContent>
        </Card>

        {/* Instructions Windows */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              Windows — Une commande
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-600">
              Ouvre <b>PowerShell</b> (menu Démarrer → tape "PowerShell"), colle la commande, presse Entrée.
              Le script te demandera 3-4 informations puis configurera Claude Desktop automatiquement.
            </p>
            <CodeBlock
              code={cmdPwsh}
              copied={copied === "pwsh"}
              onCopy={() => copy("pwsh", cmdPwsh)}
            />
            <p className="text-xs text-gray-500">
              Si PowerShell refuse d'exécuter le script (politique d'exécution), lance-le avec :
              <code className="block mt-1 bg-gray-100 px-2 py-1 rounded text-[11px]">
                powershell -ExecutionPolicy Bypass -Command "{cmdPwsh}"
              </code>
            </p>
          </CardContent>
        </Card>

        {/* Test final */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Une fois installé — Test rapide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ol className="list-decimal list-inside space-y-1.5">
              <li>
                <b>Quitte complètement Claude Desktop</b> (Cmd+Q sur Mac, clic droit sur l'icône systray sur Windows → Quit)
              </li>
              <li><b>Relance Claude Desktop</b></li>
              <li>
                Dans une nouvelle conversation, tape :{" "}
                <span className="inline-block bg-violet-100 text-violet-900 px-2 py-0.5 rounded font-mono text-xs">
                  Liste mes sociétés Lexora.
                </span>
              </li>
              <li>
                Claude devrait répondre avec la liste de tes sociétés (DDS, OCC, etc.) — preuve que le MCP fonctionne.
              </li>
            </ol>
            <p className="text-xs text-gray-500 mt-3">
              Si rien ne se passe : vérifie le log Claude Desktop dans{" "}
              <code className="bg-gray-100 px-1 rounded">~/Library/Logs/Claude/mcp-server-lexora.log</code> (Mac) ou{" "}
              <code className="bg-gray-100 px-1 rounded">%LOCALAPPDATA%\Claude\logs\mcp-server-lexora.log</code> (Windows).
            </p>
          </CardContent>
        </Card>
      </div>
    </ClientPageShell>
  )
}

// ── Petits composants utilitaires ─────────────────────────────────────

function Field({
  label, value, copied, onCopy, disabled,
}: {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-xs text-gray-500 w-32 shrink-0">{label}</div>
      <code className="flex-1 text-xs bg-gray-50 border border-gray-200 px-2 py-1.5 rounded truncate font-mono">
        {value}
      </code>
      <Button
        variant="outline"
        size="sm"
        onClick={onCopy}
        disabled={disabled}
        className="shrink-0 h-8"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
      </Button>
    </div>
  )
}

function CodeBlock({
  code, copied, onCopy,
}: {
  code: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="relative">
      <pre className="bg-slate-900 text-slate-100 text-xs p-3 pr-12 rounded-md overflow-x-auto font-mono">
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
