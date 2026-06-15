// Supabase client bound to the user's session cookies (Supabase Auth).
// Use in Server Components / Route Handlers to act AS the logged-in user
// (RLS applies). For privileged service-role work use `supabaseServer()`
// from '@/lib/supabase'.
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function supabaseSession() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          // Setting cookies throws in a Server Component render; the
          // middleware refreshes the session, so ignore here.
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch { /* no-op in RSC */ }
        },
      },
    },
  )
}
