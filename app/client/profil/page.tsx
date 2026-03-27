"use client"

import { useState } from "react"
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
import { User, Building2, Bell, Shield } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

export default function ProfilPage() {
  const { profile } = useProfile()

  const [fullName, setFullName] = useState("Raj Doobur")
  const [email, setEmail] = useState("raj@tibok.mu")
  const [phone, setPhone] = useState("+230 5 987 6543")

  const [notifEmail, setNotifEmail] = useState(true)
  const [notifWhatsapp, setNotifWhatsapp] = useState(true)
  const [notifTva, setNotifTva] = useState(true)
  const [notifDocuments, setNotifDocuments] = useState(true)
  const [notifSalaires, setNotifSalaires] = useState(false)

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: "#1E2A4A" }}>
          Accès non autorisé
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;accéder à cette page.
        </p>
        <Link href="/client/upload" className="text-sm underline" style={{ color: "#C9A84C" }}>
          Retour à l&apos;envoi de documents
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Mon Profil
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gérez vos informations personnelles et vos préférences.
        </p>
      </div>

      {/* Informations personnelles */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <User className="h-5 w-5" style={{ color: "#1E2A4A" }} />
            <CardTitle style={{ color: "#1E2A4A" }}>Informations personnelles</CardTitle>
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
              <Label htmlFor="phone">Téléphone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Rôle</Label>
              <div className="flex items-center h-9">
                <Badge style={{ backgroundColor: "#1E2A4A", color: "white" }}>
                  Administrateur
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button style={{ backgroundColor: "#C9A84C", color: "white" }}>
              Enregistrer les modifications
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Ma Société */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5" style={{ color: "#1E2A4A" }} />
            <CardTitle style={{ color: "#1E2A4A" }}>Ma Société</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Nom de la société</p>
              <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>TIBOK Ltd</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Numéro BRN</p>
              <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>C07012345</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Numéro TAN</p>
              <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>T2345678</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Adresse</p>
              <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>
                10 rue Bourbon, Port-Louis, Maurice
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Comptable assigné</p>
              <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>Sophie Ramgoolam</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Date de création</p>
              <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>15 janvier 2020</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Ces informations sont gérées par votre comptable. Contactez-le pour toute modification.
          </p>
        </CardContent>
      </Card>

      {/* Préférences notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5" style={{ color: "#1E2A4A" }} />
            <CardTitle style={{ color: "#1E2A4A" }}>Préférences de notifications</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>Notifications par email</p>
              <p className="text-sm text-muted-foreground">Recevez les alertes par email.</p>
            </div>
            <Switch checked={notifEmail} onCheckedChange={setNotifEmail} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>Notifications WhatsApp</p>
              <p className="text-sm text-muted-foreground">Recevez les alertes par WhatsApp.</p>
            </div>
            <Switch checked={notifWhatsapp} onCheckedChange={setNotifWhatsapp} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>Rappels TVA</p>
              <p className="text-sm text-muted-foreground">Soyez prévenu avant chaque date limite de TVA.</p>
            </div>
            <Switch checked={notifTva} onCheckedChange={setNotifTva} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>Documents traités</p>
              <p className="text-sm text-muted-foreground">Notification quand vos documents sont classés.</p>
            </div>
            <Switch checked={notifDocuments} onCheckedChange={setNotifDocuments} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>Salaires</p>
              <p className="text-sm text-muted-foreground">Notification quand les fiches de paie sont prêtes.</p>
            </div>
            <Switch checked={notifSalaires} onCheckedChange={setNotifSalaires} />
          </div>
        </CardContent>
      </Card>

      {/* Sécurité */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5" style={{ color: "#1E2A4A" }} />
            <CardTitle style={{ color: "#1E2A4A" }}>Sécurité</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>Mot de passe</p>
              <p className="text-sm text-muted-foreground">
                Dernière modification il y a 3 mois.
              </p>
            </div>
            <Button variant="outline" style={{ borderColor: "#1E2A4A", color: "#1E2A4A" }}>
              Changer le mot de passe
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
