import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const publicPaths = ['/login', '/registreren', '/wachtwoord-vergeten', '/api/email/sync']
  const isPublicPath = publicPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  ) || request.nextUrl.pathname.match(/^\/offerte\/[^/]+$/)
  const isPortaalPath = request.nextUrl.pathname.startsWith('/portaal')

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user) {
    // Check of gebruiker een klant is
    const { data: profiel } = await supabase
      .from('profielen')
      .select('rol')
      .eq('id', user.id)
      .single()

    const isKlant = profiel?.rol === 'klant'

    if (isKlant) {
      // Klant mag alleen /portaal/* bezoeken
      if (!isPortaalPath && !isPublicPath) {
        const url = request.nextUrl.clone()
        url.pathname = '/portaal'
        return NextResponse.redirect(url)
      }
    } else {
      // Admin/medewerker mag niet naar /portaal
      if (isPortaalPath) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
      }
      // Bestaand gedrag: redirect weg van public paths (maar niet /offerte/ links)
      if (isPublicPath && !request.nextUrl.pathname.startsWith('/offerte/')) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}
