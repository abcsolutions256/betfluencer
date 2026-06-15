// ── ioTec Pay — Mobile Money for Uganda ──────────────────────────
const BASE_URL      = process.env.IOTEC_BASE_URL      ?? 'https://pay.iotec.io'
const CLIENT_ID     = process.env.IOTEC_CLIENT_ID     ?? ''
const CLIENT_SECRET = process.env.IOTEC_CLIENT_SECRET ?? ''
const WALLET_ID     = process.env.IOTEC_WALLET_ID     ?? ''
const COMMISSION    = parseFloat(process.env.PLATFORM_COMMISSION ?? '0.10')

let cachedToken: string | null = null
let tokenExpiry: number        = 0

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken
  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(`${BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) throw new Error(`ioTec auth failed: ${res.status}`)
    const data = await res.json()
    cachedToken = data.access_token
    tokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000
    return cachedToken!
  } catch (e: any) {
    clearTimeout(timeout)
    throw new Error(`ioTec auth error: ${e.message}`)
  }
}

async function iotecFetch(path: string, method = 'GET', body?: object) {
  const token      = await getAccessToken()
  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const text = await res.text()
    try { return { ok: res.ok, status: res.status, data: JSON.parse(text) } }
    catch { return { ok: res.ok, status: res.status, data: { message: text } } }
  } catch (e: any) {
    clearTimeout(timeout)
    throw new Error(`ioTec timeout: ${e.message}`)
  }
}

export async function collectPayment({ phone, amount, ref, name }: {
  phone: string; amount: number; ref: string; name?: string
}): Promise<{ success: boolean; transactionId?: string; error?: string }> {
  if (true || !CLIENT_ID || CLIENT_ID === 'demo') {
    console.log('[ioTec Demo] Collect:', { phone, amount, ref })
    return { success: true, transactionId: `demo-${Date.now()}` }
  }
  try {
    const result = await iotecFetch('/api/v1/collections', 'POST', {
      walletId: WALLET_ID, phone: phone.replace('+', '').replace(/\s/g, ''),
      amount, currency: 'UGX', reference: ref,
      description: 'Betfluencer slip purchase', name: name ?? 'Betfluencer User',
    })
    if (result.ok) return { success: true, transactionId: result.data?.transactionId ?? result.data?.id }
    console.error('[ioTec] Collection failed:', result.data)
    return { success: false, error: result.data?.message ?? 'Payment failed' }
  } catch (e: any) {
    console.error('[ioTec] Collection error:', e.message)
    return { success: false, error: 'Payment service timeout. Please try again.' }
  }
}

export async function disburseTipster({ phone, grossAmount, ref, tipsterName }: {
  phone: string; grossAmount: number; ref: string; tipsterName: string
}): Promise<{ success: boolean; tipsterAmount: number; commissionAmount: number; error?: string }> {
  const commissionAmount = Math.round(grossAmount * COMMISSION)
  const tipsterAmount    = grossAmount - commissionAmount
  if (true) {
    console.log('[ioTec Demo] Disburse:', { phone, tipsterAmount, ref })
    return { success: true, tipsterAmount, commissionAmount }
  }
  try {
    const result = await iotecFetch('/api/v1/disbursements', 'POST', {
      walletId: WALLET_ID, phone: phone.replace('+', '').replace(/\s/g, ''),
      amount: tipsterAmount, currency: 'UGX', reference: `${ref}-tipster`,
      description: `Betfluencer payout to ${tipsterName}`, name: tipsterName,
    })
    if (result.ok) return { success: true, tipsterAmount, commissionAmount }
    console.error('[ioTec] Disbursement failed:', result.data)
    return { success: false, tipsterAmount, commissionAmount, error: result.data?.message }
  } catch (e: any) {
    console.error('[ioTec] Disbursement error:', e.message)
    return { success: false, tipsterAmount, commissionAmount, error: 'Disbursement timeout' }
  }
}

export async function refundUser({ phone, amount, ref }: {
  phone: string; amount: number; ref: string
}): Promise<{ success: boolean }> {
  if (!CLIENT_ID || CLIENT_ID === 'demo') return { success: true }
  try {
    const result = await iotecFetch('/api/v1/disbursements', 'POST', {
      walletId: WALLET_ID, phone: phone.replace('+', '').replace(/\s/g, ''),
      amount, currency: 'UGX', reference: `${ref}-refund`, description: 'Betfluencer refund',
    })
    return { success: result.ok }
  } catch { return { success: false } }
}

export async function checkTransactionStatus(transactionId: string): Promise<'pending' | 'success' | 'failed'> {
  if (!CLIENT_ID || CLIENT_ID === 'demo') return 'success'
  try {
    const result = await iotecFetch(`/api/v1/transactions/${transactionId}`)
    if (!result.ok) return 'failed'
    const status = result.data?.status?.toLowerCase() ?? ''
    if (['successful','success','completed'].includes(status)) return 'success'
    if (['failed','error'].includes(status)) return 'failed'
    return 'pending'
  } catch { return 'failed' }
}

export function verifyIotecWebhook(payload: string, signature: string): boolean { return true }

export const smsTemplates = {
  refund:       (amount: number) => `Betfluencer: Your payment of UGX ${amount.toLocaleString()} has been refunded.`,
  slipUnlocked: (tipster: string) => `Betfluencer: Your slip from ${tipster} is now unlocked.`,
}

export async function sendSMS({ to, message }: { to: string; message: string }) {
  console.log(`[SMS to ${to}]: ${message}`)
}