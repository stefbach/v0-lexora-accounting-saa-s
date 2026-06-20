/**
 * sources-officielles.ts — Registre des textes de loi mauriciens à ingérer
 * dans le RAG (juridique_rag_corpus). Chaque entrée pointe vers un PDF officiel
 * (versions consolidées les plus à jour disponibles).
 *
 * Pur data → importable serveur (ingestion) et client (affichage).
 */
import type { DomaineJuridique } from '../referentielMauricien'

export interface SourceLoi {
  key: string            // identifiant court (slug de source)
  source: string         // code affiché (ex: 'WRA 2019')
  titre: string          // titre complet de la loi
  domaine: DomaineJuridique
  url: string            // PDF officiel
  maj: string            // version/àjour (libellé)
}

export const SOURCES_LOIS: SourceLoi[] = [
  // ── Travail / social ──
  {
    key: 'wra-2019',
    source: 'WRA 2019',
    titre: "Workers' Rights Act 2019 (version consolidée)",
    domaine: 'travail',
    url: "https://labour.govmu.org/Documents/Legislations/THE%20WORKERS%20RIGHTS%20Act%202019/A%20Consolidated%20Version%20of%20the%20Workers'%20Rights%20Act%202019%20as%20at%209%20August%202025.pdf",
    maj: 'consolidée au 9 août 2025',
  },
  {
    key: 'era-2008',
    source: 'ERA 2008',
    titre: 'Employment Relations Act 2008 (version consolidée)',
    domaine: 'travail',
    url: 'https://ert.govmu.org/Documents/Legislation%20ERT/THE%20EMPLOYMENT%20RELATIONS%20ACT%202008%20(1)latest.pdf',
    maj: 'version officielle ERT',
  },
  // ── Sociétés / insolvabilité / financier ──
  {
    key: 'companies-2001',
    source: 'CA 2001',
    titre: 'Companies Act 2001 (version consolidée)',
    domaine: 'societes',
    url: 'https://fcc.mu/wp-content/uploads/2024/06/THE-COMPANIES-ACT-2001.pdf',
    maj: 'consolidée 2024',
  },
  {
    key: 'insolvency-2009',
    source: 'Insolvency Act 2009',
    titre: 'Insolvency Act 2009',
    domaine: 'insolvabilite',
    url: 'https://www.fscmauritius.org/media/1155/insolvency-act-2009-130114.pdf',
    maj: 'version FSC',
  },
  {
    key: 'fsa-2007',
    source: 'FSA 2007',
    titre: 'Financial Services Act 2007 (version consolidée)',
    domaine: 'financier',
    url: 'https://www.fscmauritius.org/media/1013/financial-services-act-2007-28-aug-2019-cc.pdf',
    maj: 'consolidée au 28 août 2019',
  },
  // ── Fiscal ──
  {
    key: 'ita-1995',
    source: 'ITA',
    titre: 'Income Tax Act 1995 (version consolidée)',
    domaine: 'fiscal',
    url: 'https://www.mra.mu/download/ITAConsolidated.pdf',
    maj: 'consolidée à mai 2026',
  },
  {
    key: 'vat-1998',
    source: 'VAT Act',
    titre: 'Value Added Tax Act 1998 (version consolidée)',
    domaine: 'fiscal',
    url: 'https://www.mra.mu/download/VATAct.pdf',
    maj: 'consolidée à mai 2026',
  },
  // ── Données ──
  {
    key: 'dpa-2017',
    source: 'DPA 2017',
    titre: 'Data Protection Act 2017',
    domaine: 'donnees',
    url: 'https://www.fscmauritius.org/media/105843/the-data-protection-act-2017.pdf',
    maj: 'Act 20/2017',
  },
  // ── Civil / commercial (codes) ──
  {
    key: 'code-civil',
    source: 'Code Civil',
    titre: 'Code Civil Mauricien (Revised Laws of Mauritius)',
    domaine: 'civil',
    url: 'https://attorneygeneral.govmu.org/Documents/Laws%20of%20Mauritius/A-Z%20Acts/C/Co/CodeCivilMauricien.pdf',
    maj: 'Revised Laws of Mauritius',
  },
  {
    key: 'code-commerce',
    source: 'Code de Commerce',
    titre: 'Code de Commerce (Mauricien)',
    domaine: 'commercial',
    url: 'https://www.mcci.org/media/35745/code-de-commerce.pdf',
    maj: 'version consolidée',
  },
  {
    key: 'code-procedure-civile',
    source: 'Code de Procédure Civile',
    titre: 'Code de Procédure Civile (Mauricien)',
    domaine: 'procedure',
    url: 'https://www.mcci.org/media/35736/codedeprocedurecivile.pdf',
    maj: 'version consolidée',
  },
  // ── Procédure / juridictions ──
  {
    key: 'courts-act',
    source: 'Courts Act',
    titre: 'Courts Act (Cap 168, Act 41 of 1945) — Revised Laws',
    domaine: 'procedure',
    url: 'https://attorneygeneral.govmu.org/Documents/Laws%20of%20Mauritius/A-Z%20Acts/C/Co/COURTS%20ACT,%20Cap%20168,%20(Act%2041%20of%201945).pdf',
    maj: 'Revised Laws of Mauritius',
  },
  {
    key: 'district-intermediate-courts',
    source: 'DIC Act',
    titre: 'District and Intermediate Courts (Civil Jurisdiction) Act — Revised Laws',
    domaine: 'procedure',
    url: 'https://attorneygeneral.govmu.org/Documents/Laws%20of%20Mauritius/A-Z%20Acts/D/DISTRICT%20AND%20INTERMEDIATE%20COURTS%20(CIVIL%20JURISDICTION)%20ACT,%20No%20Cap%20173.pdf',
    maj: 'Revised Laws of Mauritius',
  },
  {
    key: 'constitution',
    source: 'Constitution',
    titre: 'Constitution of Mauritius (GN 54 of 1968) — Revised Laws',
    domaine: 'procedure',
    url: 'https://attorneygeneral.govmu.org/Documents/Laws%20of%20Mauritius/A-Z%20Acts/C/Co/Constitution,%20GN%2054%20of%201968.pdf',
    maj: 'Revised Laws of Mauritius',
  },
  // ── Anti-blanchiment / arbitrage / immobilier ──
  {
    key: 'fiamla-2002',
    source: 'FIAMLA',
    titre: 'Financial Intelligence and Anti-Money Laundering Act 2002',
    domaine: 'financier',
    url: 'https://www.fiumauritius.org/fiu/wp-content/uploads/2023/02/financial-intelligence-and-anti-money-laundering-act-2002.pdf',
    maj: 'version FIU',
  },
  {
    key: 'iaa-2008',
    source: 'IAA 2008',
    titre: 'International Arbitration Act 2008 (amendé 2013)',
    domaine: 'arbitrage',
    url: 'https://marc.mu/wp-content/uploads/2023/03/international-arbitration-act-2008-amended-2013.pdf',
    maj: 'amendé 2013',
  },
  {
    key: 'landlord-tenant',
    source: 'L&T Act',
    titre: 'Landlord and Tenant Act 1999 — Revised Laws',
    domaine: 'immobilier',
    url: 'https://attorneygeneral.govmu.org/Documents/Laws%20of%20Mauritius/A-Z%20Acts/L/La/LANDLORD%20AND%20TENANT%20ACT,%20No%206%20of%201999.pdf',
    maj: 'Revised Laws of Mauritius',
  },
]

export function getSourceLoi(key: string): SourceLoi | undefined {
  return SOURCES_LOIS.find((s) => s.key === key)
}
