import { gbcChunk } from './i18n/gbc'
import { auditReadinessChunk } from './i18n/audit_readiness'
import { commonUiChunk } from './i18n/common_ui'
import { mraChunk } from './i18n/mra'
import { coreChunk } from './i18n/core'
import { hrChunk } from './i18n/hr'
import { invoicingChunk } from './i18n/invoicing'
import { accountingChunk } from './i18n/accounting'
import { comptableChunk } from './i18n/comptable'
import { rhAdminChunk } from './i18n/rh_admin'
import { adminChunk } from './i18n/admin'
import { publicChunk } from './i18n/public'
import { componentsChunk } from './i18n/components'
import { invoicingExtChunk } from './i18n/invoicing_ext'
import { mraExtChunk } from './i18n/mra_ext'
import { salarieChunk } from './i18n/salarie'
import { telegramChunk } from './i18n/telegram'
import { accountChunk } from './i18n/account'
import { clientbilanChunk } from './i18n/client_bilan'
import { clientfacturesChunk } from './i18n/client_factures'
import { clientmraChunk } from './i18n/client_mra'
import { jurcontratsChunk } from './i18n/jur_contrats'
import { jurdossiersChunk } from './i18n/jur_dossiers'
import { jursocieteChunk } from './i18n/jur_societe'
import { comptableaChunk } from './i18n/comptable_a'
import { comptablebChunk } from './i18n/comptable_b'
import { adminaChunk } from './i18n/admin_a'
import { adminbChunk } from './i18n/admin_b'
import { compmarketChunk } from './i18n/comp_market'
import { complayoutChunk } from './i18n/comp_layout'
import { compdialogsChunk } from './i18n/comp_dialogs'
import { rhcongesChunk } from './i18n/rh_conges'
import { rhplanningChunk } from './i18n/rh_planning'
import { rhemployesChunk } from './i18n/rh_employes'
import { rhpaieChunk } from './i18n/rh_paie'
import { rhdiversChunk } from './i18n/rh_divers'
import { sweepSharedChunk } from './i18n/sweep_shared'
import { sweepComptableChunk } from './i18n/sweep_comptable'
import { sweepRhChunk } from './i18n/sweep_rh'

export type Locale = 'fr' | 'en'

const baseTranslations = {
  fr: {
    // Navigation
    'nav.dashboard': 'Tableau de bord',
    'nav.my_space': 'Mon Espace',
    'nav.companies': 'Mes Sociétés',
    'nav.documents': 'Documents & OCR',
    'nav.users': 'Utilisateurs',
    'nav.team': 'Mon Équipe',
    'nav.redaction_assistant': 'Assistant rédaction',
    'nav.alerts': 'Alertes',
    'nav.assistant': 'Espace Assistant',

    // Invoicing
    'inv.invoicing': 'Facturation',
    'inv.my_invoices': 'Mes Factures',
    'inv.new_invoice': 'Nouvelle Facture',
    'inv.settings': 'Paramètres Facturation',

    // Accounting
    'acc.accounting': 'Comptabilité',
    'acc.bank': 'Banque',
    'acc.reconciliation': 'Rapprochement & Lettrage',
    'acc.treasury': 'Trésorerie',
    'acc.suppliers': 'Fournisseurs',
    'acc.current_accounts': 'Comptes Courants Associés',
    'acc.my_figures': 'Mes Chiffres',

    // Financial statements
    'fin.financial_statements': 'États Financiers',
    'fin.balance_sheet': 'Bilan & P&L',
    'fin.general_ledger': 'Grand Livre',
    'fin.fiscal_years': 'Exercices',
    'fin.forecast': 'Prévisionnel',
    'fin.deadlines': 'Échéances',
    'fin.simulations': 'Simulations',
    'fin.ai_advice': 'Conseils IA',

    // Tax MRA
    'tax.fiscal_mra': 'Fiscal MRA',
    'tax.vat': 'TVA MRA',
    'tax.social_charges': 'CSG / NSF / PAYE',
    'tax.annual_return': 'Annual Return (ROC)',
    'tax.it_form3': 'IT Form 3 (MRA)',

    // HR
    'hr.hr_payroll': 'RH & Paie',
    'hr.payroll_elaboration': 'Elaboration Paie',
    'hr.payslips': 'Paie & Bulletins',
    'hr.statutory_reports': 'Rapports Statutaires',
    'hr.social_declarations': 'Déclarations Sociales',
    'hr.exports': 'Exports & Virements',
    'hr.employees': 'Employés',
    'hr.time_clock': 'Pointage',
    'hr.leave': 'Congés',
    'hr.hr_requests': 'Demandes RH',
    'hr.hr_settings': 'Paramètres RH',
    'hr.bonus_management': 'Gestion Primes',
    'hr.planning': 'Planning',

    // Account
    'account.my_account': 'Mon Compte',
    'account.my_profile': 'Mon Profil',
    'account.telegram_bot': 'Telegram Bot',
    'account.telegram_permissions': 'Permissions Bot',

    // Common
    'common.loading': 'Chargement...',
    'common.save': 'Enregistrer',
    'common.cancel': 'Annuler',
    'common.delete': 'Supprimer',
    'common.edit': 'Modifier',
    'common.create': 'Créer',
    'common.search': 'Rechercher...',
    'common.refresh': 'Actualiser',
    'common.export': 'Exporter',
    'common.import': 'Importer',
    'common.print': 'Imprimer',
    'common.back': 'Retour',
    'common.next': 'Suivant',
    'common.previous': 'Précédent',
    'common.all': 'Tous',
    'common.none': 'Aucun',
    'common.yes': 'Oui',
    'common.no': 'Non',
    'common.status': 'Statut',
    'common.actions': 'Actions',
    'common.date': 'Date',
    'common.amount': 'Montant',
    'common.total': 'Total',
    'common.description': 'Description',
    'common.currency': 'Devise',
    'common.logout': 'Déconnexion',

    // Dashboard
    'dash.welcome': 'Bonjour',
    'dash.revenue': "Chiffre d'Affaires",
    'dash.expenses': 'Dépenses',
    'dash.profit': 'Bénéfice',
    'dash.treasury': 'Trésorerie',
    'dash.no_data': 'Pas de données',

    // Invoices
    'inv.invoice': 'Facture',
    'inv.credit_note': 'Avoir',
    'inv.debit_note': 'Note de débit',
    'inv.invoice_number': 'N° Facture',
    'inv.client': 'Client',
    'inv.supplier': 'Fournisseur',
    'inv.due_date': 'Échéance',
    'inv.subtotal': 'Sous-total HT',
    'inv.vat': 'TVA',
    'inv.total_incl': 'Total TTC',
    'inv.draft': 'Brouillon',
    'inv.pending': 'En attente',
    'inv.paid': 'Payé',
    'inv.overdue': 'En retard',
    'inv.cancelled': 'Annulé',
    'inv.finalize': 'Finaliser',
    'inv.preview': 'Aperçu',
    'inv.download_pdf': 'Télécharger PDF',
    'inv.fiscalize_mra': 'Fiscaliser MRA',
    'inv.fiscalized': 'Fiscalisé',

    // HR specific
    'hr.employee': 'Employé',
    'hr.employees_count': 'Employés actifs',
    'hr.payroll_mass': 'Masse salariale',
    'hr.employer_charges': 'Charges patronales',
    'hr.base_salary': 'Salaire de base',
    'hr.gross_salary': 'Salaire brut',
    'hr.net_salary': 'Salaire net',
    'hr.calculate': 'Calculer',
    'hr.validate': 'Valider',
    'hr.clock_in': 'Pointer Entrée',
    'hr.clock_out': 'Pointer Sortie',
    'hr.present': 'Présent',
    'hr.absent': 'Absent',
    'hr.annual_leave': 'Congé annuel',
    'hr.sick_leave': 'Congé maladie',

    // Admin sidebar
    'admin.administration': 'Administration',
    'admin.dashboard': 'Dashboard',
    'admin.users': 'Utilisateurs',
    'admin.clients': 'Clients',
    'admin.accountants': 'Comptables',
    'admin.companies': 'Societes',
    'admin.documents': 'Documents',
    'admin.services': 'Services & Plans',
    'admin.settings_section': 'Parametres',
    'admin.configuration': 'Configuration',
    'admin.maintenance_section': 'Maintenance',
    'admin.repair': 'Réparation comptable',
    'admin.health': 'Santé système',
    'admin.reset_societe': 'Reset société',

    // RH sidebar
    'rh.module_title': 'Module RH & Paie',
    'rh.back_client': 'Retour espace client',
    'rh.absences_leave': 'Absences & Congés',
    'rh.bonuses_ot': 'Primes & OT',
    'rh.exports_mra': 'Exports MRA',
    'rh.bank_transfers': 'Virements bancaires',
    'rh.payroll_settings': 'Paramètres paie',

    // Comptable sidebar
    'comptable.my_firm': 'Mon Cabinet',
    'comptable.my_clients': 'Mes Clients',
    'comptable.my_team': 'Mon Equipe',
    'comptable.bank_reconciliation': 'Banque & Rapprochement',
    'comptable.invoices': 'Factures',
    'comptable.fiscal': 'Fiscal',
    'comptable.social_charges': 'Charges Sociales',
    'comptable.interco': 'INTERCO',
    'comptable.company': 'Societe',
    'comptable.overview': "Vue d'ensemble",
    'comptable.balance': 'Balance',
    'comptable.collapse': 'Reduire',

    // Homepage
    'home.modules': 'Modules',
    'home.ai_intelligence': 'Intelligence IA',
    'home.plans': 'Formules',
    'home.compliance': 'Conformite',
    'home.login': 'Connexion',
    'home.hero_badge': "Propulse par l'Intelligence Artificielle",
    'home.hero_title': 'LEXORA — La comptabilite intelligente pour Maurice',
    'home.hero_subtitle': 'Plateforme SaaS pilotee par IA pour la gestion comptable, RH et fiscale des entreprises mauriciennes',
    'home.get_started': 'Demarrer',
    'home.watch_demo': 'Voir la demo',
    'home.smart_modules': 'Modules intelligents',
    'home.smart_modules_desc': "Sept modules intégrés pour couvrir la comptabilité, la paie, le juridique, le fiscal et la santé de vos salariés — pilotés par les six agents IA.",
    'home.ai_at_core': "L'IA au coeur du dispositif",
    'home.ai_at_core_desc': 'Des agents intelligents qui automatisent, analysent et recommandent',
    'home.adapted_plans': 'Formules adaptees',
    'home.adapted_plans_desc': 'Choisissez la formule qui correspond a vos besoins',
    'home.popular': 'Populaire',
    'home.choose': 'Choisir',
    'home.compliance_title': 'Conforme a la reglementation mauricienne',
    'home.cta_title': 'Pret a transformer votre comptabilite ?',
    'home.cta_subtitle': 'Rejoignez les entreprises mauriciennes qui font confiance a LEXORA',
    'home.cta_button': 'Demarrer maintenant',
    'home.contact': 'Contact',
    'home.footer_tagline': 'Powered by AI — Made in Mauritius',

    // Homepage features
    'home.feat.ocr_title': 'OCR & Documents IA',
    'home.feat.ocr_1': "Upload PDF/Excel : l'IA analyse, classe et genere les ecritures automatiquement",
    'home.feat.ocr_2': 'Reconnaissance factures, releves bancaires, fiches paie',
    'home.feat.accounting_title': 'Comptabilite Automatisee',
    'home.feat.accounting_1': 'Grand Livre, Balance, Bilan & P&L avec comparatif N/N-1',
    'home.feat.accounting_2': 'Rapprochement bancaire auto, lettrage intelligent',
    'home.feat.accounting_3': 'Multi-devises avec taux de change en temps reel (IAS 21)',
    'home.feat.invoicing_title': 'Facturation MRA',
    'home.feat.invoicing_1': 'Factures conformes MRA avec fiscalisation electronique (IRN + QR Code)',
    'home.feat.invoicing_2': 'Multi-devises EUR/USD/GBP, avoirs et notes de debit',
    'home.feat.invoicing_3': 'Templates personnalisables avec palette de couleurs',
    'home.feat.hr_title': 'RH & Paie Maurice',
    'home.feat.hr_1': 'Bulletins de paie conformes (CSG/NSF/PAYE/PRGF)',
    'home.feat.hr_2': "Pointeuse digitale, planning, conges (Workers' Rights Act 2019)",
    'home.feat.hr_3': 'Exports virements bancaires MCB/SBM + declarations MRA',
    'home.feat.fiscal_title': 'Fiscal MRA',
    'home.feat.fiscal_1': 'IT Form 3 (Return of Income) auto-rempli',
    'home.feat.fiscal_2': 'Annual Return ROC auto-rempli',
    'home.feat.fiscal_3': 'TVA 9-Box, CSG/NSF/PAYE, APS',
    'home.feat.fiscal_4': 'Calendrier des echeances fiscales',
    'home.feat.alerts_title': 'Alertes IA & Pilotage',
    'home.feat.alerts_1': 'Agent IA qui surveille les echeances fiscales',
    'home.feat.alerts_2': 'Alertes WhatsApp et email automatiques',
    'home.feat.alerts_3': 'Previsionnel intelligent : Budget vs Reel, BFR, Tresorerie',
    'home.feat.alerts_4': 'Recommandations strategiques IA',

    // Homepage AI capabilities
    'home.ai.ocr': "OCR intelligent (Claude) pour l'analyse documentaire",
    'home.ai.clara': 'Chat CLARA : assistante RH specialisee droit du travail mauricien',
    'home.ai.reconciliation': 'Rapprochement bancaire automatique par matching intelligent',
    'home.ai.bonuses': 'Primes IA : decrivez en langage naturel, le systeme cree les regles',
    'home.ai.planning': 'Planning IA : decrivez vos besoins, le planning se construit',
    'home.ai.alerts': 'Alertes proactives pour le comptable et ses clients',

    // Homepage plans
    'home.plan.premium': 'Premium',
    'home.plan.premium_desc': 'Tout inclus',
    'home.plan.accounting': 'Comptabilite',
    'home.plan.accounting_desc': 'Module compta',
    'home.plan.hr': 'RH & Paie',
    'home.plan.hr_desc': 'Module RH',
    'home.plan.combo': 'Compta + RH',
    'home.plan.combo_desc': 'Les deux modules',

    // Plan features
    'home.plan.premium_f1': 'Documents & OCR IA illimites',
    'home.plan.premium_f2': 'Comptabilite complete (Grand Livre, Bilan, P&L)',
    'home.plan.premium_f3': 'Banque & Rapprochement automatique',
    'home.plan.premium_f4': 'Facturation MRA e-Invoicing (IRN + QR Code)',
    'home.plan.premium_f5': 'RH & Paie (bulletins, pointeuse, conges, primes)',
    'home.plan.premium_f6': 'Exports MRA (TVA, CSG/NSF, PAYE, PRGF)',
    'home.plan.premium_f7': 'IT Form 3 & Annual Return ROC auto-remplis',
    'home.plan.premium_f8': 'Agent IA alertes fiscales & comptables',
    'home.plan.premium_f9': 'Chat CLARA assistante RH',
    'home.plan.premium_f10': 'Previsionnel & pilotage strategique',
    'home.plan.premium_f11': 'Multi-devises taux temps reel (IAS 21)',
    'home.plan.premium_f12': 'Comptes courants associes',
    'home.plan.premium_f13': 'Utilisateurs illimites',
    'home.plan.accounting_f1': 'Documents & OCR IA illimites',
    'home.plan.accounting_f2': 'Grand Livre, Balance, Bilan & P&L comparatif',
    'home.plan.accounting_f3': 'Banque & Rapprochement automatique',
    'home.plan.accounting_f4': 'Facturation MRA e-Invoicing',
    'home.plan.accounting_f5': 'Exports MRA (TVA, CSG/NSF)',
    'home.plan.accounting_f6': 'IT Form 3 & Annual Return ROC',
    'home.plan.accounting_f7': 'Multi-devises taux temps reel',
    'home.plan.accounting_f8': 'Previsionnel & echeances',
    'home.plan.accounting_f9': 'Agent IA alertes comptables',
    'home.plan.hr_f1': 'Fiche employe complete (9 onglets)',
    'home.plan.hr_f2': 'Elaboration paie 6 etapes',
    'home.plan.hr_f3': 'Bulletins conformes Maurice',
    'home.plan.hr_f4': 'Pointeuse digitale & planning IA',
    'home.plan.hr_f5': 'Conges (AL, SL, MAT, PAT — WRA 2019)',
    'home.plan.hr_f6': 'Primes IA regles configurables',
    'home.plan.hr_f7': 'Exports virements MCB/SBM',
    'home.plan.hr_f8': 'Declarations MRA (CSG, PAYE, PRGF)',
    'home.plan.hr_f9': 'Chat CLARA assistante RH',
    'home.plan.hr_f10': 'Import Excel employes & paie',
    'home.plan.combo_f1': 'Tous les modules Comptabilite',
    'home.plan.combo_f2': 'Tous les modules RH & Paie',
    'home.plan.combo_f3': 'Facturation MRA complete',
    'home.plan.combo_f4': 'Agent IA alertes fiscales & sociales',
    'home.plan.combo_f5': 'Previsionnel & pilotage',
    'home.plan.combo_f6': 'Multi-devises & taux temps reel',

    // Compliance labels
    'home.compliance.mra': 'MRA (Mauritius Revenue Authority)',
    'home.compliance.wra': "Workers' Rights Act 2019",
    'home.compliance.roc': 'Companies Act (ROC)',
    'home.compliance.ifrs': 'IFRS for SMEs',
    'home.compliance.ias21': 'IAS 21 (multi-devises)',

    // Sidebar labels
    'sidebar.client_space': 'Espace Client',
  },
  en: {
    // Navigation
    'nav.dashboard': 'Dashboard',
    'nav.my_space': 'My Space',
    'nav.companies': 'My Companies',
    'nav.documents': 'Documents & OCR',
    'nav.users': 'Users',
    'nav.team': 'My Team',
    'nav.redaction_assistant': 'Writing assistant',
    'nav.alerts': 'Alerts',
    'nav.assistant': 'Assistant Area',

    // Invoicing
    'inv.invoicing': 'Invoicing',
    'inv.my_invoices': 'My Invoices',
    'inv.new_invoice': 'New Invoice',
    'inv.settings': 'Invoice Settings',

    // Accounting
    'acc.accounting': 'Accounting',
    'acc.bank': 'Banking',
    'acc.reconciliation': 'Reconciliation & Matching',
    'acc.treasury': 'Treasury',
    'acc.suppliers': 'Suppliers',
    'acc.current_accounts': 'Shareholder Current Accounts',
    'acc.my_figures': 'My Figures',

    // Financial statements
    'fin.financial_statements': 'Financial Statements',
    'fin.balance_sheet': 'Balance Sheet & P&L',
    'fin.general_ledger': 'General Ledger',
    'fin.fiscal_years': 'Fiscal Years',
    'fin.forecast': 'Forecast',
    'fin.deadlines': 'Deadlines',
    'fin.simulations': 'Simulations',
    'fin.ai_advice': 'AI Advice',

    // Tax MRA
    'tax.fiscal_mra': 'Tax (MRA)',
    'tax.vat': 'VAT (MRA)',
    'tax.social_charges': 'CSG / NSF / PAYE',
    'tax.annual_return': 'Annual Return (ROC)',
    'tax.it_form3': 'IT Form 3 (MRA)',

    // HR
    'hr.hr_payroll': 'HR & Payroll',
    'hr.payroll_elaboration': 'Payroll Processing',
    'hr.payslips': 'Payroll & Payslips',
    'hr.statutory_reports': 'Statutory Reports',
    'hr.social_declarations': 'Social Declarations',
    'hr.exports': 'Exports & Transfers',
    'hr.employees': 'Employees',
    'hr.time_clock': 'Time Clock',
    'hr.leave': 'Leave Management',
    'hr.hr_requests': 'HR Requests',
    'hr.hr_settings': 'HR Settings',
    'hr.bonus_management': 'Bonus Management',
    'hr.planning': 'Planning',

    // Account
    'account.my_account': 'My Account',
    'account.my_profile': 'My Profile',
    'account.telegram_bot': 'Telegram Bot',
    'account.telegram_permissions': 'Bot Permissions',

    // Common
    'common.loading': 'Loading...',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.create': 'Create',
    'common.search': 'Search...',
    'common.refresh': 'Refresh',
    'common.export': 'Export',
    'common.import': 'Import',
    'common.print': 'Print',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.previous': 'Previous',
    'common.all': 'All',
    'common.none': 'None',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.status': 'Status',
    'common.actions': 'Actions',
    'common.date': 'Date',
    'common.amount': 'Amount',
    'common.total': 'Total',
    'common.description': 'Description',
    'common.currency': 'Currency',
    'common.logout': 'Sign out',

    // Dashboard
    'dash.welcome': 'Hello',
    'dash.revenue': 'Revenue',
    'dash.expenses': 'Expenses',
    'dash.profit': 'Profit',
    'dash.treasury': 'Treasury',
    'dash.no_data': 'No data',

    // Invoices
    'inv.invoice': 'Invoice',
    'inv.credit_note': 'Credit Note',
    'inv.debit_note': 'Debit Note',
    'inv.invoice_number': 'Invoice No.',
    'inv.client': 'Client',
    'inv.supplier': 'Supplier',
    'inv.due_date': 'Due Date',
    'inv.subtotal': 'Subtotal (excl. VAT)',
    'inv.vat': 'VAT',
    'inv.total_incl': 'Total (incl. VAT)',
    'inv.draft': 'Draft',
    'inv.pending': 'Pending',
    'inv.paid': 'Paid',
    'inv.overdue': 'Overdue',
    'inv.cancelled': 'Cancelled',
    'inv.finalize': 'Finalize',
    'inv.preview': 'Preview',
    'inv.download_pdf': 'Download PDF',
    'inv.fiscalize_mra': 'Fiscalize (MRA)',
    'inv.fiscalized': 'Fiscalized',

    // HR specific
    'hr.employee': 'Employee',
    'hr.employees_count': 'Active Employees',
    'hr.payroll_mass': 'Payroll Total',
    'hr.employer_charges': 'Employer Charges',
    'hr.base_salary': 'Base Salary',
    'hr.gross_salary': 'Gross Salary',
    'hr.net_salary': 'Net Salary',
    'hr.calculate': 'Calculate',
    'hr.validate': 'Validate',
    'hr.clock_in': 'Clock In',
    'hr.clock_out': 'Clock Out',
    'hr.present': 'Present',
    'hr.absent': 'Absent',
    'hr.annual_leave': 'Annual Leave',
    'hr.sick_leave': 'Sick Leave',

    // Admin sidebar
    'admin.administration': 'Administration',
    'admin.dashboard': 'Dashboard',
    'admin.users': 'Users',
    'admin.clients': 'Clients',
    'admin.accountants': 'Accountants',
    'admin.companies': 'Companies',
    'admin.documents': 'Documents',
    'admin.services': 'Services & Plans',
    'admin.settings_section': 'Settings',
    'admin.configuration': 'Configuration',
    'admin.maintenance_section': 'Maintenance',
    'admin.repair': 'Accounting Repair',
    'admin.health': 'System Health',
    'admin.reset_societe': 'Reset Company',

    // RH sidebar
    'rh.module_title': 'HR & Payroll Module',
    'rh.back_client': 'Back to client area',
    'rh.absences_leave': 'Absences & Leave',
    'rh.bonuses_ot': 'Bonuses & OT',
    'rh.exports_mra': 'MRA Exports',
    'rh.bank_transfers': 'Bank Transfers',
    'rh.payroll_settings': 'Payroll Settings',

    // Comptable sidebar
    'comptable.my_firm': 'My Firm',
    'comptable.my_clients': 'My Clients',
    'comptable.my_team': 'My Team',
    'comptable.bank_reconciliation': 'Banking & Reconciliation',
    'comptable.invoices': 'Invoices',
    'comptable.fiscal': 'Tax',
    'comptable.social_charges': 'Social Charges',
    'comptable.interco': 'INTERCO',
    'comptable.company': 'Company',
    'comptable.overview': 'Overview',
    'comptable.balance': 'Balance',
    'comptable.collapse': 'Collapse',

    // Homepage
    'home.modules': 'Modules',
    'home.ai_intelligence': 'AI Intelligence',
    'home.plans': 'Plans',
    'home.compliance': 'Compliance',
    'home.login': 'Sign in',
    'home.hero_badge': 'Powered by Artificial Intelligence',
    'home.hero_title': 'LEXORA — Smart Accounting for Mauritius',
    'home.hero_subtitle': 'AI-powered SaaS platform for accounting, HR and tax management of Mauritian businesses',
    'home.get_started': 'Get Started',
    'home.watch_demo': 'Watch Demo',
    'home.smart_modules': 'Smart Modules',
    'home.smart_modules_desc': 'Seven integrated modules covering accounting, payroll, legal, tax and employee health — driven by the six AI agents.',
    'home.ai_at_core': 'AI at the Core',
    'home.ai_at_core_desc': 'Intelligent agents that automate, analyze and recommend',
    'home.adapted_plans': 'Tailored Plans',
    'home.adapted_plans_desc': 'Choose the plan that fits your needs',
    'home.popular': 'Popular',
    'home.choose': 'Choose',
    'home.compliance_title': 'Compliant with Mauritian regulations',
    'home.cta_title': 'Ready to transform your accounting?',
    'home.cta_subtitle': 'Join the Mauritian businesses that trust LEXORA',
    'home.cta_button': 'Get Started Now',
    'home.contact': 'Contact',
    'home.footer_tagline': 'Powered by AI — Made in Mauritius',

    // Homepage features
    'home.feat.ocr_title': 'OCR & AI Documents',
    'home.feat.ocr_1': 'Upload PDF/Excel: AI analyzes, classifies and generates entries automatically',
    'home.feat.ocr_2': 'Invoice, bank statement and payslip recognition',
    'home.feat.accounting_title': 'Automated Accounting',
    'home.feat.accounting_1': 'General Ledger, Trial Balance, Balance Sheet & P&L with Y/Y-1 comparison',
    'home.feat.accounting_2': 'Auto bank reconciliation, smart matching',
    'home.feat.accounting_3': 'Multi-currency with real-time exchange rates (IAS 21)',
    'home.feat.invoicing_title': 'MRA Invoicing',
    'home.feat.invoicing_1': 'MRA-compliant invoices with electronic fiscalization (IRN + QR Code)',
    'home.feat.invoicing_2': 'Multi-currency EUR/USD/GBP, credit and debit notes',
    'home.feat.invoicing_3': 'Customizable templates with color palettes',
    'home.feat.hr_title': 'Mauritius HR & Payroll',
    'home.feat.hr_1': 'Compliant payslips (CSG/NSF/PAYE/PRGF)',
    'home.feat.hr_2': "Digital time clock, planning, leave (Workers' Rights Act 2019)",
    'home.feat.hr_3': 'MCB/SBM bank transfer exports + MRA declarations',
    'home.feat.fiscal_title': 'Tax (MRA)',
    'home.feat.fiscal_1': 'IT Form 3 (Return of Income) auto-filled',
    'home.feat.fiscal_2': 'Annual Return ROC auto-filled',
    'home.feat.fiscal_3': 'VAT 9-Box, CSG/NSF/PAYE, APS',
    'home.feat.fiscal_4': 'Tax deadline calendar',
    'home.feat.alerts_title': 'AI Alerts & Monitoring',
    'home.feat.alerts_1': 'AI agent monitoring tax deadlines',
    'home.feat.alerts_2': 'Automatic WhatsApp and email alerts',
    'home.feat.alerts_3': 'Smart forecasting: Budget vs Actual, WCR, Treasury',
    'home.feat.alerts_4': 'AI strategic recommendations',

    // Homepage AI capabilities
    'home.ai.ocr': 'Smart OCR (Claude) for document analysis',
    'home.ai.clara': 'CLARA Chat: HR assistant specialized in Mauritian labor law',
    'home.ai.reconciliation': 'Automatic bank reconciliation with smart matching',
    'home.ai.bonuses': 'AI Bonuses: describe in plain language, the system creates the rules',
    'home.ai.planning': 'AI Planning: describe your needs, the schedule builds itself',
    'home.ai.alerts': 'Proactive alerts for accountants and their clients',

    // Homepage plans
    'home.plan.premium': 'Premium',
    'home.plan.premium_desc': 'All inclusive',
    'home.plan.accounting': 'Accounting',
    'home.plan.accounting_desc': 'Accounting module',
    'home.plan.hr': 'HR & Payroll',
    'home.plan.hr_desc': 'HR module',
    'home.plan.combo': 'Accounting + HR',
    'home.plan.combo_desc': 'Both modules',

    // Plan features
    'home.plan.premium_f1': 'Unlimited AI Documents & OCR',
    'home.plan.premium_f2': 'Full Accounting (General Ledger, Balance Sheet, P&L)',
    'home.plan.premium_f3': 'Banking & Auto Reconciliation',
    'home.plan.premium_f4': 'MRA e-Invoicing (IRN + QR Code)',
    'home.plan.premium_f5': 'HR & Payroll (payslips, time clock, leave, bonuses)',
    'home.plan.premium_f6': 'MRA Exports (VAT, CSG/NSF, PAYE, PRGF)',
    'home.plan.premium_f7': 'Auto-filled IT Form 3 & Annual Return ROC',
    'home.plan.premium_f8': 'AI agent for tax & accounting alerts',
    'home.plan.premium_f9': 'CLARA HR Chat Assistant',
    'home.plan.premium_f10': 'Forecasting & strategic monitoring',
    'home.plan.premium_f11': 'Real-time multi-currency rates (IAS 21)',
    'home.plan.premium_f12': 'Shareholder current accounts',
    'home.plan.premium_f13': 'Unlimited users',
    'home.plan.accounting_f1': 'Unlimited AI Documents & OCR',
    'home.plan.accounting_f2': 'General Ledger, Trial Balance, Balance Sheet & P&L comparison',
    'home.plan.accounting_f3': 'Banking & Auto Reconciliation',
    'home.plan.accounting_f4': 'MRA e-Invoicing',
    'home.plan.accounting_f5': 'MRA Exports (VAT, CSG/NSF)',
    'home.plan.accounting_f6': 'IT Form 3 & Annual Return ROC',
    'home.plan.accounting_f7': 'Real-time multi-currency rates',
    'home.plan.accounting_f8': 'Forecasting & deadlines',
    'home.plan.accounting_f9': 'AI accounting alerts agent',
    'home.plan.hr_f1': 'Complete employee file (9 tabs)',
    'home.plan.hr_f2': '6-step payroll processing',
    'home.plan.hr_f3': 'Mauritius-compliant payslips',
    'home.plan.hr_f4': 'Digital time clock & AI planning',
    'home.plan.hr_f5': 'Leave (AL, SL, MAT, PAT — WRA 2019)',
    'home.plan.hr_f6': 'AI configurable bonus rules',
    'home.plan.hr_f7': 'MCB/SBM transfer exports',
    'home.plan.hr_f8': 'MRA declarations (CSG, PAYE, PRGF)',
    'home.plan.hr_f9': 'CLARA HR Chat Assistant',
    'home.plan.hr_f10': 'Excel import for employees & payroll',
    'home.plan.combo_f1': 'All Accounting modules',
    'home.plan.combo_f2': 'All HR & Payroll modules',
    'home.plan.combo_f3': 'Full MRA Invoicing',
    'home.plan.combo_f4': 'AI agent for tax & social alerts',
    'home.plan.combo_f5': 'Forecasting & monitoring',
    'home.plan.combo_f6': 'Multi-currency & real-time rates',

    // Compliance labels
    'home.compliance.mra': 'MRA (Mauritius Revenue Authority)',
    'home.compliance.wra': "Workers' Rights Act 2019",
    'home.compliance.roc': 'Companies Act (ROC)',
    'home.compliance.ifrs': 'IFRS for SMEs',
    'home.compliance.ias21': 'IAS 21 (multi-currency)',

    // Sidebar labels
    'sidebar.client_space': 'Client Area',
  },
} as const

const translations: Record<Locale, Record<string, string>> = {
  fr: {
    ...baseTranslations.fr,
    ...gbcChunk.fr,
    ...auditReadinessChunk.fr,
    ...commonUiChunk.fr,
    ...mraChunk.fr,
    ...coreChunk.fr,
    ...hrChunk.fr,
    ...invoicingChunk.fr,
    ...accountingChunk.fr,
    ...comptableChunk.fr,
    ...rhAdminChunk.fr,
    ...adminChunk.fr,
    ...publicChunk.fr,
    ...componentsChunk.fr,
    ...invoicingExtChunk.fr,
    ...mraExtChunk.fr,
    ...salarieChunk.fr,
    ...telegramChunk.fr,
    ...accountChunk.fr,
    ...clientbilanChunk.fr,
    ...clientfacturesChunk.fr,
    ...clientmraChunk.fr,
    ...jurcontratsChunk.fr,
    ...jurdossiersChunk.fr,
    ...jursocieteChunk.fr,
    ...comptableaChunk.fr,
    ...comptablebChunk.fr,
    ...adminaChunk.fr,
    ...adminbChunk.fr,
    ...compmarketChunk.fr,
    ...complayoutChunk.fr,
    ...compdialogsChunk.fr,
    ...rhcongesChunk.fr,
    ...rhplanningChunk.fr,
    ...rhemployesChunk.fr,
    ...rhpaieChunk.fr,
    ...rhdiversChunk.fr,
    ...sweepComptableChunk.fr,
    ...sweepSharedChunk.fr,
    ...sweepRhChunk.fr,
  },
  en: {
    ...baseTranslations.en,
    ...gbcChunk.en,
    ...auditReadinessChunk.en,
    ...commonUiChunk.en,
    ...mraChunk.en,
    ...coreChunk.en,
    ...hrChunk.en,
    ...invoicingChunk.en,
    ...accountingChunk.en,
    ...comptableChunk.en,
    ...rhAdminChunk.en,
    ...adminChunk.en,
    ...publicChunk.en,
    ...componentsChunk.en,
    ...invoicingExtChunk.en,
    ...mraExtChunk.en,
    ...salarieChunk.en,
    ...telegramChunk.en,
    ...accountChunk.en,
    ...clientbilanChunk.en,
    ...clientfacturesChunk.en,
    ...clientmraChunk.en,
    ...jurcontratsChunk.en,
    ...jurdossiersChunk.en,
    ...jursocieteChunk.en,
    ...comptableaChunk.en,
    ...comptablebChunk.en,
    ...adminaChunk.en,
    ...adminbChunk.en,
    ...compmarketChunk.en,
    ...complayoutChunk.en,
    ...compdialogsChunk.en,
    ...rhcongesChunk.en,
    ...rhplanningChunk.en,
    ...rhemployesChunk.en,
    ...rhpaieChunk.en,
    ...rhdiversChunk.en,
    ...sweepComptableChunk.en,
    ...sweepSharedChunk.en,
    ...sweepRhChunk.en,
  },
}

export function t(key: string, locale: Locale = 'fr'): string {
  return translations[locale][key] || key
}

export function getLocale(): Locale {
  if (typeof window === 'undefined') return 'fr'
  return (localStorage.getItem('lexora_locale') as Locale) || 'fr'
}

export function setLocale(locale: Locale) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('lexora_locale', locale)
    window.location.reload()
  }
}
