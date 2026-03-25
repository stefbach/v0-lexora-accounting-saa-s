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
          cookiesToSet.forEach(({ name, value, options }) =>
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Public routes that don't require authentication
  const publicRoutes = ['/', '/auth/login', '/login']
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith('/api/')
  )

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  if (user && (pathname === '/auth/login' || pathname === '/login')) {
    // Fetch user role from profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = profile?.role || 'client'
    const url = request.nextUrl.clone()

    switch (role) {
      case 'admin':
        url.pathname = '/admin'
        break
      case 'comptable':
        url.pathname = '/comptable'
        break
      case 'client':
      default:
        url.pathname = '/client'
        break
    }

    return NextResponse.redirect(url)
  }

  // Role-based route protection
  if (user) {
    const protectedPrefixes = ['/admin', '/client', '/comptable']
    const isProtectedRoute = protectedPrefixes.some((prefix) =>
      pathname.startsWith(prefix)
    )

    if (isProtectedRoute) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      const role = profile?.role || 'client'

      if (pathname.startsWith('/admin') && role !== 'admin') {
        const url = request.nextUrl.clone()
        url.pathname = `/${role}`
        return NextResponse.redirect(url)
      }

      if (pathname.startsWith('/client') && role !== 'client') {
        const url = request.nextUrl.clone()
        url.pathname = `/${role}`
        return NextResponse.redirect(url)
      }

      if (pathname.startsWith('/comptable') && role !== 'comptable') {
        const url = request.nextUrl.clone()
        url.pathname = `/${role}`
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}
