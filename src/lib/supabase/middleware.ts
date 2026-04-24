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

  const publicPaths = ['/login', '/registreren', '/wachtwoord-vergeten', '/api/email/sync', '/api/mollie/webhook', '/api/admin/', '/api/factuur/']
  const isPublicPath = publicPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  ) || request.nextUrl.pathname.match(/^\/offerte\/[^/]+$/)
  const isPortaalPath = request.nextUrl.pathname.startsWith('/portaal')
  // API routes NOOIT redirecten — ze hebben hun eigen auth en moeten ook
  // voor ingelogde admins normaal kunnen worden aangeroepen (bv. de
  // betaal-redirect in een factuurmail die een admin tegenkomt).
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/')

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
      if (!isPortaalPath && !isPublicPath && !isApiRoute) {
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

      // 2FA-check + inactiviteit uitlog (geldt alleen voor medewerkers, niet
      // voor API-routes of /login). Medewerker moet elke 3 dagen opnieuw
      // een 2FA code uit z'n mail invoeren. Ook als de tfa_verified cookie
      // mist, of de last_activity meer dan 3 dagen oud is.
      const isLoginPath = request.nextUrl.pathname.startsWith('/login')
      if (!isApiRoute && !isLoginPath && !isPublicPath) {
        const tfaCookie = request.cookies.get('tfa_verified')?.value
        const activityCookie = request.cookies.get('last_activity')?.value
        const INACTIEF_MS = 3 * 24 * 60 * 60 * 1000
        const tfaOk = tfaCookie === user.id
        const activityMs = activityCookie ? parseInt(activityCookie) : 0
        const recent = activityMs > 0 && (Date.now() - activityMs) < INACTIEF_MS
        if (!tfaOk || !recent) {
          // Sessie verlopen door inactiviteit of geen 2FA → uitloggen en naar /login
          await supabase.auth.signOut()
          const url = request.nextUrl.clone()
          url.pathname = '/login'
          url.searchParams.set('reason', !tfaOk ? 'tfa_required' : 'inactief')
          const redirectResponse = NextResponse.redirect(url)
          redirectResponse.cookies.delete('tfa_verified')
          redirectResponse.cookies.delete('last_activity')
          return redirectResponse
        }
        // Activity bijwerken zodat de timer opnieuw begint bij elk verzoek
        supabaseResponse.cookies.set('last_activity', String(Date.now()), {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 30,
        })
      }

      // Bestaand gedrag: redirect weg van /login/registreren — maar NIET
      // voor /api/* routes en niet voor /offerte/[token] publieke links.
      if (isPublicPath && !isApiRoute && !request.nextUrl.pathname.startsWith('/offerte/') && !isLoginPath) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}
