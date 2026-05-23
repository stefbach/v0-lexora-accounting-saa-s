"use client"

import * as React from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { CascadeDeleteButton } from "@/components/admin/CascadeDeleteButton"
import { AlertTriangle, RefreshCw } from "lucide-react"

type Societe = { id: string; nom: string }

type FactureRow = {
  id: string; numero_facture: string | null; type_facture: string | null
  tiers: string | null; date_facture: string | null
  montant_ttc: number | null; statut: string | null
}
type EcritureRow = {
  id: string; date_ecriture: string | null; journal: string | null
  ref_folio: string | null; numero_compte: string | null
  libelle?: string | null; description?: string | null
  debit_mur: number | null; credit_mur: number | null; lettre: string | null
}
type DocRow = {
  id: string; nom_fichier: string | null; type_document: string | null
  storage_path: string | null; created_at: string | null
}

export default function AdminPurgePage() {
  const supabase = React.useMemo(() => createClient(), [])

  const [societes, setSocietes] = React.useState<Societe[]>([])
  const [societeId, setSocieteId] = React.useState<string>("")

  React.useEffect(() => {
    (async () => {
      const { data } = await supabase.from("societes").select("id, nom").order("nom")
      setSocietes((data || []) as Societe[])
    })()
  }, [supabase])

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" />
            Purge admin — hard delete cascade
          </CardTitle>
          <CardDescription>
            Suppression définitive de factures, écritures bancaires et documents
            (avec leurs fichiers Storage). Cascade automatique sur les lignes,
            paiements, lettrages et tables liées. Toutes les actions sont
            journalisées dans <code>audit_trail</code>. Admin uniquement —
            l'API refuse si le rôle est insuffisant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="block text-sm font-medium mb-1">Société cible</label>
          <select
            className="w-full max-w-md rounded-md border px-3 py-2 text-sm"
            value={societeId}
            onChange={(e) => setSocieteId(e.target.value)}
          >
            <option value="">— Sélectionner une société —</option>
            {societes.map((s) => (
              <option key={s.id} value={s.id}>{s.nom}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Tabs defaultValue="factures">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="factures">Factures</TabsTrigger>
          <TabsTrigger value="banque">Banque</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="factures">
          <FacturesPurge societeId={societeId} />
        </TabsContent>
        <TabsContent value="banque">
          <BanquePurge societeId={societeId} />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsPurge societeId={societeId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────── FACTURES ── */
function FacturesPurge({ societeId }: { societeId: string }) {
  const supabase = React.useMemo(() => createClient(), [])
  const [rows, setRows] = React.useState<FactureRow[]>([])
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [typeFilter, setTypeFilter] = React.useState<"all" | "client" | "fournisseur">("all")
  const [search, setSearch] = React.useState("")
  const [loading, setLoading] = React.useState(false)

  const load = React.useCallback(async () => {
    if (!societeId) { setRows([]); setSelected(new Set()); return }
    setLoading(true)
    let q = supabase.from("factures").select(
      "id, numero_facture, type_facture, tiers, date_facture, montant_ttc, statut"
    ).eq("societe_id", societeId).order("date_facture", { ascending: false }).limit(500)
    if (typeFilter !== "all") q = q.eq("type_facture", typeFilter)
    if (search.trim()) {
      q = q.or(`numero_facture.ilike.%${search}%,tiers.ilike.%${search}%`)
    }
    const { data } = await q
    setRows((data || []) as FactureRow[])
    setSelected(new Set())
    setLoading(false)
  }, [supabase, societeId, typeFilter, search])

  React.useEffect(() => { load() }, [load])

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }
  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set())
    else setSelected(new Set(rows.map((r) => r.id)))
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-base">Factures de la société ({rows.length})</CardTitle>
          <div className="flex gap-2 ml-auto">
            <select
              className="rounded-md border px-2 py-1 text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as "all" | "client" | "fournisseur")}
            >
              <option value="all">Tous types</option>
              <option value="client">Clients</option>
              <option value="fournisseur">Fournisseurs</option>
            </select>
            <Input
              placeholder="Rechercher numéro ou tiers"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className="size-4 mr-1" /> Recharger
            </Button>
            <CascadeDeleteButton
              type="facture"
              ids={Array.from(selected)}
              societeId={societeId}
              onDeleted={() => load()}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {societeId ? "Aucune facture" : "Sélectionner une société pour charger"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left p-2 w-8">
                    <Checkbox
                      checked={selected.size === rows.length && rows.length > 0}
                      onCheckedChange={toggleAll}
                      aria-label="Tout sélectionner"
                    />
                  </th>
                  <th className="text-left p-2">Numéro</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-left p-2">Tiers</th>
                  <th className="text-left p-2">Date</th>
                  <th className="text-right p-2">Montant TTC</th>
                  <th className="text-left p-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={selected.has(r.id) ? "bg-destructive/5" : ""}>
                    <td className="p-2">
                      <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                    </td>
                    <td className="p-2 font-mono text-xs">{r.numero_facture || "—"}</td>
                    <td className="p-2">{r.type_facture}</td>
                    <td className="p-2">{r.tiers || "—"}</td>
                    <td className="p-2">{r.date_facture || "—"}</td>
                    <td className="p-2 text-right">{r.montant_ttc?.toLocaleString("fr-FR") || "0"}</td>
                    <td className="p-2"><Badge variant="outline">{r.statut || "—"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ───────────────────────────────────────────────────────────── BANQUE ── */
function BanquePurge({ societeId }: { societeId: string }) {
  const supabase = React.useMemo(() => createClient(), [])
  const [rows, setRows] = React.useState<EcritureRow[]>([])
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [search, setSearch] = React.useState("")
  const [loading, setLoading] = React.useState(false)

  const load = React.useCallback(async () => {
    if (!societeId) { setRows([]); setSelected(new Set()); return }
    setLoading(true)
    let q = supabase.from("ecritures_comptables_v2").select(
      "id, date_ecriture, journal, ref_folio, numero_compte, description, debit_mur, credit_mur, lettre"
    ).eq("societe_id", societeId).in("journal", ["BNQ", "BQ", "BANK"])
     .order("date_ecriture", { ascending: false }).limit(500)
    if (search.trim()) {
      q = q.or(`ref_folio.ilike.%${search}%,description.ilike.%${search}%`)
    }
    const { data } = await q
    setRows((data || []) as EcritureRow[])
    setSelected(new Set())
    setLoading(false)
  }, [supabase, societeId, search])

  React.useEffect(() => { load() }, [load])

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }
  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set())
    else setSelected(new Set(rows.map((r) => r.id)))
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-base">Écritures banque — journal BNQ ({rows.length})</CardTitle>
          <div className="flex gap-2 ml-auto">
            <Input
              placeholder="Rechercher ref_folio ou libellé"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className="size-4 mr-1" /> Recharger
            </Button>
            <CascadeDeleteButton
              type="banque"
              ids={Array.from(selected)}
              societeId={societeId}
              onDeleted={() => load()}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {societeId ? "Aucune écriture banque" : "Sélectionner une société"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left p-2 w-8">
                    <Checkbox
                      checked={selected.size === rows.length && rows.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Ref folio</th>
                  <th className="text-left p-2">Compte</th>
                  <th className="text-left p-2">Libellé</th>
                  <th className="text-right p-2">Débit</th>
                  <th className="text-right p-2">Crédit</th>
                  <th className="text-center p-2">Lettré</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={selected.has(r.id) ? "bg-destructive/5" : ""}>
                    <td className="p-2">
                      <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                    </td>
                    <td className="p-2">{r.date_ecriture}</td>
                    <td className="p-2 font-mono text-xs">{r.ref_folio || "—"}</td>
                    <td className="p-2 font-mono text-xs">{r.numero_compte}</td>
                    <td className="p-2 max-w-md truncate">{r.description || "—"}</td>
                    <td className="p-2 text-right">{(r.debit_mur || 0).toLocaleString("fr-FR")}</td>
                    <td className="p-2 text-right">{(r.credit_mur || 0).toLocaleString("fr-FR")}</td>
                    <td className="p-2 text-center">
                      {r.lettre ? <Badge variant="secondary">{r.lettre}</Badge> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ───────────────────────────────────────────────────────── DOCUMENTS ── */
function DocumentsPurge({ societeId }: { societeId: string }) {
  const supabase = React.useMemo(() => createClient(), [])
  const [rows, setRows] = React.useState<DocRow[]>([])
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [search, setSearch] = React.useState("")
  const [loading, setLoading] = React.useState(false)

  const load = React.useCallback(async () => {
    if (!societeId) { setRows([]); setSelected(new Set()); return }
    setLoading(true)
    // Documents = societe_id direct OU rattachés à un dossier de la société
    const { data: dossiers } = await supabase.from("dossiers").select("id").eq("societe_id", societeId)
    const dossierIds = (dossiers || []).map((d: { id: string }) => d.id)

    let q = supabase.from("documents")
      .select("id, nom_fichier, type_document, storage_path, created_at")
      .order("created_at", { ascending: false }).limit(500)
    if (dossierIds.length > 0) {
      q = q.or(`societe_id.eq.${societeId},dossier_id.in.(${dossierIds.join(",")})`)
    } else {
      q = q.eq("societe_id", societeId)
    }
    if (search.trim()) q = q.ilike("nom_fichier", `%${search}%`)

    const { data } = await q
    setRows((data || []) as DocRow[])
    setSelected(new Set())
    setLoading(false)
  }, [supabase, societeId, search])

  React.useEffect(() => { load() }, [load])

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }
  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set())
    else setSelected(new Set(rows.map((r) => r.id)))
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-base">Documents de la société ({rows.length})</CardTitle>
          <div className="flex gap-2 ml-auto">
            <Input
              placeholder="Rechercher nom fichier"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className="size-4 mr-1" /> Recharger
            </Button>
            <CascadeDeleteButton
              type="document"
              ids={Array.from(selected)}
              societeId={societeId}
              onDeleted={() => load()}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {societeId ? "Aucun document" : "Sélectionner une société"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left p-2 w-8">
                    <Checkbox
                      checked={selected.size === rows.length && rows.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="text-left p-2">Nom du fichier</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-left p-2">Storage path</th>
                  <th className="text-left p-2">Créé le</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={selected.has(r.id) ? "bg-destructive/5" : ""}>
                    <td className="p-2">
                      <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                    </td>
                    <td className="p-2 max-w-md truncate">{r.nom_fichier || "—"}</td>
                    <td className="p-2">{r.type_document || "—"}</td>
                    <td className="p-2 font-mono text-xs max-w-xs truncate">{r.storage_path || "—"}</td>
                    <td className="p-2">{r.created_at?.split("T")[0] || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
