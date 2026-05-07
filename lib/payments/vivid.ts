import crypto from 'crypto'

const VIVID_BASE_URL = 'https://api.prime.vivid.money/cms/api/v1'
const VIVID_CLIENT_ID = process.env.VIVID_CLIENT_ID!
const VIVID_SECRET = process.env.VIVID_SECRET!

function generateSignature(body: string): string {
  return crypto
    .createHmac('sha256', VIVID_SECRET)
    .update(body)
    .digest('hex')
}

async function getAuthToken(): Promise<string> {
  const body = JSON.stringify({
    apiKey: VIVID_CLIENT_ID,
    createdAt: new Date().toISOString(),
  })

  const signature = generateSignature(body)

  const response = await fetch(`${VIVID_BASE_URL}/auth/gen-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': signature,
    },
    body,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Vivid auth failed: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return data.token
}

interface CreatePaymentLinkParams {
  orderId: string
  amount: number // en EUR (ej: 49.99)
  items: Array<{
    name: string
    pricePerUnit: number
    quantity: number
    description?: string
  }>
  redirectUrl: string
  webhookUrl: string
  language?: string
}

function amountToVividFormat(amount: number): { currencyCode: string; units: number; nanos: number } {
  const units = Math.floor(amount)
  const nanos = Math.round((amount - units) * 1_000_000_000)
  return {
    currencyCode: 'EUR',
    units,
    nanos,
  }
}

export async function createPaymentLink(params: CreatePaymentLinkParams): Promise<{ url: string }> {
  const token = await getAuthToken()

  const body = JSON.stringify({
    meta: {
      cmsCode: 'NextJS',
      language: params.language || 'es',
      redirectUrl: params.redirectUrl,
      webhookUrl: params.webhookUrl,
    },
    orderInfo: {
      amount: amountToVividFormat(params.amount),
      externalOrderId: params.orderId,
      items: params.items.map(item => ({
        name: item.name,
        pricePerUnit: amountToVividFormat(item.pricePerUnit),
        quantity: { value: item.quantity.toString() },
        units: 'pcs',
        description: item.description || '',
      })),
    },
    createdAt: new Date().toISOString(),
  })

  const signature = generateSignature(body)

  const response = await fetch(`${VIVID_BASE_URL}/payment-link/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Signature': signature,
    },
    body,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Vivid create payment link failed: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return { url: data.url }
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const expectedSignature = generateSignature(rawBody)
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}

export interface VividWebhookPayload {
  status: string // STATUS_SUCCESS, STATUS_FAILED, etc.
  externalOrderId: string
}
