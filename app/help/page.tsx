import Link from "next/link"
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  type HelpCategory,
} from "@/content/help"
import {
  Rocket,
  BookOpen,
  Receipt,
  Users,
  Landmark,
  Lock,
  ChevronRight,
  HelpCircle,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

const FONT = "'Poppins', sans-serif"

const ICONS: Record<string, LucideIcon> = {
  Rocket,
  BookOpen,
  Receipt,
  Users,
  Landmark,
  Lock,
}

export const metadata = {
  title: "Centre d'aide — Lexora",
  description: "Articles, guides et tutoriels pour utiliser Lexora au quotidien.",
}

export default function HelpHomePage() {
  return (
    <div style={{ background: "#F8F9FC", minHeight: "100vh", fontFamily: FONT }}>
      <header style={{ background: "#0B0F2E", padding: "48px 24px", color: "#E8EAFC" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Link href="/" style={{ color: "#A8AFC7", fontSize: 13, textDecoration: "none" }}>
            ← Retour à l&apos;accueil
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
            <HelpCircle size={28} aria-hidden />
            <h1 style={{ fontSize: 36, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
              Centre d&apos;aide
            </h1>
          </div>
          <p style={{ color: "#A8AFC7", marginTop: 12, fontSize: 16, maxWidth: 720 }}>
            Trouvez rapidement la documentation pour configurer votre comptabilité,
            préparer vos déclarations TVA, gérer la paie et clôturer vos exercices.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {HELP_CATEGORIES.map((cat) => (
            <CategoryCard key={cat.slug} cat={cat} />
          ))}
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, marginTop: 48, marginBottom: 16, color: "#0B0F2E" }}>
          Articles populaires
        </h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {HELP_ARTICLES.slice(0, 6).map((art) => (
            <li key={`${art.category}/${art.slug}`}>
              <Link
                href={`/help/${art.category}/${art.slug}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 18px",
                  background: "#FFFFFF",
                  border: "1px solid #E2E5F0",
                  borderRadius: 10,
                  textDecoration: "none",
                  color: "#0B0F2E",
                }}
              >
                <span>
                  <strong>{art.title}</strong>
                  <span style={{ color: "#475569", fontSize: 13, marginLeft: 8 }}>
                    · {art.readingTime}
                  </span>
                </span>
                <ChevronRight size={18} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}

function CategoryCard({ cat }: { cat: HelpCategory }) {
  const Icon = ICONS[cat.icon] ?? HelpCircle
  const count = HELP_ARTICLES.filter((a) => a.category === cat.slug).length
  return (
    <Link
      href={`/help/${cat.slug}`}
      style={{
        display: "block",
        padding: 20,
        background: "#FFFFFF",
        border: "1px solid #E2E5F0",
        borderRadius: 12,
        textDecoration: "none",
        color: "#0B0F2E",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: 10,
          background: "#EEF4FF",
          color: "#4191FF",
          marginBottom: 12,
        }}
      >
        <Icon size={20} aria-hidden />
      </span>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{cat.title}</div>
      <p style={{ margin: "6px 0 12px", color: "#475569", fontSize: 14, lineHeight: 1.5 }}>
        {cat.description}
      </p>
      <span style={{ fontSize: 12, color: "#4191FF", fontWeight: 600 }}>
        {count} article{count > 1 ? "s" : ""} →
      </span>
    </Link>
  )
}
