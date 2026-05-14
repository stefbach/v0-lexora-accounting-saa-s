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
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale, type Locale } from '@/lib/i18n'

function fmt(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function formatDate(d: string, locale: Locale = 'fr') { return d ? new Date(d).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', { day: "2-digit", month: "short", year: "numeric" }) : "--" }

export default function CompteCourantPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [loading, setLoading] = useState(true)
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
    <ClientPageShell
      breadcrumbs={[
        { label: t('acc.cc.client_area', locale), href: "/client" },
        { label: t('acc.cc.cc_breadcrumb', locale) },
      ]}
      kicker={t('acc.cc.accounting', locale)}
      title={selectedCompte ? `${t('acc.cc.title_detail', locale)} — ${selectedCompte.nom}` : t('acc.cc.title_main', locale)}
      subtitle={
        selectedCompte
          ? `${selectedCompte.type === 'associe' ? t('acc.cc.shareholder', locale) : t('acc.cc.collaborator', locale)} — ${t('acc.cc.account_pcg', locale)} ${selectedCompte.type === 'associe' ? '455' : '467'}`
          : t('acc.cc.subtitle_main', locale)
      }
      actions={
        <>
          {selectedCompte && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedCompte(null)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> {t('acc.cc.back', locale)}
            </Button>
          )}
          <Button variant="outline" onClick={load}><RefreshCw className="w-4 h-4 mr-2" />{t('common.refresh', locale)}</Button>
          <Button onClick={() => setAvanceDialog(true)} className="bg-[#D4AF37] text-[#0B0F2E] hover:bg-[#D4AF37]/90">
            <ArrowUpRight className="w-4 h-4 mr-2" />{t('acc.cc.advance', locale)}
          </Button>
          <Button onClick={() => setRemboursementDialog(true)} className="bg-[#0B0F2E]">
            <ArrowDownLeft className="w-4 h-4 mr-2" />{t('acc.cc.reimbursement', locale)}
          </Button>
        </>
      }
    >
      <div className="space-y-6">

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-[#0B0F2E]" />
            <div>
              <p className="text-xs text-gray-500">{t('acc.cc.open_accounts', locale)}</p>
              <p className="text-xl font-bold text-[#0B0F2E]">{comptes.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="w-8 h-8" style={{ color: "#D4AF37" }} />
            <div>
              <p className="text-xs text-gray-500">{t('acc.cc.total_balance', locale)}</p>
              <p className="text-xl font-bold text-[#0B0F2E]">{fmt(totalSolde)} MUR</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <ArrowUpRight className="w-8 h-8 text-orange-600" />
            <div>
              <p className="text-xs text-gray-500">{t('acc.cc.shareholders', locale)}</p>
              <p className="text-xl font-bold text-[#0B0F2E]">{comptes.filter(c => c.type === 'associe').length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-xs text-gray-500">{t('acc.cc.collaborators', locale)}</p>
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
                <Users className="w-5 h-5" />{t('acc.cc.title', locale)} ({comptes.length})
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />{t('acc.cc.new_account', locale)}
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {comptes.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  {t('acc.cc.no_accounts', locale)}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('acc.cc.name', locale)}</TableHead>
                      <TableHead>{t('acc.cc.type', locale)}</TableHead>
                      <TableHead>{t('acc.cc.account_pcg', locale)}</TableHead>
                      <TableHead className="text-right">{t('acc.cc.balance', locale)}</TableHead>
                      <TableHead>{t('acc.cc.last_update', locale)}</TableHead>
                      <TableHead>{t('common.actions', locale)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comptes.map((c: any) => (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setSelectedCompte(c)}>
                        <TableCell className="font-medium">{c.nom}</TableCell>
                        <TableCell>
                          <Badge className={c.type === 'associe' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}>
                            {c.type === 'associe' ? t('acc.cc.shareholder', locale) : t('acc.cc.collaborator', locale)}
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
                        <TableCell className="text-sm text-gray-500">{formatDate(c.updated_at, locale)}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedCompte(c) }}>
                            {t('acc.cc.view_detail', locale)}
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
                <CardTitle className="text-[#0B0F2E]">{t('acc.cc.recent_movements', locale)}</CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.date', locale)}</TableHead>
                      <TableHead>{t('acc.cc.shareholder_collab', locale)}</TableHead>
                      <TableHead>{t('acc.cc.type', locale)}</TableHead>
                      <TableHead>{t('common.description', locale)}</TableHead>
                      <TableHead className="text-right">{t('acc.cc.amount_mur', locale)}</TableHead>
                      <TableHead>{t('acc.cc.letter', locale)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mouvements.slice(0, 20).map((m: any) => {
                      const compte = comptes.find(c => c.id === m.compte_courant_id)
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-sm">{formatDate(m.date_mouvement, locale)}</TableCell>
                          <TableCell className="font-medium">{compte?.nom || "--"}</TableCell>
                          <TableCell>
                            <Badge className={m.type === 'avance' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}>
                              {m.type === 'avance' ? t('acc.cc.advance', locale) : m.type === 'remboursement' ? t('acc.cc.reimbursement', locale) : m.type}
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
              <CardTitle className="text-[#0B0F2E]">{t('acc.cc.movements', locale)} — {selectedCompte.nom}</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                {t('acc.cc.current_balance_inline', locale)}: <span className="font-bold">{fmt(Number(selectedCompte.solde))}</span> MUR
                {Number(selectedCompte.solde) > 0 ? ` ${t('acc.cc.balance_owed_to_partner', locale)}` : Number(selectedCompte.solde) < 0 ? ` ${t('acc.cc.balance_owed_to_company', locale)}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { setFormAvanceCompte(selectedCompte.id); setAvanceDialog(true) }} className="bg-[#D4AF37] text-[#0B0F2E] hover:bg-[#D4AF37]/90">
                <ArrowUpRight className="w-4 h-4 mr-1" />{t('acc.cc.advance', locale)}
              </Button>
              <Button size="sm" onClick={() => { setFormRembCompte(selectedCompte.id); setRemboursementDialog(true) }} className="bg-[#0B0F2E]">
                <ArrowDownLeft className="w-4 h-4 mr-1" />{t('acc.cc.reimbursement', locale)}
              </Button>
            </div>
          </CardHeader>
          {/* Factures payées par cet associé */}
          {factures.length === 0 && (
            <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-700">
              {t('acc.cc.all_unassigned_for_partner', locale)}
            </div>
          )}

          <CardContent className="p-0 overflow-x-auto">
            {filteredMouvements.length === 0 ? (
              <div className="text-center py-12 text-gray-500">{t('acc.cc.no_movement_for_account', locale)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.date', locale)}</TableHead>
                    <TableHead>{t('acc.cc.type', locale)}</TableHead>
                    <TableHead>{t('common.description', locale)}</TableHead>
                    <TableHead className="text-right">{t('acc.cc.amount_mur', locale)}</TableHead>
                    <TableHead className="text-right">{t('acc.cc.col_balance_mur', locale)}</TableHead>
                    <TableHead>{t('acc.cc.letter', locale)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    // Compute running balance (oldest first, then reverse for display)
                    const sorted = [...filteredMouvements].sort((a, b) =>
                      (a.date_mouvement || "").localeCompare(b.date_mouvement || "")
                    )
                    let runningBalance = 0
                    const withBalance = sorted.map((m: any) => {
                      const montant = Number(m.montant) || 0
                      runningBalance += m.type === 'avance' ? montant : -montant
                      return { ...m, soldeApres: runningBalance }
                    })
                    // Display newest first
                    withBalance.reverse()
                    return withBalance.map((m: any) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm">{formatDate(m.date_mouvement, locale)}</TableCell>
                        <TableCell>
                          <Badge className={m.type === 'avance' ? 'bg-orange-100 text-orange-700' : m.type === 'remboursement' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                            {m.type === 'avance' ? t('acc.cc.advance', locale) : m.type === 'remboursement' ? t('acc.cc.reimbursement', locale) : m.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{m.description || "--"}</TableCell>
                        <TableCell className="text-right font-bold">
                          {m.type === 'avance' ? (
                            <span className="text-orange-600">+{fmt(Number(m.montant))}</span>
                          ) : (
                            <span className="text-green-600">-{fmt(Number(m.montant))}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          <span className={m.soldeApres > 0 ? "text-orange-600" : m.soldeApres < 0 ? "text-green-600" : "text-gray-400"}>
                            {fmt(m.soldeApres)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {m.lettre ? <Badge className="bg-green-100 text-green-700">{m.lettre}</Badge> : <span className="text-gray-400">--</span>}
                        </TableCell>
                      </TableRow>
                    ))
                  })()}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog: Creer compte */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t('acc.cc.dialog_new_title', locale)}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>{t('acc.cc.field_name_required', locale)}</Label>
              <Input value={formNom} onChange={e => setFormNom(e.target.value)} placeholder={t('acc.cc.placeholder_name', locale)} />
            </div>
            <div>
              <Label>{t('acc.cc.field_type_required', locale)}</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="associe">{t('acc.cc.opt_associe_455', locale)}</SelectItem>
                  <SelectItem value="collaborateur">{t('acc.cc.opt_collab_467', locale)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>{t('acc.cc.cancel', locale)}</Button>
            <Button onClick={handleCreateCompte} disabled={saving || !formNom} className="bg-[#0B0F2E]">
              {saving ? t('acc.cc.creating', locale) : t('acc.cc.create', locale)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Enregistrer avance */}
      <Dialog open={avanceDialog} onOpenChange={setAvanceDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t('acc.cc.dialog_advance_title', locale)}</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500">
            {t('acc.cc.advance_explanation', locale)}
          </p>
          <div className="grid gap-3 py-2">
            <div>
              <Label>{t('acc.cc.field_partner_required', locale)}</Label>
              <Select value={formAvanceCompte} onValueChange={setFormAvanceCompte}>
                <SelectTrigger><SelectValue placeholder={t('acc.cc.choose', locale)} /></SelectTrigger>
                <SelectContent>
                  {comptes.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nom} ({c.type === 'associe' ? t('acc.cc.shareholder', locale) : t('acc.cc.collaborator', locale)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('acc.cc.field_amount_required', locale)}</Label>
              <Input type="number" value={formAvanceMontant} onChange={e => setFormAvanceMontant(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>{t('acc.cc.field_date', locale)}</Label>
              <Input type="date" value={formAvanceDate} onChange={e => setFormAvanceDate(e.target.value)} />
            </div>
            <div>
              <Label>{t('acc.cc.field_description', locale)}</Label>
              <Input value={formAvanceDesc} onChange={e => setFormAvanceDesc(e.target.value)} placeholder={t('acc.cc.placeholder_advance_desc', locale)} />
            </div>
            {factures.length > 0 && (
              <div>
                <Label>{t('acc.cc.link_to_supplier_invoice', locale)}</Label>
                <Select value={formAvanceFacture} onValueChange={setFormAvanceFacture}>
                  <SelectTrigger><SelectValue placeholder={t('acc.cc.no_invoice', locale)} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t('acc.cc.opt_none', locale)}</SelectItem>
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
            <Button variant="outline" onClick={() => setAvanceDialog(false)}>{t('acc.cc.cancel', locale)}</Button>
            <Button onClick={handleAvance} disabled={saving || !formAvanceCompte || !formAvanceMontant} className="bg-[#D4AF37] text-[#0B0F2E] hover:bg-[#D4AF37]/90">
              {saving ? t('acc.cc.saving', locale) : t('acc.cc.save_advance', locale)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Enregistrer remboursement */}
      <Dialog open={remboursementDialog} onOpenChange={setRemboursementDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t('acc.cc.dialog_reimb_title', locale)}</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500">
            {t('acc.cc.reimb_explanation', locale)}
          </p>
          <div className="grid gap-3 py-2">
            <div>
              <Label>{t('acc.cc.field_partner_required', locale)}</Label>
              <Select value={formRembCompte} onValueChange={setFormRembCompte}>
                <SelectTrigger><SelectValue placeholder={t('acc.cc.choose', locale)} /></SelectTrigger>
                <SelectContent>
                  {comptes.filter(c => Number(c.solde) > 0).map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nom} — {t('acc.cc.balance_label_inline', locale)}: {fmt(Number(c.solde))} MUR
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('acc.cc.field_amount_required', locale)}</Label>
              <Input type="number" value={formRembMontant} onChange={e => setFormRembMontant(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>{t('acc.cc.field_date', locale)}</Label>
              <Input type="date" value={formRembDate} onChange={e => setFormRembDate(e.target.value)} />
            </div>
            <div>
              <Label>{t('acc.cc.field_description', locale)}</Label>
              <Input value={formRembDesc} onChange={e => setFormRembDesc(e.target.value)} placeholder={t('acc.cc.placeholder_reimb_desc', locale)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemboursementDialog(false)}>{t('acc.cc.cancel', locale)}</Button>
            <Button onClick={handleRemboursement} disabled={saving || !formRembCompte || !formRembMontant} className="bg-[#0B0F2E]">
              {saving ? t('acc.cc.saving', locale) : t('acc.cc.save_reimb', locale)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </ClientPageShell>
  )
}
