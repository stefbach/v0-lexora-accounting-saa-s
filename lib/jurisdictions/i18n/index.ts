import { OHADA_FR_TRANSLATIONS } from './ohada-fr'

export { OHADA_FR_TRANSLATIONS }

export function getOhadaTranslation(path: string, locale: 'fr' | 'en' = 'fr'): string {
  // Simple dot notation accessor
  // 'chart.classes.1' → 'Ressources Durables'
  const tree = locale === 'fr' ? OHADA_FR_TRANSLATIONS : null
  if (!tree) return path

  const parts = path.split('.')
  let current: any = tree
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part]
    } else {
      return path
    }
  }

  return typeof current === 'string' ? current : path
}
