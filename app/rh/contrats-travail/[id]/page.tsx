"use client"

/**
 * RH — Détail d'un contrat de travail
 *
 * Affiche le contrat complet (HTML généré / modifié), les infos employé,
 * le workflow de signature + actions (envoi signature, contresignature,
 * résiliation, PDF, avenant).
 *
 * APIs utilisées :
 *  - GET    /api/rh/contrats/[id]            (contrat + employé + société)
 *  - PATCH  /api/rh/contrats/[id]            (statut / contresignature)
 *  - POST   /api/rh/contrats/[id]/signer     (générer token signature)
 *  - GET    /api/rh/contrats/[id]/pdf        (téléchargement PDF)
 *  - GET    /api/rh/contrats?employe_id=…    (avenants / contrats liés à l'employé)
 */

import { use, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  ArrowLeft, Loader2, Download, Mail, FilePlus2, Ban, CheckCircle2, Send,
  User, Building2, Calendar, Banknote, FileText, Copy, ExternalLink,
} from "lucide-react"
import { toast } from "sonner"

// ── Types ───────────────────────────────────────────────────────────────────
type Employe = {
  id: string
  prenom: string | null
  nom: string | null
  poste: string | null
  email: string | null
  salaire_base?: number | null
  societe_id?: string | null
  societe?: { id: string; nom: string } | null
}

type Contrat = {
  id: string
  employe_id: string | null
  societe_id: string | null
  type_contrat: string
  secteur: string | null
  date_debut: string
  date_fin: string | null
  salaire_brut: number | null
  poste: string | null
  html_content: string | null
  html_content_modified: string | null
  statut: string
  notes: string | null
  motif_cdd?: string | null
  periode_essai_jours?: number | null
  token_signature: string | null
  date_signature: string | null
  date_signature_employe: string | null
  date_signature_dirigeant: string | null
  signature_nom_complet: string | null
  created_at: string
  updated_at?: string | null
  employe?: Employe | null
}

const STATUT_CLASS: Record<string, string> = {
  brouillon:     "bg-gray-100 text-gray-700 border-gray-200",
  signe_employe: "bg-blue-100 text-blue-700 border-blue-200",
  signe:         "bg-emerald-100 text-emerald-700 border-emerald-200",
  expire:        "bg-amber-100 text-amber-700 border-amber-200",
  resilie:       "bg-red-100 text-red-700 border-red-200",
}
const STATUT_LABEL: Record<string, string> = {
  brouillon:     "Brouillon",
  signe_employe: "Signé par l'employé — en attente contresignature",
  signe:         "Signé (employé + dirigeant)",
  expire:        "Expiré / Terminé",
  resilie:       "Résilié",
}

function StatutBadge({ statut }: { statut: string }) {
  const cls = STATUT_CLASS[statut] ?? "bg-gray-100 text-gray-600 border-gray-200"
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {STATUT_LABEL[statut] ?? statut}
    </span>
  )
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
  } catch {
    return iso
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })
  } catch {
    return iso
  }
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function ContratDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [contrat, setContrat] = useState<Contrat | null>(null)
  const [avenants, setAvenants] = useState<Contrat[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<null | "token" | "contresigner" | "resilier">(null)

  const [sigDialog, setSigDialog] = useState<{ lien: string; whatsapp: boolean; telephone: string | null } | null>(null)
  const [copied, setCopied] = useState<boolean>(false)
  const [confirmResilier, setConfirmResilier] = useState<boolean>(false)

  // ── Chargement contrat + contrats liés ─────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/rh/contrats/${id}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || `HTTP ${res.status}`)
      const c = d.contrat as Contrat
      setContrat(c)

      // Charger les autres contrats de l'employé (= avenants / contrats liés)
      if (c.employe_id) {
        fetch(`/api/rh/contrats?employe_id=${c.employe_id}`)
          .then(r => r.json())
          .then((d2: { contrats?: Contrat[] }) => {
            const others = (d2.contrats ?? []).filter(x => x.id !== c.id)
            setAvenants(others)
          })
          .catch(() => setAvenants([]))
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  // ── HTML à afficher ────────────────────────────────────────────────────
  const html = useMemo(() => {
    if (!contrat) return ""
    return contrat.html_content_modified || contrat.html_content || ""
  }, [contrat])

  // ── Actions ────────────────────────────────────────────────────────────
  const genererToken = async () => {
    if (!contrat) return
    setAction("token")
    try {
      const res = await fetch(`/api/rh/contrats/${contrat.id}/signer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generer_token" }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || `HTTP ${res.status}`)
      setSigDialog({ lien: d.lien_signature, whatsapp: !!d.whatsapp_envoye, telephone: d.telephone ?? null })
      if (d.whatsapp_envoye) toast.success("Lien signature envoyé par WhatsApp")
      else toast.info("Lien de signature généré")
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur envoi signature")
    } finally {
      setAction(null)
    }
  }

  const contresigner = async () => {
    if (!contrat) return
    setAction("contresigner")
    try {
      const res = await fetch(`/api/rh/contrats/${contrat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "contresigner" }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || `HTTP ${res.status}`)
      toast.success("Contrat contresigné")
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur contresignature")
    } finally {
      setAction(null)
    }
  }

  const resilier = async () => {
    if (!contrat) return
    setAction("resilier"); setConfirmResilier(false)
    try {
      const res = await fetch(`/api/rh/contrats/${contrat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut: "resilie" }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || `HTTP ${res.status}`)
      toast.success("Contrat résilié")
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur résiliation")
    } finally {
      setAction(null)
    }
  }

  const copierLien = async () => {
    if (!sigDialog?.lien) return
    try {
      await navigator.clipboard.writeText(sigDialog.lien)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Impossible de copier")
    }
  }

  // ── Rendu ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <ClientPageShell hideHero>
        <div className="flex items-center justify-center py-24 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Chargement…
        </div>
      </ClientPageShell>
    )
  }

  if (error || !contrat) {
    return (
      <ClientPageShell
        breadcrumbs={[
          { label: "RH", href: "/rh" },
          { label: "Contrats Travail", href: "/rh/contrats-travail" },
          { label: "Introuvable" },
        ]}
        title="Contrat introuvable"
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <Card className="rounded-2xl">
            <CardContent className="p-6 text-sm text-red-600">
              {error || "Ce contrat n'existe pas."}
              <div className="mt-4">
                <Link href="/rh/contrats-travail">
                  <Button variant="outline" className="rounded-xl">
                    <ArrowLeft className="h-4 w-4 mr-1.5" /> Retour à la liste
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </ClientPageShell>
    )
  }

  const nomEmploye = `${contrat.employe?.prenom ?? ""} ${contrat.employe?.nom ?? ""}`.trim() || "—"
  const peutEnvoyerSignature = contrat.statut === "brouillon"
  const peutContresigner = contrat.statut === "signe_employe"
  const peutResilier = contrat.statut === "signe" || contrat.statut === "signe_employe" || contrat.statut === "brouillon"

  return (
    <ClientPageShell
      breadcrumbs={[
        { label: "RH", href: "/rh" },
        { label: "Contrats Travail", href: "/rh/contrats-travail" },
        { label: `${contrat.type_contrat} — ${nomEmploye}` },
      ]}
      kicker="Ressources humaines"
      title={`Contrat ${contrat.type_contrat}`}
      subtitle={<span className="flex items-center gap-2 flex-wrap">{nomEmploye} <StatutBadge statut={contrat.statut} /></span>}
      actions={
        <Link href="/rh/contrats-travail">
          <Button variant="outline" className="rounded-xl">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Retour
          </Button>
        </Link>
      }
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-10 relative z-10 space-y-4">

        {/* ── Ligne : infos clés + actions ──────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Infos clés */}
          <Card className="lg:col-span-2 rounded-2xl shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-[#0B0F2E]">
                <FileText className="h-4 w-4" /> Informations clés
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <InfoRow icon={<User className="h-4 w-4 text-gray-400" />} label="Employé">
                {contrat.employe_id ? (
                  <Link
                    href={`/rh/employes?focus=${contrat.employe_id}`}
                    className="text-[#0B0F2E] font-medium hover:underline inline-flex items-center gap-1"
                  >
                    {nomEmploye}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : <span>{nomEmploye}</span>}
                {contrat.employe?.poste && <div className="text-xs text-gray-500">{contrat.employe.poste}</div>}
              </InfoRow>
              <InfoRow icon={<Building2 className="h-4 w-4 text-gray-400" />} label="Société">
                {contrat.employe?.societe?.nom ?? "—"}
              </InfoRow>
              <InfoRow icon={<Calendar className="h-4 w-4 text-gray-400" />} label="Date début">
                {formatDate(contrat.date_debut)}
              </InfoRow>
              <InfoRow icon={<Calendar className="h-4 w-4 text-gray-400" />} label="Date fin">
                {formatDate(contrat.date_fin)}
              </InfoRow>
              <InfoRow icon={<Banknote className="h-4 w-4 text-gray-400" />} label="Salaire brut">
                {contrat.salaire_brut != null ? `${contrat.salaire_brut.toLocaleString("fr-FR")} MUR` : "—"}
              </InfoRow>
              <InfoRow icon={<FileText className="h-4 w-4 text-gray-400" />} label="Secteur / Type">
                <span className="capitalize">{contrat.secteur ?? "general"}</span> · <Badge variant="outline" className="rounded-full ml-1">{contrat.type_contrat}</Badge>
              </InfoRow>
              {contrat.motif_cdd && (
                <InfoRow icon={<FileText className="h-4 w-4 text-gray-400" />} label="Motif CDD">
                  {contrat.motif_cdd}
                </InfoRow>
              )}
              {contrat.periode_essai_jours != null && (
                <InfoRow icon={<Calendar className="h-4 w-4 text-gray-400" />} label="Période d'essai">
                  {contrat.periode_essai_jours} jours
                </InfoRow>
              )}
            </CardContent>
          </Card>

          {/* Actions workflow */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-[#0B0F2E]">
                <CheckCircle2 className="h-4 w-4" /> Workflow
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <Button
                onClick={genererToken}
                disabled={!peutEnvoyerSignature || action === "token"}
                className="w-full rounded-xl bg-[#0B0F2E] hover:bg-[#1a1f4a] text-white"
              >
                {action === "token" ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
                Envoyer pour signature
              </Button>
              <Button
                onClick={contresigner}
                disabled={!peutContresigner || action === "contresigner"}
                variant="outline"
                className="w-full rounded-xl"
              >
                {action === "contresigner" ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                Contresigner (dirigeant)
              </Button>
              <Button
                onClick={() => window.open(`/api/rh/contrats/${contrat.id}/pdf`, "_blank")}
                variant="outline"
                className="w-full rounded-xl"
              >
                <Download className="h-4 w-4 mr-1.5" /> Télécharger PDF
              </Button>
              {contrat.employe?.email && (
                <Button
                  asChild
                  variant="outline"
                  className="w-full rounded-xl"
                >
                  <a href={`mailto:${contrat.employe.email}?subject=${encodeURIComponent(`Contrat ${contrat.type_contrat}`)}`}>
                    <Mail className="h-4 w-4 mr-1.5" /> Envoyer par email
                  </a>
                </Button>
              )}
              <Button
                onClick={() => router.push(`/rh/contrats-travail/nouveau?avenant=${contrat.id}`)}
                variant="outline"
                className="w-full rounded-xl"
              >
                <FilePlus2 className="h-4 w-4 mr-1.5" /> Créer un avenant
              </Button>
              <Button
                onClick={() => setConfirmResilier(true)}
                disabled={!peutResilier || action === "resilier"}
                variant="outline"
                className="w-full rounded-xl border-red-200 text-red-700 hover:bg-red-50"
              >
                <Ban className="h-4 w-4 mr-1.5" /> Résilier le contrat
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ── Signatures ────────────────────────────────────────────────── */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-[#0B0F2E]">
              <CheckCircle2 className="h-4 w-4" /> Historique des signatures
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <InfoRow icon={<User className="h-4 w-4 text-gray-400" />} label="Signature employé">
              {formatDateTime(contrat.date_signature_employe)}
            </InfoRow>
            <InfoRow icon={<User className="h-4 w-4 text-gray-400" />} label="Contresignature dirigeant">
              {formatDateTime(contrat.date_signature_dirigeant)}
            </InfoRow>
            <InfoRow icon={<Calendar className="h-4 w-4 text-gray-400" />} label="Dernière mise à jour">
              {formatDateTime(contrat.updated_at ?? contrat.created_at)}
            </InfoRow>
          </CardContent>
        </Card>

        {/* ── Contenu HTML du contrat ───────────────────────────────────── */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-[#0B0F2E]">
              <FileText className="h-4 w-4" /> Contenu du contrat
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {html ? (
              <div
                className="rounded-xl border bg-white p-4 max-h-[70vh] overflow-y-auto prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <p className="text-sm text-gray-500">Aucun contenu HTML enregistré pour ce contrat.</p>
            )}
          </CardContent>
        </Card>

        {/* ── Avenants / autres contrats du même employé ───────────────── */}
        {avenants.length > 0 && (
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-[#0B0F2E]">
                <FilePlus2 className="h-4 w-4" /> Autres contrats / avenants ({avenants.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {avenants.map((a) => (
                <Link
                  key={a.id}
                  href={`/rh/contrats-travail/${a.id}`}
                  className="flex items-center justify-between rounded-xl border border-gray-200 p-3 hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="rounded-full">{a.type_contrat}</Badge>
                    <div>
                      <div className="text-sm font-medium">Du {formatDate(a.date_debut)} au {formatDate(a.date_fin)}</div>
                      <div className="text-xs text-gray-500">{a.poste ?? "—"}</div>
                    </div>
                  </div>
                  <StatutBadge statut={a.statut} />
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Dialog : lien signature ──────────────────────────────────────── */}
      <Dialog open={!!sigDialog} onOpenChange={(v) => !v && setSigDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lien de signature</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {sigDialog?.whatsapp ? (
              <p className="text-emerald-700">
                Lien envoyé par WhatsApp au <strong>{sigDialog.telephone}</strong>.
              </p>
            ) : (
              <p className="text-gray-600">
                WhatsApp non configuré ou employé sans téléphone. Partagez le lien ci-dessous manuellement :
              </p>
            )}
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={sigDialog?.lien ?? ""}
                className="flex-1 h-10 rounded-xl border border-gray-200 px-3 text-xs"
              />
              <Button size="sm" variant="outline" onClick={copierLien} className="rounded-xl">
                <Copy className="h-4 w-4 mr-1" /> {copied ? "Copié" : "Copier"}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSigDialog(null)} className="rounded-xl">Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog : confirmation résiliation ────────────────────────────── */}
      <Dialog open={confirmResilier} onOpenChange={setConfirmResilier}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la résiliation</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Cette action passe le contrat au statut <strong>résilié</strong>. Elle est réversible
            uniquement par un administrateur.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmResilier(false)} className="rounded-xl">Annuler</Button>
            <Button
              onClick={resilier}
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
            >
              Résilier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPageShell>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1 flex items-center gap-1.5">
        {icon} {label}
      </div>
      <div className="text-sm text-gray-800">{children}</div>
    </div>
  )
}
