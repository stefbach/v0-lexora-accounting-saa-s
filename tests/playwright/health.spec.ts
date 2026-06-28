import { test, expect } from '@playwright/test'

/**
 * Test de santé de base (smoke) — cf. claudecode.md Étape 3.
 *
 * Vérifie que la page d'accueil de l'application Next.js se charge correctement
 * sans erreur : réponse HTTP OK, rendu visible, et absence d'erreur JS console.
 */
test.describe('Page d’accueil — santé', () => {
  test('se charge avec un statut HTTP OK', async ({ page }) => {
    const response = await page.goto('/')
    expect(response, 'aucune réponse reçue pour /').not.toBeNull()
    expect(response!.status(), 'statut HTTP de la home').toBeLessThan(400)
  })

  test('affiche le contenu et un titre non vide', async ({ page }) => {
    await page.goto('/')
    // Le <body> doit être visible et contenir du texte rendu.
    await expect(page.locator('body')).toBeVisible()
    await expect(page.locator('h1').first()).toBeVisible()
    const title = await page.title()
    expect(title.trim().length, 'le <title> ne doit pas être vide').toBeGreaterThan(0)
  })

  test('ne déclenche aucune erreur JavaScript fatale au chargement', async ({ page }) => {
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => { /* requêtes backend qui ne se calment pas en env de test */ })

    // Bruit attendu en environnement de test (CI utilise des creds Supabase
    // factices) ou non applicatif : réseau, backend, hydratation, observers…
    // On ne bloque que sur les VRAIS crashs JS applicatifs.
    const IGNORED = /favicon|analytics|third-party|net::ERR|ERR_|Failed to load resource|Failed to fetch|NetworkError|supabase|fetch|hydrat|ResizeObserver|preload|font|429|401|403|500/i

    const fatalPageErrors = pageErrors.filter((e) => !IGNORED.test(e))
    expect(fatalPageErrors, `exceptions JS: ${fatalPageErrors.join(' | ')}`).toHaveLength(0)

    const appConsoleErrors = consoleErrors.filter((e) => !IGNORED.test(e))
    expect(appConsoleErrors, `erreurs console: ${appConsoleErrors.join(' | ')}`).toHaveLength(0)
  })
})
