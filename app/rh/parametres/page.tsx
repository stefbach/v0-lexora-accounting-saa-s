"use client"
/**
 * /rh/parametres — Page de navigation centralisée vers tous les sous-modules
 * de paramétrage RH. Page créée en réponse à l'audit des 24 pages RH (Sprint 2)
 * qui avait relevé qu'aucun /rh/parametres n'existait — seuls /rh/societe et
 * /rh/paie/parametres étaient accessibles, sans hub commun.
 *
 * Sprint 5 AMÉLIO 9 — Le toggle "Pointage obligatoire" est maintenant
 * intégré INLINE sur cette page (avant : simple lien vers /rh/societe).
 * L'utilisateur peut sélectionner une société dans un dropdown puis toggle
 * sans quitter la page.
 */
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Building2, Banknote, Calendar, Clock, Shield, ArrowRight, Settings, Loader2,
} from "lucide-react"
import Link from "next/link"
import { PointageActifToggle } from "@/components/rh/PointageActifToggle"
import { t, getLocale, type Locale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Section {
  title: string
  description: string
  href: string
  icon: any
  bg: string
  border: string
  accent: string
  highlights: string[]
}

// Sprint 5 AMÉLIO 9 — on a retiré la carte "Pointage obligatoire" de la grille
// car elle est désormais rendue INLINE en fin de page (composant interactif).
function buildSections(locale: Locale): Section[] {
  return [
    {
      title: t('rha.a.param.s_societe_title', locale),
      description: t('rha.a.param.s_societe_desc', locale),
      href: "/rh/societe",
      icon: Building2,
      bg: "bg-slate-50",
      border: "border-l-slate-500",
      accent: "text-slate-700",
      highlights: ["BRN, TAN, NPF", "Adresse + GPS", "Compte bancaire principal", "Contacts multi (CEO, DRH, DAF)"],
    },
    {
      title: t('rha.a.param.s_paie_title', locale),
      description: t('rha.a.param.s_paie_desc', locale),
      href: "/rh/paie/parametres",
      icon: Banknote,
      bg: "bg-emerald-50",
      border: "border-l-emerald-500",
      accent: "text-emerald-700",
      highlights: ["CSG seuil + taux", "NSF + Training Levy", "PAYE seuils + tranches", "PRGF par jour"],
    },
    {
      title: t('rha.a.param.s_conges_title', locale),
      description: t('rha.a.param.s_conges_desc', locale),
      href: "/rh/conges/parametres",
      icon: Calendar,
      bg: "bg-blue-50",
      border: "border-l-blue-500",
      accent: "text-blue-700",
      highlights: ["22j AL, 15j SL", "98j maternité, 5j paternité", "Toggle demi-journée par type", "Imposable par société"],
    },
    {
      title: t('rha.a.param.s_planning_title', locale),
      description: t('rha.a.param.s_planning_desc', locale),
      href: "/rh/planning/regles",
      icon: Shield,
      bg: "bg-amber-50",
      border: "border-l-amber-500",
      accent: "text-amber-700",
      highlights: ["45h/semaine max", "9h/jour max (5j) ou 8h (6j)", "1 jour repos minimum", "Taux OT 1.5x / 2x"],
    },
  ]
}

interface SocieteLite {
  id: string
  nom: string
  pointage_actif?: boolean
}

export default function ParametresHubPage() {
  const locale = getLocale()
  const SECTIONS = buildSections(locale)
  const [societes, setSocietes] = useState<SocieteLite[]>([])
  const [selectedSocieteId, setSelectedSocieteId] = useState<string>("")
  const [loading, setLoading] = useState(true)

  // Charger la liste des sociétés (avec pointage_actif) pour le toggle inline
  useEffect(() => {
    setLoading(true)
    fetch("/api/rh/societe")
      .then(r => r.json())
      .then(d => {
        const list: SocieteLite[] = (d.societes || []).map((s: any) => ({
          id: s.id,
          nom: s.nom,
          pointage_actif: s.pointage_actif === true,
        }))
        setSocietes(list)
        if (list.length > 0) setSelectedSocieteId(list[0].id)
      })
      .catch(() => setSocietes([]))
      .finally(() => setLoading(false))
  }, [])

  const selectedSociete = societes.find(s => s.id === selectedSocieteId)

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: NAVY }}
        >
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>{t('rha.a.param.title', locale)}</h1>
          <p className="text-gray-500 text-sm">
            {t('rha.a.param.subtitle', locale)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTIONS.map((s) => {
          const Icon = s.icon
          return (
            <Link key={s.href + s.title} href={s.href} className="group">
              <Card className={`rounded-2xl border-l-4 ${s.border} hover:shadow-lg transition-shadow h-full`}>
                <CardHeader className="pb-2">
                  <CardTitle className={`text-base font-semibold flex items-center gap-2 ${s.accent}`}>
                    <Icon className="w-5 h-5" /> {s.title}
                    <ArrowRight
                      className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: GOLD }}
                    />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-gray-600">{s.description}</p>
                  <ul className="space-y-1">
                    {s.highlights.map((h) => (
                      <li key={h} className="text-xs text-gray-500 flex items-start gap-1.5">
                        <span className={s.accent}>•</span>
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="pt-1">
                    <Badge variant="outline" className="text-[10px]">
                      {s.href}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Sprint 5 AMÉLIO 9 — Toggle Pointage obligatoire inline.
          Avant : simple lien vers /rh/societe (carte statique).
          Maintenant : sélecteur société + toggle directement actionnable. */}
      <Card className="rounded-2xl border-l-4 border-l-orange-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-orange-700">
            <Clock className="w-5 h-5" /> {t('rha.a.param.pointage_obligatoire', locale)}
            <Badge variant="outline" className="text-[10px] ml-2">{t('rha.a.param.par_societe', locale)}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            {t('rha.a.param.pointage_desc', locale)}
          </p>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('rha.a.param.chargement_societes', locale)}
            </div>
          )}

          {!loading && societes.length === 0 && (
            <p className="text-sm text-gray-500 py-2">
              {t('rha.a.param.aucune_societe', locale)}{" "}
              <Link href="/rh/societe" className="underline font-medium">/rh/societe</Link>.
            </p>
          )}

          {!loading && societes.length > 0 && (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs text-gray-500 font-medium">{t('rha.a.common.societe', locale)}</label>
                <Select value={selectedSocieteId} onValueChange={setSelectedSocieteId}>
                  <SelectTrigger className="w-64 h-10">
                    <SelectValue placeholder={t('rha.a.param.selectionner_societe', locale)} />
                  </SelectTrigger>
                  <SelectContent>
                    {societes.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedSociete && (
                // `key` force un remount quand on change de société — le toggle
                // interne re-sync initial=pointage_actif depuis la sélection.
                <PointageActifToggle
                  key={selectedSociete.id}
                  societeId={selectedSociete.id}
                  initial={selectedSociete.pointage_actif === true}
                  withCard={false}
                  onSaved={(v) => {
                    setSocietes(prev =>
                      prev.map(s => (s.id === selectedSociete.id ? { ...s, pointage_actif: v } : s)),
                    )
                  }}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
        <p className="font-medium mb-1">{t('rha.a.param.a_noter', locale)}</p>
        <ul className="space-y-1 text-blue-800">
          <li>• {t('rha.a.param.note_1', locale)}</li>
          <li>• {t('rha.a.param.note_2', locale)}</li>
          <li>• {t('rha.a.param.note_3', locale)}</li>
        </ul>
      </div>
    </div>
  )
}
