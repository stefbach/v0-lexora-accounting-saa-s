import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     * - install-mcp.sh / install-mcp.ps1 — installer scripts pour le MCP Lexora,
     *   doivent être servis publiquement (curl | bash non authentifié).
     * - sw.js / *.webmanifest / offline.html — socle de l'application
     *   installable. Le navigateur les récupère hors session (le service
     *   worker s'enregistre avant toute authentification, et le manifeste est
     *   lu par le système d'exploitation). S'ils passaient par le middleware,
     *   ils recevraient la redirection HTML vers /auth/login : le manifeste
     *   devient illisible, le site cesse d'être installable et
     *   l'enregistrement du service worker échoue.
     */
    '/((?!_next/static|_next/image|favicon.ico|install-mcp\\.sh|install-mcp\\.ps1|sw\\.js|offline\\.html|.*\\.webmanifest$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
