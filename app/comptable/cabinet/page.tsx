"use client"

/**
 * Page /comptable/cabinet — Dashboard cabinet (Sprint 2/5).
 *
 * Vue centrale du comptable / collaborateur :
 *   - 4 KPIs globaux (clients, collaborateurs, impayé total, factures retard)
 *   - Liste portefeuille clients avec KPIs par client + tags + notes (count)
 *   - Onglet "Collaborateurs" pour gérer accès et scopes
 *   - Onglet "Tags" pour gérer la palette du cabinet
 *
 * Le bouton "Entrer dans le dossier" (Sprint 3) prendra en charge le
 * mode "Acting as client" qui redirigera sur /client/* en vue cabinet.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Loader2,
  Users,
  Building2,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  Tag as TagIcon,
  Search,
  ChevronRight,
  Shield,
  StickyNote,
} from "lucide-react"
import { t, getLocale } from "@/lib/i18n"

interface ClientItem {
  id: string
  nom: string
  brn: string | null
  vat_number: string | null
  regime: string | null
  devise_defaut: string
  created_at: string
  kpi: {
    ca_ytd_mur: number
    nb_impayees: number
    montant_impaye_mur: number
    nb_retard: number
  }
  tag_ids: string[]
  collaborateurs: Array<{ collaborateur_id: string; scope: string }>
}

interface Collaborateur {
  id: string
  full_name: string | null
  email: string
  role: string
  is_active: boolean | null
  created_at: string
}

interface Tag {
  id: string
  libelle: string
  couleur: string
  icone: string | null
}

interface DashboardData {
  user_info: { is_dirigeant: boolean; cabinet_owner_id: string; role: string }
  clients: ClientItem[]
  collaborateurs: Collaborateur[]
  tags: Tag[]
  stats: {
    nb_clients: number
    nb_collaborateurs: number
    total_impaye_mur: number
    total_ca_ytd_mur: number
    total_factures_retard: number
  }
}

function fmtMur(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " MUR"
}

export default function CabinetDashboardPage() {
  const locale = getLocale()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterTag, setFilterTag] = useState<string>("")
  const [newTagLibelle, setNewTagLibelle] = useState("")
  const [newTagColor, setNewTagColor] = useState("#0B0F2E")
  const [creatingTag, setCreatingTag] = useState(false)
  const [entering, setEntering] = useState<string | null>(null) // société_id en cours
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  async function enterDossier(societeId: string, societeNom: string) {
    setEntering(societeId)
    try {
      const r = await fetch("/api/comptable/act-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "Erreur entrée dossier")
      showToast(`Entrée dans le dossier ${societeNom}`, "success")
      // Petit délai pour laisser le toast s'afficher, puis bascule
      setTimeout(() => {
        window.location.href = "/client/tableau-de-bord"
      }, 400)
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
      setEntering(null)
    }
  }

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch("/api/comptable/cabinet")
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "Erreur chargement")
      setData(j)
    } catch (e: any) {
      setError(e?.message || "Erreur")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filteredClients = useMemo(() => {
    if (!data) return []
    let list = data.clients
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c =>
        c.nom?.toLowerCase().includes(q) ||
        c.brn?.toLowerCase().includes(q) ||
        c.vat_number?.toLowerCase().includes(q)
      )
    }
    if (filterTag) list = list.filter(c => c.tag_ids.includes(filterTag))
    return list.sort((a, b) => a.nom.localeCompare(b.nom))
  }, [data, search, filterTag])

  async function createTag() {
    if (!newTagLibelle.trim()) return
    setCreatingTag(true)
    try {
      const r = await fetch("/api/comptable/cabinet/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ libelle: newTagLibelle.trim(), couleur: newTagColor }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      setNewTagLibelle("")
      showToast("Tag créé", "success")
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur création tag", "error")
    } finally {
      setCreatingTag(false)
    }
  }

  async function deleteTag(tagId: string) {
    if (!confirm("Supprimer ce tag ? Il sera retiré de tous les clients.")) return
    try {
      const r = await fetch(`/api/comptable/cabinet/tags?id=${tagId}`, { method: "DELETE" })
      if (!r.ok) throw new Error((await r.json()).error)
      showToast("Tag supprimé")
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    }
  }

  async function toggleTag(tagId: string, societeId: string) {
    try {
      const r = await fetch(`/api/comptable/cabinet/tags?tag_id=${tagId}&societe_id=${societeId}`, { method: "PUT" })
      if (!r.ok) throw new Error((await r.json()).error)
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-[#0B0F2E]" />
            Mes Clients
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data.user_info.is_dirigeant
              ? "Pilotage du portefeuille — KPIs, tags, collaborateurs, entrée dans le dossier"
              : "Vos clients assignés"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Rafraîchir
        </Button>
      </div>

      {/* KPIs globaux */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<Building2 className="h-4 w-4" />}
          label="Clients gérés"
          value={data.stats.nb_clients}
          tone="blue"
        />
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="Collaborateurs"
          value={data.stats.nb_collaborateurs}
          tone="purple"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Total impayé"
          value={fmtMur(data.stats.total_impaye_mur)}
          tone="rose"
          isText
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Factures en retard"
          value={data.stats.total_factures_retard}
          tone="amber"
        />
      </div>

      <Tabs defaultValue="clients">
        <TabsList>
          <TabsTrigger value="clients">
            Clients
            <Badge className="ml-2 bg-blue-100 text-blue-700 border-blue-200 text-[10px]">{data.stats.nb_clients}</Badge>
          </TabsTrigger>
          {data.user_info.is_dirigeant && (
            <TabsTrigger value="collaborateurs">
              Collaborateurs
              <Badge className="ml-2 bg-purple-100 text-purple-700 border-purple-200 text-[10px]">{data.stats.nb_collaborateurs}</Badge>
            </TabsTrigger>
          )}
          <TabsTrigger value="tags">
            Tags
            <Badge className="ml-2 bg-gray-100 text-gray-700 border-gray-200 text-[10px]">{data.tags.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* CLIENTS */}
        <TabsContent value="clients">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher nom, BRN, VAT…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {data.tags.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">Filtrer :</span>
                    <button
                      onClick={() => setFilterTag("")}
                      className={`text-[11px] px-2 py-0.5 rounded border ${filterTag === "" ? "bg-[#0B0F2E] text-white border-[#0B0F2E]" : "bg-white text-gray-600 border-gray-200"}`}
                    >
                      Tous
                    </button>
                    {data.tags.map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => setFilterTag(tag.id === filterTag ? "" : tag.id)}
                        className="text-[11px] px-2 py-0.5 rounded border"
                        style={{
                          backgroundColor: filterTag === tag.id ? tag.couleur : `${tag.couleur}15`,
                          color: filterTag === tag.id ? "white" : tag.couleur,
                          borderColor: tag.couleur,
                        }}
                      >
                        {tag.libelle}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredClients.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Aucun client à afficher.
                </p>
              ) : (
                <div className="divide-y">
                  {filteredClients.map(c => (
                    <div key={c.id} className="p-3 hover:bg-muted/20 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">{c.nom}</h3>
                          {c.brn && (
                            <Badge variant="outline" className="text-[10px]">BRN {c.brn}</Badge>
                          )}
                          {c.regime && c.regime !== "domestic" && (
                            <Badge className="text-[10px] bg-indigo-100 text-indigo-700 border-indigo-200">
                              {c.regime.toUpperCase()}
                            </Badge>
                          )}
                          {c.tag_ids.map(tagId => {
                            const tag = data.tags.find(t => t.id === tagId)
                            if (!tag) return null
                            return (
                              <Badge
                                key={tagId}
                                className="text-[10px] border"
                                style={{
                                  backgroundColor: `${tag.couleur}15`,
                                  color: tag.couleur,
                                  borderColor: tag.couleur,
                                }}
                              >
                                {tag.libelle}
                              </Badge>
                            )
                          })}
                        </div>
                        <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                          <span>CA YTD : <span className="font-medium text-emerald-700">{fmtMur(c.kpi.ca_ytd_mur)}</span></span>
                          {c.kpi.montant_impaye_mur > 0 && (
                            <span>Impayé : <span className="font-medium text-amber-700">{fmtMur(c.kpi.montant_impaye_mur)}</span></span>
                          )}
                          {c.kpi.nb_retard > 0 && (
                            <span className="text-red-700">⚠ {c.kpi.nb_retard} en retard</span>
                          )}
                          {c.collaborateurs.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Shield className="h-3 w-3" />{c.collaborateurs.length} collab
                            </span>
                          )}
                        </div>
                        {data.tags.length > 0 && (
                          <div className="mt-2 flex items-center gap-1 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">Tags :</span>
                            {data.tags.map(tag => {
                              const assigned = c.tag_ids.includes(tag.id)
                              return (
                                <button
                                  key={tag.id}
                                  onClick={() => toggleTag(tag.id, c.id)}
                                  className="text-[10px] px-1.5 py-0.5 rounded border"
                                  style={{
                                    backgroundColor: assigned ? tag.couleur : "transparent",
                                    color: assigned ? "white" : tag.couleur,
                                    borderColor: tag.couleur,
                                  }}
                                  title={assigned ? "Retirer ce tag" : "Ajouter ce tag"}
                                >
                                  {assigned ? "✓" : "+"} {tag.libelle}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <Button
                          size="sm"
                          className="h-7 text-[11px] bg-[#0B0F2E] hover:bg-[#2a3d6b]"
                          onClick={() => enterDossier(c.id, c.nom)}
                          disabled={entering === c.id}
                          title="Bascule sur la vue client de ce dossier avec bandeau cabinet"
                        >
                          {entering === c.id ? (
                            <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Ouverture…</>
                          ) : (
                            <>Entrer dans le dossier <ChevronRight className="h-3 w-3 ml-1" /></>
                          )}
                        </Button>
                        <Link href={`/comptable/cabinet/${c.id}/notes`} className="text-[10px] text-blue-600 hover:underline flex items-center gap-1">
                          <StickyNote className="h-3 w-3" /> Notes
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* COLLABORATEURS */}
        {data.user_info.is_dirigeant && (
          <TabsContent value="collaborateurs">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" /> Mes collaborateurs
                  </CardTitle>
                  <Link href="/comptable/equipe">
                    <Button size="sm" variant="outline">
                      <Plus className="h-3 w-3 mr-1" /> Inviter
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {data.collaborateurs.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Aucun collaborateur. Invite-en un depuis "Mon Équipe" en lui attribuant le rôle <code>comptable</code> ou <code>comptable_dedie</code>.
                  </p>
                ) : (
                  <div className="divide-y">
                    {data.collaborateurs.map(co => (
                      <div key={co.id} className="p-3 flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-sm">{co.full_name || co.email}</h4>
                            <Badge variant="outline" className="text-[10px]">{co.role}</Badge>
                            {co.is_active === false && (
                              <Badge className="text-[10px] bg-gray-100 text-gray-600 border-gray-300">Inactif</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{co.email}</p>
                          <p className="text-xs mt-1">
                            Accès : {data.clients.filter(c => c.collaborateurs.some(a => a.collaborateur_id === co.id)).length} client(s)
                          </p>
                        </div>
                        <Link href={`/comptable/cabinet/collaborateurs/${co.id}`}>
                          <Button size="sm" variant="outline" className="h-7 text-[11px]">
                            <Pencil className="h-3 w-3 mr-1" /> Gérer accès
                          </Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* TAGS */}
        <TabsContent value="tags">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TagIcon className="h-4 w-4" /> Tags cabinet
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end gap-2 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs text-muted-foreground">Libellé</label>
                  <Input
                    placeholder="Ex : VIP, Lent payeur, Risque…"
                    value={newTagLibelle}
                    onChange={e => setNewTagLibelle(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && createTag()}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Couleur</label>
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={e => setNewTagColor(e.target.value)}
                    className="block h-9 w-14 rounded border"
                  />
                </div>
                <Button onClick={createTag} disabled={creatingTag || !newTagLibelle.trim()}>
                  {creatingTag ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Créer</>}
                </Button>
              </div>

              {data.tags.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Aucun tag. Crée-en un pour catégoriser tes clients (ex: VIP, Lent payeur).
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.tags.map(tag => (
                    <div
                      key={tag.id}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded border text-sm"
                      style={{
                        backgroundColor: `${tag.couleur}15`,
                        color: tag.couleur,
                        borderColor: tag.couleur,
                      }}
                    >
                      <span>{tag.libelle}</span>
                      <button onClick={() => deleteTag(tag.id)} className="hover:bg-white/40 rounded p-0.5">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function KpiCard({ icon, label, value, tone, isText }: {
  icon: React.ReactNode
  label: string
  value: number | string
  tone: "blue" | "purple" | "rose" | "amber" | "green"
  isText?: boolean
}) {
  const tones: Record<string, string> = {
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    purple: "border-purple-200 bg-purple-50 text-purple-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    green: "border-green-200 bg-green-50 text-green-800",
  }
  return (
    <Card className={`border ${tones[tone]}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider opacity-75">
          {icon}
          {label}
        </div>
        <p className={`mt-1 font-bold ${isText ? "text-base" : "text-2xl"}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
