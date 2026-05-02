import type { ReactNode } from "react"

export function ArticleProse({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 16,
        lineHeight: 1.75,
        color: "#1E293B",
      }}
    >
      {children}
    </div>
  )
}

export function H2({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 22,
        fontWeight: 700,
        margin: "28px 0 12px",
        color: "#0B0F2E",
        letterSpacing: "-0.01em",
      }}
    >
      {children}
    </h2>
  )
}

export function H3({ children }: { children: ReactNode }) {
  return (
    <h3 style={{ fontSize: 17, fontWeight: 700, margin: "20px 0 8px", color: "#0B0F2E" }}>
      {children}
    </h3>
  )
}

export function P({ children }: { children: ReactNode }) {
  return <p style={{ margin: "0 0 12px" }}>{children}</p>
}

export function UL({ children }: { children: ReactNode }) {
  return <ul style={{ margin: "0 0 12px 20px", paddingLeft: 0 }}>{children}</ul>
}

export function OL({ children }: { children: ReactNode }) {
  return <ol style={{ margin: "0 0 12px 20px", paddingLeft: 0 }}>{children}</ol>
}

export function LI({ children }: { children: ReactNode }) {
  return <li style={{ margin: "4px 0" }}>{children}</li>
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <aside
      role="note"
      style={{
        background: "#EEF4FF",
        border: "1px solid #C7D9FA",
        borderLeft: "4px solid #4191FF",
        padding: "12px 16px",
        borderRadius: 8,
        margin: "16px 0",
        color: "#0B2046",
      }}
    >
      {children}
    </aside>
  )
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code
      style={{
        background: "#F1F5F9",
        padding: "2px 6px",
        borderRadius: 4,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 13,
      }}
    >
      {children}
    </code>
  )
}
