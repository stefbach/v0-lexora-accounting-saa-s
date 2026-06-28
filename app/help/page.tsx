import { HelpHome } from "./HelpClients"

// Métadonnées FR par défaut (SSG). La page rend une vue cliente bilingue
// (FR/EN selon la locale de l'utilisateur, lue côté client).
export const metadata = {
  title: "Centre d'aide — Lexora",
  description: "Articles, guides et tutoriels pour utiliser Lexora au quotidien.",
}

export default function HelpHomePage() {
  return <HelpHome />
}
