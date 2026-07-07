"use client"

import { useEffect } from "react"

/**
 * Capture les erreurs JS non gérées du navigateur (crash de rendu React,
 * gestionnaire d'événement qui throw, promesse rejetée) et les renvoie à
 * /api/client-errors, qui les ré-émet en log serveur (visible Vercel).
 *
 * Objectif : diagnostiquer les « écrans blancs » du pointage salarié qui
 * n'apparaissent nulle part côté serveur car ils se produisent dans le
 * navigateur. Additif et silencieux : n'affiche rien, n'altère aucun flux.
 */

// Bruit connu à ignorer (extensions, scripts tiers, warnings benins).
const IGNORE_PATTERNS = [
  "ResizeObserver loop",
  "Script error.",              // erreur cross-origin sans détail (extension/tiers)
  "Non-Error promise rejection",
  "Loading chunk",              // stale chunk après déploiement — attendu, non actionnable
  "Loading CSS chunk",
]

function shouldReport(message: string): boolean {
  if (!message) return false
  return !IGNORE_PATTERNS.some(p => message.includes(p))
}

export function ClientErrorReporter({ employeId }: { employeId?: string | null }) {
  useEffect(() => {
    // Anti-spam : ne pas réémettre la même signature plus d'une fois.
    const seen = new Set<string>()

    const send = (scope: string, message: string, stack?: string, source?: string) => {
      if (!shouldReport(message)) return
      const sig = `${scope}|${message}|${source || ""}`
      if (seen.has(sig)) return
      seen.add(sig)

      const payload = JSON.stringify({
        scope,
        message,
        stack: stack || "",
        source: source || "",
        url: typeof window !== "undefined" ? window.location.href : "",
        ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
        employe_id: employeId || "",
      })

      try {
        // sendBeacon survit à une navigation/écran blanc en cours ; fetch
        // keepalive en repli.
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/client-errors", new Blob([payload], { type: "application/json" }))
        } else {
          fetch("/api/client-errors", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
          }).catch(() => {})
        }
      } catch {
        /* la télémétrie ne doit jamais casser l'app */
      }
    }

    const onError = (e: ErrorEvent) => {
      const src = e.filename ? `${e.filename}:${e.lineno || 0}:${e.colno || 0}` : ""
      send("window.error", e.message || String(e.error || "erreur inconnue"), e.error?.stack, src)
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason: any = e.reason
      const msg = reason?.message || (typeof reason === "string" ? reason : "unhandledrejection")
      send("unhandledrejection", msg, reason?.stack)
    }

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [employeId])

  return null
}
