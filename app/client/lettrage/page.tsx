"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Sparkles, Link2, Link2Off, Wand2, RefreshCw, AlertTriangle, CheckCircle2, Eye } from "lucide-react"
import { toast } from "sonner"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface Entry {
  id: string
  compte: string
  libelle: string
  date_ecriture: string
  debit: number
  credit: number
  piece_justificative: string | null
  lettre?: string | null
  date_lettrage?: string | null
  lettrage_auto?: boolean
}

interface MatchGroup {
  ids: string[]
  lettre: string
  compte: string
  total_debit: number
  total_credit: number
  score: number
  strategy: string
  reason: string
}

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string) {
  return d ? new Date(d).toLocaleDateString("fr-FR") : "—"
}

function getLetterColor(lettre: string | null | undefined): string {
  if (!lettre) return "transparent"
  const palette = ["#dbeafe", "#dcfce7", "#fef3c7", "#fee2e2", "#f3e8ff", "#ffedd5", "#e0f2fe", "#d1fae5"]
  let h = 0
  for (let i = 0; i < lettre.length; i++) h = (h * 31 + lettre.charCodeAt(i)) % palette.length
  return palette[h]
}

export default function LettragePage() {
  const { societeId } = useSocieteActive()
  const [tab, setTab] = useState<"unlettered" | "lettered">("unlettered")
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [compteFilter, setCompteFilter] = useState("")
  const [dateDebut, setDateDebut] = useState("")
  const [dateFin, setDateFin] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lettreManuelle, setLettreManuelle] = useState("")

  const [proposals, setProposals] = useState<MatchGroup[]>([])
  const [proposalOpen, setProposalOpen] = useState(false)
  const [loadingProposals, setLoadingProposals] = useState(false)
  const [applyingAll, setApplyingAll] = useState(false)
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set())
  const [applyingOne, setApplyingOne] = useState<number | null>(null)
  const [highlightedLettre, setHighlightedLettre] = useState<string | null>(null)

  const fetchEntries = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ societe_id: societeId, view: tab === "unlettered" ? "unlettered" : "all" })
      if (compteFilter) params.set("compte", compteFilter)
      if (dateDebut) params.set("date_debut", dateDebut)
      if (dateFin) params.set("date_fin", dateFin)
      const res = await fetch(`/api/comptable/lettrage?${params.toString()}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Erreur")
      let list: Entry[] = body.ecritures || []
      if (tab === "lettered") list = list.filter(e => e.lettre)
      setEntries(list)
      setSelected(new Set())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    } finally {
      setLoading(false)
    }
  }, [societeId, compteFilter, dateDebut, dateFin, tab])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const byCompte = useMemo(() => {
    const m = new Map<string, Entry[]>()
    for (const e of entries) {
      if (!m.has(e.compte)) m.set(e.compte, [])
      m.get(e.compte)!.push(e)
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [entries])

  const byLettre = useMemo(() => {
    const m = new Map<string, Entry[]>()
    for (const e of entries) {
      if (!e.lettre) continue
      const k = `${e.compte}|${e.lettre}`
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(e)
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [entries])

  const balance = useMemo(() => {
    const sel = entries.filter(e => selected.has(e.id))
    const debit = sel.reduce((s, e) => s + e.debit, 0)
    const credit = sel.reduce((s, e) => s + e.credit, 0)
    const comptes = new Set(sel.map(e => e.compte))
    return { debit, credit, ecart: debit - credit, comptes: [...comptes] }
  }, [entries, selected])

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function toggleCompte(ids: string[]) {
    const allSelected = ids.every(id => selected.has(id))
    const next = new Set(selected)
    if (allSelected) ids.forEach(id => next.delete(id))
    else ids.forEach(id => next.add(id))
    setSelected(next)
  }

  async function propose() {
    if (!societeId) return
    setLoadingProposals(true)
    try {
      const res = await fetch("/api/comptable/lettrage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "propose",
          societe_id: societeId,
          compte: compteFilter || undefined,
          date_debut: dateDebut || undefined,
          date_fin: dateFin || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Erreur")
      setProposals(body.groups || [])
      setSelectedGroups(new Set((body.groups || []).map((_: unknown, i: number) => i)))
      setProposalOpen(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    } finally {
      setLoadingProposals(false)
    }
  }

  async function applyOne(idx: number) {
    const g = proposals[idx]
    if (!g) return
    setApplyingOne(idx)
    try {
      const res = await fetch("/api/comptable/lettrage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manuel",
          societe_id: societeId,
          ecriture_ids: g.ids,
          lettre: g.lettre,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Erreur")
      toast.success(`Groupe ${g.lettre} appliqué (${g.ids.length} écritures)`)
      setProposals(proposals.filter((_, i) => i !== idx))
      const ns = new Set(selectedGroups); ns.delete(idx); setSelectedGroups(ns)
      fetchEntries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    } finally { setApplyingOne(null) }
  }

  async function applySelected() {
    if (!proposals.length) return
    setApplyingAll(true)
    try {
      let ok = 0
      for (const [idx, g] of proposals.entries()) {
        if (!selectedGroups.has(idx)) continue
        const res = await fetch("/api/comptable/lettrage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "manuel",
            societe_id: societeId,
            ecriture_ids: g.ids,
            lettre: g.lettre,
          }),
        })
        if (res.ok) ok += g.ids.length
      }
      toast.success(`${ok} écriture(s) lettrée(s)`)
      setProposalOpen(false)
      fetchEntries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    } finally {
      setApplyingAll(false)
    }
  }

  async function lettrerManuel() {
    if (!selected.size || !lettreManuelle.trim()) {
      toast.error("Sélectionner des écritures et saisir une lettre")
      return
    }
    try {
      const allowCross = balance.comptes.length > 1
      const force = Math.abs(balance.ecart) > 0.01
      const res = await fetch("/api/comptable/lettrage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manuel",
          societe_id: societeId,
          ecriture_ids: [...selected],
          lettre: lettreManuelle.trim().toUpperCase(),
          allow_cross_account: allowCross,
          force,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Erreur")
      toast.success(body.message)
      setLettreManuelle("")
      fetchEntries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    }
  }

  async function delettrerGroup(ids: string[], code: string) {
    if (!confirm(`Délettrer le groupe ${code} (${ids.length} écritures) ?`)) return
    try {
      const res = await fetch("/api/comptable/lettrage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delettrer",
          societe_id: societeId,
          ecriture_ids: ids,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Erreur")
      toast.success(body.message)
      fetchEntries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    }
  }

  async function delettrerSelected() {
    if (!selected.size) return
    if (!confirm(`Délettrer ${selected.size} écriture(s) ?`)) return
    try {
      const res = await fetch("/api/comptable/lettrage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delettrer",
          societe_id: societeId,
          ecriture_ids: [...selected],
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Erreur")
      toast.success(body.message)
      fetchEntries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    }
  }

  async function autoRunV2() {
    if (!societeId) return
    try {
      const res = await fetch("/api/comptable/lettrage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "auto_v2",
          societe_id: societeId,
          compte: compteFilter || undefined,
          date_debut: dateDebut || undefined,
          date_fin: dateFin || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Erreur")
      toast.success(body.message)
      fetchEntries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    }
  }

  const stats = useMemo(() => ({
    total: entries.length,
    debit: entries.reduce((s, e) => s + e.debit, 0),
    credit: entries.reduce((s, e) => s + e.credit, 0),
    comptes: new Set(entries.map(e => e.compte)).size,
    lettres: new Set(entries.map(e => e.lettre).filter(Boolean)).size,
  }), [entries])

  return (
    <ClientPageShell
      kicker="Comptabilité"
      title="Lettrage"
      subtitle="Rapprochement des écritures débit/crédit par compte"
      breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Lettrage" }]}
      actions={
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={propose} disabled={loadingProposals}>
            {loadingProposals ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Proposer des rapprochements
          </Button>
          <Button size="sm" onClick={autoRunV2} style={{ backgroundColor: "#D4AF37", color: "#0B0F2E" }}>
            <Wand2 className="h-4 w-4 mr-1" /> Lettrage auto
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-4 gap-3 mb-4">
        <Card><CardContent className="p-4">
          <div className="text-xs text-gray-500">{tab === "unlettered" ? "Non lettrées" : "Lettrées"}</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-gray-500">Comptes</div>
          <div className="text-2xl font-bold">{stats.comptes}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-gray-500">Total débit</div>
          <div className="text-2xl font-bold text-emerald-700">{fmt(stats.debit)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-gray-500">{tab === "unlettered" ? "Total crédit" : "Groupes lettrés"}</div>
          <div className="text-2xl font-bold text-red-700">{tab === "unlettered" ? fmt(stats.credit) : stats.lettres}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" /> Lettrage
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchEntries}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={v => setTab(v as "unlettered" | "lettered")}>
            <TabsList className="mb-3">
              <TabsTrigger value="unlettered">Non lettrées</TabsTrigger>
              <TabsTrigger value="lettered">Lettrées</TabsTrigger>
            </TabsList>

            <div className="flex flex-wrap gap-2 mb-3">
              <div>
                <Label className="text-xs">Compte (préfixe)</Label>
                <Input placeholder="ex. 411" value={compteFilter} onChange={e => setCompteFilter(e.target.value)} className="w-[140px]" />
              </div>
              <div>
                <Label className="text-xs">Du</Label>
                <Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} className="w-[160px]" />
              </div>
              <div>
                <Label className="text-xs">Au</Label>
                <Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className="w-[160px]" />
              </div>
            </div>

            {/* Action bar when selection exists */}
            {selected.size > 0 && (
              <div className={`flex items-center gap-3 p-3 mb-3 rounded border ${
                Math.abs(balance.ecart) < 0.01 ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
              }`}>
                <div className="text-sm">
                  <strong>{selected.size}</strong> sélectionnée(s) —
                  D: <strong>{fmt(balance.debit)}</strong> /
                  C: <strong>{fmt(balance.credit)}</strong> /
                  Écart: <strong>{fmt(Math.abs(balance.ecart))}</strong>
                  {balance.comptes.length > 1 && (
                    <Badge variant="outline" className="ml-2">Multi-compte: {balance.comptes.join(", ")}</Badge>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                  {tab === "unlettered" ? (
                    <>
                      <Input
                        placeholder="Code (ex. A)"
                        value={lettreManuelle}
                        onChange={e => setLettreManuelle(e.target.value.toUpperCase())}
                        className="w-24"
                        maxLength={4}
                      />
                      <Button size="sm" onClick={lettrerManuel} disabled={!lettreManuelle.trim()}>
                        <Link2 className="h-4 w-4 mr-1" /> Lettrer
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={delettrerSelected}>
                      <Link2Off className="h-4 w-4 mr-1" /> Délettrer
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
                    Vider
                  </Button>
                </div>
              </div>
            )}

            <TabsContent value="unlettered" className="mt-0">
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : entries.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                  Aucune écriture non lettrée sur le périmètre sélectionné.
                </div>
              ) : (
                <div className="space-y-4">
                  {byCompte.map(([compte, items]) => (
                    <div key={compte} className="border rounded-md">
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={items.every(e => selected.has(e.id))}
                            onCheckedChange={() => toggleCompte(items.map(e => e.id))}
                          />
                          <span className="font-mono font-semibold">{compte}</span>
                          <Badge variant="outline">{items.length}</Badge>
                        </div>
                        <div className="text-sm text-gray-500">
                          D: {fmt(items.reduce((s, e) => s + e.debit, 0))} /
                          C: {fmt(items.reduce((s, e) => s + e.credit, 0))}
                        </div>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8"></TableHead>
                            <TableHead className="w-24">Date</TableHead>
                            <TableHead className="w-28">Pièce</TableHead>
                            <TableHead>Libellé</TableHead>
                            <TableHead className="text-right w-28">Débit</TableHead>
                            <TableHead className="text-right w-28">Crédit</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map(e => (
                            <TableRow
                              key={e.id}
                              className={selected.has(e.id) ? "bg-blue-50" : "cursor-pointer hover:bg-gray-50"}
                              onClick={() => toggle(e.id)}
                            >
                              <TableCell><Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggle(e.id)} /></TableCell>
                              <TableCell className="text-xs">{fmtDate(e.date_ecriture)}</TableCell>
                              <TableCell className="text-xs font-mono">{e.piece_justificative || "—"}</TableCell>
                              <TableCell className="text-xs">{e.libelle}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{e.debit > 0 ? fmt(e.debit) : ""}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{e.credit > 0 ? fmt(e.credit) : ""}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="lettered" className="mt-0">
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : byLettre.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  Aucune écriture lettrée sur le périmètre sélectionné.
                </div>
              ) : (
                <div className="space-y-3">
                  {byLettre.map(([key, items]) => {
                    const [compte, code] = key.split("|")
                    const ids = items.map(e => e.id)
                    const allSel = ids.every(id => selected.has(id))
                    const highlighted = highlightedLettre === key
                    return (
                      <div key={key} className={`border rounded-md ${highlighted ? "ring-2 ring-[#D4AF37]" : ""}`}>
                        <div className="flex items-center justify-between px-3 py-2 border-b"
                          style={{ backgroundColor: getLetterColor(code) }}>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={allSel}
                              onCheckedChange={() => toggleCompte(ids)}
                            />
                            <span className="font-mono font-semibold">{compte}</span>
                            <Badge>{code}</Badge>
                            <Badge variant="outline">{items.length} écr.</Badge>
                            {items[0].lettrage_auto && <Badge variant="secondary">auto</Badge>}
                            {items[0].date_lettrage && (
                              <span className="text-xs text-gray-600">le {fmtDate(items[0].date_lettrage)}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setHighlightedLettre(highlighted ? null : key)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => delettrerGroup(ids, code)}>
                              <Link2Off className="h-4 w-4 mr-1" /> Délettrer
                            </Button>
                          </div>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-8"></TableHead>
                              <TableHead className="w-24">Date</TableHead>
                              <TableHead className="w-28">Pièce</TableHead>
                              <TableHead>Libellé</TableHead>
                              <TableHead className="text-right w-28">Débit</TableHead>
                              <TableHead className="text-right w-28">Crédit</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.map(e => (
                              <TableRow key={e.id}
                                className={selected.has(e.id) ? "bg-blue-50" : "hover:bg-gray-50 cursor-pointer"}
                                onClick={() => toggle(e.id)}>
                                <TableCell><Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggle(e.id)} /></TableCell>
                                <TableCell className="text-xs">{fmtDate(e.date_ecriture)}</TableCell>
                                <TableCell className="text-xs font-mono">{e.piece_justificative || "—"}</TableCell>
                                <TableCell className="text-xs">{e.libelle}</TableCell>
                                <TableCell className="text-right font-mono text-xs">{e.debit > 0 ? fmt(e.debit) : ""}</TableCell>
                                <TableCell className="text-right font-mono text-xs">{e.credit > 0 ? fmt(e.credit) : ""}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={proposalOpen} onOpenChange={setProposalOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Propositions de lettrage — {proposals.length} groupe(s)</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            {proposals.length === 0 ? (
              <div className="text-center py-6 text-gray-500">
                <AlertTriangle className="h-6 w-6 mx-auto mb-2" />
                Aucun match possible avec les paramètres actuels.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Lettre</TableHead>
                    <TableHead>Compte</TableHead>
                    <TableHead>Stratégie</TableHead>
                    <TableHead>Raison</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead className="text-center">Score</TableHead>
                    <TableHead className="text-center">#Écr.</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proposals.map((g, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Checkbox
                          checked={selectedGroups.has(i)}
                          onCheckedChange={() => {
                            const n = new Set(selectedGroups)
                            if (n.has(i)) n.delete(i); else n.add(i)
                            setSelectedGroups(n)
                          }}
                        />
                      </TableCell>
                      <TableCell><Badge>{g.lettre}</Badge></TableCell>
                      <TableCell className="font-mono">{g.compte}</TableCell>
                      <TableCell><Badge variant="outline">{g.strategy}</Badge></TableCell>
                      <TableCell className="text-xs">{g.reason}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(g.total_debit)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={g.score >= 0.85 ? "default" : "secondary"}>
                          {Math.round(g.score * 100)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{g.ids.length}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => applyOne(i)} disabled={applyingOne === i}>
                          {applyingOne === i ? <Loader2 className="h-3 w-3 animate-spin" /> : "Appliquer"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProposalOpen(false)}>Fermer</Button>
            <Button onClick={applySelected} disabled={!selectedGroups.size || applyingAll}>
              {applyingAll && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Appliquer {selectedGroups.size} groupe(s) cochés
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPageShell>
  )
}
