import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const isConfigured = supabaseUrl && !supabaseUrl.includes('placeholder')

// Browser client — used in client components
export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnon)
  : null

// Server client — used in API routes (full DB access)
export function supabaseServer() {
  if (!isConfigured) return null
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  })
}
