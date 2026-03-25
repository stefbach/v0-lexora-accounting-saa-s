"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"

export default function AccountantSettingsPage() {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your account settings and preferences.
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>Update your personal details.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Full Name</FieldLabel>
                <Input id="name" defaultValue="Sarah Johnson" />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" type="email" defaultValue="sarah@lexora.com" />
              </Field>
              <Field>
                <FieldLabel htmlFor="specialty">Specialty</FieldLabel>
                <Input id="specialty" defaultValue="Tax Planning" />
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <Input id="phone" type="tel" defaultValue="(555) 987-6543" />
              </Field>
            </FieldGroup>
            <Button className="mt-4">Save Changes</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Configure how you receive updates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">New Document Alerts</p>
                <p className="text-sm text-muted-foreground">
                  Get notified when clients upload documents.
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Deadline Reminders</p>
                <p className="text-sm text-muted-foreground">
                  Receive reminders about client deadlines.
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Weekly Summary</p>
                <p className="text-sm text-muted-foreground">
                  Receive a weekly summary of activity.
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Client Messages</p>
                <p className="text-sm text-muted-foreground">
                  Notifications for client communications.
                </p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Manage your account security.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="current-password">Current Password</FieldLabel>
                <Input id="current-password" type="password" />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-password">New Password</FieldLabel>
                <Input id="new-password" type="password" />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirm-password">Confirm New Password</FieldLabel>
                <Input id="confirm-password" type="password" />
              </Field>
            </FieldGroup>
            <Button className="mt-4">Update Password</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
