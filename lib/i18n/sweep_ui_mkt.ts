/**
 * sweep_ui_mkt — libellés bilingues (FR/EN) de la surface publique /
 * marketing : page d'accueil (app/page.tsx), page tarifs
 * (app/tarifs/page.tsx), métadonnées (app/layout.tsx) et composants
 * vitrine (DashboardPreview, LiveEconomicWidget).
 *
 * Namespace : `uimkt.`
 *
 * Note : seules les chaînes auparavant codées en dur dans le JSX
 * (ternaires `locale === "fr" ? … : …`) ont été extraites ici. Les
 * dictionnaires `frTexts`/`enTexts` déjà bilingues de la page tarifs
 * restent en place (système i18n local valide).
 */
export const sweepUiMktChunk = {
  fr: {
    /* ---- layout.tsx — metadata ---- */
    'uimkt.meta.title': 'Lexora | Comptabilité IA pour Maurice',
    'uimkt.meta.description':
      'Plateforme SaaS de comptabilité intelligente pour Maurice. Traitement IA des documents, conformité MRA, alertes WhatsApp.',

    /* ---- page.tsx — features (modules) ---- */
    'uimkt.home.feat.ocr_title': 'OCR & Documents IA',
    'uimkt.home.feat.ocr_1': 'Extraction automatique des factures, reçus, relevés bancaires',
    'uimkt.home.feat.ocr_2': 'Classification intelligente par type de document',
    'uimkt.home.feat.accounting_title': 'Comptabilité intelligente',
    'uimkt.home.feat.accounting_1': 'Plan comptable mauricien natif (IFRS/IAS)',
    'uimkt.home.feat.accounting_2': 'Grand livre, balance, bilan & P&L automatiques',
    'uimkt.home.feat.accounting_3': 'Rapprochement bancaire intelligent multi-stratégies',
    'uimkt.home.feat.invoicing_title': 'Facturation & Templates IA',
    'uimkt.home.feat.invoicing_1': 'Factures conformes MRA avec QR Code & IRN',
    'uimkt.home.feat.invoicing_2': "Templates IA : importez une ancienne facture, l'IA crée votre modèle",
    'uimkt.home.feat.invoicing_3': 'Multi-devises (MUR, EUR, USD, GBP) avec taux de change automatiques',
    'uimkt.home.feat.hr_title': 'RH & Paie complète',
    'uimkt.home.feat.hr_1': 'Bulletins de paie conformes WRA 2019',
    'uimkt.home.feat.hr_2': 'Gestion congés, pointage, planning automatisé par IA',
    'uimkt.home.feat.hr_3': 'Exports MRA (PAYE, CSG, NSF) en un clic',
    'uimkt.home.feat.legal_title': 'Juridique & Contrats IA',
    'uimkt.home.feat.legal_1': 'Générateur de contrats de travail (CDI, CDD, temps partiel) conformes WRA 2019',
    'uimkt.home.feat.legal_2': 'Contrats commerciaux : prestataire, NDA, SaaS, sous-traitance',
    'uimkt.home.feat.legal_3': 'Rédaction guidée par IA avec clauses légales mauriciennes',
    'uimkt.home.feat.legal_4': 'Signature électronique et suivi des versions',
    'uimkt.home.feat.tax_title': 'Fiscal MRA',
    'uimkt.home.feat.tax_1': 'TVA : calcul automatique, déclaration pré-remplie',
    'uimkt.home.feat.tax_2': 'IT Form 3 / IS : génération automatique',
    'uimkt.home.feat.tax_3': 'Annual Return ROC : pré-remplissage intelligent',
    'uimkt.home.feat.tax_4': 'FAR (Fixed Asset Register) avec amortissement automatique',
    'uimkt.home.feat.tibok_title': 'TIBOK · Santé salariés',
    'uimkt.home.feat.tibok_1': 'Téléconsultation illimitée pour vos salariés',
    'uimkt.home.feat.tibok_2': 'Médecins partenaires agréés à Maurice',
    'uimkt.home.feat.tibok_3': 'Ordonnances digitales et suivi médical',
    'uimkt.home.feat.tibok_4': 'Intégré dans la paie — aucun coût additionnel par salarié',

    /* ---- page.tsx — aiCapabilities ---- */
    'uimkt.home.ai.ocr': 'Agent OCR — Analyse vos documents, extrait les données et crée automatiquement les écritures comptables. Factures, relevés bancaires, reçus : tout est digitalisé en secondes.',
    'uimkt.home.ai.reco': 'Agent Rapprochement — Identifie chaque fournisseur, croise les paiements et les factures, détecte les TDS, et lettre automatiquement les écritures 401. Pense comme un vrai expert-comptable.',
    'uimkt.home.ai.legal': 'Agent Juridique — Génère des contrats de travail et commerciaux conformes au droit mauricien (WRA 2019, DPA 2017, Contract Act). CDI, CDD, NDA, prestation de services — en un clic.',
    'uimkt.home.ai.hr': 'Agent RH — Calcule les bulletins de paie, gère les congés selon la WRA, optimise le planning et prépare les exports MRA automatiquement.',
    'uimkt.home.ai.tax': 'Agent Fiscal — Pré-remplit vos déclarations TVA, IT Form 3, Annual Return ROC. Anticipe les échéances et vous alerte avant les pénalités.',
    'uimkt.home.ai.invoicing': 'Agent Facturation — Crée vos factures avec le template extrait par IA de vos anciennes factures. Multi-devises, QR Code MRA, envoi automatique.',

    /* ---- page.tsx — navbar / menu ---- */
    'uimkt.home.nav_main': 'Navigation principale',
    'uimkt.home.nav_engine': 'Moteur',
    'uimkt.home.nav_offers': 'Offres',
    'uimkt.home.nav_assistant': 'Assistant IA',
    'uimkt.home.open_menu': 'Ouvrir le menu',
    'uimkt.home.nav_menu': 'Menu de navigation',
    'uimkt.home.nav_mobile': 'Navigation mobile',

    /* ---- page.tsx — hero stats ---- */
    'uimkt.home.stat_agents': 'Agents IA',
    'uimkt.home.stat_realtime': 'Temps réel',

    /* ---- page.tsx — trust strip ---- */
    'uimkt.home.trust_aria': 'Conformités et standards',
    'uimkt.home.trust_standards': 'Conforme aux standards mauriciens et internationaux',

    /* ---- page.tsx — dashboard section ---- */
    'uimkt.home.realtime_eyebrow': 'En temps réel',
    'uimkt.home.breathe_title': 'Voyez Lexora respirer',
    'uimkt.home.breathe_desc': 'Vos KPIs se mettent à jour à la seconde. Chaque facture analysée, chaque bulletin émis, chaque écriture lettrée apparaît en direct dans votre tableau de bord — orchestré par les six agents IA.',
    'uimkt.home.breathe_1': 'Trésorerie consolidée multi-devises',
    'uimkt.home.breathe_2': 'Activité des agents IA seconde par seconde',
    'uimkt.home.breathe_3': 'Alertes MRA avant échéance',

    /* ---- page.tsx — features section header ---- */
    'uimkt.home.modules_eyebrow': '7 modules intégrés · 1 plateforme',
    'uimkt.home.module': 'Module',
    'uimkt.home.module_health': 'Module Santé',
    'uimkt.home.tibok_exclusive': 'Exclusif · Unique à Maurice',
    'uimkt.home.tibok_desc': 'Le seul ERP mauricien qui intègre un dispositif de téléconsultation pour vos salariés. TIBOK Santé est inclus dans toutes les formules, sans coût supplémentaire.',
    'uimkt.home.teleconsult': 'Téléconsultation',
    'uimkt.home.unlimited': 'Illimitée',
    'uimkt.home.included_nocost': 'Inclus · Aucun coût',
    'uimkt.home.included_every_plan': 'Inclus dans chaque formule',

    /* ---- page.tsx — AI section ---- */
    'uimkt.home.ai_team': "Équipe d'agents IA",
    'uimkt.home.ai_section_desc': "Chaque module de Lexora est piloté par un agent IA spécialisé. Pas de saisie manuelle, pas de configuration complexe — vos agents comprennent votre entreprise et s'adaptent à vos besoins.",
    'uimkt.home.neural_aria': 'Illustration animée : 6 agents IA connectés au cœur Lexora',
    'uimkt.home.agent_online': 'En ligne · 24/7',

    /* ---- page.tsx — offers section ---- */
    'uimkt.home.our_offers': 'Nos offres',
    'uimkt.home.offers_title': "Deux façons d'accéder à Lexora",
    'uimkt.home.offers_desc': 'Un accès direct pour votre entreprise, ou le programme partenaire si vous êtes expert-comptable et gérez plusieurs dossiers.',
    'uimkt.home.offer1_label': 'Offre 1 · Entreprise',
    'uimkt.home.offer1_access': 'Accès direct',
    'uimkt.home.offer1_title': 'Pour votre entreprise',
    'uimkt.home.offer1_desc': 'Gérez vous-même votre comptabilité, votre paie et votre fiscalité MRA depuis une interface unique. Idéal pour les PME, freelances et dirigeants autonomes.',
    'uimkt.home.offer1_feat1': 'Accès direct à tous les modules (Compta, RH, Facturation, Fiscal)',
    'uimkt.home.offer1_feat2': 'Conformité MRA native (IRN, QR Code, e-MRA, IT Form 3)',
    'uimkt.home.offer1_feat3': 'OCR IA illimité, rapprochement bancaire automatique',
    'uimkt.home.offer1_feat4': 'Support inclus, mises à jour réglementaires continues',
    'uimkt.home.starting_at': 'À partir de',
    'uimkt.home.per_month': ' / mois',
    'uimkt.home.view_pricing': 'Voir tous les tarifs',
    'uimkt.home.offer2_free': 'Gratuit pour le cabinet',
    'uimkt.home.offer2_label': 'Offre 2 · Expert-Comptable',
    'uimkt.home.offer2_program': 'Programme Partenaire',
    'uimkt.home.offer2_title': 'Pour votre cabinet comptable',
    'uimkt.home.offer2_desc': "Gérez l'ensemble de votre portefeuille clients depuis un seul tableau de bord. Lexora s'intègre dans votre mission comptable et vous reverse une commission récurrente.",
    'uimkt.home.offer2_feat1': 'Tableau de bord multi-dossiers : tous vos clients en un écran',
    'uimkt.home.offer2_feat2': 'Permissions différenciées cabinet / client par module',
    'uimkt.home.offer2_feat3': 'Alertes fiscales consolidées sur tout votre portefeuille',
    'uimkt.home.offer2_feat4': 'Commission mensuelle récurrente sur chaque client actif',
    'uimkt.home.firm_access': 'Accès cabinet',
    'uimkt.home.no_commitment': ' · aucun engagement',
    'uimkt.home.request_firm_demo': 'Demander une démo cabinet',

    /* ---- page.tsx — footer ---- */
    'uimkt.home.footer_tagline': "L'ERP mauricien piloté par l'IA — Compta, Paie, Fiscal, Juridique et Santé salariés.",
    'uimkt.home.footer_platform': 'Plateforme',
    'uimkt.home.footer_modules': 'Modules',
    'uimkt.home.footer_ai_agents': 'Agents IA',
    'uimkt.home.footer_resources': 'Ressources',
    'uimkt.home.footer_contact_us': 'Nous contacter',
    'uimkt.home.footer_expert_program': 'Programme Expert-Comptable',
    'uimkt.home.footer_legal': 'Légal',
    'uimkt.home.footer_legal_notice': 'Mentions légales',
    'uimkt.home.footer_data_protection': 'Protection des données',
    'uimkt.home.footer_rights': 'Tous droits réservés.',

    /* ---- page.tsx — hero copy split ---- */
    'uimkt.home.hero_l1': "L'ERP piloté par l'",
    'uimkt.home.hero_gradient_word': 'IA',
    'uimkt.home.hero_for_mauritius': ' pour Maurice',
    'uimkt.home.modules_smart_pre': 'Modules',
    'uimkt.home.modules_smart_word': 'intelligents',
    'uimkt.home.hero_sub': "Avec Lexora, ce n'est pas un simple logiciel que vous prenez — c'est toute une équipe d'agents IA qui va vous accompagner à chaque étape. Comptabilité, RH, juridique, fiscal : chaque module est piloté par l'intelligence artificielle et greffé aux services experts de Lexora.",
    'uimkt.home.agents6_pre': '6 agents',
    'uimkt.home.agents6_word': 'IA',
    'uimkt.home.agents6_post': 'qui travaillent pour vous',

    /* ---- tarifs/page.tsx — inline strings ---- */
    'uimkt.tarifs.all_included': 'Tout inclus',
    'uimkt.tarifs.pack_erp': 'Pack ERP',
    'uimkt.tarifs.salaries': 'salariés',
    'uimkt.tarifs.salarie': 'salarié',
    'uimkt.tarifs.compta_rh_tibok': 'Compta + RH + TIBOK',
    'uimkt.tarifs.unlimited_tx': 'Transactions illimitées',
    'uimkt.tarifs.calc_per_emp_pre': 'Calcul',
    'uimkt.tarifs.per_salarie': 'par salarié',
    'uimkt.tarifs.calc_per_emp_post': '— tarif dégressif au volume',
    'uimkt.tarifs.sal_short': 'sal.',
    'uimkt.tarifs.per_sal_month': '/ salarié / mois',
    'uimkt.tarifs.floor_tibok': 'plancher MRs 250 · TIBOK inclus',
    'uimkt.tarifs.compta_est_pre': 'Estimation',
    'uimkt.tarifs.per_tx_volume': 'par volume de transactions',
    'uimkt.tarifs.est_per_emp': 'Estimation (≈10 txn / salarié)',
    'uimkt.tarifs.tx_month': 'txn/mois',
    'uimkt.tarifs.plan': 'Formule',
    'uimkt.tarifs.accounting': 'Comptabilité',
    'uimkt.tarifs.bundle_discount': 'Remise Pack −20%',

    /* ---- DashboardPreview.tsx ---- */
    'uimkt.dash.monthly_revenue': 'Revenus du mois',
    'uimkt.dash.invoices_ocr': 'Factures OCR',
    'uimkt.dash.cashflow_12m': 'Trésorerie — 12 mois',
    'uimkt.dash.net_margin': 'Marge nette',
    'uimkt.dash.ai_activity': 'Activité IA',
    'uimkt.dash.agents_online': 'Agents actifs',
    'uimkt.dash.ticker_ocr': 'OCR · facture #EL-2841',
    'uimkt.dash.ticker_vat': 'TVA · calcul auto',
    'uimkt.dash.ticker_payroll': 'Paie · 14 bulletins',
    'uimkt.dash.ticker_reco': 'Réconciliation · 92 lignes',
    'uimkt.dash.ticker_itform': 'IT Form 3 · prêt',

    /* ---- LiveEconomicWidget.tsx ---- */
    'uimkt.eco.unavailable': 'Indicateurs économiques indisponibles.',
    'uimkt.eco.live_indicators': 'Indicateurs temps réel',
    'uimkt.eco.context': 'Contexte économique et RH · Maurice',
    'uimkt.eco.updated': 'Mis à jour',
    'uimkt.eco.next_deadlines': 'Prochaines échéances MRA / ROC',
    'uimkt.eco.hr_aria': 'Repères RH et paie',
  },
  en: {
    /* ---- layout.tsx — metadata ---- */
    'uimkt.meta.title': 'Lexora | AI Accounting for Mauritius',
    'uimkt.meta.description':
      'Smart accounting SaaS platform for Mauritius. AI document processing, MRA compliance, WhatsApp alerts.',

    /* ---- page.tsx — features (modules) ---- */
    'uimkt.home.feat.ocr_title': 'AI OCR & Documents',
    'uimkt.home.feat.ocr_1': 'Automatic extraction of invoices, receipts, bank statements',
    'uimkt.home.feat.ocr_2': 'Smart classification by document type',
    'uimkt.home.feat.accounting_title': 'Smart Accounting',
    'uimkt.home.feat.accounting_1': 'Native Mauritian chart of accounts (IFRS/IAS)',
    'uimkt.home.feat.accounting_2': 'Automatic ledger, trial balance, P&L',
    'uimkt.home.feat.accounting_3': 'Intelligent multi-strategy bank reconciliation',
    'uimkt.home.feat.invoicing_title': 'Invoicing & AI Templates',
    'uimkt.home.feat.invoicing_1': 'MRA-compliant invoices with QR Code & IRN',
    'uimkt.home.feat.invoicing_2': 'AI Templates: import an old invoice, AI creates your template',
    'uimkt.home.feat.invoicing_3': 'Multi-currency (MUR, EUR, USD, GBP) with automatic FX rates',
    'uimkt.home.feat.hr_title': 'Full HR & Payroll',
    'uimkt.home.feat.hr_1': 'WRA 2019 compliant payslips',
    'uimkt.home.feat.hr_2': 'Leave management, attendance, AI-automated scheduling',
    'uimkt.home.feat.hr_3': 'One-click MRA exports (PAYE, CSG, NSF)',
    'uimkt.home.feat.legal_title': 'Legal & AI Contracts',
    'uimkt.home.feat.legal_1': 'Employment contract generator (CDI, CDD, part-time) WRA 2019 compliant',
    'uimkt.home.feat.legal_2': 'Commercial contracts: service, NDA, SaaS, subcontracting',
    'uimkt.home.feat.legal_3': 'AI-guided drafting with Mauritian legal clauses',
    'uimkt.home.feat.legal_4': 'E-signature and version tracking',
    'uimkt.home.feat.tax_title': 'MRA Tax',
    'uimkt.home.feat.tax_1': 'VAT: automatic calculation, pre-filled return',
    'uimkt.home.feat.tax_2': 'IT Form 3 / IS: automatic generation',
    'uimkt.home.feat.tax_3': 'ROC Annual Return: intelligent pre-filling',
    'uimkt.home.feat.tax_4': 'FAR with automatic depreciation',
    'uimkt.home.feat.tibok_title': 'TIBOK · Employee Health',
    'uimkt.home.feat.tibok_1': 'Unlimited telemedicine for your employees',
    'uimkt.home.feat.tibok_2': 'Licensed partner doctors in Mauritius',
    'uimkt.home.feat.tibok_3': 'Digital prescriptions and medical follow-up',
    'uimkt.home.feat.tibok_4': 'Integrated in payroll — no extra cost per employee',

    /* ---- page.tsx — aiCapabilities ---- */
    'uimkt.home.ai.ocr': 'OCR Agent — Analyzes your documents, extracts data and automatically creates journal entries. Invoices, bank statements, receipts: everything digitized in seconds.',
    'uimkt.home.ai.reco': 'Reconciliation Agent — Identifies each supplier, cross-references payments and invoices, detects TDS, and automatically letters 401 entries. Thinks like a real accountant.',
    'uimkt.home.ai.legal': 'Legal Agent — Generates employment and commercial contracts compliant with Mauritian law (WRA 2019, DPA 2017, Contract Act). CDI, CDD, NDA, service agreements — in one click.',
    'uimkt.home.ai.hr': 'HR Agent — Calculates payslips, manages leave per WRA, optimizes scheduling and prepares MRA exports automatically.',
    'uimkt.home.ai.tax': 'Tax Agent — Pre-fills your VAT returns, IT Form 3, ROC Annual Return. Anticipates deadlines and alerts you before penalties.',
    'uimkt.home.ai.invoicing': 'Invoicing Agent — Creates invoices with AI-extracted templates from your old invoices. Multi-currency, MRA QR Code, automatic sending.',

    /* ---- page.tsx — navbar / menu ---- */
    'uimkt.home.nav_main': 'Main navigation',
    'uimkt.home.nav_engine': 'Engine',
    'uimkt.home.nav_offers': 'Offers',
    'uimkt.home.nav_assistant': 'AI Assistant',
    'uimkt.home.open_menu': 'Open menu',
    'uimkt.home.nav_menu': 'Navigation menu',
    'uimkt.home.nav_mobile': 'Mobile navigation',

    /* ---- page.tsx — hero stats ---- */
    'uimkt.home.stat_agents': 'AI agents',
    'uimkt.home.stat_realtime': 'Real-time',

    /* ---- page.tsx — trust strip ---- */
    'uimkt.home.trust_aria': 'Compliance and standards',
    'uimkt.home.trust_standards': 'Compliant with Mauritian and international standards',

    /* ---- page.tsx — dashboard section ---- */
    'uimkt.home.realtime_eyebrow': 'In real time',
    'uimkt.home.breathe_title': 'See Lexora breathing',
    'uimkt.home.breathe_desc': 'Your KPIs refresh to the second. Every invoice analyzed, every payslip issued, every entry matched shows up live in your dashboard — orchestrated by the six AI agents.',
    'uimkt.home.breathe_1': 'Consolidated multi-currency cashflow',
    'uimkt.home.breathe_2': 'AI agent activity second by second',
    'uimkt.home.breathe_3': 'MRA alerts before deadlines',

    /* ---- page.tsx — features section header ---- */
    'uimkt.home.modules_eyebrow': '7 integrated modules · 1 platform',
    'uimkt.home.module': 'Module',
    'uimkt.home.module_health': 'Health Module',
    'uimkt.home.tibok_exclusive': 'Exclusive · Unique in Mauritius',
    'uimkt.home.tibok_desc': 'The only Mauritian ERP that bundles a telemedicine platform for your employees. TIBOK Health is included in every plan, at no extra cost.',
    'uimkt.home.teleconsult': 'Telemedicine',
    'uimkt.home.unlimited': 'Unlimited',
    'uimkt.home.included_nocost': 'Included · No cost',
    'uimkt.home.included_every_plan': 'Included in every plan',

    /* ---- page.tsx — AI section ---- */
    'uimkt.home.ai_team': 'AI agent team',
    'uimkt.home.ai_section_desc': 'Every Lexora module is powered by a specialized AI agent. No manual entry, no complex setup — your agents understand your business and adapt to your needs.',
    'uimkt.home.neural_aria': 'Animated illustration: 6 AI agents connected to the Lexora core',
    'uimkt.home.agent_online': 'Online · 24/7',

    /* ---- page.tsx — offers section ---- */
    'uimkt.home.our_offers': 'Our offers',
    'uimkt.home.offers_title': 'Two ways to access Lexora',
    'uimkt.home.offers_desc': 'Direct access for your business, or the partner program if you are an accountant managing multiple client files.',
    'uimkt.home.offer1_label': 'Offer 1 · Business',
    'uimkt.home.offer1_access': 'Direct access',
    'uimkt.home.offer1_title': 'For your business',
    'uimkt.home.offer1_desc': 'Manage your own accounting, payroll and MRA tax filings from a single interface. Ideal for SMEs, freelancers and autonomous business owners.',
    'uimkt.home.offer1_feat1': 'Direct access to all modules (Accounting, HR, Invoicing, Tax)',
    'uimkt.home.offer1_feat2': 'Native MRA compliance (IRN, QR Code, e-MRA, IT Form 3)',
    'uimkt.home.offer1_feat3': 'Unlimited AI OCR, automatic bank reconciliation',
    'uimkt.home.offer1_feat4': 'Support included, continuous regulatory updates',
    'uimkt.home.starting_at': 'Starting at',
    'uimkt.home.per_month': ' / month',
    'uimkt.home.view_pricing': 'View all pricing',
    'uimkt.home.offer2_free': 'Free for the firm',
    'uimkt.home.offer2_label': 'Offer 2 · Accountant',
    'uimkt.home.offer2_program': 'Partner Program',
    'uimkt.home.offer2_title': 'For your accounting firm',
    'uimkt.home.offer2_desc': 'Manage your entire client portfolio from a single dashboard. Lexora integrates into your engagement and pays you a recurring commission.',
    'uimkt.home.offer2_feat1': 'Multi-client dashboard: all your clients on one screen',
    'uimkt.home.offer2_feat2': 'Differentiated firm / client permissions by module',
    'uimkt.home.offer2_feat3': 'Consolidated tax alerts across your entire portfolio',
    'uimkt.home.offer2_feat4': 'Recurring monthly commission on each active client',
    'uimkt.home.firm_access': 'Firm access',
    'uimkt.home.no_commitment': ' · no commitment',
    'uimkt.home.request_firm_demo': 'Request a firm demo',

    /* ---- page.tsx — footer ---- */
    'uimkt.home.footer_tagline': 'The AI-driven Mauritian ERP — Accounting, Payroll, Tax, Legal and Employee Health.',
    'uimkt.home.footer_platform': 'Platform',
    'uimkt.home.footer_modules': 'Modules',
    'uimkt.home.footer_ai_agents': 'AI Agents',
    'uimkt.home.footer_resources': 'Resources',
    'uimkt.home.footer_contact_us': 'Contact us',
    'uimkt.home.footer_expert_program': 'Accountant Program',
    'uimkt.home.footer_legal': 'Legal',
    'uimkt.home.footer_legal_notice': 'Legal Notice',
    'uimkt.home.footer_data_protection': 'Data Protection',
    'uimkt.home.footer_rights': 'All rights reserved.',

    /* ---- page.tsx — hero copy split ---- */
    'uimkt.home.hero_l1': 'The ',
    'uimkt.home.hero_gradient_word': 'AI-powered',
    'uimkt.home.hero_for_mauritius': ' ERP for Mauritius',
    'uimkt.home.modules_smart_pre': 'Smart',
    'uimkt.home.modules_smart_word': 'modules',
    'uimkt.home.hero_sub': "With Lexora, you're not just getting software — you're getting an entire team of AI agents supporting you at every step. Accounting, HR, legal, tax: every module is AI-powered and connected to Lexora's expert services.",
    'uimkt.home.agents6_pre': '6',
    'uimkt.home.agents6_word': 'AI agents',
    'uimkt.home.agents6_post': 'working for you',

    /* ---- tarifs/page.tsx — inline strings ---- */
    'uimkt.tarifs.all_included': 'All included',
    'uimkt.tarifs.pack_erp': 'ERP Pack',
    'uimkt.tarifs.salaries': 'employees',
    'uimkt.tarifs.salarie': 'employee',
    'uimkt.tarifs.compta_rh_tibok': 'Accounting + HR + TIBOK',
    'uimkt.tarifs.unlimited_tx': 'Unlimited transactions',
    'uimkt.tarifs.calc_per_emp_pre': 'Priced',
    'uimkt.tarifs.per_salarie': 'per employee',
    'uimkt.tarifs.calc_per_emp_post': '— volume discount',
    'uimkt.tarifs.sal_short': 'emp.',
    'uimkt.tarifs.per_sal_month': '/ employee / month',
    'uimkt.tarifs.floor_tibok': 'floor MRs 250 · TIBOK included',
    'uimkt.tarifs.compta_est_pre': 'Based on',
    'uimkt.tarifs.per_tx_volume': 'transaction volume',
    'uimkt.tarifs.est_per_emp': 'Estimate (~10 tx / emp)',
    'uimkt.tarifs.tx_month': 'tx/mo',
    'uimkt.tarifs.plan': 'Plan',
    'uimkt.tarifs.accounting': 'Accounting',
    'uimkt.tarifs.bundle_discount': 'Bundle discount −20%',

    /* ---- DashboardPreview.tsx ---- */
    'uimkt.dash.monthly_revenue': 'Monthly revenue',
    'uimkt.dash.invoices_ocr': 'Invoices processed',
    'uimkt.dash.cashflow_12m': 'Cashflow — 12 months',
    'uimkt.dash.net_margin': 'Net margin',
    'uimkt.dash.ai_activity': 'AI activity',
    'uimkt.dash.agents_online': 'Agents online',
    'uimkt.dash.ticker_ocr': 'OCR · invoice #EL-2841',
    'uimkt.dash.ticker_vat': 'VAT · auto computed',
    'uimkt.dash.ticker_payroll': 'Payroll · 14 payslips',
    'uimkt.dash.ticker_reco': 'Reconciliation · 92 rows',
    'uimkt.dash.ticker_itform': 'IT Form 3 · ready',

    /* ---- LiveEconomicWidget.tsx ---- */
    'uimkt.eco.unavailable': 'Economic indicators unavailable.',
    'uimkt.eco.live_indicators': 'Live indicators',
    'uimkt.eco.context': 'Economic & HR context · Mauritius',
    'uimkt.eco.updated': 'Updated',
    'uimkt.eco.next_deadlines': 'Next MRA / ROC deadlines',
    'uimkt.eco.hr_aria': 'HR and payroll benchmarks',
  },
} as const
