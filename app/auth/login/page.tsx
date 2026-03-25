"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Loader2 } from "lucide-react"

export default function AuthLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        setError("Identifiants invalides. Veuillez vérifier votre adresse e-mail et votre mot de passe.")
        return
      }

      // Fetch user role to redirect to correct dashboard
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single()

        const role = profile?.role || "client"
        switch (role) {
          case "admin":
            router.push("/admin")
            break
          case "comptable":
            router.push("/comptable")
            break
          default:
            router.push("/client")
        }
      } else {
        router.push("/")
      }
    } catch {
      setError("Une erreur inattendue s'est produite. Veuillez réessayer.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: "#f4f5f7" }}>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link href="/" className="mx-auto mb-4 flex items-center gap-2">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: "#1E2A4A" }}
            >
              <span className="text-lg font-bold" style={{ color: "#C9A84C" }}>
                L
              </span>
            </div>
            <span className="text-2xl font-semibold tracking-tight" style={{ color: "#1E2A4A" }}>
              Lexora
            </span>
          </Link>
          <CardTitle className="text-xl" style={{ color: "#1E2A4A" }}>
            Connexion à votre compte
          </CardTitle>
          <CardDescription>
            Entrez vos identifiants pour accéder à votre espace
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Adresse e-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="nom@entreprise.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Entrez votre mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {error && (
              <div
                className="mt-4 rounded-md border px-4 py-3 text-sm"
                style={{
                  backgroundColor: "#fef2f2",
                  borderColor: "#fecaca",
                  color: "#991b1b",
                }}
                role="alert"
              >
                {error}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <Link
                href="#"
                className="text-sm hover:underline"
                style={{ color: "#1E2A4A" }}
              >
                Mot de passe oublié ?
              </Link>
            </div>

            <Button
              type="submit"
              className="mt-6 w-full"
              size="lg"
              disabled={loading}
              style={{ backgroundColor: "#1E2A4A", color: "#ffffff" }}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connexion en cours...
                </>
              ) : (
                "Se connecter"
              )}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Vous n&apos;avez pas de compte ?{" "}
            <Link
              href="#"
              className="font-medium hover:underline"
              style={{ color: "#C9A84C" }}
            >
              Contactez-nous
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
