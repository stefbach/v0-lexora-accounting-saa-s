// Helper de locale côté serveur (routes API, Server Components).
// getLocale() de lib/i18n.ts lit localStorage et renvoie toujours 'fr' sur le
// serveur ; ici on lit le cookie `lexora_locale` posé par setLocale() côté client.
import { cookies } from 'next/headers'
import type { Locale } from './i18n'

export async function getServerLocale(): Promise<Locale> {
  try {
    const store = await cookies()
    const v = store.get('lexora_locale')?.value
    return v === 'en' ? 'en' : 'fr'
  } catch {
    return 'fr'
  }
}
