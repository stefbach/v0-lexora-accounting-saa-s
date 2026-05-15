"use client"
import { useState } from "react"
import { usePathname } from "next/navigation"
import { HelpCircle } from "lucide-react"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { getHelpFor } from "@/lib/help/content"
import { PageHelpDrawer } from "./PageHelpDrawer"

/**
 * Bouton d'aide flottant en bas à droite. À monter UNE FOIS dans un layout
 * global (ex: app/client/layout.tsx, app/comptable/layout.tsx, etc.).
 * Auto-affiche/masque selon que la page courante a un contenu d'aide ou non.
 *
 * Design : pastille sobre 48x48px, ombre légère, hover discret.
 */
export function FloatingPageHelp() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const entry = getHelpFor(pathname)
  if (!entry) return null

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label="Aide pour cette page"
          className="fixed bottom-6 right-6 z-40 h-11 w-11 rounded-full bg-white border border-slate-200 shadow-md text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition flex items-center justify-center"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-[460px] p-0 overflow-y-auto bg-white">
        <PageHelpDrawer entry={entry} onClose={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
