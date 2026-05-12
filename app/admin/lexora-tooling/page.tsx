"use client"

/**
 * Page /admin/lexora-tooling — Inventaire des skills Claude Code + outils MCP.
 *
 * Donne une visibilité côté web de ce que Phase 3 a livré :
 *   • 3 skills Claude Code (lexora-ifrs9-ecl, lexora-mra-tds, lexora-rapprochement-rules)
 *   • 5 outils MCP exposés par le serveur lexora-accounting
 *
 * Sert de doc interne pour les admins / comptables qui se demandent ce que
 * les agents Claude peuvent faire. Non interactif (read-only).
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Brain, Boxes, Shield, Calculator, GitMerge, BookOpen, ListChecks, Receipt, Scale, FileSpreadsheet, ExternalLink, Globe } from "lucide-react"

const SKILLS = [
  {
    name: "lexora-ifrs9-ecl",
    Icon: Shield,
    color: "indigo",
    description: "Calcul de la provision IFRS 9 (Expected Credit Loss) general approach.",
    triggers: ["ECL", "provision IFRS 9", "Stage 1/2/3", "SICR", "PD", "LGD", "EAD", "credit risk"],
    related: ["Migration 237", "/client/ifrs9-ecl", "ifrs9_compute_ecl_full"],
  },
  {
    name: "lexora-mra-tds",
    Icon: Receipt,
    color: "amber",
    description: "Conformité MRA Maurice : PAYE, NSF, CSG, TDS, IT Form 3, barèmes 2025.",
    triggers: ["MRA", "PAYE", "NSF", "CSG", "TDS", "IT Form 3", "Income Tax Act 1995", "Social Contributions Act 2021"],
    related: ["Migration 222", "Migration 226", "/client/it-form3", "/client/tva"],
  },
  {
    name: "lexora-rapprochement-rules",
    Icon: GitMerge,
    color: "emerald",
    description: "Règles déterministes R1-R7 du rapprochement bancaire + lettrage croisé.",
    triggers: ["rapprochement", "lettrage", "BNQ", "agent déterministe", "RULE 4", "classer transaction"],
    related: ["lib/accounting/ecritures-factures.ts", "app/api/comptable/rapprochement/", "/client/rapprochement"],
  },
  {
    name: "lexora-gbc-ifrs-complete",
    Icon: Globe,
    color: "purple",
    description: "Conformité Global Business Companies (GBC) Maurice + Full IFRS : PER 80%, substance CIGA, Transfer Pricing, UBO, CRS/FATCA, BEPS Pillar Two, consolidation IFRS 10, IFRS 16 leases, monnaie fonctionnelle IAS 21.",
    triggers: ["GBC", "Global Business", "FSC", "PER", "substance", "CIGA", "Transfer Pricing", "UBO", "Pillar Two", "GloBE", "IFRS 10", "IFRS 16", "Full IFRS", "consolidation", "Authorised Company"],
    related: ["Income Tax Act §50C", "FSC Rules", "Maurice TP Act 2023", "OECD BEPS Pillar Two"],
  },
]

const MCP_TOOLS = [
  {
    name: "get_grand_livre",
    Icon: BookOpen,
    color: "slate",
    description: "Lecture des écritures comptables V2 avec filtres (date, compte, limite). Read-only.",
    inputs: ["societe_id (uuid)", "date_debut?", "date_fin?", "compte_prefix?", "limit (default 500)"],
    safety: "Lecture seule. Respecte societe_id pour isolation tenant.",
  },
  {
    name: "compute_ifrs9_ecl",
    Icon: Shield,
    color: "indigo",
    description: "Calcule l'ECL IFRS 9 complète pour une société (Stages, PD/LGD, macro).",
    inputs: ["societe_id (uuid)", "refresh_stages (bool, default false)"],
    safety: "Délègue à la RPC SECURITY DEFINER ifrs9_compute_ecl_full. Pas de SQL brut.",
  },
  {
    name: "lettrer_ecritures",
    Icon: ListChecks,
    color: "blue",
    description: "Lettrage groupé d'un ensemble d'écritures avec contrôles d'invariants.",
    inputs: ["societe_id (uuid)", "ecriture_ids (uuid[], min 2)", "lettre? (auto-générée sinon)"],
    safety: "Refuse si Σdébit ≠ Σcrédit, mélange société, ou écritures déjà lettrées.",
  },
  {
    name: "list_unpaid_invoices",
    Icon: Receipt,
    color: "amber",
    description: "Liste les factures non payées avec age en jours (aging analysis).",
    inputs: ["societe_id (uuid)", "type_facture ('client'|'fournisseur')", "min_age_days (default 0)"],
    safety: "Lecture seule. Filtre statut en_attente/retard + montant_mur > 0.",
  },
  {
    name: "compute_balance",
    Icon: Calculator,
    color: "emerald",
    description: "Balance comptable agrégée par compte avec contrôle équilibre Σdébit = Σcrédit.",
    inputs: ["societe_id (uuid)", "date_debut?", "date_fin?"],
    safety: "Lecture paginée (1000/batch, cap 10K). Retourne `equilibre: boolean`.",
  },
]

const colorMap: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
  indigo:  { bg: "bg-indigo-50",  border: "border-indigo-200",  text: "text-indigo-900",  iconBg: "bg-indigo-600 text-white" },
  amber:   { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-900",   iconBg: "bg-amber-600 text-white" },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900", iconBg: "bg-emerald-600 text-white" },
  slate:   { bg: "bg-slate-50",   border: "border-slate-200",   text: "text-slate-900",   iconBg: "bg-slate-700 text-white" },
  blue:    { bg: "bg-blue-50",    border: "border-blue-200",    text: "text-blue-900",    iconBg: "bg-blue-600 text-white" },
  purple:  { bg: "bg-purple-50",  border: "border-purple-200",  text: "text-purple-900",  iconBg: "bg-purple-700 text-white" },
}

export default function LexoraToolingPage() {
  return (
    <div className="p-6 space-y-8 max-w-6xl">
      {/* HEADER */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-purple-700 p-3 text-white shadow-md">
            <Brain className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Lexora Tooling</h1>
            <p className="text-sm text-slate-600">Skills Claude Code et outils MCP exposés aux agents</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 max-w-3xl">
          Cette page recense les connaissances métier (skills) et les opérations (outils MCP) que les agents
          Claude peuvent utiliser pour interagir avec Lexora. Source : <code className="text-xs bg-slate-100 px-1 rounded">.claude/skills/</code> et
          <code className="text-xs bg-slate-100 px-1 rounded">mcp-servers/lexora-accounting/</code>.
        </p>
      </div>

      {/* SKILLS SECTION */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-indigo-600" />
          Skills Claude Code <Badge variant="outline" className="ml-2">{SKILLS.length} actives</Badge>
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Les skills sont chargées automatiquement par Claude Code quand le contexte du chat le justifie (description matched).
          Elles documentent les règles métier, les pièges connus, et les références au code et aux migrations.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SKILLS.map(skill => {
            const c = colorMap[skill.color]
            return (
              <div key={skill.name} className={`rounded-xl border ${c.border} ${c.bg} p-4`}>
                <div className="flex items-start gap-3 mb-3">
                  <div className={`rounded-lg ${c.iconBg} p-2 shadow-sm`}>
                    <skill.Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <code className={`text-sm font-mono font-semibold ${c.text}`}>{skill.name}</code>
                    <p className={`text-xs ${c.text} mt-1 opacity-80`}>{skill.description}</p>
                  </div>
                </div>
                <div className="space-y-2 mt-3">
                  <div>
                    <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Mots-clés déclencheurs</div>
                    <div className="flex flex-wrap gap-1">
                      {skill.triggers.map(t => (
                        <span key={t} className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Référence Lexora</div>
                    <div className="flex flex-wrap gap-1">
                      {skill.related.map(r => (
                        <span key={r} className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono">{r}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* MCP TOOLS SECTION */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Boxes className="h-5 w-5 text-indigo-600" />
          Outils MCP <Badge variant="outline" className="ml-2">{MCP_TOOLS.length} disponibles</Badge>
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Le serveur MCP <code className="bg-slate-100 px-1 rounded">lexora-accounting</code> expose les opérations
          comptables comme outils typés pour les agents Claude (Claude Desktop, automatisations internes).
          Les invariants sont vérifiés côté serveur (équilibre, anti-doublon, isolation tenant).
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {MCP_TOOLS.map(tool => {
            const c = colorMap[tool.color]
            return (
              <div key={tool.name} className={`rounded-xl border ${c.border} ${c.bg} p-4`}>
                <div className="flex items-start gap-3 mb-3">
                  <div className={`rounded-lg ${c.iconBg} p-2 shadow-sm`}>
                    <tool.Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <code className={`text-sm font-mono font-semibold ${c.text}`}>{tool.name}</code>
                    <p className={`text-xs ${c.text} mt-1 opacity-80`}>{tool.description}</p>
                  </div>
                </div>
                <div className="space-y-2 mt-3">
                  <div>
                    <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Inputs (validés Zod)</div>
                    <div className="flex flex-wrap gap-1">
                      {tool.inputs.map(i => (
                        <code key={i} className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono">{i}</code>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Sécurité serveur</div>
                    <p className="text-[11px] text-slate-700">{tool.safety}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* INSTALLATION SECTION */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Scale className="h-5 w-5 text-indigo-600" />
          Activer les outils MCP dans Claude Desktop
        </h2>

        <Card>
          <CardContent className="p-5 space-y-4 text-sm">
            <ol className="list-decimal list-inside space-y-2 text-slate-700">
              <li>Cloner le repo Lexora et builder le serveur :
                <pre className="mt-1 bg-slate-900 text-slate-100 text-xs p-3 rounded overflow-x-auto">
{`cd mcp-servers/lexora-accounting
npm install
npm run build`}
                </pre>
              </li>
              <li>Récupérer la <strong>service role key</strong> Supabase (Dashboard → Settings → API).</li>
              <li>Ajouter au fichier de config Claude Desktop :
                <pre className="mt-1 bg-slate-900 text-slate-100 text-xs p-3 rounded overflow-x-auto">{`{
  "mcpServers": {
    "lexora-accounting": {
      "command": "node",
      "args": ["/chemin/absolu/mcp-servers/lexora-accounting/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://YOUR_PROJECT.supabase.co",
        "SUPABASE_SERVICE_KEY": "eyJh..."
      }
    }
  }
}`}</pre>
              </li>
              <li>Redémarrer Claude Desktop → icône <code className="bg-slate-100 px-1 rounded">🔌</code> en bas du chat → vérifier
                la présence de <code className="bg-slate-100 px-1 rounded">lexora-accounting</code> avec les 5 outils.</li>
            </ol>

            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
              <Scale className="h-4 w-4 mt-0.5" />
              <div>
                <strong>Sécurité :</strong> la service key bypasse la RLS Supabase. À utiliser uniquement sur un poste
                admin ou un environnement contrôlé. Pour un usage end-user, basculer sur <code>SUPABASE_ANON_KEY</code> +
                JWT (roadmap).
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* FOOTER */}
      <div className="text-xs text-slate-500 border-t pt-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-3 w-3" />
          Source de vérité : <code className="bg-slate-100 px-1 rounded">.claude/skills/</code> et
          <code className="bg-slate-100 px-1 rounded">mcp-servers/lexora-accounting/</code> sur la branche
          <code className="bg-slate-100 px-1 rounded">claude/phase3-skills-mcp</code>.
        </div>
      </div>
    </div>
  )
}
