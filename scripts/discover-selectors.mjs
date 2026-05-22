#!/usr/bin/env node
/**
 * Helper pour découvrir les sélecteurs CSS réels MCB / MRA.
 *
 * Lance un Chromium en mode HEAD (visible) avec DevTools ouvert, sur l'URL
 * choisie. Tu te connectes manuellement, tu inspectes les éléments dans
 * DevTools, et tu copies les sélecteurs CSS / data-testid / name dans
 * lib/banks/adapters/<bank>.ts ou lib/telegram/mra-robot.ts.
 *
 * Pré-requis :
 *   pnpm install                          # installe playwright-core
 *   pnpm exec playwright install chromium # télécharge le binaire local
 *
 * Usage :
 *   node scripts/discover-selectors.mjs mcb
 *   node scripts/discover-selectors.mjs mra-vat
 *   node scripts/discover-selectors.mjs mra-paye
 *   node scripts/discover-selectors.mjs mra-cit
 *   node scripts/discover-selectors.mjs <url-libre>
 *
 * Note : ce script ne fait QUE ouvrir le navigateur — il ne se loggue pas
 * et ne soumet rien. Toi tu pilotes manuellement, tu prends note des
 * sélecteurs, et tu fermes la fenêtre quand tu as fini.
 */

import { chromium } from 'playwright-core'

const TARGETS = {
  mcb:       'https://ibank.mcb.mu/',
  sbm:       'https://internetbanking.sbmgroup.mu/',
  maubank:   'https://internetbanking.maubank.mu/',
  'mra-vat': 'https://eservices3.mra.mu/vatreturn/taxpayerlogin.jsp',
  'mra-cit': 'https://eservices38.mra.mu/centralLogin/login',
  'mra-paye': 'https://eservices.mra.mu/centralLogin/login',
  'mra-csg':  'https://eservices.mra.mu/centralLogin/login',
  'mra-tds':  'https://eservices.mra.mu/centralLogin/login',
}

const arg = process.argv[2]
if (!arg) {
  console.error('Usage : node scripts/discover-selectors.mjs <cible>')
  console.error('Cibles disponibles : ' + Object.keys(TARGETS).join(', '))
  console.error('Ou passe une URL libre : node scripts/discover-selectors.mjs https://example.mu')
  process.exit(1)
}

const url = TARGETS[arg] || (arg.startsWith('http') ? arg : null)
if (!url) {
  console.error(`Cible inconnue : ${arg}`)
  console.error('Cibles dispo : ' + Object.keys(TARGETS).join(', '))
  process.exit(1)
}

console.log(`→ Ouverture de ${url}`)
console.log('→ DevTools ouvert : utilise Ctrl+Shift+C pour inspecter, copie le sélecteur CSS.')
console.log('→ Ferme la fenêtre quand tu as récupéré ce qu\'il te faut.')

const browser = await chromium.launch({
  headless: false,
  devtools: true,
  args: ['--start-maximized'],
})
const ctx = await browser.newContext({
  viewport: null,
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
})
const page = await ctx.newPage()
await page.goto(url, { waitUntil: 'domcontentloaded' })

// Astuce : injecte un helper global window.findSelector(text) qui retourne
// le sélecteur CSS de tout élément contenant le texte donné. Utile pour
// trouver vite le bouton Login / le champ password sans souris.
await page.addInitScript(() => {
  // @ts-ignore - helper console
  window.findSelector = (text) => {
    const all = Array.from(document.querySelectorAll('*'))
    return all
      .filter(el => el.textContent?.trim().toLowerCase().includes(text.toLowerCase()))
      .slice(0, 5)
      .map(el => ({
        tag: el.tagName,
        id: el.id || null,
        name: el.getAttribute('name') || null,
        class: el.className || null,
        text: el.textContent?.trim().slice(0, 60),
      }))
  }
  console.log('Helper dispo : findSelector("Login")  // dans la console DevTools')
})

// Ne rien close — l'utilisateur le fait à la main.
await new Promise(() => {})
