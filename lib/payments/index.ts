import { createPaymentLink } from './vivid'
import { createCryptoPayment } from './triple-a'

export type PaymentMethod = 'VIVID_CARD' | 'TRIPLE_A' | 'VIVID_SEPA'

interface PaymentRequest {
  orderId: string
  amount: number
  customerEmail: string
  customerName: string
  productName: string
  productDescription?: string
  method: PaymentMethod
}

interface PaymentResponse {
  paymentUrl: string
  transactionId?: string
}

const BASE_URL = process.env.NEXTAUTH_URL || 'https://www.internetoperadores.com'

export async function initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
  switch (request.method) {
    case 'VIVID_CARD':
      return initiateVividPayment(request)
    case 'TRIPLE_A':
      return initiateTripleAPayment(request)
    case 'VIVID_SEPA':
      return initiateSepaPayment(request)
    default:
      throw new Error(`Método de pago no soportado: ${request.method}`)
  }
}

async function initiateVividPayment(request: PaymentRequest): Promise<PaymentResponse> {
  const result = await createPaymentLink({
    orderId: request.orderId,
    amount: request.amount,
    items: [{
      name: request.productName,
      pricePerUnit: request.amount,
      quantity: 1,
      description: request.productDescription,
    }],
    redirectUrl: `${BASE_URL}/pago/confirmacion?orderId=${request.orderId}`,
    webhookUrl: `${BASE_URL}/api/payments/webhook/vivid`,
  })

  return { paymentUrl: result.url }
}

async function initiateTripleAPayment(request: PaymentRequest): Promise<PaymentResponse> {
  const result = await createCryptoPayment({
    orderId: request.orderId,
    amount: request.amount,
    orderDescription: request.productName,
    payerEmail: request.customerEmail,
    payerName: request.customerName,
    successUrl: `${BASE_URL}/pago/confirmacion?orderId=${request.orderId}`,
    cancelUrl: `${BASE_URL}/pago/cancelado?orderId=${request.orderId}`,
    webhookUrl: `${BASE_URL}/api/payments/webhook/triple-a`,
  })

  return { 
    paymentUrl: result.payment_url,
    transactionId: result.payment_id,
  }
}

async function initiateSepaPayment(request: PaymentRequest): Promise<PaymentResponse> {
  // Para SEPA, generamos un Payment Link de Vivid con instrucciones de transferencia
  const result = await createPaymentLink({
    orderId: request.orderId,
    amount: request.amount,
    items: [{
      name: request.productName,
      pricePerUnit: request.amount,
      quantity: 1,
      description: `Transferencia SEPA - ${request.productDescription || request.productName}`,
    }],
    redirectUrl: `${BASE_URL}/pago/confirmacion?orderId=${request.orderId}`,
    webhookUrl: `${BASE_URL}/api/payments/webhook/vivid`,
  })

  return { paymentUrl: result.url }
}

// Lógica de visualización de métodos de pago según importe
export function getAvailablePaymentMethods(amount: number): PaymentMethod[] {
  const methods: PaymentMethod[] = ['VIVID_CARD', 'TRIPLE_A']
  
  // SEPA solo para tickets > 1000€
  if (amount > 1000) {
    methods.push('VIVID_SEPA')
  }
  
  return methods
}

// Calcular descuento por pago con crypto (1%)
export function getCryptoDiscount(amount: number): number {
  return Math.round(amount * 0.01 * 100) / 100
}

// Determinar método recomendado según importe
export function getRecommendedMethod(amount: number): PaymentMethod {
  if (amount > 1000) return 'VIVID_SEPA' // Gratis
  if (amount < 119) return 'TRIPLE_A' // Más barato para importes bajos
  return 'VIVID_CARD' // Más barato para importes altos
}
