// app/lib/expertRH.ts
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const SYSTEM_PROMPT_EXPERT_CONTRATS = `Tu es un expert en droit du travail mauricien avec 20 ans d'expérience.
Tu maîtrises : Workers' Rights Act 2019 (WRA), Employment Relations Act 2008 (ERA), National Minimum Wage Act, Finance Act 2024, Economic Act 2025, jurisprudence ERT et Supreme Court Maurice.
RÈGLES : (1) Cite toujours la section exacte (WRA s.52(3)), (2) Distingue obligatoire vs recommandé, (3) Alerte sur les risques avec niveau 🔴 Critique / 🟡 Attention / 🟢 OK, (4) Réponds en français sauf si question en anglais.`;

export async function genererContrat(params: {
  type: string; secteur: string; employe_nom: string; poste: string;
  salaire: number; date_debut: string; date_fin?: string; langue?: string;
  societe_nom?: string; societe_brn?: string; societe_adresse?: string;
  employe_nic?: string; employe_dob?: string;
}): Promise<string> {
  const { remplirTemplate, getTemplate } = await import('./contratsTemplates');
  const template = getTemplate(params.type, params.secteur);
  const parts = (params.employe_nom || '').trim().split(' ')
  return remplirTemplate(template, {
    societe_nom:     params.societe_nom || 'Société',
    societe_brn:     params.societe_brn || '______',
    societe_adresse: params.societe_adresse || 'Mauritius',
    employe_nom:     parts.slice(1).join(' ') || parts[0] || '______',
    employe_prenom:  parts[0] || '______',
    employe_nic:     params.employe_nic || '______',
    employe_dob:     params.employe_dob || '______',
    poste:           params.poste || '______',
    salaire_base:    params.salaire,
    date_debut:      params.date_debut,
    date_fin:        params.date_fin,
    lieu_travail:    params.societe_adresse || 'Port Louis, Mauritius',
  });
}

export async function verifierContrat(html: string): Promise<{ risques: string[]; score: number; clauses_manquantes: string[] }> {
  const res = await anthropic.messages.create({
    model: 'claude-opus-4-5', max_tokens: 1500,
    system: SYSTEM_PROMPT_EXPERT_CONTRATS,
    messages: [{ role: 'user', content: `Analyse ce contrat et retourne un JSON : {"risques": [...], "score": 0-100, "clauses_manquantes": [...]}.\n\nContrat:\n${html.slice(0, 3000)}` }]
  });
  const txt = res.content[0].type === 'text' ? res.content[0].text : '{}';
  const match = txt.match(/\{[\s\S]*\}/);
  try { return match ? JSON.parse(match[0]) : { risques: [], score: 80, clauses_manquantes: [] }; }
  catch { return { risques: [], score: 80, clauses_manquantes: [] }; }
}

