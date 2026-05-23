"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, Copy, Trash2, Plus, AlertCircle, CheckCircle2 } from 'lucide-react'

type ApiKey = {
  id: string
  name: string
  description?: string
  key_preview: string
  created_at: string
  last_used_at?: string
  expires_at?: string
  is_active: boolean
  scopes?: string[]
}

export default function ApiKeysPage() {
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
        <h1 className="text-3xl font-bold">Clés API</h1>
        <p className="text-sm text-gray-600 mt-1">
          Gérez les clés pour l&apos;intégration MCP (Claude, n8n, etc)
        </p>
      </div>

      {/* Created Key Modal */}
      {createdKey && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Clé API créée
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-white p-3 rounded font-mono text-sm break-all border">
              {createdKey.key}
            </div>
            <Button
              onClick={() => copyToClipboard(createdKey.key)}
              className="w-full"
            >
              <Copy className="h-4 w-4 mr-2" />
              {copied ? 'Copié !' : 'Copier la clé'}
            </Button>
            <p className="text-sm text-red-600 font-semibold">
              {createdKey.warning}
            </p>
            <Button
              onClick={() => setCreatedKey(null)}
              variant="outline"
              className="w-full"
            >
              Fermer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create New Key Form */}
      <Card>
        <CardHeader>
          <CardTitle>Créer une nouvelle clé API</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nom</label>
            <Input
              placeholder="Ex: MCP Claude Desktop"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description (optionnelle)</label>
            <Input
              placeholder="Ex: Pour intégration Claude Desktop"
              value={newKeyDescription}
              onChange={(e) => setNewKeyDescription(e.target.value)}
            />
          </div>
          <Button
            onClick={handleCreateKey}
            disabled={!newKeyName.trim() || creatingKey}
            className="w-full"
          >
            {creatingKey ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Création...
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
          <CardTitle>Vos clés API</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement...
            </div>
          ) : keys.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune clé API créée</p>
          ) : (
            <div className="space-y-3">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{key.name}</span>
                      <Badge variant="outline" className="font-mono text-xs">
                        {key.key_preview}
                      </Badge>
                      {!key.is_active && (
                        <Badge variant="destructive">Révoquée</Badge>
                      )}
                    </div>
                    {key.description && (
                      <p className="text-sm text-gray-600 mt-1">{key.description}</p>
                    )}
                    <div className="flex gap-4 mt-2 text-xs text-gray-500">
                      <span>Créée: {new Date(key.created_at).toLocaleDateString('fr-FR')}</span>
                      {key.last_used_at && (
                        <span>
                          Dernière utilisation: {new Date(key.last_used_at).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                      {key.expires_at && (
                        <span>
                          Expire: {new Date(key.expires_at).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={() => handleDeleteKey(key.id)}
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Setup Instructions */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-blue-600" />
            Comment utiliser avec Claude Desktop
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal list-inside space-y-2">
            <li>Créez une clé API ci-dessus</li>
            <li>Éditez votre config Claude Desktop:
              <ul className="list-disc list-inside ml-4 mt-1">
                <li>Mac: <code className="bg-white px-1">~/Library/Application Support/Claude/claude_desktop_config.json</code></li>
                <li>Windows: <code className="bg-white px-1">%APPDATA%/Claude/claude_desktop_config.json</code></li>
              </ul>
            </li>
            <li>Ajoutez ce bloc JSON:
              <pre className="bg-white p-2 rounded mt-1 overflow-auto text-xs">
{`{
  "mcpServers": {
    "lexora": {
      "command": "node",
      "args": ["/chemin/vers/mcp-server/dist/index.js"],
      "env": {
        "LEXORA_API_URL": "https://your-lexora-instance.com",
        "LEXORA_API_KEY": "sk_live_..."
      }
    }
  }
}`}
              </pre>
            </li>
            <li>Redémarrez Claude Desktop</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
