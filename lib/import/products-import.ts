/**
 * lib/import/products-import.ts
 *
 * Couche PURE (sans dépendance runtime) de l'import produits Inventaire :
 *   - définition des colonnes canoniques + alias FR/EN ;
 *   - auto-mapping des en-têtes d'un fichier CSV/Excel ;
 *   - coercition d'une ligne brute → charge utile produit + stock initial ;
 *   - parsing tolérant des nombres (décimale « , » ou « . », séparateurs de
 *     milliers, symboles monétaires) — indispensable pour des fichiers MU/FR.
 *
 * Testée indépendamment (products-import.test.ts). La validation métier finale
 * reste `validateProduitPayload` (lib/inventaire/produits.ts), appelée côté API.
 */

export type CanonicalField =
  | 'sku'
  | 'designation'
  | 'code_barre'
  | 'categorie'
  | 'unite_mesure'
  | 'prix_vente_ht'
  | 'taux_tva'
  | 'stock_initial'
  | 'cout_unitaire_initial'
  | 'stock_mini'
  | 'stock_maxi'
  | 'seuil_alerte'
  | 'compte_stock'
  | 'compte_achat'
  | 'compte_vente'
  | 'compte_variation_stock'

export interface FieldDef {
  key: CanonicalField
  label: string
  required: boolean
  kind: 'text' | 'number'
  aliases: string[]
}

/** Colonnes reconnues, dans l'ordre d'affichage / du modèle. */
export const PRODUCT_IMPORT_FIELDS: FieldDef[] = [
  { key: 'sku', label: 'SKU / Référence', required: true, kind: 'text',
    aliases: ['sku', 'code', 'reference', 'ref', 'codeproduit', 'article', 'codearticle', 'refproduit'] },
  { key: 'designation', label: 'Désignation', required: true, kind: 'text',
    aliases: ['designation', 'libelle', 'nom', 'name', 'produit', 'intitule', 'description'] },
  { key: 'code_barre', label: 'Code-barres', required: false, kind: 'text',
    aliases: ['codebarre', 'codebarres', 'barcode', 'ean', 'ean13', 'gencod', 'gencode', 'upc'] },
  { key: 'categorie', label: 'Catégorie', required: false, kind: 'text',
    aliases: ['categorie', 'category', 'famille', 'rayon', 'groupe', 'type'] },
  { key: 'unite_mesure', label: 'Unité', required: false, kind: 'text',
    aliases: ['unite', 'unitemesure', 'uom', 'unit', 'unitedemesure', 'mesure'] },
  { key: 'prix_vente_ht', label: 'Prix de vente HT', required: false, kind: 'number',
    aliases: ['prixventeht', 'prixvente', 'prixht', 'prix', 'price', 'puht', 'pvht', 'pv'] },
  { key: 'taux_tva', label: 'TVA %', required: false, kind: 'number',
    aliases: ['tauxtva', 'tva', 'vat', 'taxrate', 'taux'] },
  { key: 'stock_initial', label: 'Stock initial', required: false, kind: 'number',
    aliases: ['stockinitial', 'stock', 'quantite', 'qte', 'qty', 'quantiteinitiale', 'quantity', 'stockdepart'] },
  { key: 'cout_unitaire_initial', label: 'Coût unitaire (achat)', required: false, kind: 'number',
    aliases: ['coutunitaireinitial', 'coutunitaire', 'cout', 'coutachat', 'prixachat', 'cost', 'pump', 'cump', 'pa', 'coutinitial'] },
  { key: 'stock_mini', label: 'Stock mini', required: false, kind: 'number',
    aliases: ['stockmini', 'stockmin', 'minimum', 'min'] },
  { key: 'stock_maxi', label: 'Stock maxi', required: false, kind: 'number',
    aliases: ['stockmaxi', 'stockmax', 'maximum', 'max'] },
  { key: 'seuil_alerte', label: "Seuil d'alerte", required: false, kind: 'number',
    aliases: ['seuilalerte', 'seuil', 'alerte', 'reorder', 'reorderpoint', 'pointdecommande'] },
  { key: 'compte_stock', label: 'Compte stock', required: false, kind: 'text',
    aliases: ['comptestock', 'comptestk'] },
  { key: 'compte_achat', label: 'Compte achat', required: false, kind: 'text',
    aliases: ['compteachat', 'compteachats'] },
  { key: 'compte_vente', label: 'Compte vente', required: false, kind: 'text',
    aliases: ['comptevente', 'compteventes'] },
  { key: 'compte_variation_stock', label: 'Compte variation stock', required: false, kind: 'number',
    aliases: ['comptevariationstock', 'comptevariation', 'comptevarstock'] },
]

const FIELD_BY_KEY: Record<CanonicalField, FieldDef> =
  Object.fromEntries(PRODUCT_IMPORT_FIELDS.map((f) => [f.key, f])) as Record<CanonicalField, FieldDef>

/** Normalise un en-tête : minuscules, sans accents, sans séparateurs. */
export function normalizeHeader(h: string): string {
  return (h || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents (combining diacritics)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Associe chaque en-tête du fichier à une colonne canonique (ou null).
 * Retourne un tableau parallèle à `headers`.
 */
export function autoMapHeaders(headers: string[]): (CanonicalField | null)[] {
  const used = new Set<CanonicalField>()
  return headers.map((h) => {
    const n = normalizeHeader(h)
    if (!n) return null
    for (const f of PRODUCT_IMPORT_FIELDS) {
      if (used.has(f.key)) continue
      if (normalizeHeader(f.key) === n || normalizeHeader(f.label) === n || f.aliases.includes(n)) {
        used.add(f.key)
        return f.key
      }
    }
    return null
  })
}

/**
 * Parsing tolérant d'un nombre saisi par un humain :
 *   « 1 234,56 » → 1234.56 ; « Rs 2.500,00 » → 2500 ; « 15% » → 15 ; '' → null.
 */
export function parseLooseNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  let s = String(raw).trim()
  if (!s) return null
  s = s.replace(/[^0-9,.\-]/g, '') // retire devises, %, espaces
  if (!s || s === '-' || s === '.' || s === ',') return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma !== -1 && lastDot !== -1) {
    // Le séparateur décimal est le dernier rencontré ; l'autre = milliers.
    const decimalSep = lastComma > lastDot ? ',' : '.'
    const thousandSep = decimalSep === ',' ? '.' : ','
    s = s.split(thousandSep).join('').replace(decimalSep, '.')
  } else if (lastComma !== -1) {
    // Une seule sorte : virgule = décimale si 1-2 chiffres après, sinon milliers.
    const after = s.length - lastComma - 1
    s = after > 0 && after <= 2 ? s.replace(',', '.') : s.split(',').join('')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export interface CoercedRow {
  /** Charge utile brute passable à validateProduitPayload. */
  payload: Record<string, unknown>
  stock_initial: number
  cout_unitaire_initial: number | null
}

/**
 * Transforme une ligne brute (clés = en-têtes fichier) en charge utile produit,
 * selon un mapping en-tête → colonne canonique.
 */
export function coerceProductRow(
  rawRow: Record<string, unknown>,
  headers: string[],
  mapping: (CanonicalField | null)[],
): CoercedRow {
  const canonical: Partial<Record<CanonicalField, unknown>> = {}
  headers.forEach((h, i) => {
    const field = mapping[i]
    if (!field) return
    const v = rawRow[h]
    if (v === undefined || v === null || String(v).trim() === '') return
    canonical[field] = FIELD_BY_KEY[field].kind === 'number' ? parseLooseNumber(v) : String(v).trim()
  })

  const stock_initial = typeof canonical.stock_initial === 'number' ? canonical.stock_initial : 0
  const cout_unitaire_initial =
    typeof canonical.cout_unitaire_initial === 'number' ? canonical.cout_unitaire_initial : null

  // On ne transmet pas les colonnes de stock initial au payload produit lui-même.
  const payload: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(canonical)) {
    if (k === 'stock_initial' || k === 'cout_unitaire_initial') continue
    payload[k] = v
  }
  return { payload, stock_initial, cout_unitaire_initial }
}

/** En-têtes + 2 lignes d'exemple pour le modèle téléchargeable. */
export function buildTemplateAoA(): (string | number)[][] {
  const headers = PRODUCT_IMPORT_FIELDS.map((f) => f.label)
  const example1 = [
    'SKU-001', 'T-shirt coton blanc M', '3701234567890', 'Textile', 'unite',
    350, 15, 100, 180, 10, 500, 20, '3701', '601', '701', '6037',
  ]
  const example2 = [
    'SKU-002', 'Café moulu 250g', '', 'Épicerie', 'unite',
    180, 15, 40, 95, 5, 0, 8, '', '', '', '',
  ]
  return [headers, example1, example2]
}
