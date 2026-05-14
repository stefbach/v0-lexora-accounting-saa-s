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
import { Brain, Boxes, Shield, Calculator, GitMerge, BookOpen, ListChecks, Receipt, Scale, FileSpreadsheet, ExternalLink, Globe, Banknote, Layers, UserCheck, FileSignature, Building2 } from "lucide-react"
import { t, getLocale, type Locale } from "@/lib/i18n"

function getSkills(locale: Locale) {
  return [
    {
      name: "lexora-ifrs9-ecl",
      Icon: Shield,
      color: "indigo",
      description: t('adm.tooling.sk.ifrs9_desc', locale),
      triggers: ["ECL", "provision IFRS 9", "Stage 1/2/3", "SICR", "PD", "LGD", "EAD", "credit risk"],
      related: ["Migration 237", "/client/ifrs9-ecl", "ifrs9_compute_ecl_full"],
    },
    {
      name: "lexora-mra-tds",
      Icon: Receipt,
      color: "amber",
      description: t('adm.tooling.sk.mra_desc', locale),
      triggers: ["MRA", "PAYE", "NSF", "CSG", "TDS", "IT Form 3", "Income Tax Act 1995", "Social Contributions Act 2021"],
      related: ["Migration 222", "Migration 226", "/client/it-form3", "/client/tva"],
    },
    {
      name: "lexora-rapprochement-rules",
      Icon: GitMerge,
      color: "emerald",
      description: t('adm.tooling.sk.rappro_desc', locale),
      triggers: ["rapprochement", "lettrage", "BNQ", "agent déterministe", "RULE 4", "classer transaction"],
      related: ["lib/accounting/ecritures-factures.ts", "app/api/comptable/rapprochement/", "/client/rapprochement"],
    },
    {
      name: "lexora-gbc-ifrs-complete",
      Icon: Globe,
      color: "purple",
      description: t('adm.tooling.sk.gbc_desc', locale),
      triggers: ["GBC", "Global Business", "FSC", "PER", "substance", "CIGA", "Transfer Pricing", "UBO", "Pillar Two", "GloBE", "IFRS 10", "IFRS 16", "Full IFRS", "consolidation", "Authorised Company"],
      related: ["Migrations 249-257", "9 routes /api/comptable/gbc/*", "9 pages /client/gbc-*"],
    },
  ]
}

function getGbcModules(locale: Locale) {
  return [
    { code: "Dashboard", title: t('adm.tooling.gbcm.dashboard_title', locale), page: "/client/gbc-dashboard", mig: 0, route: "(agrégation 8 modules)", Icon: Globe, color: "purple", topic: t('adm.tooling.gbcm.dashboard_topic', locale) },
    { code: "Phase A", title: t('adm.tooling.gbcm.phaseA_title', locale), page: "/client/societes", mig: 249, route: "/api/comptable/cta-recalc", Icon: Banknote, color: "indigo", topic: t('adm.tooling.gbcm.phaseA_topic', locale) },
    { code: "Phase B", title: t('adm.tooling.gbcm.phaseB_title', locale), page: "/client/gbc-per", mig: 250, route: "/api/comptable/gbc/per-computation", Icon: Banknote, color: "amber", topic: t('adm.tooling.gbcm.phaseB_topic', locale) },
    { code: "Phase C", title: t('adm.tooling.gbcm.phaseC_title', locale), page: "/client/gbc-substance", mig: 251, route: "/api/comptable/gbc/substance", Icon: Shield, color: "emerald", topic: t('adm.tooling.gbcm.phaseC_topic', locale) },
    { code: "Phase D", title: t('adm.tooling.gbcm.phaseD_title', locale), page: "/client/gbc-transfer-pricing", mig: 252, route: "/api/comptable/gbc/transfer-pricing", Icon: GitMerge, color: "slate", topic: t('adm.tooling.gbcm.phaseD_topic', locale) },
    { code: "Phase E", title: t('adm.tooling.gbcm.phaseE_title', locale), page: "/client/gbc-ubo", mig: 253, route: "/api/comptable/gbc/beneficial-owners", Icon: UserCheck, color: "blue", topic: t('adm.tooling.gbcm.phaseE_topic', locale) },
    { code: "Phase F", title: t('adm.tooling.gbcm.phaseF_title', locale), page: "/client/gbc-consolidation", mig: 254, route: "/api/comptable/gbc/consolidate", Icon: Layers, color: "purple", topic: t('adm.tooling.gbcm.phaseF_topic', locale) },
    { code: "Phase G", title: t('adm.tooling.gbcm.phaseG_title', locale), page: "/client/gbc-crs-fatca", mig: 255, route: "/api/comptable/gbc/crs-fatca", Icon: FileSpreadsheet, color: "indigo", topic: t('adm.tooling.gbcm.phaseG_topic', locale) },
    { code: "Phase H", title: t('adm.tooling.gbcm.phaseH_title', locale), page: "/client/gbc-pillar-two", mig: 256, route: "/api/comptable/gbc/pillar-two", Icon: Globe, color: "purple", topic: t('adm.tooling.gbcm.phaseH_topic', locale) },
    { code: "Phase I", title: t('adm.tooling.gbcm.phaseI_title', locale), page: "/client/leases", mig: 257, route: "/api/comptable/leases", Icon: FileSignature, color: "emerald", topic: t('adm.tooling.gbcm.phaseI_topic', locale) },
  ]
}

function getMcpTools(locale: Locale) {
  return [
    {
      name: "get_grand_livre",
      Icon: BookOpen,
      color: "slate",
      description: t('adm.tooling.mc.gl_desc', locale),
      inputs: ["societe_id (uuid)", "date_debut?", "date_fin?", "compte_prefix?", "limit (default 500)"],
      safety: t('adm.tooling.mc.gl_safety', locale),
    },
    {
      name: "compute_ifrs9_ecl",
      Icon: Shield,
      color: "indigo",
      description: t('adm.tooling.mc.ecl_desc', locale),
      inputs: ["societe_id (uuid)", "refresh_stages (bool, default false)"],
      safety: t('adm.tooling.mc.ecl_safety', locale),
    },
    {
      name: "lettrer_ecritures",
      Icon: ListChecks,
      color: "blue",
      description: t('adm.tooling.mc.let_desc', locale),
      inputs: ["societe_id (uuid)", "ecriture_ids (uuid[], min 2)", "lettre? (auto-générée sinon)"],
      safety: t('adm.tooling.mc.let_safety', locale),
    },
    {
      name: "list_unpaid_invoices",
      Icon: Receipt,
      color: "amber",
      description: t('adm.tooling.mc.unpaid_desc', locale),
      inputs: ["societe_id (uuid)", "type_facture ('client'|'fournisseur')", "min_age_days (default 0)"],
      safety: t('adm.tooling.mc.unpaid_safety', locale),
    },
    {
      name: "compute_balance",
      Icon: Calculator,
      color: "emerald",
      description: t('adm.tooling.mc.bal_desc', locale),
      inputs: ["societe_id (uuid)", "date_debut?", "date_fin?"],
      safety: t('adm.tooling.mc.bal_safety', locale),
    },
  ]
}

const colorMap: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
  indigo:  { bg: "bg-indigo-50",  border: "border-indigo-200",  text: "text-indigo-900",  iconBg: "bg-indigo-600 text-white" },
  amber:   { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-900",   iconBg: "bg-amber-600 text-white" },
  purple:  { bg: "bg-purple-50",  border: "border-purple-200",  text: "text-purple-900",  iconBg: "bg-purple-700 text-white" },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900", iconBg: "bg-emerald-600 text-white" },
  slate:   { bg: "bg-slate-50",   border: "border-slate-200",   text: "text-slate-900",   iconBg: "bg-slate-700 text-white" },
  blue:    { bg: "bg-blue-50",    border: "border-blue-200",    text: "text-blue-900",    iconBg: "bg-blue-600 text-white" },
}

export default function LexoraToolingPage() {
  const locale = getLocale()
  const SKILLS = getSkills(locale)
  const GBC_MODULES = getGbcModules(locale)
  const MCP_TOOLS = getMcpTools(locale)

  return (
    <div className="p-6 space-y-8 max-w-6xl">
      {/* HEADER */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-purple-700 p-3 text-white shadow-md">
            <Brain className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('adm.tooling.title', locale)}</h1>
            <p className="text-sm text-slate-600">{t('adm.tooling.subtitle', locale)}</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 max-w-3xl">
          {t('adm.tooling.intro', locale)}<code className="text-xs bg-slate-100 px-1 rounded">.claude/skills/</code>{t('adm.tooling.intro_and', locale)}
          <code className="text-xs bg-slate-100 px-1 rounded">mcp-servers/lexora-accounting/</code>.
        </p>
      </div>

      {/* SKILLS SECTION */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-indigo-600" />
          {t('adm.tooling.skills_title', locale)} <Badge variant="outline" className="ml-2">{SKILLS.length} {t('adm.tooling.skills_count_suffix', locale)}</Badge>
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          {t('adm.tooling.skills_help', locale)}
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
                    <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">{t('adm.tooling.triggers', locale)}</div>
                    <div className="flex flex-wrap gap-1">
                      {skill.triggers.map(tr => (
                        <span key={tr} className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded">{tr}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">{t('adm.tooling.lexora_ref', locale)}</div>
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
          {t('adm.tooling.mcp_title', locale)} <Badge variant="outline" className="ml-2">{MCP_TOOLS.length} {t('adm.tooling.mcp_count_suffix', locale)}</Badge>
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          {t('adm.tooling.mcp_intro_a', locale)}<code className="bg-slate-100 px-1 rounded">lexora-accounting</code>{t('adm.tooling.mcp_intro_b', locale)}
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
                    <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">{t('adm.tooling.inputs_zod', locale)}</div>
                    <div className="flex flex-wrap gap-1">
                      {tool.inputs.map(i => (
                        <code key={i} className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono">{i}</code>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">{t('adm.tooling.server_safety', locale)}</div>
                    <p className="text-[11px] text-slate-700">{tool.safety}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* GBC MODULES SECTION */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Globe className="h-5 w-5 text-purple-700" />
          {t('adm.tooling.gbc_title', locale)} <Badge variant="outline" className="ml-2">{GBC_MODULES.length} {t('adm.tooling.gbc_count_suffix', locale)}</Badge>
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          {t('adm.tooling.gbc_intro', locale)}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {GBC_MODULES.map(m => {
            const c = colorMap[m.color] || colorMap.indigo
            return (
              <div key={m.code} className={`rounded-xl border ${c.border} ${c.bg} p-4`}>
                <div className="flex items-start gap-3 mb-2">
                  <div className={`rounded-lg ${c.iconBg} p-2 shadow-sm`}>
                    <m.Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{m.code}</Badge>
                      <span className={`text-sm font-semibold ${c.text}`}>{m.title}</span>
                    </div>
                    <p className={`text-xs ${c.text} mt-1 opacity-80`}>{m.topic}</p>
                  </div>
                </div>
                <div className="space-y-1 mt-3 text-[11px]">
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500 font-medium uppercase tracking-wide text-[9px]">{t('adm.tooling.migration', locale)}</span>
                    <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono">{m.mig}</code>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500 font-medium uppercase tracking-wide text-[9px]">{t('adm.tooling.page', locale)}</span>
                    <a href={m.page} className="text-indigo-700 hover:underline font-mono">{m.page}</a>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500 font-medium uppercase tracking-wide text-[9px]">{t('adm.tooling.api', locale)}</span>
                    <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono text-[10px]">{m.route}</code>
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
          {t('adm.tooling.install_title', locale)}
        </h2>

        <Card>
          <CardContent className="p-5 space-y-4 text-sm">
            <ol className="list-decimal list-inside space-y-2 text-slate-700">
              <li>{t('adm.tooling.install_s1', locale)}
                <pre className="mt-1 bg-slate-900 text-slate-100 text-xs p-3 rounded overflow-x-auto">
{`cd mcp-servers/lexora-accounting
npm install
npm run build`}
                </pre>
              </li>
              <li>{t('adm.tooling.install_s2_a', locale)}<strong>{t('adm.tooling.install_s2_strong', locale)}</strong>{t('adm.tooling.install_s2_b', locale)}</li>
              <li>{t('adm.tooling.install_s3', locale)}
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
              <li>{t('adm.tooling.install_s4_a', locale)}<code className="bg-slate-100 px-1 rounded">🔌</code>{t('adm.tooling.install_s4_b', locale)}<code className="bg-slate-100 px-1 rounded">lexora-accounting</code>{t('adm.tooling.install_s4_c', locale)}</li>
            </ol>

            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
              <Scale className="h-4 w-4 mt-0.5" />
              <div>
                <strong>{t('adm.tooling.security_strong', locale)}</strong>{t('adm.tooling.security_text', locale)}<code>SUPABASE_ANON_KEY</code>{t('adm.tooling.security_text_end', locale)}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* FOOTER */}
      <div className="text-xs text-slate-500 border-t pt-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-3 w-3" />
          {t('adm.tooling.footer_truth', locale)}<code className="bg-slate-100 px-1 rounded">.claude/skills/</code>{t('adm.tooling.footer_and', locale)}
          <code className="bg-slate-100 px-1 rounded">mcp-servers/lexora-accounting/</code>{t('adm.tooling.footer_branch', locale)}
          <code className="bg-slate-100 px-1 rounded">claude/phase3-skills-mcp</code>.
        </div>
      </div>
    </div>
  )
}
