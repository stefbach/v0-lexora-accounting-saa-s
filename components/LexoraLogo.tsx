import Link from "next/link"

/**
 * Fond sur lequel le logo est posé. `dark` est l'historique (bleu nuit de
 * l'application) et reste le défaut : toutes les intégrations existantes
 * gardent leur rendu. `light` sert les pages publiques passées sur fond
 * clair, où le lettrage nuit remplace le lettrage crème.
 */
type LogoTone = "dark" | "light"

interface LexoraLogoProps {
  href?: string
  subtitle?: string
  size?: "sm" | "md" | "lg"
  showBaseline?: boolean
  tone?: LogoTone
}

const TONES: Record<LogoTone, { letters: string; gold: string; rule: string; baseline: string }> = {
  dark:  { letters: "#E8EAFC", gold: "#D4AF37", rule: "#4A5490", baseline: "#8B90B8" },
  light: { letters: "#0B0F2E", gold: "#B8901F", rule: "#CBD5E8", baseline: "#64708C" },
}

/**
 * LEXORA logo — lettrage plein, X toujours doré.
 * Poppins Bold, letter-spacing 0.04em, filet souligné avec accent sous le X.
 */
export function LexoraLogo({ href, subtitle, size = "md", showBaseline = false, tone = "dark" }: LexoraLogoProps) {
  const fontSize = size === "sm" ? "text-xl" : size === "lg" ? "text-4xl" : "text-2xl"
  const baselineSize = size === "lg" ? "text-xs" : "text-[10px]"
  const t = TONES[tone]

  const logoContent = (
    <div className="flex flex-col">
      <div className="flex items-center">
        <span
          className={`${fontSize} font-bold`}
          style={{ color: t.letters, letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}
        >
          LE
        </span>
        <span
          className={`${fontSize} font-bold`}
          style={{ color: t.gold, letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}
        >
          X
        </span>
        <span
          className={`${fontSize} font-bold`}
          style={{ color: t.letters, letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}
        >
          ORA
        </span>
      </div>
      {/* Underline: full line with gold accent under X */}
      <div className="relative w-full" style={{ height: "3px" }}>
        <div className="absolute inset-x-0 bottom-0" style={{ height: "2px", backgroundColor: t.rule }} />
        <div
          className="absolute bottom-0"
          style={{
            height: "3px",
            backgroundColor: t.gold,
            left: "33%",
            width: "20%",
          }}
        />
      </div>
      {showBaseline && (
        <span
          className={`${baselineSize} font-light mt-1 tracking-wider`}
          style={{ color: t.baseline, fontFamily: "'Poppins', sans-serif" }}
        >
          INTELLIGENT ACCOUNTING &middot; POWERED BY AI
        </span>
      )}
      {subtitle && (
        <span className="text-xs mt-0.5" style={{ color: t.baseline, opacity: 0.8, fontFamily: "'Poppins', sans-serif" }}>
          {subtitle}
        </span>
      )}
    </div>
  )

  if (href) {
    return <Link href={href}>{logoContent}</Link>
  }

  return logoContent
}

/**
 * Compact sidebar logo — just LEXORA text with gold X + subtitle.
 */
export function LexoraLogoCompact({ href, subtitle }: { href?: string; subtitle?: string }) {
  const content = (
    <div className="flex items-center gap-2">
      <div className="flex flex-col">
        <div className="flex items-baseline">
          <span className="text-base font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>
            LE
          </span>
          <span className="text-base font-bold" style={{ color: "#D4AF37", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>
            X
          </span>
          <span className="text-base font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>
            ORA
          </span>
        </div>
        {subtitle && (
          <span className="text-[10px] font-light tracking-wider" style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif" }}>
            {subtitle}
          </span>
        )}
      </div>
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }
  return content
}

/**
 * Collapsed sidebar icon — just the gold "L" on dark background.
 */
export function LexoraIcon() {
  return (
    <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: "#141C4A", border: "1px solid #1E2760" }}>
      <span className="text-sm font-bold" style={{ color: "#E8EAFC", fontFamily: "'Poppins', sans-serif" }}>
        L<span style={{ color: "#D4AF37" }}>X</span>
      </span>
    </div>
  )
}
