/**
 * sources-officielles.ts — Registre des textes de loi mauriciens à ingérer
 * dans le RAG (juridique_rag_corpus). Chaque entrée pointe vers un PDF officiel
 * consolidé (versions les plus à jour disponibles).
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
  {
    key: 'companies-2001',
    source: 'CA 2001',
    titre: 'Companies Act 2001 (version consolidée)',
    domaine: 'societes',
    url: 'https://fcc.mu/wp-content/uploads/2024/06/THE-COMPANIES-ACT-2001.pdf',
    maj: 'consolidée 2024',
  },
]

export function getSourceLoi(key: string): SourceLoi | undefined {
  return SOURCES_LOIS.find((s) => s.key === key)
}
