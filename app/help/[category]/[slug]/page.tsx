import { notFound } from "next/navigation"
import { HELP_ARTICLES, getArticle } from "@/content/help"
import { HelpArticleView } from "../../HelpClients"

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
  if (!getArticle(category, slug)) notFound()
  return <HelpArticleView categorySlug={category} slug={slug} />
}
