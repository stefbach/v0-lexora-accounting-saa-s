/**
 * lib/accounting/compte-display.ts — Affichage NEUTRE des comptes (couche PURE).
 *
 * Schéma neutre demandé (cosmétique) : à l'écran on n'affiche plus le code
 * technique du compte (601, 6221…) mais son LIBELLÉ, regroupé par poste IFRS.
 * Les codes internes restent la clé technique (écritures, RPC, rapprochement) —
 * ils ne changent JAMAIS ; seule la présentation change.
 *
 * Aucune I/O : on passe des comptes déjà chargés (avec libellé + categorie_ifrs).
 */

export type CategorieIfrs =
  | 'actif_non_courant'
  | 'actif_courant'
  | 'capitaux_propres'
  | 'passif_non_courant'
  | 'passif_courant'
  | 'produits'
  | 'charges'

export interface CompteAffichable {
  compte: string
  libelle?: string | null
  categorie_ifrs?: string | null
}

/** Mode d'affichage. 'libelle' = schéma neutre (code masqué) — le défaut produit. */
export type ModeAffichageCompte = 'libelle' | 'code' | 'code_libelle'
export const MODE_AFFICHAGE_COMPTE_DEFAUT: ModeAffichageCompte = 'libelle'

/**
 * Rend un compte pour l'affichage. Par défaut : libellé seul (schéma neutre).
 * Repli sur le code si le libellé manque (jamais rien d'illisible).
 */
export function afficherCompte(
  c: Pick<CompteAffichable, 'compte' | 'libelle'>,
  mode: ModeAffichageCompte = MODE_AFFICHAGE_COMPTE_DEFAUT,
): string {
  const libelle = (c.libelle || '').trim()
  const code = (c.compte || '').trim()
  if (mode === 'code') return code || libelle
  if (mode === 'code_libelle') return [code, libelle].filter(Boolean).join(' — ')
  return libelle || code
}

interface PosteDef {
  key: CategorieIfrs
  label: string
  ordre: number
}

/** Postes des états financiers IFRS, dans l'ordre de présentation. */
const POSTES_IFRS: PosteDef[] = [
  { key: 'actif_non_courant', label: 'Actifs non courants', ordre: 1 },
  { key: 'actif_courant', label: 'Actifs courants', ordre: 2 },
  { key: 'capitaux_propres', label: 'Capitaux propres', ordre: 3 },
  { key: 'passif_non_courant', label: 'Passifs non courants', ordre: 4 },
  { key: 'passif_courant', label: 'Passifs courants', ordre: 5 },
  { key: 'produits', label: 'Produits', ordre: 6 },
  { key: 'charges', label: 'Charges', ordre: 7 },
]

const POSTE_AUTRE: PosteDef = { key: 'charges', label: 'Autres', ordre: 99 }

function posteDef(categorie?: string | null): PosteDef {
  return POSTES_IFRS.find((p) => p.key === categorie) || POSTE_AUTRE
}

/** Libellé du poste IFRS d'un compte (« Actifs courants », « Charges »…). */
export function posteIfrsLabel(categorie?: string | null): string {
  return posteDef(categorie).label
}

/** Ordre de présentation du poste IFRS (pour trier les groupes). */
export function ordrePosteIfrs(categorie?: string | null): number {
  return posteDef(categorie).ordre
}

export interface GroupePosteIfrs<T> {
  poste: string
  ordre: number
  comptes: T[]
}

/**
 * Regroupe une liste de comptes par poste IFRS, groupes triés dans l'ordre de
 * présentation des états financiers. À l'intérieur d'un groupe, l'ordre d'entrée
 * est conservé (le caller trie comme il veut, ex. par libellé).
 */
export function grouperParPosteIfrs<T extends CompteAffichable>(comptes: T[]): GroupePosteIfrs<T>[] {
  const map = new Map<string, GroupePosteIfrs<T>>()
  for (const c of comptes) {
    const label = posteIfrsLabel(c.categorie_ifrs)
    let g = map.get(label)
    if (!g) {
      g = { poste: label, ordre: ordrePosteIfrs(c.categorie_ifrs), comptes: [] }
      map.set(label, g)
    }
    g.comptes.push(c)
  }
  return Array.from(map.values()).sort((a, b) => a.ordre - b.ordre || a.poste.localeCompare(b.poste, 'fr'))
}
