"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Loader2, ArrowLeft } from "lucide-react"
import { t, getLocale, setLocale, type Locale } from "@/lib/i18n"

export default function AuthLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locale, setLoc] = useState<Locale>(getLocale())

  const switchLang = (l: Locale) => { setLoc(l); setLocale(l) }

  const txt = {
    title: locale === "fr" ? "Connexion a votre compte" : "Sign in to your account",
    subtitle: locale === "fr" ? "Entrez vos identifiants pour acceder a votre espace" : "Enter your credentials to access your workspace",
    email: locale === "fr" ? "Adresse e-mail" : "Email address",
    password: locale === "fr" ? "Mot de passe" : "Password",
    forgot: locale === "fr" ? "Mot de passe oublie ? Contactez votre RH." : "Forgot password? Contact your HR.",
    login: locale === "fr" ? "Se connecter" : "Sign in",
    logging: locale === "fr" ? "Connexion en cours..." : "Signing in...",
    no_account: locale === "fr" ? "Vous n'avez pas de compte ?" : "Don't have an account?",
    contact_admin: locale === "fr" ? "Contactez votre administrateur" : "Contact your administrator",
    back_home: locale === "fr" ? "Retour a l'accueil" : "Back to home",
    error_invalid: locale === "fr" ? "Identifiants invalides. Verifiez votre adresse e-mail et votre mot de passe." : "Invalid credentials. Please check your email and password.",
    error_email: locale === "fr" ? "Votre email n'est pas encore confirme." : "Your email is not yet confirmed.",
    error_generic: locale === "fr" ? "Une erreur inattendue s'est produite." : "An unexpected error occurred.",
    powered: "Powered by Digital Data Solutions Ltd",
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

      if (authError) {
        if (authError.message.includes("Invalid login")) setError(txt.error_invalid)
        else if (authError.message.includes("Email not confirmed")) setError(txt.error_email)
        else setError(authError.message)
        return
      }

      // Redirect to role-based dashboard
      window.location.href = "/redirect"
    } catch {
      setError(txt.error_generic)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ backgroundColor: "#f4f5f7" }}>
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 flex items-center justify-between p-4 z-10">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium hover:underline" style={{ color: "#0B0F2E" }}>
          <ArrowLeft className="w-4 h-4" />
          {txt.back_home}
        </Link>
        <div className="flex gap-1 bg-white rounded-full border p-0.5 shadow-sm">
          <button onClick={() => switchLang("fr")} className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${locale === "fr" ? "text-white" : "text-gray-500"}`}
            style={locale === "fr" ? { backgroundColor: "#D4AF37" } : {}}>FR</button>
          <button onClick={() => switchLang("en")} className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${locale === "en" ? "text-white" : "text-gray-500"}`}
            style={locale === "en" ? { backgroundColor: "#D4AF37" } : {}}>EN</button>
        </div>
      </div>

      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <Link href="/" className="mx-auto mb-4 flex items-center gap-2">
            <span className="text-2xl font-bold" style={{ color: "#0B0F2E", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>
              LE<span style={{ color: "#D4AF37" }}>X</span>ORA
            </span>
          </Link>
          <CardTitle className="text-xl" style={{ color: "#0B0F2E" }}>{txt.title}</CardTitle>
          <CardDescription>{txt.subtitle}</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">{txt.email}</Label>
                <Input id="email" type="email" placeholder="nom@entreprise.com" value={email}
                  onChange={e => setEmail(e.target.value)} required disabled={loading} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">{txt.password}</Label>
                <Input id="password" type="password" placeholder="••••••••" value={password}
                  onChange={e => setPassword(e.target.value)} required disabled={loading} />
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-md border px-4 py-3 text-sm" style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca", color: "#991b1b" }} role="alert">
                {error}
              </div>
            )}

            {/* Décision produit : pas de self-service reset password.
                L'employé qui oublie son mot de passe doit contacter son
                RH, qui le redéfinit via la fiche employé (Renvoyer
                credentials). Pas de lien actif → texte informatif seul. */}
            <div className="mt-4 flex justify-end">
              <span className="text-sm text-gray-500">{txt.forgot}</span>
            </div>

            <Button type="submit" className="mt-6 w-full" size="lg" disabled={loading} style={{ backgroundColor: "#0B0F2E", color: "#ffffff" }}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{txt.logging}</> : txt.login}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            {txt.no_account}{" "}
            <Link href="#" className="font-medium hover:underline" style={{ color: "#D4AF37" }}>{txt.contact_admin}</Link>
          </p>
        </CardFooter>
      </Card>

      <p className="mt-6 text-xs text-gray-400">{txt.powered}</p>
    </div>
  )
}
