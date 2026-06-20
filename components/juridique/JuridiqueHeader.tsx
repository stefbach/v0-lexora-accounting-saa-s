"use client"
/**
 * JuridiqueHeader — en-tête de page uniforme du Département Juridique.
 * Titre + sous-titre + sélecteur de société, dans la charte navy/or Lexora.
 */
import React from "react"
import { SocieteSelector } from "./JuridiqueSocieteProvider"

export function JuridiqueHeader({
  icon,
  title,
  subtitle,
  showSelector = true,
  children,
}: {
  icon?: React.ReactNode
  title: string
  subtitle?: string
  showSelector?: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      className="rounded-2xl px-6 py-5 mb-6 text-white shadow-sm"
      style={{
        background:
          "radial-gradient(ellipse 120% 80% at 0% 0%, rgba(65,145,255,0.18) 0%, transparent 60%), radial-gradient(ellipse 120% 80% at 100% 100%, rgba(212,175,55,0.16) 0%, transparent 60%), #0B0F2E",
        border: "1px solid rgba(212,175,55,0.20)",
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          {icon ? (
            <div className="mt-0.5 rounded-xl p-2.5" style={{ background: "rgba(212,175,55,0.14)", border: "1px solid rgba(212,175,55,0.30)" }}>
              {icon}
            </div>
          ) : null}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle ? <p className="text-sm text-white/70 mt-0.5 max-w-2xl">{subtitle}</p> : null}
          </div>
        </div>
        {showSelector ? (
          <div className="rounded-lg bg-white/95 px-2 py-1 self-start sm:self-auto">
            <SocieteSelector />
          </div>
        ) : null}
      </div>
      {children}
    </div>
  )
}
