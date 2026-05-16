"use client"
import { ExternalLink, AlertTriangle, Lightbulb, BookOpen, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { HelpEntry } from "@/lib/help/content"
import type { Locale } from "@/lib/i18n"

const LABELS = {
  fr: {
    aide: "Aide",
    modeComptable: "Mode comptable",
    modeClient: "Mode client",
    aQuoiSert: "À quoi sert cette page",
    commentFaire: "Comment faire",
    piegesAEviter: "Pièges à éviter",
    liensUtiles: "Liens utiles",
    astuces: "Astuces",
    docComplete: "Documentation complète",
    voirVideo: "Voir la vidéo tutoriel",
    fermer: "Fermer",
    besoin: "Besoin d'autre chose ? Demande au bot Telegram Lexora, il connaît toutes les fonctionnalités et peut t'accompagner étape par étape.",
  },
  en: {
    aide: "Help",
    modeComptable: "Accountant mode",
    modeClient: "Client mode",
    aQuoiSert: "What this page is for",
    commentFaire: "How to do it",
    piegesAEviter: "Pitfalls to avoid",
    liensUtiles: "Useful links",
    astuces: "Tips",
    docComplete: "Full documentation",
    voirVideo: "Watch the video tutorial",
    fermer: "Close",
    besoin: "Need more help? Ask the Lexora Telegram bot — it knows every feature and can walk you through it step by step.",
  },
} as const

/**
 * Drawer de contenu d'aide. Utilisé par <PageHelp /> et <FloatingPageHelp />.
 * Design sobre : palette grays + accent emerald, espacements généreux, aucun
 * émoji. Bilingue FR/EN via prop `locale`.
 */
export function PageHelpDrawer({
  entry,
  onClose,
  locale = 'fr',
}: {
  entry: HelpEntry
  onClose: () => void
  locale?: Locale
}) {
  const L = LABELS[locale] ?? LABELS.fr
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-1">
              {L.aide}
            </div>
            <h2 className="text-lg font-semibold text-slate-900 leading-tight">
              {entry.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors p-1 -m-1"
            aria-label={L.fermer}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {entry.audience !== 'all' && (
          <Badge
            variant="outline"
            className="mt-3 bg-slate-50 text-slate-700 border-slate-200 text-[10px] font-normal uppercase tracking-wider"
          >
            {entry.audience === 'comptable' ? L.modeComptable : L.modeClient}
          </Badge>
        )}
      </div>

      <div className="flex-1 px-6 py-5 space-y-7">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{L.aQuoiSert}</h3>
          <p className="text-sm text-slate-700 leading-relaxed">{entry.intro}</p>
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">{L.commentFaire}</h3>
          <ol className="space-y-4">
            {entry.steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-medium flex items-center justify-center">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <h4 className="text-sm font-medium text-slate-900 mb-1">{step.title}</h4>
                  <p className="text-sm text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: step.body }} />
                  {step.warning && (
                    <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-700 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-900 leading-relaxed">{step.warning}</p>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {entry.pitfalls && entry.pitfalls.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">{L.piegesAEviter}</h3>
            <ul className="space-y-2">
              {entry.pitfalls.map((p, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700 leading-relaxed">
                  <span className="text-slate-400 flex-shrink-0 mt-1">•</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {entry.externalLinks && entry.externalLinks.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">{L.liensUtiles}</h3>
            <div className="space-y-2">
              {entry.externalLinks.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start justify-between gap-3 px-3.5 py-2.5 border border-slate-200 rounded-md hover:border-slate-300 hover:bg-slate-50 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900">{link.label}</div>
                    {link.description && (
                      <div className="text-xs text-slate-500 mt-0.5 leading-snug">{link.description}</div>
                    )}
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 flex-shrink-0 mt-0.5" />
                </a>
              ))}
            </div>
          </section>
        )}

        {entry.tips && entry.tips.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5" /> {L.astuces}
            </h3>
            <ul className="space-y-2">
              {entry.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700 leading-relaxed">
                  <span className="text-slate-400 flex-shrink-0 mt-1">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(entry.docUrl || entry.videoUrl) && (
          <section className="pt-3 border-t border-slate-100">
            <div className="flex flex-col gap-2">
              {entry.docUrl && (
                <a href={entry.docUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-slate-700 hover:text-slate-900">
                  <BookOpen className="h-4 w-4" /> {L.docComplete}
                </a>
              )}
              {entry.videoUrl && (
                <a href={entry.videoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-slate-700 hover:text-slate-900">
                  <BookOpen className="h-4 w-4" /> {L.voirVideo}
                </a>
              )}
            </div>
          </section>
        )}
      </div>

      <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/50">
        <p className="text-xs text-slate-500 leading-relaxed">{L.besoin}</p>
      </div>
    </div>
  )
}
