"use client"

/**
 * CatalogueSelectorDialog — sélecteur de produits/services depuis
 * factures_catalogue (mig 239) avec recherche, filtres catégorie et
 * sélection multiple. Utilisé dans /client/nouvelle-facture pour
 * ajouter rapidement des lignes pré-remplies.
 *
 * Le dropdown précédent était peu découvrable et n'autorisait qu'1 ligne
 * à la fois. Ce dialog est plus prominent et permet d'ajouter plusieurs
 * articles d'un coup.
 */

import { useEffect, useMemo, useState } from "react"
import { t, getLocale } from "@/lib/i18n"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Search, Package, Loader2 } from "lucide-react"

export interface CatalogueItem {
  id: string
  description: string
  prix_unitaire: number
  devise: string
  tva_applicable: boolean
  categorie: string | null
  unite?: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  societeId: string | null
  /** Quantité par défaut affectée à chaque ligne ajoutée. */
  defaultQuantite?: number
  /** Appelé avec la liste d'items quand l'utilisateur clique "Ajouter". */
  onSelect: (items: CatalogueItem[], quantite: number) => void
}

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function CatalogueSelectorDialog({
  open,
  onOpenChange,
  societeId,
  defaultQuantite = 1,
  onSelect,
}: Props) {
  const [items, setItems] = useState<CatalogueItem[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [categorie, setCategorie] = useState<string>("__all__")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [quantite, setQuantite] = useState(defaultQuantite)
  const locale = getLocale()

  // Charge le catalogue à l'ouverture (pas pré-chargé pour économiser
  // les requêtes si l'utilisateur n'utilise jamais le dialog).
  useEffect(() => {
    if (!open || !societeId) return
    setLoading(true)
    fetch(`/api/client/catalogue?societe_id=${societeId}`)
      .then((r) => r.json())
      .then((d) => {
        const arr: CatalogueItem[] = Array.isArray(d?.items)
          ? d.items.map((it: any) => ({
              id: it.id,
              description: it.description,
              prix_unitaire: Number(it.prix_unitaire) || 0,
              devise: it.devise || "MUR",
              tva_applicable: it.tva_applicable !== false,
              categorie: it.categorie || null,
              unite: it.unite || "Forfait",
            }))
          : []
        setItems(arr)
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [open, societeId])

  // Reset sélection quand on ouvre/ferme
  useEffect(() => {
    if (!open) {
      setSelected(new Set())
      setSearch("")
      setCategorie("__all__")
      setQuantite(defaultQuantite)
    }
  }, [open, defaultQuantite])

  const categories = useMemo(() => {
    const s = new Set<string>()
    for (const it of items) if (it.categorie) s.add(it.categorie)
    return Array.from(s).sort()
  }, [items])

  const filtered = useMemo(() => {
    let list = items
    if (categorie !== "__all__") list = list.filter((i) => i.categorie === categorie)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (i) =>
          i.description.toLowerCase().includes(q) ||
          (i.categorie || "").toLowerCase().includes(q),
      )
    }
    return list
  }, [items, categorie, search])

  function toggleId(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleAdd() {
    const picks = items.filter((i) => selected.has(i.id))
    if (picks.length === 0) return
    onSelect(picks, quantite)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-600" />
            Catalogue services & produits
          </DialogTitle>
          <DialogDescription>
            Sélectionnez un ou plusieurs articles à ajouter à la facture.
            Vous pouvez gérer le catalogue dans <strong>Catalogue services</strong> du menu.
          </DialogDescription>
        </DialogHeader>

        {/* Filtres */}
        <div className="flex gap-2 flex-wrap items-end">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un article..."
              className="pl-8 h-9"
              autoFocus
            />
          </div>
          {categories.length > 0 && (
            <select
              value={categorie}
              onChange={(e) => setCategorie(e.target.value)}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="__all__">Toutes catégories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground">Qté</label>
            <Input
              type="number"
              min={1}
              step={1}
              value={quantite}
              onChange={(e) => setQuantite(Math.max(1, parseFloat(e.target.value) || 1))}
              className="w-20 h-9 text-right"
            />
          </div>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto border rounded-md min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Chargement...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {items.length === 0
                ? "Catalogue vide. Crée tes services/produits dans /client/catalogue."
                : "Aucun article ne correspond à ce filtre."}
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((it) => {
                const isSelected = selected.has(it.id)
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => toggleId(it.id)}
                    className={`w-full text-left p-3 flex items-start gap-3 hover:bg-muted/50 transition-colors ${
                      isSelected ? "bg-indigo-50" : ""
                    }`}
                  >
                    <Checkbox checked={isSelected} className="mt-1 pointer-events-none" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{it.description}</div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {it.categorie && (
                          <Badge variant="outline" className="text-[10px]">{it.categorie}</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">{it.unite}</span>
                        {it.tva_applicable ? (
                          <Badge className="text-[10px] bg-orange-100 text-orange-700 border-orange-300">TVA 15%</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Zero-rated</Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-mono font-semibold text-sm">
                        {fmt(it.prix_unitaire)} {it.devise}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {selected.size > 0 && (
              <>{selected.size} article(s) sélectionné(s) · qté {quantite} chacun</>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('cui.cancel', locale)}</Button>
            <Button
              onClick={handleAdd}
              disabled={selected.size === 0}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Ajouter ({selected.size}) à la facture
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
