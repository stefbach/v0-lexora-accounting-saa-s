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
     */
    '/((?!_next/static|_next/image|favicon.ico|install-mcp\\.sh|install-mcp\\.ps1|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
