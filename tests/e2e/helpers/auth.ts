/**
 * Authentication helpers for E2E tests.
 *
 * Two strategies are supported :
 *
 *   1. UI login : submit the /login form using the email/password env vars.
 *      Slowest, but exercises the full auth path (good for at least one
 *      smoke test).
 *
 *   2. Programmatic login (preferred for most specs) : call Supabase
 *      `signInWithPassword` from the test process, then inject the access
 *      token cookie used by @supabase/ssr into the Playwright context.
 *
 * Required env vars when DB test is available :
 *   E2E_USER_EMAIL    — test user email (must exist in the test project)
 *   E2E_USER_PASSWORD — its password
 *   E2E_USER_B_EMAIL  — second user (different societe, for isolation tests)
 *   E2E_USER_B_PASSWORD
 *   E2E_SOCIETE_A_ID  — societe_id the first user belongs to
 *   E2E_SOCIETE_B_ID  — societe_id the second user belongs to
 */
import type { Page, BrowserContext } from '@playwright/test'

export interface E2ECredentials {
  email: string
  password: string
}

export function getCredentialsA(): E2ECredentials | null {
  const email = process.env.E2E_USER_EMAIL
  const password = process.env.E2E_USER_PASSWORD
  if (!email || !password) return null
  return { email, password }
}

export function getCredentialsB(): E2ECredentials | null {
  const email = process.env.E2E_USER_B_EMAIL
  const password = process.env.E2E_USER_B_PASSWORD
  if (!email || !password) return null
  return { email, password }
}

/**
 * UI login : navigate to /login, fill the form, submit, and wait for the
 * landing page (heuristic : the URL no longer contains /login).
 */
export async function loginViaUI(page: Page, creds: E2ECredentials): Promise<void> {
  await page.goto('/login')
  // Use input id selectors that exist on the current login page
  await page.locator('#email').fill(creds.email)
  await page.locator('#password').fill(creds.password)
  // Submit — the form button label is variable across designs, target by role.
  await page
    .getByRole('button', { name: /(connexion|se connecter|sign in|log in)/i })
    .click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 15_000,
  })
}

/**
 * Programmatic login (faster). Calls Supabase REST auth endpoint with the
 * anon key, then primes Supabase SSR cookies on the Playwright context so
 * subsequent page.goto(...) calls are authenticated.
 *
 * Note : we set a single cookie name compatible with @supabase/ssr's default
 * cookieOptions. If your app overrides them you may need to adapt.
 */
export async function loginProgrammatic(
  context: BrowserContext,
  creds: E2ECredentials,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('NEXT_PUBLIC_SUPABASE_URL/ANON_KEY missing')

  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
  })
  if (!res.ok) {
    throw new Error(`Programmatic login failed (${res.status}): ${await res.text()}`)
  }
  const session = (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_at: number
  }

  // Default @supabase/ssr cookie name is sb-<project-ref>-auth-token
  const projectRef = new URL(url).host.split('.')[0]
  const cookieName = `sb-${projectRef}-auth-token`

  // Token format expected by @supabase/ssr ≥0.5 is a JSON-stringified array.
  const cookieValue = JSON.stringify([
    session.access_token,
    session.refresh_token,
  ])

  await context.addCookies([
    {
      name: cookieName,
      value: cookieValue,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
      expires: session.expires_at,
    },
  ])
}
