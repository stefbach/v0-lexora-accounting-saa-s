// app/lib/expertRH.ts
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const SYSTEM_PROMPT_EXPERT_CONTRATS = `Tu es Maître TIBOK, expert en droit du travail mauricien avec 20 ans d'expérience.
Tu maîtrises : Workers' Rights Act 2019 (WRA), Employment Relations Act 2008 (ERA), National Minimum Wage Act, Finance Act 2024, Economic Act 2025, jurisprudence ERT et Supreme Court Maurice.
RÈGLES : (1) Cite toujours la section exacte (WRA s.52(3)), (2) Distingue obligatoire vs recommandé, (3) Alerte sur les risques avec niveau 🔴 Critique / 🟡 Attention / 🟢 OK, (4) Réponds en français sauf si question en anglais.`;

export async function genererContrat(params: {
  type: string; secteur: string; employe_nom: string; poste: string;
  salaire: number; date_debut: string; langue?: string;
}): Promise<string> {
  const { remplirTemplate, getTemplate } = await import('./contratsTemplates');
  const template = getTemplate(params.type, params.secteur);
  return remplirTemplate(template, {
    societe_nom: 'TIBOK Group', societe_brn: 'C07000000', societe_adresse: 'Port Louis, Mauritius',
    employe_nom: params.employe_nom.split(' ').slice(-1)[0],
    employe_prenom: params.employe_nom.split(' ')[0],
    employe_nic: '______', employe_dob: '______',
    poste: params.poste, salaire_base: params.salaire,
    date_debut: params.date_debut, lieu_travail: 'Port Louis, Mauritius',
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
