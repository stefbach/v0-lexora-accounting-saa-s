/**
 * POST /api/agent/grand-livre
 *
 * "Lex Livre" — agent comptable Grand Livre. Deux modes selon `action` :
 *
 * - action="audit" (default) : audite le Grand Livre — R1, comptes hors PCM,
 *   tiers anciens non lettrés, compte 5811, doublons, écritures sans ref.
 *
 * - action="lettrer" : passe lettreur sur les comptes 411x/401x — pour
 *   chaque compte, regroupe les écritures par tiers (libellé normalisé),
 *   apparie débits et crédits qui s'équilibrent (montant ±0.01) et leur
 *   assigne une même lettre. Insère les liens dans la colonne `lettre` +
 *   `date_lettrage`. Idempotent (re-cours uniquement les non lettrées).
 *
 * Auth : bearer LEXORA_AGENT_SECRET OU session navigateur (avec accès société)
 * Body : { societe_id: string, action?: "audit" | "lettrer", exercice?: string }
 */
import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { authenticateAgentRequest } from "@/lib/agent-auth"
import { getAdminClient } from "@/lib/supabase/admin"
import { runLettrage } from "@/lib/accounting/lettrage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const AGENT_NAME = "Lex Livre"

export async function POST(request: Request) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 })
  }
  const societe_id: string | undefined = body?.societe_id
  if (!societe_id) {
    return NextResponse.json({ error: "societe_id requis" }, { status: 400 })
  }
  const auth = await authenticateAgentRequest(request, societe_id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const action: "audit" | "lettrer" = body?.action === "lettrer" ? "lettrer" : "audit"

  if (action === "lettrer") {
    return handleLettrage(societe_id)
  }
  return handleAudit(societe_id, body)
}

// ── ACTION : LETTRAGE TIERS ──────────────────────────────────────────
// Délègue à lib/accounting/lettrage.ts (partagé avec Lex Banque pour que
// le lettrage soit aussi joué automatiquement à la fin du smart/apply).
async function handleLettrage(societe_id: string) {
  const sb = getAdminClient()
  try {
    const result = await runLettrage(sb, societe_id)
    return NextResponse.json({
      ok: true,
      agent: AGENT_NAME,
      action: "lettrer",
      societe_id,
      ...result,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur lettrage" }, { status: 500 })
  }
}

// ── ACTION : AUDIT ───────────────────────────────────────────────────
async function handleAudit(societe_id: string, body: any) {
  const exercice: string | null = body?.exercice || null
  const sb = getAdminClient()

  // Charge tout en parallèle
  const [
    { data: societe },
    { data: pcm },
    { data: ecritures },
  ] = await Promise.all([
    sb
      .from("societes")
      .select("id, nom, devise_principale, date_debut_exercice, date_fin_exercice")
      .eq("id", societe_id)
      .maybeSingle(),
    sb
      .from("plan_comptable")
      .select("compte, libelle, classe, type_compte, sens_normal")
      .or(`societe_id.eq.${societe_id},societe_id.is.null`)
      .eq("actif", true),
    sb
      .from("ecritures_comptables_v2")
      .select(
        "id, date_ecriture, journal, numero_compte, libelle, debit_mur, credit_mur, lettre, ref_folio, exercice"
      )
      .eq("societe_id", societe_id)
      .limit(20000),
  ])
  if (!societe) return NextResponse.json({ error: "société introuvable" }, { status: 404 })

  const allEcritures = (ecritures || []).filter((e: any) =>
    exercice ? e.exercice === exercice : true
  )

  // ── R1 : balance globale ───────────────────────────────────────
  const totalDebit = allEcritures.reduce((s, e) => s + (Number(e.debit_mur) || 0), 0)
  const totalCredit = allEcritures.reduce((s, e) => s + (Number(e.credit_mur) || 0), 0)
  const ecartBalance = Math.round((totalDebit - totalCredit) * 100) / 100

  // ── Ventilation par compte ─────────────────────────────────────
  const pcmSet = new Set((pcm || []).map((p: any) => p.compte))
  const pcmByCompte = new Map<string, any>()
  for (const p of pcm || []) pcmByCompte.set(p.compte, p)

  const byCompte = new Map<
    string,
    { numero: string; nb: number; debit: number; credit: number; non_lettre: number; classe: number | null }
  >()
  for (const e of allEcritures) {
    const num = e.numero_compte || "?"
    const slot = byCompte.get(num) || {
      numero: num,
      nb: 0,
      debit: 0,
      credit: 0,
      non_lettre: 0,
      classe: parseInt(num[0]) || null,
    }
    slot.nb++
    slot.debit += Number(e.debit_mur) || 0
    slot.credit += Number(e.credit_mur) || 0
    if (!e.lettre) slot.non_lettre++
    byCompte.set(num, slot)
  }

  // Comptes utilisés mais ABSENTS du PCM
  const comptesHorsPcm = Array.from(byCompte.keys())
    .filter((c) => c !== "?" && !pcmSet.has(c))
    .map((c) => byCompte.get(c)!)
    .sort((a, b) => b.nb - a.nb)

  // ── Anomalie : 411x/401x non lettrés > 90 jours ────────────────
  const ninety = Date.now() - 90 * 86400000
  const tiersNonLettresVieux = allEcritures
    .filter((e: any) => {
      if (e.lettre) return false
      const num = (e.numero_compte || "").toString()
      if (!num.startsWith("411") && !num.startsWith("401")) return false
      if (!e.date_ecriture) return false
      return new Date(e.date_ecriture).getTime() < ninety
    })
    .map((e: any) => ({
      id: e.id,
      date: e.date_ecriture,
      compte: e.numero_compte,
      libelle: e.libelle,
      debit: Number(e.debit_mur) || 0,
      credit: Number(e.credit_mur) || 0,
      ref_folio: e.ref_folio,
    }))

  // ── Compte 5811 (virements internes) doit être soldé ────────────
  const compte5811 = byCompte.get("5811") || byCompte.get("580")
  const solde5811 = compte5811 ? compte5811.debit - compte5811.credit : 0

  // ── Écritures sans ref_folio (legacy) ───────────────────────────
  const ecrituresSansRef = allEcritures.filter((e: any) => !e.ref_folio).length

  // ── Doublons potentiels (date + montant + libellé) ──────────────
  const doublonsMap = new Map<string, number>()
  for (const e of allEcritures) {
    const key = `${e.date_ecriture}|${(Number(e.debit_mur) || 0).toFixed(2)}|${(Number(e.credit_mur) || 0).toFixed(2)}|${(e.libelle || "").slice(0, 50)}|${e.numero_compte}`
    doublonsMap.set(key, (doublonsMap.get(key) || 0) + 1)
  }
  const doublonsCount = Array.from(doublonsMap.values()).filter((n) => n > 1).length

  // ── Classes manquantes (peu probable mais utile) ────────────────
  const classesUtilisees = new Set<number>()
  for (const c of byCompte.values()) if (c.classe) classesUtilisees.add(c.classe)

  // ═══ NOUVEAUX CONTRÔLES v2 ═══

  // ── C7 : Écritures dans le futur (erreur de saisie probable) ─────
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const ecrituresFutures = allEcritures.filter((e: any) => {
    if (!e.date_ecriture) return false
    return new Date(e.date_ecriture) > today
  })

  // ── C8 : Écritures hors exercice (si exercice spécifié) ─────────
  const ecrituresHorsExercice = exercice
    ? allEcritures.filter((e: any) => e.exercice && e.exercice !== exercice)
    : []

  // ── C9 : Comptes tiers en sens inversé (anomalie comptable) ──────
  // 411 (client) : solde NORMAL débiteur (créance). Si crédit > débit cumulé = acompte
  // 401 (fournisseur) : solde NORMAL créditeur (dette). Si débit > crédit cumulé = acompte
  const tiersInverses: Array<{ numero: string; solde: number; sens: string }> = []
  for (const [numero, c] of byCompte) {
    const solde = c.debit - c.credit
    if (numero.startsWith('411') && solde < -0.01) {
      tiersInverses.push({ numero, solde, sens: 'client_crediteur' })
    } else if (numero.startsWith('401') && solde > 0.01) {
      tiersInverses.push({ numero, solde, sens: 'fournisseur_debiteur' })
    }
  }

  // ── C10 : Cohérence TVA — 4456 + 4457 vs 4455 ────────────────────
  const tva_4456 = (byCompte.get('4456')?.debit || 0) - (byCompte.get('4456')?.credit || 0)
  const tva_4457 = (byCompte.get('4457')?.credit || 0) - (byCompte.get('4457')?.debit || 0)
  const tva_4455 = (byCompte.get('4455')?.credit || 0) - (byCompte.get('4455')?.debit || 0)
  const tva_4458 = (byCompte.get('4458')?.debit || 0) - (byCompte.get('4458')?.credit || 0)
  // Identité : TVA à payer (4455) ≈ TVA collectée (4457) - TVA déductible (4456) - TVA à récupérer (4458)
  const tva_attendue = tva_4457 - tva_4456 - tva_4458
  const tva_ecart = Math.round((tva_4455 - tva_attendue) * 100) / 100

  // ── C11 : Comptes auxiliaires sans sous-compte (411/401 nus) ─────
  const comptesAuxNus: Array<{ numero: string; nb: number; solde: number }> = []
  for (const [numero, c] of byCompte) {
    if ((numero === '411' || numero === '401') && c.nb > 0) {
      comptesAuxNus.push({ numero, nb: c.nb, solde: c.debit - c.credit })
    }
  }

  // ── C12 : Net à payer (4210) qui traîne > 30j ────────────────────
  const thirtyDaysAgo = Date.now() - 30 * 86400000
  const netAPayerVieux = allEcritures.filter((e: any) => {
    if (e.lettre) return false
    if (!(e.numero_compte || '').startsWith('4210')) return false
    if (!e.date_ecriture) return false
    return new Date(e.date_ecriture).getTime() < thirtyDaysAgo && (Number(e.credit_mur) || 0) > 0
  })

  // ── C13 : Charges patronales (6451-54) vs cotisations à payer (4321-24) ─────
  const charges_patronales_d = ['6451', '6452', '6453', '6454'].reduce(
    (s, c) => s + ((byCompte.get(c)?.debit || 0) - (byCompte.get(c)?.credit || 0)),
    0,
  )
  const cot_patronales_c = ['4321', '4322', '4323', '4324'].reduce(
    (s, c) => s + ((byCompte.get(c)?.credit || 0) - (byCompte.get(c)?.debit || 0)),
    0,
  )
  const cot_patronales_ecart = Math.round((charges_patronales_d - cot_patronales_c) * 100) / 100

  // ── C14 : Écritures le weekend ou jour férié MU (anti-fraude soft) ──
  const fériésMU2026 = ['2026-01-01','2026-01-02','2026-02-04','2026-03-12','2026-03-18','2026-05-01','2026-08-15','2026-09-04','2026-11-01','2026-11-02','2026-12-25']
  const ecrituresWeekendFerie = allEcritures.filter((e: any) => {
    if (!e.date_ecriture) return false
    const d = new Date(e.date_ecriture)
    const day = d.getDay() // 0=dim, 6=sam
    const iso = e.date_ecriture.slice(0, 10)
    return day === 0 || day === 6 || fériésMU2026.includes(iso)
  }).length

  // ── C15 : Montants ronds > 100k (anti-fraude — pas un test absolu) ───
  const montantsRondsEleves = allEcritures.filter((e: any) => {
    const max = Math.max(Number(e.debit_mur) || 0, Number(e.credit_mur) || 0)
    return max >= 100000 && max % 1000 === 0
  }).length

  // ── C16 : Sens inversé charges (6xxx en crédit net) / produits (7xxx en débit net) ──
  const sensInverses: Array<{ numero: string; solde: number; classe: number }> = []
  for (const [numero, c] of byCompte) {
    if (numero === '?') continue
    const classe = parseInt(numero[0])
    const solde = c.debit - c.credit
    if (classe === 6 && solde < -1) {
      sensInverses.push({ numero, solde, classe })
    } else if (classe === 7 && solde > 1) {
      sensInverses.push({ numero, solde, classe })
    }
  }

  // ── C17 : Drill-down sur balance déséquilibrée ────────────────────
  // Si écart de balance, identifier les comptes qui contribuent le plus à l'écart
  const compteEcarts = ecartBalance !== 0
    ? Array.from(byCompte.values())
        .map((c) => ({ numero: c.numero, ecart: Math.round((c.debit - c.credit) * 100) / 100 }))
        .filter((c) => Math.abs(c.ecart) > 1)
        .sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart))
        .slice(0, 10)
    : []

  // ── C18 : Doublons écritures rapprochées + non rapprochées (double comptage) ──
  const doublonsRapprochement = allEcritures.filter((e: any) => {
    if (!e.lettre) return false
    if (!(e.numero_compte || '').startsWith('512') && !(e.numero_compte || '').startsWith('411') && !(e.numero_compte || '').startsWith('401')) return false
    // Cherche une autre écriture même date+montant+compte SANS lettre
    return allEcritures.some((e2: any) =>
      e2.id !== e.id
      && !e2.lettre
      && e2.numero_compte === e.numero_compte
      && e2.date_ecriture === e.date_ecriture
      && Math.abs((Number(e2.debit_mur) || 0) - (Number(e.debit_mur) || 0)) < 0.01
      && Math.abs((Number(e2.credit_mur) || 0) - (Number(e.credit_mur) || 0)) < 0.01,
    )
  }).length

  // ── C19 : Bulletins comptabilisés sans écritures correspondantes ──
  const { data: bulletinsComptabilises } = await sb
    .from('bulletins_paie')
    .select('id, periode')
    .eq('societe_id', societe_id)
    .eq('comptabilise', true)
  const bulletinsRefFolios = new Set(allEcritures.map((e: any) => e.ref_folio).filter(Boolean))
  const bulletinsOrphelins = (bulletinsComptabilises || []).filter((b: any) => !bulletinsRefFolios.has(`BP-${b.id}`)).length

  // ── C20 : MRA PAYE retenu (4330 credit) > MRA PAYE payé (sortie banque) ──
  const paye_retenu = (byCompte.get('4330')?.credit || 0) - (byCompte.get('4330')?.debit || 0)
  const paye_paye = (byCompte.get('4330')?.debit || 0) // débits sur le compte = paiements
  const paye_solde = Math.round((paye_retenu - paye_paye) * 100) / 100

  // ── Score global ────────────────────────────────────────────────
  const issues: Array<{ severity: "critical" | "warning" | "info"; code: string; message: string; count?: number }> = []
  if (Math.abs(ecartBalance) > 0.01) {
    issues.push({
      severity: "critical",
      code: "R1_BALANCE",
      message: `Grand Livre déséquilibré : écart ${ecartBalance.toFixed(2)} MUR (D ${totalDebit.toFixed(0)} - C ${totalCredit.toFixed(0)})`,
    })
  }
  if (comptesHorsPcm.length > 0) {
    issues.push({
      severity: "warning",
      code: "PCM_UNKNOWN",
      message: `${comptesHorsPcm.length} compte(s) utilisés mais absents du plan comptable mauricien`,
      count: comptesHorsPcm.length,
    })
  }
  if (tiersNonLettresVieux.length > 0) {
    issues.push({
      severity: "warning",
      code: "TIERS_OLD",
      message: `${tiersNonLettresVieux.length} écriture(s) 411x/401x non lettrées de plus de 90 jours`,
      count: tiersNonLettresVieux.length,
    })
  }
  if (Math.abs(solde5811) > 0.01) {
    issues.push({
      severity: "warning",
      code: "VIREMENTS_580",
      message: `Compte 5811 (virements internes) non soldé : ${solde5811.toFixed(2)} MUR — devrait être à 0 en fin d'exercice`,
    })
  }
  if (ecrituresSansRef > 0) {
    issues.push({
      severity: "info",
      code: "NO_REF_FOLIO",
      message: `${ecrituresSansRef} écriture(s) sans ref_folio (legacy ou orphelines — non bloquant)`,
      count: ecrituresSansRef,
    })
  }
  if (doublonsCount > 0) {
    issues.push({
      severity: "warning",
      code: "DUPLICATES",
      message: `${doublonsCount} doublon(s) potentiel(s) (même date + montant + libellé)`,
      count: doublonsCount,
    })
  }

  // Nouvelles issues v2
  if (ecrituresFutures.length > 0) {
    issues.push({ severity: 'warning', code: 'DATE_FUTURE', message: `${ecrituresFutures.length} écriture(s) avec date dans le futur — erreur de saisie probable`, count: ecrituresFutures.length })
  }
  if (ecrituresHorsExercice.length > 0) {
    issues.push({ severity: 'warning', code: 'HORS_EXERCICE', message: `${ecrituresHorsExercice.length} écriture(s) hors de l'exercice ${exercice}`, count: ecrituresHorsExercice.length })
  }
  if (tiersInverses.length > 0) {
    issues.push({ severity: 'warning', code: 'TIERS_INVERSES', message: `${tiersInverses.length} compte(s) tiers avec solde inversé (clients créditeurs ou fournisseurs débiteurs — vérifier acomptes 4191/4091)`, count: tiersInverses.length })
  }
  if (Math.abs(tva_ecart) > 1) {
    issues.push({ severity: 'warning', code: 'TVA_ECART', message: `Écart TVA : 4455 (à payer) vs 4457-4456-4458 = ${tva_ecart.toFixed(2)} MUR — vérifier la déclaration` })
  }
  if (comptesAuxNus.length > 0) {
    issues.push({ severity: 'info', code: 'AUX_NUS', message: `${comptesAuxNus.length} compte(s) auxiliaire(s) sans sous-compte tiers (411 ou 401 nu) — passer en 411-CLIENTX / 401-FOURNISSEURX`, count: comptesAuxNus.length })
  }
  if (netAPayerVieux.length > 0) {
    issues.push({ severity: 'warning', code: 'SALAIRE_NON_PAYE', message: `${netAPayerVieux.length} écriture(s) "Net à payer" (4210) non lettrées de plus de 30 jours — salaire(s) non payé(s) ?`, count: netAPayerVieux.length })
  }
  if (Math.abs(cot_patronales_ecart) > 1) {
    issues.push({ severity: 'warning', code: 'COT_PATRONALES_ECART', message: `Charges patronales (6451-54) vs cotisations à payer (4321-24) : écart de ${cot_patronales_ecart.toFixed(2)} MUR — devrait être à 0` })
  }
  if (ecrituresWeekendFerie > 0) {
    issues.push({ severity: 'info', code: 'DATES_NON_OUVREES', message: `${ecrituresWeekendFerie} écriture(s) datée(s) du weekend ou d'un jour férié MU — anti-fraude soft`, count: ecrituresWeekendFerie })
  }
  if (montantsRondsEleves > 0) {
    issues.push({ severity: 'info', code: 'MONTANTS_RONDS', message: `${montantsRondsEleves} écriture(s) avec montants ronds > 100k MUR — à vérifier (anti-fraude soft)`, count: montantsRondsEleves })
  }
  if (sensInverses.length > 0) {
    issues.push({ severity: 'warning', code: 'SENS_INVERSE', message: `${sensInverses.length} compte(s) de classe 6 ou 7 avec sens inversé (charge créditrice ou produit débiteur)`, count: sensInverses.length })
  }
  if (doublonsRapprochement > 0) {
    issues.push({ severity: 'warning', code: 'DOUBLON_RAPPROCHE', message: `${doublonsRapprochement} écriture(s) rapprochée(s) avec un jumeau non rapproché — double comptage possible`, count: doublonsRapprochement })
  }
  if (bulletinsOrphelins > 0) {
    issues.push({ severity: 'warning', code: 'BULLETINS_ORPHELINS', message: `${bulletinsOrphelins} bulletin(s) de paie comptabilisé(s) sans écritures correspondantes — régénérer via generer_ecritures_paie`, count: bulletinsOrphelins })
  }
  if (Math.abs(paye_solde) > 1) {
    issues.push({ severity: 'info', code: 'PAYE_SOLDE', message: `Solde PAYE retenu vs payé : ${paye_solde.toFixed(2)} MUR — vérifier déclarations Form 5` })
  }

  const critical = issues.filter((i) => i.severity === "critical").length
  const warnings = issues.filter((i) => i.severity === "warning").length
  const score = Math.max(0, 100 - critical * 50 - warnings * 10)

  // ── Résumé classes ─────────────────────────────────────────────
  const classes = [1, 2, 3, 4, 5, 6, 7].map((cl) => {
    const inClass = Array.from(byCompte.values()).filter((c) => c.classe === cl)
    return {
      classe: cl,
      label:
        cl === 1
          ? "Capitaux"
          : cl === 2
            ? "Immobilisations"
            : cl === 3
              ? "Stocks"
              : cl === 4
                ? "Tiers"
                : cl === 5
                  ? "Trésorerie"
                  : cl === 6
                    ? "Charges"
                    : "Produits",
      nb_comptes_utilises: inClass.length,
      nb_comptes_pcm: (pcm || []).filter((p: any) => p.classe === cl).length,
      total_debit: Math.round(inClass.reduce((s, c) => s + c.debit, 0) * 100) / 100,
      total_credit: Math.round(inClass.reduce((s, c) => s + c.credit, 0) * 100) / 100,
    }
  })

  // ── Couche LLM explainer (optionnelle) ──────────────────────────
  let explanation: string | null = null
  if (body?.explain === true && process.env.ANTHROPIC_API_KEY) {
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const auditDigest = {
        societe: societe.nom,
        score,
        severity: critical > 0 ? 'critical' : warnings > 0 ? 'warning' : 'ok',
        ecart_balance: ecartBalance,
        issues,
        tva_summary: { ttc_collectee: tva_4457, ttc_deductible: tva_4456, a_payer: tva_4455, ecart: tva_ecart },
        cot_patronales_ecart,
        bulletins_orphelins: bulletinsOrphelins,
        doublons_total: doublonsCount + doublonsRapprochement,
        drill_down_balance: compteEcarts,
        tiers_anciens: tiersNonLettresVieux.length,
      }
      const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_AUDIT_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: `Tu es un expert-comptable mauricien (40 ans d'expérience, IFRS, PCM 4-digits). On te donne un rapport d'audit JSON d'un Grand Livre. Ta mission :

1. RÉSUMER en 3-5 lignes la santé comptable globale (score + sévérité + faits saillants).
2. EXPLIQUER chaque issue trouvée de façon pédagogique pour un dirigeant non-comptable (1 phrase par issue).
3. PRIORISER les actions à mener (numéroter 1, 2, 3...) avec un effort estimé (5 min / 30 min / 1h+).
4. ÉMETTRE des hypothèses sur les causes probables des anomalies (ex: "le compte 5811 non soldé suggère qu'un virement EUR↔MUR a été enregistré sans contrepartie cross-currency").
5. FÉLICITER si tout est vert (score >= 90, 0 critical).

Format : Markdown léger (## titres, listes à puces, gras). Français professionnel mais accessible. PAS de jargon comptable inutile. Pas de copier-coller du JSON brut.`,
        messages: [{ role: 'user', content: JSON.stringify(auditDigest, null, 2) }],
      })
      explanation = response.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n')
    } catch (e: any) {
      console.warn('[lex-livre] LLM explainer failed:', e?.message)
      explanation = null
    }
  }

  return NextResponse.json({
    ok: true,
    agent: AGENT_NAME,
    audited_at: new Date().toISOString(),
    societe: { id: societe.id, nom: societe.nom },
    score,
    severity: critical > 0 ? "critical" : warnings > 0 ? "warning" : "ok",
    summary: {
      total_ecritures: allEcritures.length,
      total_debit: Math.round(totalDebit * 100) / 100,
      total_credit: Math.round(totalCredit * 100) / 100,
      ecart_balance: ecartBalance,
      comptes_utilises: byCompte.size,
      comptes_pcm_total: pcm?.length || 0,
    },
    issues,
    classes,
    comptes_hors_pcm: comptesHorsPcm.slice(0, 30),
    tiers_non_lettres_vieux: tiersNonLettresVieux.slice(0, 30),
    doublons_count: doublonsCount,
    ecritures_sans_ref: ecrituresSansRef,
    ecritures_futures: ecrituresFutures.slice(0, 20).map((e: any) => ({ id: e.id, date: e.date_ecriture, compte: e.numero_compte, libelle: e.libelle })),
    ecritures_hors_exercice_count: ecrituresHorsExercice.length,
    tiers_inverses: tiersInverses.slice(0, 20),
    tva_summary: { ttc_collectee: tva_4457, ttc_deductible: tva_4456, a_payer: tva_4455, a_recuperer: tva_4458, ecart_calcul: tva_ecart },
    comptes_aux_nus: comptesAuxNus,
    net_a_payer_vieux: netAPayerVieux.slice(0, 20).map((e: any) => ({ id: e.id, date: e.date_ecriture, libelle: e.libelle, montant: Number(e.credit_mur) || 0 })),
    cot_patronales: { charges_d: charges_patronales_d, cot_c: cot_patronales_c, ecart: cot_patronales_ecart },
    ecritures_weekend_ferie: ecrituresWeekendFerie,
    montants_ronds_count: montantsRondsEleves,
    sens_inverses: sensInverses.slice(0, 20),
    doublons_rapprochement: doublonsRapprochement,
    bulletins_orphelins: bulletinsOrphelins,
    paye_summary: { retenu: paye_retenu, paye: paye_paye, solde: paye_solde },
    drill_down_balance: compteEcarts,
    explanation,
  })
}
