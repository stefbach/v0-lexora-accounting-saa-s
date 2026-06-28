"use client"

/**
 * Vues clientes bilingues du Centre d'aide.
 * Le serveur (page.tsx) garde SSG + metadata ; ici on lit la locale côté client
 * (getLocale, localStorage) et on rend FR/EN. Pattern mount-après-hydratation
 * pour éviter tout mismatch d'hydratation (défaut 'fr', puis getLocale au mount).
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Rocket, BookOpen, Receipt, Users, Landmark, Lock, ChevronRight, HelpCircle,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { getLocale } from "@/lib/i18n"
import {
  HELP_CATEGORIES, HELP_ARTICLES, getCategory, getArticlesByCategory, getArticle,
  catTitle, catDesc, artTitle, artExcerpt, artComponent,
  type HelpCategory, type HelpArticle, type Locale,
} from "@/content/help"

const FONT = "'Poppins', sans-serif"
const ICONS: Record<string, LucideIcon> = { Rocket, BookOpen, Receipt, Users, Landmark, Lock }

function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>("fr")
  useEffect(() => { setLocale(getLocale() === "en" ? "en" : "fr") }, [])
  return locale
}

const TXT = {
  back: { fr: "Retour", en: "Back" },
  center: { fr: "Centre d'aide", en: "Help Center" },
  home_sub: {
    fr: "Trouvez rapidement la documentation pour configurer votre comptabilité, préparer vos déclarations TVA, gérer la paie et clôturer vos exercices.",
    en: "Quickly find the documentation to set up your accounting, prepare your VAT returns, manage payroll and close your financial years.",
  },
  popular: { fr: "Articles populaires", en: "Popular articles" },
  reading: { fr: "de lecture", en: "read" },
  empty_cat: { fr: "Aucun article pour cette catégorie pour le moment.", en: "No articles in this category yet." },
  related: { fr: "Articles liés", en: "Related articles" },
  category_word: { fr: "Catégorie", en: "Category" },
  help_crumb: { fr: "Aide", en: "Help" },
} as const

const tr = (k: keyof typeof TXT, l: Locale) => TXT[k][l]

// ---------------------------------------------------------------------------
export function HelpHome() {
  const locale = useLocale()
  return (
    <div style={{ background: "#F8F9FC", minHeight: "100vh", fontFamily: FONT }}>
      <header style={{ background: "#0B0F2E", padding: "48px 24px", color: "#E8EAFC" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Link href="/" style={{ color: "#A8AFC7", fontSize: 13, textDecoration: "none" }}>&larr; {tr("back", locale)}</Link>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
            <HelpCircle size={28} aria-hidden />
            <h1 style={{ fontSize: 36, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>{tr("center", locale)}</h1>
          </div>
          <p style={{ color: "#A8AFC7", marginTop: 12, fontSize: 16, maxWidth: 720 }}>{tr("home_sub", locale)}</p>
        </div>
      </header>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {HELP_CATEGORIES.map((cat) => <CategoryCard key={cat.slug} cat={cat} locale={locale} />)}
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginTop: 48, marginBottom: 16, color: "#0B0F2E" }}>{tr("popular", locale)}</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {HELP_ARTICLES.slice(0, 6).map((art) => (
            <li key={`${art.category}/${art.slug}`}>
              <Link href={`/help/${art.category}/${art.slug}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "#FFFFFF", border: "1px solid #E2E5F0", borderRadius: 10, textDecoration: "none", color: "#0B0F2E" }}>
                <span><strong>{artTitle(art, locale)}</strong><span style={{ color: "#475569", fontSize: 13, marginLeft: 8 }}>· {art.readingTime}</span></span>
                <ChevronRight size={18} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}

function CategoryCard({ cat, locale }: { cat: HelpCategory; locale: Locale }) {
  const Icon = ICONS[cat.icon] ?? HelpCircle
  const count = HELP_ARTICLES.filter((a) => a.category === cat.slug).length
  return (
    <Link href={`/help/${cat.slug}`} style={{ display: "block", padding: 20, background: "#FFFFFF", border: "1px solid #E2E5F0", borderRadius: 12, textDecoration: "none", color: "#0B0F2E" }}>
      <span aria-hidden style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 10, background: "#EEF4FF", color: "#4191FF", marginBottom: 12 }}>
        <Icon size={20} aria-hidden />
      </span>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{catTitle(cat, locale)}</div>
      <p style={{ margin: "6px 0 12px", color: "#475569", fontSize: 14, lineHeight: 1.5 }}>{catDesc(cat, locale)}</p>
      <span style={{ fontSize: 12, color: "#4191FF", fontWeight: 600 }}>{count} article{count > 1 ? "s" : ""} →</span>
    </Link>
  )
}

// ---------------------------------------------------------------------------
export function HelpCategoryView({ categorySlug }: { categorySlug: string }) {
  const locale = useLocale()
  const cat = getCategory(categorySlug)
  if (!cat) return null
  const articles = getArticlesByCategory(categorySlug)
  return (
    <div style={{ background: "#F8F9FC", minHeight: "100vh", fontFamily: FONT }}>
      <header style={{ background: "#0B0F2E", padding: "32px 24px", color: "#E8EAFC" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: "#A8AFC7", display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <Link href="/help" style={{ color: "#A8AFC7", textDecoration: "none" }}>{tr("center", locale)}</Link>
            <ChevronRight size={14} aria-hidden />
            <span style={{ color: "#E8EAFC" }}>{catTitle(cat, locale)}</span>
          </nav>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>{catTitle(cat, locale)}</h1>
          <p style={{ color: "#A8AFC7", marginTop: 8, fontSize: 15 }}>{catDesc(cat, locale)}</p>
        </div>
      </header>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        {articles.length === 0 ? (
          <p style={{ color: "#475569" }}>{tr("empty_cat", locale)}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
            {articles.map((art) => (
              <li key={art.slug}>
                <Link href={`/help/${cat.slug}/${art.slug}`} style={{ display: "block", padding: 20, background: "#FFFFFF", border: "1px solid #E2E5F0", borderRadius: 12, textDecoration: "none", color: "#0B0F2E" }}>
                  <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{artTitle(art, locale)}</div>
                  <p style={{ margin: "0 0 8px", color: "#475569", fontSize: 14, lineHeight: 1.5 }}>{artExcerpt(art, locale)}</p>
                  <span style={{ fontSize: 12, color: "#475569" }}>{art.readingTime} {tr("reading", locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
export function HelpArticleView({ categorySlug, slug }: { categorySlug: string; slug: string }) {
  const locale = useLocale()
  const cat = getCategory(categorySlug)
  const article = getArticle(categorySlug, slug)
  if (!cat || !article) return null
  const Article = artComponent(article, locale)
  const related = getArticlesByCategory(categorySlug).filter((a) => a.slug !== slug)
  return (
    <div style={{ background: "#F8F9FC", minHeight: "100vh", fontFamily: FONT }}>
      <header style={{ background: "#0B0F2E", padding: "28px 24px", color: "#E8EAFC" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: "#A8AFC7", display: "flex", alignItems: "center", gap: 6 }}>
            <Link href="/help" style={{ color: "#A8AFC7", textDecoration: "none" }}>{tr("help_crumb", locale)}</Link>
            <ChevronRight size={14} aria-hidden />
            <Link href={`/help/${cat.slug}`} style={{ color: "#A8AFC7", textDecoration: "none" }}>{catTitle(cat, locale)}</Link>
            <ChevronRight size={14} aria-hidden />
            <span style={{ color: "#E8EAFC" }}>{artTitle(article, locale)}</span>
          </nav>
        </div>
      </header>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        <article style={{ background: "#FFFFFF", border: "1px solid #E2E5F0", borderRadius: 16, padding: "40px 48px" }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, margin: 0, letterSpacing: "-0.02em", color: "#0B0F2E" }}>{artTitle(article, locale)}</h1>
          <p style={{ color: "#475569", margin: "8px 0 24px", fontSize: 14 }}>{article.readingTime} {tr("reading", locale)} · {tr("category_word", locale)} {catTitle(cat, locale)}</p>
          <Article />
        </article>
        {related.length > 0 ? (
          <section style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0B0F2E", marginBottom: 12 }}>{tr("related", locale)}</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {related.map((a) => (
                <li key={a.slug}>
                  <Link href={`/help/${a.category}/${a.slug}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#FFFFFF", border: "1px solid #E2E5F0", borderRadius: 10, textDecoration: "none", color: "#0B0F2E" }}>
                    <span>{artTitle(a, locale)}</span>
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  )
}
