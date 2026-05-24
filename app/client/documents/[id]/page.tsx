"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ArrowLeft, FileText, Loader2, CheckCircle, AlertTriangle,
  RefreshCw, Edit2, Download, Building2, Calendar, Hash, Euro,
  TrendingUp, TrendingDown, AlertCircle,
} from "lucide-react"
import { t, getLocale, type Locale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function getTypeLabels(locale: Locale): Record<string, string> {
  return {
    facture_fournisseur: t('core.docdetail.tl.facture_fournisseur', locale),
    facture_client: t('core.docdetail.tl.facture_client', locale),
    releve_bancaire: t('core.docdetail.tl.releve_bancaire', locale),
    fiche_paie: t('core.docdetail.tl.fiche_paie', locale),
    charges_sociales: t('core.docdetail.tl.charges_sociales', locale),
    contrat: t('core.docdetail.tl.contrat', locale),
    rapport: t('core.docdetail.tl.rapport', locale),
    autre: t('core.docdetail.tl.autre', locale),
  }
}

interface DocumentDetail {
  id: string
  nom_fichier: string
  type_fichier: string
  type_document: string | null
  statut: string
  storage_path: string | null
  created_at: string
  societe_detectee: string | null
  n8n_result?: Record<string, any> | null
  confiance_type?: number | null
  corrige_manuellement?: boolean
  taille_fichier?: number
  signed_url?: string | null
  dossiers?: {
    client_id: string
    societe_id: string
    societes?: { nom: string; brn?: string }
  }
}

function ConfianceBadge({ confiance, locale }: { confiance: number | null | undefined; locale: Locale }) {
  if (confiance == null) return null
  if (confiance >= 80) return <Badge className="bg-green-100 text-green-700">{confiance}{t('core.docdetail.high_confidence', locale)}</Badge>
  if (confiance >= 50) return <Badge className="bg-orange-100 text-orange-700">{confiance}{t('core.docdetail.medium_confidence', locale)}</Badge>
  return <Badge className="bg-red-100 text-red-700">{confiance}{t('core.docdetail.low_confidence', locale)}</Badge>
}

function StatutBadge({ statut, locale }: { statut: string; locale: Locale }) {
  if (statut === "traite") return <Badge className="bg-green-100 text-green-700"><CheckCircle className="h-3 w-3 mr-1" />{t('core.docdetail.statut_traite', locale)}</Badge>
  if (statut === "en_cours" || statut === "en_attente") return <Badge className="bg-blue-100 text-blue-700"><Loader2 className="h-3 w-3 mr-1 animate-spin" />{t('core.docdetail.statut_en_cours', locale)}</Badge>
  if (statut === "erreur") return <Badge className="bg-red-100 text-red-700"><AlertTriangle className="h-3 w-3 mr-1" />{t('core.docdetail.statut_erreur', locale)}</Badge>
  return <Badge variant="outline">{statut}</Badge>
}

export default function DocumentDetailPage() {
  const locale = getLocale()
  const TYPE_LABELS = getTypeLabels(locale)
  const params = useParams()
  const router = useRouter()
  const docId = params.id as string

  const [doc, setDoc] = useState<DocumentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Edit form state
  const [editTypeDoc, setEditTypeDoc] = useState("")
  const [editSocieteId, setEditSocieteId] = useState("")
  const [hintText, setHintText] = useState("")
  const [societes, setSocietes] = useState<{ id: string; nom: string }[]>([])

  const fetchDoc = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${docId}`)
      const data = await res.json()
      if (res.ok && data.document) {
        setDoc(data.document)
        setEditTypeDoc(data.document.type_document || "")
      } else {
        setMessage({ type: "error", text: data.error || t('core.docdetail.not_found', locale) })
      }
    } catch {
      setMessage({ type: "error", text: t('core.docdetail.loading_error', locale) })
    } finally {
      setLoading(false)
    }
  }, [docId, locale])

  useEffect(() => {
    fetchDoc()
    // Load societes for reassignment
    fetch("/api/admin/societes")
      .then(r => r.json())
      .then(d => setSocietes(d.societes || []))
      .catch(() => {})
  }, [fetchDoc])

  const handleSaveCorrection = async () => {
    setSaving(true)
    try {
      const body: Record<string, any> = { corrige_manuellement: true }
      if (editTypeDoc) body.type_document = editTypeDoc
      if (editSocieteId) body.societe_id = editSocieteId

      const res = await fetch(`/api/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: "success", text: t('core.docdetail.corrections_saved', locale) })
        setEditMode(false)
        await fetchDoc()
      } else {
        setMessage({ type: "error", text: data.error || t('core.docdetail.save_error', locale) })
      }
    } catch {
      setMessage({ type: "error", text: t('core.docdetail.conn_error', locale) })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(null), 6000)
    }
  }

  const handleReanalyze = async () => {
    setReanalyzing(true)
    setMessage(null)
    try {
      const body: Record<string, any> = {}
      if (hintText) body.hint = hintText
      if (editTypeDoc) body.type_force = editTypeDoc
      // Pas de max_tokens override — l'API utilise par défaut
      // CLAUDE_CONFIG.max_tokens_releve_bancaire (128k) pour les relevés
      // bancaires, ce qui permet d'extraire 100+ transactions. La continuation
      // multi-call (lib/ai/bank-statement-extraction.ts) prend le relais
      // au-delà.

      const res = await fetch(`/api/documents/${docId}/reanalyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setMessage({ type: "success", text: `${t('core.docdetail.reanalyzed_success', locale)}${data.type_detected || "—"}` })
        setHintText("")
        await fetchDoc()
      } else {
        setMessage({ type: "error", text: data.error || t('core.docdetail.reanalyze_error', locale) })
      }
    } catch {
      setMessage({ type: "error", text: t('core.docdetail.conn_error', locale) })
    } finally {
      setReanalyzing(false)
      setTimeout(() => setMessage(null), 8000)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-3" />
        <p>{t('core.docdetail.not_found_or_no_access', locale)}</p>
        <Button className="mt-4" variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />{t('core.docdetail.back', locale)}
        </Button>
      </div>
    )
  }

  const extraction = doc.n8n_result?.extraction || {}
  const routing = doc.n8n_result?.routing || {}
  const transactions = extraction.transactions || extraction.lignes || []
  const ecritures = extraction.ecritures_comptables || []
  const confiance = doc.confiance_type ?? routing.confiance_type ?? null

  const isReleve = doc.type_document === "releve_bancaire"
  const needsAttention = !doc.type_document || doc.type_document === "autre" || doc.statut === "erreur" || (confiance !== null && confiance < 80)

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/client/documents">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />{t('core.docdetail.my_documents', locale)}
          </Button>
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium truncate max-w-xs">{doc.nom_fichier}</span>
      </div>

      {/* Message feedback */}
      {message && (
        <div className={`rounded-md px-4 py-3 text-sm flex items-center gap-2 ${
          message.type === "success" ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"
        }`}>
          {message.type === "success" ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          {message.text}
        </div>
      )}

      {/* Document info card */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2" style={{ color: NAVY }}>
                <FileText className="h-5 w-5" />
                {doc.nom_fichier}
              </CardTitle>
              <div className="flex flex-wrap gap-2 mt-2">
                <StatutBadge statut={doc.statut} locale={locale} />
                <ConfianceBadge confiance={confiance} locale={locale} />
                {doc.corrige_manuellement && (
                  <Badge variant="outline" className="text-xs">{t('core.docdetail.corrected_manually', locale)}</Badge>
                )}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {doc.signed_url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={doc.signed_url} target="_blank" rel="noreferrer">
                    <Download className="h-4 w-4 mr-1" />{t('core.docdetail.download', locale)}
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditMode(!editMode)}
              >
                <Edit2 className="h-4 w-4 mr-1" />{editMode ? t('core.docdetail.cancel', locale) : t('core.docdetail.correct', locale)}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Hash className="h-3 w-3" />{t('core.docdetail.type', locale)}</p>
              <p className="font-medium">{TYPE_LABELS[doc.type_document || ""] || doc.type_document || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Building2 className="h-3 w-3" />{t('core.docdetail.company', locale)}</p>
              <p className="font-medium">{doc.societe_detectee || doc.dossiers?.societes?.nom || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Calendar className="h-3 w-3" />{t('core.docdetail.upload_date', locale)}</p>
              <p className="font-medium">{new Date(doc.created_at).toLocaleDateString(locale === 'en' ? 'en-US' : 'fr-FR')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t('core.docdetail.format', locale)}</p>
              <p className="font-medium uppercase">{doc.type_fichier}</p>
            </div>
          </div>

          {/* Extraction summary */}
          {extraction.montant_ttc || extraction.montant_total ? (
            <div className="mt-4 p-3 rounded-lg bg-muted/40 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              {extraction.emetteur && <div><span className="text-xs text-muted-foreground">{t('core.docdetail.issuer', locale)}</span><p className="font-medium">{extraction.emetteur}</p></div>}
              {extraction.destinataire && <div><span className="text-xs text-muted-foreground">{t('core.docdetail.recipient', locale)}</span><p className="font-medium">{extraction.destinataire}</p></div>}
              {extraction.date_document && <div><span className="text-xs text-muted-foreground">{t('core.docdetail.document_date', locale)}</span><p className="font-medium">{extraction.date_document}</p></div>}
              {extraction.numero_reference && <div><span className="text-xs text-muted-foreground">{t('core.docdetail.reference', locale)}</span><p className="font-medium">{extraction.numero_reference}</p></div>}
              {extraction.montant_ht != null && <div><span className="text-xs text-muted-foreground">{t('core.docdetail.amount_excl_vat', locale)}</span><p className="font-medium">{Number(extraction.montant_ht).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR')} {extraction.devise || "MUR"}</p></div>}
              {extraction.montant_tva != null && <div><span className="text-xs text-muted-foreground">{t('core.docdetail.vat', locale)}</span><p className="font-medium">{Number(extraction.montant_tva).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR')} {extraction.devise || "MUR"}</p></div>}
              {(extraction.montant_ttc || extraction.montant_total) != null && (
                <div><span className="text-xs text-muted-foreground">{t('core.docdetail.amount_incl_vat', locale)}</span>
                  <p className="font-medium text-base">{Number(extraction.montant_ttc || extraction.montant_total).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR')} {extraction.devise || "MUR"}</p>
                </div>
              )}
            </div>
          ) : null}

          {/* Bank statement coherence warning */}
          {isReleve && extraction.lignes_manquantes && (
            <div className="mt-3 p-3 rounded-lg bg-orange-50 border border-orange-200 flex items-center gap-2 text-sm text-orange-800">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {t('core.docdetail.balance_warn_prefix', locale)}{extraction.ecart_solde}{t('core.docdetail.balance_warn_suffix', locale)}
              <Button size="sm" variant="outline" className="ml-auto" onClick={handleReanalyze} disabled={reanalyzing}>
                <RefreshCw className={`h-3 w-3 mr-1 ${reanalyzing ? "animate-spin" : ""}`} />{t('core.docdetail.re_read', locale)}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bank statement transactions */}
      {isReleve && transactions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base" style={{ color: NAVY }}>
              {t('core.docdetail.transactions', locale)} ({transactions.length})
            </CardTitle>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>{t('core.docdetail.opening_balance', locale)}<strong>{Number(extraction.solde_ouverture || extraction.solde_debut || 0).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR')}</strong></span>
              <span>{t('core.docdetail.total_credits', locale)}<strong className="text-green-700">+{Number(extraction.total_credits || 0).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR')}</strong></span>
              <span>{t('core.docdetail.total_debits', locale)}<strong className="text-red-700">-{Number(extraction.total_debits || 0).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR')}</strong></span>
              <span>{t('core.docdetail.closing_balance', locale)}<strong>{Number(extraction.solde_cloture || extraction.solde_fin || 0).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR')}</strong></span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('core.docdetail.col_date', locale)}</TableHead>
                    <TableHead>{t('core.docdetail.col_label', locale)}</TableHead>
                    <TableHead>{t('core.docdetail.col_party', locale)}</TableHead>
                    <TableHead>{t('core.docdetail.col_account', locale)}</TableHead>
                    <TableHead className="text-right">{t('core.docdetail.col_debit', locale)}</TableHead>
                    <TableHead className="text-right">{t('core.docdetail.col_credit', locale)}</TableHead>
                    <TableHead>{t('core.docdetail.col_confidence', locale)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx: any, i: number) => (
                    <TableRow key={i} className={tx.confiance < 50 ? "bg-orange-50" : ""}>
                      <TableCell className="text-xs">{tx.date}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate" title={tx.libelle}>{tx.libelle}</TableCell>
                      <TableCell className="text-xs">
                        {tx.tiers_detecte ? (
                          <span className="font-medium">{tx.tiers_detecte}</span>
                        ) : (
                          <span className="text-muted-foreground italic">{t('core.docdetail.unidentified', locale)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono">{tx.compte_comptable || tx.compte_debit || tx.compte_credit || "—"}</TableCell>
                      <TableCell className="text-right text-xs text-red-700">
                        {(tx.debit > 0 || tx.sens === "debit") ? (
                          <span className="flex items-center justify-end gap-1">
                            <TrendingDown className="h-3 w-3" />
                            {Number(tx.debit || tx.montant || 0).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR')}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-green-700">
                        {(tx.credit > 0 || tx.sens === "credit") ? (
                          <span className="flex items-center justify-end gap-1">
                            <TrendingUp className="h-3 w-3" />
                            {Number(tx.credit || tx.montant || 0).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR')}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {tx.confiance != null ? (
                          <span className={`text-xs font-medium ${tx.confiance >= 80 ? "text-green-700" : tx.confiance >= 50 ? "text-orange-600" : "text-red-600"}`}>
                            {tx.confiance}%
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accounting entries */}
      {ecritures.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base" style={{ color: NAVY }}>
              {t('core.docdetail.entries_generated', locale)} ({ecritures.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('core.docdetail.col_account', locale)}</TableHead>
                  <TableHead>{t('core.docdetail.col_label', locale)}</TableHead>
                  <TableHead className="text-right">{t('core.docdetail.col_debit', locale)}</TableHead>
                  <TableHead className="text-right">{t('core.docdetail.col_credit', locale)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ecritures.map((e: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-sm">{e.compte}</TableCell>
                    <TableCell className="text-sm">{e.libelle}</TableCell>
                    <TableCell className="text-right text-sm">{e.debit > 0 ? Number(e.debit).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR') : "—"}</TableCell>
                    <TableCell className="text-right text-sm">{e.credit > 0 ? Number(e.credit).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR') : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Action buttons for low confidence / errors */}
      {needsAttention && !editMode && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="py-4">
            <p className="text-sm text-orange-800 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {t('core.docdetail.needs_attention', locale)}
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                style={{ backgroundColor: GOLD, color: "white" }}
                onClick={() => setEditMode(true)}
              >
                <Edit2 className="h-4 w-4 mr-1" />{t('core.docdetail.correct_manually', locale)}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleReanalyze}
                disabled={reanalyzing}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${reanalyzing ? "animate-spin" : ""}`} />
                {reanalyzing ? t('core.docdetail.reanalyzing', locale) : t('core.docdetail.reanalyze', locale)}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual correction form */}
      {editMode && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base" style={{ color: NAVY }}>
              <Edit2 className="h-4 w-4 mr-2 inline" />{t('core.docdetail.manual_correction', locale)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('core.docdetail.document_type', locale)}</Label>
                <Select value={editTypeDoc} onValueChange={setEditTypeDoc}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('core.docdetail.select_type', locale)} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {societes.length > 0 && (
                <div className="space-y-2">
                  <Label>{t('core.docdetail.company', locale)}</Label>
                  <Select value={editSocieteId} onValueChange={setEditSocieteId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('core.docdetail.select_company', locale)} />
                    </SelectTrigger>
                    <SelectContent>
                      {societes.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>{t('core.docdetail.reanalysis_hint', locale)}</Label>
              <Textarea
                placeholder={t('core.docdetail.ph.hint', locale)}
                value={hintText}
                onChange={e => setHintText(e.target.value)}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                {t('core.docdetail.hint_help', locale)}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                style={{ backgroundColor: GOLD, color: "white" }}
                onClick={handleSaveCorrection}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                {t('core.docdetail.save_corrections', locale)}
              </Button>
              <Button
                variant="outline"
                onClick={handleReanalyze}
                disabled={reanalyzing}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${reanalyzing ? "animate-spin" : ""}`} />
                {reanalyzing ? t('core.docdetail.reanalyzing', locale) : t('core.docdetail.reanalyze_with_ai', locale)}
              </Button>
              <Button variant="ghost" onClick={() => setEditMode(false)}>{t('core.docdetail.cancel', locale)}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
