"use client"

/**
 * SoldeOuvertureCard — composant de saisie d'une section de soldes d'ouverture
 * (Banques, Clients, Fournisseurs, Immobilisations) lors de l'onboarding.
 *
 * Chaque ligne :
 *   - compte           (texte, ex: 5121, 411XXX, 401YYY, 215, …)
 *   - nom_tiers        (libellé / nom du tiers, optionnel pour banque/immo)
 *   - montant_mur      (numérique, en MUR)
 *   - devise_origine   (optionnel, ex: USD, EUR — laisser vide si MUR natif)
 *   - montant_origine  (optionnel, en devise d'origine)
 *
 * Le composant est purement présentationnel ; il remonte les lignes via
 * onChange. La page parente agrège toutes les sections et POST le tout
 * sur /api/onboarding/soldes-ouverture.
 */

import { useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2 } from "lucide-react"

export type SoldeSection = "banque" | "client" | "fournisseur" | "immobilisation"

export interface SoldeLigne {
  id: string
  compte: string
  nom_tiers: string
  montant_mur: string  // string pour input UX, converti en number à l'envoi
  devise_origine: string
  montant_origine: string
}

export interface SoldeOuvertureCardProps {
  title: string
  description?: string
  section: SoldeSection
  /** Compte par défaut suggéré (ex: "5121" pour banque MCB). */
  defaultCompte?: string
  lignes: SoldeLigne[]
  onChange: (lignes: SoldeLigne[]) => void
  /** Couleur d'accent (Tailwind class). */
  accentClassName?: string
}

function nid(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function makeEmptyLigne(defaultCompte = ""): SoldeLigne {
  return {
    id: nid(),
    compte: defaultCompte,
    nom_tiers: "",
    montant_mur: "",
    devise_origine: "",
    montant_origine: "",
  }
}

function fmtMUR(n: number): string {
  if (!Number.isFinite(n)) return "0.00"
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function SoldeOuvertureCard({
  title,
  description,
  section,
  defaultCompte = "",
  lignes,
  onChange,
  accentClassName = "border-l-4 border-l-blue-500",
}: SoldeOuvertureCardProps) {
  const updateLigne = useCallback(
    (id: string, patch: Partial<SoldeLigne>) => {
      onChange(lignes.map((l) => (l.id === id ? { ...l, ...patch } : l)))
    },
    [lignes, onChange]
  )

  const addLigne = useCallback(() => {
    onChange([...lignes, makeEmptyLigne(defaultCompte)])
  }, [lignes, onChange, defaultCompte])

  const removeLigne = useCallback(
    (id: string) => {
      onChange(lignes.filter((l) => l.id !== id))
    },
    [lignes, onChange]
  )

  const total = lignes.reduce((acc, l) => {
    const m = Number(l.montant_mur)
    return acc + (Number.isFinite(m) ? m : 0)
  }, 0)

  const sectionLabelMap: Record<SoldeSection, string> = {
    banque: "Actif",
    client: "Actif",
    fournisseur: "Passif",
    immobilisation: "Actif",
  }
  const sens = sectionLabelMap[section]

  return (
    <Card className={accentClassName}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            {description ? (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            ) : null}
          </div>
          <Badge variant={sens === "Actif" ? "default" : "secondary"}>{sens}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Aucune ligne. Cliquez sur « Ajouter une ligne » pour commencer.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
              <div className="col-span-2">Compte</div>
              <div className="col-span-3">Nom / Tiers</div>
              <div className="col-span-2 text-right">Montant MUR</div>
              <div className="col-span-2">Devise orig.</div>
              <div className="col-span-2 text-right">Mt. orig.</div>
              <div className="col-span-1"></div>
            </div>
            {lignes.map((l) => (
              <div key={l.id} className="grid grid-cols-12 gap-2 items-center">
                <Input
                  className="col-span-2"
                  placeholder={defaultCompte || "Compte"}
                  value={l.compte}
                  onChange={(e) => updateLigne(l.id, { compte: e.target.value })}
                />
                <Input
                  className="col-span-3"
                  placeholder="Nom tiers / libellé"
                  value={l.nom_tiers}
                  onChange={(e) =>
                    updateLigne(l.id, { nom_tiers: e.target.value })
                  }
                />
                <Input
                  className="col-span-2 text-right"
                  placeholder="0.00"
                  inputMode="decimal"
                  value={l.montant_mur}
                  onChange={(e) =>
                    updateLigne(l.id, { montant_mur: e.target.value })
                  }
                />
                <Input
                  className="col-span-2"
                  placeholder="MUR"
                  maxLength={3}
                  value={l.devise_origine}
                  onChange={(e) =>
                    updateLigne(l.id, {
                      devise_origine: e.target.value.toUpperCase(),
                    })
                  }
                />
                <Input
                  className="col-span-2 text-right"
                  placeholder="—"
                  inputMode="decimal"
                  value={l.montant_origine}
                  onChange={(e) =>
                    updateLigne(l.id, { montant_origine: e.target.value })
                  }
                />
                <div className="col-span-1 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLigne(l.id)}
                    aria-label="Supprimer la ligne"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t">
          <Button type="button" variant="outline" size="sm" onClick={addLigne}>
            <Plus className="h-4 w-4 mr-1" /> Ajouter une ligne
          </Button>
          <div className="text-sm">
            <span className="text-muted-foreground mr-2">Total :</span>
            <span className="font-mono font-semibold">{fmtMUR(total)} MUR</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default SoldeOuvertureCard
