// Strings swept from client/comptable/banque/accounting components
// into the bilingual i18n system. Namespace prefix: sccl.
export const sweepCompClChunk = {
  fr: {
    // SocieteActiveProvider
    'sccl.societes_load_failed': 'Impossible de charger la liste des sociétés.',
    'sccl.societes_network_error': 'Erreur réseau lors du chargement des sociétés.',
    'sccl.societe_not_accessible': 'Société non accessible.',

    // LogoUploader
    'sccl.societe_unavailable': 'Société non disponible',
    'sccl.unsupported_format': 'Format non supporté (PNG, JPEG, WebP ou SVG)',
    'sccl.file_too_large': 'Fichier trop volumineux (max {max} Mo)',
    'sccl.upload_error': 'Erreur upload',
    'sccl.generic_error': 'Erreur',
    'sccl.logo_alt': 'Logo société',
    'sccl.change_logo': 'Changer le logo',
    'sccl.upload_logo': 'Téléverser un logo',
    'sccl.delete': 'Supprimer',
    'sccl.logo_hint': 'PNG, JPEG, WebP ou SVG · max 2 Mo · sera affiché en haut des factures (PDF + email).',
    'sccl.confirm_delete_logo': 'Supprimer le logo de la société ?',

    // CabinetBanner
    'sccl.unknown_client': 'Client inconnu',
    'sccl.cabinet_view': 'Vue cabinet',
    'sccl.exit_folder': 'Sortir du dossier',
    'sccl.societe_short': 'Société #{id}',

    // ExerciceLockBadge
    'sccl.exercice_closed_aria': 'Exercice clôturé',
    'sccl.exercice_closed_on': ' le {date}',
    'sccl.exercice_balance_frozen': ', bilan figé le {datetime}',
    'sccl.exercice_open_aria': 'Exercice ouvert, modifications autorisées',
    'sccl.closed': 'Clôturé',
    'sccl.open': 'Ouvert',
    'sccl.balance_frozen_on': 'Bilan figé le {datetime}',

    // SantePCMBadge
    'sccl.pcm_ok': 'PCM OK',
    'sccl.pcm_check': 'PCM à vérifier',
    'sccl.pcm_unbalanced': 'PCM déséquilibré',
    'sccl.pcm_unknown': 'PCM ?',
    'sccl.pcm_fetch_error': 'Santé PCM : erreur de récupération',
    'sccl.pcm_worst': '{label} — pire : {nom} (score {score}/100, écart {ecart} MUR)',
    'sccl.pcm_loading': 'Santé PCM…',

    // ReleveVersionHistory
    'sccl.load_error': 'Erreur de chargement',
    'sccl.releve_history_title': 'Historique des versions du relevé',
    'sccl.releve_history_desc': "Chaque ré-upload d'un même relevé (compte + période) crée une nouvelle version. Seule la plus récente est active.",
    'sccl.no_version_found': 'Aucune version trouvée.',
    'sccl.active_version': 'Version active',
    'sccl.superseded': 'Supersédée',
    'sccl.imported_label': 'Importé :',
    'sccl.superseded_on_label': 'Supersédée le :',

    // PlanComptablePicker
    'sccl.classe_capitaux': 'Capitaux',
    'sccl.classe_immobilisations': 'Immobilisations',
    'sccl.classe_stocks': 'Stocks',
    'sccl.classe_tiers': 'Tiers',
    'sccl.classe_tresorerie': 'Trésorerie',
    'sccl.classe_charges': 'Charges',
    'sccl.classe_produits': 'Produits',
    'sccl.classe_speciaux': 'Spéciaux',
    'sccl.unknown_error': 'Erreur inconnue',
    'sccl.choose_account': 'Choisir un compte du plan comptable',
    'sccl.pcm_accounts_count': 'Plan Comptable Maurice (PCM) — {count} comptes',
    'sccl.search_account_placeholder': 'Rechercher par code (4210) ou libellé (salaires…)',
    'sccl.all': 'Toutes',
    'sccl.loading': 'Chargement…',
    'sccl.no_account_match': 'Aucun compte ne correspond à "{q}"',
    'sccl.debit': 'Débit',
    'sccl.credit': 'Crédit',
    'sccl.cancel': 'Annuler',

    // CerveauTIBOK
    'sccl.assistant_lexora': 'Assistant LEXORA',
    'sccl.cerveau_welcome': "👋 Bonjour ! Je suis l'**Assistant IA LEXORA** — votre expert en droit du travail mauricien, paie, RH et pilotage.\n\nJe peux répondre à toute question sur :\n- 📋 **Contrats** (CDI, CDD, clauses WRA)\n- 💰 **Paie** (calculs CSG, PAYE, OT, 13ème mois)\n- 🏖️ **Congés** (droits, calculs, maternité/paternité)\n- ⚖️ **Droit social** (licenciement, préavis, indemnités)\n- 📊 **Pilotage** (présences, conformité, alertes)\n\nQue puis-je faire pour vous ?",
    'sccl.cerveau_error': '❌ Une erreur est survenue. Veuillez réessayer.',
    'sccl.cerveau_subtitle': 'Expert droit social mauricien • Paie • RH',
    'sccl.cerveau_question_placeholder': 'Posez votre question...',
    'sccl.cerveau_footer': 'Expert droit mauricien WRA 2019 • Finance Act 2024 • MRA 2025',
  },
  en: {
    // SocieteActiveProvider
    'sccl.societes_load_failed': 'Unable to load the list of companies.',
    'sccl.societes_network_error': 'Network error while loading companies.',
    'sccl.societe_not_accessible': 'Company not accessible.',

    // LogoUploader
    'sccl.societe_unavailable': 'Company unavailable',
    'sccl.unsupported_format': 'Unsupported format (PNG, JPEG, WebP or SVG)',
    'sccl.file_too_large': 'File too large (max {max} MB)',
    'sccl.upload_error': 'Upload error',
    'sccl.generic_error': 'Error',
    'sccl.logo_alt': 'Company logo',
    'sccl.change_logo': 'Change logo',
    'sccl.upload_logo': 'Upload a logo',
    'sccl.delete': 'Delete',
    'sccl.logo_hint': 'PNG, JPEG, WebP or SVG · max 2 MB · will be shown at the top of invoices (PDF + email).',
    'sccl.confirm_delete_logo': 'Delete the company logo?',

    // CabinetBanner
    'sccl.unknown_client': 'Unknown client',
    'sccl.cabinet_view': 'Firm view',
    'sccl.exit_folder': 'Exit folder',
    'sccl.societe_short': 'Company #{id}',

    // ExerciceLockBadge
    'sccl.exercice_closed_aria': 'Financial year closed',
    'sccl.exercice_closed_on': ' on {date}',
    'sccl.exercice_balance_frozen': ', balance sheet frozen on {datetime}',
    'sccl.exercice_open_aria': 'Financial year open, edits allowed',
    'sccl.closed': 'Closed',
    'sccl.open': 'Open',
    'sccl.balance_frozen_on': 'Balance sheet frozen on {datetime}',

    // SantePCMBadge
    'sccl.pcm_ok': 'PCM OK',
    'sccl.pcm_check': 'PCM to check',
    'sccl.pcm_unbalanced': 'PCM unbalanced',
    'sccl.pcm_unknown': 'PCM ?',
    'sccl.pcm_fetch_error': 'PCM health: fetch error',
    'sccl.pcm_worst': '{label} — worst: {nom} (score {score}/100, gap {ecart} MUR)',
    'sccl.pcm_loading': 'PCM health…',

    // ReleveVersionHistory
    'sccl.load_error': 'Loading error',
    'sccl.releve_history_title': 'Statement version history',
    'sccl.releve_history_desc': 'Each re-upload of the same statement (account + period) creates a new version. Only the latest is active.',
    'sccl.no_version_found': 'No version found.',
    'sccl.active_version': 'Active version',
    'sccl.superseded': 'Superseded',
    'sccl.imported_label': 'Imported:',
    'sccl.superseded_on_label': 'Superseded on:',

    // PlanComptablePicker
    'sccl.classe_capitaux': 'Equity',
    'sccl.classe_immobilisations': 'Fixed assets',
    'sccl.classe_stocks': 'Inventory',
    'sccl.classe_tiers': 'Third parties',
    'sccl.classe_tresorerie': 'Cash',
    'sccl.classe_charges': 'Expenses',
    'sccl.classe_produits': 'Income',
    'sccl.classe_speciaux': 'Special',
    'sccl.unknown_error': 'Unknown error',
    'sccl.choose_account': 'Choose an account from the chart of accounts',
    'sccl.pcm_accounts_count': 'Mauritius Chart of Accounts (PCM) — {count} accounts',
    'sccl.search_account_placeholder': 'Search by code (4210) or label (salaries…)',
    'sccl.all': 'All',
    'sccl.loading': 'Loading…',
    'sccl.no_account_match': 'No account matches "{q}"',
    'sccl.debit': 'Debit',
    'sccl.credit': 'Credit',
    'sccl.cancel': 'Cancel',

    // CerveauTIBOK
    'sccl.assistant_lexora': 'LEXORA Assistant',
    'sccl.cerveau_welcome': "👋 Hello! I am the **LEXORA AI Assistant** — your expert in Mauritian labour law, payroll, HR and oversight.\n\nI can answer any question about:\n- 📋 **Contracts** (permanent, fixed-term, WRA clauses)\n- 💰 **Payroll** (CSG, PAYE, OT, 13th month calculations)\n- 🏖️ **Leave** (entitlements, calculations, maternity/paternity)\n- ⚖️ **Labour law** (dismissal, notice, severance)\n- 📊 **Oversight** (attendance, compliance, alerts)\n\nWhat can I do for you?",
    'sccl.cerveau_error': '❌ An error occurred. Please try again.',
    'sccl.cerveau_subtitle': 'Mauritian labour law expert • Payroll • HR',
    'sccl.cerveau_question_placeholder': 'Ask your question...',
    'sccl.cerveau_footer': 'Mauritian law expert WRA 2019 • Finance Act 2024 • MRA 2025',
  },
} as const
