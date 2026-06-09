import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// Browser client — used in client components
export const supabase = createClient(supabaseUrl, supabaseAnon)

// Server client — routes REST calls through IPv4-compatible pooler host
export function supabaseServer() {
  return createClient(
    'https://aws-1-ap-south-1.pooler.supabase.com',
    serviceKey,
    {
      auth: { persistSession: false },
      db: { schema: 'public' },
      global: {
        headers: {
          'x-supabase-project-ref': 'sooutpsbdgqelnnfezp'
        }
      }
    }
  )
}