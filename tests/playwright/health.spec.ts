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

  test('ne déclenche aucune erreur JavaScript au chargement', async ({ page }) => {
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto('/', { waitUntil: 'networkidle' })

    // Les erreurs de page (exceptions JS non catchées) sont bloquantes.
    expect(pageErrors, `erreurs JS: ${pageErrors.join(' | ')}`).toHaveLength(0)
    // Les erreurs console réseau tierces (favicon, analytics) sont tolérées :
    // on ne bloque que sur les vraies erreurs applicatives.
    const appErrors = consoleErrors.filter(
      (e) => !/favicon|analytics|third-party|net::ERR|Failed to load resource/i.test(e),
    )
    expect(appErrors, `erreurs console: ${appErrors.join(' | ')}`).toHaveLength(0)
  })
})
