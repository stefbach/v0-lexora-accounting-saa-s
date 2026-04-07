"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Plus, Users, ArrowUpRight, ArrowDownLeft, Wallet, RefreshCw, ChevronLeft } from "lucide-react"

function fmt(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function formatDate(d: string) { return d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "--" }

export default function CompteCourantPage() {
  const [loading, setLoading] = useState(true)
  const [societeId, setSocieteId] = useState<string | null>(null)
  const [societes, setSocietes] = useState<any[]>([])
  const [comptes, setComptes] = useState<any[]>([])
  const [mouvements, setMouvements] = useState<any[]>([])
  const [totalSolde, setTotalSolde] = useState(0)
  const [factures, setFactures] = useState<any[]>([])

  // Selected account for detail view
  const [selectedCompte, setSelectedCompte] = useState<any>(null)

  // Dialogs
  const [createDialog, setCreateDialog] = useState(false)
  const [avanceDialog, setAvanceDialog] = useState(false)
  const [remboursementDialog, setRemboursementDialog] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form fields — create compte
  const [formNom, setFormNom] = useState("")
  const [formType, setFormType] = useState("associe")

  // Form fields — avance
  const [formAvanceCompte, setFormAvanceCompte] = useState("")
  const [formAvanceMontant, setFormAvanceMontant] = useState("")
  const [formAvanceDesc, setFormAvanceDesc] = useState("")
  const [formAvanceDate, setFormAvanceDate] = useState("")
  const [formAvanceFacture, setFormAvanceFacture] = useState("")

  // Form fields — remboursement
  const [formRembCompte, setFormRembCompte] = useState("")
  const [formRembMontant, setFormRembMontant] = useState("")
  const [formRembDesc, setFormRembDesc] = useState("")
  const [formRembDate, setFormRembDate] = useState("")

  useEffect(() => {
    fetch("/api/client/societes").then(r => r.json()).then(d => {
      const s = d.societes || []
      setSocietes(s)
      if (s.length > 0) setSocieteId(s[0].id)
    })
  }, [])

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const [ccRes, facRes] = await Promise.all([
        fetch(`/api/comptable/compte-courant?societe_id=${societeId}`),
        fetch(`/api/comptable/factures?societe_id=${societeId}&type=fournisseur`),
      ])
      const ccData = await ccRes.json()
      const facData = await facRes.json()
      setComptes(ccData.comptes || [])
      setMouvements(ccData.mouvements || [])
      setTotalSolde(ccData.totalSolde || 0)
      setFactures((facData.factures || []).filter((f: any) => f.statut !== 'paye' && f.statut !== 'annule'))
    } catch { }
    finally { setLoading(false) }
  }, [societeId])

  useEffect(() => { load() }, [load])

  const handleCreateCompte = async () => {
    if (!societeId || !formNom) return
    setSaving(true)
    try {
      await fetch("/api/comptable/compte-courant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "creer_compte", societe_id: societeId, nom: formNom, type: formType }),
      })
      setCreateDialog(false)
      setFormNom(""); setFormType("associe")
      load()
    } catch { }
    finally { setSaving(false) }
  }

  const handleAvance = async () => {
    if (!societeId || !formAvanceCompte || !formAvanceMontant) return
    setSaving(true)
    try {
      await fetch("/api/comptable/compte-courant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "avance", societe_id: societeId,
          compte_courant_id: formAvanceCompte,
          montant: parseFloat(formAvanceMontant),
          description: formAvanceDesc,
          date_mouvement: formAvanceDate || undefined,
          facture_id: formAvanceFacture || undefined,
        }),
      })
      setAvanceDialog(false)
      setFormAvanceCompte(""); setFormAvanceMontant(""); setFormAvanceDesc("")
      setFormAvanceDate(""); setFormAvanceFacture("")
      load()
    } catch { }
    finally { setSaving(false) }
  }

  const handleRemboursement = async () => {
    if (!societeId || !formRembCompte || !formRembMontant) return
    setSaving(true)
    try {
      await fetch("/api/comptable/compte-courant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remboursement", societe_id: societeId,
          compte_courant_id: formRembCompte,
          montant: parseFloat(formRembMontant),
          description: formRembDesc,
          date_mouvement: formRembDate || undefined,
        }),
      })
      setRemboursementDialog(false)
      setFormRembCompte(""); setFormRembMontant(""); setFormRembDesc(""); setFormRembDate("")
      load()
    } catch { }
    finally { setSaving(false) }
  }

  // Movements for selected account
  const filteredMouvements = selectedCompte
    ? mouvements.filter(m => m.compte_courant_id === selectedCompte.id)
    : mouvements

  if (loading && comptes.length === 0) {
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-[#0B0F2E]" /></div>
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {selectedCompte && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedCompte(null)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-[#0B0F2E]">
              {selectedCompte ? `Compte Courant — ${selectedCompte.nom}` : "Comptes Courants Associes"}
            </h1>
            <p className="text-sm text-gray-500">
              {selectedCompte
                ? `${selectedCompte.type === 'associe' ? 'Associe' : 'Collaborateur'} — Compte ${selectedCompte.type === 'associe' ? '455' : '467'}`
                : "Suivi des avances associes et collaborateurs"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {societes.length > 0 && (
            <Select value={societeId || ""} onValueChange={setSocieteId}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Societe..." /></SelectTrigger>
              <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={load}><RefreshCw className="w-4 h-4 mr-2" />Actualiser</Button>
          <Button onClick={() => setAvanceDialog(true)} className="bg-[#D4AF37] text-[#0B0F2E] hover:bg-[#D4AF37]/90">
            <ArrowUpRight className="w-4 h-4 mr-2" />Enregistrer une avance
          </Button>
          <Button onClick={() => setRemboursementDialog(true)} className="bg-[#0B0F2E]">
            <ArrowDownLeft className="w-4 h-4 mr-2" />Enregistrer un remboursement
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-[#0B0F2E]" />
            <div>
              <p className="text-xs text-gray-500">Comptes ouverts</p>
              <p className="text-xl font-bold text-[#0B0F2E]">{comptes.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="w-8 h-8" style={{ color: "#D4AF37" }} />
            <div>
              <p className="text-xs text-gray-500">Solde total du</p>
              <p className="text-xl font-bold text-[#0B0F2E]">{fmt(totalSolde)} MUR</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <ArrowUpRight className="w-8 h-8 text-orange-600" />
            <div>
              <p className="text-xs text-gray-500">Associes</p>
              <p className="text-xl font-bold text-[#0B0F2E]">{comptes.filter(c => c.type === 'associe').length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-xs text-gray-500">Collaborateurs</p>
              <p className="text-xl font-bold text-[#0B0F2E]">{comptes.filter(c => c.type === 'collaborateur').length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* List view or detail view */}
      {!selectedCompte ? (
        <>
          {/* Comptes table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#0B0F2E] flex items-center gap-2">
                <Users className="w-5 h-5" />Comptes courants ({comptes.length})
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />Nouveau compte
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {comptes.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  Aucun compte courant associe. Creez-en un pour commencer.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Compte PCG</TableHead>
                      <TableHead className="text-right">Solde du (MUR)</TableHead>
                      <TableHead>Derniere mise a jour</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comptes.map((c: any) => (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setSelectedCompte(c)}>
                        <TableCell className="font-medium">{c.nom}</TableCell>
                        <TableCell>
                          <Badge className={c.type === 'associe' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}>
                            {c.type === 'associe' ? 'Associe' : 'Collaborateur'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-gray-600">
                          {c.type === 'associe' ? '455' : '467'}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {Number(c.solde) > 0 ? (
                            <span className="text-orange-600">{fmt(Number(c.solde))}</span>
                          ) : Number(c.solde) < 0 ? (
                            <span className="text-green-600">{fmt(Number(c.solde))}</span>
                          ) : (
                            <span className="text-gray-400">0,00</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">{formatDate(c.updated_at)}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedCompte(c) }}>
                            Voir detail
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Recent movements */}
          {mouvements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-[#0B0F2E]">Derniers mouvements</CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Associe/Collaborateur</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Montant (MUR)</TableHead>
                      <TableHead>Lettre</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mouvements.slice(0, 20).map((m: any) => {
                      const compte = comptes.find(c => c.id === m.compte_courant_id)
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-sm">{formatDate(m.date_mouvement)}</TableCell>
                          <TableCell className="font-medium">{compte?.nom || "--"}</TableCell>
                          <TableCell>
                            <Badge className={m.type === 'avance' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}>
                              {m.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{m.description || "--"}</TableCell>
                          <TableCell className="text-right font-bold">
                            {Number(m.montant) > 0 ? (
                              <span className="text-orange-600">+{fmt(Number(m.montant))}</span>
                            ) : (
                              <span className="text-green-600">{fmt(Number(m.montant))}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {m.lettre ? <Badge className="bg-green-100 text-green-700">{m.lettre}</Badge> : <span className="text-gray-400">--</span>}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        /* Detail view for selected account */
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-[#0B0F2E]">Mouvements — {selectedCompte.nom}</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Solde actuel: <span className="font-bold">{fmt(Number(selectedCompte.solde))}</span> MUR
                {Number(selectedCompte.solde) > 0 ? " (la societe doit a l'associe)" : Number(selectedCompte.solde) < 0 ? " (l'associe doit a la societe)" : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { setFormAvanceCompte(selectedCompte.id); setAvanceDialog(true) }} className="bg-[#D4AF37] text-[#0B0F2E] hover:bg-[#D4AF37]/90">
                <ArrowUpRight className="w-4 h-4 mr-1" />Avance
              </Button>
              <Button size="sm" onClick={() => { setFormRembCompte(selectedCompte.id); setRemboursementDialog(true) }} className="bg-[#0B0F2E]">
                <ArrowDownLeft className="w-4 h-4 mr-1" />Remboursement
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {filteredMouvements.length === 0 ? (
              <div className="text-center py-12 text-gray-500">Aucun mouvement enregistre pour ce compte.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Montant (MUR)</TableHead>
                    <TableHead>Lettre</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMouvements.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm">{formatDate(m.date_mouvement)}</TableCell>
                      <TableCell>
                        <Badge className={m.type === 'avance' ? 'bg-orange-100 text-orange-700' : m.type === 'remboursement' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                          {m.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{m.description || "--"}</TableCell>
                      <TableCell className="text-right font-bold">
                        {Number(m.montant) > 0 ? (
                          <span className="text-orange-600">+{fmt(Number(m.montant))}</span>
                        ) : (
                          <span className="text-green-600">{fmt(Number(m.montant))}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {m.lettre ? <Badge className="bg-green-100 text-green-700">{m.lettre}</Badge> : <span className="text-gray-400">--</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog: Creer compte */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nouveau compte courant</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>Nom *</Label>
              <Input value={formNom} onChange={e => setFormNom(e.target.value)} placeholder="Nom de l'associe ou collaborateur" />
            </div>
            <div>
              <Label>Type *</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="associe">Associe (compte 455)</SelectItem>
                  <SelectItem value="collaborateur">Collaborateur (compte 467)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>Annuler</Button>
            <Button onClick={handleCreateCompte} disabled={saving || !formNom} className="bg-[#0B0F2E]">
              {saving ? "Creation..." : "Creer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Enregistrer avance */}
      <Dialog open={avanceDialog} onOpenChange={setAvanceDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Enregistrer une avance</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500">
            L'associe ou collaborateur a paye une depense de la societe avec ses fonds personnels.
          </p>
          <div className="grid gap-3 py-2">
            <div>
              <Label>Associe / Collaborateur *</Label>
              <Select value={formAvanceCompte} onValueChange={setFormAvanceCompte}>
                <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent>
                  {comptes.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nom} ({c.type === 'associe' ? 'Associe' : 'Collaborateur'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Montant (MUR) *</Label>
              <Input type="number" value={formAvanceMontant} onChange={e => setFormAvanceMontant(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={formAvanceDate} onChange={e => setFormAvanceDate(e.target.value)} />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={formAvanceDesc} onChange={e => setFormAvanceDesc(e.target.value)} placeholder="Ex: Achat fournitures bureau" />
            </div>
            {factures.length > 0 && (
              <div>
                <Label>Lier a une facture fournisseur (optionnel)</Label>
                <Select value={formAvanceFacture} onValueChange={setFormAvanceFacture}>
                  <SelectTrigger><SelectValue placeholder="Aucune facture" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Aucune</SelectItem>
                    {factures.map(f => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.numero_facture || f.tiers || "--"} — {fmt(Number(f.montant_ttc))} {f.devise}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAvanceDialog(false)}>Annuler</Button>
            <Button onClick={handleAvance} disabled={saving || !formAvanceCompte || !formAvanceMontant} className="bg-[#D4AF37] text-[#0B0F2E] hover:bg-[#D4AF37]/90">
              {saving ? "Enregistrement..." : "Enregistrer l'avance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Enregistrer remboursement */}
      <Dialog open={remboursementDialog} onOpenChange={setRemboursementDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Enregistrer un remboursement</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500">
            La societe rembourse l'associe ou collaborateur via la banque.
          </p>
          <div className="grid gap-3 py-2">
            <div>
              <Label>Associe / Collaborateur *</Label>
              <Select value={formRembCompte} onValueChange={setFormRembCompte}>
                <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent>
                  {comptes.filter(c => Number(c.solde) > 0).map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nom} — solde: {fmt(Number(c.solde))} MUR
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Montant (MUR) *</Label>
              <Input type="number" value={formRembMontant} onChange={e => setFormRembMontant(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={formRembDate} onChange={e => setFormRembDate(e.target.value)} />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={formRembDesc} onChange={e => setFormRembDesc(e.target.value)} placeholder="Ex: Virement remboursement avances mars" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemboursementDialog(false)}>Annuler</Button>
            <Button onClick={handleRemboursement} disabled={saving || !formRembCompte || !formRembMontant} className="bg-[#0B0F2E]">
              {saving ? "Enregistrement..." : "Enregistrer le remboursement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
