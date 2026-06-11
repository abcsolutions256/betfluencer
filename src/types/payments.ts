// ── Payment contract (ioTec Pay v1) ───────────────────────────────
// Shared types used by the ioTec client, API routes, transactions DB
// layer, the PaymentSheet component and the admin transactions tab.
// One source of truth — import from '@/types/payments' everywhere.

// Buyer-facing payment options ioTec supports for collections.
export type PaymentMethod = 'momo' | 'card'

// Our normalised transaction status (what the app + UI reason about).
export type TxnStatus = 'pending' | 'processing' | 'success' | 'failed' | 'cancelled'

// ioTec RequestStatus (raw, from the API).
export type IotecRequestStatus =
  | 'Pending' | 'SentToVendor' | 'Success' | 'Failed'
  | 'AwaitingApproval' | 'RolledBack' | 'Scheduled' | 'Cancelled' | 'Rejected'

export type PaymentCategory = 'MobileMoney' | 'WalletToWallet' | 'BankTransfer'
export type Currency = 'UGX' | 'ITX'

// Min collection amount enforced by ioTec.
export const MIN_AMOUNT_UGX = 500

// ── API: POST /api/payments/initiate ──────────────────────────────
export interface InitiatePaymentInput {
  betslip_id: string
  method:     PaymentMethod
  payer:      string        // MoMo: phone (07.. / 2567.. / +2567..) · Card: email
  payer_name?: string
}

// ── API: result returned to the caller / hook ─────────────────────
export interface PaymentResult {
  transaction_id:    string          // our transactions.id
  external_id:       string          // our reconciliation ref
  status:            TxnStatus
  card_redirect_url?: string | null  // card flow: redirect the payer here
  message?:          string
}

// ── transactions table row (mirrors supabase/migrations/0002) ─────
export interface TransactionRow {
  id:                 string
  iotec_id:           string | null   // ioTec collection id (= status requestId)
  external_id:        string          // our ref, unique
  type:               'collection' | 'disbursement'
  method:             PaymentMethod | null
  category:           PaymentCategory | null
  purpose:            string | null   // e.g. 'slip_purchase'
  betslip_id:         string | null
  tipster_id:         string | null
  slip_purchase_id:   string | null
  user_phone:         string | null
  user_email:         string | null
  payer:              string | null
  amount:             number          // integer UGX
  currency:           Currency
  status:             TxnStatus
  iotec_status:       string | null   // raw IotecRequestStatus
  status_message:     string | null
  card_redirect_url:  string | null
  transaction_charge: number | null
  raw:                unknown | null  // last ioTec payload (jsonb)
  created_at:         string
  updated_at:         string
}

// Map ioTec's RequestStatus → our TxnStatus.
export function normalizeIotecStatus(s?: string | null): TxnStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'success':          return 'success'
    case 'failed':
    case 'rolledback':
    case 'rejected':         return 'failed'
    case 'cancelled':        return 'cancelled'
    case 'pending':          return 'pending'
    case 'senttovendor':
    case 'awaitingapproval':
    case 'scheduled':        return 'processing'
    default:                 return s ? 'processing' : 'pending'
  }
}

export const TERMINAL_STATUSES: TxnStatus[] = ['success', 'failed', 'cancelled']
export const isTerminal = (s: TxnStatus) => TERMINAL_STATUSES.includes(s)
