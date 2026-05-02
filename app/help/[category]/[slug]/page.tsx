import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { HELP_ARTICLES, getArticle, getCategory, getArticlesByCategory } from "@/content/help"

const FONT = "'Poppins', sans-serif"

export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ category: a.category, slug: a.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ category: string; slug: string }> }) {
  const { category, slug } = await params
  const art = getArticle(category, slug)
  if (!art) return { title: "Article — Aide Lexora" }
  return { title: `${art.title} — Aide Lexora`, description: art.excerpt }
}

export default async function HelpArticlePage({ params }: { params: Promise<{ category: string; slug: string }> }) {
  const { category, slug } = await params
  const cat = getCategory(category)
  const article = getArticle(category, slug)
  if (!cat || !article) notFound()
  const Article = article!.Component
  const related = getArticlesByCategory(category).filter((a) => a.slug !== slug)
  return (
    <div style={{ background: "#F8F9FC", minHeight: "100vh", fontFamily: FONT }}>
      <header style={{ background: "#0B0F2E", padding: "28px 24px", color: "#E8EAFC" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: "#A8AFC7", display: "flex", alignItems: "center", gap: 6 }}>
            <Link href="/help" style={{ color: "#A8AFC7", textDecoration: "none" }}>Aide</Link>
            <ChevronRight size={14} aria-hidden />
            <Link href={`/help/${cat!.slug}`} style={{ color: "#A8AFC7", textDecoration: "none" }}>{cat!.title}</Link>
            <ChevronRight size={14} aria-hidden />
            <span style={{ color: "#E8EAFC" }}>{article!.title}</span>
          </nav>
        </div>
      </header>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        <article style={{ background: "#FFFFFF", border: "1px solid #E2E5F0", borderRadius: 16, padding: "40px 48px" }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, margin: 0, letterSpacing: "-0.02em", color: "#0B0F2E" }}>{article!.title}</h1>
          <p style={{ color: "#475569", margin: "8px 0 24px", fontSize: 14 }}>{article!.readingTime} de lecture · Catégorie {cat!.title}</p>
          <Article />
        </article>
        {related.length > 0 ? (
          <section style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0B0F2E", marginBottom: 12 }}>Articles liés</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {related.map((a) => (
                <li key={a.slug}>
                  <Link href={`/help/${a.category}/${a.slug}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#FFFFFF", border: "1px solid #E2E5F0", borderRadius: 10, textDecoration: "none", color: "#0B0F2E" }}>
                    <span>{a.title}</span>
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
