/**
 * Helper — documents RH bidirectionnels (sprint DOC1).
 *
 * Gère :
 *   - validation fichiers (taille + mime) côté client ET serveur
 *   - génération des storage paths (bucket 'documents', préfixe 'rh/')
 *   - upload + insertion documents_rh atomique (rollback si erreur DB)
 *   - URLs signées (bucket privé, expire 1h par défaut)
 *   - lecture par employé / par demande / formatage UI
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export type DocumentCategorie =
  | 'certificat_medical'
  | 'justificatif_conge'
  | 'contrat'
  | 'avenant'
  | 'fiche_paie'
  | 'attestation_employeur'
  | 'piece_identite'
  | 'note_rh'
  | 'autre'

export type DocumentDirection = 'employe_vers_rh' | 'rh_vers_employe'
export type UploaderRole = 'employe' | 'rh' | 'admin'

export interface DocumentRH {
  id: string
  employe_id: string
  societe_id: string
  categorie: DocumentCategorie
  sous_categorie: string | null
  nom_fichier_original: string
  storage_path: string
  storage_bucket: string
  mime_type: string
  taille_octets: number
  description: string | null
  uploade_par: string | null
  uploade_par_role: UploaderRole | null
  direction: DocumentDirection
  lien_demande_conge_id: string | null
  lien_bulletin_id: string | null
  lien_grossesse_id: string | null
  confidentiel_rh_only: boolean
  vu_par_destinataire_le: string | null
  archive: boolean
  created_at: string
  updated_at: string
}

export const TAILLE_MAX_OCTETS = 10 * 1024 * 1024 // 10 MB

export const MIME_TYPES_AUTORISES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const

export const EXTENSIONS_LISIBLES = '.pdf, .jpg, .jpeg, .png, .doc, .docx, .xls, .xlsx'

export const CATEGORIE_LABELS: Record<DocumentCategorie, string> = {
  certificat_medical: 'Certificat médical',
  justificatif_conge: 'Justificatif congé',
  contrat: 'Contrat',
  avenant: 'Avenant',
  fiche_paie: 'Fiche de paie',
  attestation_employeur: 'Attestation employeur',
  piece_identite: "Pièce d'identité",
  note_rh: 'Note RH',
  autre: 'Autre',
}

// ─── Validation ──────────────────────────────────────────────────────
export interface ValidationResult {
  valide: boolean
  erreur?: string
}

export function validerFichier(file: { size: number; type: string; name: string }): ValidationResult {
  if (!file || file.size === 0) return { valide: false, erreur: 'Fichier vide ou absent.' }
  if (file.size > TAILLE_MAX_OCTETS) {
    return {
      valide: false,
      erreur: `Fichier trop lourd (${formaterTaille(file.size)}). Max ${formaterTaille(TAILLE_MAX_OCTETS)}.`,
    }
  }
  if (!MIME_TYPES_AUTORISES.includes(file.type as (typeof MIME_TYPES_AUTORISES)[number])) {
    return {
      valide: false,
      erreur: `Type ${file.type || 'inconnu'} non autorisé. Acceptés : ${EXTENSIONS_LISIBLES}.`,
    }
  }
  return { valide: true }
}

// ─── Paths ────────────────────────────────────────────────────────────
/** Slug ASCII pour le filename (évite les espaces / accents dans Storage). */
function slugify(s: string): string {
  return (s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'file'
}

/**
 * Génère un path unique : rh/{societe}/{employe}/{categorie}/{ts}_{slug}
 * Le timestamp ms garantit l'unicité même si 2 uploads quasi-simultanés.
 */
export function genererStoragePath(
  societeId: string,
  employeId: string,
  categorie: string,
  nomFichier: string,
): string {
  const ts = Date.now()
  const slug = slugify(nomFichier)
  return `rh/${societeId}/${employeId}/${categorie}/${ts}_${slug}`
}

// ─── Upload ──────────────────────────────────────────────────────────
export interface UploadParams {
  file: Blob & { name?: string; type?: string }
  nomFichierOriginal: string
  mimeType: string
  tailleOctets: number
  employeId: string
  societeId: string
  categorie: DocumentCategorie
  sousCategorie?: string | null
  description?: string | null
  direction: DocumentDirection
  lienDemandeId?: string | null
  lienBulletinId?: string | null
  lienGrossesseId?: string | null
  confidentiel?: boolean
  uploadeParId?: string | null
  uploadeParRole: UploaderRole
}

/**
 * Upload atomique :
 *   1. Storage.upload(path, file) bucket 'documents'
 *   2. INSERT documents_rh avec le storage_path
 *   3. Rollback (delete Storage) si l'INSERT échoue
 *
 * Retourne la row documents_rh créée.
 */
export async function uploadDocument(
  supabase: SupabaseLike,
  params: UploadParams,
): Promise<{ ok: true; document: DocumentRH } | { ok: false; erreur: string }> {
  const validation = validerFichier({
    size: params.tailleOctets,
    type: params.mimeType,
    name: params.nomFichierOriginal,
  })
  if (!validation.valide) return { ok: false, erreur: validation.erreur || 'Fichier invalide' }

  const storagePath = genererStoragePath(
    params.societeId,
    params.employeId,
    params.categorie,
    params.nomFichierOriginal,
  )

  // 1. Upload Storage
  const { error: upErr } = await supabase
    .storage
    .from('documents')
    .upload(storagePath, params.file, {
      contentType: params.mimeType,
      upsert: false,
      cacheControl: '3600',
    })
  if (upErr) {
    return { ok: false, erreur: `Upload Storage : ${upErr.message}` }
  }

  // 2. Insert row
  const payload = {
    employe_id: params.employeId,
    societe_id: params.societeId,
    categorie: params.categorie,
    sous_categorie: params.sousCategorie ?? null,
    nom_fichier_original: params.nomFichierOriginal,
    storage_path: storagePath,
    storage_bucket: 'documents',
    mime_type: params.mimeType,
    taille_octets: params.tailleOctets,
    description: params.description ?? null,
    uploade_par: params.uploadeParId ?? null,
    uploade_par_role: params.uploadeParRole,
    direction: params.direction,
    lien_demande_conge_id: params.lienDemandeId ?? null,
    lien_bulletin_id: params.lienBulletinId ?? null,
    lien_grossesse_id: params.lienGrossesseId ?? null,
    confidentiel_rh_only: Boolean(params.confidentiel),
  }
  const { data, error } = await supabase
    .from('documents_rh')
    .insert(payload)
    .select('*')
    .single()

  if (error || !data) {
    // Rollback : supprimer le fichier Storage pour éviter les orphelins.
    await supabase.storage.from('documents').remove([storagePath]).catch(() => {})
    return { ok: false, erreur: `Insert DB : ${error?.message || 'échec'}` }
  }

  return { ok: true, document: data as DocumentRH }
}

// ─── Lecture ─────────────────────────────────────────────────────────
export interface ListOptions {
  categorie?: DocumentCategorie
  direction?: DocumentDirection
  archive?: boolean
  lienDemandeId?: string
}

export async function getDocumentsEmploye(
  supabase: SupabaseLike,
  employeId: string,
  options: ListOptions = {},
): Promise<DocumentRH[]> {
  let q = supabase
    .from('documents_rh')
    .select('*')
    .eq('employe_id', employeId)
    .order('created_at', { ascending: false })
  if (options.categorie) q = q.eq('categorie', options.categorie)
  if (options.direction) q = q.eq('direction', options.direction)
  if (options.archive !== undefined) q = q.eq('archive', options.archive)
  if (options.lienDemandeId) q = q.eq('lien_demande_conge_id', options.lienDemandeId)
  const { data } = await q
  return (data || []) as DocumentRH[]
}

export async function getDocumentsDemande(
  supabase: SupabaseLike,
  demandeId: string,
): Promise<DocumentRH[]> {
  const { data } = await supabase
    .from('documents_rh')
    .select('*')
    .eq('lien_demande_conge_id', demandeId)
    .eq('archive', false)
    .order('created_at', { ascending: true })
  return (data || []) as DocumentRH[]
}

export async function getDocument(
  supabase: SupabaseLike,
  documentId: string,
): Promise<DocumentRH | null> {
  const { data } = await supabase
    .from('documents_rh')
    .select('*')
    .eq('id', documentId)
    .maybeSingle()
  return (data as DocumentRH) || null
}

/** URL signée temporaire (bucket privé). Défaut 1h. */
export async function getSignedUrl(
  supabase: SupabaseLike,
  storagePath: string,
  expireSeconds: number = 3600,
): Promise<string | null> {
  const { data } = await supabase
    .storage
    .from('documents')
    .createSignedUrl(storagePath, expireSeconds)
  return data?.signedUrl || null
}

// ─── Actions RH ──────────────────────────────────────────────────────
export async function marquerCommeVu(
  supabase: SupabaseLike,
  documentId: string,
): Promise<{ ok: boolean; erreur?: string }> {
  const { error } = await supabase
    .from('documents_rh')
    .update({ vu_par_destinataire_le: new Date().toISOString() })
    .eq('id', documentId)
    .is('vu_par_destinataire_le', null)
  if (error) return { ok: false, erreur: error.message }
  return { ok: true }
}

export async function archiverDocument(
  supabase: SupabaseLike,
  documentId: string,
): Promise<{ ok: boolean; erreur?: string }> {
  const { error } = await supabase
    .from('documents_rh')
    .update({ archive: true })
    .eq('id', documentId)
  if (error) return { ok: false, erreur: error.message }
  return { ok: true }
}

export async function supprimerDocument(
  supabase: SupabaseLike,
  documentId: string,
): Promise<{ ok: boolean; erreur?: string }> {
  const doc = await getDocument(supabase, documentId)
  if (!doc) return { ok: false, erreur: 'Document introuvable' }
  // 1. Remove from Storage (best-effort : même si échec, on supprime la DB)
  await supabase.storage.from('documents').remove([doc.storage_path]).catch(() => {})
  // 2. Delete row
  const { error } = await supabase.from('documents_rh').delete().eq('id', documentId)
  if (error) return { ok: false, erreur: error.message }
  return { ok: true }
}

// ─── UI helpers ──────────────────────────────────────────────────────
export function formaterTaille(octets: number): string {
  if (!octets || octets < 0) return '0 B'
  if (octets < 1024) return `${octets} B`
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1)} KB`
  return `${(octets / (1024 * 1024)).toFixed(1)} MB`
}

export function getIconeMimeType(mimeType: string): string {
  const m = (mimeType || '').toLowerCase()
  if (m.startsWith('image/')) return '🖼️'
  if (m === 'application/pdf') return '📄'
  if (m.includes('word') || m === 'application/msword') return '📝'
  if (m.includes('sheet') || m.includes('excel')) return '📊'
  return '📎'
}

export function getCategorieLabel(categorie: DocumentCategorie): string {
  return CATEGORIE_LABELS[categorie] || categorie
}

/** Types de congés WRA qui DOIVENT recevoir un justificatif. */
export const TYPES_CONGE_AVEC_JUSTIFICATIF = new Set([
  'SL', 'FML', 'SPC_MARIAGE_SELF', 'SPC_MARIAGE_ENFANT', 'SPC_DECES',
  'JUR', 'INT', 'CRT', 'MAT', 'PAT',
])

export function typeCongeRequiertJustificatif(type: string): boolean {
  return TYPES_CONGE_AVEC_JUSTIFICATIF.has(type)
}
