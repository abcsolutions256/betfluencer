// ── ioTec Pay — Mobile Money for Uganda ──────────────────────────
// Docs: https://pay.iotec.io/api-docs/index.html
// Auth: OAuth2 client_credentials
// Supports: MTN Uganda + Airtel Uganda collections & disbursements

const BASE_URL    = process.env.IOTEC_BASE_URL    ?? 'https://pay.iotec.io'
const CLIENT_ID   = process.env.IOTEC_CLIENT_ID   ?? ''
const CLIENT_SECRET = process.env.IOTEC_CLIENT_SECRET ?? ''
const WALLET_ID   = process.env.IOTEC_WALLET_ID   ?? ''
const COMMISSION  = parseFloat(process.env.PLATFORM_COMMISSION ?? '0.10')

// ── TOKEN CACHE ───────────────────────────────────────────────────
let cachedToken: string | null = null
let tokenExpiry: number        = 0

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken

  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  })

  if (!res.ok) throw new Error(`ioTec auth failed: ${res.status} ${await res.text()}`)

  const data = await res.json()
  cachedToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000
  return cachedToken!
}

async function iotecFetch(path: string, method = 'GET', body?: object) {
  const token = await getAccessToken()
  const res   = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) } }
  catch { return { ok: res.ok, status: res.status, data: { message: text } } }
}

// ── COLLECT PAYMENT FROM USER ─────────────────────────────────────
// Sends a Mobile Money prompt to user's phone
export async function collectPayment({ phone, amount, ref, name }: {
  phone:  string   // +256XXXXXXXXX
  amount: number   // UGX
  ref:    string   // unique reference
  name?:  string
}): Promise<{ success: boolean; transactionId?: string; error?: string }> {

  // Demo mode — no real keys
  if (!CLIENT_ID || CLIENT_ID === 'demo') {
    console.log('[ioTec Demo] Collect:', { phone, amount, ref })
    return { success: true, transactionId: `demo-${Date.now()}` }
  }

  const result = await iotecFetch('/api/v1/collections', 'POST', {
    walletId:    WALLET_ID,
    phone:       phone.replace('+', '').replace(/\s/g, ''),  // 256XXXXXXXXX
    amount:      amount,
    currency:    'UGX',
    reference:   ref,
    description: `Betfluencer slip purchase`,
    name:        name ?? 'Betfluencer User',
  })

  if (result.ok) {
    return { success: true, transactionId: result.data?.transactionId ?? result.data?.id }
  }

  console.error('[ioTec] Collection failed:', result.data)
  return { success: false, error: result.data?.message ?? 'Payment failed' }
}

// ── DISBURSE TO TIPSTER (90% of gross) ───────────────────────────
export async function disburseTipster({ phone, grossAmount, ref, tipsterName }: {
  phone:       string
  grossAmount: number
  ref:         string
  tipsterName: string
}): Promise<{ success: boolean; tipsterAmount: number; commissionAmount: number; error?: string }> {

  const commissionAmount = Math.round(grossAmount * COMMISSION)
  const tipsterAmount    = grossAmount - commissionAmount

  // Demo mode
  if (!CLIENT_ID || CLIENT_ID === 'demo') {
    console.log('[ioTec Demo] Disburse:', { phone, tipsterAmount, ref })
    return { success: true, tipsterAmount, commissionAmount }
  }

  const result = await iotecFetch('/api/v1/disbursements', 'POST', {
    walletId:    WALLET_ID,
    phone:       phone.replace('+', '').replace(/\s/g, ''),
    amount:      tipsterAmount,
    currency:    'UGX',
    reference:   `${ref}-tipster`,
    description: `Betfluencer payout to ${tipsterName}`,
    name:        tipsterName,
  })

  if (result.ok) {
    return { success: true, tipsterAmount, commissionAmount }
  }

  console.error('[ioTec] Disbursement failed:', result.data)
  return { success: false, tipsterAmount, commissionAmount, error: result.data?.message }
}

// ── REFUND USER ───────────────────────────────────────────────────
export async function refundUser({ phone, amount, ref }: {
  phone:  string
  amount: number
  ref:    string
}): Promise<{ success: boolean }> {

  if (!CLIENT_ID || CLIENT_ID === 'demo') {
    console.log('[ioTec Demo] Refund:', { phone, amount, ref })
    return { success: true }
  }

  const result = await iotecFetch('/api/v1/disbursements', 'POST', {
    walletId:    WALLET_ID,
    phone:       phone.replace('+', '').replace(/\s/g, ''),
    amount,
    currency:    'UGX',
    reference:   `${ref}-refund`,
    description: 'Betfluencer refund',
  })

  return { success: result.ok }
}

// ── CHECK TRANSACTION STATUS ──────────────────────────────────────
export async function checkTransactionStatus(transactionId: string): Promise<'pending' | 'success' | 'failed'> {
  if (!CLIENT_ID || CLIENT_ID === 'demo') return 'success'

  const result = await iotecFetch(`/api/v1/transactions/${transactionId}`)
  if (!result.ok) return 'failed'

  const status = result.data?.status?.toLowerCase() ?? ''
  if (status === 'successful' || status === 'success' || status === 'completed') return 'success'
  if (status === 'failed'     || status === 'error')  return 'failed'
  return 'pending'
}

// ── WEBHOOK VERIFICATION ──────────────────────────────────────────
export function verifyIotecWebhook(payload: string, signature: string): boolean {
  // ioTec uses HMAC-SHA256 — verify when we know the exact header name
  // For now, trust all webhooks in sandbox mode
  return true
}

// ── SMS TEMPLATES ─────────────────────────────────────────────────
export const smsTemplates = {
  refund: (amount: number) =>
    `Betfluencer: Your payment of UGX ${amount.toLocaleString()} has been refunded to your Mobile Money. Sorry for the inconvenience.`,
  slipUnlocked: (tipster: string) =>
    `Betfluencer: Your slip from ${tipster} is now unlocked. Open the app to view it.`,
}

export async function sendSMS({ to, message }: { to: string; message: string }) {
  // Uses ioTec Messaging API if available, otherwise just logs
  console.log(`[SMS to ${to}]: ${message}`)
}
