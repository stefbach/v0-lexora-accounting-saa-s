"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"

export default function LoginPage() {
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
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Sign in to your account to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" type="email" placeholder="name@company.com" />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input id="password" type="password" placeholder="Enter your password" />
              </Field>
            </FieldGroup>
            <div className="mt-4 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="rounded border-input" />
                <span className="text-muted-foreground">Remember me</span>
              </label>
              <Link href="#" className="text-sm text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <Button className="mt-6 w-full" asChild>
              <Link href="/dashboard">Sign In</Link>
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            {"Don't have an account? "}
            <Link href="#" className="text-primary hover:underline">
              Contact sales
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
