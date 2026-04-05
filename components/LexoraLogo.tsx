import Link from "next/link"

interface LexoraLogoProps {
  href?: string
  subtitle?: string
  size?: "sm" | "md" | "lg"
  showBaseline?: boolean
}

/**
 * LEXORA logo — all letters #E8EAFC, X always #D4AF37 (gold).
 * Poppins Bold, letter-spacing 0.04em.
 * Optional underline with gold accent under X.
 */
export function LexoraLogo({ href, subtitle, size = "md", showBaseline = false }: LexoraLogoProps) {
  const fontSize = size === "sm" ? "text-xl" : size === "lg" ? "text-4xl" : "text-2xl"
  const baselineSize = size === "lg" ? "text-xs" : "text-[10px]"

  const logoContent = (
    <div className="flex flex-col">
      <div className="flex items-center">
        <span
          className={`${fontSize} font-bold`}
          style={{ color: "#E8EAFC", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}
        >
          LE
        </span>
        <span
          className={`${fontSize} font-bold`}
          style={{ color: "#D4AF37", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}
        >
          X
        </span>
        <span
          className={`${fontSize} font-bold`}
          style={{ color: "#E8EAFC", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}
        >
          ORA
        </span>
      </div>
      {/* Underline: full line with gold accent under X */}
      <div className="relative w-full" style={{ height: "3px" }}>
        <div className="absolute inset-x-0 bottom-0" style={{ height: "2px", backgroundColor: "#4A5490" }} />
        <div
          className="absolute bottom-0"
          style={{
            height: "3px",
            backgroundColor: "#D4AF37",
            left: "33%",
            width: "20%",
          }}
        />
      </div>
      {showBaseline && (
        <span
          className={`${baselineSize} font-light mt-1 tracking-wider`}
          style={{ color: "#8B90B8", fontFamily: "'Poppins', sans-serif" }}
        >
          INTELLIGENT ACCOUNTING &middot; POWERED BY AI
        </span>
      )}
      {subtitle && (
        <span className="text-xs text-white/40 mt-0.5" style={{ fontFamily: "'Poppins', sans-serif" }}>
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
