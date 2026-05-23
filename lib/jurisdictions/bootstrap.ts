import { registerJurisdiction } from './core/registry'

// Lazy load and register all jurisdictions
export async function bootstrapJurisdictions() {
  try {
    const { mauritiusJurisdiction } = await import('./mauritius/jurisdiction')
    registerJurisdiction(mauritiusJurisdiction)
  } catch (e) {
    console.warn('[bootstrap] Mauritius jurisdiction not available:', e)
  }

  // UEMOA countries
  const ueModaPaths = [
    ['senegal', 'senegalJurisdiction'],
    ['ivory-coast', 'ivoryCoastJurisdiction'],
    // Others when implementations are ready
  ]

  for (const [folder, exportName] of ueModaPaths) {
    try {
      const mod = await import(`./ohada/countries/${folder}/jurisdiction`)
      const jur = mod[exportName]
      if (jur) registerJurisdiction(jur)
    } catch (e) {
      // Country not yet implemented as full Jurisdiction - skip silently
    }
  }

  // CEMAC countries
  const cemacPaths = [
    ['cameroon', 'cameroonJurisdiction'],
  ]

  for (const [folder, exportName] of cemacPaths) {
    try {
      const mod = await import(`./ohada/countries/${folder}/jurisdiction`)
      const jur = mod[exportName]
      if (jur) registerJurisdiction(jur)
    } catch (e) {
      // skip
    }
  }
}

// Synchronous register for pre-loaded jurisdictions (for use in tests or eager init)
export function registerStaticJurisdictions() {
  // For environments where dynamic import is unavailable
  // This will be populated by the build system
}
