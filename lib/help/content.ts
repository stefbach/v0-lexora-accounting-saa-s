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
