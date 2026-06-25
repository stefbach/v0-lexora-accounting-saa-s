/**
 * Centralized help content for Lexora — every important page has an entry
 * here, displayed via the <PageHelp /> component (sober drawer).
 *
 * Philosophy : the user opens a page in Lexora and clicks the "Aide" button
 * in the header. They get a clear, didactic explanation : what is this page
 * for, how to use it step-by-step, common pitfalls, and links to external
 * sites (MRA portal, banque, etc.) when applicable.
 *
 * Language : French (Mauritius), tutoiement, ton pro mais accessible.
 * Cible : du dirigeant de TPE qui découvre la compta au DAF d'un grand groupe.
 */

export type HelpExternalLink = {
  label: string
  url: string
  description?: string
}

export type HelpStep = {
  title: string
  body: string             // can include simple <b>, <em> tags
  warning?: string         // optional inline warning
}

export type HelpEntry = {
  /** Page title shown at the top of the drawer */
  title: string
  /** Audience : 'comptable' (cabinet), 'client', 'all' */
  audience: 'comptable' | 'client' | 'all'
  /** Short paragraph : à quoi sert cette page */
  intro: string
  /** Steps to use the page */
  steps: HelpStep[]
  /** Pièges courants — concise warnings */
  pitfalls?: string[]
  /** Liens externes vers MRA, banque, etc. */
  externalLinks?: HelpExternalLink[]
  /** Astuces / raccourcis avancés */
  tips?: string[]
  /** Lien optionnel vers documentation longue */
  docUrl?: string
  /** Vidéo tutoriel optionnelle */
  videoUrl?: string
}

/**
 * Clés = chemin de la page (sans query string).
 * Pour le matching, on essaye d'abord le chemin exact, puis on remonte
 * (ex: /comptable/tva/123 → fallback /comptable/tva).
 */
export const HELP_CONTENT: Record<string, HelpEntry> = {
  // ========================================================================
  // RACINE CLIENT — PARCOURS D'ONBOARDING COMPLET
  // ========================================================================
  '/client': {
    title: "Espace client — onboarding et vue d'ensemble",
    audience: 'client',
    intro:
      "Bienvenue dans Lexora, ta plateforme de comptabilité, RH et fiscalité pour Maurice. Cette page t'oriente que tu sois dirigeant de TPE qui découvre la compta, comptable d'un cabinet, ou DAF d'un groupe à plusieurs sociétés. Tout ce que la loi mauricienne t'oblige à faire (VAT Act 1998, Income Tax Act 1995, Workers Rights Act 2019, Companies Act 2001, FSC pour GBC) est automatisé ici — il te reste à valider et payer.",
    steps: [
      {
        title: "1. Crée ton compte Lexora",
        body:
          "Va sur <b>lexora.finance</b>, clique <b>S'inscrire</b>, renseigne email + mot de passe. Tu reçois un lien de confirmation. Une fois validé, tu arrives sur ton espace vide : c'est normal, tu vas tout configurer en 30 minutes.",
      },
      {
        title: "2. Crée ta première société",
        body:
          "Menu <b>Paramètres → Mes sociétés → Nouvelle</b>. Renseigne <b>BRN</b> (Business Registration Number, 9 chiffres délivrés par le CBRD), <b>TAN</b> (Tax Account Number MRA, 1 lettre + 9 chiffres), <b>numéro VAT</b> si déjà enregistré, secteur d'activité, devise (MUR par défaut), date d'exercice (juillet à juin classique, ou janvier à décembre).",
        warning:
          "Pas encore de numéro VAT ? Pas grave, tu peux le rajouter plus tard quand tu l'auras obtenu (voir la fiche d'aide TVA pour la procédure).",
      },
      {
        title: "3. Configure tes coordonnées de facturation",
        body:
          "Menu <b>Paramètres → Facturation</b>. Upload ton logo, vérifie l'adresse affichée sur les factures, ajoute ton <b>IBAN MUR</b> (et IBAN devises si tu factures en USD/EUR), définis tes conditions de paiement par défaut (30 jours net classique) et personnalise les mentions légales.",
      },
      {
        title: "4. Connecte tes banques (scraping automatique)",
        body:
          "Menu <b>Direction → Accès Bancaires</b>. Saisis tes identifiants Internet Banking (MCB, SBM, ABC, MauBank, AfrAsia, Bank One). Lexora chiffre AES-256-GCM et récupère solde + transactions chaque nuit à 02:00 UTC. Tu n'as plus jamais à télécharger un relevé.",
        warning:
          "Si ta banque a un 2FA OTP obligatoire, désactive-le pour ce profil ou crée un sous-utilisateur lecture seule dédié à Lexora.",
      },
      {
        title: "5. Configure ton accès MRA",
        body:
          "Menu <b>Direction → Accès MRA</b>. Saisis ton username + password de <b>eservices.mra.mu</b>. Le robot Playwright pourra soumettre automatiquement TVA, PAYE, CSG/NSF, TDS, CIT. Si tu préfères soumettre toi-même, tu peux laisser cette section vide — Lexora te générera quand même les fichiers CSV/XML.",
      },
      {
        title: "6. Importe tes employés",
        body:
          "Menu <b>RH → Employés → Importer</b> (CSV) ou saisie un par un. Pour chaque employé : prénom, nom, date d'arrivée, salaire de base, IBAN, type de contrat (CDI/CDD), CSG cat. A ou B. Lexora calculera automatiquement PAYE, NSF, CSG, PRGF, congés, severance selon le <b>Workers Rights Act 2019</b>.",
      },
      {
        title: "7. Connecte Telegram (recommandé)",
        body:
          "Menu <b>Mon Profil → Telegram</b>. Génère un code 6 caractères, ouvre <b>@LexoraAgent_bot</b> sur ton téléphone et tape <b>/start CODE</b>. Tu peux désormais : prendre en photo une facture fournisseur → Lexora la saisit, demander \"point matinal\", déclarer la TVA, valider une paie. Tout depuis ton mobile.",
      },
      {
        title: "8. Commence à scanner tes documents",
        body:
          "Menu <b>Documents → Importer</b>, ou photo via Telegram, ou email forwarding vers documents@ton-tenant.lexora.finance. L'<b>OCR IA Claude</b> identifie : facture fournisseur, relevé bancaire, contrat, ticket. Pour les factures, il extrait fournisseur, date, montants HT/TVA/TTC, propose un compte comptable. Tu valides en 1 clic.",
      },
      {
        title: "9. Émets tes premières factures clients",
        body:
          "Menu <b>Ventes → Nouvelle facture</b>. Choisis le client (créé à la volée), ajoute les lignes, Lexora calcule TVA 15% et TTC. Émets → PDF généré, numéro auto attribué (préfixe + AAAA-NNNNN), écritures classe 4/7 passées, envoi par email au client en option.",
      },
      {
        title: "10. Pilote depuis le tableau de bord",
        body:
          "Menu <b>Tableau de bord</b>. Tu vois trésorerie en temps réel, CA, dépenses, résultat, alertes (échéances MRA J-7, factures en retard, documents en attente). Drill-down sur chaque indicateur pour le détail.",
      },
      {
        title: "11. Échéances MRA gérées automatiquement",
        body:
          "Le 5 du mois suivant, Lexora prépare TVA, PAYE, CSG/NSF, TDS. Le bot Telegram t'envoie : <em>\"TVA mai 2026 prête : 247 500 MUR à payer avant le 20\"</em> avec lien direct. Tu valides → robot soumet → reste à payer par virement. Pénalités évitées.",
      },
      {
        title: "12. Scale aux grands groupes",
        body:
          "Si tu gères 5, 50 ou 500 sociétés : sélecteur multi-sociétés en haut, consolidation IFRS 10 dans Outils → Consolidation, équipe et assignations par client dans Cabinet → Équipe. Telegram supporte plusieurs sociétés actives avec commande <b>/societe</b>.",
      },
    ],
    pitfalls: [
      "Renseigner un BRN ou TAN incorrect → tes déclarations MRA seront rejetées. Vérifie 2 fois lors de la création de la société.",
      "Oublier de valider l'email d'inscription → tu ne peux pas te connecter, le lien expire après 24h.",
      "Saisir un IBAN avec espaces ou tirets → certains champs n'acceptent que l'IBAN brut (26 caractères Maurice). Lexora nettoie auto mais vérifie.",
      "Ne pas activer Telegram → tu rates les rappels d'échéances et la saisie photo. C'est gratuit, fais-le.",
      "Mélanger deux sociétés sur un même compte bancaire → Lexora classe mal les transactions. Un compte = une société.",
    ],
    externalLinks: [
      { label: "Inscription Lexora", url: "https://lexora.finance/signup", description: "Création de compte (gratuit pendant l'essai)." },
      { label: "Corporate and Business Registration Department (CBRD)", url: "https://onlinebrd.govmu.org/", description: "Obtenir BRN, déposer Annual Return." },
      { label: "MRA — Portail eServices", url: "https://eservices.mra.mu", description: "Toutes les déclarations fiscales (VAT, PAYE, CIT, TDS)." },
      { label: "FSC Mauritius", url: "https://www.fscmauritius.org", description: "Régulateur GBC, AC, Investment Dealer." },
      { label: "Bot Telegram Lexora", url: "https://t.me/LexoraAgent_bot", description: "Lie ton compte une fois et tout est pilotable mobile." },
    ],
    tips: [
      "Raccourci clavier <b>?</b> sur n'importe quelle page ouvre l'aide contextuelle.",
      "Le bouton d'aide flottant en bas à droite t'explique chaque page que tu visites — clique dessus systématiquement les premières semaines.",
      "Pour les groupes > 10 sociétés, demande à activer le mode <b>Cabinet</b> qui ajoute portfolio, assignations collaborateurs et facturation interne.",
      "Multinationales > 50 sociétés : active <b>Outils → Consolidation IFRS 10</b> pour générer les comptes consolidés automatiquement avec élimination des intra-groupe.",
      "Comptable indépendant qui gère plusieurs PME : utilise le tableau de bord cabinet pour avoir tous tes clients en un écran.",
    ],
  },

  // ========================================================================
  // FISCALITÉ — TVA (page critique, traitée au max)
  // ========================================================================
  '/comptable/tva': {
    title: 'Déclaration TVA — Maurice (VAT Act 1998)',
    audience: 'comptable',
    intro:
      "La TVA mauricienne (Value Added Tax, taux standard <b>15%</b>) est régie par le VAT Act 1998. Toute entreprise dont le CA dépasse <b>6 millions MUR</b> sur 12 mois glissants DOIT s'enregistrer et collecter la TVA. Cette page consolide automatiquement la TVA collectée (factures clients) et déductible (factures fournisseurs) pour la période, calcule le solde à payer ou à reporter, et génère les fichiers Schedule A / B / VAT3 / VAT4 à charger sur eservices.mra.mu avant le 20 du mois suivant.",
    steps: [
      {
        title: "1. Comprends qui doit s'enregistrer",
        body:
          "Obligatoire si <b>CA annuel ≥ 6 M MUR</b>, ou si activité listée Schedule 4 du VAT Act (services pro : avocats, comptables, architectes, ingénieurs, médecins... sans seuil). Importateurs : TVA payée à la douane sur la valeur CIF. Volontaire possible en dessous du seuil si tu as beaucoup de TVA déductible (export, B2B).",
      },
      {
        title: "2. Obtiens ton numéro VAT (si pas encore fait)",
        body:
          "Va sur <b>eservices.mra.mu → VAT Registration</b>. Formulaire <b>VAT3</b> avec pièces : BRN certificate (CBRD), contrat de bail/titre de propriété du siège, statuts, CIN du dirigeant + KYC, prévisionnel de CA. Délai MRA : <b>10 à 15 jours ouvrés</b>. Tu reçois ton VATRN (VAT Registration Number) format VAT + 8 chiffres.",
        warning:
          "Tant que tu n'as pas le VATRN, tu ne peux PAS facturer avec TVA. Si tu le fais quand même, tu dois reverser au MRA sans pouvoir déduire.",
      },
      {
        title: "3. Connais les taux et exonérations",
        body:
          "<b>15%</b> = standard (la majorité). <b>0%</b> (zero-rated) = exportations, transport international, certains produits Schedule 2. <b>Exonéré</b> (exempt) Schedule 1 = riz, farine, médicaments essentiels, éducation, services bancaires, location logement résidentiel, soins médicaux. <b>Différence cruciale</b> : zero-rated permet la déduction amont, exempt non.",
      },
      {
        title: "4. Choisis ta fréquence",
        body:
          "<b>Mensuelle (VAT3)</b> obligatoire si CA > 10 M MUR/an. <b>Trimestrielle (VAT4)</b> sinon. Dans Lexora : Paramètres société → Régime VAT. La sélection affecte le calendrier d'échéances et le format de fichier.",
      },
      {
        title: "5. Lexora calcule automatiquement",
        body:
          "À partir des factures clients (TVA collectée) et fournisseurs (TVA déductible), Lexora calcule par taux et par compte : base 15%, base 0%, base exempt, TVA collectée, TVA déductible (avec règle de prorata si activité mixte), TVA à payer ou crédit reportable. Tu vois le détail facture par facture en cliquant sur chaque ligne.",
        warning:
          "Une facture en <b>brouillon</b> n'est PAS comptée — émets-les avant clôture. Une facture en devise est convertie au taux MRA du jour de facturation (IAS 21).",
      },
      {
        title: "6. Gère les cas particuliers",
        body:
          "<b>Reverse charge</b> (section 21A) sur services importés de non-résidents : tu auto-liquides la TVA (15% collectée + 15% déductible si activité taxable). <b>Importation marchandises</b> : TVA payée en douane apparaît dans Schedule B. <b>GBC Partial Exemption</b> : prorata 80% deemed inputs. <b>Vente immobilier</b> : exempt sauf neuf < 5 ans (15%).",
      },
      {
        title: "7. Génère les fichiers MRA",
        body:
          "Onglet <b>Export MRA</b> : Lexora produit <b>Schedule A</b> (ventes détaillées CSV), <b>Schedule B</b> (achats CSV), <b>VAT3.xml</b> ou <b>VAT4.xml</b> (récap). Vérifie le récap PDF avant d'envoyer (totaux par taux, ratio TVA/CA, comparaison vs mois précédent).",
      },
      {
        title: "8. Soumets sur eservices.mra.mu",
        body:
          "Connecte-toi avec TAN + password. Menu <b>VAT → Submit Return</b>. Choisis la période. Charge les CSV Schedule A et B. Charge le XML récap. Vérifie les totaux pré-remplis (montant à payer en bas). Clique <b>Submit</b>. Tu reçois un accusé avec référence MRA.",
        warning:
          "Échéance stricte : <b>20 du mois suivant</b>. Au-delà : pénalité <b>5% du montant dû</b> + <b>0,5% par mois</b> d'intérêts. La MRA bloque le portail le soir du 20 à 23h59.",
      },
      {
        title: "9. Paie le solde",
        body:
          "Virement bancaire <b>MCB-MRA Real-Time</b> ou <b>SBM-MRA</b> ou Internet Banking standard avec référence MRA (TAN + période). Délai 1 jour ouvré. Tu peux aussi payer via portail MRA en débit direct. Marque la déclaration <b>payée</b> dans Lexora une fois fait pour qu'elle disparaisse des alertes.",
      },
      {
        title: "10. Automatisation totale via Telegram",
        body:
          "Si tu as configuré <b>Direction → Accès MRA</b>, demande au bot : <em>\"soumets la TVA de mai\"</em>. Le robot Playwright se connecte à eservices.mra.mu, charge les fichiers, valide, t'envoie l'accusé MRA en PJ Telegram. Tu n'as plus qu'à payer.",
      },
    ],
    pitfalls: [
      "Oublier une facture fournisseur (PDF resté dans la boîte mail) → tu perds 15% de TVA déductible. Scanne tous tes docs avant le 5 du mois.",
      "Mauvais taux sur une ligne facture (0% au lieu de 15%) → minoration TVA collectée → contrôle MRA + redressement + 5% pénalité.",
      "Oublier le reverse charge sur facture étrangère (ex: AWS, Google Ads, conseils étrangers) → MRA recalcule à 15% + pénalité. Lexora flagge automatiquement les fournisseurs non-résidents.",
      "Facturer avec TVA sans avoir le VATRN → infraction grave, amende jusqu'à 200 000 MUR + reversement intégral.",
      "Période non verrouillée côté Lexora → des modifications après dépôt désynchronisent. Verrouille via <b>Compta → Clôtures</b>.",
      "Oublier de marquer une facture export comme <b>zero-rated</b> avec justificatif douane → MRA refuse le 0%, applique 15%.",
    ],
    externalLinks: [
      { label: "MRA — Portail eServices (login + dépôt)", url: "https://eservices.mra.mu", description: "Page de connexion pour soumettre la déclaration." },
      { label: "MRA — Inscription VAT (formulaire VAT1)", url: "https://www.mra.mu/index.php/eservices/value-added-tax-vat", description: "Comment obtenir un VATRN pour la première fois." },
      { label: "VAT Act 1998 — texte intégral", url: "https://www.mra.mu/download/VATAct.pdf", description: "Loi applicable, Schedules 1 à 5." },
      { label: "MRA — Guide pratique VAT", url: "https://www.mra.mu/download/VATGuide.pdf", description: "Tous les taux, cas particuliers, exemples." },
      { label: "MRA — Taux de change officiels", url: "https://www.mra.mu/index.php/exchange-rates", description: "Pour factures en devise (IAS 21)." },
      { label: "MRA Helpdesk VAT", url: "https://www.mra.mu/index.php/contact-us", description: "Pour question taux, exemption, contentieux." },
    ],
    tips: [
      "Active les rappels Telegram J-7 / J-3 / J-1 pour TVA — tu reçois un message mobile avec montant et lien direct.",
      "Pour les multinationales : utilise <b>Outils → Export consolidé VAT</b> pour générer les fichiers de toutes tes sociétés mauriciennes en un seul ZIP.",
      "Si tu es au-dessus de 100 M MUR de CA, demande à MRA le statut <b>Large Taxpayer</b> — interlocuteur dédié, délais étendus possibles en cas de force majeure.",
      "Les écritures TVA sont passées automatiquement : 4456 TVA déductible, 4457 TVA collectée, 4455 TVA à décaisser. Vérifie dans le grand-livre.",
      "Pour les sociétés export pures (zero-rated), tu auras systématiquement un <b>crédit de TVA</b> remboursable. Demande remboursement annuel via formulaire MRA VAT22.",
    ],
  },

  // ========================================================================
  // RH — PAIE + DÉCLARATIONS PAYE/CSG/NSF/PRGF (page critique)
  // ========================================================================
  '/rh/paie': {
    title: 'Paie mensuelle + Déclarations MRA (PAYE, CSG, NSF, PRGF)',
    audience: 'comptable',
    intro:
      "Cycle de paie complet : variables → calcul → bulletins → comptabilisation → virements salaires → déclarations sociales MRA. Lexora applique automatiquement le barème <b>PAYE 2025-2026</b> (5 tranches de 0% à 20%), la <b>CSG</b> (Contribution Sociale Généralisée, 1,5% ou 3% employé + employeur selon catégorie), le <b>NSF</b> (National Savings Fund, 2,5% employeur + 1% employé plafonné à 19 700 MUR), le <b>PRGF</b> (Portable Retirement Gratuity Fund, 4,5% employeur). Échéance MRA : <b>20 du mois suivant</b>.",
    steps: [
      {
        title: "1. Pré-requis : employés à jour",
        body:
          "Avant calcul, vérifie dans <b>RH → Employés</b> : salaire de base, IBAN, CIN, NID, catégorie CSG (A ≤ 50 000 MUR ou B > 50 000), date d'arrivée. Un IBAN manquant met l'employé dans le fichier <em>SANS_BANQUE</em>.",
      },
      {
        title: "2. Saisis les variables du mois",
        body:
          "Onglet <b>Variables</b> : heures supplémentaires (1.5x les 10 premières heures hebdo, 2x au-delà ou dimanche/férié — WRA s.18), primes, commissions, indemnités transport, absences non justifiées, congés sans solde. Saisie directe ou via Telegram : <em>\"Jean 8h OT 1.5x mai\"</em>.",
      },
      {
        title: "3. Lance le calcul",
        body:
          "Bouton <b>Calculer le mois</b>. Pour chaque employé Lexora calcule : brut (base + OT + primes), abattements (IET 325 000 MUR/an, dépendants), <b>PAYE</b> (0/10/12,5/15/17,5/20% par tranches), <b>NSF</b> (1% salarié + 2,5% employeur sur tranche jusqu'à 19 700 MUR), <b>CSG</b> (cat. A : 1,5%/3% ; cat. B : 3%/6%), <b>PRGF</b> (4,5% employeur), net à payer.",
      },
      {
        title: "4. Vérifie les bulletins",
        body:
          "Onglet <b>Bulletins</b> : liste avec brut, retenues, net. Compare avec le mois précédent : variation > 10% est flaggée. Clique sur un bulletin pour voir le détail PAYE par tranche, base CSG, base NSF.",
        warning:
          "Si un net est négatif (ex : trop d'avances), corrige avant de valider sinon le virement échoue.",
      },
      {
        title: "5. Valide les bulletins",
        body:
          "Clique <b>Valider</b> sur chaque bulletin (ou <b>Tout valider</b>). Le bulletin devient officiel : PDF généré, envoyé par email à l'employé, copie dans <b>Documents → Bulletins</b>.",
      },
      {
        title: "6. Verrouille la période",
        body:
          "Bouton <b>Verrouiller mai 2026</b>. Action critique : comptabilisation automatique (compte 6411 Salaires brut, 4310 Personnel net, 4311 PAYE due, 4312 NSF due, 4313 CSG due, 4314 PRGF due) + plus aucune modification possible.",
        warning:
          "Action destructive. Demande validation à un second œil. Via Telegram, le bot demande confirmation explicite avec récap chiffré.",
      },
      {
        title: "7. Génère les virements salaires",
        body:
          "Onglet <b>Exports → Virements salaires</b>. Un CSV par banque bénéficiaire (MCB, SBM, ABC…) au format SCT XML ou CSV propriétaire selon banque. Charge sur Internet Banking → <em>Bulk Payment</em> → exécute.",
      },
      {
        title: "8. Génère les fichiers MRA",
        body:
          "Onglets <b>PAYE-MRA</b>, <b>CSG/NSF-MRA</b>, <b>PRGF-MRA</b>. Pour chacun : récap PDF + CSV employé par employé. Le format CSV est strict (header obligatoire, colonnes ordre fixe, NID 14 chiffres).",
      },
      {
        title: "9. Soumets sur eservices.mra.mu",
        body:
          "Connecte-toi avec TAN MRA. Menu <b>PAYE → Monthly Return</b> : charge le CSV PAYE. <b>CSG/NSF</b> : charge le CSV combiné. <b>PRGF</b> : module séparé. Vérifie totaux, valide, note les références.",
        warning:
          "Échéance <b>20 du mois suivant</b>. Pénalité 5% + intérêts au-delà.",
      },
      {
        title: "10. Paie les charges",
        body:
          "Solde à payer = PAYE retenue + CSG (part employée + employeur) + NSF (part employée + employeur) + PRGF. Virement à MRA avec référence TAN + période. Une fois fait, marque <b>payée</b> dans Lexora.",
      },
      {
        title: "11. Automatisation totale Telegram",
        body:
          "Workflow piloté du téléphone : <em>\"calcule la paie de mai\"</em> → <em>\"verrouille\"</em> → <em>\"génère les virements\"</em> → <em>\"soumets PAYE CSG NSF\"</em>. Le bot confirme chaque étape destructive et t'envoie les accusés MRA en PJ.",
      },
    ],
    pitfalls: [
      "Mauvaise catégorie CSG (A vs B) → toutes les retenues sont fausses. Cat A = ≤ 50 000 MUR/mois, cat B = > 50 000.",
      "Période non verrouillée → comptabilisation manquante, déclarations MRA incohérentes avec compta, alerte audit.",
      "IBAN manquant sur un employé → il apparaîtra dans 'SANS_BANQUE', à virer manuellement (perte de temps).",
      "Oubli d'une heure sup ou prime → bulletin sous-évalué, employé mécontent, risque litige Industrial Court.",
      "NSF : ne pas plafonner à 19 700 MUR → tu sur-cotises et tu paies trop.",
      "Oublier PRGF → infraction depuis 2020. 4,5% sur tout employé du privé (sauf si pension privée équivalente).",
      "Soumission MRA après 20 du mois → pénalité automatique 5% sur chaque ligne (PAYE, CSG, NSF, PRGF séparément).",
    ],
    externalLinks: [
      { label: "MRA — Portail eServices (PAYE, CSG, NSF)", url: "https://eservices.mra.mu", description: "Soumission des déclarations mensuelles." },
      { label: "MRA — Calculateur PAYE officiel", url: "https://www.mra.mu/index.php/individuals/calculate-your-paye", description: "Pour vérifier un cas particulier." },
      { label: "MRA — Income Tax Act 1995", url: "https://www.mra.mu/download/ITAct.pdf", description: "Base légale du PAYE." },
      { label: "Workers Rights Act 2019", url: "https://labour.govmu.org/Documents/Legislations/WRA2019.pdf", description: "OT, congés, severance, EOY bonus." },
      { label: "NSF — Mauritius Revenue Authority", url: "https://www.mra.mu/index.php/employees/nsf", description: "Taux et plafond National Savings Fund." },
      { label: "CSG — MRA", url: "https://www.mra.mu/index.php/employees/csg", description: "Catégories A et B." },
      { label: "PRGF — Portable Retirement Gratuity Fund", url: "https://www.prgf.mu", description: "Régime obligatoire 4,5% depuis 2020." },
    ],
    tips: [
      "Active la validation à 2 yeux pour paies > 1 M MUR via Permissions Bot — direction confirme avant verrouillage.",
      "Pour les groupes : Lexora gère la paie multi-sociétés avec virement consolidé depuis un compte central et refacturation intra-groupe.",
      "Bulletins individuels accessibles par l'employé via portail Lexora ou Telegram (commande <b>/bulletin</b>).",
      "Le bot fait un rappel J-7 / J-3 / J-1 de l'échéance MRA avec montant à payer.",
      "Si tu as > 100 salariés, demande à MRA le module e-Filing direct (API) — économise du temps de soumission.",
    ],
  },

  // ========================================================================
  // BANQUE — CREDENTIALS
  // ========================================================================
  '/client/direction/bank-credentials': {
    title: 'Accès Bancaires — Scraping automatique nocturne',
    audience: 'client',
    intro:
      "Configure les identifiants Internet Banking pour que Lexora rapatrie automatiquement soldes et transactions chaque nuit à 02:00 UTC. Credentials chiffrées <b>AES-256-GCM</b> — personne ne peut les lire en clair, pas même un admin Lexora. <b>État actuel</b> : <em>MCB activé</em>. SBM, ABC, MauBank, MyT Money, AfrAsia, Bank One : préparés, activation au cas par cas (les sélecteurs CSS de leur Internet Banking doivent être validés une fois — durée ~30 min par banque). En attendant, upload manuel CSV/MT940 supporté via <em>Comptes bancaires → Importer relevé</em>.",
    steps: [
      { title: "1. Vérifie que la banque est activée", body: "Aujourd'hui : <b>MCB ✅</b>. Autres banques : code prêt, sélecteurs à mapper (étape one-shot). Si ta banque n'est pas activée et que tu en as besoin, contacte le support — activation en 24-48h." },
      { title: "2. Récupère tes identifiants", body: "MCB : Username + Password (+ PIN secondaire pour comptes business). Évite un compte avec 2FA SMS forcé : Lexora demande l'OTP via Telegram au moment du scrape, mais le flow auto OTP n'est pas encore livré.", warning: "<b>Crée idéalement un sous-utilisateur lecture seule</b> dédié à Lexora — pas de pouvoir d'initier des paiements." },
      { title: "3. Crée un user lecture seule (recommandé)", body: "Sur ton Internet Banking : <b>User Management → Create User</b>. Rôle <em>View Only</em>. Ce user voit soldes et historique sans pouvoir initier paiement. Sécurité maximale en cas de compromission des credentials Lexora." },
      { title: "4. Saisis dans Lexora", body: "Pour chaque compte de la société, clique <b>Configurer</b>. Renseigne username, password, PIN secondaire si applicable, et le compte bancaire Lexora associé. Chiffrement AES-256-GCM côté serveur avant écriture en base." },
      { title: "5. Active le scraping", body: "Coche <b>Scraping automatique activé</b>. Worker Playwright tourne tous les jours à <b>02:00 UTC</b> (06:00 heure Maurice) et récupère solde + transactions de J-1." },
      { title: "6. Lance un scrape de test", body: "Bouton <b>Scraper maintenant</b>. Robot tente la connexion (~30-60s). Trois résultats possibles : <em>OK</em> (solde + transactions injectées), <em>manual_needed</em> (OTP/CAPTCHA détecté → screenshot envoyé sur Telegram, soumets l'OTP manuellement), <em>failed</em> (password invalide ou banque bloquée)." },
      { title: "7. Surveille les anomalies", body: "Bot Telegram alerte si : solde scrapé diffère > 5% du Lexora, variation > 30% en 24h, transaction > 1 M MUR, login échec 3x consécutifs. Stockage anomalies dans <code>bank_scrape_anomalies</code> pour audit." },
      { title: "8. Maintenance trimestrielle", body: "Si tu changes ton mot de passe banque (forcé tous les 90j par MCB Business), mets-le aussi ici sinon scraping en échec quotidien." },
    ],
    pitfalls: [
      "Changer le password banque sans MAJ Lexora → scraping en échec quotidien.",
      "Sessions concurrentes : si tu es connecté manuellement à 02:00 UTC, certaines banques déconnectent le robot.",
      "PIN secondaire MCB Business expire tous les 90j — mets une note dans Notes pour t'en souvenir.",
      "Compte ouvert depuis moins de 30j → accès web souvent bloqué par défaut, attends activation.",
      "Mauvais sous-compte associé dans Lexora → transactions injectées sur le mauvais compte comptable, rapprochement faussé.",
      "Les CGU MCB peuvent restreindre l'automation. Tu autorises Lexora comme agent — vérifie avec ton chargé d'affaires que c'est conforme à ton contrat.",
    ],
    externalLinks: [
      { label: "MCB Internet Banking", url: "https://ibank.mcb.mu" },
      { label: "SBM Internet Banking", url: "https://internetbanking.sbmgroup.mu" },
      { label: "ABC Banking", url: "https://www.abcbank.mu" },
      { label: "MauBank Online", url: "https://internetbanking.maubank.mu" },
      { label: "AfrAsia Bank", url: "https://www.afrasiabank.com" },
      { label: "Bank One", url: "https://www.bankone.mu" },
    ],
    tips: [
      "Déclenche un scrape ponctuel depuis Telegram (rôle Direction) : <em>\"scrape MCB compte courant\"</em>.",
      "Les transactions scrapées alimentent automatiquement le rapprochement bancaire (règles R1-R7, cf. skill lexora-rapprochement-rules).",
      "Pour les groupes : configure une fois par société, scraping en parallèle sans limite.",
      "Si MCB demande un OTP (cas standard), le scraper passe en mode <em>manual_needed</em>, capture un screenshot et envoie une notif Telegram. Tu reçois l'OTP par SMS, tu te connectes manuellement la première fois pour autoriser l'appareil, ensuite les scrapes suivants peuvent passer sans OTP.",
      "Fallback toujours dispo : upload manuel CSV/MT940 dans <em>Comptes bancaires → Importer relevé</em> si le scraping échoue.",
    ],
  },

  // ========================================================================
  // MRA CREDENTIALS
  // ========================================================================
  '/client/direction/mra-credentials': {
    title: 'Accès MRA — Robot de soumission automatique',
    audience: 'client',
    intro:
      "Configure les identifiants des portails <b>MRA eServices</b>. MRA Maurice n'a PAS un portail unique : VAT, CIT, PAYE, CSG/NSF, TDS, PRGF passent chacun par leur propre URL (eservices3, eservices38, eservices). Lexora gère ces multiples portails de manière transparente. Robot Playwright soumet à ta place. Credentials chiffrés AES-256-GCM, illisibles même par admin Lexora. Compatible toutes sociétés (résidentes, GBC, AC).",
    steps: [
      { title: "1. Vérifie ton TAN", body: "Le <b>TAN</b> (Tax Account Number) format <code>X12345678</code> est attribué à l'incorporation. Visible sur tes correspondances MRA. Sans TAN, aucune déclaration ne peut être déposée." },
      { title: "2. Crée le compte eServices", body: "Sur <b>eservices.mra.mu</b> → <b>Register</b> : TAN + email + téléphone + OTP SMS. Active les modules <b>VAT</b>, <b>PAYE</b>, <b>CIT</b>, <b>TDS</b> dans <em>Profile → Services</em>." },
      { title: "3. Saisis dans Lexora", body: "Username (souvent le TAN), password, et TAN explicite si différent. Chiffrement serveur AES-256-GCM avant écriture en base. Lecture en clair impossible même par admin Lexora." },
      { title: "4. Active la soumission auto", body: "Coche <b>Soumission automatique active</b>. Demande au bot Telegram : <em>\"soumets la PAYE de mai\"</em> → robot Playwright se connecte au bon portail MRA selon le type → upload du fichier généré par Lexora → screenshot de l'accusé → tu reçois la confirmation Telegram en quelques secondes.", warning: "<b>Si MRA déclenche un CAPTCHA ou OTP</b> : le robot retourne <em>manual_needed</em>, capture un screenshot et l'envoie sur Telegram. Tu finalises la soumission à la main." },
      { title: "5. Teste la connexion", body: "Bouton <b>Tester</b>. Robot se connecte (~20s) au portail VAT (cas le plus stable) et liste les obligations en cours. Si succès : OK + returns due. Si échec : message précis (password expired, locked, captcha, etc.) avec screenshot." },
      { title: "6. Historique des soumissions", body: "Onglet Historique : chaque tentative avec date, type, période, montant, référence MRA, screenshot de l'accusé ou de l'erreur. Recherche par référence pour audit. Conservation 7 ans (mig 248)." },
      { title: "7. Renouvelle le password tous les 90j", body: "MRA force le changement tous les 90j. Bot t'alerte 7j avant. Change d'abord sur MRA, PUIS mets à jour le password ici. Sinon toutes les soumissions auto échouent dès le J+1 du changement." },
    ],
    pitfalls: [
      "Password MRA expiré → toutes les soumissions auto échouent silencieusement jusqu'à mise à jour.",
      "Modules VAT/PAYE/CIT/TDS non activés sur eServices → erreur <em>Service not available</em>. Active-les dans Profile avant le 1er run.",
      "3 échecs login consécutifs → MRA bloque le compte 30 min. Le robot respecte un cooldown automatique pour éviter ça.",
      "Compte créé par un ex-comptable parti → password inconnu. Demande reset via MRA helpdesk avec lettre du dirigeant.",
      "2FA OTP activé sans prévenir Lexora → robot bloqué à l'étape SMS, status <em>manual_needed</em> systématique.",
      "L'usage d'un robot pour soumissions MRA peut être encadré. Pour les cabinets fiscalement agréés, l'agrément <b>MNS</b> donne accès à des APIs officielles plus robustes — discute-en avec ton expert-comptable.",
    ],
    externalLinks: [
      { label: "MRA eServices (central)", url: "https://eservices.mra.mu", description: "Portail principal — login, profile, services." },
      { label: "MRA VAT Return", url: "https://eservices3.mra.mu/vatreturn/", description: "Soumission TVA — portail dédié." },
      { label: "MRA Central Login (CIT)", url: "https://eservices38.mra.mu/centralLogin/login", description: "Corporate Income Tax." },
      { label: "MRA — Inscription compte", url: "https://eservices.mra.mu/eFilingProj/onlineRegistration.html", description: "Créer un compte avec TAN." },
      { label: "MRA Helpdesk", url: "https://www.mra.mu/index.php/contact-us", description: "Reset password, débloquer compte." },
    ],
    tips: [
      "Une seule paire de credentials couvre les 6 portails MRA — le robot bascule automatiquement vers le bon selon le type de déclaration.",
      "Pour les cabinets multi-clients : chaque société a ses propres credentials chiffrés. Le robot bascule sans intervention.",
      "Désactivation temporaire (audit MRA en cours, contrôle fiscal) : décoche <b>Soumission auto</b>, Lexora continue de générer les fichiers mais ne soumet plus.",
      "Active la double validation pour soumissions > 500 000 MUR : la direction confirme via Telegram avant que le robot ne lance l'envoi.",
      "Fallback toujours dispo : si le robot tombe en <em>manual_needed</em>, le bot Telegram t'envoie les fichiers en PJ pour upload manuel sur le portail MRA.",
    ],
  },

  // ========================================================================
  // EMAIL ACCOUNTS
  // ========================================================================
  '/client/email-accounts': {
    title: 'Comptes email — Envoi sortant Lexora',
    audience: 'all',
    intro:
      "Configure les comptes email pour envoi de factures, relances, bulletins, rapports, notifications. Un compte par société (partagé direction+) ou personnel (toi seul). Providers : <b>SMTP</b> (Gmail, OVH, Outlook, custom) et <b>Resend</b> (API transactionnelle, meilleure délivrabilité).",
    steps: [
      { title: "1. Choisis ton provider", body: "<b>SMTP</b> : simple, < 500 emails/jour. <b>Resend</b> : transactionnel, domaine vérifié requis, idéal envoi en masse (relances, bulletins lot)." },
      { title: "2a. Gmail : App Password", body: "Active la <b>2FA</b> sur Google d'abord (obligatoire). Va sur <b>myaccount.google.com/apppasswords</b>. Crée un App Password <em>Lexora</em>. Copie les 16 caractères.", warning: "Page App Passwords inaccessible = 2FA pas activée. Active-la dans Security → 2-Step Verification." },
      { title: "2b. Outlook / OVH / custom", body: "Récupère host (smtp-mail.outlook.com), port (587 STARTTLS ou 465 SSL), username (email complet), password (normal ou App Password)." },
      { title: "2c. Resend : domaine vérifié", body: "Sur <b>resend.com/domains</b> → Add Domain (acme.io). Configure DNS (SPF TXT, DKIM CNAME, DMARC TXT) chez ton registrar. Attends vérification ~10 min. Génère API key dans resend.com/api-keys." },
      { title: "3. Remplis le formulaire", body: "Label (<em>Facturation Acme</em>), From email, From name. Type : <b>Personnel</b> ou <b>Société</b>. Coche <b>Défaut</b> si tu veux ce compte partout." },
      { title: "4. Teste", body: "Bouton Test : email envoyé à ton From. Si boîte de réception : OK. Si spam : vérifie SPF/DKIM/DMARC. Si erreur : message précis (auth failed, domain unverified)." },
      { title: "5. Utilise dans Lexora", body: "Factures → bouton Envoyer utilise le défaut. Relances auto (cron 08:00 UTC). Bulletins de paie. Tu peux router par module (Settings → Notifications)." },
    ],
    pitfalls: [
      "Gmail avec password normal → 'Username and Password not accepted'. App Password obligatoire.",
      "Resend domaine non vérifié → status 422 à l'envoi.",
      "Pas de SPF sur ton domaine → délivrabilité catastrophique, emails en spam.",
      "Changement de password Google sans MAJ Lexora → tous les envois cassent.",
      "Limite Gmail 500/jour. Au-delà → bascule sur Resend.",
    ],
    externalLinks: [
      { label: "Google App Passwords", url: "https://myaccount.google.com/apppasswords" },
      { label: "Resend Domains", url: "https://resend.com/domains" },
      { label: "Resend API Keys", url: "https://resend.com/api-keys" },
      { label: "Tester délivrabilité", url: "https://www.mail-tester.com" },
    ],
    tips: [
      "L'agent Telegram envoie relances automatiquement via ces comptes.",
      "Brander 'Acme Compta &lt;contact@acme.io&gt;' au lieu de Lexora par défaut : configure Resend avec ton domaine.",
      "Cabinet : configure un compte par client pour que chaque facture parte du domaine du client.",
      "Multinationales : route les emails par filiale (Settings → Routing) selon les chartes locales.",
    ],
  },

  // ========================================================================
  // GOOGLE ACCOUNTS (Agenda)
  // ========================================================================
  '/client/settings/google-accounts': {
    title: 'Comptes Google (Agenda) — Connexion OAuth',
    audience: 'all',
    intro:
      "Connecte ton compte Google pour gérer ton agenda depuis Telegram : créer RDV clients, ajouter Google Meet, trouver créneaux libres entre plusieurs participants, modifier/annuler. OAuth 2.0 — Lexora n'a JAMAIS ton mot de passe Google, seulement un token révocable.",
    steps: [
      { title: "1. Prépare-toi", body: "Sois connecté uniquement au compte Google à lier. Sinon, déconnecte les autres ou utilise la navigation privée." },
      { title: "2. Connecter Google", body: "Redirection vers consentement Google. Permissions : <em>Voir et modifier les événements de ton agenda</em>, email, profil.", warning: "Si tu vois 'Application non vérifiée' ou 'Access blocked' : ton email n'est pas dans Test Users côté Google Cloud. Demande à l'admin Lexora." },
      { title: "3. Autorise", body: "Clique <b>Autoriser</b>. Retour sur cette page avec ton email Google badge <em>Connecté</em>. Refresh token stocké chiffré." },
      { title: "4. Plusieurs comptes (optionnel)", body: "Lie plusieurs comptes (perso + cabinet + société). Définis le <b>défaut</b>. Le bot demande quel agenda si plusieurs." },
      { title: "5. Utilise depuis Telegram", body: "<em>\"liste mes RDV de la semaine\"</em>, <em>\"rdv avec marie demain 14h en visio\"</em>, <em>\"trouve un créneau de 1h avec jean@acme.com et paul@acme.com mardi\"</em>, <em>\"annule le RDV de 16h\"</em>. Liens Meet auto." },
      { title: "6. Révoque", body: "À tout moment dans <b>myaccount.google.com/permissions</b>. Côté Lexora, bouton <b>Déconnecter</b>." },
    ],
    pitfalls: [
      "Auto-sélection d'un autre compte Google → déconnecte-toi des autres ou navigation privée.",
      "Reconnexion d'un compte déjà lié : révoque d'abord côté Google.",
      "App en mode Testing tant que pas de vérification Google demandée (utile > 100 users).",
      "Changement de compte Google principal : les anciens events restent dans l'ancien agenda.",
    ],
    externalLinks: [
      { label: "Mes permissions Google", url: "https://myaccount.google.com/permissions" },
      { label: "Mon Google Agenda", url: "https://calendar.google.com" },
      { label: "Google Workspace", url: "https://workspace.google.com" },
    ],
    tips: [
      "Events créés via Telegram apparaissent dans Google Agenda + invitations aux attendees.",
      "Cabinets : lie un compte commun <em>rdv@cabinet.io</em> pour collaboration.",
      "Outlook Calendar supporté aussi via Microsoft Graph — demande au support si tu utilises 365.",
    ],
  },

  // ========================================================================
  // TELEGRAM PERMISSIONS
  // ========================================================================
  '/client/telegram-permissions': {
    title: 'Permissions du bot Telegram — Rôles et capacités',
    audience: 'client',
    intro:
      "Cette page gouverne <em>ce que le cerveau de Lexora a le droit de faire</em> lorsqu'il est piloté depuis Telegram. Le bot <b>@LexoraAgent_bot</b> est un point d'accès au même moteur que l'assistant web (voir <b>L'assistant Lexora</b> et <b>L'agent comptable</b>) : il faut donc encadrer strictement qui s'y connecte et avec quel périmètre. Le modèle repose sur le <b>principe du moindre privilège</b> : chaque utilisateur reçoit un rôle, et chaque rôle ouvre un jeu précis de capacités (<em>capabilities</em>). Toute action exécutée est tracée et auditable.",
    steps: [
      { title: "1. Comprends la hiérarchie des rôles", body: "Les rôles sont hiérarchisés par niveau croissant : <b>Employé</b> (consulter ses bulletins, pointer, demander un congé) → <b>Manager</b> (+ valider les congés de son équipe) → <b>RH</b> (+ heures sup, primes, paie) → <b>Comptable</b> (+ banque, factures, MRA, écritures) → <b>Direction</b> (périmètre complet, y compris virements et suppressions). Un rôle ne peut jamais accorder à un autre un niveau supérieur au sien." },
      { title: "2. Qui peut configurer", body: "Seuls les rôles de niveau élevé (Comptable, Direction, administrateur de la société) peuvent générer des codes, changer des rôles ou révoquer un accès. C'est volontaire : la délégation de droits est elle-même un droit sensible." },
      { title: "3. Liste des membres", body: "La table <b>Membres</b> recense les utilisateurs disposant d'un compte Lexora rattaché à cette société. Depuis cette liste, tu changes le rôle d'un membre ou tu personnalises finement ses capacités via le bouton <b>Permissions</b>." },
      { title: "4. Employés RH non rattachés", body: "La table <b>Employés RH</b> liste les salariés actifs qui n'ont pas encore de compte Lexora. Clique <b>Générer un code</b> pour créer leur compte et leur code d'appairage Telegram en une étape." },
      { title: "5. Génère un code d'appairage", body: "Choisis le rôle (Employé par défaut) et, au besoin, des capacités sur mesure. Lexora produit un code à 6 caractères, un lien <code>t.me/LexoraAgent_bot?start=CODE</code> et un message prêt à envoyer (WhatsApp, email, SMS).", warning: "Le code expire après <b>15 minutes</b>. Au-delà, regénère-le — un code expiré ne lie aucun compte." },
      { title: "6. Activation côté utilisateur", body: "L'utilisateur ouvre le lien ou cherche le bot, puis envoie <b>/start CODE</b>. Le compte est appairé instantanément : son <code>chat_id</code> Telegram est associé à son <code>user_id</code> Lexora et à la société. Le bot le salue par son prénom et lui rappelle son rôle." },
      { title: "7. Affine les capacités (override)", body: "Le bouton <b>Permissions</b> ouvre une matrice d'une quarantaine de capacités. Tu peux activer ou retirer une capacité précise au-delà du rôle par défaut. L'override individuel prime sur le rôle — utile pour ouvrir une action ciblée sans promouvoir tout le rôle." },
      { title: "8. Audit de chaque action", body: "Toute action passée par le bot est journalisée dans <code>telegram_actions</code> : qui, quand, quoi, montant éventuel. La colonne <em>Audit (30 j)</em> donne l'historique récent, exportable en CSV pour un contrôle externe." },
      { title: "9. Révoque un accès", body: "Le bouton <b>Révoquer</b> invalide immédiatement le jeton d'un membre. À déclencher dès le départ d'un collaborateur ou en cas de doute sur la confidentialité du code." },
    ],
    pitfalls: [
      "Email manquant sur la fiche employé → impossible de générer un code.",
      "Plusieurs employés partageant le même email → un seul appairage possible.",
      "Attribuer Direction à un profil junior → risque réel (soumissions MRA, virements de plusieurs millions MUR).",
      "Capacités personnalisées oubliées après un changement de rôle → revérifie la matrice après chaque modification.",
      "Code envoyé au mauvais numéro → un tiers peut s'appairer. Révoque sans attendre.",
    ],
    tips: [
      "Les actions sensibles (écritures, virements, suppressions) déclenchent toujours un récapitulatif et des boutons <em>Confirmer</em> / <em>Annuler</em> avant exécution : le moindre privilège est doublé d'une confirmation humaine.",
      "Active la <b>validation à deux yeux</b> pour les virements supérieurs à 500 000 MUR.",
      "Cabinets : un collaborateur peut être appairé à plusieurs sociétés clientes avec un rôle distinct par société.",
      "Pour comprendre concrètement ce que le bot exécute, lis aussi <b>Pilotage via Telegram</b> et <b>Configuration du bot Telegram</b>.",
    ],
  },

  // ========================================================================
  // CERVEAU LEXORA — ASSISTANT / CHATBOT
  // ========================================================================
  '/client/assistant': {
    title: "L'assistant Lexora — Le cerveau conversationnel",
    audience: 'all',
    intro:
      "L'assistant Lexora est le <b>cerveau conversationnel</b> de la plateforme : un collaborateur IA expert-comptable, RH et fiscaliste mauricien, que tu interroges en langage naturel. Il s'appuie sur un modèle Claude couplé aux outils internes de Lexora, ce qui lui permet non seulement de répondre mais aussi de <em>consulter tes données réelles</em> (factures, soldes, grand-livre, congés, conformité MRA) pour produire des analyses fiables et, sur demande, préparer des documents. C'est la même intelligence que tu retrouves dans <b>L'agent comptable</b> et dans <b>Pilotage via Telegram</b> — ici dans une interface de discussion.",
    steps: [
      { title: "1. Pose ta question en français courant", body: "Écris comme à un collaborateur : « quel est mon solde de TVA ce mois-ci ? », « résume ma trésorerie », « quelles règles WRA pour un licenciement ? ». Pas de syntaxe à apprendre — l'assistant comprend l'intention." },
      { title: "2. L'assistant consulte tes données", body: "Pour répondre, le cerveau appelle des outils de <em>lecture</em> sur ta société active : liste des factures, balance d'un compte, grand-livre, bulletins, solde de congés, échéances et conformité MRA. La réponse s'appuie sur tes chiffres réels, pas sur des généralités." },
      { title: "3. Obtiens analyses et explications", body: "Au-delà des chiffres, l'assistant explique : pourquoi une TVA est due, comment se calcule un net à partir d'un brut, ce qu'impose une obligation fiscale ou sociale mauricienne. Idéal pour un dirigeant non-comptable comme pour un professionnel pressé." },
      { title: "4. Demande la préparation d'un document ou d'une action", body: "Tu peux aller plus loin : « prépare une facture pour le client Dupont », « affecte cette avance à la facture FA-2026-012 ». L'assistant propose alors l'action et attend ta validation explicite avant toute écriture (voir <b>L'agent comptable</b> pour le détail des garde-fous)." },
      { title: "5. Continuité entre canaux", body: "Tes échanges sont mémorisés. Le cerveau peut rappeler ce qui s'est dit sur un autre canal (web ou Telegram), pour que la conversation reste cohérente quel que soit l'endroit où tu reprends." },
    ],
    pitfalls: [
      "L'assistant est un appui, pas un signataire : <b>vérification humaine obligatoire</b> avant toute déclaration officielle ou tout paiement.",
      "Une question ambiguë donne une réponse approximative — précise la période, la société ou le tiers concerné.",
      "Vérifie toujours quelle société est active : les chiffres affichés concernent cette société uniquement.",
      "L'IA peut se tromper sur un cas de bord juridique : pour un point sensible, fais confirmer par ton comptable ou un conseil.",
    ],
    tips: [
      "Confidentialité : tes questions et tes données restent dans ton tenant Lexora et servent à répondre dans ton périmètre, pas à entraîner des modèles publics.",
      "Pour l'automatisation comptable poussée (extraction de factures, écritures, rapprochement), passe à <b>L'agent comptable</b>.",
      "Pour piloter le même cerveau depuis ton téléphone, voir <b>Pilotage via Telegram</b> et <b>Configuration du bot Telegram</b>.",
    ],
  },

  // ========================================================================
  // CERVEAU LEXORA — AGENT COMPTABLE AUTONOME
  // ========================================================================
  '/client/agent-comptable': {
    title: "L'agent comptable — Le cerveau qui agit",
    audience: 'all',
    intro:
      "L'agent comptable est la facette <em>opérationnelle</em> du cerveau de Lexora : là où l'assistant répond et conseille, l'agent <b>exécute des tâches comptables</b> sous contrôle. Il combine un modèle Claude et les outils internes de Lexora dans une boucle de raisonnement : il analyse ta demande, consulte les données nécessaires, propose une action concrète, puis l'exécute uniquement après ta confirmation. C'est un collaborateur autonome encadré, pas un pilote automatique.",
    steps: [
      { title: "1. Ce qu'il automatise", body: "Extraction de factures (OCR), passation et reclassement d'écritures, lettrage, enregistrement de paiements, lancement du rapprochement bancaire automatique, analyse de clôture, alertes d'échéances. Autant de tâches répétitives qu'il prend en charge à partir d'une instruction en langage naturel." },
      { title: "2. La boucle lecture → proposition → exécution", body: "L'agent distingue deux familles d'outils. Les outils de <b>lecture</b> (consulter une balance, lister des écritures) s'exécutent librement. Les outils d'<b>écriture</b> (créer une écriture, lettrer, enregistrer un paiement) ne s'exécutent jamais seuls : l'agent prépare l'action et la soumet à validation." },
      { title: "3. La confirmation humaine, garde-fou central", body: "Avant toute écriture, l'agent affiche un récapitulatif clair (quoi, sur quels comptes, quel montant) avec des boutons <em>Confirmer</em> / <em>Annuler</em>. Rien n'est gravé tant que tu n'as pas validé. C'est le pivot de la collaboration : l'IA fait le travail, l'humain garde la décision." },
      { title: "4. Collaboration avec le comptable humain", body: "L'agent ne remplace pas ton expert-comptable : il dégrossit, prépare et propose, lui valide et arbitre les cas complexes. Toutes les écritures restent traçables et auditables, comme une saisie manuelle." },
      { title: "5. Périmètre et droits", body: "L'agent agit dans le périmètre de la société active et selon les droits de l'utilisateur. Les actions sensibles respectent la hiérarchie des rôles : on ne contourne pas les permissions en passant par l'agent." },
    ],
    pitfalls: [
      "Ne valide jamais une écriture sans lire le récapitulatif : la confirmation engage ta comptabilité.",
      "Une instruction imprécise (« passe l'écriture ») peut viser le mauvais compte — donne le tiers, le montant et la pièce.",
      "L'OCR sur un document flou reste imparfait : contrôle les montants extraits avant de comptabiliser.",
      "L'agent n'a pas le dernier mot fiscal : une clôture ou une déclaration doit être revue par un professionnel.",
    ],
    tips: [
      "Pour une simple question ou une analyse, l'assistant suffit ; bascule sur l'agent quand tu veux qu'une action soit réalisée.",
      "Tout passe par la même intelligence : tu peux démarrer une demande sur Telegram et la finir sur le web (lien de reprise).",
      "Voir aussi <b>L'assistant Lexora</b>, <b>Pilotage via Telegram</b> et <b>Permissions du bot Telegram</b>.",
    ],
  },

  // ========================================================================
  // CERVEAU LEXORA — PILOTAGE TELEGRAM
  // ========================================================================
  '/pilotage-telegram': {
    title: 'Pilotage via Telegram — Le cerveau de poche',
    audience: 'all',
    intro:
      "Telegram transforme Lexora en <b>collaborateur de poche</b> : le même cerveau (assistant + agent comptable) accessible depuis ton téléphone, en discussion ou à la voix. Positionné comme un véritable assistant de direction, il couvre aussi bien la productivité personnelle (agenda, emails, brief quotidien) que les opérations (documents par photo) et la finance (comptabilité, banque, factures, RH, MRA). Les messages sont orchestrés en arrière-plan par des workflows N8N qui appellent le moteur IA et les outils Lexora.",
    steps: [
      { title: "1. Productivité de direction", body: "Agenda et rendez-vous via Google Agenda (proposition de créneaux, invitations Meet, gestion des conflits), rédaction d'emails en langage naturel ou par dictée, et un <b>brief quotidien</b> chaque matin : agenda du jour, échéances fiscales, anomalies comptables, décisions en attente." },
      { title: "2. Documents par photo", body: "Prends en photo une facture ou un ticket : le bot l'ingère, lance l'OCR et propose la création de la pièce comptable correspondante. Le justificatif part directement dans tes documents Lexora." },
      { title: "3. Finance et opérations en langage naturel", body: "Demande un point de trésorerie, l'état d'une facture, le solde de congés d'un salarié, la conformité MRA, ou déclenche une action comptable. Le bot mobilise les mêmes outils que l'agent web." },
      { title: "4. Voix et langage courant", body: "Tu peux dicter : la note vocale est transcrite, puis traitée comme un message texte. Aucune commande technique à mémoriser ; quelques commandes système existent (/start, /societe, /logout, /help) pour gérer le canal." },
      { title: "5. Confirmation avant toute action sensible", body: "Comme sur le web, les actions d'écriture (écriture comptable, virement, suppression) déclenchent un récapitulatif et des boutons <em>Confirmer</em> / <em>Annuler</em>. Le pilotage mobile n'allège jamais les garde-fous." },
    ],
    pitfalls: [
      "Le bot agit dans le périmètre de ta société active : vérifie laquelle est sélectionnée avant une action.",
      "Une photo floue dégrade l'OCR : reprends le cliché si les montants extraits semblent faux.",
      "Le brief et les alertes ne remplacent pas le contrôle : valide toi-même les échéances critiques.",
      "Ne pilote depuis Telegram qu'un compte correctement appairé et sécurisé (voir Configuration du bot).",
    ],
    tips: [
      "Sécurité : le webhook est protégé par un secret partagé et les actions sensibles transitent par des endpoints internes signés (HMAC-SHA256 + nonce, SEC-005). Aucun message non authentifié n'est exécuté.",
      "Architecture : Telegram → webhook Lexora → orchestration N8N → moteur IA (modèles Claude) + outils Lexora. Tout reste dans ton tenant.",
      "Pour appairer ton compte, voir <b>Configuration du bot Telegram</b> ; pour les droits par utilisateur, voir <b>Permissions du bot Telegram</b>.",
      "Sur le web, le même cerveau est dans <b>L'assistant Lexora</b> et <b>L'agent comptable</b>.",
    ],
  },

  // ========================================================================
  // COMPTABILITÉ — DASHBOARD
  // ========================================================================
  '/comptable': {
    title: 'Tableau de bord comptable',
    audience: 'comptable',
    intro:
      "Vue d'ensemble de l'activité de toutes les sociétés que tu suis : alertes du jour, factures en attente, échéances MRA (TVA, PAYE, CIT, TDS), soldes bancaires temps réel, KPIs financiers, tâches assignées. Point de départ chaque matin pour les comptables de cabinet comme pour le DAF d'un groupe.",
    steps: [
      { title: "1. Sélectionne une société", body: "Sélecteur en haut. Tous les indicateurs filtrent sur la société active. Bascule rapide via le menu Cabinet pour multi-clients." },
      { title: "2. Lis les alertes du jour", body: "Documents manquants, factures en retard, échéances MRA imminentes (J-7 / J-3 / J-1), anomalies bancaires (variation > 30%), employés absents non justifiés. Clique sur chaque alerte pour la résoudre directement." },
      { title: "3. Vérifie la trésorerie", body: "Soldes de tous les comptes bancaires actifs, mis à jour chaque nuit si scraping configuré (Direction → Accès Bancaires). Indicateur clé : trésorerie projetée à 30j en tenant compte des échéances connues." },
      { title: "4. Suis les KPIs du mois", body: "CA, dépenses, résultat, marge brute, DSO (Days Sales Outstanding), DPO. Compare avec mois précédent et année. Drill-down sur chaque indicateur." },
      { title: "5. Tâches assignées", body: "Liste de tes tâches du mois : TVA mai, paye juin, OD à passer, factures à émettre. Priorisées par deadline." },
      { title: "6. Bascule en mode client", body: "Bouton <em>Acting as</em> sur un client → tu vois Lexora comme si tu étais le directeur. Pratique pour saisir / vérifier." },
    ],
    pitfalls: [
      "Indicateur figé → vérifie société sélectionnée + données à jour (factures émises, écritures comptabilisées).",
      "KPI faux → un journal manuel mal saisi peut polluer le résultat. Vérifie le grand-livre des comptes 6/7.",
    ],
    tips: [
      "<em>\"point du matin\"</em> au bot Telegram → résumé condensé mobile.",
      "Active alertes Telegram (Permissions Bot) pour ne plus louper d'échéance.",
      "Cabinets : utilise le tableau de bord cabinet pour voir tous tes clients en un écran (Cabinet → Tableau de bord).",
    ],
  },

  // ========================================================================
  // FACTURES CLIENTS
  // ========================================================================
  '/comptable/factures-clients': {
    title: 'Factures clients — Émission et suivi',
    audience: 'comptable',
    intro:
      "Liste de toutes les factures émises aux clients. Tu crées, valides, envoies par email, suis les paiements et déclenches les relances automatiques. Chaque facture émise génère écritures comptables (411 Client / 707 Vente / 4457 TVA collectée), s'ajoute au CA et au calcul TVA du mois.",
    steps: [
      { title: "1. Crée une facture", body: "Bouton <b>Nouvelle facture</b>. Choisis le client (ou crée à la volée avec BRN, email, adresse). Ajoute les lignes (catalogue services ou libres). Lexora calcule TVA 15% (ou 0% export, ou exempt) + TTC automatiquement." },
      { title: "2. Vérifie les conditions", body: "Date émission, date échéance (30j net par défaut), conditions paiement, devise (MUR / USD / EUR avec taux MRA du jour pour conversion compta)." },
      { title: "3. Émets la facture", body: "Passage <em>brouillon → en_attente</em>. PDF généré, numéro auto (préfixe société + AAAA-NNNNN), écritures comptables passées, immutable.", warning: "Après émission, plus de modification possible — uniquement annulation par avoir (note de crédit)." },
      { title: "4. Envoie par email", body: "Bouton <b>Envoyer</b> → email avec PDF attaché vers le contact du client. Tracé dans l'historique." },
      { title: "5. Suis les paiements", body: "Quand le client paie, enregistre le paiement (montant, date, mode, référence bancaire). Lexora met à jour le solde et clôture si totalement payée. Si scraping bancaire actif, lettrage automatique." },
      { title: "6. Relances automatiques", body: "Si non payée à échéance, relances J+7, J+15, J+30 selon paramètres société. Tu peux désactiver pour un client donné." },
      { title: "7. Avoirs (notes de crédit)", body: "Annulation totale ou partielle → bouton <b>Créer un avoir</b>. Numéro distinct, écritures inversées." },
    ],
    pitfalls: [
      "Brouillon non émis → PAS comptée dans TVA collectée ni CA. Émets à temps avant la déclaration TVA.",
      "Émettre sans email contact → impossible d'envoyer automatiquement.",
      "BRN client manquant si montant > 100 000 MUR/an → MRA peut rejeter ta Schedule A.",
      "Mauvais taux TVA (15% au lieu de 0% export) → minoration TVA collectée, contrôle MRA.",
      "Date d'émission antérieure à la dernière facture émise → numérotation chronologique cassée.",
    ],
    tips: [
      "Crée via Telegram : <em>\"facture acme 50000 mur consulting septembre\"</em> → brouillon préparé.",
      "Abonnements / loyers : utilise <b>Récurrences</b> (génération auto chaque mois).",
      "Cabinet : tu peux émettre depuis le mode client (Acting as).",
      "Multinationales : factures intra-groupe avec template dédié + Transfer Pricing flag (cf. GBC).",
    ],
  },

  // ========================================================================
  // FACTURES FOURNISSEURS
  // ========================================================================
  '/comptable/fournisseurs': {
    title: 'Factures fournisseurs — Saisie et paiement',
    audience: 'comptable',
    intro:
      "Saisie et suivi des factures reçues. Différence clé vs factures clients : ici tu DÉDUIS la TVA et tu PAIES le fournisseur. La TVA déductible alimente la VAT3, les charges (classe 6) alimentent le compte de résultat, et le paiement crédite ta banque. Tu peux saisir manuellement, importer par OCR ou photo Telegram.",
    steps: [
      { title: "1. Saisis ou importe", body: "<b>Nouvelle facture fournisseur</b> pour saisie. Sinon dépose PDF dans Documents → OCR Claude extrait fournisseur, montant, TVA, date. Tu valides en 1 clic." },
      { title: "2. Affecte les comptes comptables", body: "Lexora suggère un compte de charge (classe 6) selon libellé : 60x achats marchandises, 61x services extérieurs, 62x autres services (transport, com, banque), 63x impôts/taxes, 64x charges personnel, 65x autres, 66x charges financières." },
      { title: "3. Identifie la TVA déductible", body: "Récupère uniquement si fournisseur immatriculé VAT mauricien et facture conforme (mentions obligatoires : VATRN, taux, montant). Pas de récupération sur dépenses bloquées (gas-oil voiture tourisme, restauration cadres, etc.)." },
      { title: "4. Reverse charge sur import services", body: "Si fournisseur non-résident (AWS, Google, conseil étranger) : coche <b>Reverse charge</b>. Lexora auto-liquide 15% (collectée + déductible) en TVA — neutre sauf si activité partiellement exempt." },
      { title: "5. TDS éventuelle", body: "Lexora flagge si TDS due (services pros résidents 5%, non-résidents 10%, loyer 5%, etc.). Retenue à appliquer sur le paiement net (cf. fiche TDS)." },
      { title: "6. Enregistre le paiement", body: "Quand payé, marque <b>payée</b> : date, mode (virement, chèque, carte), référence. Écriture banque automatique." },
    ],
    pitfalls: [
      "Saisir sans TVA alors qu'il y en a une → tu perds 15% de TVA déductible.",
      "Mauvais compte de charge → compte de résultat faussé (ex: facture loyer en 6068 au lieu de 613).",
      "Oublier reverse charge sur fournisseur étranger → MRA recalcule + pénalité.",
      "Oublier TDS sur paiement éligible → pénalité 5% + intérêts.",
      "Doublon : importer 2x la même facture (PDF + email) → double comptabilisation. Le bot signale les doublons probables.",
    ],
    tips: [
      "Photo de ticket / facture au bot Telegram → OCR + saisie en quelques secondes.",
      "Bot peut aussi te lister les factures fournisseurs à payer cette semaine : <em>\"paiements fournisseurs dus\"</em>.",
      "Pour les groupes : génère un export consolidé des factures fournisseurs intra-groupe pour réconciliation.",
      "Active le <b>matching automatique</b> : Lexora rapproche bon de commande → bon de livraison → facture (process Achat-3-Way).",
    ],
  },

  // ========================================================================
  // BANQUE
  // ========================================================================
  '/comptable/banque': {
    title: 'Relevés bancaires — Import et suivi',
    audience: 'comptable',
    intro:
      "Consulte et importe les relevés bancaires de chaque compte. Les transactions importées alimentent le rapprochement automatique et donnent une vision temps réel de la trésorerie. Sans relevés à jour, pas de rapprochement, pas de pilotage fiable.",
    steps: [
      { title: "1. Importe un relevé", body: "Dépose le PDF ou CSV de la banque (téléchargé depuis Internet Banking) dans Documents. L'OCR extrait les transactions et met à jour le compte." },
      { title: "2. Active le scraping (recommandé)", body: "Direction → Accès Bancaires : une fois configuré, Lexora rapatrie chaque nuit. Plus jamais d'import manuel." },
      { title: "3. Vérifie les transactions", body: "Tableau des transactions du compte. Filtre par période, montant, libellé. Clique sur une transaction pour voir détails / l'associer à une facture." },
      { title: "4. Lance le rapprochement", body: "Quand transactions importées, va dans <b>Rapprochement</b>. Lexora propose des matches auto (règles R1-R7) que tu valides en 1 clic." },
      { title: "5. Solde de contrôle", body: "Le solde scrapé est comparé au solde Lexora. Écart > 5% → alerte Telegram + investigation requise (transaction oubliée, opération non passée)." },
    ],
    pitfalls: [
      "Importer 2 fois le même relevé → doublons. Vérifie dates de chevauchement avant import.",
      "Sans scraping ni import régulier → impossible de réconcilier proprement, vision trésorerie périmée.",
      "Mauvais compte associé à l'import → transactions sur le mauvais journal banque. Corriger via réaffectation en masse.",
    ],
    externalLinks: [
      { label: "MCB Internet Banking", url: "https://ibank.mcb.mu" },
      { label: "SBM Internet Banking", url: "https://internetbanking.sbmgroup.mu" },
    ],
    tips: [
      "Configure le scraping pour éliminer 100% de la saisie banque.",
      "Pour les groupes multi-banques : tableau de bord trésorerie consolidé (Outils → Trésorerie groupe).",
    ],
  },

  // ========================================================================
  // RAPPROCHEMENT BANCAIRE (priorité 8)
  // ========================================================================
  '/comptable/rapprochement': {
    title: 'Rapprochement bancaire — Concept et automatisation',
    audience: 'comptable',
    intro:
      "Le rapprochement bancaire est l'opération qui consiste à <b>matcher chaque ligne du relevé bancaire avec une écriture comptable</b>. C'est l'un des piliers de la comptabilité : sans rapprochement, ton solde bancaire dans Lexora dérive et tu ne sais plus ce que tu as réellement encaissé/payé. Le <b>lettrage</b> est l'action de marquer une facture comme <em>payée</em> en la rapprochant à une transaction bancaire. Lexora le fait automatiquement via 7 règles déterministes (R1-R7) + machine learning sur les libellés.",
    steps: [
      { title: "1. Comprends pourquoi", body: "Fiabilise le solde bancaire (vérité = ce que dit la banque), détecte erreurs/oublis (facture émise mais jamais encaissée), prévient les fraudes (paiement non autorisé), prépare le bilan (compte 512 doit refléter la réalité)." },
      { title: "2. Pré-requis : relevés à jour", body: "Le rapprochement n'est possible que si les transactions bancaires sont importées (scraping nocturne ou import CSV/PDF). Va dans <b>Banque</b> pour vérifier." },
      { title: "3. Lance le rapprochement auto", body: "Bouton <b>Lancer rapprochement</b>. Lexora applique : <b>R1</b> montant + référence facture exacts. <b>R2</b> montant exact + nom client/fournisseur dans libellé. <b>R3</b> montant + date ± 3j. <b>R4</b> virement multi-factures (somme exacte). <b>R5</b> salaires (libellé SALAIRE + montant). <b>R6</b> frais bancaires (libellé typique). <b>R7</b> agios/intérêts." },
      { title: "4. Valide les propositions", body: "Tableau des matches proposés avec score de confiance. Score > 95% : un clic valide. Score 70-95% : tu vérifies. Score < 70% : Lexora ne propose pas, traite manuellement." },
      { title: "5. Traite les non rapprochés", body: "Transactions seules → 3 options : (a) associer manuellement à une facture, (b) créer une écriture libre (frais bancaire, transfert interne, agios), (c) reporter en attente si pas d'info." },
      { title: "6. Lien avec le PCM", body: "Le lettrage met à jour le compte <b>411 Clients</b> (sortie quand client paie) ou <b>401 Fournisseurs</b> (sortie quand tu paies) et le compte <b>512 Banque</b>. Tout est tracé dans le grand-livre." },
      { title: "7. Verrouille le mois", body: "Quand tout est lettré, verrouille la période. Plus de modification sauf déverrouillage explicite (droit Direction). Bilan fiable à cette date." },
      { title: "8. État de rapprochement", body: "Bouton <b>État de rapprochement</b> → document officiel pour l'auditeur : solde comptable + transactions en suspens = solde bancaire." },
    ],
    pitfalls: [
      "Lettrer hâtivement la mauvaise facture → la vraie reste impayée côté Lexora. Désassocie et corrige.",
      "Oublier d'enregistrer un virement entre deux comptes internes → comptes faussés des deux côtés. Crée toujours l'écriture 580 Virements internes en miroir.",
      "Frais bancaires non passés → solde Lexora plus haut que la banque. Passe une OD en 627 Services bancaires.",
      "Période non verrouillée → modifications a posteriori désynchronisent le bilan.",
      "Désactiver les règles auto par méfiance → tu passes 10x plus de temps. Fais-toi confiance, vérifie échantillon.",
    ],
    tips: [
      "Salaires lettrés auto après verrouillage de la paie (matching journal SAL ↔ relevé).",
      "Tu peux ajouter tes propres règles : Outils → Règles de lettrage (ex: <em>toute ligne contenant 'CEB' → compte 627 Électricité</em>).",
      "Pour les groupes : rapprochement intercompagnies via <b>Cross-letterage</b> (compense soldes intra-groupe).",
      "Multinationales : règles de rapprochement par type de virement (SWIFT, SEPA, ACH) avec frais déductibles automatiques.",
    ],
  },

  // ========================================================================
  // ÉCRITURES (priorité 9)
  // ========================================================================
  '/client/ecritures': {
    title: 'Écritures comptables — Journal complet',
    audience: 'comptable',
    intro:
      "Une <b>écriture comptable</b> enregistre une opération économique avec un <b>débit</b> et un <b>crédit</b> de montant total égal (règle de la partie double). Chaque écriture est classée par <b>code journal</b> : <b>VTE</b> ventes, <b>ACH</b> achats, <b>BNQ</b> banque, <b>CAI</b> caisse, <b>SAL</b> salaires, <b>OD</b> opérations diverses. Lexora génère 95% des écritures automatiquement (factures, paie, banque) — tu ne saisis manuellement que les OD (régularisations, provisions, amortissements).",
    steps: [
      { title: "1. Comprends la partie double", body: "Toute opération a deux faces. Ex : ventes 100 MUR → débit 411 Client (créance) 100, crédit 707 Vente 87, crédit 4457 TVA 13. Total débit (100) = total crédit (100). Sans équilibre, Lexora refuse." },
      { title: "2. Code journaux Lexora", body: "<b>VTE</b> = factures clients (auto). <b>ACH</b> = factures fournisseurs (auto). <b>BNQ</b> = relevés banque + virements (auto via rapprochement). <b>CAI</b> = caisse espèces. <b>SAL</b> = paie (auto au verrouillage). <b>OD</b> = manuel : OD régularisation, provision, amortissement, à-nouveaux." },
      { title: "3. Filtre par journal et période", body: "Sélecteurs en haut. Recherche par n° d'écriture, libellé, montant, compte. Export CSV/PDF possible." },
      { title: "4. Saisis une OD manuelle", body: "<b>Nouvelle écriture</b>. Journal OD, date, libellé clair. Ajoute lignes débit/crédit (1 ou plusieurs comptes). Total débit doit égaler total crédit sinon validation bloquée." },
      { title: "5. Cas typiques d'OD", body: "Provision congés payés (auto via Provisions), amortissement immobilisations (auto via Immobilisations), régularisation FNP/CCA (charges à payer, produits constatés d'avance), à-nouveaux d'ouverture exercice." },
      { title: "6. Drill-down vers la pièce", body: "Clic sur une écriture auto → tu accèdes à la pièce d'origine (facture PDF, bulletin, transaction bancaire). Trace complète pour audit." },
      { title: "7. Export pour auditeur", body: "Bouton <b>Exporter</b> → CSV format <b>FEC</b> (Fichier des Écritures Comptables), PDF récapitulatif, format IFRS pour groupes internationaux." },
      { title: "8. Verrouillage mensuel", body: "Une période verrouillée (clôture) interdit les modifications. Pour corriger une erreur, passe une OD de contre-passation dans la période ouverte." },
    ],
    pitfalls: [
      "Saisie déséquilibrée → Lexora bloque. C'est protecteur, ne le contourne pas.",
      "Mauvais compte (ex: 411 au lieu de 401) → bilan faussé. Vérifie le libellé du compte avant validation.",
      "Date hors période → écriture refusée si la période est verrouillée. Choisis une date dans le mois ouvert.",
      "OD sur compte de tiers sans pièce justificative → audit risque. Joins toujours un document.",
      "Modification d'une écriture auto (facture) → recommandation : passe une OD au lieu d'éditer la facture émise.",
    ],
    tips: [
      "Pour les amortissements : Lexora calcule auto chaque mois depuis le module Immobilisations.",
      "Provisions IFRS (IAS 19 congés, IAS 37 risques, IAS 36 dépréciation) : modules dédiés génèrent les OD.",
      "Multinationales : export multi-référentiel (Maurice PCM, IFRS, US GAAP) selon configuration.",
      "Recherche puissante : <em>compte:6411 montant:&gt;100000 date:2026-05*</em> dans la barre de recherche.",
    ],
  },

  // ========================================================================
  // BALANCE
  // ========================================================================
  '/comptable/clients/[clientId]/[societeId]/balance': {
    title: 'Balance comptable — Contrôle avant clôture',
    audience: 'comptable',
    intro:
      "La balance liste tous les comptes du Plan Comptable Mauricien (PCM) avec leur solde à une date donnée. C'est l'<b>outil de contrôle universel</b> du comptable : avant chaque clôture mensuelle ou exercice, on vérifie la balance pour détecter anomalies, comptes d'attente non soldés, erreurs de classification. Si la balance s'équilibre (Σ débit = Σ crédit), la compta est cohérente.",
    steps: [
      { title: "1. Choisis la période", body: "Balance cumulée à fin de mois, trimestre, exercice. Lexora consolide toutes les écritures jusqu'à cette date." },
      { title: "2. Vérifie l'équilibre", body: "<b>Total débit = Total crédit</b>. Si écart : une écriture a été modifiée hors process. Investiguer immédiatement via le journal." },
      { title: "3. Analyse par classe PCM", body: "Classes 1 (capitaux), 2 (immo), 3 (stocks), 4 (tiers), 5 (trésorerie), 6 (charges), 7 (produits). Vérifie cohérence : 6 vs 7 = résultat. 1+2+3+4+5 = bilan." },
      { title: "4. Drill-down sur un solde", body: "Clic sur un solde anormal (compte d'attente 47x non soldé, créance client > 90j) → détail des écritures qui le composent." },
      { title: "5. Comptes d'attente à solder", body: "47x (en attente, suspens) doivent être à zéro à la clôture. 4711 Virements internes : à régulariser. 4716 Erreurs : à investiguer." },
      { title: "6. Export pour auditeur", body: "PDF mis en forme ou CSV format FEC. Tampon de validation par responsable comptable." },
    ],
    pitfalls: [
      "Solde non nul sur compte d'attente (47x) → écriture en suspens, régularise avant clôture.",
      "411 Client en crédit (au lieu de débit) → trop-perçu non remboursé. Régularise.",
      "401 Fournisseur en débit → avance non récupérée. Régularise.",
      "Compte 6 ou 7 actif après clôture annuelle → reprise des soldes oubliée.",
    ],
    tips: [
      "Comparaison N vs N-1 sur même date : Outils → Balance comparative.",
      "Pour les groupes : balance consolidée multi-sociétés avec élimination intra-groupe (Outils → Consolidation).",
    ],
  },

  // ========================================================================
  // PLAN COMPTABLE (priorité 10)
  // ========================================================================
  '/client/plan-comptable': {
    title: 'Plan Comptable Mauricien (PCM)',
    audience: 'comptable',
    intro:
      "Le <b>Plan Comptable Mauricien (PCM)</b> est la structure hiérarchique normalisée des comptes que toute société mauricienne doit utiliser. Lexora démarre avec un PCM standard inspiré du SYSCOHADA adapté + IFRS, que tu peux enrichir de sous-comptes. Structure en <b>7 classes</b> : 1 capitaux, 2 immobilisations, 3 stocks, 4 tiers, 5 trésorerie, 6 charges, 7 produits. Plus le numéro est long, plus le compte est précis.",
    steps: [
      { title: "1. Comprends les 7 classes", body: "<b>1</b> = capitaux propres + emprunts long terme (capital social 101, résultat 12, dettes financières 16). <b>2</b> = immobilisations (incorporelles 20, corporelles 21, financières 26). <b>3</b> = stocks (matières 31, marchandises 37). <b>4</b> = tiers (clients 411, fournisseurs 401, État 44, personnel 42). <b>5</b> = trésorerie (banque 512, caisse 53). <b>6</b> = charges (60 achats, 61 services ext, 62 autres services, 63 impôts, 64 personnel, 65 autres, 66 financières, 67 except, 68 amortissements). <b>7</b> = produits (70 ventes, 75 autres, 76 financiers, 77 except)." },
      { title: "2. Recherche un compte", body: "Recherche par numéro ou libellé. Comptes utilisés ont un cadenas (non supprimables tant qu'écritures référencent)." },
      { title: "3. Crée un sous-compte", body: "<b>Nouveau compte</b>. Numéro = parent + 1 à 3 chiffres (ex: 6061 = sous-compte de 606 Achats). Libellé clair, classement IFRS, classement reporting." },
      { title: "4. Analytique (centres de coût)", body: "Pour le suivi par projet/agence, active l'analytique (Paramètres → Compta). Chaque ligne d'écriture peut être taggée par centre de coût (Maurice, Réunion, Madagascar par ex)." },
      { title: "5. Lien avec le grand-livre", body: "Chaque compte est accessible dans <b>Grand-livre</b> avec toutes ses écritures et son solde évolutif. C'est la base de la balance et du bilan." },
      { title: "6. Mapping IFRS pour groupes", body: "Si tu reportes en IFRS (full ou SMEs), Lexora génère le mapping PCM → IFRS automatiquement (ex: 21x → PP&E IAS 16, 16x → Borrowings IFRS 9)." },
    ],
    pitfalls: [
      "Modifier un compte utilisé → toutes les écritures héritent du nouveau libellé. OK pour libellé, JAMAIS pour numéro.",
      "Créer trop de sous-comptes inutiles → grand-livre illisible. Limite-toi aux distinctions analytiques utiles.",
      "Supprimer un compte qui est référencé dans un import régulier (relevé banque) → cassures futures. Archive plutôt.",
    ],
    tips: [
      "PCM standard Lexora couvre 90% des besoins TPE/PME. N'ajoute que si nécessaire.",
      "Pour les GBC : sous-comptes en USD (compte 512100) parallèles aux MUR (512000).",
      "Multinationales : multi-référentiel actif (PCM + IFRS + GAAP local autre pays) avec mapping automatique.",
    ],
  },

  // ========================================================================
  // CONTACTS (tiers)
  // ========================================================================
  '/client/contacts': {
    title: 'Tiers — Clients et Fournisseurs',
    audience: 'comptable',
    intro:
      "Annuaire centralisé des clients et fournisseurs : nom, BRN MRA, email, téléphone, adresse, conditions paiement, IBAN. Utilisé partout dans Lexora (factures, relances, virements, rapprochement). Un tiers bien renseigné = facturation rapide + zéro erreur MRA + relances automatiques efficaces.",
    steps: [
      { title: "1. Crée un tiers", body: "<b>Nouveau</b>. Type : Client / Fournisseur / Les deux. Nom commercial, raison sociale, BRN MRA (9 chiffres), TAN MRA si applicable, VATRN si fournisseur immatriculé." },
      { title: "2. Coordonnées", body: "Email (obligatoire pour envoi facture), téléphone, adresse complète, pays (résident vs non-résident impacte TVA + TDS)." },
      { title: "3. Conditions commerciales", body: "Délai paiement par défaut (30j, 60j, 90j), mode (virement, chèque), IBAN, devise habituelle, taux remise éventuel." },
      { title: "4. Lien aux factures", body: "Lors d'une facture, le tiers est sélectionné, ses coordonnées remplissent le PDF auto. Tu peux toujours surcharger ponctuellement." },
      { title: "5. Historique du tiers", body: "Onglet <b>Historique</b> : toutes les factures émises/reçues, paiements, encours, DSO moyen. Utile pour évaluer le risque." },
      { title: "6. Évaluation crédit (IFRS 9)", body: "Pour les grands clients, Lexora calcule une PD (probability of default) et propose une provision IFRS 9 ECL (Expected Credit Loss). Cf. fiche IFRS 9." },
    ],
    pitfalls: [
      "BRN manquant ou incorrect → si CA tiers > 100 000 MUR/an, Schedule A rejetée par MRA.",
      "Email manquant → envoi facture / relance impossible.",
      "Pays non renseigné pour fournisseur → reverse charge et TDS non flaggés correctement.",
      "Doublons : <em>Acme Ltd</em> et <em>ACME LTD</em> créés séparément → encours dispersé. Active déduplication.",
    ],
    tips: [
      "Import CSV en masse depuis ton ancien outil — colonne BRN obligatoire pour matcher MRA.",
      "Pour les groupes : tag intercompany sur les tiers internes du groupe pour faciliter consolidation et élimination.",
      "Multinationales : KYC documents attachés au tiers (CDD, screening sanctions PEP) — module AML intégré.",
    ],
  },

  // ========================================================================
  // RH — DASHBOARD
  // ========================================================================
  '/rh': {
    title: 'Tableau de bord RH',
    audience: 'all',
    intro:
      "Vue d'ensemble des ressources humaines : effectif actif, demandes de congés en attente, alertes (contrats CDD expirant, retours maternité, ancienneté), prochaines paies, masse salariale. Pilote chaque matin la fonction RH ou délègue à ton bot Telegram qui te fait un récap.",
    steps: [
      { title: "1. Effectif actif", body: "Total employés par contrat (CDI, CDD, saisonnier, stagiaire). Clic pour la liste détaillée. Évolution mensuelle visualisée." },
      { title: "2. Demandes en attente", body: "Congés à valider (par manager ou direction). Approuve/refuse en 1 clic depuis ici ou via Telegram." },
      { title: "3. Alertes RH", body: "CDD à échéance < 30j (à renouveler ou clôturer), retours maternité prévus, employés approchant 5 ans (droit Vacation Leave WRA), anniversaires d'arrivée." },
      { title: "4. Masse salariale", body: "Coût employeur total mensuel (brut + charges patronales NSF + CSG + PRGF). Comparaison N vs N-1." },
      { title: "5. KPIs RH", body: "Turnover, absentéisme, ratio masse salariale/CA, taux d'OT moyen. Indicateurs clés pour DAF ou DRH." },
    ],
    tips: [
      "Bot Telegram envoie notification proactive à 09:00 chaque jour : demandes nouvelles, employés en retard, etc.",
      "Pour les groupes : KPIs RH par entité + consolidé groupe.",
      "Multinationales : reporting RH par pays avec règles légales locales (Maurice WRA, France code du travail, etc.).",
    ],
  },

  // ========================================================================
  // RH — EMPLOYÉS
  // ========================================================================
  '/rh/employes': {
    title: 'Employés — Fiche RH',
    audience: 'all',
    intro:
      "Source de vérité pour la paie et la fiche RH. Crée, modifie, archive un employé. Les données impactent directement la paie (PAYE, NSF, CSG, PRGF), les calculs WRA (congés, severance, EOY bonus) et les virements salaires.",
    steps: [
      { title: "1. Crée un employé", body: "<b>Nouveau</b>. Prénom, nom, poste, département, date d'arrivée (clé pour ancienneté), salaire de base, devise (MUR par défaut). Code employé généré auto." },
      { title: "2. Identité & légal", body: "<b>NID</b> Maurice (14 chiffres), passeport, CIN, nationalité, statut (résident/expat avec WAP). Pour expat : permis de travail attaché." },
      { title: "3. Email + téléphone", body: "Email obligatoire (bulletin par email + lien bot Telegram). Téléphone pour notifications urgentes et OTP." },
      { title: "4. Coordonnées bancaires", body: "IBAN Maurice (26 caractères format MU + chiffres), banque, code branche. Sans IBAN → fichier <em>SANS_BANQUE</em> au virement salaire (manuel)." },
      { title: "5. Catégorie CSG", body: "<b>A</b> = salaire ≤ 50 000 MUR/mois (taux 1,5% employé + 3% employeur). <b>B</b> = > 50 000 (taux 3% employé + 6% employeur). Bonne catégorie = paie juste." },
      { title: "6. Contrat", body: "Onglet <b>Contrats</b> : type (CDI, CDD, saisonnier, stagiaire), date début/fin, salaire base, primes fixes contractuelles, clauses (non-concurrence, confidentialité)." },
      { title: "7. Activation", body: "Une fois complète, l'employé entre dans le calcul paie et peut recevoir un code Telegram via Permissions Bot." },
      { title: "8. Archivage en cas de départ", body: "Renseigne date de départ dans la fiche. Lexora exclut du calcul paie à partir du mois suivant et déclenche les calculs de fin de contrat (cf. /rh/depart)." },
    ],
    pitfalls: [
      "Date de départ saisie par erreur → employé sort du calcul paie. Vérifie 2x.",
      "IBAN incomplet → fichier SANS_BANQUE, virement manuel.",
      "Mauvaise catégorie CSG → toutes les retenues fausses (employé et MRA).",
      "NID Maurice incorrect (mauvais 14 chiffres) → déclaration MRA rejetée.",
      "Doublon employé (même NID 2x) → calculs PAYE faussés. Active déduplication.",
    ],
    tips: [
      "Import CSV en masse depuis ton ancien outil RH (template fourni).",
      "Photo de profil utile pour les bulletins et trombinoscope.",
      "Pour les groupes : transfert d'employé entre sociétés via <b>Mobilité interne</b> sans rupture d'ancienneté.",
      "Multinationales : champs locaux par pays (numéro de sécurité sociale FR, SSN US, etc.).",
    ],
  },

  // ========================================================================
  // RH — CONGÉS
  // ========================================================================
  '/rh/conges': {
    title: 'Congés — Demandes, validation, soldes',
    audience: 'all',
    intro:
      "Gère les demandes de congés selon le <b>Workers Rights Act 2019</b> : <b>AL</b> Annual Leave (22j/an), <b>SL</b> Sick Leave (15j/an avec certif + 6j sans), <b>VL</b> Vacation Leave (30j après 5 ans), <b>FML</b> Family Leave, <b>ML</b> Maternity (14 semaines), <b>PL</b> Paternity (5j). Workflow demande → validation manager/direction → décompte solde → provision IAS 19.",
    steps: [
      { title: "1. Employé soumet la demande", body: "<b>Demander un congé</b>. Type, dates début/fin, motif. Lexora calcule le nb de jours ouvrables (exclut weekends + jours fériés Maurice) et vérifie le solde." },
      { title: "2. Manager reçoit notification", body: "Push Telegram + apparaît dans <em>En attente</em>. Boutons <em>Valider</em>/<em>Refuser</em> directement, avec champ motif si refus." },
      { title: "3. Solde décompté", body: "Si validé : jours retirés du solde de l'employé. Si refusé : décision communiquée avec motif." },
      { title: "4. Acquisition mensuelle", body: "AL acquis à 1,83j/mois (22/12). SL à 1,25j/mois. Lexora calcule auto chaque fin de mois." },
      { title: "5. Reports d'année", body: "Selon WRA : AL non pris reportables 6 mois (ensuite caduques sauf accord employeur). Lexora alerte au 31/12." },
      { title: "6. Provision IAS 19", body: "Pour les groupes en IFRS : Lexora calcule chaque mois la provision congés payés acquis non pris (cf. /rh/provisions/conges)." },
      { title: "7. Calendrier équipe", body: "Vue calendrier : qui est absent quand, conflits potentiels (2 chefs de service même semaine), couverture minimum." },
    ],
    pitfalls: [
      "Demande sur jours sans solde → refus auto sauf si tu autorises solde négatif pour cet employé.",
      "Maladie > 6j sans certificat médical → SL sur certificat (15j) ne se débloque pas.",
      "Oublier de valider une demande → bloque l'employé qui ne peut pas planifier.",
      "Manuel : modifier le solde sans pièce → audit problématique. Toujours valider via le module.",
    ],
    externalLinks: [
      { label: "Workers Rights Act 2019 — Texte", url: "https://labour.govmu.org/Documents/Legislations/WRA2019.pdf" },
      { label: "Ministry of Labour Mauritius", url: "https://labour.govmu.org" },
    ],
    tips: [
      "Employé peut demander congé via Telegram : <em>\"je prends 3j de congé 15-17 mai\"</em>.",
      "Manager valide depuis Telegram avec un bouton.",
      "Cabinets : workflow client → validation par compta cabinet possible si délégation.",
    ],
  },

  // ========================================================================
  // RH — POINTAGES
  // ========================================================================
  '/rh/pointage': {
    title: 'Pointages — Horaires et présence',
    audience: 'all',
    intro:
      "Suivi des heures d'arrivée et départ pour : (1) calculer les heures supplémentaires éligibles WRA, (2) détecter absences non justifiées, (3) justifier salaires aux auditeurs. Pointage manuel, badgeuse, ou via Telegram (idéal télétravail).",
    steps: [
      { title: "1. Saisie manuelle (ponctuelle)", body: "<b>Nouveau pointage</b>. Employé, date, heure entrée et sortie. Utile pour corrections après-coup." },
      { title: "2. Pointage via Telegram (recommandé)", body: "Chaque employé lié au bot tape <b>/in</b> (arrivée) et <b>/out</b> (départ), ou langage naturel <em>\"je commence\"</em> / <em>\"je termine\"</em>. Géolocalisation optionnelle." },
      { title: "3. Pointage badgeuse (optionnel)", body: "Si tu as une badgeuse physique avec API, intégration possible. Demande au support." },
      { title: "4. Détection no-show", body: "Si planning prévu et pointage absent, bot alerte manager + employé après 10 min." },
      { title: "5. Calcul heures travaillées", body: "Total mensuel par employé, comparé au planning. Écart positif > 10h = heures sup éligibles." },
      { title: "6. Lien avec paie", body: "Heures sup détectées remontent dans <b>RH → Paie → OT</b> pour validation par manager puis intégration au bulletin." },
    ],
    pitfalls: [
      "Oublier de pointer sortie → temps de travail surestimé. Bot envoie rappel à 19h si pas de /out.",
      "Pointage massif manuel le mois suivant → soupçon audit. Préfère le temps réel.",
      "Sans planning défini, détection no-show impossible. Configure plannings dans /rh/planning.",
    ],
    tips: [
      "Télétravail : Telegram suffit, pas besoin de badgeuse.",
      "Rapport mensuel d'absentéisme automatique en fin de mois.",
      "Multinationales : pointage multi-fuseaux supporté (Singapore, Paris, Maurice en simultané).",
    ],
  },

  // ========================================================================
  // RH — PLANNING
  // ========================================================================
  '/rh/planning': {
    title: 'Planning — Shifts et horaires',
    audience: 'all',
    intro:
      "Plannings hebdomadaires des équipes (shifts, horaires, pauses). Sert de référence pour : détection no-show, calcul heures sup, couverture minimum service, droit à compensation jours fériés. Indispensable pour les secteurs avec rotation (hôtellerie, retail, manufacturing).",
    steps: [
      { title: "1. Crée un shift type", body: "Onglet <b>Modèles</b> : ex <em>Bureau 9h-18h</em>, <em>Service soir 14h-22h</em>. Heures début/fin, jours actifs, pauses (1h déjeuner non rémunérée standard)." },
      { title: "2. Affecte un employé", body: "Glisse-dépose sur un jour. Tu peux planifier 1 semaine ou 1 mois en avance." },
      { title: "3. Vérifie la couverture", body: "Tableau de couverture par jour/heure : minimum équipe respecté ? Conflits congés ? Lexora flagge les trous." },
      { title: "4. Publie", body: "Une fois validé, <b>Publier</b>. Employés voient leur planning (Lexora + email + Telegram). Bot surveille les pointages selon ces horaires." },
      { title: "5. Modifications", body: "Modifier un planning publié → notification automatique à l'employé concerné par Telegram/email. Logs préservés." },
    ],
    pitfalls: [
      "Modifier un planning publié sans prévenir → litige. Notification auto t'aide mais préviens aussi manuellement les changements urgents.",
      "Oublier les jours fériés → planning chevauche un férié, double majoration WRA s.20.",
      "Pas de pause incluse → temps de travail réel > 8h légales, redressement possible.",
    ],
    tips: [
      "Importez vos plannings existants depuis Excel (template fourni).",
      "Multinationales : planning multi-pays avec règles locales (35h FR, 40h US, 45h Maurice).",
    ],
  },

  // ========================================================================
  // RH — PRIMES
  // ========================================================================
  '/rh/paie/primes': {
    title: 'Primes — Ajout au bulletin',
    audience: 'comptable',
    intro:
      "Ajoute des primes variables au bulletin du mois : performance, ancienneté, exceptionnelle, 13e mois pro-rata. Elles s'ajoutent au brut et impactent PAYE, NSF, CSG, PRGF. Lexora applique automatiquement les retenues selon le barème.",
    steps: [
      { title: "1. Sélectionne employé + période", body: "Choisis l'employé concerné et le mois. La prime sera intégrée au prochain bulletin (tant que période non verrouillée)." },
      { title: "2. Type de prime", body: "Performance individuelle, performance collective, ancienneté, exceptionnelle, 13e mois pro-rata, prime de panier, prime transport, gratification. Catalogue paramétrable." },
      { title: "3. Montant en MUR", body: "Saisis le montant brut. Lexora applique PAYE par tranche, NSF, CSG selon barème automatiquement." },
      { title: "4. Justificatif (recommandé)", body: "Joins pièce justificative (lettre de prime signée, décision direction) — utile audit et contrôle fiscal." },
      { title: "5. Intégration paie", body: "Au calcul du mois, prime ajoutée au brut. Visible dans la fiche bulletin avec ligne dédiée." },
    ],
    tips: [
      "Via Telegram : <em>\"prime 5000 mur pour marie mai\"</em> → bot saisit la prime ici automatiquement.",
      "Pour les primes annuelles, planifie-les à l'avance : Lexora les pousse au bon mois.",
      "Multinationales : régimes de bonus différents par pays (stock options US, intéressement FR) supportés.",
    ],
  },

  // ========================================================================
  // RH — HEURES SUP (OT)
  // ========================================================================
  '/rh/paie/ot': {
    title: 'Heures supplémentaires (OT)',
    audience: 'comptable',
    intro:
      "Saisie des heures sup selon <b>WRA s.18</b> : <b>1,5x</b> pour les 10 premières heures par semaine au-delà de 45h, <b>2x</b> au-delà ou dimanche/jour férié. Lexora calcule la majoration automatiquement et l'intègre au bulletin.",
    steps: [
      { title: "1. Choisis employé + mois", body: "Sélecteur en haut. Tu vois les heures déjà saisies pour ce mois." },
      { title: "2. Ajoute les heures", body: "Date, nb d'heures, taux (1,5x ou 2x), motif. Calcul auto = heures × taux horaire × multiplicateur." },
      { title: "3. Validation manager", body: "Le manager direct valide les heures avant intégration au bulletin (workflow configurable)." },
      { title: "4. Intégration paie", body: "Au calcul mensuel, OT ajoutées au brut. Visible sur le bulletin avec détail par jour." },
      { title: "5. Plafond OT", body: "WRA limite à 90h OT/mois et 24h OT/semaine. Lexora alerte si dépassement." },
    ],
    externalLinks: [
      { label: "WRA 2019 — Section 18 OT", url: "https://labour.govmu.org/Documents/Legislations/WRA2019.pdf" },
    ],
    tips: [
      "Via Telegram : <em>\"Jean 8h OT 1.5x mai\"</em> → bot saisit automatiquement.",
      "Détection auto depuis pointages : si pointage > planning, propose OT pour validation.",
      "Manager peut valider en lot depuis Telegram : <em>\"valide OT équipe\"</em>.",
    ],
  },

  // ========================================================================
  // FISCAL — TDS (priorité 5)
  // ========================================================================
  '/client/mra-tds': {
    title: 'TDS — Tax Deducted at Source (Section 111A ITA)',
    audience: 'comptable',
    intro:
      "La <b>TDS</b> est une retenue à la source sur certains paiements à des fournisseurs (Income Tax Act 1995 Section 111A). Le payeur (toi) retient un % du paiement et le reverse à MRA pour le compte du bénéficiaire. Taux : <b>5%</b> services pro résidents, <b>10%</b> non-résidents, <b>15%</b> intérêts non-résidents, <b>5%</b> loyer commercial, <b>3%</b> commission, <b>15%</b> royalties non-résidents, <b>0,75%</b> contrats > 300 000 MUR (construction, achat services à l'État). Déclaration mensuelle avant <b>20 du mois suivant</b>.",
    steps: [
      { title: "1. Comprends qui est concerné", body: "Payeur = toute société payant les natures de paiement listées en Section 111A. Bénéficiaire = résident ou non-résident percevant ces revenus. La TDS est crédité contre l'IR du bénéficiaire (qui reçoit un certificat)." },
      { title: "2. Lexora flagge automatiquement", body: "Sur chaque facture fournisseur, Lexora identifie : nature de prestation (services pro, location, intérêts, royalties), statut résident/non-résident, montant — et applique le taux TDS approprié. Tu vois un badge <em>TDS 5%</em> sur la facture." },
      { title: "3. Retiens lors du paiement", body: "Au paiement : tu verses au fournisseur le montant <em>net de TDS</em>, et tu conserves la TDS pour MRA. Comptable : Débit 401 Fournisseur (brut), Crédit 4421 TDS à payer (TDS), Crédit 512 Banque (net)." },
      { title: "4. Émets le certificat TDS", body: "Onglet <b>Certificats TDS</b> → un PDF par fournisseur par paiement, mentionnant nature, montant brut, TDS retenu, période. Tu l'envoies par email au fournisseur." },
      { title: "5. Déclaration mensuelle", body: "<b>Déclarer TDS du mois</b>. Lexora génère le CSV employeurs (nom, BRN/TAN bénéficiaire, montant brut, TDS retenue). Vérifie avant export." },
      { title: "6. Soumets sur eservices.mra.mu", body: "Menu <b>TDS → Monthly Return</b>. Charge le CSV. Valide. Note la référence. Échéance <b>20 du mois suivant</b>." },
      { title: "7. Paie", body: "Virement à MRA du total TDS retenu, avec référence TAN + période. Marque payée dans Lexora." },
    ],
    pitfalls: [
      "Oublier TDS sur paiement éligible → pénalité <b>5% + intérêts</b>. Vérifie chaque facture flaggée.",
      "Mauvais taux (5% au lieu de 10% pour non-résident) → minoration, MRA recalcule + redressement.",
      "Payer brut sans retenir → tu dois reverser TDS de ta poche au MRA (perte sèche).",
      "Pas de certificat émis au fournisseur → contestation par le fournisseur qui ne peut pas créditer.",
      "Soumission après le 20 → pénalité automatique 5%.",
    ],
    externalLinks: [
      { label: "MRA Portail eServices (TDS)", url: "https://eservices.mra.mu" },
      { label: "Section 111A ITA — Guide MRA", url: "https://www.mra.mu/index.php/eservices/tax-deduction-at-source-tds" },
      { label: "Income Tax Act 1995", url: "https://www.mra.mu/download/ITAct.pdf" },
    ],
    tips: [
      "Active <b>flag automatique</b> sur création de fournisseur : Lexora pré-remplit le taux TDS attendu selon catégorie.",
      "Pour les groupes : exclusion intra-groupe configurable (pas de TDS sur facturation interne).",
      "Multinationales : matrice TDS croisée par pays (Maurice → France 0% via DTA, Maurice → US 30%, etc.). Module Treaty Mapping.",
      "Le robot Telegram peut soumettre TDS automatiquement : <em>\"soumets TDS mai\"</em>.",
    ],
  },

  // ========================================================================
  // FISCAL — CIT (priorité 4)
  // ========================================================================
  '/client/mra-cit': {
    title: 'CIT — Corporate Income Tax + APS trimestriels',
    audience: 'comptable',
    intro:
      "Impôt sur les sociétés mauricien (Income Tax Act 1995). Taux standard <b>15%</b>. Pour les <b>GBC1</b> sous régime <b>Partial Exemption</b> : 80% de certains revenus éligibles sont exonérés (deemed deduction), taux effectif = 3%. Système : <b>APS</b> (Advance Payment System) trimestriel = 25% de l'IR estimé annuel, payés en cours d'année, puis déclaration annuelle finale 6 mois après clôture exercice.",
    steps: [
      { title: "1. Comprends la base imposable", body: "<b>Résultat comptable</b> (compte de résultat) → <b>retraitements fiscaux</b> : charges non déductibles (amendes, dépenses non justifiées, partie tourisme voitures), produits non imposables, amortissements fiscaux ≠ comptables, déficits reportables → <b>base imposable</b>. Lexora calcule auto." },
      { title: "2. Calcule l'IR estimé annuel", body: "Base imposable estimée × 15% (ou 3% si GBC1 PER). Lexora propose une estimation à partir du réalisé + projection." },
      { title: "3. APS trimestriel", body: "<b>4 APS par an</b> = 25% × IR annuel estimé. Échéances : <b>3 mois</b> après fin de chaque trimestre. Pour exercice juillet-juin : Q1 → 31 dec, Q2 → 31 mars, Q3 → 30 juin, Q4 → 30 sept (mais ce dernier souvent fusionné avec déclaration annuelle)." },
      { title: "4. Soumets APS sur eservices.mra.mu", body: "Menu <b>CIT → APS</b>. Lexora génère le calcul. Charge sur portail. Paie le montant." },
      { title: "5. Déclaration annuelle", body: "<b>6 mois après clôture</b>. Formulaire <b>IT Form 4</b> avec : états financiers signés + audités si seuils dépassés, calcul résultat fiscal détaillé, tableau APS payés, solde à payer ou remboursement. Lexora prépare tout." },
      { title: "6. Pièces à joindre", body: "Bilan + compte de résultat + notes annexes, rapport d'audit si applicable (CA > 50 M MUR ou ratio dette/equity > 75%), réconciliation profit comptable vs fiscal, schedule APS, schedule capital allowances (amortissements fiscaux)." },
      { title: "7. Cas GBC1 — Partial Exemption", body: "80% des revenus éligibles (intérêts groupe, dividendes étrangers, revenu de leasing aircraft, etc.) sont deemed exempt. Conditions : substance économique (CIGA — Core Income Generating Activities documentées avec employés qualifiés Maurice + dépenses opérationnelles + lieu de direction)." },
      { title: "8. Paie le solde", body: "Solde déclaration annuelle = IR final - APS payés. Si négatif : remboursement (~3 mois délai). Si positif : payer dans les 30 jours suivant dépôt." },
    ],
    pitfalls: [
      "Sous-estimer APS → pénalité si solde annuel > 25% au-dessus des avances cumulées (Section 50).",
      "GBC1 sans documentation CIGA → MRA refuse Partial Exemption, redresse à 15%. Documente avec rigueur (CV employés, factures locales, PV CA).",
      "Oublier charges non déductibles dans retraitements → base sous-évaluée, redressement + pénalité.",
      "Pas d'audit alors que seuils dépassés → déclaration rejetée.",
      "Soumission après 6 mois post-clôture → pénalité 5% + intérêts 1% par mois.",
    ],
    externalLinks: [
      { label: "MRA Portail CIT", url: "https://eservices.mra.mu" },
      { label: "Guide CIT MRA", url: "https://www.mra.mu/index.php/eservices/income-tax-companies" },
      { label: "Income Tax Act 1995", url: "https://www.mra.mu/download/ITAct.pdf" },
      { label: "FSC — Partial Exemption GBC1", url: "https://www.fscmauritius.org/media/55020/per-guidelines.pdf" },
    ],
    tips: [
      "Lexora projette ton IR annuel en continu — tu vois en temps réel le montant attendu.",
      "Pour les groupes : consolidation fiscale possible si parent + filiales détenues > 75% (group relief Section 32A).",
      "GBC1 : module dédié CIGA pour documenter substance (cf. fiche /client/gbc-dashboard).",
      "Multinationales sujet Pillar Two : modules Top-Up Tax intégrés (cf. fiche GBC).",
      "Bot Telegram : <em>\"point CIT N\"</em> → projection IR annuel + APS dus.",
    ],
  },

  // ========================================================================
  // CLIENT — PROFIL
  // ========================================================================
  '/client/profil': {
    title: 'Mon Profil — Compte personnel',
    audience: 'client',
    intro:
      "Tes informations personnelles Lexora : nom, email, mot de passe, langue, préférences notifications. C'est aussi ici que tu lies ton compte à Telegram pour utiliser le bot.",
    steps: [
      { title: "1. Mets à jour tes infos", body: "Nom complet, email, téléphone. Sert aux signatures de tes emails Lexora et notifications." },
      { title: "2. Change ton mot de passe", body: "Bouton dédié. Choisis fort (12 caractères mini, mix lettres/chiffres/symboles)." },
      { title: "3. Active la 2FA", body: "Recommandé. Lexora génère un QR à scanner avec Google Authenticator ou Authy. Sécurise ton accès." },
      { title: "4. Connecte Telegram", body: "Section Telegram : <b>Générer un code</b>, ouvre Telegram, cherche <b>@LexoraAgent_bot</b>, tape <b>/start CODE</b>. Tu peux désormais piloter Lexora depuis mobile." },
      { title: "5. Choisis ta langue", body: "Français (Maurice) ou English. Affecte UI et réponses du bot." },
      { title: "6. Préférences notifications", body: "Email vs push Telegram vs SMS. Granulaire par type d'alerte (échéances MRA, factures, anomalies, paie)." },
    ],
    tips: [
      "Active la 2FA — ton accès Lexora donne accès à banque, paie, fiscalité. À sécuriser.",
      "Si tu changes d'email : valide le nouveau via lien envoyé, les notifications basculent automatiquement.",
    ],
  },

  // ========================================================================
  // CLIENT — TELEGRAM CONFIG (page personnelle, ≠ permissions société)
  // ========================================================================
  '/client/telegram-config': {
    title: 'Configuration du bot Telegram (appairage personnel)',
    audience: 'all',
    intro:
      "Cette page relie <em>ton</em> compte Lexora au canal Telegram <b>@LexoraAgent_bot</b>. Une fois l'appairage fait, tu accèdes au cerveau de Lexora depuis ton téléphone, en langage naturel : créer une facture, valider la paie, soumettre la TVA, consulter la trésorerie. À distinguer des <b>Permissions du bot</b>, qui régissent les droits de l'ensemble des utilisateurs : ici, il s'agit uniquement de <em>ton</em> lien personnel et de la façon dont il est sécurisé.",
    steps: [
      { title: "1. Génère ton code d'appairage", body: "Clique <b>Générer un code</b>. Lexora produit un code à 6 caractères, valable 15 minutes. Ce code lie ton identité Lexora à un chat Telegram précis — il est strictement personnel." },
      { title: "2. Ouvre la conversation du bot", body: "Sur ton téléphone, cherche <b>@LexoraAgent_bot</b> dans Telegram ou utilise le lien fourni à l'écran." },
      { title: "3. Appaire avec /start CODE", body: "Envoie <b>/start ABCXYZ</b> (remplace ABCXYZ par ton code). Lexora vérifie le code, l'associe à ton <code>chat_id</code> Telegram et confirme l'appairage. Ton rôle et tes capacités sont hérités de ton compte." },
      { title: "4. Vérifie l'appairage", body: "Envoie un simple <em>bonjour</em>. Le bot doit te saluer par ton prénom et t'indiquer ce qu'il peut faire selon ton rôle. Si c'est le cas, le canal est opérationnel." },
      { title: "5. Sélectionne la société active", body: "Si tu gères plusieurs sociétés, le bot te demande laquelle activer — via <b>/societe</b> ou un menu. Toutes les actions suivantes s'appliquent à la société active." },
      { title: "6. Délie le compte si besoin", body: "Tu peux rompre l'appairage à tout moment : <b>/logout</b> dans la conversation, ou le bouton <b>Déconnecter</b> sur cette page. Le jeton est alors invalidé." },
    ],
    pitfalls: [
      "Code expiré (au-delà de 15 minutes) → regénère-le, l'ancien ne lie plus rien.",
      "Changement de numéro Telegram : fais /logout sur l'ancien appareil avant de réappairer avec un nouveau code.",
      "Bot inactif juste après l'appairage : relance la conversation avec /start (sans code) pour réveiller le canal.",
      "Ne partage jamais ton code : quiconque l'utilise pilote Lexora sous ton identité jusqu'à révocation.",
    ],
    tips: [
      "Sécurité de bout en bout : le webhook Telegram est protégé par un secret partagé, et les actions sensibles déclenchées depuis le chat transitent par des endpoints internes signés (HMAC-SHA256 + nonce anti-rejeu, conforme SEC-005). Aucune action n'est exécutée sur un message non authentifié.",
      "Ce qui transite : tes messages, les pièces jointes que tu envoies (photos de factures pour l'OCR) et les réponses du cerveau. Les données restent dans ton tenant Lexora.",
      "Le bot mémorise tes préférences (langue, format de date, devise par défaut) et tu peux couper les notifications par plage horaire.",
      "Pour le détail des capacités et l'attribution des rôles, voir <b>Permissions du bot Telegram</b> ; pour tout ce que le bot sait faire, voir <b>Pilotage via Telegram</b>.",
    ],
  },

  // ========================================================================
  // CABINET — DASHBOARD
  // ========================================================================
  '/comptable/cabinet': {
    title: 'Tableau de bord Cabinet',
    audience: 'comptable',
    intro:
      "Vue agrégée de tous les clients suivis par le cabinet : tâches du mois par client (TVA, paye, MRA, factures), KPIs cumulés, alertes critiques, collaborateurs en charge. Conçu pour les cabinets gérant 5 à 500 clients.",
    steps: [
      { title: "1. Vue d'ensemble", body: "KPIs cabinet : nb clients, nb tâches du mois, % complétion, retards, masse honoraires en cours." },
      { title: "2. Filtre par client", body: "Sélecteur. Tags clients (urgent, en cours, en attente, VIP). Tu peux taguer librement." },
      { title: "3. Travail en cours", body: "Liste tâches assignées : TVA mai, paye juin, OD à passer, factures à émettre, déclarations à valider. Avec deadline et statut." },
      { title: "4. Acting as", body: "Bouton sur un client → bascule en mode client. Tu vois Lexora comme directeur de la société. Idéal pour saisir/vérifier." },
      { title: "5. Communication client", body: "Messages reçus, demandes pendantes, validations attendues du client. Centralise les interactions." },
      { title: "6. Performance équipe", body: "Heures par collaborateur, productivité, clients assignés." },
    ],
    tips: [
      "Assigne des collaborateurs par client (Cabinet → Équipe) — chacun voit son scope.",
      "Facturation cabinet automatisée : Outils → Facturation cabinet → time-tracking convertible en factures.",
      "Multi-cabinets (réseau) : reporting consolidé via Outils → Réseau cabinet.",
    ],
  },

  // ========================================================================
  // DOCUMENTS
  // ========================================================================
  '/client/documents': {
    title: 'Documents — Centre de fichiers + OCR',
    audience: 'all',
    intro:
      "Tous les documents (factures fournisseurs, relevés bancaires, contrats, bulletins, justificatifs) déposés dans Lexora. L'<b>OCR IA Claude Vision</b> extrait les infos automatiquement et propose la création de factures/écritures correspondantes. Conservation 10 ans conforme exigences fiscales mauriciennes (Section 6 VAT Act + ITA).",
    steps: [
      { title: "1. Dépose un document", body: "Drag-and-drop ou bouton <b>Importer</b>. Formats PDF, JPG, PNG, XLSX. Max <b>20 Mo</b> par fichier. Multi-upload possible." },
      { title: "2. OCR automatique", body: "Claude analyse : type détecté (facture fournisseur, relevé bancaire, fiche de paie, contrat, ticket), fournisseur, montants HT/TVA/TTC, date, BRN, suggestion compte comptable." },
      { title: "3. Valide la création", body: "Si OCR correcte : 1 clic crée la facture fournisseur ou enregistre le relevé. Sinon, corrige les champs avant validation." },
      { title: "4. Classement", body: "Documents triés par type (Facture fournisseur, Banque, RH, Légal, Autre), période, société. Recherche full-text sur le contenu OCR." },
      { title: "5. Archive audit", body: "Tout document est lié à son écriture comptable (drill-down depuis grand-livre). Indispensable pour audit." },
      { title: "6. Email forwarding", body: "Envoie tes factures fournisseurs à <em>documents@ton-tenant.lexora.finance</em> — Lexora ingère automatiquement. Plus besoin de drag-and-drop." },
    ],
    pitfalls: [
      "Photo floue / papier froissé → OCR moins fiable. Corrige manuellement.",
      "Statut 'erreur' → clique <b>Réanalyser</b> pour relancer.",
      "Doublon : même PDF importé 2x → bot signale doublon probable basé sur hash + montant.",
      "Documents personnels confondus avec pro → trie bien en amont.",
    ],
    tips: [
      "Photo de doc directement au bot Telegram → ingéré et proposé pour création.",
      "Email forwarding magique : crée une règle dans ta boîte mail pour rediriger tous tes <em>contact-fournisseur@*</em> vers Lexora.",
      "Pour les groupes : multi-tenant, chaque société a son adresse d'ingest distincte.",
      "Multinationales : OCR multilingue (FR, EN, ZH, JA, AR, etc.).",
    ],
  },

  // ========================================================================
  // FINANCIAL DASHBOARD (vue client)
  // ========================================================================
  '/client/tableau-de-bord-financier': {
    title: 'Tableau de bord financier (vue dirigeant)',
    audience: 'client',
    intro:
      "Vue d'ensemble de la santé financière de ta société destinée au dirigeant non-comptable : trésorerie, CA, dépenses, résultat, en chiffres clairs. Calculé temps réel à partir des factures et écritures. Différent du tableau de bord comptable : ici, pas de jargon compta, juste les indicateurs business.",
    steps: [
      { title: "1. Période", body: "Mois en cours par défaut. Bascule pour comparer (mois précédent, trimestre, année)." },
      { title: "2. Trésorerie", body: "Solde de tous les comptes bancaires actifs (scrapés). Trésorerie projetée à 30j (encaissements attendus - paiements à venir)." },
      { title: "3. CA et dépenses", body: "<b>CA</b> = factures clients émises sur la période (HT). <b>Dépenses</b> = factures fournisseurs reçues + salaires + charges sociales. <b>Résultat</b> = CA - dépenses." },
      { title: "4. Marge brute", body: "(CA - achats marchandises) / CA. Indicateur de rentabilité de l'activité core." },
      { title: "5. Drill-down", body: "Clic sur chiffre → détail : factures qui composent CA, transactions trésorerie, dépenses par catégorie." },
      { title: "6. Variation mensuelle", body: "% évolution vs mois précédent. Baisse forte = alerte rouge à investiguer." },
    ],
    tips: [
      "<em>\"point financier\"</em> au bot Telegram → résumé mobile en 5 secondes.",
      "Pour le bilan / compte de résultat comptables officiels, va dans Compta → Bilan / Grand-livre.",
      "Groupes : tableau de bord consolidé multi-sociétés avec élimination intra-groupe (Outils → Consolidation).",
      "Multinationales : conversion devise auto à taux MRA du jour pour vision groupe.",
    ],
  },

  // ========================================================================
  // FACTURES (vue client, ≠ /comptable/factures-clients)
  // ========================================================================
  '/client/factures': {
    title: 'Mes factures clients (vue dirigeant)',
    audience: 'client',
    intro:
      "Vue simplifiée pour le dirigeant : qui a payé, qui doit, combien tu factures par mois. Sans jargon comptable (pas de classe 411 ici). Si tu es comptable de cabinet, va plutôt sur Compta → Factures clients pour la vue comptable.",
    steps: [
      { title: "1. Filtre rapide", body: "Statut (en attente / payée / en retard), par client, par période. Recherche libre dans tous les champs." },
      { title: "2. Crée une facture", body: "<b>Nouvelle facture</b>. Choisis le client, ajoute lignes, TVA calculée. Émets quand prêt." },
      { title: "3. Envoie au client", body: "Une facture émise peut être envoyée par email avec PDF attaché. Lexora trace l'envoi (ouverture, click PDF)." },
      { title: "4. Enregistre les paiements", body: "Quand client paie, ouvre la facture → <b>Enregistrer paiement</b>. Si scraping bancaire actif, lettrage auto sans saisie." },
      { title: "5. Relance", body: "Si en retard, déclenche manuellement ou laisse l'automatique (J+7/J+15/J+30)." },
    ],
    tips: [
      "Crée via Telegram : <em>\"facture ACME 50000 MUR consulting\"</em>.",
      "Abonnements récurrents → /client/recurrences.",
      "Tu peux dupliquer une facture similaire pour gagner du temps.",
    ],
  },

  // ========================================================================
  // NOUVELLE FACTURE
  // ========================================================================
  '/client/nouvelle-facture': {
    title: 'Nouvelle facture client',
    audience: 'client',
    intro:
      "Crée une facture client. Lexora applique automatiquement la numérotation conforme (préfixe société + AAAA-NNNNN), calcule la TVA selon taux applicable (15% standard, 0% export, exempt), génère le PDF aux normes mauriciennes (mentions obligatoires VAT Act s.20).",
    steps: [
      { title: "1. Choisis le client", body: "Sélectionne dans la liste ou crée à la volée (nom, BRN obligatoire si > 100k MUR/an cumul, email, adresse, conditions paiement)." },
      { title: "2. Ajoute les lignes", body: "Pour chaque prestation : description, quantité, prix unitaire, taux TVA (15% / 0% / exempt). Pioche dans catalogue services si défini." },
      { title: "3. Vérifie les totaux", body: "HT total, TVA par taux, TTC. Si erreur, retourne aux lignes. Lexora bloque l'émission si total = 0." },
      { title: "4. Conditions et notes", body: "Date émission (défaut aujourd'hui), date échéance (défaut +30j), conditions paiement, notes internes (non visibles client), notes au pied (visibles)." },
      { title: "5. Devise et taux change", body: "Si facture en USD/EUR/GBP, taux MRA du jour appliqué (IAS 21). Conversion auto pour comptabilité MUR." },
      { title: "6. Brouillon vs Émission", body: "<b>Brouillon</b> = modifiable, non comptabilisé, non compté TVA. <b>Émettre</b> = PDF généré, numéro auto, écritures passées, immutable." },
    ],
    pitfalls: [
      "Émettre sans email contact → impossible d'envoyer automatiquement.",
      "Mauvais taux TVA → déclaration TVA fausse, contrôle MRA.",
      "BRN client manquant alors que cumul annuel > 100k MUR → Schedule A rejetée.",
      "Date émission antérieure à la dernière facture → numérotation cassée. Lexora alerte.",
      "Mentions obligatoires manquantes (VATRN, adresse) → facture non opposable. Lexora vérifie automatiquement.",
    ],
    tips: [
      "<b>Dupliquer</b> depuis une facture existante similaire pour aller vite.",
      "Templates par client : Lexora mémorise les lignes habituelles d'un client et les pré-remplit.",
      "Multi-devises pour exportateurs et GBC : changement de devise en 1 clic.",
    ],
  },

  // ========================================================================
  // NOUVELLE FACTURE IA
  // ========================================================================
  '/client/nouvelle-facture-ia': {
    title: 'Nouvelle facture par IA (langage naturel)',
    audience: 'client',
    intro:
      "Décris ta facture en langage naturel — l'IA Claude extrait client, lignes, montants, TVA. Plus rapide que le formulaire pour les cas simples. Idéal mobile + dirigeants pressés.",
    steps: [
      { title: "1. Écris en français", body: "Ex : <em>\"Facture ACME Ltd, consulting septembre 2026, 50 000 MUR HT + 15% TVA, à 30 jours\"</em>." },
      { title: "2. L'IA propose un brouillon", body: "Lexora identifie le client (cherche dans ta base), crée les lignes, calcule TVA. Aperçu PDF temps réel." },
      { title: "3. Ajuste si besoin", body: "Modifie chaque ligne avant validation. L'IA est rapide mais imparfaite pour cas complexes (multi-devises, refacturation, ventilation)." },
      { title: "4. Émets", body: "Clique <b>Émettre</b>. La facture passe en compta normale." },
    ],
    pitfalls: [
      "Client ambigu (2 clients de même nom) → IA demande clarification.",
      "Description trop vague → IA crée 1 ligne générique. Sois précis.",
    ],
    tips: [
      "Idem depuis Telegram avec le bot (encore plus rapide).",
      "Pour grosses séries de factures, préfère import CSV ou récurrences.",
    ],
  },

  // ========================================================================
  // RÉCURRENCES
  // ========================================================================
  '/client/recurrences': {
    title: 'Factures récurrentes',
    audience: 'client',
    intro:
      "Configure des factures qui se génèrent automatiquement (loyers, abonnements, contrats récurrents). Économise 100% du temps de saisie pour les revenus prévisibles.",
    steps: [
      { title: "1. Crée un modèle", body: "<b>Nouveau modèle</b>. Client, lignes, fréquence (mensuelle, trimestrielle, annuelle), date début, jour d'émission (ex: 1er du mois), date fin optionnelle." },
      { title: "2. Cron quotidien", body: "Chaque jour à 06:00 UTC, Lexora vérifie les modèles dus et clone une facture en <em>en_attente</em>. Tu reçois notification." },
      { title: "3. Pause / reprise", body: "Tu peux suspendre un modèle (client en pause, gel temporaire) sans le supprimer. Reprise en 1 clic." },
      { title: "4. Modifications futures", body: "Modifie le modèle : seules les FUTURES factures héritent. Les déjà émises restent immutables." },
      { title: "5. Indexation annuelle", body: "Option : indexation auto annuelle (% ou montant fixe). Utile loyer + abonnements." },
    ],
    pitfalls: [
      "Modifier le modèle ne touche pas les factures déjà générées. Pour celles-ci, émets un avoir.",
      "Modèle suspendu oublié → revenu manquant pendant des mois. Vérifie régulièrement.",
      "Date fin atteinte → modèle s'arrête sans alerte. Re-active si besoin.",
    ],
    tips: [
      "Crée via Telegram : <em>\"loyer ACME 50000 MUR tous les mois à partir du 1er juin\"</em>.",
      "Multi-récurrences possibles : un loyer mensuel + une maintenance trimestrielle sur même client.",
      "Multinationales : récurrences multi-devises (loyer en USD avec conversion MUR pour compta).",
    ],
  },

  // ========================================================================
  // RELANCES
  // ========================================================================
  '/client/relances': {
    title: 'Relances factures',
    audience: 'client',
    intro:
      "Suivi automatique des factures impayées. Lexora envoie des relances par email selon cadence configurable (J+7 amicale, J+15 ferme, J+30 mise en demeure). Tu peux suspendre par client, personnaliser les templates, exclure les clients VIP.",
    steps: [
      { title: "1. Configure la cadence", body: "Paramètres facturation. Ex : amicale J+7, ferme J+15, mise en demeure J+30. Personnalise templates avec variables {{nom_client}}, {{montant}}, {{date_facture}}." },
      { title: "2. Cron quotidien envoie", body: "Chaque jour à 08:00 UTC, relances envoyées par email aux clients en retard. Tu reçois un récap." },
      { title: "3. Suspends une relance", body: "Pour client en attente de paiement promis, suspends puis ré-active plus tard. Évite le harcèlement." },
      { title: "4. Historique par facture", body: "Pour chaque facture, vois toutes les relances envoyées (date, niveau, mode, ouverture/clic)." },
      { title: "5. Escalade", body: "Au-delà de J+30 sans paiement, Lexora propose de passer en contentieux (mise en demeure recommandée + huissier)." },
    ],
    tips: [
      "Bot Telegram alerte chaque matin si > 5 factures en retard.",
      "Personnalise par client : VIP → pas de relance auto, traité manuellement.",
      "Multinationales : templates multilingues selon langue du client.",
    ],
  },

  // ========================================================================
  // BILAN
  // ========================================================================
  '/client/bilan': {
    title: 'Bilan comptable',
    audience: 'client',
    intro:
      "Le bilan présente la <b>situation financière à une date donnée</b> : ce que la société POSSÈDE (actif) versus ce qu'elle DOIT (passif). C'est la photo du patrimoine. Format conforme <b>IFRS for SMEs</b> ou <b>Full IFRS</b> (GBC), avec ventilation courant/non-courant.",
    steps: [
      { title: "1. Choisis la date", body: "Fin de mois, trimestre, exercice. Lexora consolide toutes les écritures jusqu'à cette date." },
      { title: "2. Lis l'ACTIF", body: "Ce que tu possèdes : immobilisations (terrains, bâtiments, matériels, logiciels), stocks, créances clients (factures non encore encaissées), trésorerie. Triés par liquidité croissante." },
      { title: "3. Lis le PASSIF", body: "Ce que tu dois : capitaux propres (capital social + réserves + résultat accumulé), dettes financières (emprunts banque), dettes fournisseurs, dettes fiscales (TVA + IR + PAYE à payer), dettes sociales (CSG, NSF)." },
      { title: "4. Vérifie l'équilibre", body: "Total ACTIF = Total PASSIF (toujours, c'est la règle d'or). Si écart, une écriture est manquante/erronée — Lexora indique laquelle." },
      { title: "5. Comparaison N vs N-1", body: "Évolution colonne à colonne. Variation des fonds propres = résultat de l'exercice. Variation trésorerie = activité + investissement + financement (lié au cash flow)." },
      { title: "6. Export PDF officiel", body: "Format conforme IFRS, à remettre au banquier (demande crédit), commissaire aux comptes (audit), ROC (Annual Return), ou administration." },
    ],
    pitfalls: [
      "Solde non nul sur compte d'attente (47x) → régularise avant édition officielle.",
      "Stocks non inventoriés → bilan fausse. Fais l'inventaire physique mensuel.",
      "Provisions oubliées (congés payés, garantie, contentieux) → bilan trop favorable.",
      "Amortissements non passés → actif surévalué.",
    ],
    tips: [
      "Pour les groupes : bilan consolidé IFRS 10 avec élimination intra-groupe (Outils → Consolidation).",
      "GBC : Full IFRS obligatoire + functional currency (IAS 21).",
      "Multinationales : bilan multi-référentiel (PCM Maurice + GAAP local étranger).",
    ],
  },

  // ========================================================================
  // GRAND-LIVRE (priorité 7)
  // ========================================================================
  '/client/grand-livre': {
    title: 'Grand-livre — Détail compte par compte',
    audience: 'client',
    intro:
      "Le <b>grand-livre</b> est le journal détaillé de TOUTES les opérations comptables compte par compte. Pour chaque compte du <b>Plan Comptable Mauricien (PCM)</b>, il liste les mouvements chronologiques avec solde évolutif. C'est l'outil n°1 pour : pister une opération précise, vérifier un solde, préparer le bilan, fournir détails à l'auditeur. Différence vs journal comptable : ici on regarde un compte à la fois ; dans le journal, on regarde toutes les écritures dans l'ordre chronologique.",
    steps: [
      { title: "1. Comprends le lien avec le PCM", body: "Le grand-livre est le miroir détaillé du PCM. Chaque compte du PCM (411 Clients, 401 Fournisseurs, 512 Banque, 6411 Salaires, 707 Ventes, etc.) a sa page dans le grand-livre. Solde du compte = somme des mouvements depuis l'ouverture." },
      { title: "2. Choisis un compte", body: "Liste à gauche organisée par classe PCM (1 à 7), ou recherche par numéro/libellé. Comptes utilisés en gras, comptes non utilisés en gris." },
      { title: "3. Filtre la période", body: "Date début / date fin. Lexora affiche : <b>solde initial</b> (cumul avant date début), <b>mouvements</b> de la période, <b>solde final</b>." },
      { title: "4. Lis le détail", body: "Pour chaque mouvement : date, journal source (VTE/ACH/BNQ/SAL/OD), n° écriture, libellé, débit, crédit, solde cumulé. Une ligne = une moitié d'écriture." },
      { title: "5. Drill-down vers la pièce", body: "Clic sur une écriture → tu accèdes à la pièce d'origine : facture client PDF, facture fournisseur scan, bulletin de paie, relevé bancaire. Audit trail complet." },
      { title: "6. Alimentation automatique", body: "Lexora alimente le grand-livre auto depuis : factures clients (VTE), factures fournisseurs (ACH), relevés banque + rapprochement (BNQ), paie verrouillée (SAL), OD manuelles (OD)." },
      { title: "7. Export pour audit", body: "PDF mis en forme ou CSV format <b>FEC</b> (Fichier des Écritures Comptables — standard utilisé par auditeurs et MRA en cas de contrôle)." },
      { title: "8. À quoi sert chaque classe", body: "Classe 1-5 = bilan (capitaux, immo, stocks, tiers, trésorerie). Classe 6-7 = compte de résultat (charges + produits). Le grand-livre matérialise tout." },
    ],
    pitfalls: [
      "Solde anormal sur 411 (client en crédit) ou 401 (fournisseur en débit) → trop-perçu/avance à régulariser.",
      "Solde non nul sur compte d'attente 47x → écriture en suspens, à investiguer avant clôture.",
      "Mouvement sans pièce justificative → flag audit. Toujours joindre un document.",
    ],
    tips: [
      "Recherche puissante dans grand-livre : <em>compte:6411 libellé:salaire montant:&gt;100000</em>.",
      "Compare évolutions : Outils → Grand-livre comparé N vs N-1 sur un compte.",
      "Pour les groupes : grand-livre consolidé groupe (Outils → Consolidation).",
      "Multinationales : grand-livre multi-devises (un compte en USD, conversion MUR à chaque mouvement).",
    ],
  },

  // ========================================================================
  // MRA HUB (priorité 3)
  // ========================================================================
  '/client/mra-hub': {
    title: 'Hub MRA — Centre de toutes tes obligations fiscales',
    audience: 'all',
    intro:
      "Vue centralisée de toutes les déclarations MRA + ROC + FSC : <b>TVA</b> (mensuelle/trimestrielle), <b>PAYE</b> + <b>CSG/NSF</b> + <b>PRGF</b> (mensuels), <b>TDS</b> (mensuelle), <b>CIT</b> annuel + <b>APS</b> trimestriels, <b>ROC Annual Return</b>, <b>FSC GBC filing</b>, <b>SFT</b> AML/CFT. Échéances et statuts en un écran. Lexora prépare automatiquement chaque déclaration, tu valides, le robot soumet ou tu charges manuellement.",
    steps: [
      { title: "1. Comprends tes obligations", body: "Selon ta société : <b>TPE</b> = TVA + PAYE/CSG/NSF + CIT + ROC. <b>PME avec immo</b> = + amortissements. <b>Société VAT-registered</b> = TVA obligatoire. <b>GBC1</b> = + FSC filing + substance CIGA + Transfer Pricing. <b>Multinationale</b> = + Pillar Two GloBE + Country-by-Country reporting." },
      { title: "2. Calendrier des échéances", body: "Liste triée par échéance proche. Codes couleur : rouge < 3j, orange < 7j, vert > 7j. Filtres par type." },
      { title: "3. Ouvre une déclaration", body: "Tu accèdes au formulaire/récap selon le type (TVA → page TVA, PAYE → page Paie, CIT → page CIT). Données pré-calculées par Lexora." },
      { title: "4. Valide et génère les fichiers", body: "Lexora produit CSV/XML conformes au format MRA. Récap PDF pour validation humaine." },
      { title: "5. Soumets à MRA", body: "Deux options : (a) <b>Manuel</b> : charge les fichiers sur eservices.mra.mu toi-même. (b) <b>Automatique</b> : le robot Playwright soumet à ta place (cf. Direction → Accès MRA)." },
      { title: "6. Paie le solde", body: "Virement à MRA via Internet Banking avec référence TAN + période. Marque <b>payée</b> dans Lexora une fois fait." },
      { title: "7. Archive", body: "Accusés de réception MRA archivés automatiquement dans Documents → MRA. Conservation 10 ans (exigence Section 6 VAT Act + ITA)." },
    ],
    pitfalls: [
      "Oublier une obligation (typique : PRGF, TDS, SFT) → pénalité automatique.",
      "Soumettre sans payer → MRA considère non-conformité jusqu'au paiement.",
      "Modifier une déclaration après dépôt → procédure d'amendement requise (formulaire spécifique).",
      "Retard répété → contrôle fiscal MRA déclenché.",
    ],
    externalLinks: [
      { label: "MRA — Portail eServices", url: "https://eservices.mra.mu", description: "Tous les modules MRA en un seul portail." },
      { label: "MRA — Calendrier fiscal", url: "https://www.mra.mu/index.php/eservices/tax-calendar", description: "Échéances officielles annuelles." },
      { label: "MRA — Tax forms", url: "https://www.mra.mu/index.php/forms-publications", description: "Formulaires officiels téléchargeables." },
      { label: "FSC Mauritius", url: "https://www.fscmauritius.org", description: "Régulateur GBC / AC / IFE." },
      { label: "FIU Mauritius (SFT)", url: "https://www.fiumauritius.org", description: "Suspicious Transactions Reports." },
    ],
    tips: [
      "Active rappels Telegram J-7 / J-3 / J-1 pour chaque échéance.",
      "Robot Playwright soumet automatiquement si Direction → Accès MRA configuré.",
      "Pour les groupes : tableau de bord consolidé des obligations toutes sociétés (Outils → Calendrier groupe).",
      "Multinationales : module Pillar Two GloBE pour Top-Up Tax 15% si CA groupe > €750M.",
    ],
  },

  // ========================================================================
  // ROC Annual Return
  // ========================================================================
  '/client/mra-roc': {
    title: 'ROC — Annual Return (Companies Act 2001)',
    audience: 'all',
    intro:
      "Toute société immatriculée à Maurice doit déposer un <b>Annual Return</b> au <b>Registrar of Companies (ROC)</b> dans les <b>28 jours suivant l'Annual General Meeting</b> (AGM). C'est le contrôle annuel de l'existence légale : actionnaires, administrateurs, siège, capital, états financiers. Frais ~2 000 MUR. Non-dépôt = pénalités + risque de radiation d'office (Section 215).",
    steps: [
      { title: "1. Tiens l'AGM annuelle", body: "AGM dans les <b>15 mois</b> après incorporation (première), puis chaque année. PV à rédiger avec : approbation des comptes, nomination/réélection administrateurs, dividendes, auditeur." },
      { title: "2. Prépare les états financiers", body: "Bilan + compte de résultat + notes annexes. Audités si seuils dépassés (CA > 50 M MUR ou actifs > 50 M MUR ou > 50 employés). Lexora génère états aux normes IFRS for SMEs." },
      { title: "3. Liste des actionnaires", body: "Form 1 (Members' Register) : nom, adresse, nb actions, % détention. À jour à la date d'AGM." },
      { title: "4. Liste des directors", body: "Identité, fonction, date de nomination, résidence. Au moins 1 director résident Maurice obligatoire." },
      { title: "5. Dépôt sur eROC", body: "Portail <b>onlinebrd.govmu.org</b>. Connecte-toi avec BRN + password. Menu <b>Annual Return</b>. Remplis ou charge le formulaire. Joins états financiers PDF." },
      { title: "6. Paye", body: "~2 000 MUR (varie selon type société). Carte bancaire ou virement. Reçu généré." },
      { title: "7. Conservation 10 ans", body: "Tu reçois confirmation officielle. Archive dans Lexora (Documents → ROC) — exigence audit." },
    ],
    pitfalls: [
      "Au-delà des 28 jours post-AGM : pénalités progressives + risque radiation Section 215.",
      "Première AGM oubliée dans 15 mois post-incorporation → société exposée à radiation.",
      "États financiers non audités alors que seuils dépassés → dépôt rejeté.",
      "Director résident Maurice manquant → société non conforme.",
      "Capital social modifié sans amendement statuts → ROC refuse.",
    ],
    externalLinks: [
      { label: "Portail eROC Maurice", url: "https://onlinebrd.govmu.org/", description: "Dépôt en ligne Annual Return + autres formulaires." },
      { label: "Companies Act 2001", url: "https://onlinebrd.govmu.org/Documents/CompaniesAct.pdf", description: "Texte intégral, Sections 215+." },
      { label: "Guide ROC", url: "https://companies.govmu.org", description: "Documentation officielle." },
    ],
    tips: [
      "Lexora génère automatiquement les états financiers à la date d'AGM.",
      "Pour les groupes : multi-sociétés, Lexora dépose en lot via robot eROC (si activé).",
      "GBC : ROC + FSC filing en parallèle, mêmes états financiers.",
      "Multinationales : Annual Return Maurice + équivalents dans chaque juridiction (Companies House UK, RCS LUX, etc.).",
    ],
  },

  // ========================================================================
  // SFT — Statement of Financial Transactions (AML/CFT)
  // ========================================================================
  '/client/mra-sft': {
    title: 'SFT — Statement of Financial Transactions (AML/CFT)',
    audience: 'comptable',
    intro:
      "Déclaration obligatoire à la <b>FIU</b> (Financial Intelligence Unit) ou MRA de certaines transactions financières : cash > 500 000 MUR, virements internationaux > 100 000 USD, schémas inhabituels (structuration, contrepartie suspecte). Régime <b>AML/CFT</b> (Anti-Money Laundering / Counter Financing of Terrorism). Délai 5 jours ouvrés après détection. Non-déclaration : amende jusqu'à 100 000 MUR + prison dirigeant.",
    steps: [
      { title: "1. Identifie les seuils légaux", body: "<b>CTR</b> (Cash Transaction Report) si cash > 500k MUR sur une opération unique ou cumul lié. <b>STR</b> (Suspicious Transaction Report) sans seuil : tout schéma inhabituel (structuration en sous-seuils, contrepartie PEP non déclarée, paysage incohérent avec activité)." },
      { title: "2. Documente pour chaque transaction", body: "Montant, parties (avec UBO si entité), motif déclaré par le client, justificatifs commerciaux, analyse de cohérence (KYC fournisseur, normalité), conclusion (suspect/non suspect + raison)." },
      { title: "3. Déclare à FIU", body: "Bouton <b>Soumettre SFT</b>. Formulaire STR ou CTR selon cas. Charge sur portail FIU. Délai <b>5 jours ouvrés</b> après détection." },
      { title: "4. Confidentialité absolue (Tipping-off)", body: "Tu ne dois <b>jamais informer le client</b> qu'une déclaration a été faite. Infraction <b>très grave</b> : Section 36 FIAMLA, prison jusqu'à 5 ans." },
      { title: "5. Conservation 7 ans", body: "Tous les documents (analyse, déclaration, échanges) conservés 7 ans minimum. Lexora archive automatiquement dans Documents → AML." },
    ],
    pitfalls: [
      "Non-déclaration → amende jusqu'à 100 000 MUR + peine de prison dirigeant.",
      "Tipping-off (informer le client) → infraction grave, prison jusqu'à 5 ans.",
      "Sous-déclaration (CTR au lieu de STR si schéma suspect) → idem que non-déclaration.",
      "Délai 5j non respecté → infraction documentée.",
    ],
    externalLinks: [
      { label: "FIU Maurice", url: "https://www.fiumauritius.org", description: "Portail STR/CTR + guides AML/CFT." },
      { label: "FIAMLA — Texte intégral", url: "https://www.fiumauritius.org/legislation", description: "Loi applicable." },
      { label: "FATF Guidance", url: "https://www.fatf-gafi.org", description: "Standards internationaux AML/CFT." },
    ],
    tips: [
      "Lexora scanne les transactions et flag celles potentiellement déclarables (heuristiques + IA).",
      "Pour les GBC : régime AML/CFT renforcé (FSC + FIU), procédures écrites obligatoires.",
      "Multinationales : module CFT cross-border avec règles locales (UE 5AMLD, US BSA, UK MLR).",
      "Forme MLRO obligatoire pour GBC : Money Laundering Reporting Officer. Lexora intègre son workflow.",
    ],
  },

  // ========================================================================
  // ÉCHÉANCES
  // ========================================================================
  '/client/echeances': {
    title: 'Échéances fiscales et sociales — Calendrier',
    audience: 'all',
    intro:
      "Calendrier de toutes les obligations : <b>VAT</b> (20 du mois suivant), <b>PAYE/CSG/NSF/PRGF</b> (20), <b>TDS</b> (20), <b>APS CIT</b> (3 mois après chaque trimestre), <b>CIT annuel</b> (6 mois après clôture), <b>ROC Annual Return</b> (28j post-AGM), <b>FSC GBC filing</b> (6 mois post-clôture). Une seule vue, pas d'oubli.",
    steps: [
      { title: "1. Vue chronologique", body: "Échéances triées par date la plus proche. < 3 jours = rouge, 3-7 jours = orange, > 7 jours = vert." },
      { title: "2. Marque comme déclaré / payé", body: "Une fois soumis ET payé, marque-le pour qu'il disparaisse du suivi." },
      { title: "3. Filtre par type", body: "TVA seule, paie seule, CIT seul, tout. Filtre par société si multi-sociétés." },
      { title: "4. Rappels automatiques", body: "Si activé : email + Telegram J-7, J-3, J-1, jour J. Avec montant à payer et lien direct portail MRA." },
      { title: "5. Vue annuelle", body: "Aperçu 12 mois : tu vois la charge globale par mois pour planifier trésorerie." },
    ],
    tips: [
      "Bot Telegram envoie des rappels J-7 / J-3 / J-1 avec montant et lien.",
      "Pour les groupes : calendrier consolidé toutes sociétés du groupe.",
      "Multinationales : calendrier multi-juridictions (Maurice + autres pays).",
    ],
  },

  // ========================================================================
  // DÉCLARATIONS SOCIALES (CSG, NSF, PRGF — détaillé)
  // ========================================================================
  '/client/declarations-sociales': {
    title: 'Cotisations sociales (CSG, NSF, PRGF)',
    audience: 'all',
    intro:
      "Cotisations sociales mensuelles obligatoires sur les salaires. <b>CSG</b> (Contribution Sociale Généralisée) remplace l'ancien NPF depuis 2020 : cat A 1,5% emp + 3% employeur (salaire ≤ 50k MUR), cat B 3% emp + 6% employeur (> 50k). <b>NSF</b> (National Savings Fund) : 1% emp + 2,5% employeur plafonné à 19 700 MUR/mois. <b>PRGF</b> (Portable Retirement Gratuity Fund) : 4,5% employeur sur salaire total (depuis 2020, remplace severance ancien régime). Échéance MRA : <b>20 du mois suivant</b>.",
    steps: [
      { title: "1. Calcule la paie", body: "RH → Paie. CSG/NSF/PRGF calculés auto sur chaque bulletin selon catégorie de l'employé." },
      { title: "2. Vérifie les bases", body: "Base = salaire brut + primes + heures sup (selon règles spécifiques à chaque cotisation)." },
      { title: "3. Verrouille la paie", body: "Action préalable au dépôt. Bulletins immutables, écritures passées (compte 4312 NSF, 4313 CSG, 4314 PRGF)." },
      { title: "4. Génère les fichiers MRA", body: "RH → Paie → Exports MRA. CSV CSG/NSF combiné + CSV PRGF séparé. Format strict : header obligatoire, colonnes ordonnées, NID 14 chiffres." },
      { title: "5. Soumets sur eservices.mra.mu", body: "Modules <b>CSG/NSF Return</b> et <b>PRGF Return</b>. Charge CSV, valide, paie solde. Référence MRA reçue." },
      { title: "6. Paie le solde", body: "Virement à MRA. Solde = CSG (emp + employeur) + NSF (emp + employeur) + PRGF (employeur)." },
    ],
    pitfalls: [
      "Erreur catégorie CSG (A vs B) → toutes les cotisations fausses.",
      "Ne pas plafonner NSF à 19 700 MUR → sur-cotisation, perte sèche.",
      "Oublier PRGF (introduit 2020) → infraction. Sauf si tu as un régime de pension privée équivalent (avec attestation FSC).",
      "Retard > 20 du mois → pénalité 5% + intérêts par mois.",
    ],
    externalLinks: [
      { label: "MRA — CSG", url: "https://www.mra.mu/index.php/employees/csg" },
      { label: "MRA — NSF", url: "https://www.mra.mu/index.php/employees/nsf" },
      { label: "PRGF", url: "https://www.prgf.mu" },
    ],
    tips: [
      "Lexora vérifie chaque mois la catégorie CSG (auto-bascule A→B si salaire dépasse 50k).",
      "Multinationales : régimes équivalents par pays (URSSAF FR, NICs UK) intégrés.",
    ],
  },

  // ========================================================================
  // GBC DASHBOARD
  // ========================================================================
  '/client/gbc-dashboard': {
    title: 'GBC — Dashboard Global Business',
    audience: 'all',
    intro:
      "Tableau de bord dédié aux sociétés <b>Global Business</b> (GBC) régulées par la <b>FSC Mauritius</b>. Vue d'ensemble : statut (GBC1 sous Partial Exemption ou Authorised Company), obligations substance (CIGA), Transfer Pricing, CRS/FATCA, UBO, Pillar Two GloBE (pour MNE > €750M), FSC filings annuels.",
    steps: [
      { title: "1. Identifie ton statut", body: "<b>GBC1</b> (Partial Exemption Regime) : 15% nominal, 80% deemed exempt sur certains revenus = 3% effectif. <b>Authorised Company (AC)</b> : 15% nominal mais souvent exempt si non-résident fiscal Maurice + activités exclues. Conditions strictes." },
      { title: "2. Substance CIGA", body: "Conditions critiques : <b>Core Income-Generating Activities</b> à Maurice. Documenter : employés qualifiés résidents (CV, contrats, paies), dépenses opérationnelles locales (loyer, conseil), tenue de conseil d'administration à Maurice (PV signés)." },
      { title: "3. Échéances clés", body: "<b>Annual Return FSC</b> : 6 mois après clôture, frais 1 750 USD (GBC1) ou 350 USD (AC). <b>Audit obligatoire</b>. <b>CIT</b> : Form 3 (GBC) déposée avec exemption documentée. <b>CbCR</b> si MNE consolidé > €750M." },
      { title: "4. Transfer Pricing", body: "Documentation TP obligatoire pour transactions intra-groupe : Master File, Local File, méthode (CUP, TNMM, Cost Plus). Conformité OECD BEPS Action 13." },
      { title: "5. CRS / FATCA", body: "Déclaration annuelle des comptes détenus par non-résidents (CRS pour OCDE, FATCA pour US). Format XML, soumission via portail FSC." },
      { title: "6. UBO (Beneficial Ownership)", body: "Registre UBO des personnes physiques détenant > 25% directement ou indirectement. Mise à jour dans 14j après changement. Lexora maintient à jour automatiquement." },
      { title: "7. Pillar Two GloBE (si applicable)", body: "Pour multinationales > €750M : Top-Up Tax 15% minimum mondial. Calculs GloBE Income, Adjusted Covered Taxes, ETR par juridiction. Lexora module dédié." },
    ],
    pitfalls: [
      "Substance CIGA insuffisamment documentée → perte du régime PER, redressement à 15% + pénalités.",
      "TP non documenté → MRA peut requalifier les prix de transfert + redressement majeur.",
      "UBO périmé → infraction Section 12 FATCA Act, amende jusqu'à 5 M MUR.",
      "AC qui devient résident fiscal par erreur (siège effectif à Maurice) → perte exemption.",
      "Pillar Two ignoré alors que MNE > €750M → top-up tax calculé par juridiction étrangère.",
    ],
    externalLinks: [
      { label: "FSC Mauritius", url: "https://www.fscmauritius.org", description: "Régulateur GBC, AC, Investment Dealer." },
      { label: "FSC — Partial Exemption Guidelines", url: "https://www.fscmauritius.org/media/55020/per-guidelines.pdf" },
      { label: "OECD BEPS", url: "https://www.oecd.org/tax/beps/", description: "Standards Transfer Pricing + Pillar Two." },
      { label: "MRA — CRS / FATCA", url: "https://www.mra.mu/index.php/eservices/automatic-exchange-of-information" },
    ],
    tips: [
      "Modules Lexora dédiés : CIGA documentation, TP Master/Local File, CRS/FATCA reporting, Pillar Two GloBE calcul.",
      "Audit annuel obligatoire pour GBC — Lexora exporte états IFRS prêts pour Big4.",
      "Holding structure multi-juridictions : Lexora gère plusieurs entités liées avec consolidation IFRS 10.",
      "Beneficial Ownership : Lexora intègre données KYC et calcule UBO en cascade.",
    ],
  },

  // ========================================================================
  // RH — DÉPART D'UN EMPLOYÉ
  // ========================================================================
  '/rh/depart': {
    title: "Départ d'un employé — Process complet",
    audience: 'all',
    intro:
      "Process de gestion d'un départ : démission, licenciement, fin de CDD, retraite, décès. Lexora calcule notice, severance (Section 70 WRA), solde de tout compte (salaire prorata + congés non pris + 13e mois prorata + severance), génère certificat de travail, fait la déclaration PAYE Exit Statement à MRA.",
    steps: [
      { title: "1. Saisis la date de départ", body: "Fiche employé → champ <em>date_depart</em>. Déclenche les calculs automatiques. Type : démission / licenciement / fin CDD / retraite / décès / rupture conventionnelle." },
      { title: "2. Notice WRA", body: "<b>Section 53 WRA 2019</b> : préavis minimum <b>30 jours</b> si ancienneté ≥ 1 an, 7 jours si < 1 an. Notice donnée OU payée si non effectuée (indemnité compensatrice)." },
      { title: "3. Calcul severance", body: "<b>Section 70 WRA</b> : indemnité = <b>3 mois × années de service</b> × salaire moyen 12 derniers mois, plafond pas explicite. Exception : retraite ≥ 60 ans = 1 mois × années (régime allégé). Lexora calcule automatiquement." },
      { title: "4. Solde de tout compte", body: "Composantes : (a) salaire prorata jusqu'à date départ, (b) congés payés non pris à indemniser, (c) 13e mois EOY prorata si départ avant décembre, (d) severance, (e) heures sup non payées. Bulletin spécial <em>Final Settlement</em>." },
      { title: "5. Certificat & déclarations", body: "Génère le <b>certificat de travail</b> (obligatoire WRA). Déclare le départ à MRA via <b>PAYE Exit Statement</b> (Form PAY11). Coupe l'enregistrement NSF." },
      { title: "6. Restitution matériel", body: "Checklist : laptop, badge, téléphone, voiture de service, accès Lexora révoqués, compte Telegram délié. À cocher dans Lexora." },
      { title: "7. Archivage", body: "Dossier employé passe en <b>Archivé</b>. Données conservées 10 ans (preuves audit + litige potentiel)." },
    ],
    pitfalls: [
      "Oublier la notice → litige Industrial Court mauricien (compétent en matière sociale).",
      "Mauvais calcul severance (oubli années partielles, pas le bon salaire moyen) → coûteux. Vérifie via WRA s.70.",
      "Ne pas faire PAYE Exit Statement → l'employé ne peut pas justifier ses revenus pour Income Tax personnel.",
      "Restitution matériel oubliée → perte d'actifs, faille sécurité (laptop avec accès données client).",
      "Licenciement sans motif valable + procédure formelle → tribunal peut requalifier en abusif, condamner société à 6-24 mois de salaire.",
    ],
    externalLinks: [
      { label: "Workers Rights Act 2019", url: "https://labour.govmu.org/Documents/Legislations/WRA2019.pdf" },
      { label: "Industrial Court Mauritius", url: "https://industrialcourt.govmu.org" },
      { label: "MRA — PAYE Exit Statement", url: "https://www.mra.mu/index.php/eservices/paye" },
    ],
    tips: [
      "Lexora propose un workflow de départ étape par étape, rien n'est oublié.",
      "Pour les ruptures conventionnelles : modèle PDF généré conforme WRA.",
      "Multinationales : règles locales par pays (US at-will, FR rupture conventionnelle, UK statutory).",
    ],
  },

  // ========================================================================
  // RH — SEVERANCE (calcul simulateur)
  // ========================================================================
  '/rh/severance': {
    title: 'Severance — Simulateur de calcul',
    audience: 'comptable',
    intro:
      "Outil de simulation de l'indemnité de fin de contrat (Section 70 WRA). Distinct de /rh/depart qui pilote le process complet — ici tu fais juste le calcul pour planifier ou provisionner. Formule : <b>3 mois × années de service × salaire moyen 12 derniers mois</b>. Cas retraite ≥ 60 ans : <b>1 mois × années</b>.",
    steps: [
      { title: "1. Paramètres", body: "Choisis employé, date d'arrivée (auto fiche RH), date de départ envisagée, motif (démission/licenciement/retraite/fin CDD)." },
      { title: "2. Calcul détaillé", body: "Lexora affiche : ancienneté en années (avec mois pro-rata), salaire moyen 12 derniers mois, multiplicateur applicable (3 ou 1), montant total." },
      { title: "3. Hypothèses variantes", body: "Teste plusieurs scenarii (départ immédiat vs dans 6 mois) pour comparer impact." },
      { title: "4. Provision IAS 19", body: "Si tu anticipes un départ : passe une provision via <b>Provisions → Severance</b>. Impact comptable : Débit 6815 Dotation provision, Crédit 1581 Provision severance." },
      { title: "5. Export", body: "PDF de simulation à présenter au CA ou consulter avec avocat avant rupture." },
    ],
    pitfalls: [
      "Confondre salaire de base et salaire moyen (qui inclut primes régulières) → sous-estimation.",
      "Oublier années partielles (8 ans 7 mois = 8,58 ans, pas 8) → écart de calcul.",
      "Retraite < 60 ans → barème classique 3 mois, pas 1 mois.",
    ],
    tips: [
      "Retraite ≥ 60 ans = différence majeure (1 mois vs 3 mois × années). Planifie les départs en conséquence.",
      "Pour un grand groupe : provision globale calculée auto pour les employés à risque de départ.",
    ],
  },

  // ========================================================================
  // RH — EOY BONUS
  // ========================================================================
  '/rh/eoy-bonus': {
    title: 'End-of-Year Bonus (13e mois) — Calcul WRA',
    audience: 'comptable',
    intro:
      "Le <b>13e mois</b> est obligatoire selon <b>Section 49 WRA 2019</b> : <b>1/12 de la rémunération annuelle par mois travaillé</b>, versé en décembre (ou prorata au départ). Concerne tous employés du privé ayant travaillé ≥ 1 mois dans l'année. Inclut salaire + allowances + primes régulières (pas exceptionnelles).",
    steps: [
      { title: "1. Éligibilité", body: "Tous employés ayant travaillé ≥ 1 mois calendaire dans l'année. CDD, saisonniers, temps partiel inclus. Stagiaires non rémunérés exclus." },
      { title: "2. Lance le calcul", body: "Bouton <b>Calculer EOY {année}</b>. Lexora applique : (rémunération annuelle totale × mois travaillés) / 12. Rémunération = salaire base + allowances + primes régulières." },
      { title: "3. Vérifie par employé", body: "Tableau avec : mois travaillés, rémunération moyenne, 13e calculé. Compare avec année précédente." },
      { title: "4. Valide et paye", body: "Bulletin EOY <b>séparé</b> du bulletin de décembre régulier. Imposable PAYE selon barème classique + CSG + NSF." },
      { title: "5. Échéance versement", body: "<b>Avant le 31 décembre</b> de l'année concernée (Section 49 WRA). Retard = infraction." },
      { title: "6. Provision mensuelle", body: "Pour les bilans intermédiaires : provision 1/12 chaque mois (Lexora le fait auto via module Provisions)." },
    ],
    pitfalls: [
      "Oublier les saisonniers / temps partiel → litige Industrial Court.",
      "Calculer sur salaire de base seulement → erreur WRA dit 'remuneration' qui inclut allowances.",
      "Verser après 31 décembre → infraction, intérêts dus à l'employé.",
      "Inclure des primes exceptionnelles dans la base → sur-estimation, perte sèche.",
    ],
    externalLinks: [
      { label: "WRA 2019 — Section 49", url: "https://labour.govmu.org/Documents/Legislations/WRA2019.pdf" },
    ],
    tips: [
      "Lexora provisionne chaque mois 1/12 dans le compte 4286 — bilan toujours juste.",
      "Pour les groupes : EOY consolidé multi-sociétés.",
      "Multinationales : équivalents locaux (gratification FR, Christmas bonus US optionnel).",
    ],
  },

  // ========================================================================
  // RH — DÉCLARATIONS MRA PAIE
  // ========================================================================
  '/rh/declarations-mra': {
    title: 'Déclarations MRA paye (PAYE, CSG, NSF, PRGF)',
    audience: 'comptable',
    intro:
      "Page de génération + soumission des fichiers MRA mensuels paye. Différence vs /client/declarations-sociales (vue produit) : ici c'est la page d'exécution dans le module paie. Workflow : verrouille la paie → génère fichiers → soumets MRA → paie le solde. Échéance fixe <b>20 du mois suivant</b>. Pénalité 5% + intérêts au-delà.",
    steps: [
      { title: "1. Pré-requis : paye verrouillée", body: "Verrouille la période dans <b>RH → Paie</b> avant de déclarer. Bulletins validés et comptabilisés." },
      { title: "2. Onglet PAYE-MRA", body: "Récap PDF + détail CSV par employé (NID, nom, brut, PAYE retenue). Format strict MRA, validation pré-export." },
      { title: "3. Onglet CSG/NSF-MRA", body: "CSV combiné employeur + employé avec catégories A/B. Plafond NSF 19 700 MUR appliqué auto." },
      { title: "4. Onglet PRGF-MRA", body: "CSV séparé. Calcul = 4,5% × brut total tous employés. Sauf si pension privée équivalente avec attestation FSC." },
      { title: "5. Soumets sur eservices.mra.mu", body: "Login → modules PAYE, CSG/NSF Return, PRGF Return. Charge les CSV. Note les références. Robot Playwright peut faire ça automatiquement (cf. Direction → Accès MRA)." },
      { title: "6. Paie", body: "Virement à MRA, référence TAN + période. Solde = PAYE + CSG (emp + employeur) + NSF (emp + employeur) + PRGF (employeur). Marque payée dans Lexora." },
    ],
    externalLinks: [
      { label: "MRA — Portail eServices", url: "https://eservices.mra.mu" },
    ],
    tips: [
      "Configure Direction → Accès MRA pour soumission auto via robot Telegram.",
      "Pour les groupes : soumission en lot multi-sociétés depuis tableau de bord cabinet.",
      "Multi-mois en retard : Lexora soumet dans l'ordre chronologique strict (MRA exige).",
    ],
  },

  // ========================================================================
  // RH — PROVISIONS CONGÉS
  // ========================================================================
  '/rh/provisions/conges': {
    title: 'Provisions congés payés (IAS 19)',
    audience: 'comptable',
    intro:
      "Provision comptable obligatoire IFRS pour les congés acquis non encore pris par les employés. Référence : <b>IAS 19 Employee Benefits</b>. Lexora calcule auto chaque mois et passe l'écriture. Critique pour le bilan : sans provision, le passif social est sous-estimé, l'audit refuse l'opinion.",
    steps: [
      { title: "1. Principe IAS 19", body: "Les congés payés acquis (1,83j/mois en AL) sont une dette envers l'employé. Tant qu'ils ne sont pas pris, c'est une provision à constituer pour respecter le principe d'image fidèle." },
      { title: "2. Calcul mensuel auto", body: "Fin de mois : pour chaque employé, jours acquis non pris × salaire journalier (1/22 du salaire mensuel) × charges patronales = provision individuelle. Total = provision globale." },
      { title: "3. Écriture automatique", body: "Débit <b>6411 Salaires</b> (charge), Crédit <b>4282 Provision congés payés</b>. Reprise inverse à la prise effective de congés (Débit 4282, Crédit 421 Personnel)." },
      { title: "4. Suivi mensuel", body: "Tableau : provision début mois + acquisitions du mois - prises du mois = provision fin mois. Évolution annuelle visible." },
      { title: "5. Audit", body: "Auditeur vérifie : nombre de jours acquis cohérent avec présence, taux journalier correct, charges patronales incluses, provision = encours réel." },
      { title: "6. Pour groupes IFRS", body: "Inclus dans <b>Other employee benefits</b> du bilan consolidé. Tu peux ventiler par société + cumul groupe (Outils → Consolidation)." },
    ],
    pitfalls: [
      "Calculer sans charges patronales → sous-estimation (oublie NSF + CSG + PRGF employeur).",
      "Oublier la reprise à la prise effective de congés → double comptabilisation.",
      "Provisionner pour des employés partis sans solder → bilan faux.",
      "Maintenir un solde de provision figé sans recalcul → erreur fondamentale.",
    ],
    tips: [
      "Lexora recalcule à chaque verrouillage de paie — pas d'effort manuel.",
      "Pour les groupes : sensibilité présentée (impact +/- 10% turnover ou taux).",
      "Multinationales : règles locales différentes (CP français 25j × 1/12, RTT, etc.) supportées.",
    ],
  },

  // ========================================================================
  // CABINET — PORTFOLIO CLIENTS
  // ========================================================================
  '/comptable/clients': {
    title: 'Portfolio clients du cabinet',
    audience: 'comptable',
    intro:
      "Tous les clients suivis par le cabinet : sociétés, tâches en cours, statut, collaborateurs assignés, honoraires en cours. Vue conçue pour gérer 5 à 500 clients efficacement. Différent du tableau de bord cabinet (KPI) — ici c'est l'annuaire opérationnel.",
    steps: [
      { title: "1. Filtre et cherche", body: "Par nom, secteur, tag (urgent, VIP, en retard), collaborateur assigné, statut (actif, en pause, perdu)." },
      { title: "2. Ouvre un client", body: "Détail : sociétés du client (un client peut avoir plusieurs sociétés), tâches du mois, dernières interactions, contacts." },
      { title: "3. Acting as", body: "Bascule en mode client : tu vois Lexora comme si tu étais le directeur. Pratique pour saisir/vérifier sans changer de session." },
      { title: "4. Assigne collaborateurs", body: "Onglet <b>Équipe</b> par client : qui fait quoi. Permissions auto selon assignation." },
      { title: "5. Honoraires", body: "Suivi du contrat cabinet : forfait mensuel, complémentaires, encours, retards de paiement." },
      { title: "6. Communication", body: "Centralise emails échangés avec ce client. Possibilité d'envoyer demandes de validation au client (signature électronique des comptes)." },
    ],
    tips: [
      "Assigne collaborateurs par client pour scoper qui voit/édite quoi (sécurité confidentialité).",
      "Tags clients personnalisables : urgent, ancien, premium, à risque.",
      "Multi-cabinets (réseau) : reporting consolidé par associé.",
    ],
  },

  // ========================================================================
  // CABINET — ÉQUIPE
  // ========================================================================
  '/comptable/equipe': {
    title: 'Équipe du cabinet',
    audience: 'comptable',
    intro:
      "Gestion des collaborateurs du cabinet : qui fait quoi, sur quels clients, avec quels droits. Time-tracking optionnel pour facturation horaire. Indispensable pour les cabinets > 3 collaborateurs.",
    steps: [
      { title: "1. Ajoute un collaborateur", body: "<b>Inviter</b>. Email, rôle (associé / senior / junior / stagiaire), assignations clients." },
      { title: "2. Assigne clients", body: "Chaque collaborateur ne voit que ses clients assignés (sauf admin/associé). Sécurité confidentialité + clarté." },
      { title: "3. Time-tracking (optionnel)", body: "Saisie temps par client/tâche. Stop-watch intégré. Reporting hebdo/mensuel par collaborateur." },
      { title: "4. Facturation horaire cabinet", body: "Conversion time-tracking → factures cabinet automatique (taux horaire par collaborateur ou par client)." },
      { title: "5. KPI productivité", body: "Heures facturables vs non, taux de récupération, clients traités, deadlines respectées." },
      { title: "6. Départ collaborateur", body: "Désactive le compte, transfère ses clients à un autre, archives accès. Historique préservé." },
    ],
    tips: [
      "Pour les associés : tableau de bord d'équipe avec marges par collaborateur.",
      "SSO SAML pour cabinets > 20 collaborateurs (intégration AD/Okta).",
      "Multi-bureaux : reporting par bureau + consolidé cabinet.",
    ],
  },

  // ========================================================================
  // ALERTES
  // ========================================================================
  '/client/alertes': {
    title: 'Alertes et notifications',
    audience: 'all',
    intro:
      "Centre d'alertes : échéances fiscales, factures en retard, documents manquants, anomalies bancaires, employés absents, contrats expirant. Granulaire par sévérité (Critique / Important / Info), avec push Telegram, email, SMS selon préférences.",
    steps: [
      { title: "1. Filtre par sévérité", body: "<b>Critique</b> (immédiat : échéance MRA J-1, facture > 60j impayée, anomalie bancaire majeure). <b>Important</b> (à traiter cette semaine). <b>Info</b> (à suivre)." },
      { title: "2. Résous une alerte", body: "Clic pour accéder à la page concernée. Disparaît une fois résolue (ou tu peux marquer 'ignorée' avec justification)." },
      { title: "3. Active Telegram push", body: "Configure dans Permissions Bot. Critiques en push immédiat. Important en récap matinal." },
      { title: "4. Personnalise les seuils", body: "Tu peux ajuster (ex: alerter à J-14 au lieu de J-7) via memory_set ou Settings → Alertes." },
      { title: "5. Historique alertes", body: "Toutes les alertes (résolues, ignorées, expirées) en archive. Utile pour audit ou rétrospective." },
    ],
    tips: [
      "Bot fait un <em>point matinal</em> à 09:00 avec récap critiques + actions du jour.",
      "Multi-sociétés : alertes filtrables par société.",
      "Multinationales : routing par pays/équipe (Maurice DAF voit Maurice, etc.).",
    ],
  },

  // ========================================================================
  // FACTURATION SETTINGS
  // ========================================================================
  '/client/facturation-settings': {
    title: 'Paramètres facturation',
    audience: 'client',
    intro:
      "Configure tout ce qui touche aux factures : numérotation, logo, conditions de paiement, relances, IBAN affichés, mentions légales, signature. Conforme aux mentions obligatoires <b>Section 20 VAT Act</b> (nom, adresse, BRN, VATRN, n° facture, date, description, base, TVA, total).",
    steps: [
      { title: "1. Numérotation", body: "Format : préfixe (ex: ACME) + AAAA + N° séquentiel (5 chiffres). Tu peux personnaliser. Chronologie stricte exigée par MRA — Lexora bloque si tu sautes." },
      { title: "2. Logo et coordonnées", body: "Upload logo PNG/JPG (recommandé 200x200px). Vérifie adresse complète, BRN, VATRN, IBAN affichés sur le PDF." },
      { title: "3. Conditions paiement par défaut", body: "Délai (30j, 60j net, etc.), mode (virement, chèque), texte affiché. Tu peux surcharger par client." },
      { title: "4. Cadence relances", body: "1ère J+7 (amicale), 2ème J+15 (ferme), 3ème J+30 (mise en demeure). Personnalise templates avec variables {{nom}}, {{montant}}, {{date}}." },
      { title: "5. Mentions légales", body: "Texte au pied de facture : conditions, intérêts de retard (1,5x taux légal Maurice si non payé), juridiction." },
      { title: "6. Signature", body: "Signature électronique ou scan signature du dirigeant pour authentifier les factures." },
    ],
    pitfalls: [
      "Mentions obligatoires manquantes → facture non opposable, MRA refuse en cas de contrôle.",
      "Numérotation non chronologique (sauter un numéro) → infraction. Lexora bloque.",
      "Changer logo en cours d'année → PDF anciens factures conservent l'ancien.",
    ],
    tips: [
      "Multilingue : factures EN/FR selon langue du client.",
      "Branding par société pour cabinets : chaque client a ses propres templates.",
      "Pour les groupes : template intra-groupe vs externe distincts.",
    ],
  },

  // ========================================================================
  // PARAMÈTRES RH
  // ========================================================================
  '/client/parametres-rh': {
    title: 'Paramètres RH',
    audience: 'all',
    intro:
      "Règles RH applicables à toute la société : congés (acquisition, reports), heures de travail, paie, jours fériés Maurice, catégories CSG. Doit refléter WRA + conventions collectives applicables.",
    steps: [
      { title: "1. Règles de congés", body: "Solde initial à l'embauche, acquisition mensuelle (AL 1,83j/mois, SL 1,25j), reports (6 mois max post-année), période d'utilisation, droits VL après 5 ans." },
      { title: "2. Heures de travail", body: "<b>45h/semaine</b> WRA standard, <b>8h/jour</b>, pauses (1h déjeuner non rémunérée). Base du calcul OT. Convention sectorielle possible (hôtellerie 48h)." },
      { title: "3. Paramètres paie", body: "Jour de paie (25 ou fin de mois courant), méthode (virement, chèque), comptes comptables par défaut (6411 salaires, 4310 net, 4311/12/13/14 cotisations)." },
      { title: "4. Jours fériés Maurice", body: "Calendrier officiel : 1 jan, 2 jan, Chinese NY, Thaipoosam Cavadee, Independence Day (12 mars), Labour Day (1 mai), Eid, Assomption, Diwali, Christmas, Boxing Day. Lexora maintient à jour." },
      { title: "5. Catégories CSG", body: "Seuil 50 000 MUR/mois pour basculer A → B. Lexora bascule automatiquement si salaire dépasse." },
      { title: "6. EOY Bonus", body: "Paramètre date de versement (1-31 dec) et base de calcul (salaire base seul ou avec allowances)." },
    ],
    tips: [
      "Si convention collective applicable (hôtellerie, manufacturing), configure les règles spécifiques.",
      "Multinationales : règles RH par pays avec calendriers locaux.",
      "Audit annuel des paramètres : Lexora alerte si paramètre obsolète vs nouvelle loi.",
    ],
  },

  // ========================================================================
  // SOCIÉTÉS
  // ========================================================================
  '/client/societes': {
    title: 'Mes sociétés',
    audience: 'client',
    intro:
      "Liste des sociétés que tu gères dans ton tenant Lexora. Bascule rapide entre sociétés (sélecteur en haut), ajout d'une nouvelle, archivage. Pour cabinet : chaque client peut avoir plusieurs sociétés (groupe avec filiales).",
    steps: [
      { title: "1. Bascule de société", body: "Sélecteur en haut. Tout Lexora filtre sur la société active (factures, banque, RH, fiscal)." },
      { title: "2. Crée une société", body: "<b>Nouvelle</b>. Nom commercial, raison sociale, BRN (9 chiffres CBRD), TAN MRA, VATRN si VAT-registered, secteur d'activité, date d'incorporation, date d'exercice (juillet-juin classique ou autre)." },
      { title: "3. Statut et type", body: "TPE / PME / GBC1 / Authorised Company / Société commerciale. Le type impacte : fiscalité (15% vs 3% effectif), exigences (audit, FSC filing, substance), modules activés." },
      { title: "4. Modifie", body: "Coordonnées, logo, paramètres fiscaux, comptes bancaires, exercice. Certaines modifs nécessitent amendement statut CBRD (capital, nom, siège)." },
      { title: "5. Archive (pas supprimer)", body: "Société qui cesse activité : <b>Archiver</b>. Données préservées 10 ans pour audit. Ne supprime jamais sauf erreur de saisie." },
      { title: "6. Groupe (parent + filiales)", body: "Définis relations : société mère, filiales détenues > 50% (consolidation IFRS 10), participations 20-50% (mise en équivalence), associées." },
    ],
    pitfalls: [
      "Ne supprime PAS une société avec écritures comptables — archive plutôt.",
      "BRN/TAN/VATRN incorrects → toutes les déclarations rejetées.",
      "Date d'exercice mal définie → bilan calé sur mauvaise période.",
    ],
    tips: [
      "Pour les groupes : tu peux gérer 50, 500, 5000 sociétés dans un même tenant. Pas de limite.",
      "Cabinets : tu peux avoir des sociétés clients à différentes phases (en cours, en pause, perdues).",
      "Multinationales : consolidation IFRS 10 automatique avec élimination intra-groupe (Outils → Consolidation).",
    ],
  },

  // ========================================================================
  // UTILISATEURS
  // ========================================================================
  '/client/utilisateurs': {
    title: 'Utilisateurs de la société — Comptes Lexora',
    audience: 'client',
    intro:
      "Qui peut accéder à cette société dans Lexora : directeurs, comptables, employés. Différent de Permissions Bot (Telegram capabilities) — ici c'est l'accès à l'interface web Lexora. Sécurité : invite par email, change rôle, désactive départ.",
    steps: [
      { title: "1. Invite un utilisateur", body: "<b>Inviter</b>. Email + rôle (Direction / Comptable / RH / Manager / Employé). Email envoyé avec lien pour créer compte." },
      { title: "2. Rôle et permissions", body: "Le rôle détermine les modules accessibles + actions autorisées. Direction = tout. Employé = sa fiche + bulletins + demande congé." },
      { title: "3. Change un rôle", body: "Édite la ligne. Effet immédiat à la prochaine connexion." },
      { title: "4. Désactive un compte", body: "Au départ d'un collaborateur : <b>Désactiver</b>. Historique préservé, accès révoqué. Pas suppression (pour audit)." },
      { title: "5. Multi-sociétés", body: "Un utilisateur peut être lié à plusieurs sociétés (cabinets, groupes). Sélecteur en haut de Lexora pour basculer." },
      { title: "6. SSO (Enterprise)", body: "Pour groupes > 50 utilisateurs : intègre SSO SAML avec ton IdP (AD, Okta, Auth0). Settings → SSO." },
    ],
    tips: [
      "Pour bot Telegram, va aussi dans Permissions Bot pour les capabilities fines.",
      "Active 2FA obligatoire (Settings → Sécurité) pour comptes Direction.",
      "Multinationales : groupes utilisateurs par BU/pays avec admin local délégué.",
    ],
  },

  // ========================================================================
  // LEX FACTURES (IA)
  // ========================================================================
  '/client/lex-factures': {
    title: 'Lex — Factures IA',
    audience: 'client',
    intro:
      "Module IA dédié à la facturation : création en langage naturel, détection d'anomalies (doublons, erreurs TVA, prix anormal client), relances intelligentes adaptées à l'historique payeur. Pour qui aime aller vite.",
    steps: [
      { title: "1. Crée en langage naturel", body: "<em>\"facture acme 50k consulting septembre\"</em> → IA extrait tout et propose brouillon. Plus rapide que formulaire." },
      { title: "2. Détection d'anomalies", body: "IA scanne tes factures et flag : doublons (même client, même montant, dates proches), erreurs TVA (taux incohérent avec catalogue), prix anormal vs historique client." },
      { title: "3. Relances intelligentes", body: "IA analyse historique paiement de chaque client (DSO moyen, retards habituels) et propose des messages personnalisés (ton, urgence)." },
      { title: "4. Prédiction encaissement", body: "IA estime la date probable d'encaissement de chaque facture en cours, basé sur l'historique. Affine ta trésorerie projetée." },
      { title: "5. Détection clients à risque", body: "IA score chaque client de 0 à 100 (risque impayé). Score > 70 = vigilance, conditions revoir." },
    ],
    tips: [
      "Idem depuis Telegram avec le bot.",
      "IA s'améliore avec ton historique — précision augmente après 3 mois d'usage.",
      "Pour les groupes : modèle entraîné sur l'historique groupe entier (plus précis).",
    ],
  },

  // ========================================================================
  // LEX OCR
  // ========================================================================
  '/client/lex-ocr': {
    title: 'Lex OCR — Reconnaissance documents',
    audience: 'client',
    intro:
      "Dépose un PDF ou photo → l'IA <b>Claude Vision</b> lit le contenu et extrait fournisseur, montants, dates, TVA, lignes détaillées. Différent de Documents (vue gestion) — ici c'est l'OCR avec extraction structurée immédiate. Idéal saisie rapide factures fournisseurs.",
    steps: [
      { title: "1. Dépose un document", body: "PDF, JPG, PNG, XLSX. Max 20 Mo. Multi-upload supporté." },
      { title: "2. IA analyse", body: "Claude Vision identifie : type (facture fournisseur, ticket, relevé, contrat), structure les champs (fournisseur, date, montants par taux TVA, lignes détaillées si tableau)." },
      { title: "3. Confiance par champ", body: "Chaque champ a un score de confiance. Haut → vert. Moyen → orange (vérifie). Bas → rouge (corrige)." },
      { title: "4. Valide ou corrige", body: "Récap proposé. 1 clic pour créer facture fournisseur (avec écriture comptable + TVA déductible) ou autre écriture." },
      { title: "5. Apprentissage", body: "Plus tu utilises, plus l'IA s'adapte à tes fournisseurs récurrents (mémorise leur format)." },
    ],
    tips: [
      "Envoie au bot Telegram → même résultat depuis ton téléphone (photo en quelques secondes).",
      "Email forwarding vers documents@ton-tenant.lexora.finance pour ingestion auto sans drag-and-drop.",
      "Multinationales : OCR multilingue FR/EN/ZH/JA/AR/etc.",
    ],
  },

  // ========================================================================
  // TAUX CHANGE
  // ========================================================================
  '/client/taux-change': {
    title: 'Taux de change — Historique et application',
    audience: 'comptable',
    intro:
      "Historique des taux de change MUR contre devises majeures (EUR, USD, GBP, ZAR, INR, etc.). Mis à jour quotidiennement à 05:30 UTC depuis sources officielles MRA + BoM. Indispensable pour : facturation en devise (IAS 21), écritures rétroactives, consolidation groupe, comptabilisation gains/pertes de change.",
    steps: [
      { title: "1. Taux du jour", body: "Cours officiels appliqués pour conversion automatique des factures émises/reçues en devise. Vue tabulaire MUR/EUR, MUR/USD, etc." },
      { title: "2. Historique", body: "Taux des derniers mois/années. Recherche par date pour les écritures rétroactives ou audit. Conformité IAS 21." },
      { title: "3. Application automatique", body: "Quand tu émets une facture en USD, Lexora applique le taux du jour automatiquement pour la valorisation MUR (compta + TVA collectée)." },
      { title: "4. Refresh manuel", body: "Bouton <b>Refresh</b> si besoin (sinon auto à 05:30 UTC chaque jour). Source : Bank of Mauritius + MRA." },
      { title: "5. Gains/pertes de change", body: "À la clôture, Lexora calcule les écarts de change sur créances/dettes en devises : passage en compte 766 (gains) ou 666 (pertes) automatique." },
      { title: "6. Functional currency (IAS 21)", body: "Si ta société tient sa compta en USD (typique GBC) plutôt qu'en MUR : Settings → Functional Currency. Conversion automatique pour reporting Maurice." },
    ],
    externalLinks: [
      { label: "MRA — Taux officiels", url: "https://www.mra.mu/index.php/exchange-rates" },
      { label: "Bank of Mauritius", url: "https://www.bom.mu/markets/exchange-rates" },
    ],
    tips: [
      "Pour GBC : functional currency USD souvent plus pertinente que MUR.",
      "Multinationales : conversion vers la devise de présentation groupe (consolidation IFRS).",
      "Module hedge accounting (IFRS 9) pour les couvertures de change.",
    ],
  },

  // ========================================================================
  // CLIENT — RAPPROCHEMENT (vue dirigeant)
  // ========================================================================
  '/client/rapprochement': {
    title: 'Rapprochement bancaire — Vue dirigeant',
    audience: 'client',
    intro:
      "Vue de pilotage du rapprochement : tu vois en un coup d'œil quels comptes sont à jour, quel est le taux de matching, quelles transactions restent en suspens et quel est l'écart résiduel solde bancaire vs solde comptable. Pas la mécanique comptable (règles R1-R7, lettrage des comptes 411/401, écritures BNQ — ça c'est <em>/comptable/rapprochement</em>), juste le statut santé. Indispensable pour valider la fiabilité du bilan avant d'engager une décision (investissement, dividende, prêt bancaire).",
    steps: [
      { title: "1. Carte de santé par compte", body: "Pour chaque compte bancaire (MCB, SBM, AfrAsia, etc.) : <b>solde scrapé</b>, <b>solde comptable Lexora</b>, <b>écart</b>, <b>% transactions rapprochées</b>, date du dernier rapprochement. Vert si écart < 1%, orange 1-5%, rouge > 5%." },
      { title: "2. Transactions en suspens", body: "Liste des transactions non encore rapprochées avec ancienneté. Au-delà de 30j, alerte : ton comptable a peut-être oublié, demande-lui." },
      { title: "3. Approuve les lots", body: "Si ton comptable a préparé un lot de matches > 95% de confiance, tu valides en bloc d'un clic. Sinon tu le laisses traiter en détail." },
      { title: "4. Pilote l'écart résiduel", body: "L'écart entre solde bancaire et comptable doit s'expliquer (chèques émis non débités, virements en cours). Lexora liste les justifications. Écart inexpliqué > 50 000 MUR = remontée Direction." },
      { title: "5. État de rapprochement officiel", body: "Génère le PDF pour ton auditeur ou ton banquier : solde comptable + transactions en suspens = solde bancaire. Signé électroniquement." },
      { title: "6. Drill vers le détail comptable", body: "Si tu veux comprendre une ligne précise, clic → tu bascules vers <b>/comptable/rapprochement</b> avec le contexte. Réservé aux profils Direction et Comptable." },
      { title: "7. Verrouille la période", body: "Quand tu es satisfait, verrouille le mois. Plus de modification possible. Le bilan publié est figé.", warning: "Avant de verrouiller, vérifie qu'aucune transaction n'est restée en suspens depuis plus de 60 jours." },
    ],
    pitfalls: [
      "Verrouiller un mois avec un écart inexpliqué > 5% → le bilan publié est faux, l'auditeur émet une réserve.",
      "Approuver en bloc des matches < 90% de confiance → erreurs de lettrage qui se révèlent au bilan suivant.",
      "Ignorer des transactions en suspens depuis 90j → c'est souvent une fraude ou un oubli de comptabilisation.",
      "Confondre cette page (statut) avec /comptable/rapprochement (action) → tu cherches le bouton lettrer, il n'est pas ici.",
    ],
    tips: [
      "Active l'alerte Telegram <em>écart bancaire</em> : tu reçois un push si l'écart dépasse ton seuil.",
      "Pour les groupes : tableau de bord consolidé multi-sociétés avec taux de rapprochement global.",
      "Multinationales : KPI <em>reconciliation maturity</em> par BU pour benchmark interne.",
    ],
  },

  // ========================================================================
  // CLIENT — CONTRATS JURIDIQUES
  // ========================================================================
  '/client/contrats': {
    title: 'Contrats juridiques — Assistant IA',
    audience: 'client',
    intro:
      "Module de génération et de gestion des contrats juridiques mauriciens, basé sur le <b>Code Civil Mauricien</b> (Loi de 1808, transposition Code Napoléon, articles 1101 à 1369 sur les obligations contractuelles) et le <b>Workers' Rights Act 2019</b> pour les contrats de travail. L'assistant IA propose <b>32 modèles</b> : bail commercial/résidentiel, CDI, CDD, NDA, vente immobilière, contrat de mission, prestation de services, mandat, prêt, caution, pacte d'associés, cession de parts, etc. Génération en moins de 2 minutes avec clauses adaptées à ton secteur.",
    steps: [
      { title: "1. Choisis le type de contrat", body: "Catalogue 32 types groupés en 5 familles : <b>Travail</b> (CDI, CDD, stage, freelance), <b>Immobilier</b> (bail commercial/résidentiel, vente, location-vente), <b>Commercial</b> (prestation, distribution, agence), <b>Société</b> (pacte associés, cession parts, augmentation capital), <b>Confidentialité</b> (NDA, non-concurrence, propriété intellectuelle)." },
      { title: "2. Renseigne les parties", body: "Sélectionne contractants depuis Contacts (auto-rempli : BRN, adresse, représentant). Pour personne physique : NID Maurice + adresse + qualité (dirigeant, salarié, propriétaire)." },
      { title: "3. Paramètres spécifiques", body: "Selon le type : montant, durée, lieu d'exécution, juridiction (tribunaux mauriciens compétents par défaut). L'IA propose les clauses standards et flagge les options sensibles (non-concurrence, exclusivité)." },
      { title: "4. Clauses légales obligatoires", body: "L'IA injecte automatiquement les clauses imposées par la loi : <b>WRA s.5-12</b> pour contrats de travail (durée, rémunération, congés, préavis), <b>Code Civil art.1709-1762</b> pour louages d'immeuble, <b>Companies Act 2001 s.190</b> pour pactes d'associés.", warning: "Une clause illégale (renonciation à des droits non négociables WRA) rend tout le contrat nul. Lexora bloque." },
      { title: "5. Personnalise et révise", body: "Éditeur WYSIWYG. L'IA propose <b>amélioration / simplification / durcissement</b> de chaque clause sur demande. Suivi des modifications activé." },
      { title: "6. Valide juridiquement", body: "Bouton <b>Revue IA</b> : Claude analyse le contrat final, détecte incohérences, clauses manquantes, risques. Pour > 1 M MUR ou cas sensible, demande revue avocat externe (intégration <b>Lex Avocats Maurice</b> en option)." },
      { title: "7. Signature électronique", body: "Envoi pour signature électronique conforme <b>Electronic Transactions Act 2000</b>. SMS/email aux signataires, suivi temps réel. PDF final horodaté." },
      { title: "8. Archivage et alertes", body: "Stocké dans <b>Documents</b> avec tags. Alertes auto : fin de bail J-90, renouvellement CDD J-30, échéance NDA J-365. Pas de contrat oublié." },
    ],
    pitfalls: [
      "Bail commercial sans clause d'indexation → loyer figé 9 ans, perte sèche bailleur. Lexora propose l'indice CCI Maurice.",
      "CDD sans motif valable (Section 17 WRA : 4 motifs limitatifs) → requalification en CDI + dommages.",
      "NDA sans durée limitée et périmètre défini → réputé non écrit par les tribunaux mauriciens.",
      "Clause de non-concurrence sans contrepartie financière → invalide. Indemniser obligatoirement (Cour Suprême 2019).",
      "Oublier la juridiction → litiges potentiellement portés à l'étranger, coûteux. Précise <em>tribunaux mauriciens</em>.",
    ],
    externalLinks: [
      { label: "Code Civil Mauricien", url: "https://mauritiusassembly.govmu.org/Documents/Acts/MauritiusCivilCode.pdf", description: "Articles 1101 à 1369 — obligations et contrats." },
      { label: "Workers' Rights Act 2019", url: "https://mauritiusassembly.govmu.org/Documents/Acts/WRA2019.pdf", description: "Contrats de travail mauriciens." },
      { label: "Electronic Transactions Act 2000", url: "https://mauritiusassembly.govmu.org/Documents/Acts/ETA2000.pdf", description: "Signature électronique légale." },
      { label: "Bar Council Mauritius", url: "https://barcouncil.mu", description: "Annuaire avocats pour revue externe." },
    ],
    tips: [
      "Pour les groupes : bibliothèque de modèles personnalisés (clauses-types validées par l'avocat).",
      "Multinationales : modèles par juridiction (Maurice, France OHADA, UK common law) avec choix automatique selon parties.",
      "Active la revue automatique trimestrielle des contrats en vigueur : Lexora flagge ceux à renégocier.",
      "Bot Telegram : <em>\"génère NDA pour fournisseur X\"</em> → brouillon prêt en 60 secondes.",
    ],
  },

  // ========================================================================
  // CLIENT — CATALOGUE PRODUITS / SERVICES
  // ========================================================================
  '/client/catalogue': {
    title: 'Catalogue produits et services',
    audience: 'client',
    intro:
      "Référentiel des produits et services facturables : désignation, prix unitaire HT, taux de TVA, code interne, compte de produit (classe 7). Sert à accélérer la facturation (sélection en 2 clics au lieu de tout retaper), à uniformiser les libellés sur les factures et à garantir la cohérence des taux de TVA (15% / 0% zero-rated / exempt selon VAT Act 1998 Schedules).",
    steps: [
      { title: "1. Crée un article", body: "<b>Nouveau</b>. Code interne (ex: CONS-DEV), désignation (telle qu'elle apparaîtra sur la facture), prix HT MUR, taux TVA (15% / 0% / exempt), compte produit (706 prestations, 707 ventes, 708 produits annexes)." },
      { title: "2. Catégorise", body: "Tags : famille (services, marchandises, abonnements), saisonnier oui/non, actif/archivé. Filtres puissants pour catalogue > 100 lignes." },
      { title: "3. Multi-devises", body: "Prix de base MUR + prix figés en USD/EUR pour les exports. Sinon Lexora convertit au taux du jour à la facturation (IAS 21)." },
      { title: "4. Cas TVA zero-rated", body: "Exportation marchandises, transport international, biens Schedule 2 VAT Act → <b>0%</b> avec déduction amont. Joins justificatif douane à l'article pour audit.", warning: "Si tu mets 0% sans justification, MRA requalifie à 15% en contrôle + 5% pénalité + intérêts." },
      { title: "5. Cas TVA exempt", body: "Riz, farine, médicaments essentiels, location résidentielle, services bancaires, soins médicaux, éducation → <b>exempt</b>. Pas de TVA collectée mais pas de déduction amont non plus." },
      { title: "6. Import en masse", body: "CSV : code, désignation, prix, TVA, compte. Idéal pour catalogue venant d'un ERP/Excel. Template fourni dans Aide → Imports." },
      { title: "7. Lien à la facture", body: "Dans <b>Nouvelle facture</b>, recherche par code ou désignation, ajout en 1 clic. Tarifs surchargeables ponctuellement (remise client)." },
      { title: "8. Historique prix", body: "Toute modification de prix est tracée. Tu peux générer un rapport <em>évolution prix sur 12 mois</em> pour piloter la marge." },
    ],
    pitfalls: [
      "Doublon de codes (CONS-DEV et CONS_DEV) → confusion en facturation. Active la déduplication.",
      "Mauvais taux TVA sur un article récurrent → minoration TVA collectée sur des centaines de factures, redressement énorme.",
      "Compte produit incorrect (706 au lieu de 707) → CA mal ventilé, analytique faussée.",
      "Article supprimé alors qu'il est référencé dans des factures historiques → libellé conservé sur les anciennes mais erreur à l'audit.",
      "Prix non actualisés depuis 2 ans → marge érodée. Programme une revue annuelle.",
    ],
    externalLinks: [
      { label: "MRA — VAT Schedules 1 et 2", url: "https://www.mra.mu/download/VATAct.pdf", description: "Liste exonérations et zero-rated officielle." },
    ],
    tips: [
      "Active le mode <em>recherche fuzzy</em> : tu tapes <em>consultance</em> et Lexora trouve <em>CONS-DEV Conseil développement</em>.",
      "Pour les groupes : catalogue groupe + surcharges par société (utile cabinet conseil multi-pays).",
      "Multinationales : codes <em>HS Code</em> douaniers pour les biens exportés, ventilation par pays automatique.",
      "Bot Telegram : <em>\"facture acme 3 jours CONS-DEV\"</em> → utilise directement le tarif du catalogue.",
    ],
  },

  // ========================================================================
  // CLIENT — BANQUE (vue dirigeant multi-comptes)
  // ========================================================================
  '/client/banque': {
    title: 'Banque — Vue d ensemble multi-comptes',
    audience: 'client',
    intro:
      "Tableau de bord trésorerie multi-banques : soldes consolidés en temps réel (MCB, SBM, AfrAsia, ABC, MauBank, Bank One), alertes seuils, virements sortants en attente d'approbation, projections de trésorerie à 30/60/90 jours. Différent de <em>/comptable/banque</em> (qui gère les écritures BNQ, le journal et le lettrage) et de <em>/client/rapprochement</em> (statut du matching). Ici tu pilotes le <b>cash</b> sur tous tes comptes en un écran.",
    steps: [
      { title: "1. Vision consolidée", body: "Cartes par compte : nom banque, IBAN masqué, devise, solde actuel scrapé, solde 30j moyen, variation J-1. Total consolidé en MUR (conversion auto pour les comptes USD/EUR via taux du jour)." },
      { title: "2. Alertes de seuil", body: "Configure pour chaque compte : seuil bas (ex: < 100 000 MUR → push Telegram), seuil haut (> 5 M MUR → suggère placement à terme). Auto-évaluation des opportunités." },
      { title: "3. Virements en attente", body: "Liste des virements préparés par le comptable, en attente de validation Direction (workflow à 2 niveaux). Approuve/refuse en 1 clic avec MFA (Telegram OTP)." },
      { title: "4. Projection 30/60/90j", body: "Lexora projette le solde futur en intégrant : factures clients à échéance (encaissements attendus), factures fournisseurs (décaissements), salaires (J+25 ou fin de mois), échéances MRA (J+20). Vert si positif, rouge si tu vas être à découvert." },
      { title: "5. Drill par compte", body: "Clic sur une carte → dernières transactions, en clair (sortie / entrée), avec lettrage déjà fait par le comptable. Tu ne vois PAS les écritures, juste le mouvement." },
      { title: "6. Export pour banquier", body: "PDF synthèse multi-comptes pour réunion banquier (négociation découvert, crédit, placement). Mise en forme professionnelle." },
      { title: "7. Multi-devises", body: "Affichage en MUR + devise d'origine. Sensibilité change : si EUR baisse de 5%, impact sur ta trésorerie groupe estimé." },
    ],
    pitfalls: [
      "Confondre solde scrapé (banque) et solde comptable (Lexora) : le scrapé est la vérité, le comptable peut accuser un retard de saisie.",
      "Ignorer une alerte seuil bas → découvert non négocié = agios à 1,5% / mois.",
      "Ne pas activer la double validation des virements > seuil → risque fraude (cas réel courant : faux mail dirigeant).",
      "Oublier les retenues fiscales pendantes (PAYE, CSG, NSF, TVA) dans la projection → faux sentiment de trésorerie.",
    ],
    externalLinks: [
      { label: "MCB Internet Banking", url: "https://ibank.mcb.mu" },
      { label: "SBM Internet Banking", url: "https://internetbanking.sbmgroup.mu" },
      { label: "Bank of Mauritius — Statistiques", url: "https://www.bom.mu" },
    ],
    tips: [
      "Active la <em>position de groupe</em> si tu pilotes plusieurs sociétés : tu vois la trésorerie consolidée au niveau holding.",
      "Bot Telegram : <em>\"point trésorerie\"</em> → récap multi-comptes envoyé à 09:00 chaque jour.",
      "Pour les multinationales : agrégation cash multi-pays avec conversion USD reporting groupe (IFRS).",
      "Lien rapide vers <b>/comptable/rapprochement</b> si tu vois un écart anormal — donne mandat au comptable d'enquêter.",
    ],
  },

  // ========================================================================
  // CLIENT — TVA (vue dirigeant)
  // ========================================================================
  '/client/tva': {
    title: 'TVA — Vue dirigeant',
    audience: 'client',
    intro:
      "Vue de pilotage TVA pour le dirigeant : combien tu dois payer ce mois, statut de la déclaration (préparée / soumise / payée), échéance MRA, comparaison historique. Pas la mécanique comptable (calcul Schedule A/B, génération VAT3, écritures TVA collectée/déductible — ça c'est <em>/comptable/tva</em>), juste l'essentiel pour décider et provisionner le cash. Cadre légal : <b>VAT Act 1998</b>, taux standard <b>15%</b>, échéance <b>20 du mois suivant</b>.",
    steps: [
      { title: "1. Le chiffre clé du mois", body: "Solde TVA à payer (TVA collectée - TVA déductible). Vert si < 100 000 MUR, orange < 500 000, rouge > 500 000. Provisionne le cash en conséquence." },
      { title: "2. Statut de la déclaration", body: "<b>Brouillon</b> (comptable travaille), <b>Prête</b> (à valider Direction), <b>Soumise</b> (MRA accusé reçu), <b>Payée</b> (virement effectué). Chaque transition envoie notification Telegram." },
      { title: "3. Échéance MRA", body: "Date butoir : 20 du mois suivant pour VAT3 (mensuelle si CA > 10 M MUR/an), 20 du mois suivant fin de trimestre pour VAT4. Compte à rebours visible.", warning: "Retard = <b>pénalité 5% du solde dû + 0,5% par mois d'intérêts</b>. Pour 1 M MUR de TVA, ça fait 50 000 MUR de pénalité instantanée." },
      { title: "4. Tendance 12 mois", body: "Graphique TVA collectée vs déductible vs solde mensuel. Détecte les anomalies : pic inhabituel (gros contrat ?), creux suspect (facturation oubliée ?)." },
      { title: "5. Comparaison historique", body: "Mois actuel vs même mois N-1. Si écart > 30%, Lexora alerte (changement activité réel ou erreur dans la saisie ?)." },
      { title: "6. Validation 1 clic", body: "Si tu fais confiance à ton comptable : bouton <b>Valider et soumettre</b> avec MFA Telegram. Robot Playwright dépose sur eservices.mra.mu, paie reste à ta main." },
      { title: "7. Suivi paiement", body: "Une fois soumise, l'app affiche les coordonnées de virement (référence TAN + période). Marque payée quand le virement est exécuté. Bouton de matching automatique avec relevé bancaire." },
    ],
    pitfalls: [
      "Valider sans vérifier le récap → tu signes une erreur du comptable. Survole au moins les totaux et le ratio TVA/CA.",
      "Oublier de payer même après soumission → pénalités courent quand même. La soumission n'est pas le paiement.",
      "Provisionner pas assez de cash pour le 20 → découvert le jour J = agios + image dégradée auprès de la banque.",
      "Ignorer la tendance : un solde qui monte continuellement peut signaler de la TVA déductible perdue (factures fournisseurs non saisies).",
    ],
    externalLinks: [
      { label: "MRA — Portail eServices", url: "https://eservices.mra.mu", description: "Suivre l'accusé de soumission et payer." },
      { label: "VAT Act 1998", url: "https://www.mra.mu/download/VATAct.pdf", description: "Loi de référence." },
    ],
    tips: [
      "Active l'alerte Telegram J-7 / J-3 / J-1 : tu reçois rappel avec montant et lien direct vers la page.",
      "Pour les groupes : tableau de bord TVA multi-sociétés en un écran, total consolidé à payer.",
      "Multinationales : conversion en USD/EUR pour reporting groupe + sensibilité aux taux de change.",
      "Si ton solde TVA est systématiquement créditeur (export pur), demande remboursement annuel via VAT22 — discute avec ton comptable.",
    ],
  },

  // ========================================================================
  // CLIENT — INCOME TAX RETURN FORM 3
  // ========================================================================
  '/client/it-form3': {
    title: 'Income Tax Return Form 3 — Personnes physiques',
    audience: 'client',
    intro:
      "La déclaration d'<b>Income Tax Return Form 3</b> (IT Form 3) est l'obligation annuelle des personnes physiques résidentes fiscales mauriciennes, en application de la <b>Section 95 Income Tax Act 1995 (ITA)</b> et des <b>Income Tax (Returns) Regulations</b>. Concerne dirigeants/actionnaires/salariés rémunérés par la société : déclare revenus mondiaux, déductions (intérêts immobiliers, médical, education, EDB), calcule l'impôt dû et solde après PAYE déjà retenu. Échéance : <b>30 septembre</b> de l'année suivant l'exercice fiscal (jul-juin) ou <b>15 octobre</b> en cas de dépôt électronique.",
    steps: [
      { title: "1. Vérifie ton statut", body: "Résident fiscal mauricien si tu passes <b>≥ 183 jours/an</b> à Maurice OU <b>≥ 270 jours sur 3 ans cumulés</b> (ITA s.73). Non-résident : seulement revenus de source mauricienne. Lexora calcule auto à partir de tes voyages déclarés." },
      { title: "2. Renseigne ton TAN personnel", body: "Tax Account Number personnel (différent du TAN société) : 1 lettre + 9 chiffres, obtenu sur eservices.mra.mu lors du premier enregistrement personne physique. Sans TAN, pas de dépôt.", warning: "Ne confonds pas TAN personnel et TAN société. Erreur = rejet automatique MRA + amende 5 000 MUR." },
      { title: "3. Récap des revenus", body: "<b>Salaires</b> (auto depuis ta paie Lexora si tu es employé de la société), <b>dividendes</b> (exemptés à Maurice depuis 2007 pour résidents — Section 7), <b>intérêts bancaires</b> (exemptés < 200 000 MUR/an), <b>revenus locatifs</b> nets, <b>revenus étrangers</b> (rapatriés ou non — ITA s.74)." },
      { title: "4. Déductions Income Exemption Threshold (IET)", body: "Catégorie A célibataire sans dépendant : <b>325 000 MUR</b>. B (1 dépendant) : 435 000. C (2) : 535 000. D (3) : 600 000. E (4+) : 660 000. F (retraité) : 380 000. Lexora calcule selon ta situation familiale." },
      { title: "5. Déductions spécifiques", body: "<b>Intérêts hypothécaires</b> résidence principale (plafond 300 000 MUR/an), <b>frais médicaux</b> (plafond 20 000 MUR/dépendant), <b>frais scolaires</b> (jusqu'à 135 000 MUR/enfant pour tertiaire), <b>dons</b> à œuvres approuvées MRA, <b>cotisations retraite privée</b> (jusqu'à 50 000 MUR)." },
      { title: "6. Barème PAYE applicable", body: "<b>Solidarity Levy</b> 25% si revenu > 3 M MUR/an. Barème principal 2025-2026 : 0% jusqu'à 390 000 MUR, 2% jusqu'à 430 000, 4% jusqu'à 470 000, 6% jusqu'à 530 000, 8% jusqu'à 645 000, 10% jusqu'à 800 000, 12% jusqu'à 980 000, 14% jusqu'à 1,16 M, 16% jusqu'à 1,52 M, 18% jusqu'à 1,88 M, <b>20%</b> au-delà." },
      { title: "7. PAYE déjà retenu", body: "Reprend le total PAYE retenu par l'employeur (info disponible sur ton Statement of Emoluments fourni par la société avant 15 août). Lexora le pré-remplit auto si tu es salarié dans le tenant." },
      { title: "8. Solde à payer ou remboursement", body: "Solde = Impôt dû - PAYE retenu - APS (Advance Payment System si applicable). Si positif : à payer avant 30 septembre (ou 15 octobre dépôt électronique). Si négatif : remboursement MRA sous 60j." },
      { title: "9. Dépose sur eservices.mra.mu", body: "Login avec TAN personnel + mot de passe. Module <b>Income Tax Return</b> → <b>Form 3</b>. Charge le PDF généré par Lexora. Note la référence MRA, c'est ton accusé légal." },
      { title: "10. Archive et conserve 5 ans", body: "Conservation obligatoire <b>5 ans</b> (ITA s.96). Lexora archive auto avec horodatage. En cas de contrôle, tu produis en 1 clic." },
    ],
    pitfalls: [
      "Oublier les revenus étrangers (intérêts, dividendes UK, immobilier France) → contrôle MRA = redressement + 50% pénalité + intérêts. Maurice échange via CRS avec 110+ pays.",
      "Mauvaise catégorie IET (oublier un enfant à charge ou inversement compter un majeur) → différence d'impôt jusqu'à 300 000 MUR.",
      "Retard de dépôt → pénalité <b>2 000 MUR</b> + 5% du solde dû + 0,5% intérêts mensuels (ITA s.122).",
      "Confondre dépôt et paiement : déposer ne suffit pas, paye avant l'échéance.",
      "Sous-estimer revenu si tu es dirigeant rémunéré par dividendes <em>déguisés</em> en remboursements de compte courant → requalification + Solidarity Levy.",
      "Oublier APS (Advance Payment) si revenu > 4 M MUR/an : 4 acomptes trimestriels obligatoires.",
    ],
    externalLinks: [
      { label: "Income Tax Act 1995", url: "https://mauritiusassembly.govmu.org/Documents/Acts/IncomeTaxAct1995.pdf", description: "Section 95 et suivants." },
      { label: "Income Tax (Returns) Regulations", url: "https://www.mra.mu/download/IncomeTaxReturnsRegulations.pdf", description: "Modalités pratiques de dépôt." },
      { label: "MRA — Form 3 Guide", url: "https://www.mra.mu/index.php/individual/income-tax-return", description: "Guide officiel personnes physiques." },
      { label: "MRA — Income Exemption Threshold (IET)", url: "https://www.mra.mu/index.php/taxes-duties/individual/ind-income-exemption-threshold", description: "Catégories A à F mises à jour annuelles." },
      { label: "ROC — Companies Act 2001", url: "https://mauritiusassembly.govmu.org/Documents/Acts/CompaniesAct2001.pdf", description: "Pour dirigeants : obligations de transparence." },
    ],
    tips: [
      "Bot Telegram : <em>\"prépare mon Form 3\"</em> → Lexora génère le brouillon, tu valides depuis ton mobile.",
      "Pour dirigeants de groupes : multi-tenants supportés, un seul Form 3 consolide tous tes revenus déclarés Maurice.",
      "Multinationales : si tu es résident fiscal Maurice mais avec sources étrangères, vérifie les <b>conventions fiscales bilatérales</b> (Maurice en a > 45) pour éviter double imposition.",
      "Module <b>Lex Tax Optimizer</b> (premium) : simule ton impôt pour 3 scenarii (salaire élevé vs salaire + dividendes vs salaire + remboursement frais), choisis le plus optimal légalement.",
    ],
  },

  // ========================================================================
  // RH — JURIDIQUE
  // ========================================================================
  '/rh/juridique': {
    title: 'Juridique RH — Contrats, ruptures, contentieux',
    audience: 'comptable',
    intro:
      "Centre de gestion juridique RH : génération et suivi des contrats de travail (CDI, CDD, stage, freelance), avenants (modification salaire, fonction, durée du travail), procédures de rupture (démission, licenciement disciplinaire/économique, rupture conventionnelle, fin CDD), contentieux Industrial Court. Tout est conforme <b>Workers' Rights Act 2019</b> et jurisprudence Cour Suprême de Maurice. Indispensable pour éviter requalifications, dommages-intérêts (jusqu'à 24 mois de salaire) et amendes du Ministère du Travail.",
    steps: [
      { title: "1. Contrat initial WRA-conforme", body: "Modèles CDI / CDD / stage / freelance préchargés avec clauses obligatoires <b>Section 5 WRA</b> : identité parties, date d'entrée en fonction, lieu de travail, fonction, durée hebdo, rémunération, période d'essai, préavis, juridiction." },
      { title: "2. Avenants", body: "Toute modification substantielle (salaire, fonction, durée travail, lieu) doit faire l'objet d'un avenant signé. Sans accord employé, l'employeur ne peut imposer (sauf cas exceptionnel article 38 WRA). Lexora génère, suit la signature, archive." },
      { title: "3. Procédure disciplinaire (Section 64-69 WRA)", body: "Faute → <b>convocation écrite</b> 24h à 7j avant entretien → <b>entretien préalable</b> avec représentation possible → <b>notification sanction</b> écrite motivée. Sanctions : avertissement, blâme, mise à pied, licenciement. Lexora pilote chaque étape avec tampons horodatés.", warning: "Sauter une étape ou délai non respecté = licenciement abusif systématique au tribunal. Coût : 6 à 24 mois de salaire en dommages." },
      { title: "4. Licenciement économique (Section 72A WRA)", body: "Justification : difficulté économique réelle (CA en chute, restructuration, fermeture). Procédure : <b>notification Ministère du Travail 30j avant</b>, recherche de reclassement, ordre des licenciements (ancienneté, charges famille, perf). Severance + notice." },
      { title: "5. Rupture conventionnelle", body: "Accord mutuel formalisé : convention écrite signée, indemnité ≥ severance légale, homologation Ministère du Travail. Évite le contentieux. Lexora génère convention conforme." },
      { title: "6. Contentieux Industrial Court", body: "En cas d'assignation : centralisation pièces (contrat, avenants, paie, sanctions, correspondances), constitution dossier, choix avocat (annuaire intégré), suivi audiences, provisionnement IFRS IAS 37 du litige." },
      { title: "7. Mises à jour WRA", body: "Lexora suit les amendements WRA (2022, 2024) et flagge les contrats à mettre à jour : ex. obligation Vacation Leave 22j après 5 ans, EOY bonus inclusif allowances, etc." },
      { title: "8. Audit juridique annuel", body: "Bouton <b>Audit RH</b> : Lexora vérifie chaque dossier employé pour conformité WRA. Rapport PDF avec écarts à corriger (clause manquante, sanction non motivée, etc.)." },
    ],
    pitfalls: [
      "Licenciement verbal ou par SMS → nul de plein droit, requalification + dommages 12 mois de salaire minimum.",
      "Procédure disciplinaire sans entretien préalable → licenciement abusif systématique.",
      "CDD renouvelé > 2 fois ou > 24 mois cumulés (Section 19 WRA) → requalification automatique en CDI.",
      "Non-déclaration au Ministère du Travail pour licenciement collectif > 10 personnes → amende jusqu'à 100 000 MUR + nullité.",
      "Oublier de provisionner un contentieux probable (IAS 37) → bilan trompeur, auditeur émet réserve.",
      "Clause de non-concurrence sans contrepartie financière → invalide depuis arrêt Cour Suprême 2019.",
    ],
    externalLinks: [
      { label: "Workers' Rights Act 2019 (texte intégral)", url: "https://mauritiusassembly.govmu.org/Documents/Acts/WRA2019.pdf", description: "Texte de référence." },
      { label: "Ministère du Travail Maurice", url: "https://labour.govmu.org", description: "Déclarations licenciement, conventions, conseil." },
      { label: "Industrial Court Mauritius", url: "https://industrialcourt.govmu.org", description: "Juridiction compétente litiges travail." },
      { label: "Bar Council Mauritius", url: "https://barcouncil.mu", description: "Annuaire avocats spécialisés droit social." },
      { label: "Mauritius Employers' Federation", url: "https://mef.mu", description: "Conseil patronal, modèles, jurisprudence." },
    ],
    tips: [
      "Active la <em>revue juridique trimestrielle</em> : Lexora flagge les contrats CDD à échéance, sanctions à archiver, contentieux à provisionner.",
      "Pour les groupes : harmonisation des règles juridiques RH inter-sociétés via gabarits validés siège.",
      "Multinationales : moteur de comparaison <em>droit social par pays</em> (Maurice WRA, France code du travail, UK ERA 1996) pour mobilités internationales.",
      "Bot Telegram : <em>\"audit juridique RH\"</em> → rapport synthétique en PDF, escalation auto vers Direction si écart majeur.",
    ],
  },

  // ========================================================================
  // RH — GROUPES D'EMPLOYÉS
  // ========================================================================
  '/rh/groupes': {
    title: "Groupes d'employés — Équipes, départements, scope",
    audience: 'all',
    intro:
      "Organisation hiérarchique des employés en groupes : <b>départements</b> (Finance, Commercial, Production, IT, RH), <b>équipes</b> (sous-départements), <b>scope managers</b> (qui voit/gère qui dans Lexora et Telegram), <b>hiérarchie de validation</b> (qui approuve quoi : congés, frais, virements). Fondation pour la délégation propre, la confidentialité des données salariales (Section 51 WRA : confidentialité paye) et la scalabilité (groupe > 50 employés).",
    steps: [
      { title: "1. Crée un département", body: "<b>Nouveau département</b>. Nom, code (FIN, COM, IT, etc.), responsable (un employé déjà créé), budget annuel optionnel pour suivi analytique. Centre de coût lié automatiquement (compta analytique)." },
      { title: "2. Crée une équipe (sous-groupe)", body: "Dans le département : <b>Nouvelle équipe</b>. Nom, team lead, scope (clients, produits, zone géographique). Hiérarchie 3 niveaux supportée : société → département → équipe → employé." },
      { title: "3. Affecte les employés", body: "Drag-and-drop ou multi-sélection. Un employé = 1 département principal + 0-N équipes secondaires (matrices possibles). Date d'effet de l'affectation tracée." },
      { title: "4. Configure le scope manager", body: "Pour chaque manager : <b>quels employés voit-il ?</b> (équipe directe, descendants, tous). <b>Que peut-il approuver ?</b> (congés ≤ 5j, frais ≤ 10 000 MUR, paies non). Granularité fine." },
      { title: "5. Hiérarchie de validation", body: "Workflow par type : congé > 5j → team lead → DRH. Frais > 50 000 MUR → manager → DAF. Virement > 500 000 MUR → comptable → Direction → MFA Telegram. Chaque étape tracée." },
      { title: "6. Confidentialité salariale", body: "Section 51 WRA : la rémunération est confidentielle. Lexora masque par défaut le salaire des autres employés à tout manager (sauf DRH et Direction). Activation au cas par cas (besoin métier prouvé).", warning: "Une violation de confidentialité paye expose l'employeur à dommages-intérêts. Ne sur-attribue jamais les droits de visibilité salaire." },
      { title: "7. Mobilité interne", body: "Changement de département / équipe sans rupture d'ancienneté. Avenant auto généré (Section 38 WRA si modification substantielle requiert accord employé). Historique préservé pour calcul severance." },
      { title: "8. Reporting par groupe", body: "KPIs RH ventilés par département/équipe : effectif, masse salariale, turnover, absentéisme, taux OT. Comparaisons inter-équipes pour identifier les zones à risque." },
    ],
    pitfalls: [
      "Manager avec scope trop large (voit toute la société) → fuite info salaire, conflit RH, démissions.",
      "Hiérarchie de validation non configurée → tout remonte au DAF qui devient goulot d'étranglement.",
      "Affectation rétroactive sans avenant → contestation employé (modification substantielle non consentie).",
      "Suppression d'un département actif sans réaffectation → employés sans manager, paie en suspens.",
      "Oublier de relier le département à un centre de coût analytique → analyse de marge par BU impossible.",
    ],
    externalLinks: [
      { label: "Workers' Rights Act 2019 — Section 38 et 51", url: "https://mauritiusassembly.govmu.org/Documents/Acts/WRA2019.pdf", description: "Modification substantielle et confidentialité paye." },
    ],
    tips: [
      "Active le <em>org chart visuel</em> (Settings → Affichage) : trombinoscope hiérarchique cliquable.",
      "Pour les groupes : organisation matricielle multi-sociétés (un employé peut être dans plusieurs entités du groupe avec contrats différents).",
      "Multinationales : groupes <em>cross-border</em> avec règles locales WRA Maurice / code travail FR / ERA UK automatiquement appliquées par localisation.",
      "Bot Telegram : <em>/groupe FIN</em> → liste les membres et leurs statuts du jour (présents, en congé, en mission).",
    ],
  },

  // ========================================================================
  // RH — GÉOLOCALISATION
  // ========================================================================
  '/rh/geolocalisation': {
    title: 'Géolocalisation des employés terrain',
    audience: 'all',
    intro:
      "Suivi GPS temps réel des employés en mission terrain (BTP, livraison, gardiennage, services techniques, commerciaux). Pointages géolocalisés (entrée/sortie avec coordonnées vérifiées), suivi de trajets pour calcul indemnités kilométriques, alertes en cas de sortie de zone autorisée. Conformité <b>Data Protection Act 2017 Maurice</b> : consentement explicite employé requis + finalité limitée + droit d'accès.",
    steps: [
      { title: "1. Consentement employé (obligatoire)", body: "Formulaire de consentement signé électroniquement par chaque employé concerné, conforme <b>Data Protection Act 2017</b>. Précise : finalité (pointage/sécurité), données collectées (GPS, vitesse), durée conservation (12 mois max), droits d'accès et rectification. Sans consentement = collecte illégale.", warning: "Géolocaliser sans consentement = amende jusqu'à 200 000 MUR + dommages employé. Lexora bloque l'activation sans consentement archivé." },
      { title: "2. Configure les zones autorisées", body: "Géofencing : dessine sur carte les zones légitimes (chantier, agence, périmètre de tournée). Sortie de zone → alerte manager (téléphone non couvert, urgence ?)." },
      { title: "3. App mobile employé", body: "Téléchargement <b>Lexora Field</b> (Android/iOS). Connexion avec code Telegram. Pointage entrée/sortie = un bouton, GPS automatique. L'app ne tracke PAS en continu (seulement aux pointages + trajets validés)." },
      { title: "4. Pointages géolocalisés", body: "Entrée : photo selfie + GPS + horodatage. Sortie idem. Anti-fraude : si GPS spoofé détecté (incohérence vitesse/altitude), pointage refusé." },
      { title: "5. Trajets professionnels", body: "L'employé démarre un trajet via l'app, conduit, arrête à destination. Lexora calcule km parcourus, durée, vitesse moyenne. Lien automatique avec <b>/rh/trajets-km</b> pour remboursement." },
      { title: "6. Dashboard manager", body: "Carte temps réel des employés actifs (avec consentement), historique trajets, taux de pointages géolocalisés validés. Filtres par équipe, zone, période." },
      { title: "7. Conservation et purge", body: "Données GPS conservées 12 mois max, puis anonymisation automatique. Statistiques agrégées (km totaux par mois) conservées sans donnée personnelle." },
      { title: "8. Droits employé", body: "Tout employé peut demander : accès à ses données, rectification, suppression, export. Lexora génère un PDF complet en 1 clic (conformité GDPR-like)." },
    ],
    pitfalls: [
      "Activer sans consentement écrit → infraction grave DPA 2017, amende 200 000 MUR + plainte CNIL Maurice.",
      "Géolocaliser un employé sédentaire (sans justification métier) → disproportionné, sanction DPC (Data Protection Commissioner).",
      "Conservation au-delà de 12 mois sans justification → infraction DPA, purge auto.",
      "Diffuser localisation à d'autres employés non habilités → fuite données personnelles.",
      "Spoofing GPS non détecté → pointages fictifs, fraude salariale (heures non travaillées).",
    ],
    externalLinks: [
      { label: "Data Protection Act 2017 Maurice", url: "https://mauritiusassembly.govmu.org/Documents/Acts/DPA2017.pdf", description: "Cadre légal protection données." },
      { label: "Data Protection Office Mauritius", url: "https://dataprotection.govmu.org", description: "Autorité de contrôle, guidances." },
      { label: "ICTA Mauritius", url: "https://www.icta.mu", description: "Régulateur télécoms et numérique." },
    ],
    tips: [
      "Active la <em>vue agrégée</em> (heatmap zones d'activité) plutôt qu'individuel quand possible : moins intrusif, mieux accepté.",
      "Pour les groupes BTP/sécurité : géofencing par chantier avec rotation auto des équipes.",
      "Multinationales : conformité GDPR EU si employés expatriés temporairement en Europe.",
      "Bot Telegram : <em>/equipe-terrain</em> → statut temps réel et alertes de sortie de zone.",
    ],
  },

  // ========================================================================
  // RH — FRAIS KILOMÉTRIQUES (barème)
  // ========================================================================
  '/rh/frais-km': {
    title: 'Barème kilométrique — Indemnités de transport',
    audience: 'comptable',
    intro:
      "Configuration du barème de remboursement kilométrique appliqué aux trajets professionnels des employés (déplacements clients, chantiers, missions). Différent de <em>/rh/trajets-km</em> qui est la déclaration des trajets — ici tu configures les <b>règles de calcul</b>. À Maurice, pas de barème légal imposé : l'employeur fixe sa politique (taux par km, plafonds, types de véhicule), souvent inspirée du barème MRA pour véhicules de fonction ou des taux moyens de marché.",
    steps: [
      { title: "1. Définis les catégories de véhicule", body: "Typiquement : <b>Moto/Scooter</b>, <b>Voiture < 1300 cc</b>, <b>Voiture 1300-2000 cc</b>, <b>Voiture > 2000 cc</b>, <b>4x4/Utilitaire</b>. Chaque catégorie a un taux MUR/km différent reflétant le coût réel (carburant + usure + assurance)." },
      { title: "2. Saisis les taux MUR/km", body: "Indicatif marché 2026 Maurice : moto 5-7 MUR/km, voiture petite 12-15 MUR/km, voiture moyenne 18-22 MUR/km, 4x4 25-30 MUR/km. Tu peux moduler selon ta politique (avantageuse ou stricte)." },
      { title: "3. Plafond mensuel par employé", body: "Plafond optionnel pour éviter les abus : ex. 10 000 km/mois max ou 50 000 MUR/mois max. Au-delà, le surplus n'est pas remboursé (ou nécessite validation Direction)." },
      { title: "4. Trajet domicile-travail", body: "À Maurice, le trajet domicile-travail n'est PAS un déplacement professionnel et n'est PAS remboursable au km (sauf accord employeur explicite). Lexora exclut auto sauf paramétrage contraire." },
      { title: "5. Justificatifs requis", body: "Politique <b>justificatif obligatoire</b> au-delà d'un seuil (ex: > 5 000 MUR/mois) : ticket de péage, facture carburant, ordre de mission signé. Sinon refus. Conserve 7 ans (audit MRA)." },
      { title: "6. Traitement fiscal", body: "Indemnités kilométriques correctement justifiées = <b>charges déductibles</b> société (Section 19 ITA) + <b>non imposables</b> côté employé (pas de PAYE/CSG/NSF). Si forfaitaire sans justificatifs = <b>requalification en salaire</b> par MRA, taxation complète.", warning: "Forfait kilométrique non justifié > 2 500 MUR/mois = avantage en nature requalifié, redressement MRA + 50% pénalité." },
      { title: "7. Lien comptable", body: "Compte de charge : <b>6251 Frais kilométriques personnel</b> ou <b>6256 Indemnités de déplacement</b>. Centre de coût analytique selon mission/projet." },
      { title: "8. Révision annuelle", body: "Recommandation : révise les taux chaque année en fonction inflation carburant (MRA STC), changement règles, retours employés. Lexora alerte si taux non révisé > 18 mois." },
    ],
    pitfalls: [
      "Taux trop avantageux non justifié économiquement → MRA requalifie en salaire déguisé.",
      "Pas de plafond mensuel → abus possibles, employés gonflent kilométrage.",
      "Confondre déplacement pro et trajet domicile-travail → coûteux et fiscalement risqué.",
      "Absence de justificatifs → MRA refuse déductibilité en contrôle, charge non opposable.",
      "Taux unique pour tous les véhicules → injuste (4x4 coûte 5x plus qu'un scooter), retour des employés.",
    ],
    externalLinks: [
      { label: "Income Tax Act 1995 — Section 19", url: "https://mauritiusassembly.govmu.org/Documents/Acts/IncomeTaxAct1995.pdf", description: "Déductibilité charges professionnelles." },
      { label: "MRA — Statement of Tax Computation Guide", url: "https://www.mra.mu/index.php/taxes-duties/corporate", description: "Traitement charges déductibles." },
    ],
    tips: [
      "Compare ton barème aux <em>practices</em> du secteur (MEF publie des benchmarks).",
      "Pour les multinationales : barème par pays (Maurice MUR/km vs France EUR/km vs UK GBP/mile).",
      "Active le calcul auto via géolocalisation (cf <em>/rh/geolocalisation</em>) : trajet GPS validé = remboursement déclenché sans saisie manuelle.",
      "Bot Telegram : <em>\"barème km\"</em> → l'employé voit instantanément combien sera remboursé pour sa mission du jour.",
    ],
  },

  // ========================================================================
  // RH — TRAJETS KM (déclaration)
  // ========================================================================
  '/rh/trajets-km': {
    title: 'Trajets kilométriques — Déclaration et remboursement',
    audience: 'all',
    intro:
      "Page où les employés déclarent leurs trajets professionnels (mission client, chantier, livraison) pour obtenir remboursement selon le barème configuré dans <em>/rh/frais-km</em>. Workflow : saisie employé → validation manager → calcul auto → intégration paie ou note de frais. Géolocalisation possible (via app mobile) pour validation automatique. Conformité fiscale assurée : justificatifs requis pour déductibilité société et exonération employé.",
    steps: [
      { title: "1. Saisie par l'employé", body: "Formulaire : date, départ, arrivée (saisie libre ou Google Maps intégré), motif (client X, chantier Y), km estimés ou GPS si app mobile activée, véhicule utilisé (selon catégories barème)." },
      { title: "2. Justificatifs joints", body: "PDF/photo : ticket péage, facture carburant, ordre de mission. Au-delà du seuil configuré (ex: 5 000 MUR/mois), obligatoire. Sinon refus validation." },
      { title: "3. Calcul automatique", body: "Lexora applique : km × taux MUR/km (selon catégorie véhicule) - plafond mensuel s'il y a. Affiche montant à valider par le manager." },
      { title: "4. Validation manager", body: "Notification (web + Telegram). Manager voit le détail, approuve / refuse / demande correction. Délai cible 48h. Au-delà, escalade auto au DRH." },
      { title: "5. Validation comptable", body: "Après manager, le comptable contrôle la cohérence (km vs durée mission, lien avec une facture client si refacturable). Pour les groupes : application des règles internes." },
      { title: "6. Paiement", body: "Deux modes possibles : (a) intégré au bulletin de paie du mois suivant (ligne <em>indemnités km</em>), (b) note de frais séparée avec virement bancaire immédiat. Choix politique société." },
      { title: "7. Refacturation client (si mission)", body: "Si la mission est facturable au client, Lexora propose d'inclure les km dans la prochaine facture client avec ou sans marge. Lien direct avec module facturation." },
      { title: "8. Archive et audit", body: "Conservation 7 ans (durée prescription fiscale). En cas de contrôle MRA, production immédiate du détail (trajets + justificatifs) en 1 clic." },
    ],
    pitfalls: [
      "Saisir des km sans justificatifs → refus comptable, employé non remboursé, conflit.",
      "Trajets fictifs détectés a posteriori → faute disciplinaire grave + remboursement société (Section 65 WRA).",
      "Oublier de catégoriser le véhicule → taux par défaut appliqué, écart de remboursement.",
      "Manager qui approuve sans vérifier → fraude possible, responsabilité partagée.",
      "Refacturer au client sans accord contractuel → litige client.",
    ],
    tips: [
      "Active la <em>saisie via Telegram</em> : l'employé envoie <em>/trajet 45km client X 1300cc</em> et la déclaration est créée.",
      "Lien avec géolocalisation : trajet GPS validé = déclaration auto, validation manager en 1 clic.",
      "Pour les groupes : politique de validation harmonisée multi-sociétés.",
      "Multinationales : devise locale du trajet (km Maurice en MUR, France en EUR, etc.) avec conversion auto pour reporting.",
    ],
  },

  // ========================================================================
  // RH — EXPORTS PAIE
  // ========================================================================
  '/rh/exports/paie': {
    title: 'Exports paie — Bulletins, virements, déclarations',
    audience: 'comptable',
    intro:
      "Hub d'export de tous les fichiers paie générés par Lexora : <b>bulletins PDF</b> (envoi employés + archivage), <b>fichier virements bancaires</b> (CSV/XML SEPA-like Maurice), <b>déclarations MRA</b> (PAYE/CSG/NSF/PRGF en CSV/XML), <b>écritures comptables</b> (CSV format FEC ou IFRS). Différent de <em>/rh/declarations-mra</em> qui est l'écran de soumission MRA — ici tu exportes les fichiers bruts pour traitement externe (banque, autre système, audit). Cadre légal : <b>NSF Act 1976</b>, <b>CSG Act 2021</b>, <b>WRA 2019 Section 31</b> (bulletin obligatoire).",
    steps: [
      { title: "1. Sélectionne la période", body: "Mois ou trimestre ou année. Multi-sociétés si applicable (cabinet, groupe). Pré-requis : paie verrouillée (sinon les chiffres bougent encore)." },
      { title: "2. Bulletins PDF individuels", body: "Génération en lot d'un PDF par employé conforme <b>Section 31 WRA</b> : brut, déductions détaillées (PAYE, NSF, CSG), allowances, net, charges patronales, cumul exercice. Envoi auto par email + archive dans Documents." },
      { title: "3. Fichier virements bancaires", body: "Format MCB / SBM / AfrAsia / ABC (CSV propriétaire chaque banque) ou format SEPA-like. Pour chaque employé : IBAN, nom, montant net, référence (salaire mois/année). Import direct sur Internet Banking pour exécution en lot.", warning: "Vérifie IBAN avant export : un IBAN erroné = virement rejeté et frais bancaires (200-500 MUR/rejet)." },
      { title: "4. Export PAYE MRA", body: "CSV format MRA strict avec colonnes : NID employé, nom, brut imposable, PAYE retenue, période. Compatible upload eservices.mra.mu. Lexora valide le format avant export.", warning: "Échéance MRA : <b>20 du mois suivant</b>. Au-delà, pénalité 5% + 0,5%/mois (Section 122 ITA)." },
      { title: "5. Export CSG/NSF MRA", body: "CSV combiné employeur + employé avec catégories A (≤ 50 000 MUR) ou B (> 50 000 MUR). <b>NSF Act 1976</b> : plafond cotisation 19 700 MUR. <b>CSG Act 2021</b> : 1,5% ou 3% employé + 3% ou 6% employeur." },
      { title: "6. Export PRGF", body: "CSV séparé. Calcul : <b>4,5%</b> du brut total tous employés sauf exemption FSC (pension privée équivalente attestée)." },
      { title: "7. Export écritures comptables", body: "CSV au format <b>FEC</b> (Fichier des Écritures Comptables) ou IFRS pour intégration ERP. Comptes : 6411 Salaires bruts, 4310 Personnel net, 4311 PAYE, 4312 NSF, 4313 CSG, 4314 PRGF, 645x charges patronales." },
      { title: "8. Archivage et conservation", body: "Tous les exports archivés automatiquement dans Documents avec horodatage. Conservation <b>10 ans</b> (audit + prescription MRA Section 113 ITA). Téléchargement à tout moment." },
    ],
    pitfalls: [
      "Exporter avant verrouillage paie → chiffres incohérents avec ce que tu as soumis ensuite.",
      "IBAN avec espaces/tirets dans le CSV → certaines banques rejettent en lot, retard de salaires (litige WRA).",
      "Mauvaise catégorie CSG (A au lieu de B) → MRA recalcule, redressement + pénalité.",
      "Oublier d'envoyer le bulletin à l'employé (Section 31 WRA exige) → infraction, amende jusqu'à 25 000 MUR par bulletin manquant.",
      "Format CSV non conforme MRA (séparateur, encoding UTF-8 BOM) → rejet à l'upload, retard fatal le 20.",
    ],
    externalLinks: [
      { label: "MRA — Portail eServices", url: "https://eservices.mra.mu", description: "Upload des fichiers PAYE/CSG/NSF." },
      { label: "NSF Act 1976", url: "https://mauritiusassembly.govmu.org/Documents/Acts/NSFAct1976.pdf", description: "Loi National Savings Fund." },
      { label: "Social Contributions and Social Benefits Act 2021 (CSG)", url: "https://mauritiusassembly.govmu.org/Documents/Acts/CSGAct2021.pdf", description: "Loi CSG remplaçant NPF." },
      { label: "Workers' Rights Act 2019 — Section 31", url: "https://mauritiusassembly.govmu.org/Documents/Acts/WRA2019.pdf", description: "Bulletin de paie obligatoire." },
    ],
    tips: [
      "Active la <em>signature électronique</em> des bulletins (employé + employeur) — opposable en cas de litige.",
      "Pour les groupes : pack d'export consolidé multi-sociétés en un ZIP.",
      "Multinationales : exports par pays (DSN France, FPS UK, ATO Single Touch Payroll Australie) avec moteur de mapping automatique.",
      "Bot Telegram : <em>\"exports paie mai\"</em> → tous les fichiers générés et envoyés par PJ Telegram en 30 secondes.",
    ],
  },

  // ========================================================================
  // RH — IMPORT VARIABLES PAIE
  // ========================================================================
  '/rh/import-paie': {
    title: 'Import variables de paie — Excel en masse',
    audience: 'comptable',
    intro:
      "Page d'import en masse des variables de paie du mois : primes exceptionnelles, heures supplémentaires non saisies via pointage, absences non justifiées, retenues spécifiques, allowances. Gain de temps majeur pour les sociétés > 30 employés ou avec beaucoup d'éléments variables (commerciaux à commissions, BTP avec OT, hôtellerie avec service charge). Format CSV/XLSX, validation pré-import, intégration directe au calcul paie du mois.",
    steps: [
      { title: "1. Télécharge le template", body: "Bouton <b>Template Excel</b>. Colonnes : code employé (ou NID), code variable (PRIM, OT15, ABS, RET, ALLOW), libellé, montant MUR ou heures, date d'effet. Une ligne = une variable." },
      { title: "2. Remplis ton fichier", body: "Saisie depuis Excel ou export de ton outil de pointage / commission / KPI. Tu peux mixer types de variables dans un seul fichier. Plusieurs lignes par employé OK." },
      { title: "3. Upload et pré-validation", body: "Drag-and-drop le fichier. Lexora valide : codes employés existants, codes variables connus, formats numériques OK, doublons détectés. Erreurs listées ligne par ligne." },
      { title: "4. Aperçu impact", body: "Avant intégration : tableau récap par employé avec brut avant / variables / brut après. Tu vois l'impact total masse salariale du mois. Anomalies détectées (variable > 200% du salaire = vérifier)." },
      { title: "5. Valide ou corrige", body: "Corrige directement dans Lexora (mode édition) ou ré-upload le fichier corrigé. Lexora garde l'historique des tentatives pour audit." },
      { title: "6. Intégration au calcul paie", body: "Bouton <b>Intégrer</b>. Les variables alimentent le bulletin du mois (avec PAYE, NSF, CSG, PRGF recalculés auto sur la nouvelle base). Visible immédiatement dans <em>/rh/paie</em>.", warning: "Une fois intégré, modification possible uniquement par contre-passation (nouvelle ligne en négatif). Pas d'effacement direct pour traçabilité." },
      { title: "7. Codes variables courants", body: "<b>PRIM</b> prime exceptionnelle, <b>OT15</b> heures sup × 1,5, <b>OT20</b> × 2 (dimanche/férié), <b>ABS</b> absence non payée, <b>RET</b> retenue (avance, prêt), <b>ALLOW</b> allocation (transport, repas), <b>COMM</b> commission, <b>BONUS</b> bonus performance." },
      { title: "8. Archivage", body: "Fichier d'origine + log d'import archivé dans Documents avec horodatage. Conservation 10 ans (audit MRA / contentieux employé)." },
    ],
    pitfalls: [
      "Mauvais code employé (NID erroné) → ligne ignorée, variable non payée, conflit avec employé.",
      "Montant en EUR ou USD oublié de convertir → sur/sous-paiement énorme. Lexora flagge si > 200% du salaire base.",
      "Importer un fichier 2 fois → doublons, sur-paiement. Lexora détecte hash du fichier et bloque.",
      "Date d'effet hors période → variable rejetée (période close).",
      "Confondre OT15 (1,5×) et OT20 (2×) → erreur récurrente, vérifie le code variable.",
    ],
    tips: [
      "Crée tes templates personnalisés par contexte (mois de commissions vs mois de bonus annuel).",
      "Pour les groupes : import multi-sociétés en un seul fichier avec colonne <em>société</em>.",
      "Multinationales : devise par ligne (MUR, USD, EUR) avec conversion auto au taux du jour.",
      "Bot Telegram : <em>\"variables paie mai\"</em> → statut import, anomalies à corriger, lien direct.",
    ],
  },

  // ========================================================================
  // RH — HISTORIQUE PAIE
  // ========================================================================
  '/rh/historique-paie': {
    title: 'Historique paie — Consultation bulletins',
    audience: 'all',
    intro:
      "Consultation et ré-impression des bulletins de paie historiques : par employé, par période, par type (régulier, EOY, severance, prorata départ). Différent de <em>/rh/paie</em> qui est l'écran de saisie/validation du mois en cours — ici tu cherches dans les archives. Conservation obligatoire <b>10 ans</b> (Section 31 WRA + Section 96 ITA). Indispensable pour : reconstituer carrière d'un employé, fournir attestations, audit MRA, contentieux Industrial Court, calcul severance (salaire moyen 12 derniers mois).",
    steps: [
      { title: "1. Recherche par employé", body: "Sélecteur employé (actif ou archivé). Liste de tous ses bulletins du plus récent au plus ancien. Indicateurs : verrouillé, payé, modifié post-versement (si applicable)." },
      { title: "2. Recherche par période", body: "Filtre par année / mois / trimestre. Tous les bulletins d'un mois donné en un écran (utile pour audit ou comparaison employés)." },
      { title: "3. Ré-impression PDF", body: "Clic sur un bulletin → PDF identique à l'original (mention <em>duplicata</em> si réimprimé). Horodatage et signature électronique conservés.", warning: "Pas de modification possible d'un bulletin historique. Pour corriger : passe une contre-passation dans le mois courant (régularisation)." },
      { title: "4. Statement of Emoluments annuel", body: "Génération auto chaque août pour exercice fiscal jul-juin : récap annuel par employé (brut, PAYE retenue, NSF, CSG) à fournir aux employés pour leur Income Tax Return Form 3 personnel.", warning: "Échéance légale : <b>15 août</b> de chaque année (Section 100 ITA). Au-delà : amende 5 000 MUR par employé manquant." },
      { title: "5. Attestations sur demande", body: "Génère en 1 clic : attestation employeur, certificat de travail (départ), attestation salaire (banque, location, visa). Templates conformes WRA + Code Civil." },
      { title: "6. Calcul salaire moyen 12 mois", body: "Pour severance (Section 70 WRA) ou indemnité : Lexora calcule le salaire moyen brut sur 12 derniers mois (incluant allowances, primes régulières, OT). Base juridiquement opposable." },
      { title: "7. Export en masse pour audit", body: "Sélection multi-employés / multi-périodes → ZIP de tous les PDFs. Format demandé par auditeurs externes (PwC, KPMG, EY, BDO) ou MRA en contrôle." },
      { title: "8. Recherche avancée", body: "Filtres : montant > X, primes > X, OT > X heures, employés > 5 ans ancienneté. Détecte anomalies historiques (audit interne RH)." },
    ],
    pitfalls: [
      "Supprimer un bulletin historique → JAMAIS. Audit MRA exige préservation 10 ans (Section 96 ITA).",
      "Ne pas générer Statement of Emoluments avant le 15 août → infraction ITA, amendes par employé.",
      "Calculer le salaire moyen 12 mois sur le seul base salary (sans allowances) → severance sous-estimée, contentieux probable.",
      "Réimprimer sans mention <em>duplicata</em> → confusion possible avec original, risque de double présentation.",
      "Ne pas conserver les variables imports (Excel d'origine) → impossible de justifier un montant en contrôle.",
    ],
    externalLinks: [
      { label: "Workers' Rights Act 2019 — Section 31", url: "https://mauritiusassembly.govmu.org/Documents/Acts/WRA2019.pdf", description: "Bulletin obligatoire et conservation." },
      { label: "Income Tax Act 1995 — Sections 96 et 100", url: "https://mauritiusassembly.govmu.org/Documents/Acts/IncomeTaxAct1995.pdf", description: "Conservation 10 ans + Statement of Emoluments." },
      { label: "MRA — Statement of Emoluments", url: "https://www.mra.mu/index.php/eservices/paye", description: "Procédure et template." },
    ],
    tips: [
      "Active <em>l'accès employé</em> à son propre historique (auto-service) : il consulte ses bulletins sans solliciter RH.",
      "Pour les groupes : historique consolidé inter-sociétés en cas de mobilité interne (préservation ancienneté).",
      "Multinationales : historique multi-pays avec normalisation devise pour calculs comparatifs.",
      "Bot Telegram : <em>\"bulletins Jean 2025\"</em> → tous les PDFs envoyés en PJ.",
    ],
  },

  // ========================================================================
  // RH — ANNONCES
  // ========================================================================
  '/rh/annonces': {
    title: 'Annonces internes — Communication employés',
    audience: 'all',
    intro:
      "Centre de communication interne pour diffuser des annonces aux employés : informations générales (nouveaux process, événements, mouvements), rappels (échéances, jours fériés, formations), célébrations (anniversaires, promotions, naissances), changements (politique RH, organigramme). Diffusion multi-canaux : web Lexora (badge sidebar), push Telegram, email. Ciblage fin par département, équipe, statut. Pour PME et groupes, remplace WhatsApp groupe pro chaotique par un canal centralisé tracé.",
    steps: [
      { title: "1. Crée une annonce", body: "<b>Nouvelle annonce</b>. Titre, corps (riche : images, liens, listes), catégorie (info / rappel / célébration / changement / urgence), priorité (basse / moyenne / haute / critique)." },
      { title: "2. Cible l'audience", body: "Toute la société, OU département(s), OU équipe(s), OU liste personnalisée. Exclusion possible (ex: tout sauf intérimaires). Lexora indique le nombre d'employés ciblés." },
      { title: "3. Canaux de diffusion", body: "Coche : <b>Web Lexora</b> (badge sidebar avec compteur non lu), <b>Push Telegram</b> (notification mobile immédiate), <b>Email</b> (pour annonces formelles). Annonce critique → tous canaux obligatoires." },
      { title: "4. Planification", body: "Publication immédiate OU planifiée (date + heure). Idéal pour annonces à effet J-3 (ex: <em>jour férié vendredi 12 mars, fermeture bureau</em>). Expiration auto possible après date." },
      { title: "5. Demande d'accusé", body: "Coche <b>Demander accusé de lecture</b> pour les annonces critiques (changement politique, sécurité). Chaque employé doit cliquer <em>Lu et compris</em>. Reporting de couverture en temps réel." },
      { title: "6. Modèles récurrents", body: "Sauvegarde tes annonces types : <em>jour férié</em>, <em>nouvel arrivant</em>, <em>fermeture exceptionnelle</em>, <em>rappel échéance</em>. Réutilise en 30 secondes." },
      { title: "7. Statistiques", body: "Pour chaque annonce : taux d'ouverture (web + email), réactions (j'aime, commentaires si activés), accusés de lecture. Pilote la communication interne avec des KPIs." },
      { title: "8. Archive", body: "Toutes les annonces archivées avec date, audience, métriques. Recherche full-text. Conservation indéfinie (mémoire d'entreprise)." },
    ],
    pitfalls: [
      "Saturer les employés (> 10 annonces/semaine) → fatigue, plus personne ne lit. Discipline éditoriale.",
      "Annonce sensible (licenciement collectif, fusion) diffusée sans préparation → panique, départs. Toujours valider avec Direction + RH.",
      "Ne pas demander d'accusé sur annonce de sécurité (incendie, COVID) → tu ne sais pas qui est informé.",
      "Cibler trop large → manque de pertinence, ignorée. Segmente fin.",
      "Annonce sans expiration → encombre le fil indéfiniment, info périmée affichée.",
    ],
    tips: [
      "Active les <em>annonces récurrentes</em> : ex. <em>tous les vendredis 16h, rappel reporting hebdo</em>.",
      "Pour les groupes : annonces inter-sociétés possibles (ex. message PDG groupe à tous les employés des filiales).",
      "Multinationales : traduction auto multi-langue (FR/EN/Mandarin/Hindi selon localisation employé).",
      "Bot Telegram : commande <em>/annonces</em> → résumé des 5 dernières annonces actives en mobile.",
      "Modère les commentaires si tu actives la fonction (évite dérapages WhatsApp-style).",
    ],
  },

  // ========================================================================
  // RH — PARAMÈTRES GLOBAUX
  // ========================================================================
  '/rh/parametres': {
    title: 'Paramètres globaux RH — Règles transverses',
    audience: 'comptable',
    intro:
      "Configuration des règles RH transverses applicables à toutes les sociétés du tenant : <b>jours fériés Maurice</b> officiels, <b>règles d'arrondi paye</b> (au MUR près, au 5 MUR près), <b>taux légaux NSF / CSG / PRGF</b>, <b>comptes comptables liés</b> à chaque ligne de paie. Distinct de <em>/rh/societe</em> qui est spécifique à une société (BRN, IBAN paie). Ici c'est la base réglementaire commune. Conformité <b>NSF Act 1976</b>, <b>CSG Act 2021</b>, <b>WRA 2019</b>.",
    steps: [
      { title: "1. Jours fériés Maurice", body: "Calendrier officiel maintenu par Lexora : 1 jan, 2 jan, Thaipoosam Cavadee, Maha Shivaratri, Independence Day (12 mars), Labour Day (1 mai), Eid-ul-Fitr, Assumption (15 août), Ganesh Chaturthi, Diwali, Arrival Indentured Labourers (2 nov), Christmas, Boxing Day. Tu peux ajouter fériés sectoriels ou conventionnels." },
      { title: "2. Règles d'arrondi", body: "Net à payer arrondi : au MUR près (standard), au 5 MUR près (pratique virement), au 10 MUR près (rare). PAYE/NSF/CSG : toujours au MUR près (exigence MRA). Configure une fois pour toutes." },
      { title: "3. Taux NSF (NSF Act 1976)", body: "<b>Employé</b> : 1% du salaire plafonné à <b>19 700 MUR/mois</b> (donc max 197 MUR/mois cotisation). <b>Employeur</b> : 2,5% du même plafond (max 492,5 MUR/mois). Lexora met à jour à chaque révision (rare, dernière 2017)." },
      { title: "4. Taux CSG (CSG Act 2021)", body: "<b>Catégorie A</b> (salaire ≤ 50 000 MUR/mois) : 1,5% employé + 3% employeur. <b>Catégorie B</b> (> 50 000 MUR) : 3% employé + 6% employeur. Pas de plafond. Bascule A → B automatique au passage de seuil." },
      { title: "5. Taux PRGF (Portable Retirement Gratuity Fund)", body: "<b>4,5% employeur</b> uniquement (rien employé). Sur brut total. Exemption si pension privée équivalente attestée par FSC (Section 13 PRGF Act 2019). Lexora applique exemption automatique si certificat FSC chargé." },
      { title: "6. Comptes comptables liés", body: "Mapping standard à valider : <b>6411</b> Salaires bruts, <b>4310</b> Personnel net, <b>4311</b> PAYE à payer, <b>4312</b> NSF à payer, <b>4313</b> CSG à payer, <b>4314</b> PRGF à payer, <b>6451</b> Charges patronales NSF, <b>6452</b> Charges patronales CSG, <b>6453</b> Charges patronales PRGF. Modifiable selon PCM tenant." },
      { title: "7. Période de paie", body: "Date de coupure (25 du mois, 30/31, libre). Jour de versement (25, 30/31, J+5). Délai génération bulletins (1 à 5 jours avant versement). Standard Maurice : coupure fin de mois, versement fin de mois ou 25." },
      { title: "8. Audit automatique", body: "Lexora alerte si paramètre obsolète : ex. nouveau taux NSF voté → flag rouge jusqu'à revalidation. Évite l'oubli d'une révision législative." },
    ],
    pitfalls: [
      "Mauvais taux NSF/CSG → toutes les paies fausses, redressement MRA + 50% pénalité + intérêts.",
      "Compte comptable mal mappé (4310 confondu avec 411) → bilan faux, balance déséquilibrée.",
      "Oublier la bascule A → B CSG quand un employé dépasse 50 000 MUR → sous-cotisation, redressement.",
      "Jours fériés mal configurés → calcul OT erroné (les fériés travaillés = OT × 2, pas × 1,5).",
      "Modifier les taux sans audit historique → impossible de comparer N vs N-1 proprement.",
    ],
    externalLinks: [
      { label: "NSF Act 1976", url: "https://mauritiusassembly.govmu.org/Documents/Acts/NSFAct1976.pdf", description: "Loi National Savings Fund." },
      { label: "Social Contributions and Social Benefits Act 2021 (CSG)", url: "https://mauritiusassembly.govmu.org/Documents/Acts/CSGAct2021.pdf", description: "Loi CSG." },
      { label: "PRGF Act 2019", url: "https://mauritiusassembly.govmu.org/Documents/Acts/PRGFAct2019.pdf", description: "Portable Retirement Gratuity Fund." },
      { label: "Workers' Rights Act 2019", url: "https://mauritiusassembly.govmu.org/Documents/Acts/WRA2019.pdf", description: "Règles paie et heures travail." },
      { label: "Public Holidays Act", url: "https://mauritiusassembly.govmu.org/Documents/Acts/PublicHolidaysAct.pdf", description: "Jours fériés officiels Maurice." },
    ],
    tips: [
      "Audit annuel des paramètres (chaque juillet pour exercice MRA jul-juin) : tout vérifier en 30 minutes.",
      "Pour les groupes : paramètres communs au niveau holding + surcharges par société si convention sectorielle.",
      "Multinationales : moteur multi-juridictions (Maurice WRA + France code travail + UK ERA + etc.).",
      "Active la <em>veille législative</em> : Lexora s'abonne aux publications MRA / Ministère du Travail et alerte sur changements imminents.",
    ],
  },

  // ========================================================================
  // RH — PARAMÈTRES SOCIÉTÉ
  // ========================================================================
  '/rh/societe': {
    title: 'Société — Paramètres RH spécifiques',
    audience: 'comptable',
    intro:
      "Paramètres RH liés à <b>une société donnée</b> du tenant : <b>BRN</b> employeur, <b>numéro NSF employeur</b>, <b>TAN MRA</b> société, signataire des bulletins et certificats, <b>IBAN paie</b> (compte d'où sortent les virements salaires), logo et coordonnées affichés sur les bulletins. Distinct de <em>/rh/parametres</em> qui couvre les règles transverses (taux NSF/CSG, jours fériés). Ici c'est le carnet d'identité RH de la société, indispensable pour les déclarations MRA et les documents légaux opposables.",
    steps: [
      { title: "1. Identité société employeur", body: "<b>BRN</b> Business Registration Number (9 chiffres CBRD), <b>TAN</b> MRA (1 lettre + 9 chiffres), <b>NSF Employer Registration Number</b> (à demander à NSF au moment de la création société), date d'incorporation, secteur d'activité (NACE)." },
      { title: "2. Signataire bulletins", body: "Identité du signataire (DRH, dirigeant) qui apparaît sur les bulletins et certificats : nom, fonction, signature scannée ou électronique. Opposable juridiquement (Section 31 WRA)." },
      { title: "3. IBAN paie", body: "Compte bancaire d'où partent les virements salaires. Différent du compte général de la société si tu sépares trésorerie d'exploitation et paie (recommandé pour > 50 employés). IBAN format Maurice : MU + 24 caractères.", warning: "Si IBAN paie incorrect, tous les virements bulletins sont rejetés. Test à blanc recommandé avant première paie." },
      { title: "4. Coordonnées sur bulletin", body: "Affichées en en-tête de chaque bulletin : raison sociale, adresse, téléphone, email RH, logo. Conformité Section 31 WRA + Image fidèle pour audit." },
      { title: "5. Convention collective applicable", body: "Si secteur soumis à convention (hôtellerie, manufacturing, BTP, retail) : lien vers texte officiel + spécificités (durée travail 48h pour hôtellerie au lieu de 45h standard, taux OT majorés, primes sectorielles)." },
      { title: "6. Politique paye interne", body: "Document interne (PDF) attaché : règles de promotion, grille salariale, périodes d'essai, conditions OT (autorisation préalable manager), allowances applicables. Référencé dans contrats." },
      { title: "7. Période de paie société", body: "Si différente du standard tenant (cf <em>/rh/parametres</em>) : ex. holding paie le 25, filiale industrielle le 5 du mois suivant. Surcharge possible." },
      { title: "8. Comptes spécifiques société", body: "Si tu surcharges les comptes comptables par défaut (ex. compte analytique BU différent), configure ici. Hérite des paramètres tenant sinon." },
    ],
    pitfalls: [
      "BRN ou TAN incorrect → toutes les déclarations MRA mensuelles rejetées (PAYE, NSF, CSG, PRGF).",
      "Pas de NSF Employer Registration Number → impossible de déclarer NSF, infraction NSF Act 1976.",
      "Signataire non habilité (ex. simple manager non mandataire social) → bulletins contestables en cas de litige.",
      "IBAN paie identique à IBAN encaissement client → confusion trésorerie, risque de paiement salaire avec encaissement non encore disponible (découvert).",
      "Oublier la convention collective applicable → règles inadaptées appliquées, contentieux possible.",
    ],
    externalLinks: [
      { label: "CBRD — Vérification BRN", url: "https://onlinebrd.govmu.org", description: "Validation de ton BRN." },
      { label: "MRA — Enregistrement employeur", url: "https://www.mra.mu/index.php/eservices/employer-registration", description: "Obtention TAN société." },
      { label: "NSF Mauritius", url: "https://socialsecurity.govmu.org/Communities/NSF", description: "Obtention NSF Employer Registration Number." },
      { label: "Workers' Rights Act 2019", url: "https://mauritiusassembly.govmu.org/Documents/Acts/WRA2019.pdf", description: "Obligations employeur." },
    ],
    tips: [
      "Test à blanc IBAN paie : fais un premier virement de 10 MUR à un compte interne pour valider le pipeline.",
      "Pour les groupes : paramètres société hérités du tenant mais surchargeables (utile entités avec spécificités sectorielles).",
      "Multinationales : profil <em>employer of record</em> par pays (Maurice, France, UK) si tu emploies à l'étranger.",
      "Active la <em>vérification annuelle</em> : Lexora flagge si BRN/TAN/NSF non confirmés depuis > 12 mois.",
    ],
  },

  // ========================================================================
  // GBC — PARTIAL EXEMPTION REGIME (PER)
  // ========================================================================
  '/client/gbc-per': {
    title: 'GBC — Partial Exemption Regime (80%)',
    audience: 'all',
    intro:
      "Le <b>Partial Exemption Regime</b> (PER) permet à une <b>GBC</b> de bénéficier d'une exemption réputée (<em>deemed</em>) de <b>80%</b> sur certaines catégories de revenus. Combinée au taux nominal de <b>15%</b>, l'exemption ramène le taux effectif à <b>3%</b> sur ces revenus éligibles — à condition de respecter les exigences de substance (CIGA) à Maurice.",
    steps: [
      { title: "1. Revenus éligibles au 80%", body: "Catégories principales : <b>intérêts</b> (foreign source), <b>dividendes de source étrangère</b> non déjà exemptés sous le régime participation, revenus d'une <b>société de leasing</b>, profits d'une <b>permanent establishment</b> étrangère, revenus de <b>CIS / closed-end funds</b>, et revenus de gestion de collective investment schemes. Voir Income Tax Act (Sub-Part C) et le 2nd Schedule." },
      { title: "2. Calcul du taux effectif", body: "Revenu éligible × 20% = base imposable, puis × 15% = impôt → <b>3% effectif</b>. Les 80% restants sont <em>deemed exempt</em>. Le reste des revenus (non éligibles) reste à 15%." },
      { title: "3. Condition de substance (CIGA)", body: "Le PER n'est accordé que si la GBC démontre une <b>substance économique adéquate</b> : <em>Core Income-Generating Activities</em> conduites à Maurice, employés qualifiés en nombre adéquat, dépenses d'exploitation proportionnées. Voir fiche <em>/client/gbc-substance</em>." },
      { title: "4. Exclusions", body: "Pas de cumul : un revenu déjà <b>fully exempt</b> (ex. dividende sous exemption participation) n'ouvre pas droit au 80%. Les revenus de source mauricienne et certains revenus passifs hors liste sont taxés à 15% plein. Pas de foreign tax credit en plus du 80% sur le même revenu (anti-double-dipping)." },
      { title: "5. Documentation à conserver", body: "Ventilation des revenus par catégorie, preuve de la source étrangère, dossier CIGA, calcul du 80% dans la Form 3 (income tax return GBC). Audit annuel obligatoire." },
    ],
    pitfalls: [
      "Appliquer le 80% sans dossier de substance → MRA refuse l'exemption, redressement à 15% plein + pénalités.",
      "Cumuler 80% deemed exemption ET foreign tax credit sur le même revenu (interdit, anti-double-dipping).",
      "Classer un revenu de source mauricienne comme éligible → requalification.",
      "Oublier de ventiler par catégorie : sans ventilation claire la MRA peut refuser l'ensemble.",
    ],
    externalLinks: [
      { label: "MRA — Income Tax Act", url: "https://www.mra.mu/index.php/taxes-duties/income-tax", description: "Régime d'imposition des sociétés et exemptions." },
      { label: "FSC — Partial Exemption Guidelines", url: "https://www.fscmauritius.org" },
      { label: "MRA — Companies (Form 3)", url: "https://www.mra.mu/index.php/eservices/corporate-tax" },
    ],
    tips: [
      "Lexora ventile automatiquement le P&L par catégorie de revenu et calcule l'assiette à 3% vs 15%.",
      "Tiens le dossier CIGA à jour en continu : la condition de substance est vérifiée chaque exercice, pas une fois pour toutes.",
    ],
  },

  // ========================================================================
  // GBC — SUBSTANCE / CIGA
  // ========================================================================
  '/client/gbc-substance': {
    title: 'GBC — Substance économique (CIGA)',
    audience: 'all',
    intro:
      "Pour conserver son statut fiscal et le <b>Partial Exemption Regime</b>, une GBC doit prouver une <b>substance économique</b> réelle à Maurice. La FSC vérifie que les <b>Core Income-Generating Activities (CIGA)</b> sont effectivement conduites localement, avec employés qualifiés, dépenses locales et gouvernance à Maurice.",
    steps: [
      { title: "1. CIGA conduites à Maurice", body: "Identifie et documente les activités génératrices de revenu cœur (ex. pour une holding : prise de décision sur les participations ; pour une société de financement : gestion du risque et négociation des prêts). Elles doivent être <b>dirigées et gérées</b> depuis Maurice." },
      { title: "2. Employés qualifiés résidents", body: "Nombre <b>adéquat</b> d'employés qualifiés, résidents à Maurice, en rapport avec le niveau d'activité. Conserve CV, contrats, fiches de paie, preuves NSF/CSG. L'externalisation (outsourcing) à un Management Company mauricien est admise si supervisée et documentée." },
      { title: "3. Dépenses opérationnelles locales (OPEX)", body: "Montant <b>minimum de dépenses</b> engagées à Maurice, proportionné à l'activité : loyer de bureau, honoraires de l'administrateur agréé, comptabilité, audit, conseil local." },
      { title: "4. Conseil d'administration à Maurice", body: "Au moins <b>2 administrateurs résidents</b> à Maurice (exigence GBC). Réunions du board tenues à Maurice avec <b>PV signés</b>, quorum effectif, décisions stratégiques prises localement. Le siège de direction effective doit être à Maurice." },
      { title: "5. Documentation et dépôt", body: "Constitue un dossier de substance annuel : organigramme, contrats employés, baux, PV de board, états de dépenses locales. Déclaré dans le filing FSC et tenu à disposition de la MRA." },
    ],
    pitfalls: [
      "Board nominal sans réunion réelle à Maurice → siège de direction effective ailleurs, perte du régime.",
      "Aucun employé local ni OPEX → la FSC peut juger la substance insuffisante.",
      "Outsourcing non supervisé ni documenté → ne compte pas comme substance.",
      "Décisions stratégiques prises hors de Maurice (par la maison-mère) → requalification de résidence fiscale.",
    ],
    externalLinks: [
      { label: "FSC Mauritius", url: "https://www.fscmauritius.org", description: "Exigences de substance GBC." },
      { label: "OECD — Substantial activities (BEPS Action 5)", url: "https://www.oecd.org/tax/beps/" },
    ],
    tips: [
      "Lexora propose un module CIGA : checklist annuelle, stockage des PV de board, suivi des OPEX locaux et des effectifs.",
      "Garde la preuve que ≥ 2 administrateurs résidents siègent réellement — c'est le point le plus contrôlé.",
    ],
  },

  // ========================================================================
  // GBC — TRANSFER PRICING
  // ========================================================================
  '/client/gbc-transfer-pricing': {
    title: 'GBC — Transfer Pricing (prix de transfert)',
    audience: 'all',
    intro:
      "Les transactions entre entités liées (intra-groupe) d'une GBC doivent respecter le principe de <b>pleine concurrence</b> (<em>arm's length</em>). Maurice s'aligne sur l'<b>OECD BEPS Action 13</b> : documentation Master File / Local File et, pour les grands groupes, Country-by-Country Reporting.",
    steps: [
      { title: "1. Principe de pleine concurrence", body: "Le prix d'une transaction intra-groupe doit être celui que des parties <b>indépendantes</b> auraient convenu. S'applique aux prêts intra-groupe (taux d'intérêt), management fees, royalties, refacturations de services, ventes de biens." },
      { title: "2. Master File", body: "Vue d'ensemble du groupe MNE : structure organisationnelle, description des activités, actifs incorporels, financements intra-groupe, position financière et fiscale consolidée." },
      { title: "3. Local File", body: "Détail des transactions de l'entité mauricienne avec les parties liées : montants, nature, analyse de comparabilité, méthode retenue et justification du caractère arm's length." },
      { title: "4. Choix de la méthode", body: "Méthodes OECD : <b>CUP</b> (Comparable Uncontrolled Price — comparaison directe de prix), <b>TNMM</b> (Transactional Net Margin Method — marge nette sur un indicateur), <b>Cost Plus</b> (coût + marge), Resale Price, Profit Split. Choisis la plus appropriée à la transaction et documente le rejet des autres." },
      { title: "5. CbCR (grands groupes)", body: "Si le groupe MNE consolidé dépasse <b>€750M</b> de chiffre d'affaires, un <b>Country-by-Country Report</b> est requis (revenus, impôts, effectifs par juridiction), échangé entre administrations." },
    ],
    pitfalls: [
      "Prêt intra-groupe à taux 0% ou non marché → requalification, intérêts notionnels imposés.",
      "Management fees sans contrat ni preuve de service rendu → déductibilité refusée.",
      "Pas de Local File → la MRA peut écarter les prix déclarés et reconstituer la base.",
      "Méthode choisie sans analyse de comparabilité documentée → contestable.",
    ],
    externalLinks: [
      { label: "OECD Transfer Pricing Guidelines", url: "https://www.oecd.org/tax/transfer-pricing/", description: "Méthodes et standards arm's length." },
      { label: "OECD BEPS Action 13", url: "https://www.oecd.org/tax/beps/beps-actions/action13/" },
      { label: "MRA", url: "https://www.mra.mu" },
    ],
    tips: [
      "Lexora génère un template Master File / Local File et trace toutes les transactions intra-groupe par contrepartie liée.",
      "Pour un prêt intra-groupe, documente le taux par référence à un benchmark de marché (spread + base rate).",
    ],
  },

  // ========================================================================
  // GBC — BENEFICIAL OWNERSHIP (UBO)
  // ========================================================================
  '/client/gbc-ubo': {
    title: 'GBC — Beneficial Ownership (UBO)',
    audience: 'all',
    intro:
      "Toute GBC doit identifier et déclarer ses <b>bénéficiaires effectifs ultimes</b> (UBO) — les personnes physiques détenant ou contrôlant la société. Le seuil de déclaration est de <b>25%</b> (détention directe ou indirecte, ou contrôle). Le registre doit être tenu à jour et mis à jour rapidement après tout changement.",
    steps: [
      { title: "1. Définition de l'UBO", body: "Personne physique qui, directement ou indirectement, détient <b>≥ 25%</b> du capital ou des droits de vote, OU exerce un contrôle par d'autres moyens (pacte, droit de nomination des dirigeants). Toujours remonter jusqu'à une personne physique (cascade)." },
      { title: "2. Détention indirecte (cascade)", body: "Calcule le pourcentage en multipliant les chaînes de détention à travers les holdings intermédiaires. Une personne détenant 50% d'une holding qui détient 60% de la GBC contrôle 30% indirect → UBO." },
      { title: "3. Registre des UBO", body: "Tiens un registre : identité, nationalité, adresse, nature et étendue de l'intérêt, date d'acquisition. Conservé par la société et son administrateur agréé, à disposition des autorités." },
      { title: "4. Mise à jour sous 14 jours", body: "Tout changement de bénéficiaire effectif doit être enregistré dans un <b>délai de 14 jours</b>. Le registre périmé est une infraction." },
      { title: "5. FATCA Act / sanctions", body: "Le défaut de tenue ou de mise à jour du registre UBO constitue une infraction (Section 12 du Foreign Account Tax Compliance Act mauricien), passible d'amende. Les informations alimentent aussi les échanges CRS/FATCA." },
    ],
    pitfalls: [
      "Ne déclarer que les actionnaires directs sans remonter la cascade jusqu'aux personnes physiques.",
      "Registre non mis à jour dans les 14 jours après un changement de structure.",
      "Oublier le contrôle 'par d'autres moyens' (pacte d'actionnaires, golden share) même sous 25%.",
      "Confondre actionnaire personne morale et bénéficiaire effectif personne physique.",
    ],
    externalLinks: [
      { label: "FSC Mauritius", url: "https://www.fscmauritius.org", description: "Obligations beneficial ownership." },
      { label: "MRA — FATCA", url: "https://www.mra.mu/index.php/eservices/automatic-exchange-of-information" },
    ],
    tips: [
      "Lexora calcule la cascade UBO automatiquement à partir des données KYC et de la structure de détention.",
      "Configure une alerte : tout changement d'actionnariat déclenche le rappel des 14 jours.",
    ],
  },

  // ========================================================================
  // GBC — PILLAR TWO (GloBE)
  // ========================================================================
  '/client/gbc-pillar-two': {
    title: 'GBC — Pillar Two / GloBE (Top-Up Tax 15%)',
    audience: 'all',
    intro:
      "Le <b>Pillar Two</b> de l'OCDE impose un taux d'imposition effectif minimum de <b>15%</b> aux groupes multinationaux (MNE) dont le chiffre d'affaires consolidé dépasse <b>€750M</b>. Si l'ETR d'une juridiction est inférieur à 15%, un <b>Top-Up Tax</b> est dû pour combler l'écart. Une GBC à 3% effectif est directement concernée si elle appartient à un tel groupe.",
    steps: [
      { title: "1. Seuil d'application", body: "Groupes MNE avec un chiffre d'affaires consolidé annuel <b>≥ €750M</b> sur au moins 2 des 4 derniers exercices (test du Country-by-Country Report). En-dessous, Pillar Two ne s'applique pas." },
      { title: "2. GloBE Income", body: "Pars du résultat comptable IFRS de chaque entité, puis applique les <b>ajustements GloBE</b> (retraitement des dividendes exclus, plus-values, impôts, éléments non-récurrents) pour obtenir le <em>GloBE Income or Loss</em>." },
      { title: "3. Adjusted Covered Taxes", body: "Calcule les impôts couverts ajustés : impôt sur les bénéfices courant et différé éligible, après corrections (crédits d'impôt, impôts non couverts exclus)." },
      { title: "4. ETR par juridiction", body: "<b>ETR = Adjusted Covered Taxes / GloBE Income</b>, agrégé <b>par juridiction</b> (jurisdictional blending). Une GBC mauricienne à 3% tire l'ETR Maurice sous 15%." },
      { title: "5. Top-Up Tax", body: "Top-Up % = 15% − ETR juridictionnel ; appliqué à l'<em>Excess Profit</em> (GloBE Income − Substance-based Income Exclusion sur payroll et actifs corporels). Prélevé via IIR (mère), QDMTT (locale) ou UTPR." },
      { title: "6. Substance-based Income Exclusion (SBIE)", body: "Réduit la base du Top-Up Tax d'un pourcentage de la masse salariale et de la valeur des actifs corporels — récompense la substance réelle (cohérent avec CIGA)." },
    ],
    pitfalls: [
      "Croire qu'un taux mauricien à 3% est sans conséquence : le Top-Up Tax peut être prélevé à l'étranger (IIR de la mère) si Maurice n'a pas de QDMTT.",
      "Confondre résultat comptable et GloBE Income (les ajustements sont nombreux).",
      "Oublier l'agrégation par juridiction (jurisdictional blending) et raisonner entité par entité.",
      "Négliger la SBIE et surévaluer le Top-Up Tax dû.",
    ],
    externalLinks: [
      { label: "OECD — Pillar Two / GloBE Rules", url: "https://www.oecd.org/tax/beps/", description: "Model Rules et guidance administrative." },
      { label: "MRA", url: "https://www.mra.mu" },
    ],
    tips: [
      "Lexora dispose d'un module GloBE : calcul du GloBE Income, des Adjusted Covered Taxes et de l'ETR par juridiction.",
      "Vérifie si la juridiction de la mère applique une IIR : c'est elle qui prélèvera le Top-Up si Maurice ne le fait pas.",
    ],
  },

  // ========================================================================
  // GBC — CRS / FATCA
  // ========================================================================
  '/client/gbc-crs-fatca': {
    title: 'GBC — CRS / FATCA (échange automatique)',
    audience: 'all',
    intro:
      "Les institutions financières mauriciennes, y compris certaines GBC, doivent déclarer chaque année les comptes détenus par des <b>non-résidents</b> dans le cadre du <b>CRS</b> (norme OCDE, multi-juridictions) et de <b>FATCA</b> (États-Unis). Les déclarations se font au format <b>XML</b> via les portails MRA / FSC, dans des échéances strictes.",
    steps: [
      { title: "1. Suis-je une Reporting Financial Institution ?", body: "Déterminé selon la classification CRS/FATCA (Custodial Institution, Depository Institution, Investment Entity, Specified Insurance Company). Beaucoup de fonds et structures d'investissement GBC sont des <em>Investment Entities</em> déclarantes." },
      { title: "2. Due diligence des comptes", body: "Identifie la résidence fiscale de chaque titulaire (self-certification, indices), distingue comptes préexistants et nouveaux, individuels et entités. Pour FATCA : identifie les <em>US persons</em>." },
      { title: "3. Format XML", body: "Les déclarations utilisent le schéma <b>CRS XML</b> (OECD) et le schéma <b>FATCA XML</b> (IRS). Données : titulaire, TIN, solde, revenus (intérêts, dividendes, produits de cession)." },
      { title: "4. Soumission via portail MRA", body: "Dépôt sur le portail d'échange automatique d'informations de la <b>MRA</b> (AEOI). FATCA transite ensuite vers l'IRS via l'IGA Maurice-USA ; CRS vers les juridictions partenaires." },
      { title: "5. Échéances", body: "La déclaration CRS/FATCA est annuelle. Respecte la date limite publiée par la MRA chaque année (vérifie le calendrier AEOI — voir lien). Le nil return peut être exigé même sans compte déclarable." },
    ],
    pitfalls: [
      "Oublier le <em>nil return</em> quand il est requis (absence de déclaration = infraction même sans compte déclarable).",
      "Self-certifications manquantes ou non validées → due diligence incomplète.",
      "Erreur de schéma XML → rejet par le portail, dépôt réputé non fait à l'échéance.",
      "Confondre résidence fiscale et nationalité du titulaire.",
    ],
    externalLinks: [
      { label: "MRA — Automatic Exchange of Information", url: "https://www.mra.mu/index.php/eservices/automatic-exchange-of-information", description: "Portail AEOI, schémas et échéances." },
      { label: "OECD — CRS", url: "https://www.oecd.org/tax/automatic-exchange/", description: "Norme commune de déclaration." },
      { label: "FSC Mauritius", url: "https://www.fscmauritius.org" },
    ],
    tips: [
      "Lexora collecte les self-certifications et génère les fichiers CRS/FATCA XML conformes aux schémas en vigueur.",
      "Vérifie chaque année le calendrier AEOI de la MRA : la date limite peut varier.",
    ],
  },

  // ========================================================================
  // GBC — CONSOLIDATION IFRS 10
  // ========================================================================
  '/client/gbc-consolidation': {
    title: 'GBC — Consolidation (IFRS 10)',
    audience: 'all',
    intro:
      "Une holding GBC qui contrôle plusieurs entités doit présenter des <b>états financiers consolidés</b> selon <b>IFRS 10</b>. La consolidation regroupe les comptes de la mère et des filiales contrôlées comme une seule entité économique, après élimination des opérations intra-groupe.",
    steps: [
      { title: "1. Notion de contrôle", body: "IFRS 10 : une entité est consolidée si la holding la <b>contrôle</b> — pouvoir sur les activités pertinentes, exposition aux rendements variables, et capacité d'influer sur ces rendements. Le contrôle peut exister sans majorité des votes (de facto control)." },
      { title: "2. Périmètre de consolidation", body: "Inclut toutes les filiales contrôlées (intégration globale). Les participations sous <em>influence notable</em> relèvent de l'IAS 28 (mise en équivalence), le contrôle conjoint de l'IFRS 11 — distinct du périmètre IFRS 10." },
      { title: "3. Homogénéisation", body: "Aligne les méthodes comptables, la <b>monnaie fonctionnelle</b> (conversion IAS 21 des filiales étrangères : actifs/passifs au cours de clôture, résultat au cours moyen, écarts en OCI) et les dates de clôture." },
      { title: "4. Éliminations intra-groupe", body: "Élimine : participations de la mère contre capitaux propres des filiales (avec goodwill / intérêts minoritaires), créances/dettes intra-groupe, ventes et achats intra-groupe, profits internes non réalisés sur stocks et immobilisations, dividendes intra-groupe." },
      { title: "5. Intérêts minoritaires (NCI)", body: "Quote-part des actionnaires hors groupe dans les filiales non détenues à 100% : présentée séparément en capitaux propres et au résultat consolidé." },
      { title: "6. États consolidés", body: "Produis bilan, compte de résultat, état du résultat global (OCI), tableau de variation des capitaux propres et tableau de flux de trésorerie consolidés, avec notes. Audit obligatoire pour la GBC." },
    ],
    pitfalls: [
      "Oublier d'éliminer les profits internes non réalisés sur stocks/immobilisations → résultat consolidé gonflé.",
      "Mauvaise conversion des filiales étrangères (cours de clôture vs cours moyen) → écarts de change erronés.",
      "Consolider par intégration globale une entité sous simple influence notable (devrait être mise en équivalence).",
      "Intérêts minoritaires mal calculés sur une filiale non détenue à 100%.",
    ],
    externalLinks: [
      { label: "IFRS 10 — Consolidated Financial Statements", url: "https://www.ifrs.org/issued-standards/list-of-standards/ifrs-10-consolidated-financial-statements/" },
      { label: "IAS 21 — Effets des variations des cours", url: "https://www.ifrs.org/issued-standards/list-of-standards/ias-21-the-effects-of-changes-in-foreign-exchange-rates/" },
    ],
    tips: [
      "Lexora gère plusieurs entités liées et automatise les éliminations intra-groupe et la conversion IAS 21.",
      "Définis la monnaie de présentation du groupe : la conversion des filiales en devises se fait vers cette monnaie.",
    ],
  },

  // ========================================================================
  // ROC — ANNUAL RETURN
  // ========================================================================
  '/client/annual-return': {
    title: 'Annual Return — Registrar of Companies',
    audience: 'all',
    intro:
      "Toute société mauricienne doit déposer chaque année un <b>Annual Return</b> auprès du <b>Registrar of Companies (CBRD)</b> en vertu du <b>Companies Act 2001</b>. Ce dépôt confirme les informations légales de la société (administrateurs, actionnaires, siège) et est distinct de la déclaration fiscale (MRA) et des états financiers.",
    steps: [
      { title: "1. Qu'est-ce que l'Annual Return", body: "Un état officiel des informations de la société à une date donnée : siège social, administrateurs, secrétaire, actionnaires et leurs participations, capital. Section 223 du Companies Act 2001." },
      { title: "2. Qui dépose quoi", body: "Les <b>private companies</b> déposent un Annual Return simplifié ; certaines petites entreprises (small private companies) ont des obligations allégées. Les <b>public companies</b> ont des obligations étendues et déposent aussi les états financiers audités au Registrar." },
      { title: "3. Échéance", body: "L'Annual Return est généralement déposé dans les <b>28 jours</b> suivant l'<em>annual meeting</em> (ou la date anniversaire selon le type de société). Vérifie la date propre à ta société sur le portail CBRD." },
      { title: "4. Dépôt en ligne", body: "Dépôt via le <b>Companies and Businesses Registration Department (CBRD)</b>, portail companies.govmu.org. Paiement des <b>frais de dépôt</b> en ligne. Conserve l'accusé." },
      { title: "5. Mises à jour à signaler", body: "Tout changement d'administrateurs, de siège ou de secrétaire entre deux returns doit être notifié séparément au Registrar (formulaires dédiés), pas seulement dans l'Annual Return." },
    ],
    pitfalls: [
      "Confondre Annual Return (CBRD) avec la déclaration d'impôt (MRA) ou les comptes annuels — ce sont trois obligations distinctes.",
      "Dépôt tardif → pénalités et risque de radiation (striking off) de la société.",
      "Oublier de notifier un changement d'administrateur en cours d'année (en plus du return).",
      "Informations actionnaires non à jour → return rejeté ou incohérent avec le registre UBO.",
    ],
    externalLinks: [
      { label: "CBRD — Companies Registry", url: "https://companies.govmu.org", description: "Dépôt en ligne des Annual Returns." },
      { label: "Companies Act 2001", url: "https://companies.govmu.org/Pages/legislations.aspx" },
      { label: "CBRD — BRN verification", url: "https://onlinebrd.govmu.org" },
    ],
    tips: [
      "Lexora rappelle l'échéance de l'Annual Return et pré-remplit les informations à confirmer.",
      "Vérifie la cohérence entre l'Annual Return (actionnaires) et le registre UBO (bénéficiaires effectifs).",
    ],
  },

  // ========================================================================
  // IFRS 16 — LEASES
  // ========================================================================
  '/client/leases': {
    title: 'IFRS 16 — Contrats de location (Leases)',
    audience: 'client',
    intro:
      "L'<b>IFRS 16</b> impose au preneur (lessee) de comptabiliser au bilan la quasi-totalité des contrats de location : un <b>actif au titre du droit d'utilisation</b> (right-of-use) et une <b>dette de location</b> (lease liability). Fini la distinction location simple / financement côté preneur : presque tout est capitalisé.",
    steps: [
      { title: "1. Identifier un contrat de location", body: "Un contrat contient une location s'il confère le <b>droit de contrôler l'usage</b> d'un actif identifié pendant une durée, en échange d'un paiement. Distingue d'un simple contrat de service." },
      { title: "2. Évaluer la dette de location", body: "À la date de prise d'effet : <b>valeur actualisée des paiements de loyers futurs</b> (fixes, variables indexés, options d'achat probables, pénalités de résiliation). Actualisée au <b>taux implicite</b> du contrat ou, à défaut, au <b>taux d'emprunt marginal</b> du preneur." },
      { title: "3. Comptabiliser le right-of-use asset", body: "Actif = dette de location initiale + paiements d'avance + coûts directs initiaux + coûts de remise en état − avantages reçus. Inscrit à l'actif immobilisé." },
      { title: "4. Amortissement et charge d'intérêt", body: "Le right-of-use asset est <b>amorti</b> (généralement linéaire sur la durée du bail ou la durée d'utilité). La dette génère une <b>charge d'intérêt</b> décroissante. La charge totale est dégressive (plus élevée en début de bail)." },
      { title: "5. Exemptions", body: "Deux exemptions optionnelles : locations de <b>courte durée</b> (≤ 12 mois sans option d'achat) et locations d'actifs de <b>faible valeur</b> (low-value, ex. petit matériel). Comptabilisées en charge linéaire, hors bilan." },
      { title: "6. Réévaluations", body: "Réestime la dette en cas de modification du bail, de changement d'indice/taux ou de révision des options. Ajuste le right-of-use asset en contrepartie." },
    ],
    pitfalls: [
      "Laisser des baux opérationnels hors bilan comme avant IFRS 16 (sauf exemptions) → bilan incomplet.",
      "Utiliser un mauvais taux d'actualisation → dette et charge d'intérêt erronées.",
      "Oublier les options de renouvellement raisonnablement certaines dans la durée du bail.",
      "Ne pas réévaluer la dette après une modification de loyer indexé.",
    ],
    externalLinks: [
      { label: "IFRS 16 — Leases", url: "https://www.ifrs.org/issued-standards/list-of-standards/ifrs-16-leases/" },
    ],
    tips: [
      "Lexora calcule l'actualisation, l'échéancier dette/intérêt et l'amortissement du right-of-use asset.",
      "Documente la justification du taux d'emprunt marginal retenu quand le taux implicite n'est pas connu.",
    ],
  },

  // ========================================================================
  // IFRS 9 — EXPECTED CREDIT LOSS (ECL)
  // ========================================================================
  '/client/ifrs9-ecl': {
    title: 'IFRS 9 — Expected Credit Loss (ECL)',
    audience: 'client',
    intro:
      "L'<b>IFRS 9</b> impose de provisionner les pertes de crédit <b>attendues</b> (Expected Credit Loss) de façon prospective, sans attendre la survenance d'un défaut. L'approche générale repose sur <b>3 stages</b> selon l'évolution du risque de crédit depuis l'origine.",
    steps: [
      { title: "1. Approche générale en 3 stages", body: "<b>Stage 1</b> : actifs sains → ECL à 12 mois. <b>Stage 2</b> : augmentation significative du risque (SICR) → ECL à maturité (lifetime). <b>Stage 3</b> : actif en défaut (credit-impaired) → ECL lifetime, intérêts calculés sur la valeur nette." },
      { title: "2. SICR — Significant Increase in Credit Risk", body: "Détermine le passage Stage 1 → Stage 2 : dégradation de notation, impayés (présomption réfragable de SICR à <b>30 jours</b> de retard), détérioration des indicateurs. Le passage en défaut (Stage 3) est présumé à <b>90 jours</b>." },
      { title: "3. Paramètres PD / LGD / EAD", body: "ECL = <b>PD × LGD × EAD</b> (actualisée). <b>PD</b> probabilité de défaut, <b>LGD</b> perte en cas de défaut (1 − taux de recouvrement), <b>EAD</b> exposition au moment du défaut. Stage 1 utilise une PD 12 mois, Stage 2/3 une PD lifetime." },
      { title: "4. Information prospective (forward-looking)", body: "Intègre des scénarios <b>macro-économiques</b> pondérés (croissance, chômage, taux) qui ajustent PD et LGD. L'ECL n'est pas seulement historique : elle anticipe l'évolution attendue." },
      { title: "5. Approche simplifiée (créances clients)", body: "Pour les <b>créances commerciales</b> et actifs sur contrat, IFRS 9 autorise une approche simplifiée : ECL lifetime directement via une <b>matrice de provisionnement</b> par tranche d'antériorité (aging), sans suivre les 3 stages." },
      { title: "6. Disclosure IFRS 7", body: "Présente en annexe : rapprochement des provisions par stage, méthodologie, hypothèses macro, analyse de sensibilité et qualité de crédit du portefeuille (IFRS 7)." },
    ],
    pitfalls: [
      "Attendre l'impayé pour provisionner (modèle 'incurred loss' de l'ancienne IAS 39) → non conforme.",
      "Ignorer le forward-looking et ne provisionner que sur l'historique.",
      "Confondre SICR (Stage 2) et défaut (Stage 3) — le premier ne suspend pas le calcul d'intérêt sur le brut.",
      "Matrice de provisionnement non mise à jour avec les pertes réelles et les perspectives macro.",
    ],
    externalLinks: [
      { label: "IFRS 9 — Financial Instruments", url: "https://www.ifrs.org/issued-standards/list-of-standards/ifrs-9-financial-instruments/" },
      { label: "IFRS 7 — Disclosures", url: "https://www.ifrs.org/issued-standards/list-of-standards/ifrs-7-financial-instruments-disclosures/" },
    ],
    tips: [
      "Lexora calcule l'ECL par stage, applique l'ajustement macro forward-looking et produit la matrice d'aging pour les créances clients.",
      "Documente les seuils SICR retenus (30 jours, dégradation de notation) : ils doivent être cohérents d'un exercice à l'autre.",
    ],
  },

  // ========================================================================
  // SALARIÉ — PORTAIL
  // ========================================================================
  '/salarie': {
    title: 'Mon espace salarié',
    audience: 'all',
    intro:
      "Bienvenue dans ton <b>espace salarié</b> Lexora. Depuis ce portail tu pointes tes heures, demandes tes congés, déclares tes trajets et frais kilométriques, consultes tes fiches de paie et tes informations personnelles. Tout est centralisé et synchronisé avec le service RH.",
    steps: [
      { title: "1. Tableau de bord", body: "Vue d'ensemble : prochain jour travaillé, solde de congés restant, dernier bulletin disponible, demandes en attente de validation. C'est ton point de départ." },
      { title: "2. Pointage", body: "Enregistre tes heures d'arrivée et de départ (clock-in / clock-out). Le système calcule tes heures travaillées et signale les heures supplémentaires. Pointe en début et fin de journée." },
      { title: "3. Demandes de congés", body: "Soumets une demande de congé (annuel, maladie, spécial) en choisissant les dates. Le solde se met à jour automatiquement. Ta demande part en validation auprès de ton responsable." },
      { title: "4. Trajets / frais kilométriques", body: "Déclare tes déplacements professionnels : trajet, distance, motif. Lexora calcule l'indemnité kilométrique selon le barème de l'entreprise. Joins un justificatif si demandé." },
      { title: "5. Fiches de paie", body: "Consulte et télécharge tes bulletins de paie (PDF) mois par mois. Vérifie salaire brut, cotisations (NSF, CSG), PAYE retenu, net à payer." },
      { title: "6. Ma fiche", body: "Consulte tes informations personnelles : coordonnées, contrat, RIB/IBAN de versement. Signale toute erreur au service RH — certaines données ne sont modifiables que par eux." },
    ],
    pitfalls: [
      "Oublier de pointer en fin de journée → heures incomplètes, régularisation nécessaire.",
      "Poser un congé sans solde suffisant → demande refusée ou congé sans solde.",
      "Déclarer un trajet sans justificatif quand il est exigé → indemnité non validée.",
      "Coordonnées bancaires erronées dans 'Ma fiche' → virement de salaire en échec.",
    ],
    tips: [
      "Vérifie ton bulletin dès sa mise à disposition : signale toute anomalie au RH rapidement.",
      "Anticipe tes demandes de congés : la validation par ton responsable prend un peu de temps.",
    ],
  },

  // ========================================================================
  // RH PAIE — EXPORTS MRA
  // ========================================================================
  '/rh/paie/exports-mra': {
    title: 'Paie — Exports MRA (PAYE, NSF, CSG, PRGF)',
    audience: 'comptable',
    intro:
      "Cet espace génère les fichiers de déclaration sociale et fiscale à soumettre à la <b>MRA</b> chaque mois : <b>PAYE</b> (impôt retenu à la source), <b>NSF</b> (National Savings Fund), <b>CSG</b> (Contribution Sociale Généralisée) et <b>PRGF</b> (Portable Retirement Gratuity Fund). La soumission se fait sur le portail MRA.",
    steps: [
      { title: "1. PAYE", body: "Impôt sur le revenu retenu à la source sur les salaires selon le barème en vigueur. Lexora génère le fichier PAYE (et le CSG/NSF return joint sur le même portail MRA) avec le détail par employé." },
      { title: "2. NSF (National Savings Fund)", body: "Cotisation au fonds d'épargne national, part employeur + part salarié, sur la rémunération soumise. Inclus dans le return mensuel MRA." },
      { title: "3. CSG (Contribution Sociale Généralisée)", body: "Remplace l'ex-NPF depuis sept. 2020. Cotisation employeur + salarié, taux dépendant du niveau de rémunération (palier de salaire). Déclarée mensuellement à la MRA." },
      { title: "4. PRGF (Portable Retirement Gratuity Fund)", body: "Fonds de gratuité de retraite portable (Workers' Rights Act) : cotisation employeur pour les salariés éligibles, déclarée et payée à la MRA selon le calendrier PRGF." },
      { title: "5. Génération et vérification", body: "Lexora produit les fichiers au format attendu par le portail MRA à partir des bulletins validés du mois. Vérifie les totaux par rubrique avant export." },
      { title: "6. Soumission et paiement", body: "Dépose les fichiers sur le portail e-services de la MRA et règle les montants. Conserve l'accusé de réception pour l'audit." },
    ],
    pitfalls: [
      "Soumettre après l'échéance (généralement le <b>20 du mois suivant</b> pour le return joint PAYE/CSG/NSF — vérifie la date exacte MRA) → pénalités et intérêts.",
      "Exporter avant d'avoir validé tous les bulletins du mois → fichier incomplet.",
      "Oublier une rubrique (PRGF, training levy) → return partiel, régularisation.",
      "Ne pas conserver l'accusé MRA → preuve de dépôt manquante en cas de contrôle.",
    ],
    externalLinks: [
      { label: "MRA — e-Services PAYE/CSG/NSF", url: "https://www.mra.mu/index.php/eservices/paye", description: "Soumission des returns mensuels." },
      { label: "MRA — CSG", url: "https://www.mra.mu/index.php/taxes-duties/csg", description: "Contribution Sociale Généralisée." },
    ],
    tips: [
      "Valide la paie du mois (voir /rh/paie/validation) avant de générer les exports : les fichiers en dépendent.",
      "Vérifie chaque mois l'échéance exacte publiée par la MRA : le 20 est la règle générale mais peut être décalé (jour férié).",
    ],
  },

  // ========================================================================
  // RH PAIE — PARAMÈTRES
  // ========================================================================
  '/rh/paie/parametres': {
    title: 'Paie — Paramètres (taux, barèmes, comptes)',
    audience: 'comptable',
    intro:
      "Ici tu configures les <b>paramètres de calcul de la paie</b> : taux de cotisations (NSF, CSG, PRGF, training levy), barèmes PAYE, comptes comptables d'imputation et valeurs par défaut. Ces paramètres alimentent tous les bulletins — une erreur ici se propage à toute la paie.",
    steps: [
      { title: "1. Taux de cotisations", body: "Configure les taux <b>NSF</b>, <b>CSG</b> (par palier de salaire), <b>PRGF</b> et <b>training levy</b> (part employeur / salarié). Mets-les à jour à chaque changement réglementaire (Finance Act annuel)." },
      { title: "2. Barèmes PAYE", body: "Paramètre les tranches d'imposition PAYE et l'<em>Income Exemption Threshold</em> (IET) en vigueur. Ces barèmes déterminent l'impôt retenu chaque mois." },
      { title: "3. Comptes comptables", body: "Associe chaque rubrique de paie à un compte du plan comptable : charges de personnel (salaires bruts), cotisations sociales, dettes envers organismes (NSF, CSG, MRA), nets à payer." },
      { title: "4. Valeurs par défaut", body: "Définis les valeurs par défaut applicables aux nouveaux salariés (horaire standard, indemnités, barème km) pour accélérer la création de fiches." },
      { title: "5. Validation des paramètres", body: "Après toute modification, lance une paie de test sur un employé fictif pour vérifier que les taux et l'imputation comptable produisent le résultat attendu." },
    ],
    pitfalls: [
      "Ne pas mettre à jour les taux après le Finance Act → cotisations et PAYE erronés sur toute la paie.",
      "Mauvais compte comptable sur une rubrique → écritures de paie fausses, rapprochement impossible.",
      "Modifier un taux en cours de mois sans recalculer les bulletins déjà générés.",
      "Confondre part employeur et part salarié dans la configuration des taux.",
    ],
    externalLinks: [
      { label: "MRA — Income Tax / PAYE", url: "https://www.mra.mu/index.php/taxes-duties/income-tax", description: "Barèmes PAYE et IET en vigueur." },
      { label: "MRA — CSG", url: "https://www.mra.mu/index.php/taxes-duties/csg" },
    ],
    tips: [
      "Renseigne les taux/barèmes officiels du Finance Act en cours — Lexora ne peut pas deviner une valeur réglementaire que tu n'as pas saisie.",
      "Historise les changements de taux pour pouvoir recalculer une paie d'un mois antérieur correctement.",
    ],
  },

  // ========================================================================
  // RH PAIE — VALIDATION
  // ========================================================================
  '/rh/paie/validation': {
    title: 'Paie — Validation et clôture du mois',
    audience: 'comptable',
    intro:
      "Étape de contrôle <b>avant la clôture</b> du mois de paie. Tu vérifies chaque bulletin, détectes les anomalies, corriges puis <b>verrouilles</b> la paie. Une fois validée, la paie alimente les écritures comptables et les exports MRA — il faut donc qu'elle soit juste avant verrouillage.",
    steps: [
      { title: "1. Récapitulatif du mois", body: "Vue d'ensemble : nombre de bulletins, masse salariale brute, total cotisations, total net à payer. Compare avec le mois précédent pour repérer une variation anormale." },
      { title: "2. Vérification des bulletins", body: "Contrôle bulletin par bulletin : salaire de base, heures sup, primes, congés payés, cotisations, PAYE, net. Vérifie les nouveaux entrants et les départs (prorata)." },
      { title: "3. Détection des anomalies", body: "Lexora signale les écarts : net négatif, variation forte vs mois précédent, cotisation manquante, employé sans IBAN, taux incohérent. Traite chaque anomalie avant clôture." },
      { title: "4. Corrections", body: "Reprends les bulletins en erreur (rubrique, taux, absence non saisie) et recalcule. Tant que la paie n'est pas verrouillée, les corrections sont libres." },
      { title: "5. Verrouillage / clôture", body: "Une fois tout vérifié, <b>verrouille</b> le mois. Cela fige les bulletins, génère les écritures de paie et débloque les exports MRA. Toute correction ultérieure passera par une régularisation, pas une modification directe." },
    ],
    pitfalls: [
      "Verrouiller avec une anomalie non traitée (net négatif, IBAN manquant) → paiement ou déclaration faux.",
      "Ne pas comparer avec le mois précédent → erreur de masse salariale passée inaperçue.",
      "Oublier le prorata des entrants/sortants du mois.",
      "Modifier une paie après verrouillage en contournant la régularisation → incohérence compta/MRA.",
    ],
    tips: [
      "Verrouille seulement quand toutes les anomalies sont à zéro : c'est la dernière barrière avant la compta et la MRA.",
      "Garde une trace de qui a validé et quand : utile en cas de contrôle ou de litige salarié.",
    ],
  },

  // ========================================================================
  // JURIDIQUE — ESPACE COMPLET (cabinet juridique mauricien)
  // ========================================================================
  '/juridique': {
    title: "Espace juridique — Vue d'ensemble",
    audience: 'all',
    intro:
      "Centre de pilotage juridique du cabinet : <b>dossiers</b> (affaires en cours), <b>contrats</b> (rédaction et cycle de vie), <b>contentieux</b> (litiges devant les juridictions mauriciennes), <b>conseil</b> (avis juridiques et conseil RH/social), <b>conformité</b> (obligations réglementaires, KYC/AML) et <b>secrétariat corporate</b> (vie sociale des entités sous Companies Act 2001). Tout le droit applicable à Maurice est ici : Companies Act 2001, Workers Rights Act 2019, Code Civil mauricien, FSC pour les GBC.",
    steps: [
      { title: "1. Identifie ton besoin", body: "Tu gères une <b>affaire</b> (dossier ouvert avec pièces et échéances) → <em>Dossiers</em>. Tu rédiges ou suis un <b>contrat</b> → <em>Contrats</em>. Tu es en <b>litige</b> → <em>Contentieux</em>. Tu as une <b>question de droit</b> → <em>Conseil</em>. Tu pilotes la <b>vie d'une société</b> → <em>Secrétariat corporate</em>." },
      { title: "2. Tableau de bord", body: "La page affiche les <b>échéances proches</b> (Annual Return, audiences, renouvellements), les dossiers actifs par statut et les alertes de conformité. Les deadlines corporate (AGM, dépôt comptes) remontent automatiquement." },
      { title: "3. Organisation par départements", body: "Les dossiers sont répartis entre départements juridiques (corporate, social, contentieux, conseil) avec responsables et droits d'accès. Voir <em>Départements</em>." },
      { title: "4. Articulation avec les autres modules", body: "Le <b>Conseil RH</b> se connecte au module RH (licenciement, discipline) ; la <b>conformité GBC</b> renvoie au dashboard FSC ; les <b>provisions pour litige</b> alimentent la comptabilité (IAS 37)." },
    ],
    pitfalls: [
      "Traiter un litige social comme un litige commercial : la juridiction diffère (Industrial Court vs Supreme Court).",
      "Laisser passer une échéance corporate (Annual Return, AGM) → pénalités et risque de radiation au Registrar.",
      "Ne pas documenter les avis donnés → perte de traçabilité en cas de mise en cause de la responsabilité du cabinet.",
    ],
    externalLinks: [
      { label: "Registrar of Companies (CBRD)", url: "https://companies.govmu.org", description: "Dépôts, Annual Return, recherche d'entités." },
      { label: "Supreme Court of Mauritius", url: "https://supremecourt.govmu.org", description: "Commercial Division, jurisprudence." },
      { label: "Industrial Court", url: "https://industrialcourt.govmu.org", description: "Contentieux du travail." },
    ],
    tips: [
      "Commence toujours par qualifier la nature de l'affaire (corporate / social / commercial) : cela conditionne procédure et juridiction.",
      "Active les alertes d'échéances : le secrétariat corporate vit au rythme de dates légales strictes.",
    ],
  },

  '/juridique/dossiers': {
    title: "Dossiers juridiques — Ouverture et suivi",
    audience: 'all',
    intro:
      "Gestion centralisée des affaires juridiques : ouverture d'un dossier, suivi d'avancement, pièces, échéances et statuts. Chaque dossier regroupe l'ensemble des éléments d'une affaire (corporate, contractuelle, contentieuse ou de conseil) avec son historique horodaté pour la traçabilité.",
    steps: [
      { title: "1. Ouvre un dossier", body: "Bouton <b>Nouveau dossier</b> : renseigne l'entité/le client concerné, la nature (corporate / social / commercial / conseil), le responsable et le département. Un numéro de dossier unique est attribué." },
      { title: "2. Ajoute les pièces", body: "Téléverse statuts, contrats, correspondances, mises en demeure, pièces de procédure. Chaque pièce est datée et versionnée. La confidentialité est respectée par les droits d'accès du département." },
      { title: "3. Pose les échéances", body: "Saisis les dates clés (audience, dépôt, délai de réponse, prescription). Lexora génère des alertes en amont. Attention aux délais de <b>prescription</b> du Code Civil mauricien." },
      { title: "4. Suis le statut", body: "Statuts : <em>Ouvert → En cours → En attente → Clos</em>. Chaque changement est tracé. Un dossier clos reste consultable et archivé." },
      { title: "5. Relie aux autres modules", body: "Un dossier de contentieux peut générer une provision (IAS 37) ; un dossier social se relie au module RH ; un dossier corporate aux actes de société." },
    ],
    pitfalls: [
      "Ouvrir un dossier sans responsable ni département → personne ne suit les échéances.",
      "Oublier d'enregistrer une date de prescription → action prescrite, droit perdu.",
      "Pièces non versionnées : on ne sait plus quelle version du contrat fait foi.",
    ],
    tips: [
      "Nomme les dossiers de façon homogène (entité - nature - année) pour les retrouver vite.",
      "Clôture proprement : un dossier laissé 'En cours' fausse les statistiques d'activité.",
    ],
  },

  '/juridique/contrats': {
    title: "Contrats — Rédaction et cycle de vie",
    audience: 'all',
    intro:
      "Rédaction, négociation, signature et archivage des contrats : <b>commercial</b>, <b>bail</b>, <b>contrat de prestation/service</b>, <b>NDA</b>, contrats de distribution, etc. Le droit mauricien des contrats repose sur le <b>Code Civil mauricien</b> (théorie générale des obligations) complété par les lois spéciales. Lexora gère le cycle complet : modèle → rédaction → relecture → signature → archivage → échéances de renouvellement.",
    steps: [
      { title: "1. Choisis le type", body: "Sélectionne un modèle : <em>contrat commercial</em>, <em>bail</em> (commercial ou d'habitation), <em>prestation de services</em>, <em>NDA / accord de confidentialité</em>. Chaque modèle intègre les clauses standard du droit mauricien." },
      { title: "2. Rédige les clauses essentielles", body: "Objet, prix/contrepartie, durée, conditions de résiliation, loi applicable et <b>clause attributive de juridiction</b> (souvent les tribunaux mauriciens), clause d'arbitrage éventuelle, force majeure, confidentialité, pénalités." },
      { title: "3. Vérifie la validité", body: "Conditions du Code Civil : consentement, capacité, objet certain, cause licite. Vérifie les pouvoirs du signataire (mandat, résolution du conseil pour une société)." },
      { title: "4. Signature", body: "Signature manuscrite ou électronique (Electronic Transactions Act 2000 reconnaît la signature électronique à Maurice). Conserve l'original signé." },
      { title: "5. Archivage et échéances", body: "Archive le contrat signé, pose les dates clés : échéance, préavis de renouvellement/résiliation, revue tarifaire. Lexora alerte avant l'échéance." },
    ],
    pitfalls: [
      "Oublier la clause attributive de juridiction et de loi applicable → incertitude en cas de litige.",
      "Signataire sans pouvoir (pas de résolution du conseil) → contrat inopposable à la société.",
      "Bail commercial sans enregistrement / droits de timbre → difficultés de preuve et fiscales.",
      "Laisser une tacite reconduction filer faute d'alerte de préavis.",
    ],
    externalLinks: [
      { label: "Registrar-General's Department", url: "https://rgd.govmu.org", description: "Enregistrement des actes et droits de timbre." },
      { label: "Mauritius Laws (AGO)", url: "https://attorneygeneral.govmu.org", description: "Textes de loi consolidés." },
    ],
    tips: [
      "Garde une bibliothèque de clauses types validées (voir /juridique/documents).",
      "Pour les contrats récurrents, standardise un modèle maison plutôt que repartir d'un fichier reçu par mail.",
    ],
  },

  '/juridique/contentieux': {
    title: "Contentieux & litiges — Procédure et provisions",
    audience: 'all',
    intro:
      "Suivi des litiges devant les juridictions mauriciennes. <b>Industrial Court</b> pour le contentieux du travail (licenciement, salaires, discrimination), <b>Commercial Division de la Supreme Court</b> pour les litiges commerciaux et corporate, juridictions de droit commun pour le reste. Lexora suit la procédure, les échéances d'audience et calcule les <b>provisions pour litige (IAS 37)</b>.",
    steps: [
      { title: "1. Qualifie le litige", body: "Identifie la matière : <b>social</b> (Industrial Court) / <b>commercial</b> (Commercial Division, Supreme Court) / <b>civil</b> / <b>administratif</b>. La juridiction compétente en découle." },
      { title: "2. Ouvre le dossier de procédure", body: "Renseigne les parties, l'objet, le montant en jeu, l'avocat (barrister/attorney) mandaté. Téléverse plaint/defence, pièces et conclusions." },
      { title: "3. Suis les échéances", body: "Dates d'audience, délais de dépôt des écritures, délais d'appel. Lexora alerte. Respecte impérativement les <b>délais de procédure</b> sous peine de forclusion." },
      { title: "4. Évalue le risque et provisionne", body: "Selon <b>IAS 37</b> : si une sortie de ressources est <em>probable</em> et estimable, comptabilise une <b>provision pour litige</b> (Débit charge, Crédit provision). Si seulement <em>possible</em>, mention en annexe (passif éventuel)." },
      { title: "5. Issue et exécution", body: "Jugement, transaction (settlement) ou désistement. Mets à jour la provision (reprise ou ajustement) et exécute la décision." },
    ],
    pitfalls: [
      "Saisir la mauvaise juridiction (Supreme Court pour un litige purement social relevant de l'Industrial Court).",
      "Manquer un délai d'appel (souvent court) → décision définitive.",
      "Ne pas provisionner un litige probable → états financiers non sincères (non-conformité IAS 37).",
      "Provisionner un passif seulement éventuel → surévaluation des charges.",
    ],
    externalLinks: [
      { label: "Supreme Court — Commercial Division", url: "https://supremecourt.govmu.org", description: "Litiges commerciaux et corporate." },
      { label: "Industrial Court", url: "https://industrialcourt.govmu.org", description: "Contentieux du travail." },
    ],
    tips: [
      "Documente l'évaluation du risque (probable/possible/faible) : c'est la base de la provision IAS 37 et de l'audit.",
      "Une transaction amiable bien chiffrée coûte souvent moins qu'un jugement + frais + délais.",
    ],
  },

  '/juridique/conseil': {
    title: "Conseil juridique — Demandes d'avis",
    audience: 'all',
    intro:
      "Gestion des demandes d'avis juridiques généraux et base de connaissances du cabinet. Une question arrive (du client ou en interne), on la <b>qualifie</b>, on recherche le droit applicable, on rend un avis tracé et réutilisable. Constitue progressivement une base de précédents internes.",
    steps: [
      { title: "1. Enregistre la demande", body: "Qui demande, sur quelle entité, l'objet précis de la question, le degré d'urgence. Un avis non écrit n'existe pas : tout est tracé." },
      { title: "2. Qualifie la question", body: "Classe la question par domaine : corporate, social/RH, fiscal, commercial, conformité. Si c'est du social, oriente vers <em>Conseil RH</em> ; si c'est fiscal, vers les modules fiscaux." },
      { title: "3. Recherche et rédige l'avis", body: "Identifie les textes (Companies Act, WRA, Code Civil, lois spéciales), la jurisprudence, et rédige un avis structuré : faits → question de droit → analyse → conclusion/recommandation." },
      { title: "4. Diffuse et archive", body: "Communique l'avis au demandeur et archive-le dans la base de connaissances. Indexe par mots-clés pour réutilisation." },
    ],
    pitfalls: [
      "Donner un avis oral non tracé → impossible à opposer, risque de responsabilité.",
      "Ne pas dater l'avis : le droit évolue, un avis ancien peut être obsolète.",
      "Confondre conseil et décision : le cabinet éclaire, le client décide.",
    ],
    tips: [
      "Capitalise : chaque avis enrichit la base de connaissances et accélère les suivants.",
      "Ajoute une réserve de validité (droit en vigueur à la date de l'avis).",
    ],
  },

  '/juridique/conseil-rh': {
    title: "Conseil juridique RH / social",
    audience: 'all',
    intro:
      "Conseil sur le droit du travail mauricien : <b>licenciement</b> (Workers Rights Act 2019), <b>discipline</b>, <b>harcèlement</b>, relations collectives (Industrial Relations) et articulation avec le module RH de Lexora. Objectif : sécuriser les décisions sociales pour éviter le contentieux devant l'Industrial Court.",
    steps: [
      { title: "1. Licenciement — motif et procédure", body: "Le <b>WRA 2019</b> encadre strictement la rupture. La <b>Section 64</b> impose, en cas de faute alléguée, une <b>procédure disciplinaire préalable</b> : notification écrite des griefs, droit pour le salarié de se faire entendre dans un délai raisonnable, décision motivée. Un licenciement sans cause valable ni procédure équitable est <em>unjustified</em>." },
      { title: "2. Discipline", body: "Avertissements gradués, entretien, droit de réponse du salarié. Documente chaque étape : l'écrit fait foi devant l'Industrial Court." },
      { title: "3. Harcèlement", body: "Traite toute plainte avec sérieux : enquête interne confidentielle, mesures conservatoires, sanction le cas échéant. Le harcèlement engage la responsabilité de l'employeur." },
      { title: "4. Relations collectives", body: "Négociation collective, droit syndical, procédures de l'Industrial Relations. Respecte les obligations de consultation." },
      { title: "5. Articulation module RH", body: "Le départ effectif (calcul notice, severance s.70, solde de tout compte, PAYE Exit Statement) se pilote dans le module RH — voir /rh/depart. Le conseil juridique sécurise <b>en amont</b> le motif et la procédure." },
    ],
    pitfalls: [
      "Licencier pour faute sans procédure disciplinaire s.64 → requalification en licenciement injustifié, indemnités majorées.",
      "Absence de trace écrite des avertissements → l'employeur ne peut pas prouver la faute.",
      "Traiter une plainte de harcèlement à la légère → responsabilité de l'employeur engagée.",
      "Confondre la phase 'conseil/procédure' et la phase 'calcul du départ' (module RH).",
    ],
    externalLinks: [
      { label: "Workers Rights Act 2019", url: "https://labour.govmu.org/Documents/Legislations/WRA2019.pdf", description: "Texte de référence (s.64 procédure, s.70 severance)." },
      { label: "Ministry of Labour", url: "https://labour.govmu.org", description: "Conciliation, médiation, textes sociaux." },
      { label: "Industrial Court", url: "https://industrialcourt.govmu.org", description: "Juridiction du contentieux social." },
    ],
    tips: [
      "La procédure équitable (fair hearing) compte autant que le motif : soigne les deux.",
      "En cas de doute sur le motif, privilégie la conciliation au Ministry of Labour avant le contentieux.",
    ],
  },

  '/juridique/conformite': {
    title: "Conformité réglementaire",
    audience: 'all',
    intro:
      "Pilotage des obligations légales et réglementaires par type d'entité : registres obligatoires, <b>KYC/AML</b> (Financial Intelligence and Anti-Money Laundering Act), obligations <b>FSC</b> pour les GBC, déclarations périodiques. Objectif : être en règle en permanence et démontrable en cas de contrôle.",
    steps: [
      { title: "1. Cartographie des obligations", body: "Selon le type d'entité (société domestique, GBC, Authorised Company, association), Lexora liste les obligations applicables : registres, dépôts, déclarations, renouvellements de licence." },
      { title: "2. KYC / AML", body: "Identification et vérification des clients/bénéficiaires (FIAMLA + AML/CFT Regulations). Conserve les pièces KYC, surveille les transactions, déclare les opérations suspectes (STR) à la FIU si nécessaire." },
      { title: "3. Registres obligatoires", body: "Tiens à jour les registres légaux (membres, administrateurs, charges, UBO) — voir /juridique/societe/registres. Leur absence est une infraction." },
      { title: "4. Obligations FSC (GBC)", body: "Pour les Global Business : licence FSC, substance (CIGA), Annual Return FSC, CRS/FATCA. Voir le dashboard GBC (/client/gbc-dashboard)." },
      { title: "5. Suivi et preuve", body: "Chaque obligation a un statut (à jour / en retard / à venir). Conserve les justificatifs : la conformité doit être <b>démontrable</b>." },
    ],
    pitfalls: [
      "KYC incomplet → blocage relation d'affaires et risque AML (sanctions lourdes).",
      "Registre UBO non mis à jour dans les délais → infraction.",
      "Confondre obligations d'une société domestique et d'un GBC (régime FSC distinct).",
      "Ne pas conserver la preuve de conformité : être en règle ne suffit pas, il faut pouvoir le prouver.",
    ],
    externalLinks: [
      { label: "FSC Mauritius", url: "https://www.fscmauritius.org", description: "Régulateur des Global Business et services financiers." },
      { label: "Financial Intelligence Unit", url: "https://fiumauritius.org", description: "Déclarations de soupçon (STR), AML/CFT." },
      { label: "Registrar of Companies (CBRD)", url: "https://companies.govmu.org", description: "Registres et dépôts légaux." },
    ],
    tips: [
      "Traite la conformité comme un processus continu, pas comme une corvée annuelle.",
      "Un dossier KYC/AML bien tenu est ta meilleure défense en cas de contrôle.",
    ],
  },

  '/juridique/documents': {
    title: "Bibliothèque documentaire juridique",
    audience: 'all',
    intro:
      "Référentiel des <b>modèles</b> (contrats, statuts, résolutions, PV, lettres), avec <b>versioning</b>, <b>conservation légale</b> et <b>confidentialité</b>. À Maurice, les documents comptables et sociaux se conservent généralement <b>au moins 10 ans</b> ; les registres de société sont conservés au siège tant que la société existe. Centralise tout ici pour éviter les versions éparpillées.",
    steps: [
      { title: "1. Modèles", body: "Bibliothèque de modèles validés : contrats types, statuts, résolutions ordinaires/spéciales, convocations d'assemblée, PV, lettres de mise en demeure. Réutilise plutôt que recréer." },
      { title: "2. Versioning", body: "Chaque modèle/document a un historique de versions daté. On sait toujours quelle est la version en vigueur et qui l'a modifiée." },
      { title: "3. Conservation légale", body: "Applique les durées : pièces comptables et sociales <b>≥ 10 ans</b>, contrats au moins pendant leur durée + prescription, registres de société conservés au siège tant que l'entité existe." },
      { title: "4. Confidentialité", body: "Droits d'accès par département/dossier. Les documents sensibles (litige, M&A, RH individuel) ne sont visibles que des personnes habilitées." },
    ],
    pitfalls: [
      "Modèles obsolètes utilisés faute de mise à jour → clauses non conformes au droit en vigueur.",
      "Détruire un document avant la fin du délai légal de conservation.",
      "Documents confidentiels accessibles à tous faute de droits → fuite d'information.",
    ],
    tips: [
      "Marque clairement la version 'en vigueur' de chaque modèle.",
      "Relie chaque document à son dossier pour le retrouver par le contexte.",
    ],
  },

  '/juridique/departements': {
    title: "Organisation par départements juridiques",
    audience: 'all',
    intro:
      "Structure le cabinet en <b>départements</b> (corporate, social/RH, contentieux, conseil, conformité) : répartition des dossiers, désignation des <b>responsables</b> et gestion des <b>droits d'accès</b>. Garantit que chaque affaire a un pilote et que la confidentialité est respectée.",
    steps: [
      { title: "1. Crée les départements", body: "Définis les départements pertinents pour ton cabinet et nomme un responsable par département." },
      { title: "2. Répartis les dossiers", body: "Affecte chaque dossier à un département. Les échéances et alertes remontent au responsable concerné." },
      { title: "3. Droits d'accès", body: "Les membres d'un département voient les dossiers de leur périmètre. Les dossiers sensibles peuvent être restreints davantage. Cohérent avec la hiérarchie de rôles." },
      { title: "4. Pilotage", body: "Vue de charge par département : dossiers actifs, échéances proches, dossiers en retard." },
    ],
    pitfalls: [
      "Dossier non affecté à un département → personne ne le suit.",
      "Droits trop larges : un membre voit des dossiers confidentiels hors de son périmètre.",
      "Responsable non désigné → les alertes d'échéance n'ont pas de destinataire.",
    ],
    tips: [
      "Aligne les départements sur les juridictions/matières (social→Industrial Court, corporate→ROC).",
      "Revois périodiquement les droits d'accès, surtout après des mouvements de personnel.",
    ],
  },

  '/juridique/societe': {
    title: "Secrétariat corporate — Vie de la société",
    audience: 'all',
    intro:
      "Pilotage du <b>secrétariat corporate</b> sous le <b>Companies Act 2001</b> : vie sociale de l'entité (actes, assemblées, résolutions, registres, obligations) et relations avec le <b>Registrar of Companies (ROC / CBRD)</b>. Une société mauricienne doit tenir ses registres, déposer son <b>Annual Return</b>, tenir son <b>AGM</b> et déclarer ses changements au Registrar.",
    steps: [
      { title: "1. Vue de l'entité", body: "Forme juridique, administrateurs, secrétaire de société (company secretary — obligatoire pour les sociétés autres que small private), siège social, capital, actionnariat." },
      { title: "2. Actes de société", body: "Constitution, modifications statutaires, changements d'administrateurs/de siège : tous donnent lieu à un dépôt au Registrar. Voir /juridique/societe/actes." },
      { title: "3. Assemblées et résolutions", body: "Tenue de l'AGM (dans les délais légaux), EGM si besoin, résolutions ordinaires/spéciales. Voir /juridique/societe/assemblees et /resolutions." },
      { title: "4. Registres et obligations", body: "Registres légaux tenus au siège (membres, administrateurs, charges, UBO) et échéances corporate (Annual Return, dépôt des comptes). Voir /registres et /obligations." },
    ],
    pitfalls: [
      "Pas de company secretary alors que la société y est tenue → non-conformité.",
      "Changements (administrateur, siège) non déclarés au Registrar dans les délais.",
      "Registres tenus ailleurs qu'au siège sans avoir notifié le lieu de conservation.",
    ],
    externalLinks: [
      { label: "Registrar of Companies (CBRD)", url: "https://companies.govmu.org", description: "Dépôts, Annual Return, recherche d'entités." },
      { label: "Companies Act 2001", url: "https://companies.govmu.org/Pages/Legislations.aspx", description: "Texte de référence du droit des sociétés." },
    ],
    tips: [
      "Le secrétariat corporate vit au rythme de dates légales : appuie-toi sur les alertes d'échéances.",
      "Tiens les registres à jour en continu, pas la veille de l'AGM.",
    ],
  },

  '/juridique/societe/actes': {
    title: "Actes de société",
    audience: 'all',
    intro:
      "Gestion des actes de la vie sociale sous Companies Act 2001 : <b>constitution</b> (incorporation), <b>modifications statutaires</b> (constitution/articles, capital, dénomination, objet) et <b>dépôts au Registrar of Companies</b>. Chaque acte significatif doit être déclaré au ROC dans les délais légaux.",
    steps: [
      { title: "1. Constitution", body: "Incorporation d'une société auprès du Registrar : nom (réservation préalable), forme (private/public, limited by shares/guarantee), constitution (optionnelle ; à défaut le modèle légal s'applique), administrateurs, secrétaire, siège, actionnariat." },
      { title: "2. Modifications statutaires", body: "Changement de dénomination, d'objet, augmentation/réduction de capital, modification de la constitution : décidés par résolution (souvent <b>spéciale</b>) puis déposés au Registrar." },
      { title: "3. Changements à déclarer", body: "Nomination/démission d'administrateur, changement de secrétaire ou de siège social : déclaration au ROC via les formulaires dédiés, dans les délais légaux (généralement courts, ex. 28 jours)." },
      { title: "4. Dépôt et preuve", body: "Conserve l'accusé de dépôt du Registrar. C'est la preuve d'opposabilité aux tiers." },
    ],
    pitfalls: [
      "Modifier les statuts sans la résolution requise (ordinaire vs spéciale) → acte irrégulier.",
      "Ne pas déposer un changement au Registrar dans le délai → pénalités et inopposabilité.",
      "Réutiliser une dénomination non réservée/déjà prise.",
    ],
    externalLinks: [
      { label: "Registrar of Companies (CBRD)", url: "https://companies.govmu.org", description: "Incorporation, dépôts, formulaires." },
    ],
    tips: [
      "Vérifie toujours quelle majorité (ordinaire/spéciale) est requise avant de modifier les statuts.",
      "Conserve l'accusé de dépôt avec le procès-verbal qui a décidé l'acte.",
    ],
  },

  '/juridique/societe/assemblees': {
    title: "Assemblées générales (AGM / EGM)",
    audience: 'all',
    intro:
      "Organisation des assemblées d'actionnaires sous Companies Act 2001 : <b>AGM</b> (assemblée annuelle) et <b>EGM/special meeting</b> (extraordinaire). Le Companies Act impose de tenir l'<b>AGM dans les 6 mois suivant la clôture de l'exercice</b> (et au plus 15 mois entre deux AGM). Convocation, quorum, déroulé et procès-verbal sont encadrés.",
    steps: [
      { title: "1. Convocation", body: "Délai de préavis légal aux actionnaires (généralement <b>au moins 14 jours</b>), avec ordre du jour. Une written resolution peut, dans certains cas, remplacer la tenue physique." },
      { title: "2. Quorum", body: "Vérifie le quorum prévu par la constitution (à défaut, règle supplétive du Companies Act). Sans quorum, les décisions sont nulles." },
      { title: "3. AGM — délai légal", body: "Tiens l'AGM <b>dans les 6 mois de la clôture</b> de l'exercice, sans dépasser 15 mois depuis la précédente. Ordre du jour type : comptes, rapport, nomination/renouvellement d'administrateurs et d'auditeur, dividendes." },
      { title: "4. EGM", body: "Convocation d'une assemblée extraordinaire pour décisions ponctuelles (modification statutaire, opération exceptionnelle). Peut être demandée par les actionnaires détenant le seuil légal." },
      { title: "5. Procès-verbal", body: "Rédige et conserve le PV signé : décisions, votes, présences. À conserver dans les registres de la société." },
    ],
    pitfalls: [
      "AGM tenue hors délai (> 6 mois après clôture) → non-conformité Companies Act.",
      "Préavis de convocation insuffisant → décisions contestables.",
      "Quorum non atteint mais décisions prises quand même → nullité.",
      "PV non signé ou non conservé → absence de preuve des décisions.",
    ],
    externalLinks: [
      { label: "Companies Act 2001", url: "https://companies.govmu.org/Pages/Legislations.aspx", description: "Règles d'assemblées, convocation, quorum." },
      { label: "Registrar of Companies (CBRD)", url: "https://companies.govmu.org" },
    ],
    tips: [
      "Planifie l'AGM dès la clôture pour rester dans la fenêtre des 6 mois.",
      "Pour une petite société, la written resolution évite la logistique d'une réunion physique.",
    ],
  },

  '/juridique/societe/resolutions': {
    title: "Résolutions — Ordinaires & spéciales",
    audience: 'all',
    intro:
      "Gestion des décisions d'actionnaires/administrateurs sous Companies Act 2001. Distinction clé : <b>résolution ordinaire</b> (majorité simple, > 50%) vs <b>résolution spéciale</b> (<b>majorité de 75%</b>) requise pour les décisions importantes (modification de la constitution, changement de nom, réduction de capital, dissolution volontaire). Les <b>special resolutions</b> doivent être déposées au <b>Registrar (CBRD)</b>.",
    steps: [
      { title: "1. Identifie le type requis", body: "<b>Ordinaire</b> (> 50%) : gestion courante. <b>Spéciale</b> (≥ 75%) : modifications statutaires majeures, dénomination, réduction de capital, dissolution. Le Companies Act/la constitution fixe l'exigence." },
      { title: "2. Written resolution", body: "Une résolution écrite signée par les actionnaires (selon le seuil requis) vaut décision sans réunion, lorsque la constitution l'autorise — pratique pour les sociétés à actionnariat restreint." },
      { title: "3. Adoption", body: "En assemblée ou par written resolution. Vérifie le calcul de la majorité sur les voix exprimées/parts concernées." },
      { title: "4. Dépôt des special resolutions", body: "Les <b>résolutions spéciales</b> sont déposées au <b>Registrar of Companies (CBRD)</b> dans le délai légal. Conserve l'accusé de dépôt." },
      { title: "5. Archivage", body: "Conserve toutes les résolutions (ordinaires et spéciales) dans les registres de la société, signées et datées." },
    ],
    pitfalls: [
      "Adopter à la majorité simple une décision exigeant 75% → résolution nulle.",
      "Oublier de déposer une special resolution au Registrar → inopposable.",
      "Written resolution utilisée alors que la constitution ne l'autorise pas.",
      "Mauvais calcul de la majorité (base de calcul erronée).",
    ],
    externalLinks: [
      { label: "Companies Act 2001", url: "https://companies.govmu.org/Pages/Legislations.aspx", description: "Résolutions ordinaires et spéciales." },
      { label: "Registrar of Companies (CBRD)", url: "https://companies.govmu.org", description: "Dépôt des special resolutions." },
    ],
    tips: [
      "Avant toute décision importante, vérifie le seuil (50% ou 75%) : c'est la source d'erreur n°1.",
      "Numérote et date les résolutions pour un registre propre.",
    ],
  },

  '/juridique/societe/registres': {
    title: "Registres légaux obligatoires",
    audience: 'all',
    intro:
      "Tenue des registres statutaires exigés par le Companies Act 2001 (à partir de la <b>Section 190</b>) : <b>registre des membres/actionnaires</b>, <b>registre des administrateurs et du secrétaire</b>, <b>registre des charges (charges/sûretés)</b>, <b>registre des bénéficiaires effectifs (UBO)</b>. Ces registres sont en principe <b>conservés au siège social</b> et accessibles dans les conditions légales.",
    steps: [
      { title: "1. Registre des membres", body: "Liste des actionnaires : identité, nombre et catégorie d'actions, dates d'entrée/sortie, transferts. C'est le registre qui fait foi de la qualité d'actionnaire." },
      { title: "2. Registre des administrateurs & secrétaire", body: "Identité, fonction, dates de nomination/cessation. Cohérent avec les déclarations au Registrar." },
      { title: "3. Registre des charges", body: "Sûretés grevant les actifs de la société (gages, hypothèques). L'enregistrement des charges conditionne leur opposabilité." },
      { title: "4. Registre des UBO", body: "Bénéficiaires effectifs (personnes physiques au-delà du seuil de contrôle, typiquement > 25%). Mise à jour rapide après tout changement." },
      { title: "5. Conservation au siège", body: "Les registres sont conservés au <b>siège social</b> (ou au lieu notifié au Registrar) tant que la société existe, et tenus à jour en continu." },
    ],
    pitfalls: [
      "Registres non tenus / non à jour → infraction au Companies Act.",
      "UBO périmé → non-conformité (et risque AML).",
      "Charge non enregistrée → inopposable aux tiers et créanciers.",
      "Registres conservés hors siège sans notification du lieu de conservation.",
    ],
    externalLinks: [
      { label: "Companies Act 2001", url: "https://companies.govmu.org/Pages/Legislations.aspx", description: "Section 190 et suivantes — registres." },
      { label: "Registrar of Companies (CBRD)", url: "https://companies.govmu.org" },
    ],
    tips: [
      "Mets à jour les registres en temps réel : ne les reconstitue pas avant un contrôle.",
      "Le registre des membres prime en cas de litige sur la qualité d'actionnaire.",
    ],
  },

  '/juridique/societe/obligations': {
    title: "Obligations & échéances corporate",
    audience: 'all',
    intro:
      "Tableau de bord des obligations périodiques de la société sous Companies Act 2001 : <b>Annual Return</b>, <b>dépôt des comptes</b>, renouvellements (licences, enregistrements) et <b>alertes d'échéances</b>. L'objectif est de ne jamais manquer une date légale qui exposerait à des pénalités ou à la radiation par le Registrar.",
    steps: [
      { title: "1. Annual Return", body: "Déclaration annuelle au Registrar confirmant les informations de la société (administrateurs, siège, actionnariat). Date d'échéance suivie automatiquement avec alerte." },
      { title: "2. Dépôt des comptes", body: "Les sociétés concernées déposent leurs états financiers (et rapport d'auditeur lorsque l'audit est requis) auprès du Registrar dans les délais légaux après la clôture/AGM." },
      { title: "3. AGM et autres deadlines", body: "Rappel : AGM dans les 6 mois de la clôture (voir /juridique/societe/assemblees). Les échéances corporate convergent ici en une seule vue." },
      { title: "4. Renouvellements", body: "Licences, enregistrements, licence FSC pour les GBC : Lexora suit les dates de renouvellement et alerte en amont." },
      { title: "5. Alertes et preuve", body: "Chaque obligation affiche son statut (à venir / fait / en retard). Conserve les accusés de dépôt comme preuve de conformité." },
    ],
    pitfalls: [
      "Annual Return en retard → pénalités et, à terme, risque de radiation (strike-off) par le Registrar.",
      "Comptes non déposés dans les délais → non-conformité et amendes.",
      "Renouvellement de licence oublié → activité exercée sans titre valide.",
      "Ne pas conserver les accusés de dépôt → conformité non démontrable.",
    ],
    externalLinks: [
      { label: "Registrar of Companies (CBRD)", url: "https://companies.govmu.org", description: "Annual Return, dépôt des comptes, échéances." },
      { label: "FSC Mauritius", url: "https://www.fscmauritius.org", description: "Renouvellement de licence GBC." },
    ],
    tips: [
      "Synchronise les échéances corporate avec le calendrier comptable (clôture → AGM → dépôt).",
      "Anticipe : une radiation administrative est lourde à faire annuler (restoration).",
    ],
  },

}

/**
 * Récupère la fiche d'aide pour un chemin donné.
 */
export function getHelpFor(pathname: string, locale: 'fr' | 'en' = 'fr'): HelpEntry | null {
  const registry = locale === 'en' ? getEnRegistry() : HELP_CONTENT
  const cleaned = pathname.split('?')[0].replace(/\/$/, '')
  if (registry[cleaned]) return registry[cleaned]
  if (locale === 'en' && HELP_CONTENT[cleaned]) return HELP_CONTENT[cleaned]
  const parts = cleaned.split('/').filter(Boolean)
  while (parts.length > 1) {
    parts.pop()
    const candidate = '/' + parts.join('/')
    if (registry[candidate]) return registry[candidate]
    if (locale === 'en' && HELP_CONTENT[candidate]) return HELP_CONTENT[candidate]
  }
  return null
}

let _enRegistry: Record<string, HelpEntry> | null = null
function getEnRegistry(): Record<string, HelpEntry> {
  if (_enRegistry) return _enRegistry
  try {
    // FIXME(lint-fix): require() utilisé pour chargement synchrone lazy ; conversion en import statique modifierait la sémantique
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./content-en') as { HELP_CONTENT_EN: Record<string, HelpEntry> }
    _enRegistry = mod.HELP_CONTENT_EN || {}
  } catch {
    _enRegistry = {}
  }
  return _enRegistry
}

