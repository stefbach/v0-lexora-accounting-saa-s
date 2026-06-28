import { notFound } from "next/navigation"
import { HELP_CATEGORIES, getCategory } from "@/content/help"
import { HelpCategoryView } from "../HelpClients"

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
  if (!getCategory(category)) notFound()
  return <HelpCategoryView categorySlug={category} />
}
