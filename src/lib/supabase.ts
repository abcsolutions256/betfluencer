import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// Browser client — used in client components
export const supabase = createClient(supabaseUrl, supabaseAnon)

// Browser client function — used for storage uploads in client components
export function supabaseBrowser() {
  return createClient(supabaseUrl, supabaseAnon)
}

// Server client — uses correct project REST URL with service role key
export function supabaseServer() {
  return createClient(
    `https://sooutpsbdgqelnnnfezp.supabase.co`,
    serviceKey,
    { auth: { persistSession: false } }
  )
}