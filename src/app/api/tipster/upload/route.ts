// ── POST /api/tipster/upload ──────────────────────────────────────
// Upload a betslip screenshot. Gated to the logged-in tipster (session
// cookie). Uses the service-role client so the upload does not depend on a
// Supabase Auth session / storage RLS (auth is now phone-identity cookies).
// Returns the public URL stored in betslip_secrets.slip_image_url and shown to
// the buyer on /reveal after purchase.
import { NextRequest, NextResponse } from 'next/server'
import { getMyTipster } from '@/lib/auth/session'
import { supabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const BUCKET = 'betslips'

export async function POST(req: NextRequest) {
  const tipster = await getMyTipster()
  if (!tipster) return NextResponse.json({ error: 'Not a tipster' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: 'No file' }, { status: 400 })
  if (!file.type.startsWith('image/'))
    return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 })
  if (file.size > 8 * 1024 * 1024)
    return NextResponse.json({ error: 'Image too large (max 8MB)' }, { status: 400 })

  const db = supabaseServer()
  if (!db) return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })

  const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${tipster.id}/${Date.now()}.${ext}`
  const { error } = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (error) {
    console.error('slip image upload error:', error.message)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
  const { data } = db.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
