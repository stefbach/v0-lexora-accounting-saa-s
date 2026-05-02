/**
 * Helpers to create factures from E2E specs without depending on the UI
 * being completely stable (data-testid coverage is partial — see Sprint 10
 * roadmap). Each helper has two flavours :
 *
 *   • createFactureClientViaApi(...)       — direct POST /api/client/factures
 *     ( fastest, deterministic ; preferred for assertions on accounting )
 *   • createFactureClientViaUI(page, data) — drives the UI form. Slower,
 *     but exercises the full validation chain ; used by the smoke test.
 *
 * The "ViaApi" helpers reuse the user's session (Playwright request context).
 */
import type { Page, APIRequestContext } from '@playwright/test'

export interface FactureClientInput {
  societe_id: string
  numero_facture?: string
  tiers: string
  date_facture: string // YYYY-MM-DD
  montant_ht: number
  montant_tva: number
  montant_ttc: number
  devise?: string
  taux_change?: number
  montant_mur?: number
}

export interface FactureFournisseurInput extends FactureClientInput {
  // tds_montant > 0 → l'API doit répartir 401 + 4471
  tds_montant?: number
  tds_categorie?: string
  tds_taux_pct?: number
}

export async function createFactureClientViaApi(
  request: APIRequestContext,
  data: FactureClientInput,
): Promise<{ id: string }> {
  const res = await request.post('/api/client/factures', {
    data: {
      ...data,
      type_facture: 'client',
      numero_facture: data.numero_facture || `E2E-CLI-${Date.now()}`,
    },
  })
  if (!res.ok()) {
    throw new Error(`createFactureClientViaApi failed (${res.status()}): ${await res.text()}`)
  }
  const body = (await res.json()) as { id?: string; data?: { id: string } }
  const id = body.id || body.data?.id
  if (!id) throw new Error('createFactureClientViaApi: no id in response')
  return { id }
}

export async function createFactureFournisseurViaApi(
  request: APIRequestContext,
  data: FactureFournisseurInput,
): Promise<{ id: string }> {
  const res = await request.post('/api/client/factures', {
    data: {
      ...data,
      type_facture: 'fournisseur',
      numero_facture: data.numero_facture || `E2E-FRN-${Date.now()}`,
    },
  })
  if (!res.ok()) {
    throw new Error(
      `createFactureFournisseurViaApi failed (${res.status()}): ${await res.text()}`,
    )
  }
  const body = (await res.json()) as { id?: string; data?: { id: string } }
  const id = body.id || body.data?.id
  if (!id) throw new Error('createFactureFournisseurViaApi: no id in response')
  return { id }
}

/** UI flow — kept simple ; relies on form labels / placeholders. */
export async function createFactureClientViaUI(
  page: Page,
  data: FactureClientInput,
): Promise<void> {
  await page.goto('/client/factures/nouvelle')
  await page.getByLabel(/tiers|client/i).first().fill(data.tiers)
  await page.getByLabel(/date/i).first().fill(data.date_facture)
  await page.getByLabel(/montant\s*ht/i).fill(String(data.montant_ht))
  await page.getByLabel(/tva/i).first().fill(String(data.montant_tva))
  await page.getByRole('button', { name: /(enregistrer|créer|valider)/i }).click()
}
