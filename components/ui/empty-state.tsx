"use client"

import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export interface EmptyStateAction {
  /** Texte affiché dans le bouton */
  label: string
  /** Handler de clic */
  onClick?: () => void
  /** Lien href (rend un <a>) — alternative à onClick */
  href?: string
  /** Icône optionnelle dans le bouton */
  icon?: LucideIcon
  /** Variante du bouton (default = primary Lexora) */
  variant?: "default" | "outline" | "secondary" | "ghost"
}

export interface EmptyStateProps {
  /** Icône lucide-react (composant, pas instance) */
  icon?: LucideIcon
  /** Titre principal — message court */
  title: string
  /** Description optionnelle — phrase explicative */
  description?: string
  /** Action principale (bouton call-to-action) */
  action?: EmptyStateAction
  /** Action secondaire optionnelle */
  secondaryAction?: EmptyStateAction
  /** Classes additionnelles sur le conteneur */
  className?: string
  /** Padding vertical : sm = py-8, md = py-12, lg = py-16 (default) */
  size?: "sm" | "md" | "lg"
}

const sizeClasses: Record<NonNullable<EmptyStateProps["size"]>, string> = {
  sm: "py-8",
  md: "py-12",
  lg: "py-16",
}

/**
 * EmptyState — composant unifié pour afficher les listes vides
 * dans l'application Lexora (factures, employés, contacts, etc.).
 *
 * Garantit :
 * - Cohérence visuelle (icône en cercle muted, typo, espacements)
 * - Accessibilité (role="status", aria-live polite pour les lecteurs d'écran)
 * - Responsive mobile-first
 *
 * @example
 * <EmptyState
 *   icon={Users}
 *   title="Aucun employé"
 *   description="Commencez par ajouter votre premier employé."
 *   action={{ label: "Ajouter un employé", onClick: () => setOpen(true), icon: Plus }}
 * />
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = "lg",
}: EmptyStateProps) {
  const renderAction = (a: EmptyStateAction, isPrimary: boolean) => {
    const ActionIcon = a.icon
    const variant = a.variant ?? (isPrimary ? "default" : "outline")
    const content = (
      <>
        {ActionIcon ? <ActionIcon className="h-4 w-4" aria-hidden="true" /> : null}
        {a.label}
      </>
    )
    if (a.href) {
      return (
        <Button asChild variant={variant} size="sm">
          <a href={a.href}>{content}</a>
        </Button>
      )
    }
    return (
      <Button type="button" variant={variant} size="sm" onClick={a.onClick}>
        {content}
      </Button>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center text-center px-4",
        sizeClasses[size],
        className,
      )}
    >
      {Icon ? (
        <div
          aria-hidden="true"
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <Icon className="h-6 w-6" />
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action ? renderAction(action, true) : null}
          {secondaryAction ? renderAction(secondaryAction, false) : null}
        </div>
      ) : null}
    </div>
  )
}

export default EmptyState
