// Auto-généré (sweep i18n) — chunk comptable_b. Parité FR/EN stricte.
export const comptablebChunk = {
  fr: {
    // --- Doublons de factures ---
    'cptb.doublons.title': 'Doublons de factures',
    'cptb.doublons.subtitle': 'Factures regroupées par tiers + date + montant TTC. Conserve la plus ancienne, supprime les doublons.',
    'cptb.doublons.societe': 'Société',
    'cptb.doublons.choose': 'Choisir…',
    'cptb.doublons.refresh': 'Actualiser',
    'cptb.doublons.kpiGroups': 'Groupes en doublon',
    'cptb.doublons.kpiExtra': 'Factures en trop',
    'cptb.doublons.kpiAmount': 'Montant TTC dupliqué',
    'cptb.doublons.empty': 'Aucun doublon détecté pour cette société.',
    'cptb.doublons.copies': 'exemplaires',
    'cptb.doublons.colInvoiceNo': 'N° facture',
    'cptb.doublons.colType': 'Type',
    'cptb.doublons.colCreatedAt': 'Créée le',
    'cptb.doublons.colStatus': 'Statut',
    'cptb.doublons.badgeKeep': 'à conserver',
    'cptb.doublons.badgeDuplicate': 'doublon',
    'cptb.doublons.delete': 'Supprimer',
    'cptb.doublons.error': 'Erreur',
    'cptb.doublons.deleteFailed': 'Échec suppression',
    'cptb.doublons.confirmDelete': 'Supprimer le doublon : facture',
    'cptb.doublons.confirmDateFrom': 'du',
    'cptb.doublons.confirmIrreversible': 'Cette action est irréversible.',

    // --- Contrats (liste) ---
    'cptb.contrats.statut_brouillon': 'Brouillon',
    'cptb.contrats.statut_en_revision': 'En révision',
    'cptb.contrats.statut_valide': 'Validé',
    'cptb.contrats.statut_envoye': 'Envoyé',
    'cptb.contrats.statut_signe': 'Signé ✓',
    'cptb.contrats.statut_archive': 'Archivé',
    'cptb.contrats.statut_resilie': 'Résilié',
    'cptb.contrats.statut_placeholder': 'Statut',
    'cptb.contrats.type_placeholder': 'Type',
    'cptb.contrats.count_singular': 'contrat',
    'cptb.contrats.count_plural': 'contrats',

    // --- Société (vue d'ensemble) — badges statut ---
    'cptb.soc.badge_paye': 'Payé',
    'cptb.soc.badge_solde': 'Soldé',
    'cptb.soc.badge_rapproche': 'Rapproché',
    'cptb.soc.badge_declare': 'Déclaré',
    'cptb.soc.badge_conforme': 'Conforme',
    'cptb.soc.badge_en_attente': 'En attente',
    'cptb.soc.badge_a_declarer': 'À déclarer',
    'cptb.soc.badge_a_verifier': 'À vérifier',
    'cptb.soc.badge_a_payer': 'À payer',
    'cptb.soc.badge_partiel': 'Partiel',
    'cptb.soc.badge_en_retard': 'En retard',
    'cptb.soc.badge_impaye': 'Impayé',
    'cptb.soc.badge_non_identifie': 'Non identifié',
    'cptb.soc.badge_ecart': 'Écart détecté',

    // --- Balance — sens normal résiduel ---
    'cptb.bal.side_debit': 'Débit',
    'cptb.bal.side_credit': 'Crédit',

    // --- Bilan — toasts & états vides résiduels ---
    'cptb.bilan.err_load_company': 'Charger société',
    'cptb.bilan.err_load_exercises': 'Charger exercices',
    'cptb.bilan.err_load_balance': 'Charger bilan',
    'cptb.bilan.empty_no_entries': 'Aucune écriture comptabilisée pour cet exercice.',
    'cptb.bilan.no_active_bank': 'Aucun compte bancaire actif rattaché à cette société.',

    // --- Tableau de bord — toasts & états vides résiduels ---
    'cptb.tdb.err_load_company': 'Charger société',
    'cptb.tdb.err_load_exercises': 'Charger exercices',
    'cptb.tdb.err_load_financials': 'Charger états financiers',
    'cptb.tdb.empty_no_entries': 'Aucune écriture comptabilisée pour cet exercice — uploadez des documents pour alimenter les KPIs.',
    'cptb.tdb.no_active_bank': 'Aucun compte bancaire actif rattaché à cette société.',

    // --- Grand livre — tooltips export résiduels ---
    'cptb.gl.export_excel_tooltip': 'Exporter en Excel (xlsx)',
    'cptb.gl.export_pdf_tooltip': 'Exporter en PDF (A4 paysage, groupé par compte)',
  } as Record<string, string>,
  en: {
    // --- Duplicate invoices ---
    'cptb.doublons.title': 'Duplicate invoices',
    'cptb.doublons.subtitle': 'Invoices grouped by counterparty + date + amount incl. tax. Keeps the oldest, removes the duplicates.',
    'cptb.doublons.societe': 'Company',
    'cptb.doublons.choose': 'Select…',
    'cptb.doublons.refresh': 'Refresh',
    'cptb.doublons.kpiGroups': 'Duplicate groups',
    'cptb.doublons.kpiExtra': 'Surplus invoices',
    'cptb.doublons.kpiAmount': 'Duplicated amount incl. tax',
    'cptb.doublons.empty': 'No duplicates detected for this company.',
    'cptb.doublons.copies': 'copies',
    'cptb.doublons.colInvoiceNo': 'Invoice no.',
    'cptb.doublons.colType': 'Type',
    'cptb.doublons.colCreatedAt': 'Created on',
    'cptb.doublons.colStatus': 'Status',
    'cptb.doublons.badgeKeep': 'to keep',
    'cptb.doublons.badgeDuplicate': 'duplicate',
    'cptb.doublons.delete': 'Delete',
    'cptb.doublons.error': 'Error',
    'cptb.doublons.deleteFailed': 'Deletion failed',
    'cptb.doublons.confirmDelete': 'Delete duplicate: invoice',
    'cptb.doublons.confirmDateFrom': 'dated',
    'cptb.doublons.confirmIrreversible': 'This action is irreversible.',

    // --- Contracts (list) ---
    'cptb.contrats.statut_brouillon': 'Draft',
    'cptb.contrats.statut_en_revision': 'In review',
    'cptb.contrats.statut_valide': 'Approved',
    'cptb.contrats.statut_envoye': 'Sent',
    'cptb.contrats.statut_signe': 'Signed ✓',
    'cptb.contrats.statut_archive': 'Archived',
    'cptb.contrats.statut_resilie': 'Terminated',
    'cptb.contrats.statut_placeholder': 'Status',
    'cptb.contrats.type_placeholder': 'Type',
    'cptb.contrats.count_singular': 'contract',
    'cptb.contrats.count_plural': 'contracts',

    // --- Company (overview) — status badges ---
    'cptb.soc.badge_paye': 'Paid',
    'cptb.soc.badge_solde': 'Settled',
    'cptb.soc.badge_rapproche': 'Reconciled',
    'cptb.soc.badge_declare': 'Filed',
    'cptb.soc.badge_conforme': 'Compliant',
    'cptb.soc.badge_en_attente': 'Pending',
    'cptb.soc.badge_a_declarer': 'To file',
    'cptb.soc.badge_a_verifier': 'To review',
    'cptb.soc.badge_a_payer': 'To pay',
    'cptb.soc.badge_partiel': 'Partial',
    'cptb.soc.badge_en_retard': 'Overdue',
    'cptb.soc.badge_impaye': 'Unpaid',
    'cptb.soc.badge_non_identifie': 'Unidentified',
    'cptb.soc.badge_ecart': 'Discrepancy detected',

    // --- Balance — residual normal side ---
    'cptb.bal.side_debit': 'Debit',
    'cptb.bal.side_credit': 'Credit',

    // --- Balance sheet — residual toasts & empty states ---
    'cptb.bilan.err_load_company': 'Load company',
    'cptb.bilan.err_load_exercises': 'Load financial years',
    'cptb.bilan.err_load_balance': 'Load balance sheet',
    'cptb.bilan.empty_no_entries': 'No entries recorded for this financial year.',
    'cptb.bilan.no_active_bank': 'No active bank account linked to this company.',

    // --- Dashboard — residual toasts & empty states ---
    'cptb.tdb.err_load_company': 'Load company',
    'cptb.tdb.err_load_exercises': 'Load financial years',
    'cptb.tdb.err_load_financials': 'Load financial statements',
    'cptb.tdb.empty_no_entries': 'No entries recorded for this financial year — upload documents to feed the KPIs.',
    'cptb.tdb.no_active_bank': 'No active bank account linked to this company.',

    // --- General ledger — residual export tooltips ---
    'cptb.gl.export_excel_tooltip': 'Export to Excel (xlsx)',
    'cptb.gl.export_pdf_tooltip': 'Export to PDF (A4 landscape, grouped by account)',
  } as Record<string, string>,
}
