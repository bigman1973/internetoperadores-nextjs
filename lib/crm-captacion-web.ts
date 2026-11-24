import prisma from '@/lib/prisma'
import {
  guardarCaptacionWebEn,
  vincularLeadExistenteEn,
  type EntradaCaptacionWeb,
  type TipoLeadExistente,
} from '@/lib/crm-captacion-web-core'

export function guardarCaptacionWeb(request: Request, input: EntradaCaptacionWeb) {
  return guardarCaptacionWebEn(prisma, request, input)
}

export function vincularLeadExistente(tipo: TipoLeadExistente, id: string) {
  return vincularLeadExistenteEn(prisma, tipo, id)
}
