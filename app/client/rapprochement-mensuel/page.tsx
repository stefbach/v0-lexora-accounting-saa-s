"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileCheck2, Plus, Lock, CheckCircle2, AlertCircle, Loader2, Trash2, Calendar } from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale, type Locale } from '@/lib/i18n'

function fmt(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function formatDate(d: string) { return d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—" }

export default function RapprochementMensuelPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [comptesBancaires, setComptesBancaires] = useState<any[]>([])
  const [compteId, setCompteId] = useState<string>("")
  const [periodEnd, setPeriodEnd] = useState<string>(new Date().toISOString().slice(0, 10))
  const [bankBalance, setBankBalance] = useState<string>("")
  const [reconciliations, setReconciliations] = useState<any[]>([])
  const [currentRecon, setCurrentRecon] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddItem, setShowAddItem] = useState<"bank" | "compta" | null>(null)
  const [newItem, setNewItem] = useState({ nature: "", amount: "", category: "", date_operation: "", description: "" })

  // Comptes bancaires
  useEffect(() => {
    if (!societeId) return
    fetch(`/api/comptable/rapprochement?societe_id=${societeId}`).then(r => r.json()).then((d: any) => {
      const cb = d.comptesBancaires || []
      setComptesBancaires(cb)
      if (cb.length > 0 && !compteId) setCompteId(cb[0].id)
    }).catch(() => {})
  }, [societeId])

  // Liste des rapprochements existants
  const loadReconciliations = useCallback(async () => {
    if (!societeId) return
    try {
      const res = await fetch(`/api/comptable/rapprochement-mensuel?societe_id=${societeId}`)
      const d = await res.json()
      setReconciliations(d.reconciliations || [])
    } catch { setReconciliations([]) }
  }, [societeId])

  useEffect(() => { loadReconciliations() }, [loadReconciliations])

  // Détail d'un rapprochement
  const loadDetail = async (recon: any) => {
    setCurrentRecon(recon)
    try {
      const res = await fetch(`/api/comptable/rapprochement-mensuel?societe_id=${societeId}&compte_bancaire_id=${recon.compte_bancaire_id}&period_end=${recon.period_end}`)
      const d = await res.json()
      setItems(d.items || [])
    } catch { setItems([]) }
  }

  // Créer un nouveau rapprochement
  const handleCreate = async () => {
    if (!societeId || !compteId || !periodEnd || !bankBalance) {
      alert("Tous les champs sont requis")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/comptable/rapprochement-mensuel", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create", societe_id: societeId,
          compte_bancaire_id: compteId, period_end: periodEnd,
          bank_balance: parseFloat(bankBalance),
        }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error); return }
      setBankBalance("")
      await loadReconciliations()
      await loadDetail(d.reconciliation)
    } finally { setLoading(false) }
  }

  // Ajouter un élément
  const handleAddItem = async () => {
    if (!currentRecon || !newItem.amount || !newItem.nature) return
    try {
      await fetch("/api/comptable/rapprochement-mensuel", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_item",
          reconciliation_id: currentRecon.id,
          side: showAddItem,
          nature: newItem.nature,
          amount: parseFloat(newItem.amount),
          category: newItem.category,
          date_operation: newItem.date_operation || null,
          description: newItem.description,
        }),
      })
      setShowAddItem(null)
      setNewItem({ nature: "", amount: "", category: "", date_operation: "", description: "" })
      await loadDetail(currentRecon)
      await loadReconciliations()
    } catch { alert("Erreur ajout") }
  }

  const handleRemoveItem = async (itemId: string) => {
    if (!confirm("Supprimer cet élément ?")) return
    await fetch("/api/comptable/rapprochement-mensuel", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove_item", item_id: itemId, reconciliation_id: currentRecon.id }),
    })
    await loadDetail(currentRecon)
    await loadReconciliations()
  }

  const handleAction = async (action: string) => {
    if (!currentRecon) return
    const confirmMsg = action === 'lock' ? '⚠ Verrouillage définitif. La période ne pourra plus être modifiée. Continuer ?' : null
    if (confirmMsg && !confirm(confirmMsg)) return
    await fetch("/api/comptable/rapprochement-mensuel", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id: currentRecon.id }),
    })
    await loadReconciliations()
  }

  const bankItems = items.filter(i => i.side === 'bank')
  const comptaItems = items.filter(i => i.side === 'compta')
  const isLocked = currentRecon?.status === 'locked'
  const isValidated = currentRecon?.status === 'validated'
  const isBalanced = currentRecon && Math.abs(Number(currentRecon.residual_gap) || 0) < 0.01

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B0F2E] flex items-center gap-2">
          <FileCheck2 className="w-7 h-7" style={{ color: "#D4AF37" }} />
          {t('acc.rm.title', locale)}
        </h1>
        <p className="text-sm text-gray-500">{t('acc.rm.subtitle', locale)}</p>
      </div>

      {/* Compte */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>{t('acc.rm.bank_account', locale)}</Label>
          <Select value={compteId} onValueChange={setCompteId}>
            <SelectTrigger><SelectValue placeholder={t('acc.rm.choose_account', locale)} /></SelectTrigger>
            <SelectContent>
              {comptesBancaires.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.banque} — {c.numero_compte} ({c.devise})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Nouveau rapprochement */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Plus className="w-5 h-5" />{t('acc.rm.new_reconciliation', locale)}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>{t('acc.rm.period_end', locale)}</Label>
            <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
          </div>
          <div>
            <Label>{t('acc.rm.bank_balance_at_date', locale)}</Label>
            <Input type="number" step="0.01" placeholder="0.00" value={bankBalance} onChange={e => setBankBalance(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={handleCreate} disabled={loading || !compteId} className="w-full bg-[#0B0F2E]">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              {t('common.create', locale)}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Liste des rapprochements */}
      {reconciliations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('acc.rm.history', locale)} ({reconciliations.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t('acc.rm.period', locale)}</TableHead><TableHead>{t('acc.rm.account', locale)}</TableHead>
                <TableHead className="text-right">{t('acc.rm.statement_balance', locale)}</TableHead>
                <TableHead className="text-right">{t('acc.rm.gl_balance', locale)}</TableHead>
                <TableHead className="text-right">{t('acc.rm.residual_gap', locale)}</TableHead>
                <TableHead>{t('common.status', locale)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {reconciliations.map((r: any) => {
                  const gap = Number(r.residual_gap) || 0
                  const ok = Math.abs(gap) < 0.01
                  return (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-gray-50" onClick={() => loadDetail(r)}>
                      <TableCell>{formatDate(r.period_end)}</TableCell>
                      <TableCell className="text-sm">{r.comptes_bancaires?.banque} — {r.comptes_bancaires?.numero_compte}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(Number(r.bank_balance) || 0)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(Number(r.gl_balance) || 0)}</TableCell>
                      <TableCell className="text-right font-mono">
                        <span className={ok ? "text-green-600" : "text-red-600"}>{fmt(gap)}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={r.status === 'locked' ? 'bg-gray-800 text-white' : r.status === 'validated' ? 'bg-green-100 text-green-700' : r.status === 'submitted' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}>
                          {r.status === 'locked' && <Lock className="w-3 h-3 mr-1" />}
                          {r.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Détail du rapprochement sélectionné */}
      {currentRecon && (
        <Card className="border-2" style={{ borderColor: isBalanced ? '#10b981' : '#ef4444' }}>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                {t('acc.rm.reconciliation', locale)} {formatDate(currentRecon.period_end)}
              </CardTitle>
              <div className="flex gap-2">
                {!isLocked && !isValidated && (
                  <Button size="sm" variant="outline" onClick={() => handleAction('submit')}>{t('acc.rm.submit', locale)}</Button>
                )}
                {!isLocked && (
                  <Button size="sm" className="bg-green-600 text-white" onClick={() => handleAction('validate')}>
                    <CheckCircle2 className="w-4 h-4 mr-1" />{t('acc.rm.validate', locale)}
                  </Button>
                )}
                {isValidated && !isLocked && (
                  <Button size="sm" className="bg-gray-800 text-white" onClick={() => handleAction('lock')}>
                    <Lock className="w-4 h-4 mr-1" />{t('acc.rm.lock', locale)}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Soldes de base */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-xs text-blue-600 font-medium mb-1">{t('acc.rm.bank_balance', locale)}</p>
                <p className="text-2xl font-bold text-blue-900">{fmt(Number(currentRecon.bank_balance) || 0)}</p>
                <p className="text-xs text-blue-500 mt-1">{t('acc.rm.at', locale)} {formatDate(currentRecon.period_end)}</p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <p className="text-xs text-purple-600 font-medium mb-1">{t('acc.rm.accounting_balance', locale)}</p>
                <p className="text-2xl font-bold text-purple-900">{fmt(Number(currentRecon.gl_balance) || 0)}</p>
                <p className="text-xs text-purple-500 mt-1">{t('acc.rm.computed_from_entries', locale)}</p>
              </div>
            </div>

            {/* Tableau deux colonnes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Côté Banque */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#0B0F2E]">{t('acc.rm.bank_side', locale)}</h3>
                  {!isLocked && <Button size="sm" variant="outline" onClick={() => setShowAddItem('bank')}><Plus className="w-3 h-3" /></Button>}
                </div>
                {bankItems.length === 0 ? (
                  <p className="text-xs text-gray-400 italic p-4 bg-gray-50 rounded">{t('acc.rm.no_item', locale)}</p>
                ) : (
                  bankItems.map((i: any) => (
                    <div key={i.id} className="flex items-center justify-between p-2 border rounded text-sm">
                      <div className="flex-1">
                        <p className="font-medium">{i.nature}</p>
                        <p className="text-xs text-gray-500">{i.description} {i.date_operation && `— ${formatDate(i.date_operation)}`}</p>
                      </div>
                      <span className={`font-mono font-bold ${Number(i.amount) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {Number(i.amount) > 0 ? '+' : ''}{fmt(Number(i.amount))}
                      </span>
                      {!isLocked && (
                        <Button size="sm" variant="ghost" onClick={() => handleRemoveItem(i.id)}>
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
                <div className="pt-2 border-t mt-2">
                  <div className="flex justify-between text-sm font-bold">
                    <span>{t('acc.rm.adjusted_bank', locale)}</span>
                    <span className="font-mono text-blue-600">{fmt(Number(currentRecon.adjusted_bank_balance) || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Côté Compta */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#0B0F2E]">{t('acc.rm.compta_side', locale)}</h3>
                  {!isLocked && <Button size="sm" variant="outline" onClick={() => setShowAddItem('compta')}><Plus className="w-3 h-3" /></Button>}
                </div>
                {comptaItems.length === 0 ? (
                  <p className="text-xs text-gray-400 italic p-4 bg-gray-50 rounded">{t('acc.rm.no_item', locale)}</p>
                ) : (
                  comptaItems.map((i: any) => (
                    <div key={i.id} className="flex items-center justify-between p-2 border rounded text-sm">
                      <div className="flex-1">
                        <p className="font-medium">{i.nature}</p>
                        <p className="text-xs text-gray-500">{i.description} {i.date_operation && `— ${formatDate(i.date_operation)}`}</p>
                      </div>
                      <span className={`font-mono font-bold ${Number(i.amount) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {Number(i.amount) > 0 ? '+' : ''}{fmt(Number(i.amount))}
                      </span>
                      {!isLocked && (
                        <Button size="sm" variant="ghost" onClick={() => handleRemoveItem(i.id)}>
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
                <div className="pt-2 border-t mt-2">
                  <div className="flex justify-between text-sm font-bold">
                    <span>{t('acc.rm.adjusted_compta', locale)}</span>
                    <span className="font-mono text-purple-600">{fmt(Number(currentRecon.adjusted_gl_balance) || 0)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Écart résiduel */}
            <div className={`p-4 rounded-lg border-2 ${isBalanced ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isBalanced ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <AlertCircle className="w-5 h-5 text-red-600" />}
                  <span className="font-bold">{isBalanced ? t('acc.rm.balanced', locale) : t('acc.rm.gap_to_justify', locale)}</span>
                </div>
                <span className={`text-2xl font-mono font-bold ${isBalanced ? 'text-green-700' : 'text-red-700'}`}>
                  {fmt(Number(currentRecon.residual_gap) || 0)}
                </span>
              </div>
              {isLocked && (
                <p className="text-xs mt-2 text-gray-600">🔒 {t('acc.rm.locked_on', locale)} {formatDate(currentRecon.locked_at)}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog ajout d'élément */}
      <Dialog open={!!showAddItem} onOpenChange={(o) => { if (!o) setShowAddItem(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('acc.rm.add_item_to', locale)} {showAddItem === 'bank' ? t('acc.rm.bank_uc', locale) : t('acc.rm.accounting_uc', locale)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('acc.rm.nature', locale)}</Label>
              <Select value={newItem.nature} onValueChange={v => setNewItem({ ...newItem, nature: v })}>
                <SelectTrigger><SelectValue placeholder={t('acc.rm.choose', locale)} /></SelectTrigger>
                <SelectContent>
                  {showAddItem === 'bank' ? (
                    <>
                      <SelectItem value="virement_recu_non_saisi">{t('acc.rm.reason_virement_recu', locale)}</SelectItem>
                      <SelectItem value="interets_crediteurs">{t('acc.rm.reason_interets', locale)}</SelectItem>
                      <SelectItem value="frais_bancaires_non_saisis">Frais bancaires non saisis</SelectItem>
                      <SelectItem value="erreur_banque">Erreur banque</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="cheque_emis_non_encaisse">{t('acc.rm.reason_cheque_emis', locale)}</SelectItem>
                      <SelectItem value="virement_580_transit">Virement 580 en transit</SelectItem>
                      <SelectItem value="remise_en_cours">Remise en cours d'encaissement</SelectItem>
                      <SelectItem value="erreur_saisie_compta">Erreur de saisie compta</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('acc.rm.amount_help', locale)}</Label>
              <Input type="number" step="0.01" value={newItem.amount} onChange={e => setNewItem({ ...newItem, amount: e.target.value })} />
            </div>
            <div>
              <Label>{t('acc.rm.operation_date', locale)}</Label>
              <Input type="date" value={newItem.date_operation} onChange={e => setNewItem({ ...newItem, date_operation: e.target.value })} />
            </div>
            <div>
              <Label>{t('common.description', locale)}</Label>
              <Input value={newItem.description} onChange={e => setNewItem({ ...newItem, description: e.target.value })} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAddItem(null)}>{t('common.cancel', locale)}</Button>
              <Button onClick={handleAddItem} className="bg-[#0B0F2E]">{t('acc.rm.add', locale)}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
