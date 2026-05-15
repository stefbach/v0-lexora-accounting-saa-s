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
 * No jargon technique. No emojis.
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
  // FISCALITÉ — TVA
  // ========================================================================
  '/comptable/tva': {
    title: 'Déclaration TVA — Maurice',
    audience: 'comptable',
    intro:
      "Cette page consolide la TVA collectée (sur tes factures clients) et déductible (sur tes factures fournisseurs) pour la période. Tu obtiens le solde à payer ou à reporter, et tu peux exporter les fichiers à charger sur le portail MRA.",
    steps: [
      {
        title: "Choisis la période",
        body:
          "Sélectionne le mois (VAT 3 mensuelle si CA > 10 M MUR) ou le trimestre (VAT 4) en haut de la page. Lexora calcule automatiquement à partir des factures déjà saisies.",
      },
      {
        title: "Vérifie les bases imposables",
        body:
          "Les bases à 15 %, zéro-rated et exonérées sont calculées par poste. Si une base te paraît anormale, clique sur le détail pour voir les factures incluses.",
        warning:
          "Une facture en brouillon n'est PAS comptée. Émets-les avant de finaliser ta déclaration.",
      },
      {
        title: "Génère les fichiers",
        body:
          "Clique sur <b>Exporter Schedule A (ventes)</b> et <b>Schedule B (achats)</b>. Tu obtiens deux fichiers CSV à charger sur le portail MRA.",
      },
      {
        title: "Connecte-toi à la MRA",
        body:
          "Ouvre <b>eservices.mra.mu</b>, connecte-toi avec ton TAN et mot de passe MRA. Le bouton ci-dessous t'y emmène directement.",
      },
      {
        title: "Charge les fichiers sur le portail",
        body:
          "Dans le portail MRA → <b>VAT</b> → <b>Submit Return (VAT 3)</b> ou <b>(VAT 4)</b> selon ton régime. Sélectionne la période, charge les deux CSV, saisis le total TVA brute si demandé, valide.",
        warning:
          "MRA bloque les dépôts après le 20 du mois suivant. Pénalité 5 % + intérêts au-delà.",
      },
      {
        title: "Paie le solde (si dû)",
        body:
          "Après validation, MRA t'affiche le montant à payer. Tu peux régler par virement (MCB Real-Time) ou via le portail bank-to-MRA. Marque la déclaration comme <b>payée</b> dans Lexora une fois fait pour qu'elle disparaisse du suivi.",
      },
    ],
    pitfalls: [
      "Oubli de saisir une facture fournisseur → tu perds de la TVA déductible. Vérifie les pièces du mois avant de cloturer.",
      "Mauvais taux (0 % vs 15 % vs exonéré) → contrôle les codes TVA dans le catalogue services.",
      "Période non verrouillée côté Lexora → des modifications a posteriori désynchronisent ta déclaration.",
      "TAN MRA incorrect → la déclaration n'est pas acceptée, vérifie dans Direction → Accès MRA.",
    ],
    externalLinks: [
      { label: "Portail MRA — Login", url: "https://eservices.mra.mu", description: "Connexion au portail des services en ligne MRA pour soumettre la déclaration." },
      { label: "Guide officiel VAT — MRA", url: "https://www.mra.mu/index.php/eservices/value-added-tax-vat", description: "Documentation officielle du VAT Act 1998." },
      { label: "Taux de change du jour", url: "https://www.mra.mu/index.php/exchange-rates", description: "Pour les factures en devise étrangère." },
    ],
    tips: [
      "Active la soumission automatique via le bot Telegram pour ne plus jamais oublier (Direction → Accès MRA).",
      "Le bot Telegram peut générer et t'envoyer les fichiers MRA en pièce jointe sur demande (\"export TVA de mai\").",
    ],
  },

  // ========================================================================
  // FISCALITÉ — PAYE
  // ========================================================================
  '/rh/paie': {
    title: 'Calcul et déclaration PAYE',
    audience: 'comptable',
    intro:
      "Cette page gère le calcul des bulletins de paie mensuels et la génération des fichiers de déclaration MRA (PAYE, CSG, NSF, PRGF). Tu pilotes tout le cycle : saisie variables → calcul → validation → comptabilisation → virements bancaires → soumission MRA.",
    steps: [
      {
        title: "Saisis les variables du mois",
        body:
          "Heures supplémentaires (OT), primes variables, congés payés, absences. Tu peux le faire ici ou via le bot Telegram (\"Jean 8h OT 1.5x mai\").",
      },
      {
        title: "Calcule la paie",
        body:
          "Clique sur <b>Calculer le mois</b>. Lexora applique le barème PAYE 2025-2026 (11 tranches, 0 % à 20 %), CSG (1,5 % ou 3 %), NSF (1 %), PRGF (4,5 % employeur).",
      },
      {
        title: "Vérifie les bulletins",
        body:
          "Compare avec le mois précédent. Si un net est très différent, ouvre le détail pour vérifier les variables ou la fiscalité.",
      },
      {
        title: "Valide chaque bulletin",
        body:
          "Quand tu es sûr, clique <b>Valider</b> sur chacun. Tant que tous ne sont pas validés, tu ne peux pas verrouiller.",
      },
      {
        title: "Verrouille la période",
        body:
          "<b>Verrouiller</b> rend les bulletins immuables et déclenche la comptabilisation automatique (écritures 4xx, 6xx, 422, 431, 437). Tu ne peux plus modifier après.",
        warning:
          "Action destructive. Demande validation à un second œil ou utilise le bot Telegram qui demande confirmation explicite.",
      },
      {
        title: "Génère les fichiers de virement",
        body:
          "Va dans <b>Exports → Virements salaires</b>. Lexora génère un fichier CSV par banque bénéficiaire (MCB, SBM, ABC…). Charge-les sur ton Internet Banking pour exécuter les paiements.",
      },
      {
        title: "Génère les déclarations MRA",
        body:
          "Onglets <b>PAYE-MRA</b>, <b>CSG/NSF-MRA</b>, <b>PRGF-MRA</b>. Récap PDF + détail CSV pour chaque. Charge les CSV sur eservices.mra.mu.",
      },
      {
        title: "Paie les charges sociales",
        body:
          "Échéance MRA : <b>20 du mois suivant</b> pour PAYE et CSG. Au-delà : pénalités. Le bot Telegram t'envoie un rappel J-7 / J-3 / J-1.",
      },
    ],
    pitfalls: [
      "Période non verrouillée → comptabilisation manquante, déclarations MRA incohérentes.",
      "Coordonnées bancaires manquantes sur un employé → il apparaîtra dans le fichier 'SANS_BANQUE' à compléter manuellement.",
      "Oubli d'une heure sup ou prime → bulletin sous-évalué, employé mécontent.",
      "Mauvais taux CSG : ≤ 50 000 MUR/mois = 1,5 % / > 50 000 = 3 %.",
    ],
    externalLinks: [
      { label: "Portail MRA — eServices", url: "https://eservices.mra.mu", description: "Soumission PAYE, CSG, NSF, PRGF." },
      { label: "Workers Rights Act 2019", url: "https://labour.govmu.org/Pages/Workers-Rights-Act-2019.aspx", description: "Référence droits employés (OT, congés, severance)." },
      { label: "Calculateur PAYE MRA", url: "https://www.mra.mu/index.php/individuals/calculate-your-paye", description: "Outil officiel de vérification." },
    ],
    tips: [
      "Le bot Telegram peut piloter tout le workflow : 'calcule la paie de mai', 'verrouille', 'génère les virements', 'soumets PAYE'.",
      "Tu peux pré-configurer une validation à 2 yeux (direction + admin) pour les paies > 1M MUR via Permissions Telegram.",
    ],
  },

  // ========================================================================
  // BANQUE
  // ========================================================================
  '/client/direction/bank-credentials': {
    title: 'Accès Bancaires — Scraping automatique',
    audience: 'client',
    intro:
      "Configure les identifiants Internet Banking de chaque compte pour que Lexora aille chercher automatiquement les soldes et transactions chaque nuit. Plus besoin de télécharger les relevés manuellement.",
    steps: [
      {
        title: "Récupère tes identifiants Internet Banking",
        body:
          "Pour MCB : Username + Password (et PIN secondaire si compte business). Pour SBM, ABC, MauBank, MyT Money, AfrAsia, Bank One : idem.",
        warning:
          "N'utilise PAS un compte 2FA / OTP — le robot ne peut pas s'authentifier. Désactive le 2FA pour ce compte ou crée un compte de lecture seule dédié à Lexora.",
      },
      {
        title: "Saisis-les ici",
        body:
          "Pour chaque compte de la société, clique <b>Configurer</b>. Les credentials sont chiffrées <b>AES-256-GCM</b> avant stockage. Personne, pas même un admin Lexora, ne peut les lire en clair.",
      },
      {
        title: "Active le scraping",
        body:
          "Coche <b>Scraping automatique activé</b>. Le robot tourne tous les jours à 02:00 UTC et récupère solde + transactions de la veille.",
      },
      {
        title: "Lance un scrape manuel pour tester",
        body:
          "Clique <b>Scraper maintenant</b>. Le robot va tenter une connexion. Si succès : statut <em>Dernier scrape OK</em> + solde affiché. Si échec : message d'erreur explicite.",
      },
      {
        title: "Surveille les anomalies",
        body:
          "Le bot Telegram t'alerte si le solde scrapé diffère de plus de 5 % du solde dans Lexora, ou si une variation > 30 % en 24h est détectée. Tu peux régler ces seuils via le tool memory_set du bot.",
      },
    ],
    pitfalls: [
      "Si tu changes ton mot de passe Internet Banking, n'oublie pas de le mettre à jour ici sinon le scraping échouera.",
      "Certaines banques bloquent les sessions concurrentes — si tu es connecté en parallèle, le robot peut être déconnecté.",
      "Pour les comptes JOINTS, le PIN peut changer tous les 90j. Mets une note dans le champ Notes pour t'en souvenir.",
    ],
    externalLinks: [
      { label: "MCB Internet Banking", url: "https://ibank.mcb.mu" },
      { label: "SBM Internet Banking", url: "https://internetbanking.sbmgroup.mu" },
      { label: "ABC Banking", url: "https://www.abcbank.mu" },
      { label: "MauBank Online", url: "https://internetbanking.maubank.mu" },
    ],
    tips: [
      "Tu peux déclencher un scrape depuis Telegram : 'scrape le compte MCB' (rôle Direction).",
      "Les transactions scrapées alimentent le rapprochement bancaire automatique côté Comptabilité.",
    ],
  },

  // ========================================================================
  // MRA CREDENTIALS
  // ========================================================================
  '/client/direction/mra-credentials': {
    title: 'Accès MRA — Soumission automatique des déclarations',
    audience: 'client',
    intro:
      "Configure les identifiants MRA de la société. Une seule paire identifiant/mot de passe sert pour TOUTES les déclarations : PAYE, CSG/NSF, PRGF, VAT, TDS, CIT. Le robot Lexora peut soumettre les déclarations à ta place sur eservices.mra.mu.",
    steps: [
      {
        title: "Vérifie que la société a un TAN MRA",
        body:
          "Le TAN (Tax Account Number) est attribué par la MRA à l'enregistrement. Tu le trouves sur tes correspondances MRA. Format : 1 lettre + 9 chiffres.",
      },
      {
        title: "Crée ou récupère le compte eServices MRA",
        body:
          "Va sur <b>eservices.mra.mu</b> → <b>Register</b> si pas encore fait. Sinon connecte-toi pour vérifier que tu as bien accès aux modules VAT, PAYE, CIT.",
      },
      {
        title: "Saisis-les ici",
        body:
          "Username (souvent le TAN), Password, TAN si différent du username. Tous chiffrés AES-256-GCM. Lexora ne les voit jamais en clair.",
      },
      {
        title: "Active la soumission automatique",
        body:
          "Coche <b>Soumission automatique active</b>. À partir de là, quand tu valides une paye ou une TVA dans Lexora, tu peux demander au bot Telegram (Direction) : 'soumets la PAYE de mai à la MRA' et le robot le fait.",
        warning:
          "Si la MRA a activé un 2FA OTP sur ton compte, la soumission auto est impossible — le bot Telegram t'enverra les fichiers en pièce jointe pour soumission manuelle.",
      },
      {
        title: "Surveille les soumissions",
        body:
          "Statut <em>Dernière soumission</em> + référence MRA + screenshot de l'accusé de réception. Si <em>manuel requis</em>, tu reçois les fichiers en PJ Telegram à charger toi-même.",
      },
    ],
    pitfalls: [
      "Mot de passe MRA expiré → le robot échoue. MRA force le changement tous les 90 jours, pense à le mettre à jour ici.",
      "Compte sans activation des modules → tu dois activer VAT/PAYE depuis Settings du portail MRA.",
      "Tentatives échouées multiples → MRA bloque le compte 30 min. Attends avant de relancer.",
    ],
    externalLinks: [
      { label: "Portail MRA eServices", url: "https://eservices.mra.mu", description: "Login + dépôt des déclarations." },
      { label: "MRA Helpdesk", url: "https://www.mra.mu/index.php/contact-us", description: "Pour réinitialiser un mot de passe ou débloquer un compte." },
      { label: "Comprendre le TAN", url: "https://www.mra.mu/index.php/individuals/tax-account-number-tan", description: "Documentation officielle." },
    ],
    tips: [
      "Le robot soumet PAYE/CSG/PRGF/VAT/TDS via le MÊME portail — pas besoin de configurer plusieurs accès.",
      "Pour activer le robot Playwright (auto-submit), il faut que MRA n'ait pas de 2FA. Sinon, fallback PJ Telegram fonctionne très bien.",
    ],
  },

  // ========================================================================
  // EMAIL ACCOUNTS
  // ========================================================================
  '/client/email-accounts': {
    title: 'Comptes email — Envoi sortant',
    audience: 'all',
    intro:
      "Configure les comptes email que Lexora utilisera pour envoyer des emails (relances clients, rapports, notifications). Plusieurs comptes possibles : un par société (partagé) ou personnels (réservés à toi).",
    steps: [
      {
        title: "Choisis ton provider",
        body:
          "<b>SMTP</b> (Gmail App Password, OVH, Outlook) — le plus simple, fonctionne avec n'importe quel email standard. <b>Resend</b> — service transactionnel, nécessite un domaine vérifié, idéal pour envoi en masse.",
      },
      {
        title: "Pour Gmail : génère un App Password",
        body:
          "Gmail bloque les SMTP avec mot de passe normal. Va sur <b>myaccount.google.com/apppasswords</b> (nécessite 2FA actif sur ton compte Google). Crée un App Password 'Lexora'. Copie les 16 caractères.",
        warning:
          "Si la page App Passwords est inaccessible, c'est que tu n'as pas activé la 2FA. Active-la d'abord dans la sécurité du compte Google.",
      },
      {
        title: "Pour Resend : crée un domaine vérifié",
        body:
          "Va sur <b>resend.com/domains</b>. Ajoute ton domaine (ex: acme.io). Configure les DNS (SPF, DKIM) chez ton hébergeur. Attends la vérification (~10 min). Génère ensuite une API key.",
      },
      {
        title: "Remplis le formulaire ici",
        body:
          "Label, From email, From name (ce que voit le destinataire). Type : Personnel (toi seul) ou Société (partagé entre tous les membres direction+). Coche <b>Définir comme défaut</b> si tu veux que ce compte soit le défaut.",
      },
      {
        title: "Teste avec le bouton Test",
        body:
          "Un email réel est envoyé à ton From email. Si tu le reçois : configuration OK. Sinon : message d'erreur précis (mot de passe invalide, domaine non vérifié, etc.).",
      },
    ],
    pitfalls: [
      "Gmail : utiliser le mot de passe normal au lieu d'un App Password — l'envoi sera rejeté avec 'Username and Password not accepted'.",
      "From email d'un domaine non vérifié sur Resend → email rejeté.",
      "Si tu changes ton App Password Google, mets à jour ici sinon les envois échouent.",
    ],
    externalLinks: [
      { label: "Google App Passwords", url: "https://myaccount.google.com/apppasswords" },
      { label: "Resend Domains", url: "https://resend.com/domains" },
      { label: "Resend API Keys", url: "https://resend.com/api-keys" },
    ],
    tips: [
      "L'agent Telegram peut envoyer des emails automatiquement (relances, rapports) en utilisant tes comptes configurés ici.",
      "Pour brander 'depuis Acme Comptabilité <contact@acme.io>' au lieu de 'Lexora <onboarding@resend.dev>', configure un compte Resend avec ton domaine.",
    ],
  },

  // ========================================================================
  // GOOGLE ACCOUNTS (Agenda)
  // ========================================================================
  '/client/settings/google-accounts': {
    title: 'Comptes Google (Agenda) — Connexion OAuth',
    audience: 'all',
    intro:
      "Connecte ton compte Google pour que Lexora puisse gérer ton agenda directement depuis Telegram : créer des RDV, ajouter des liens Google Meet, trouver des créneaux libres, modifier ou annuler des événements.",
    steps: [
      {
        title: "Clique sur Connecter Google",
        body:
          "Tu es redirigé vers la page de consentement Google. Sélectionne le compte Google que tu veux lier (perso ou pro).",
      },
      {
        title: "Autorise les permissions",
        body:
          "Google liste les permissions demandées par Lexora : <b>Voir et modifier les événements de ton agenda</b>, ton email et profil. Clique <b>Autoriser</b>.",
        warning:
          "Si tu vois 'Application non vérifiée' ou 'Access blocked', c'est que ton email n'est pas dans les Test Users côté Google Cloud. Demande à l'admin de t'ajouter.",
      },
      {
        title: "Vérifie que le compte est lié",
        body:
          "De retour sur cette page, tu vois ton email Google avec un badge <em>Connecté</em>. Si tu connectes plusieurs comptes (perso + cabinet), choisis lequel est le défaut.",
      },
      {
        title: "Utilise depuis Telegram",
        body:
          "Tu peux maintenant dire au bot : 'liste mes RDV de la semaine', 'rdv avec marie demain 14h en visio', 'annule celui de 16h'. Le bot crée des liens Meet automatiquement quand tu demandes une visio.",
      },
    ],
    pitfalls: [
      "Si tu n'es pas connecté en navigation privée, Google peut auto-sélectionner un autre compte que celui que tu veux lier. Déconnecte-toi des autres comptes Google avant.",
      "Refresh token absent : si tu reconnectes un compte déjà lié, révoque d'abord l'accès dans myaccount.google.com/permissions, puis reconnecte.",
      "L'app est en mode Testing tant que tu n'as pas demandé la vérification Google (utile pour >100 users).",
    ],
    externalLinks: [
      { label: "Mes permissions Google", url: "https://myaccount.google.com/permissions", description: "Révoque l'accès Lexora si besoin." },
      { label: "Mon Google Agenda", url: "https://calendar.google.com", description: "Vue web de tes événements." },
    ],
    tips: [
      "Tu peux connecter plusieurs comptes Google (perso + pro). Le bot demandera lequel utiliser lors d'une création de RDV.",
      "Les events créés via Telegram apparaissent normalement dans ton Google Agenda + invitations envoyées aux attendees.",
    ],
  },

  // ========================================================================
  // TELEGRAM PERMISSIONS
  // ========================================================================
  '/client/telegram-permissions': {
    title: 'Permissions Telegram Bot',
    audience: 'client',
    intro:
      "Configure quelles personnes peuvent utiliser le bot Telegram Lexora et avec quels droits. Tu peux lier des employés RH au bot (génération de code), modifier leurs rôles, ou customiser leurs capabilités au-delà de leur rôle.",
    steps: [
      {
        title: "Comprends la matrice des rôles",
        body:
          "8 rôles disponibles : <b>Employé</b> (voir bulletins, soumettre congé) → <b>Manager</b> (+ valider congés équipe) → <b>RH</b> (+ OT, primes, paie) → <b>Comptable</b> (+ banque, factures, MRA) → <b>Direction</b> (TOUT). Chaque rôle a des capabilities par défaut visibles dans la matrice.",
      },
      {
        title: "Liste les Membres (compte Lexora actif)",
        body:
          "La table <b>Membres</b> affiche les utilisateurs qui ont déjà un compte Lexora et sont rattachés à cette société. Tu peux changer leur rôle ou customiser leurs capabilities (bouton <b>Permissions</b>).",
      },
      {
        title: "Liste les Employés RH non rattachés",
        body:
          "La table <b>Employés RH</b> affiche les employés actifs de la fiche RH qui n'ont pas encore de compte Lexora. Clique <b>Générer code</b> pour créer un compte + générer un code Telegram que tu transmets à l'employé.",
      },
      {
        title: "Génère un code Telegram pour un employé",
        body:
          "Choisis le rôle dans le dropdown (par défaut Employé). Coche les capabilities custom si tu veux limiter/étendre les droits. Clique <b>Générer code</b>. Tu obtiens un code 6 chars + un lien <em>t.me/LexoraBot?start=CODE</em> + un message prêt à envoyer (WhatsApp, email, SMS).",
        warning:
          "Le code expire après 15 minutes. Si l'employé ne l'utilise pas à temps, regénère-le.",
      },
      {
        title: "L'employé active le bot",
        body:
          "Il ouvre Telegram, cherche le bot, ou clique sur le lien. Il tape <b>/start CODE</b>. Son compte est activé instantanément.",
      },
      {
        title: "Audit des actions",
        body:
          "Chaque action faite par le bot (envoi facture, validation paie, soumission MRA) est tracée dans <code>telegram_actions</code>. Tu vois les stats dans la colonne <em>Audit (30j)</em> de chaque membre.",
      },
    ],
    pitfalls: [
      "Email manquant sur l'employé → tu ne peux pas générer de code (le compte Lexora a besoin d'un email pour être créé).",
      "Plusieurs employés avec le même email → un seul peut être lié.",
      "Capabilities customisées : si tu coches des caps au-delà du rôle, c'est l'override qui s'applique. Pour revenir au rôle par défaut, clique <b>Supprimer override</b> dans le modal.",
    ],
    tips: [
      "Pour les actions destructives (validation paie, soumission MRA, virements), un récap + boutons de confirmation est ENVOYÉ au user avant exécution.",
      "Le bot connait le nom et le rôle de chaque personne — il les utilise naturellement dans ses réponses.",
    ],
  },

  // ========================================================================
  // COMPTABILITÉ — DASHBOARD
  // ========================================================================
  '/comptable': {
    title: 'Tableau de bord comptable',
    audience: 'comptable',
    intro:
      "Vue d'ensemble de l'activité de toutes les sociétés que tu suis : alertes du jour, factures en attente, échéances MRA, soldes bancaires, KPIs financiers. Le point de départ chaque matin.",
    steps: [
      { title: "Sélectionne une société", body: "Le selecteur en haut filtre tous les indicateurs sur la société active. Tu peux basculer entre clients via le menu Cabinet." },
      { title: "Consulte les alertes du jour", body: "Documents manquants, factures en retard, échéances MRA imminentes (J-7 / J-3 / J-1). Clique sur chaque alerte pour la résoudre." },
      { title: "Vérifie la trésorerie", body: "Soldes de tous les comptes bancaires actifs. Si scraping configuré, les soldes sont mis à jour chaque nuit (cf. Accès Bancaires)." },
      { title: "Suis les KPIs du mois", body: "CA, dépenses, résultat, marge brute. Compare avec le mois précédent et l'année." },
    ],
    pitfalls: [
      "Si un indicateur semble figé, vérifie que la société est bien sélectionnée et que ses données sont à jour (factures émises, écritures comptabilisées).",
    ],
    tips: [
      "Demande au bot Telegram \"point du matin\" pour recevoir un résumé condensé en mobile.",
      "Active les alertes Telegram (Permissions Bot) pour ne plus louper d'échéance.",
    ],
  },

  // ========================================================================
  // COMPTABILITÉ — FACTURES CLIENTS
  // ========================================================================
  '/comptable/factures-clients': {
    title: 'Factures clients',
    audience: 'comptable',
    intro:
      "Liste de toutes les factures émises aux clients de la société. Tu crées, valides, envoies par email, suis les paiements et déclenches les relances automatiques.",
    steps: [
      { title: "Crée une facture", body: "Bouton <b>Nouvelle facture</b>. Choisis le client (ou crée-le), ajoute les lignes (depuis le catalogue services ou libre), Lexora calcule TVA + TTC automatiquement." },
      { title: "Émets la facture", body: "Quand tu passes de brouillon à <b>en_attente</b>, Lexora génère un PDF, attribue un numéro auto (préfixe société + AAAA-NNNNN) et crée les écritures comptables.", warning: "Une fois émise, tu ne peux plus modifier — seulement annuler par avoir." },
      { title: "Envoie par email", body: "Bouton <b>Envoyer</b> → email avec PDF attaché vers le contact du client. L'envoi est tracé." },
      { title: "Suis les paiements", body: "Quand le client paie, enregistre le paiement (montant, date, mode, référence). Lexora met à jour le solde et clôture si totalement payé." },
      { title: "Relances automatiques", body: "Si non payée à l'échéance, les relances partent en J+7, J+15, J+30 selon les paramètres de la société. Tu peux désactiver pour un client donné." },
    ],
    pitfalls: [
      "Oublier d'émettre (laisser en brouillon) → la facture n'est PAS comptée dans TVA collectée ni CA.",
      "Émettre sans contact email → impossible d'envoyer automatiquement par email.",
    ],
    tips: [
      "Crée une facture via Telegram : \"facture acme 50000 mur consulting septembre\" et le bot la prépare pour toi.",
      "Pour les abonnements / loyers récurrents : utilise les <b>Factures récurrentes</b> (génération auto chaque mois).",
    ],
  },

  // ========================================================================
  // COMPTABILITÉ — FACTURES FOURNISSEURS
  // ========================================================================
  '/comptable/factures-fournisseurs': {
    title: 'Factures fournisseurs',
    audience: 'comptable',
    intro:
      "Saisie et suivi des factures reçues de tes fournisseurs. La TVA déductible est calculée pour la déclaration MRA, les écritures de classe 4 + 6 sont passées automatiquement.",
    steps: [
      { title: "Saisis ou importe", body: "Bouton <b>Nouvelle facture fournisseur</b> pour saisie manuelle. Sinon dépose le PDF dans Documents → l'OCR extrait fournisseur, montant, TVA, date. Tu valides et c'est créé." },
      { title: "Affecte les comptes comptables", body: "Lexora suggère un compte de charge (classe 6) selon le libellé. Vérifie et ajuste si besoin (achats marchandises 60x vs services 62x vs frais bancaires 627, etc.)." },
      { title: "Enregistre le paiement", body: "Quand tu paies le fournisseur, marque la facture comme <b>payée</b> avec la date et le mode (virement, chèque, carte). L'écriture de banque est passée." },
    ],
    pitfalls: [
      "Saisir sans TVA alors que la facture en contient → tu perds de la TVA déductible.",
      "Mauvais compte de charge → ton compte de résultat est faussé.",
    ],
    tips: [
      "Tu peux envoyer une photo de ticket / facture au bot Telegram → il l'OCR et te propose la création.",
    ],
  },

  // ========================================================================
  // COMPTABILITÉ — BANQUE / RELEVÉS
  // ========================================================================
  '/comptable/banque': {
    title: 'Relevés bancaires',
    audience: 'comptable',
    intro:
      "Consulte et importe les relevés bancaires de chaque compte. Les transactions importées sont la matière première du rapprochement automatique.",
    steps: [
      { title: "Importe un relevé", body: "Dépose le PDF ou CSV de la banque (téléchargé depuis Internet Banking) dans Documents. L'OCR extrait les transactions et met à jour le compte." },
      { title: "Active le scraping (recommandé)", body: "Direction → Accès Bancaires : configure une fois les identifiants Internet Banking et Lexora rapatrie automatiquement chaque nuit." },
      { title: "Lance le rapprochement", body: "Une fois les transactions importées, va dans Rapprochement bancaire. Lexora propose des matches auto entre transactions et factures." },
    ],
    pitfalls: [
      "Importer 2 fois le même relevé → doublons. Vérifie les dates de chevauchement.",
      "Sans scraping ni import régulier → impossible de réconcilier proprement.",
    ],
    externalLinks: [
      { label: "MCB Internet Banking", url: "https://ibank.mcb.mu" },
      { label: "SBM Internet Banking", url: "https://internetbanking.sbmgroup.mu" },
    ],
  },

  // ========================================================================
  // COMPTABILITÉ — RAPPROCHEMENT
  // ========================================================================
  '/comptable/rapprochement': {
    title: 'Rapprochement bancaire',
    audience: 'comptable',
    intro:
      "Associe automatiquement les transactions bancaires aux factures clients/fournisseurs et aux écritures comptables. Sépare ce qui est lettré du restant à traiter.",
    steps: [
      { title: "Lance le rapprochement auto", body: "Bouton <b>Lancer rapprochement</b>. Les règles R1 à R7 s'appliquent : montant exact, libellé, période, références. Propose des matches que tu confirmes en 1 clic." },
      { title: "Traite les non rapprochés", body: "Pour chaque transaction restée seule, soit tu l'associes manuellement à une facture, soit tu la passes en écriture libre (frais bancaires, transfert interne, etc.)." },
      { title: "Verrouille le mois", body: "Quand tout est lettré, verrouille la période. Tu ne pourras plus modifier les écritures comptabilisées sauf déverrouillage explicite." },
    ],
    pitfalls: [
      "Lettrer hâtivement une transaction avec la mauvaise facture → la facture reste impayée côté Lexora. Désassocie et corrige.",
    ],
    tips: [
      "Les paiements de salaires sont lettrés automatiquement avec le journal SAL après verrouillage de la paie.",
    ],
  },

  // ========================================================================
  // COMPTABILITÉ — JOURNAL
  // ========================================================================
  '/comptable/journal': {
    title: 'Journal comptable',
    audience: 'comptable',
    intro:
      "Liste chronologique de toutes les écritures comptables, classées par code journal (VTE ventes, ACH achats, BNQ banque, SAL salaires, OD opérations diverses).",
    steps: [
      { title: "Filtre par journal et période", body: "Sélecteurs en haut. La plupart des écritures sont auto-générées (factures, paie, banque), tu peux aussi en saisir manuellement (OD)." },
      { title: "Saisis une OD manuelle", body: "Bouton <b>Nouvelle écriture</b>. Choisis le journal OD, ajoute les lignes débit/crédit (équilibre obligatoire), libellé clair." },
      { title: "Export comptable", body: "Bouton <b>Exporter</b> pour PDF récap ou CSV (FEC, IFRS) à fournir au commissaire aux comptes / auditeur." },
    ],
    pitfalls: [
      "Saisir une écriture déséquilibrée → impossible (Lexora bloque). Mais une saisie sur les mauvais comptes peut fausser le bilan : double-vérifie avant validation.",
    ],
  },

  // ========================================================================
  // COMPTABILITÉ — BALANCE
  // ========================================================================
  '/comptable/balance': {
    title: 'Balance comptable',
    audience: 'comptable',
    intro:
      "Synthèse des soldes de tous les comptes du plan comptable à une date donnée. Outil de contrôle avant clôture mensuelle ou exercice.",
    steps: [
      { title: "Choisis la période", body: "Sélecteur en haut : balance cumulée à fin de mois, fin de trimestre, fin d'exercice." },
      { title: "Vérifie l'équilibre", body: "Total débit = Total crédit. Si déséquilibre, une écriture est incohérente (Lexora indique laquelle)." },
      { title: "Drill-down sur un compte", body: "Clique sur un solde anormal pour voir le détail des écritures qui le composent." },
    ],
    pitfalls: [
      "Solde non nul sur un compte d'attente (47x) → une écriture est en suspens, à régulariser avant clôture.",
    ],
  },

  // ========================================================================
  // COMPTABILITÉ — PLAN COMPTABLE
  // ========================================================================
  '/comptable/plan-comptable': {
    title: 'Plan comptable',
    audience: 'comptable',
    intro:
      "Liste des comptes utilisés (classes 1 à 7). Lexora démarre avec un plan SYSCOHADA adapté Maurice ; tu peux créer des sous-comptes pour affiner.",
    steps: [
      { title: "Cherche un compte", body: "Recherche par numéro ou libellé. Les comptes utilisés ont un cadenas (non supprimables tant que des écritures référencent)." },
      { title: "Crée un sous-compte", body: "Bouton <b>Nouveau compte</b>. Numéro = parent + 1 chiffre (ex: 6061 = sous-compte de 606). Libellé clair." },
    ],
    pitfalls: [
      "Modifier un compte utilisé → toutes les écritures héritent du nouveau libellé. Tu peux mais réfléchis bien.",
    ],
  },

  // ========================================================================
  // COMPTABILITÉ — TIERS
  // ========================================================================
  '/comptable/tiers': {
    title: 'Tiers (clients & fournisseurs)',
    audience: 'comptable',
    intro:
      "Annuaire des clients et fournisseurs de la société : nom, BRN, email, téléphone, adresse, conditions paiement. Utilisé par les factures et les relances.",
    steps: [
      { title: "Crée un tiers", body: "Bouton <b>Nouveau</b>. Type (client / fournisseur / les deux), entreprise, BRN MRA, email, adresse, conditions de paiement (30j net, 60j, etc.)." },
      { title: "Lie aux factures", body: "Quand tu crées une facture, choisis le tiers dans la liste. Les coordonnées remplissent le PDF automatiquement." },
    ],
    pitfalls: [
      "BRN manquant ou incorrect → la déclaration TVA peut être rejetée par MRA si tiers > 100 000 MUR/an.",
      "Email manquant → impossible d'envoyer la facture automatiquement.",
    ],
  },

  // ========================================================================
  // RH — DASHBOARD
  // ========================================================================
  '/rh': {
    title: 'Tableau de bord RH',
    audience: 'all',
    intro:
      "Vue d'ensemble des ressources humaines : effectif, congés en attente, alertes (contrats expirant, retour maternité, ancienneté), prochaines paies.",
    steps: [
      { title: "Effectif actif", body: "Nombre d'employés actifs, par contrat (CDI, CDD, etc.). Clique pour la liste complète." },
      { title: "Demandes en attente", body: "Congés à valider (manager / direction). Approuve ou refuse en 1 clic depuis ici ou via Telegram." },
      { title: "Alertes RH", body: "Contrats CDD arrivant à échéance, retours de maternité, employés approchant 5 ans (droit VL), etc." },
    ],
    tips: [
      "Le bot Telegram envoie des notifications proactives à 09:00 chaque jour : nouvelle demande de congé, employé en retard, etc.",
    ],
  },

  // ========================================================================
  // RH — EMPLOYÉS
  // ========================================================================
  '/rh/employes': {
    title: 'Employés',
    audience: 'all',
    intro:
      "Liste de tous les employés (actifs + archivés). Crée, modifie, archive un employé. C'est la source de vérité pour la paie et la fiche RH.",
    steps: [
      { title: "Crée un employé", body: "Bouton <b>Nouveau</b>. Renseigne prénom, nom, poste, date d'arrivée, salaire de base, devise, coordonnées bancaires. Le code employé est généré auto." },
      { title: "Renseigne email + téléphone", body: "Email obligatoire pour le bulletin de paie envoyé par email + lier au bot Telegram. Téléphone pour les notifications urgentes." },
      { title: "Ajoute le contrat", body: "Onglet <b>Contrats</b> : type (CDI / CDD / Saisonnier...), date début/fin, salaire de base, primes fixes." },
      { title: "Active la fiche RH", body: "Une fois complète, l'employé apparaît dans le calcul paie et peut recevoir un code Telegram via Permissions Bot." },
    ],
    pitfalls: [
      "Date de départ saisie → l'employé sort du calcul paie à partir du mois suivant. Vérifie 2 fois avant.",
      "RIB incomplet → l'employé sera dans le fichier 'SANS BANQUE' lors des virements salaires.",
    ],
  },

  // ========================================================================
  // RH — CONGÉS
  // ========================================================================
  '/rh/conges': {
    title: 'Congés',
    audience: 'all',
    intro:
      "Gère les demandes de congés (AL, SL, VL, FML, ML, PL) et leur validation. Affiche le solde par employé et l'historique.",
    steps: [
      { title: "Soumets une demande (employé)", body: "Bouton <b>Demander un congé</b>. Type (annuel, maladie, vacances, familial, maternité, paternité), dates début/fin, motif optionnel." },
      { title: "Le manager reçoit la notification", body: "Notification Telegram + apparaît dans 'En attente' ici. Boutons <em>Valider</em> / <em>Refuser</em> directement." },
      { title: "Solde mis à jour", body: "Si validé, les jours sont décomptés du solde. Si refusé, l'employé reçoit la décision avec motif." },
    ],
    pitfalls: [
      "Demande sur jours sans solde → refus auto (sauf si tu autorises le solde négatif pour cet employé).",
      "Maladie sans certificat médical au-delà de 6 jours → le solde SL sur certificat (15j) ne se débloque pas. Demande le certificat à l'employé.",
    ],
    externalLinks: [
      { label: "Workers Rights Act 2019 — Congés", url: "https://labour.govmu.org/Pages/Workers-Rights-Act-2019.aspx" },
    ],
  },

  // ========================================================================
  // RH — POINTAGES
  // ========================================================================
  '/rh/pointages': {
    title: 'Pointages',
    audience: 'all',
    intro:
      "Suivi des heures d'arrivée et départ des employés. Source de calcul des heures supplémentaires et des absences non justifiées.",
    steps: [
      { title: "Saisie manuelle", body: "Bouton <b>Nouveau pointage</b>. Employé, date, heure d'entrée et de sortie. Pour corrections occasionnelles." },
      { title: "Pointage via Telegram", body: "Chaque employé lié au bot peut pointer en tapant <b>/in</b> et <b>/out</b> (ou \"je commence\" / \"je termine\" en langage naturel). Plus simple que badger." },
      { title: "Surveillance no-show", body: "Si planning et pointage différent, le bot alerte le manager + l'employé après 10 min (cf. Permissions Bot)." },
    ],
    tips: [
      "Pour le télétravail, le pointage Telegram suffit. Pas besoin de badgeuse physique.",
    ],
  },

  // ========================================================================
  // RH — PLANNING
  // ========================================================================
  '/rh/planning': {
    title: 'Planning',
    audience: 'all',
    intro:
      "Plannings hebdomadaires des équipes (shifts, horaires). Sert de référence pour la détection des absences et le calcul des heures sup.",
    steps: [
      { title: "Crée un shift type", body: "Onglet <b>Modèles</b> : ex. \"Bureau 9h-18h\", \"Service du soir 14h-22h\". Heures, jours, pauses." },
      { title: "Affecte un employé", body: "Glisse-dépose un employé sur un jour pour lui attribuer un shift. Tu peux faire des plannings sur 1 semaine ou 1 mois." },
      { title: "Publie", body: "Une fois validé, publie. Les employés voient leur planning et le bot Telegram surveille les pointages selon ces horaires." },
    ],
    pitfalls: [
      "Modifier un planning publié → les employés ne sont pas notifiés automatiquement. Préviens-les via Telegram ou email.",
    ],
  },

  // ========================================================================
  // RH — PRIMES
  // ========================================================================
  '/rh/paie/primes': {
    title: 'Primes',
    audience: 'comptable',
    intro:
      "Ajoute des primes variables à la paie du mois en cours : performance, ancienneté, exceptionnelle. Elles s'ajoutent au salaire brut et impactent PAYE / CSG / NSF.",
    steps: [
      { title: "Sélectionne employé et période", body: "Choisis l'employé concerné et le mois. La prime sera intégrée au prochain bulletin." },
      { title: "Type de prime", body: "Performance, ancienneté, prime exceptionnelle, 13e mois pro-rata, etc. Catalogue paramétrable." },
      { title: "Montant en MUR", body: "Saisis le montant brut. PAYE / CSG / NSF sont automatiquement appliqués selon le barème." },
    ],
    tips: [
      "Tu peux ajouter une prime via Telegram : \"prime 5000 mur pour marie mai\" — le bot écrit la prime ici automatiquement.",
    ],
  },

  // ========================================================================
  // RH — HEURES SUP
  // ========================================================================
  '/rh/paie/ot': {
    title: 'Heures supplémentaires',
    audience: 'comptable',
    intro:
      "Saisie des heures sup réalisées par les employés sur le mois. Calculées 1.5x (10 premières heures hebdo OT) ou 2x (au-delà, dimanche, jour férié).",
    steps: [
      { title: "Choisis l'employé et le mois", body: "Sélecteur en haut. Tu vois les heures déjà saisies." },
      { title: "Ajoute les heures", body: "Date, nb d'heures, taux (1.5x ou 2x), motif. Le calcul s'ajoute automatiquement au bulletin." },
    ],
    externalLinks: [
      { label: "Workers Rights Act 2019 — Heures sup", url: "https://labour.govmu.org/Pages/Workers-Rights-Act-2019.aspx" },
    ],
    tips: [
      "Via Telegram : \"Jean 8h OT 1.5x mai\" — le bot saisit automatiquement.",
    ],
  },

  // ========================================================================
  // FISCAL — TDS
  // ========================================================================
  '/comptable/tds': {
    title: 'TDS (Tax Deducted at Source)',
    audience: 'comptable',
    intro:
      "Retenues à la source sur les paiements (Section 111A ITA Maurice). Services prof. 5% résidents / 10% non-résidents, intérêts 15%, loyer 5%, royalties 15%, commission 3%, contracts > 300k MUR 0.75%.",
    steps: [
      { title: "Identifie les paiements concernés", body: "Lexora flagge automatiquement les factures fournisseurs qui relèvent de TDS (selon nature service + montant + statut résident)." },
      { title: "Génère la déclaration mensuelle", body: "Bouton <b>Déclarer TDS du mois</b>. Lexora produit le fichier CSV et le récap à soumettre sur eservices.mra.mu avant le 20 du mois suivant." },
      { title: "Paie le montant retenu", body: "Tu paies à la MRA. Marque la déclaration comme <b>payée</b> dans Lexora." },
    ],
    pitfalls: [
      "Oublier la TDS sur un paiement éligible → pénalité de 5% + intérêts. Vérifie chaque facture flaggée." ,
      "Retard > 20 du mois suivant → pénalités MRA automatiques.",
    ],
    externalLinks: [
      { label: "Portail MRA TDS", url: "https://eservices.mra.mu" },
      { label: "Section 111A ITA — Guide MRA", url: "https://www.mra.mu/index.php/eservices/tax-deduction-at-source-tds" },
    ],
  },

  // ========================================================================
  // FISCAL — CIT / APS
  // ========================================================================
  '/comptable/cit': {
    title: 'CIT — Corporate Income Tax',
    audience: 'comptable',
    intro:
      "Impôt sur les sociétés (15% standard, 3% effectif pour GBC1 avec Partial Exemption Regime 80%). Déclaration annuelle 6 mois après la clôture + APS trimestriels.",
    steps: [
      { title: "Suis le résultat fiscal", body: "Le compte de résultat te donne le résultat comptable. Lexora applique les retraitements fiscaux (charges non déductibles, etc.) pour obtenir la base imposable." },
      { title: "Calcule l'APS", body: "Système trimestriel d'avances. Lexora calcule chaque trimestre 25% de l'impôt estimé. Soumets à MRA avant fin du trimestre." },
      { title: "Déclaration annuelle", body: "6 mois après clôture de l'exercice. Lexora consolide tous les éléments + déduit les APS payés. Solde à payer ou remboursement." },
    ],
    pitfalls: [
      "Sous-estimer l'APS → pénalité si solde annuel > 25% au-dessus des avances cumulées.",
      "Pour GBC1 : oublier de documenter la substance (CIGA) → perte du régime 3% effectif.",
    ],
    externalLinks: [
      { label: "Portail MRA CIT", url: "https://eservices.mra.mu" },
      { label: "Guide CIT MRA", url: "https://www.mra.mu/index.php/eservices/income-tax-companies" },
    ],
  },

  // ========================================================================
  // CLIENT — PROFIL
  // ========================================================================
  '/client/profil': {
    title: 'Mon Profil',
    audience: 'client',
    intro:
      "Tes informations personnelles dans Lexora : nom, email, mot de passe, langue, préférences de notification. Et la liaison à Telegram pour utiliser le bot.",
    steps: [
      { title: "Mets à jour tes infos", body: "Nom complet, email, téléphone. Ces infos servent aux signatures et aux notifications." },
      { title: "Change ton mot de passe", body: "Bouton dédié. Choisis un mot de passe fort (12 caractères mini, mix de tout)." },
      { title: "Connecte Telegram", body: "Section Telegram : clique <b>Générer un code</b>, ouvre Telegram, cherche @LexoraAgent_bot, tape <b>/start CODE</b>. Tu pourras ensuite gérer ta compta depuis Telegram." },
      { title: "Choisis ta langue", body: "Français (Maurice) ou English. Affecte l'UI et les réponses du bot Telegram." },
    ],
    tips: [
      "Active la 2FA si Supabase le propose pour sécuriser ton compte.",
    ],
  },

  // ========================================================================
  // CLIENT — TELEGRAM CONFIG
  // ========================================================================
  '/client/telegram-config': {
    title: 'Configuration Telegram (personnelle)',
    audience: 'all',
    intro:
      "Lie ton compte Lexora à ton compte Telegram pour pouvoir utiliser le bot @LexoraAgent_bot — gestion factures, paie, agenda, banque depuis ton téléphone.",
    steps: [
      { title: "Génère un code", body: "Bouton <b>Générer un code</b>. Tu obtiens un code 6 caractères valable 15 min." },
      { title: "Ouvre Telegram", body: "Sur ton téléphone, cherche <b>@LexoraAgent_bot</b> ou utilise le lien direct fourni." },
      { title: "Tape /start CODE", body: "Démarre une conversation avec le bot et envoie <b>/start ABCXYZ</b> (remplace ABCXYZ par ton code). Le compte est lié." },
      { title: "Teste", body: "Envoie \"bonjour\" au bot. Il doit te saluer par ton prénom et te dire à quoi il peut t'aider selon ton rôle." },
    ],
    pitfalls: [
      "Code expiré (> 15 min) → regénère-en un.",
      "Si tu changes de numéro Telegram, fais <b>/logout</b> sur l'ancien et reconnecte avec un nouveau code.",
    ],
    tips: [
      "Si tu gères plusieurs sociétés, le bot te demande laquelle activer via <b>/societe</b>.",
    ],
  },

  // ========================================================================
  // CABINET — DASHBOARD
  // ========================================================================
  '/comptable/cabinet': {
    title: 'Tableau de bord Cabinet',
    audience: 'comptable',
    intro:
      "Vue agrégée de tous les clients du cabinet : tâches du mois par client (TVA, paye, MRA, factures), KPIs cumulés, alertes critiques, collaborateurs en charge.",
    steps: [
      { title: "Filtre par client", body: "Vue d'ensemble ou drill-down sur un client précis. Tu peux taguer les clients (urgent, en cours, en attente, etc.)." },
      { title: "Travail en cours", body: "Liste des tâches assignées à toi (TVA mai, paye juin, etc.) avec deadline et statut." },
      { title: "Acting as", body: "Bouton sur un client pour <b>basculer en mode client</b> : tu vois Lexora comme si tu étais le directeur de cette société. Pratique pour saisir." },
    ],
    tips: [
      "Assigne des collaborateurs à chaque client (onglet Collaborateurs) — chacun voit son scope.",
    ],
  },

  // ========================================================================
  // DOCUMENTS
  // ========================================================================
  '/client/documents': {
    title: 'Documents',
    audience: 'all',
    intro:
      "Tous les documents (factures fournisseurs, relevés bancaires, contrats, justificatifs) déposés dans Lexora. L'OCR extrait les infos automatiquement pour les facturer / comptabiliser.",
    steps: [
      { title: "Dépose un document", body: "Drag-and-drop ou bouton <b>Importer</b>. Formats PDF, JPG, PNG, XLSX. Jusqu'à 20 Mo par fichier." },
      { title: "OCR auto", body: "Lexora analyse via IA Claude : type de document détecté (facture fournisseur, relevé bancaire, fiche de paie...), montants extraits, fournisseur, date." },
      { title: "Valide la création", body: "Si OCR correcte : 1 clic pour créer la facture fournisseur ou enregistrer le relevé. Sinon, corrige les champs avant de valider." },
    ],
    pitfalls: [
      "Document de mauvaise qualité (photo floue, papier froissé) → OCR moins fiable, corrige manuellement.",
      "Si statut 'erreur', clique <b>Réanalyser</b> pour relancer l'OCR.",
    ],
    tips: [
      "Tu peux envoyer une photo de document directement au bot Telegram — il l'ingère et te propose la création.",
    ],
  },
}

/**
 * Récupère la fiche d'aide pour un chemin donné.
 * Essaye exact, puis remonte en supprimant les segments un par un.
 * Ex: /comptable/tva/2025-05 → essaye /comptable/tva/2025-05, puis /comptable/tva.
 */
export function getHelpFor(pathname: string): HelpEntry | null {
  const cleaned = pathname.split('?')[0].replace(/\/$/, '')
  if (HELP_CONTENT[cleaned]) return HELP_CONTENT[cleaned]
  const parts = cleaned.split('/').filter(Boolean)
  while (parts.length > 1) {
    parts.pop()
    const candidate = '/' + parts.join('/')
    if (HELP_CONTENT[candidate]) return HELP_CONTENT[candidate]
  }
  return null
}
