// ── GET /api/admin/transactions ───────────────────────────────────
// Admin-only listing of payment transactions for the dashboard tab.
// Supports optional status filter + pagination.

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/session'
import { listTransactions } from '@/lib/transactions'
import { supabaseServer } from '@/lib/supabase'
import { marketFilterFromRequest } from '@/lib/countryFilter'
import type { TxnStatus } from '@/types/payments'

export async function GET(req: NextRequest) {
  // Admin session required.
  if (!(await requireRole('admin'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = req.nextUrl.searchParams

  // Optional status filter (any of our normalised TxnStatus values).
  const statusParam = sp.get('status')
  const status = (statusParam ?? undefined) as TxnStatus | undefined

  // Pagination — defaults: 50 rows from offset 0.
  const limit  = Number(sp.get('limit'))  || 50
  const offset = Number(sp.get('offset')) || 0

  // Optional ?market=XX (admin market switcher) → that market's tipsters only.
  const marketIds = await marketFilterFromRequest(supabaseServer(), req)

  const { rows, count } = await listTransactions({
    status, limit, offset,
    tipsterIds: marketIds ? Array.from(marketIds) : null,
  })
  return NextResponse.json({ transactions: rows, count })
}
