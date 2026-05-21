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
      .catch((e) => setError(e?.message ?? "Erreur chargement société"))
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
      setError("Sélectionnez une société.")
      return
    }
    if (!exercice) {
      setError("Exercice requis (vérifiez que la société a une date_debut_exercice).")
      return
    }
    if (nbLignesValides === 0) {
      setError("Aucune ligne valide à enregistrer (compte + montant requis).")
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
          setError(
            "Soldes d'ouverture déjà saisis pour cet exercice. Voir le détail ci-dessous."
          )
          setResult(data)
        } else {
          setError(data?.error ?? "Erreur lors de l'enregistrement")
        }
      } else {
        setResult(data)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ClientPageShell
      kicker="Onboarding"
      title="Soldes d'ouverture"
      subtitle="Saisie initiale des soldes (Banques, Clients, Fournisseurs, Immobilisations). Génère automatiquement les écritures du journal AN à la date du début d'exercice."
    >
      <div className="space-y-6">
        {/* ── Sélecteurs société + exercice ────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Société et exercice</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Société</Label>
                <Select value={societeId} onValueChange={setSocieteId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une société" />
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
                <Label>Exercice (AAAA-AAAA)</Label>
                <Input
                  value={exercice}
                  onChange={(e) => setExercice(e.target.value)}
                  placeholder="2025-2026"
                />
                {societe?.date_debut_exercice ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    Début d'exercice :{" "}
                    {new Date(societe.date_debut_exercice).toLocaleDateString(
                      "fr-FR"
                    )}
                  </p>
                ) : null}
              </div>
              <div>
                <Label>Compte de contre-partie</Label>
                <Input
                  value={compteContrepartie}
                  onChange={(e) => setCompteContrepartie(e.target.value)}
                  placeholder="110"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Par défaut 110 (Report à nouveau)
                </p>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* ── Alerte si déjà saisi ────────────────────────────────── */}
        {dejaSaisi ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Soldes d'ouverture déjà saisis</AlertTitle>
            <AlertDescription>
              {dejaSaisi.nb_lignes} écritures déjà enregistrées le{" "}
              {new Date(dejaSaisi.saisie_at).toLocaleString("fr-FR")} (total
              débit {fmt(dejaSaisi.total_debit_mur)} MUR / crédit{" "}
              {fmt(dejaSaisi.total_credit_mur)} MUR). Toute nouvelle
              soumission sera rejetée pour cet exercice.
            </AlertDescription>
          </Alert>
        ) : null}

        {/* ── Sections de saisie ──────────────────────────────────── */}
        {societeId && exercice ? (
          <>
            <SoldeOuvertureCard
              title="Banques (512x)"
              description="Soldes des comptes bancaires au début d'exercice"
              section="banque"
              defaultCompte="5121"
              lignes={banques}
              onChange={setBanques}
              accentClassName="border-l-4 border-l-blue-500"
            />
            <SoldeOuvertureCard
              title="Clients (411)"
              description="Créances clients ouvertes au début d'exercice"
              section="client"
              defaultCompte="411"
              lignes={clients}
              onChange={setClients}
              accentClassName="border-l-4 border-l-emerald-500"
            />
            <SoldeOuvertureCard
              title="Fournisseurs (401)"
              description="Dettes fournisseurs ouvertes au début d'exercice"
              section="fournisseur"
              defaultCompte="401"
              lignes={fournisseurs}
              onChange={setFournisseurs}
              accentClassName="border-l-4 border-l-amber-500"
            />
            <SoldeOuvertureCard
              title="Immobilisations (2xx)"
              description="Valeurs nettes comptables au début d'exercice"
              section="immobilisation"
              defaultCompte="215"
              lignes={immobilisations}
              onChange={setImmobilisations}
              accentClassName="border-l-4 border-l-violet-500"
            />

            {/* ── Récap totaux ─────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle>Récapitulatif</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">
                      Total ACTIF (débit) :
                    </span>
                    <div className="text-lg font-mono font-semibold">
                      {fmt(totals.actif)} MUR
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      Total PASSIF (crédit) :
                    </span>
                    <div className="text-lg font-mono font-semibold">
                      {fmt(totals.passif)} MUR
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      Contre-partie {compteContrepartie} :
                    </span>
                    <div className="text-lg font-mono font-semibold">
                      {fmt(totals.actif - totals.passif)} MUR
                    </div>
                    <p className="text-xs text-muted-foreground">
                      (= actif − passif, sera passé en débit/crédit pour
                      équilibrer)
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-4">
                  Note : chaque ligne est doublée par une contre-partie sur{" "}
                  {compteContrepartie}, donc le journal AN reste toujours
                  équilibré.
                </p>
              </CardContent>
            </Card>

            {/* ── Erreur ─────────────────────────────────────────── */}
            {error ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Erreur</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {/* ── Résultat ────────────────────────────────────────── */}
            {result ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Résultat</AlertTitle>
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
                {nbLignesValides} ligne{nbLignesValides > 1 ? "s" : ""} valide
                {nbLignesValides > 1 ? "s" : ""} prête
                {nbLignesValides > 1 ? "s" : ""} à enregistrer
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
                Enregistrer les soldes d'ouverture (journal AN)
              </Button>
            </div>
          </>
        ) : (
          <Alert>
            <AlertDescription>
              Sélectionnez une société pour commencer la saisie.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </ClientPageShell>
  )
}
