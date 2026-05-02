import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { HELP_CATEGORIES, getCategory, getArticlesByCategory } from "@/content/help"

const FONT = "'Poppins', sans-serif"

export function generateStaticParams() {
  return HELP_CATEGORIES.map((c) => ({ category: c.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params
  const cat = getCategory(category)
  if (!cat) return { title: "Centre d'aide — Lexora" }
  return { title: `${cat.title} — Aide Lexora`, description: cat.description }
}

export default async function HelpCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params
  const cat = getCategory(category)
  if (!cat) notFound()
  const articles = getArticlesByCategory(category)
  return (
    <div style={{ background: "#F8F9FC", minHeight: "100vh", fontFamily: FONT }}>
      <header style={{ background: "#0B0F2E", padding: "32px 24px", color: "#E8EAFC" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: "#A8AFC7", display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <Link href="/help" style={{ color: "#A8AFC7", textDecoration: "none" }}>Centre d&apos;aide</Link>
            <ChevronRight size={14} aria-hidden />
            <span style={{ color: "#E8EAFC" }}>{cat!.title}</span>
          </nav>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>{cat!.title}</h1>
          <p style={{ color: "#A8AFC7", marginTop: 8, fontSize: 15 }}>{cat!.description}</p>
        </div>
      </header>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        {articles.length === 0 ? (
          <p style={{ color: "#475569" }}>Aucun article pour cette catégorie pour le moment.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
            {articles.map((art) => (
              <li key={art.slug}>
                <Link href={`/help/${cat!.slug}/${art.slug}`} style={{ display: "block", padding: 20, background: "#FFFFFF", border: "1px solid #E2E5F0", borderRadius: 12, textDecoration: "none", color: "#0B0F2E" }}>
                  <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{art.title}</div>
                  <p style={{ margin: "0 0 8px", color: "#475569", fontSize: 14, lineHeight: 1.5 }}>{art.excerpt}</p>
                  <span style={{ fontSize: 12, color: "#475569" }}>{art.readingTime} de lecture</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
