"use client"
import { useState } from "react"
import { usePathname } from "next/navigation"
import { HelpCircle } from "lucide-react"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { getHelpFor } from "@/lib/help/content"
import { PageHelpDrawer } from "./PageHelpDrawer"

/**
 * Bouton d'aide contextuelle inline (dans le header d'une page).
 * Pour un bouton flottant global, utiliser <FloatingPageHelp /> à la place.
 */
type Props = {
  pathKey?: string
  label?: string
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'sm' | 'default' | 'lg'
}

export function PageHelp({ pathKey, label = "Aide", variant = 'ghost', size = 'sm' }: Props) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const entry = getHelpFor(pathKey ?? pathname)
  if (!entry) return null
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant={variant} size={size} className="gap-1.5 text-slate-600 hover:text-slate-900">
          <HelpCircle className="h-4 w-4" />
          <span className="font-normal">{label}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-[460px] p-0 overflow-y-auto bg-white">
        <PageHelpDrawer entry={entry} onClose={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
