// ── Image upload utility ──────────────────────────────────────────
// Production: uploads to Supabase Storage
// Demo/local: stores as base64 in localStorage

import { supabaseServer } from './supabase'

// Convert File to base64 string
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Upload image — returns a URL
export async function uploadSlipImage(
  file: File,
  tipsterId: string,
  type: 'slip' | 'result'
): Promise<string> {
  const db = supabaseServer()

  // Production — Supabase Storage
  if (db) {
    const ext      = file.name.split('.').pop() ?? 'jpg'
    const path     = `slips/${tipsterId}/${type}_${Date.now()}.${ext}`
    const { data, error } = await db.storage
      .from('betfluencer-slips')
      .upload(path, file, { contentType: file.type, upsert: false })

    if (error) throw error

    const { data: urlData } = db.storage
      .from('betfluencer-slips')
      .getPublicUrl(data.path)

    return urlData.publicUrl
  }

  // Demo fallback — base64 stored with key
  const base64 = await fileToBase64(file)
  const key    = `bf_img_${tipsterId}_${type}_${Date.now()}`
  localStorage.setItem(key, base64)
  return key   // key acts as the "URL" in demo mode
}

// Get image — resolves key or URL
export function resolveImageUrl(urlOrKey: string): string {
  if (urlOrKey.startsWith('http')) return urlOrKey
  // localStorage key — retrieve base64
  return localStorage.getItem(urlOrKey) ?? ''
}
