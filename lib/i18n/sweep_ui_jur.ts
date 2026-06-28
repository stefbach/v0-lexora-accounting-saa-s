// Sweep i18n — lot33 : chrome UI résiduel (dialog Radix, sélecteur catalogue,
// import contacts, paramètres admin, signature contrat, mois salarié).
// Namespace : uijur.*

export const sweepUiJurChunk = {
  fr: {
    // components/ui/dialog.tsx
    'uijur.dialog.close_aria': 'Fermer la fenêtre de dialogue',
    'uijur.dialog.close': 'Fermer',

    // components/client/CatalogueSelectorDialog.tsx
    'uijur.catsel.title': 'Catalogue services & produits',
    'uijur.catsel.desc_prefix': 'Sélectionnez un ou plusieurs articles à ajouter à la facture. Vous pouvez gérer le catalogue dans',
    'uijur.catsel.desc_menu': 'Catalogue services',
    'uijur.catsel.desc_suffix': 'du menu.',
    'uijur.catsel.search_ph': 'Rechercher un article...',
    'uijur.catsel.all_categories': 'Toutes catégories',
    'uijur.catsel.qty': 'Qté',
    'uijur.catsel.loading': 'Chargement...',
    'uijur.catsel.empty': 'Catalogue vide. Crée tes services/produits dans /client/catalogue.',
    'uijur.catsel.no_match': 'Aucun article ne correspond à ce filtre.',
    'uijur.catsel.vat_15': 'TVA 15%',
    'uijur.catsel.zero_rated': 'Zero-rated',
    'uijur.catsel.selected_summary': '{n} article(s) sélectionné(s) · qté {q} chacun',
    'uijur.catsel.add_btn': 'Ajouter ({n}) à la facture',

    // components/client/ContactsImportDialog.tsx
    'uijur.con.email_invalid': 'email invalide : {email}',

    // app/admin/parametres/page.tsx
    'uijur.params.cur_mur': 'MUR — Roupie mauricienne',
    'uijur.params.cur_usd': 'USD — Dollar américain',
    'uijur.params.cur_eur': 'EUR — Euro',
    'uijur.params.cur_gbp': 'GBP — Livre sterling',
    'uijur.params.fx_usd_ph': 'Ex: 45.50',
    'uijur.params.fx_eur_ph': 'Ex: 49.00',
    'uijur.params.fiscal_start_ph': '01-01 ou 01-07',

    // app/signer-contrat/page.tsx
    'uijur.signer.invalid_params': 'Lien invalide. Paramètres manquants.',
  },
  en: {
    // components/ui/dialog.tsx
    'uijur.dialog.close_aria': 'Close the dialog window',
    'uijur.dialog.close': 'Close',

    // components/client/CatalogueSelectorDialog.tsx
    'uijur.catsel.title': 'Services & products catalogue',
    'uijur.catsel.desc_prefix': 'Select one or more items to add to the invoice. You can manage the catalogue in',
    'uijur.catsel.desc_menu': 'Services catalogue',
    'uijur.catsel.desc_suffix': 'from the menu.',
    'uijur.catsel.search_ph': 'Search for an item...',
    'uijur.catsel.all_categories': 'All categories',
    'uijur.catsel.qty': 'Qty',
    'uijur.catsel.loading': 'Loading...',
    'uijur.catsel.empty': 'Empty catalogue. Create your services/products in /client/catalogue.',
    'uijur.catsel.no_match': 'No item matches this filter.',
    'uijur.catsel.vat_15': 'VAT 15%',
    'uijur.catsel.zero_rated': 'Zero-rated',
    'uijur.catsel.selected_summary': '{n} item(s) selected · qty {q} each',
    'uijur.catsel.add_btn': 'Add ({n}) to the invoice',

    // components/client/ContactsImportDialog.tsx
    'uijur.con.email_invalid': 'invalid email: {email}',

    // app/admin/parametres/page.tsx
    'uijur.params.cur_mur': 'MUR — Mauritian Rupee',
    'uijur.params.cur_usd': 'USD — US Dollar',
    'uijur.params.cur_eur': 'EUR — Euro',
    'uijur.params.cur_gbp': 'GBP — Pound Sterling',
    'uijur.params.fx_usd_ph': 'e.g. 45.50',
    'uijur.params.fx_eur_ph': 'e.g. 49.00',
    'uijur.params.fiscal_start_ph': '01-01 or 01-07',

    // app/signer-contrat/page.tsx
    'uijur.signer.invalid_params': 'Invalid link. Missing parameters.',
  },
} as const
