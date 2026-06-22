// Liveness probe for Docker healthchecks. Compose gates `sync` (and could
// gate other dependents) on this so they wait for a real "Ready" instead of a
// fixed sleep. No DB — it only confirms the Next server is up and serving.
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ ok: true })
}
