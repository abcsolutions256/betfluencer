// ── ioTec Pay v1 client ───────────────────────────────────────────
// Buyers pay per betslip via ioTec Pay (Mobile Money + Card); tipsters
// are paid out via mobile-money disbursements. Money is integer UGX.
//
// Docs: https://pay.iotec.io/api-docs/index.html
// Auth: OAuth2 client_credentials (id.iotec.io) → Bearer token on every
//       /api call against pay.iotec.io.
//
// Design notes:
//  • Public functions NEVER throw — they catch everything and return a
//    typed result with `ok:false` + `error` on auth/network/parse failure.
//  • The OAuth token is cached in module scope and refreshed when within
//    60s of expiry.
//  • Demo mode (no real keys, or IOTEC_CLIENT_ID === 'demo') short-circuits
//    every network call with deterministic fake-but-successful responses so
//    the app's payment flow can be exercised locally.

import type { PaymentCategory } from '@/types/payments'

// ── Config (read lazily from env so tests / runtime can override) ──
const AUTH_URL = process.env.IOTEC_AUTH_URL ?? 'https://id.iotec.io/connect/token'
const BASE_URL = process.env.IOTEC_BASE_URL ?? 'https://pay.iotec.io'

const env = (k: string) => process.env[k] ?? ''

// ── Demo mode ─────────────────────────────────────────────────────
// True when there are no credentials, or the placeholder 'demo' is set.
export function isDemoMode(): boolean {
  return !process.env.IOTEC_CLIENT_ID || process.env.IOTEC_CLIENT_ID === 'demo'
}

// ── OAuth2 token cache ────────────────────────────────────────────
let cachedToken: string | null = null
let tokenExpiry = 0 // epoch ms when the cached token expires

// Fetch (or reuse) a bearer token via client_credentials. Throws on
// failure — only ever called from getToken(), which converts to a result.
async function fetchToken(): Promise<string> {
  // Reuse a still-valid token (refresh when within 60s of expiry).
  if (cachedToken && Date.now() < tokenExpiry - 60_000) return cachedToken

  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('IOTEC_CLIENT_ID'),
      client_secret: env('IOTEC_CLIENT_SECRET'),
      grant_type: 'client_credentials',
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`ioTec auth failed: ${res.status} ${detail}`.trim())
  }

  const data = await res.json()
  if (!data?.access_token) throw new Error('ioTec auth: no access_token in response')

  cachedToken = data.access_token as string
  // expires_in is in seconds; default to 1h if absent.
  tokenExpiry = Date.now() + (Number(data.expires_in) || 3600) * 1000
  return cachedToken
}

// Wrapper that returns the token as a result instead of throwing.
async function getToken(): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  try {
    return { ok: true, token: await fetchToken() }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'auth error' }
  }
}

// ── Authenticated fetch helper ────────────────────────────────────
// Attaches the bearer token, parses JSON safely (non-JSON bodies are
// wrapped as { message }), and returns a uniform shape. Never throws.
type ApiResponse = { ok: boolean; status: number; data: any; error?: string }

async function apiFetch(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<ApiResponse> {
  const auth = await getToken()
  if (!auth.ok) return { ok: false, status: 0, data: null, error: auth.error }

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    // Parse the body defensively — some error responses are plain text.
    const text = await res.text()
    let data: any = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = { message: text }
      }
    }

    return { ok: res.ok, status: res.status, data }
  } catch (e: any) {
    // Network / DNS / abort errors land here.
    return { ok: false, status: 0, data: null, error: e?.message ?? 'network error' }
  }
}

// Pull a human-readable error out of an ioTec error payload.
function errMsg(r: ApiResponse): string {
  return (
    r.error ??
    r.data?.statusMessage ??
    r.data?.message ??
    r.data?.error ??
    r.data?.title ??
    `ioTec request failed (HTTP ${r.status})`
  )
}

// ── COLLECT (charge a buyer) ──────────────────────────────────────
export interface CollectArgs {
  amount: number
  payer: string // MoMo: MSISDN (256XXXXXXXXX / 07XXXXXXXX) · Card: customer email
  externalId: string // our reconciliation reference
  payerName?: string
  payerNote?: string
  category?: PaymentCategory // defaults to 'MobileMoney'
  redirectUrl?: string // card flow: PegPay returns the customer here
}

export interface CollectResult {
  ok: boolean
  id?: string
  status?: string
  statusMessage?: string
  cardRedirectUrl?: string | null
  raw?: any
  error?: string
}

export async function collect(args: CollectArgs): Promise<CollectResult> {
  // Demo: pretend the prompt was sent and is awaiting approval.
  if (isDemoMode()) {
    console.log('[ioTec demo] collect', { externalId: args.externalId, amount: args.amount, payer: args.payer })
    return { ok: true, id: `demo-${args.externalId}`, status: 'Pending', cardRedirectUrl: null }
  }

  const r = await apiFetch('/api/collections/collect', 'POST', {
    category: args.category ?? 'MobileMoney',
    currency:   env('IOTEC_CURRECY'),
    walletId: env('IOTEC_WALLET_ID'),
    externalId: args.externalId,
    payer: args.payer,
    payerName: args.payerName,
    payerNote: args.payerNote,
    amount: args.amount,
    transactionChargesCategory: 'ChargeWallet',
    redirectUrl: args.redirectUrl,
  })

  if (!r.ok) return { ok: false, error: errMsg(r), raw: r.data }

  return {
    ok: true,
    id: r.data?.id,
    status: r.data?.status,
    statusMessage: r.data?.statusMessage,
    cardRedirectUrl: r.data?.cardRedirectUrl ?? null,
    raw: r.data,
  }
}

// ── COLLECTION STATUS ─────────────────────────────────────────────
export interface StatusResult {
  ok: boolean
  id?: string
  status?: string
  statusMessage?: string
  raw?: any
  error?: string
}

// Shared mapper for the status endpoints (collection + disbursement).
function toStatusResult(r: ApiResponse): StatusResult {
  if (!r.ok) return { ok: false, error: errMsg(r), raw: r.data }
  return {
    ok: true,
    id: r.data?.id,
    status: r.data?.status,
    statusMessage: r.data?.statusMessage,
    raw: r.data,
  }
}

// Poll by the requestId returned from collect (CollectionViewModel.id).
export async function getCollectionStatus(requestId: string): Promise<StatusResult> {
  if (isDemoMode()) return { ok: true, status: 'Success', statusMessage: 'demo' }
  return toStatusResult(await apiFetch(`/api/collections/status/${encodeURIComponent(requestId)}`))
}

// Poll by our own externalId (handy for reconciliation / webhooks).
export async function getCollectionByExternalId(externalId: string): Promise<StatusResult> {
  if (isDemoMode()) return { ok: true, status: 'Success', statusMessage: 'demo' }
  return toStatusResult(await apiFetch(`/api/collections/external-id/${encodeURIComponent(externalId)}`))
}

// ── DISBURSE (pay out to a tipster, mobile money) ─────────────────
export interface DisburseArgs {
  amount: number
  payee: string // phone MSISDN
  externalId: string
  payeeName?: string
  payeeNote?: string
}

export interface DisburseResult {
  ok: boolean
  id?: string
  status?: string
  raw?: any
  error?: string
}

export async function disburse(args: DisburseArgs): Promise<DisburseResult> {
  // Demo: pretend the payout settled immediately.
  if (isDemoMode()) {
    console.log('[ioTec demo] disburse', { externalId: args.externalId, amount: args.amount, payee: args.payee })
    return { ok: true, id: `demo-payout-${args.externalId}`, status: 'Success' }
  }

  const r = await apiFetch('/api/disbursements/disburse', 'POST', {
    category: 'MobileMoney',
    currency: 'UGX',
    walletId: env('IOTEC_WALLET_ID'),
    externalId: args.externalId,
    payee: args.payee,
    payeeName: args.payeeName,
    amount: args.amount,
    // ioTec's disbursement body carries the note under `payerNote`.
    payerNote: args.payeeNote,
  })

  if (!r.ok) return { ok: false, error: errMsg(r), raw: r.data }
  return { ok: true, id: r.data?.id, status: r.data?.status, raw: r.data }
}

// Poll a disbursement by its transaction id (DisbursementViewModel.id).
export async function getDisbursementStatus(transactionId: string): Promise<StatusResult> {
  if (isDemoMode()) return { ok: true, status: 'Success', statusMessage: 'demo' }
  return toStatusResult(await apiFetch(`/api/disbursements/status/${encodeURIComponent(transactionId)}`))
}

// ── WALLET BALANCE ────────────────────────────────────────────────
export async function getWalletBalance(): Promise<{ ok: boolean; balance?: number; raw?: any; error?: string }> {
  if (isDemoMode()) return { ok: true, balance: 0 }

  const r = await apiFetch(`/api/wallet-balance/${encodeURIComponent(env('IOTEC_WALLET_ID'))}`)
  if (!r.ok) return { ok: false, error: errMsg(r), raw: r.data }
  // WalletBalance shape varies slightly across deployments — try the
  // common field names before falling back to the raw payload.
  const balance = r.data?.balance ?? r.data?.availableBalance ?? r.data?.amount
  return { ok: true, balance: typeof balance === 'number' ? balance : undefined, raw: r.data }
}

// ── SMS (moved verbatim from the old payments.ts) ─────────────────
export const smsTemplates = {
  refund: (amount: number) =>
    `Betfluencer: Your payment of UGX ${amount.toLocaleString()} has been refunded to your Mobile Money. Sorry for the inconvenience.`,
  slipUnlocked: (tipster: string) =>
    `Betfluencer: Your slip from ${tipster} is now unlocked. Open the app to view it.`,
}

export async function sendSMS({ to, message }: { to: string; message: string }): Promise<void> {
  // Hook up a real SMS provider here; for now just log.
  console.log(`[SMS to ${to}]: ${message}`)
}
