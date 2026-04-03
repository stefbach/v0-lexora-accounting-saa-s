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
  const publicRoutes = ['/', '/auth/login', '/login', '/redirect', '/tarifs']
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route
  ) || pathname.startsWith('/api/')

  // Protected routes requiring authentication (explicit list for clarity)
  // All non-public routes are protected:
  // /salarie  → employee self-service portal (any authenticated user with employee link)
  // /rh       → HR module (roles: admin, comptable, rh, manager)
  // /direction → Direction dashboard (roles: admin, direction)
  // /comptable → Accounting module
  // /admin    → Platform administration

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

    if (isDirectionRoute || isRhRoute || isAdminRoute || isJuridiqueRoute) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      const role = profile?.role || ''

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
    }
  }

  return supabaseResponse
}
