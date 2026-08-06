'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Chrome,
  Download,
  Laptop,
  Layers,
  MoreVertical,
  Plus,
  Share,
  ShieldCheck,
  Smartphone,
  Tablet,
  Zap,
} from 'lucide-react'
import { LexoraLogo } from '@/components/LexoraLogo'
import { Button } from '@/components/ui/button'
import InstallQr from '@/components/pwa/install-qr'
import { useInstallPrompt, type InstallPlatform } from '@/components/pwa/use-install-prompt'
import { t, getLocale, type Locale } from '@/lib/i18n'
import { BRAND } from '@/lib/theme/brand'

type TabId = 'ios' | 'android' | 'desktop'

/**
 * Élément d'interface que l'étape demande de toucher. La pastille le reproduit
 * visuellement : dire « touchez Partager » sert nettement moins que montrer
 * l'icône que l'utilisateur doit chercher des yeux.
 */
type Glyph = 'share' | 'menu' | 'plus' | 'install'

interface Step {
  fr: string
  en: string
  glyph?: Glyph
}

interface Guide {
  id: TabId
  labelFr: string
  labelEn: string
  icon: typeof Smartphone
  deviceFr: string
  deviceEn: string
  browserFr: string
  browserEn: string
  steps: Step[]
  noteFr?: string
  noteEn?: string
}

const GUIDES: Guide[] = [
  {
    id: 'ios',
    labelFr: 'iPhone / iPad',
    labelEn: 'iPhone / iPad',
    icon: Smartphone,
    deviceFr: 'iPhone et iPad',
    deviceEn: 'iPhone and iPad',
    browserFr: 'Safari',
    browserEn: 'Safari',
    steps: [
      {
        fr: "Ouvrez Lexora dans Safari. Sur iPhone et iPad, seul Safari sait installer une application — Chrome ou Firefox ne proposeront pas l'option.",
        en: 'Open Lexora in Safari. On iPhone and iPad, only Safari can install an app — Chrome and Firefox will not offer the option.',
      },
      {
        fr: 'Ouvrez la page de votre espace (comptable, RH, salarié…) avant d’installer : le navigateur retient le manifeste de la page affichée, et c’est lui qui donne à l’application son nom et ses raccourcis.',
        en: 'Open your own space (accounting, HR, employee…) before installing: the browser keeps the manifest of the page on screen, and that is what gives the app its name and shortcuts.',
      },
      {
        fr: "Touchez le bouton Partager, le carré avec une flèche vers le haut, en bas de l'écran sur iPhone, en haut à droite sur iPad.",
        en: 'Tap the Share button — the square with an upward arrow — at the bottom of the screen on iPhone, top right on iPad.',
        glyph: 'share',
      },
      {
        fr: 'Faites défiler la liste et choisissez « Sur l’écran d’accueil ».',
        en: 'Scroll down the list and choose “Add to Home Screen”.',
        glyph: 'plus',
      },
      {
        fr: "Touchez « Ajouter » en haut à droite. L'icône Lexora apparaît aussitôt sur votre écran d'accueil.",
        en: 'Tap “Add” at the top right. The Lexora icon appears on your home screen straight away.',
      },
    ],
    noteFr:
      "Si « Sur l'écran d'accueil » n'apparaît pas, faites glisser la rangée d'actions vers le haut : l'entrée se trouve plus bas dans la liste.",
    noteEn: 'If “Add to Home Screen” is missing, swipe the action list upwards — the entry sits further down.',
  },
  {
    id: 'android',
    labelFr: 'Android',
    labelEn: 'Android',
    icon: Tablet,
    deviceFr: 'téléphones et tablettes Android',
    deviceEn: 'Android phones and tablets',
    browserFr: 'Chrome, Edge, Opera',
    browserEn: 'Chrome, Edge, Opera',
    steps: [
      {
        fr: "Ouvrez Lexora dans Chrome. C'est le point important : Samsung Internet propose bien l'installation, mais Android la refuse ensuite (voir plus bas).",
        en: 'Open Lexora in Chrome. This matters: Samsung Internet does offer to install, but Android then refuses the package (see below).',
      },
      {
        fr: 'Allez sur la page de l’espace que vous utilisez — comptable, RH, salarié… — avant d’installer : c’est elle qui donne son nom et ses raccourcis à l’application.',
        en: 'Open the space you actually use — accounting, HR, employee… — before installing: that page is what gives the app its name and shortcuts.',
      },
      {
        fr: "Une invitation « Installer l'application » peut apparaître directement en bas de l'écran. Si c'est le cas, touchez-la : c'est terminé.",
        en: 'An “Install app” prompt may appear at the bottom of the screen. If it does, tap it — you’re done.',
        glyph: 'install',
      },
      {
        fr: 'Sinon, touchez le menu à trois points en haut à droite de Chrome.',
        en: 'Otherwise, tap the three-dot menu at the top right of Chrome.',
        glyph: 'menu',
      },
      {
        fr: "Choisissez « Installer l'application », puis confirmez.",
        en: 'Choose “Install app”, then confirm.',
      },
    ],
    noteFr:
      "Sur Samsung Internet, l'installation se termine par « Appli non sécurisée bloquée » puis « Impossible d'installer l'application Web » : ce navigateur fabrique lui-même un paquet visant une version d'Android trop ancienne, que le système rejette. Passez par Chrome, ou restez sur Samsung Internet avec « Ajouter la page à » → « Écran d'accueil », qui pose un simple raccourci.",
    noteEn:
      'On Samsung Internet the install ends with “Unsafe app blocked”, then “Couldn’t install web app”: that browser builds its own package targeting an Android version the system no longer accepts. Use Chrome instead, or stay in Samsung Internet with “Add page to” → “Home screen”, which drops a plain shortcut.',
  },
  {
    id: 'desktop',
    labelFr: 'Ordinateur',
    labelEn: 'Desktop',
    icon: Laptop,
    deviceFr: 'Windows, macOS et Linux',
    deviceEn: 'Windows, macOS and Linux',
    browserFr: 'Chrome, Edge, Brave, Opera',
    browserEn: 'Chrome, Edge, Brave, Opera',
    steps: [
      {
        fr: 'Ouvrez Lexora dans Chrome, Edge, Brave ou Opera. Safari et Firefox de bureau n’installent pas les applications web.',
        en: 'Open Lexora in Chrome, Edge, Brave or Opera. Desktop Safari and Firefox do not install web apps.',
      },
      {
        fr: "Cliquez sur l'icône d'installation à droite de la barre d'adresse — un écran avec une flèche vers le bas.",
        en: 'Click the install icon at the right of the address bar — a screen with a downward arrow.',
        glyph: 'install',
      },
      {
        fr: 'Cliquez sur « Installer ». Lexora s’ouvre dans sa propre fenêtre, sans onglets ni barre d’adresse.',
        en: 'Click “Install”. Lexora opens in its own window, with no tabs and no address bar.',
      },
      {
        fr: 'L’application se retrouve ensuite dans le menu Démarrer (Windows), le Launchpad (macOS) ou le lanceur de votre bureau.',
        en: 'The app then sits in the Start menu (Windows), Launchpad (macOS) or your desktop launcher.',
      },
    ],
    noteFr:
      "Si l'icône n'apparaît pas dans la barre d'adresse, ouvrez le menu ⋮ du navigateur : l'entrée « Installer Lexora… » s'y trouve également.",
    noteEn:
      'If the icon is missing from the address bar, open the browser’s ⋮ menu — the “Install Lexora…” entry is there too.',
  },
]

const GLYPHS: Record<Glyph, typeof Share> = {
  share: Share,
  menu: MoreVertical,
  plus: Plus,
  install: Download,
}

const PERKS = [
  { icon: Zap, titleKey: 'pwa.perk.speed.title', bodyKey: 'pwa.perk.speed.body' },
  { icon: ShieldCheck, titleKey: 'pwa.perk.privacy.title', bodyKey: 'pwa.perk.privacy.body' },
  { icon: Chrome, titleKey: 'pwa.perk.updates.title', bodyKey: 'pwa.perk.updates.body' },
]

/** L'onglet ouvert par défaut suit l'appareil détecté. */
const DEFAULT_TAB: Record<InstallPlatform, TabId> = {
  ios: 'ios',
  android: 'android',
  desktop: 'desktop',
  unknown: 'ios',
}

export default function InstallerPage() {
  const [locale, setLocale] = useState<Locale>('fr')
  const { installed, canPrompt, platform, browser, blocked, openInChrome, promptInstall } =
    useInstallPrompt()
  // `null` tant que l'utilisateur n'a pas choisi : l'onglet suit alors la
  // détection. Dès qu'il clique, son choix prime et ne bouge plus.
  const [tab, setTab] = useState<TabId | null>(null)

  useEffect(() => {
    setLocale(getLocale())
  }, [])

  const fr = locale === 'fr'
  const active = tab ?? DEFAULT_TAB[platform]
  const guide = GUIDES.find((g) => g.id === active) ?? GUIDES[0]

  return (
    <div style={{ background: BRAND.canvas, color: BRAND.ink }} className="min-h-screen">
      <header className="border-b" style={{ borderColor: BRAND.border }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <LexoraLogo href="/" size="md" tone="light" />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium"
            style={{ color: BRAND.inkMuted }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {fr ? 'Retour au site' : 'Back to the site'}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-24 pt-12 md:pt-16">
        {/* ── En-tête ─────────────────────────────────────────────── */}
        <section className="max-w-2xl">
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: BRAND.goldText }}
          >
            {t('pwa.page.eyebrow', locale)}
          </span>
          <h1 className="mt-3 text-[28px] font-bold leading-tight md:text-[36px]">
            {t('pwa.page.title', locale)}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: BRAND.inkBody }}>
            {t('pwa.page.subtitle', locale)}
          </p>

          {installed ? (
            <div
              className="mt-7 inline-flex items-center gap-2.5 rounded-xl px-4 py-3 text-[13.5px] font-medium"
              style={{ background: BRAND.greenSoft, color: BRAND.green }}
            >
              <CheckCircle2 className="h-4 w-4" />
              {t('pwa.page.installed', locale)}
            </div>
          ) : (
            canPrompt && (
              <Button size="lg" className="mt-7" onClick={() => promptInstall()}>
                <Download className="h-4 w-4" />
                {t('pwa.install_now', locale)}
              </Button>
            )
          )}
        </section>

        {/* ── Navigateur Android dont l'installation est refusée ──── */}
        {!installed && blocked && (
          <section
            className="mt-10 rounded-2xl border p-6 md:p-8"
            style={{ borderColor: BRAND.goldText, background: BRAND.goldSoft }}
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: BRAND.surface, color: BRAND.goldText }}
            >
              <AlertTriangle className="h-4 w-4" />
            </span>
            <h2 className="mt-3.5 text-[17px] font-bold md:text-[19px]">
              {t('pwa.blocked.title', locale)}
            </h2>
            <p className="mt-2.5 max-w-3xl text-[13.5px] leading-relaxed" style={{ color: BRAND.inkBody }}>
              {t(browser === 'in-app' ? 'pwa.chrome.inapp_subtitle' : 'pwa.blocked.body', locale)}
            </p>
            <p className="mt-3 max-w-3xl text-[13.5px] font-medium leading-relaxed">
              {t('pwa.blocked.fix', locale)}
            </p>

            {openInChrome && (
              <Button asChild size="lg" className="mt-5">
                {/* `intent://` quitte le site : lien natif, pas de routeur Next. */}
                <a href={openInChrome}>
                  <Chrome className="h-4 w-4" />
                  {t('pwa.chrome.open', locale)}
                </a>
              </Button>
            )}

            {browser === 'samsung' && (
              <p className="mt-5 max-w-3xl text-[13px] leading-relaxed" style={{ color: BRAND.inkMuted }}>
                {t('pwa.blocked.fallback', locale)}
              </p>
            )}
          </section>
        )}

        {/* ── Ce que l'installation apporte ───────────────────────── */}
        <section className="mt-14 grid gap-4 sm:grid-cols-3">
          {PERKS.map((perk) => (
            <div
              key={perk.titleKey}
              className="rounded-2xl border p-5"
              style={{ borderColor: BRAND.border, background: BRAND.surfaceAlt }}
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ background: BRAND.blueSoft, color: BRAND.blue }}
              >
                <perk.icon className="h-4 w-4" />
              </span>
              <h3 className="mt-3.5 text-[14.5px] font-semibold">{t(perk.titleKey, locale)}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: BRAND.inkBody }}>
                {t(perk.bodyKey, locale)}
              </p>
            </div>
          ))}
        </section>

        {/* ── Marche à suivre, par appareil ───────────────────────── */}
        <section className="mt-16">
          <h2 className="text-[20px] font-bold md:text-[24px]">{t('pwa.page.steps_for', locale)}</h2>

          <div role="tablist" aria-label={t('pwa.page.steps_for', locale)} className="mt-5 flex flex-wrap gap-2">
            {GUIDES.map((g) => {
              const selected = g.id === active
              return (
                <button
                  key={g.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`guide-${g.id}`}
                  id={`tab-${g.id}`}
                  onClick={() => setTab(g.id)}
                  className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors"
                  style={{
                    borderColor: selected ? BRAND.blue : BRAND.border,
                    background: selected ? BRAND.blueSoft : BRAND.surface,
                    color: selected ? BRAND.blue : BRAND.inkMuted,
                  }}
                >
                  <g.icon className="h-4 w-4" />
                  {fr ? g.labelFr : g.labelEn}
                </button>
              )
            })}
          </div>

          <div
            role="tabpanel"
            id={`guide-${guide.id}`}
            aria-labelledby={`tab-${guide.id}`}
            className="mt-6 rounded-2xl border p-6 md:p-8"
            style={{ borderColor: BRAND.border, background: BRAND.surface }}
          >
            <dl className="flex flex-wrap gap-x-10 gap-y-3 border-b pb-5" style={{ borderColor: BRAND.border }}>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: BRAND.inkMuted }}>
                  {t('pwa.page.device', locale)}
                </dt>
                <dd className="mt-1 text-[13.5px] font-medium">{fr ? guide.deviceFr : guide.deviceEn}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: BRAND.inkMuted }}>
                  {t('pwa.page.browser', locale)}
                </dt>
                <dd className="mt-1 text-[13.5px] font-medium">{fr ? guide.browserFr : guide.browserEn}</dd>
              </div>
            </dl>

            <ol className="mt-6 space-y-5">
              {guide.steps.map((step, i) => {
                const Glyph = step.glyph ? GLYPHS[step.glyph] : null
                return (
                  <li key={i} className="flex gap-4">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
                      style={{ background: BRAND.blueSoft, color: BRAND.blue }}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1 pt-1">
                      <p className="text-[14px] leading-relaxed" style={{ color: BRAND.inkBody }}>
                        {fr ? step.fr : step.en}
                      </p>
                      {Glyph && (
                        <span
                          className="mt-2.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border"
                          style={{ borderColor: BRAND.borderStrong, color: BRAND.ink }}
                          aria-hidden="true"
                        >
                          <Glyph className="h-4 w-4" />
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>

            {(guide.noteFr || guide.noteEn) && (
              <p
                className="mt-7 flex items-start gap-2.5 rounded-xl p-4 text-[13px] leading-relaxed"
                style={{ background: BRAND.goldSoft, color: BRAND.ink }}
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: BRAND.goldText }} />
                {fr ? guide.noteFr : guide.noteEn}
              </p>
            )}
          </div>
        </section>

        {/* ── Passerelle ordinateur → téléphone ───────────────────── */}
        <section className="mt-10">
          <InstallQr />
        </section>

        {/* ── Une application par espace ──────────────────────────── */}
        <section
          className="mt-10 rounded-2xl border p-6 md:p-8"
          style={{ borderColor: BRAND.border, background: BRAND.surfaceAlt }}
        >
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: BRAND.goldSoft, color: BRAND.goldText }}
          >
            <Layers className="h-4 w-4" />
          </span>
          <h2 className="mt-3.5 text-[17px] font-bold md:text-[19px]">
            {t('pwa.page.spaces_title', locale)}
          </h2>
          <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed" style={{ color: BRAND.inkBody }}>
            {t('pwa.page.spaces_body', locale)}
          </p>
        </section>
      </main>
    </div>
  )
}
