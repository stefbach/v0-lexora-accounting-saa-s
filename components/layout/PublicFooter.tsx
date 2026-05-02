import Link from "next/link"
import pkg from "@/package.json"

const FONT = "'Poppins', sans-serif"

const APP_VERSION = (pkg as { version?: string }).version ?? "0.0.0"

const LINK_STYLE: React.CSSProperties = {
  color: "#A8AFC7",
  textDecoration: "none",
  fontSize: 13,
  lineHeight: 1.8,
}

/**
 * Footer global Lexora pour les pages publiques.
 *
 * Contient :
 *  - liens vers les 4 pages légales canoniques (/legal/*)
 *  - lien vers le centre d'aide /help
 *  - copyright avec millésime dynamique
 *  - version applicative tirée de package.json
 */
export function PublicFooter() {
  return (
    <footer
      style={{
        background: "#0B0F2E",
        color: "#E8EAFC",
        borderTop: "1px solid #1E2760",
        padding: "40px 24px 24px",
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 32,
          paddingBottom: 24,
          borderBottom: "1px solid #1E2760",
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em" }}>Lexora</div>
          <p style={{ color: "#A8AFC7", fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>
            La plateforme comptable des entreprises mauriciennes — IFRS, TVA, paie,
            clôtures et états financiers.
          </p>
        </div>

        <div>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: "#E8EAFC", letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 12px" }}>
            Produit
          </h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <li><Link href="/" style={LINK_STYLE}>Accueil</Link></li>
            <li><Link href="/tarifs" style={LINK_STYLE}>Tarifs</Link></li>
            <li><Link href="/help" style={LINK_STYLE}>Centre d&apos;aide</Link></li>
          </ul>
        </div>

        <div>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: "#E8EAFC", letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 12px" }}>
            Légal
          </h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <li><Link href="/legal/mentions-legales" style={LINK_STYLE}>Mentions légales</Link></li>
            <li><Link href="/legal/cgv" style={LINK_STYLE}>CGV</Link></li>
            <li><Link href="/legal/cgu" style={LINK_STYLE}>CGU</Link></li>
            <li><Link href="/legal/privacy" style={LINK_STYLE}>Confidentialité</Link></li>
          </ul>
        </div>

        <div>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: "#E8EAFC", letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 12px" }}>
            Contact
          </h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <li><a href="mailto:contact@lexora.finance" style={LINK_STYLE}>contact@lexora.finance</a></li>
            <li><a href="mailto:dpo@lexora.finance" style={LINK_STYLE}>dpo@lexora.finance</a></li>
            <li style={{ color: "#A8AFC7", fontSize: 13 }}>Cybercity, Ebène, Maurice</li>
          </ul>
        </div>
      </div>

      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          paddingTop: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 12,
          color: "#A8AFC7",
        }}
      >
        <div>
          © {new Date().getFullYear()} Digital Data Solutions Ltd · Tous droits réservés
        </div>
        <div>
          <span style={{ marginRight: 12 }}>BRN C12345678</span>
          <span>v{APP_VERSION}</span>
        </div>
      </div>
    </footer>
  )
}

export default PublicFooter
