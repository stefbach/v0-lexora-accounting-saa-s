import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes accessibles sans authentification
const PUBLIC_ROUTES = ['/', '/auth/login', '/login', '/redirect']

// Protection par rôle — qui peut accéder à quoi
const ROUTE_ROLES: Record<string, string[]> = {
  '/admin':          ['admin'],
  '/direction':      ['admin', 'direction'],
  '/rh':             ['admin', 'direction', 'rh_manager'],
  '/juridique':      ['admin', 'direction', 'juridique', 'rh_manager'],
  '/comptable':      ['admin', 'comptable', 'comptable_dedie', 'direction'],
  '/salarie':        ['salarie', 'rh_manager', 'admin', 'direction'],
  '/client':         ['client_admin', 'client_user', 'admin'],
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return supabaseResponse
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  const isPublicRoute = PUBLIC_ROUTES.some(r => pathname === r) || pathname.startsWith('/api/')
  const isStaticAsset = pathname.startsWith('/_next') || /\.(ico|png|jpg|svg|webp)$/.test(pathname)

  if (isStaticAsset) return supabaseResponse

  // Non authentifié → login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // Authentifié sur login → redirect
  if (user && (pathname === '/auth/login' || pathname === '/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/redirect'
    return NextResponse.redirect(url)
  }

  // Vérification rôle si route protégée
  if (user) {
    const matchedRoute = Object.keys(ROUTE_ROLES).find(r => pathname.startsWith(r))
    if (matchedRoute) {
      const allowedRoles = ROUTE_ROLES[matchedRoute]
      // Récupérer le rôle du profil
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      const userRole = profile?.role || ''
      if (!allowedRoles.includes(userRole) && userRole !== 'admin') {
        const url = request.nextUrl.clone()
        url.pathname = '/redirect' // Redirige vers le bon dashboard selon le rôle
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}
