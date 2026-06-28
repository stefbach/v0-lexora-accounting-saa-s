// Helper d'erreur API bilingue. La langue est lue côté serveur via le cookie
// `lexora_locale` (posé par setLocale côté client). Les routes font simplement :
//   return apiError('unauthorized', 401)
import { NextResponse } from 'next/server'
import { t } from '@/lib/i18n'
import { getServerLocale } from '@/lib/i18n-server'

export async function apiError(key: string, status: number) {
  const locale = await getServerLocale()
  return NextResponse.json({ error: t(`apierr.${key}`, locale) }, { status })
}
