/**
 * Relances factures clients impayées — logique métier.
 *
 * Couvre :
 *   • findFacturesARelancer  : détecte les factures éligibles + niveau dû
 *   • envoyerRelance         : envoie 1 relance pour 1 facture (multi-canal)
 *   • runRelancesQuotidiennes: orchestration (cron + déclenchement manuel)
 *
 * Conception :
 *   - 3 niveaux de relance (rappel, ferme, mise en demeure)
 *   - Délais paramétrables par société (J+7/J+15/J+30 par défaut)
 *   - Multi-canal email + WhatsApp via Resend / WATI
 *   - L'historique factures_relances trace TOUS les envois (réels ET dry_run)
 *   - Idempotent : pour un même couple (facture, niveau), on ne renvoie pas
 *     deux fois (sauf retry après échec)
 */

import { buildTemplate, type RelanceTemplateVars } from './templates'

type SupabaseClient = any

export type CanalRelance = 'email' | 'whatsapp'

export const DEFAULT_DELAIS_JOURS: Record<1 | 2 | 3, number> = { 1: 7, 2: 15, 3: 30 }

export interface FactureARelancer {
  facture_id: string
  societe_id: string
  numero_facture: string
  tiers: string
  date_facture: string
  date_echeance: string
  jours_retard: number
  solde_du_mur: number
  devise: string
  montant_ttc: number
  niveau: 1 | 2 | 3
  contact_email: string | null
  contact_phone: string | null
}

export interface RelancesSocieteConfig {
  societe_id: string
  societe_nom: string
  relances_actif: boolean
  canaux: CanalRelance[]
  delais_jours: Record<1 | 2 | 3, number>
}

function parseDelais(raw: any): Record<1 | 2 | 3, number> {
  if (!raw || typeof raw !== 'object') return DEFAULT_DELAIS_JOURS
  const out: Record<1 | 2 | 3, number> = { ...DEFAULT_DELAIS_JOURS }
  for (const niveau of [1, 2, 3] as const) {
    const v = Number(raw[String(niveau)] ?? raw[niveau])
    if (Number.isFinite(v) && v >= 0) out[niveau] = Math.floor(v)
  }
  return out
}

function parseCanaux(raw: any): CanalRelance[] {
  if (!Array.isArray(raw)) return ['email']
  const out: CanalRelance[] = []
  for (const c of raw) {
    if (c === 'email' || c === 'whatsapp') out.push(c)
  }
  return out.length > 0 ? out : ['email']
}

export async function loadSocieteConfig(
  supabase: SupabaseClient,
  societe_id: string,
): Promise<RelancesSocieteConfig | null> {
  const { data, error } = await supabase
    .from('societes')
    .select('id, nom, relances_actif, relances_canaux, relances_delais_jours')
    .eq('id', societe_id)
    .maybeSingle()
  if (error || !data) return null
  return {
    societe_id: data.id,
    societe_nom: data.nom || 'Lexora',
    relances_actif: data.relances_actif === true,
    canaux: parseCanaux(data.relances_canaux),
    delais_jours: parseDelais(data.relances_delais_jours),
  }
}

/**
 * Résout le contact (email + téléphone) d'une facture :
 *   1) facture.contact_id → factures_contacts (si la colonne existe)
 *   2) factures_contacts WHERE societe_id et nom ILIKE tiers
 *   3) clients WHERE nom ILIKE tiers (fallback historique)
 * Retourne { email, phone } (null si non trouvés).
 */
export async function resolveContact(
  supabase: SupabaseClient,
  facture: { societe_id: string; tiers: string | null; contact_id?: string | null },
): Promise<{ email: string | null; phone: string | null }> {
  // 1) Lien direct
  if (facture.contact_id) {
    const { data } = await supabase
      .from('factures_contacts')
      .select('email, telephone')
      .eq('id', facture.contact_id)
      .maybeSingle()
    if (data && (data.email || data.telephone)) {
      return { email: data.email || null, phone: data.telephone || null }
    }
  }
  const tiers = (facture.tiers || '').trim()
  if (!tiers) return { email: null, phone: null }

  // 2) factures_contacts par nom (ILIKE pour tolérance casse)
  try {
    const { data } = await supabase
      .from('factures_contacts')
      .select('email, telephone')
      .eq('societe_id', facture.societe_id)
      .ilike('nom', tiers)
      .limit(1)
      .maybeSingle()
    if (data && (data.email || data.telephone)) {
      return { email: data.email || null, phone: data.telephone || null }
    }
  } catch {
    // table peut ne pas exister sur env legacy → on continue avec clients
  }

  // 3) Fallback clients
  try {
    const { data } = await supabase
      .from('clients')
      .select('email, telephone')
      .ilike('nom', tiers)
      .limit(1)
      .maybeSingle()
    if (data) {
      return { email: data.email || null, phone: data.telephone || null }
    }
  } catch {
    // idem
  }
  return { email: null, phone: null }
}

/**
 * Détermine le niveau de relance dû pour une facture donnée selon :
 *   - le nombre de jours de retard
 *   - le dernier niveau déjà envoyé (statut='envoye', dry_run=false)
 *   - les délais paramétrés
 *
 * Retourne null si rien à envoyer.
 */
export function determineNiveauDu(
  jours_retard: number,
  dernier_niveau_envoye: number | null,
  delais_jours: Record<1 | 2 | 3, number>,
): 1 | 2 | 3 | null {
  // On regarde du plus haut au plus bas : si on est au-delà du seuil du
  // niveau 3 et qu'on n'a pas encore envoyé le 3, on envoie le 3, etc.
  for (const niveau of [3, 2, 1] as const) {
    if (jours_retard >= delais_jours[niveau] && (dernier_niveau_envoye ?? 0) < niveau) {
      return niveau
    }
  }
  return null
}

function daysSince(dateStr: string, today: Date = new Date()): number {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 0
  // Différence en jours entiers (sans heures)
  const ms = today.getTime() - d.getTime()
  return Math.floor(ms / 86400000)
}

/**
 * Liste les factures CLIENTS impayées éligibles à une relance (niveau dû).
 */
export async function findFacturesARelancer(
  supabase: SupabaseClient,
  societe_id: string,
  options: { today?: Date; config?: RelancesSocieteConfig | null } = {},
): Promise<FactureARelancer[]> {
  const today = options.today ?? new Date()
  const config = options.config ?? (await loadSocieteConfig(supabase, societe_id))
  const delais = config?.delais_jours ?? DEFAULT_DELAIS_JOURS

  // 1) Factures clients non payées, non annulées
  const { data: facturesRaw, error } = await supabase
    .from('factures')
    .select('id, societe_id, numero_facture, tiers, type_facture, date_facture, date_echeance, devise, montant_ttc, montant_mur, solde_non_paye, statut, contact_id')
    .eq('societe_id', societe_id)
    .eq('type_facture', 'client')
    .in('statut', ['en_attente', 'partiel', 'retard'])
  if (error || !facturesRaw) return []
  // Filtre date_echeance non null en JS (les drivers Supabase et nos mocks
  // ne supportent pas tous .not('col', 'is', null) de façon uniforme).
  const factures = facturesRaw.filter((f: any) => f.date_echeance != null)

  // 2) Dernier niveau envoyé par facture (statut=envoye, dry_run=false)
  const factureIds = factures.map((f: any) => f.id)
  let dernierNiveauMap = new Map<string, number>()
  if (factureIds.length > 0) {
    const { data: historiques } = await supabase
      .from('factures_relances')
      .select('facture_id, niveau')
      .in('facture_id', factureIds)
      .eq('statut', 'envoye')
      .eq('dry_run', false)
    for (const h of historiques ?? []) {
      const cur = dernierNiveauMap.get(h.facture_id) ?? 0
      if (h.niveau > cur) dernierNiveauMap.set(h.facture_id, h.niveau)
    }
  }

  // 3) Filtrer & matcher niveau dû
  const out: FactureARelancer[] = []
  for (const f of factures) {
    const solde = Number(f.solde_non_paye)
    const soldeFinal = Number.isFinite(solde) && solde > 0
      ? solde
      : Number(f.montant_mur) || Number(f.montant_ttc) || 0
    if (soldeFinal <= 1) continue  // déjà payée à 1 MUR près
    const jours = daysSince(f.date_echeance, today)
    if (jours <= 0) continue
    const dernier = dernierNiveauMap.get(f.id) ?? null
    const niveau = determineNiveauDu(jours, dernier, delais)
    if (!niveau) continue

    const contact = await resolveContact(supabase, {
      societe_id: f.societe_id,
      tiers: f.tiers,
      contact_id: f.contact_id,
    })

    out.push({
      facture_id: f.id,
      societe_id: f.societe_id,
      numero_facture: f.numero_facture || '',
      tiers: f.tiers || '',
      date_facture: f.date_facture,
      date_echeance: f.date_echeance,
      jours_retard: jours,
      solde_du_mur: soldeFinal,
      devise: f.devise || 'MUR',
      montant_ttc: Number(f.montant_ttc) || 0,
      niveau,
      contact_email: contact.email,
      contact_phone: contact.phone,
    })
  }
  return out
}

// ──────────────────────────────────────────────────────────────────────
// Envoi
// ──────────────────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, error: 'RESEND_API_KEY manquante' }
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(key)
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'Lexora <onboarding@resend.dev>',
      to,
      subject,
      html,
    })
    if (error) return { ok: false, error: String(error.message || error) }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erreur Resend' }
  }
}

async function sendWhatsapp(phone: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.WATI_API_URL
  const key = process.env.WATI_API_KEY
  if (!url || !key) return { ok: false, error: 'WATI_API_URL / WATI_API_KEY manquante' }
  try {
    const res = await fetch(`${url}/api/v1/sendSessionMessage/${encodeURIComponent(phone)}`, {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageText: text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `HTTP ${res.status} ${body.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erreur WATI' }
  }
}

function fmtMontant(amount: number, devise: string): string {
  const n = amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n} ${devise}`
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export interface EnvoyerRelanceInput {
  facture: FactureARelancer
  societe_nom: string
  canaux: CanalRelance[]
  dry_run?: boolean
  source?: 'manuel' | 'cron' | 'api'
  created_by?: string | null
}

export interface EnvoyerRelanceResult {
  facture_id: string
  niveau: 1 | 2 | 3
  envois: Array<{
    canal: CanalRelance
    statut: 'envoye' | 'echec' | 'planifie'
    destinataire: string | null
    error?: string
  }>
}

/**
 * Envoie une relance pour une facture (1 envoi par canal demandé).
 * Insère 1 ligne factures_relances par canal (réussi ou échec).
 *
 * En mode dry_run : ne contacte ni Resend ni WATI, mais trace tout
 * de même les lignes (statut='envoye', dry_run=true) → permet de voir
 * dans l'UI ce qui aurait été envoyé.
 */
export async function envoyerRelance(
  supabase: SupabaseClient,
  input: EnvoyerRelanceInput,
): Promise<EnvoyerRelanceResult> {
  const { facture, canaux, societe_nom, dry_run = false, source = 'manuel', created_by = null } = input

  const vars: RelanceTemplateVars = {
    numero_facture: facture.numero_facture,
    client_nom: facture.tiers,
    societe_nom,
    montant_du: fmtMontant(facture.solde_du_mur, 'MUR'),
    date_facture: fmtDate(facture.date_facture),
    date_echeance: fmtDate(facture.date_echeance),
    jours_retard: facture.jours_retard,
  }
  const tpl = buildTemplate(facture.niveau, vars)

  const result: EnvoyerRelanceResult = {
    facture_id: facture.facture_id,
    niveau: facture.niveau,
    envois: [],
  }

  for (const canal of canaux) {
    const destinataire = canal === 'email' ? facture.contact_email : facture.contact_phone
    let statut: 'envoye' | 'echec' | 'planifie' = 'envoye'
    let error: string | undefined
    const message = canal === 'email' ? tpl.message_html : tpl.message_text

    if (!destinataire) {
      statut = 'echec'
      error = canal === 'email' ? 'Email destinataire manquant' : 'Téléphone destinataire manquant'
    } else if (!dry_run) {
      const send = canal === 'email'
        ? await sendEmail(destinataire, tpl.sujet, tpl.message_html)
        : await sendWhatsapp(destinataire, tpl.message_text)
      if (!send.ok) {
        statut = 'echec'
        error = send.error
      }
    }

    // Trace en DB (même les échecs, pour audit)
    await supabase.from('factures_relances').insert({
      facture_id: facture.facture_id,
      societe_id: facture.societe_id,
      niveau: facture.niveau,
      canal,
      statut,
      destinataire,
      sujet: tpl.sujet,
      message,
      error: error || null,
      dry_run,
      source,
      created_by,
    })

    result.envois.push({ canal, statut, destinataire: destinataire || null, error })
  }

  return result
}

// ──────────────────────────────────────────────────────────────────────
// Orchestration
// ──────────────────────────────────────────────────────────────────────

export interface RunOptions {
  societe_id?: string | null    // null = toutes les sociétés actives
  facture_ids?: string[] | null // restreint à ces factures
  canaux?: CanalRelance[] | null // override des canaux configurés
  dry_run?: boolean
  source?: 'manuel' | 'cron' | 'api'
  created_by?: string | null
  today?: Date
}

export interface RunSummary {
  societes_traitees: number
  factures_eligibles: number
  envois_ok: number
  envois_echec: number
  details: EnvoyerRelanceResult[]
}

export async function runRelancesQuotidiennes(
  supabase: SupabaseClient,
  options: RunOptions = {},
): Promise<RunSummary> {
  const summary: RunSummary = {
    societes_traitees: 0,
    factures_eligibles: 0,
    envois_ok: 0,
    envois_echec: 0,
    details: [],
  }

  // 1) Sociétés à traiter
  let societesQ = supabase
    .from('societes')
    .select('id, nom, relances_actif, relances_canaux, relances_delais_jours')
  if (options.societe_id) {
    societesQ = societesQ.eq('id', options.societe_id)
  } else if (options.source === 'cron') {
    // Cron : uniquement les sociétés ayant activé les relances
    societesQ = societesQ.eq('relances_actif', true)
  }
  const { data: societes } = await societesQ
  if (!societes) return summary

  for (const s of societes) {
    const config: RelancesSocieteConfig = {
      societe_id: s.id,
      societe_nom: s.nom || 'Lexora',
      relances_actif: s.relances_actif === true,
      canaux: parseCanaux(s.relances_canaux),
      delais_jours: parseDelais(s.relances_delais_jours),
    }
    summary.societes_traitees += 1

    let factures = await findFacturesARelancer(supabase, s.id, { today: options.today, config })
    if (options.facture_ids && options.facture_ids.length > 0) {
      const allowed = new Set(options.facture_ids)
      factures = factures.filter((f) => allowed.has(f.facture_id))
    }
    summary.factures_eligibles += factures.length

    const canaux = options.canaux && options.canaux.length > 0 ? options.canaux : config.canaux

    for (const f of factures) {
      const r = await envoyerRelance(supabase, {
        facture: f,
        societe_nom: config.societe_nom,
        canaux,
        dry_run: options.dry_run === true,
        source: options.source ?? 'manuel',
        created_by: options.created_by ?? null,
      })
      for (const e of r.envois) {
        if (e.statut === 'echec') summary.envois_echec += 1
        else summary.envois_ok += 1
      }
      summary.details.push(r)
    }
  }

  return summary
}
