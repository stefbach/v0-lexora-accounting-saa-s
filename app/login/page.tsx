"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
import { t, getLocale } from "@/lib/i18n"

export default function LoginPage() {
  const locale = getLocale()
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link href="/" className="mx-auto mb-4 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <span className="text-lg font-bold text-primary-foreground">L</span>
            </div>
            <span className="text-2xl font-semibold tracking-tight text-foreground">Lexora</span>
          </Link>
          <CardTitle>{t('adm.login.welcome', locale)}</CardTitle>
          <CardDescription>{t('adm.login.subtitle', locale)}</CardDescription>
        </CardHeader>
        <CardContent>
          <form>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">{t('adm.login.email', locale)}</FieldLabel>
                <Input id="email" type="email" placeholder="name@company.com" />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">{t('adm.login.password', locale)}</FieldLabel>
                <Input id="password" type="password" placeholder="••••••••" />
              </Field>
            </FieldGroup>
            <div className="mt-4 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="rounded border-input" />
                <span className="text-muted-foreground">{t('adm.login.remember', locale)}</span>
              </label>
              {/* Pas de self-service reset : contactez votre RH. */}
              <span className="text-sm text-muted-foreground">
                {t('adm.login.forgot', locale)}
              </span>
            </div>
            <Button className="mt-6 w-full" asChild>
              <Link href="/dashboard">{t('adm.login.signin', locale)}</Link>
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            {t('adm.login.no_account', locale)}{" "}
            <Link href="#" className="text-primary hover:underline">
              {t('adm.login.contact_sales', locale)}
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
