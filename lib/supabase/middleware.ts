import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // Skip auth checks if Supabase is not configured
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return supabaseResponse
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the session - IMPORTANT: must be called to refresh expired tokens
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Public routes that don't require authentication
  const publicRoutes = [
    '/',
    '/auth/login',
    '/login',
    '/redirect',
    '/tarifs',
    // Public-facing legal pages
    '/mentions-legales',
    '/cgu',
    '/cgv',
    '/protection-donnees',
    // Public lead-capture form
    '/inscription',
    // Public contract-signing flow (signed link URL)
    '/signer-contrat',
  ]
  // API routes explicitly whitelisted as public (no auth required).
  // All other /api/* routes require an authenticated user (see below).
  //   /api/cron/*    → protégé par verifyCronSecret (header secret)
  //   /api/agent/*   → protégé par verifyAgentSecret (LEXORA_AGENT_SECRET)
  //   /api/public/*  → endpoints publics (ex: signer-contrat flow)
  //   /api/contact   → formulaire de support (lead-capture)
  //   /api/auth/*    → callbacks / endpoints Supabase auth
  //   /api/health    → probes infrastructure (liveness / readiness)
  //   /api/telegram/webhook       → reçu de Telegram (auth via X-Telegram-Bot-Api-Secret-Token)
  //   /api/telegram/send          → server-side internal (X-Internal-Token)
  //   /api/telegram/societe       → server-side internal (X-Internal-Token)
  //   /api/telegram/cron-alerts   → cron (X-Internal-Token)
  const publicApiPrefixes = [
    '/api/cron/',
    '/api/agent/',
    '/api/public/',
    '/api/auth/',
  ]
  const publicApiExact = [
    '/api/contact',
    '/api/health',
    '/api/telegram/webhook',
    '/api/telegram/send',
    '/api/telegram/send-with-buttons',
    '/api/telegram/societe',
    '/api/telegram/cron-alerts',
    '/api/telegram/log',
    '/api/telegram/memory',
  ]
  // Internal Telegram tool endpoints — all auth via X-Internal-Token
  const publicApiInternalPrefixes = [
    '/api/telegram/internal/',
  ]
  const isPublicApi =
    publicApiPrefixes.some((p) => pathname.startsWith(p)) ||
    publicApiInternalPrefixes.some((p) => pathname.startsWith(p)) ||
    publicApiExact.includes(pathname)

  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  ) || isPublicApi

  // Protected routes requiring authentication (explicit list for clarity)
  // All non-public routes are protected:
  // /salarie  → employee self-service portal (any authenticated user with employee link)
  // /rh       → HR module (roles: admin, comptable, rh, manager)
  // /direction → Direction dashboard (roles: admin, direction)
  // /comptable → Accounting module
  // /admin    → Platform administration

  // Non-public /api/* without session → 401 JSON (pas de redirect HTML pour les APIs)
  if (!user && pathname.startsWith('/api/') && !isPublicApi) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 },
    )
  }

  // If not authenticated and trying to access a protected route, redirect to login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // If authenticated and visiting login page, redirect to role-based dashboard
  if (user && (pathname === '/auth/login' || pathname === '/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/redirect'
    return NextResponse.redirect(url)
  }

  // Role-based access control for sensitive routes
  // We check profile from Supabase to get the role
  if (user) {
    // Routes restricted to admin/direction roles
    const directionRoutes = ['/direction']
    // Routes restricted to admin/comptable/rh/manager roles
    const rhRoutes = ['/rh']
    // Admin-only routes
    const adminRoutes = ['/admin']

    const isDirectionRoute = directionRoutes.some(r => pathname.startsWith(r))
    const isRhRoute = rhRoutes.some(r => pathname.startsWith(r))
    const isAdminRoute = adminRoutes.some(r => pathname.startsWith(r))
    const isJuridiqueRoute = pathname.startsWith('/juridique')
    const isClientRoute = pathname.startsWith('/client')
    const isSalarieRoute = pathname.startsWith('/salarie')

    if (isDirectionRoute || isRhRoute || isAdminRoute || isJuridiqueRoute || isClientRoute || isSalarieRoute) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, employe_id')
        .eq('id', user.id)
        .maybeSingle()

      const role = profile?.role || ''
      const hasEmployeLink = !!profile?.employe_id

      if (isAdminRoute && !['admin', 'super_admin'].includes(role)) {
        const url = request.nextUrl.clone()
        url.pathname = '/redirect'
        return NextResponse.redirect(url)
      }

      if (isDirectionRoute && !['admin', 'super_admin', 'direction'].includes(role)) {
        const url = request.nextUrl.clone()
        url.pathname = '/redirect'
        return NextResponse.redirect(url)
      }

      if (isRhRoute && !['admin', 'super_admin', 'direction', 'comptable', 'comptable_dedie', 'rh', 'manager', 'client_admin', 'client_user'].includes(role)) {
        const url = request.nextUrl.clone()
        url.pathname = '/redirect'
        return NextResponse.redirect(url)
      }

      if (isJuridiqueRoute && !['admin', 'super_admin', 'comptable', 'comptable_dedie', 'juridique', 'client_admin', 'client_user'].includes(role)) {
        const url = request.nextUrl.clone()
        url.pathname = '/redirect'
        return NextResponse.redirect(url)
      }

      if (isClientRoute && !['admin', 'super_admin', 'comptable', 'comptable_dedie', 'client_admin', 'client_user', 'client_assistant'].includes(role)) {
        const url = request.nextUrl.clone()
        url.pathname = '/redirect'
        return NextResponse.redirect(url)
      }

      // Mono-société enforcement: pour les rôles client, si pas de cookie
      // `active_societe_id`, renvoyer vers /client/select-societe.
      // Les comptables / admins ne sont pas concernés (flow séparé).
      if (isClientRoute && ['client_admin', 'client_user', 'client_assistant'].includes(role)) {
        const hasActiveSociete = !!request.cookies.get('active_societe_id')?.value
        const bypassPaths = [
          '/client/select-societe',
          '/client/societes', // CRUD liste — doit rester multi
          '/client/profil',
          '/client/notifications',
        ]
        const isBypassed = bypassPaths.some(p => pathname === p || pathname.startsWith(p + '/'))
        if (!hasActiveSociete && !isBypassed) {
          const url = request.nextUrl.clone()
          url.pathname = '/client/select-societe'
          url.search = ''
          return NextResponse.redirect(url)
        }
      }

      // Salarié portal: employees only, plus admins/HR for support views.
      // We also allow users whose profile carries an employe_id back-link
      // even if the role column is empty (migration 108/109 link arrived
      // before the role was stamped).
      if (isSalarieRoute) {
        const salarieAllowed = [
          'employe', 'salarie',
          'rh', 'rh_manager', 'manager',
          'admin', 'super_admin',
          'direction', 'client_admin', 'client_assistant',
        ]
        if (!salarieAllowed.includes(role) && !hasEmployeLink) {
          const url = request.nextUrl.clone()
          url.pathname = '/redirect'
          return NextResponse.redirect(url)
        }
      }
    }
  }

  return supabaseResponse
}
