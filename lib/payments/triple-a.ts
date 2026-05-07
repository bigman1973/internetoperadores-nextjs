const TRIPLE_A_BASE_URL = 'https://api.triple-a.io/api/v2'
const TRIPLE_A_CLIENT_ID = process.env.TRIPLE_A_CLIENT_ID!
const TRIPLE_A_CLIENT_SECRET = process.env.TRIPLE_A_CLIENT_SECRET!
const TRIPLE_A_MERCHANT_KEY = process.env.TRIPLE_A_MERCHANT_KEY!

async function getAccessToken(): Promise<string> {
  const response = await fetch(`${TRIPLE_A_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: TRIPLE_A_CLIENT_ID,
      client_secret: TRIPLE_A_CLIENT_SECRET,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Triple-A auth failed: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return data.access_token
}

interface CreatePaymentParams {
  orderId: string
  amount: number // en EUR
  currency?: string
  orderDescription: string
  payerEmail: string
  payerName: string
  successUrl: string
  cancelUrl: string
  webhookUrl: string
}

export async function createCryptoPayment(params: CreatePaymentParams): Promise<{ 
  payment_url: string
  payment_id: string 
}> {
  const token = await getAccessToken()

  const body = {
    type: 'widget',
    merchant_key: TRIPLE_A_MERCHANT_KEY,
    order_currency: params.currency || 'EUR',
    order_amount: params.amount,
    order_id: params.orderId,
    order_description: params.orderDescription,
    payer_id: params.payerEmail,
    payer_name: params.payerName,
    payer_email: params.payerEmail,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    notify_url: params.webhookUrl,
    crypto_currency: 'all', // USDC, EURC
  }

  const response = await fetch(`${TRIPLE_A_BASE_URL}/payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Triple-A create payment failed: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return {
    payment_url: data.hosted_url || data.payment_url,
    payment_id: data.payment_id,
  }
}

export interface TripleAWebhookPayload {
  payment_id: string
  order_id: string
  status: string // 'done', 'expired', 'underpaid', 'overpaid'
  crypto_currency: string
  crypto_amount: number
  order_currency: string
  order_amount: number
  tx_hash?: string
  settlement_id?: string
}

export function verifyTripleAWebhook(payload: TripleAWebhookPayload, signature: string): boolean {
  // Triple-A uses HMAC-SHA256 with client_secret to sign webhooks
  const crypto = require('crypto')
  const expectedSignature = crypto
    .createHmac('sha256', TRIPLE_A_CLIENT_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex')
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}
