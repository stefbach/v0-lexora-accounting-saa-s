"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, ShieldCheck, Lock } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

const NAVY = "#0B0F2E"

const panelStyle: React.CSSProperties = {
  border: "1px solid #D8DFED",
  borderRadius: 18,
  background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(15,23,42,0.16)",
}

interface UserPerm {
  id: string
  email: string | null
  full_name: string | null
  role: string
  locked: boolean
  can_view: boolean
  can_import: boolean
  can_enrich: boolean
  can_delete: boolean
}

type PermKey = "can_view" | "can_import" | "can_enrich" | "can_delete"

const ACTIONS: { key: PermKey; label: string; hint: string }[] = [
  { key: "can_view", label: "Consulter", hint: "Voir les prospects et lancer une recherche" },
  { key: "can_import", label: "Importer", hint: "Garder des sociétés en base" },
  { key: "can_enrich", label: "Enrichir", hint: "Analyse IA — consomme des crédits" },
  { key: "can_delete", label: "Supprimer", hint: "Supprimer prospects / contacts" },
]

export default function AccessPage() {
  const { toast } = useToast()
  const [users, setUsers] = useState<UserPerm[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/crm/permissions")
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Erreur chargement")
      setUsers(json.data || [])
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggle = (id: string, key: PermKey, value: boolean) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, [key]: value } : u)))
  }

  const save = async (u: UserPerm) => {
    setSavingId(u.id)
    try {
      const res = await fetch("/api/crm/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: u.id,
          can_view: u.can_view,
          can_import: u.can_import,
          can_enrich: u.can_enrich,
          can_delete: u.can_delete,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Erreur enregistrement")
      toast({ title: "Permissions enregistrées" })
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2" style={{ color: NAVY }}>
          <ShieldCheck className="h-7 w-7" /> Accès & permissions
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Définissez, action par action, ce que chaque commercial peut faire dans le CRM.
          Les administrateurs ont toujours tous les droits.
        </p>
      </div>

      <Card style={panelStyle}>
        <CardHeader><CardTitle className="text-base">Utilisateurs CRM</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">Aucun utilisateur CRM trouvé.</p>
          ) : (
            <div className="space-y-3">
              {users.map((u) => (
                <div key={u.id} className="rounded-lg border bg-white p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate" style={{ color: NAVY }}>
                        {u.full_name || u.email || u.id}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    </div>
                    <Badge variant={u.locked ? "default" : "secondary"} className="shrink-0">
                      {u.role}
                    </Badge>
                  </div>

                  {u.locked ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Lock className="h-3.5 w-3.5" /> Tous les droits (non modifiable)
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-4">
                      {ACTIONS.map((a) => (
                        <label key={a.key} className="flex items-center gap-2 text-sm cursor-pointer" title={a.hint}>
                          <Checkbox
                            checked={u[a.key]}
                            onCheckedChange={(v) => toggle(u.id, a.key, Boolean(v))}
                          />
                          {a.label}
                        </label>
                      ))}
                      <Button
                        size="sm"
                        onClick={() => save(u)}
                        disabled={savingId === u.id}
                        style={{ backgroundColor: NAVY, color: "white" }}
                        className="ml-auto"
                      >
                        {savingId === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
