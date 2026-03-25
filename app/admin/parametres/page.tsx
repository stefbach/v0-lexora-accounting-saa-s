"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Save } from "lucide-react"

export default function AdminParametresPage() {
  const [orgName, setOrgName] = useState("Lexora Mauritius")
  const [orgEmail, setOrgEmail] = useState("admin@lexora.mu")

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Paramètres</h1>
        <p className="text-muted-foreground">Configuration de la plateforme</p>
      </div>

      <div className="grid gap-6 max-w-2xl">
        {/* Organisation */}
        <Card>
          <CardHeader>
            <CardTitle>Organisation</CardTitle>
            <CardDescription>Informations générales de la plateforme</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Nom de l&apos;organisation</Label>
              <Input id="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orgEmail">Email de contact</Label>
              <Input id="orgEmail" type="email" value={orgEmail} onChange={(e) => setOrgEmail(e.target.value)} />
            </div>
            <Button className="gap-2" style={{ backgroundColor: "#C9A84C" }}>
              <Save className="h-4 w-4" />
              Enregistrer
            </Button>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Gérer les alertes et notifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Notifications par email</p>
                <p className="text-sm text-muted-foreground">Recevoir les alertes par email</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Alertes nouveaux utilisateurs</p>
                <p className="text-sm text-muted-foreground">Notification lors de l&apos;inscription d&apos;un utilisateur</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Alertes documents uploadés</p>
                <p className="text-sm text-muted-foreground">Notification lors de l&apos;upload d&apos;un document</p>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Rappels TVA</p>
                <p className="text-sm text-muted-foreground">Alerte avant les deadlines MRA</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        {/* Sécurité */}
        <Card>
          <CardHeader>
            <CardTitle>Sécurité</CardTitle>
            <CardDescription>Options de sécurité de la plateforme</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Authentification à deux facteurs</p>
                <p className="text-sm text-muted-foreground">Exiger la 2FA pour tous les utilisateurs</p>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Expiration de session</p>
                <p className="text-sm text-muted-foreground">Déconnexion automatique après inactivité</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
