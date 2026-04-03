"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { User, Building2, Bell, Shield, Loader2 } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

interface Societe {
  id: string
  nom: string
  brn: string | null
  numero_tva_mra: string | null
  comptable?: {
    id: string
    full_name: string
    email: string
    phone: string | null
  } | null
}

export default function ProfilPage() {
  const { profile, loading } = useProfile()

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")

  const [societe, setSociete] = useState<Societe | null>(null)
  const [loadingSociete, setLoadingSociete] = useState(true)

  const [notifEmail, setNotifEmail] = useState(true)
  const [notifWhatsapp, setNotifWhatsapp] = useState(true)
  const [notifTva, setNotifTva] = useState(true)
  const [notifDocuments, setNotifDocuments] = useState(true)
  const [notifSalaires, setNotifSalaires] = useState(false)

  // Populate form fields from profile
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "")
      setEmail(profile.email || "")
      setPhone(profile.phone || "")
    }
  }, [profile])

  // Fetch societe data
  useEffect(() => {
    async function fetchSociete() {
      try {
        const res = await fetch("/api/client/societes")
        if (res.ok) {
          const data = await res.json()
          if (data.societes && data.societes.length > 0) {
            setSociete(data.societes[0])
          }
        }
      } catch {
        console.error("Failed to fetch societe")
      } finally {
        setLoadingSociete(false)
      }
    }
    fetchSociete()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#D4AF37" }} />
      </div>
    )
  }

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: "#0B0F2E" }}>
          Acc&egrave;s non autoris&eacute;
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;acc&eacute;der &agrave; cette page.
        </p>
        <Link href="/client/upload" className="text-sm underline" style={{ color: "#D4AF37" }}>
          Retour &agrave; l&apos;envoi de documents
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>
          Mon Profil
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          G&eacute;rez vos informations personnelles et vos pr&eacute;f&eacute;rences.
        </p>
      </div>

      {/* Informations personnelles */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <User className="h-5 w-5" style={{ color: "#0B0F2E" }} />
            <CardTitle style={{ color: "#0B0F2E" }}>Informations personnelles</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nom complet</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Adresse email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">T&eacute;l&eacute;phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>R&ocirc;le</Label>
              <div className="flex items-center h-9">
                <Badge style={{ backgroundColor: "#0B0F2E", color: "white" }}>
                  {profile?.role === "client_admin" ? "Administrateur" : profile?.role || "---"}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button style={{ backgroundColor: "#D4AF37", color: "white" }}>
              Enregistrer les modifications
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Ma Société */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5" style={{ color: "#0B0F2E" }} />
            <CardTitle style={{ color: "#0B0F2E" }}>Ma Soci&eacute;t&eacute;</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loadingSociete ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#D4AF37" }} />
            </div>
          ) : societe ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Nom de la soci&eacute;t&eacute;</p>
                <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>
                  {societe.nom}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Num&eacute;ro BRN</p>
                <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>
                  {societe.brn || "---"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Num&eacute;ro TVA (MRA)</p>
                <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>
                  {societe.numero_tva_mra || "---"}
                </p>
              </div>
              {societe.comptable && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Comptable assign&eacute;</p>
                  <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>
                    {societe.comptable.full_name}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Aucune soci&eacute;t&eacute; associ&eacute;e &agrave; votre compte.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Contactez votre comptable pour lier votre soci&eacute;t&eacute;.
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-4">
            Ces informations sont g&eacute;r&eacute;es par votre comptable. Contactez-le pour toute modification.
          </p>
        </CardContent>
      </Card>

      {/* Préférences notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5" style={{ color: "#0B0F2E" }} />
            <CardTitle style={{ color: "#0B0F2E" }}>Pr&eacute;f&eacute;rences de notifications</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>Notifications par email</p>
              <p className="text-sm text-muted-foreground">Recevez les alertes par email.</p>
            </div>
            <Switch checked={notifEmail} onCheckedChange={setNotifEmail} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>Notifications WhatsApp</p>
              <p className="text-sm text-muted-foreground">Recevez les alertes par WhatsApp.</p>
            </div>
            <Switch checked={notifWhatsapp} onCheckedChange={setNotifWhatsapp} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>Rappels TVA</p>
              <p className="text-sm text-muted-foreground">Soyez pr&eacute;venu avant chaque date limite de TVA.</p>
            </div>
            <Switch checked={notifTva} onCheckedChange={setNotifTva} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>Documents trait&eacute;s</p>
              <p className="text-sm text-muted-foreground">Notification quand vos documents sont class&eacute;s.</p>
            </div>
            <Switch checked={notifDocuments} onCheckedChange={setNotifDocuments} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>Salaires</p>
              <p className="text-sm text-muted-foreground">Notification quand les fiches de paie sont pr&ecirc;tes.</p>
            </div>
            <Switch checked={notifSalaires} onCheckedChange={setNotifSalaires} />
          </div>
        </CardContent>
      </Card>

      {/* Sécurité */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5" style={{ color: "#0B0F2E" }} />
            <CardTitle style={{ color: "#0B0F2E" }}>S&eacute;curit&eacute;</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>Mot de passe</p>
              <p className="text-sm text-muted-foreground">
                Modifiez votre mot de passe pour s&eacute;curiser votre compte.
              </p>
            </div>
            <Button variant="outline" style={{ borderColor: "#0B0F2E", color: "#0B0F2E" }}>
              Changer le mot de passe
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
