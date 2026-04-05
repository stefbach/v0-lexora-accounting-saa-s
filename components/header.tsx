"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Menu } from "lucide-react"
import { useState } from "react"
import { LexoraLogo } from "@/components/LexoraLogo"

export function Header() {
  const [open, setOpen] = useState(false)

  const navLinks = [
    { href: "#features", label: "Fonctionnalités" },
    { href: "#about", label: "À propos" },
    { href: "#contact", label: "Contact" },
    { href: "/tarifs", label: "Tarifs" },
  ]

  return (
    <header className="sticky top-0 z-50 w-full" style={{ backgroundColor: "#0B0F2E", borderBottom: "1px solid #1E2760" }}>
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <LexoraLogo href="/" size="md" showBaseline />

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium transition-colors hover:text-[#E8EAFC]"
              style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif" }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Button
            variant="ghost"
            asChild
            className="hover:bg-white/5"
            style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif" }}
          >
            <Link href="/auth/login">Se connecter</Link>
          </Button>
          <Button
            asChild
            style={{ backgroundColor: "#4191FF", color: "#E8EAFC", fontFamily: "'Poppins', sans-serif", fontWeight: 500, borderRadius: "6px" }}
          >
            <Link href="/redirect">Accéder au tableau de bord</Link>
          </Button>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" style={{ color: "#E8EAFC" }}>
              <Menu className="h-5 w-5" />
              <span className="sr-only">Menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px]" style={{ backgroundColor: "#0E1338", borderLeft: "1px solid #1E2760" }}>
            <nav className="flex flex-col gap-4 pt-8">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="text-lg font-medium"
                  style={{ color: "#E8EAFC", fontFamily: "'Poppins', sans-serif" }}
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-4 flex flex-col gap-3">
                <Button
                  variant="outline"
                  asChild
                  style={{ border: "1px solid #4191FF", color: "#4191FF", fontFamily: "'Poppins', sans-serif" }}
                >
                  <Link href="/auth/login">Se connecter</Link>
                </Button>
                <Button
                  asChild
                  style={{ backgroundColor: "#4191FF", color: "#E8EAFC", fontFamily: "'Poppins', sans-serif", fontWeight: 500 }}
                >
                  <Link href="/redirect">Accéder au tableau de bord</Link>
                </Button>
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
