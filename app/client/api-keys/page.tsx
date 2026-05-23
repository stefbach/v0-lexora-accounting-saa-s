"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, Copy, Trash2, Plus, CheckCircle2, Key } from 'lucide-react'

type ApiKey = {
  id: string
  name: string
  description?: string
  key_preview: string
  created_at: string
  last_used_at?: string
  is_active: boolean
}

export default function ClientApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingKey, setCreatingKey] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyDescription, setNewKeyDescription] = useState('')
  const [createdKey, setCreatedKey] = useState<{ key: string; preview: string; warning: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const loadKeys = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/auth/api-keys')
      const data = await res.json()
      setKeys(data.keys || [])
    } catch (err) {
      console.error('Failed to load API keys:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadKeys()
  }, [])

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return

    try {
      setCreatingKey(true)
      const res = await fetch('/api/auth/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName,
          description: newKeyDescription || undefined
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setCreatedKey({
        key: data.key,
        preview: data.preview,
        warning: data.warning
      })
      setNewKeyName('')
      setNewKeyDescription('')
      await loadKeys()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert('Erreur: ' + message)
    } finally {
      setCreatingKey(false)
    }
  }

  const handleDeleteKey = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir révoquer cette clé ?')) return

    try {
      const res = await fetch(`/api/auth/api-keys/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      await loadKeys()
    } catch {
      alert('Erreur lors de la suppression')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Key className="h-8 w-8 text-indigo-600" />
          Mes Clés API
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Créez et gérez les clés pour intégrer Lexora avec Claude, n8n, ou d&apos;autres outils
        </p>
      </div>

      {/* Created Key Modal */}
      {createdKey && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Clé API créée avec succès
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-white p-4 rounded font-mono text-sm break-all border border-green-200">
              {createdKey.key}
            </div>
            <Button
              onClick={() => copyToClipboard(createdKey.key)}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              <Copy className="h-4 w-4 mr-2" />
              {copied ? 'Copié !' : 'Copier la clé'}
            </Button>
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-sm text-red-700 font-semibold">
                ⚠️ {createdKey.warning}
              </p>
            </div>
            <Button
              onClick={() => setCreatedKey(null)}
              variant="outline"
              className="w-full"
            >
              Fermer et continuer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create New Key Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Créer une nouvelle clé API
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Nom de la clé *</label>
            <Input
              placeholder="Ex: Claude Desktop MCP"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">Entre 3 et 100 caractères</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Description (optionnelle)</label>
            <Input
              placeholder="Ex: Pour synchroniser mon comptabilité avec Claude"
              value={newKeyDescription}
              onChange={(e) => setNewKeyDescription(e.target.value)}
            />
          </div>
          <Button
            onClick={handleCreateKey}
            disabled={!newKeyName.trim() || creatingKey}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
          >
            {creatingKey ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Création en cours...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Créer une clé
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* List of Keys */}
      <Card>
        <CardHeader>
          <CardTitle>Vos clés API actives</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-gray-500 py-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement des clés...
            </div>
          ) : keys.length === 0 ? (
            <div className="text-center py-8">
              <Key className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Aucune clé API créée pour le moment</p>
            </div>
          ) : (
            <div className="space-y-3">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-900">{key.name}</span>
                      <Badge variant="secondary" className="font-mono text-xs flex-shrink-0">
                        {key.key_preview}
                      </Badge>
                      {!key.is_active && (
                        <Badge variant="destructive">Révoquée</Badge>
                      )}
                    </div>
                    {key.description && (
                      <p className="text-sm text-gray-600 mt-2">{key.description}</p>
                    )}
                    <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
                      <span>📅 Créée: {new Date(key.created_at).toLocaleDateString('fr-FR')}</span>
                      {key.last_used_at && (
                        <span>
                          ⏱️ Dernière utilisation: {new Date(key.last_used_at).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={() => handleDeleteKey(key.id)}
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0 ml-2"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Examples */}
      <Card>
        <CardHeader>
          <CardTitle>Guide d&apos;utilisation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <h3 className="font-semibold mb-2">1. Utiliser avec Claude Desktop</h3>
            <ol className="list-decimal list-inside space-y-1 text-gray-700">
              <li>Créez une clé API ci-dessus</li>
              <li>Trouvez votre fichier de configuration Claude:
                <ul className="list-disc list-inside ml-6 mt-1 text-xs">
                  <li className="text-gray-600">Mac: <code className="bg-gray-100 px-1 py-0.5 rounded">~/Library/Application Support/Claude/claude_desktop_config.json</code></li>
                  <li className="text-gray-600">Windows: <code className="bg-gray-100 px-1 py-0.5 rounded">%APPDATA%\Claude\claude_desktop_config.json</code></li>
                </ul>
              </li>
              <li>Ajoutez ce bloc JSON avec votre clé</li>
              <li>Redémarrez Claude Desktop</li>
            </ol>
          </div>

          <div className="bg-gray-50 p-3 rounded border">
            <p className="font-semibold mb-2">Exemple de configuration:</p>
            <pre className="bg-white p-2 rounded text-xs overflow-auto border">
{`{
  "mcpServers": {
    "lexora": {
      "command": "npx",
      "args": ["@lexora/mcp-server"],
      "env": {
        "LEXORA_API_URL": "https://lexora-saas.vercel.app",
        "LEXORA_API_KEY": "sk_live_..."
      }
    }
  }
}`}
            </pre>
          </div>

          <div>
            <h3 className="font-semibold mb-2">2. Utiliser avec n8n</h3>
            <p className="text-gray-600">Créez un webhook n8n et passez votre clé en en-tête <code className="bg-gray-100 px-1">Authorization: Bearer sk_live_...</code></p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
