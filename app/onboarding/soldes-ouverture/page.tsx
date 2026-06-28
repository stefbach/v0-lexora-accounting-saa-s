"use client"

/**
 * /onboarding/soldes-ouverture
 *
 * Étape critique de l'onboarding d'une nouvelle société cliente :
 * saisie des SOLDES D'OUVERTURE (banques, clients 411, fournisseurs 401,
 * immobilisations 2xx) au début d'exercice.
 *
 * À la soumission, la route POST /api/onboarding/soldes-ouverture appelle
 * la RPC `enregistrer_soldes_ouverture` (migration 301) qui génère des
 * écritures équilibrées dans `ecritures_comptables_v2` :
 *   - journal       = 'AN' (À-Nouveaux)
 *   - date_ecriture = date_debut_exercice de la société
 *   - contre-partie = 110 (Report à nouveau)
 *
 * Idempotent : un (societe_id, exercice) ne peut être saisi qu'une fois.
 * Si déjà saisi, la page affiche le diff et bloque la soumission.
 *
 * Inspiration UI : app/comptable/rapprochement/page.tsx (shadcn + Tailwind).
 */

import { useEffect, useMemo, useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, CheckCircle2, AlertTriangle, Save } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale } from "@/lib/i18n"
import {
  SoldeOuvertureCard,
  type SoldeLigne,
  type SoldeSection,
  makeEmptyLigne,
} from "@/components/onboarding/SoldeOuvertureCard"

interface Societe {
  id: string
  nom: string
  date_debut_exercice?: string | null
  date_fin_exercice?: string | null
}

function exerciceFromDate(d?: string | null): string {
  if (!d) return ""
  const date = new Date(d)
  const y = date.getFullYear()
  // Si le mois est ≥ juillet, exercice = AAAA-AAAA+1, sinon AAAA-1-AAAA
  return date.getMonth() + 1 >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0.00"
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function SoldesOuverturePage() {
  const locale = getLocale()
  // ── État global ────────────────────────────────────────────────────
  const [societes, setSocietes] = useState<Societe[]>([])
  const [societeId, setSocieteId] = useState<string>("")
  const [societe, setSociete] = useState<Societe | null>(null)
  const [exercice, setExercice] = useState<string>("")
  const [compteContrepartie, setCompteContrepartie] = useState("110")
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [dejaSaisi, setDejaSaisi] = useState<{
    nb_lignes: number
    total_debit_mur: number
    total_credit_mur: number
    saisie_at: string
  } | null>(null)

  // ── Lignes par section ─────────────────────────────────────────────
  const [banques, setBanques] = useState<SoldeLigne[]>([
    makeEmptyLigne("5121"),
  ])
  const [clients, setClients] = useState<SoldeLigne[]>([
    makeEmptyLigne("411"),
  ])
  const [fournisseurs, setFournisseurs] = useState<SoldeLigne[]>([
    makeEmptyLigne("401"),
  ])
  const [immobilisations, setImmobilisations] = useState<SoldeLigne[]>([
    makeEmptyLigne("215"),
  ])

  // ── Charge la liste des sociétés accessibles ───────────────────────
  useEffect(() => {
    fetch("/api/comptable/societes")
      .then((r) => r.json())
      .then((d) => setSocietes(d.societes ?? []))
      .catch(() => setSocietes([]))
  }, [])

  // ── Quand la société change : charge ses dates et l'état de saisie ─
  useEffect(() => {
    if (!societeId) {
      setSociete(null)
      setExercice("")
      setDejaSaisi(null)
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    const params = new URLSearchParams({ societe_id: societeId })
    fetch(`/api/onboarding/soldes-ouverture?${params}`)
      .then((r) => r.json())
      .then((d) => {
        const s: Societe | null = d.societe ?? null
        setSociete(s)
        const ex = exerciceFromDate(s?.date_debut_exercice)
        setExercice(ex)
      })
      .catch((e) => setError(e?.message ?? t('samsc.soldes_err_load_societe', locale)))
      .finally(() => setLoading(false))
  }, [societeId])

  // ── Quand société + exercice : vérifie idempotence ─────────────────
  useEffect(() => {
    if (!societeId || !exercice) {
      setDejaSaisi(null)
      return
    }
    const params = new URLSearchParams({
      societe_id: societeId,
      exercice,
    })
    fetch(`/api/onboarding/soldes-ouverture?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.saisie) {
          setDejaSaisi({
            nb_lignes: d.saisie.nb_lignes,
            total_debit_mur: d.saisie.total_debit_mur,
            total_credit_mur: d.saisie.total_credit_mur,
            saisie_at: d.saisie.saisie_at,
          })
        } else {
          setDejaSaisi(null)
        }
      })
      .catch(() => setDejaSaisi(null))
  }, [societeId, exercice])

  // ── Totaux ─────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const sum = (arr: SoldeLigne[]) =>
      arr.reduce((acc, l) => {
        const m = Number(l.montant_mur)
        return acc + (Number.isFinite(m) ? m : 0)
      }, 0)
    const actif = sum(banques) + sum(clients) + sum(immobilisations)
    const passif = sum(fournisseurs)
    return { actif, passif, ecart: actif - passif }
  }, [banques, clients, fournisseurs, immobilisations])

  const nbLignesValides = useMemo(() => {
    const valid = (l: SoldeLigne) =>
      l.compte.trim() !== "" && Number(l.montant_mur) > 0
    return (
      banques.filter(valid).length +
      clients.filter(valid).length +
      fournisseurs.filter(valid).length +
      immobilisations.filter(valid).length
    )
  }, [banques, clients, fournisseurs, immobilisations])

  // ── Soumission ─────────────────────────────────────────────────────
  async function handleSubmit() {
    setError(null)
    setResult(null)
    if (!societeId) {
      setError(t('samsc.soldes_err_select_societe', locale))
      return
    }
    if (!exercice) {
      setError(t('samsc.soldes_err_exercice', locale))
      return
    }
    if (nbLignesValides === 0) {
      setError(t('samsc.soldes_err_no_line', locale))
      return
    }

    const buildPayload = (arr: SoldeLigne[], section: SoldeSection) =>
      arr
        .filter((l) => l.compte.trim() !== "" && Number(l.montant_mur) > 0)
        .map((l) => ({
          compte: l.compte.trim(),
          nom_tiers: l.nom_tiers.trim(),
          montant_mur: Number(l.montant_mur),
          devise_origine: l.devise_origine.trim() || null,
          montant_origine:
            l.montant_origine.trim() !== "" ? Number(l.montant_origine) : null,
          section,
        }))

    const lignes = [
      ...buildPayload(banques, "banque"),
      ...buildPayload(clients, "client"),
      ...buildPayload(fournisseurs, "fournisseur"),
      ...buildPayload(immobilisations, "immobilisation"),
    ]

    setSubmitting(true)
    try {
      const res = await fetch("/api/onboarding/soldes-ouverture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          exercice,
          lignes,
          compte_contrepartie: compteContrepartie || "110",
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          setError(t('samsc.soldes_err_already', locale))
          setResult(data)
        } else {
          setError(data?.error ?? t('samsc.soldes_err_save', locale))
        }
      } else {
        setResult(data)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('samsc.soldes_err_network', locale))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ClientPageShell
      kicker={t('samsc.soldes_kicker', locale)}
      title={t('samsc.soldes_title', locale)}
      subtitle={t('samsc.soldes_subtitle', locale)}
    >
      <div className="space-y-6">
        {/* ── Sélecteurs société + exercice ────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>{t('samsc.soldes_societe_exercice', locale)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>{t('samsc.soldes_societe', locale)}</Label>
                <Select value={societeId} onValueChange={setSocieteId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('samsc.soldes_select_societe', locale)} />
                  </SelectTrigger>
                  <SelectContent>
                    {societes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('samsc.soldes_exercice_label', locale)}</Label>
                <Input
                  value={exercice}
                  onChange={(e) => setExercice(e.target.value)}
                  placeholder="2025-2026"
                />
                {societe?.date_debut_exercice ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('samsc.soldes_debut_exercice', locale)}{" "}
                    {new Date(societe.date_debut_exercice).toLocaleDateString(
                      "fr-FR"
                    )}
                  </p>
                ) : null}
              </div>
              <div>
                <Label>{t('samsc.soldes_contrepartie_label', locale)}</Label>
                <Input
                  value={compteContrepartie}
                  onChange={(e) => setCompteContrepartie(e.target.value)}
                  placeholder="110"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('samsc.soldes_contrepartie_hint', locale)}
                </p>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-4">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('samsc.soldes_loading', locale)}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* ── Alerte si déjà saisi ────────────────────────────────── */}
        {dejaSaisi ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t('samsc.soldes_already_title', locale)}</AlertTitle>
            <AlertDescription>
              {t('samsc.soldes_already_desc', locale)
                .replace('{nb}', String(dejaSaisi.nb_lignes))
                .replace('{date}', new Date(dejaSaisi.saisie_at).toLocaleString("fr-FR"))
                .replace('{debit}', fmt(dejaSaisi.total_debit_mur))
                .replace('{credit}', fmt(dejaSaisi.total_credit_mur))}
            </AlertDescription>
          </Alert>
        ) : null}

        {/* ── Sections de saisie ──────────────────────────────────── */}
        {societeId && exercice ? (
          <>
            <SoldeOuvertureCard
              title={t('samsc.soldes_banques_title', locale)}
              description={t('samsc.soldes_banques_desc', locale)}
              section="banque"
              defaultCompte="5121"
              lignes={banques}
              onChange={setBanques}
              accentClassName="border-l-4 border-l-blue-500"
            />
            <SoldeOuvertureCard
              title={t('samsc.soldes_clients_title', locale)}
              description={t('samsc.soldes_clients_desc', locale)}
              section="client"
              defaultCompte="411"
              lignes={clients}
              onChange={setClients}
              accentClassName="border-l-4 border-l-emerald-500"
            />
            <SoldeOuvertureCard
              title={t('samsc.soldes_fournisseurs_title', locale)}
              description={t('samsc.soldes_fournisseurs_desc', locale)}
              section="fournisseur"
              defaultCompte="401"
              lignes={fournisseurs}
              onChange={setFournisseurs}
              accentClassName="border-l-4 border-l-amber-500"
            />
            <SoldeOuvertureCard
              title={t('samsc.soldes_immo_title', locale)}
              description={t('samsc.soldes_immo_desc', locale)}
              section="immobilisation"
              defaultCompte="215"
              lignes={immobilisations}
              onChange={setImmobilisations}
              accentClassName="border-l-4 border-l-violet-500"
            />

            {/* ── Récap totaux ─────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle>{t('samsc.soldes_recap', locale)}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">
                      {t('samsc.soldes_total_actif', locale)}
                    </span>
                    <div className="text-lg font-mono font-semibold">
                      {fmt(totals.actif)} MUR
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      {t('samsc.soldes_total_passif', locale)}
                    </span>
                    <div className="text-lg font-mono font-semibold">
                      {fmt(totals.passif)} MUR
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      {t('samsc.soldes_contrepartie_recap', locale).replace('{compte}', compteContrepartie)}
                    </span>
                    <div className="text-lg font-mono font-semibold">
                      {fmt(totals.actif - totals.passif)} MUR
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('samsc.soldes_contrepartie_recap_hint', locale)}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-4">
                  {t('samsc.soldes_note_equilibre', locale).replace('{compte}', compteContrepartie)}
                </p>
              </CardContent>
            </Card>

            {/* ── Erreur ─────────────────────────────────────────── */}
            {error ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{t('samsc.soldes_error', locale)}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {/* ── Résultat ────────────────────────────────────────── */}
            {result ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>{t('samsc.soldes_result', locale)}</AlertTitle>
                <AlertDescription>
                  <pre className="text-xs whitespace-pre-wrap overflow-auto max-h-64">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </AlertDescription>
              </Alert>
            ) : null}

            {/* ── Action ─────────────────────────────────────────── */}
            <div className="flex items-center justify-end gap-2">
              <p className="text-sm text-muted-foreground mr-auto">
                {(nbLignesValides > 1
                  ? t('samsc.soldes_lines_ready_many', locale)
                  : t('samsc.soldes_lines_ready_one', locale)
                ).replace('{nb}', String(nbLignesValides))}
              </p>
              <Button
                onClick={handleSubmit}
                disabled={submitting || !!dejaSaisi || nbLignesValides === 0}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {t('samsc.soldes_submit', locale)}
              </Button>
            </div>
          </>
        ) : (
          <Alert>
            <AlertDescription>
              {t('samsc.soldes_select_to_start', locale)}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </ClientPageShell>
  )
}
