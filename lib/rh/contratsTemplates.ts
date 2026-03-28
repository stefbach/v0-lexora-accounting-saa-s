// ============================================================
// app/lib/contratsTemplates.ts
// Templates de contrats de travail — WRA 2019, ERA 2008, Finance Act 2024
// ============================================================

export const TYPES_CONTRATS = ['cdi', 'cdd', 'temps_partiel', 'consultant', 'apprentissage'] as const;
export const SECTEURS = ['general', 'sante', 'bpo_it', 'tourisme', 'construction', 'epz', 'direction', 'domestic'] as const;

export type TypeContrat = typeof TYPES_CONTRATS[number];
export type Secteur = typeof SECTEURS[number];

export interface ParamsContrat {
  societe_nom: string;
  societe_brn: string;
  societe_adresse: string;
  employe_nom: string;
  employe_prenom: string;
  employe_nic: string;
  employe_dob: string;
  poste: string;
  departement?: string;
  salaire_base: number;
  date_debut: string;
  date_fin?: string; // CDD uniquement
  periode_essai?: number; // jours
  lieu_travail: string;
  heures_semaine?: number;
  clauses_speciales?: string[];
  motif_cdd?: string; // CDD : motif obligatoire WRA
}

// Remplir les variables du template
export function remplirTemplate(template: string, params: ParamsContrat): string {
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return template
    .replace(/{{societe_nom}}/g, params.societe_nom)
    .replace(/{{societe_brn}}/g, params.societe_brn)
    .replace(/{{societe_adresse}}/g, params.societe_adresse)
    .replace(/{{employe_nom_complet}}/g, `${params.employe_prenom} ${params.employe_nom}`)
    .replace(/{{employe_nom}}/g, params.employe_nom)
    .replace(/{{employe_prenom}}/g, params.employe_prenom)
    .replace(/{{employe_nic}}/g, params.employe_nic)
    .replace(/{{employe_dob}}/g, params.employe_dob)
    .replace(/{{poste}}/g, params.poste)
    .replace(/{{departement}}/g, params.departement || 'Non défini')
    .replace(/{{salaire_base}}/g, params.salaire_base.toLocaleString('fr-FR'))
    .replace(/{{date_debut}}/g, params.date_debut)
    .replace(/{{date_fin}}/g, params.date_fin || '')
    .replace(/{{periode_essai}}/g, String(params.periode_essai || 90))
    .replace(/{{lieu_travail}}/g, params.lieu_travail)
    .replace(/{{heures_semaine}}/g, String(params.heures_semaine || 45))
    .replace(/{{motif_cdd}}/g, params.motif_cdd || '')
    .replace(/{{date_generation}}/g, date);
}

export function getTemplate(type: string, secteur: string): string {
  const key = `${type}_${secteur}`;
  return TEMPLATES[key] || TEMPLATES[`${type}_general`] || TEMPLATES['cdi_general'];
}

export const TEMPLATES: Record<string, string> = {

// ============================================================
// CDI GÉNÉRAL — Conforme WRA 2019
// ============================================================
'cdi_general': `
<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; font-size: 13px; line-height: 1.6; color: #1a1a1a;">

<div style="text-align:center; margin-bottom: 30px; border-bottom: 2px solid #1a1a1a; padding-bottom: 20px;">
  <h1 style="font-size: 18px; text-transform: uppercase; letter-spacing: 2px; margin: 0;">CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE</h1>
  <h2 style="font-size: 14px; font-weight: normal; margin: 5px 0;">CONTRACT OF EMPLOYMENT (INDEFINITE DURATION)</h2>
  <p style="font-size: 11px; color: #666;">Conformément au Workers' Rights Act 2019 et amendements / In accordance with the Workers' Rights Act 2019 and amendments</p>
</div>

<p style="margin-bottom: 20px;"><strong>ENTRE / BETWEEN :</strong></p>

<div style="background: #f8f8f8; padding: 15px; border-left: 4px solid #1a1a1a; margin-bottom: 15px;">
  <strong>{{societe_nom}}</strong>, société de droit mauricien, immatriculée sous le BRN <strong>{{societe_brn}}</strong>, dont le siège social est sis <strong>{{societe_adresse}}</strong>, ci-après dénommée <em>«&nbsp;l'Employeur&nbsp;»</em>
</div>

<p style="text-align:center; font-weight: bold; margin: 10px 0;">ET / AND</p>

<div style="background: #f8f8f8; padding: 15px; border-left: 4px solid #1a1a1a; margin-bottom: 25px;">
  <strong>{{employe_nom_complet}}</strong>, titulaire du NIC n° <strong>{{employe_nic}}</strong>, né(e) le <strong>{{employe_dob}}</strong>, ci-après dénommé(e) <em>«&nbsp;l'Employé(e)&nbsp;»</em>
</div>

<p>Il est convenu ce qui suit / It is hereby agreed as follows :</p>

<h3 style="border-top: 1px solid #ccc; padding-top: 15px; margin-top: 20px;">ARTICLE 1 — ENGAGEMENT / APPOINTMENT</h3>
<p>L'Employeur engage l'Employé(e) à compter du <strong>{{date_debut}}</strong> en qualité de <strong>{{poste}}</strong>, au sein du département <strong>{{departement}}</strong>.</p>
<p>Le lieu habituel de travail est fixé à : <strong>{{lieu_travail}}</strong>. L'Employeur se réserve le droit de modifier le lieu de travail dans un rayon raisonnable conformément aux besoins de l'entreprise (WRA s.16).</p>

<h3 style="border-top: 1px solid #ccc; padding-top: 15px; margin-top: 20px;">ARTICLE 2 — PÉRIODE D'ESSAI / PROBATIONARY PERIOD</h3>
<p>Conformément à la <strong>section 35 du Workers' Rights Act 2019</strong>, le présent contrat est soumis à une période d'essai de <strong>{{periode_essai}} jours</strong> calendaires à compter de la date d'engagement.</p>
<p>Durant cette période, chacune des parties peut mettre fin au contrat moyennant un préavis de <strong>7 jours</strong>. La période d'essai peut être renouvelée une fois d'un commun accord écrit.</p>

<h3 style="border-top: 1px solid #ccc; padding-top: 15px; margin-top: 20px;">ARTICLE 3 — RÉMUNÉRATION / REMUNERATION</h3>
<p>L'Employé(e) percevra un salaire de base mensuel de <strong>{{salaire_base}} MUR</strong> (Roupies Mauriciennes), payable à la fin de chaque mois ou au plus tard le dernier jour ouvré du mois.</p>
<p>Ce salaire est conforme au <em>National Minimum Wage Act</em> — salaire minimum national en vigueur : 16 500 MUR/mois (2025). La compensation salariale annuelle obligatoire sera versée conformément au <em>Finance Act</em> en vigueur.</p>
<p>Les déductions légales (CSG, NSF, PAYE, NPS) seront effectuées conformément aux lois fiscales et sociales mauriciennes en vigueur (MRA — Mauritius Revenue Authority).</p>

<h3 style="border-top: 1px solid #ccc; padding-top: 15px; margin-top: 20px;">ARTICLE 4 — HEURES DE TRAVAIL / WORKING HOURS</h3>
<p>La durée normale de travail est fixée à <strong>{{heures_semaine}} heures par semaine</strong>, conformément à la <strong>section 23 du WRA 2019</strong>. Les horaires spécifiques seront communiqués par l'Employeur.</p>
<p>Toute heure de travail effectuée au-delà des heures normales constitue des heures supplémentaires rémunérées à 1,5× le taux horaire normal pour les deux premières heures, et à 2× au-delà ou les jours fériés (<strong>WRA s.24</strong>).</p>

<h3 style="border-top: 1px solid #ccc; padding-top: 15px; margin-top: 20px;">ARTICLE 5 — CONGÉS ANNUELS / ANNUAL LEAVE</h3>
<p>Conformément à la <strong>section 29 du WRA 2019</strong>, l'Employé(e) a droit à :</p>
<ul>
  <li><strong>15 jours ouvrables</strong> de congés annuels payés pour moins de 5 ans d'ancienneté</li>
  <li><strong>20 jours ouvrables</strong> de congés annuels payés pour 5 ans et plus d'ancienneté</li>
</ul>
<p>Les congés non pris à la fin de l'année peuvent être reportés ou compensés selon accord. Tout solde de congés sera payé à la cessation du contrat.</p>

<h3 style="border-top: 1px solid #ccc; padding-top: 15px; margin-top: 20px;">ARTICLE 6 — CONGÉ MALADIE / SICK LEAVE</h3>
<p>Conformément à la <strong>section 31 du WRA 2019</strong>, l'Employé(e) bénéficie de <strong>15 jours de congé maladie payés</strong> par année. Un certificat médical est exigé à partir du 3ème jour consécutif d'absence.</p>

<h3 style="border-top: 1px solid #ccc; padding-top: 15px; margin-top: 20px;">ARTICLE 7 — CONGÉ MATERNITÉ / PATERNITÉ</h3>
<p>Conformément au <strong>Finance Act 2024</strong> :</p>
<ul>
  <li>Congé maternité : <strong>16 semaines payées</strong> à 100% du salaire</li>
  <li>Congé paternité : <strong>4 semaines payées</strong> à 100% du salaire</li>
</ul>

<h3 style="border-top: 1px solid #ccc; padding-top: 15px; margin-top: 20px;">ARTICLE 8 — 13ÈME MOIS / END OF YEAR BONUS</h3>
<p>L'Employé(e) ayant accompli au moins <strong>8 mois de service continu</strong> au cours de l'année civile a droit à un bonus de fin d'année (13ème mois) équivalent à un mois de salaire de base, versé en décembre. Un prorata sera calculé si la durée de service est inférieure à 12 mois.</p>

<h3 style="border-top: 1px solid #ccc; padding-top: 15px; margin-top: 20px;">ARTICLE 9 — CONFIDENTIALITÉ / CONFIDENTIALITY</h3>
<p>L'Employé(e) s'engage à respecter la confidentialité de toutes les informations relatives à l'activité, aux clients, aux partenaires et aux affaires internes de l'Employeur, tant pendant la durée du contrat qu'après sa cessation, et ce sans limitation de durée pour les informations revêtant le caractère de secret commercial.</p>

<h3 style="border-top: 1px solid #ccc; padding-top: 15px; margin-top: 20px;">ARTICLE 10 — PRÉAVIS / NOTICE PERIOD</h3>
<p>Conformément à la <strong>section 49 du WRA 2019</strong>, en cas de résiliation du contrat (hors faute grave), le préavis applicable est :</p>
<ul>
  <li>Ancienneté < 2 ans : <strong>30 jours</strong></li>
  <li>Ancienneté 2 à 5 ans : <strong>60 jours</strong></li>
  <li>Ancienneté > 5 ans : <strong>90 jours</strong></li>
</ul>

<h3 style="border-top: 1px solid #ccc; padding-top: 15px; margin-top: 20px;">ARTICLE 11 — INDEMNITÉ DE FIN DE SERVICE / SEVERANCE ALLOWANCE</h3>
<p>En cas de licenciement sans faute après <strong>3 ans d'ancienneté continue</strong>, l'Employé(e) a droit à une indemnité de licenciement de <strong>3 mois de salaire par année complète d'ancienneté</strong>, conformément à la <strong>section 52 du WRA 2019</strong>.</p>

<h3 style="border-top: 1px solid #ccc; padding-top: 15px; margin-top: 20px;">ARTICLE 12 — DISCIPLINE</h3>
<p>Toute procédure disciplinaire sera conduite conformément à l'<strong>Employment Relations Act 2008 (ERA)</strong> et aux procédures internes de l'Employeur. En cas de faute grave, le contrat peut être résilié sans préavis ni indemnité, sous réserve du respect de la procédure contradictoire prévue par l'ERA.</p>

<h3 style="border-top: 1px solid #ccc; padding-top: 15px; margin-top: 20px;">ARTICLE 13 — DROIT APPLICABLE / GOVERNING LAW</h3>
<p>Le présent contrat est régi par le droit mauricien. Tout litige sera soumis à la juridiction de l'<strong>Employment Relations Tribunal (ERT)</strong> de l'île Maurice.</p>

<div style="margin-top: 50px; display: flex; justify-content: space-between;">
  <div style="width: 45%; text-align: center;">
    <p><strong>Pour l'Employeur / For the Employer</strong></p>
    <p style="color: #666; font-size: 12px;">{{societe_nom}}</p>
    <div style="height: 60px; border-bottom: 1px solid #666; margin: 20px 0;"></div>
    <p style="font-size: 12px;">Signature & Cachet / Signature & Stamp</p>
    <p style="font-size: 12px;">Date : _______________</p>
  </div>
  <div style="width: 45%; text-align: center;">
    <p><strong>L'Employé(e) / The Employee</strong></p>
    <p style="color: #666; font-size: 12px;">{{employe_nom_complet}}</p>
    <div style="height: 60px; border-bottom: 1px solid #666; margin: 20px 0;"></div>
    <p style="font-size: 12px;">Signature</p>
    <p style="font-size: 12px;">Date : _______________</p>
  </div>
</div>

<p style="margin-top: 30px; font-size: 11px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 15px;">
  Document généré le {{date_generation}} — TIBOK RH System — Conforme WRA 2019, Finance Act 2024
</p>
</div>`,

// ============================================================
// CDD — Contrat à Durée Déterminée
// ============================================================
'cdd_general': `
<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; font-size: 13px; line-height: 1.6;">
<div style="text-align:center; margin-bottom: 30px; border-bottom: 2px solid #e53e3e; padding-bottom: 20px;">
  <h1 style="font-size: 18px; text-transform: uppercase; color: #e53e3e;">CONTRAT DE TRAVAIL À DURÉE DÉTERMINÉE</h1>
  <p style="font-size: 11px; color: #666;">WRA 2019 s.17 — ⚠️ Requalification en CDI possible si conditions non respectées</p>
</div>

<div style="background: #fff5f5; border: 1px solid #e53e3e; padding: 15px; margin-bottom: 20px; border-radius: 5px;">
  <strong>⚠️ AVERTISSEMENT LÉGAL (WRA s.17) :</strong> Un CDD peut être requalifié en CDI si : (1) il est renouvelé plus d'une fois pour le même motif, (2) la durée totale dépasse 24 mois, (3) le motif précis n'est pas indiqué.
</div>

<p><strong>ENTRE :</strong></p>
<div style="background: #f8f8f8; padding: 15px; margin-bottom: 15px;">
  <strong>{{societe_nom}}</strong>, BRN {{societe_brn}}, {{societe_adresse}}, ci-après «&nbsp;l'Employeur&nbsp;»
</div>
<p style="text-align:center;"><strong>ET</strong></p>
<div style="background: #f8f8f8; padding: 15px; margin-bottom: 25px;">
  <strong>{{employe_nom_complet}}</strong>, NIC {{employe_nic}}, né(e) le {{employe_dob}}, ci-après «&nbsp;l'Employé(e)&nbsp;»
</div>

<h3>ARTICLE 1 — DURÉE ET MOTIF DU CONTRAT</h3>
<p>Le présent contrat est conclu pour une durée déterminée du <strong>{{date_debut}}</strong> au <strong>{{date_fin}}</strong>.</p>
<p><strong>Motif précis justifiant le recours au CDD (obligatoire — WRA s.17) :</strong></p>
<p style="background: #f0f0f0; padding: 10px; border-left: 3px solid #666;">{{motif_cdd}}</p>

<h3>ARTICLE 2 — POSTE ET RÉMUNÉRATION</h3>
<p>L'Employé(e) est engagé(e) en qualité de <strong>{{poste}}</strong> à <strong>{{lieu_travail}}</strong>.</p>
<p>Salaire mensuel : <strong>{{salaire_base}} MUR</strong> — conforme NMWA (min. 16 500 MUR).</p>

<h3>ARTICLE 3 — CONDITIONS DE TRAVAIL</h3>
<p>L'Employé(e) bénéficie de tous les droits prévus par le WRA 2019 (congés, maladie, heures supplémentaires) au prorata de la durée du contrat.</p>

<h3>ARTICLE 4 — FIN DE CONTRAT</h3>
<p>Le contrat prend fin de plein droit à l'échéance prévue. En cas de résiliation anticipée par l'Employeur sans motif valable, une indemnité égale aux salaires restants dus est payable (WRA s.52).</p>

<div style="margin-top: 50px; display: flex; justify-content: space-between;">
  <div style="width: 45%; text-align: center;">
    <p><strong>L'Employeur</strong></p>
    <div style="height: 60px; border-bottom: 1px solid #666; margin: 20px 0;"></div>
    <p>Date : _______________</p>
  </div>
  <div style="width: 45%; text-align: center;">
    <p><strong>L'Employé(e)</strong></p>
    <div style="height: 60px; border-bottom: 1px solid #666; margin: 20px 0;"></div>
    <p>Date : _______________</p>
  </div>
</div>
<p style="margin-top: 20px; font-size: 11px; color: #888; text-align: center;">Généré le {{date_generation}} — TIBOK RH — WRA 2019 s.17</p>
</div>`,

// ============================================================
// CONSULTANT
// ============================================================
'consultant_general': `
<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; font-size: 13px; line-height: 1.6;">
<div style="text-align:center; margin-bottom: 30px; border-bottom: 2px solid #2b6cb0; padding-bottom: 20px;">
  <h1 style="font-size: 18px; text-transform: uppercase; color: #2b6cb0;">CONTRAT DE PRESTATION DE SERVICES</h1>
  <p style="font-size: 11px; color: #666;">Contrat consultant — Absence de lien de subordination</p>
</div>

<p><strong>ENTRE :</strong> {{societe_nom}} (BRN {{societe_brn}}) — «&nbsp;le Client&nbsp;»</p>
<p><strong>ET :</strong> {{employe_nom_complet}} (NIC {{employe_nic}}) — «&nbsp;le Consultant&nbsp;»</p>

<h3>ARTICLE 1 — NATURE DE LA RELATION</h3>
<p>Le présent contrat est un contrat de prestation de services indépendant. Le Consultant intervient en qualité de <strong>prestataire indépendant</strong>, sans lien de subordination avec le Client. Le Consultant conserve la totale liberté d'organisation de son travail et de ses horaires.</p>
<p><strong>⚠️ Note légale :</strong> L'absence effective de subordination est essentielle. Toute direction, contrôle des horaires ou intégration dans les équipes peut entraîner une requalification en contrat de travail avec application du WRA 2019.</p>

<h3>ARTICLE 2 — MISSION</h3>
<p>Le Consultant est chargé de : <strong>{{poste}}</strong></p>
<p>Lieu d'intervention principal : {{lieu_travail}}</p>
<p>Durée : du {{date_debut}} {{date_fin}}</p>

<h3>ARTICLE 3 — RÉMUNÉRATION</h3>
<p>Honoraires convenus : <strong>{{salaire_base}} MUR</strong> (HT si applicable).</p>
<p>Le Consultant est seul responsable de ses obligations fiscales et sociales en tant qu'indépendant.</p>

<h3>ARTICLE 4 — CONFIDENTIALITÉ ET PROPRIÉTÉ INTELLECTUELLE</h3>
<p>Toute production intellectuelle réalisée dans le cadre de cette mission est la propriété exclusive du Client. Le Consultant s'engage à la confidentialité absolue sur les informations auxquelles il aura accès.</p>

<div style="margin-top: 50px; display: flex; justify-content: space-between;">
  <div style="width: 45%; text-align: center;"><p><strong>Le Client</strong></p><div style="height: 60px; border-bottom: 1px solid #666; margin: 20px 0;"></div><p>Date : _______________</p></div>
  <div style="width: 45%; text-align: center;"><p><strong>Le Consultant</strong></p><div style="height: 60px; border-bottom: 1px solid #666; margin: 20px 0;"></div><p>Date : _______________</p></div>
</div>
<p style="margin-top: 20px; font-size: 11px; color: #888; text-align: center;">Généré le {{date_generation}} — TIBOK RH</p>
</div>`,

// ============================================================
// CDI SANTÉ
// ============================================================
'cdi_sante': `
<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; font-size: 13px; line-height: 1.6;">
<div style="text-align:center; margin-bottom: 30px; border-bottom: 2px solid #276749; padding-bottom: 20px;">
  <h1 style="font-size: 18px; text-transform: uppercase; color: #276749;">CONTRAT DE TRAVAIL — SECTEUR SANTÉ</h1>
  <p style="font-size: 11px;">WRA 2019 + Medical Act + Medical Council of Mauritius (MCM)</p>
</div>

<p><strong>ENTRE :</strong> {{societe_nom}} (BRN {{societe_brn}}) — Établissement de santé</p>
<p><strong>ET :</strong> {{employe_nom_complet}} (NIC {{employe_nic}})</p>

<h3>ARTICLE 1 — ENGAGEMENT</h3>
<p>Engagement à compter du <strong>{{date_debut}}</strong> en qualité de <strong>{{poste}}</strong> à {{lieu_travail}}. Période d'essai : {{periode_essai}} jours (WRA s.35).</p>

<h3>ARTICLE 2 — ENREGISTREMENT PROFESSIONNEL</h3>
<p><strong>Condition suspensive obligatoire :</strong> L'entrée en fonction est subordonnée à la production d'un enregistrement valide auprès du Medical Council of Mauritius (MCM) ou du Nursing Council, selon la profession. Le défaut d'enregistrement entraîne la nullité du présent contrat.</p>

<h3>ARTICLE 3 — RÉMUNÉRATION</h3>
<p>Salaire de base : <strong>{{salaire_base}} MUR/mois</strong>. Des primes de garde, d'astreinte et de nuit sont payables selon le barème de l'établissement (WRA s.24).</p>

<h3>ARTICLE 4 — HORAIRES ET GARDES</h3>
<p>L'Employé(e) peut être amené(e) à effectuer des gardes, astreintes et travail de nuit selon les besoins du service. Les compensations légales (2× le taux normal pour travail de nuit et jours fériés) s'appliquent (WRA s.24).</p>

<h3>ARTICLE 5 — SECRET MÉDICAL ET DÉONTOLOGIE</h3>
<p>L'Employé(e) est tenu(e) au secret médical absolu concernant toutes les informations relatives aux patients, conformément au <strong>Medical Act de Maurice</strong> et au code de déontologie de sa profession. Cette obligation persiste après la cessation du contrat.</p>

<h3>ARTICLE 6 — RESPONSABILITÉ PROFESSIONNELLE</h3>
<p>L'Employé(e) doit maintenir une assurance responsabilité civile professionnelle valide. Une copie de l'attestation doit être fournie à l'Employeur.</p>

<h3>ARTICLES 7-13 (Congés, OT, Préavis, Licenciement)</h3>
<p>Identiques au CDI Général — WRA 2019 ss.29, 31, Finance Act 2024, WRA s.49, WRA s.52.</p>

<div style="margin-top: 50px; display: flex; justify-content: space-between;">
  <div style="width: 45%; text-align: center;"><p><strong>L'Employeur</strong></p><div style="height: 60px; border-bottom: 1px solid #666; margin: 20px 0;"></div><p>Date : _______________</p></div>
  <div style="width: 45%; text-align: center;"><p><strong>L'Employé(e)</strong></p><div style="height: 60px; border-bottom: 1px solid #666; margin: 20px 0;"></div><p>Date : _______________</p></div>
</div>
<p style="font-size: 11px; color: #888; text-align: center; margin-top: 20px;">Généré le {{date_generation}} — TIBOK RH — WRA 2019, Medical Act</p>
</div>`,

// CDI BPO/IT
'cdi_bpo_it': `
<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; font-size: 13px; line-height: 1.6;">
<div style="text-align:center; margin-bottom: 30px; border-bottom: 2px solid #553c9a; padding-bottom: 20px;">
  <h1 style="font-size: 18px; text-transform: uppercase; color: #553c9a;">CONTRAT DE TRAVAIL — SECTEUR BPO/IT</h1>
  <p style="font-size: 11px;">WRA 2019 + Clauses spécifiques technologie et traitement de données</p>
</div>
<p><strong>ENTRE :</strong> {{societe_nom}} (BRN {{societe_brn}}) &nbsp;&nbsp; <strong>ET :</strong> {{employe_nom_complet}} (NIC {{employe_nic}})</p>

<h3>ARTICLE 1 — ENGAGEMENT ET POSTE</h3>
<p>Engagement du <strong>{{date_debut}}</strong> au poste de <strong>{{poste}}</strong> — {{lieu_travail}}. Période d'essai : {{periode_essai}} jours.</p>

<h3>ARTICLE 2 — RÉMUNÉRATION</h3>
<p>Salaire : <strong>{{salaire_base}} MUR/mois</strong>. Prime de nuit/shift applicable selon barème (WRA s.24).</p>

<h3>ARTICLE 3 — HORAIRES ET SHIFTS</h3>
<p>Le secteur BPO peut nécessiter un travail en shifts (matin, soir, nuit) selon les besoins opérationnels. L'Employeur informera l'Employé(e) avec un préavis minimum de 48 heures de tout changement de shift. Le travail de nuit (22h-6h) est compensé à 2× le taux horaire (WRA s.24).</p>

<h3>ARTICLE 4 — BYOD & ÉQUIPEMENTS (Bring Your Own Device)</h3>
<p>L'Employé(e) peut utiliser ses équipements personnels (téléphone, laptop) pour le travail sous réserve du respect de la politique de sécurité informatique de l'Employeur. Toute donnée client ou professionnelle stockée sur équipement personnel doit être effacée en cas de cessation de contrat.</p>

<h3>ARTICLE 5 — PROPRIÉTÉ INTELLECTUELLE</h3>
<p>Toute création, développement logiciel, code, algorithme, base de données ou autre production intellectuelle réalisés dans le cadre des fonctions de l'Employé(e) sont la propriété exclusive de l'Employeur, conformément au <strong>Copyright Act de Maurice</strong>. Cette propriété s'étend aux créations réalisées en dehors des heures de travail si elles utilisent les ressources ou informations de l'Employeur.</p>

<h3>ARTICLE 6 — CONFIDENTIALITÉ ET NDA</h3>
<p>L'Employé(e) s'engage à la confidentialité absolue sur : (a) les données des clients, (b) les processus et procédures internes, (c) les informations commerciales et techniques, (d) les données personnelles traitées (conformément au <strong>Data Protection Act 2017</strong>). Cette obligation est sans limitation de durée.</p>

<h3>ARTICLE 7 — NON-CONCURRENCE</h3>
<p>Pendant 12 mois après la cessation du contrat, l'Employé(e) s'engage à ne pas travailler pour un concurrent direct opérant dans le même secteur BPO/IT à Maurice, ni à démarcher les clients de l'Employeur. Cette clause est limitée géographiquement à l'île Maurice.</p>

<h3>ARTICLES 8-13 (Congés, Préavis, Licenciement)</h3>
<p>Identiques au CDI Général — WRA 2019 ss.29, 31, Finance Act 2024, WRA s.49, WRA s.52.</p>

<div style="margin-top: 50px; display: flex; justify-content: space-between;">
  <div style="width: 45%; text-align: center;"><p><strong>L'Employeur</strong></p><div style="height: 60px; border-bottom: 1px solid #666; margin: 20px 0;"></div><p>Date : _______________</p></div>
  <div style="width: 45%; text-align: center;"><p><strong>L'Employé(e)</strong></p><div style="height: 60px; border-bottom: 1px solid #666; margin: 20px 0;"></div><p>Date : _______________</p></div>
</div>
<p style="font-size: 11px; color: #888; text-align: center; margin-top: 20px;">Généré le {{date_generation}} — TIBOK RH — WRA 2019, Data Protection Act 2017</p>
</div>`

};
