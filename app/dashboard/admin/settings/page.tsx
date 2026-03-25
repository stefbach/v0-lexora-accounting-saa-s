"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"

export default function AdminSettingsPage() {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your organization settings and preferences.
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
            <CardDescription>Update your organization details.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="org-name">Organization Name</FieldLabel>
                <Input id="org-name" defaultValue="Lexora Accounting" />
              </Field>
              <Field>
                <FieldLabel htmlFor="org-email">Contact Email</FieldLabel>
                <Input id="org-email" type="email" defaultValue="admin@lexora.com" />
              </Field>
            </FieldGroup>
            <Button className="mt-4">Save Changes</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Configure notification preferences.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Email Notifications</p>
                <p className="text-sm text-muted-foreground">
                  Receive email updates about account activity.
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">New User Alerts</p>
                <p className="text-sm text-muted-foreground">
                  Get notified when new users sign up.
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Document Uploads</p>
                <p className="text-sm text-muted-foreground">
                  Alerts for new document uploads.
                </p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Manage security settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Two-Factor Authentication</p>
                <p className="text-sm text-muted-foreground">
                  Require 2FA for all admin accounts.
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Session Timeout</p>
                <p className="text-sm text-muted-foreground">
                  Auto-logout after 30 minutes of inactivity.
                </p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
